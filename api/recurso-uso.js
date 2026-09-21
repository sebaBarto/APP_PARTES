// Función serverless de Vercel — maneja el "tomar / devolver /
// transferir" de tres tipos de recursos compartidos entre técnicos:
// vehículos, SIMs, y herramientas especiales. Antes eran dos
// funciones separadas (vehiculo-uso.js + sim-uso.js); se fusionaron
// en una sola (y se sumó acá directo la lógica de herramientas, en
// vez de crear una tercera función) para no gastar más de los 12
// "slots" de funciones del plan gratuito de Vercel — el parámetro
// "recurso" (?recurso=vehiculo|sim|herramienta) decide qué manejar.
//
// Los tres recursos ya hablan con el backend nuevo (Cloudflare) —
// acá solo se reenvía el pedido y, cuando corresponde, se dispara el
// aviso push (que sigue viviendo de este lado).
//
// Variables de entorno reutilizadas:
//   SERVICIOS_API_TOKEN, BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN

// ============================================================
// SIMs — ya cortado al backend nuevo (Cloudflare)
// ============================================================
async function getSimNuevo(headersBackendNuevo, res, query) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    if (query && query.pendientes) {
      const r = await fetch(`${process.env.BACKEND_NUEVO_URL}/api/sims/transferencias-pendientes?tecnico=${encodeURIComponent(query.tecnico || "")}`, { headers: headersBackendNuevo });
      const data = await r.json();
      res.status(r.status).json(data);
      return;
    }
    const r = await fetch(`${process.env.BACKEND_NUEVO_URL}/api/sims/historial`, { headers: headersBackendNuevo });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: "Error interno al leer el historial de SIMs" });
  }
}

async function postSimNuevo(headersBackendNuevo, body, res) {
  const r = await fetch(`${process.env.BACKEND_NUEVO_URL}/api/sims/accion`, {
    method: "POST",
    headers: { ...headersBackendNuevo, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  res.status(r.status).json(data);
}


// ============================================================
// VEHÍCULOS y HERRAMIENTAS — ya cortados al backend nuevo (Cloudflare)
// ============================================================
async function getVehiculoNuevo(headersBackendNuevo, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const r = await fetch(`${process.env.BACKEND_NUEVO_URL}/api/vehiculos/historial`, { headers: headersBackendNuevo });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: "Error interno al leer el historial de vehículos" });
  }
}

async function postVehiculoNuevo(headersBackendNuevo, body, res) {
  const { accion, vehiculo, tecnico } = body || {};
  if (!accion || !vehiculo || !tecnico) {
    res.status(400).json({ error: "Faltan datos (acción, vehículo o técnico)" });
    return;
  }
  const r = await fetch(`${process.env.BACKEND_NUEVO_URL}/api/vehiculos/accion`, {
    method: "POST",
    headers: { ...headersBackendNuevo, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) { res.status(r.status).json(data); return; }

  // El backend nuevo no manda avisos push (eso queda de este lado,
  // que ya lo tiene funcionando) — acá se dispara si corresponde.
  if (data.avisoEvento) {
    try {
      const { enviarATodos } = require("../lib/push-sender");
      await enviarATodos({ titulo: `⚠ Evento en ${data.avisoEvento.vehiculo}`, cuerpo: `${data.avisoEvento.tecnico} reportó: ${data.avisoEvento.evento}`, url: "/" });
    } catch (err) {
      console.error("Error enviando push de evento de vehículo:", err);
    }
  }
  res.status(200).json({ ok: true });
}

async function getHerramientaNuevo(headersBackendNuevo, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const r = await fetch(`${process.env.BACKEND_NUEVO_URL}/api/herramientas/historial`, { headers: headersBackendNuevo });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: "Error interno al leer el historial de herramientas" });
  }
}

