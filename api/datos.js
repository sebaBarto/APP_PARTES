// Función serverless de Vercel — endpoint genérico que reemplaza a
// varios endpoints chicos que hacían básicamente lo mismo (leer/guardar
// un archivo de configuración en el repo privado de datos). Se
// consolidaron acá para no pasarse del límite de funciones serverless
// del plan gratuito de Vercel (12 por proyecto).
//
// Uso: /api/datos?coleccion=<nombre>  (ver COLECCIONES abajo)
//
// Variables de entorno reutilizadas:
//   SERVICIOS_API_TOKEN, GITHUB_DATA_TOKEN, GITHUB_DATA_REPO

const crypto = require("crypto");

// Verifica la contraseña del panel de administración contra un HASH
// guardado en la variable de entorno (ADMIN_PASSWORD_HASH), nunca
// contra la contraseña en texto plano — así, ni siquiera alguien con
// acceso a la configuración de Vercel puede leer la contraseña real,
// solo confirmar si un intento coincide o no. El hash se guarda como
// "salt:hash" (ambos en hexadecimal), generado con scrypt (incluido
// en Node, sin depender de ningún paquete externo).
//
// Nota de compatibilidad: si todavía no se migró a
// ADMIN_PASSWORD_HASH, sigue aceptando la variable vieja
// (ADMIN_PASSWORD, texto plano) como respaldo — para no dejar el
// panel sin acceso hasta que se genere el hash nuevo.
async function verificarPasswordAdmin(intento) {
  if (typeof intento !== "string" || !intento) return false;

  const hashGuardado = process.env.ADMIN_PASSWORD_HASH;
  if (hashGuardado) {
    const [saltHex, hashHex] = hashGuardado.split(":");
    if (!saltHex || !hashHex) return false;
    const hashIntento = await new Promise((resolve, reject) => {
      crypto.scrypt(intento, Buffer.from(saltHex, "hex"), 64, (err, derivedKey) => {
        if (err) reject(err); else resolve(derivedKey);
      });
    });
    const bufferGuardado = Buffer.from(hashHex, "hex");
    // Comparación de tiempo constante — evita que alguien pueda medir
    // cuánto tarda la respuesta para deducir la contraseña de a poco.
    return hashIntento.length === bufferGuardado.length && crypto.timingSafeEqual(hashIntento, bufferGuardado);
  }

  // Respaldo temporal mientras no se configuró el hash todavía.
  return !!process.env.ADMIN_PASSWORD && intento === process.env.ADMIN_PASSWORD;
}

// Lista de técnicos tal como está guardada (con claves y permisos). Solo
// para usar del lado del servidor: nunca se devuelve así al navegador.
async function leerTecnicosGuardados() {
  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) throw new Error("Faltan variables de entorno");
  const url = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/tecnicos.json`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${GITHUB_DATA_TOKEN}`, Accept: "application/vnd.github+json" } });
  if (!r.ok) return [];
  const data = await r.json();
  const lista = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  return Array.isArray(lista) ? lista : [];
}

// ¿La clave es la de ese técnico? (la misma verificación que el login de la app)
async function verificarClaveTecnico(nombre, password) {
  if (typeof nombre !== "string" || !nombre || typeof password !== "string" || !password) return false;
  const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
  // 1) Primero contra el backend nuevo (hash real, PBKDF2) — es lo que pasa
  // siempre después de la primera vez que cada técnico entra.
  if (BACKEND_NUEVO_URL && BACKEND_NUEVO_TOKEN) {
    try {
      const rNuevo = await fetch(`${BACKEND_NUEVO_URL}/api/tecnicos/verificar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, password }),
      });
      if (rNuevo.status === 200) {
        const dataNuevo = await rNuevo.json();
        if (dataNuevo.ok) return true;
      }
      // 401 (no coincide o todavía no está ahí) -> sigue al paso 2.
    } catch (errNuevo) { /* si el backend nuevo no responde, se sigue con el respaldo */ }
  }
  // 2) Respaldo: la lista guardada (texto plano) — cubre a quien cambió la
  // clave después de la migración o es nuevo y no tiene hash todavía.
  const tecnicos = await leerTecnicosGuardados();
  const encontrado = tecnicos.find((t) => t.nombre === nombre);
  const ok = !!encontrado && encontrado.password === password;
  // 3) Si coincidió acá, de paso se guarda el hash en el backend nuevo.
  if (ok && BACKEND_NUEVO_URL && BACKEND_NUEVO_TOKEN) {
    fetch(`${BACKEND_NUEVO_URL}/api/tecnicos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ nombre, password, permisos: encontrado.permisos || {} }]),
    }).catch(() => {});
  }
  return ok;
}

// ¿Tiene tildado el permiso "Panel de Administración"?
async function tienePermisoAdmin(nombre) {
  const t = (await leerTecnicosGuardados()).find((x) => x.nombre === nombre);
  return !!(t && t.permisos && t.permisos.admin);
}

