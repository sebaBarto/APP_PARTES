// ============================================================
// MI SAT — PORTAL DE CLIENTES (mi-sat.html, pedido.sat365.com.ar/oficina)
//
// El cliente entra con su número de cliente y una clave que elige él.
// Primer ingreso: pide el acceso con su número de cliente, el celular que
// SAT ya tiene cargado y su DNI; elige la clave en ese momento. La cuenta
// queda pendiente hasta que la oficina la aprueba desde admin.html →
// "Portal de clientes" (mismo criterio que el portal de llaves).
//
// Qué ve el cliente (solo lo suyo, siempre buscado por número de cliente):
//   - nombre, dirección y si está conectado al monitoreo;
//   - comunicador celular activo (empresa y desde cuándo, nunca el número);
//   - la última visita registrada y los services cargados en la APP
//     (fecha, tipo, tarea, técnico, horario, costo y forma de pago).
// Nunca: claves de la alarma, observaciones internas, imprevistos,
// materiales, firmas, ni datos de otros clientes.
//
// Archivo en el repo privado de datos:
//   mi-sat/cuentas.json   pedidos y cuentas (clave hasheada, nunca en claro)
//
// SEGURIDAD
//  - Pase propio ("m1.…", encabezado X-MiSat), firmado con una clave distinta
//    a la de la APP y la del portal de consorcios: no sirve para nada más.
//  - Cada pedido vuelve a comprobar que la cuenta siga activa y con la misma
//    versión de clave (si la oficina la reinicia, el pase deja de valer).
//  - Topes por IP y por número de cliente; bloqueo persistente en el backend.
//  - El pedido de acceso responde siempre lo mismo: no revela si un número
//    de cliente existe ni si el celular coincide (eso lo ve solo la oficina).
// ============================================================
const crypto = require("crypto");
const { util } = require("./registro-llaves");
const { modificar, pasaTope, ipDe, cuerpo } = util;

const RUTA = "mi-sat/cuentas.json";
// Datos del sistema de cada cliente que carga la oficina (marca de alarma, teclado, cámaras…).
const RUTA_FICHAS = "mi-sat/fichas.json";
// Estado de cuenta (al día / con saldo pendiente) que sube la oficina desde un Excel.
const RUTA_ESTADO = "mi-sat/estado-cuenta.json";
// Deuda de services y presupuestos (otro Excel): los clientes que no figuran no deben nada.
const RUTA_DEUDA_SERV = "mi-sat/deuda-servicios.json";
const RUTAS_CUENTA = { abono: RUTA_ESTADO, servicios: RUTA_DEUDA_SERV };
const MARCAS_ALARMA = { paradox: "Paradox", dsc: "DSC", ajax: "Ajax", otra: "Otra" };
const TECLADOS = { lcd: ["paradox", "K32 LCD"], k10: ["paradox", "K10H"], pk: ["dsc", "PK5501"], rkz: ["dsc", "PC1555RKZ"], ts: ["ajax", "KeyPad TouchScreen"], combi: ["ajax", "Teclado Ajax"] };
const txtCorto = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const entero = (v, max) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null; };
function limpiarFicha(f) {
  f = f && typeof f === "object" ? f : {};
  const marca = MARCAS_ALARMA[f.alarma_marca] ? f.alarma_marca : "";
  const teclado = TECLADOS[f.teclado] && TECLADOS[f.teclado][0] === marca ? f.teclado : "";
  return {
    alarma: !!f.alarma, camaras: !!f.camaras, alarma_marca: marca, alarma_modelo: txtCorto(f.alarma_modelo, 40), teclado,
    zonas: entero(f.zonas, 200), camaras_marca: txtCorto(f.camaras_marca, 30), camaras_cantidad: entero(f.camaras_cantidad, 200),
    otros: txtCorto(f.otros, 200), nota_cliente: txtCorto(f.nota_cliente, 300),
  };
}
async function leerJson(gh, ruta, defecto) { const { data } = await gh.leer(ruta, defecto); return data && typeof data === "object" ? data : defecto; }
const HORAS_SESION = 12;
const MAX_CUENTAS = 20000;
const TOPES = {
  loginPorIp: { n: 12, ms: 15 * 60 * 1000 },
  loginPorNumero: { n: 6, ms: 15 * 60 * 1000 },
  pedidoPorIp: { n: 5, ms: 60 * 60 * 1000 },
  pedidoPorNumero: { n: 3, ms: 24 * 60 * 60 * 1000 },
  datosPorCuenta: { n: 60, ms: 60 * 1000 },
};
const ESTADOS = { pendiente: "Pendiente", activa: "Activa", rechazada: "Rechazada", baja: "Dada de baja" };

