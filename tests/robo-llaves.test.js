// Denuncia de llave robada o perdida (acceso de emergencia del vecino) — datos inventados.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
process.env.GITHUB_DATA_TOKEN = process.env.GITHUB_DATA_TOKEN || "x";
process.env.GITHUB_DATA_REPO = process.env.GITHUB_DATA_REPO || "x/y";
process.env.SESION_SECRET = process.env.SESION_SECRET || "secreto-de-prueba";
process.env.SERVICIOS_API_TOKEN = process.env.SERVICIOS_API_TOKEN || "token-de-prueba";

// Los mails no salen: se juntan para revisarlos.
let enviados = [];
require.cache[path.join(__dirname, "..", "api", "enviar-mail.js")] = { id: "x", loaded: true, exports: async (req, res) => { enviados.push(req.body); res.status(200).json({ ok: true }); } };

const llaves = require("../lib/registro-llaves");
const consorcio = require("../lib/consorcio");
const robo = require("../lib/robo-llaves");

function ghFalso() {
  const store = {}; let n = 0;
  return {
    store,
    leer: async (ruta, def) => (store[ruta] ? { data: JSON.parse(store[ruta].t), sha: store[ruta].sha } : { data: def, sha: undefined }),
    escribir: async (ruta, data, sha) => {
      if ((store[ruta] && store[ruta].sha !== sha) || (!store[ruta] && sha)) return { ok: false, status: 409 };
      store[ruta] = { t: JSON.stringify(data), sha: "s" + ++n };
      return { ok: true, status: 200 };
    },
  };
}
let ipN = 0;
function llamar(fn, req, ...extra) {
  return new Promise((ok) => {
    const res = { statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(d) { ok({ status: this.statusCode, data: d }); } };
    fn({ query: {}, headers: { "x-real-ip": "10.9." + (++ipN % 250) + "." + Math.floor(Math.random() * 250) }, ...req }, res, ...extra);
  });
}
const SAT = { nombre: "Seba", rol: "admin" };
const E = "muelle11-k7p3";
const RUTA_G = `registro-llaves/${E}.gestiones.json`;
const leerJson = (gh, ruta) => JSON.parse(gh.store[ruta].t);
const JPEG = "data:image/jpeg;base64," + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]).toString("base64");

async function preparar() {
  llaves._reiniciarTopes(); consorcio._reiniciar(); enviados = [];
  delete process.env.LLAVES_ROBO_EMAIL;
  const gh = ghFalso();
  // Un vecino registrado por el QR, con una llave y un control.
  const reg = await llamar(llaves.manejarPublico, { method: "POST", body: { edificio: E, nombre: "Laura Gómez", telefono: "341 610 2020", email: "laura@mail.com", relacion: "titular", tipo: "ambas", piso: "5", unidad: "A", cochera: "12", llaves: [{ tag: "090:10001" }, { tipo: "control", tag: "445566" }], acepta: true } }, gh);
  // El administrador del edificio y la conciliación (de ahí sale el N° de usuario de la placa).
  await llamar(consorcio.manejarAdmin, { method: "POST", body: { accion: "guardar_admin", nombre: "Administración Modelo", email: "admin@ejemplo.com", edificios: [E] } }, SAT, gh);
  await llamar(llaves.manejarAdmin, { method: "POST", body: { accion: "guardar_edificio", codigo: E, nombre: "MUELLE 11", abonado: "D018" } }, SAT, gh);
  await llamar(llaves.manejarAdmin, { method: "POST", body: { accion: "guardar_conciliacion", edificio: E, archivo: "est.xlsx", filas: [{ tag: "090:10001", usuario: "051", nombre: "LAURA GOMEZ" }] } }, SAT, gh);
  enviados = [];
  return { gh, emergencia: reg.data.emergencia };
}
const post = (gh, body) => llamar(robo.manejarPublico, { method: "POST", body: { edificio: E, ...body } }, gh);

test("robo: al registrarse por el QR el vecino recibe su link personal de emergencia", async () => {
  const { gh, emergencia } = await preparar();
  assert.match(emergencia, /^https:\/\/pedido\.sat365\.com\.ar\/robo-llave\.html\?e=muelle11-k7p3&k=[a-z0-9]+\.[A-Za-z0-9_-]{16}$/);
  const k = new URL(emergencia).searchParams.get("k");
  const g = await llamar(robo.manejarPublico, { method: "GET", query: { e: E, k } }, gh);
  assert.strictEqual(g.data.personal.nombre, "Laura Gómez");
  // Solo ve los últimos 3 números de sus llaves.
  assert.deepStrictEqual(g.data.personal.llaves.map((l) => [l.tipo, l.fin]), [["tag", "…001"], ["control", "…566"]]);
  assert.ok(g.data.ticket);
  const malo = await llamar(robo.manejarPublico, { method: "GET", query: { e: E, k: k.slice(0, -2) + "xx" } }, gh);
  assert.ok(malo.data.link_invalido && !malo.data.personal && !malo.data.ticket);
});

