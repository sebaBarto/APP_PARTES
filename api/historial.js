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
  };
}

// Backend nuevo -> app (al leer el historial completo)
function mapearDesdeBackendNuevo(p) {
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
  };
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
