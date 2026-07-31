// Función serverless de Vercel — maneja el "tomar / devolver /
// transferir" de tres tipos de recursos compartidos entre técnicos:
// vehículos, SIMs, y herramientas especiales. Antes eran dos
// funciones separadas (vehiculo-uso.js + sim-uso.js); se fusionaron
// en una sola (y se sumó acá directo la lógica de herramientas, en
// vez de crear una tercera función) para no gastar más de los 12
// "slots" de funciones del plan gratuito de Vercel — el parámetro
// "recurso" (?recurso=vehiculo|sim|herramienta) decide qué manejar.
//
// Variables de entorno reutilizadas:
//   SERVICIOS_API_TOKEN, GITHUB_DATA_TOKEN, GITHUB_DATA_REPO

async function leerJSON(ghHeaders, path, valorDefault) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${path}`;
  const r = await fetch(url, { headers: ghHeaders });
  if (r.status === 404) return { data: valorDefault, sha: null };
  if (!r.ok) throw new Error(`No se pudo leer ${path}`);
  const data = await r.json();
  const content = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  return { data: content, sha: data.sha };
}

async function guardarJSON(ghHeaders, path, contenido, sha) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${path}`;
  const contentB64 = Buffer.from(JSON.stringify(contenido, null, 2)).toString("base64");
  const r = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Actualiza ${path} (${new Date().toISOString()})`,
      content: contentB64,
      sha: sha || undefined,
    }),
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`No se pudo guardar ${path}: ${errText}`);
  }
}

// ============================================================
// VEHÍCULOS
// ============================================================
const VEH_HISTORIAL_PATH = "vehiculos-historial.json";
const VEH_CONFIG_PATH = "vehiculos-config.json";
const VEH_CONFIG_DEFAULT = [
  { nombre: "Renault Kangoo Blanca", km_actual: 0, umbrales: [] },
  { nombre: "Renault Kangoo Gris", km_actual: 0, umbrales: [] },
  { nombre: "Moto", km_actual: 0, umbrales: [] },
];

async function getVehiculo(ghHeaders, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const { data } = await leerJSON(ghHeaders, VEH_HISTORIAL_PATH, []);
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Error interno al leer el historial de vehículos" });
  }
}

async function postVehiculo(ghHeaders, body, res) {
  const { accion, vehiculo, tecnico } = body || {};
  if (!accion || !vehiculo || !tecnico) {
    res.status(400).json({ error: "Faltan datos (acción, vehículo o técnico)" });
    return;
  }

  const { data: historial, sha: shaHistorial } = await leerJSON(ghHeaders, VEH_HISTORIAL_PATH, []);

  if (accion === "tomar") {
    const yaTomado = historial.find((h) => h.vehiculo === vehiculo && !h.hora_devolucion);
    if (yaTomado) {
      res.status(409).json({ error: `Ese vehículo ya lo tiene ${yaTomado.tecnico} desde las ${yaTomado.hora_toma}` });
      return;
    }
    historial.push({
      vehiculo, tecnico,
      fecha: body.fecha || "", hora_toma: body.hora_toma || "",
      hora_devolucion: "", km_devolucion: "", evento: "",
    });
    await guardarJSON(ghHeaders, VEH_HISTORIAL_PATH, historial, shaHistorial);
    res.status(200).json({ ok: true });
    return;
  }

  if (accion === "devolver") {
    const abierto = [...historial].reverse().find((h) => h.vehiculo === vehiculo && h.tecnico === tecnico && !h.hora_devolucion);
    if (!abierto) {
      res.status(404).json({ error: "No se encontró un registro abierto de ese vehículo para vos" });
      return;
    }
    abierto.hora_devolucion = body.hora_devolucion || "";
    abierto.km_devolucion = body.km_devolucion || "";
    abierto.evento = body.evento || "";
    await guardarJSON(ghHeaders, VEH_HISTORIAL_PATH, historial, shaHistorial);

    if (body.km_devolucion) {
      const { data: vehiculosConfig, sha: shaConfig } = await leerJSON(ghHeaders, VEH_CONFIG_PATH, VEH_CONFIG_DEFAULT);
      const v = vehiculosConfig.find((x) => x.nombre === vehiculo);
      if (v) {
        v.km_actual = Number(body.km_devolucion) || v.km_actual;
        await guardarJSON(ghHeaders, VEH_CONFIG_PATH, vehiculosConfig, shaConfig);
      }
    }

    if (body.evento) {
      try {
        const { enviarATodos } = require("../lib/push-sender");
        await enviarATodos({ titulo: `⚠ Evento en ${vehiculo}`, cuerpo: `${tecnico} reportó: ${body.evento}`, url: "/" });
      } catch (err) {
        console.error("Error enviando push de evento de vehículo:", err);
      }
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (accion === "evento") {
    const abierto = [...historial].reverse().find((h) => h.vehiculo === vehiculo && h.tecnico === tecnico && !h.hora_devolucion);
    if (!abierto) {
      res.status(404).json({ error: "No tenés ese vehículo tomado en este momento" });
      return;
    }
    if (!body.tipo_evento || !body.km) {
      res.status(400).json({ error: "Falta el tipo de evento o el kilometraje" });
      return;
    }
    historial.push({
      vehiculo, tecnico,
      fecha: new Date().toISOString().slice(0, 10), hora: body.hora || "",
      accion: "evento", tipo_evento: body.tipo_evento, km: body.km,
      monto: body.monto || "", detalle: body.detalle || "",
    });
    await guardarJSON(ghHeaders, VEH_HISTORIAL_PATH, historial, shaHistorial);

    const { data: vehiculosConfig, sha: shaConfig } = await leerJSON(ghHeaders, VEH_CONFIG_PATH, VEH_CONFIG_DEFAULT);
    const v = vehiculosConfig.find((x) => x.nombre === vehiculo);
    if (v) {
      v.km_actual = Number(body.km) || v.km_actual;
      await guardarJSON(ghHeaders, VEH_CONFIG_PATH, vehiculosConfig, shaConfig);
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ error: "Acción desconocida (usar 'tomar', 'devolver' o 'evento')" });
}

// ============================================================
// SIMs
// ============================================================
const SIM_HISTORIAL_PATH = "sims-historial.json";
const SIM_CONFIG_PATH = "sims-config.json";
const SIM_REGISTRO_PATH = "sims-instaladas.json";

async function getSim(ghHeaders, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const { data } = await leerJSON(ghHeaders, SIM_HISTORIAL_PATH, []);
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Error interno al leer el historial de SIMs" });
  }
}

async function postSim(ghHeaders, body, res) {
  const { accion, numero, tecnico } = body || {};

  if (accion === "blanquear_historial") {
    const PUEDEN_BLANQUEAR = ["Sebastian Bartolozzi", "Brenda Thiesing", ""];
    if (!PUEDEN_BLANQUEAR.includes(tecnico || "")) {
      res.status(403).json({ error: "No tenés permiso para blanquear el historial de SIMs" });
      return;
    }
    const { sha: shaHistorialActual } = await leerJSON(ghHeaders, SIM_HISTORIAL_PATH, []);
    await guardarJSON(ghHeaders, SIM_HISTORIAL_PATH, [], shaHistorialActual);
    res.status(200).json({ ok: true });
    return;
  }

  // Migración automática de casos "viejos": SIMs que quedaron
  // marcadas "en uso" con un cliente dentro del archivo de stock, de
  // antes de que existiera el registro de instaladas separado. Se
  // dispara sola al abrir la pestaña de SIMs en admin.html — no hace
  // falta ningún dato puntual, migra todas las que encuentre.
  if (accion === "migrar_legacy_a_registro") {
    const { data: sims, sha: shaSims } = await leerJSON(ghHeaders, SIM_CONFIG_PATH, []);
    const legacy = sims.filter((s) => s.estado === "uso" && s.cliente);
    if (legacy.length === 0) {
      res.status(200).json({ ok: true, migradas: 0 });
      return;
    }
    const restante = sims.filter((s) => !(s.estado === "uso" && s.cliente));
    const { data: registro, sha: shaRegistro } = await leerJSON(ghHeaders, SIM_REGISTRO_PATH, []);
    const hoy = new Date().toISOString().slice(0, 10);
    legacy.forEach((s) => {
      registro.push({
        numero_abonado: "",
        estado_linea: "Activo",
        cliente: s.cliente,
        direccion: "",
        fecha_activacion: hoy, // no se sabe la fecha real de instalación de estos casos viejos
        numero: s.numero,
        empresa: s.empresa,
        tecnico_instalador: s.tecnico_actual || "",
      });
    });
    await guardarJSON(ghHeaders, SIM_CONFIG_PATH, restante, shaSims);
    await guardarJSON(ghHeaders, SIM_REGISTRO_PATH, registro, shaRegistro);
    res.status(200).json({ ok: true, migradas: legacy.length });
    return;
  }

  // "Retirar" es distinto al resto: la SIM no está en el stock sino
  // en el registro de instaladas (~900 líneas), así que se maneja
  // aparte — busca por número de línea en el registro, no en el stock.
  if (accion === "retirar_de_registro") {
    if (!numero || !tecnico) {
      res.status(400).json({ error: "Faltan datos (número de línea o técnico)" });
      return;
    }
    const { data: registro, sha: shaRegistro } = await leerJSON(ghHeaders, SIM_REGISTRO_PATH, []);
    const idxRegistro = registro.findIndex((s) => s.numero === numero);
    if (idxRegistro === -1) {
      res.status(404).json({ error: "No se encontró esa línea en el registro de instaladas" });
      return;
    }
    const instalada = registro[idxRegistro];
    registro.splice(idxRegistro, 1);

    const { data: sims, sha: shaSims } = await leerJSON(ghHeaders, SIM_CONFIG_PATH, []);
    sims.push({
      empresa: instalada.empresa || "",
      tipo: instalada.tipo || "",
      numero: instalada.numero,
      tecnico_actual: tecnico,
      estado: "stock",
      cliente: "",
    });

    const { data: historial, sha: shaHistorial } = await leerJSON(ghHeaders, SIM_HISTORIAL_PATH, []);
    historial.push({
      fecha: new Date().toISOString().slice(0, 10), hora: body.hora || "",
      numero, empresa: instalada.empresa || "", tecnico,
      accion: "retirar_de_registro", cliente_anterior: instalada.cliente || "",
    });

    await guardarJSON(ghHeaders, SIM_REGISTRO_PATH, registro, shaRegistro);
    await guardarJSON(ghHeaders, SIM_CONFIG_PATH, sims, shaSims);
    await guardarJSON(ghHeaders, SIM_HISTORIAL_PATH, historial, shaHistorial);
    res.status(200).json({ ok: true });
    return;
  }

  if (!accion || !numero || !tecnico) {
    res.status(400).json({ error: "Faltan datos (acción, número de SIM o técnico)" });
    return;
  }

  const { data: sims, sha: shaSims } = await leerJSON(ghHeaders, SIM_CONFIG_PATH, []);
  const sim = sims.find((s) => s.numero === numero);
  if (!sim) {
    res.status(404).json({ error: "No se encontró esa SIM" });
    return;
  }
  if (sim.tecnico_actual !== tecnico) {
    res.status(409).json({ error: `Esa SIM la tiene ${sim.tecnico_actual}, no vos` });
    return;
  }

  const { data: historial, sha: shaHistorial } = await leerJSON(ghHeaders, SIM_HISTORIAL_PATH, []);
  const registroBase = { fecha: new Date().toISOString().slice(0, 10), hora: body.hora || "", numero, empresa: sim.empresa, tecnico };

  if (accion === "devolver") {
    sim.estado = "stock";
    sim.cliente = "";
    historial.push({ ...registroBase, accion: "devolver" });
    await guardarJSON(ghHeaders, SIM_CONFIG_PATH, sims, shaSims);
    await guardarJSON(ghHeaders, SIM_HISTORIAL_PATH, historial, shaHistorial);
    res.status(200).json({ ok: true, sim });
    return;
  }

  if (accion === "transferir") {
    if (body.tecnico_nuevo === undefined || body.tecnico_nuevo === null) {
      res.status(400).json({ error: "Falta el técnico (o 'Oficina') al que se transfiere" });
      return;
    }
    historial.push({ ...registroBase, accion: "transferir", tecnico_nuevo: body.tecnico_nuevo || "Oficina" });
    sim.tecnico_anterior = tecnico;
    sim.tecnico_actual = body.tecnico_nuevo;
    sim.estado = "stock";
    sim.cliente = "";
    await guardarJSON(ghHeaders, SIM_CONFIG_PATH, sims, shaSims);
    await guardarJSON(ghHeaders, SIM_HISTORIAL_PATH, historial, shaHistorial);
    res.status(200).json({ ok: true, sim });
    return;
  }

  // "usar" y "reemplazar" instalan una SIM en un cliente — a partir de
  // acá esa línea deja de ser "stock que se mueve" y pasa a ser una
  // línea instalada y funcionando, así que sale del archivo de stock
  // y entra al registro grande de instaladas.
  if (accion === "usar") {
    if (!body.cliente) { res.status(400).json({ error: "Falta el cliente" }); return; }
    historial.push({ ...registroBase, accion: "usar", cliente: body.cliente, numero_servicio: body.numero_servicio || "" });

    const idx = sims.findIndex((s) => s.numero === numero);
    sims.splice(idx, 1);
    const { data: registro, sha: shaRegistro } = await leerJSON(ghHeaders, SIM_REGISTRO_PATH, []);
    registro.push({
      numero_abonado: "", // las que se instalan desde la app no tienen un N° de abonado legado
      estado_linea: "Activo",
      cliente: body.cliente,
      direccion: body.direccion || "",
      fecha_activacion: registroBase.fecha,
      numero: sim.numero,
      empresa: sim.empresa,
      tecnico_instalador: tecnico,
    });

    await guardarJSON(ghHeaders, SIM_CONFIG_PATH, sims, shaSims);
    await guardarJSON(ghHeaders, SIM_REGISTRO_PATH, registro, shaRegistro);
    await guardarJSON(ghHeaders, SIM_HISTORIAL_PATH, historial, shaHistorial);
    res.status(200).json({ ok: true, sim });
    return;
  }

  if (accion === "reemplazar") {
    if (sim.estado !== "stock") { res.status(409).json({ error: "Esa SIM no está en stock" }); return; }
    if (!body.cliente || !body.numero_sim_a_retirar) { res.status(400).json({ error: "Falta el cliente o la SIM que se retira" }); return; }

    // La SIM vieja que se retira estaba instalada (en el registro
    // grande, no en el stock) — sale de ahí y vuelve al stock del
    // técnico. La SIM nueva hace el camino inverso: sale del stock y
    // entra al registro, a nombre del mismo cliente.
    const { data: registro, sha: shaRegistro } = await leerJSON(ghHeaders, SIM_REGISTRO_PATH, []);
    const idxVieja = registro.findIndex((s) => s.numero === body.numero_sim_a_retirar);
    if (idxVieja === -1) { res.status(404).json({ error: "No se encontró en el registro la SIM que se retira" }); return; }
    const simVieja = registro[idxVieja];
    registro.splice(idxVieja, 1);

    const idxNueva = sims.findIndex((s) => s.numero === numero);
    sims.splice(idxNueva, 1);
    sims.push({
      empresa: simVieja.empresa || "",
      tipo: "",
      numero: simVieja.numero,
      tecnico_actual: tecnico,
      estado: "stock",
      cliente: "",
    });
    registro.push({
      numero_abonado: simVieja.numero_abonado || "",
      estado_linea: "Activo",
      cliente: body.cliente,
      direccion: body.direccion || simVieja.direccion || "",
      fecha_activacion: registroBase.fecha,
      numero: sim.numero,
      empresa: sim.empresa,
      tecnico_instalador: tecnico,
    });

    historial.push({
      ...registroBase, accion: "reemplazar", cliente: body.cliente,
      numero_servicio: body.numero_servicio || "", sim_retirada: body.numero_sim_a_retirar, empresa_retirada: simVieja.empresa,
    });

    await guardarJSON(ghHeaders, SIM_CONFIG_PATH, sims, shaSims);
    await guardarJSON(ghHeaders, SIM_REGISTRO_PATH, registro, shaRegistro);
    await guardarJSON(ghHeaders, SIM_HISTORIAL_PATH, historial, shaHistorial);
    res.status(200).json({ ok: true, sim });
    return;
  }

  res.status(400).json({ error: "Acción desconocida (usar 'usar', 'devolver', 'transferir', 'reemplazar' o 'retirar_de_registro')" });
}

// ============================================================
// HERRAMIENTAS (escaleras especiales, computadora, taladros, etc.)
// ============================================================
const HERR_HISTORIAL_PATH = "herramientas-historial.json";
const HERR_CONFIG_PATH = "herramientas-config.json";

async function getHerramienta(ghHeaders, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const { data } = await leerJSON(ghHeaders, HERR_HISTORIAL_PATH, []);
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Error interno al leer el historial de herramientas" });
  }
}

async function postHerramienta(ghHeaders, body, res) {
  const { accion, nombre, tecnico } = body || {};
  if (!accion || !nombre || !tecnico) {
    res.status(400).json({ error: "Faltan datos (acción, herramienta o técnico)" });
    return;
  }

  const { data: herramientas, sha: shaConfig } = await leerJSON(ghHeaders, HERR_CONFIG_PATH, []);
  const h = herramientas.find((x) => x.nombre === nombre);
  if (!h) {
    res.status(404).json({ error: "No se encontró esa herramienta" });
    return;
  }

  const { data: historial, sha: shaHistorial } = await leerJSON(ghHeaders, HERR_HISTORIAL_PATH, []);
  const registroBase = { fecha: new Date().toISOString().slice(0, 10), hora: body.hora || "", nombre, tecnico };

  if (accion === "tomar") {
    if (h.estado !== "libre") {
      res.status(409).json({ error: `Esa herramienta ya la tiene ${h.tecnico_actual || "alguien"}` });
      return;
    }
    h.estado = "uso";
    h.tecnico_actual = tecnico;
    h.cliente = "";
    historial.push({ ...registroBase, accion: "tomar" });
  } else if (accion === "devolver") {
    if (h.tecnico_actual !== tecnico) { res.status(409).json({ error: `Esa herramienta la tiene ${h.tecnico_actual}, no vos` }); return; }
    h.estado = "libre";
    h.tecnico_actual = "";
    h.cliente = "";
    historial.push({ ...registroBase, accion: "devolver" });
  } else if (accion === "transferir") {
    if (h.tecnico_actual !== tecnico) { res.status(409).json({ error: `Esa herramienta la tiene ${h.tecnico_actual}, no vos` }); return; }
    if (!body.tecnico_nuevo) { res.status(400).json({ error: "Falta el técnico al que se transfiere" }); return; }
    historial.push({ ...registroBase, accion: "transferir", tecnico_nuevo: body.tecnico_nuevo });
    h.tecnico_actual = body.tecnico_nuevo;
    h.estado = "uso";
    h.cliente = "";
  } else if (accion === "dejar_en_cliente") {
    if (h.tecnico_actual !== tecnico) { res.status(409).json({ error: `Esa herramienta la tiene ${h.tecnico_actual}, no vos` }); return; }
    if (!body.cliente) { res.status(400).json({ error: "Falta el cliente" }); return; }
    h.estado = "cliente";
    h.cliente = body.cliente;
    // tecnico_actual se mantiene: es quien la dejó, y quien en principio
    // tendría que ir a buscarla.
    historial.push({ ...registroBase, accion: "dejar_en_cliente", cliente: body.cliente });

    try {
      const { enviarATodos } = require("../lib/push-sender");
      await enviarATodos({
        titulo: `🔧 ${nombre} dejada en un cliente`,
        cuerpo: `${tecnico} la dejó en ${body.cliente}.`,
        url: "/",
      });
    } catch (err) {
      console.error("Error enviando push de herramienta dejada en cliente:", err);
    }
  } else if (accion === "retirar_de_cliente") {
    if (h.estado !== "cliente") { res.status(409).json({ error: "Esa herramienta no figura dejada en ningún cliente" }); return; }
    h.estado = "uso";
    h.tecnico_actual = tecnico;
    const clienteAnterior = h.cliente;
    h.cliente = "";
    historial.push({ ...registroBase, accion: "retirar_de_cliente", cliente: clienteAnterior });
  } else {
    res.status(400).json({ error: "Acción desconocida" });
    return;
  }

  await guardarJSON(ghHeaders, HERR_CONFIG_PATH, herramientas, shaConfig);
  await guardarJSON(ghHeaders, HERR_HISTORIAL_PATH, historial, shaHistorial);
  res.status(200).json({ ok: true, herramienta: h });
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

  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
    res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" });
    return;
  }
  const ghHeaders = { Authorization: `Bearer ${GITHUB_DATA_TOKEN}`, Accept: "application/vnd.github+json" };

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (err) { body = {}; }
  }
  const recurso = (req.query && req.query.recurso) || (body && body.recurso);

  try {
    if (req.method === "GET") {
      if (recurso === "vehiculo") return await getVehiculo(ghHeaders, res);
      if (recurso === "sim") return await getSim(ghHeaders, res);
      if (recurso === "herramienta") return await getHerramienta(ghHeaders, res);
      res.status(400).json({ error: "Falta indicar el recurso (?recurso=vehiculo|sim|herramienta)" });
      return;
    }

    if (req.method === "POST") {
      if (recurso === "vehiculo") return await postVehiculo(ghHeaders, body, res);
      if (recurso === "sim") return await postSim(ghHeaders, body, res);
      if (recurso === "herramienta") return await postHerramienta(ghHeaders, body, res);
      res.status(400).json({ error: "Falta indicar el recurso (vehiculo, sim o herramienta)" });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Método no permitido" });
  } catch (err) {
    res.status(500).json({ error: "Error interno al registrar el movimiento", detail: String(err.message || err) });
  }
};
