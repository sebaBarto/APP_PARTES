// Función serverless de Vercel — responde preguntas de los técnicos
// en base a los manuales de una categoría, guardados en una carpeta de
// Drive. Usa la misma cuenta de servicio de Google que ya existe (para
// leer los archivos) y la API gratuita de Gemini para generar la
// respuesta a partir del contenido de esos manuales.
//
// Variables de entorno:
//   SERVICIOS_API_TOKEN                -> ya existente
//   GITHUB_DATA_TOKEN, GITHUB_DATA_REPO -> ya existentes
//   GOOGLE_SERVICE_ACCOUNT_EMAIL        -> ya existente
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  -> ya existente
//   GEMINI_API_KEY                      -> nueva: clave gratuita de Gemini

const { getAccessToken } = require("../lib/google-auth");

const CATEGORIAS_PATH = "consultas-categorias.json";
// Tope prudente de tamaño total de manuales por consulta (bytes del
// PDF, antes de codificar en base64) para no pasarse del límite del
// pedido a Gemini.
const TOPE_BYTES_TOTAL = 12 * 1024 * 1024; // 12 MB

// Datos que cargó el equipo (Manuales > Datos del equipo) que tienen que ver
// con la pregunta: se le pasan a la IA junto con los manuales.
const PALABRAS_VACIAS = new Set("como para que cual cuales donde cuando esta este esto estos esas eses esos hace hacer tiene tengo puedo puede sobre entre desde hasta porque pero sino solo cada todo todos todas una uno unos unas con sin por del las los les mas muy hay ese esa eso".split(" "));
function normalizarTexto(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function palabrasClave(s) { return [...new Set(normalizarTexto(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !PALABRAS_VACIAS.has(w)))]; }
async function datosEquipoRelacionados(ghHeaders, repo, pregunta, categoria) {
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/datos-equipo.json`, { headers: { ...ghHeaders, Accept: "application/vnd.github.raw" } });
    if (!r.ok) return [];
    const lista = JSON.parse(await r.text());
    const claves = palabrasClave(pregunta);
    if (!claves.length || !Array.isArray(lista)) return [];
    return lista.map((d) => {
      const tit = normalizarTexto(d.titulo), cont = normalizarTexto(d.contenido);
      let puntos = 0;
      claves.forEach((w) => { if (tit.includes(w)) puntos += 3; else if (cont.includes(w)) puntos += 1; });
      if (puntos && d.categoria === categoria) puntos += 2;
      if (puntos) puntos += Math.min(3, (d.utiles || []).length * 0.5);
      return { d, puntos };
    }).filter((x) => x.puntos >= 3).sort((a, b) => b.puntos - a.puntos).slice(0, 6).map((x) => x.d);
  } catch (e) { return []; }
}
async function leerCategorias(ghHeaders, apiUrl) {
  const r = await fetch(apiUrl, { headers: ghHeaders });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error("No se pudo leer las categorías de consultas");
  const data = await r.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return JSON.parse(content);
}

async function listarArchivosCarpeta(accessToken, folderId) {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`
  )}&fields=files(id,name,size)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error("No se pudo listar los manuales de esa categoría en Drive");
  const data = await r.json();
  return data.files || [];
}

async function descargarArchivo(accessToken, fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error("No se pudo descargar un manual desde Drive");
  const buffer = Buffer.from(await r.arrayBuffer());
  return buffer;
}

function ghHeadersBase() {
  return { Authorization: `Bearer ${process.env.GITHUB_DATA_TOKEN}`, Accept: "application/vnd.github+json" };
}
function apiUrlCategorias() {
  return `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${CATEGORIAS_PATH}`;
}

// Conversación: el primer turno lleva los manuales; si hay repreguntas, se
// agregan las respuestas anteriores y la pregunta nueva (con la foto, si hay).
function armarTurnos(partesDocumentos, promptTexto, historial, pregunta, imagen) {
  const fotoParte = imagen ? [{ inline_data: { mime_type: imagen.slice(5, imagen.indexOf(";")), data: imagen.split(",")[1] } }] : [];
  if (!historial.length) {
    return [{ role: "user", parts: [...partesDocumentos, ...fotoParte, { text: promptTexto }] }];
  }
  const turnos = [{ role: "user", parts: [...partesDocumentos, { text: promptTexto }] }, { role: "model", parts: [{ text: String(historial[0].respuesta).slice(0, 8000) }] }];
  historial.slice(1).forEach((t) => {
    turnos.push({ role: "user", parts: [{ text: String(t.pregunta).slice(0, 2000) }] });
    turnos.push({ role: "model", parts: [{ text: String(t.respuesta).slice(0, 8000) }] });
  });
  turnos.push({ role: "user", parts: [...fotoParte, { text: `Repregunta del técnico (mismo formato, basado en los manuales): ${pregunta}` }] });
  return turnos;
}

