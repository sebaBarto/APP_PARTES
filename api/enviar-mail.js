// Función serverless de Vercel — manda los mails de los partes (copia
// a oficina y copia al cliente) por SMTP directo, usando la casilla
// propia de la empresa (serviciotecnico@sat365.com.ar, alojada en
// DonWeb) en vez de EmailJS — para no depender de ningún límite
// mensual de envíos de un tercero.
//
// Variables de entorno necesarias:
//   SERVICIOS_API_TOKEN (ya existente)
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, OFICINA_EMAIL

const nodemailer = require("nodemailer");

// ---------- Motor de plantillas chico ----------
// Mismo formato que ya usaban las plantillas de EmailJS:
//   {{variable}}      -> texto (se escapa, por las dudas)
//   {{{variable}}}    -> HTML sin escapar (para la firma, que ya viene
//                        como un <img> armado)
//   {{#variable}}...{{/variable}}  -> bloque que solo se muestra si
//                        esa variable vino con algo cargado
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTemplate(html, datos) {
  html = html.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, clave, contenido) =>
    datos[clave] ? contenido : ""
  );
  html = html.replace(/\{\{\{(\w+)\}\}\}/g, (_, clave) => (datos[clave] != null ? String(datos[clave]) : ""));
  html = html.replace(/\{\{(\w+)\}\}/g, (_, clave) => (datos[clave] != null ? escapeHtml(datos[clave]) : ""));
  return html;
}

