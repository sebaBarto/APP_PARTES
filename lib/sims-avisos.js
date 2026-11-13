// ============================================================
// AVISOS DE SIMs INSTALADAS QUE HAY QUE REVISAR
//
// Al cerrar una instalación, el instalador puede decir qué SIM puso. Si
// la SIM no estaba en su stock (la escribió a mano), si el cliente no está
// en la base de clientes, o si no se pudo registrar, el dato se guarda igual
// acá y la oficina lo ve como tarjeta en el Inicio del panel, para cargarlo
// bien y marcarlo como resuelto.
//
// Se guarda en el repo privado de datos: sims-avisos.json (lista, lo más
// nuevo primero). No es un archivo nuevo en /api (tope de funciones de
// Vercel): se llama desde api/datos.js.
// ============================================================
const crypto = require("crypto");

const RUTA = "sims-avisos.json";
const MOTIVOS = {
  sim_no_en_stock: "La SIM no estaba en su stock (la escribió a mano)",
  sim_no_registrada: "La SIM no está cargada en el sistema",
  cliente_no_existe: "El cliente no está en la base de clientes",
  no_se_pudo_registrar: "No se pudo registrar la SIM en el cliente",
};
const MAX = 500;

const txt = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const numeroSim = (v) => String(v == null ? "" : v).replace(/[^\d]/g, "").slice(0, 30);

function limpiarAviso(b, quien) {
  const motivos = [...new Set((Array.isArray(b.motivos) ? b.motivos : []).filter((m) => MOTIVOS[m]))];
  return {
    numero: numeroSim(b.numero),
    empresa: txt(b.empresa, 40),
    cliente: txt(b.cliente, 160),
    numero_cliente: txt(b.numero_cliente, 30),
    direccion: txt(b.direccion, 200),
    instalacion_id: txt(b.instalacion_id, 40),
    numero_servicio: txt(b.numero_servicio, 30),
    motivos,
    detalle: txt(b.detalle, 400),
    registrada: !!b.registrada, // la SIM sí quedó registrada en el cliente (solo falta revisar el cliente)
    tecnico: quien,
  };
}

async function manejar(req, res, autorizacion, gh, body) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const esAdmin = autorizacion.rol === "admin";
  const quien = String(autorizacion.nombre || "").trim();
  try {
    if (req.method === "GET") {
      const { data } = await gh.leer(RUTA, []);
      const lista = Array.isArray(data) ? data : [];
      res.status(200).json(esAdmin ? lista : lista.filter((a) => a.tecnico === quien));
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    const b = body && typeof body === "object" ? body : {};
    if (b.accion !== "agregar" && b.accion !== "resolver") { res.status(400).json({ error: "Acción desconocida" }); return; }
    if (b.accion === "agregar") {
      if (!quien) { res.status(403).json({ error: "Entrá con tu usuario para cargar la SIM" }); return; }
      const a = limpiarAviso(b, quien);
      if (!a.numero || a.numero.length < 6) { res.status(400).json({ error: "Escribí el número de la SIM" }); return; }
      if (!a.cliente) { res.status(400).json({ error: "Falta el cliente" }); return; }
      if (!a.motivos.length) { res.status(400).json({ error: "Falta el motivo del aviso" }); return; }
      b._aviso = a;
    } else if (!esAdmin) { res.status(403).json({ error: "Los avisos los resuelve la oficina" }); return; }

    for (let intento = 0; intento < 4; intento++) {
      const { data, sha, corrupto } = await gh.leer(RUTA, []);
      if (corrupto) { res.status(500).json({ error: "No se pudo leer el archivo de avisos" }); return; }
      const lista = Array.isArray(data) ? data : [];
      let nueva, respuesta;
      if (b.accion === "agregar") {
        const a = b._aviso;
        // La misma SIM en la misma instalación (reintento sin señal): se actualiza, no se duplica.
        const previo = lista.find((x) => x.estado === "pendiente" && x.numero === a.numero && (a.instalacion_id ? x.instalacion_id === a.instalacion_id : x.cliente === a.cliente));
        if (previo) {
          const act = { ...previo, ...a, id: previo.id, fecha: previo.fecha, estado: "pendiente", actualizado: new Date().toISOString() };
          nueva = lista.map((x) => (x === previo ? act : x));
          respuesta = { ok: true, aviso: act, ya_estaba: true };
        } else {
          const nuevo = { id: crypto.randomBytes(8).toString("hex"), fecha: new Date().toISOString(), estado: "pendiente", ...a };
          nueva = [nuevo, ...lista].slice(0, MAX);
          respuesta = { ok: true, aviso: nuevo };
        }
      } else {
        const x = lista.find((y) => y.id === String(b.id || ""));
        if (!x) { res.status(404).json({ error: "Ese aviso ya no está" }); return; }
        const act = { ...x, estado: "resuelto", resuelto_por: quien || "Oficina", resuelto_en: new Date().toISOString(), nota: txt(b.nota, 300) };
        nueva = lista.map((y) => (y === x ? act : y));
        respuesta = { ok: true, aviso: act };
      }
      const r = await gh.escribir(RUTA, nueva, sha, b.accion === "agregar" ? `SIM para revisar: ${b._aviso.numero} (${b._aviso.tecnico})` : `SIM revisada: ${b.id}`);
      if (r.ok) { res.status(200).json(respuesta); return; }
      if (r.status !== 409 && r.status !== 422) { res.status(502).json({ error: "No se pudo guardar el aviso" }); return; }
    }
    res.status(409).json({ error: "Se estaba guardando otro aviso al mismo tiempo: probá de nuevo" });
  } catch (err) {
    res.status(500).json({ error: "Error interno con los avisos de SIMs" });
  }
}

module.exports = { manejar, MOTIVOS, limpiarAviso };
