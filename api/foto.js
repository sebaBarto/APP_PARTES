// Función serverless de Vercel — sirve una foto guardada en el repo
// privado de datos, para que el link del mail funcione con un simple
// clic (sin pedir login de GitHub). No hace falta ningún token en la
// URL: cada foto tiene un identificador aleatorio (16 caracteres) que
// funciona como clave única — sin ese id exacto, no hay forma de
// adivinar ni listar las fotos.
//
// Reutiliza las variables de entorno ya existentes:
//   GITHUB_DATA_TOKEN, GITHUB_DATA_REPO

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).send("Método no permitido");
    return;
  }

  const { id } = req.query;
  if (!id || !/^[a-f0-9]{16}$/.test(id)) {
    res.status(400).send("Falta indicar qué foto mostrar");
    return;
  }

  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
    res.status(500).send("Faltan variables de entorno por configurar en Vercel");
    return;
  }

  try {
    const path = `fotos/${id}.jpg`;
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
