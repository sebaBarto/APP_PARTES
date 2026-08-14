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
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!process.env.SERVICIOS_API_TOKEN || token !== process.env.SERVICIOS_API_TOKEN) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
  const headersBackendNuevo = { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}` };

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (err) { body = {}; }
  }
  const recurso = (req.query && req.query.recurso) || (body && body.recurso);

  try {
    if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
      res.status(500).json({ error: "Faltan variables de entorno del backend nuevo por configurar en Vercel" });
      return;
    }

    if (req.method === "GET") {
      if (recurso === "vehiculo") return await getVehiculoNuevo(headersBackendNuevo, res);
      if (recurso === "sim") return await getSimNuevo(headersBackendNuevo, res, req.query);
      if (recurso === "herramienta") return await getHerramientaNuevo(headersBackendNuevo, res);
      if (recurso === "presencia") {
        if (req.query.historial) return await getPresenciaHistorialNuevo(headersBackendNuevo, res);
        if (req.query.presencias_de_instalacion) return await getPresenciasDeInstalacionNuevo(headersBackendNuevo, req.query.presencias_de_instalacion, res);
        return await getPresenciaNuevo(headersBackendNuevo, req.query.tecnico, res);
      }
      res.status(400).json({ error: "Falta indicar el recurso (?recurso=vehiculo|sim|herramienta|presencia)" });
      return;
    }

    if (req.method === "POST") {
      if (recurso === "vehiculo") return await postVehiculoNuevo(headersBackendNuevo, body, res);
      if (recurso === "sim") return await postSimNuevo(headersBackendNuevo, body, res);
      if (recurso === "herramienta") return await postHerramientaNuevo(headersBackendNuevo, body, res);
      if (recurso === "presencia") return await postPresenciaNuevo(headersBackendNuevo, body, res);
      res.status(400).json({ error: "Falta indicar el recurso (vehiculo, sim, herramienta o presencia)" });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Método no permitido" });
  } catch (err) {
    res.status(500).json({ error: "Error interno al registrar el movimiento", detail: String(err.message || err) });
  }
};