// ============================================================
// PRESUPUESTO EXPRESS
//  - lista_precios: la base de artículos con precio (Excel que sube la
//    oficina) + la cotización del dólar. Puede ser grande, así que se
//    guarda compacta y se lee "cruda" (la API de GitHub no devuelve el
//    contenido en base64 de archivos de más de 1 MB).
//  - presupuestos_express: la numeración E-0001, E-0002... (se reserva
//    el número en el servidor, así dos personas nunca sacan el mismo) y
//    un registro de los que se emitieron.
// ============================================================
const RUTA_LISTA_PRECIOS = "lista-precios.json";
const RUTA_PRESUPUESTOS_EXPRESS = "presupuestos-express.json";
function headersGithubDatos(extra) {
  return { Authorization: `Bearer ${process.env.GITHUB_DATA_TOKEN}`, Accept: "application/vnd.github+json", ...(extra || {}) };
}
function urlGithubDatos(ruta) {
  return `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${ruta}`;
}
async function leerArchivoDatos(ruta, porDefecto) {
  // sha (sirve aunque el archivo pese más de 1 MB) + contenido crudo
  const rMeta = await fetch(urlGithubDatos(ruta), { headers: headersGithubDatos() });
  if (rMeta.status === 404) return { data: porDefecto, sha: undefined };
  if (!rMeta.ok) throw new Error("No se pudo leer " + ruta);
  const meta = await rMeta.json();
  let texto;
  if (meta.content && meta.encoding === "base64") texto = Buffer.from(meta.content, "base64").toString("utf-8");
  else {
    const rRaw = await fetch(urlGithubDatos(ruta), { headers: headersGithubDatos({ Accept: "application/vnd.github.raw" }) });
    if (!rRaw.ok) throw new Error("No se pudo leer " + ruta);
    texto = await rRaw.text();
  }
  let data = porDefecto, corrupto = false;
  try { data = JSON.parse(texto); } catch (e) { data = porDefecto; corrupto = true; }
  return { data, sha: meta.sha, corrupto };
}
async function escribirArchivoDatos(ruta, data, sha, mensaje) {
  const r = await fetch(urlGithubDatos(ruta), {
    method: "PUT",
    headers: headersGithubDatos({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message: mensaje, content: Buffer.from(JSON.stringify(data)).toString("base64"), sha }),
  });
  return r;
}
// Contenido de un archivo del repo de datos. Pasado 1 MB, GitHub no lo manda
// dentro del JSON: hay que pedirlo crudo (antes, esas colecciones dejaban de
// poder leerse y guardarse).
async function textoDeArchivoGithub(meta, url, headers) {
  if (meta && meta.content && meta.encoding !== "none") return Buffer.from(meta.content, "base64").toString("utf-8");
  const r = await fetch(url, { headers: { ...headers, Accept: "application/vnd.github.raw" } });
  if (!r.ok) throw new Error("No se pudo leer el archivo");
  return await r.text();
}
function numeroArgentino(v) {
  if (typeof v === "number") return isFinite(v) ? v : NaN;
  let t = String(v == null ? "" : v).replace(/[^\d.,-]/g, "");
  if (!t) return NaN;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = t.replace(",", ".");
  else if ((t.match(/\./g) || []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(t)) t = t.replace(/\./g, ""); // "1.450" = mil cuatrocientos cincuenta
  return Number(t);
}
async function manejarPresupuestoExpress(req, res, autorizacion, body) {
  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) { res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" }); return; }
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const esAdmin = autorizacion.rol === "admin";
  const coleccion = req.query.coleccion;
  try {
    if (coleccion === "lista_precios") {
      const vacia = { actualizado: "", archivo: "", cotizacion_usd: null, items: [] };
      if (req.method === "GET") {
        const { data } = await leerArchivoDatos(RUTA_LISTA_PRECIOS, vacia);
        res.status(200).json({ ...vacia, ...(data || {}) });
        return;
      }
      if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
      if (!esAdmin) { res.status(403).json({ error: "La lista de precios solo la carga la oficina" }); return; }
      const b = body && typeof body === "object" ? body : {};
      for (let intento = 0; intento < 3; intento++) {
        const { data, sha } = await leerArchivoDatos(RUTA_LISTA_PRECIOS, vacia);
        const actual = { ...vacia, ...(data || {}) };
        if (b.accion === "cotizacion") {
          const v = numeroArgentino(b.valor);
          if (!(v > 0)) { res.status(400).json({ error: "Poné una cotización válida (mayor a 0)" }); return; }
          actual.cotizacion_usd = v;
          actual.cotizacion_actualizada = new Date().toISOString();
          actual.cotizacion_por = autorizacion.nombre || "";
        } else if (b.accion === "reemplazar") {
          if (!Array.isArray(b.items) || b.items.length === 0) { res.status(400).json({ error: "La lista está vacía" }); return; }
          if (b.items.length > 30000) { res.status(400).json({ error: "La lista tiene demasiados artículos (máximo 30.000)" }); return; }
          const items = [];
          for (const it of b.items) {
            const d = String((it && it.d) || "").replace(/\s+/g, " ").trim().slice(0, 400);
            const p = numeroArgentino(it && it.p);
            if (!d || !(p >= 0)) continue;
            items.push({ c: String((it && it.c) || "").trim().slice(0, 60), d, p: Math.round(p * 100) / 100, m: it && it.m === "USD" ? "USD" : "ARS" });
          }
          if (!items.length) { res.status(400).json({ error: "Ningún artículo tenía descripción y precio válidos" }); return; }
          actual.items = items;
          actual.archivo = String(b.archivo || "").slice(0, 200);
          actual.actualizado = new Date().toISOString();
          actual.actualizado_por = autorizacion.nombre || "";
          if (b.cotizacion_usd !== undefined && numeroArgentino(b.cotizacion_usd) > 0) actual.cotizacion_usd = numeroArgentino(b.cotizacion_usd);
        } else if (b.accion === "kits") {
          // Kits armados (ej. "Kit alarma básica"): nombre + artículos de la lista con su cantidad.
          if (!Array.isArray(b.kits)) { res.status(400).json({ error: "Formato inválido" }); return; }
          actual.kits = b.kits.slice(0, 100).map((k) => ({
            nombre: String((k && k.nombre) || "").replace(/\s+/g, " ").trim().slice(0, 80),
            items: (Array.isArray(k && k.items) ? k.items : []).slice(0, 60).map((it) => ({
              c: String((it && it.c) || "").trim().slice(0, 60), d: String((it && it.d) || "").replace(/\s+/g, " ").trim().slice(0, 400),
              cant: Math.max(1, Math.min(999, Math.round(Number(it && it.cant) || 1))),
            })).filter((it) => it.d),
          })).filter((k) => k.nombre && k.items.length);
        } else if (b.accion === "foto") {
          // Foto de un artículo (para el PDF). Clave: código si tiene, si no la descripción.
          const clave = String(b.clave || "").trim().slice(0, 400);
          if (!clave) { res.status(400).json({ error: "Falta el artículo" }); return; }
          actual.fotos = actual.fotos && typeof actual.fotos === "object" ? actual.fotos : {};
          if (b.id) actual.fotos[clave] = String(b.id).replace(/[^\w-]/g, "").slice(0, 60);
          else delete actual.fotos[clave];
        } else { res.status(400).json({ error: "Acción inválida" }); return; }
        const r = await escribirArchivoDatos(RUTA_LISTA_PRECIOS, actual, sha, `Lista de precios (${b.accion}) — ${autorizacion.nombre || "admin"}`);
        if (r.ok) { res.status(200).json({ ok: true, cantidad: actual.items.length, cotizacion_usd: actual.cotizacion_usd, kits: (actual.kits || []).length, fotos: Object.keys(actual.fotos || {}).length }); return; }
        if (r.status !== 409 && r.status !== 422) { res.status(502).json({ error: "No se pudo guardar la lista de precios" }); return; }
      }
      res.status(409).json({ error: "Otra persona estaba guardando al mismo tiempo. Probá de nuevo." });
      return;
    }

    // presupuestos_express
    const vacio = { ultimo: 0, presupuestos: [] };
    if (req.method === "GET") {
      if (!esAdmin) { res.status(403).json({ error: "Solo la oficina ve el registro de presupuestos" }); return; }
      const { data } = await leerArchivoDatos(RUTA_PRESUPUESTOS_EXPRESS, vacio);
      res.status(200).json({ ...vacio, ...(data || {}) });
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    const b = body && typeof body === "object" ? body : {};
    if (!esAdmin) {
      const t = (await leerTecnicosGuardados()).find((x) => x.nombre === autorizacion.nombre);
      if (!(t && t.permisos && t.permisos.presupuesto_express)) { res.status(403).json({ error: "No tenés habilitado el Presupuesto express" }); return; }
    }
    const txt = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
    for (let intento = 0; intento < 4; intento++) {
      const { data, sha } = await leerArchivoDatos(RUTA_PRESUPUESTOS_EXPRESS, vacio);
      const reg = { ...vacio, ...(data || {}) };
      if (!Array.isArray(reg.presupuestos)) reg.presupuestos = [];
      let respuesta;
      if (b.accion === "nuevo") {
        reg.ultimo = (Number(reg.ultimo) || 0) + 1;
        const numero = "E-" + String(reg.ultimo).padStart(4, "0");
        reg.presupuestos.unshift({
          numero, fecha: new Date().toISOString(), emitido_por: autorizacion.nombre || "Oficina",
          cliente: txt(b.cliente, 150), numero_cliente: txt(b.numero_cliente, 30), titulo: txt(b.titulo, 150),
          total_materiales: numeroArgentino(b.total_materiales) || 0, mano_obra: numeroArgentino(b.mano_obra) || 0,
          total: numeroArgentino(b.total) || 0, forma_pago: txt(b.forma_pago, 80), cotizacion_usd: numeroArgentino(b.cotizacion_usd) || null,
          tipo: ["ampliacion", "monitoreado", "automonitoreo"].includes(b.tipo) ? b.tipo : "", abono: numeroArgentino(b.abono) || null,
          mo_iva: b.mo_iva === true, abono_iva: b.abono_iva === true, ajuste: Number(b.ajuste) || 0,
          articulos: Math.max(0, Math.min(1000, Number(b.articulos) || 0)),
        });
        reg.presupuestos = reg.presupuestos.slice(0, 3000);
        respuesta = { ok: true, numero };
      } else if (b.accion === "revision") {
        // Corrección de un presupuesto ya enviado: mismo número con -R1, -R2...
        const base = txt(b.base, 20).replace(/-R\d+$/, "");
        if (!/^E-\d{4,}$/.test(base)) { res.status(400).json({ error: "Número de presupuesto inválido" }); return; }
        const previas = reg.presupuestos.filter((x) => x.numero === base || String(x.numero).startsWith(base + "-R"));
        const n = previas.reduce((m, x) => Math.max(m, Number((String(x.numero).match(/-R(\d+)$/) || [0, 0])[1])), 0) + 1;
        const numero = `${base}-R${n}`;
        reg.presupuestos.unshift({
          numero, revision_de: base, fecha: new Date().toISOString(), emitido_por: autorizacion.nombre || "Oficina",
          cliente: txt(b.cliente, 150), numero_cliente: txt(b.numero_cliente, 30), titulo: txt(b.titulo, 150),
          total_materiales: numeroArgentino(b.total_materiales) || 0, mano_obra: numeroArgentino(b.mano_obra) || 0,
          total: numeroArgentino(b.total) || 0, forma_pago: txt(b.forma_pago, 80), cotizacion_usd: numeroArgentino(b.cotizacion_usd) || null,
          tipo: ["ampliacion", "monitoreado", "automonitoreo"].includes(b.tipo) ? b.tipo : "", abono: numeroArgentino(b.abono) || null,
          mo_iva: b.mo_iva === true, abono_iva: b.abono_iva === true, ajuste: Number(b.ajuste) || 0,
          articulos: Math.max(0, Math.min(1000, Number(b.articulos) || 0)),
        });
        reg.presupuestos = reg.presupuestos.slice(0, 3000);
        respuesta = { ok: true, numero };
      } else if (b.accion === "adjuntar_pdf") {
        const e = reg.presupuestos.find((x) => x.numero === b.numero);
        if (!e) { res.status(404).json({ error: "No existe ese presupuesto" }); return; }
        e.pdf_id = txt(b.pdf_id, 80);
        respuesta = { ok: true };
      } else { res.status(400).json({ error: "Acción inválida" }); return; }
      const r = await escribirArchivoDatos(RUTA_PRESUPUESTOS_EXPRESS, reg, sha, `Presupuesto express ${b.accion} — ${autorizacion.nombre || "admin"}`);
      if (r.ok) { res.status(200).json(respuesta); return; }
      if (r.status !== 409 && r.status !== 422) { res.status(502).json({ error: "No se pudo guardar el presupuesto" }); return; }
    }
    res.status(409).json({ error: "Muchos presupuestos al mismo tiempo. Probá de nuevo." });
  } catch (err) {
    res.status(500).json({ error: "Error interno: " + String(err.message || err) });
  }
}

// ============================================================
// CROQUIS: bocetos de planos hechos desde el celular. Un archivo por
// croquis (croquis/<id>.json, con los trazos para seguir editándolo) y un
// índice chico (croquis-index.json) para listarlos sin bajar todo.
// ============================================================
const RUTA_CROQUIS_INDICE = "croquis-index.json";
// ---------- Croquis desde la foto de un boceto en papel ----------
// La IA (Gemini, la misma clave que usa Manuales) mira la foto y devuelve
// lo que entiende en un JSON simple; la app lo convierte en un croquis
// editable (croquisDesdeIA en croquis-utils.js).
const PROMPT_BOCETO_CROQUIS = `Sos un asistente de una empresa argentina de alarmas (SAT). Te paso la foto de un boceto hecho a mano alzada por un técnico: es la planta de un domicilio o local, con los equipos de alarma marcados.
Interpretá el dibujo y devolvé SOLO un JSON con esta forma:
{
  "rotacion": 0,
  "habitaciones": [{"x1":0,"y1":0,"x2":0,"y2":0,"nombre":""}],
  "paredes": [{"x1":0,"y1":0,"x2":0,"y2":0}],
  "aberturas": [{"tipo":"puerta","x1":0,"y1":0,"x2":0,"y2":0}],
  "equipos": [{"tipo":"central","x":0,"y":0,"numero":"","apunta":"","agregar":false}],
  "textos": [{"x":0,"y":0,"texto":""}],
  "notas": ""
}
Coordenadas: x de 0 a 1000 a lo ancho de la foto (0 = borde izquierdo) e y de 0 a 1000 a lo alto (0 = borde de arriba), tal como se ve la foto, sin rotarla.
"rotacion": cuántos grados hay que girar la foto en sentido horario para que los textos del dibujo se lean derechos (0, 90, 180 o 270). Si la hoja está de costado, no es 0.
Reglas:
- "habitaciones": cada ambiente rectangular (esquinas opuestas). El contorno exterior de la casa también es una habitación. Si tiene nombre escrito adentro (Cocina, Oficina, etc.) ponelo en "nombre" y no lo repitas en textos.
- "paredes": líneas sueltas que dividen ambientes y no forman un rectángulo cerrado.
- "aberturas": van sobre una pared, x1,y1-x2,y2 es el tramo que ocupan. tipo: "puerta" (rectángulo angosto o arco sobre la pared), "ventana" (rectángulo doble angosto y corto), "corrediza" (rectángulo doble largo), "porton_corredizo", "porton_batiente".
- "equipos" (tipo exacto de esta lista): "central" (cuadrado con "CA" o "C" o "Central"), "teclado" (cuadrado con "T"), "hub", "repetidor" ("ReX"), "sirena_ext" / "sirena_int" (rectángulo con un triángulo abajo, o "S"), "magnetico" (cuadradito relleno o "M" junto a una puerta o ventana), "infrarrojo" (triángulo con rayitas "ııı" o "!!!" que indican hacia dónde capta; "infrarrojo_ext" si dice exterior), "humo" (círculo con "DH" o "humo"), "gas" ("DG" o "gas"), "pulsador_incendio", "pulsador_asalto", "camara_ip", "camara_analoga", "dvr", "monitor".
  "numero": el número de zona o dispositivo escrito al lado (ej. "3"); vacío si no hay.
  "agregar": true si el equipo está marcado como a agregar o a instalar (dice "AGREGAR", "nuevo", "a instalar", "presupuestar" o tiene una flecha con eso). En ese caso no pongas ese "AGREGAR" en "textos".
  "apunta" (solo infrarrojos y cámaras): hacia dónde mira, según la foto sin rotar: "arriba", "abajo", "izquierda", "derecha", "arriba-izquierda", "arriba-derecha", "abajo-izquierda" o "abajo-derecha". Las rayitas del infrarrojo están del lado hacia donde capta.
  "x","y": el centro del símbolo.
- "textos": anotaciones cortas dentro del plano que no sean nombres de ambientes ni números de zona (ej. "AGREGAR", un modelo de equipo, "gabinete apertura puerta").
- "notas": todo lo escrito fuera del plano (listas, "presupuestar", observaciones), en líneas separadas con \\n.
No inventes cosas que no estén dibujadas. Si dudás qué equipo es, usá el más parecido y agregá un texto al lado con lo que dice.`;
async function interpretarBocetoCroquis(b, res) {
  const { GEMINI_API_KEY } = process.env;
  if (!GEMINI_API_KEY) { res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel" }); return; }
  const imagen = String(b.imagen || "").replace(/^data:[^,]*,/, "");
  const mime = /^image\/(jpeg|png|webp)$/.test(b.mime) ? b.mime : "image/jpeg";
  if (imagen.length < 1000) { res.status(400).json({ error: "Falta la foto del boceto" }); return; }
  if (imagen.length > 4000000) { res.status(400).json({ error: "La foto es demasiado grande" }); return; }
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: imagen } }, { text: PROMPT_BOCETO_CROQUIS }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 429) { res.status(429).json({ error: "Se alcanzó el límite de consultas a la IA por ahora. Probá de nuevo en unos minutos." }); return; }
    res.status(502).json({ error: "No se pudo consultar la IA", detail: d.error || d });
    return;
  }
  const texto = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []).map((p) => p.text || "").join("");
  let resultado = null;
  try { resultado = JSON.parse(texto.replace(/^```(json)?/i, "").replace(/```\s*$/, "").trim()); } catch (e) { resultado = null; }
  if (!resultado || typeof resultado !== "object") { res.status(502).json({ error: "La IA no pudo interpretar el boceto. Probá con una foto más de frente y con buena luz." }); return; }
  res.status(200).json({ ok: true, resultado });
}
// ---------- Plano en PDF (de arquitecto): segunda mirada con IA ----------
// La app ya leyó las líneas del PDF; la IA (un modelo de visión) mira la
// hoja como imagen y marca dónde ve puertas, ventanas, pasos y escaleras,
// para sumar lo que las reglas no reconocieron (fusión en croquis-utils.js).
const PROMPT_ABERTURAS_PLANO = `Te paso la imagen de un plano de arquitectura (vista en planta) de una casa o local.
Marcá cada uno de estos elementos con su caja:
- "puerta": puerta de abrir (se ve el arco de barrido y/o la hoja). La caja incluye la hoja y el arco.
- "corrediza": puerta o ventanal corredizo (dos hojas paralelas encimadas dentro de la pared).
- "ventana": ventana (líneas finas paralelas dentro del espesor de la pared, o el símbolo de ventana).
- "porton": portón de garaje o de entrada de autos.
- "paso": vano sin puerta entre dos ambientes (la pared se corta y no hay hoja ni arco).
- "escalera_recta", "escalera_u" (dos tramos con descanso, en U), "escalera_l" (en L) o "escalera_caracol": la caja abarca toda la escalera.
Devolvé SOLO un JSON: {"objetos":[{"tipo":"puerta","box_2d":[ymin,xmin,ymax,xmax]}]}
Las coordenadas van de 0 a 1000 (0,0 arriba a la izquierda de la imagen).
No marques muebles, artefactos de baño o cocina, cotas, textos ni el rótulo. No inventes: si no estás seguro, no lo pongas.`;
const PROMPT_LEER_CODIGOS = `Esta foto es de la etiqueta de un producto o de su caja (equipos de seguridad electrónica).
Leé los códigos impresos como texto: los números y letras que están debajo o al lado de los códigos de barra, y los que tienen al lado S/N, Serial, Tracking, Model, P/N, Lote o un logo de la empresa SAT.
Copiá cada código exactamente como está, sin espacios ni guiones agregados. Si algún carácter no se lee con seguridad, NO incluyas ese código (es mejor no devolverlo que devolverlo mal).
Respondé solo con JSON: {"codigos":[{"texto":"...","rotulo":"lo que dice al lado (S/N, Tracking, Model...) o vacío"}]}`;
async function detectarAberturasPlano(b, res) {
  const { GEMINI_API_KEY } = process.env;
  if (!GEMINI_API_KEY) { res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel" }); return; }
  const imagen = String(b.imagen || "").replace(/^data:[^,]*,/, "");
  if (imagen.length < 1000) { res.status(400).json({ error: "Falta la imagen del plano" }); return; }
  if (imagen.length > 4500000) { res.status(400).json({ error: "La imagen es demasiado grande" }); return; }
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: imagen } }, { text: PROMPT_ABERTURAS_PLANO }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 429) { res.status(429).json({ error: "Se alcanzó el límite de consultas a la IA por ahora." }); return; }
    res.status(502).json({ error: "No se pudo consultar la IA" });
    return;
  }
  const texto = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []).map((p) => p.text || "").join("");
  let resultado = null;
  try { resultado = JSON.parse(texto.replace(/^```(json)?/i, "").replace(/```\s*$/, "").trim()); } catch (e) { resultado = null; }
  const lista = Array.isArray(resultado) ? resultado : resultado && Array.isArray(resultado.objetos) ? resultado.objetos : [];
  const TIPOS = new Set(["puerta", "corrediza", "ventana", "porton", "paso", "escalera_recta", "escalera_u", "escalera_l", "escalera_caracol"]);
  const objetos = lista.filter((o) => o && TIPOS.has(o.tipo) && Array.isArray(o.box_2d) && o.box_2d.length === 4 && o.box_2d.every((v) => Number.isFinite(Number(v))))
    .slice(0, 200).map((o) => ({ tipo: o.tipo, box_2d: o.box_2d.map((v) => Math.max(0, Math.min(1000, Number(v)))) }));
  res.status(200).json({ ok: true, objetos });
}
// Estado de una instalación en el backend ('abierta' | 'cerrada'), o null si
// no se pudo saber (sin backend o sin señal: en ese caso no se bloquea).
async function estadoInstalacion(id) {
  const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
  if (!id || !BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) return null;
  try {
    const r = await fetch(`${BACKEND_NUEVO_URL}/api/instalaciones/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}` } });
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.estado ? String(d.estado) : null;
  } catch (e) { return null; }
}
const MENSAJE_CROQUIS_CERRADO = "La instalación ya se cerró: este plano quedó como registro y no se puede modificar. Si hace falta cambiarlo, pedíselo a la oficina.";
// Índice de los links 3D mandados a clientes (aperturas y pedidos de llamada).
const RUTA_VISTAS3D_INDICE = "vistas3d/indice.json";
const RUTA_TARJETAS = "tarjetas-contacto.json";
async function anotarVista3d(id, cambiar) {
  for (let intento = 0; intento < 3; intento++) {
    const { data, sha } = await leerArchivoDatos(RUTA_VISTAS3D_INDICE, []);
    const lista = cambiar(Array.isArray(data) ? data : []);
    if (!lista) return null;
    const r = await escribirArchivoDatos(RUTA_VISTAS3D_INDICE, lista, sha, `Vista 3D ${id}`);
    if (r.ok) return lista;
    if (r.status !== 409 && r.status !== 422) return null;
  }
  return null;
}
async function manejarCroquis(req, res, autorizacion, body) {
  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) { res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" }); return; }
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const esAdmin = autorizacion.rol === "admin";
  let puede = esAdmin;
  if (!puede) {
    const t = (await leerTecnicosGuardados()).find((x) => x.nombre === autorizacion.nombre);
    puede = !!(t && t.permisos && t.permisos.croquis);
  }
  const b = body && typeof body === "object" ? body : {};
  const instValida = (v) => /^\d{1,15}$/.test(String(v == null ? "" : v).trim());
  // El plano de una instalación lo puede hacer cualquier técnico que esté
  // en la instalación, aunque no tenga el permiso de croquis en general.
  // Y cualquier técnico puede ver los planos de un cliente (para el servicio técnico).
  const porCliente = req.method === "GET" && !!(String(req.query.numero_cliente || "").replace(/\D/g, "") || String(req.query.cliente || "").trim());
  const deInstalacion = req.method === "GET" ? !!(req.query.id || instValida(req.query.instalacion) || porCliente || req.query.vistas3d || req.query.tarjetas || req.query.aprobados) : (instValida(b.instalacion) || instValida(b.instalacion_id) || b.accion === "borrar" || b.accion === "publicar" || b.accion === "compartir_3d" || b.accion === "vista3d_estado" || b.accion === "tarjeta_guardar");
  if (!puede && !deInstalacion) { res.status(403).json({ error: "No tenés habilitados los croquis" }); return; }
  const txt = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
  const idValido = (id) => /^[a-z0-9]{6,32}$/.test(String(id || ""));
  try {
    if (req.method === "GET") {
      if (req.query.tarjetas) {
        // Tarjetas de contacto (quién asesoró) para la vista 3D del cliente.
        const { data } = await leerArchivoDatos(RUTA_TARJETAS, {});
        const t = data && typeof data === "object" ? data : {};
        res.status(200).json({ yo: autorizacion.nombre || "", admin: esAdmin, empresaEditable: esAdmin || puede, empresa: t.empresa || {}, personas: t.personas && typeof t.personas === "object" ? t.personas : {} });
        return;
      }
      if (req.query.vistas3d) {
        // Links 3D que se mandaron (de un croquis o un cliente): cuántas veces
        // los abrieron y si pidieron que los llamen.
        const { data } = await leerArchivoDatos(RUTA_VISTAS3D_INDICE, []);
        let lista = Array.isArray(data) ? data : [];
        if (req.query.todas) {
          // Tablero de propuestas: la oficina ve todas; cada uno, las que mandó.
          const { seguimientoPropuesta } = require("../lib/propuestas3d");
          const ahora = Date.now();
          lista = lista.filter((v) => esAdmin || v.por === autorizacion.nombre).slice(0, 300).map((v) => ({ ...v, seguimiento: seguimientoPropuesta(v, ahora) }));
          res.status(200).json(lista);
          return;
        }
        const cid = String(req.query.croquis_id || ""), cli = String(req.query.cliente || "").trim().toLowerCase();
        if (cid || cli) lista = lista.filter((v) => (cid && v.croquis_id === cid) || (cli && String(v.cliente || "").trim().toLowerCase() === cli));
        res.status(200).json(lista.slice(0, 50));
        return;
      }
      if (req.query.id) {
        if (!idValido(req.query.id)) { res.status(400).json({ error: "Id inválido" }); return; }
        const { data } = await leerArchivoDatos(`croquis/${req.query.id}.json`, null);
        if (!data) { res.status(404).json({ error: "Ese croquis ya no existe" }); return; }
        // Si la instalación ya se cerró (aunque no se haya marcado acá), se avisa.
        if (data.instalacion && !data.cerrado && (await estadoInstalacion(data.instalacion)) === "cerrada") data.cerrado = true;
        res.status(200).json(data);
        return;
      }
      const { data } = await leerArchivoDatos(RUTA_CROQUIS_INDICE, []);
      let lista = Array.isArray(data) ? data : [];
      // Todos los croquis aprobados para los clientes (o de instalaciones
      // cerradas): para buscarlos junto con los planos en PDF.
      if (req.query.aprobados) {
        res.status(200).json(lista.filter((c) => c.cerrado || c.publicado).map((c) => ({ id: c.id, titulo: c.titulo, cliente: c.cliente, numero_cliente: c.numero_cliente, cerrado: !!c.cerrado, publicado: !!c.publicado, actualizado: c.actualizado })));
        return;
      }
      // Pedido de una instalación o un cliente puntual (o sin el permiso general):
      // solo los de esa instalación y los del mismo cliente.
      if (!puede || porCliente || instValida(req.query.instalacion)) {
        const inst = String(req.query.instalacion || "").trim();
        const num = String(req.query.numero_cliente || "").replace(/\D/g, "").replace(/^0+/, "");
        const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
        const cli = norm(req.query.cliente);
        // Desde el servicio técnico (o sin el permiso de croquis) solo se ven los
        // planos aprobados para el cliente ("subidos") o los de instalaciones
        // cerradas: un croquis a medio dibujar no le aparece a nadie más.
        const soloAprobados = !!req.query.servicio || !puede;
        const delCliente = (c) => (num && String(c.numero_cliente || "").replace(/\D/g, "").replace(/^0+/, "") === num) || (cli && norm(c.cliente) === cli);
        lista = lista.filter((c) => (inst && String(c.instalacion || "") === inst) || (delCliente(c) && (!soloAprobados || c.cerrado || c.publicado)));
      }
      res.status(200).json(lista);
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    if (b.accion === "interpretar") { await interpretarBocetoCroquis(b, res); return; }
    if (b.accion === "aberturas_plano") { await detectarAberturasPlano(b, res); return; }
    if (b.accion === "vista3d_estado") {
      // Seguimiento: ganada / perdida / reabrir, y "ya lo llamé".
      const id = String(b.id || "");
      if (!/^[0-9a-f]{16}$/.test(id)) { res.status(400).json({ error: "Id inválido" }); return; }
      let error = null, actualizado = null;
      await anotarVista3d(id, (lista) => {
        const v = lista.find((x) => x.id === id);
        if (!v) { error = [404, "Esa propuesta ya no existe"]; return null; }
        if (!esAdmin && v.por !== autorizacion.nombre) { error = [403, "Esa propuesta la mandó otra persona"]; return null; }
        if (b.estado !== undefined) {
          if (!["ganada", "perdida", ""].includes(b.estado)) { error = [400, "Estado inválido"]; return null; }
          if (b.estado) { v.estado = b.estado; v.cerrada = new Date().toISOString(); } else { delete v.estado; delete v.cerrada; }
        }
        if (b.llamada_atendida !== undefined) v.llamada_atendida = !!b.llamada_atendida;
        if (b.nota !== undefined) v.nota = txt(b.nota, 200);
        actualizado = v;
        return lista;
      });
      if (error) { res.status(error[0]).json({ error: error[1] }); return; }
      if (!actualizado) { res.status(502).json({ error: "No se pudo guardar" }); return; }
      res.status(200).json({ ok: true, propuesta: actualizado });
      return;
    }
    if (b.accion === "tarjeta_guardar") {
      // Cada uno edita su tarjeta; la oficina, la de cualquiera (y la de un
      // vendedor que no usa la app). Los datos de la empresa, quien hace planos.
      const { limpiarTarjeta, limpiarEmpresa } = require("../lib/tarjeta-contacto");
      const persona = txt(b.persona, 60);
      if (persona && !esAdmin && persona !== autorizacion.nombre) { res.status(403).json({ error: "Solo podés editar tu propia tarjeta" }); return; }
      if (b.empresa && !esAdmin && !puede) { res.status(403).json({ error: "Los datos de la empresa los edita la oficina" }); return; }
      for (let intento = 0; intento < 4; intento++) {
        const { data, sha } = await leerArchivoDatos(RUTA_TARJETAS, {});
        const t = data && typeof data === "object" ? data : {};
        t.personas = t.personas && typeof t.personas === "object" ? t.personas : {};
        if (persona) { if (b.borrar && esAdmin) delete t.personas[persona]; else t.personas[persona] = limpiarTarjeta(b.tarjeta); }
        if (b.empresa) t.empresa = limpiarEmpresa(b.empresa);
        const r = await escribirArchivoDatos(RUTA_TARJETAS, t, sha, `Tarjeta de contacto${persona ? " — " + persona : " — empresa"}`);
        if (r.ok) { res.status(200).json({ ok: true, empresa: t.empresa || {}, personas: t.personas }); return; }
        if (r.status !== 409 && r.status !== 422) break;
      }
      res.status(502).json({ error: "No se pudo guardar la tarjeta" });
      return;
    }
    if (b.accion === "compartir_3d") {
      // Vista 3D para mandarle al cliente (por WhatsApp): se guarda una copia
      // del dibujo con un id al azar, sin dirección ni datos internos, y se
      // ve en vista-3d.html?id=… sin login. Puede llevar hasta 3 propuestas
      // para que el cliente las compare.
      const permitidos = new Set(["linea", "rect", "simbolo", "texto", "abertura", "mueble"]);
      const limpiar = (els) => (Array.isArray(els) ? els : []).filter((e) => e && typeof e === "object" && permitidos.has(e.t)).slice(0, 3000);
      const limpiarPaginas = (pp) => (Array.isArray(pp) ? pp : []).slice(0, 8)
        .map((pg) => ({ nombre: txt(pg && pg.nombre, 60), elementos: limpiar(pg && pg.elementos), ...(pg && Number.isInteger(pg.nivel) && Math.abs(pg.nivel) < 10 ? { nivel: pg.nivel } : {}) }))
        .filter((pg) => pg.elementos.length);
      const fuente = Array.isArray(b.propuestas) && b.propuestas.length ? b.propuestas : [{ nombre: "", paginas: Array.isArray(b.paginas) ? b.paginas : [{ nombre: "", elementos: b.elementos }] }];
      const propuestas = fuente.slice(0, 3).map((pr) => ({ nombre: txt(pr && pr.nombre, 40), paginas: limpiarPaginas(pr && pr.paginas) })).filter((pr) => pr.paginas.length);
      if (!propuestas.length) { res.status(400).json({ error: "El plano está vacío" }); return; }
      const reg = { titulo: txt(b.titulo, 100) || "Tu sistema de seguridad", cliente: txt(b.cliente, 80), fecha: new Date().toISOString(), por: autorizacion.nombre || "admin", croquis_id: idValido(b.croquis_id) ? b.croquis_id : "", propuestas, paginas: propuestas[0].paginas, presentacion: b.presentacion !== false };
      const contacto = require("../lib/tarjeta-contacto").armarContacto(b.contacto);
      if (contacto) reg.contacto = contacto;
      if (JSON.stringify(reg).length > 1500000) { res.status(413).json({ error: "El plano es demasiado grande para compartir" }); return; }
      const id = crypto.randomBytes(8).toString("hex");
      const r = await escribirArchivoDatos(`vistas3d/${id}.json`, reg, undefined, `Vista 3D compartida — ${reg.titulo}`);
      if (!r.ok) { res.status(502).json({ error: "No se pudo guardar la vista 3D" }); return; }
      await anotarVista3d(id, (lista) => { lista.unshift({ id, titulo: reg.titulo, cliente: reg.cliente, por: reg.por, croquis_id: reg.croquis_id, fecha: reg.fecha, propuestas: propuestas.map((pr) => pr.nombre), ...(contacto && contacto.nombre ? { asesor: contacto.nombre } : {}), aperturas: 0, llamadas: [] }); return lista.slice(0, 500); }).catch(() => {});
      res.status(200).json({ ok: true, id });
      return;
    }
    if (b.accion === "cerrar_instalacion") {
      // Al cerrar la instalación, sus planos quedan como registro (solo lectura).
      if (!instValida(b.instalacion_id)) { res.status(400).json({ error: "Falta instalacion_id" }); return; }
      const inst = String(b.instalacion_id).trim();
      if (!esAdmin && (await estadoInstalacion(inst)) === "abierta") { res.status(409).json({ error: "La instalación sigue abierta" }); return; }
      const ahora = new Date().toISOString();
      const { data: indice } = await leerArchivoDatos(RUTA_CROQUIS_INDICE, []);
      const ids = (Array.isArray(indice) ? indice : []).filter((c) => String(c.instalacion || "") === inst && !c.cerrado).map((c) => c.id);
      for (const id of ids) {
        const ruta = `croquis/${id}.json`;
        const previo = await leerArchivoDatos(ruta, null);
        if (previo.data && !previo.data.cerrado) await escribirArchivoDatos(ruta, { ...previo.data, cerrado: true, cerrado_en: ahora }, previo.sha, `Croquis ${id}: instalación ${inst} cerrada`);
      }
      if (ids.length) {
        for (let intento = 0; intento < 4; intento++) {
          const { data, sha } = await leerArchivoDatos(RUTA_CROQUIS_INDICE, []);
          const lista = (Array.isArray(data) ? data : []).map((c) => (ids.includes(c.id) ? { ...c, cerrado: true, cerrado_en: ahora } : c));
          const r2 = await escribirArchivoDatos(RUTA_CROQUIS_INDICE, lista, sha, `Índice de croquis — instalación ${inst} cerrada`);
          if (r2.ok || (r2.status !== 409 && r2.status !== 422)) break;
        }
      }
      res.status(200).json({ ok: true, cerrados: ids.length });
      return;
    }
    if (b.accion === "guardar") {
      const id = b.id && idValido(b.id) ? b.id : (Date.now().toString(36) + require("crypto").randomBytes(4).toString("hex"));
      const dibujo = b.dibujo && typeof b.dibujo === "object" ? b.dibujo : null;
      if (!dibujo || !Array.isArray(dibujo.elementos)) { res.status(400).json({ error: "El croquis está vacío" }); return; }
      if (JSON.stringify(dibujo).length > 900000) { res.status(400).json({ error: "El croquis es demasiado grande" }); return; }
      const ruta = `croquis/${id}.json`;
      const previo = await leerArchivoDatos(ruta, null);
      const ant = previo.data || null;
      const instalacion = instValida(b.instalacion) ? String(b.instalacion).trim() : (ant && ant.instalacion) || "";
      if (!puede && !instalacion) { res.status(403).json({ error: "No tenés habilitados los croquis" }); return; }
      if (!puede && ant && ant.instalacion && ant.instalacion !== instalacion) { res.status(403).json({ error: "Ese croquis es de otra instalación" }); return; }
      // Una vez cerrada la instalación, su plano ya no se toca (salvo la oficina).
      if (!esAdmin && ((ant && ant.cerrado) || (instalacion && (await estadoInstalacion(instalacion)) === "cerrada"))) { res.status(403).json({ error: MENSAJE_CROQUIS_CERRADO, cerrado: true }); return; }
      // Lo puede seguir editando cualquiera habilitado; queda registrado quién lo creó y quién lo cambió.
      const ahora = new Date().toISOString();
      const registro = {
        id, titulo: txt(b.titulo, 120) || "Croquis", cliente: txt(b.cliente, 150), numero_cliente: txt(b.numero_cliente, 30), direccion: txt(b.direccion, 200),
        autor: (ant && ant.autor) || autorizacion.nombre || "Oficina", creado: (ant && ant.creado) || ahora,
        actualizado: ahora, actualizado_por: autorizacion.nombre || "Oficina", dibujo,
      };
      if (instalacion) registro.instalacion = instalacion;
      if (ant && ant.cerrado) { registro.cerrado = true; registro.cerrado_en = ant.cerrado_en; }
      if (ant && ant.publicado) { registro.publicado = true; registro.publicado_por = ant.publicado_por; registro.publicado_en = ant.publicado_en; }
      const r1 = await escribirArchivoDatos(ruta, registro, previo.sha, `Croquis ${registro.titulo} — ${autorizacion.nombre || "admin"}`);
      if (!r1.ok) { res.status(502).json({ error: "No se pudo guardar el croquis" }); return; }
      const paginas = Array.isArray(dibujo.paginas) ? dibujo.paginas : null;
      const conBase = !!((dibujo.fondo && dibujo.fondo.base) || (paginas && paginas.some((p) => p && p.fondo && p.fondo.base)));
      const resumen = { ...registro, elementos: paginas ? paginas.reduce((n, p) => n + ((p && Array.isArray(p.elementos)) ? p.elementos.length : 0), 0) : dibujo.elementos.length, paginas: paginas ? paginas.length : 1, base: conBase };
      delete resumen.dibujo;
      for (let intento = 0; intento < 4; intento++) {
        const { data, sha } = await leerArchivoDatos(RUTA_CROQUIS_INDICE, []);
        const lista = (Array.isArray(data) ? data : []).filter((x) => x.id !== id);
        lista.unshift(resumen);
        const r2 = await escribirArchivoDatos(RUTA_CROQUIS_INDICE, lista.slice(0, 5000), sha, `Índice de croquis — ${registro.titulo}`);
        if (r2.ok) { res.status(200).json({ ok: true, id, actualizado: ahora }); return; }
        if (r2.status !== 409 && r2.status !== 422) break;
      }
      res.status(200).json({ ok: true, id, actualizado: ahora, aviso: "Se guardó, pero puede tardar en aparecer en la lista" });
      return;
    }
    if (b.accion === "publicar") {
      // "Subir al cliente": quien lo dibujó (o la oficina) aprueba que el
      // croquis lo vean los técnicos desde el servicio técnico.
      if (!idValido(b.id)) { res.status(400).json({ error: "Id inválido" }); return; }
      const ruta = `croquis/${b.id}.json`;
      const previo = await leerArchivoDatos(ruta, null);
      if (!previo.data) { res.status(404).json({ error: "Ese croquis no existe (guardalo primero)" }); return; }
      if (!esAdmin && previo.data.autor !== autorizacion.nombre) { res.status(403).json({ error: "Solo lo puede subir al cliente quien lo dibujó, o la oficina" }); return; }
      const on = b.publicar !== false;
      const reg = { ...previo.data };
      if (on) { reg.publicado = true; reg.publicado_por = autorizacion.nombre || "Oficina"; reg.publicado_en = new Date().toISOString(); } else { delete reg.publicado; delete reg.publicado_por; delete reg.publicado_en; }
      const r1 = await escribirArchivoDatos(ruta, reg, previo.sha, `Croquis ${reg.titulo} — ${on ? "subido al cliente" : "quitado del cliente"}`);
      if (!r1.ok) { res.status(502).json({ error: "No se pudo cambiar" }); return; }
      for (let intento = 0; intento < 4; intento++) {
        const { data, sha } = await leerArchivoDatos(RUTA_CROQUIS_INDICE, []);
        const lista = Array.isArray(data) ? data : [];
        const x = lista.find((c) => c.id === b.id);
        if (!x) break;
        if (on) { x.publicado = true; x.publicado_por = reg.publicado_por; x.publicado_en = reg.publicado_en; } else { delete x.publicado; delete x.publicado_por; delete x.publicado_en; }
        const r2 = await escribirArchivoDatos(RUTA_CROQUIS_INDICE, lista, sha, `Índice de croquis — ${on ? "sube" : "quita"} ${b.id}`);
        if (r2.ok || (r2.status !== 409 && r2.status !== 422)) break;
      }
      res.status(200).json({ ok: true, publicado: on });
      return;
    }
    if (b.accion === "borrar") {
      if (!idValido(b.id)) { res.status(400).json({ error: "Id inválido" }); return; }
      const ruta = `croquis/${b.id}.json`;
      const previo = await leerArchivoDatos(ruta, null);
      if (previo.data && !esAdmin && previo.data.autor !== autorizacion.nombre) { res.status(403).json({ error: "Solo lo puede borrar quien lo hizo, o la oficina" }); return; }
      if (previo.data && !esAdmin && (previo.data.cerrado || (previo.data.instalacion && (await estadoInstalacion(previo.data.instalacion)) === "cerrada"))) { res.status(403).json({ error: MENSAJE_CROQUIS_CERRADO, cerrado: true }); return; }
      if (previo.data && !puede && !previo.data.instalacion) { res.status(403).json({ error: "No tenés habilitados los croquis" }); return; }
      if (previo.sha) {
        await fetch(urlGithubDatos(ruta), { method: "DELETE", headers: headersGithubDatos({ "Content-Type": "application/json" }), body: JSON.stringify({ message: `Borra croquis ${b.id}`, sha: previo.sha }) });
      }
      for (let intento = 0; intento < 4; intento++) {
        const { data, sha } = await leerArchivoDatos(RUTA_CROQUIS_INDICE, []);
        const lista = (Array.isArray(data) ? data : []).filter((x) => x.id !== b.id);
        const r2 = await escribirArchivoDatos(RUTA_CROQUIS_INDICE, lista, sha, `Índice de croquis — borra ${b.id}`);
        if (r2.ok) { res.status(200).json({ ok: true }); return; }
        if (r2.status !== 409 && r2.status !== 422) break;
      }
      res.status(502).json({ error: "No se pudo actualizar la lista de croquis" });
      return;
    }
    res.status(400).json({ error: "Acción inválida" });
  } catch (err) {
    res.status(500).json({ error: "Error interno: " + String(err.message || err) });
  }
}

const COLECCIONES = {
  config: {
    path: "config.json",
    default: { dias_atencion: 3, dias_urgente: 7, app_version_actual: "3.38.0", felicitacion_semanal_activa: true },
    mergeConDefault: true,
  },
  tecnicos: { path: "tecnicos.json", default: [] },
  clientes: { path: "clientes-config.json", default: [] },
  materiales: { path: "materiales-catalogo.json", default: [] },
  "consultas-categorias": { path: "consultas-categorias.json", default: [] },
  guardias: { path: "guardias-config.json", default: { fecha_inicio_referencia: "", secuencia: [] } },
  credenciales: { path: "credenciales-config.json", default: [] },
  servicios_emergencia: { path: "servicios-emergencia.json", default: [] },
  vehiculos: {
    path: "vehiculos-config.json",
    default: [
      { nombre: "Renault Kangoo Blanca", km_actual: 0, umbrales: [] },
      { nombre: "Renault Kangoo Gris", km_actual: 0, umbrales: [] },
      { nombre: "Moto", km_actual: 0, umbrales: [] },
    ],
  },
  "push-subscripciones": { path: "push-subscripciones.json", default: [] },
  sims: { path: "sims-config.json", default: [] },
  herramientas: { path: "herramientas-config.json", default: [] },
  sims_instaladas: { path: "sims-instaladas.json", default: [] },
  errores_app: { path: "errores-app.json", default: [] },
  // { "<numero_servicio>": { primera: ISO, ultima: ISO } } — cuándo apareció
  // por primera vez cada servicio en el listado de pendientes.
  servicios_vistos: { path: "servicios-vistos.json", default: {} },
  // Sección cooperativa de Manuales: datos que aportan los técnicos
  // (APNs, códigos, trucos), con quién lo cargó, cuándo y quién lo editó.
  datos_equipo: { path: "datos-equipo.json", default: [] },
  // Registro de cambios del panel de administración (lo escribe lib/auditoria.js).
  auditoria: { path: "auditoria.json", default: [] },
};

// Traduce cada colección que ya se cortó al backend nuevo — algunas
// tienen exactamente la misma forma de datos en los dos lados (esas
// son un simple reenvío), y otras dos (materiales y categorías de
// consultas) tienen una forma distinta, así que hay que armar/
// desarmar la estructura de un lado al otro.
// credenciales, materiales y categorías de manuales no tienen una clave
// propia (solo un id que pone la base): el POST del backend AGREGA filas,
// no reemplaza. Mandar la lista completa en cada "Guardar" duplicaba todo.
// Ahora se reemplaza: se vacía la tabla (DELETE, que ya existía para las
// migraciones) y se carga la lista nueva. Si la carga fallara, se vuelve a
// poner lo que había antes, para no dejar la tabla vacía.
async function reemplazarColeccionSinClave(ruta, filasNuevas, backendUrl, headers) {
  const rPrevio = await fetch(`${backendUrl}${ruta}`, { headers });
  if (!rPrevio.ok) throw new Error("No se pudo leer lo que había guardado");
  const previas = await rPrevio.json();
  const rBorrar = await fetch(`${backendUrl}${ruta}`, { method: "DELETE", headers });
  if (!rBorrar.ok) throw new Error("No se pudo reemplazar la lista (el servidor no permitió vaciarla)");
  const sinId = (lista) => (Array.isArray(lista) ? lista : []).map(({ id, ...resto }) => resto);
  const r = await fetch(`${backendUrl}${ruta}`, { method: "POST", headers, body: JSON.stringify(sinId(filasNuevas)) });
  if (!r.ok) {
    if (sinId(previas).length) await fetch(`${backendUrl}${ruta}`, { method: "POST", headers, body: JSON.stringify(sinId(previas)) }).catch(() => {});
    let detalle = ""; try { detalle = (await r.json()).error || ""; } catch (e) { /* nada */ }
    return { status: r.status, data: { error: "No se pudo guardar" + (detalle ? ": " + detalle : "") + " — quedó lo que había antes." } };
  }
  const data = await r.json();
  return { status: 200, data: { ok: data.ok !== false, count: data.count ?? filasNuevas.length } };
}

async function manejarColeccionCortada(nombreColeccion, metodo, body, backendUrl, headers) {
  if (nombreColeccion === "clientes") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/clientes`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      // admin.html manda POST con lista vacía para "borrar todos"
      // (así funcionaba con el sistema viejo) — se traduce a DELETE.
      if (Array.isArray(body) && body.length === 0) {
        const r = await fetch(`${backendUrl}/api/clientes`, { method: "DELETE", headers });
        return { status: r.status, data: await r.json() };
      }
      const r = await fetch(`${backendUrl}/api/clientes`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: r.status, data: await r.json() };
    }
  }

  if (nombreColeccion === "materiales") {
    // GitHub: [{categoria, modelos: [...]}]  <->  backend nuevo: [{id, categoria, nombre, precio}]
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/materiales`, { headers });
      const filas = await r.json();
      const porCategoria = {};
      (Array.isArray(filas) ? filas : []).forEach((f) => {
        if (!porCategoria[f.categoria]) porCategoria[f.categoria] = [];
        porCategoria[f.categoria].push(f.nombre);
      });
      const agrupado = Object.keys(porCategoria).map((categoria) => ({ categoria, modelos: porCategoria[categoria] }));
      return { status: r.status, data: agrupado };
    }
    if (metodo === "POST") {
      const filas = [];
      (Array.isArray(body) ? body : []).forEach((cat) => {
        (cat.modelos || []).forEach((modelo) => filas.push({ categoria: cat.categoria, nombre: modelo, precio: null }));
      });
      return await reemplazarColeccionSinClave("/api/materiales", filas, backendUrl, headers);
    }
  }

  if (nombreColeccion === "consultas-categorias") {
    // GitHub: [{categoria, carpeta_drive_id}]  <->  backend nuevo: [{id, nombre, manual_ref}]
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/consultas-categorias`, { headers });
      const filas = await r.json();
      const traducido = (Array.isArray(filas) ? filas : []).map((f) => ({ categoria: f.nombre, carpeta_drive_id: f.manual_ref }));
      return { status: r.status, data: traducido };
    }
    if (metodo === "POST") {
      const filas = (Array.isArray(body) ? body : []).map((c) => ({ nombre: c.categoria, manual_ref: c.carpeta_drive_id }));
      return await reemplazarColeccionSinClave("/api/consultas-categorias", filas, backendUrl, headers);
    }
  }

  if (nombreColeccion === "credenciales") {
    // Misma forma en los dos lados — reenvío directo.
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/credenciales`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      return await reemplazarColeccionSinClave("/api/credenciales", Array.isArray(body) ? body : [], backendUrl, headers);
    }
  }

  if (nombreColeccion === "config") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/config`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/config`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: r.status, data: await r.json() };
    }
  }

  if (nombreColeccion === "guardias") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/guardias`, { headers });
      const data = await r.json();
      // ultima_semana_notificada es un dato interno del backend
      // nuevo (para no mandar el mail dos veces la misma semana) —
      // la app no lo necesita, se lo saca antes de devolverlo.
      if (data && typeof data === "object") delete data.ultima_semana_notificada;
      // "secuencia" se guarda como texto (JSON) en la base nueva —
      // hay que convertirlo de vuelta a lista antes de devolverlo,
      // si no la app recibe un texto plano en vez de un array.
      if (data && typeof data.secuencia === "string") {
        try { data.secuencia = JSON.parse(data.secuencia); } catch (err) { data.secuencia = []; }
      }
      // Mismo caso que "secuencia" — "excepciones" también se guarda
      // como texto (JSON) en la base nueva.
      if (data && typeof data.excepciones === "string") {
        try { data.excepciones = JSON.parse(data.excepciones); } catch (err) { data.excepciones = {}; }
      }
      return { status: r.status, data };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/guardias`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: r.status, data: await r.json() };
    }
  }

  if (nombreColeccion === "push-subscripciones") {
    // La app manda UN objeto (no una lista) — se agrega o actualiza
    // por endpoint, nunca se reemplaza la lista entera (así un
    // celular nuevo no borra las suscripciones de los demás).
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/push-subscripciones`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/push-subscripciones`, { method: "POST", headers, body: JSON.stringify([body]) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok } };
    }
  }

  if (nombreColeccion === "servicios_emergencia") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/emergencias`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      // La app manda la lista completa (viejas + nuevas) — como acá
      // no hay una clave natural para "actualizar por id", se vacía
      // y se vuelve a cargar todo entero, para no duplicar. Antes de
      // vaciar, se compara con lo que ya había (por cliente + fecha
      // de carga, ya que el id viejo no es el mismo que genera la
      // base nueva) para avisarle a todo el equipo de las que son
      // realmente nuevas — igual que hacía el sistema viejo.
      const rExistentes = await fetch(`${backendUrl}/api/emergencias`, { headers });
      const existentes = await rExistentes.json();
      const clavesExistentes = new Set((Array.isArray(existentes) ? existentes : []).map((e) => `${e.cliente}|${e.fecha_carga}`));
      const nuevas = (Array.isArray(body) ? body : []).filter((e) => !clavesExistentes.has(`${e.cliente}|${e.fecha_carga}`));

      await fetch(`${backendUrl}/api/emergencias`, { method: "DELETE", headers });
      const r = await fetch(`${backendUrl}/api/emergencias`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();

      if (nuevas.length > 0) {
        try {
          const { enviarATodos } = require("../lib/push-sender");
          for (const entrada of nuevas) {
            await enviarATodos({
              titulo: "🚨 Servicio de emergencia agendado",
              cuerpo: `${entrada.cargado_por || "Alguien"} cargó un servicio para ${entrada.cliente || "un cliente"}${entrada.fecha_deseada ? " el " + entrada.fecha_deseada : ""} — revisalo en Cronograma.`,
              url: "/",
            });
          }
        } catch (errPush) {
          // si falla el envío del aviso, no se rompe el guardado en sí
        }
      }
      return { status: r.status, data: { ok: data.ok, count: Array.isArray(body) ? body.length : undefined } };
    }
  }

  if (nombreColeccion === "notas") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/notas`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/notas`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();

      // Si se acaba de crear una nota (no una marca de "leída"), se
      // avisa por push a cada destinatario — el mensaje completo
      // queda en la app, acá solo va un adelanto.
      const accion = body && body.accion ? body.accion : "crear";
      if (accion === "crear" && r.ok && Array.isArray(body.destinatarios) && body.destinatarios.length > 0) {
        try {
          const { enviarASeleccionados } = require("../lib/push-sender");
          const adelanto = (body.mensaje || "").slice(0, 100);
          await enviarASeleccionados(body.destinatarios, {
            titulo: body.urgente ? "🔴 Nota urgente" : "📝 Nueva nota",
            cuerpo: `${body.de || "Alguien"}: ${adelanto}`,
            url: "/",
            importante: !!body.urgente,
          });
        } catch (errPush) {
          // si falla el envío del aviso, no se rompe el guardado en sí
        }
      }
      return { status: r.status, data };
    }
  }

  // Historial de visitas importado del sistema de oficina (una fila por
  // cliente con la fecha de su última visita) — alimenta el semáforo
  // de visitas de admin.html.
  if (nombreColeccion === "visitas_historicas") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/visitas-historicas`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const destino = body && body.accion === "ignorar" ? "ignorar" : "importar";
      const r = await fetch(`${backendUrl}/api/visitas-historicas/${destino}`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: r.status, data: await r.json() };
    }
  }

  if (nombreColeccion === "vehiculos") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/vehiculos`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/vehiculos`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  if (nombreColeccion === "herramientas") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/herramientas`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/herramientas`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  if (nombreColeccion === "sims") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/sims`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/sims`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  if (nombreColeccion === "sims_instaladas") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/sims/instaladas`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/sims/instaladas`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  return { status: 405, data: { error: "Método no permitido" } };
}

