const test = require("node:test");
const assert = require("node:assert");
const { manejarPublico, manejarAdmin } = require("../lib/registro-llaves");

process.env.GITHUB_DATA_TOKEN = process.env.GITHUB_DATA_TOKEN || "x";
process.env.GITHUB_DATA_REPO = process.env.GITHUB_DATA_REPO || "x/y";

// GitHub falso en memoria, con conflicto de versión como el real.
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
function llamar(fn, req, ...extra) {
  return new Promise((ok) => {
    const res = { statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(d) { ok({ status: this.statusCode, data: d }); } };
    fn({ query: {}, headers: { "x-real-ip": "10.0." + Math.floor(Math.random() * 250) + "." + Math.floor(Math.random() * 250) }, ...req }, res, ...extra);
  });
}
const valido = { edificio: "muelle11-k7p3", nombre: "Ana", telefono: "341 555 1234", relacion: "titular", tipo: "vivienda", piso: "4", unidad: "B", llaves: [{ tag: "0004521873" }], acepta: true };

test("registro de llaves: el QR de MUELLE 11 funciona sin configurar nada", async () => {
  const gh = ghFalso();
  const r = await llamar(manejarPublico, { method: "GET", query: { e: "muelle11-k7p3" } }, gh);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.nombre, "MUELLE 11");
  assert.strictEqual((await llamar(manejarPublico, { method: "GET", query: { e: "otro-1234" } }, gh)).status, 404);
});

test("registro de llaves: valida, guarda y no pierde registros simultáneos", async () => {
  const gh = ghFalso();
  assert.strictEqual((await llamar(manejarPublico, { method: "POST", body: { ...valido, acepta: false } }, gh)).status, 400);
  assert.strictEqual((await llamar(manejarPublico, { method: "POST", body: { ...valido, llaves: [] } }, gh)).status, 400);
  assert.strictEqual((await llamar(manejarPublico, { method: "POST", body: { ...valido, piso: "" } }, gh)).status, 400);
  // Cochera sola no pide piso/depto
  assert.strictEqual((await llamar(manejarPublico, { method: "POST", body: { ...valido, tipo: "cochera", piso: "", unidad: "" } }, gh)).status, 200);
  // Trampa para robots: responde ok pero no guarda
  await llamar(manejarPublico, { method: "POST", body: { ...valido, sitio_web: "spam" } }, gh);
  const rs = await Promise.all([1, 2, 3, 4, 5].map((i) => llamar(manejarPublico, { method: "POST", body: { ...valido, nombre: "V" + i } }, gh)));
  assert.ok(rs.every((r) => r.status === 200));
  const regs = JSON.parse(gh.store["registro-llaves/muelle11-k7p3.json"].t);
  assert.strictEqual(regs.length, 6);
  assert.strictEqual(regs[1].llaves[0].estado, "pendiente");
});

test("registro de llaves: solo admin concilia, y el estado queda guardado", async () => {
  const gh = ghFalso();
  await llamar(manejarPublico, { method: "POST", body: valido }, gh);
  const tecnico = { nombre: "Cristian", rol: "tecnico" }, admin = { nombre: "Seba", rol: "admin" };
  assert.strictEqual((await llamar(manejarAdmin, { method: "GET", query: {} }, tecnico, gh)).status, 403);
  const lista = await llamar(manejarAdmin, { method: "GET", query: { edificio: "muelle11-k7p3" } }, admin, gh);
  const id = lista.data[0].id;
  assert.strictEqual((await llamar(manejarAdmin, { method: "POST", body: { accion: "estado_llave", edificio: "muelle11-k7p3", id, indice: 0, estado: "inventado" } }, admin, gh)).status, 400);
  assert.strictEqual((await llamar(manejarAdmin, { method: "POST", body: { accion: "estado_llave", edificio: "muelle11-k7p3", id, indice: 0, estado: "conciliada", nota: "ok" } }, admin, gh)).status, 200);
  const despues = await llamar(manejarAdmin, { method: "GET", query: { edificio: "muelle11-k7p3" } }, admin, gh);
  assert.strictEqual(despues.data[0].llaves[0].estado, "conciliada");
  assert.strictEqual(despues.data[0].llaves[0].revisado_por, "Seba");
  const nuevo = await llamar(manejarAdmin, { method: "POST", body: { accion: "guardar_edificio", nombre: "Torre Sur" } }, admin, gh);
  assert.match(nuevo.data.edificio.codigo, /^torresur-[0-9a-f]{4}$/);
  const eds = await llamar(manejarAdmin, { method: "GET", query: {} }, admin, gh);
  assert.deepStrictEqual(eds.data.map((e) => e.nombre), ["MUELLE 11", "Torre Sur"]);
});

