// Función serverless de Vercel — NO se ejecuta en el celular, corre en
// el servidor. Guarda y sirve el listado de servicios pendientes sin
// exponer nunca el archivo como un JSON público.
//
// Variables de entorno que hay que configurar en Vercel (Project
// Settings → Environment Variables), NUNCA se escriben acá en el código:
//   SERVICIOS_API_TOKEN   -> misma clave que usan admin.html y app.js
//   GITHUB_DATA_TOKEN     -> Personal Access Token con permiso de
//                            escritura SOLO sobre el repo de datos privado
//   GITHUB_DATA_REPO      -> ej: "sebaBarto/sat-servicios-data"
//   GITHUB_DATA_PATH      -> ej: "servicios.json"

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

  if (req.method === "GET") {
    try {
      const r = await fetch(apiUrl, { headers: ghHeaders });
      if (r.status === 404) {
        res.status(200).json([]);
        return;
      }
      if (!r.ok) {
        res.status(502).json({ error: "No se pudo leer el archivo de datos" });
        return;
      }
      const data = await r.json();
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      res.status(200).json(JSON.parse(content));
    } catch (err) {
      res.status(500).json({ error: "Error interno al leer los datos" });
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
