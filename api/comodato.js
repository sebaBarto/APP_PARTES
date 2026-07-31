// Función serverless de Vercel — genera el PDF del contrato de
// comodato ya completado y firmado, y lo manda por mail a la oficina
// y al cliente (si cargó su mail). El envío a oficina es el que
// importa para que la app considere el comodato "enviado" — mientras
// no se confirme, la app lo reintenta sola y no lo descarta del
// celular del técnico.
//
// Variables de entorno reutilizadas:
//   SERVICIOS_API_TOKEN, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
//   OFICINA_EMAIL

const nodemailer = require("nodemailer");
const { generarComodatoPDF } = require("../lib/pdf-comodato");

let transporterCache = null;
function getTransporter() {
  if (transporterCache) return transporterCache;
  const puerto = Number(process.env.SMTP_PORT || 465);
  transporterCache = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    secure: puerto === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000, // el PDF pesa más que un mail de texto, un poco más de margen
  });
  return transporterCache;
}

const CAMPOS_OBLIGATORIOS = [
  "comodatario", "direccion_comodatario", "ciudad_comodatario", "representado_por",
  "bienes", "abono_mensual", "dia", "mes", "anio",
  "aclaracion_comodatario", "cargo_comodatario", "dni_comodatario",
];

module.exports = async (req, res) => {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!process.env.SERVICIOS_API_TOKEN || token !== process.env.SERVICIOS_API_TOKEN) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Método no permitido" });
    return;
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.OFICINA_EMAIL) {
    res.status(500).json({ error: "Faltan variables de entorno de SMTP/oficina por configurar en Vercel" });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    const { datos, firma_comodatario_base64, cliente_email } = body || {};

    if (!datos) {
      res.status(400).json({ error: "Faltan los datos del comodato" });
      return;
    }
    const faltantes = CAMPOS_OBLIGATORIOS.filter((c) => !datos[c]);
    if (faltantes.length > 0) {
      res.status(400).json({ error: `Faltan datos: ${faltantes.join(", ")}` });
      return;
    }
    if (!firma_comodatario_base64) {
      res.status(400).json({ error: "Falta la firma del comodatario" });
      return;
    }

    const pdfBytes = await generarComodatoPDF(datos, firma_comodatario_base64);
    const nombreArchivo = `Comodato - ${datos.comodatario} - ${datos.dia}-${datos.mes}-${datos.anio}.pdf`;
    const transporter = getTransporter();

    let oficinaOk = false;
    let clienteOk = false;

    try {
      await transporter.sendMail({
        from: `"Servicio Técnico SAT" <${process.env.SMTP_USER}>`,
        to: process.env.OFICINA_EMAIL,
        subject: `Comodato firmado - ${datos.comodatario}`,
        text: `Se firmó un contrato de comodato con ${datos.comodatario}. Se adjunta el PDF.`,
        attachments: [{ filename: nombreArchivo, content: Buffer.from(pdfBytes) }],
      });
      oficinaOk = true;
    } catch (err) {
      // No se pudo confirmar la llegada a oficina — se informa así
      // tal cual al que llamó, para que la app guarde esto en la cola
      // y lo reintente solo más tarde, en vez de darlo por enviado.
      res.status(502).json({ error: "No se pudo enviar el comodato a la oficina", detail: String(err.message || err), oficinaOk: false, clienteOk: false });
      return;
    }

    if (cliente_email) {
      try {
        await transporter.sendMail({
          from: `"Servicio Técnico SAT" <${process.env.SMTP_USER}>`,
          to: cliente_email,
          subject: `Tu contrato de comodato - ${datos.comodatario}`,
          text: `Hola, te enviamos una copia del contrato de comodato firmado. Cualquier consulta, contactanos a través de www.sat365.com.ar.`,
          attachments: [{ filename: nombreArchivo, content: Buffer.from(pdfBytes) }],
        });
        clienteOk = true;
      } catch (err) {
        // El mail al cliente es best-effort — si falla, no se pierde
        // el comodato (ya llegó a oficina), solo se informa.
      }
    }

    res.status(200).json({ ok: true, oficinaOk, clienteOk });
  } catch (err) {
    res.status(500).json({ error: "No se pudo generar o enviar el comodato", detail: String(err.message || err) });
  }
};