test("registro de llaves: una persona carga tag y control de cochera; el número queda 000:00000", async () => {
  const gh = ghFalso();
  const { normalizarTag } = require("../lib/registro-llaves");
  assert.strictEqual(normalizarTag("069,02561"), "069:02561");
  assert.strictEqual(normalizarTag("69:2561"), "069:02561");
  assert.strictEqual(normalizarTag("06902561"), "069:02561");
  const r = await llamar(manejarPublico, { method: "POST", body: { ...valido, tipo: "ambas", llaves: [{ tipo: "tag", tag: "069 02561" }, { tipo: "control", tag: "" }] } }, gh);
  assert.strictEqual(r.status, 200);
  const reg = JSON.parse(gh.store["registro-llaves/muelle11-k7p3.json"].t)[0];
  assert.deepStrictEqual(reg.llaves.map((l) => [l.tipo, l.tag]), [["tag", "069:02561"], ["control", ""]]);
  assert.strictEqual(reg.control_remoto, "si");
  // Un control sin cochera no tiene sentido
  assert.strictEqual((await llamar(manejarPublico, { method: "POST", body: { ...valido, llaves: [{ tipo: "control", tag: "" }] } }, gh)).status, 400);
});

test("registro de llaves: conciliación guarda el listado de la estación y las decisiones (y las conserva al volver a subirlo)", async () => {
  const gh = ghFalso();
  const admin = { nombre: "Seba", rol: "admin" };
  const filas = [{ tag: "069:02561", usuario: "125" }, { tag: "150:22222", usuario: "90" }];
  const g = await llamar(manejarAdmin, { method: "POST", body: { accion: "guardar_conciliacion", edificio: "muelle11-k7p3", archivo: "est.xlsx", filas } }, admin, gh);
  assert.strictEqual(g.status, 200);
  assert.strictEqual(g.data.filas.length, 2);
  const d = await llamar(manejarAdmin, { method: "POST", body: { accion: "decision_conciliacion", edificio: "muelle11-k7p3", indices: [1], decision: "borrar" } }, admin, gh);
  assert.strictEqual(d.status, 200);
  const g2 = await llamar(manejarAdmin, { method: "POST", body: { accion: "guardar_conciliacion", edificio: "muelle11-k7p3", archivo: "est2.xlsx", filas: [...filas, { tag: "151:33333" }] } }, admin, gh);
  assert.deepStrictEqual(g2.data.filas.map((f) => f.decision), ["", "borrar", ""]);
  const leido = await llamar(manejarAdmin, { method: "GET", query: { edificio: "muelle11-k7p3", conciliacion: "1" } }, admin, gh);
  assert.strictEqual(leido.data.archivo, "est2.xlsx");
  // estados en lote
  await llamar(manejarPublico, { method: "POST", body: valido }, gh);
  const regs = (await llamar(manejarAdmin, { method: "GET", query: { edificio: "muelle11-k7p3" } }, admin, gh)).data;
  const l = await llamar(manejarAdmin, { method: "POST", body: { accion: "estado_lote", edificio: "muelle11-k7p3", cambios: [{ id: regs[0].id, indice: 0, estado: "conciliada" }] } }, admin, gh);
  assert.strictEqual(l.data.aplicados, 1);
});

