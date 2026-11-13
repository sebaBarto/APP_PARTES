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

test("padrón: al marcar Hecha, las gestiones actualizan solas la lista de llaves y se avisa al administrador", async () => {
  const path = require("path");
  const enviados = [];
  process.env.SERVICIOS_API_TOKEN = process.env.SERVICIOS_API_TOKEN || "token-de-prueba";
  require.cache[path.join(__dirname, "..", "api", "enviar-mail.js")] = { id: "x", loaded: true, exports: async (req, res) => { enviados.push(req.body); res.status(200).json({ ok: true }); } };
  const { gh, m12, clave } = await preparar();
  const { pase } = (await login(gh, "cp@admin.com", clave)).data;
  const h = { "x-consorcio": pase };
  const gestion = async (body) => (await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { accion: "gestion", edificio: m12, ...body } }, gh)).data.gestion;
  const hecha = (g, extra) => llamar(consorcio.manejarAdmin, { method: "POST", body: { accion: "estado_gestion", edificio: m12, id: g.id, estado: "hecha", ...extra } }, SAT, gh);
  const padron = async () => JSON.parse(gh.store[`registro-llaves/${m12}.json`].t);

  // 1) Nuevo tag para Ana (4° B): SAT carga el número entregado.
  const g1 = await gestion({ tipo: "nuevo", piso: "4", unidad: "B", titular: "Ana Pérez", telefono: "341 555 1234", cantidad: 1 });
  const prev = await llamar(consorcio.manejarAdmin, { method: "POST", body: { accion: "previsualizar_gestion", edificio: m12, id: g1.id, llaves_nuevas: [{ tag: "69,2561", usuario: "125" }] } }, SAT, gh);
  assert.ok(prev.data.acciones.some((a) => a.includes("069:02561")), prev.data.acciones.join(" | "));
  assert.ok(!gh.store[`registro-llaves/${m12}.json`], "la vista previa no guarda nada");
  enviados.length = 0;
  assert.strictEqual((await hecha(g1, { llaves_nuevas: [{ tag: "69,2561", usuario: "125" }], nota_sat: "Retirala por portería" })).status, 200);
  let p = await padron();
  assert.deepStrictEqual(p.map((r) => [r.nombre, r.llaves.map((l) => [l.tag, l.estado])]), [["Ana Pérez", [["069:02561", "conciliada"]]]]);
  assert.deepStrictEqual(enviados.map((m) => [m.tipo, m.datos.para, m.datos.estado, m.datos.nota]), [["aviso_gestion", "cp@admin.com", "hecha", "Retirala por portería"]]);

  // 2) Reemplazo: la vieja queda dada de baja y se suma la nueva.
  const g2 = await gestion({ tipo: "reemplazo", piso: "4", unidad: "B", titular: "Ana Pérez", motivo: "rotura", tag: "069:02561" });
  await hecha(g2, { llaves_nuevas: [{ tag: "070:11111" }] });
  p = await padron();
  assert.deepStrictEqual(p[0].llaves.map((l) => [l.tag, l.estado]), [["069:02561", "dada_de_baja"], ["070:11111", "conciliada"]]);

  // 3) Baja por robo, sin número: es la única llave activa de Ana.
  const g3 = await gestion({ tipo: "baja", piso: "4", unidad: "B", titular: "Ana Pérez", motivo: "robo" });
  await hecha(g3);
  p = await padron();
  assert.strictEqual(p[0].llaves[1].estado, "dada_de_baja");
  assert.match(p[0].llaves[1].nota, /Robo/);

  // 4) Titularidad con llaves nuevas: Ana deja de ser titular, Pablo entra con su llave.
  const g4 = await gestion({ tipo: "titularidad", piso: "4", unidad: "B", titular: "ana perez", nuevo_titular: "Pablo Gómez", nuevo_telefono: "341 111 2222", llaves_titularidad: "reemplazar" });
  await hecha(g4, { llaves_nuevas: [{ tag: "080:22222" }] });
  p = await padron();
  assert.deepStrictEqual(p.map((r) => r.nombre), ["Ana Pérez", "Pablo Gómez"]);
  assert.deepStrictEqual(p[1].llaves.map((l) => l.tag), ["080:22222"]);
  assert.ok(p[0].historial.length >= 4, "queda el historial");

  // Marcarla hecha dos veces no la aplica dos veces.
  await llamar(consorcio.manejarAdmin, { method: "POST", body: { accion: "estado_gestion", edificio: m12, id: g4.id, estado: "en_curso" } }, SAT, gh);
  await hecha(g4, { llaves_nuevas: [{ tag: "080:22222" }] });
  assert.strictEqual((await padron()).length, 2);
});

