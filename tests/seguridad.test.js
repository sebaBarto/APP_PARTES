// Refuerzos de seguridad (revisión del 13/11/2026). Datos inventados.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const Module = require("module");
process.env.GITHUB_DATA_TOKEN = process.env.GITHUB_DATA_TOKEN || "x";
process.env.GITHUB_DATA_REPO = process.env.GITHUB_DATA_REPO || "x/y";
process.env.SESION_SECRET = process.env.SESION_SECRET || "secreto-de-prueba";
process.env.SERVICIOS_API_TOKEN = process.env.SERVICIOS_API_TOKEN || "token-de-prueba";

// nodemailer no está instalado en los tests: uno falso que junta lo que se mandaría.
const mandados = [];
const cargarOriginal = Module._load;
Module._load = function (pedido, ...resto) {
  if (pedido === "nodemailer") return { createTransport: () => ({ sendMail: async (o) => { mandados.push(o); return {}; }, verify: async () => true }) };
  return cargarOriginal.call(this, pedido, ...resto);
};
const { crearSesion, leerSesion } = require("../lib/sesion");
const tecnico = "Bearer " + crearSesion({ nombre: "Juan", rol: "tecnico" });
const oficina = "Bearer " + crearSesion({ nombre: "Brenda", rol: "admin" });
let ipN = 0;
const llamar = (fn, req) => new Promise((ok) => {
  const res = { statusCode: 200, _h: {}, setHeader(k, v) { this._h[k] = v; return this; }, status(c) { this.statusCode = c; return this; }, json(d) { ok({ status: this.statusCode, data: d }); return this; }, send(d) { ok({ status: this.statusCode, data: d }); return this; }, end() { ok({ status: this.statusCode }); return this; } };
  Promise.resolve(fn({ query: {}, ...req, headers: { "x-real-ip": "10.7." + (++ipN % 250) + ".1", ...(req.headers || {}) } }, res)).catch((e) => ok({ status: 599, data: String(e) }));
});

test("seguridad: un técnico no puede pisar ni vaciar colecciones de la oficina", async () => {
  const datos = require("../api/datos");
  for (const c of ["config", "clientes", "credenciales", "guardias", "materiales", "vehiculos", "sims", "herramientas", "consultas-categorias", "sims_instaladas"]) {
    const r = await llamar(datos, { method: "POST", query: { coleccion: c }, headers: { authorization: tecnico }, body: [] });
    assert.strictEqual(r.status, 403, c);
  }
  const del = await llamar(datos, { method: "DELETE", query: { coleccion: "clientes" }, headers: { authorization: tecnico } });
  assert.strictEqual(del.status, 403);
  // Lo que usa la APP sigue abierto (falla después, por la configuración de prueba, no por permiso).
  for (const c of ["servicios_emergencia", "notas", "push-subscripciones", "errores_app", "datos_equipo", "servicios_vistos"]) {
    const r = await llamar(datos, { method: "POST", query: { coleccion: c }, headers: { authorization: tecnico }, body: {} });
    assert.notStrictEqual(r.status, 403, c);
  }
  // La oficina sí puede.
  assert.notStrictEqual((await llamar(datos, { method: "POST", query: { coleccion: "config" }, headers: { authorization: oficina }, body: {} })).status, 403);
  // Sin sesión, nada.
  assert.strictEqual((await llamar(datos, { method: "POST", query: { coleccion: "config" }, body: {} })).status, 401);
});

test("seguridad: con una sesión solo se mandan los mails del parte; los demás, solo el servidor", async () => {
  const mail = require("../api/enviar-mail");
  for (const tipo of ["restablecer_clave", "constancia_registro", "robo_llave_estacion", "gestion_llaves", "campana_admin", "aviso_gestion", "solicitud_publica"]) {
    const r = await llamar(mail, { method: "POST", headers: { authorization: tecnico }, body: { tipo, datos: { para: "x@y.com", link: "https://malo.example" } } });
    assert.strictEqual(r.status, 403, tipo);
  }
  assert.strictEqual((await llamar(mail, { method: "POST", headers: { authorization: tecnico }, body: { tipo: "diagnostico-smtp" } })).status, 403);
  // "oficina" y "cliente" pasan el control (después falla por falta de SMTP en los tests).
  assert.notStrictEqual((await llamar(mail, { method: "POST", headers: { authorization: tecnico }, body: { tipo: "oficina", datos: {} } })).status, 403);
  // El servidor, con su clave, sí.
  assert.notStrictEqual((await llamar(mail, { method: "POST", headers: { authorization: "Bearer " + process.env.SERVICIOS_API_TOKEN }, body: { tipo: "restablecer_clave", datos: { para: "x@y.com" } } })).status, 403);
});

test("seguridad: el pase del panel dura un día; el de la APP, 30", () => {
  const a = leerSesion(oficina.slice(7)), t = leerSesion(tecnico.slice(7));
  assert.ok(a.vence - Date.now() <= 24 * 3600e3 + 1000 && a.vence - Date.now() > 23 * 3600e3);
  assert.ok(t.vence - Date.now() > 29 * 864e5);
});

