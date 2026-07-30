// Función serverless de Vercel — sirve y sube fotos guardadas en el
// repo privado de datos (carpeta "fotos/"). Antes eran dos funciones
// separadas (foto.js + upload-foto.js); se unificaron en una sola
// para no gastar dos de los 12 "slots" de funciones del plan gratuito
// de Vercel — el método HTTP (GET/POST) decide qué hace.
//
// GET  /api/foto?id=XXXX        -> muestra la foto (sin login de GitHub)
// POST /api/foto                -> sube una foto nueva, devuelve su id
//
// Variables de entorno:
//   SERVICIOS_API_TOKEN (solo para subir)
//   GITHUB_DATA_TOKEN, GITHUB_DATA_REPO

module.exports = async (req, res) => {
  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
    res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" });
    return;
  }
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_DATA_TOKEN}`,
    Accept: "application/vnd.github+json",
  };

  // ---------- GET: mostrar una foto por su id ----------
  if (req.method === "GET") {
    const { id } = req.query;
    if (!id || !/^[a-f0-9]{16}$/.test(id)) {
      res.status(400).send("Falta indicar qué foto mostrar");
      return;
    }
    try {
      const path = `fotos/${id}.jpg`;
      const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${path}`;
      const r = await fetch(apiUrl, { headers: ghHeaders });
      if (!r.ok) {
        res.status(404).send("No se encontró la foto");
        return;
      }
      const data = await r.json();
      const buffer = Buffer.from(data.content, "base64");
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.status(200).send(buffer);
    } catch (err) {
      res.status(500).send("Error interno al leer la foto");
    }
    return;
  }

  // ---------- POST: subir una foto nueva ----------
  if (req.method === "POST") {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!process.env.SERVICIOS_API_TOKEN || token !== process.env.SERVICIOS_API_TOKEN) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
    try {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      const { base64 } = body || {};
      if (!base64) {
        res.status(400).json({ error: "Falta la imagen" });
        return;
      }

      const contentB64 = base64.replace(/^data:[^;]+;base64,/, "");
      const fileId = require("crypto").randomBytes(8).toString("hex");
      const path = `fotos/${fileId}.jpg`;
      const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${path}`;

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
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
};