test("consorcio: olvidé mi clave, cancelar pedido, links en lote y resumen al entrar", async () => {
  const path = require("path");
  const enviados = [];
  process.env.SERVICIOS_API_TOKEN = process.env.SERVICIOS_API_TOKEN || "token-de-prueba";
  require.cache[path.join(__dirname, "..", "api", "enviar-mail.js")] = { id: "x", loaded: true, exports: async (req, res) => { enviados.push(req.body); res.status(200).json({ ok: true }); } };
  const { gh, m12, clave } = await preparar();
  // Olvidé mi clave: misma respuesta exista o no el mail; el link llega por mail y sirve una vez.
  const r1 = await llamar(consorcio.manejarPortal, { method: "POST", body: { accion: "olvide_clave", email: "nadie@x.com" } }, gh);
  const r2 = await llamar(consorcio.manejarPortal, { method: "POST", body: { accion: "olvide_clave", email: "CP@admin.com" } }, gh);
  assert.deepStrictEqual(r1.data, r2.data);
  const mail = enviados.find((m) => m.tipo === "restablecer_clave");
  assert.ok(mail && mail.datos.para === "cp@admin.com");
  const codigo = mail.datos.link.split("?r=")[1];
  assert.ok(!gh.store["registro-llaves/administradores.json"].t.includes(codigo.split(".")[1]), "el token no se guarda en claro");
  const nueva = await llamar(consorcio.manejarPortal, { method: "POST", body: { accion: "restablecer_clave", codigo, nueva: "mi-clave-nueva-1" } }, gh);
  assert.strictEqual(nueva.status, 200);
  assert.strictEqual((await llamar(consorcio.manejarPortal, { method: "POST", body: { accion: "restablecer_clave", codigo, nueva: "otra-clave-22" } }, gh)).status, 400, "sirve una sola vez");
  consorcio._reiniciar();
  assert.strictEqual((await login(gh, "cp@admin.com", clave)).status, 401, "la clave vieja ya no sirve");
  const { pase } = (await login(gh, "cp@admin.com", "mi-clave-nueva-1")).data;
  const h = { "x-consorcio": pase };
  // Cancelar: solo si está pendiente; avisa a SAT.
  const g = (await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { accion: "gestion", edificio: m12, tipo: "nuevo", piso: "1", unidad: "A", titular: "Juan", telefono: "341 555 5555" } }, gh)).data.gestion;
  enviados.length = 0;
  assert.strictEqual((await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { accion: "cancelar_gestion", edificio: m12, id: g.id, motivo: "Se mudó" } }, gh)).status, 200);
  assert.ok(enviados[0].datos.cancelado);
  assert.strictEqual((await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { accion: "cancelar_gestion", edificio: m12, id: g.id } }, gh)).status, 409);
  // Links en lote.
  const lote = await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { accion: "crear_invitacion", edificio: m12, tipo: "nuevo", lote: [{ destinatario: "A", piso: "1", unidad: "A" }, { destinatario: "B", piso: "1", unidad: "B" }, { piso: "2", unidad: "A" }] } }, gh);
  assert.strictEqual(lote.data.invitaciones.length, 3);
  assert.strictEqual(new Set(lote.data.invitaciones.map((i) => i.codigo)).size, 3);
  // Resumen al entrar.
  const inicio = (await llamar(consorcio.manejarPortal, { method: "GET", headers: h, query: {} }, gh)).data;
  assert.deepStrictEqual(Object.keys(inicio.edificios[0].resumen).sort(), ["abiertos", "controles", "hechos_30", "personas", "tags", "unidades"]);
});

