// Función serverless de Vercel — sube una foto al MISMO repo privado de
// GitHub que ya se usa para los servicios pendientes (no requiere Google
// Cloud ni Drive). Las credenciales viven solo en variables de entorno
// del servidor, nunca llegan al navegador.
//
// Reutiliza las variables de entorno que ya existen para /api/servicios.js:
//   SERVICIOS_API_TOKEN   -> misma clave que ya usan admin.html y app.js
//   GITHUB_DATA_TOKEN     -> mismo token con permiso de escritura sobre el repo de datos
//   GITHUB_DATA_REPO      -> ej: "sebaBarto/sat-servicios-data"
// Las fotos se guardan bajo la carpeta "fotos/" de ese mismo repo.

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

  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
    res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    const { filename, base64 } = body || {};
    if (!base64) {
      res.status(400).json({ error: "Falta la imagen" });
      return;
    }

    const contentB64 = base64.replace(/^data:[^;]+;base64,/, "");
    const fileId = require("crypto").randomBytes(8).toString("hex");
    const path = `fotos/${fileId}.jpg`;

    const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${path}`;
    const ghHeaders = {
      Authorization: `Bearer ${GITHUB_DATA_TOKEN}`,
      Accept: "application/vnd.github+json",
    };

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Sube foto de servicio (${new Date().toISOString()})`,
        content: contentB64,
      }),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      res.status(502).json({ error: "No se pudo guardar la foto en GitHub", detail: errText });
      return;
    }

    res.status(200).json({ ok: true, id: fileId });
  } catch (err) {
    res.status(500).json({ error: "Error interno al subir la foto", detail: String(err.message || err) });
  }
};
