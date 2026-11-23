// ============================================================
// RESEÑAS DE GOOGLE PEDIDAS POR WHATSAPP
//
// Desde la ficha del historial, el técnico o la oficina le manda al
// cliente un WhatsApp invitándolo a dejar una reseña en Google. Acá se
// anota a quién ya se le pidió (por parte, N° de cliente y teléfono),
// para que nadie se la vuelva a pedir sin saberlo.
//
// Se guarda en el repo privado de datos: resenas-pedidas.json (lista, lo
// más nuevo primero). Se llama desde api/datos.js (tope de funciones de Vercel).
// ============================================================
const RUTA = "resenas-pedidas.json";
const MAX = 4000;
const txt = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const soloDigitos = (v) => String(v == null ? "" : v).replace(/\D/g, "").slice(-10); // sin 54/9: así coincide como sea que esté cargado

async function manejar(req, res, autorizacion, gh, body) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    if (req.method === "GET") {
      const { data } = await gh.leer(RUTA, []);
      res.status(200).json(Array.isArray(data) ? data : []);
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    const b = body && typeof body === "object" ? body : {};
    if (b.accion !== "pedida") { res.status(400).json({ error: "Acción desconocida" }); return; }
    const reg = {
      id_parte: txt(b.id_parte, 60),
      numero_cliente: txt(b.numero_cliente, 30),
      cliente: txt(b.cliente, 160),
      telefono: soloDigitos(b.telefono),
      fecha: new Date().toISOString(),
      por: txt(autorizacion.nombre, 60) || "Oficina",
    };
    if (!reg.id_parte) { res.status(400).json({ error: "Falta el parte" }); return; }
    if (reg.telefono.length < 6) { res.status(400).json({ error: "Falta el teléfono del cliente" }); return; }
    for (let intento = 0; intento < 4; intento++) {
      const { data, sha, corrupto } = await gh.leer(RUTA, []);
      if (corrupto) { res.status(500).json({ error: "No se pudo leer el archivo de reseñas" }); return; }
      const lista = Array.isArray(data) ? data : [];
      const r = await gh.escribir(RUTA, [reg, ...lista].slice(0, MAX), sha, `Reseña pedida: ${reg.cliente || reg.id_parte} (${reg.por})`);
      if (r.ok) { res.status(200).json({ ok: true, registro: reg }); return; }
      if (r.status !== 409 && r.status !== 422) { res.status(502).json({ error: "No se pudo guardar" }); return; }
    }
    res.status(409).json({ error: "Se estaba guardando otra al mismo tiempo: probá de nuevo" });
  } catch (err) {
    res.status(500).json({ error: "Error interno con las reseñas" });
  }
}

module.exports = { manejar, soloDigitos };
