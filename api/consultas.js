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
  )}&fields=files(id,name,size)&pageSize=50`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error("No se pudo listar los manuales de esa categoría en Drive");
  const data = await r.json();
  return data.files || [];
}

async function descargarArchivo(accessToken, fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error("No se pudo descargar un manual desde Drive");
  const buffer = Buffer.from(await r.arrayBuffer());
  return buffer;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!process.env.SERVICIOS_API_TOKEN || token !== process.env.SERVICIOS_API_TOKEN) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO, GEMINI_API_KEY } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
    res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" });
    return;
  }
  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel" });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    const { categoria, pregunta } = body || {};
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
    const archivos = await listarArchivosCarpeta(accessToken, cat.carpeta_drive_id);
    if (archivos.length === 0) {
      res.status(404).json({ error: "No hay manuales (PDF) en la carpeta de esa categoría" });
      return;
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

    const promptTexto =
      `Sos un asistente técnico para instaladores de sistemas de seguridad electrónica ` +
      `(alarmas, cámaras, control de accesos). Respondé la siguiente pregunta del técnico ` +
      `basándote ÚNICAMENTE en el contenido de los manuales adjuntos. Si la respuesta no ` +
      `está en los manuales, decilo claramente en vez de inventar algo. Sé concreto y breve, ` +
      `como para leer rápido desde un celular.\n\nPregunta: ${pregunta}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [...partesDocumentos, { text: promptTexto }] }],
        }),
      }
    );
    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
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
    });
  } catch (err) {
    res.status(500).json({ error: "Error interno al procesar la consulta", detail: String(err.message || err) });
  }
};
