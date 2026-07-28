// Función serverless de Vercel — guarda un registro por cada parte
// completado y enviado con éxito a la oficina. Es la base de datos
// para el dashboard (cantidad de servicios resueltos, tiempos
// promedio, distancia recorrida, clientes repetidos, etc).
//
// Variables de entorno reutilizadas:
//   SERVICIOS_API_TOKEN, GITHUB_DATA_TOKEN, GITHUB_DATA_REPO

const HISTORIAL_PATH = "historial.json";

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

  const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${HISTORIAL_PATH}`;
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
        res.status(502).json({ error: "No se pudo leer el historial" });
        return;
      }
      const data = await r.json();
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      res.status(200).json(JSON.parse(content));
    } catch (err) {
      res.status(500).json({ error: "Error interno al leer el historial" });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Falta el registro a guardar" });
        return;
      }

      let historial = [];
      let sha;
      const existing = await fetch(apiUrl, { headers: ghHeaders });
      if (existing.ok) {
        const existingData = await existing.json();
        sha = existingData.sha;
        historial = JSON.parse(Buffer.from(existingData.content, "base64").toString("utf-8"));
      }

      historial.push({ ...body, registrado_en: new Date().toISOString() });

      const contentB64 = Buffer.from(JSON.stringify(historial, null, 2)).toString("base64");
      const putRes = await fetch(apiUrl, {
        method: "PUT",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Registra parte completado (${new Date().toISOString()})`,
          content: contentB64,
          sha,
        }),
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        res.status(502).json({ error: "No se pudo guardar en el historial", detail: errText });
        return;
      }

      res.status(200).json({ ok: true, total: historial.length });
    } catch (err) {
      res.status(500).json({ error: "Error interno al guardar el historial" });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
};