async function postHerramientaNuevo(headersBackendNuevo, body, res) {
  const { accion, nombre, tecnico } = body || {};
  if (!accion || !nombre || !tecnico) {
    res.status(400).json({ error: "Faltan datos (acción, herramienta o técnico)" });
    return;
  }
  const r = await fetch(`${process.env.BACKEND_NUEVO_URL}/api/herramientas/accion`, {
    method: "POST",
    headers: { ...headersBackendNuevo, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) { res.status(r.status).json(data); return; }

  if (data.avisoParaCliente) {
    try {
      const { enviarATodos } = require("../lib/push-sender");
      await enviarATodos({ titulo: `🔧 ${nombre} dejada en un cliente`, cuerpo: `${tecnico} la dejó en ${data.avisoParaCliente}.`, url: "/" });
    } catch (err) {
      console.error("Error enviando push de herramienta dejada en cliente:", err);
    }
  }
  res.status(200).json({ ok: true, herramienta: data.herramienta });
}

// ============================================================
// SEGUIMIENTO EN VIVO — cuando se cierra un parte, se avisa al
// próximo cliente agendado (según el cronograma) que el técnico va
// en camino, con un link para ver su posición aproximada.
// ============================================================
let transporterSeguimientoCache = null;
function getTransporterSeguimiento() {
  if (transporterSeguimientoCache) return transporterSeguimientoCache;
  const nodemailer = require("nodemailer");
  const puerto = Number(process.env.SMTP_PORT || 465);
  transporterSeguimientoCache = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    secure: puerto === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
  return transporterSeguimientoCache;
}

// El GET es el único de todo este archivo que no requiere login — lo
// abre el cliente final desde el link del mail/WhatsApp, sin cuenta
// en la app. Solo puede leer UN seguimiento puntual por su id (un
// token largo e impredecible en la URL), nunca una lista — no expone
// nada de otros técnicos, otros clientes ni del resto del sistema.
async function getSeguimientoNuevo(headersBackendNuevo, id, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (!id) {
    res.status(400).json({ error: "Falta el id del seguimiento" });
    return;
  }
  try {
    const r = await fetch(`${process.env.BACKEND_NUEVO_URL}/api/seguimientos/${encodeURIComponent(id)}`, { headers: headersBackendNuevo });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: "Error interno al leer el seguimiento" });
  }
}

// Listado completo — a diferencia del anterior, ESTE sí requiere
// login (lo exige el gate de más arriba, porque acá sí va con id
// vacío). Lo usa admin.html para el historial.
async function getSeguimientosListaNuevo(headersBackendNuevo, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const r = await fetch(`${process.env.BACKEND_NUEVO_URL}/api/seguimientos`, { headers: headersBackendNuevo });
    const data = await r.json();
    res.status(r.status).json(Array.isArray(data) ? data : []);
  } catch (err) {
    res.status(500).json({ error: "Error interno al leer el listado de seguimientos" });
  }
}

