// Función serverless de Vercel — sirve y sube archivos guardados en el
// repo privado de datos. Antes eran dos funciones separadas
// (foto.js + upload-foto.js); se unificaron en una sola para no
// gastar dos de los 12 "slots" de funciones del plan gratuito de
// Vercel — el método HTTP (GET/POST) decide qué hace.
//
// Guarda dos tipos de archivo, en carpetas separadas:
//   tipo "imagen" (default) -> fotos/<id>.jpg
//   tipo "pdf"               -> documentos/<id>.pdf
// (agregado para los PDFs de comodato — mismo storage, misma lógica,
// solo cambia la carpeta/extensión/content-type según el tipo).
//
// GET  /api/foto?id=XXXX[&tipo=pdf]  -> muestra el archivo (sin login de GitHub)
// POST /api/foto                     -> sube un archivo nuevo (body: {base64, tipo}), devuelve su id
//
// Variables de entorno:
//   SERVICIOS_API_TOKEN (solo para subir)
//   GITHUB_DATA_TOKEN, GITHUB_DATA_REPO

function rutaYContentType(tipo, id) {
  if (tipo === "pdf") {
    return { path: `documentos/${id}.pdf`, contentType: "application/pdf" };
  }
  return { path: `fotos/${id}.jpg`, contentType: "image/jpeg" };
}

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

  // ---------- GET: mostrar un archivo por su id ----------
  if (req.method === "GET") {
    const { id, tipo } = req.query;
    if (!id || !/^[a-f0-9]{16}$/.test(id)) {
      res.status(400).send("Falta indicar qué archivo mostrar");
      return;
    }
    try {
      const { path, contentType } = rutaYContentType(tipo, id);
      const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${path}`;
      const r = await fetch(apiUrl, { headers: ghHeaders });
      if (!r.ok) {
        res.status(404).send("No se encontró el archivo");
        return;
      }
      const data = await r.json();
      const buffer = Buffer.from(data.content, "base64");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.status(200).send(buffer);
    } catch (err) {
      res.status(500).send("Error interno al leer el archivo");
    }
    return;
  }

  // ---------- POST: subir un archivo nuevo ----------
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
      const { base64, tipo } = body || {};
      if (!base64) {
        res.status(400).json({ error: "Falta el archivo" });
        return;
      }

      const contentB64 = base64.replace(/^data:[^;]+;base64,/, "");
      const fileId = require("crypto").randomBytes(8).toString("hex");
      const { path } = rutaYContentType(tipo, fileId);
      const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${path}`;

      const putRes = await fetch(apiUrl, {
        method: "PUT",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Sube ${tipo === "pdf" ? "PDF" : "foto"} (${new Date().toISOString()})`,
          content: contentB64,
        }),
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        res.status(502).json({ error: "No se pudo guardar el archivo en GitHub", detail: errText });
        return;
      }

      res.status(200).json({ ok: true, id: fileId });
    } catch (err) {
      res.status(500).json({ error: "Error interno al subir el archivo", detail: String(err.message || err) });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
};
