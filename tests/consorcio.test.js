const test = require("node:test");
const assert = require("node:assert");
process.env.GITHUB_DATA_TOKEN = process.env.GITHUB_DATA_TOKEN || "x";
process.env.GITHUB_DATA_REPO = process.env.GITHUB_DATA_REPO || "x/y";
process.env.SESION_SECRET = process.env.SESION_SECRET || "secreto-de-prueba";
const consorcio = require("../lib/consorcio");
const llaves = require("../lib/registro-llaves");
const { autorizar } = require("../lib/sesion");

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
    fn({ query: {}, headers: { "x-real-ip": "10.1." + Math.floor(Math.random() * 250) + "." + Math.floor(Math.random() * 250), ...(req.headers || {}) }, ...req, headers: { "x-real-ip": "10.1." + Math.floor(Math.random() * 250) + ".1", ...(req.headers || {}) } }, res, ...extra);
  });
}
const SAT = { nombre: "Seba", rol: "admin" };

async function preparar() {
  consorcio._reiniciar(); llaves._reiniciarTopes();
  const gh = ghFalso();
  await llamar(llaves.manejarAdmin, { method: "POST", body: { accion: "guardar_edificio", nombre: "MUELLE 12" } }, SAT, gh);
  const eds = (await llamar(llaves.manejarAdmin, { method: "GET", query: {} }, SAT, gh)).data;
  const m11 = eds.find((e) => e.nombre === "MUELLE 11").codigo, m12 = eds.find((e) => e.nombre === "MUELLE 12").codigo;
  const a = await llamar(consorcio.manejarAdmin, { method: "POST", body: { accion: "guardar_admin", nombre: "Cristian Pizzi", email: "CP@admin.com", edificios: [m12] } }, SAT, gh);
  return { gh, m11, m12, clave: a.data.clave, adminId: a.data.admin.id };
}
const login = (gh, email, clave) => llamar(consorcio.manejarPortal, { method: "POST", body: { accion: "login", email, clave } }, gh);

test("consorcio: entra con mail y clave, y su pase NO sirve para el resto de la APP", async () => {
  const { gh, clave } = await preparar();
  assert.match(clave, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
  const mal = await login(gh, "cp@admin.com", "otra-clave");
  assert.strictEqual(mal.status, 401);
  const ok = await login(gh, "cp@admin.com", clave);
  assert.strictEqual(ok.status, 200);
  assert.ok(ok.data.pase.startsWith("c1."));
  // El pase del administrador no autoriza en la API de la APP.
  assert.strictEqual(autorizar({ headers: { authorization: "Bearer " + ok.data.pase } }), null);
  // La clave nunca se guarda en claro.
  assert.ok(!gh.store["registro-llaves/administradores.json"].t.includes(clave));
});

test("consorcio: solo ve y gestiona SUS edificios", async () => {
  const { gh, m11, m12, clave } = await preparar();
  const { pase } = (await login(gh, "cp@admin.com", clave)).data;
  const h = { "x-consorcio": pase };
  const inicio = await llamar(consorcio.manejarPortal, { method: "GET", headers: h, query: {} }, gh);
  assert.deepStrictEqual(inicio.data.edificios.map((e) => e.nombre), ["MUELLE 12"]);
  assert.strictEqual((await llamar(consorcio.manejarPortal, { method: "GET", headers: h, query: { que: "edificio", e: m11 } }, gh)).status, 403);
  const gestion = { accion: "gestion", tipo: "baja", piso: "3", unidad: "A", titular: "Juan", motivo: "robo", tag: "69,2561" };
  assert.strictEqual((await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { ...gestion, edificio: m11 } }, gh)).status, 403);
  const g = await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { ...gestion, edificio: m12 } }, gh);
  assert.strictEqual(g.status, 200);
  assert.strictEqual(g.data.gestion.tag, "069:02561");
  // Sin pase, o con un pase inventado, no entra.
  assert.strictEqual((await llamar(consorcio.manejarPortal, { method: "GET", headers: { "x-consorcio": "c1.e30.xxx" }, query: {} }, gh)).status, 401);
  // SAT ve la gestión y la marca hecha.
  const lista = (await llamar(consorcio.manejarAdmin, { method: "GET", query: { gestiones: "1" } }, SAT, gh)).data;
  assert.strictEqual(lista.length, 1);
  assert.strictEqual((await llamar(consorcio.manejarAdmin, { method: "POST", body: { accion: "estado_gestion", edificio: m12, id: lista[0].id, estado: "hecha", nota_sat: "Dada de baja en la estación" } }, SAT, gh)).status, 200);
  const vista = await llamar(consorcio.manejarPortal, { method: "GET", headers: h, query: { que: "edificio", e: m12 } }, gh);
  assert.strictEqual(vista.data.gestiones[0].estado, "hecha");
  assert.strictEqual(vista.data.gestiones[0].historial[1].por, undefined, "no ve quién de SAT la tocó");
});

test("consorcio: nueva clave o desactivar cierra la sesión; fuerza bruta frenada", async () => {
  const { gh, clave, adminId } = await preparar();
  const { pase } = (await login(gh, "cp@admin.com", clave)).data;
  await llamar(consorcio.manejarAdmin, { method: "POST", body: { accion: "nueva_clave", id: adminId } }, SAT, gh);
  consorcio._reiniciar();
  assert.strictEqual((await llamar(consorcio.manejarPortal, { method: "GET", headers: { "x-consorcio": pase }, query: {} }, gh)).status, 401);
  consorcio._reiniciar(); llaves._reiniciarTopes();
  const estados = [];
  for (let i = 0; i < 8; i++) estados.push((await login(gh, "cp@admin.com", "mal" + i)).status);
  assert.deepStrictEqual(estados, [401, 401, 401, 401, 401, 401, 429, 429]);
});

