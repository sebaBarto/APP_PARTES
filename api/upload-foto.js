// Función serverless de Vercel — sube una foto a una carpeta de Google
// Drive usando una cuenta de servicio (service account), y devuelve el
// link para verla. Las credenciales viven SOLO en variables de entorno
// del servidor, nunca llegan al navegador.
//
// Variables de entorno a configurar en Vercel:
//   SERVICIOS_API_TOKEN            -> misma clave que ya usan admin.html y app.js
//   GOOGLE_SERVICE_ACCOUNT_EMAIL    -> "client_email" del JSON de la cuenta de servicio
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY -> "private_key" del mismo JSON (con los \n tal cual)
//   GOOGLE_DRIVE_FOLDER_ID          -> ID de la carpeta de Drive donde se guardan las fotos

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    throw new Error("Faltan las credenciales de Google en las variables de entorno");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const crypto = require("crypto");
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${unsigned}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error("No se pudo autenticar con Google: " + JSON.stringify(tokenData));
  }
  return tokenData.access_token;
}

async function subirArchivo(accessToken, { filename, mimeType, buffer }) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const boundary = "sat_foto_boundary_" + Date.now();
  const metadata = { name: filename, parents: folderId ? [folderId] : undefined };

  const bodyParts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  ];
  const multipartBody = Buffer.concat([
    Buffer.from(bodyParts[0], "utf-8"),
    Buffer.from(bodyParts[1], "utf-8"),
    buffer,
    Buffer.from(`\r\n--${boundary}--`, "utf-8"),
  ]);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok) {
    throw new Error("No se pudo subir el archivo a Drive: " + JSON.stringify(uploadData));
  }
  return uploadData;
}

async function hacerPublico(accessToken, fileId) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!process.env.SERVICIOS_API_TOKEN || token !== process.env.SERVICIOS_API_TOKEN) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    const { filename, mimeType, base64 } = body || {};
    if (!base64 || !mimeType) {
      res.status(400).json({ error: "Falta la imagen o el tipo de archivo" });
      return;
    }

    const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
    const nombreFinal = filename || `foto-${Date.now()}.jpg`;

    const accessToken = await getAccessToken();
    const uploaded = await subirArchivo(accessToken, { filename: nombreFinal, mimeType, buffer });
    await hacerPublico(accessToken, uploaded.id);

    res.status(200).json({ ok: true, link: uploaded.webViewLink });
  } catch (err) {
    res.status(500).json({ error: "Error interno al subir la foto", detail: String(err.message || err) });
  }
};