async function postSeguimientoNuevo(headersBackendNuevo, body, res) {
  // "avisar_atraso" — mail directo a la oficina cuando un técnico
  // cierra un parte con 20+ minutos de atraso sobre su próximo turno
  // agendado. No toca la base para nada, ni el backend de Cloudflare
  // — es un aviso puntual, no algo que haga falta consultar después.
  if (body.accion === "avisar_atraso") {
    if (!process.env.OFICINA_EMAIL) {
      res.status(200).json({ ok: true }); // no hay a quién avisar; no es un error del técnico
      return;
    }
    try {
      const transporter = getTransporterSeguimiento();
      await transporter.sendMail({
        from: `"Servicio Técnico SAT" <${process.env.SMTP_USER}>`,
        to: process.env.OFICINA_EMAIL,
        subject: `⏰ ${body.tecnico || "Un técnico"} va con atraso`,
        html: `
          <div style="font-family: Arial, Helvetica, sans-serif; color:#101820;">
            <h2 style="margin-bottom:4px;">⏰ Atraso detectado</h2>
            <p><b>${body.tecnico || "Un técnico"}</b> recién está cerrando un servicio, con <b>${body.atraso_minutos || "?"} minutos</b> de atraso sobre el próximo turno agendado${body.cliente_proximo ? ` con <b>${body.cliente_proximo}</b>` : ""}${body.hora_prevista ? ` (previsto para las ${body.hora_prevista})` : ""}.</p>
          </div>
        `,
      });
      res.status(200).json({ ok: true });
    } catch (err) {
      // no crítico — no debe afectar nada del lado del técnico
      res.status(200).json({ ok: false });
    }
    return;
  }

  // "reenviar_mail" no crea nada nuevo — solo reenvía el link de un
  // seguimiento que YA existe (usado por el botón "Mandar por mail"
  // cuando el técnico completa el mail a mano después de que el
  // seguimiento ya se creó sin uno). Se resuelve toda acá mismo, sin
  // tocar el backend de Cloudflare para nada.
  if (body.accion === "reenviar_mail") {
    if (!body.id || !body.cliente_email || !body.origen) {
      res.status(400).json({ error: "Faltan datos para reenviar el mail" });
      return;
    }
    const emailValido = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(String(body.cliente_email).trim());
    if (!emailValido) {
      res.status(400).json({ error: "El mail no parece válido" });
      return;
    }
    try {
      const link = `${body.origen}/seguimiento.html?id=${body.id}`;
      const transporter = getTransporterSeguimiento();
      await transporter.sendMail({
        from: `"Servicio Técnico SAT" <${process.env.SMTP_USER}>`,
        to: body.cliente_email.trim(),
        subject: "🚐 Tu técnico está en camino",
        html: `
          <div style="font-family: Arial, Helvetica, sans-serif; color:#101820;">
            <h2 style="margin-bottom:4px;">🚐 Tu técnico está en camino</h2>
            <p style="color:#6B7680; margin-top:0;">Servicio Técnico SAT</p>
            <p>Podés seguir su recorrido (posición aproximada) acá:</p>
            <p><a href="${link}" style="display:inline-block; background:#101820; color:#F5A623; padding:10px 18px; border-radius:8px; text-decoration:none; font-weight:600;">Ver ubicación en vivo</a></p>
            <p style="color:#6B7680; font-size:13px;">El link deja de funcionar solo después de un rato, o cuando el técnico llegue.</p>
          </div>
        `,
      });
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "No se pudo mandar el mail: " + String(err.message || err) });
    }
    return;
  }

  const r = await fetch(`${process.env.BACKEND_NUEVO_URL}/api/seguimientos/accion`, {
    method: "POST",
    headers: { ...headersBackendNuevo, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) { res.status(r.status).json(data); return; }

  // Al crear un seguimiento nuevo, si hay mail del cliente, se le
  // manda automáticamente el link — best-effort: si el mail falla,
  // el seguimiento ya quedó creado igual (el técnico todavía puede
  // mandarlo a mano por WhatsApp).
  if (body.accion === "crear" && data.id && body.cliente_email && body.origen) {
    try {
      const emailValido = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(String(body.cliente_email).trim());
      if (emailValido) {
        const link = `${body.origen}/seguimiento.html?id=${data.id}`;
        const transporter = getTransporterSeguimiento();
        await transporter.sendMail({
          from: `"Servicio Técnico SAT" <${process.env.SMTP_USER}>`,
          to: body.cliente_email.trim(),
          subject: "🚐 Tu técnico está en camino",
          html: `
            <div style="font-family: Arial, Helvetica, sans-serif; color:#101820;">
              <h2 style="margin-bottom:4px;">🚐 Tu técnico está en camino</h2>
              <p style="color:#6B7680; margin-top:0;">Servicio Técnico SAT</p>
              <p>Podés seguir su recorrido (posición aproximada) acá:</p>
              <p><a href="${link}" style="display:inline-block; background:#101820; color:#F5A623; padding:10px 18px; border-radius:8px; text-decoration:none; font-weight:600;">Ver ubicación en vivo</a></p>
              <p style="color:#6B7680; font-size:13px;">El link deja de funcionar solo después de un rato, o cuando el técnico llegue.</p>
            </div>
          `,
        });
      }
    } catch (errMail) {
      console.error("No se pudo mandar el mail de seguimiento (no crítico):", errMail);
    }
  }

  res.status(200).json(data);
}

// ============================================================
// PRESENCIA EN OBRA (llegada/salida) — ya cortado al backend nuevo
// ============================================================
async function getPresenciaNuevo(headersBackendNuevo, tecnico, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const r = await fetch(`${process.env.BACKEND_NUEVO_URL}/api/presencias-obra/activa?tecnico=${encodeURIComponent(tecnico || "")}`, { headers: headersBackendNuevo });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: "Error interno al consultar presencia en obra" });
  }
}

async function getPresenciaHistorialNuevo(headersBackendNuevo, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const r = await fetch(`${process.env.BACKEND_NUEVO_URL}/api/presencias-obra`, { headers: headersBackendNuevo });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: "Error interno al leer el historial de presencia en obra" });
  }
}

async function getPresenciasDeInstalacionNuevo(headersBackendNuevo, instalacionId, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const r = await fetch(`${process.env.BACKEND_NUEVO_URL}/api/presencias-obra/por-instalacion/${encodeURIComponent(instalacionId)}`, { headers: headersBackendNuevo });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: "Error interno al leer los días de esta instalación" });
  }
}