test("seguridad: la encuesta del cliente no deja meter HTML en el mail a la oficina", async () => {
  const historial = require("../api/historial");
  process.env.BACKEND_NUEVO_URL = "https://backend.prueba"; process.env.BACKEND_NUEVO_TOKEN = "t"; process.env.OFICINA_EMAIL = "oficina@sat.com"; process.env.SMTP_HOST = "x"; process.env.SMTP_USER = "sat@sat.com"; process.env.SMTP_PASS = "x";
  const fetchOriginal = global.fetch;
  const pedidos = [];
  global.fetch = async (url, o) => { pedidos.push(String(url)); if (String(url).endsWith("/api/partes")) return { ok: true, json: async () => [{ id: "SAT-20261110-101500-123", cliente: "Cliente <b>Uno</b>", tecnico: "Juan" }] }; return { ok: true, json: async () => ({}) }; };
  try {
    const malo = await llamar(historial, { method: "GET", query: { tipo: "encuesta", parte: '<a href="https://malo.example">Click</a>', puntaje: "1" } });
    assert.strictEqual(malo.status, 400);
    assert.strictEqual((await llamar(historial, { method: "GET", query: { tipo: "encuesta", parte: "SAT-20261110-101500-123", puntaje: "9" } })).status, 400);
    assert.strictEqual(pedidos.length, 0, "no llega a guardar nada");
    const bien = await llamar(historial, { method: "GET", query: { tipo: "encuesta", parte: "SAT-20261110-101500-123", puntaje: "2" } });
    assert.strictEqual(bien.status, 200);
    const m = mandados.find((x) => /Calificación baja/.test(x.subject));
    assert.ok(m && m.html.includes("Cliente &lt;b&gt;Uno&lt;/b&gt;"), "el nombre del cliente va escapado");
  } finally {
    global.fetch = fetchOriginal;
    ["BACKEND_NUEVO_URL", "BACKEND_NUEVO_TOKEN", "OFICINA_EMAIL", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"].forEach((k) => delete process.env[k]);
  }
});

test("seguridad: el formulario de pedir servicio tiene trampa para robots, topes y largos máximos", async () => {
  const datos = require("../api/datos");
  require("../lib/registro-llaves")._reiniciarTopes();
  const ip = { "x-real-ip": "10.6.6.6" };
  assert.strictEqual((await llamar(datos, { method: "POST", query: { publico: "solicitud_emergencia" }, headers: ip, body: { cliente: "Robot", telefono: "341 555 5555", sitio_web: "spam" } })).data.ok, true);
  assert.strictEqual((await llamar(datos, { method: "POST", query: { publico: "solicitud_emergencia" }, headers: ip, body: { cliente: "Ana", telefono: "12" } })).status, 400);
  // Va al backend (que en los tests no está): no es un error de validación.
  assert.notStrictEqual((await llamar(datos, { method: "POST", query: { publico: "solicitud_emergencia" }, headers: ip, body: { cliente: "Ana", telefono: "341 555 1234" } })).status, 400);
  assert.strictEqual((await llamar(datos, { method: "POST", query: { publico: "solicitud_emergencia" }, headers: ip, body: { cliente: "Ana", telefono: "341 555 1234" } })).status, 429, "cuarto pedido seguido desde la misma conexión");
  const g = await llamar(datos, { method: "GET", query: { publico: "solicitud_emergencia" } });
  assert.deepStrictEqual(g.data, { captcha: "" });
});

test("seguridad: claves fáciles no se aceptan en el portal de administradores", async () => {
  const consorcio = require("../lib/consorcio");
  const llaves = require("../lib/registro-llaves");
  const store = {}; let n = 0;
  const gh = { leer: async (r, d) => (store[r] ? { data: JSON.parse(store[r].t), sha: store[r].sha } : { data: d }), escribir: async (r, data, sha) => { if ((store[r] && store[r].sha !== sha) || (!store[r] && sha)) return { ok: false, status: 409 }; store[r] = { t: JSON.stringify(data), sha: "s" + ++n }; return { ok: true }; } };
  consorcio._reiniciar(); llaves._reiniciarTopes();
  const llamar2 = (fn, req, ...x) => new Promise((ok) => { const res = { statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(d) { ok({ status: this.statusCode, data: d }); } }; fn({ query: {}, headers: { "x-real-ip": "10.5.0." + (++ipN % 250) }, ...req }, res, ...x); });
  const a = await llamar2(consorcio.manejarAdmin, { method: "POST", body: { accion: "guardar_admin", nombre: "Administración Modelo", email: "modelo@ejemplo.com", edificios: [] } }, { nombre: "Seba", rol: "admin" }, gh);
  const lg = await llamar2(consorcio.manejarPortal, { method: "POST", body: { accion: "login", email: "modelo@ejemplo.com", clave: a.data.clave } }, gh);
  const cambiar = (nueva) => llamar2(consorcio.manejarPortal, { method: "POST", headers: { "x-consorcio": lg.data.pase, "x-real-ip": "10.5.9.9" }, body: { accion: "cambiar_clave", actual: a.data.clave, nueva } }, gh);
  for (const mala of ["12345678", "11111111", "password", "modelo2026", "98765432109"]) assert.strictEqual((await cambiar(mala)).status, 400, mala);
  assert.strictEqual((await cambiar("Patio-Verde-48")).status, 200);
});
