// Función serverless de Vercel — guarda y lee el historial de partes
// completados. Ya corta al backend nuevo (Cloudflare + D1) en vez de
// leer/escribir un archivo en GitHub — la lógica de reintentos por
// conflicto de escritura que tenía antes ya no hace falta, D1 no
// tiene ese problema (cada guardado es independiente).
//
// La app sigue mandando y esperando los nombres de campo de siempre
// (id_parte, tecnico2, descuento como un solo valor) — acá se
// traducen hacia/desde los nombres reales de la tabla nueva, que son
// distintos en varios casos (encontrado revisando la estructura real
// de la base, no de memoria).
//
// Variables de entorno reutilizadas:
//   SERVICIOS_API_TOKEN, BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN
//   Para el mail de cierre de instalación (reutiliza las mismas ya
//   configuradas para los demás mails):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS

const nodemailer = require("nodemailer");

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
    socketTimeout: 8000,
  });
  return transporterCache;
}

function escapeHtmlMail(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Convierte un número con formato argentino ("$ 12.345,67", "35000")
// a un número limpio — o null si no se puede interpretar.
function numeroLimpio(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  if (typeof valor === "number") return valor;
  const limpio = String(valor).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpio);
  return isNaN(n) ? null : n;
}

// App -> backend nuevo (al guardar un parte)
function mapearHaciaBackendNuevo(v) {
  return {
    id: v.id_parte || v.id || undefined, // si no viene, el backend nuevo genera uno
    numero_servicio: v.numero_servicio || "",
    cliente: v.cliente || "",
    direccion: v.direccion || "",
    localidad: v.localidad || "",
    tarea: v.tarea || "",
    tecnico: v.tecnico || "",
    tecnico_segundo: v.tecnico2 || "",
    fecha: v.fecha || "",
    hora_entrada: v.hora_entrada || "",
    hora_salida: v.hora_salida || "",
    es_instalacion: !!v.es_instalacion,
    observaciones: v.observaciones || "",
    imprevisto: v.imprevisto || "",
    importe: numeroLimpio(v.importe),
    descuento_tipo: v.descuento || "",
    descuento_pct: numeroLimpio(v.descuento),
    costo_final: numeroLimpio(v.costo_final),
    forma_pago: v.forma_pago || "",
    claves: JSON.stringify(Array.isArray(v.claves) ? v.claves : []),
  };
}

// Backend nuevo -> app (al leer el historial completo)
function mapearDesdeBackendNuevo(p) {
  let claves = [];
  try { claves = JSON.parse(p.claves || "[]"); } catch (err) { claves = []; }
  return {
    id_parte: p.id,
    numero_servicio: p.numero_servicio || "",
    cliente: p.cliente || "",
    direccion: p.direccion || "",
    localidad: p.localidad || "",
    tarea: p.tarea || "",
    observaciones: p.observaciones || "",
    tecnico: p.tecnico || "",
    tecnico2: p.tecnico_segundo || "",
    fecha: p.fecha || "",
    hora_entrada: p.hora_entrada || "",
    hora_salida: p.hora_salida || "",
    es_instalacion: !!p.es_instalacion,
    importe: p.importe,
    descuento: p.descuento_tipo || "",
    costo_final: p.costo_final,
    forma_pago: p.forma_pago || "",
    imprevisto: p.imprevisto || "",
    registrado_en: p.creado_en || p.actualizado_en || "",
    pasado_sistema_offline: !!p.pasado_sistema_offline,
    pasado_sistema_por: p.pasado_sistema_por || "",
    pasado_sistema_en: p.pasado_sistema_en || "",
    claves,
  };
}

