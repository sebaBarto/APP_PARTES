// ============================================================
// EQUIPO DEL CLIENTE CARGADO A MANO POR LA OFICINA
//
// La APP deduce de los partes qué sistema tiene cada cliente y de cuándo es
// la batería (equipo-utils.js). Para los clientes de antes de la APP, o si
// la deducción se equivoca, la oficina lo corrige desde el panel y queda acá:
// equipos-clientes.json en el repo privado de datos, { clave: {...} }.
// Lo leen todos (la APP lo usa para avisar al técnico); lo escribe la oficina.
// ============================================================
const E = require("../equipo-utils.js");

const RUTA = "equipos-clientes.json";
const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || "")) && !isNaN(Date.parse(f));
const txt = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

async function manejar(req, res, autorizacion, gh, body) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const esAdmin = autorizacion.rol === "admin";
  try {
    if (req.method === "GET") {
      const { data } = await gh.leer(RUTA, {});
      res.status(200).json(data && typeof data === "object" && !Array.isArray(data) ? data : {});
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    if (!esAdmin) { res.status(403).json({ error: "El equipo del cliente lo corrige la oficina" }); return; }
    const b = body && typeof body === "object" ? body : {};
    if (b.accion !== "poner") { res.status(400).json({ error: "Acción desconocida" }); return; }
    const clave = E.claveCliente(b.numero_cliente, b.nombre);
    if (!clave) { res.status(400).json({ error: "Falta el cliente" }); return; }
    const cambios = {};
    const quien = txt(autorizacion.nombre, 60) || "Oficina", hoy = new Date().toISOString().slice(0, 10);
    if ("sistema" in b) {
      if (b.sistema && !E.EQUIPO_MARCAS.includes(b.sistema) && b.sistema !== "Otro") { res.status(400).json({ error: "Marca desconocida" }); return; }
      Object.assign(cambios, b.sistema ? { sistema: b.sistema, sistema_fecha: hoy, sistema_por: quien } : { sistema: "", sistema_fecha: "", sistema_por: "" });
    }
    if ("bateria_fecha" in b) {
      if (b.bateria_fecha && !fechaValida(b.bateria_fecha)) { res.status(400).json({ error: "Fecha de batería inválida" }); return; }
      if (b.bateria_fecha && b.bateria_fecha > hoy) { res.status(400).json({ error: "La fecha de la batería no puede ser futura" }); return; }
      Object.assign(cambios, { bateria_fecha: b.bateria_fecha || "", bateria_por: b.bateria_fecha ? quien : "" });
    }
    if ("nota" in b) cambios.nota = txt(b.nota, 300);
    if (!Object.keys(cambios).length) { res.status(400).json({ error: "No hay nada para guardar" }); return; }
    for (let intento = 0; intento < 4; intento++) {
      const { data, sha, corrupto } = await gh.leer(RUTA, {});
      if (corrupto) { res.status(500).json({ error: "No se pudo leer el archivo de equipos" }); return; }
      const todo = data && typeof data === "object" && !Array.isArray(data) ? { ...data } : {};
      const nuevo = { ...(todo[clave] || {}), ...cambios, cliente: txt(b.nombre, 160) || (todo[clave] || {}).cliente || "", numero_cliente: txt(b.numero_cliente, 30) || (todo[clave] || {}).numero_cliente || "", actualizado: new Date().toISOString() };
      // Sin nada cargado, se borra la entrada.
      if (!nuevo.sistema && !nuevo.bateria_fecha && !nuevo.nota) delete todo[clave]; else todo[clave] = nuevo;
      const r = await gh.escribir(RUTA, todo, sha, `Equipo del cliente: ${nuevo.cliente || clave}`);
      if (r.ok) { res.status(200).json({ ok: true, clave, equipo: todo[clave] || null }); return; }
      if (r.status !== 409 && r.status !== 422) { res.status(502).json({ error: "No se pudo guardar" }); return; }
    }
    res.status(409).json({ error: "Se estaba guardando otro cambio al mismo tiempo: probá de nuevo" });
  } catch (err) {
    res.status(500).json({ error: "Error interno con el equipo del cliente" });
  }
}

module.exports = { manejar, RUTA };