// ---------- Plantilla: copia a la oficina ----------
const PLANTILLA_OFICINA = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F0; padding:24px 0; font-family:Arial, Helvetica, sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF; border-radius:10px; overflow:hidden; border:1px solid #D8DCD4;">
        <tr>
          <td style="background:#101820; padding:18px 28px;">
            <img src="https://raw.githubusercontent.com/sebaBarto/APP_PARTES/main/icons/logo.png" alt="SAT" height="28" style="display:block; margin-bottom:10px;">
            <span style="color:#9AA3A9; font-size:12px; font-family:'Courier New', monospace;">N° {{id_parte}}</span>
            <div style="margin-top:6px;">
              <span style="display:inline-block; background:#F5A623; color:#101820; font-size:11px; font-weight:bold; font-family:'Courier New', monospace; letter-spacing:0.5px; border-radius:4px; padding:3px 8px;">{{tipo_servicio}}</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px 8px;">
            <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:10px;">Datos del cliente</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px; width:140px;">Cliente</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{cliente}}</td></tr>
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px;">Dirección</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{direccion}}</td></tr>
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px;">Localidad</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{localidad}}</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 8px;">
            <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:10px;">Datos del servicio</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px; width:140px;">Técnico</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{tecnico}}</td></tr>
              {{#tecnico2}}<tr><td style="padding:4px 0; color:#6B7680; font-size:13px;">2° Técnico</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{tecnico2}}</td></tr>{{/tecnico2}}
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px;">Fecha</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{fecha}}</td></tr>
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px;">Horario</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{hora_entrada}} a {{hora_salida}} ({{tiempo_transcurrido}})</td></tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:16px 28px 8px;">
          <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Tarea realizada</div>
          <div style="color:#101820; font-size:14px; line-height:1.5; background:#F4F5F0; border-radius:8px; padding:12px 14px;">{{tarea}}</div>
        </td></tr>
        <tr><td style="padding:16px 28px 8px;">
          <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Materiales utilizados</div>
          <div style="color:#101820; font-size:14px; line-height:1.5; background:#F4F5F0; border-radius:8px; padding:12px 14px;">{{materiales}}</div>
        </td></tr>
        <tr><td style="padding:16px 28px 8px;">
          <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Materiales retirados</div>
          <div style="color:#101820; font-size:14px; line-height:1.5; background:#F4F5F0; border-radius:8px; padding:12px 14px;">{{materiales_retirados}}</div>
        </td></tr>
        <tr>
          <td style="padding:16px 28px 8px;">
            <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:10px;">Costos</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px; width:140px;">Importe del servicio</td><td style="padding:4px 0; color:#101820; font-size:14px; font-family:'Courier New', monospace;">{{importe}}</td></tr>
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px;">Descuento aplicado</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{descuento}}</td></tr>
              <tr><td style="padding:8px 0 4px; color:#6B7680; font-size:13px; font-weight:bold;">Costo final al cliente</td><td style="padding:8px 0 4px; color:#101820; font-size:15px; font-weight:bold; font-family:'Courier New', monospace;">{{costo_final}}</td></tr>
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px;">Forma de pago</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{forma_pago}}</td></tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:16px 28px 8px;">
          <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Observaciones</div>
          <div style="color:#101820; font-size:14px; line-height:1.5; background:#F4F5F0; border-radius:8px; padding:12px 14px;">{{observaciones}}</div>
        </td></tr>
        {{#imprevisto}}<tr><td style="padding:0 28px 8px;">
          <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Imprevisto</div>
          <div style="color:#101820; font-size:14px; background:rgba(245,166,35,0.12); border-radius:8px; padding:12px 14px;">⚠ {{imprevisto}}</div>
        </td></tr>{{/imprevisto}}
        {{#foto_link}}<tr><td style="padding:0 28px 8px;">
          <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Foto</div>
          <a href="{{foto_link}}" style="color:#101820; font-size:14px; background:#F4F5F0; border-radius:8px; padding:12px 14px; display:block; text-decoration:underline;">Ver foto adjunta</a>
        </td></tr>{{/foto_link}}
        <tr><td style="padding:16px 28px 24px;">
          <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px;">Firma del cliente</div>
          <div style="background:#F4F5F0; border-radius:8px; padding:14px; border:1px solid #D8DCD4;">{{{firma_img}}}</div>
        </td></tr>
        <tr><td style="background:#101820; padding:14px 28px; color:#9AA3A9; font-size:11px; font-family:'Courier New', monospace; text-align:center;">
          Generado automáticamente por la app de partes técnicos
        </td></tr>
      </table>
    </td>
  </tr>
</table>
`;

// ---------- Plantilla: copia al cliente ----------
const PLANTILLA_CLIENTE = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F0; padding:24px 0; font-family:Arial, Helvetica, sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF; border-radius:10px; overflow:hidden; border:1px solid #D8DCD4;">
        <tr>
          <td style="background:#101820; padding:18px 28px;">
            <img src="https://raw.githubusercontent.com/sebaBarto/APP_PARTES/main/icons/logo.png" alt="SAT" height="28" style="display:block; margin-bottom:10px;">
            <div style="color:#9AA3A9; font-size:12px; font-family:'Courier New', monospace;">N° {{id_parte}}</div>
            <div style="margin-top:6px;">
              <span style="display:inline-block; background:#F5A623; color:#101820; font-size:11px; font-weight:bold; font-family:'Courier New', monospace; letter-spacing:0.5px; border-radius:4px; padding:3px 8px;">{{tipo_servicio}}</span>
            </div>
          </td>
        </tr>
        <tr><td style="padding:24px 28px 8px;">
          <div style="color:#101820; font-size:14px; line-height:1.5;">Hola {{cliente}}, te enviamos el resumen del servicio realizado en tu domicilio.</div>
        </td></tr>
        <tr>
          <td style="padding:16px 28px 8px;">
            <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:10px;">Datos del servicio</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px; width:140px;">Dirección</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{direccion}}</td></tr>
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px;">Localidad</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{localidad}}</td></tr>
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px;">Técnico</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{tecnico}}</td></tr>
              {{#tecnico2}}<tr><td style="padding:4px 0; color:#6B7680; font-size:13px;">2° Técnico</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{tecnico2}}</td></tr>{{/tecnico2}}
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px;">Fecha</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{fecha}}</td></tr>
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px;">Horario</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{hora_entrada}} a {{hora_salida}}</td></tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:16px 28px 8px;">
          <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Tarea realizada</div>
          <div style="color:#101820; font-size:14px; line-height:1.5; background:#F4F5F0; border-radius:8px; padding:12px 14px;">{{tarea}}</div>
        </td></tr>
        <tr><td style="padding:16px 28px 8px;">
          <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Materiales utilizados</div>
          <div style="color:#101820; font-size:14px; line-height:1.5; background:#F4F5F0; border-radius:8px; padding:12px 14px;">{{materiales}}</div>
        </td></tr>
        <tr>
          <td style="padding:16px 28px 8px;">
            <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:10px;">Costos</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px; width:140px;">Importe del servicio</td><td style="padding:4px 0; color:#101820; font-size:14px; font-family:'Courier New', monospace;">{{importe}}</td></tr>
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px;">Descuento aplicado</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{descuento}}</td></tr>
              <tr><td style="padding:8px 0 4px; color:#6B7680; font-size:13px; font-weight:bold;">Costo final</td><td style="padding:8px 0 4px; color:#101820; font-size:15px; font-weight:bold; font-family:'Courier New', monospace;">{{costo_final}}</td></tr>
              <tr><td style="padding:4px 0; color:#6B7680; font-size:13px;">Forma de pago</td><td style="padding:4px 0; color:#101820; font-size:14px;">{{forma_pago}}</td></tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:16px 28px 8px;">
          <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Observaciones</div>
          <div style="color:#101820; font-size:14px; line-height:1.5; background:#F4F5F0; border-radius:8px; padding:12px 14px;">{{observaciones}}</div>
        </td></tr>
        <tr><td style="padding:16px 28px 24px;">
          <div style="color:#B5772A; font-size:11px; font-family:'Courier New', monospace; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px;">Tu firma de conformidad</div>
          <div style="background:#F4F5F0; border-radius:8px; padding:14px; border:1px solid #D8DCD4;">{{{firma_img}}}</div>
        </td></tr>
        <tr><td style="background:#101820; padding:14px 28px; color:#9AA3A9; font-size:11px; font-family:'Courier New', monospace; text-align:center;">
          Gracias por confiar en nosotros
        </td></tr>
      </table>
    </td>
  </tr>
</table>
`;

let transporterCache = null;
function getTransporter() {
  if (transporterCache) return transporterCache;
  const puerto = Number(process.env.SMTP_PORT || 465);
  transporterCache = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    secure: puerto === 465, // 465 = SSL directo; 587 usaría STARTTLS (secure:false)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporterCache;
}

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
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    res.status(500).json({ error: "Faltan variables de entorno de SMTP por configurar en Vercel" });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    const { tipo, datos } = body || {};
    if (!tipo || !datos) {
      res.status(400).json({ error: "Faltan datos (tipo o datos)" });
      return;
    }

    let destinatario, asunto, html;
    if (tipo === "oficina") {
      destinatario = process.env.OFICINA_EMAIL;
      if (!destinatario) {
        res.status(500).json({ error: "Falta configurar OFICINA_EMAIL en Vercel" });
        return;
      }
      asunto = `Parte técnico ${datos.id_parte || ""} - ${datos.cliente || ""}`;
      html = renderTemplate(PLANTILLA_OFICINA, datos);
    } else if (tipo === "cliente") {
      destinatario = datos.cliente_email;
      if (!destinatario) {
        res.status(400).json({ error: "Falta el mail del cliente" });
        return;
      }
      asunto = `Parte de servicio ${datos.id_parte || ""} - ${datos.cliente || ""}`;
      html = renderTemplate(PLANTILLA_CLIENTE, datos);
    } else {
      res.status(400).json({ error: "Tipo desconocido (usar 'oficina' o 'cliente')" });
      return;
    }

    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Servicio Técnico SAT" <${process.env.SMTP_USER}>`,
      to: destinatario,
      subject: asunto,
      html,
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "No se pudo enviar el mail", detail: String(err.message || err) });
  }
};
