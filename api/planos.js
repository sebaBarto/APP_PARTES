// Función serverless de Vercel — planos de cableado en PDF, uno por
// cliente/sitio. Ya viven en Cloudflare R2 (bucket sat-archivos),
// subidos automáticamente por un programa que corre en la PC de la
// oficina cada 1 hora (ver sync-local-planos-r2 en el proyecto del
// backend) — acá solo se reenvía el pedido.
//
// A diferencia de las fotos (que no piden token porque van embebidas
// en mails), acá SIEMPRE se exige el token de acceso — son datos más
// sensibles (muestran cómo está armada la seguridad de un cliente) y
// solo se ven adentro de la app, nunca en un mail.
//
// GET  /api/planos                 -> lista los nombres de archivo disponibles
// GET  /api/planos?nombre=XXXX     -> devuelve ese PDF puntual
// GET  /api/planos?estado=1        -> estado de la última sincronización automática
// POST /api/planos {accion:"subir_plano_app", carpeta, nombre, tipo, base64}
//                                  -> guarda el PDF/SVG de un plano hecho con la APP
//                                     (lo baja el sincronizador a la carpeta del cliente)
//
// Variables de entorno:
//   SERVICIOS_API_TOKEN, BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN

module.exports = require("../lib/auditoria").conAuditoria("planos", async (req, res) => {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!require("../lib/sesion").autorizar(req)) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
  if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
    res.status(500).json({ error: "Faltan variables de entorno del backend nuevo por configurar en Vercel" });
    return;
  }
  const headersBackendNuevo = { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}` };

  // POST: la APP manda el PDF / SVG del plano de una instalación para que
  // el sincronizador de la oficina lo baje a la carpeta de Planos.
  if (req.method === "POST") {
    let body = req.body;
    try { if (typeof body === "string") body = JSON.parse(body); } catch (e) { body = null; }
    if (!body || body.accion !== "subir_plano_app") { res.status(400).json({ error: "Acción inválida" }); return; }
    try {
      const r = await fetch(`${BACKEND_NUEVO_URL}/api/planos/app`, {
        method: "POST",
        headers: { ...headersBackendNuevo, "Content-Type": "application/json" },
        body: JSON.stringify({ carpeta: body.carpeta, nombre: body.nombre, tipo: body.tipo, base64: body.base64 }),
      });
      const data = await r.json().catch(() => ({ error: "El backend no respondió bien (¿falta publicar la actualización de planos.js?)" }));
      res.status(r.status).json(data);
    } catch (err) {
      res.status(502).json({ error: "No se pudo mandar el plano al backend" });
    }
    return;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { nombre, estado } = req.query;

  try {
    if (estado) {
      const r = await fetch(`${BACKEND_NUEVO_URL}/api/planos/estado-sincronizacion`, { headers: headersBackendNuevo });
      const data = await r.json();
      res.status(r.status).json(data);
      return;
    }

    if (nombre) {
      const r = await fetch(`${BACKEND_NUEVO_URL}/api/planos/${encodeURIComponent(nombre)}`, { headers: headersBackendNuevo });
      if (r.status === 404) {
        res.status(404).json({ error: "No se encontró ese plano" });
        return;
      }
      if (!r.ok) {
        res.status(502).json({ error: "No se pudo descargar el plano" });
        return;
      }
      const buffer = Buffer.from(await r.arrayBuffer());
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.status(200).send(buffer);
      return;
    }

    const r = await fetch(`${BACKEND_NUEVO_URL}/api/planos`, { headers: headersBackendNuevo });
    if (!r.ok) {
      res.status(502).json({ error: "No se pudo listar los planos" });
      return;
    }
    const planos = await r.json();
    res.setHeader("Cache-Control", "private, max-age=120");
    res.status(200).json(planos);
  } catch (err) {
    res.status(500).json({ error: "Error interno al hablar con el backend nuevo", detail: String(err.message || err) });
  }
});