test("registro de llaves: la placa (PDF de BabyWare) se cruza con el Excel de la estación y se conserva lo decidido", async () => {
  const gh = ghFalso();
  const admin = { nombre: "Seba", rol: "admin" };
  const E = "muelle11-k7p3";
  const post = (body) => llamar(manejarAdmin, { method: "POST", body: { edificio: E, ...body } }, admin, gh);
  await post({ accion: "guardar_conciliacion", archivo: "est.xlsx", filas: [{ usuario: "010", nombre: "Nadia Lopez" }, { usuario: "020", nombre: "Ana Sosa" }] });
  await post({ accion: "decision_conciliacion", indices: [1], decision: "mantener" });
  const usuarios = [{ numero: 1010, etiqueta: "Lopez N.", tag: "003:20001" }, { numero: 1020, etiqueta: "Sosa A.", tag: "003:20002" }, { numero: 1030, etiqueta: "User 030", tag: "003:20003" }, { numero: 1001, etiqueta: "SAT", tag: "000:00000" }];
  const g = await post({ accion: "guardar_placa", archivo: "placa.pdf", cuenta: "MUELLE 11", usuarios });
  assert.strictEqual(g.status, 200);
  assert.deepStrictEqual(g.data.filas.map((f) => [f.usuario, f.tag, f.fuente, f.decision]), [["010", "003:20001", "ambas", ""], ["020", "003:20002", "ambas", "mantener"], ["030", "003:20003", "placa", ""]]);
  assert.strictEqual(g.data.estacion.length, 2);
  // Otra cuenta: no se carga
  const otra = await post({ accion: "guardar_placa", archivo: "x.pdf", cuenta: "TORRE PUERTO NORTE", usuarios });
  const lista = (await llamar(manejarAdmin, { method: "POST", body: { accion: "guardar_edificio", nombre: "TORRE PUERTO NORTE" } }, admin, gh));
  const otra2 = await post({ accion: "guardar_placa", archivo: "x.pdf", cuenta: "TORRE PUERTO NORTE", usuarios });
  assert.strictEqual(lista.status, 200);
  assert.strictEqual(otra2.status, 409);
  assert.strictEqual(otra.status, 200, "antes de existir TORRE la cuenta no se reconoce como otro edificio");
  // Al volver a subir el Excel, la placa sigue cruzada
  const g2 = await post({ accion: "guardar_conciliacion", archivo: "est2.xlsx", filas: [{ usuario: "010", nombre: "Nadia Lopez" }, { usuario: "020", nombre: "Ana Sosa" }, { usuario: "040", nombre: "Juan Paz" }] });
  assert.deepStrictEqual(g2.data.filas.map((f) => [f.usuario, f.fuente, f.decision]), [["010", "ambas", ""], ["020", "ambas", "mantener"], ["040", "estacion", ""], ["030", "placa", ""]]);
  // Quitar la placa
  const q = await post({ accion: "quitar_placa" });
  assert.deepStrictEqual(q.data.filas.map((f) => [f.usuario, f.tag, f.fuente, f.decision]), [["010", "", undefined, ""], ["020", "", undefined, "mantener"], ["040", "", undefined, ""]]);
  assert.strictEqual(q.data.placa, null);
});

test("registro de llaves: no acepta caracteres para inyectar código y frena a un robot", async () => {
  const { _reiniciarTopes } = require("../lib/registro-llaves");
  _reiniciarTopes();
  const gh = ghFalso();
  const malo = { ...valido, nombre: 'Ana <img src=x onerror=alert(1)>', telefono: '341" onmouseover="x', email: 'x"onmouseover="alert(1)"@a.co', llaves: [{ tag: "001:00001", usuario: '12"x' }] };
  assert.strictEqual((await llamar(manejarPublico, { method: "POST", body: malo }, gh)).status, 400); // mail inválido
  const r = await llamar(manejarPublico, { method: "POST", body: { ...malo, email: "" } }, gh);
  assert.strictEqual(r.status, 400); // el teléfono queda con menos de 6 números
  const ok = await llamar(manejarPublico, { method: "POST", body: { ...malo, email: "", telefono: '341 555 "1234' } }, gh);
  assert.strictEqual(ok.status, 200);
  const reg = JSON.parse(gh.store["registro-llaves/muelle11-k7p3.json"].t)[0];
  for (const v of [reg.nombre, reg.telefono, reg.llaves[0].usuario]) assert.ok(!/[<>"]/.test(v), v);
  assert.strictEqual(reg.llaves[0].usuario, "12x");
  assert.ok(reg.ip && !reg.ip.includes("."), "se guarda la huella, no la IP");
  // Mismo IP mandando sin parar: a partir del 7° en 10 minutos se corta sin tocar GitHub.
  _reiniciarTopes();
  const ip = { "x-real-ip": "200.1.1.1" };
  const estados = [];
  for (let i = 0; i < 8; i++) estados.push((await llamar(manejarPublico, { method: "POST", headers: ip, body: { ...valido, nombre: "Robot " + i } }, gh)).status);
  assert.deepStrictEqual(estados, [200, 200, 200, 200, 200, 200, 429, 429]);
});

test("registro de llaves: foto del número (privada, solo JPEG, sirve en lugar del número)", async () => {
  const { fotos, _reiniciarTopes } = require("../lib/registro-llaves");
  _reiniciarTopes();
  const guardadas = {};
  fotos.fotosGh.subir = async (ruta, buf) => { guardadas[ruta] = buf; };
  fotos.fotosGh.leer = async (ruta) => guardadas[ruta] || null;
  fotos.fotosGh.borrar = async (ruta) => { delete guardadas[ruta]; };
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]).toString("base64");
  const gh = ghFalso();
  // Un PNG (u otra cosa) se rechaza.
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(3000)]).toString("base64");
  assert.strictEqual((await llamar(manejarPublico, { method: "POST", body: { ...valido, llaves: [{ tipo: "tag", tag: "", foto: png }] } }, gh)).status, 400);
  // Muy pesada, también.
  const enorme = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(700 * 1024)]).toString("base64");
  assert.strictEqual((await llamar(manejarPublico, { method: "POST", body: { ...valido, llaves: [{ tipo: "tag", tag: "", foto: enorme }] } }, gh)).status, 400);
  // Solo la foto, sin número: se acepta.
  const ok = await llamar(manejarPublico, { method: "POST", body: { ...valido, llaves: [{ tipo: "tag", tag: "", foto: "data:image/jpeg;base64," + jpeg }] } }, gh);
  assert.strictEqual(ok.status, 200);
  const reg = JSON.parse(gh.store["registro-llaves/muelle11-k7p3.json"].t)[0];
  assert.match(reg.llaves[0].foto, /^[a-f0-9]{20}$/);
  assert.ok(guardadas[`registro-llaves/fotos/muelle11-k7p3/${reg.llaves[0].foto}.jpg`]);
  // SAT la ve y completa el número mirándola.
  const admin = { nombre: "Seba", rol: "admin" };
  const vista = await new Promise((fin) => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, send(b) { fin({ status: this.statusCode, tipo: this.headers["Content-Type"], largo: b.length }); }, json(d) { fin({ status: this.statusCode, d }); } };
    manejarAdmin({ method: "GET", query: { edificio: "muelle11-k7p3", foto: reg.llaves[0].foto }, headers: {} }, res, admin, gh);
  });
  assert.deepStrictEqual([vista.status, vista.tipo], [200, "image/jpeg"]);
  assert.strictEqual((await llamar(manejarAdmin, { method: "POST", body: { accion: "estado_llave", edificio: "muelle11-k7p3", id: reg.id, indice: 0, tag: "69 2561" } }, admin, gh)).status, 200);
  assert.strictEqual(JSON.parse(gh.store["registro-llaves/muelle11-k7p3.json"].t)[0].llaves[0].tag, "069:02561");
  // Un técnico no la ve; y al borrar el registro se borra la foto.
  assert.strictEqual((await llamar(manejarAdmin, { method: "GET", query: { edificio: "muelle11-k7p3", foto: reg.llaves[0].foto } }, { rol: "tecnico" }, gh)).status, 403);
  await llamar(manejarAdmin, { method: "POST", body: { accion: "borrar_registro", edificio: "muelle11-k7p3", id: reg.id } }, admin, gh);
  assert.strictEqual(Object.keys(guardadas).length, 0);
});