test("entrega de llaves: con firma, descuenta stock, anota en el padrón y no se entrega dos veces", async () => {
  const entregas = require("../lib/entregas-llaves");
  const { fotos } = llaves;
  fotos.fotosGh.subir = async () => {};
  const path = require("path");
  const enviados = [];
  process.env.SERVICIOS_API_TOKEN = process.env.SERVICIOS_API_TOKEN || "token-de-prueba";
  require.cache[path.join(__dirname, "..", "api", "enviar-mail.js")] = { id: "x", loaded: true, exports: async (req, res) => { enviados.push(req.body); res.status(200).json({ ok: true }); } };
  const { gh, m12, clave } = await preparar();
  const { pase } = (await login(gh, "cp@admin.com", clave)).data;
  const g = (await llamar(consorcio.manejarPortal, { method: "POST", headers: { "x-consorcio": pase }, body: { accion: "gestion", edificio: m12, tipo: "nuevo", piso: "7", unidad: "D", titular: "Lucía Fernández", telefono: "341 999 0000", cantidad: 2 } }, gh)).data.gestion;
  const tecnico = { nombre: "Cristian Rossetti", rol: "tecnico" };
  const oficina = { nombre: "Brenda", rol: "tecnico" };
  const descuentos = [];
  const deps = {
    gh,
    descontarStock: async (x) => { descuentos.push(x); return { ok: true, descontados: x.items.map((i) => ({ c: i.c, cant: i.cant, de: x.de })), paraAprobar: 0 }; },
    leerTecnicos: async () => [{ nombre: "Cristian Rossetti", permisos: { stock_responsable: true, admin: true } }, { nombre: "Brenda", permisos: { entrega_llaves: true } }],
  };
  const llamarE = (req, aut) => llamar((rq, rs) => entregas.manejar(rq, rs, aut, deps), req);
  // Todavía no está hecha: no aparece ni se puede entregar.
  assert.deepStrictEqual((await llamarE({ method: "GET", query: {} }, oficina)).data, []);
  // SAT la marca hecha con las 2 llaves programadas.
  await llamar(consorcio.manejarAdmin, { method: "POST", body: { accion: "estado_gestion", edificio: m12, id: g.id, estado: "hecha", llaves_nuevas: [{ tag: "090:12345" }, { tag: "090:12346" }] } }, SAT, gh);
  const pend = (await llamarE({ method: "GET", query: {} }, oficina)).data;
  assert.strictEqual(pend.length, 1);
  assert.deepStrictEqual(pend[0].llaves.map((l) => l.tag), ["090:12345", "090:12346"]);
  // Un técnico sin el permiso de oficina no la ve ni la puede entregar ni habilitarse.
  assert.deepStrictEqual((await llamarE({ method: "GET", query: {} }, tecnico)).data, []);
  const firma = "data:image/jpeg;base64," + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 9)]).toString("base64");
  assert.strictEqual((await llamarE({ method: "POST", body: { accion: "entregar", edificio: m12, id: g.id, recibio: "Lucía", firma } }, tecnico)).status, 403);
  assert.strictEqual((await llamarE({ method: "POST", body: { accion: "habilitar", edificio: m12, id: g.id, tecnico: "Cristian Rossetti" } }, tecnico)).status, 403);
  assert.strictEqual((await llamarE({ method: "GET", query: { firma: "x", edificio: m12 } }, tecnico)).status, 403);
  // La oficina se la habilita (solo a técnicos que existen).
  assert.strictEqual((await llamarE({ method: "POST", body: { accion: "habilitar", edificio: m12, id: g.id, tecnico: "Fulano" } }, oficina)).status, 400);
  assert.strictEqual((await llamarE({ method: "POST", body: { accion: "habilitar", edificio: m12, id: g.id, tecnico: "Cristian Rossetti" } }, oficina)).status, 200);
  const suya = (await llamarE({ method: "GET", query: {} }, tecnico)).data;
  assert.strictEqual(suya.length, 1);
  assert.strictEqual(suya[0].habilitada_a, "Cristian Rossetti");
  // Configuración del artículo de stock (solo admin).
  assert.strictEqual((await llamarE({ method: "POST", body: { accion: "config", articulo_tag: "9001" } }, tecnico)).status, 403);
  await llamarE({ method: "POST", body: { accion: "config", articulo_tag: "9001", articulo_control: "9002" } }, SAT);
  // Sin firma no se entrega.
  assert.strictEqual((await llamarE({ method: "POST", body: { accion: "entregar", edificio: m12, id: g.id, recibio: "Lucía" } }, tecnico)).status, 400);
  // El técnico no puede elegir sacarla del depósito: sale de su stock.
  const ok = await llamarE({ method: "POST", body: { accion: "entregar", edificio: m12, id: g.id, recibio: "Lucía Fernández", dni: "30111222", firma, de: "dep" } }, tecnico);
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual([descuentos[0].de, descuentos[0].items[0].c, descuentos[0].items[0].cant], ["tec:Cristian Rossetti", "9001", 2]);
  assert.strictEqual(ok.data.entrega.stock.ok, true);
  assert.strictEqual((await llamarE({ method: "POST", body: { accion: "entregar", edificio: m12, id: g.id, recibio: "Otra", firma } }, tecnico)).status, 409, "no se entrega dos veces");
  assert.deepStrictEqual((await llamarE({ method: "GET", query: {} }, tecnico)).data, []);
  // Padrón: las llaves figuran entregadas a Lucía.
  const padron = JSON.parse(gh.store[`registro-llaves/${m12}.json`].t);
  assert.ok(padron[0].llaves.every((l) => l.entregada && l.entregada.recibio === "Lucía Fernández"));
  assert.ok(padron[0].historial.some((h) => /Recibió 2 llaves/.test(h.que)));
  // Al administrador le llegó el aviso de entrega.
  assert.ok(enviados.some((m) => m.tipo === "aviso_gestion" && /Entregada a Lucía/.test(m.datos.estado_txt)));
  // Otro pedido: lo entrega Brenda (oficina) desde la APP, sale del depósito; se puede habilitar y quitar.
  const g2 = (await llamar(consorcio.manejarPortal, { method: "POST", headers: { "x-consorcio": pase }, body: { accion: "gestion", edificio: m12, tipo: "nuevo", piso: "3", unidad: "A", titular: "Juan Pérez", telefono: "341 555 0000", cantidad: 1 } }, gh)).data.gestion;
  await llamar(consorcio.manejarAdmin, { method: "POST", body: { accion: "estado_gestion", edificio: m12, id: g2.id, estado: "hecha", llaves_nuevas: [{ tag: "090:12347" }] } }, SAT, gh);
  await llamarE({ method: "POST", body: { accion: "habilitar", edificio: m12, id: g2.id, tecnico: "Cristian Rossetti" } }, SAT);
  await llamarE({ method: "POST", body: { accion: "habilitar", edificio: m12, id: g2.id, tecnico: "" } }, SAT);
  assert.deepStrictEqual((await llamarE({ method: "GET", query: {} }, tecnico)).data, [], "sin habilitación ya no la ve");
  const ok2 = await llamarE({ method: "POST", body: { accion: "entregar", edificio: m12, id: g2.id, recibio: "Juan Pérez", firma } }, oficina);
  assert.strictEqual(ok2.status, 200);
  assert.strictEqual(descuentos[1].de, "dep");
});