test("robo: se identifica por unidad + teléfono; el nombre solo no alcanza", async () => {
  const { gh } = await preparar();
  const ok = await post(gh, { accion: "identificar", piso: "5°", unidad: "a", nombre: "Laura", telefono: "0341-15-610-2020" });
  assert.strictEqual(ok.data.verificado, true);
  assert.ok(!JSON.stringify(ok.data).includes("10001"), "no devuelve el número completo");
  const otroTel = await post(gh, { accion: "identificar", piso: "5", unidad: "A", nombre: "Laura Gómez", telefono: "341 999 9999" });
  assert.strictEqual(otroTel.data.verificado, false);
  assert.ok(!otroTel.data.llaves);
  assert.strictEqual((await post(gh, { accion: "identificar", nombre: "Laura", telefono: "341 610 2020" })).status, 400);
});

test("robo: la denuncia verificada avisa a la estación con el N° de usuario de la placa y deja el pedido de baja", async () => {
  const { gh } = await preparar();
  const id = await post(gh, { accion: "identificar", piso: "5", unidad: "A", nombre: "Laura", telefono: "341 610 2020" });
  const r = await post(gh, { accion: "reportar", ticket: id.data.ticket, llave: 0, motivo: "robo", cuando: "Recién (menos de 1 hora)", donde: "En la calle" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.estacion_avisada, true);
  const est = enviados.find((m) => m.tipo === "robo_llave_estacion").datos;
  assert.strictEqual(est.usuario, "051");
  assert.strictEqual(est.tag, "090:10001");
  assert.strictEqual(est.abonado, "D018");
  assert.strictEqual(est.verificacion, "registro");
  // Sin LLAVES_ROBO_EMAIL: va a SAT como prueba, nunca a Security24.
  assert.strictEqual(est.prueba, true);
  assert.ok(!/security24/i.test(est.para));
  assert.ok(enviados.some((m) => m.tipo === "gestion_llaves" && /DENUNCIA DE EMERGENCIA/.test(m.datos.origen_txt)));
  assert.ok(enviados.some((m) => m.tipo === "robo_llave_admin" && m.datos.para === "admin@ejemplo.com"));
  const g = leerJson(gh, RUTA_G)[0];
  assert.strictEqual(g.origen, "emergencia");
  assert.strictEqual(g.tipo, "baja");
  assert.strictEqual(g.motivo, "robo");
  assert.strictEqual(g.admin_nombre, "Administración Modelo");
  assert.ok(g.robo.estacion.ok && g.robo.estacion.prueba);
  const padron = leerJson(gh, `registro-llaves/${E}.json`)[0];
  assert.strictEqual(padron.llaves[0].estado, "baja");
  assert.strictEqual(padron.llaves[0].denunciada.numero, g.numero);
  // Doble toque: no se duplica ni se vuelve a avisar.
  enviados = [];
  const id2 = await post(gh, { accion: "identificar", piso: "5", unidad: "A", nombre: "Laura", telefono: "341 610 2020" });
  const r2 = await post(gh, { accion: "reportar", ticket: id2.data.ticket, llave: "otra", tag: "090:10001", motivo: "robo" });
  assert.strictEqual(r2.data.ya_estaba, true);
  assert.strictEqual(r2.data.numero, g.numero);
  assert.strictEqual(enviados.length, 0);
  assert.strictEqual(leerJson(gh, RUTA_G).length, 1);
});

test("robo: sin coincidir con el padrón pide el DNI (o se manda sin verificar) y el DNI no se guarda", async () => {
  const { gh } = await preparar();
  const id = await post(gh, { accion: "identificar", piso: "5", unidad: "A", nombre: "Pablo Gómez", telefono: "341 777 0000" });
  assert.strictEqual(id.data.verificado, false);
  const sinNada = await post(gh, { accion: "reportar", ticket: id.data.ticket, tag: "090:10001", motivo: "extravio" });
  assert.strictEqual(sinNada.status, 400);
  assert.ok(sinNada.data.falta_dni);
  const conDni = await post(gh, { accion: "reportar", ticket: id.data.ticket, tag: "09010001", motivo: "extravio", dni: JPEG, email: "pablo@mail.com" });
  assert.strictEqual(conDni.status, 200);
  const est = enviados.find((m) => m.tipo === "robo_llave_estacion").datos;
  assert.strictEqual(est.verificacion, "dni");
  assert.strictEqual(est.adjuntos.length, 1);
  assert.strictEqual(est.titular, "Laura Gómez", "el titular sale del padrón por el N° de llave");
  assert.strictEqual(est.declarante, "Pablo Gómez");
  assert.strictEqual(est.mismo, false);
  // A la titular le avisan que otro denunció su llave.
  assert.ok(enviados.some((m) => m.tipo === "robo_llave_titular" && m.datos.para === "laura@mail.com"));
  assert.ok(enviados.some((m) => m.tipo === "constancia_pedido" && m.datos.para === "pablo@mail.com"));
  // El DNI viaja en el mail y no queda guardado en ningún lado.
  assert.ok(!Object.values(gh.store).some((v) => v.t.includes(JPEG.slice(30, 90))));
  const g = leerJson(gh, RUTA_G)[0];
  assert.strictEqual(g.robo.dni, true);
  assert.strictEqual(g.robo.verificacion, "dni");
  // Sin DNI a mano: se manda marcado sin verificar.
  enviados = [];
  const id2 = await post(gh, { accion: "identificar", piso: "2", unidad: "C", nombre: "Juan Paz", telefono: "341 222 0000" });
  const sv = await post(gh, { accion: "reportar", ticket: id2.data.ticket, dispositivo: "tag", motivo: "robo", sin_dni: true });
  assert.strictEqual(sv.status, 200);
  const est2 = enviados.find((m) => m.tipo === "robo_llave_estacion").datos;
  assert.strictEqual(est2.verificacion, "sin_verificar");
  assert.strictEqual(est2.titular, "Juan Paz");
});

test("robo: con LLAVES_ROBO_EMAIL va a la estación; al marcarla Hecha se le pide quitar la alerta (una sola vez)", async () => {
  const { gh, emergencia } = await preparar();
  process.env.LLAVES_ROBO_EMAIL = "monitoreo@estacion.com";
  try {
    const k = new URL(emergencia).searchParams.get("k");
    const tk = (await llamar(robo.manejarPublico, { method: "GET", query: { e: E, k } }, gh)).data.ticket;
    const r = await post(gh, { accion: "reportar", ticket: tk, llave: 1, motivo: "extravio" });
    assert.strictEqual(r.status, 200);
    const est = enviados.find((m) => m.tipo === "robo_llave_estacion").datos;
    assert.strictEqual(est.para, "monitoreo@estacion.com");
    assert.strictEqual(est.prueba, false);
    assert.strictEqual(est.verificacion, "link");
    assert.strictEqual(est.dispositivo, "control");
    const g = leerJson(gh, RUTA_G)[0];
    // SAT la marca Hecha → mail de cierre a la estación.
    enviados = [];
    const h = await llamar(consorcio.manejarAdmin, { method: "POST", body: { accion: "estado_gestion", edificio: E, id: g.id, estado: "hecha", aplicar: false } }, SAT, gh);
    assert.strictEqual(h.status, 200);
    const cierre = enviados.filter((m) => m.tipo === "robo_llave_cierre");
    assert.strictEqual(cierre.length, 1);
    assert.strictEqual(cierre[0].datos.para, "monitoreo@estacion.com");
    assert.strictEqual(cierre[0].datos.estado, "hecha");
    assert.strictEqual(leerJson(gh, RUTA_G)[0].robo.cierre.estado, "hecha");
    // Volver a tocar el estado no manda otro cierre.
    enviados = [];
    await llamar(consorcio.manejarAdmin, { method: "POST", body: { accion: "estado_gestion", edificio: E, id: g.id, estado: "en_curso" } }, SAT, gh);
    await llamar(consorcio.manejarAdmin, { method: "POST", body: { accion: "estado_gestion", edificio: E, id: g.id, estado: "hecha", aplicar: false } }, SAT, gh);
    assert.strictEqual(enviados.filter((m) => m.tipo === "robo_llave_cierre").length, 0);
  } finally { delete process.env.LLAVES_ROBO_EMAIL; }
});

test("robo: el portal del administrador no deja cancelar una denuncia de emergencia", async () => {
  const { gh } = await preparar();
  const adm = await llamar(consorcio.manejarAdmin, { method: "POST", body: { accion: "guardar_admin", nombre: "Otra Admin", email: "otra@ejemplo.com", edificios: [E] } }, SAT, gh);
  const lg = await llamar(consorcio.manejarPortal, { method: "POST", body: { accion: "login", email: "otra@ejemplo.com", clave: adm.data.clave } }, gh);
  const id = await post(gh, { accion: "identificar", piso: "5", unidad: "A", nombre: "Laura", telefono: "341 610 2020" });
  await post(gh, { accion: "reportar", ticket: id.data.ticket, llave: 0, motivo: "robo" });
  const g = leerJson(gh, RUTA_G)[0];
  const c = await llamar(consorcio.manejarPortal, { method: "POST", headers: { "x-consorcio": lg.data.pase, "x-real-ip": "10.8.0.1" }, body: { accion: "cancelar_gestion", edificio: E, id: g.id } }, gh);
  assert.strictEqual(c.status, 409);
  assert.match(c.data.error, /las cierra SAT/);
  assert.strictEqual(leerJson(gh, RUTA_G)[0].estado, "pendiente");
});

test("robo: ticket vencido o adulterado, búsqueda de edificio y edificio apagado", async () => {
  const { gh } = await preparar();
  const id = await post(gh, { accion: "identificar", piso: "5", unidad: "A", nombre: "Laura", telefono: "341 610 2020" });
  const [d, f] = id.data.ticket.split(".");
  const o = JSON.parse(Buffer.from(d, "base64url").toString());
  const adulterado = Buffer.from(JSON.stringify({ ...o, v: "link" })).toString("base64url") + "." + f;
  const r = await post(gh, { accion: "reportar", ticket: adulterado, llave: 0, motivo: "robo" });
  assert.strictEqual(r.status, 400);
  assert.ok(r.data.reiniciar);
  const vencido = Buffer.from(JSON.stringify({ ...o, exp: Date.now() - 1 })).toString("base64url");
  assert.strictEqual(robo._leerTicket(vencido + "." + f), null);
  // Búsqueda: hace falta escribir al menos 4 letras.
  assert.deepStrictEqual((await llamar(robo.manejarPublico, { method: "GET", query: { buscar: "mue" } }, gh)).data.edificios, []);
  assert.deepStrictEqual((await llamar(robo.manejarPublico, { method: "GET", query: { buscar: "muelle" } }, gh)).data.edificios.map((e) => e.codigo), [E]);
  // Con el QR apagado, no se puede denunciar desde la web (que llamen a SAT).
  await llamar(llaves.manejarAdmin, { method: "POST", body: { accion: "guardar_edificio", codigo: E, nombre: "MUELLE 11", abonado: "D018", activo: false } }, SAT, gh);
  llaves._reiniciarTopes();
  assert.strictEqual((await llamar(robo.manejarPublico, { method: "GET", query: { e: E } }, gh)).status, 404);
});

test("robo: topes por edificio guardados (no dependen de la memoria del servidor)", async () => {
  const { gh } = await preparar();
  // 6 denuncias distintas en la hora: la séptima se frena.
  for (let i = 0; i < 6; i++) {
    llaves._reiniciarTopes();
    const id = await post(gh, { accion: "identificar", piso: String(10 + i), unidad: "A", nombre: "Vecino " + i, telefono: "341 300 00" + (10 + i) });
    const r = await post(gh, { accion: "reportar", ticket: id.data.ticket, tag: "100:0000" + i, motivo: "extravio", dni: JPEG });
    assert.strictEqual(r.status, 200, "denuncia " + i);
  }
  llaves._reiniciarTopes();
  const id = await post(gh, { accion: "identificar", piso: "20", unidad: "A", nombre: "Otro", telefono: "341 300 0099" });
  const r = await post(gh, { accion: "reportar", ticket: id.data.ticket, tag: "100:00099", motivo: "robo", dni: JPEG });
  assert.strictEqual(r.status, 429);
  assert.match(r.data.error, /muchas denuncias/);
});

test("robo: después de 3 sin verificar en el día, pide el DNI", async () => {
  const { gh } = await preparar();
  for (let i = 0; i < 3; i++) {
    llaves._reiniciarTopes();
    const id = await post(gh, { accion: "identificar", piso: String(30 + i), unidad: "B", nombre: "Sin Dni " + i, telefono: "341 400 00" + (10 + i) });
    assert.strictEqual((await post(gh, { accion: "reportar", ticket: id.data.ticket, tag: "200:0000" + i, motivo: "robo", sin_dni: true })).status, 200);
  }
  llaves._reiniciarTopes();
  const id = await post(gh, { accion: "identificar", piso: "40", unidad: "B", nombre: "Cuarto", telefono: "341 400 0099" });
  const r = await post(gh, { accion: "reportar", ticket: id.data.ticket, tag: "200:00099", motivo: "robo", sin_dni: true });
  assert.strictEqual(r.status, 400);
  assert.ok(r.data.falta_dni);
  // Con DNI sí pasa.
  assert.strictEqual((await post(gh, { accion: "reportar", ticket: id.data.ticket, tag: "200:00099", motivo: "robo", dni: JPEG })).status, 200);
});