async function mandarMailResumenInstalacion(instalacionId, backendUrl, headersBackendNuevo) {
  const r = await fetch(`${backendUrl}/api/instalaciones/${encodeURIComponent(instalacionId)}`, { headers: headersBackendNuevo });
  if (!r.ok) throw new Error("No se pudo leer el detalle de la instalación para el mail");
  const inst = await r.json();

  const formatearFecha = (f) => {
    if (!f) return "";
    const [y, m, d] = f.split("-");
    return `${d}/${m}/${y}`;
  };

  const diasHtml = (inst.dias || []).map((d, idx) => {
    const linkEntrada = (d.lat_llegada && d.lng_llegada) ? ` (<a href="https://www.google.com/maps?q=${d.lat_llegada},${d.lng_llegada}">ver ubicación</a>)` : "";
    const linkSalida = (d.lat_salida && d.lng_salida) ? ` (<a href="https://www.google.com/maps?q=${d.lat_salida},${d.lng_salida}">ver ubicación</a>)` : "";
    return `<li>Día ${idx + 1} (${formatearFecha(d.fecha_llegada)}): entrada ${escapeHtmlMail(d.hora_llegada)}${linkEntrada}${d.hora_salida ? `, salida ${escapeHtmlMail(d.hora_salida)}${linkSalida}` : ""}</li>`;
  }).join("") || "<li>Sin días registrados.</li>";

  const zonasHtml = (inst.zonas || []).map((z) => `<li>Zona ${escapeHtmlMail(z.numero)} — ${escapeHtmlMail(z.descripcion)}</li>`).join("") || "<li>Sin zonas cargadas.</li>";
  const canalesHtml = (inst.canales || []).map((c) => `<li>Canal ${escapeHtmlMail(c.numero)} — ${escapeHtmlMail(c.descripcion)}</li>`).join("") || "<li>Sin canales cargados.</li>";

  // Las fotos se adjuntan directo al mail (no solo un link) — así
  // queda todo accesible sin tener que entrar al sistema.
  const adjuntos = [];
  for (const nombre of inst.fotos || []) {
    try {
      const rFoto = await fetch(`${backendUrl}/api/instalaciones/${encodeURIComponent(instalacionId)}/fotos/${encodeURIComponent(nombre)}`, { headers: headersBackendNuevo });
      if (rFoto.ok) {
        const buffer = Buffer.from(await rFoto.arrayBuffer());
        adjuntos.push({ filename: nombre, content: buffer });
      }
    } catch (errFoto) {
      console.error(`No se pudo adjuntar la foto ${nombre}:`, errFoto);
    }
  }

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color:#101820;">
      <h2 style="margin-bottom:4px;">Instalación cerrada: ${escapeHtmlMail(inst.cliente)}</h2>
      <p style="color:#6B7680; margin-top:0;">
        ${escapeHtmlMail(inst.direccion || "")}<br>
        Técnico: ${escapeHtmlMail(inst.tecnico)} — Abierta el ${formatearFecha(inst.fecha)}
      </p>
      <h3>Días trabajados</h3>
      <ul>${diasHtml}</ul>
      <h3>Zonas de alarma</h3>
      <ul>${zonasHtml}</ul>
      <h3>Canales de cámaras</h3>
      <ul>${canalesHtml}</ul>
      <h3>Fotos</h3>
      <p>${(inst.fotos || []).length > 0 ? `${inst.fotos.length} foto(s) adjunta(s) a este mail.` : "Sin fotos cargadas."}</p>
    </div>
  `;

  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: "instalacion@sat365.com.ar",
    subject: `Instalación cerrada — ${inst.cliente}`,
    html,
    attachments: adjuntos,
  });
}

module.exports = async (req, res) => {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!process.env.SERVICIOS_API_TOKEN || token !== process.env.SERVICIOS_API_TOKEN) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
  if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
    res.status(500).json({ error: "Faltan variables de entorno del backend nuevo por configurar en Vercel" });
    return;
  }
  const headersBackendNuevo = { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}` };

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    try {
      // Foto individual de una instalación — devuelve la imagen en
      // sí (binario), no JSON, igual que hace planos.js con los PDF.
      if (req.query && req.query.tipo === "foto-instalacion" && req.query.id && req.query.nombre) {
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/instalaciones/${encodeURIComponent(req.query.id)}/fotos/${encodeURIComponent(req.query.nombre)}`, { headers: headersBackendNuevo });
        if (r.status === 404) {
          res.status(404).json({ error: "No se encontró esa foto" });
          return;
        }
        if (!r.ok) {
          res.status(502).json({ error: "No se pudo descargar la foto" });
          return;
        }
        const buffer = Buffer.from(await r.arrayBuffer());
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.status(200).send(buffer);
        return;
      }
      // ?tipo=stock trae el historial de stock en vez del de partes
      // (mismo archivo, para no gastar otro de los 12 slots de Vercel).
      if (req.query && req.query.tipo === "stock") {
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/stock`, { headers: headersBackendNuevo });
        if (!r.ok) {
          res.status(502).json({ error: "No se pudo leer el historial de stock" });
          return;
        }
        res.status(200).json(await r.json());
        return;
      }
      // ?tipo=instalaciones (lista) o ?tipo=instalacion&id=X (detalle completo)
      if (req.query && req.query.tipo === "instalaciones") {
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/instalaciones`, { headers: headersBackendNuevo });
        if (!r.ok) {
          res.status(502).json({ error: "No se pudo leer el listado de instalaciones" });
          return;
        }
        res.status(200).json(await r.json());
        return;
      }
      if (req.query && req.query.tipo === "instalacion" && req.query.id) {
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/instalaciones/${encodeURIComponent(req.query.id)}`, { headers: headersBackendNuevo });
        const data = await r.json();
        res.status(r.status).json(data);
        return;
      }
      if (req.query && req.query.tipo === "instalacion_abierta") {
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/instalaciones/abierta?tecnico=${encodeURIComponent(req.query.tecnico || "")}`, { headers: headersBackendNuevo });
        const data = await r.json();
        res.status(r.status).json(data);
        return;
      }
      const r = await fetch(`${BACKEND_NUEVO_URL}/api/partes`, { headers: headersBackendNuevo });
      if (!r.ok) {
        res.status(502).json({ error: "No se pudo leer el historial" });
        return;
      }
      const partes = await r.json();
      res.status(200).json((Array.isArray(partes) ? partes : []).map(mapearDesdeBackendNuevo));
    } catch (err) {
      res.status(500).json({ error: "Error interno al leer el historial" });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Falta el registro a guardar" });
        return;
      }

      // Marcar/desmarcar "pasado a mi sistema" — un pedido chico y
      // aparte, no un parte nuevo (se distingue por este campo, para
      // no gastar otro de los 12 slots de funciones de Vercel).
      if (body.accion === "marcar_pasado_sistema") {
        if (!body.id_parte) {
          res.status(400).json({ error: "Falta el id del parte" });
          return;
        }
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/partes/${encodeURIComponent(body.id_parte)}/marcar-pasado-sistema`, {
          method: "POST",
          headers: { ...headersBackendNuevo, "Content-Type": "application/json" },
          body: JSON.stringify({ pasado: !!body.pasado, tecnico: body.tecnico || "" }),
        });
        const data = await r.json();
        res.status(r.status).json(data);
        return;
      }

      // Igual, pero para el historial de stock.
      if (body.accion === "marcar_pasado_sistema_stock") {
        if (!body.id) {
          res.status(400).json({ error: "Falta el id del movimiento" });
          return;
        }
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/stock/${encodeURIComponent(body.id)}/marcar-pasado-sistema`, {
          method: "POST",
          headers: { ...headersBackendNuevo, "Content-Type": "application/json" },
          body: JSON.stringify({ pasado: !!body.pasado, tecnico: body.tecnico || "" }),
        });
        const data = await r.json();
        res.status(r.status).json(data);
        return;
      }

      // Guarda los movimientos de stock de un parte (uno por
      // material que tuvo movimiento) — se manda junto con el parte,
      // desde la misma pantalla de completar servicio.
      if (body.accion === "guardar_stock") {
        if (!body.parte_id || !Array.isArray(body.movimientos)) {
          res.status(400).json({ error: "Falta parte_id o la lista de movimientos" });
          return;
        }
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/stock`, {
          method: "POST",
          headers: { ...headersBackendNuevo, "Content-Type": "application/json" },
          body: JSON.stringify({ parte_id: body.parte_id, movimientos: body.movimientos }),
        });
        const data = await r.json();
        res.status(r.status).json(data);
        return;
      }

      // ---------- Instalación (zonas/canales/fotos) ----------
      if (body.accion === "crear_instalacion") {
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/instalaciones`, {
          method: "POST",
          headers: { ...headersBackendNuevo, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await r.json();
        res.status(r.status).json(data);
        return;
      }
      if (body.accion === "cerrar_instalacion") {
        if (!body.instalacion_id) {
          res.status(400).json({ error: "Falta instalacion_id" });
          return;
        }
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/instalaciones/${encodeURIComponent(body.instalacion_id)}/cerrar`, {
          method: "POST",
          headers: headersBackendNuevo,
        });
        const data = await r.json();
        if (!r.ok || !data.ok) {
          res.status(r.status).json(data);
          return;
        }

        // Se manda el mail de resumen ANTES de responder — para
        // asegurarse de que termina de mandarse (las funciones de
        // Vercel pueden cortarse apenas se manda la respuesta). Si el
        // mail falla, no se le muestra error al técnico — el cierre
        // en sí ya fue exitoso, eso es lo importante para él.
        try {
          await mandarMailResumenInstalacion(body.instalacion_id, BACKEND_NUEVO_URL, headersBackendNuevo);
        } catch (errMail) {
          console.error("No se pudo mandar el mail de resumen de instalación:", errMail);
        }

        res.status(200).json(data);
        return;
      }
      if (body.accion === "borrar_instalacion") {
        if (!body.instalacion_id) {
          res.status(400).json({ error: "Falta instalacion_id" });
          return;
        }
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/instalaciones/${encodeURIComponent(body.instalacion_id)}/borrar`, {
          method: "POST",
          headers: headersBackendNuevo,
        });
        const data = await r.json();
        res.status(r.status).json(data);
        return;
      }
      if (body.accion === "guardar_items_instalacion") {
        if (!body.instalacion_id || !body.tipo) {
          res.status(400).json({ error: "Falta instalacion_id o tipo" });
          return;
        }
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/instalaciones/${encodeURIComponent(body.instalacion_id)}/items`, {
          method: "POST",
          headers: { ...headersBackendNuevo, "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: body.tipo, items: body.items }),
        });
        const data = await r.json();
        res.status(r.status).json(data);
        return;
      }
      if (body.accion === "subir_foto_instalacion") {
        if (!body.instalacion_id || !body.base64) {
          res.status(400).json({ error: "Falta instalacion_id o la foto" });
          return;
        }
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/instalaciones/${encodeURIComponent(body.instalacion_id)}/fotos`, {
          method: "POST",
          headers: { ...headersBackendNuevo, "Content-Type": "application/json" },
          body: JSON.stringify({ nombre_archivo: body.nombre_archivo, base64: body.base64 }),
        });
        const data = await r.json();
        res.status(r.status).json(data);
        return;
      }
      if (body.accion === "borrar_foto_instalacion") {
        if (!body.instalacion_id || !body.nombre) {
          res.status(400).json({ error: "Falta instalacion_id o nombre" });
          return;
        }
        const r = await fetch(`${BACKEND_NUEVO_URL}/api/instalaciones/${encodeURIComponent(body.instalacion_id)}/fotos/${encodeURIComponent(body.nombre)}/borrar`, {
          method: "POST",
          headers: headersBackendNuevo,
        });
        const data = await r.json();
        res.status(r.status).json(data);
        return;
      }

      const registro = mapearHaciaBackendNuevo(body);
      const r = await fetch(`${BACKEND_NUEVO_URL}/api/partes`, {
        method: "POST",
        headers: { ...headersBackendNuevo, "Content-Type": "application/json" },
        body: JSON.stringify(registro),
      });
      const data = await r.json();
      if (!r.ok) {
        res.status(502).json({ error: "No se pudo guardar en el historial", detail: data });
        return;
      }
      res.status(200).json({ ok: true, id_parte: data.id });
    } catch (err) {
      res.status(500).json({ error: "Error interno al guardar el historial" });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
};