test("campaña de registro: fecha límite, propuesta de llaves sin dueño, aprobación del administrador y conciliación marcada", async () => {
  const campana = require("../lib/campana-llaves");
  const path = require("path");
  const enviados = [];
  process.env.SERVICIOS_API_TOKEN = process.env.SERVICIOS_API_TOKEN || "token-de-prueba";
  require.cache[path.join(__dirname, "..", "api", "enviar-mail.js")] = { id: "x", loaded: true, exports: async (req, res) => { enviados.push(req.body); res.status(200).json({ ok: true }); } };
  const { gh, m12, clave } = await preparar();
  const adm = (req) => llamar(llaves.manejarAdmin, req, SAT, gh);
  // Padrón: un vecino con su tag; estación: ese tag + 2 que nadie registró (uno ya decidido por SAT).
  await llamar(llaves.manejarPublico, { method: "POST", body: { edificio: m12, nombre: "Ana Pérez", telefono: "341 555 1234", relacion: "titular", tipo: "vivienda", piso: "4", unidad: "B", llaves: [{ tipo: "tag", tag: "069:02561" }], acepta: true } }, gh);
  await adm({ method: "POST", body: { accion: "guardar_conciliacion", edificio: m12, archivo: "estacion.xlsx", filas: [
    { tag: "69:2561", usuario: "125", nombre: "ANA PEREZ" },
    { tag: "100:00001", usuario: "7", nombre: "VIEJO INQUILINO", piso: "2", depto: "A" },
    { tag: "100:00002", usuario: "8", nombre: "ENCARGADO" },
    { tag: "100:00003", usuario: "9", nombre: "YA DECIDIDO" },
  ] } });
  await adm({ method: "POST", body: { accion: "decision_conciliacion", edificio: m12, indices: [3], decision: "mantener" } });

  // Sin campaña: no se puede armar la propuesta. Fecha inválida o pasada: rechazada.
  assert.strictEqual((await adm({ method: "POST", body: { accion: "campana_propuesta", edificio: m12 } })).status, 409);
  assert.strictEqual((await adm({ method: "POST", body: { accion: "campana_iniciar", edificio: m12, limite: "2020-01-01" } })).status, 400);
  const limite = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
  const ini = await adm({ method: "POST", body: { accion: "campana_iniciar", edificio: m12, limite } });
  assert.strictEqual(ini.status, 200);
  assert.strictEqual(ini.data.avisados, 1, "le avisa al administrador");
  assert.ok(enviados.some((m) => m.tipo === "campana_admin" && m.datos.etapa === "inicio" && m.datos.para === "cp@admin.com"));
  assert.strictEqual((await adm({ method: "POST", body: { accion: "campana_iniciar", edificio: m12, limite } })).status, 409, "no hay dos campañas a la vez");
  // El formulario público muestra la fecha límite.
  llaves._reiniciarTopes();
  const pub = await llamar(llaves.manejarPublico, { method: "GET", query: { e: m12 } }, gh);
  assert.strictEqual(pub.data.limite, limite);
  // Avance (SAT y portal): 1 de 3 llaves vivas de la estación con dueño.
  const est = await adm({ method: "GET", query: { edificio: m12, campana: "1" } });
  assert.deepStrictEqual([est.data.progreso.estacion.total, est.data.progreso.estacion.con_dueno, est.data.sin_dueno], [4, 1, 2]);
  const { pase } = (await login(gh, "cp@admin.com", clave)).data;
  const h = { "x-consorcio": pase };
  const vista = (await llamar(consorcio.manejarPortal, { method: "GET", headers: h, query: { que: "edificio", e: m12 } }, gh)).data.campana;
  assert.strictEqual(vista.estado, "activa");
  assert.ok(vista.link_registro.includes(m12));
  const inicio = (await llamar(consorcio.manejarPortal, { method: "GET", headers: h, query: {} }, gh)).data;
  assert.strictEqual(inicio.edificios[0].campana.estado, "activa");

  // Cron: 7 días antes, recordatorio (una sola vez).
  const enSieteDias = Date.parse(`${limite}T12:00:00-03:00`) - 6 * 864e5;
  await campana.chequearCampanas(gh, enSieteDias);
  await campana.chequearCampanas(gh, enSieteDias + 3600e3);
  assert.strictEqual(enviados.filter((m) => m.datos && m.datos.etapa === "recordatorio").length, 1);
  // Cron: al vencer arma la propuesta solo con las llaves sin dueño y sin decidir.
  await campana.chequearCampanas(gh, Date.parse(`${limite}T23:59:59-03:00`) + 3600e3);
  const rev = (await llamar(consorcio.manejarPortal, { method: "GET", headers: h, query: { que: "edificio", e: m12 } }, gh)).data.campana;
  assert.strictEqual(rev.estado, "en_revision");
  assert.deepStrictEqual(rev.propuesta.filas.map((f) => f.tag).sort(), ["100:00001", "100:00002"]);
  assert.ok(enviados.some((m) => m.datos && m.datos.etapa === "revision" && m.datos.cantidad === 2));
  // El administrador tiene que decidir todas; otro administrador no puede responder.
  const [viejo, encargado] = ["100:00001", "100:00002"].map((t) => rev.propuesta.filas.find((f) => f.tag === t).k);
  assert.strictEqual((await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { accion: "campana_responder", edificio: m12, bajas: [viejo] } }, gh)).status, 409);
  const ok = await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { accion: "campana_responder", edificio: m12, bajas: [viejo], conservar: [{ k: encargado, motivo: "Es del encargado" }] } }, gh);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await llamar(consorcio.manejarPortal, { method: "POST", headers: h, body: { accion: "campana_responder", edificio: m12, bajas: [viejo, encargado] } }, gh)).status, 409, "no se responde dos veces");
  // Conciliación: la aprobada queda «Dar de baja»; la conservada, «Mantener» con el motivo.
  const conc = JSON.parse(gh.store[`registro-llaves/${m12}.conciliacion.json`].t);
  assert.deepStrictEqual(conc.filas.map((f) => f.decision), ["", "dar_de_baja", "mantener", "mantener"]);
  assert.match(conc.filas[2].nota, /encargado/);
  assert.ok(enviados.some((m) => m.tipo === "campana_sat" && m.datos.etapa === "aprobada" && m.datos.bajas === 1));
  // SAT cierra la campaña: el formulario ya no muestra fecha.
  assert.strictEqual((await adm({ method: "POST", body: { accion: "campana_cerrar", edificio: m12 } })).status, 200);
  llaves._reiniciarTopes();
  assert.strictEqual((await llamar(llaves.manejarPublico, { method: "GET", query: { e: m12 } }, gh)).data.limite, undefined);
});