test("registro de llaves: si el mismo vecino vuelve a registrarse, se actualiza (no se duplica) y puede pedir copia por mail", async () => {
  const { _reiniciarTopes } = require("../lib/registro-llaves");
  _reiniciarTopes();
  const path = require("path");
  const enviados = [];
  process.env.SERVICIOS_API_TOKEN = process.env.SERVICIOS_API_TOKEN || "token-de-prueba";
  require.cache[path.join(__dirname, "..", "api", "enviar-mail.js")] = { id: "x", loaded: true, exports: async (req, res) => { enviados.push(req.body); res.status(200).json({ ok: true }); } };
  const gh = ghFalso();
  const a = await llamar(manejarPublico, { method: "POST", body: { ...valido, nombre: "Ana Pérez", llaves: [{ tag: "069:02561" }] } }, gh);
  assert.strictEqual(a.data.numero, 1);
  // Vuelve con otro celular, el nombre sin tilde y una llave más; pide copia.
  const b = await llamar(manejarPublico, { method: "POST", body: { ...valido, nombre: "ana perez", telefono: "341 600 0000", email: "ana@mail.com", copia: true, llaves: [{ tag: "69,2561", usuario: "125" }, { tag: "070:11111" }] } }, gh);
  assert.deepStrictEqual([b.data.numero, b.data.actualizado, b.data.copia], [1, true, true]);
  let regs = JSON.parse(gh.store["registro-llaves/muelle11-k7p3.json"].t);
  assert.strictEqual(regs.length, 1);
  assert.deepStrictEqual(regs[0].llaves.map((l) => [l.tag, l.usuario]), [["069:02561", "125"], ["070:11111", ""]]);
  assert.strictEqual(regs[0].telefono, "341 600 0000");
  assert.deepStrictEqual(enviados.map((m) => [m.tipo, m.datos.para, m.datos.numero]), [["constancia_registro", "ana@mail.com", 1]]);
  // Otra persona de la misma unidad que comparte el teléfono: es otra persona.
  const c = await llamar(manejarPublico, { method: "POST", body: { ...valido, nombre: "Pablo Pérez", telefono: "341 600 0000", llaves: [{ tag: "080:22222" }] } }, gh);
  assert.deepStrictEqual([c.data.numero, c.data.actualizado], [2, false]);
  regs = JSON.parse(gh.store["registro-llaves/muelle11-k7p3.json"].t);
  assert.strictEqual(regs.length, 2);
});