test("consorcio: fotos en la gestión y solo de sus edificios", async () => {
  const { fotos } = llaves;
  const guardadas = {};
  fotos.fotosGh.subir = async (ruta, buf) => { guardadas[ruta] = buf; };
  fotos.fotosGh.leer = async (ruta) => guardadas[ruta] || null;
  const { gh, m11, m12, clave } = await preparar();
  const { pase } = (await login(gh, "cp@admin.com", clave)).data;
  const h = { "x-consorcio": pase };
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]).toString("base64");
  const g = await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { accion: "gestion", edificio: m12, tipo: "reemplazo", piso: "1", unidad: "A", titular: "Juan", motivo: "rotura", fotos: [jpeg] } }, gh);
  assert.strictEqual(g.status, 200);
  const id = g.data.gestion.fotos[0];
  assert.ok(guardadas[`registro-llaves/fotos/${m12}/${id}.jpg`]);
  const ver = (e) => new Promise((fin) => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, send() { fin(this.statusCode); }, json() { fin(this.statusCode); } };
    consorcio.manejarPortal({ method: "GET", query: { foto: id, e }, headers: { ...h, "x-real-ip": "10.9.9.9" } }, res, gh);
  });
  assert.strictEqual(await ver(m12), 200);
  assert.strictEqual(await ver(m11), 403);
});

test("consorcio: link único — el vecino carga el pedido, va directo a SAT con N° de pedido y avisa por mail", async () => {
  const { fotos } = llaves;
  fotos.fotosGh.subir = async () => {};
  const path = require("path");
  const enviados = [];
  process.env.SERVICIOS_API_TOKEN = process.env.SERVICIOS_API_TOKEN || "token-de-prueba";
  require.cache[path.join(__dirname, "..", "api", "enviar-mail.js")] = { id: "x", loaded: true, exports: async (req, res) => { enviados.push(req.body); res.status(200).json({ ok: true }); } };
  const { gh, m11, m12, clave } = await preparar();
  const { pase } = (await login(gh, "cp@admin.com", clave)).data;
  const h = { "x-consorcio": pase };
  // No puede crear links de edificios que no son suyos.
  assert.strictEqual((await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { accion: "crear_invitacion", edificio: m11 } }, gh)).status, 403);
  // El administrador carga una gestión él mismo: N° 1 y mail.
  const propia = await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { accion: "gestion", edificio: m12, tipo: "baja", piso: "1", unidad: "A", titular: "Juan", motivo: "robo" } }, gh);
  assert.strictEqual(propia.data.numero, 1);
  const c = await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { accion: "crear_invitacion", edificio: m12, tipo: "nuevo", destinatario: "Lucía", piso: "7", unidad: "D" } }, gh);
  assert.strictEqual(c.status, 200);
  const i = c.data.codigo;
  assert.match(i, /\.[a-f0-9]{24}$/);
  // El vecino ve solo lo mínimo: nada de otros vecinos.
  const ver = await llamar(consorcio.manejarLink, { method: "GET", query: { i } }, gh);
  assert.strictEqual(ver.status, 200);
  assert.deepStrictEqual(Object.keys(ver.data).sort(), ["administrador", "destinatario", "direccion", "edificio", "piso", "tipo", "unidad", "vence"]);
  assert.strictEqual((await llamar(consorcio.manejarLink, { method: "GET", query: { i: i.slice(0, -1) + (i.endsWith("0") ? "1" : "0") } }, gh)).status, 410);
  // Manda el pedido (aunque intente cambiar la gestión, queda la que eligió el administrador).
  const pedido = { i, tipo: "baja", piso: "7", unidad: "D", titular: "Lucía Fernández", telefono: "341 999 0000", cantidad: 1 };
  const env = await llamar(consorcio.manejarLink, { method: "POST", body: pedido }, gh);
  assert.strictEqual(env.status, 200);
  assert.strictEqual(env.data.numero, 2);
  assert.strictEqual((await llamar(consorcio.manejarLink, { method: "POST", body: pedido }, gh)).status, 410, "el link sirve una sola vez");
  // Llega directo a SAT, pendiente, marcada como cargada por el vecino.
  const sat = (await llamar(consorcio.manejarAdmin, { method: "GET", query: { gestiones: "1" } }, SAT, gh)).data;
  const g = sat.find((x) => x.numero === 2);
  assert.deepStrictEqual([g.tipo, g.estado, g.origen], ["nuevo", "pendiente", "vecino"]);
  // Un mail por cada gestión nueva.
  assert.deepStrictEqual(enviados.map((m) => [m.tipo, m.datos.numero, m.datos.tipo]), [["gestion_llaves", 1, "baja"], ["gestion_llaves", 2, "nuevo"]]);
  assert.strictEqual(enviados[0].datos.motivo_txt, "Robo");
  // Link cancelado no sirve.
  const c2 = await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { accion: "crear_invitacion", edificio: m12 } }, gh);
  await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { accion: "cancelar_invitacion", edificio: m12, id: c2.data.invitacion.id } }, gh);
  assert.strictEqual((await llamar(consorcio.manejarLink, { method: "GET", query: { i: c2.data.codigo } }, gh)).status, 410);
});