test("campaña: si vence sin Excel de la estación, avisa a SAT una sola vez", async () => {
  const campana = require("../lib/campana-llaves");
  const path = require("path");
  const enviados = [];
  process.env.SERVICIOS_API_TOKEN = process.env.SERVICIOS_API_TOKEN || "token-de-prueba";
  require.cache[path.join(__dirname, "..", "api", "enviar-mail.js")] = { id: "x", loaded: true, exports: async (req, res) => { enviados.push(req.body); res.status(200).json({ ok: true }); } };
  const { gh, m12 } = await preparar();
  const limite = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  await llamar(llaves.manejarAdmin, { method: "POST", body: { accion: "campana_iniciar", edificio: m12, limite, avisar: false } }, SAT, gh);
  const despues = Date.parse(`${limite}T23:59:59-03:00`) + 864e5;
  await campana.chequearCampanas(gh, despues);
  await campana.chequearCampanas(gh, despues + 864e5);
  assert.strictEqual(enviados.filter((m) => m.tipo === "campana_sat" && m.datos.etapa === "vencida_sin_estacion").length, 1);
  assert.strictEqual(enviados.filter((m) => m.tipo === "campana_admin").length, 0, "avisar: false no manda mail");
});

test("captcha: sin claves no se pide; con claves se verifica con Cloudflare y si no responde se deja pasar", async () => {
  const { gh, m12 } = await preparar();
  const cuerpo = { edificio: m12, nombre: "Ana Pérez", telefono: "341 555 1234", relacion: "titular", tipo: "vivienda", piso: "4", unidad: "B", llaves: [{ tipo: "tag", tag: "069:02561" }], acepta: true };
  assert.strictEqual((await llamar(llaves.manejarPublico, { method: "POST", body: cuerpo }, gh)).status, 200);
  const fetchOriginal = global.fetch;
  process.env.TURNSTILE_SITE_KEY = "0x4AAA"; process.env.TURNSTILE_SECRET_KEY = "0x4BBB";
  const pedidos = [];
  let respuesta = { success: false };
  global.fetch = async (url, opt) => { pedidos.push({ url: String(url), body: String(opt && opt.body) }); if (respuesta === "caido") throw new Error("timeout"); return { ok: true, json: async () => respuesta }; };
  try {
    llaves._reiniciarTopes();
    assert.strictEqual((await llamar(llaves.manejarPublico, { method: "GET", query: { e: m12 } }, gh)).data.captcha, "0x4AAA");
    assert.strictEqual((await llamar(llaves.manejarPublico, { method: "POST", body: cuerpo }, gh)).status, 400, "sin token");
    const malo = await llamar(llaves.manejarPublico, { method: "POST", body: { ...cuerpo, captcha: "token-malo" } }, gh);
    assert.strictEqual(malo.status, 400);
    assert.strictEqual(malo.data.captcha, true);
    assert.ok(pedidos[0].url.includes("challenges.cloudflare.com") && pedidos[0].body.includes("secret=0x4BBB") && pedidos[0].body.includes("response=token-malo"));
    respuesta = { success: true };
    assert.strictEqual((await llamar(llaves.manejarPublico, { method: "POST", body: { ...cuerpo, captcha: "token-bueno" } }, gh)).status, 200);
    respuesta = "caido";
    llaves._reiniciarTopes();
    assert.strictEqual((await llamar(llaves.manejarPublico, { method: "POST", body: { ...cuerpo, nombre: "Otro Vecino", piso: "5", captcha: "x" } }, gh)).status, 200, "Cloudflare caído: pasa");
  } finally {
    global.fetch = fetchOriginal;
    delete process.env.TURNSTILE_SITE_KEY; delete process.env.TURNSTILE_SECRET_KEY;
  }
});