// ---------- utilidades ----------
const soloDigitos = (v, max = 20) => String(v == null ? "" : v).replace(/\D/g, "").slice(0, max);
const numeroCliente = (v) => String(v == null ? "" : v).replace(/[^0-9A-Za-z\-]/g, "").slice(0, 20);
// Los números de cliente a veces se escriben con ceros adelante: se comparan sin ellos.
const mismoNumero = (a, b) => { const x = String(a || "").trim().replace(/^0+/, ""), y = String(b || "").trim().replace(/^0+/, ""); return !!x && x === y; };
function secreto() { return process.env.SESION_SECRET || process.env.SERVICIOS_API_TOKEN || ""; }
function firmar(texto) { return crypto.createHmac("sha256", "sat-misat-v1:" + secreto()).update(texto).digest("base64url"); }
function igualSeguro(a, b) { const ba = Buffer.from(String(a)), bb = Buffer.from(String(b)); return ba.length === bb.length && crypto.timingSafeEqual(ba, bb); }
function hashClave(clave, sal) { return crypto.pbkdf2Sync(String(clave), sal, 120000, 32, "sha256").toString("hex"); }
const CLAVES_DEBILES = ["12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "password", "contraseña", "contrasena", "qwertyui", "qwerty123", "abc12345", "abcd1234", "sat12345", "sat365sat", "alarma123", "alarmasat"];
function claveDebil(clave, numero, dni) {
  const n = String(clave).toLowerCase();
  if (CLAVES_DEBILES.includes(n) || /^(.)\1+$/.test(n)) return true;
  const num = String(numero || "").replace(/^0+/, "");
  return (num.length >= 3 && n.includes(num)) || (!!dni && dni.length >= 7 && n.includes(dni));
}
function crearPase(c) {
  const datos = Buffer.from(JSON.stringify({ i: c.id, v: c.v || 1, e: Date.now() + HORAS_SESION * 3600e3 })).toString("base64url");
  return `m1.${datos}.${firmar(datos)}`;
}
function leerPase(token) {
  const t = String(token || "").trim();
  if (!secreto() || !t.startsWith("m1.")) return null;
  const p = t.split(".");
  if (p.length !== 3 || !igualSeguro(p[2], firmar(p[1]))) return null;
  try { const d = JSON.parse(Buffer.from(p[1], "base64url").toString("utf-8")); return d && d.e > Date.now() ? d : null; } catch (e) { return null; }
}
async function bloqueoPersistente(clave, exito) {
  const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
  if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) return null;
  try {
    const h = { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" };
    const r = exito === undefined
      ? await fetch(`${BACKEND_NUEVO_URL}/api/admin-login/estado?ip=${encodeURIComponent(clave)}`, { headers: h, signal: AbortSignal.timeout(3000) })
      : await fetch(`${BACKEND_NUEVO_URL}/api/admin-login/registrar`, { method: "POST", headers: h, body: JSON.stringify({ ip: clave, exito }), signal: AbortSignal.timeout(3000) });
    return await r.json();
  } catch (e) { return null; }
}

// ---------- datos de la base (backend nuevo, Cloudflare D1) ----------
// Las tablas son chicas: se piden enteras y se guardan un minuto en memoria.
const cacheTablas = {};
async function tabla(ruta) {
  const c = cacheTablas[ruta];
  if (c && Date.now() - c.t < 60 * 1000) return c.filas;
  const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
  const r = await fetch(`${BACKEND_NUEVO_URL}${ruta}`, { headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}` }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("La base respondió " + r.status);
  const filas = await r.json();
  cacheTablas[ruta] = { t: Date.now(), filas: Array.isArray(filas) ? filas : [] };
  return cacheTablas[ruta].filas;
}
const buscarCliente = async (numero) => (await tabla("/api/clientes")).find((c) => mismoNumero(c.numero_cliente, numero)) || null;
function celularCoincide(cliente, celular) {
  const d = soloDigitos(celular);
  if (!cliente || d.length < 7) return false;
  const reg = soloDigitos(cliente.telefono, 200);
  return reg.includes(d.slice(-7));
}
// "BARTOLOZZI, SEBASTIAN" / "SEBASTIAN BARTOLOZZI" → "Sebastian" (para el saludo).
function nombrePila(nombre) {
  const s = String(nombre || "").trim();
  const pila = s.includes(",") ? s.split(",")[1].trim().split(/\s+/)[0] : s.split(/\s+/)[0];
  return pila ? pila.charAt(0).toUpperCase() + pila.slice(1).toLowerCase() : "";
}
const FORMAS_PAGO = { "PAGADO": "Pagado", "TRANSFIERE": "Por transferencia", "PAGA CON ABONO": "Con el abono", "DEBITO": "Débito", "PAGA EN OF": "En la oficina" };
async function datosDelCliente(numero, gh) {
  const [cliente, sims, visitas, partes] = await Promise.all([
    buscarCliente(numero), tabla("/api/sims/instaladas"), tabla("/api/visitas-historicas"), tabla("/api/partes"),
  ]);
  if (!cliente) return null;
  const abonado = String(cliente.numero_abonado || "").trim();
  const comunicadores = sims
    .filter((s) => mismoNumero(s.numero_cliente, numero) || (abonado && mismoNumero(s.numero_abonado, abonado)))
    .filter((s) => /activ/i.test(String(s.estado_linea || "Activo")))
    .map((s) => ({ empresa: String(s.empresa || "").trim(), desde: String(s.fecha_activacion || "").slice(0, 10) }));
  const visita = visitas.find((v) => mismoNumero(v.numero_cliente, numero) && !v.ignorado);
  const services = partes
    .filter((p) => mismoNumero(p.numero_cliente, numero) && p.tipo_servicio !== "carga_manual")
    .map((p) => ({
      numero: p.numero_servicio || "", fecha: String(p.fecha || "").slice(0, 10),
      tipo: p.tipo_servicio || (p.es_instalacion ? "Instalación" : "Servicio técnico"),
      tarea: String(p.tarea || "").slice(0, 300), tecnico: String(p.tecnico || "").split(/\s+/)[0],
      desde: p.hora_entrada || "", hasta: p.hora_salida || "",
      costo: p.costo_final != null && p.costo_final !== "" ? Number(p.costo_final) : null,
      pago: FORMAS_PAGO[String(p.forma_pago || "").trim().toUpperCase()] || "",
    }))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const fechas = [services[0] && services[0].fecha, visita && visita.ultima_visita].filter(Boolean).sort();
  const [fichas, estado, deudaServ] = gh ? await Promise.all([leerJson(gh, RUTA_FICHAS, {}), leerJson(gh, RUTA_ESTADO, null), leerJson(gh, RUTA_DEUDA_SERV, null)]) : [{}, null, null];
  const claveFicha = Object.keys(fichas).find((k) => mismoNumero(k, cliente.numero_cliente));
  const f = claveFicha ? fichas[claveFicha] : null;
  const ficha = f ? { ...limpiarFicha(f), alarma_marca_txt: MARCAS_ALARMA[f.alarma_marca] || "", teclado_txt: TECLADOS[f.teclado] ? TECLADOS[f.teclado][1] : "" } : null;
  let cuenta = null;
  if (estado && estado.clientes) {
    const k = Object.keys(estado.clientes).find((x) => mismoNumero(x, cliente.numero_cliente));
    const e = k ? estado.clientes[k] : null;
    if (e) cuenta = { al_dia: e.estado === "al_dia", importe: estado.mostrar_importe && e.saldo > 0 ? e.saldo : null, actualizado: String(estado.actualizado_en || "").slice(0, 10) };
    else if (estado.no_figuran_al_dia) cuenta = { al_dia: true, importe: null, actualizado: String(estado.actualizado_en || "").slice(0, 10) };
  }
  // Services y presupuestos: si ya se cargó un archivo, el que no figura no debe nada.
  let servicios_deuda = null;
  if (deudaServ && deudaServ.clientes) {
    const k = Object.keys(deudaServ.clientes).find((x) => mismoNumero(x, cliente.numero_cliente));
    const e = k ? deudaServ.clientes[k] : null;
    servicios_deuda = { al_dia: !e || e.estado === "al_dia", importe: e && deudaServ.mostrar_importe && e.saldo > 0 ? e.saldo : null, actualizado: String(deudaServ.actualizado_en || "").slice(0, 10) };
  }
  return {
    numero_cliente: String(cliente.numero_cliente), nombre: nombrePila(cliente.nombre), nombre_completo: String(cliente.nombre || ""),
    direccion: [cliente.direccion, cliente.localidad].filter(Boolean).join(" · "),
    monitoreo: !!abonado, comunicadores,
    ultima_visita: fechas.length ? fechas[fechas.length - 1] : "",
    visita_anterior: visita && visita.ultima_visita && visita.ultima_visita < "2026-07-01" ? String(visita.ultima_visita).slice(0, 10) : "",
    services, ficha, cuenta, servicios_deuda,
  };
}

// ---------- cuentas ----------
let cacheCuentas = null;
async function leerCuentas(gh, fresco) {
  if (!fresco && cacheCuentas && Date.now() - cacheCuentas.t < 30 * 1000) return cacheCuentas.lista;
  const { data } = await gh.leer(RUTA, []);
  cacheCuentas = { t: Date.now(), lista: Array.isArray(data) ? data : [] };
  return cacheCuentas.lista;
}
async function cuentaDelPedido(req, gh) {
  const h = (req.headers && (req.headers["x-misat"] || req.headers["X-MiSat"])) || "";
  const p = leerPase(h);
  if (!p) return null;
  const c = (await leerCuentas(gh)).find((x) => x.id === p.i);
  if (!c || c.estado !== "activa" || (c.v || 1) !== p.v) return null;
  return c;
}
const MENSAJE_PEDIDO = "Recibimos tu pedido. La oficina controla tus datos y te avisamos por WhatsApp cuando tu acceso esté habilitado.";

// ---------- Portal (público) ----------
async function manejarPortal(req, res, gh) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.GITHUB_DATA_TOKEN || !process.env.GITHUB_DATA_REPO || !secreto() || !process.env.BACKEND_NUEVO_URL) { res.status(500).json({ error: "Falta configuración del servidor" }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
  const ip = ipDe(req);
  const b = cuerpo(req);
  try {
    // ---------- Primer ingreso: pedido de acceso ----------
    if (b.accion === "pedir_acceso") {
      const numero = numeroCliente(b.numero_cliente), celular = soloDigitos(b.celular), dni = soloDigitos(b.dni, 11);
      const clave = String(b.clave || "");
      if (!numero || numero.replace(/^0+/, "").length < 1) { res.status(400).json({ error: "Escribí tu número de cliente" }); return; }
      if (celular.length < 8) { res.status(400).json({ error: "Escribí tu celular con la característica (ej. 341 5551234)" }); return; }
      if (dni.length < 7) { res.status(400).json({ error: "Escribí el DNI o CUIT del titular, sin puntos" }); return; }
      if (clave.length < 8 || clave.length > 72) { res.status(400).json({ error: "La clave tiene que tener entre 8 y 72 caracteres" }); return; }
      if (claveDebil(clave, numero, dni)) { res.status(400).json({ error: "Esa clave es muy fácil de adivinar. Usá letras y números, y que no sea tu DNI ni tu número de cliente" }); return; }
      if (b.web) { res.status(200).json({ ok: true, mensaje: MENSAJE_PEDIDO }); return; } // campo trampa para robots
      if (!pasaTope("mp|" + ip, TOPES.pedidoPorIp) || !pasaTope("mn|" + numero.replace(/^0+/, ""), TOPES.pedidoPorNumero)) { res.status(429).json({ error: "Ya recibimos varios pedidos. Esperá un rato o escribinos por WhatsApp" }); return; }
      let cliente = null;
      try { cliente = await buscarCliente(numero); } catch (e) { cliente = null; }
      const sal = crypto.randomBytes(16).toString("hex");
      const pedido = {
        id: "ms" + crypto.randomBytes(6).toString("hex"), numero_cliente: cliente ? String(cliente.numero_cliente) : numero,
        estado: "pendiente", creado_en: new Date().toISOString(),
        celular, dni, existe_cliente: !!cliente, celular_coincide: celularCoincide(cliente, celular),
        nombre_base: cliente ? String(cliente.nombre || "") : "", telefono_base: cliente ? String(cliente.telefono || "") : "",
        direccion_base: cliente ? [cliente.direccion, cliente.localidad].filter(Boolean).join(" · ") : "",
        sal, hash: hashClave(clave, sal), v: 1,
      };
      await modificar(gh, RUTA, [], (lista) => {
        // Un pedido pendiente anterior del mismo número se reemplaza por el nuevo.
        const otras = lista.filter((c) => !(c.estado === "pendiente" && mismoNumero(c.numero_cliente, pedido.numero_cliente)));
        if (otras.length >= MAX_CUENTAS) return null;
        otras.push(pedido);
        return otras;
      }, "Mi SAT: pedido de acceso");
      cacheCuentas = null;
      res.status(200).json({ ok: true, mensaje: MENSAJE_PEDIDO });
      return;
    }

    // ---------- Ingreso ----------
    if (b.accion === "login") {
      const numero = numeroCliente(b.numero_cliente), clave = String(b.clave == null ? "" : b.clave).slice(0, 200);
      const clv = numero.replace(/^0+/, "");
      if (!pasaTope("ml|" + ip, TOPES.loginPorIp) || !pasaTope("mln|" + clv, TOPES.loginPorNumero)) { res.status(429).json({ error: "Demasiados intentos. Esperá 15 minutos y probá de nuevo" }); return; }
      const bloqueo = await bloqueoPersistente("misat:" + clv);
      if (bloqueo && bloqueo.bloqueado) { res.status(429).json({ error: `Demasiados intentos con este número. Probá de nuevo en ${bloqueo.minutos_restantes || 15} minutos` }); return; }
      const cuentas = (await leerCuentas(gh, true)).filter((c) => mismoNumero(c.numero_cliente, numero) && (c.estado === "activa" || c.estado === "pendiente"));
      // Se prueba la activa primero; el hash se calcula aunque no haya cuenta (misma demora).
      cuentas.sort((a, b) => (a.estado === "activa" ? -1 : 1) - (b.estado === "activa" ? -1 : 1));
      let ok = null;
      for (const c of cuentas) { if (igualSeguro(hashClave(clave, c.sal), c.hash)) { ok = c; break; } }
      if (!cuentas.length) hashClave(clave, "x");
      if (!ok) {
        const reg = clv ? await bloqueoPersistente("misat:" + clv, false) : null;
        if (reg && reg.bloqueado) { res.status(429).json({ error: `Demasiados intentos con este número. Probá de nuevo en ${reg.minutos_restantes || 15} minutos` }); return; }
        res.status(401).json({ error: "Número de cliente o clave incorrectos" });
        return;
      }
      await bloqueoPersistente("misat:" + clv, true);
      if (ok.estado === "pendiente") { res.status(403).json({ error: "Tu pedido de acceso todavía está en revisión. Te avisamos por WhatsApp cuando esté habilitado", pendiente: true }); return; }
      await modificar(gh, RUTA, [], (lista) => { const x = lista.find((c) => c.id === ok.id); if (!x) return null; x.ultimo_ingreso = new Date().toISOString(); return lista; }, "Mi SAT: ingreso").catch(() => {});
      cacheCuentas = null;
      res.status(200).json({ pase: crearPase(ok) });
      return;
    }

    const cuenta = await cuentaDelPedido(req, gh);
    if (!cuenta) { res.status(401).json({ error: "La sesión venció. Volvé a entrar", sesion_vencida: true }); return; }

    if (b.accion === "datos") {
      if (!pasaTope("md|" + cuenta.id, TOPES.datosPorCuenta)) { res.status(429).json({ error: "Demasiados pedidos seguidos. Esperá un minuto" }); return; }
      const d = await datosDelCliente(cuenta.numero_cliente, gh);
      if (!d) { res.status(404).json({ error: "No encontramos los datos de tu cuenta. Escribinos por WhatsApp" }); return; }
      res.status(200).json(d);
      return;
    }
    if (b.accion === "cambiar_clave") {
      if (!igualSeguro(hashClave(String(b.actual == null ? "" : b.actual).slice(0, 200), cuenta.sal), cuenta.hash)) { res.status(400).json({ error: "La clave actual no es correcta" }); return; }
      const nueva = String(b.nueva || "");
      if (nueva.length < 8 || nueva.length > 72) { res.status(400).json({ error: "La clave nueva tiene que tener entre 8 y 72 caracteres" }); return; }
      if (claveDebil(nueva, cuenta.numero_cliente, cuenta.dni)) { res.status(400).json({ error: "Esa clave es muy fácil de adivinar. Usá letras y números" }); return; }
      let act = null;
      await modificar(gh, RUTA, [], (lista) => {
        const x = lista.find((c) => c.id === cuenta.id); if (!x) return null;
        x.sal = crypto.randomBytes(16).toString("hex"); x.hash = hashClave(nueva, x.sal); x.v = (x.v || 1) + 1; x.clave_cambiada_en = new Date().toISOString();
        act = x; return lista;
      }, "Mi SAT: el cliente cambió su clave");
      cacheCuentas = null;
      res.status(200).json({ ok: true, pase: act ? crearPase(act) : null });
      return;
    }
    res.status(400).json({ error: "Acción desconocida" });
  } catch (e) {
    console.error("Mi SAT:", e);
    res.status(500).json({ error: "No pudimos completar el pedido. Probá de nuevo en un rato" });
  }
}

// ---------- Admin (oficina) ----------
const cuentaParaAdmin = (c) => { const { sal, hash, ...resto } = c; return { ...resto, estado_txt: ESTADOS[c.estado] || c.estado }; };
async function manejarAdmin(req, res, autorizacion, gh) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (!autorizacion || autorizacion.rol !== "admin") { res.status(403).json({ error: "Solo desde el panel de administración" }); return; }
  if (!process.env.GITHUB_DATA_TOKEN || !process.env.GITHUB_DATA_REPO) { res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" }); return; }
  const quien = autorizacion.nombre || "admin";
  try {
    if (req.method === "GET") {
      if (req.query.fichas) { res.status(200).json(await leerJson(gh, RUTA_FICHAS, {})); return; }
      if (req.query.estado_cuenta) {
        const e = await leerJson(gh, RUTAS_CUENTA[req.query.tipo] || RUTA_ESTADO, null);
        res.status(200).json(e ? { actualizado_en: e.actualizado_en, actualizado_por: e.actualizado_por, archivo: e.archivo, no_figuran_al_dia: !!e.no_figuran_al_dia, mostrar_importe: !!e.mostrar_importe, total: Object.keys(e.clientes || {}).length, pendientes: Object.values(e.clientes || {}).filter((x) => x.estado !== "al_dia").length, clientes: e.clientes || {} } : null);
        return;
      }
      const lista = (await leerCuentas(gh, true)).map(cuentaParaAdmin).sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)));
      res.status(200).json(lista);
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    const b = cuerpo(req);
    const id = String(b.id || "");
    const acciones = {
      aprobar: (c, lista) => {
        if (c.estado !== "pendiente") return "Ese pedido ya no está pendiente";
        if (!c.existe_cliente) return "Ese número de cliente no está en la base: no se puede aprobar";
        // La cuenta activa anterior del mismo cliente (si había) queda dada de baja.
        lista.forEach((x) => { if (x.id !== c.id && x.estado === "activa" && mismoNumero(x.numero_cliente, c.numero_cliente)) { x.estado = "baja"; x.baja_en = new Date().toISOString(); x.baja_por = quien + " (reemplazada por un pedido nuevo)"; } });
        c.estado = "activa"; c.aprobado_por = quien; c.aprobado_en = new Date().toISOString();
      },
      rechazar: (c) => { if (c.estado !== "pendiente") return "Ese pedido ya no está pendiente"; c.estado = "rechazada"; c.rechazado_por = quien; c.rechazado_en = new Date().toISOString(); c.motivo = String(b.motivo || "").slice(0, 200); },
      dar_baja: (c) => { if (c.estado !== "activa") return "Esa cuenta no está activa"; c.estado = "baja"; c.baja_por = quien; c.baja_en = new Date().toISOString(); c.v = (c.v || 1) + 1; },
      reactivar: (c, lista) => {
        if (c.estado !== "baja") return "Solo se reactivan cuentas dadas de baja";
        if (lista.some((x) => x.id !== c.id && x.estado === "activa" && mismoNumero(x.numero_cliente, c.numero_cliente))) return "Ese cliente ya tiene otra cuenta activa";
        c.estado = "activa"; c.reactivado_por = quien; c.reactivado_en = new Date().toISOString();
      },
    };
    if (b.accion === "guardar_ficha") {
      const numero = numeroCliente(b.numero_cliente);
      if (!numero) { res.status(400).json({ error: "Falta el número de cliente" }); return; }
      const ficha = { ...limpiarFicha(b.ficha), actualizado_en: new Date().toISOString(), actualizado_por: quien };
      await modificar(gh, RUTA_FICHAS, {}, (todas) => { todas[numero] = ficha; return todas; }, `Mi SAT: ${quien} editó los datos del cliente ${numero}`);
      res.status(200).json({ ok: true, ficha });
      return;
    }
    if (b.accion === "cargar_estado_cuenta") {
      const filas = Array.isArray(b.filas) ? b.filas.slice(0, 20000) : [];
      const clientes = {};
      for (const f of filas) {
        const n = numeroCliente(f && f.numero_cliente).replace(/^0+/, "");
        if (!n) continue;
        const saldo = Number(f.saldo);
        clientes[n] = { estado: f.estado === "al_dia" ? "al_dia" : "pendiente", saldo: Number.isFinite(saldo) ? Math.round(saldo * 100) / 100 : null };
      }
      if (!Object.keys(clientes).length) { res.status(400).json({ error: "El archivo no tiene filas con número de cliente" }); return; }
      const tipo = b.tipo === "servicios" ? "servicios" : "abono", ruta = RUTAS_CUENTA[tipo];
      const data = { tipo, actualizado_en: new Date().toISOString(), actualizado_por: quien, archivo: txtCorto(b.archivo, 120), no_figuran_al_dia: tipo === "servicios" ? true : !!b.no_figuran_al_dia, mostrar_importe: !!b.mostrar_importe, clientes };
      const { sha } = await gh.leer(ruta, null);
      const r = await gh.escribir(ruta, data, sha, `Mi SAT: ${quien} cargó ${tipo === "servicios" ? "la deuda de services y presupuestos" : "el estado del abono"} (${Object.keys(clientes).length} clientes)`);
      if (!r.ok) throw new Error("No se pudo guardar (" + r.status + ")");
      res.status(200).json({ ok: true, total: Object.keys(clientes).length });
      return;
    }
    if (b.accion === "borrar") {
      let ok = false;
      await modificar(gh, RUTA, [], (lista) => { const n = lista.filter((c) => c.id !== id || c.estado === "activa"); ok = n.length < lista.length; return ok ? n : null; }, `Mi SAT: ${quien} borró un pedido`);
      cacheCuentas = null;
      if (!ok) { res.status(400).json({ error: "No se encontró, o es una cuenta activa (primero dala de baja)" }); return; }
      res.status(200).json({ ok: true });
      return;
    }
    const f = acciones[b.accion];
    if (!f) { res.status(400).json({ error: "Acción desconocida" }); return; }
    let error = null, hecho = null;
    await modificar(gh, RUTA, [], (lista) => {
      const c = lista.find((x) => x.id === id);
      if (!c) { error = "No se encontró"; return null; }
      error = f(c, lista) || null;
      if (error) return null;
      hecho = c; return lista;
    }, `Mi SAT: ${quien} — ${b.accion}`);
    cacheCuentas = null;
    if (error) { res.status(400).json({ error }); return; }
    res.status(200).json({ ok: true, cuenta: cuentaParaAdmin(hecho) });
  } catch (e) {
    console.error("Mi SAT admin:", e);
    res.status(500).json({ error: e.message || "Error" });
  }
}

module.exports = { manejarPortal, manejarAdmin, _prueba: { nombrePila, celularCoincide, mismoNumero, claveDebil, leerPase } };