// Panel admin: subir un manual a la carpeta de Drive de la categoría.
// El servidor solo abre una "subida reanudable" en Drive y el navegador
// manda el PDF directo a Google (Vercel no acepta archivos de más de ~4 MB).
// Requiere que la cuenta de servicio tenga permiso de Editor en la carpeta.
async function manejarAdminManuales(req, res, body, ghHeaders, apiUrl) {
  const categorias = await leerCategorias(ghHeaders, apiUrl);
  const cat = categorias.find((c) => c.categoria === body.categoria);
  if (!cat || !cat.carpeta_drive_id) {
    res.status(404).json({ error: "No se encontró esa categoría o no tiene carpeta de Drive configurada" });
    return;
  }
  const accessToken = await getAccessToken("https://www.googleapis.com/auth/drive");
  if (body.accion === "borrar_manual") {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(body.archivo)}?supportsAllDrives=true`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
    if (!r.ok) {
      const det = await r.text();
      res.status(r.status === 403 || r.status === 404 ? 403 : 502).json({ error: "Drive no dejó borrar el manual (la cuenta de servicio necesita permiso de Editor en la carpeta)", detail: det.slice(0, 300) });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }
  const nombre = String(body.nombre || "").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 150) || "manual.pdf";
  const tamano = Number(body.tamano || 0);
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "application/pdf",
      ...(tamano ? { "X-Upload-Content-Length": String(tamano) } : {}),
      ...(req.headers.origin ? { Origin: req.headers.origin } : {}),
    },
    body: JSON.stringify({ name: /\.pdf$/i.test(nombre) ? nombre : nombre + ".pdf", parents: [cat.carpeta_drive_id], mimeType: "application/pdf" }),
  });
  if (!r.ok) {
    const det = await r.text();
    const sinCuota = /storageQuota|quota/i.test(det);
    res.status(502).json({
      error: sinCuota
        ? "Drive no deja que la cuenta de servicio guarde archivos en esa carpeta (no tiene espacio propio). Para subir desde acá, la carpeta tiene que estar en una Unidad compartida; si no, subilo directo en Drive."
        : "No se pudo preparar la subida en Drive (la cuenta de servicio necesita permiso de Editor en la carpeta).",
      detail: det.slice(0, 300),
    });
    return;
  }
  res.status(200).json({ ok: true, url_subida: r.headers.get("location") });
}

module.exports = require("../lib/auditoria").conAuditoria("consultas", async (req, res) => {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!require("../lib/sesion").autorizar(req)) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
    res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" });
    return;
  }

  // ---------- GET: listar los manuales de una categoría, o ver uno ----------
  if (req.method === "GET") {
    try {
      const { categoria, archivo } = req.query || {};
      if (!categoria) {
        res.status(400).json({ error: "Falta la categoría" });
        return;
      }
      const ghHeaders = {
        Authorization: `Bearer ${GITHUB_DATA_TOKEN}`,
        Accept: "application/vnd.github+json",
      };
      const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${CATEGORIAS_PATH}`;
      const categorias = await leerCategorias(ghHeaders, apiUrl);
      const cat = categorias.find((c) => c.categoria === categoria);
      if (!cat || !cat.carpeta_drive_id) {
        res.status(404).json({ error: "No se encontró esa categoría o no tiene carpeta de Drive configurada" });
        return;
      }

      const accessToken = await getAccessToken("https://www.googleapis.com/auth/drive.readonly");

      if (archivo) {
        // Ver/descargar un manual puntual — se manda el PDF tal cual.
        const buffer = await descargarArchivo(accessToken, archivo);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.status(200).send(buffer);
        return;
      }

      // Sin archivo puntual: lista los manuales de esa categoría.
      const archivos = await listarArchivosCarpeta(accessToken, cat.carpeta_drive_id);
      res.status(200).json(archivos.map((a) => ({ id: a.id, nombre: a.name })));
    } catch (err) {
      res.status(500).json({ error: "Error interno al leer los manuales", detail: String(err.message || err) });
    }
    return;
  }

  // ---------- POST: preguntar a la IA (como ya existía) ----------
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { GEMINI_API_KEY } = process.env;
  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel" });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    if (body && (body.accion === "iniciar_subida_manual" || body.accion === "borrar_manual")) {
      await manejarAdminManuales(req, res, body, ghHeadersBase(), apiUrlCategorias());
      return;
    }
    const { categoria, archivo } = body || {};
    // Foto opcional (display, código de error, cableado): JPG achicado en el celular.
    const imagen = typeof (body && body.imagen) === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(body.imagen) && body.imagen.length < 3500000 ? body.imagen : "";
    const pregunta = String((body && body.pregunta) || "").trim() || (imagen ? "¿Qué significa lo que se ve en la foto y cómo lo resuelvo?" : "");
    // Repreguntas: las preguntas y respuestas anteriores de esta misma consulta.
    const historial = Array.isArray(body && body.historial) ? body.historial.slice(-4).filter((t) => t && t.pregunta && t.respuesta) : [];
    if (!categoria || !pregunta) {
      res.status(400).json({ error: "Falta la categoría o la pregunta" });
      return;
    }

    const ghHeaders = {
      Authorization: `Bearer ${GITHUB_DATA_TOKEN}`,
      Accept: "application/vnd.github+json",
    };
    const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${CATEGORIAS_PATH}`;
    const categorias = await leerCategorias(ghHeaders, apiUrl);
    const cat = categorias.find((c) => c.categoria === categoria);
    if (!cat || !cat.carpeta_drive_id) {
      res.status(404).json({ error: "No se encontró esa categoría o no tiene carpeta de Drive configurada" });
      return;
    }

    const accessToken = await getAccessToken("https://www.googleapis.com/auth/drive.readonly");
    let archivos = await listarArchivosCarpeta(accessToken, cat.carpeta_drive_id);
    if (archivos.length === 0) {
      res.status(404).json({ error: "No hay manuales (PDF) en la carpeta de esa categoría" });
      return;
    }
    // Si el técnico eligió un manual puntual, se pregunta solo sobre ese:
    // mucho más rápido y la respuesta no mezcla equipos distintos.
    if (archivo) {
      const elegido = archivos.filter((a) => a.id === archivo);
      if (elegido.length === 0) {
        res.status(404).json({ error: "Ese manual ya no está en la carpeta de la categoría" });
        return;
      }
      archivos = elegido;
    }

    const partesDocumentos = [];
    let totalBytes = 0;
    const omitidos = [];
    for (const archivo of archivos) {
      const tamano = Number(archivo.size || 0);
      if (totalBytes + tamano > TOPE_BYTES_TOTAL) {
        omitidos.push(archivo.name);
        continue;
      }
      const buffer = await descargarArchivo(accessToken, archivo.id);
      totalBytes += buffer.length;
      partesDocumentos.push({
        inline_data: { mime_type: "application/pdf", data: buffer.toString("base64") },
      });
    }

    const nombresManuales = archivos.filter((a) => !omitidos.includes(a.name)).map((a) => a.name).join(", ");
    const datosEquipo = await datosEquipoRelacionados(ghHeaders, GITHUB_DATA_REPO, [pregunta, ...historial.map((t) => t.pregunta)].join(" "), categoria);
    let textoEquipo = "";
    datosEquipo.forEach((d, i) => {
      const bloque = `[Dato del equipo ${i + 1}] «${d.titulo}» (cargado por ${d.autor || "el equipo"}${(d.reportes || []).length ? "; OJO: avisaron que puede estar desactualizado" : ""}):\n${String(d.contenido || "").slice(0, 1500)}\n\n`;
      if (textoEquipo.length + bloque.length < 7000) textoEquipo += bloque;
    });
    const promptTexto =
      `Sos un asistente técnico para instaladores de sistemas de seguridad electrónica ` +
      `(alarmas, cámaras, control de accesos) de una empresa argentina. Respondé la pregunta del técnico ` +
      `basándote ÚNICAMENTE en el contenido de los manuales adjuntos (${nombresManuales})` +
      (textoEquipo ? ` y en los datos prácticos que dejó el equipo técnico de SAT (abajo). Esos datos salen de la experiencia en la calle: si responden la pregunta, usalos (pueden ser más actuales que el manual) y, si contradicen al manual, mencioná las dos cosas. ` : `. `) +
      `Si la respuesta no está ahí, decilo claramente en vez de inventar algo.\n` +
      `Formato: castellano rioplatense, concreto y breve, para leer en el celular parado frente al equipo. ` +
      `Si es un procedimiento, dalo en pasos numerados con las teclas o códigos exactos. ` +
      `Al final agregá una línea "Fuente:" con el nombre del manual y la página o sección${textoEquipo ? `, o "Dato del equipo: <título>" si salió de ahí` : ""}.\n\n` +
      (textoEquipo ? `DATOS DEL EQUIPO TÉCNICO:\n${textoEquipo}` : "") +
      (imagen ? `El técnico adjuntó una foto (display, código de error, cableado o equipo): usala para entender la consulta.\n` : "") +
      `Pregunta: ${historial.length ? historial[0].pregunta : pregunta}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          contents: armarTurnos(partesDocumentos, promptTexto, historial, pregunta, imagen),
        }),
      }
    );
    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
      if (geminiRes.status === 429) {
        res.status(429).json({ error: "Se alcanzó el límite de consultas gratuitas a la IA por ahora. Probá de nuevo en unos minutos, o abrí el manual directo." });
        return;
      }
      res.status(502).json({ error: "No se pudo consultar la IA", detail: geminiData.error || geminiData });
      return;
    }

    const respuesta = geminiData.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    if (!respuesta) {
      res.status(502).json({ error: "La IA no devolvió ninguna respuesta" });
      return;
    }

    res.status(200).json({
      respuesta,
      manuales_usados: archivos.map((a) => a.name).filter((n) => !omitidos.includes(n)),
      manuales_omitidos: omitidos,
      datos_equipo_usados: datosEquipo.map((d) => ({ id: d.id, titulo: d.titulo })),
    });
  } catch (err) {
    res.status(500).json({ error: "Error interno al procesar la consulta", detail: String(err.message || err) });
  }
});
module.exports.datosEquipoRelacionados = datosEquipoRelacionados;
