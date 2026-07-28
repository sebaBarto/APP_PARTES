// Función serverless de Vercel — sirve una foto guardada en el repo
// privado de datos, para que el link del mail funcione con un simple
// clic (sin pedir login de GitHub). Se protege con un token de SOLO
// LECTURA distinto al que usa la app para escribir datos, así si este
// link circula por mail no compromete nada más que la vista de fotos.
//
// Variable de entorno nueva a configurar en Vercel:
//   FOTOS_LINK_TOKEN   -> clave larga y aleatoria, distinta de SERVICIOS_API_TOKEN
// Reutiliza además GITHUB_DATA_TOKEN y GITHUB_DATA_REPO ya existentes.

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { token, path } = req.query;
  if (!process.env.FOTOS_LINK_TOKEN || token !== process.env.FOTOS_LINK_TOKEN) {
    res.status(401).send("No autorizado");
    return;
  }
  if (!path || !path.startsWith("fotos/")) {
    res.status(400).send("Falta indicar qué foto mostrar");
    return;
  }

  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
    res.status(500).send("Faltan variables de entorno por configurar en Vercel");
    return;
  }

  try {
    const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${path}`;
    const r = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${GITHUB_DATA_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    });
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
};
