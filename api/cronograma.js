// Función serverless de Vercel — sincroniza el cronograma semanal en
// vivo desde un archivo de Google Drive (de solo lectura), y lo
// respalda en el repo privado de GitHub por si Drive falla o no hay
// conexión con Google en ese momento. También acepta una carga manual
// (POST) desde admin.html como alternativa.
//
// Variables de entorno:
//   SERVICIOS_API_TOKEN                -> ya existente
//   GITHUB_DATA_TOKEN, GITHUB_DATA_REPO -> ya existentes (respaldo)
//   GOOGLE_SERVICE_ACCOUNT_EMAIL        -> ya existente (de la foto)
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  -> ya existente (de la foto)
//   CRONOGRAMA_DRIVE_FILE_ID            -> nueva: ID del archivo en Drive

const XLSX = require("xlsx");
const { getAccessToken } = require("../lib/google-auth");
const { parsearLibroCronograma } = require("../lib/cronograma-parser");

const CRONOGRAMA_PATH = "cronograma.json";

async function leerDesdeDrive() {
  const fileId = process.env.CRONOGRAMA_DRIVE_FILE_ID;
  if (!fileId) throw new Error("Falta configurar CRONOGRAMA_DRIVE_FILE_ID");

  const accessToken = await getAccessToken("https://www.googleapis.com/auth/drive.readonly");
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  // Primero consultamos el tipo de archivo: puede ser un Excel subido
  // tal cual (se descarga directo) o una Hoja de cálculo de Google
  // (hay que exportarla a formato xlsx).
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`,
    { headers: authHeaders }
  );
  if (!metaRes.ok) throw new Error("No se pudo leer metadata del archivo en Drive");
  const meta = await metaRes.json();

  let fileRes;
  if (meta.mimeType === "application/vnd.google-apps.spreadsheet") {
    fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
      { headers: authHeaders }
    );
  } else {
    fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: authHeaders }
    );
  }
  if (!fileRes.ok) throw new Error("No se pudo descargar el archivo desde Drive");

  const arrayBuffer = await fileRes.arrayBuffer();
  const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: "buffer" });
  return parsearLibroCronograma(XLSX, workbook);
}

async function leerRespaldoGitHub(ghHeaders, apiUrl) {
  const r = await fetch(apiUrl, { headers: ghHeaders });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error("No se pudo leer el respaldo del cronograma");
  const data = await r.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return JSON.parse(content);
}

async function guardarRespaldoGitHub(ghHeaders, apiUrl, tareas) {
  let sha;
  const existing = await fetch(apiUrl, { headers: ghHeaders });
  if (existing.ok) {
    const existingData = await existing.json();
    sha = existingData.sha;
  }
  const contentB64 = Buffer.from(JSON.stringify(tareas, null, 2)).toString("base64");
  await fetch(apiUrl, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Sincroniza cronograma desde Drive (${new Date().toISOString()})`,
      content: contentB64,
      sha,
    }),
  });
}

module.exports = async (req, res) => {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!process.env.SERVICIOS_API_TOKEN || token !== process.env.SERVICIOS_API_TOKEN) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
    res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" });
    return;
  }
  const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${CRONOGRAMA_PATH}`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_DATA_TOKEN}`,
    Accept: "application/vnd.github+json",
  };

  if (req.method === "GET") {
    try {
      const tareas = await leerDesdeDrive();
      guardarRespaldoGitHub(ghHeaders, apiUrl, tareas).catch(() => {});
      res.status(200).json(tareas);
    } catch (err) {
      try {
        const respaldo = await leerRespaldoGitHub(ghHeaders, apiUrl);
        res.status(200).json(respaldo);
      } catch (err2) {
        res.status(502).json({ error: "No se pudo leer el cronograma", detail: String(err.message || err) });
      }
    }
    return;
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      if (!Array.isArray(body)) {
        res.status(400).json({ error: "El cuerpo debe ser un array de tareas" });
        return;
      }
      await guardarRespaldoGitHub(ghHeaders, apiUrl, body);
      res.status(200).json({ ok: true, count: body.length });
    } catch (err) {
      res.status(500).json({ error: "Error interno al guardar el cronograma" });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
};