async function postPresenciaNuevo(headersBackendNuevo, body, res) {
  const { accion, tecnico, cliente } = body || {};
  if (!accion || !tecnico) {
    res.status(400).json({ error: "Faltan datos (acción o técnico)" });
    return;
  }
  const ruta = accion === "llegada" ? "llegada" : accion === "salida" ? "salida" : null;
  if (!ruta) {
    res.status(400).json({ error: "Acción desconocida (usar 'llegada' o 'salida')" });
    return;
  }
  const r = await fetch(`${process.env.BACKEND_NUEVO_URL}/api/presencias-obra/${ruta}`, {
    method: "POST",
    headers: { ...headersBackendNuevo, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) { res.status(r.status).json(data); return; }

  // Aviso a todo el equipo — a diferencia de vehículo/herramienta,
  // este SIEMPRE avisa (no es un evento raro, es el uso normal).
  try {
    const { enviarATodos } = require("../lib/push-sender");
    if (accion === "llegada") {
      await enviarATodos({ titulo: `📍 ${tecnico} llegó a obra`, cuerpo: `Llegó a ${cliente}.`, url: "/" });
    } else {
      await enviarATodos({ titulo: `📍 ${tecnico} se retiró de obra`, cuerpo: `Se fue de ${data.cliente || cliente || "la obra"}.`, url: "/" });
    }
  } catch (err) {
    console.error("Error enviando push de presencia en obra:", err);
  }
  res.status(200).json({ ok: true });
}

// ============================================================
// Handler principal
// ============================================================
module.exports = async (req, res) => {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (err) { body = {}; }
  }
  const recurso = (req.query && req.query.recurso) || (body && body.recurso);

  // Único caso sin token de toda esta función: el GET de "seguimiento"
  // lo abre el cliente final desde un link de mail/WhatsApp, sin login
  // en la app — solo puede leer un seguimiento puntual por su id.
  // Único caso sin token de toda esta función: leer UN seguimiento
  // puntual por su id (el link que abre el cliente final). Pedir la
  // LISTA completa (sin id) sigue exigiendo login — ahí sí se ve la
  // ubicación y el cliente de todos los técnicos, eso no es público.
  const esSeguimientoPublico = req.method === "GET" && recurso === "seguimiento" && !!(req.query && req.query.id);

  if (!esSeguimientoPublico) {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!process.env.SERVICIOS_API_TOKEN || token !== process.env.SERVICIOS_API_TOKEN) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
  }

  const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
  const headersBackendNuevo = { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}` };

  try {
    if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
      res.status(500).json({ error: "Faltan variables de entorno del backend nuevo por configurar en Vercel" });
      return;
    }

    if (req.method === "GET") {
      if (recurso === "vehiculo") return await getVehiculoNuevo(headersBackendNuevo, res);
      if (recurso === "sim") return await getSimNuevo(headersBackendNuevo, res, req.query);
      if (recurso === "herramienta") return await getHerramientaNuevo(headersBackendNuevo, res);
      if (recurso === "seguimiento") return req.query.id ? await getSeguimientoNuevo(headersBackendNuevo, req.query.id, res) : await getSeguimientosListaNuevo(headersBackendNuevo, res);
      if (recurso === "presencia") {
        if (req.query.historial) return await getPresenciaHistorialNuevo(headersBackendNuevo, res);
        if (req.query.presencias_de_instalacion) return await getPresenciasDeInstalacionNuevo(headersBackendNuevo, req.query.presencias_de_instalacion, res);
        return await getPresenciaNuevo(headersBackendNuevo, req.query.tecnico, res);
      }
      res.status(400).json({ error: "Falta indicar el recurso (?recurso=vehiculo|sim|herramienta|presencia|seguimiento)" });
      return;
    }

    if (req.method === "POST") {
      if (recurso === "vehiculo") return await postVehiculoNuevo(headersBackendNuevo, body, res);
      if (recurso === "sim") return await postSimNuevo(headersBackendNuevo, body, res);
      if (recurso === "herramienta") return await postHerramientaNuevo(headersBackendNuevo, body, res);
      if (recurso === "presencia") return await postPresenciaNuevo(headersBackendNuevo, body, res);
      if (recurso === "seguimiento") return await postSeguimientoNuevo(headersBackendNuevo, body, res);
      res.status(400).json({ error: "Falta indicar el recurso (vehiculo, sim, herramienta, presencia o seguimiento)" });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Método no permitido" });
  } catch (err) {
    res.status(500).json({ error: "Error interno al registrar el movimiento", detail: String(err.message || err) });
  }
};
