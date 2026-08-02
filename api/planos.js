// Función serverless de Vercel — planos de cableado en PDF, uno o
// varios por cliente. Se guardan en Cloudflare R2 (almacenamiento de
// objetos, compatible con la API de S3) — NO en el repositorio de
// GitHub, a propósito: son ~1000 archivos y van a seguir creciendo,
// y un repositorio de Git no está pensado para tantos archivos
// binarios (cada reemplazo queda guardado para siempre, sin borrar
// nunca la versión vieja). R2 tiene 10 GB gratis por mes, de sobra
// para esto, y nunca cobra por las descargas.
//
// A diferencia de las fotos (que no piden token porque van embebidas
// en mails), acá SIEMPRE se exige el token de acceso — son datos más
// sensibles (muestran cómo está armada la seguridad de un cliente) y
// solo se ven adentro de la app, nunca en un mail.
//
// GET  /api/planos                 -> lista los nombres de archivo disponibles
// GET  /api/planos?nombre=XXXX     -> devuelve ese PDF puntual
// POST /api/planos                 -> sube (o reemplaza) un plano
//
// Variables de entorno:
//   SERVICIOS_API_TOKEN
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME

const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

// Nunca se usa el nombre de archivo tal cual para armar la clave sin
// antes limpiarlo — se mantienen nombres prolijos y sin caracteres
// problemáticos.
function limpiarNombreArchivo(nombre) {
  return String(nombre || "")
    .normalize("NFC")
    .replace(/[\/\\]/g, "-")
    .replace(/\.\./g, "-")
    .replace(/[^\p{L}\p{N}\s\-_.,()]/gu, "")
    .trim()
    .slice(0, 150);
}

function clienteR2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

// Junta un stream en un solo Buffer (el SDK de R2 devuelve el cuerpo
// como stream, no como buffer directo).
async function streamABuffer(stream) {
  const partes = [];
  for await (const parte of stream) {
    partes.push(Buffer.isBuffer(parte) ? parte : Buffer.from(parte));
  }
  return Buffer.concat(partes);
}

module.exports = async (req, res) => {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!process.env.SERVICIOS_API_TOKEN || token !== process.env.SERVICIOS_API_TOKEN) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    res.status(500).json({ error: "Faltan variables de entorno de R2 por configurar en Vercel" });
    return;
  }
  const s3 = clienteR2();

  if (req.method === "GET") {
    const { nombre } = req.query;

    // ---------- Traer un plano puntual ----------
    if (nombre) {
      const limpio = limpiarNombreArchivo(nombre);
      if (!limpio) {
        res.status(400).json({ error: "Nombre de archivo inválido" });
        return;
      }
      try {
        const resultado = await s3.send(new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: `${limpio}.pdf`,
        }));
        const buffer = await streamABuffer(resultado.Body);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.status(200).send(buffer);
      } catch (err) {
        if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
          res.status(404).json({ error: "No se encontró ese plano" });
        } else {
          res.status(500).json({ error: "Error interno al leer el plano" });
        }
      }
      return;
    }

    // ---------- Listar todos los planos disponibles ----------
    try {
      let planos = [];
      let continuationToken;
      do {
        const resultado = await s3.send(new ListObjectsV2Command({
          Bucket: R2_BUCKET_NAME,
          ContinuationToken: continuationToken,
        }));
        (resultado.Contents || []).forEach((obj) => {
          if (obj.Key.toLowerCase().endsWith(".pdf")) {
            planos.push({
              nombre: obj.Key.replace(/\.pdf$/i, ""),
              tamano_kb: Math.round((obj.Size || 0) / 1024),
            });
          }
        });
        continuationToken = resultado.IsTruncated ? resultado.NextContinuationToken : undefined;
      } while (continuationToken);

      res.setHeader("Cache-Control", "private, max-age=120");
      res.status(200).json(planos);
    } catch (err) {
      res.status(500).json({ error: "Error interno al listar los planos", detail: String(err.message || err) });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      const { nombre_archivo, base64 } = body || {};
      const limpio = limpiarNombreArchivo(nombre_archivo);
      if (!limpio || !base64) {
        res.status(400).json({ error: "Falta el nombre del archivo o el PDF" });
        return;
      }

      const contentB64 = base64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(contentB64, "base64");

      await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: `${limpio}.pdf`,
        Body: buffer,
        ContentType: "application/pdf",
      }));

      res.status(200).json({ ok: true, nombre: limpio });
    } catch (err) {
      res.status(500).json({ error: "Error interno al subir el plano", detail: String(err.message || err) });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
};
