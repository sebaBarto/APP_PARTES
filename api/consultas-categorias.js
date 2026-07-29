// Función serverless de Vercel — guarda y sirve las categorías de
// consultas (ej: "Alarmas") y la carpeta de Drive donde están los
// manuales de cada una. Administrable desde admin.html.
//
// Variables de entorno reutilizadas:
//   SERVICIOS_API_TOKEN, GITHUB_DATA_TOKEN, GITHUB_DATA_REPO

const CATEGORIAS_PATH = "consultas-categorias.json";

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

  const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${CATEGORIAS_PATH}`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_DATA_TOKEN}`,
    Accept: "application/vnd.github+json",
  };

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    try {
      const r = await fetch(apiUrl, { headers: ghHeaders });
      if (r.status === 404) {
        res.status(200).json([]);
        return;
      }
      if (!r.ok) {
        res.status(502).json({ error: "No se pudo leer las categorías de consultas" });
        return;
      }
      const data = await r.json();
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      res.status(200).json(JSON.parse(content));
    } catch (err) {
      res.status(500).json({ error: "Error interno al leer las categorías de consultas" });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      if (!Array.isArray(body)) {
        res.status(400).json({ error: "El cuerpo debe ser un array de categorías" });
        return;
      }

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
          message: `Actualiza categorías de consultas (${new Date().toISOString()})`,
          content: contentB64,
          sha,
        }),
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        res.status(502).json({ error: "No se pudo guardar las categorías de consultas", detail: errText });
        return;
      }

      res.status(200).json({ ok: true, count: body.length });
    } catch (err) {
      res.status(500).json({ error: "Error interno al guardar las categorías de consultas" });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
};