// ---------- Copias de seguridad (solo admin) ----------
// Descarga de todo lo que guarda la APP, en pedazos (Vercel no deja mandar
// respuestas de más de ~4,5 MB): las tablas de la base (Cloudflare D1) y los
// archivos del repo privado de datos (GitHub). Para volver atrás: los archivos
// del repo se restauran desde una copia o desde cualquier versión anterior
// (GitHub guarda todas), y algunas listas de la base se pueden reemplazar
// desde una copia. El resto de la base vuelve atrás con Time Travel de D1.
const BACKUP_APP = ["clientes", "materiales", "credenciales", "consultas-categorias", "config", "guardias", "servicios_emergencia", "vehiculos", "herramientas", "sims", "sims_instaladas", "notas", "visitas_historicas"];
const BACKUP_RESTAURABLES = ["clientes", "materiales", "credenciales", "consultas-categorias", "config", "guardias", "servicios_emergencia", "vehiculos"];
const BACKUP_D1 = {
  partes: "/api/partes", stock_movimientos: "/api/stock", instalaciones: "/api/instalaciones", encuestas: "/api/encuestas",
  comodatos: "/api/comodatos", guardia_historial: "/api/guardia-historial", sims_historial: "/api/sims/historial",
  vehiculos_historial: "/api/vehiculos/historial", herramientas_historial: "/api/herramientas/historial",
  seguimientos: "/api/seguimientos", rendiciones: "/api/rendiciones", presencias_obra: "/api/presencias-obra", tecnicos: "/api/tecnicos",
};
const BACKUP_PEDAZO = 1500000; // caracteres por pedido
const BACKUP_REGISTRO = "backups-registro.json";
const backupRutaValida = (p) => typeof p === "string" && p.length < 300 && !p.includes("..") && !p.startsWith("/") && /^[\w./ -]+$/.test(p) && /\.(json|txt|csv)$/i.test(p);
// Sin hashes ni claves en la copia (los técnicos se pueden volver a poner la clave).
function backupSinSecretos(v) {
  if (Array.isArray(v)) return v.map(backupSinSecretos);
  if (v && typeof v === "object") { const o = {}; Object.entries(v).forEach(([k, x]) => { if (!/password|hash|salt|^token$/i.test(k)) o[k] = x; }); return o; }
  return v;
}
async function manejarBackup(req, res, autorizacion, cuerpo) {
  const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN, GITHUB_DATA_REPO } = process.env;
  const hb = { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" };
  const q = req.query || {};
  res.setHeader("Cache-Control", "no-store");
  const pedazo = (texto) => {
    const partes = Math.max(1, Math.ceil(texto.length / BACKUP_PEDAZO));
    const parte = Math.min(Math.max(0, parseInt(q.parte, 10) || 0), partes - 1);
    return { partes, parte, largo: texto.length, texto: texto.slice(parte * BACKUP_PEDAZO, (parte + 1) * BACKUP_PEDAZO) };
  };
  try {
    if (req.method === "GET" && q.registro) {
      const { data } = await leerArchivoDatos(BACKUP_REGISTRO, []);
      res.status(200).json(Array.isArray(data) ? data.slice(0, 20) : []);
      return;
    }
    if (req.method === "GET" && q.fuentes) {
      // Árbol completo del repo de datos (con tamaños).
      const rt = await fetch(`https://api.github.com/repos/${GITHUB_DATA_REPO}/git/trees/HEAD?recursive=1`, { headers: headersGithubDatos() });
      const arbol = rt.ok ? await rt.json() : { tree: [] };
      const archivos = (arbol.tree || []).filter((x) => x.type === "blob");
      const github = archivos.filter((x) => backupRutaValida(x.path)).map((x) => ({ path: x.path, size: x.size || 0 }));
      const otros = archivos.filter((x) => !backupRutaValida(x.path));
      const { data: registro } = await leerArchivoDatos(BACKUP_REGISTRO, []);
      res.status(200).json({ app: BACKUP_APP, d1: Object.keys(BACKUP_D1), restaurables: BACKUP_RESTAURABLES, github, otros: { cantidad: otros.length, bytes: otros.reduce((s, x) => s + (x.size || 0), 0) }, registro: Array.isArray(registro) ? registro.slice(0, 20) : [] });
      return;
    }
    if (req.method === "GET" && q.fuente) {
      const [tipo, ...resto] = String(q.fuente).split(":");
      const nombre = resto.join(":");
      let texto;
      if (tipo === "app" && BACKUP_APP.includes(nombre)) {
        const r = await manejarColeccionCortada(nombre, "GET", null, BACKEND_NUEVO_URL, hb);
        if (r.status !== 200) throw new Error(`No se pudo leer ${nombre}`);
        texto = JSON.stringify(backupSinSecretos(r.data));
      } else if (tipo === "d1" && BACKUP_D1[nombre]) {
        const r = await fetch(`${BACKEND_NUEVO_URL}${BACKUP_D1[nombre]}`, { headers: hb });
        if (!r.ok) throw new Error(`No se pudo leer ${nombre}`);
        texto = JSON.stringify(backupSinSecretos(await r.json()));
      } else if (tipo === "gh" && backupRutaValida(nombre)) {
        const ref = /^[0-9a-f]{40}$/.test(String(q.ref || "")) ? `?ref=${q.ref}` : "";
        const r = await fetch(urlGithubDatos(nombre) + ref, { headers: headersGithubDatos({ Accept: "application/vnd.github.raw" }) });
        if (r.status === 404) { res.status(404).json({ error: "No existe ese archivo" }); return; }
        if (!r.ok) throw new Error(`No se pudo leer ${nombre}`);
        texto = await r.text();
        if (/\.json$/i.test(nombre)) { try { texto = JSON.stringify(backupSinSecretos(JSON.parse(texto))); } catch (e) { /* va tal cual */ } }
      } else { res.status(400).json({ error: "Fuente desconocida" }); return; }
      res.status(200).json(pedazo(texto));
      return;
    }
    if (req.method === "GET" && q.versiones) {
      const p = String(q.versiones);
      if (!backupRutaValida(p)) { res.status(400).json({ error: "Archivo inválido" }); return; }
      const r = await fetch(`https://api.github.com/repos/${GITHUB_DATA_REPO}/commits?path=${encodeURIComponent(p)}&per_page=100`, { headers: headersGithubDatos() });
      if (!r.ok) throw new Error("No se pudo leer el historial del archivo");
      const l = await r.json();
      res.status(200).json((Array.isArray(l) ? l : []).map((c) => ({ sha: c.sha, fecha: c.commit && c.commit.committer && c.commit.committer.date, mensaje: String((c.commit && c.commit.message) || "").split("\n")[0].slice(0, 160) })));
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    const b = cuerpo && typeof cuerpo === "object" ? cuerpo : {};
    const quien = autorizacion.nombre || "Oficina";
    if (b.accion === "registrar_copia") {
      const entrada = { fecha: new Date().toISOString(), por: quien, archivo: String(b.archivo || "").slice(0, 120), bytes: Math.max(0, Number(b.bytes) || 0), fuentes: Math.max(0, Number(b.fuentes) || 0), errores: (Array.isArray(b.errores) ? b.errores : []).slice(0, 20).map((x) => String(x).slice(0, 120)) };
      for (let i = 0; i < 4; i++) {
        const { data, sha } = await leerArchivoDatos(BACKUP_REGISTRO, []);
        const r = await escribirArchivoDatos(BACKUP_REGISTRO, [entrada, ...(Array.isArray(data) ? data : [])].slice(0, 200), sha, `Copia de seguridad descargada por ${quien}`);
        if (r.ok) { res.status(200).json({ ok: true }); return; }
        if (r.status !== 409 && r.status !== 422) break;
      }
      res.status(502).json({ error: "No se pudo anotar la copia" });
      return;
    }
    if (b.accion === "restaurar_archivo") {
      const p = String(b.path || "");
      if (!backupRutaValida(p) || p === BACKUP_REGISTRO) { res.status(400).json({ error: "Archivo inválido" }); return; }
      let texto;
      if (/^[0-9a-f]{40}$/.test(String(b.ref || ""))) {
        const r = await fetch(urlGithubDatos(p) + `?ref=${b.ref}`, { headers: headersGithubDatos({ Accept: "application/vnd.github.raw" }) });
        if (!r.ok) { res.status(404).json({ error: "No se encontró esa versión" }); return; }
        texto = await r.text();
      } else if (typeof b.texto === "string") {
        // En la copia van sin claves: restaurar estos pisaría las claves con nada.
        if (/^(tecnicos|push-subscripciones)\.json$/.test(p)) { res.status(400).json({ error: "Ese archivo se restaura desde \"Versiones anteriores\" (en la copia van sin las claves)" }); return; }
        texto = b.texto;
      }
      else { res.status(400).json({ error: "Falta el contenido" }); return; }
      if (/\.json$/i.test(p)) { try { JSON.parse(texto); } catch (e) { res.status(400).json({ error: "El contenido de la copia no es un JSON válido" }); return; } }
      for (let i = 0; i < 4; i++) {
        const rMeta = await fetch(urlGithubDatos(p), { headers: headersGithubDatos() });
        const sha = rMeta.ok ? (await rMeta.json()).sha : undefined;
        const r = await fetch(urlGithubDatos(p), { method: "PUT", headers: headersGithubDatos({ "Content-Type": "application/json" }), body: JSON.stringify({ message: `Restaurado ${p} ${b.ref ? "a la versión " + String(b.ref).slice(0, 7) : "desde una copia de seguridad"} (por ${quien})`, content: Buffer.from(texto, "utf-8").toString("base64"), sha }) });
        if (r.ok) { res.status(200).json({ ok: true }); return; }
        if (r.status !== 409 && r.status !== 422) break;
      }
      res.status(502).json({ error: "No se pudo restaurar el archivo" });
      return;
    }
    if (b.accion === "restaurar_coleccion") {
      const nombre = String(b.coleccion || "");
      if (!BACKUP_RESTAURABLES.includes(nombre)) { res.status(400).json({ error: "Esa parte de la base no se restaura desde acá (usar la vuelta atrás de la base)" }); return; }
      const data = b.data;
      if (nombre === "config" || nombre === "guardias" ? !data || typeof data !== "object" || Array.isArray(data) : !Array.isArray(data)) { res.status(400).json({ error: "La copia no tiene el formato esperado" }); return; }
      if (Array.isArray(data) && !data.length) { res.status(400).json({ error: "La copia de esa lista está vacía: no se restaura" }); return; }
      if (nombre === "clientes") {
        // Exacto: se vacía y se carga la copia; si falla, se vuelve a poner lo que había.
        const rPrev = await fetch(`${BACKEND_NUEVO_URL}/api/clientes`, { headers: hb });
        if (!rPrev.ok) throw new Error("No se pudo leer la lista actual");
        const previas = await rPrev.json();
        const rDel = await fetch(`${BACKEND_NUEVO_URL}/api/clientes`, { method: "DELETE", headers: hb });
        if (!rDel.ok) throw new Error("No se pudo vaciar la lista actual");
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/clientes`, { method: "POST", headers: hb, body: JSON.stringify(data) });
        if (!r.ok) {
          if (Array.isArray(previas) && previas.length) await fetch(`${BACKEND_NUEVO_URL}/api/clientes`, { method: "POST", headers: hb, body: JSON.stringify(previas) }).catch(() => {});
          res.status(502).json({ error: "No se pudo cargar la copia — quedó lo que había antes" });
          return;
        }
        res.status(200).json({ ok: true, count: data.length });
        return;
      }
      const r = await manejarColeccionCortada(nombre, "POST", data, BACKEND_NUEVO_URL, hb);
      res.status(r.status).json(r.data);
      return;
    }
    res.status(400).json({ error: "Acción inválida" });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
}

// ---------- Stock de artículos (catálogo, saldos por ubicación, conciliación, pedidos) ----------
// Se guarda en el repo de datos: stock/catalogo.json, stock/saldos.json,
// stock/movimientos-AAAA-MM.json y stock/conciliacion.json. Cada cambio de
// saldos se escribe releyendo el archivo (si otro lo cambió en el medio, se
// reintenta) y queda un movimiento con quién, cuándo y por qué.
const STOCK_CAT = "stock/catalogo.json", STOCK_SAL = "stock/saldos.json", STOCK_CONC = "stock/conciliacion.json";
const stockMovRuta = (d) => `stock/movimientos-${(d || new Date().toISOString()).slice(0, 7)}.json`;
async function stockActualizar(ruta, porDefecto, cambiar, mensaje) {
  for (let i = 0; i < 5; i++) {
    const { data, sha, corrupto } = await leerArchivoDatos(ruta, porDefecto);
    // Nunca escribir sobre un archivo que existe pero no se pudo leer: se perderían los datos.
    if (corrupto) return { error: `El archivo ${ruta} no se pudo leer. No se guardó nada para no perder datos: hay que restaurarlo desde una copia de seguridad.`, status: 500 };
    const res = cambiar(data && typeof data === "object" ? data : porDefecto);
    if (res && res.error) return res;
    // Saldo y movimiento en la misma escritura: los movimientos quedan en «movsPend» del archivo de
    // saldos hasta que se pasan al historial del mes (si eso falla, se pasan en la próxima operación).
    if (ruta === STOCK_SAL && Array.isArray(res.movs) && res.movs.length) res.data = { ...res.data, movsPend: [...((res.data && res.data.movsPend) || []), ...res.movs].slice(-2000) };
    const r = await escribirArchivoDatos(ruta, res.data, sha, mensaje);
    if (r.ok) return res;
    if (r.status !== 409 && r.status !== 422) break;
  }
  return { error: "No se pudo guardar (probá de nuevo)", status: 502 };
}
// Lo que se aprende de cada escaneo: la forma de los N° de serie de cada artículo y de qué
// proveedores viene (el código de 4 dígitos de la etiqueta de SAT).
async function stockAprender(movs, quien) {
  const S = require("../stock-utils.js");
  const utiles = (movs || []).filter((m) => m && m.c && ((m.unidades && m.unidades.length) || m.prov));
  if (!utiles.length) return;
  await stockActualizar(STOCK_CAT, { articulos: {} }, (c2) => {
    const arts = { ...(c2.articulos || {}) }, provVistos = { ...(c2.provVistos || {}) };
    let cambio = false;
    utiles.forEach((m) => {
      const art = arts[m.c]; if (!art) return;
      const n = { ...art };
      if (art.tipo === "unidad" && m.unidades && m.unidades.length) n.formatos = m.unidades.reduce((acc, t) => S.agregarFormato(acc, t), art.formatos || []);
      if (m.prov) {
        n.provCodigos = [...new Set([...(art.provCodigos || []), m.prov])].slice(-10);
        if (!n.prov && S.nombreProveedor(c2, m.prov)) n.prov = S.nombreProveedor(c2, m.prov);
        if (!S.nombreProveedor(c2, m.prov)) provVistos[m.prov] = (provVistos[m.prov] || 0) + 1;
      }
      if (JSON.stringify(n) !== JSON.stringify(art)) { arts[m.c] = n; cambio = true; }
    });
    if (JSON.stringify(provVistos) !== JSON.stringify(c2.provVistos || {})) cambio = true;
    return cambio ? { data: { ...c2, articulos: arts, provVistos } } : { error: "sin cambios" };
  }, `Stock: aprendió formatos y proveedores (por ${quien})`).catch(() => {});
}
async function stockRegistrarMovimientos(movs, mensaje) {
  if (!movs.length) return true;
  const porMes = {};
  movs.forEach((m) => { (porMes[stockMovRuta(m.fecha)] = porMes[stockMovRuta(m.fecha)] || []).push(m); });
  let ok = true;
  for (const [ruta, lista] of Object.entries(porMes)) {
    const r = await stockActualizar(ruta, [], (d) => {
      const actual = Array.isArray(d) ? d : [], ya = new Set(actual.map((m) => m.id));
      const nuevos = lista.filter((m) => !ya.has(m.id)); // si se reintenta, no se duplica
      return nuevos.length ? { data: [...actual, ...nuevos] } : { error: "ya estaban", status: 200, yaEstaban: true };
    }, mensaje);
    if (r.error && !r.yaEstaban) ok = false;
  }
  return ok;
}
// Pasa los movimientos al historial del mes y los saca de «movsPend».
async function stockConfirmarMovs(movs, mensaje) {
  if (!movs || !movs.length) return true;
  const ok = await stockRegistrarMovimientos(movs, mensaje);
  if (!ok) return false;
  const ids = new Set(movs.map((m) => m.id));
  await stockActualizar(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} }, (sal) => {
    const pend = sal.movsPend || [];
    if (!pend.some((m) => ids.has(m.id))) return { error: "sin cambios", status: 200 };
    return { data: { ...sal, movsPend: pend.filter((m) => !ids.has(m.id)) } };
  }, "Stock: movimientos pasados al historial").catch(() => {});
  return true;
}
async function manejarStock(req, res, autorizacion, cuerpo) {
  const S = require("../stock-utils.js");
  const q = req.query || {};
  const quien = autorizacion.nombre || "Oficina";
  res.setHeader("Cache-Control", "no-store");
  const esAdmin = autorizacion.rol === "admin";
  let esResp = esAdmin, tecnicosGuardados = null;
  const tecnicos = async () => (tecnicosGuardados = tecnicosGuardados || (await leerTecnicosGuardados().catch(() => [])));
  if (!esAdmin) { const t = (await tecnicos()).find((x) => x.nombre === autorizacion.nombre); esResp = !!(t && t.permisos && (t.permisos.stock_responsable || t.permisos.admin)); }
  const SOLO_ADMIN = ["baja_serie", "salud_revisado", "configurar_varios", "proveedores", "marcar_oficina", "importar_catalogo", "configurar", "saldo_inicial", "ajustar", "conc_marcar", "conc_reactivar", "conc_corrida"];
  try {
    if (req.method === "GET" && q.serie) {
      // Ficha de un equipo por su N° de serie: dónde está, a qué cliente fue y su garantía.
      const t = S.limpiarCodigo(q.serie);
      const [cat, sal] = await Promise.all([leerArchivoDatos(STOCK_CAT, { articulos: {} }), leerArchivoDatos(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} })]);
      const u = ((sal.data || {}).unidades || {})[t];
      if (!u) { res.status(404).json({ error: `El N° de serie ${t} no está registrado` }); return; }
      const a = ((cat.data || {}).articulos || {})[u.c] || {};
      res.status(200).json({ serie: t, unidad: u, articulo: { c: u.c, d: a.d || u.c }, proveedor: S.nombreProveedor(cat.data, u.prov), instalacion: S.instalacionDeUnidad(u) });
      return;
    }
    if (req.method === "GET" && q.mio) {
      // Lo que tiene el técnico que pregunta (y lo que le llega o devolvió).
      const [cat, sal] = await Promise.all([leerArchivoDatos(STOCK_CAT, { articulos: {} }), leerArchivoDatos(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} })]);
      const yo = S.stockDePersona(sal.data, quien), arts = (cat.data && cat.data.articulos) || {}, sub = {};
      const codigos = new Set([...Object.keys(yo.tiene), ...yo.unidades.map((u) => u.c), ...[...yo.porRecibir, ...yo.devueltos].flatMap((e) => e.items.map((x) => x.c))]);
      codigos.forEach((c) => { const a = arts[c]; if (a) sub[c] = { c, d: a.d, tipo: a.tipo, medida: a.medida || "unidades", alias: a.alias || [], formatos: a.formatos || [] }; });
      const porAprobar = (((sal.data || {}).aprobar) || []).filter((x) => x.por === quien);
      res.status(200).json({ nombre: quien, responsable: esResp, ...yo, articulos: sub, porAprobar });
      return;
    }
    if (req.method === "GET" && q.catalogo_basico) {
      // Para escanear lo que se retira de un cliente (cualquier técnico): solo lo necesario de cada artículo.
      const { data: cat } = await leerArchivoDatos(STOCK_CAT, { articulos: {} });
      const arts = {};
      Object.values((cat && cat.articulos) || {}).forEach((a) => { if (!/^(sim|herramienta|no)$/.test(a.tipo)) arts[a.c] = { c: a.c, d: a.d, tipo: a.tipo, medida: a.medida || "unidades", alias: a.alias || [], formatos: a.formatos || [] }; });
      res.status(200).json({ articulos: arts, proveedores: (cat && cat.proveedores) || {} });
      return;
    }
    if (!esResp) {
      const accion = cuerpo && cuerpo.accion;
      if (req.method !== "POST" || !["confirmar_envio", "devolver", "leer_codigo_foto", "consumo_parte"].includes(accion)) { res.status(403).json({ error: "Necesitás el permiso «Responsable de stock»" }); return; }
    }
    if (req.method === "POST" && cuerpo && !esAdmin && SOLO_ADMIN.includes(cuerpo.accion)) { res.status(403).json({ error: "Solo desde el panel de administración" }); return; }
    if (req.method === "GET") {
      if (q.movimientos) {
        if (!/^\d{4}-\d{2}$/.test(String(q.movimientos))) { res.status(400).json({ error: "Mes inválido" }); return; }
        const [{ data }, { data: sal0 }] = await Promise.all([leerArchivoDatos(stockMovRuta(q.movimientos + "-01"), []), leerArchivoDatos(STOCK_SAL, {})]);
        const lista = Array.isArray(data) ? data : [], ya = new Set(lista.map((m) => m.id));
        const pend = ((sal0 && sal0.movsPend) || []).filter((m) => String(m.fecha || "").slice(0, 7) === q.movimientos && !ya.has(m.id));
        res.status(200).json([...lista, ...pend]);
        return;
      }
      const [cat, sal, conc] = await Promise.all([leerArchivoDatos(STOCK_CAT, { articulos: {} }), leerArchivoDatos(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} }), leerArchivoDatos(STOCK_CONC, { marcas: [], corridas: [] })]);
      if (cat.corrupto || sal.corrupto) { res.status(500).json({ error: "Un archivo del stock no se pudo leer: hay que restaurarlo desde una copia de seguridad." }); return; }
      res.status(200).json({ catalogo: cat.data, saldos: sal.data, conciliacion: { marcas: (conc.data && conc.data.marcas) || [], corridas: ((conc.data && conc.data.corridas) || []).slice(0, 24) } });
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    const b = cuerpo && typeof cuerpo === "object" ? cuerpo : {};
    const ahora = new Date().toISOString();
    const responder = (r, extra) => { if (r.error) res.status(r.status || 400).json({ error: r.error }); else res.status(200).json({ ok: true, ...(extra || {}), ...(r.respuesta || {}) }); };
    // Movimientos que quedaron sin pasar al historial (falló esa segunda escritura): se pasan ahora.
    try {
      const { data: sal0 } = await leerArchivoDatos(STOCK_SAL, {});
      const pend = (sal0 && sal0.movsPend) || [];
      if (pend.length) await stockConfirmarMovs(pend, "Stock: movimientos pendientes pasados al historial");
    } catch (e) { /* se reintenta en la próxima */ }

    if (b.accion === "consumo_parte") {
      // Lo que el técnico cargó en el parte: lo de su stock pasa al cliente; lo que no figuraba queda
      // para que el responsable de stock lo apruebe; lo retirado (escaneado) entra a su stock.
      const opId = String(b.op_id || "").slice(0, 80), cliente = String(b.cliente || "").replace(/\s+/g, " ").trim().slice(0, 120);
      if (!cliente) { res.status(400).json({ error: "Falta el cliente del parte" }); return; }
      const parte = String(b.parte || "").slice(0, 40), presupuesto = String(b.presupuesto || "").trim().slice(0, 30);
      const destino = `${b.comodato ? "com" : "cli"}:${cliente}`, tec = `tec:${quien}`;
      const { data: cat } = await leerArchivoDatos(STOCK_CAT, { articulos: {} });
      let movsTodos = [], resumen = null, duplicado = false;
      const r = await stockActualizar(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} }, (sal) => {
        if (opId && (sal.ops || []).includes(opId)) { duplicado = true; return { error: "duplicado", status: 200 }; }
        let s2 = sal;
        const movs = [], aprobar = [], instalados = [], retirados = [];
        const motivo = `Parte${parte ? " N° " + parte : ""}`;
        // 1) Usados de Mi stock: de a uno, así lo que no se pueda (ya no lo tiene) queda para aprobar.
        (Array.isArray(b.usados) ? b.usados.slice(0, 200) : []).forEach((x) => {
          const it = { c: S.codigoArticulo(x.c), cant: Number(x.cant) || 0, unidades: x.unidades || [] };
          const m = S.moverStock(s2, [it], { tipo: "instalado_parte", de: tec, a: destino, por: quien, fecha: ahora, motivo, presupuesto }, cat);
          if (m.error) aprobar.push({ c: it.c, cant: it.cant, unidades: it.unidades, texto: ((cat.articulos || {})[it.c] || {}).d || it.c, error: m.error });
          else { s2 = m.saldos; movs.push(...m.movs); instalados.push(it.c); }
        });
        // 2) Retirados escaneados: del cliente al técnico.
        (Array.isArray(b.retirados) ? b.retirados.slice(0, 200) : []).forEach((x) => {
          const it = { c: S.codigoArticulo(x.c), cant: Number(x.cant) || 0, unidades: x.unidades || [] };
          const m = S.moverStock(s2, [it], { tipo: "retirado_parte", de: destino, a: tec, por: quien, fecha: ahora, motivo: `${motivo}${x.fallado ? " · fallado: " + String(x.falla || "").slice(0, 120) : ""}`, deFlexible: true }, cat);
          if (!m.error) { s2 = m.saldos; movs.push(...m.movs); retirados.push(it.c); }
        });
        // 3) Lo que no estaba en su stock: para aprobar.
        if (sal.inicializado) (Array.isArray(b.sinStock) ? b.sinStock.slice(0, 200) : []).forEach((x) => aprobar.push({ c: S.codigoArticulo(x.c) || "", cant: Number(x.cant) || 1, unidades: x.unidades || [], texto: String(x.texto || "").slice(0, 160) }));
        const nuevos = aprobar.map((x, i) => ({ id: `${Date.now().toString(36)}-a${i}`, fecha: ahora, por: quien, parte, cliente, destino, presupuesto, ...x }));
        s2 = { ...s2, aprobar: [...nuevos, ...(sal.aprobar || [])].slice(0, 1000) };
        if (opId) s2.ops = [opId, ...(sal.ops || [])].slice(0, 300);
        movsTodos = movs;
        resumen = { instalados: instalados.length, retirados: retirados.length, paraAprobar: nuevos.length };
        return { data: s2, respuesta: resumen, movs };
      }, `Stock: materiales del parte ${parte} (por ${quien})`);
      if (duplicado) { res.status(200).json({ ok: true, duplicado: true }); return; }
      if (!r.error) { await stockConfirmarMovs(movsTodos, `Stock: movimientos del parte ${parte} (por ${quien})`); await stockAprender(movsTodos, quien); }
      if (!r.error && resumen && resumen.paraAprobar) {
        try {
          const { enviarASeleccionados } = require("../lib/push-sender");
          const resp = (await tecnicos()).filter((t) => t.permisos && t.permisos.stock_responsable).map((t) => t.nombre);
          if (resp.length) await enviarASeleccionados(resp, { titulo: "Materiales para aprobar", cuerpo: `${quien} cargó en un parte ${resumen.paraAprobar} material(es) que no estaban en su stock (${cliente}).`, url: "/" });
        } catch (e) { /* opcional */ }
      }
      responder(r);
      return;
    }
    if (b.accion === "aprobar_consumo") {
      // El responsable decide de dónde sale lo que el técnico usó y no estaba en su stock.
      const decision = b.decision === "rechazar" ? "rechazar" : "aprobar";
      const de = String(b.de || "ninguno"), motivo = String(b.motivo || "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (decision === "aprobar" && de !== "ninguno" && !/^(dep|tec:.{1,60}|veh:.{1,60})$/.test(de)) { res.status(400).json({ error: "Origen inválido" }); return; }
      if (decision === "rechazar" && !motivo) { res.status(400).json({ error: "Falta el motivo del rechazo" }); return; }
      const { data: cat } = await leerArchivoDatos(STOCK_CAT, { articulos: {} });
      let movs = [];
      const r = await stockActualizar(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} }, (sal) => {
        const x = (sal.aprobar || []).find((y) => y.id === b.id);
        if (!x) return { error: "Ya se resolvió o no existe", status: 409 };
        let s2 = sal;
        movs = [];
        const c = S.codigoArticulo(b.c || x.c), cant = Number(b.cant) > 0 ? Number(b.cant) : x.cant;
        if (decision === "aprobar" && de !== "ninguno") {
          if (!c) return { error: "Elegí de qué artículo es", status: 400 };
          const m = S.moverStock(sal, [{ c, cant, unidades: Array.isArray(b.unidades) ? b.unidades : x.unidades }], { tipo: "instalado_parte", de, a: x.destino, por: quien, fecha: ahora, motivo: `Aprobado: parte${x.parte ? " N° " + x.parte : ""} de ${x.por}${motivo ? " · " + motivo : ""}`, presupuesto: x.presupuesto }, cat);
          if (m.error) return { error: m.error, status: 409 };
          s2 = m.saldos; movs = m.movs;
        }
        const cerrado = { ...x, decision, de: decision === "aprobar" ? de : "", c, cant, resuelto: ahora, resuelto_por: quien, ...(motivo ? { motivo_resolucion: motivo } : {}) };
        s2 = { ...s2, aprobar: (sal.aprobar || []).filter((y) => y.id !== b.id), aprobados: [cerrado, ...(sal.aprobados || [])].slice(0, 300) };
        return { data: s2, respuesta: { resuelto: cerrado }, movs };
      }, `Stock: ${decision === "aprobar" ? "aprobó" : "rechazó"} material de un parte (por ${quien})`);
      if (!r.error) await stockConfirmarMovs(movs, `Stock: material de parte aprobado (por ${quien})`);
      if (!r.error && decision === "rechazar" && r.respuesta && r.respuesta.resuelto) {
        try { const { enviarASeleccionados } = require("../lib/push-sender"); await enviarASeleccionados([r.respuesta.resuelto.por], { titulo: "Material de un parte rechazado", cuerpo: `${r.respuesta.resuelto.texto || r.respuesta.resuelto.c} (${r.respuesta.resuelto.cliente}): ${motivo}`.slice(0, 200), url: "/" }); } catch (e) { /* opcional */ }
      }
      responder(r);
      return;
    }
    if (b.accion === "baja_serie") {
      // Un equipo identificado que ya no está (perdido, robado, roto, vendido sin registrar): sale con su N°.
      const t = S.limpiarCodigo(b.serie), motivo = String(b.motivo || "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (!t || !motivo) { res.status(400).json({ error: "Falta el N° de serie o el motivo" }); return; }
      let movs = [];
      const r = await stockActualizar(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} }, (sal) => {
        const u = (sal.unidades || {})[t];
        if (!u || !u.u || u.u === "baja") return { error: "Ese N° de serie no está registrado en ningún lugar", status: 404 };
        if (/^cam:/.test(u.u)) return { error: "Está en camino: primero que se confirme el envío", status: 409 };
        const hay = ((sal.ubic || {})[u.u] || {})[u.c] || 0;
        // Si la cantidad ya no lo contaba (más N° que cantidad), solo se da de baja el N°.
        const conSerie = S.seriesEn(sal, u.u, u.c).length;
        const m = { id: `${Date.now().toString(36)}-b`, fecha: ahora, por: quien, tipo: "baja", c: u.c, cant: hay >= conSerie && hay > 0 ? 1 : 0, de: u.u, unidades: [t], motivo };
        movs = [m];
        let s2 = S.aplicarMovimiento(sal, m);
        return { data: s2, respuesta: { de: u.u }, movs };
      }, `Stock: baja del N° ${t} (por ${quien}): ${motivo}`);
      if (!r.error) await stockConfirmarMovs(movs, `Stock: baja de un N° de serie (por ${quien})`);
      responder(r);
      return;
    }
    if (b.accion === "salud_revisado") {
      const ids = new Set((Array.isArray(b.ids) ? b.ids : []).map(String));
      const r = await stockActualizar(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} }, (sal) => ({ data: { ...sal, revisar: (sal.revisar || []).filter((x) => !ids.has(String(x.id))) }, respuesta: {} }), `Stock: retiros revisados (por ${quien})`);
      responder(r);
      return;
    }

    if (b.accion === "importar_catalogo") {
      const lista = Array.isArray(b.articulos) ? b.articulos.slice(0, 20000) : [];
      if (!lista.length) { res.status(400).json({ error: "El listado no tiene artículos" }); return; }
      const r = await stockActualizar(STOCK_CAT, { articulos: {} }, (cat) => {
        const arts = { ...(cat.articulos || {}) };
        let nuevos = 0, actualizados = 0, configurados = 0;
        lista.forEach((x) => {
          const c = S.codigoArticulo(x && x.c);
          if (!c || !/^[\w.-]{1,20}$/.test(c)) return;
          const d = String(x.d || "").slice(0, 160);
          const previo = arts[c];
          const a = previo ? { ...previo } : { c, d, tipo: S.clasificarArticulo(d), medida: S.medidaArticulo(d), min: null, pedir: null, prov: "", alias: [] };
          if (previo) actualizados++; else nuevos++;
          if (d) a.d = d;
          if (!b.revisada) { a.precio = Number(x.precio) || 0; a.moneda = x.moneda || a.moneda || ""; a.baja = !!x.baja; }
          if (b.revisada) {
            let cambio = false;
            if (S.STOCK_TIPOS[x.tipo]) { a.tipo = x.tipo; cambio = true; }
            if (x.medida === "metros" || x.medida === "unidades") { a.medida = x.medida; cambio = true; }
            if (x.min != null && Number.isFinite(Number(x.min))) { a.min = Math.max(0, Number(x.min)); cambio = true; }
            if (x.pedir != null && Number.isFinite(Number(x.pedir))) { a.pedir = Math.max(0, Number(x.pedir)); cambio = true; }
            if (x.prov) { a.prov = String(x.prov).slice(0, 60); cambio = true; }
            if (cambio) configurados++;
          }
          arts[c] = a;
        });
        return { data: { ...cat, articulos: arts, actualizado: ahora }, respuesta: { nuevos, actualizados, configurados, total: Object.keys(arts).length } };
      }, `Stock: catálogo actualizado desde ${b.revisada ? "la planilla revisada" : "el listado de Oficina"} (por ${quien})`);
      responder(r);
      return;
    }
    if (b.accion === "proveedores") {
      // Tabla código de proveedor (los 4 dígitos de la etiqueta de SAT) -> nombre.
      const lista = Array.isArray(b.lista) ? b.lista.slice(0, 500) : [];
      const mapa = {};
      for (const x of lista) {
        const c = S.codigoProveedor(x && x.codigo), n = String((x && x.nombre) || "").replace(/\s+/g, " ").trim().slice(0, 60);
        if (!c || !n) continue;
        mapa[c] = n;
      }
      const r = await stockActualizar(STOCK_CAT, { articulos: {} }, (cat) => {
        const provVistos = { ...(cat.provVistos || {}) };
        Object.keys(mapa).forEach((c) => delete provVistos[c]);
        // Los artículos que ya se vieron con ese código y no tienen proveedor, lo toman.
        const arts = { ...(cat.articulos || {}) };
        let completados = 0;
        Object.values(arts).forEach((a) => { if (!a.prov && (a.provCodigos || []).some((c) => mapa[c])) { arts[a.c] = { ...a, prov: mapa[(a.provCodigos || []).find((c) => mapa[c])] }; completados++; } });
        return { data: { ...cat, articulos: arts, proveedores: mapa, provVistos }, respuesta: { proveedores: mapa, completados } };
      }, `Stock: tabla de proveedores (por ${quien})`);
      responder(r);
      return;
    }
    if (b.accion === "marcar_oficina") {
      // Movimientos ya pasados al sistema de Oficina (para no pasarlos dos veces).
      if (!/^\d{4}-\d{2}$/.test(String(b.mes || ""))) { res.status(400).json({ error: "Mes inválido" }); return; }
      const ids = new Set((Array.isArray(b.ids) ? b.ids : []).map(String));
      let marcados = 0;
      const r = await stockActualizar(stockMovRuta(b.mes + "-01"), [], (lista) => {
        marcados = 0;
        const nueva = (Array.isArray(lista) ? lista : []).map((m) => { if (!ids.has(String(m.id))) return m; marcados++; return b.desmarcar ? (({ oficina, ...resto }) => resto)(m) : { ...m, oficina: ahora, oficina_por: quien }; });
        return { data: nueva, respuesta: { marcados } };
      }, `Stock: ${marcados} movimiento(s) ${b.desmarcar ? "desmarcados" : "pasados a Oficina"} (por ${quien})`);
      responder(r);
      return;
    }
    if (b.accion === "configurar_varios") {
      // Cambia el tipo de muchos artículos juntos (ej. todos los sensores a «Equipo con N° de serie»).
      const codigos = new Set((Array.isArray(b.codigos) ? b.codigos.slice(0, 5000) : []).map(S.codigoArticulo));
      if (!S.STOCK_TIPOS[b.tipo] || !codigos.size) { res.status(400).json({ error: "Faltan los artículos o el tipo" }); return; }
      const r = await stockActualizar(STOCK_CAT, { articulos: {} }, (cat) => {
        const arts = { ...(cat.articulos || {}) };
        let cambiados = 0;
        codigos.forEach((c) => { if (arts[c] && arts[c].tipo !== b.tipo) { arts[c] = { ...arts[c], tipo: b.tipo }; cambiados++; } });
        return { data: { ...cat, articulos: arts }, respuesta: { cambiados } };
      }, `Stock: ${codigos.size} artículo(s) pasados a «${S.STOCK_TIPOS[b.tipo]}» (por ${quien})`);
      responder(r);
      return;
    }
    if (b.accion === "configurar") {
      const c = S.codigoArticulo(b.c), campos = b.campos && typeof b.campos === "object" ? b.campos : {};
      const r = await stockActualizar(STOCK_CAT, { articulos: {} }, (cat) => {
        const a = cat.articulos && cat.articulos[c];
        if (!a) return { error: "No existe ese artículo", status: 404 };
        const n = { ...a };
        if ("tipo" in campos && S.STOCK_TIPOS[campos.tipo]) n.tipo = campos.tipo;
        if ("medida" in campos && /^(metros|unidades)$/.test(campos.medida)) n.medida = campos.medida;
        ["min", "pedir"].forEach((k) => { if (k in campos) n[k] = campos[k] === "" || campos[k] == null ? null : Math.max(0, Number(campos[k]) || 0); });
        if ("prov" in campos) n.prov = String(campos.prov || "").slice(0, 60);
        return { data: { ...cat, articulos: { ...cat.articulos, [c]: n } }, respuesta: { articulo: n } };
      }, `Stock: configuró el artículo ${c} (por ${quien})`);
      responder(r);
      return;
    }
    if (b.accion === "saldo_inicial") {
      // Arranque: el depósito y el comodato de la APP toman lo que dice el listado de Oficina.
      const items = Array.isArray(b.items) ? b.items : [];
      const { data: cat } = await leerArchivoDatos(STOCK_CAT, { articulos: {} });
      const arts = (cat && cat.articulos) || {};
      const controla = (c) => arts[c] && !["sim", "herramienta", "no"].includes(arts[c].tipo);
      let movs = [];
      const r = await stockActualizar(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} }, (sal) => {
        if (sal.inicializado && !b.forzar) return { error: `El stock ya se inicializó el ${String(sal.inicializado).slice(0, 10)}. Para corregir diferencias usá la conciliación.`, status: 409 };
        const nuevo = { ...sal, ubic: { ...(sal.ubic || {}) }, inicializado: ahora, unidades: sal.unidades || {}, pedidos: sal.pedidos || {} };
        nuevo.ubic.dep = {}; delete nuevo.ubic["com:Sin asignar"];
        movs = [];
        items.forEach((x) => {
          const c = S.codigoArticulo(x.c);
          if (!controla(c)) return;
          const dep = Number(x.dep) || 0, com = Number(x.com) || 0;
          if (dep) { nuevo.ubic.dep[c] = dep; movs.push({ id: `${Date.now().toString(36)}-${movs.length}`, fecha: ahora, por: quien, tipo: "inicial", c, cant: dep, a: "dep", motivo: "Saldo inicial desde el listado de Oficina" }); }
          if (com) { (nuevo.ubic["com:Sin asignar"] = nuevo.ubic["com:Sin asignar"] || {})[c] = com; movs.push({ id: `${Date.now().toString(36)}-${movs.length}`, fecha: ahora, por: quien, tipo: "inicial", c, cant: com, a: "com:Sin asignar", motivo: "Comodato inicial desde el listado de Oficina (falta asignar el cliente)" }); }
        });
        return { data: nuevo, respuesta: { articulos: new Set(movs.map((m) => m.c)).size }, movs };
      }, `Stock: saldo inicial desde el listado de Oficina (por ${quien})`);
      if (!r.error) await stockConfirmarMovs(movs, `Stock: movimientos del saldo inicial (por ${quien})`);
      responder(r);
      return;
    }
    if (b.accion === "ajustar") {
      // Deja la cantidad de un artículo en una ubicación como se indica (inventario o conciliación).
      const c = S.codigoArticulo(b.c), ubic = String(b.ubic || "dep").slice(0, 80), motivo = String(b.motivo || "").trim().slice(0, 200);
      if (!c) { res.status(400).json({ error: "Falta el artículo" }); return; }
      if (!/^(dep|gar|tec:.+|veh:.+|cli:.+|com:.+)$/.test(ubic)) { res.status(400).json({ error: "Ubicación inválida" }); return; }
      if (!motivo) { res.status(400).json({ error: "Falta el motivo del ajuste" }); return; }
      const cantidad = Number(b.cantidad);
      if (!Number.isFinite(cantidad) || cantidad < 0) { res.status(400).json({ error: "Cantidad inválida" }); return; }
      let mov = null;
      const r = await stockActualizar(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} }, (sal) => {
        const antes = ((sal.ubic || {})[ubic] || {})[c] || 0, dif = Math.round((cantidad - antes) * 1000) / 1000;
        if (!dif) return { data: sal, respuesta: { sinCambios: true } };
        mov = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, fecha: ahora, por: quien, tipo: "ajuste", c, cant: Math.abs(dif), ...(dif > 0 ? { a: ubic } : { de: ubic }), motivo, antes, despues: cantidad };
        // No se puede dejar menos cantidad que equipos con N° de serie registrados ahí.
        const series = S.seriesEn(sal, ubic, c);
        if (cantidad < series.length) return { error: `En ${S.nombreUbicacion(ubic)} hay ${series.length} equipos con N° de serie (${series.slice(0, 5).join(", ")}${series.length > 5 ? "…" : ""}). Primero dá de baja los N° que ya no están (Stock › Salud), después ajustá.`, status: 409 };
        const nuevo = S.aplicarMovimiento(sal, mov);
        return { data: nuevo, respuesta: { antes, despues: cantidad }, movs: [mov] };
      }, `Stock: ajuste de ${c} en ${ubic} (por ${quien}): ${motivo}`);
      if (!r.error && mov) await stockConfirmarMovs([mov], `Stock: movimiento de ajuste (por ${quien})`);
      responder(r);
      return;
    }
    if (b.accion === "marcar_pedido" || b.accion === "quitar_pedido") {
      const items = (Array.isArray(b.items) ? b.items : []).map((x) => ({ c: S.codigoArticulo(x.c), cantidad: Math.max(0, Number(x.cantidad) || 0) })).filter((x) => x.c);
      if (!items.length) { res.status(400).json({ error: "No hay artículos" }); return; }
      const r = await stockActualizar(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} }, (sal) => {
        const pedidos = { ...(sal.pedidos || {}) };
        items.forEach((x) => { if (b.accion === "marcar_pedido") pedidos[x.c] = { fecha: ahora, cantidad: x.cantidad, por: quien, proveedor: String(b.proveedor || "").slice(0, 60) }; else delete pedidos[x.c]; });
        return { data: { ...sal, pedidos }, respuesta: { pedidos } };
      }, `Stock: ${b.accion === "marcar_pedido" ? "pidió" : "sacó de pedidos"} ${items.length} artículo(s) (por ${quien})`);
      responder(r);
      return;
    }
    if (b.accion === "conc_marcar" || b.accion === "conc_reactivar" || b.accion === "conc_corrida") {
      const r = await stockActualizar(STOCK_CONC, { marcas: [], corridas: [] }, (conc) => {
        let marcas = Array.isArray(conc.marcas) ? conc.marcas : [], corridas = Array.isArray(conc.corridas) ? conc.corridas : [];
        const items = (Array.isArray(b.items) ? b.items : []).map((x) => ({ codigo: S.codigoArticulo(x.codigo), categoria: String(x.categoria || "").slice(0, 40) })).filter((x) => x.codigo && x.categoria);
        const clave = (x) => `${x.categoria}|${x.codigo}`, set = new Set(items.map(clave));
        if (b.accion === "conc_marcar") {
          if (!items.length) return { error: "No hay diferencias para marcar" };
          const estado = b.estado === "ignorada" ? "ignorada" : "resuelta";
          marcas = [...items.map((x) => ({ ...x, estado, motivo: String(b.motivo || "").slice(0, 200), por: quien, fecha: ahora })), ...marcas.filter((m) => !set.has(clave(m)))].slice(0, 5000);
        } else if (b.accion === "conc_reactivar") marcas = marcas.filter((m) => !set.has(clave(m)));
        else {
          const c = { id: String(b.id || "").slice(0, 40) || Date.now().toString(36), fecha: ahora, por: quien, archivo: String(b.archivo || "").slice(0, 120), revisados: Number(b.revisados) || 0, coinciden: Number(b.coinciden) || 0, numeros: b.numeros && typeof b.numeros === "object" ? b.numeros : {} };
          corridas = [c, ...corridas.filter((x) => x.id !== c.id)].slice(0, 36);
        }
        return { data: { marcas, corridas }, respuesta: { marcas, corridas: corridas.slice(0, 24) } };
      }, `Stock: conciliación con Oficina (por ${quien})`);
      responder(r);
      return;
    }
    if (b.accion === "leer_codigo_foto") {
      // El lector no pudo con el código de barras (borroso, gastado): se leen los números impresos.
      const { GEMINI_API_KEY } = process.env;
      if (!GEMINI_API_KEY) { res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel" }); return; }
      const imagen = String(b.imagen || "").replace(/^data:[^,]*,/, "");
      if (imagen.length < 1000) { res.status(400).json({ error: "Falta la foto" }); return; }
      if (imagen.length > 4500000) { res.status(400).json({ error: "La foto es demasiado grande" }); return; }
      const r2 = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: imagen } }, { text: PROMPT_LEER_CODIGOS }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      });
      const d = await r2.json().catch(() => ({}));
      if (!r2.ok) { res.status(r2.status === 429 ? 429 : 502).json({ error: r2.status === 429 ? "Se alcanzó el límite de consultas a la IA por ahora: escribilo a mano." : "No se pudo leer la foto" }); return; }
      const texto = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []).map((p) => p.text || "").join("");
      let resultado = null;
      try { resultado = JSON.parse(texto.replace(/^```(json)?/i, "").replace(/```\s*$/, "").trim()); } catch (e) { resultado = null; }
      const lista = Array.isArray(resultado) ? resultado : resultado && Array.isArray(resultado.codigos) ? resultado.codigos : [];
      const vistos = new Set();
      const codigos = lista.map((x) => ({ texto: S.limpiarCodigo(typeof x === "string" ? x : x && x.texto), rotulo: String((x && x.rotulo) || "").slice(0, 30) }))
        .filter((x) => x.texto.length >= 4 && x.texto.length <= 40 && !S.esCodigoIgnorable(x.texto) && !vistos.has(x.texto) && vistos.add(x.texto)).slice(0, 8);
      res.status(200).json({ ok: true, codigos });
      return;
    }
    if (b.accion === "garantia") {
      // Seguimiento de un equipo fallado: mandado al proveedor, volvió reparado, reemplazado o rechazado.
      const t = S.limpiarCodigo(b.serie), estado = String(b.estado || "");
      if (!S.GARANTIA_ESTADOS[estado] || estado === "por_enviar") { res.status(400).json({ error: "Estado inválido" }); return; }
      const nuevo = S.limpiarCodigo(b.nuevo), nota = String(b.nota || "").replace(/\s+/g, " ").trim().slice(0, 200), rma = String(b.rma || "").trim().slice(0, 40);
      if (estado === "reemplazado" && !nuevo) { res.status(400).json({ error: "Falta el N° de serie del equipo nuevo" }); return; }
      let movs = [];
      const r = await stockActualizar(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} }, (sal) => {
        const u = (sal.unidades || {})[t];
        if (!u || !u.garantia || u.garantia.cerrada) return { error: "Ese equipo no tiene una garantía abierta", status: 409 };
        if (u.u !== "gar") return { error: `El equipo figura en ${S.nombreUbicacion(u.u)}, no en Garantía`, status: 409 };
        if (estado === "reemplazado" && sal.unidades[nuevo]) return { error: `El N° de serie ${nuevo} ya está registrado`, status: 409 };
        let s2 = JSON.parse(JSON.stringify(sal));
        const g = { ...u.garantia, historial: [...(u.garantia.historial || []), { f: ahora, estado, por: quien, ...(rma ? { rma } : {}), ...(nota ? { nota } : {}), ...(nuevo ? { nuevo } : {}) }].slice(-20) };
        g.estado = estado;
        if (rma) g.rma = rma;
        if (estado === "enviado") g.enviado = ahora;
        movs = [];
        const id = (k) => `${Date.now().toString(36)}-g${k}`;
        if (estado === "reparado") movs.push({ id: id(1), fecha: ahora, por: quien, tipo: "garantia_reparado", c: u.c, cant: 1, de: "gar", a: "dep", unidades: [t], motivo: `Volvió reparado de garantía${nota ? ": " + nota : ""}` });
        if (estado === "reemplazado") {
          movs.push({ id: id(1), fecha: ahora, por: quien, tipo: "garantia_reemplazo", c: u.c, cant: 1, de: "gar", unidades: [t], motivo: `Reemplazado por el proveedor (nuevo: ${nuevo})` });
          movs.push({ id: id(2), fecha: ahora, por: quien, tipo: "garantia_reemplazo", c: u.c, cant: 1, a: "dep", unidades: [nuevo], ...(u.prov ? { prov: u.prov } : {}), motivo: `Reemplazo en garantía de ${t}` });
          g.nuevo = nuevo;
        }
        if (estado === "rechazado") movs.push({ id: id(1), fecha: ahora, por: quien, tipo: "garantia_rechazada", c: u.c, cant: 1, de: "gar", unidades: [t], motivo: `Garantía rechazada${nota ? ": " + nota : ""}` });
        if (["reparado", "reemplazado", "rechazado"].includes(estado)) { g.cerrada = ahora; }
        movs.forEach((m) => { s2 = S.aplicarMovimiento(s2, m); });
        s2.unidades[t] = { ...s2.unidades[t], garantia: g };
        if (estado === "reemplazado") s2.unidades[nuevo] = { ...s2.unidades[nuevo], reemplaza: t };
        return { data: s2, respuesta: { garantia: g }, movs };
      }, `Stock: garantía de ${t}: ${estado} (por ${quien})`);
      if (!r.error && movs.length) await stockConfirmarMovs(movs, `Stock: garantía (por ${quien})`);
      responder(r);
      return;
    }
    if (b.accion === "registrar_unidades") {
      // Inventario de N° de serie de lo que ya está en una ubicación (no mueve cantidades).
      const ubic = String(b.ubic || "dep");
      if (!/^(dep|tec:.{1,60}|veh:.{1,60})$/.test(ubic)) { res.status(400).json({ error: "Ubicación inválida" }); return; }
      const opId = String(b.op_id || "").slice(0, 60);
      let resultado = null, duplicado = false;
      const r = await stockActualizar(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} }, (sal) => {
        if (opId && (sal.ops || []).includes(opId)) { duplicado = true; return { error: "duplicado", status: 200 }; }
        const x = S.registrarUnidades(sal, ubic, Array.isArray(b.items) ? b.items.slice(0, 500) : [], ahora);
        if (opId) x.saldos.ops = [opId, ...(sal.ops || [])].slice(0, 300);
        resultado = x;
        const { saldos, ...resumen } = x;
        const movsInv = x.registradas ? [{ id: `${Date.now().toString(36)}-inv`, fecha: ahora, por: quien, tipo: "inventario_series", c: "", cant: x.registradas, a: ubic, motivo: `Inventario de N° de serie: ${x.registradas} registrados` }] : [];
        resultado.movsInv = movsInv;
        return { data: saldos, respuesta: resumen, movs: movsInv };
      }, `Stock: inventario de N° de serie en ${ubic} (por ${quien})`);
      if (duplicado) { res.status(200).json({ ok: true, duplicado: true }); return; }
      if (!r.error && resultado) await stockAprender((Array.isArray(b.items) ? b.items : []).map((x) => ({ c: S.codigoArticulo(x.c), unidades: x.unidades || [], prov: S.codigoProveedor(x.prov) })), quien);
      if (!r.error && resultado && resultado.registradas) await stockConfirmarMovs(resultado.movsInv, `Stock: inventario de N° de serie (por ${quien})`);
      responder(r);
      return;
    }
    if (b.accion === "alias") {
      // Código de fabricante (EAN) que se asocia a un artículo la primera vez que se escanea.
      const c = S.codigoArticulo(b.c), ean = S.limpiarCodigo(b.ean);
      if (!c || !ean || ean.length < 6) { res.status(400).json({ error: "Falta el artículo o el código" }); return; }
      const r = await stockActualizar(STOCK_CAT, { articulos: {} }, (cat) => {
        const arts = { ...(cat.articulos || {}) };
        if (!arts[c]) return { error: "No existe ese artículo", status: 404 };
        const otro = Object.values(arts).find((a) => a.c !== c && (a.alias || []).includes(ean));
        if (otro) return { error: `Ese código ya está asociado a ${otro.d}`, status: 409 };
        arts[c] = { ...arts[c], alias: [...new Set([...(arts[c].alias || []), ean])].slice(-20) };
        return { data: { ...cat, articulos: arts }, respuesta: { articulo: arts[c] } };
      }, `Stock: código ${ean} asociado a ${c} (por ${quien})`);
      responder(r);
      return;
    }
    if (b.accion === "mover" || b.accion === "devolver") {
      // mover (responsable): del depósito a un técnico, vehículo o cliente; compras que llegan; retiros.
      // devolver (técnico): de lo suyo al depósito; queda en camino hasta que el responsable lo recibe.
      const UB = /^(dep|gar|tec:.{1,60}|veh:.{1,60}|cli:.{1,120}|com:.{1,120})$/;
      let de = b.accion === "devolver" ? (esResp && b.de ? String(b.de) : `tec:${quien}`) : String(b.de || "dep");
      const a = b.accion === "devolver" ? "dep" : String(b.a || "");
      if (!(de === "proveedor" || UB.test(de)) || !UB.test(a)) { res.status(400).json({ error: "Origen o destino inválido" }); return; }
      // Equipo fallado: lo que vuelve (de un cliente o de un técnico) va a «Garantía».
      const fallado = !!b.fallado || a === "gar", falla = String(b.falla || "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (b.motivo == null && fallado && falla) b.motivo = `Fallado: ${falla}`;
      const tipo = a === "gar" ? "falla" : b.accion === "devolver" ? "devolucion" : de === "proveedor" ? "ingreso" : /^tec:/.test(a) ? "entrega" : /^(cli|com):/.test(a) ? "a_cliente" : /^(cli|com):/.test(de) ? "retiro" : a === "dep" ? "devolucion" : "traspaso";
      // Confirma el que recibe, salvo que sea el mismo que registra (Melina recibiendo en el depósito).
      const confirmar = (/^tec:/.test(a) && a !== `tec:${quien}`) || (b.accion === "devolver" && !esResp);
      const { data: cat } = await leerArchivoDatos(STOCK_CAT, { articulos: {} });
      let resultado = null, duplicado = false;
      const opId = String(b.op_id || "").slice(0, 60);
      const r = await stockActualizar(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} }, (sal) => {
        // Lo que se mandó sin señal se reintenta: si ya llegó, no se aplica dos veces.
        if (opId && (sal.ops || []).includes(opId)) { duplicado = true; return { error: "duplicado", status: 200 }; }
        const x = S.moverStock(sal, Array.isArray(b.items) ? b.items.slice(0, 500) : [], { tipo, de, a, por: quien, fecha: ahora, motivo: String(b.motivo || "").slice(0, 200), confirmar, fallado: fallado && b.accion === "devolver", falla, deFlexible: /^(cli|com):/.test(de) && (a === "dep" || a === "gar"), presupuesto: /^(cli|com):/.test(a) ? String(b.presupuesto || "").trim().slice(0, 30) : "" }, cat);
        if (x.error) return { error: x.error, status: 409 };
        resultado = x;
        S.abrirGarantias(x.saldos, x.movs, { falla, por: quien });
        if (opId) x.saldos.ops = [opId, ...(sal.ops || [])].slice(0, 300);
        // Retiros de clientes que la APP no tenía: quedan para revisar en Salud del stock.
        const sinRegistro = x.movs.filter((m) => !m.de && /no figuraba en la APP/.test(m.motivo || ""));
        if (sinRegistro.length) x.saldos.revisar = [...sinRegistro.map((m) => ({ id: m.id, fecha: m.fecha, c: m.c, cant: m.cant, de, por: quien })), ...(sal.revisar || [])].slice(0, 300);
        return { data: x.saldos, respuesta: { envio: x.envio, movimientos: x.movs.length }, movs: x.movs };
      }, `Stock: ${tipo} ${de} → ${a} (por ${quien})`);
      if (duplicado) { res.status(200).json({ ok: true, duplicado: true }); return; }
      if (!r.error && resultado) {
        await stockConfirmarMovs(resultado.movs, `Stock: movimientos (${tipo}, por ${quien})`);
        // Aprende la forma de los N° de unidad de cada artículo.
        await stockAprender(resultado.movs, quien);
        if (resultado.envio) {
          try {
            const { enviarASeleccionados } = require("../lib/push-sender");
            const e = resultado.envio, n = e.items.reduce((t, x) => t + x.cant, 0);
            const destinatarios = /^tec:/.test(e.a) ? [e.a.slice(4)] : (await tecnicos()).filter((t) => t.permisos && t.permisos.stock_responsable).map((t) => t.nombre);
            const titulo = /^tec:/.test(e.a) ? "Te mandaron material" : `${quien} devolvió material`;
            if (destinatarios.length) await enviarASeleccionados(destinatarios, { titulo, cuerpo: `${n} artículo(s): ${e.items.map((x) => ((cat.articulos || {})[x.c] || {}).d || x.c).slice(0, 3).join(", ")}. Confirmá «Recibí» en Mi stock.`.slice(0, 200), url: "/?ir=mistock" });
          } catch (e) { /* el aviso es opcional */ }
        }
      }
      responder(r);
      return;
    }
    if (b.accion === "confirmar_envio") {
      let resultado = null;
      const r = await stockActualizar(STOCK_SAL, { ubic: {}, unidades: {}, pedidos: {} }, (sal) => {
        const e = (sal.envios || []).find((x) => x.id === b.id);
        if (!e) return { error: "Ese envío ya se confirmó o no existe", status: 409 };
        const mio = e.a === `tec:${quien}`;
        if (!mio && !esResp) return { error: "Este envío no es para vos", status: 403 };
        // Una devolución de un equipo fallado va a Garantía (salvo que el depósito elija otra cosa).
        const destino = e.a === "dep" ? (b.destino === "dep" || b.destino === "gar" ? b.destino : e.fallado ? "gar" : undefined) : undefined;
        const x = S.cerrarEnvio(sal, b.id, { accion: b.accion_envio === "rechazar" ? "rechazar" : "recibi", items: Array.isArray(b.items) ? b.items : undefined, por: mio ? quien : `${quien} (por ${e.a.replace(/^tec:/, "")})`, fecha: ahora, motivo: String(b.motivo || "").slice(0, 200), destino });
        if (x.error) return { error: x.error, status: 409 };
        S.abrirGarantias(x.saldos, x.movs, { falla: e.falla || e.motivo || "", por: quien });
        x.saldos.envios_cerrados = [x.envio, ...(Array.isArray(sal.envios_cerrados) ? sal.envios_cerrados : [])].slice(0, 300);
        resultado = x;
        return { data: x.saldos, respuesta: { envio: x.envio }, movs: x.movs };
      }, `Stock: envío confirmado (por ${quien})`);
      if (!r.error && resultado) {
        await stockConfirmarMovs(resultado.movs, `Stock: movimientos de confirmación (por ${quien})`);
        if (resultado.envio.estado !== "recibido") {
          try {
            const { enviarASeleccionados } = require("../lib/push-sender");
            const avisar = resultado.envio.a === "dep" ? [resultado.envio.de.replace(/^tec:/, "")] : [resultado.envio.por];
            await enviarASeleccionados(avisar.filter(Boolean), { titulo: resultado.envio.estado === "rechazado" ? "Rechazaron un envío de stock" : "Envío de stock con diferencias", cuerpo: `${quien}: ${resultado.envio.diferencias.map((d) => `${d.c} mandado ${d.enviado}, recibido ${d.recibido}`).join(" · ")}${b.motivo ? " — " + b.motivo : ""}`.slice(0, 200), url: "/" });
          } catch (e) { /* opcional */ }
        }
      }
      responder(r);
      return;
    }
    res.status(400).json({ error: "Acción inválida" });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
}

module.exports = require("../lib/auditoria").conAuditoria("datos", async (req, res) => {
  // Formulario público de "pedir servicio" — pensado para un cliente
  // que escribe fuera de horario y no tiene ni necesita ningún login.
  // Por eso va ANTES del control de token de acá abajo, como única
  // excepción de todo este archivo (mismo patrón que la encuesta de
  // satisfacción). Guarda el pedido, y avisa a todo el equipo por
  // push — así no se pierde como pasaría con un WhatsApp fuera de
  // horario.
  // Vista 3D que se le mandó a un cliente (link de WhatsApp): solo lectura,
  // por un id al azar de 16 caracteres que no se puede adivinar.
  if (req.query && (req.query.publico === "vista3d" || req.query.publico === "vista3d_llamar")) {
    // Se puede abrir desde el archivo HTML descargado (otro origen).
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
  }
  if (req.method === "GET" && req.query && req.query.publico === "vista3d") {
    const id = String(req.query.id || "");
    if (!/^[0-9a-f]{16}$/.test(id)) { res.status(400).json({ error: "Link inválido" }); return; }
    if (!process.env.GITHUB_DATA_TOKEN || !process.env.GITHUB_DATA_REPO) { res.status(500).json({ error: "Falta configuración del servidor" }); return; }
    try {
      const { data } = await leerArchivoDatos(`vistas3d/${id}.json`, null);
      if (!data) { res.status(404).json({ error: "Esta vista ya no está disponible" }); return; }
      res.setHeader("Cache-Control", "no-store");
      // Se cuenta la apertura y se le avisa a quien lo mandó (como mucho
      // una vez cada 30 minutos, para no llenarlo de avisos).
      if (req.query.contar !== "0") {
        let avisar = null;
        await anotarVista3d(id, (lista) => {
          const v = lista.find((x) => x.id === id);
          if (!v) return null;
          const ahora = Date.now();
          v.aperturas = (v.aperturas || 0) + 1;
          v.ultima = new Date(ahora).toISOString();
          if (!v.avisado || ahora - Date.parse(v.avisado) > 30 * 60 * 1000) { v.avisado = v.ultima; avisar = { ...v }; }
          return lista;
        }).catch(() => {});
        if (avisar && avisar.por) {
          try {
            const { enviarASeleccionados } = require("../lib/push-sender");
            await enviarASeleccionados([avisar.por], { titulo: "👀 Abrieron la vista 3D", cuerpo: `${avisar.cliente || avisar.titulo} abrió la vista 3D${avisar.aperturas > 1 ? ` (${avisar.aperturas} veces)` : ""}.`, url: "/" });
          } catch (e) { /* el aviso es opcional */ }
        }
      }
      const propuestas = Array.isArray(data.propuestas) && data.propuestas.length ? data.propuestas : [{ nombre: "", paginas: data.paginas || [] }];
      res.status(200).json({ titulo: data.titulo, cliente: data.cliente, fecha: data.fecha, propuestas, paginas: propuestas[0].paginas, presentacion: data.presentacion !== false, ...(data.contacto ? { contacto: data.contacto } : {}) });
    } catch (e) { res.status(502).json({ error: "No se pudo abrir la vista" }); }
    return;
  }
  if (req.method === "POST" && req.query && req.query.publico === "vista3d_llamar") {
    // El cliente pide que lo llamen desde la vista 3D.
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const id = String((body && body.id) || "");
    const limpio = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
    const telefono = limpio(body && body.telefono, 30), mensaje = limpio(body && body.mensaje, 300), propuesta = limpio(body && body.propuesta, 40);
    if (!/^[0-9a-f]{16}$/.test(id)) { res.status(400).json({ error: "Link inválido" }); return; }
    if (telefono.replace(/\D/g, "").length < 6) { res.status(400).json({ error: "Falta el teléfono" }); return; }
    let registro = null, demasiados = false;
    try {
      await anotarVista3d(id, (lista) => {
        const v = lista.find((x) => x.id === id);
        if (!v) return null;
        v.llamadas = Array.isArray(v.llamadas) ? v.llamadas : [];
        if (v.llamadas.length >= 5) { demasiados = true; return null; }
        v.llamadas.push({ telefono, mensaje, propuesta, fecha: new Date().toISOString() });
        registro = { ...v };
        return lista;
      });
    } catch (e) { registro = null; }
    if (demasiados) { res.status(200).json({ ok: true }); return; }
    if (!registro) { res.status(404).json({ error: "Esta vista ya no está disponible" }); return; }
    try {
      const { enviarASeleccionados } = require("../lib/push-sender");
      await enviarASeleccionados([registro.por], { titulo: "📞 Un cliente quiere que lo llamen", cuerpo: `${registro.cliente || registro.titulo}: ${telefono}${propuesta ? " · le gustó «" + propuesta + "»" : ""}${mensaje ? " — " + mensaje : ""}`.slice(0, 200), url: "/", importante: true });
    } catch (e) { /* el aviso es opcional */ }
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method === "POST" && req.query && req.query.publico === "solicitud_emergencia") {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const comoTexto = (v) => (typeof v === "string" ? v.trim() : "");
    const cliente = comoTexto(body?.cliente);
    const telefono = comoTexto(body?.telefono);
    if (!cliente || !telefono) {
      res.status(400).json({ error: "Faltan datos (nombre o teléfono)" });
      return;
    }
    const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
    if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
      res.status(500).json({ error: "Falta configuración del servidor" });
      return;
    }
    try {
      const r = await fetch(`${BACKEND_NUEVO_URL}/api/emergencias/solicitud-publica`, {
        method: "POST",
        headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cliente, telefono, direccion: comoTexto(body?.direccion), tarea: comoTexto(body?.tarea) }),
      });
      const data = await r.json();
      if (!r.ok) {
        res.status(r.status).json(data);
        return;
      }
      // El aviso push no debe frenar la respuesta al cliente que
      // completó el formulario — si falla, el pedido ya quedó
      // guardado igual, que es lo que realmente importa.
      try {
        const { enviarATodos } = require("../lib/push-sender");
        await enviarATodos({
          titulo: `📞 Nuevo pedido de servicio: ${cliente}`,
          cuerpo: `${telefono}${body?.direccion ? " — " + body.direccion : ""}${body?.tarea ? " — " + body.tarea.slice(0, 80) : ""}`,
          url: "/",
        });
      } catch (errPush) {
        console.error("No se pudo avisar por push del formulario público:", errPush);
      }
      // Mismo criterio — el mail a oficina es un aviso extra, nunca
      // debe hacer que el cliente vea un error si el pedido ya quedó
      // guardado bien.
      try {
        const enviarMailHandler = require("./enviar-mail");
        const resFalso = { status: () => resFalso, json: () => resFalso, setHeader: () => resFalso };
        await enviarMailHandler(
          { method: "POST", headers: { authorization: `Bearer ${process.env.SERVICIOS_API_TOKEN}` }, body: { tipo: "solicitud_publica", datos: { cliente, telefono, direccion: comoTexto(body?.direccion), tarea: comoTexto(body?.tarea) } } },
          resFalso
        );
      } catch (errMail) {
        console.error("No se pudo avisar por mail del formulario público:", errMail);
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "No se pudo registrar el pedido, intentá de nuevo" });
    }
    return;
  }

  // ---------- Quién pide (sesión personal firmada, ver lib/sesion.js) ----------
  const { autorizar, crearSesion } = require("../lib/sesion");
  const autorizacion = autorizar(req);
  let cuerpoAccion = null;
  if (req.method === "POST") {
    cuerpoAccion = req.body;
    if (typeof cuerpoAccion === "string") {
      try { cuerpoAccion = JSON.parse(cuerpoAccion); } catch (err) { cuerpoAccion = null; }
    }
  }
  const accionPedida = cuerpoAccion && !Array.isArray(cuerpoAccion) ? cuerpoAccion.accion : "";
  // Lo único que se puede pedir SIN estar logueado: entrar (contraseña o
  // huella) y lo mínimo que muestra la pantalla de login.
  const ACCIONES_SIN_LOGIN = ["verificar_login", "verificar_admin", "webauthn_tiene_credencial", "webauthn_login_opciones", "webauthn_login_verificar"];
  const accionSinLogin = ACCIONES_SIN_LOGIN.includes(accionPedida);
  const lecturaSinLogin = req.method === "GET" && ["tecnicos", "config"].includes(req.query && req.query.coleccion);
  if (!autorizacion && !accionSinLogin && !lecturaSinLogin) {
    res.status(401).json({ error: "No autorizado", sesion_vencida: true });
    return;
  }
  const jsonOriginal = res.json.bind(res);
  if (!autorizacion && lecturaSinLogin) {
    // Sin login: de la lista de técnicos solo los nombres (para el
    // desplegable), y de la configuración solo lo que usa el login.
    res.json = (data) => {
      if (Array.isArray(data)) return jsonOriginal(data.filter((t) => t && t.nombre).map((t) => ({ nombre: t.nombre })));
      if (data && typeof data === "object" && !data.error) {
        return jsonOriginal({ app_version_actual: data.app_version_actual, dias_atencion: data.dias_atencion, dias_urgente: data.dias_urgente });
      }
      return jsonOriginal(data);
    };
  }
  // Al entrar bien, la respuesta lleva el pase personal ("sesion").
  if (accionPedida === "verificar_admin" || accionPedida === "verificar_login" || accionPedida === "webauthn_login_verificar") {
    res.json = (data) => {
      if (data && data.ok === true && res.statusCode === 200) {
        const sesion = accionPedida === "verificar_admin"
          ? crearSesion({ nombre: data.nombre || "Clave general", rol: "admin" })
          : crearSesion({ nombre: String(cuerpoAccion.nombre || ""), rol: "tecnico" });
        return jsonOriginal({ ...data, sesion });
      }
      return jsonOriginal(data);
    };
  }
  // El registro de cambios solo lo ve la oficina, y nadie lo escribe a mano.
  // ---------- Presupuesto express: lista de precios y numeración ----------
  if (req.query && req.query.coleccion === "croquis") {
    if (!autorizacion) { res.status(401).json({ error: "No autorizado", sesion_vencida: true }); return; }
    await manejarCroquis(req, res, autorizacion, cuerpoAccion);
    return;
  }
  if (req.query && req.query.coleccion === "backup") {
    if (!autorizacion) { res.status(401).json({ error: "No autorizado", sesion_vencida: true }); return; }
    if (autorizacion.rol !== "admin") { res.status(403).json({ error: "Solo desde el panel de administración" }); return; }
    if (!process.env.BACKEND_NUEVO_URL || !process.env.BACKEND_NUEVO_TOKEN || !process.env.GITHUB_DATA_REPO) { res.status(500).json({ error: "Falta configuración del servidor" }); return; }
    await manejarBackup(req, res, autorizacion, cuerpoAccion);
    return;
  }
  if (req.query && req.query.coleccion === "stock") {
    // Admin: todo. Responsable de stock (Melina): escanear, entregar, recibir. Técnicos: su stock y confirmar.
    if (!autorizacion) { res.status(401).json({ error: "No autorizado", sesion_vencida: true }); return; }
    await manejarStock(req, res, autorizacion, cuerpoAccion);
    return;
  }
  if (req.query && req.query.coleccion === "vencimientos") {
    // Vencimientos de la oficina (matafuegos, seguros, habilitaciones...).
    if (!autorizacion) { res.status(401).json({ error: "No autorizado", sesion_vencida: true }); return; }
    if (autorizacion.rol !== "admin") { res.status(403).json({ error: "Solo desde el panel de administración" }); return; }
    const { limpiarVencimiento, renovarVencimiento } = require("../lib/vencimientos");
    const RUTA = "vencimientos.json";
    res.setHeader("Cache-Control", "no-store");
    try {
      if (req.method === "GET") { const { data } = await leerArchivoDatos(RUTA, []); res.status(200).json(Array.isArray(data) ? data : []); return; }
      const b = cuerpoAccion && typeof cuerpoAccion === "object" ? cuerpoAccion : {};
      for (let intento = 0; intento < 4; intento++) {
        const { data, sha } = await leerArchivoDatos(RUTA, []);
        let lista = Array.isArray(data) ? data : [];
        let mensaje = "";
        if (b.accion === "guardar") {
          const previo = lista.find((x) => b.item && x.id === b.item.id);
          const item = limpiarVencimiento(b.item, previo);
          if (!item.nombre) { res.status(400).json({ error: "Falta qué vence" }); return; }
          if (!item.fecha) { res.status(400).json({ error: "Falta la fecha de vencimiento" }); return; }
          lista = previo ? lista.map((x) => (x.id === item.id ? item : x)) : [...lista, item];
          mensaje = `Vencimiento: ${previo ? "editó" : "agregó"} ${item.nombre} (por ${autorizacion.nombre || "Oficina"})`;
        } else if (b.accion === "renovar") {
          const it = lista.find((x) => x.id === b.id);
          if (!it) { res.status(404).json({ error: "No existe ese vencimiento" }); return; }
          const nuevo = renovarVencimiento(it, b.fecha, autorizacion.nombre || "Oficina");
          if (!nuevo) { res.status(400).json({ error: "Poné la fecha del próximo vencimiento" }); return; }
          lista = lista.map((x) => (x.id === it.id ? nuevo : x));
          mensaje = `Vencimiento: renovó ${it.nombre} hasta ${nuevo.fecha} (por ${autorizacion.nombre || "Oficina"})`;
        } else if (b.accion === "borrar") {
          const it = lista.find((x) => x.id === b.id);
          if (!it) { res.status(200).json({ ok: true, lista }); return; }
          lista = lista.filter((x) => x.id !== b.id);
          mensaje = `Vencimiento: borró ${it.nombre} (por ${autorizacion.nombre || "Oficina"})`;
        } else { res.status(400).json({ error: "Acción inválida" }); return; }
        const r = await escribirArchivoDatos(RUTA, lista, sha, mensaje);
        if (r.ok) { res.status(200).json({ ok: true, lista }); return; }
        if (r.status !== 409 && r.status !== 422) break;
      }
      res.status(502).json({ error: "No se pudo guardar" });
    } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
    return;
  }
  if (req.query && req.query.coleccion === "sims_conciliacion") {
    // Diferencias de la conciliación de SIMs que la oficina marcó como
    // resueltas o para ignorar (errores internos): no vuelven a aparecer.
    if (!autorizacion) { res.status(401).json({ error: "No autorizado", sesion_vencida: true }); return; }
    if (autorizacion.rol !== "admin") { res.status(403).json({ error: "Solo desde el panel de administración" }); return; }
    const RUTA = "sims-conciliacion-ignoradas.json", RUTA_HIST = "sims-conciliacion-historial.json";
    const num = (v) => String(v == null ? "" : v).replace(/\D/g, "").slice(-10);
    const txt = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
    try {
      // Historial de corridas: para comparar contra la conciliación anterior.
      if (req.method === "GET" && req.query.historial) { const { data } = await leerArchivoDatos(RUTA_HIST, []); res.setHeader("Cache-Control", "no-store"); res.status(200).json(Array.isArray(data) ? data : []); return; }
      if (req.method === "POST" && cuerpoAccion && cuerpoAccion.accion === "guardar_corrida") {
        const c = cuerpoAccion;
        const id = String(c.id || "").replace(/[^\w-]/g, "").slice(0, 40);
        if (!id) { res.status(400).json({ error: "Falta el id" }); return; }
        const numeros = {};
        Object.entries(c.numeros && typeof c.numeros === "object" ? c.numeros : {}).slice(0, 20).forEach(([k, l]) => { numeros[txt(k, 40)] = (Array.isArray(l) ? l : []).slice(0, 3000).map(num).filter((n) => n.length === 10); });
        const corrida = { id, fecha: new Date().toISOString(), empresa: txt(c.empresa, 40), archivo: txt(c.archivo, 120), total: Math.max(0, Number(c.total) || 0), activas: Math.max(0, Number(c.activas) || 0), coinciden: Math.max(0, Number(c.coinciden) || 0), numeros, por: autorizacion.nombre || "Oficina" };
        for (let intento = 0; intento < 4; intento++) {
          const { data, sha } = await leerArchivoDatos(RUTA_HIST, []);
          const lista = (Array.isArray(data) ? data : []).filter((x) => x.id !== id);
          const previa = (Array.isArray(data) ? data : []).find((x) => x.id === id);
          if (previa) corrida.fecha = previa.fecha;
          lista.unshift(corrida);
          const r = await escribirArchivoDatos(RUTA_HIST, lista.slice(0, 120), sha, `Conciliación de SIMs ${corrida.empresa} — ${corrida.archivo}`);
          if (r.ok) { res.status(200).json({ ok: true }); return; }
          if (r.status !== 409 && r.status !== 422) break;
        }
        res.status(502).json({ error: "No se pudo guardar la corrida" });
        return;
      }
      if (req.method === "GET") { const { data } = await leerArchivoDatos(RUTA, []); res.setHeader("Cache-Control", "no-store"); res.status(200).json(Array.isArray(data) ? data : []); return; }
      if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
      const b = cuerpoAccion && typeof cuerpoAccion === "object" ? cuerpoAccion : {};
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 500).map((x) => ({ numero: num(x && x.numero), categoria: txt(x && x.categoria, 40), empresa: txt(x && x.empresa, 40) })).filter((x) => x.numero.length === 10 && x.categoria);
      if (!items.length) { res.status(400).json({ error: "No hay líneas" }); return; }
      const clave = (x) => `${x.empresa}|${x.categoria}|${x.numero}`;
      for (let intento = 0; intento < 4; intento++) {
        const { data, sha } = await leerArchivoDatos(RUTA, []);
        let lista = Array.isArray(data) ? data : [];
        const claves = new Set(items.map(clave));
        lista = lista.filter((x) => !claves.has(clave(x)));
        if (b.accion === "marcar") {
          const estado = b.estado === "resuelta" ? "resuelta" : "ignorada", ahora = new Date().toISOString();
          items.forEach((x) => lista.unshift({ ...x, estado, motivo: txt(b.motivo, 200), por: autorizacion.nombre || "Oficina", fecha: ahora }));
        } else if (b.accion !== "reactivar") { res.status(400).json({ error: "Acción inválida" }); return; }
        const r = await escribirArchivoDatos(RUTA, lista.slice(0, 5000), sha, `Conciliación de SIMs: ${b.accion === "marcar" ? (b.estado === "resuelta" ? "resueltas" : "ignoradas") : "vuelven a mostrarse"} ${items.length}`);
        if (r.ok) { res.status(200).json({ ok: true, lista }); return; }
        if (r.status !== 409 && r.status !== 422) break;
      }
      res.status(502).json({ error: "No se pudo guardar" });
    } catch (e) { res.status(502).json({ error: "No se pudo guardar" }); }
    return;
  }
  if (req.query && (req.query.coleccion === "lista_precios" || req.query.coleccion === "presupuestos_express")) {
    if (!autorizacion) { res.status(401).json({ error: "No autorizado", sesion_vencida: true }); return; }
    await manejarPresupuestoExpress(req, res, autorizacion, cuerpoAccion);
    return;
  }
  if (req.query && req.query.coleccion === "auditoria") {
    if (req.method !== "GET" || !autorizacion || autorizacion.rol !== "admin") {
      res.status(403).json({ error: "El registro de cambios solo se puede consultar desde el panel de administración" });
      return;
    }
  }
  // La lista de técnicos (contraseñas y permisos) solo la cambia la oficina.
  if (req.query && req.query.coleccion === "tecnicos" && ["POST", "PUT", "DELETE"].includes(req.method) && !accionPedida && autorizacion.rol !== "admin") {
    res.status(403).json({ error: "Solo la oficina puede modificar los técnicos" });
    return;
  }

  // Estado y disparo manual del aviso de guardia a Security24 — viven
  // en el backend nuevo (Cloudflare + D1), que es quien maneja esto
  // ahora (ver sat-backend-d1/src/cron.js). Se proxea acá para no
  // exponer nunca la URL/token del backend nuevo al navegador, mismo
  // criterio que el resto de este archivo.
  if (req.query && req.query.accion === "guardia_diagnostico" && req.method === "GET") {
    const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
    if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
      res.status(500).json({ error: "Falta configuración del servidor" });
      return;
    }
    try {
      const r = await fetch(`${BACKEND_NUEVO_URL}/api/guardias/diagnostico`, {
        headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}` },
      });
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.status(r.status).json(await r.json());
    } catch (err) {
      res.status(500).json({ error: "No se pudo consultar el estado de guardia" });
    }
    return;
  }
  if (req.query && req.query.accion === "guardia_avisar_ahora" && req.method === "POST") {
    const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
    if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
      res.status(500).json({ error: "Falta configuración del servidor" });
      return;
    }
    try {
      const r = await fetch(`${BACKEND_NUEVO_URL}/api/guardias/avisar-ahora`, {
        method: "POST",
        headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}` },
      });
      res.status(r.status).json(await r.json());
    } catch (err) {
      res.status(500).json({ error: "No se pudo disparar el aviso de guardia" });
    }
    return;
  }

  // Verificación de contraseñas — se hace acá adentro, del lado del
  // servidor, y nunca se le devuelve ninguna contraseña al que
  // pregunta (ni siquiera la propia): solo si coincide o no. Antes,
  // el celular bajaba la lista completa de técnicos CON sus
  // contraseñas y comparaba él mismo — cualquiera con el token de la
  // app (visible en el código) podía leer la lista completa.
  if (req.method === "POST") {
    let bodyAccion = req.body;
    if (typeof bodyAccion === "string") {
      try { bodyAccion = JSON.parse(bodyAccion); } catch (err) { bodyAccion = null; }
    }
    if (bodyAccion && bodyAccion.accion === "verificar_admin") {
      const ip = (req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "desconocida").toString().split(",")[0].trim();
      const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;

      // Si ya está bloqueado por intentos previos, ni se molesta en
      // verificar la contraseña — evita que alguien siga probando
      // mientras dura el bloqueo.
      if (BACKEND_NUEVO_URL && BACKEND_NUEVO_TOKEN) {
        try {
          const rEstado = await fetch(`${BACKEND_NUEVO_URL}/api/admin-login/estado?ip=${encodeURIComponent(ip)}`, {
            headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}` },
          });
          const estado = await rEstado.json();
          if (estado.bloqueado) {
            res.status(200).json({ ok: false, bloqueado: true, minutos_restantes: estado.minutos_restantes });
            return;
          }
        } catch (err) {
          // si falla la consulta de bloqueo, se sigue igual con la
          // verificación normal — mejor no dejar a nadie afuera por
          // un problema de red puntual.
        }
      }

      // Con usuario: la clave de esa persona y que tenga el permiso
      // "Panel de Administración". Sin usuario: la clave general (respaldo).
      const nombreAdmin = typeof bodyAccion.nombre === "string" ? bodyAccion.nombre.trim() : "";
      let ok = false, sinPermiso = false;
      if (nombreAdmin) {
        const claveOk = await verificarClaveTecnico(nombreAdmin, bodyAccion.password, req);
        if (claveOk) {
          sinPermiso = !(await tienePermisoAdmin(nombreAdmin));
          ok = !sinPermiso;
        }
      } else {
        ok = await verificarPasswordAdmin(bodyAccion.password);
      }

      if (BACKEND_NUEVO_URL && BACKEND_NUEVO_TOKEN) {
        try {
          const rRegistro = await fetch(`${BACKEND_NUEVO_URL}/api/admin-login/registrar`, {
            method: "POST",
            headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ip, exito: ok }),
          });
          const registro = await rRegistro.json();
          if (!ok && registro.bloqueado) {
            res.status(200).json({ ok: false, bloqueado: true, minutos_restantes: registro.minutos_restantes });
            return;
          }
        } catch (err) {
          // igual — si falla el registro del intento, no se le niega
          // el acceso a nadie por eso.
        }
      }

      if (ok) {
        // La entrada al panel también queda en el registro de cambios.
        try {
          const { registrar, entradaBase } = require("../lib/auditoria");
          await Promise.race([
            registrar({ ...entradaBase(req, nombreAdmin || "Clave general"), seccion: "Acceso", accion: "Entró al panel", detalle: nombreAdmin ? "" : "Con la clave general" }),
            new Promise((r) => setTimeout(r, 3000)),
          ]);
        } catch (e) { /* no se le niega la entrada por esto */ }
      }
      res.status(200).json(sinPermiso ? { ok: false, sin_permiso: true } : { ok, nombre: ok ? (nombreAdmin || "Clave general") : undefined });
      return;
    }
    if (bodyAccion && bodyAccion.accion === "verificar_login") {
      const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN, GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
      const nombre = bodyAccion.nombre;
      const password = bodyAccion.password;
      // Mismo bloqueo por intentos fallidos que el login de oficina: ahora
      // la contraseña es la única puerta, así que no se puede probar sin límite.
      const ipLogin = (req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "desconocida").toString().split(",")[0].trim();
      const registrarIntento = async (exito) => {
        if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) return null;
        try {
          const r = await fetch(`${BACKEND_NUEVO_URL}/api/admin-login/registrar`, {
            method: "POST",
            headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ip: "tec:" + ipLogin, exito }),
          });
          return await r.json();
        } catch (e) { return null; }
      };
      const responderLogin = async (ok) => {
        const registro = await registrarIntento(ok);
        if (!ok && registro && registro.bloqueado) {
          res.status(200).json({ ok: false, bloqueado: true, minutos_restantes: registro.minutos_restantes });
          return;
        }
        res.status(200).json({ ok });
      };
      if (BACKEND_NUEVO_URL && BACKEND_NUEVO_TOKEN) {
        try {
          const rEstado = await fetch(`${BACKEND_NUEVO_URL}/api/admin-login/estado?ip=${encodeURIComponent("tec:" + ipLogin)}`, {
            headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}` },
          });
          const estado = await rEstado.json();
          if (estado.bloqueado) {
            res.status(200).json({ ok: false, bloqueado: true, minutos_restantes: estado.minutos_restantes });
            return;
          }
        } catch (err) { /* sin el chequeo de bloqueo se sigue igual */ }
      }

      if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
        res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" });
        return;
      }
      try {
        await responderLogin(await verificarClaveTecnico(nombre, password));
      } catch (err) {
        res.status(500).json({ error: "Error interno al verificar" });
      }
      return;
    }

    // ---------- Huella digital / Face ID (WebAuthn) — simples reenvíos al backend nuevo ----------
    const ACCIONES_WEBAUTHN = {
      webauthn_tiene_credencial: "GET:/api/tecnicos/webauthn/tiene-credencial?nombre=",
      webauthn_registro_opciones: "POST:/api/tecnicos/webauthn/registro/opciones",
      webauthn_registro_verificar: "POST:/api/tecnicos/webauthn/registro/verificar",
      webauthn_login_opciones: "POST:/api/tecnicos/webauthn/login/opciones",
      webauthn_login_verificar: "POST:/api/tecnicos/webauthn/login/verificar",
    };
    if (bodyAccion && ACCIONES_WEBAUTHN[bodyAccion.accion]) {
      const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
      if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
        res.status(500).json({ error: "Faltan variables de entorno del backend nuevo por configurar en Vercel" });
        return;
      }
      const headersBackendNuevo = { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" };
      const [metodo, ruta] = ACCIONES_WEBAUTHN[bodyAccion.accion].split(":");
      try {
        const url = metodo === "GET"
          ? `${BACKEND_NUEVO_URL}${ruta}${encodeURIComponent(bodyAccion.nombre || "")}`
          : `${BACKEND_NUEVO_URL}${ruta}`;
        const r = await fetch(url, {
          method: metodo,
          headers: headersBackendNuevo,
          body: metodo === "GET" ? undefined : JSON.stringify(bodyAccion),
        });
        const data = await r.json();
        res.status(r.status).json(data);
      } catch (err) {
        res.status(500).json({ error: "Error interno al hablar con el backend nuevo" });
      }
      return;
    }
  }

  const nombreColeccion = req.query.coleccion;

  // --- CORTE EN CURSO: estas colecciones ya viven en el backend nuevo (Cloudflare) ---
  // El resto sigue en GitHub por ahora; se van cortando de a una,
  // probando cada una antes de seguir con la próxima. La app en el
  // celular no cambia en nada — sigue pidiendo lo mismo de siempre.
  const COLECCIONES_YA_CORTADAS = ["clientes", "materiales", "credenciales", "consultas-categorias", "config", "guardias", "push-subscripciones", "servicios_emergencia", "vehiculos", "herramientas", "sims", "sims_instaladas", "notas", "visitas_historicas"];
  if (COLECCIONES_YA_CORTADAS.includes(nombreColeccion)) {
    const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
    if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
      res.status(500).json({ error: "Faltan variables de entorno del backend nuevo por configurar en Vercel" });
      return;
    }
    const headersBackendNuevo = { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" };

    try {
      let body = null;
      if (req.method === "POST") {
        body = req.body;
        if (typeof body === "string") body = JSON.parse(body);
      }
      const resultado = await manejarColeccionCortada(nombreColeccion, req.method, body, BACKEND_NUEVO_URL, headersBackendNuevo);
      if (req.method === "GET") res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.status(resultado.status).json(resultado.data);
    } catch (err) {
      res.status(500).json({ error: "Error interno al hablar con el backend nuevo", detalle: String(err.message || err) });
    }
    return;
  }
  // --- fin del corte ---

  const coleccion = COLECCIONES[nombreColeccion];
  if (!coleccion) {
    res.status(400).json({ error: "Colección desconocida", validas: Object.keys(COLECCIONES) });
    return;
  }

  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
    res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" });
    return;
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${coleccion.path}`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_DATA_TOKEN}`,
    Accept: "application/vnd.github+json",
  };

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    try {
      const r = await fetch(apiUrl, { headers: ghHeaders });
      if (r.status === 404) {
        res.status(200).json(coleccion.default);
        return;
      }
      if (!r.ok) {
        res.status(502).json({ error: `No se pudo leer ${nombreColeccion}` });
        return;
      }
      const data = await r.json();
      const content = JSON.parse(await textoDeArchivoGithub(data, apiUrl, ghHeaders));
      let resultado = coleccion.mergeConDefault ? { ...coleccion.default, ...content } : content;
      if (nombreColeccion === "tecnicos" && Array.isArray(resultado)) {
        resultado = resultado.map((t) => {
          const { password, ...resto } = t;
          return resto;
        });
      }
      res.status(200).json(resultado);
    } catch (err) {
      res.status(500).json({ error: `Error interno al leer ${nombreColeccion}` });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      if (body === undefined || body === null) {
        res.status(400).json({ error: "Falta el contenido a guardar" });
        return;
      }

      let sha;
      const existing = await fetch(apiUrl, { headers: ghHeaders });
      let contenidoExistente = coleccion.default;
      if (existing.ok) {
        const existingData = await existing.json();
        sha = existingData.sha;
        contenidoExistente = JSON.parse(await textoDeArchivoGithub(existingData, apiUrl, ghHeaders));
      }

      // Las suscripciones push se agregan (sin duplicar por endpoint),
      // nunca se reemplaza la lista entera — así un celular nuevo no
      // borra las suscripciones de los demás. Si el mismo celular ya
      // estaba suscripto pero ahora lo usa otro técnico (cambió de
      // mano), se actualiza a quién pertenece en vez de dejarlo
      // desactualizado.
      let contenidoAGuardar = body;
      let entradasEmergenciaNuevas = [];
      if (nombreColeccion === "servicios_emergencia" && Array.isArray(body)) {
        const existentes = Array.isArray(contenidoExistente) ? contenidoExistente : [];
        const idsExistentes = new Set(existentes.map((e) => e.id));
        entradasEmergenciaNuevas = body.filter((e) => !idsExistentes.has(e.id));
      }
      if (nombreColeccion === "tecnicos" && Array.isArray(body)) {
        const existentes = Array.isArray(contenidoExistente) ? contenidoExistente : [];
        contenidoAGuardar = body.map((t) => {
          if (t.password) return t; // se escribió una clave nueva -> se usa esa
          const previo = existentes.find((x) => x.nombre === t.nombre);
          return { ...t, password: previo ? previo.password : "" };
        });
      }
      if (nombreColeccion === "push-subscripciones") {
        const lista = Array.isArray(contenidoExistente) ? contenidoExistente : [];
        const idx = lista.findIndex((s) => s.endpoint === body.endpoint);
        if (idx === -1) {
          contenidoAGuardar = [...lista, body];
        } else {
          const copia = [...lista];
          copia[idx] = { ...copia[idx], tecnico: body.tecnico };
          contenidoAGuardar = copia;
        }
      }

      if (nombreColeccion === "servicios_vistos") {
        // { accion: "registrar", numeros: [...] }: anota la primera vez que
        // se vio cada servicio; no pisa las fechas ya registradas. Se
        // olvidan los que hace más de 60 días que no aparecen en el listado.
        const mapa = contenidoExistente && typeof contenidoExistente === "object" && !Array.isArray(contenidoExistente) ? { ...contenidoExistente } : {};
        if (!body || body.accion !== "registrar" || !Array.isArray(body.numeros)) {
          res.status(400).json({ error: "Formato inválido" });
          return;
        }
        const ahora = Date.now();
        const iso = new Date(ahora).toISOString();
        let cambio = false;
        // Solo la primera vez que se usa el registro (vacío) se siembra con la
        // fecha de ingreso de cada servicio (body.desde[numero]); después, todo
        // servicio nuevo cuenta desde que aparece en la app.
        const sembrar = Object.keys(mapa).length === 0 && body.desde && typeof body.desde === "object";
        body.numeros.slice(0, 2000).forEach((n) => {
          const k = String(n || "").trim().slice(0, 40);
          if (!k) return;
          if (!mapa[k]) {
            let primera = iso;
            if (sembrar) {
              const t = Date.parse(body.desde[k]);
              if (t && t <= ahora && ahora - t < 3650 * 86400000) primera = new Date(t).toISOString();
            }
            mapa[k] = { primera, ultima: iso };
            cambio = true;
          } else if (!mapa[k].ultima || ahora - Date.parse(mapa[k].ultima) > 86400000) {
            mapa[k].ultima = iso;
            cambio = true;
          }
        });
        Object.keys(mapa).forEach((k) => {
          const u = Date.parse(mapa[k].ultima || mapa[k].primera);
          if (u && ahora - u > 60 * 86400000) {
            delete mapa[k];
            cambio = true;
          }
        });
        if (!cambio) {
          res.status(200).json({ ok: true, sinCambios: true });
          return;
        }
        contenidoAGuardar = mapa;
      }

      let avisoDesactualizado = null;
      if (nombreColeccion === "datos_equipo") {
        const lista = Array.isArray(contenidoExistente) ? contenidoExistente.slice() : [];
        const txt = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
        const ahoraIso = new Date().toISOString();
        const accion = body && body.accion;
        // Quién es sale del pase de la sesión (no de lo que mande la página).
        const esOficina = !!(autorizacion && autorizacion.rol === "admin");
        const nombreSesion = autorizacion && autorizacion.tipo === "sesion" ? String(autorizacion.nombre || "").trim() : "";
        const autor = esOficina ? (nombreSesion && nombreSesion !== "Clave general" ? `Oficina (${nombreSesion})` : "Oficina") : (nombreSesion || txt(body && body.autor, 60) || "Sin nombre");
        const fotosDe = (v) => (Array.isArray(v) ? v : []).map(String).filter((x) => /^[a-f0-9]{16}$/.test(x)).slice(0, 8);
        // Cada edición guarda cómo estaba antes, para poder volver atrás.
        const foto = (d) => ({ titulo: d.titulo, contenido: d.contenido, categoria: d.categoria, fotos: d.fotos || [] });
        const conVersiones = (ediciones) => ediciones.slice(-30).map((e, k, arr) => (k < arr.length - 10 && e.antes ? { autor: e.autor, fecha: e.fecha, accion: e.accion } : e));
        if (accion === "crear") {
          const titulo = txt(body.titulo, 150);
          const contenido = txt(body.contenido, 6000);
          if (!titulo || !contenido) { res.status(400).json({ error: "Falta el título o el contenido" }); return; }
          if (lista.length >= 2000) { res.status(400).json({ error: "Se llegó al máximo de datos guardados" }); return; }
          lista.unshift({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            titulo, contenido, categoria: txt(body.categoria, 60) || "General",
            origen: body.origen === "ia" ? "ia" : "tecnico", fotos: fotosDe(body.fotos),
            autor, fecha: ahoraIso, ediciones: [],
          });
        } else if (accion === "editar") {
          const i = lista.findIndex((d) => d.id === body.id);
          if (i === -1) { res.status(404).json({ error: "Ese dato ya no existe (puede que alguien lo haya borrado)" }); return; }
          const titulo = txt(body.titulo, 150);
          const contenido = txt(body.contenido, 6000);
          if (!titulo || !contenido) { res.status(400).json({ error: "Falta el título o el contenido" }); return; }
          const previo = lista[i];
          const nuevo = { ...previo, titulo, contenido, categoria: txt(body.categoria, 60) || previo.categoria || "General", fotos: body.fotos !== undefined ? fotosDe(body.fotos) : previo.fotos || [] };
          if (JSON.stringify(foto(nuevo)) === JSON.stringify(foto(previo))) { res.status(200).json({ ok: true, lista, sinCambios: true }); return; }
          nuevo.ediciones = conVersiones([...(previo.ediciones || []), { autor, fecha: ahoraIso, antes: foto(previo) }]);
          // Si alguien lo corrigió, los avisos de "desactualizado" quedan resueltos.
          if ((nuevo.reportes || []).length) { nuevo.reportes_resueltos = [...(previo.reportes_resueltos || []), ...nuevo.reportes.map((x) => ({ ...x, resuelto_por: autor, resuelto: ahoraIso }))].slice(-10); nuevo.reportes = []; }
          lista[i] = nuevo;
        } else if (accion === "util") {
          // "Me sirvió": cada uno suma una vez (tocar de nuevo lo saca).
          const i = lista.findIndex((d) => d.id === body.id);
          if (i === -1) { res.status(404).json({ error: "Ese dato ya no existe" }); return; }
          const utiles = (lista[i].utiles || []).filter((n) => n !== autor);
          if (utiles.length === (lista[i].utiles || []).length) utiles.push(autor);
          lista[i] = { ...lista[i], utiles: utiles.slice(-200) };
        } else if (accion === "desactualizado") {
          const i = lista.findIndex((d) => d.id === body.id);
          if (i === -1) { res.status(404).json({ error: "Ese dato ya no existe" }); return; }
          const nota = txt(body.nota, 300);
          lista[i] = { ...lista[i], reportes: [...(lista[i].reportes || []).filter((x) => x.autor !== autor), { autor, fecha: ahoraIso, nota }].slice(-10) };
          avisoDesactualizado = { dato: lista[i], autor, nota };
        } else if (accion === "resolver_reporte") {
          const i = lista.findIndex((d) => d.id === body.id);
          if (i === -1) { res.status(404).json({ error: "Ese dato ya no existe" }); return; }
          const reps = lista[i].reportes || [];
          lista[i] = { ...lista[i], reportes: [], reportes_resueltos: [...(lista[i].reportes_resueltos || []), ...reps.map((x) => ({ ...x, resuelto_por: autor, resuelto: ahoraIso }))].slice(-10) };
        } else if (accion === "restaurar") {
          const i = lista.findIndex((d) => d.id === body.id);
          if (i === -1) { res.status(404).json({ error: "Ese dato ya no existe" }); return; }
          const previo = lista[i];
          const ed = (previo.ediciones || [])[Number(body.edicion)];
          if (!ed || !ed.antes) { res.status(404).json({ error: "Esa versión ya no está guardada" }); return; }
          lista[i] = { ...previo, ...ed.antes, ediciones: conVersiones([...(previo.ediciones || []), { autor, fecha: ahoraIso, accion: "restaurar", antes: foto(previo) }]) };
        } else if (accion === "borrar") {
          const i = lista.findIndex((d) => d.id === body.id);
          if (i === -1) { res.status(404).json({ error: "Ese dato ya no existe" }); return; }
          // Lo puede borrar quien lo cargó, o la oficina desde el panel admin.
          if (!esOficina && lista[i].autor !== autor) { res.status(403).json({ error: "Solo lo puede borrar quien lo cargó, o la oficina" }); return; }
          lista.splice(i, 1);
        } else {
          res.status(400).json({ error: "Acción inválida" });
          return;
        }
        contenidoAGuardar = lista;
      }

      if (nombreColeccion === "errores_app") {
        // El registro de errores se agrega (máx. 200, los más nuevos primero)
        // y se puede vaciar con { accion: "limpiar" }.
        const lista = Array.isArray(contenidoExistente) ? contenidoExistente : [];
        if (body && body.accion === "limpiar") {
          contenidoAGuardar = [];
        } else if (body && typeof body === "object" && !Array.isArray(body)) {
          const nuevo = {
            fecha: new Date().toISOString(),
            mensaje: String(body.mensaje || "").slice(0, 500),
            origen: String(body.origen || "").slice(0, 200),
            pila: String(body.pila || "").slice(0, 1500),
            version: String(body.version || "").slice(0, 20),
            tecnico: String(body.tecnico || "").slice(0, 60),
            pantalla: String(body.pantalla || "").slice(0, 60),
            dispositivo: String(body.dispositivo || "").slice(0, 200),
            veces: 1,
          };
          const dup = lista.findIndex((e) => e.mensaje === nuevo.mensaje && e.origen === nuevo.origen && e.tecnico === nuevo.tecnico && e.version === nuevo.version);
          if (dup !== -1) {
            const previo = lista[dup];
            const resto = lista.filter((_, i) => i !== dup);
            contenidoAGuardar = [{ ...previo, fecha: nuevo.fecha, veces: (previo.veces || 1) + 1 }, ...resto].slice(0, 200);
          } else {
            contenidoAGuardar = [nuevo, ...lista].slice(0, 200);
          }
        } else {
          res.status(400).json({ error: "Formato inválido" });
          return;
        }
      }

      const contentB64 = Buffer.from(JSON.stringify(contenidoAGuardar, null, 2)).toString("base64");
      const putRes = await fetch(apiUrl, {
        method: "PUT",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Actualiza ${nombreColeccion} (${new Date().toISOString()})`,
          content: contentB64,
          sha,
        }),
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        res.status(502).json({ error: `No se pudo guardar ${nombreColeccion}`, detail: errText });
        return;
      }

      // Si se acaba de cargar un servicio de emergencia nuevo, se
      // avisa a todo el equipo — puede ser relevante para cualquiera
      // que esté revisando la agenda, no solo para quien lo cargó.
      if (entradasEmergenciaNuevas.length > 0) {
        try {
          const { enviarATodos } = require("../lib/push-sender");
          for (const entrada of entradasEmergenciaNuevas) {
            await enviarATodos({
              titulo: "🚨 Servicio de emergencia agendado",
              cuerpo: `${entrada.cargado_por || "Alguien"} cargó un servicio para ${entrada.cliente || "un cliente"}${entrada.fecha_deseada ? " el " + entrada.fecha_deseada : ""} — revisalo en Cronograma.`,
              url: "/",
            });
          }
        } catch (errPush) {
          // si falla el envío del aviso, no se rompe el guardado en sí
        }
      }

      if (nombreColeccion === "datos_equipo") {
        // Dato nuevo: se le avisa al resto del equipo (no a quien lo cargó).
        // Se espera antes de responder (en Vercel, lo de después puede no correr).
        if (body && body.accion === "crear" && contenidoAGuardar[0]) {
          const nuevo = contenidoAGuardar[0];
          try {
            const { enviarATodos } = require("../lib/push-sender");
            await Promise.race([
              enviarATodos({
                titulo: "📘 Nuevo dato del equipo",
                cuerpo: `${String(nuevo.autor || "Alguien").replace(/^Oficina \((.+)\)$/, "$1 (oficina)")}: ${nuevo.titulo}${(nuevo.fotos || []).length ? " (con fotos)" : ""}`.slice(0, 160),
                url: `/?ir=dato-equipo&id=${encodeURIComponent(nuevo.id)}`,
                excluir: nuevo.autor,
              }),
              new Promise((ok) => setTimeout(ok, 5000)),
            ]);
          } catch (errPush) { /* si falla el aviso, el dato igual quedó guardado */ }
        }
        // A quien lo cargó le avisan que puede estar desactualizado.
        if (avisoDesactualizado && avisoDesactualizado.dato.autor && avisoDesactualizado.dato.autor !== avisoDesactualizado.autor && !/^Oficina/.test(avisoDesactualizado.dato.autor)) {
          try {
            const { enviarASeleccionados } = require("../lib/push-sender");
            const a = avisoDesactualizado;
            await Promise.race([
              enviarASeleccionados([a.dato.autor], { titulo: "⚠️ Revisá un dato que cargaste", cuerpo: `${a.autor} avisa que «${a.dato.titulo}» puede estar desactualizado${a.nota ? ": " + a.nota : ""}`.slice(0, 180), url: `/?ir=dato-equipo&id=${encodeURIComponent(a.dato.id)}` }),
              new Promise((ok) => setTimeout(ok, 5000)),
            ]);
          } catch (errPush) { /* si falla el aviso, igual quedó marcado */ }
        }
        res.status(200).json({ ok: true, lista: contenidoAGuardar });
        return;
      }
      res.status(200).json({ ok: true, count: Array.isArray(body) ? body.length : undefined });
    } catch (err) {
      res.status(500).json({ error: `Error interno al guardar ${nombreColeccion}` });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
});
