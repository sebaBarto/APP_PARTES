// Función serverless de Vercel — NO se ejecuta en el celular, corre en
// el servidor. Guarda y sirve el listado de servicios pendientes sin
// exponer nunca el archivo como un JSON público.
//
// Desde que el sistema offline de la oficina genera el archivo solo
// (en la carpeta de Drive configurada), el GET intenta leerlo de ahí
// primero — así nadie tiene que subirlo a mano. Si Drive falla o no
// está configurado, cae al último respaldo guardado en GitHub (mismo
// patrón que ya usa el cronograma). La carga manual (POST) sigue
// funcionando igual, como respaldo.
//
// Variables de entorno que hay que configurar en Vercel (Project
// Settings → Environment Variables), NUNCA se escriben acá en el código:
//   SERVICIOS_API_TOKEN   -> misma clave que usan admin.html y app.js
//   GITHUB_DATA_TOKEN     -> Personal Access Token con permiso de
//                            escritura SOLO sobre el repo de datos privado
//   GITHUB_DATA_REPO      -> ej: "sebaBarto/sat-servicios-data"
//   GITHUB_DATA_PATH      -> ej: "servicios.json"
//   SERVICIOS_DRIVE_FOLDER_ID -> nueva: carpeta de Drive donde el
//                                sistema offline deja el archivo
//   GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
//     -> ya existentes (las mismas que usa el cronograma)

const XLSX = require("xlsx");
const { getAccessToken } = require("../lib/google-auth");
const { parsearServiciosPendientes } = require("../lib/servicios-pendientes-parser");

async function leerDesdeDrive() {
  const folderId = process.env.SERVICIOS_DRIVE_FOLDER_ID;
  if (!folderId) return null; // no configurado — el llamador cae al respaldo

  const accessToken = await getAccessToken("https://www.googleapis.com/auth/drive.readonly");
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  // El archivo se regenera cada vez que se carga un servicio nuevo —
  // se busca siempre el más reciente de la carpeta, nunca un ID fijo.
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${folderId}' in parents and trashed = false`
  )}&orderBy=modifiedTime desc&pageSize=1&fields=files(id,mimeType,name,modifiedTime)`;
  const listRes = await fetch(listUrl, { headers: authHeaders });
  if (!listRes.ok) throw new Error("No se pudo listar la carpeta de Drive");
  const listData = await listRes.json();
  const archivo = (listData.files || [])[0];
  if (!archivo) throw new Error("No se encontró ningún archivo en la carpeta de Drive");

  const cacheBust = `_cb=${Date.now()}`;
  let fileRes;
  if (archivo.mimeType === "application/vnd.google-apps.spreadsheet") {
    fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${archivo.id}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet&${cacheBust}`,
      { headers: authHeaders }
    );
  } else {
    fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${archivo.id}?alt=media&${cacheBust}`, {
      headers: authHeaders,
    });
  }
  if (!fileRes.ok) throw new Error(`No se pudo descargar "${archivo.name}" desde Drive`);

  const arrayBuffer = await fileRes.arrayBuffer();
  const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: "buffer" });
  const primeraHoja = workbook.Sheets[workbook.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(primeraHoja, { header: 1, raw: false, defval: "" });

  const { servicios, columnasNoDetectadas } = parsearServiciosPendientes(filas);
  if (columnasNoDetectadas.length > 0) {
    throw new Error(
      `El archivo "${archivo.name}" no tiene estas columnas obligatorias: ${columnasNoDetectadas.join(", ")}`
    );
  }
  return servicios;
}

module.exports = async (req, res) => {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!process.env.SERVICIOS_API_TOKEN || token !== process.env.SERVICIOS_API_TOKEN) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO, GITHUB_DATA_PATH } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO || !GITHUB_DATA_PATH) {
    res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" });
    return;
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${GITHUB_DATA_PATH}`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_DATA_TOKEN}`,
    Accept: "application/vnd.github+json",
  };

  async function guardarRespaldoGitHub(servicios) {
    let sha;
    const existing = await fetch(apiUrl, { headers: ghHeaders });
    if (existing.ok) sha = (await existing.json()).sha;
    const contentB64 = Buffer.from(JSON.stringify(servicios, null, 2)).toString("base64");
    await fetch(apiUrl, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Sincroniza servicios pendientes desde Drive (${new Date().toISOString()})`,
        content: contentB64,
        sha,
      }),
    });
  }

  async function leerRespaldoGitHub() {
    const r = await fetch(apiUrl, { headers: ghHeaders });
    if (r.status === 404) return [];
    if (!r.ok) throw new Error("No se pudo leer el archivo de datos");
    const data = await r.json();
    return JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  }

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    try {
      const desdeDrive = await leerDesdeDrive();
      if (desdeDrive !== null) {
        res.setHeader("X-Servicios-Fuente", "drive");
        guardarRespaldoGitHub(desdeDrive).catch(() => {});
        res.status(200).json(desdeDrive);
        return;
      }
      // SERVICIOS_DRIVE_FOLDER_ID no configurado — sigue el
      // comportamiento de siempre (leer del respaldo directo).
      res.setHeader("X-Servicios-Fuente", "respaldo-sin-configurar");
      const respaldo = await leerRespaldoGitHub();
      res.status(200).json(respaldo);
    } catch (err) {
      // Si Drive falla, no se rompe la app — se usa el último
      // respaldo bueno que haya guardado. Se deja registrado el
      // motivo exacto (visible en Vercel → Logs, y en el header de
      // la respuesta) para poder diagnosticarlo.
      console.error("[servicios] Drive falló, usando respaldo:", err.message);
      res.setHeader("X-Servicios-Fuente", "respaldo-por-error");
      res.setHeader("X-Servicios-Error-Drive", String(err.message || err).slice(0, 200));
      try {
        const respaldo = await leerRespaldoGitHub();
        res.status(200).json(respaldo);
      } catch (err2) {
        res.status(500).json({ error: "Error interno al leer los datos" });
      }
    }
    return;
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      if (!Array.isArray(body)) {
        res.status(400).json({ error: "El cuerpo debe ser un array de servicios" });
        return;
      }

      // Necesitamos el sha actual del archivo para poder actualizarlo
      // (GitHub lo pide así para evitar sobreescribir cambios ajenos).
      let sha;
      const existing = await fetch(apiUrl, { headers: ghHeaders });
      if (existing.ok) {
        const existingData = await existing.json();
        sha = existingData.sha;
      }

      const contentB64 = Buffer.from(JSON.stringify(body, null, 2)).toString("base64");
      const putRes = await fetch(apiUrl, {
        method: "PUT",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Actualiza servicios pendientes (${new Date().toISOString()})`,
          content: contentB64,
          sha,
        }),
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        res.status(502).json({ error: "No se pudo guardar en GitHub", detail: errText });
        return;
      }

      res.status(200).json({ ok: true, count: body.length });
    } catch (err) {
      res.status(500).json({ error: "Error interno al guardar los datos" });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
};
