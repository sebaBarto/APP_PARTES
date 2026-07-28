// Función serverless de Vercel — guarda y sirve el cronograma semanal de
// los técnicos (mismo patrón que /api/servicios.js). Los datos se
// guardan en el mismo repo privado de GitHub, en el archivo
// "cronograma.json".
//
// Variables de entorno reutilizadas (ya configuradas para servicios):
//   SERVICIOS_API_TOKEN, GITHUB_DATA_TOKEN, GITHUB_DATA_REPO

const CRONOGRAMA_PATH = "cronograma.json";

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
      const r = await fetch(apiUrl, { headers: ghHeaders });
      if (r.status === 404) {
        res.status(200).json([]);
        return;
      }
      if (!r.ok) {
        res.status(502).json({ error: "No se pudo leer el cronograma" });
        return;
      }
      const data = await r.json();
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      res.status(200).json(JSON.parse(content));
    } catch (err) {
      res.status(500).json({ error: "Error interno al leer el cronograma" });
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
          message: `Actualiza cronograma semanal (${new Date().toISOString()})`,
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
      res.status(500).json({ error: "Error interno al guardar el cronograma" });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
};
