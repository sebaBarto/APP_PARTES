// Función serverless de Vercel — planos de cableado en PDF, uno por
// cliente/sitio. Se leen en vivo desde una carpeta de Google Drive
// (de solo lectura) — mismo patrón que ya usa el Cronograma. Cada
// archivo tiene que llamarse "CLI_XXXXXX.pdf", donde XXXXXX es el
// mismo número de cliente que la pestaña "Clientes" de admin.html.
//
// Nota: esto es una solución de paso — más adelante, cuando se migre
// a Cloudflare, los planos van a vivir en R2 (ver sync-local-planos/
// en el proyecto nuevo). Mientras tanto, Drive evita tener que subir
// ~1000 archivos a mano.
//
// A diferencia de las fotos (que no piden token porque van embebidas
// en mails), acá SIEMPRE se exige el token de acceso — son datos más
// sensibles (muestran cómo está armada la seguridad de un cliente) y
// solo se ven adentro de la app, nunca en un mail.
//
// GET  /api/planos                 -> lista los nombres de archivo disponibles
// GET  /api/planos?nombre=XXXX     -> devuelve ese PDF puntual
//
// Variables de entorno:
//   SERVICIOS_API_TOKEN
//   GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (ya existentes)
//   PLANOS_DRIVE_FOLDER_ID  -> nueva: carpeta de Drive con los PDF de planos

const { getAccessToken } = require("../lib/google-auth");

async function listarPlanosDeDrive(authHeaders, folderId) {
  const planos = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`,
      fields: "nextPageToken, files(id,name,size)",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, { headers: authHeaders });
    if (!res.ok) throw new Error("No se pudo listar la carpeta de Drive de planos");
    const data = await res.json();
    (data.files || []).forEach((f) => {
      if (f.name.toLowerCase().endsWith(".pdf")) {
        planos.push({ id: f.id, nombre: f.name.replace(/\.pdf$/i, ""), tamano_kb: Math.round((Number(f.size) || 0) / 1024) });
      }
    });
    pageToken = data.nextPageToken;
  } while (pageToken);
  return planos;
}

module.exports = async (req, res) => {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!process.env.SERVICIOS_API_TOKEN || token !== process.env.SERVICIOS_API_TOKEN) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const folderId = process.env.PLANOS_DRIVE_FOLDER_ID;
  if (!folderId) {
    res.status(500).json({ error: "Falta configurar PLANOS_DRIVE_FOLDER_ID en Vercel" });
    return;
  }

  let authHeaders;
  try {
    const accessToken = await getAccessToken("https://www.googleapis.com/auth/drive.readonly");
    authHeaders = { Authorization: `Bearer ${accessToken}` };
  } catch (err) {
    res.status(500).json({ error: "No se pudo autenticar con Google Drive", detail: String(err.message || err) });
    return;
  }

  if (req.method === "GET") {
    const { nombre } = req.query;

    // ---------- Traer un plano puntual ----------
    if (nombre) {
      try {
        const planos = await listarPlanosDeDrive(authHeaders, folderId);
        const plano = planos.find((p) => p.nombre === nombre);
        if (!plano) {
          res.status(404).json({ error: "No se encontró ese plano" });
          return;
        }
        const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${plano.id}?alt=media`, { headers: authHeaders });
        if (!fileRes.ok) {
          res.status(502).json({ error: "No se pudo descargar el plano desde Drive" });
          return;
        }
        const buffer = Buffer.from(await fileRes.arrayBuffer());
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.status(200).send(buffer);
      } catch (err) {
        res.status(500).json({ error: "Error interno al leer el plano", detail: String(err.message || err) });
      }
      return;
    }

    // ---------- Listar todos los planos disponibles ----------
    try {
      const planos = await listarPlanosDeDrive(authHeaders, folderId);
      res.setHeader("Cache-Control", "private, max-age=120");
      res.status(200).json(planos.map(({ nombre, tamano_kb }) => ({ nombre, tamano_kb })));
    } catch (err) {
      res.status(500).json({ error: "Error interno al listar los planos", detail: String(err.message || err) });
    }
    return;
  }

  if (req.method === "POST") {
    // Mientras la fuente de los planos sea Drive, cargar uno nuevo es
    // simplemente subir el PDF a esa carpeta compartida (con el
    // nombre CLI_XXXXXX.pdf) — no hay nada que guardar acá.
    res.status(400).json({
      error: "Los planos ahora se cargan subiendo el PDF directo a la carpeta de Google Drive compartida (nombrado CLI_XXXXXX.pdf) — no desde acá.",
    });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
};
