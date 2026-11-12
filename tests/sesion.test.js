// Seguridad de la API: ya no alcanza con una clave fija escrita en la
// página; cada persona recibe un pase firmado al entrar.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
process.env.SERVICIOS_API_TOKEN = "clave-del-servidor-de-prueba";
process.env.BACKEND_NUEVO_URL = "https://backend.prueba";
process.env.BACKEND_NUEVO_TOKEN = "token-backend";
process.env.GITHUB_DATA_TOKEN = "gh-prueba";
process.env.GITHUB_DATA_REPO = "sat/datos-prueba";
const { crearSesion, leerSesion, autorizar } = require(path.join(raiz, "lib/sesion.js"));
const datos = require(path.join(raiz, "api/datos.js"));

function resFalso() {
  const r = { statusCode: 200, cuerpo: undefined, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (d) => { r.cuerpo = d; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.end = () => r;
  return r;
}
const pedido = (metodo, query, body, token) => ({
  method: metodo, query, body,
  headers: token ? { authorization: "Bearer " + token } : {},
});

test("No queda ninguna clave fija en el código que se publica", () => {
  for (const archivo of ["app.js", "admin.html", "README.md", "sims-utils.js", "stock-utils.js"]) {
    const texto = fs.readFileSync(path.join(raiz, archivo), "utf-8");
    assert.ok(!/["'][0-9a-f]{40,}["']/.test(texto), `${archivo} tiene algo que parece una clave`);
    assert.ok(!texto.includes("54455ad29a4eb28e"), `${archivo} todavía tiene la clave vieja`);
  }
});

test("Pase firmado: vale el propio, no uno modificado ni vencido", () => {
  const pase = crearSesion({ nombre: "Juan Pérez", rol: "tecnico" });
  assert.deepStrictEqual(autorizar({ headers: { authorization: "Bearer " + pase } }).nombre, "Juan Pérez");
  const [v, datosB64, firma] = pase.split(".");
  const trucho = Buffer.from(JSON.stringify({ n: "Juan Pérez", r: "admin", e: Date.now() + 1e9 })).toString("base64url");
  assert.strictEqual(leerSesion(`${v}.${trucho}.${firma}`), null, "no se puede cambiar el rol");
  const vencido = Buffer.from(JSON.stringify({ n: "x", r: "tecnico", e: Date.now() - 1000 })).toString("base64url");
  assert.strictEqual(leerSesion(`${v}.${vencido}.${firma}`), null);
  assert.strictEqual(autorizar({ headers: { authorization: "Bearer cualquier-cosa" } }), null);
  assert.strictEqual(autorizar({ headers: {} }), null);
  assert.strictEqual(autorizar({ headers: { authorization: "Bearer clave-del-servidor-de-prueba" } }).tipo, "servicio");
  assert.ok(datosB64);
});

test("La API rechaza pedidos sin pase y el login entrega uno", async () => {
  const fetchViejo = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/admin-login/estado")) return new Response(JSON.stringify({ bloqueado: false }));
    if (u.includes("/api/admin-login/registrar")) return new Response(JSON.stringify({ bloqueado: false }));
    if (u.includes("/api/tecnicos/verificar")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (u.includes("/api/clientes")) return new Response(JSON.stringify([{ nombre: "Cliente secreto" }]));
    if (u.includes("api.github.com")) return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify([{ nombre: "Juan Pérez", password: "x", permisos: { admin: true } }])).toString("base64") }));
    return new Response("[]");
  };
  try {
    let r = resFalso();
    await datos(pedido("GET", { coleccion: "clientes" }), r);
    assert.strictEqual(r.statusCode, 401, "sin pase no se leen clientes");

    r = resFalso();
    await datos(pedido("GET", { coleccion: "tecnicos" }), r);
    assert.deepStrictEqual(r.cuerpo, [{ nombre: "Juan Pérez" }], "sin login: solo los nombres para el desplegable");

    r = resFalso();
    await datos(pedido("GET", { coleccion: "clientes" }, null, "54455ad29a4eb28e48ca915e3510ff95ceb682523fa74b32"), r);
    assert.strictEqual(r.statusCode, 401, "la clave vieja no sirve");

    r = resFalso();
    await datos(pedido("POST", { coleccion: "tecnicos" }, { accion: "verificar_login", nombre: "Juan Pérez", password: "1234" }), r);
    assert.strictEqual(r.cuerpo.ok, true);
    assert.ok(r.cuerpo.sesion && r.cuerpo.sesion.startsWith("s1."), "el login devuelve el pase");
    const pase = r.cuerpo.sesion;

    r = resFalso();
    await datos(pedido("GET", { coleccion: "clientes" }, null, pase), r);
    assert.strictEqual(r.statusCode, 200);
    assert.deepStrictEqual(r.cuerpo, [{ nombre: "Cliente secreto" }]);

    // Un técnico no puede tocar la lista de técnicos (contraseñas/permisos)
    r = resFalso();
    await datos(pedido("POST", { coleccion: "tecnicos" }, [{ nombre: "Juan Pérez", permisos: { admin: true } }], pase), r);
    assert.strictEqual(r.statusCode, 403);
  } finally {
    global.fetch = fetchViejo;
  }
});

test("Credenciales: guardar reemplaza la lista (no la vuelve a agregar) y si falla deja lo que había", async () => {
  const llamadas = [];
  let tabla = [{ id: 1, nombre: "Juan" }, { id: 2, nombre: "Juan" }];
  let fallarPost = false;
  const fetchViejo = global.fetch;
  global.fetch = async (url, op = {}) => {
    const u = String(url); const m = op.method || "GET";
    if (u.includes("/api/credenciales")) {
      llamadas.push(m);
      if (m === "GET") return new Response(JSON.stringify(tabla));
      if (m === "DELETE") { tabla = []; return new Response(JSON.stringify({ ok: true })); }
      if (m === "POST") {
        if (fallarPost) { fallarPost = false; return new Response(JSON.stringify({ error: "x" }), { status: 500 }); }
        const nuevas = JSON.parse(op.body); tabla = tabla.concat(nuevas.map((x, i) => ({ id: 100 + i, ...x })));
        return new Response(JSON.stringify({ ok: true, count: nuevas.length }));
      }
    }
    return new Response("[]");
  };
  try {
    const pase = crearSesion({ nombre: "", rol: "admin" });
    let r = resFalso();
    await datos(pedido("POST", { coleccion: "credenciales" }, [{ nombre: "Juan", dni: "1" }], pase), r);
    assert.strictEqual(r.statusCode, 200);
    assert.deepStrictEqual(llamadas, ["GET", "DELETE", "POST"]);
    assert.strictEqual(tabla.length, 1, "queda una sola, sin repetidas");
    // Si la carga falla, vuelve lo que había
    fallarPost = true;
    r = resFalso();
    await datos(pedido("POST", { coleccion: "credenciales" }, [{ nombre: "Luis" }], pase), r);
    assert.strictEqual(r.statusCode, 500);
    assert.deepStrictEqual(tabla.map((x) => x.nombre), ["Juan"]);
  } finally {
    global.fetch = fetchViejo;
  }
});

test("Rendiciones: 'Pagado con APP' se guarda como pagado con su marca y se lee como estado propio", async () => {
  const recursoUso = require(path.join(raiz, "api/recurso-uso.js"));
  const fetchViejo = global.fetch;
  const enviados = [];
  global.fetch = async (url, op = {}) => {
    if (op.method === "POST") { enviados.push(JSON.parse(op.body)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
    return { ok: true, status: 200, json: async () => [
      { id: "1", estado: "pagado", pagado_por: "Pagado con APP" },
      { id: "2", estado: "pagado", pagado_por: "Admin" },
      { id: "3", estado: "pendiente" },
    ] };
  };
  try {
    const pase = crearSesion({ nombre: "Oficina", rol: "admin" });
    const r1 = resFalso();
    await recursoUso(pedido("POST", { recurso: "rendicion" }, { accion: "pagado_app", id: "3" }, pase), r1);
    assert.strictEqual(r1.statusCode, 200);
    assert.deepStrictEqual(enviados[0], { accion: "marcar_pagado", id: "3", pagado: true, pagado_por: "Pagado con APP" });
    const r2 = resFalso();
    await recursoUso(pedido("GET", { recurso: "rendicion" }, undefined, pase), r2);
    assert.deepStrictEqual(r2.cuerpo.map((x) => x.estado), ["pagado_app", "pagado", "pendiente"]);
  } finally {
    global.fetch = fetchViejo;
  }
});

test("Admin con usuario propio: entra solo quien tiene el permiso, el pase lleva su nombre y los cambios quedan en el registro", async () => {
  const recursoUso = require(path.join(raiz, "api/recurso-uso.js"));
  const fetchViejo = global.fetch;
  let log = null; // contenido de auditoria.json
  const alBackend = [];
  global.fetch = async (url, op = {}) => {
    const u = String(url);
    if (u.includes("/api/admin-login/")) return new Response(JSON.stringify({ bloqueado: false }));
    if (u.includes("/api/tecnicos/verificar")) {
      const b = JSON.parse(op.body);
      return new Response(JSON.stringify({ ok: b.password === "bien" }), { status: b.password === "bien" ? 200 : 401 });
    }
    if (u.includes("auditoria.json")) {
      if (op.method === "PUT") { log = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString("utf-8")); return new Response("{}", { status: 200 }); }
      return log ? new Response(JSON.stringify({ sha: "x", content: Buffer.from(JSON.stringify(log)).toString("base64") })) : new Response("{}", { status: 404 });
    }
    if (u.includes("tecnicos.json")) return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify([
      { nombre: "Marta Díaz", password: "", permisos: { admin: true } }, { nombre: "Juan Pérez", password: "", permisos: {} },
    ])).toString("base64") }));
    if (u.includes("/api/rendiciones")) { alBackend.push(JSON.parse(op.body || "{}")); return new Response(JSON.stringify({ ok: true, tecnico: "" })); }
    return new Response("[]");
  };
  try {
    let r = resFalso();
    await datos(pedido("POST", { coleccion: "tecnicos" }, { accion: "verificar_admin", nombre: "Juan Pérez", password: "bien" }), r);
    assert.deepStrictEqual(r.cuerpo, { ok: false, sin_permiso: true }, "sin el permiso no entra aunque la clave esté bien");

    r = resFalso();
    await datos(pedido("POST", { coleccion: "tecnicos" }, { accion: "verificar_admin", nombre: "Marta Díaz", password: "mal" }), r);
    assert.strictEqual(r.cuerpo.ok, false);

    r = resFalso();
    await datos(pedido("POST", { coleccion: "tecnicos" }, { accion: "verificar_admin", nombre: "Marta Díaz", password: "bien" }), r);
    assert.strictEqual(r.cuerpo.ok, true);
    assert.strictEqual(r.cuerpo.nombre, "Marta Díaz");
    const s = leerSesion(r.cuerpo.sesion);
    assert.deepStrictEqual({ n: s.nombre, r: s.rol }, { n: "Marta Díaz", r: "admin" });
    assert.deepStrictEqual({ q: log[0].quien, a: log[0].accion }, { q: "Marta Díaz", a: "Entró al panel" });

    // Un cambio desde el admin queda anotado con su nombre (y el pago a su nombre)
    r = resFalso();
    await recursoUso(pedido("POST", { recurso: "rendicion" }, { accion: "marcar_pagado", id: "R1", pagado: true, pagado_por: "Admin" }, crearSesion({ nombre: "Marta Díaz", rol: "admin" })), r);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(alBackend[0].pagado_por, "Marta Díaz");
    assert.deepStrictEqual({ q: log[0].quien, s: log[0].seccion, a: log[0].accion }, { q: "Marta Díaz", s: "Rendiciones", a: "Marcó como pagado" });
    assert.strictEqual(log.length, 2);

    // Lo que hace un técnico desde la app no se anota acá, y el registro solo lo ve la oficina
    r = resFalso();
    await recursoUso(pedido("POST", { recurso: "rendicion" }, { accion: "crear", tecnico: "Juan Pérez", monto: 10 }, crearSesion({ nombre: "Juan Pérez", rol: "tecnico" })), r);
    assert.strictEqual(log.length, 2);
    r = resFalso();
    await datos(pedido("GET", { coleccion: "auditoria" }, null, crearSesion({ nombre: "Juan Pérez", rol: "tecnico" })), r);
    assert.strictEqual(r.statusCode, 403);
    r = resFalso();
    await datos(pedido("POST", { coleccion: "auditoria" }, [], crearSesion({ nombre: "Marta Díaz", rol: "admin" })), r);
    assert.strictEqual(r.statusCode, 403, "nadie lo escribe a mano");
  } finally {
    global.fetch = fetchViejo;
  }
});

test("Presupuesto express: la lista de precios la carga solo la oficina y los números salen correlativos E-0001, E-0002", async () => {
  const fetchViejo = global.fetch;
  const archivos = {};
  global.fetch = async (url, op = {}) => {
    const u = String(url);
    const ruta = (u.match(/contents\/([^?]+)/) || [])[1];
    if (ruta === "tecnicos.json") return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify([{ nombre: "Juan", permisos: { presupuesto_express: true } }, { nombre: "Luis", permisos: {} }])).toString("base64"), encoding: "base64", sha: "t" }));
    if (ruta) {
      if (op.method === "PUT") { archivos[ruta] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString("utf-8")); return new Response("{}", { status: 200 }); }
      if (!archivos[ruta]) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(archivos[ruta])).toString("base64") }));
    }
    return new Response("[]");
  };
  try {
    const admin = crearSesion({ nombre: "Oficina", rol: "admin" });
    const juan = crearSesion({ nombre: "Juan", rol: "tecnico" });
    const luis = crearSesion({ nombre: "Luis", rol: "tecnico" });
    let r = resFalso();
    await datos(pedido("POST", { coleccion: "lista_precios" }, { accion: "reemplazar", items: [{ d: "Batería", p: "28.500,50" }] }, juan), r);
    assert.strictEqual(r.statusCode, 403, "un técnico no carga la lista");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "lista_precios" }, { accion: "reemplazar", archivo: "lista.xlsx", items: [{ c: "B7", d: "Batería", p: "28.500,50" }, { d: "Central", p: 185, m: "USD" }, { d: "", p: 1 }] }, admin), r);
    assert.deepStrictEqual(r.cuerpo, { ok: true, cantidad: 2, cotizacion_usd: null, kits: 0, fotos: 0 });
    r = resFalso();
    await datos(pedido("POST", { coleccion: "lista_precios" }, { accion: "cotizacion", valor: "1.450" }, admin), r);
    r = resFalso();
    await datos(pedido("GET", { coleccion: "lista_precios" }, null, juan), r);
    assert.strictEqual(r.cuerpo.cotizacion_usd, 1450);
    assert.deepStrictEqual(r.cuerpo.items, [{ c: "B7", d: "Batería", p: 28500.5, m: "ARS" }, { c: "", d: "Central", p: 185, m: "USD" }]);
    r = resFalso();
    await datos(pedido("POST", { coleccion: "presupuestos_express" }, { accion: "nuevo", cliente: "Tell", total: 100 }, luis), r);
    assert.strictEqual(r.statusCode, 403, "sin el permiso no emite");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "presupuestos_express" }, { accion: "nuevo", cliente: "Tell", total: 100 }, juan), r);
    assert.strictEqual(r.cuerpo.numero, "E-0001");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "presupuestos_express" }, { accion: "nuevo", cliente: "Otro", total: 5, tipo: "automonitoreo", abono: "12.000" }, admin), r);
    assert.strictEqual(r.cuerpo.numero, "E-0002");
    assert.deepStrictEqual(archivos["presupuestos-express.json"].presupuestos.map((p) => [p.numero, p.emitido_por]), [["E-0002", "Oficina"], ["E-0001", "Juan"]]);
    assert.deepStrictEqual([archivos["presupuestos-express.json"].presupuestos[0].tipo, archivos["presupuestos-express.json"].presupuestos[0].abono], ["automonitoreo", 12000]);
    // Correcciones: E-0001-R1, E-0001-R2 (aunque se pida desde una revisión)
    r = resFalso();
    await datos(pedido("POST", { coleccion: "presupuestos_express" }, { accion: "revision", base: "E-0001", cliente: "Tell", total: 90 }, juan), r);
    assert.strictEqual(r.cuerpo.numero, "E-0001-R1");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "presupuestos_express" }, { accion: "revision", base: "E-0001-R1", cliente: "Tell", total: 80 }, juan), r);
    assert.strictEqual(r.cuerpo.numero, "E-0001-R2");
    // Kits y fotos (solo la oficina), sin tocar la lista
    r = resFalso();
    await datos(pedido("POST", { coleccion: "lista_precios" }, { accion: "kits", kits: [{ nombre: "Kit base", items: [{ c: "B7", d: "Batería", cant: 2 }] }, { nombre: "", items: [] }] }, admin), r);
    assert.strictEqual(r.cuerpo.kits, 1);
    r = resFalso();
    await datos(pedido("POST", { coleccion: "lista_precios" }, { accion: "foto", clave: "B7", id: "abc123" }, admin), r);
    assert.strictEqual(r.cuerpo.fotos, 1);
    assert.strictEqual(archivos["lista-precios.json"].items.length, 2, "la lista sigue igual");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "lista_precios" }, { accion: "kits", kits: [] }, juan), r);
    assert.strictEqual(r.statusCode, 403);
  } finally {
    global.fetch = fetchViejo;
  }
});

test("Croquis: solo con permiso; se guardan con un índice, se reabren, y los borra el autor o la oficina", async () => {
  const fetchViejo = global.fetch;
  const archivos = {};
  global.fetch = async (url, op = {}) => {
    const u = String(url);
    const ruta = (u.match(/contents\/([^?]+)/) || [])[1];
    if (ruta === "tecnicos.json") return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify([{ nombre: "Juan", permisos: { croquis: true } }, { nombre: "Ana", permisos: { croquis: true } }, { nombre: "Luis", permisos: {} }])).toString("base64"), encoding: "base64", sha: "t" }));
    if (ruta) {
      if (op.method === "PUT") { archivos[ruta] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString("utf-8")); return new Response("{}", { status: 200 }); }
      if (op.method === "DELETE") { delete archivos[ruta]; return new Response("{}", { status: 200 }); }
      if (!archivos[ruta]) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(archivos[ruta])).toString("base64") }));
    }
    return new Response("[]");
  };
  try {
    const admin = crearSesion({ nombre: "Oficina", rol: "admin" });
    const juan = crearSesion({ nombre: "Juan", rol: "tecnico" });
    const ana = crearSesion({ nombre: "Ana", rol: "tecnico" });
    const luis = crearSesion({ nombre: "Luis", rol: "tecnico" });
    const dibujo = { v: 1, elementos: [{ id: "a1", t: "rect", x: 0, y: 0, w: 100, h: 80 }, { id: "a2", t: "simbolo", tipo: "central", x: 20, y: 20, rot: 0, esc: 1 }] };
    let r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "guardar", titulo: "PB", cliente: "Tell", dibujo }, luis), r);
    assert.strictEqual(r.statusCode, 403, "sin permiso no guarda");
    r = resFalso();
    await datos(pedido("GET", { coleccion: "croquis" }, null, luis), r);
    assert.strictEqual(r.statusCode, 403, "sin permiso no ve la lista");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "guardar", titulo: "PB", cliente: "Tell", numero_cliente: "60", dibujo }, juan), r);
    assert.ok(r.cuerpo.ok && /^[a-z0-9]{6,32}$/.test(r.cuerpo.id));
    const id = r.cuerpo.id;
    // Se vuelve a guardar el mismo: no se duplica en el índice y conserva el autor
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "guardar", id, titulo: "Planta baja", cliente: "Tell", dibujo: { v: 1, elementos: [...dibujo.elementos, { id: "a3", t: "texto", x: 5, y: 5, texto: "Cocina" }] } }, ana), r);
    assert.strictEqual(r.cuerpo.id, id);
    r = resFalso();
    await datos(pedido("GET", { coleccion: "croquis" }, null, ana), r);
    assert.strictEqual(r.cuerpo.length, 1);
    assert.strictEqual(r.cuerpo[0].titulo, "Planta baja");
    assert.strictEqual(r.cuerpo[0].autor, "Juan");
    assert.strictEqual(r.cuerpo[0].elementos, 3);
    assert.ok(!r.cuerpo[0].dibujo, "el índice no trae los trazos");
    r = resFalso();
    await datos(pedido("GET", { coleccion: "croquis", id }, null, juan), r);
    assert.strictEqual(r.cuerpo.dibujo.elementos.length, 3);
    // Ana no es la autora: no lo puede borrar; la oficina sí
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "borrar", id }, ana), r);
    assert.strictEqual(r.statusCode, 403);
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "borrar", id }, admin), r);
    assert.ok(r.cuerpo.ok);
    assert.ok(!archivos[`croquis/${id}.json`]);
    r = resFalso();
    await datos(pedido("GET", { coleccion: "croquis" }, null, juan), r);
    assert.deepStrictEqual(r.cuerpo, []);
  } finally {
    global.fetch = fetchViejo;
  }
});

test("Vista 3D para el cliente: cualquier técnico la comparte, se guarda sin dirección ni imágenes, y se abre sin login solo con el id", async () => {
  const fetchViejo = global.fetch;
  const archivos = {};
  global.fetch = async (url, op = {}) => {
    const ruta = (String(url).match(/contents\/([^?]+)/) || [])[1];
    const r = ruta && decodeURIComponent(ruta);
    if (r === "tecnicos.json") return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify([{ nombre: "Luis", permisos: {} }])).toString("base64"), encoding: "base64", sha: "t" }));
    if (r) {
      if (op.method === "PUT") { archivos[r] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString("utf-8")); return new Response("{}", { status: 200 }); }
      if (!archivos[r]) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(archivos[r])).toString("base64") }));
    }
    return new Response("[]");
  };
  try {
    const luis = crearSesion({ nombre: "Luis", rol: "tecnico" });
    const elementos = [{ id: "a", t: "linea", pts: [0, 0, 400, 0] }, { id: "b", t: "simbolo", tipo: "infrarrojo", x: 50, y: 50, inst: true }, { id: "c", t: "imagen", src: "data:xxx" }, { id: "d", t: "cable", pts: [0, 0, 10, 10] }];
    let r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "compartir_3d", titulo: "Casa Pérez", cliente: "Juan Pérez", direccion: "Calle Falsa 123", paginas: [{ nombre: "PB", elementos }] }, luis), r);
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.cuerpo));
    const id = r.cuerpo.id;
    assert.match(id, /^[0-9a-f]{16}$/);
    const guardado = archivos[`vistas3d/${id}.json`];
    assert.ok(guardado, "se guardó");
    assert.ok(!JSON.stringify(guardado).includes("Falsa"), "sin dirección");
    assert.deepStrictEqual(guardado.paginas[0].elementos.map((e) => e.t), ["linea", "simbolo"], "sin imágenes ni cables");
    // Vacío: no
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "compartir_3d", paginas: [{ elementos: [] }] }, luis), r);
    assert.strictEqual(r.statusCode, 400);
    // Sin sesión: no se puede crear
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "compartir_3d", paginas: [{ elementos }] }), r);
    assert.strictEqual(r.statusCode, 401);
    // Público: se abre por id, sin login
    r = resFalso();
    await datos(pedido("GET", { publico: "vista3d", id }), r);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(r.cuerpo.titulo, "Casa Pérez");
    assert.strictEqual(r.cuerpo.paginas[0].elementos.length, 2);
    assert.ok(!("por" in r.cuerpo), "no dice quién lo mandó");
    assert.strictEqual(r.headers["Access-Control-Allow-Origin"], "*", "se abre también desde el archivo HTML");
    assert.strictEqual(r.cuerpo.propuestas.length, 1);
    // La apertura queda contada, y el pedido de llamada también
    assert.strictEqual(archivos["vistas3d/indice.json"][0].aperturas, 1);
    assert.ok(archivos["vistas3d/indice.json"][0].avisado, "se le avisó a quien lo mandó");
    r = resFalso();
    await datos(pedido("POST", { publico: "vista3d_llamar" }, JSON.stringify({ id, telefono: "11 5555-1234", mensaje: "a la tarde", propuesta: "Completa" })), r);
    assert.strictEqual(r.statusCode, 200);
    assert.deepStrictEqual(archivos["vistas3d/indice.json"][0].llamadas.map((l) => [l.telefono, l.propuesta]), [["11 5555-1234", "Completa"]]);
    r = resFalso();
    await datos(pedido("POST", { publico: "vista3d_llamar" }, { id, telefono: "12" }), r);
    assert.strictEqual(r.statusCode, 400, "sin teléfono válido no");
    // Desde la app se ve el estado de los links mandados de ese cliente
    r = resFalso();
    await datos(pedido("GET", { coleccion: "croquis", vistas3d: "1", cliente: "juan pérez" }, null, luis), r);
    assert.strictEqual(r.cuerpo.length, 1);
    assert.strictEqual(r.cuerpo[0].aperturas, 1);
    // Dos propuestas para comparar
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "compartir_3d", titulo: "Casa", propuestas: [{ nombre: "Básica", paginas: [{ elementos }] }, { nombre: "Completa", paginas: [{ elementos: [...elementos, { id: "z", t: "simbolo", tipo: "humo", x: 1, y: 1 }] }] }, { nombre: "Vacía", paginas: [{ elementos: [] }] }] }, luis), r);
    const id2 = r.cuerpo.id;
    assert.deepStrictEqual(archivos[`vistas3d/${id2}.json`].propuestas.map((p) => [p.nombre, p.paginas[0].elementos.length]), [["Básica", 2], ["Completa", 3]]);
    // Sin presentación guiada (un agregado a un cliente que ya tiene el sistema)
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "compartir_3d", titulo: "Agregado", presentacion: false, paginas: [{ elementos }] }, luis), r);
    const idSin = r.cuerpo.id;
    r = resFalso();
    await datos(pedido("GET", { publico: "vista3d", id: idSin, contar: "0" }), r);
    assert.strictEqual(r.cuerpo.presentacion, false);
    r = resFalso();
    await datos(pedido("GET", { publico: "vista3d", id: id2, contar: "0" }), r);
    assert.strictEqual(r.cuerpo.presentacion, true, "por defecto, con presentación");
    // Las plantas de la casa conservan su nivel
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "compartir_3d", titulo: "Casa", paginas: [{ nombre: "PB", nivel: 0, elementos }, { nombre: "PA", nivel: 1, elementos }, { nombre: "X", nivel: "hack", elementos }] }, luis), r);
    assert.deepStrictEqual(archivos[`vistas3d/${r.cuerpo.id}.json`].paginas.map((p) => p.nivel), [0, 1, undefined]);
    r = resFalso();
    await datos(pedido("GET", { publico: "vista3d", id: "0000000000000000" }), r);
    assert.strictEqual(r.statusCode, 404);
    r = resFalso();
    await datos(pedido("GET", { publico: "vista3d", id: "../tecnicos" }), r);
    assert.strictEqual(r.statusCode, 400);
  } finally {
    global.fetch = fetchViejo;
  }
});

test("Croquis desde foto: el servidor le pasa la foto a la IA con el pedido de JSON y devuelve lo que interpretó", async () => {
  const fetchViejo = global.fetch;
  const claveVieja = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "clave-de-prueba";
  let alGemini = null;
  global.fetch = async (url, op = {}) => {
    const u = String(url);
    if (u.includes("generativelanguage")) {
      alGemini = JSON.parse(op.body);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n{"rotacion":90,"habitaciones":[{"x1":1,"y1":2,"x2":3,"y2":4}]}\n```' }] } }] }));
    }
    const ruta = (u.match(/contents\/([^?]+)/) || [])[1];
    if (ruta === "tecnicos.json") return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify([{ nombre: "Juan", permisos: { croquis: true } }, { nombre: "Luis", permisos: {} }])).toString("base64"), encoding: "base64", sha: "t" }));
    return new Response("{}", { status: 404 });
  };
  try {
    const foto = "A".repeat(5000);
    let r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "interpretar", imagen: foto }, crearSesion({ nombre: "Luis", rol: "tecnico" })), r);
    assert.strictEqual(r.statusCode, 403, "sin permiso no");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "interpretar", imagen: "data:image/jpeg;base64," + foto, mime: "image/jpeg" }, crearSesion({ nombre: "Juan", rol: "tecnico" })), r);
    assert.deepStrictEqual(r.cuerpo, { ok: true, resultado: { rotacion: 90, habitaciones: [{ x1: 1, y1: 2, x2: 3, y2: 4 }] } });
    assert.strictEqual(alGemini.contents[0].parts[0].inline_data.data, foto, "sin el encabezado data:");
    assert.match(alGemini.contents[0].parts[1].text, /infrarrojo/);
    assert.strictEqual(alGemini.generationConfig.responseMimeType, "application/json");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "interpretar", imagen: "" }, crearSesion({ nombre: "Juan", rol: "tecnico" })), r);
    assert.strictEqual(r.statusCode, 400);
  } finally {
    global.fetch = fetchViejo;
    if (claveVieja === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = claveVieja;
  }
});

test("SIMs: sucursales con el mismo nombre (Librería Ladder 1…12) no se confunden al buscar si el cliente ya tiene línea", () => {
  const vm = require("vm");
  const ctx = {};
  vm.runInNewContext(require("fs").readFileSync(require("path").join(__dirname, "..", "sims-utils.js"), "utf8"), ctx);
  const sims = [
    { numero: "111", estado: "uso", cliente: "Libreria Ladder 3", numero_cliente: "503", empresa: "Claro" },
    { numero: "222", estado: "uso", cliente: "Libreria Ladder 1", empresa: "Personal" },
  ];
  // La 12 no tiene línea: ni la de la 3 (otro N° de cliente) ni la de la 1 (otro número en el nombre)
  assert.strictEqual(ctx.buscarSimExistenteEnCliente("Librería Ladder 12", "512", sims, null).tipo, "ninguna");
  assert.strictEqual(ctx.buscarSimExistenteEnCliente("Librería Ladder 12", "", sims, null).tipo, "ninguna");
  // La 3 sí, confirmada por N° de cliente; la 1, parecida por nombre (sin N° guardado)
  assert.strictEqual(ctx.buscarSimExistenteEnCliente("Librería Ladder 3", "503", sims, null).tipo, "confirmada");
  assert.strictEqual(ctx.buscarSimExistenteEnCliente("Librería Ladder 1", "501", sims, null).sim.numero, "222");
});

test("Planos de instalación: cualquier técnico de la instalación los guarda; cerrada la instalación quedan de solo lectura (salvo la oficina)", async () => {
  const fetchViejo = global.fetch;
  const archivos = new Map([["tecnicos.json", [{ nombre: "Ana", permisos: {} }, { nombre: "Beto", permisos: { croquis: true } }]]]);
  const estados = { 7: "abierta" };
  let sha = 1;
  global.fetch = async (url, op) => {
    const u = String(url), metodo = (op && op.method) || "GET";
    const mInst = /backend\.prueba\/api\/instalaciones\/(\d+)$/.exec(u);
    if (mInst) return new Response(JSON.stringify({ id: Number(mInst[1]), estado: estados[mInst[1]] || "abierta" }));
    const m = /contents\/(.+)$/.exec(u);
    if (m) {
      const ruta = decodeURIComponent(m[1]);
      if (metodo === "PUT") { archivos.set(ruta, JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString())); return new Response("{}", { status: 200 }); }
      if (metodo === "DELETE") { archivos.delete(ruta); return new Response("{}", { status: 200 }); }
      if (!archivos.has(ruta)) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s" + sha++, encoding: "base64", content: Buffer.from(JSON.stringify(archivos.get(ruta))).toString("base64") }));
    }
    return new Response("{}", { status: 200 });
  };
  try {
    const ana = crearSesion({ nombre: "Ana", rol: "tecnico" }), beto = crearSesion({ nombre: "Beto", rol: "tecnico" }), admin = crearSesion({ nombre: "", rol: "admin" });
    const llamar = async (metodo, query, body, token) => { const res = resFalso(); await datos(pedido(metodo, { coleccion: "croquis", ...query }, body, token), res); return res; };
    const dibujo = { v: 2, elementos: [], paginas: [{ nombre: "Página 1", elementos: [], fondo: { id: "abc123", x: 0, y: 0, w: 800, h: 600, base: true } }] };
    // Ana no tiene el permiso de croquis: sin instalación no puede, con instalación sí.
    assert.strictEqual((await llamar("POST", {}, { accion: "guardar", titulo: "x", dibujo }, ana)).statusCode, 403);
    const g = await llamar("POST", {}, { accion: "guardar", instalacion: "7", titulo: "Plano", cliente: "Lara", dibujo }, ana);
    assert.strictEqual(g.statusCode, 200, JSON.stringify(g.cuerpo));
    const id = g.cuerpo.id;
    const indice = archivos.get("croquis-index.json");
    assert.strictEqual(indice[0].instalacion, "7");
    assert.strictEqual(indice[0].base, true, "el índice marca que va sobre un plano");
    // Ana solo ve los de su instalación o su cliente
    await llamar("POST", {}, { accion: "guardar", titulo: "Otro", cliente: "Otro cliente", dibujo: { v: 1, elementos: [{ t: "texto", x: 0, y: 0, texto: "a" }] } }, beto);
    const lista = (await llamar("GET", { instalacion: "7", cliente: "lara" }, null, ana)).cuerpo;
    assert.deepStrictEqual(lista.map((c) => c.titulo), ["Plano"]);
    assert.strictEqual((await llamar("GET", {}, null, beto)).cuerpo.length, 2);
    // No se puede cerrar el plano de una instalación que sigue abierta
    assert.strictEqual((await llamar("POST", {}, { accion: "cerrar_instalacion", instalacion_id: "7" }, ana)).statusCode, 409);
    // Se cierra la instalación: aunque no se haya marcado, ya no se puede guardar ni borrar
    estados[7] = "cerrada";
    const r1 = await llamar("POST", {}, { accion: "guardar", id, instalacion: "7", titulo: "Plano", dibujo }, ana);
    assert.strictEqual(r1.statusCode, 403);
    assert.strictEqual(r1.cuerpo.cerrado, true);
    assert.strictEqual((await llamar("GET", { id }, null, ana)).cuerpo.cerrado, true, "al abrirlo avisa que está cerrado");
    const c = await llamar("POST", {}, { accion: "cerrar_instalacion", instalacion_id: "7" }, ana);
    assert.deepStrictEqual(c.cuerpo, { ok: true, cerrados: 1 });
    assert.strictEqual(archivos.get(`croquis/${id}.json`).cerrado, true);
    assert.strictEqual(archivos.get("croquis-index.json").find((x) => x.id === id).cerrado, true);
    assert.strictEqual((await llamar("POST", {}, { accion: "borrar", id }, ana)).statusCode, 403, "la autora tampoco lo puede borrar");
    assert.strictEqual((await llamar("POST", {}, { accion: "guardar", id, titulo: "Plano", dibujo }, beto)).statusCode, 403, "ni otro con permiso de croquis");
    // La oficina sí (por ejemplo, para cambiar el plano), y sigue marcado como cerrado
    const ra = await llamar("POST", {}, { accion: "guardar", id, titulo: "Plano corregido", dibujo }, admin);
    assert.strictEqual(ra.statusCode, 200);
    assert.strictEqual(archivos.get(`croquis/${id}.json`).cerrado, true);
    assert.strictEqual(archivos.get(`croquis/${id}.json`).instalacion, "7");
  } finally { global.fetch = fetchViejo; }
});

test("SIMs: las correcciones de la oficina quedan con el nombre de quien las hizo, y un técnico no las puede hacer", async () => {
  const fetchViejo = global.fetch;
  const enviados = [];
  global.fetch = async (url, op) => { if (String(url).includes("/api/sims/accion")) enviados.push(JSON.parse(op.body)); return new Response(JSON.stringify({ ok: true })); };
  try {
    const recurso = require(path.join(raiz, "api/recurso-uso.js"));
    const admin = crearSesion({ nombre: "Brenda Thiesing", rol: "admin" }), general = crearSesion({ nombre: "Clave general", rol: "admin" }), tec = crearSesion({ nombre: "Juan", rol: "tecnico" });
    const llamar = async (body, token) => { const res = resFalso(); await recurso(pedido("POST", {}, { recurso: "sim", ...body }, token), res); return res; };
    await llamar({ accion: "corregir_numero", numero: "3415550001", numero_nuevo: "3415550002", tecnico: "Cualquiera" }, admin);
    assert.strictEqual(enviados[0].tecnico, "Oficina (Brenda Thiesing)", "sale del pase, no de lo que mande la página");
    await llamar({ accion: "editar_instalada", numero: "1", campos: { empresa: "Personal" } }, general);
    assert.strictEqual(enviados[1].tecnico, "Oficina");
    assert.strictEqual((await llamar({ accion: "corregir_numero", numero: "1", numero_nuevo: "2" }, tec)).statusCode, 403);
    assert.strictEqual(enviados.length, 2);
  } finally { global.fetch = fetchViejo; }
});

test("Datos del equipo: el autor sale de la sesión, solo el autor o la oficina borran, cada edición guarda la versión anterior y se puede volver", async () => {
  const fetchViejo = global.fetch;
  let archivo = [];
  const grande = { usar: false };
  global.fetch = async (url, op) => {
    const u = String(url), metodo = (op && op.method) || "GET";
    if (u.includes("datos-equipo.json")) {
      if (metodo === "PUT") { archivo = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString()); return new Response("{}", { status: 200 }); }
      const raw = op && op.headers && op.headers.Accept === "application/vnd.github.raw";
      if (raw) return new Response(JSON.stringify(archivo));
      // Pasado 1 MB, GitHub no manda el contenido en el JSON
      return new Response(JSON.stringify(grande.usar ? { sha: "s", encoding: "none", content: "" } : { sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(archivo)).toString("base64") }));
    }
    return new Response("{}", { status: 200 });
  };
  try {
    const juan = crearSesion({ nombre: "Juan", rol: "tecnico" }), luis = crearSesion({ nombre: "Luis", rol: "tecnico" }), ofi = crearSesion({ nombre: "Brenda", rol: "admin" });
    const llamar = async (body, token) => { const res = resFalso(); await datos(pedido("POST", { coleccion: "datos_equipo" }, body, token), res); return res; };
    let r = await llamar({ accion: "crear", titulo: "APN Claro", contenido: "igprs.claro.com.ar", autor: "Inventado", fotos: ["abcdef0123456789", "../malo"] }, juan);
    assert.strictEqual(r.statusCode, 200);
    const id = archivo[0].id;
    assert.strictEqual(archivo[0].autor, "Juan", "el autor es el de la sesión, no el que manda la página");
    assert.deepStrictEqual(archivo[0].fotos, ["abcdef0123456789"]);
    grande.usar = true; // de acá en más el archivo "pesa" más de 1 MB
    r = await llamar({ accion: "editar", id, titulo: "APN Claro", contenido: "BORRADO", autor: "Juan" }, luis);
    assert.strictEqual(r.statusCode, 200, "se puede guardar aunque el archivo pese más de 1 MB");
    assert.strictEqual(archivo[0].ediciones[0].autor, "Luis");
    assert.strictEqual(archivo[0].ediciones[0].antes.contenido, "igprs.claro.com.ar", "queda cómo estaba antes");
    assert.strictEqual((await llamar({ accion: "borrar", id, autor: "Juan", admin: true }, luis)).statusCode, 403, "ni haciéndose pasar por el autor ni diciendo que es admin");
    r = await llamar({ accion: "restaurar", id, edicion: 0 }, juan);
    assert.strictEqual(archivo[0].contenido, "igprs.claro.com.ar", "volvió a la versión anterior");
    assert.strictEqual(archivo[0].ediciones[1].accion, "restaurar");
    const resGet = resFalso(); await datos(pedido("GET", { coleccion: "datos_equipo" }, null, juan), resGet);
    assert.strictEqual(resGet.cuerpo[0].contenido, "igprs.claro.com.ar", "también se lee pasado 1 MB");
    assert.strictEqual((await llamar({ accion: "borrar", id }, ofi)).statusCode, 200, "la oficina sí puede borrar");
    assert.strictEqual(archivo.length, 0);
  } finally { global.fetch = fetchViejo; }
});

test("Datos del equipo: un dato nuevo se avisa por notificación al resto del equipo (no a quien lo cargó); editar no avisa", async () => {
  const fetchViejo = global.fetch;
  let archivo = [];
  global.fetch = async (url, op) => {
    const u = String(url), metodo = (op && op.method) || "GET";
    if (u.includes("datos-equipo.json")) {
      if (metodo === "PUT") { archivo = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString()); return new Response("{}", { status: 200 }); }
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(archivo)).toString("base64") }));
    }
    return new Response("{}", { status: 200 });
  };
  const rutaPush = require.resolve(path.join(raiz, "lib/push-sender.js"));
  const viejo = require.cache[rutaPush];
  const avisos = [];
  require.cache[rutaPush] = { id: rutaPush, filename: rutaPush, loaded: true, exports: { enviarATodos: async (a) => { avisos.push(a); return { enviados: 3 }; }, enviarASeleccionados: async () => ({}) } };
  try {
    const juan = crearSesion({ nombre: "Juan", rol: "tecnico" });
    const llamar = async (body) => { const res = resFalso(); await datos(pedido("POST", { coleccion: "datos_equipo" }, body, juan), res); return res; };
    await llamar({ accion: "crear", titulo: "Código instalador DSC", contenido: "5555", fotos: ["abcdef0123456789"] });
    assert.strictEqual(avisos.length, 1);
    assert.strictEqual(avisos[0].excluir, "Juan", "a quien lo cargó no le llega");
    assert.match(avisos[0].cuerpo, /^Juan: Código instalador DSC \(con fotos\)$/);
    assert.strictEqual(avisos[0].url, `/?ir=dato-equipo&id=${encodeURIComponent(archivo[0].id)}`, "la notificación abre ese dato");
    await llamar({ accion: "editar", id: archivo[0].id, titulo: "Código instalador DSC", contenido: "5555 o 1234" });
    assert.strictEqual(avisos.length, 1, "las ediciones no avisan");
  } finally {
    global.fetch = fetchViejo;
    if (viejo) require.cache[rutaPush] = viejo; else delete require.cache[rutaPush];
  }
});

test("Datos del equipo: «me sirvió» (una vez por persona), avisar desactualizado (le llega a quien lo cargó) y se resuelve al corregirlo; la IA recibe los datos que tienen que ver", async () => {
  const fetchViejo = global.fetch;
  let archivo = [];
  global.fetch = async (url, op) => {
    const u = String(url), metodo = (op && op.method) || "GET";
    if (u.includes("datos-equipo.json")) {
      if (metodo === "PUT") { archivo = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString()); return new Response("{}", { status: 200 }); }
      if (op && op.headers && op.headers.Accept === "application/vnd.github.raw") return new Response(JSON.stringify(archivo));
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(archivo)).toString("base64") }));
    }
    return new Response("{}", { status: 200 });
  };
  const rutaPush = require.resolve(path.join(raiz, "lib/push-sender.js"));
  const viejo = require.cache[rutaPush];
  const avisos = [];
  require.cache[rutaPush] = { id: rutaPush, filename: rutaPush, loaded: true, exports: { enviarATodos: async () => ({}), enviarASeleccionados: async (n, a) => { avisos.push({ n, ...a }); return {}; } } };
  try {
    const juan = crearSesion({ nombre: "Juan", rol: "tecnico" }), luis = crearSesion({ nombre: "Luis", rol: "tecnico" });
    const llamar = async (body, t) => { const res = resFalso(); await datos(pedido("POST", { coleccion: "datos_equipo" }, body, t), res); return res; };
    await llamar({ accion: "crear", titulo: "APN Claro comunicadores", contenido: "igprs.claro.com.ar usuario clarogprs", categoria: "APN y líneas" }, juan);
    await llamar({ accion: "crear", titulo: "Código instalador DSC", contenido: "5555", categoria: "Códigos y claves de fábrica" }, juan);
    const id = archivo.find((d) => d.titulo.startsWith("APN")).id;
    await llamar({ accion: "util", id }, luis);
    await llamar({ accion: "util", id }, juan);
    assert.deepStrictEqual(archivo.find((d) => d.id === id).utiles, ["Luis", "Juan"]);
    await llamar({ accion: "util", id }, luis);
    assert.deepStrictEqual(archivo.find((d) => d.id === id).utiles, ["Juan"], "tocar de nuevo lo saca");
    await llamar({ accion: "desactualizado", id, nota: "Claro cambió el APN" }, luis);
    assert.strictEqual(archivo.find((d) => d.id === id).reportes[0].nota, "Claro cambió el APN");
    assert.deepStrictEqual(avisos.map((a) => a.n), [["Juan"]], "le llega a quien lo cargó");
    assert.match(avisos[0].cuerpo, /Luis avisa que «APN Claro comunicadores» puede estar desactualizado: Claro cambió el APN/);
    // La IA recibe los datos que tienen que ver con la pregunta (con el aviso de desactualizado)
    const { datosEquipoRelacionados } = require(path.join(raiz, "api/consultas.js"));
    const rel = await datosEquipoRelacionados({}, "sat/datos-prueba", "¿Cuál es el APN de Claro para el comunicador?", "Comunicadores");
    assert.deepStrictEqual(rel.map((d) => d.titulo), ["APN Claro comunicadores"]);
    assert.strictEqual((await datosEquipoRelacionados({}, "sat/datos-prueba", "como se programa", "x")).length, 0, "si no tiene que ver, no se manda nada");
    // Corregirlo resuelve el aviso
    await llamar({ accion: "editar", id, titulo: "APN Claro comunicadores", contenido: "igprs.claro.com.ar (nuevo)", categoria: "APN y líneas" }, juan);
    const d = archivo.find((x) => x.id === id);
    assert.strictEqual(d.reportes.length, 0);
    assert.strictEqual(d.reportes_resueltos[0].resuelto_por, "Juan");
  } finally {
    global.fetch = fetchViejo;
    if (viejo) require.cache[rutaPush] = viejo; else delete require.cache[rutaPush];
  }
});

test("Vista 3D: el análisis ve qué parte de la casa cubre cada sensor, qué abertura que da afuera no tiene sensor, y arma el recorrido del intruso", () => {
  const vm = require("vm");
  const ctx = { window: {}, document: { createElement: () => ({ getContext: () => null }) }, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, "croquis-utils.js"), "utf8") + "\n;" + fs.readFileSync(path.join(raiz, "croquis-3d.js"), "utf8") + "\n;this.C3=Croquis3D;", ctx);
  const casa = [
    { id: "w1", t: "linea", x1: 0, y1: 0, x2: 400, y2: 0 }, { id: "w2", t: "linea", x1: 400, y1: 0, x2: 400, y2: 300 },
    { id: "w3", t: "linea", x1: 400, y1: 300, x2: 0, y2: 300 }, { id: "w4", t: "linea", x1: 0, y1: 300, x2: 0, y2: 0 },
    { id: "w5", t: "linea", x1: 200, y1: 0, x2: 200, y2: 300 },
    { id: "pi", t: "simbolo", tipo: "puerta", x: 200, y: 150, rot: 90, esc: 1 },
    { id: "pe", t: "simbolo", tipo: "puerta", x: 100, y: 300, rot: 0, esc: 1 },
    { id: "ve", t: "simbolo", tipo: "ventana", x: 300, y: 0, rot: 0, esc: 1 },
    { id: "ir", t: "simbolo", tipo: "infrarrojo", x: 0, y: 0, rot: 180, esc: 1 },
  ];
  const a = ctx.C3.analizar(casa);
  assert.ok(a.porcentaje >= 45 && a.porcentaje <= 62, "cubre el ambiente izquierdo (y un poco por la puerta): " + a.porcentaje);
  const ext = a.aberturas.filter((x) => x.exterior).map((x) => [x.el.id, x.protegida]);
  assert.deepStrictEqual(ext.sort(), [["pe", true], ["ve", false]], "la puerta interna no cuenta; la ventana del ambiente vacío no tiene sensor");
  assert.deepStrictEqual(a.aberturasSinProteger.map((x) => x.el.id), ["ve"]);
  const r = a.recorrido();
  assert.strictEqual(r.entrada.el.id, "ve", "entra por lo que no tiene sensor");
  assert.ok(r.puntos.some((p) => p[0] < 5), "pasa al otro ambiente por la puerta");
  assert.ok(r.puntos.every((p, i) => i < 2 || (p[0] > 0 && p[0] < 10 && p[1] > 0 && p[1] < 7.5)), "adentro de la casa");
  // Con un magnético en la ventana queda protegida; un infrarrojo del otro lado de la pared no la ve
  const b = ctx.C3.analizar([...casa, { id: "mg", t: "simbolo", tipo: "magnetico", x: 300, y: 8, rot: 0, esc: 1 }]);
  assert.deepStrictEqual(b.aberturasSinProteger.map((x) => x.el.id), []);
  const c = ctx.C3.analizar([...casa, { id: "ir2", t: "simbolo", tipo: "infrarrojo", x: 400, y: 0, rot: 270, esc: 1 }]);
  assert.strictEqual(c.porcentaje, 100);
  assert.strictEqual(ctx.C3.analizar([{ id: "x", t: "simbolo", tipo: "central", x: 0, y: 0 }]), null, "sin paredes no hay análisis");
});

test("Croquis ya convertido: las escaleras que quedaron como líneas se reconocen y pasan a escalera (U y recta)", () => {
  const vm = require("vm");
  const ctx = { window: {}, document: { createElement: () => ({ getContext: () => null }) }, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, "croquis-utils.js"), "utf8") + "\n;this.rec=croquisReconocerEscaleras;", ctx);
  let n = 0;
  const L = (x1, y1, x2, y2) => ({ id: "l" + n++, t: "linea", x1, y1, x2, y2 });
  const casa = [L(0, 0, 600, 0), L(600, 0, 600, 400), L(600, 400, 0, 400), L(0, 400, 0, 0)];
  // U: dos tramos de 40 de ancho (x 520..600), escalones cada 11 de y=170 a 270, descanso arriba (y 130..170) con la X
  const u = [L(520, 130, 600, 130), L(520, 130, 520, 280), L(520, 280, 600, 280), L(560, 170, 560, 280), L(520, 170, 600, 170), L(520, 130, 600, 170), L(600, 130, 520, 170)];
  for (let i = 1; i <= 9; i++) { const y = 170 + i * 11; u.push(L(520, y, 560, y), L(560, y, 600, y)); }
  // Recta horizontal: escalones verticales cada 11, de 40 de largo
  const r = [L(40, 300, 190, 300), L(40, 340, 190, 340)];
  for (let i = 0; i < 12; i++) r.push(L(50 + i * 11, 300, 50 + i * 11, 340));
  const texto = { id: "t", t: "texto", x: 560, y: 250, texto: "SUBE" };
  const res = ctx.rec([...casa, ...u, ...r, texto, { id: "s", t: "simbolo", tipo: "infrarrojo", x: 10, y: 10 }]);
  assert.strictEqual(res.escaleras, 2);
  const tipos = res.elementos.filter((e) => /^escalera/.test(e.tipo)).map((e) => e.tipo).sort();
  assert.deepStrictEqual(tipos, ["escalera_recta", "escalera_u"]);
  const eu = res.elementos.find((e) => e.tipo === "escalera_u");
  assert.strictEqual(eu.rot, 0, "descanso hacia arriba");
  assert.ok(Math.abs(eu.esc - 80 / 92) < 0.05);
  assert.deepStrictEqual(res.elementos.filter((e) => e.t === "linea").map((e) => e.id).sort(), casa.map((e) => e.id).sort(), "quedan solo las paredes de la casa");
  assert.ok(!res.elementos.some((e) => e.id === "t"), "el SUBE de adentro se va");
  assert.ok(res.elementos.some((e) => e.id === "s"), "el sensor queda");
  assert.strictEqual(ctx.rec(casa).escaleras, 0, "una casa sin escalera no cambia");
});

test("Seguimiento de propuestas 3D: a quién llamar, y solo quien la mandó (o la oficina) la marca ganada/perdida", async () => {
  const { seguimientoPropuesta } = require(path.join(raiz, "lib/propuestas3d.js"));
  const ahora = Date.parse("2026-11-10T12:00:00Z"), dia = 864e5, iso = (ms) => new Date(ms).toISOString();
  assert.strictEqual(seguimientoPropuesta({ fecha: iso(ahora - dia), aperturas: 3, ultima: iso(ahora - 3600e3), llamadas: [{ telefono: "11 1" }] }, ahora).regla, "llamar");
  assert.strictEqual(seguimientoPropuesta({ fecha: iso(ahora - dia), aperturas: 3, ultima: iso(ahora - 3600e3), llamadas: [{ telefono: "11 1" }], llamada_atendida: true }, ahora).regla, "caliente");
  assert.strictEqual(seguimientoPropuesta({ fecha: iso(ahora - 3 * dia), aperturas: 0 }, ahora).regla, "sin_abrir");
  assert.strictEqual(seguimientoPropuesta({ fecha: iso(ahora - dia), aperturas: 0 }, ahora), null, "recién mandada: todavía no");
  assert.strictEqual(seguimientoPropuesta({ fecha: iso(ahora - 9 * dia), aperturas: 1, ultima: iso(ahora - 6 * dia) }, ahora).regla, "enfriando");
  assert.strictEqual(seguimientoPropuesta({ fecha: iso(ahora - 3 * dia), aperturas: 0, estado: "ganada" }, ahora), null, "cerrada: nada");

  const fetchViejo = global.fetch;
  const archivos = { "vistas3d/indice.json": [{ id: "a".repeat(16), por: "Luis", cliente: "Vilches", fecha: iso(Date.now() - 3 * dia), aperturas: 0 }, { id: "b".repeat(16), por: "Ana", cliente: "Pérez", fecha: iso(Date.now()), aperturas: 0 }] };
  global.fetch = async (url, op = {}) => {
    const ruta = (String(url).match(/contents\/([^?]+)/) || [])[1];
    const r = ruta && decodeURIComponent(ruta);
    if (r === "tecnicos.json") return new Response(JSON.stringify({ content: Buffer.from("[]").toString("base64"), encoding: "base64", sha: "t" }));
    if (r) {
      if (op.method === "PUT") { archivos[r] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString("utf-8")); return new Response("{}", { status: 200 }); }
      if (!archivos[r]) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(archivos[r])).toString("base64") }));
    }
    return new Response("[]");
  };
  try {
    const luis = crearSesion({ nombre: "Luis", rol: "tecnico" }), admin = crearSesion({ nombre: "Oficina", rol: "admin" });
    let r = resFalso();
    await datos(pedido("GET", { coleccion: "croquis", vistas3d: "1", todas: "1" }, null, luis), r);
    assert.deepStrictEqual(r.cuerpo.map((v) => v.cliente), ["Vilches"], "cada uno ve las suyas");
    assert.strictEqual(r.cuerpo[0].seguimiento.regla, "sin_abrir");
    r = resFalso();
    await datos(pedido("GET", { coleccion: "croquis", vistas3d: "1", todas: "1" }, null, admin), r);
    assert.strictEqual(r.cuerpo.length, 2, "la oficina ve todas");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "vista3d_estado", id: "b".repeat(16), estado: "ganada" }, luis), r);
    assert.strictEqual(r.statusCode, 403, "no es suya");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "vista3d_estado", id: "a".repeat(16), estado: "ganada" }, luis), r);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(archivos["vistas3d/indice.json"][0].estado, "ganada");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "vista3d_estado", id: "a".repeat(16), estado: "" }, luis), r);
    assert.ok(!archivos["vistas3d/indice.json"][0].estado, "reabierta");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "vista3d_estado", id: "a".repeat(16), estado: "regalada" }, luis), r);
    assert.strictEqual(r.statusCode, 400);
  } finally {
    global.fetch = fetchViejo;
  }
});

test("Tarjeta de contacto del asesor: cada uno edita la suya, la oficina la de cualquiera y la empresa; va en la vista 3D limpia (sin links peligrosos)", async () => {
  const { armarContacto, limpiarEmpresa } = require(path.join(raiz, "lib/tarjeta-contacto.js"));
  const e = limpiarEmpresa({ web: "javascript:alert(1)", instagram: "@sat.alarmas", facebook: "facebook.com/satalarmas", telefono: "abc" });
  assert.strictEqual(e.web, "", "nada de javascript:");
  assert.strictEqual(e.instagram, "https://instagram.com/sat.alarmas");
  assert.strictEqual(e.facebook, "https://facebook.com/satalarmas");
  assert.strictEqual(e.telefono, "");
  assert.strictEqual(armarContacto({ nombre: "Ana" }), null, "sin forma de contacto, no hay tarjeta");

  const fetchViejo = global.fetch;
  const archivos = {};
  global.fetch = async (url, op = {}) => {
    const ruta = (String(url).match(/contents\/([^?]+)/) || [])[1];
    const r = ruta && decodeURIComponent(ruta);
    if (r === "tecnicos.json") return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify([{ nombre: "Luis", permisos: {} }])).toString("base64"), encoding: "base64", sha: "t" }));
    if (r) {
      if (op.method === "PUT") { archivos[r] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString("utf-8")); return new Response("{}", { status: 200 }); }
      if (!archivos[r]) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(archivos[r])).toString("base64") }));
    }
    return new Response("[]");
  };
  try {
    const luis = crearSesion({ nombre: "Luis", rol: "tecnico" }), admin = crearSesion({ nombre: "Oficina", rol: "admin" });
    let r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "tarjeta_guardar", persona: "Luis", tarjeta: { nombre: "Luis Gómez", puesto: "Asesor comercial", telefono: "11 5555-1234" } }, luis), r);
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.cuerpo));
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "tarjeta_guardar", persona: "Ana", tarjeta: { nombre: "Ana" } }, luis), r);
    assert.strictEqual(r.statusCode, 403, "la de otro no");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "tarjeta_guardar", empresa: { nombre: "SAT" } }, luis), r);
    assert.strictEqual(r.statusCode, 403, "la empresa no (sin permiso de planos)");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "tarjeta_guardar", persona: "Ana", tarjeta: { nombre: "Ana Ruiz", puesto: "Ventas", email: "ana@sat.com" }, empresa: { nombre: "SAT Alarmas", horarios: "Lun a vie de 9 a 18", web: "sat365.com.ar", instagram: "@sat" } }, admin), r);
    assert.strictEqual(r.statusCode, 200);
    r = resFalso();
    await datos(pedido("GET", { coleccion: "croquis", tarjetas: "1" }, null, luis), r);
    assert.deepStrictEqual(Object.keys(r.cuerpo.personas).sort(), ["Ana", "Luis"]);
    assert.strictEqual(r.cuerpo.empresa.web, "https://sat365.com.ar");
    assert.strictEqual(r.cuerpo.yo, "Luis");
    // Se manda con la tarjeta: el cliente la ve
    const t = r.cuerpo;
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "compartir_3d", titulo: "Casa", paginas: [{ elementos: [{ id: "a", t: "linea", pts: [0, 0, 100, 0] }] }], contacto: { ...t.personas.Ana, empresa: { ...t.empresa, web: "javascript:x" } } }, luis), r);
    const id = r.cuerpo.id;
    r = resFalso();
    await datos(pedido("GET", { publico: "vista3d", id, contar: "0" }), r);
    assert.strictEqual(r.cuerpo.contacto.nombre, "Ana Ruiz");
    assert.strictEqual(r.cuerpo.contacto.empresa.horarios, "Lun a vie de 9 a 18");
    assert.strictEqual(r.cuerpo.contacto.empresa.web, "");
    assert.strictEqual(archivos["vistas3d/indice.json"][0].asesor, "Ana Ruiz");
  } finally {
    global.fetch = fetchViejo;
  }
});

test("PDF de arquitectura: paredes de doble línea pasan a una, puerta con arco, ventana de tres líneas y paso entre ambientes", () => {
  const vm = require("vm");
  const ctx = { window: {}, document: { createElement: () => ({ getContext: () => null }) }, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, "croquis-utils.js"), "utf8") + "\n;this.dv=croquisDesdeVectores;", ctx);
  // 1 m = 28 puntos; paredes de 20 cm (5,6 pt). Casa de 6 x 4 m, tabique al medio con un paso.
  const prims = [];
  const L = (x1, y1, x2, y2) => prims.push({ traza: true, rellena: false, dash: false, sub: [[[x1, y1], [x2, y2]]] });
  L(0, 0, 100, 0); L(140, 0, 168, 0); L(5.6, 5.6, 81.2, 5.6); L(86.8, 5.6, 100, 5.6); L(140, 5.6, 162.4, 5.6);
  L(0, 0, 0, 112); L(5.6, 5.6, 5.6, 106.4); L(168, 0, 168, 112); L(162.4, 5.6, 162.4, 106.4);
  L(0, 112, 30, 112); L(52.4, 112, 168, 112); L(5.6, 106.4, 30, 106.4); L(52.4, 106.4, 81.2, 106.4); L(86.8, 106.4, 162.4, 106.4);
  L(81.2, 5.6, 81.2, 40); L(86.8, 5.6, 86.8, 40); L(81.2, 62.4, 81.2, 106.4); L(86.8, 62.4, 86.8, 106.4);
  L(81.2, 40, 86.8, 40); L(81.2, 62.4, 86.8, 62.4); // jambas del paso
  L(30, 106.4, 30, 112); L(52.4, 106.4, 52.4, 112); // jambas de la puerta
  L(100, 0, 140, 0); L(100, 2.8, 140, 2.8); L(100, 5.6, 140, 5.6); L(100, 0, 100, 5.6); L(140, 0, 140, 5.6); // ventana
  // Puerta: bisagra (30,106.4), cerrada hasta (52.4,106.4), abre hacia adentro: arco + hoja.
  const r = 22.4, kk = 0.5523 * r, A = [52.4, 106.4], B = [30, 84], c1 = [52.4, 106.4 - kk], c2 = [30 + kk, 84];
  const arco = [A, B]; arco.curvo = true; arco.medios = [[0.125 * A[0] + 0.375 * c1[0] + 0.375 * c2[0] + 0.125 * B[0], 0.125 * A[1] + 0.375 * c1[1] + 0.375 * c2[1] + 0.125 * B[1]]];
  prims.push({ traza: true, rellena: false, dash: false, sub: [arco] });
  L(30, 106.4, 30, 84); // hoja
  const r1 = ctx.dv({ prims, textos: [], ancho: 300, alto: 200 });
  const els = r1.elementos;
  const tipos = (t) => els.filter((e) => e.tipo === t);
  assert.strictEqual(tipos("puerta").length, 1, "la puerta con arco");
  assert.strictEqual(tipos("ventana").length, 1, "la ventana de tres líneas");
  assert.strictEqual(tipos("paso").length, 1, "el paso del tabique");
  assert.ok(Math.abs(tipos("ventana")[0].esc * 44 - 40 * r1.escala) < 3, "ancho de la ventana");
  const paredes = els.filter((e) => e.t === "linea");
  // Una línea por pared: 4 del contorno + 1 del tabique (los vanos con abertura quedan cubiertos).
  assert.ok(paredes.length <= 6, "paredes: " + JSON.stringify(paredes.map((e) => [e.x1, e.y1, e.x2, e.y2])));
  const k = r1.escala;
  const sup = paredes.filter((e) => e.y1 === e.y2 && Math.abs(e.x2 - e.x1) > 100 * k);
  assert.ok(sup.length >= 2, "arriba y abajo, de punta a punta");
  assert.strictEqual(r1.ventanas, 1); assert.strictEqual(r1.pasos, 1);
});

test("Vista 3D: los muebles altos (placard, heladera) tapan parte de lo que ve el sensor; los bajos (sillón) no; galería y balcón no son paredes", () => {
  const vm = require("vm");
  const ctx = { window: {}, document: { createElement: () => ({ getContext: () => null }) }, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, "croquis-utils.js"), "utf8") + "\n;" + fs.readFileSync(path.join(raiz, "croquis-3d.js"), "utf8") + "\n;this.C3=Croquis3D;", ctx);
  const casa = [
    { id: "w1", t: "linea", x1: 0, y1: 0, x2: 200, y2: 0 }, { id: "w2", t: "linea", x1: 200, y1: 0, x2: 200, y2: 300 },
    { id: "w3", t: "linea", x1: 200, y1: 300, x2: 0, y2: 300 }, { id: "w4", t: "linea", x1: 0, y1: 300, x2: 0, y2: 0 },
    { id: "ir", t: "simbolo", tipo: "infrarrojo", x: 0, y: 0, rot: 180, esc: 1 },
  ];
  const sin = ctx.C3.analizar(casa);
  assert.strictEqual(sin.porcentaje, 100);
  assert.ok(!sin.hayMuebles && sin.tapados.length === 0);
  const sillon = ctx.C3.analizar([...casa, { id: "so", t: "simbolo", tipo: "sillon", x: 100, y: 150, rot: 0, esc: 1 }]);
  assert.strictEqual(sillon.porcentaje, 100, "un sillón no tapa a una persona parada");
  const placard = ctx.C3.analizar([...casa, { id: "pl", t: "simbolo", tipo: "ropero", x: 100, y: 130, rot: 0, esc: 1 }]);
  assert.ok(placard.porcentaje < 100, "detrás del placard queda una sombra: " + placard.porcentaje);
  assert.strictEqual(placard.tapados[0].mueble.id, "pl");
  assert.strictEqual(placard.tapados[0].equipo.id, "ir");
  assert.ok(placard.tapados[0].m2 > 1);
  // El intruso escondido detrás del placard no se detecta; adelante sí.
  assert.strictEqual(placard.detecta([3.5, 4.4]).length, 0);
  assert.strictEqual(placard.detecta([1, 1]).length, 1);
  // Galería (semicubierta) y balcón al lado: no cierran ambientes ni cortan la vista.
  const conGaleria = ctx.C3.analizar([...casa, { id: "ga", t: "rect", x: 0, y: 300, w: 200, h: 120, cierre: "semi" }, { id: "ba", t: "rect", x: 200, y: 50, w: 40, h: 120, cierre: "balcon" }]);
  assert.strictEqual(conGaleria.porcentaje, 100);
});

test("Tapial (tipo de pared) y suelo de césped o piso: se dibujan, el tapial tapa la vista a la altura de una persona y los sectores al aire libre no son paredes", () => {
  const vm = require("vm");
  const ctx = { window: {}, document: { createElement: () => ({ getContext: () => null }) }, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, "croquis-utils.js"), "utf8") + "\n;" + fs.readFileSync(path.join(raiz, "croquis-3d.js"), "utf8") + "\n;this.C3=Croquis3D;this.svg=croquisSvgElemento;this.cerco=croquisEsCerco;", ctx);
  const tapial = { id: "tp", t: "linea", x1: 0, y1: 150, x2: 150, y2: 150, cerco: "tapial" };
  assert.ok(ctx.cerco(tapial));
  assert.match(ctx.svg(tapial), /stroke-width="10"/);
  assert.match(ctx.svg({ id: "j", t: "rect", x: 0, y: 0, w: 200, h: 120, suelo: "cesped", cierre: "abierto" }), /#8FCB7E/);
  assert.match(ctx.svg({ id: "p", t: "rect", x: 0, y: 0, w: 200, h: 120, suelo: "piso" }), /#E3DDD2/);
  const casa = [
    { id: "w1", t: "linea", x1: 0, y1: 0, x2: 200, y2: 0 }, { id: "w2", t: "linea", x1: 200, y1: 0, x2: 200, y2: 300 },
    { id: "w3", t: "linea", x1: 200, y1: 300, x2: 0, y2: 300 }, { id: "w4", t: "linea", x1: 0, y1: 300, x2: 0, y2: 0 },
    { id: "ir", t: "simbolo", tipo: "infrarrojo", x: 0, y: 0, rot: 180, esc: 1 },
  ];
  const a = ctx.C3.analizar([...casa, tapial]);
  assert.strictEqual(a.detecta([1, 6.5]).length, 0, "detrás del tapial no lo ve");
  assert.strictEqual(a.detecta([1, 2]).length, 1);
  assert.strictEqual(a.tapados[0].mueble.id, "tp");
  const b = ctx.C3.analizar([...casa, { id: "ja", t: "rect", x: 20, y: 20, w: 160, h: 260, cierre: "abierto", suelo: "cesped" }]);
  assert.strictEqual(b.porcentaje, 100, "un sector al aire libre dibujado adentro no corta la vista");
});

test("Exterior: avisos para el técnico (plantas, pileta, reja hacia la vereda, sol de frente con el Norte, energizador) y el intruso entra por el portón del cerco", () => {
  const vm = require("vm");
  const ctx = { window: {}, document: { createElement: () => ({ getContext: () => null }) }, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, "croquis-utils.js"), "utf8") + "\n;" + fs.readFileSync(path.join(raiz, "croquis-3d.js"), "utf8") + "\n;this.C3=Croquis3D;this.sol=croquis3dSol;this.alto=croquisAltoCerco;", ctx);
  // Norte arriba: el este a la derecha, la mañana viene del este (un poco al norte).
  const s = ctx.sol({ rot: 0 });
  assert.deepStrictEqual(Array.from(s.este, (v) => Math.round(v) + 0), [1, 0]);
  assert.ok(s.manana[0] > 0.9 && s.manana[1] < 0, "mañana: este, un poco al norte");
  assert.ok(s.tarde[0] < -0.9);
  const s90 = ctx.sol({ rot: 90 }); // el norte a la derecha
  assert.deepStrictEqual(Array.from(s90.este, (v) => Math.round(v) + 0), [0, 1]);
  assert.strictEqual(ctx.alto({ t: "linea", cerco: "tapial", alto: 2.2 }).tapial, 2.2);
  assert.strictEqual(ctx.alto({ t: "linea", cerco: "reja_tapial" }).tapial, 0.6);
  const casa = [
    { id: "w1", t: "linea", x1: 0, y1: 0, x2: 400, y2: 0 }, { id: "w2", t: "linea", x1: 400, y1: 0, x2: 400, y2: 300 },
    { id: "w3", t: "linea", x1: 400, y1: 300, x2: 0, y2: 300 }, { id: "w4", t: "linea", x1: 0, y1: 300, x2: 0, y2: 0 },
    { id: "pe", t: "simbolo", tipo: "puerta", x: 100, y: 300, rot: 0, esc: 1 },
    { id: "ir", t: "simbolo", tipo: "infrarrojo", x: 0, y: 0, rot: 180, esc: 1 },
    { id: "pi", t: "rect", x: 220, y: 380, w: 140, h: 80, cierre: "abierto", suelo: "pileta" },
    { id: "t1", t: "linea", x1: 0, y1: 300, x2: 0, y2: 600, cerco: "tapial", electrico: true },
    { id: "rj", t: "linea", x1: 0, y1: 600, x2: 400, y2: 600, cerco: "reja" },
    { id: "po", t: "simbolo", tipo: "porton_batiente", x: 300, y: 600, rot: 0, esc: 1 },
    { id: "ab", t: "simbolo", tipo: "arbusto", x: 370, y: 330, rot: 0, esc: 1 },
    { id: "ix", t: "simbolo", tipo: "infrarrojo_ext", x: 395, y: 305, rot: 270, esc: 1 },
    { id: "ca", t: "simbolo", tipo: "camara_ip", x: 20, y: 310, rot: 95, esc: 1 },
  ];
  const sinNorte = ctx.C3.analizar(casa);
  const tipos = (an, id) => Array.from(an.avisos.filter((a) => (a.equipo ? a.equipo.id : null) === id).map((a) => a.tipo)).sort();
  assert.deepStrictEqual(tipos(sinNorte, "ix"), ["agua", "plantas", "vereda"]);
  assert.deepStrictEqual(tipos(sinNorte, null), ["energizador", "norte"]);
  assert.deepStrictEqual(tipos(sinNorte, "ir"), [], "el de adentro no lleva avisos de afuera");
  const conNorte = ctx.C3.analizar([...casa, { id: "no", t: "simbolo", tipo: "norte", x: 500, y: 0, rot: 0 }, { id: "en", t: "simbolo", tipo: "energizador", x: 10, y: 10 }]);
  assert.deepStrictEqual(tipos(conNorte, "ca"), ["sol"], "la cámara mira al este: contraluz a la mañana");
  assert.strictEqual(conNorte.avisos.find((a) => a.tipo === "sol").momento, "manana");
  assert.deepStrictEqual(tipos(conNorte, null), []);
  // Con el norte girado (el este para abajo), la misma cámara ya no tiene el sol de frente
  const girado = ctx.C3.analizar([...casa, { id: "no", t: "simbolo", tipo: "norte", x: 500, y: 0, rot: 270 }]);
  assert.ok(!tipos(girado, "ca").includes("sol") || girado.avisos.find((a) => a.equipo && a.equipo.id === "ca").momento !== "manana");
  // El intruso entra por el portón (desde la calle) y después va a la casa
  const r = sinNorte.recorrido();
  assert.ok(r.porton && r.porton.el.id === "po");
  assert.ok(r.puntos[0][1] > 15, "arranca del lado de la calle: " + r.puntos[0]);
  // La reja no tapa; el tapial sí: el exterior detecta en el jardín
  assert.ok(sinNorte.detecta([8, 10]).some((e) => e.id === "ix"));
});

test("Cámaras (identifica/reconoce/detecta según lente y MP), por dónde entra el intruso (peor caso, tapial eléctrico) y señal inalámbrica del hub", () => {
  const vm = require("vm");
  const ctx = { window: {}, document: { createElement: () => ({ getContext: () => null }) }, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, "croquis-utils.js"), "utf8") + "\n;" + fs.readFileSync(path.join(raiz, "croquis-3d.js"), "utf8") + "\n;this.C3=Croquis3D;this.dori=croquisCamaraDori;", ctx);
  const d = ctx.dori({ tipo: "camara_ip" });
  assert.strictEqual(d.mp, 2); assert.strictEqual(d.lente, 2.8);
  assert.ok(d.identifica > 2.5 && d.identifica < 4, "2 MP 2,8 mm: identifica ~3 m: " + d.identifica);
  assert.ok(Math.abs(d.reconoce - d.identifica * 2) < 0.2);
  const tele = ctx.dori({ tipo: "camara_ip", mp: 4, lente: 6 });
  assert.ok(tele.identifica > d.identifica * 2.5, "4 MP con 6 mm identifica mucho más lejos: " + tele.identifica);
  const casa = [
    { id: "w1", t: "linea", x1: 0, y1: 0, x2: 400, y2: 0 }, { id: "w2", t: "linea", x1: 400, y1: 0, x2: 400, y2: 300 },
    { id: "w3", t: "linea", x1: 400, y1: 300, x2: 0, y2: 300 }, { id: "w4", t: "linea", x1: 0, y1: 300, x2: 0, y2: 0 },
    { id: "pe", t: "simbolo", tipo: "puerta", x: 100, y: 300, rot: 0, esc: 1 },
    { id: "mg", t: "simbolo", tipo: "magnetico", x: 110, y: 294, rot: 0, esc: 1 },
    { id: "t1", t: "linea", x1: 0, y1: 300, x2: 0, y2: 600, cerco: "tapial", electrico: true },
    { id: "rj", t: "linea", x1: 0, y1: 600, x2: 400, y2: 600, cerco: "reja" },
    { id: "po", t: "simbolo", tipo: "porton_batiente", x: 300, y: 600, rot: 0, esc: 1 },
    { id: "pi", t: "rect", x: 220, y: 380, w: 140, h: 80, cierre: "abierto", suelo: "pileta" },
    { id: "ix", t: "simbolo", tipo: "infrarrojo_ext", x: 395, y: 305, rot: 270, esc: 1 },
  ];
  const a = ctx.C3.analizar(casa);
  const textos = Array.from(a.opciones(), (o) => o.texto);
  assert.ok(textos.includes("El portón del frente") && textos.some((t) => /Saltando el tapial \(eléctrico\)/.test(t)) && textos.some((t) => /Saltando la reja/.test(t)), textos.join(" | "));
  const tapial = a.opciones().find((o) => /tapial/.test(o.texto));
  const rt = a.recorrido(tapial.op);
  assert.ok(rt.salto && rt.salto.electrico);
  const dT = a.evaluar(rt);
  assert.ok(dT != null && dT < 3, "el cerco eléctrico lo detecta al saltar: " + dT);
  const peor = a.peorCaso();
  const todas = Array.from(a.opciones(), (o) => { const v = a.evaluar(a.recorrido(o.op)); return v == null ? Infinity : v; });
  assert.ok(peor && (peor.distancia == null ? Infinity : peor.distancia) === Math.max(...todas), "el peor caso es el que más lejos llega sin que lo detecten");
  // Achicar el alcance arregla el aviso de la pileta
  assert.ok(a.avisos.some((x) => x.tipo === "agua"));
  const b = ctx.C3.analizar(casa.map((e) => (e.id === "ix" ? { ...e, alcReal: 1.5 } : e)));
  assert.ok(!b.avisos.some((x) => x.tipo === "agua"));
  // Señal: hub en una punta, un magnético inalámbrico lejos con muchas paredes
  const larga = [{ id: "h1", t: "linea", x1: 0, y1: 0, x2: 2000, y2: 0 }, { id: "h2", t: "linea", x1: 0, y1: 200, x2: 2000, y2: 200 }, { id: "h3", t: "linea", x1: 0, y1: 0, x2: 0, y2: 200 }, { id: "h4", t: "linea", x1: 2000, y1: 0, x2: 2000, y2: 200 }];
  for (let x = 300; x < 2000; x += 300) larga.push({ id: "d" + x, t: "linea", x1: x, y1: 0, x2: x, y2: 200 });
  const conHub = [...larga, { id: "hub", t: "simbolo", tipo: "hub", x: 20, y: 100 }, { id: "mi", t: "simbolo", tipo: "magnetico", x: 1980, y: 100, inal: true }];
  const s1 = ctx.C3.analizar(conHub);
  const av = s1.avisos.find((x) => x.tipo === "senal");
  assert.ok(av && av.equipo.id === "mi", "lejos y con 6 paredes: señal débil");
  assert.strictEqual(Array.from(s1.senal)[0].paredes, 6);
  const s2 = ctx.C3.analizar([...conHub, { id: "rep", t: "simbolo", tipo: "repetidor", x: 1000, y: 100 }]);
  assert.ok(!s2.avisos.some((x) => x.tipo === "senal"), "con un repetidor en el medio, bien");
  assert.ok(ctx.C3.analizar([...larga, { id: "mi", t: "simbolo", tipo: "magnetico", x: 1980, y: 100, inal: true }]).avisos.some((x) => x.tipo === "hub"));
});

test("Croquis en el servicio técnico: un croquis sin instalación no le aparece a otro cliente, y solo se ve después de «Subir al cliente» (o con la instalación cerrada)", async () => {
  const fetchViejo = global.fetch;
  const archivos = {};
  global.fetch = async (url, op = {}) => {
    const u = String(url);
    const ruta = (u.match(/contents\/([^?]+)/) || [])[1];
    if (ruta === "tecnicos.json") return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify([{ nombre: "Seba", permisos: { croquis: true } }, { nombre: "Luis", permisos: {} }])).toString("base64"), encoding: "base64", sha: "t" }));
    if (ruta) {
      if (op.method === "PUT") { archivos[ruta] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString("utf-8")); return new Response("{}", { status: 200 }); }
      if (!archivos[ruta]) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(archivos[ruta])).toString("base64") }));
    }
    return new Response("[]");
  };
  try {
    const seba = crearSesion({ nombre: "Seba", rol: "tecnico" }), luis = crearSesion({ nombre: "Luis", rol: "tecnico" });
    const dibujo = { v: 1, elementos: [{ id: "a1", t: "rect", x: 0, y: 0, w: 100, h: 80 }] };
    let r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "guardar", titulo: "Casa Tell", cliente: "Tell", numero_cliente: "60", dibujo }, seba), r);
    const id = r.cuerpo.id;
    const ver = async (q, quien) => { const x = resFalso(); await datos(pedido("GET", { coleccion: "croquis", ...q }, null, quien), x); return x.cuerpo.map((c) => c.id); };
    assert.deepStrictEqual(await ver({ aprobados: "1" }, luis), [], "sin aprobar, no aparece en la búsqueda");
    // Otro cliente: no aparece (antes salía en todos)
    assert.deepStrictEqual(await ver({ numero_cliente: "99", servicio: "1" }, luis), []);
    assert.deepStrictEqual(await ver({ numero_cliente: "99", servicio: "1" }, seba), []);
    // Su cliente, pero sin aprobar: tampoco
    assert.deepStrictEqual(await ver({ numero_cliente: "60", servicio: "1" }, luis), []);
    assert.deepStrictEqual(await ver({ numero_cliente: "60" }, luis), [], "sin el permiso de croquis tampoco, aunque no diga servicio");
    assert.deepStrictEqual(await ver({ numero_cliente: "60" }, seba), [id], "quien dibuja sí lo ve (para comparar propuestas)");
    // Luis no lo puede subir (no es el autor); Seba sí
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "publicar", id }, luis), r);
    assert.strictEqual(r.statusCode, 403);
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "publicar", id }, seba), r);
    assert.strictEqual(r.statusCode, 200);
    assert.deepStrictEqual(await ver({ numero_cliente: "60", servicio: "1" }, luis), [id]);
    assert.deepStrictEqual(await ver({ numero_cliente: "99", servicio: "1" }, luis), []);
    assert.deepStrictEqual(await ver({ aprobados: "1" }, luis), [id], "aparece en la búsqueda de planos");
    assert.deepStrictEqual(await ver({ cliente: "tell", servicio: "1" }, luis), [id], "también por el nombre del cliente");
    // Guardarlo de nuevo no le saca la aprobación; quitarlo, sí
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "guardar", id, titulo: "Casa Tell", cliente: "Tell", numero_cliente: "60", dibujo }, seba), r);
    assert.deepStrictEqual(await ver({ numero_cliente: "60", servicio: "1" }, luis), [id]);
    r = resFalso();
    await datos(pedido("POST", { coleccion: "croquis" }, { accion: "publicar", id, publicar: false }, seba), r);
    assert.deepStrictEqual(await ver({ numero_cliente: "60", servicio: "1" }, luis), []);
  } finally {
    global.fetch = fetchViejo;
  }
});

test("Conciliación de SIMs: la oficina marca diferencias como resueltas o ignoradas y se pueden volver a mostrar", async () => {
  const fetchViejo = global.fetch;
  const archivos = {};
  global.fetch = async (url, op = {}) => {
    const ruta = (String(url).match(/contents\/([^?]+)/) || [])[1];
    if (ruta) {
      if (op.method === "PUT") { archivos[ruta] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString("utf-8")); return new Response("{}", { status: 200 }); }
      if (!archivos[ruta]) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(archivos[ruta])).toString("base64") }));
    }
    return new Response("[]");
  };
  try {
    const admin = crearSesion({ nombre: "Seba", rol: "admin" }), juan = crearSesion({ nombre: "Juan", rol: "tecnico" });
    let r = resFalso();
    await datos(pedido("POST", { coleccion: "sims_conciliacion" }, { accion: "marcar", estado: "ignorada", items: [{ numero: "341 555-0013", categoria: "noEnPlanilla", empresa: "Claro" }] }, juan), r);
    assert.strictEqual(r.statusCode, 403, "solo la oficina");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "sims_conciliacion" }, { accion: "marcar", estado: "ignorada", motivo: "Error interno", items: [{ numero: "341 555-0013", categoria: "noEnPlanilla", empresa: "Claro" }] }, admin), r);
    assert.strictEqual(r.statusCode, 200);
    r = resFalso();
    await datos(pedido("GET", { coleccion: "sims_conciliacion" }, null, admin), r);
    assert.deepStrictEqual(r.cuerpo.map((x) => [x.numero, x.categoria, x.empresa, x.estado, x.motivo, x.por]), [["3415550013", "noEnPlanilla", "Claro", "ignorada", "Error interno", "Seba"]]);
    r = resFalso();
    await datos(pedido("POST", { coleccion: "sims_conciliacion" }, { accion: "reactivar", items: [{ numero: "3415550013", categoria: "noEnPlanilla", empresa: "Claro" }] }, admin), r);
    assert.deepStrictEqual(archivos["sims-conciliacion-ignoradas.json"], []);
  } finally {
    global.fetch = fetchViejo;
  }
});

test("Copias de seguridad: solo la oficina; se baja en pedazos, sin claves, y se vuelve atrás de forma controlada", async () => {
  const fetchViejo = global.fetch;
  const archivos = { "croquis-index.json": [{ id: "a", titulo: "Casa" }], "tecnicos.json": [{ nombre: "Juan", password: "1234", permisos: {} }] };
  const pedidosBackend = [];
  const partesGrande = Array.from({ length: 30000 }, (_, i) => ({ id: "p" + i, cliente: "Cliente número " + i, tarea: "x".repeat(40) }));
  global.fetch = async (url, op = {}) => {
    const u = String(url), metodo = op.method || "GET";
    if (u.includes("git/trees/HEAD")) return new Response(JSON.stringify({ tree: [{ type: "blob", path: "croquis-index.json", size: 40 }, { type: "blob", path: "tecnicos.json", size: 60 }, { type: "blob", path: "fotos/a.jpg", size: 5000 }] }));
    if (u.includes("/commits?path=")) return new Response(JSON.stringify([{ sha: "b".repeat(40), commit: { message: "Croquis: guardó Casa", committer: { date: "2026-11-05T10:00:00Z" } } }, { sha: "a".repeat(40), commit: { message: "Croquis: primero", committer: { date: "2026-11-01T10:00:00Z" } } }]));
    const ruta = decodeURIComponent((u.match(/contents\/([^?]+)/) || [])[1] || "");
    if (ruta) {
      if (metodo === "PUT") { const b = JSON.parse(op.body); archivos[ruta] = JSON.parse(Buffer.from(b.content, "base64").toString("utf-8")); archivos["__msg_" + ruta] = b.message; return new Response("{}", { status: 200 }); }
      if (u.includes("?ref=")) return new Response(JSON.stringify([{ id: "a", titulo: "Versión vieja" }]));
      if (!(ruta in archivos)) return new Response("{}", { status: 404 });
      const raw = (op.headers || {}).Accept === "application/vnd.github.raw";
      return new Response(raw ? JSON.stringify(archivos[ruta]) : JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(archivos[ruta])).toString("base64") }));
    }
    if (u.startsWith("https://backend.prueba")) {
      pedidosBackend.push(metodo + " " + u.replace("https://backend.prueba", ""));
      if (u.endsWith("/api/partes")) return new Response(JSON.stringify(partesGrande));
      if (u.endsWith("/api/tecnicos")) return new Response(JSON.stringify([{ nombre: "Juan", password_hash: "pbkdf2$xx", permisos: "{}" }]));
      if (u.endsWith("/api/clientes") && metodo === "GET") return new Response(JSON.stringify([{ numero_cliente: "00000001", nombre: "Actual" }]));
      return new Response(JSON.stringify(metodo === "GET" ? [] : { ok: true }));
    }
    return new Response("{}");
  };
  try {
    const admin = crearSesion({ nombre: "Seba", rol: "admin" });
    const juan = crearSesion({ nombre: "Juan", rol: "tecnico" });
    let r = resFalso();
    await datos(pedido("GET", { coleccion: "backup", fuentes: "1" }, null, juan), r);
    assert.strictEqual(r.statusCode, 403, "un técnico no baja la base");
    r = resFalso();
    await datos(pedido("GET", { coleccion: "backup", fuentes: "1" }, null, admin), r);
    assert.deepStrictEqual(r.cuerpo.github.map((x) => x.path), ["croquis-index.json", "tecnicos.json"]);
    assert.deepStrictEqual(r.cuerpo.otros, { cantidad: 1, bytes: 5000 });
    assert.ok(r.cuerpo.d1.includes("partes") && r.cuerpo.app.includes("clientes"));
    // Partes grande: llega en pedazos que juntos son la tabla entera
    let texto = "", partes = 1;
    for (let i = 0; i < partes; i++) {
      r = resFalso();
      await datos(pedido("GET", { coleccion: "backup", fuente: "d1:partes", parte: String(i) }, null, admin), r);
      partes = r.cuerpo.partes;
      texto += r.cuerpo.texto;
    }
    assert.ok(partes > 1, "se parte en pedazos");
    assert.strictEqual(JSON.parse(texto).length, 30000);
    // Sin claves
    r = resFalso();
    await datos(pedido("GET", { coleccion: "backup", fuente: "d1:tecnicos" }, null, admin), r);
    assert.ok(!r.cuerpo.texto.includes("pbkdf2") && r.cuerpo.texto.includes("Juan"));
    r = resFalso();
    await datos(pedido("GET", { coleccion: "backup", fuente: "gh:tecnicos.json" }, null, admin), r);
    assert.ok(!r.cuerpo.texto.includes("1234"));
    r = resFalso();
    await datos(pedido("GET", { coleccion: "backup", fuente: "gh:../secreto.json" }, null, admin), r);
    assert.strictEqual(r.statusCode, 400);
    // Restaurar un archivo desde una copia y a una versión anterior
    r = resFalso();
    await datos(pedido("POST", { coleccion: "backup" }, { accion: "restaurar_archivo", path: "croquis-index.json", texto: JSON.stringify([{ id: "a", titulo: "De la copia" }]) }, admin), r);
    assert.ok(r.cuerpo.ok);
    assert.strictEqual(archivos["croquis-index.json"][0].titulo, "De la copia");
    assert.match(archivos["__msg_croquis-index.json"], /desde una copia de seguridad \(por Seba\)/);
    r = resFalso();
    await datos(pedido("POST", { coleccion: "backup" }, { accion: "restaurar_archivo", path: "croquis-index.json", ref: "a".repeat(40) }, admin), r);
    assert.strictEqual(archivos["croquis-index.json"][0].titulo, "Versión vieja");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "backup" }, { accion: "restaurar_archivo", path: "tecnicos.json", texto: "[]" }, admin), r);
    assert.strictEqual(r.statusCode, 400, "tecnicos.json no se pisa con una copia sin claves");
    r = resFalso();
    await datos(pedido("POST", { coleccion: "backup" }, { accion: "restaurar_archivo", path: "croquis-index.json", texto: "{roto" }, admin), r);
    assert.strictEqual(r.statusCode, 400);
    r = resFalso();
    await datos(pedido("GET", { coleccion: "backup", versiones: "croquis-index.json" }, null, admin), r);
    assert.strictEqual(r.cuerpo.length, 2);
    assert.strictEqual(r.cuerpo[1].mensaje, "Croquis: primero");
    // Listas: clientes se reemplaza exacto; partes no se restaura desde acá
    r = resFalso();
    await datos(pedido("POST", { coleccion: "backup" }, { accion: "restaurar_coleccion", coleccion: "partes", data: [{ id: "x" }] }, admin), r);
    assert.strictEqual(r.statusCode, 400);
    r = resFalso();
    await datos(pedido("POST", { coleccion: "backup" }, { accion: "restaurar_coleccion", coleccion: "clientes", data: [] }, admin), r);
    assert.strictEqual(r.statusCode, 400, "una copia vacía no borra la lista");
    pedidosBackend.length = 0;
    r = resFalso();
    await datos(pedido("POST", { coleccion: "backup" }, { accion: "restaurar_coleccion", coleccion: "clientes", data: [{ numero_cliente: "00000002", nombre: "De la copia" }] }, admin), r);
    assert.ok(r.cuerpo.ok);
    assert.deepStrictEqual(pedidosBackend, ["GET /api/clientes", "DELETE /api/clientes", "POST /api/clientes"]);
    // Registro de copias
    r = resFalso();
    await datos(pedido("POST", { coleccion: "backup" }, { accion: "registrar_copia", archivo: "SAT-copia.zip", bytes: 1000, fuentes: 40, errores: [] }, admin), r);
    r = resFalso();
    await datos(pedido("GET", { coleccion: "backup", registro: "1" }, null, admin), r);
    assert.strictEqual(r.cuerpo[0].por, "Seba");
    assert.strictEqual(r.cuerpo[0].archivo, "SAT-copia.zip");
  } finally {
    global.fetch = fetchViejo;
  }
});

test("Código de abonado: letras (hexadecimal), ceros adelante y lo que Excel hace con «48E2»", () => {
  const u = require(path.join(raiz, "sims-utils.js"));
  assert.ok(u.mismoAbonado(4800, "48E2"), "Excel: 48E2 -> 4800");
  assert.ok(u.mismoAbonado("4,80E+03", "48E2"), "Excel muestra 4,80E+03");
  assert.ok(u.mismoAbonado(120000, "12E4"));
  assert.ok(u.mismoAbonado(40000, "40E3"));
  assert.ok(u.mismoAbonado(555, "0555"), "ceros adelante");
  assert.ok(u.mismoAbonado("48ed", "48ED"), "mayúsculas/minúsculas");
  assert.ok(!u.mismoAbonado("48ED", "48"), "antes se borraban las letras y 48ED quedaba como 48");
  assert.ok(!u.mismoAbonado("48ED", "48EA"));
  assert.ok(u.mismoAbonado(4800, "4800"), "un 4800 de verdad sigue siendo 4800");
  assert.deepStrictEqual(u.clavesAbonado("4,80E+03")[0], "48E2", "se muestra como el código");
  // Casos del listado real del sistema de Oficina
  assert.ok(u.mismoAbonado(20000000, "2E07"), "2E07 (hexadecimal) -> 2×10⁷");
  assert.strictEqual(u.clavesAbonado("2E+7")[0], "2E07", "la celda con formato científico se muestra como cuenta de 4");
  assert.ok(u.mismoAbonado(5e99, "5E99"), "números enormes sin perder precisión");
  assert.ok(u.mismoAbonado(27000000000, "27E9"));
  assert.deepStrictEqual(u.clavesAbonado(0), [], "0E05 -> 0 no se puede recuperar: se compara por nombre");
  assert.deepStrictEqual(u.clavesAbonado("310E/311C"), ["310E", "311C"], "dos cuentas en la misma celda");
  assert.deepStrictEqual(u.clavesAbonado("2665/6"), ["2665", "2666"]);
  assert.deepStrictEqual(u.clavesAbonado("404A/F"), ["404A", "404F"]);
  assert.ok(u.mismoAbonado("S3 1292", "S3-1292"));
});

test("Vencimientos: la oficina carga, renueva (corre la fecha si se repite) y borra; el cron avisa una sola vez al responsable y al técnico de la credencial", async () => {
  const fetchViejo = global.fetch;
  let archivo = [], estadoCron = {};
  const creds = [{ nombre: "Juan", vigencia: "2026-11-20" }, { nombre: "Luis", vigencia: "2027-06-01" }];
  global.fetch = async (url, op = {}) => {
    const u = String(url), metodo = op.method || "GET";
    if (u.includes("contents/vencimientos.json")) {
      if (metodo === "PUT") { archivo = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString()); return new Response("{}", { status: 200 }); }
      if ((op.headers || {}).Accept === "application/vnd.github.raw") return new Response(JSON.stringify(archivo));
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(archivo)).toString("base64") }));
    }
    if (u.endsWith("/api/credenciales")) return new Response(JSON.stringify(creds));
    return new Response("[]", { status: 200 });
  };
  const rutaPush = require.resolve(path.join(raiz, "lib/push-sender.js"));
  const viejo = require.cache[rutaPush];
  const avisos = [];
  require.cache[rutaPush] = { id: rutaPush, filename: rutaPush, loaded: true, exports: { enviarATodos: async () => ({}), enviarASeleccionados: async (n, a) => { avisos.push({ n, ...a }); return {}; } } };
  try {
    const admin = crearSesion({ nombre: "Seba", rol: "admin" }), juan = crearSesion({ nombre: "Juan", rol: "tecnico" });
    const llamar = async (body, t = admin) => { const res = resFalso(); await datos(pedido("POST", { coleccion: "vencimientos" }, body, t), res); return res; };
    assert.strictEqual((await llamar({ accion: "guardar", item: { nombre: "Matafuegos" } }, juan)).statusCode, 403, "un técnico no los toca");
    assert.strictEqual((await llamar({ accion: "guardar", item: { nombre: "Matafuegos" } })).statusCode, 400, "sin fecha no");
    await llamar({ accion: "guardar", item: { nombre: "Matafuegos depósito", categoria: "Matafuegos", fecha: "2026-11-15", aviso_dias: 15, repetir: 12, responsable: "Juan" } });
    await llamar({ accion: "guardar", item: { nombre: "Seguro de responsabilidad civil", categoria: "Seguros", fecha: "2027-05-01", aviso_dias: 30 } });
    assert.strictEqual(archivo.length, 2);
    // Cron: el matafuegos entra en aviso (faltan 9 días), la credencial de Juan también (14 días)
    const { chequearVencimientos } = require(path.join(raiz, "api/cron-diario.js"));
    const hoy = new Date(2026, 10, 6);
    let av = await chequearVencimientos({}, {}, estadoCron, hoy);
    assert.strictEqual(av.length, 2);
    assert.deepStrictEqual(avisos.map((a) => [a.n[0], a.titulo]), [["Juan", "📅 Matafuegos depósito"], ["Juan", "🪪 Tu credencial"]]);
    assert.match(avisos[0].cuerpo, /vence en 9 día\(s\) \(15\/11\/2026\)/);
    av = await chequearVencimientos({}, {}, estadoCron, hoy);
    assert.strictEqual(av.length, 0, "no se repite al día siguiente");
    av = await chequearVencimientos({}, {}, estadoCron, new Date(2026, 10, 16));
    assert.ok(av.some((x) => /Matafuegos/.test(x)), "cuando vence, avisa de nuevo");
    // Renovado: se repite cada 12 meses -> 15/11/2027, queda en el historial
    const id = archivo.find((x) => x.nombre === "Matafuegos depósito").id;
    await llamar({ accion: "renovar", id });
    const m = archivo.find((x) => x.id === id);
    assert.strictEqual(m.fecha, "2027-11-15");
    assert.deepStrictEqual([m.historial[0].antes, m.historial[0].nueva, m.historial[0].por], ["2026-11-15", "2027-11-15", "Seba"]);
    const idSeg = archivo.find((x) => x.categoria === "Seguros").id;
    assert.strictEqual((await llamar({ accion: "renovar", id: idSeg })).statusCode, 400, "si no se repite, hay que poner la fecha nueva");
    await llamar({ accion: "renovar", id: idSeg, fecha: "2028-05-01" });
    assert.strictEqual(archivo.find((x) => x.id === idSeg).fecha, "2028-05-01");
    await llamar({ accion: "borrar", id: idSeg });
    assert.strictEqual(archivo.length, 1);
  } finally {
    global.fetch = fetchViejo;
    if (viejo) require.cache[rutaPush] = viejo; else delete require.cache[rutaPush];
  }
});

test("Stock: de una caja con varios códigos (etiqueta SAT, modelo, N° de serie, QR) se usa el correcto", () => {
  const S = require(path.join(raiz, "stock-utils.js"));
  const cat = { articulos: { 20825: { c: "20825", d: "TECLADO", tipo: "unidad", formatos: [] }, 20208: { c: "20208", d: "SIRENA", tipo: "cantidad", alias: ["7798164500049"] } } };
  const caja = ["K10H-J9B", "GH120FF156", "https://www.paradox.com/manual"];
  assert.deepStrictEqual(S.elegirCodigoDelCuadro(["000208252779", ...caja], cat, {}, ""), { usar: "000208252779" }, "la etiqueta de SAT primero");
  assert.deepStrictEqual(S.elegirCodigoDelCuadro(caja, cat, {}, "20825"), { elegir: ["GH120FF156"], modelos: ["K10H-J9B"] }, "primera vez: confirma el N° (el código con guion es el modelo)");
  cat.articulos["20825"].alias = ["K10H-J9B"];
  assert.deepStrictEqual(S.elegirCodigoDelCuadro(caja, cat, {}, "20825"), { usar: "GH120FF156" }, "el modelo aprendido se ignora");
  cat.articulos["20825"].alias = []; cat.articulos["20825"].formatos = ["AA999AA999"];
  assert.deepStrictEqual(S.elegirCodigoDelCuadro(caja, cat, {}, "20825"), { usar: "GH120FF156" }, "o se reconoce por el formato");
  assert.deepStrictEqual(S.elegirCodigoDelCuadro(["https://x.com"], cat, {}, ""), { usar: null });
  assert.deepStrictEqual(S.elegirCodigoDelCuadro(["GH120FF156"], cat, { unidades: { GH120FF156: { c: "20825", u: "dep" } } }, ""), { usar: "GH120FF156" }, "un equipo ya registrado alcanza solo");
  assert.strictEqual(S.interpretarCodigo("HTTPS://WWW.PARADOX.COM", cat, {}, "").tipo, "ignorar");
  // Ajax: la etiqueta trae el EAN del producto (igual en todas las cajas) y el ID del equipo
  const cat2 = { articulos: { 23940: { c: "23940", d: "PIR AJAX", tipo: "unidad", alias: ["4823114000621"], formatos: ["H11"] } } };
  assert.deepStrictEqual(S.elegirCodigoDelCuadro(["4823114000621", "3082be85021"], cat2, {}, "23940", true), { usar: "3082BE85021" }, "el EAN de la caja que espera su N° no suma otra");
  assert.strictEqual(S.infoSerie("3082be85021"), "ID Ajax 3082BE");
  // Citymesh: etiqueta SAT del artículo 50160 (proveedor 2842); N° de serie = MAC hexadecimal
  assert.deepStrictEqual(S.leerEtiquetaSat("000501602842"), { codigo: "50160", proveedor: "2842" });
  assert.strictEqual(S.clasificarArticulo("CITYMESH - RGW 4G"), "unidad");
  assert.strictEqual(S.clasificarArticulo("ANTENA ADICIONAL PARA GPRS PCS250"), "cantidad");
  assert.strictEqual(S.formaCodigo("7A1D9CFC"), "H8");
  assert.ok(S.coincideFormato("A01B2C3D", ["H8"]) && S.coincideFormato("12345678", ["H8"]), "cualquier MAC de 8 caracteres es del mismo formato");
  const cat4 = { articulos: { 50160: { c: "50160", d: "CITYMESH - RGW 4G", tipo: "unidad", alias: ["CMCOM4GW"], formatos: ["H8"] } } };
  assert.deepStrictEqual(S.elegirCodigoDelCuadro(["CMCOM4GW", "7A1D9CFC"], cat4, {}, "50160", true), { usar: "7A1D9CFC" });
  // Paradox IP150: el Tracking es el N° de serie; Serial y MAC quedan guardados y también sirven para buscarlo
  const cat3 = { articulos: { 30150: { c: "30150", d: "IP150+ MQT", tipo: "unidad" } } };
  const m = S.moverStock({ ubic: {} }, [{ c: "30150", cant: 1, unidades: ["1GB000FFA9"], extras: { "1GB000FFA9": { serial: "72075101", mac: "00:19:ba:1d:3f:db" } } }], { de: "proveedor", a: "dep" }, cat3);
  assert.deepStrictEqual(m.saldos.unidades["1GB000FFA9"].datos, { serial: "72075101", mac: "00:19:BA:1D:3F:DB" });
  assert.deepStrictEqual([S.interpretarCodigo("72075101", cat3, m.saldos, "").tracking, S.interpretarCodigo("0019BA1D3FDB", cat3, m.saldos, "").tracking], ["1GB000FFA9", "1GB000FFA9"]);
  assert.strictEqual(S.infoSerie("1GB000FFA9", m.saldos.unidades["1GB000FFA9"]), "Serial 72075101 · MAC 00:19:BA:1D:3F:DB");
});

test("Stock: la marca sale de la descripción (o del modelo) y se resume por marca", () => {
  const S = require(path.join(raiz, "stock-utils.js"));
  const casos = {
    "TECLADO DE ICONOS K321 LCD MARCA PARADOX": "Paradox", "PIR PMD75 INALAMBRICO ANTI-MASCOTAS": "Paradox", "CONTROL REMOTO BIDIRECCIONAL REM25": "Paradox",
    "W-AJAX HUB 2 PLUS": "Ajax", "DOMO MARCA: HIKVISION MOD: DS-2AE7168-A": "Hikvision", "CAMARA HILOOK THC-T110-P": "Hikvision",
    "BATERIA 12 V 24 AH.  MARCA: VAPEX": "Vapex", "TP LINK DECO E4": "TP-Link", "GPRS GS2060 MARCA:DSC MODELO:GS2060": "DSC",
    "PLACA PORTERO SELENIA 2 HILOS MARCA NEXO": "Nexo", "CABLE TPR 3X1": "", "CAMARA COLOR  MARCA: TWD-ID004-W": "",
    "PIR PARA LUCES 180º MARCA ZURICH": "Zurich", "MONITOR 17 LED MARCA: CX WIDE": "Cx Wide",
  };
  Object.entries(casos).forEach(([d, m]) => assert.strictEqual(S.sugerirMarca(d), m, d));
  const r = S.resumenMarcas({ 1: { c: "1", marca: "Paradox", prov: "Sur" }, 2: { c: "2", marca: "PARADOX", prov: "" }, 3: { c: "3" } });
  assert.deepStrictEqual(r.map((x) => [x.marca, x.codigos.length, x.provs]), [["Paradox", 2, { Sur: 1, "": 1 }], ["", 1, { "": 1 }]]);
  assert.deepStrictEqual(S.leerListadoOficina([["Código", "Descripción", "Cómo se controla", "Marca"], ["20825", "TECLADO", "Equipo", "Paradox"]].map((f, i, t) => i ? Object.fromEntries(t[0].map((k, j) => [k, f[j]])) : null).filter(Boolean)).articulos[0].marca, "Paradox");
});

test("Stock: un texto libre («Batería 12V 7A») encuentra su artículo solo si hay uno claro", () => {
  const S = require(path.join(raiz, "stock-utils.js"));
  const cat = { articulos: { 1: { c: "1", d: "BATERIA 12V 7AH", tipo: "cantidad" }, 2: { c: "2", d: "BATERIA 12V 4AH", tipo: "cantidad" }, 3: { c: "3", d: "SIRENA MP100 INTERIOR MONOTONAL", tipo: "cantidad" }, 4: { c: "4", d: "SIRENA EXTERIOR BR150", tipo: "cantidad" }, 5: { c: "5", d: "CABLE 4 HILOS (ROLLO)", tipo: "cantidad" }, 6: { c: "6", d: "SIRENA SIM", tipo: "sim" } } };
  assert.strictEqual(S.buscarArticuloPorTexto(cat, "Batería 12V 7A"), "1");
  assert.strictEqual(S.buscarArticuloPorTexto(cat, "Cable 4 hilos"), "5");
  assert.strictEqual(S.buscarArticuloPorTexto(cat, "Sirena interior"), "3");
  assert.strictEqual(S.buscarArticuloPorTexto(cat, "bateria"), "", "dos baterías: no se adivina");
  assert.strictEqual(S.buscarArticuloPorTexto(cat, "bateria", ["2"]), "2", "salvo que el técnico tenga una sola de esas");
  assert.strictEqual(S.buscarArticuloPorTexto(cat, "Tornillos"), "");
  assert.strictEqual(S.buscarArticuloPorTexto(cat, "x"), "");
});

test("Stock: Paradox REM25 — la cámara nunca toma el código del modelo (REM25-7SG) como N° de serie", () => {
  const S = require(path.join(raiz, "stock-utils.js"));
  // Etiqueta real: Code 39 «REM25-7SG» (modelo, igual en todas las cajas) y «AI200158A2» (Tracking)
  const cat = { articulos: { 40250: { c: "40250", d: "CONTROL REMOTO 2 VIAS REM25 PARADOX", tipo: "unidad", formatos: [] } } };
  assert.strictEqual(S.pareceModelo("REM25-7SG", cat.articulos["40250"]), "seguro", "lleva el modelo de la descripción");
  assert.strictEqual(S.pareceModelo("AI200158A2", cat.articulos["40250"]), "");
  assert.deepStrictEqual(S.interpretarCodigo("REM25-7SG", cat, {}, "40250"), { tipo: "articulo", c: "40250", via: "modelo" });
  // Solo el modelo en el cuadro: no entra (y avisa sin pitido)
  assert.strictEqual(S.elegirCodigoDelCuadro(["REM25-7SG"], cat, {}, "40250", true).usar, null);
  assert.deepStrictEqual(S.elegirCodigoDelCuadro(["REM25-7SG", "AI200158A2"], cat, {}, "40250", true), { usar: "AI200158A2" }, "primera caja: junto al modelo, el otro es el Tracking");
  assert.deepStrictEqual(S.elegirCodigoDelCuadro(["AI200158A2"], cat, {}, "40250", true), { elegir: ["AI200158A2"] }, "primera caja, solo: que lo confirme");
  // Ya aprendido el formato del Tracking, aunque el modelo se haya colado en los formatos
  cat.articulos["40250"].formatos = [S.formaCodigo("AI200158A2"), S.formaCodigo("REM25-7SG")];
  assert.deepStrictEqual(S.elegirCodigoDelCuadro(["REM25-7SG", "AI200158A2"], cat, {}, "40250", true), { usar: "AI200158A2" });
  assert.strictEqual(S.elegirCodigoDelCuadro(["REM25-7SG"], cat, {}, "40250", true).usar, null);
  assert.deepStrictEqual(S.elegirCodigoDelCuadro(["AI200158B7"], cat, {}, "40250", true), { usar: "AI200158B7" });
  // Sin el modelo en la descripción: un código con guion tampoco entra solo
  const cat2 = { articulos: { 1: { c: "1", d: "CONTROL REMOTO", tipo: "unidad", formatos: ["AA999999A9"] } } };
  assert.strictEqual(S.elegirCodigoDelCuadro(["XX25-7SG"], cat2, {}, "1", true).usar, null);
  assert.ok(S.interpretarCodigo("XX25-7SG", cat2, {}, "1").aviso, "escrito a mano: pregunta");
  // No aprende la forma del modelo
  assert.deepStrictEqual(S.agregarFormato([], "REM25-7SG", cat.articulos["40250"]), []);
  // Si ya quedó registrado como N° de serie: sigue siendo el modelo y la Salud lo marca para quitarlo
  const sal = { ubic: { dep: { 40250: 2 } }, unidades: { "REM25-7SG": { c: "40250", u: "dep" } } };
  assert.strictEqual(S.interpretarCodigo("REM25-7SG", cat, sal, "").via, "modelo");
  const g = S.saludStock(cat, sal).find((x) => x.k === "serieModelo");
  assert.ok(g && g.items[0].serie === "REM25-7SG");
});

test("Stock: si el código de barras no se lee, el servidor lee los números de la foto (y descarta links y lo dudoso)", async () => {
  const fetchViejo = global.fetch, claveVieja = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "x";
  let pedidoIA = null;
  global.fetch = async (url, op = {}) => {
    const u = String(url);
    if (u.includes("generativelanguage")) {
      pedidoIA = JSON.parse(op.body);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ codigos: [{ texto: "GH120 FF156", rotulo: "Tracking" }, { texto: "https://paradox.com", rotulo: "" }, { texto: "000208252779" }, { texto: "AB" }] }) }] } }] }));
    }
    if (u.includes("contents/tecnicos.json")) return new Response(JSON.stringify({ sha: "s", content: Buffer.from(JSON.stringify([{ nombre: "Juan", permisos: {} }])).toString("base64") }));
    return new Response("{}", { status: 404 });
  };
  try {
    const juan = crearSesion({ nombre: "Juan", rol: "tecnico" });
    const r = resFalso();
    await datos(pedido("POST", { coleccion: "stock" }, { accion: "leer_codigo_foto", imagen: "data:image/jpeg;base64," + "A".repeat(2000) }, juan), r);
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.cuerpo));
    assert.deepStrictEqual(r.cuerpo.codigos, [{ texto: "GH120FF156", rotulo: "Tracking" }, { texto: "000208252779", rotulo: "" }]);
    assert.strictEqual(pedidoIA.contents[0].parts[0].inline_data.data.length, 2000);
  } finally { global.fetch = fetchViejo; if (claveVieja === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = claveVieja; }
});

test("Stock: los chips (Personal Jasper, Movistar M2M, Movistar Kite, Claro IoT…) se reconocen como SIM, y los equipos que nombran la empresa no", () => {
  const S = require(path.join(raiz, "stock-utils.js"));
  ["PERSONAL JASPER", "251062 PERSONAL JASPER", "Personal Japer", "773381 personal gasper", "Pesonal Jasper", "Jasper Personal", "JASPER", "904008 MOVISTAR M2M", "Movistar Kite", "Kite Movistar", "MOVISTAR", "MOVISTAR 133858", "Movistar Global SIM", "CLARO IOT", "PERSONAL"]
    .forEach((d) => assert.strictEqual(S.clasificarArticulo(d), "sim", d));
  ["GPRS PARADOX PCS250 DUAL SIM PARA COMUNICACIONES PARADOX", "COMUNICADOR GPRS PERSONAL", "TECLADO K10LH/V"].forEach((d) => assert.notStrictEqual(S.clasificarArticulo(d), "sim", d));
});

test("Stock: Melina entrega con escaneo, el técnico confirma «Recibí» (o con diferencias), devuelve y Melina recibe; cada uno solo puede lo suyo", async () => {
  const fetchViejo = global.fetch;
  const repo = {
    "tecnicos.json": [{ nombre: "Melina", permisos: { stock_responsable: true } }, { nombre: "Juan", permisos: {} }, { nombre: "Luis", permisos: {} }],
    "stock/catalogo.json": { articulos: { 20825: { c: "20825", d: "TECLADO K10LH/V", tipo: "unidad", formatos: [] }, 20208: { c: "20208", d: "SIRENA MP100", tipo: "cantidad" } } },
    "stock/saldos.json": { inicializado: "2026-11-01", ubic: { dep: { 20825: 3, 20208: 10 } }, unidades: {}, pedidos: {} },
  };
  global.fetch = async (url, op = {}) => {
    const u = String(url), metodo = op.method || "GET";
    const m = u.match(/contents\/([^?]+)/);
    if (m) {
      const ruta = decodeURIComponent(m[1]);
      if (metodo === "PUT") { repo[ruta] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString()); return new Response("{}", { status: 200 }); }
      if (!(ruta in repo)) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(repo[ruta])).toString("base64") }));
    }
    return new Response("[]");
  };
  try {
    const melina = crearSesion({ nombre: "Melina", rol: "tecnico" }), juan = crearSesion({ nombre: "Juan", rol: "tecnico" }), luis = crearSesion({ nombre: "Luis", rol: "tecnico" });
    const post = async (body, t) => { const r = resFalso(); await datos(pedido("POST", { coleccion: "stock" }, body, t), r); return r; };
    const get = async (q, t) => { const r = resFalso(); await datos(pedido("GET", { coleccion: "stock", ...q }, null, t), r); return r; };
    assert.strictEqual((await get({}, juan)).statusCode, 403, "un técnico no ve todo el stock");
    assert.strictEqual((await get({}, melina)).statusCode, 200, "la responsable sí");
    assert.strictEqual((await post({ accion: "mover", a: "tec:Juan", items: [{ c: "20208", cant: 1 }] }, juan)).statusCode, 403);
    assert.strictEqual((await post({ accion: "ajustar", c: "20208", ubic: "dep", cantidad: 1, motivo: "x" }, melina)).statusCode, 403, "ajustes y conciliación solo desde el admin");
    // Entrega a Juan: 2 teclados escaneados y 3 sirenas
    let r = await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20825", cant: 2, unidades: ["GH120FF156", "GH12100FD4"] }, { c: "20208", cant: 3 }] }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    const envio = r.cuerpo.envio;
    let sal = repo["stock/saldos.json"];
    assert.deepStrictEqual(sal.ubic.dep, { 20825: 1, 20208: 7 });
    assert.deepStrictEqual(sal.ubic["cam:Juan"], { 20825: 2, 20208: 3 }, "queda en camino hasta que confirma");
    assert.deepStrictEqual(repo["stock/catalogo.json"].articulos["20825"].formatos, ["AA999AA999", "AA99999AA9"], "aprende la forma de los N° de unidad");
    // Pedir más de lo que hay
    assert.strictEqual((await post({ accion: "mover", de: "dep", a: "veh:Kangoo", items: [{ c: "20208", cant: 50 }] }, melina)).statusCode, 409);
    // Lo que ve Juan
    let mio = (await get({ mio: 1 }, juan)).cuerpo;
    assert.strictEqual(mio.porRecibir.length, 1);
    assert.strictEqual(mio.articulos["20825"].d, "TECLADO K10LH/V");
    assert.strictEqual((await post({ accion: "confirmar_envio", id: envio.id }, luis)).statusCode, 403, "otro técnico no puede confirmar");
    // Juan recibe los 2 teclados pero solo 2 sirenas
    r = await post({ accion: "confirmar_envio", id: envio.id, items: [{ c: "20825", cant: 2 }, { c: "20208", cant: 2 }], motivo: "Faltó una sirena" }, juan);
    assert.strictEqual(r.cuerpo.envio.estado, "con_diferencias");
    sal = repo["stock/saldos.json"];
    assert.deepStrictEqual(sal.ubic["tec:Juan"], { 20825: 2, 20208: 2 });
    assert.strictEqual(sal.ubic.dep["20208"], 8, "la que faltó vuelve al depósito");
    assert.ok(!sal.ubic["cam:Juan"]);
    assert.strictEqual(sal.unidades["GH120FF156"].u, "tec:Juan");
    assert.strictEqual((await post({ accion: "confirmar_envio", id: envio.id }, juan)).statusCode, 409, "no se confirma dos veces");
    // Juan devuelve un teclado; Melina lo recibe
    assert.strictEqual((await post({ accion: "devolver", items: [{ c: "20825", cant: 5 }] }, juan)).statusCode, 409, "no puede devolver más de lo que tiene");
    r = await post({ accion: "devolver", items: [{ c: "20825", cant: 1, unidades: ["GH120FF156"] }], motivo: "Sobró" }, juan);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    sal = repo["stock/saldos.json"];
    assert.deepStrictEqual(sal.ubic["cam:dev:Juan"], { 20825: 1 });
    assert.strictEqual((await post({ accion: "confirmar_envio", id: r.cuerpo.envio.id }, juan)).statusCode, 403, "la devolución la confirma la responsable");
    r = await post({ accion: "confirmar_envio", id: r.cuerpo.envio.id }, melina);
    assert.strictEqual(r.cuerpo.envio.estado, "recibido");
    sal = repo["stock/saldos.json"];
    assert.deepStrictEqual([sal.ubic.dep["20825"], sal.ubic["tec:Juan"]["20825"], sal.unidades["GH120FF156"].u], [2, 1, "dep"]);
    // Directo a un vehículo / cliente (sin confirmación) y compra que llega
    r = await post({ accion: "mover", de: "dep", a: "veh:Kangoo", items: [{ c: "20208", cant: 2 }] }, melina);
    assert.ok(!r.cuerpo.envio);
    r = await post({ accion: "mover", de: "proveedor", a: "dep", items: [{ c: "20208", cant: 20 }], motivo: "Factura 123" }, melina);
    assert.strictEqual(repo["stock/saldos.json"].ubic.dep["20208"], 26);
    // Código de fabricante asociado
    r = await post({ accion: "alias", c: "20208", ean: "7798164500049" }, melina);
    assert.deepStrictEqual(repo["stock/catalogo.json"].articulos["20208"].alias, ["7798164500049"]);
    assert.strictEqual((await post({ accion: "alias", c: "20825", ean: "7798164500049" }, melina)).statusCode, 409);
    const mes = new Date().toISOString().slice(0, 7);
    const tipos = repo[`stock/movimientos-${mes}.json`].map((m) => m.tipo);
    assert.deepStrictEqual(tipos, ["entrega", "entrega", "recibido", "recibido", "diferencia", "devolucion", "recibido", "traspaso", "ingreso"]);
    // Inventario de N° de serie: sin mover cantidades, sin pasarse de lo que hay
    const antesDep = { ...repo["stock/saldos.json"].ubic.dep };
    r = await post({ accion: "registrar_unidades", ubic: "dep", op_id: "inv-1", items: [{ c: "20825", unidades: ["GH500AA001", "GH500AA002", "GH500AA003", "GH12100FD4"] }] }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    assert.strictEqual(r.cuerpo.registradas, 1, "en el depósito hay 2 teclados y uno ya tenía N° de serie");
    assert.deepStrictEqual(r.cuerpo.sobran.map((x) => x.t), ["GH500AA002", "GH500AA003"]);
    assert.deepStrictEqual(r.cuerpo.enOtroLado.map((x) => x.u), ["tec:Juan"]);
    assert.deepStrictEqual(repo["stock/saldos.json"].ubic.dep, antesDep, "no cambia cantidades");
    assert.strictEqual((await post({ accion: "registrar_unidades", ubic: "dep", items: [] }, juan)).statusCode, 403);
    // Lo mandado sin señal que se reintenta no se aplica dos veces
    const cuerpoSinSenal = { accion: "mover", de: "dep", a: "veh:Kangoo", items: [{ c: "20208", cant: 1 }], op_id: "melina-abc" };
    await post(cuerpoSinSenal, melina);
    const depSirenas = repo["stock/saldos.json"].ubic.dep["20208"];
    r = await post(cuerpoSinSenal, melina);
    assert.deepStrictEqual([r.cuerpo.duplicado, repo["stock/saldos.json"].ubic.dep["20208"]], [true, depSirenas]);
    assert.ok(repo[`stock/movimientos-${mes}.json`].some((m) => m.tipo === "inventario_series"));
    // Proveedores: el código de la etiqueta de SAT queda en el movimiento y en el N° de serie
    const admin = crearSesion({ nombre: "Seba", rol: "admin" });
    r = await post({ accion: "mover", de: "proveedor", a: "dep", items: [{ c: "20825", cant: 1, unidades: ["GH600AA001"], prov: "2779" }, { c: "20208", cant: 2, prov: "0815" }] }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    let cat = repo["stock/catalogo.json"];
    assert.deepStrictEqual(cat.provVistos, { 2779: 1, "0815": 1 }, "códigos vistos sin nombre");
    assert.strictEqual(repo["stock/saldos.json"].unidades.GH600AA001.prov, "2779");
    assert.strictEqual((await post({ accion: "proveedores", lista: [{ codigo: "2779", nombre: "Propiedad Protegida" }] }, melina)).statusCode, 403, "la tabla se carga desde el admin");
    r = await post({ accion: "proveedores", lista: [{ codigo: "2779", nombre: "Propiedad Protegida" }, { codigo: "x", nombre: "malo" }] }, admin);
    cat = repo["stock/catalogo.json"];
    assert.deepStrictEqual(cat.proveedores, { 2779: "Propiedad Protegida" });
    assert.strictEqual(cat.articulos["20825"].prov, "Propiedad Protegida", "el artículo visto con ese código toma el proveedor");
    assert.deepStrictEqual(cat.provVistos, { "0815": 1 });
    assert.strictEqual(r.cuerpo.completados, 1);
    // Datos de contacto (del Excel): se guardan, y si después se guarda sin datos se mantienen
    await post({ accion: "proveedores", lista: [{ codigo: "2779", nombre: "Propiedad Protegida", datos: { razon: "PP SRL", loc: "Rosario", tel: "341 555", cuit: "30-1-2", dir: "" } }, { codigo: "2842", nombre: "Deitres", datos: { loc: "Mar del Plata" } }] }, admin);
    cat = repo["stock/catalogo.json"];
    assert.deepStrictEqual(cat.proveedoresDatos, { 2779: { razon: "PP SRL", loc: "Rosario", tel: "341 555", cuit: "30-1-2" }, 2842: { loc: "Mar del Plata" } });
    await post({ accion: "proveedores", lista: [{ codigo: "2779", nombre: "Propiedad Protegida" }] }, admin);
    cat = repo["stock/catalogo.json"];
    assert.deepStrictEqual(cat.proveedoresDatos, { 2779: { razon: "PP SRL", loc: "Rosario", tel: "341 555", cuit: "30-1-2" } }, "se mantienen los datos; el que se quitó se va");
    await post({ accion: "proveedores", lista: [{ codigo: "2779", nombre: "Propiedad Protegida" }] }, admin);
    // Para Oficina: solo lo que cambia el stock de Oficina, y se marca para no pasarlo dos veces
    const movsMes = repo[`stock/movimientos-${mes}.json`];
    const S = require(path.join(raiz, "stock-utils.js"));
    const paraOficina = movsMes.map(S.movimientoParaOficina).filter(Boolean);
    assert.deepStrictEqual([...new Set(paraOficina.map((o) => o.operacion))].sort(), ["INGRESO"], "entregas a técnicos, vehículos y devoluciones no le cambian nada a Oficina");
    assert.deepStrictEqual(S.movimientoParaOficina({ id: "x", c: "1", cant: 2, de: "dep", a: "com:Pérez", presupuesto: "45" }), { id: "x", fecha: undefined, operacion: "SALIDA A CLIENTE EN COMODATO", c: "1", deposito: -2, comodato: 0, cliente: "Pérez", presupuesto: "45", series: "", prov: "", por: "", motivo: "" });
    assert.strictEqual(S.movimientoParaOficina({ id: "y", c: "1", cant: 1, de: "tec:Juan", a: "cli:Kiosco" }).operacion, "SALIDA A CLIENTE");
    assert.strictEqual(S.movimientoParaOficina({ id: "z", c: "1", cant: 1, de: "dep", a: "veh:Kangoo" }), null);
    const ingreso = movsMes.find((m) => m.tipo === "ingreso");
    r = await post({ accion: "marcar_oficina", mes, ids: [ingreso.id] }, admin);
    assert.strictEqual(r.cuerpo.marcados, 1);
    assert.ok(repo[`stock/movimientos-${mes}.json`].find((m) => m.id === ingreso.id).oficina);
    assert.strictEqual((await post({ accion: "marcar_oficina", mes, ids: [ingreso.id] }, melina)).statusCode, 403);
    // Cambiar el tipo de varios artículos juntos (solo admin)
    assert.strictEqual((await post({ accion: "configurar_varios", codigos: ["20208"], tipo: "unidad" }, melina)).statusCode, 403);
    r = await post({ accion: "configurar_varios", codigos: ["20208", "999"], tipo: "unidad" }, admin);
    assert.deepStrictEqual([r.cuerpo.cambiados, repo["stock/catalogo.json"].articulos["20208"].tipo], [1, "unidad"]);
    await post({ accion: "configurar_varios", codigos: ["20208"], tipo: "cantidad" }, admin);
    // Marcas: a cada artículo la suya (sugerencias) y el proveedor de toda una marca junto
    r = await post({ accion: "configurar_varios", items: [{ c: "20208", marca: "  Paradox " }, { c: "20825", marca: "Paradox" }] }, admin);
    assert.deepStrictEqual([r.cuerpo.cambiados, repo["stock/catalogo.json"].articulos["20208"].marca], [2, "Paradox"]);
    r = await post({ accion: "configurar_varios", codigos: ["20208", "20825"], campos: { prov: "Distribuidora Sur" } }, admin);
    assert.deepStrictEqual(["20208", "20825"].map((c) => repo["stock/catalogo.json"].articulos[c].prov), ["Distribuidora Sur", "Distribuidora Sur"]);
    assert.strictEqual(repo["stock/catalogo.json"].articulos["20825"].tipo, "unidad", "no toca lo que no se pidió");
    assert.strictEqual((await post({ accion: "configurar_varios", codigos: ["20208"], campos: { marca: "X" } }, melina)).statusCode, 403);
    assert.strictEqual((await post({ accion: "configurar_varios", codigos: ["20208"] }, admin)).statusCode, 400);
    // Garantía: los 4 iguales tienen la misma etiqueta pero cada uno su N° de serie; vuelve uno fallado
    const dep0 = repo["stock/saldos.json"].ubic.dep["20825"];
    r = await post({ accion: "mover", de: "dep", a: "cli:Kiosco Pérez", presupuesto: "4521", items: [{ c: "20825", cant: 1, unidades: ["GH600AA001"] }] }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    r = await post({ accion: "mover", de: "cli:Kiosco Pérez", a: "gar", falla: "No detecta", items: [{ c: "20825", cant: 1, unidades: ["GH600AA001"] }] }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    let uni = repo["stock/saldos.json"].unidades.GH600AA001;
    assert.deepStrictEqual([uni.u, uni.garantia.estado, uni.garantia.falla, uni.garantia.instalacion.cliente, uni.garantia.instalacion.presupuesto, uni.prov], ["gar", "por_enviar", "No detecta", "Kiosco Pérez", "4521", "2779"]);
    const ficha = (await get({ serie: "gh600aa001" }, juan)).cuerpo;
    assert.deepStrictEqual([ficha.proveedor, ficha.instalacion.cliente], ["Propiedad Protegida", "Kiosco Pérez"], "cualquiera puede ver la ficha de un equipo");
    assert.strictEqual((await post({ accion: "garantia", serie: "GH600AA001", estado: "enviado" }, juan)).statusCode, 403);
    r = await post({ accion: "garantia", serie: "GH600AA001", estado: "enviado", rma: "R-77" }, melina);
    assert.strictEqual(repo["stock/saldos.json"].unidades.GH600AA001.garantia.rma, "R-77");
    assert.strictEqual((await post({ accion: "garantia", serie: "GH600AA001", estado: "reemplazado" }, melina)).statusCode, 400, "falta el N° nuevo");
    r = await post({ accion: "garantia", serie: "GH600AA001", estado: "reemplazado", nuevo: "GH600AA999" }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    const sal2 = repo["stock/saldos.json"];
    assert.deepStrictEqual([sal2.unidades.GH600AA001.u, sal2.unidades.GH600AA001.garantia.cerrada ? "cerrada" : "", sal2.unidades.GH600AA999.u, sal2.unidades.GH600AA999.reemplaza, sal2.ubic.gar ? sal2.ubic.gar["20825"] : 0, sal2.ubic.dep["20825"]], ["baja", "cerrada", "dep", "GH600AA001", 0, dep0]);
    assert.strictEqual((await post({ accion: "garantia", serie: "GH600AA001", estado: "reparado" }, melina)).statusCode, 409, "ya está cerrada");
    // Un técnico devuelve un equipo fallado: al recibirlo va solo a Garantía
    r = await post({ accion: "devolver", fallado: true, falla: "No enciende", items: [{ c: "20825", cant: 1, unidades: ["GH12100FD4"] }] }, juan);
    assert.ok(r.cuerpo.envio.fallado);
    r = await post({ accion: "confirmar_envio", id: r.cuerpo.envio.id }, melina);
    uni = repo["stock/saldos.json"].unidades.GH12100FD4;
    assert.deepStrictEqual([uni.u, uni.garantia.falla, uni.garantia.estado], ["gar", "No enciende", "por_enviar"]);
    const S2 = require(path.join(raiz, "stock-utils.js"));
    assert.strictEqual(S2.totalesPorArticulo(repo["stock/saldos.json"])["20825"].gar, 1, "lo de garantía sigue contando como de SAT para Oficina");
    // Un solo lugar: si en el depósito hay teclados con N° de serie, hay que decir cuáles salen
    const salX = repo["stock/saldos.json"], depT = salX.ubic.dep["20825"], conN = S2.seriesEn(salX, "dep", "20825");
    assert.ok(conN.length >= 1);
    r = await post({ accion: "mover", de: "dep", a: "veh:Kangoo", items: [{ c: "20825", cant: depT }] }, melina);
    if (depT > depT - conN.length) assert.strictEqual(r.statusCode, 409, "sin decir cuáles no sale");
    assert.match(r.cuerpo.error || "", /escaneá o elegí/);
    r = await post({ accion: "ajustar", c: "20825", ubic: "dep", cantidad: 0, motivo: "x" }, admin);
    assert.strictEqual(r.statusCode, 409, "no se ajusta por debajo de los N° registrados");
    r = await post({ accion: "baja_serie", serie: conN[0], motivo: "Perdido" }, admin);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    assert.deepStrictEqual([repo["stock/saldos.json"].unidades[conN[0]].u, repo["stock/saldos.json"].ubic.dep["20825"]], ["baja", depT - 1]);
    // SIM: no entra al stock del depósito
    assert.match(S2.moverStock({ ubic: {} }, [{ c: "9", cant: 1 }], { de: "proveedor", a: "dep" }, { articulos: { 9: { c: "9", d: "MOVISTAR", tipo: "sim" } } }).error, /Control de SIMs/);
    // Saldo y movimiento juntos: no queda nada pendiente y cada movimiento está una sola vez en el historial
    assert.deepStrictEqual(repo["stock/saldos.json"].movsPend || [], []);
    const ids = repo[`stock/movimientos-${mes}.json`].map((m) => m.id);
    assert.strictEqual(new Set(ids).size, ids.length);
    assert.ok(repo[`stock/movimientos-${mes}.json`].some((m) => m.tipo === "baja" && m.motivo === "Perdido"));
    // El parte: lo de Mi stock pasa al cliente, lo retirado entra al técnico, lo que no tenía queda para aprobar
    const sirJuan = repo["stock/saldos.json"].ubic["tec:Juan"]["20208"];
    const cuerpoParte = { accion: "consumo_parte", op_id: "parte-P77", parte: "P77", cliente: "Kiosco Pérez", presupuesto: "4521",
      usados: [{ c: "20208", cant: 1 }, { c: "20825", cant: 1 }], retirados: [{ c: "20825", cant: 1, unidades: ["GH777AA001"], fallado: true, falla: "No anda" }], sinStock: [{ texto: "Cable 4 hilos", cant: 10 }] };
    r = await post(cuerpoParte, juan);
    assert.deepStrictEqual([r.cuerpo.instalados, r.cuerpo.retirados, r.cuerpo.paraAprobar], [1, 1, 2], JSON.stringify(r.cuerpo));
    let salP = repo["stock/saldos.json"];
    assert.deepStrictEqual([salP.ubic["tec:Juan"]["20208"], salP.ubic["cli:Kiosco Pérez"]["20208"], salP.unidades.GH777AA001.u], [sirJuan - 1, 1, "tec:Juan"]);
    assert.deepStrictEqual(salP.aprobar.map((x) => [x.por, x.texto, x.cant, x.parte]).sort(), [["Juan", "Cable 4 hilos", 10, "P77"], ["Juan", "TECLADO K10LH/V", 1, "P77"]]);
    // El equipo retirado no figuraba en la APP: igual queda anotado de qué cliente vino (para la garantía)
    const instRet = require(path.join(raiz, "stock-utils.js")).instalacionDeUnidad(salP.unidades.GH777AA001);
    assert.deepStrictEqual([instRet.cliente, instRet.fecha, !!instRet.retirado], ["Kiosco Pérez", "", true]);
    r = await post(cuerpoParte, juan);
    assert.ok(r.cuerpo.duplicado, "el mismo parte no descuenta dos veces");
    const mioJ = (await get({ mio: 1 }, juan)).cuerpo;
    assert.strictEqual(mioJ.porAprobar.length, 2);
    // Aprobar: el cable no se descuenta; el teclado salió del depósito (con su N°)
    const apCable = salP.aprobar.find((x) => x.texto === "Cable 4 hilos"), apTec = salP.aprobar.find((x) => x.c === "20825");
    assert.strictEqual((await post({ accion: "aprobar_consumo", id: apCable.id, decision: "aprobar", de: "ninguno" }, juan)).statusCode, 403);
    r = await post({ accion: "aprobar_consumo", id: apCable.id, decision: "aprobar", de: "ninguno" }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    r = await post({ accion: "aprobar_consumo", id: apTec.id, decision: "aprobar", de: "dep", c: "20825", cant: 1 }, melina);
    assert.strictEqual(r.statusCode, 409, "con N° registrados en el depósito hay que decir cuál");
    const serieDep = S2.seriesEn(repo["stock/saldos.json"], "dep", "20825")[0];
    r = await post({ accion: "aprobar_consumo", id: apTec.id, decision: "aprobar", de: "dep", c: "20825", cant: 1, unidades: [serieDep] }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    salP = repo["stock/saldos.json"];
    assert.deepStrictEqual([salP.aprobar.length, salP.unidades[serieDep].u, salP.aprobados.length], [0, "cli:Kiosco Pérez", 2]);
    assert.ok(repo[`stock/movimientos-${mes}.json`].some((m) => m.tipo === "instalado_parte" && m.presupuesto === "4521"));
    // Archivo de saldos dañado: no se escribe encima
    const sano = repo["stock/saldos.json"];
    repo["stock/saldos.json"] = "{roto";
    const fetchSano = global.fetch;
    global.fetch = async (url, op = {}) => { const u = String(url); if (u.includes("stock%2Fsaldos.json") || u.includes("stock/saldos.json")) { if ((op.method || "GET") === "PUT") throw new Error("no debería escribir"); return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from("{roto").toString("base64") })); } return fetchSano(url, op); };
    r = await post({ accion: "mover", de: "proveedor", a: "dep", items: [{ c: "20208", cant: 1 }] }, melina);
    assert.strictEqual(r.statusCode, 500);
    assert.match(r.cuerpo.error, /no se pudo leer/);
    global.fetch = fetchSano; repo["stock/saldos.json"] = sano;
    // Recordatorio del cron: envío sin confirmar hace más de un día
    await post({ accion: "mover", de: "dep", a: "tec:Luis", items: [{ c: "20208", cant: 1 }] }, melina);
    const { chequearEnviosStock } = require(path.join(raiz, "api", "cron-diario.js"));
    const estado = {};
    const t0 = Date.now() + 25 * 3600e3;
    const avisados = await chequearEnviosStock({}, estado, t0);
    assert.strictEqual(avisados.length, 1);
    assert.match(avisados[0], /^Luis:/);
    assert.strictEqual((await chequearEnviosStock({}, estado, t0 + 60e3)).length, 0, "una vez por día");
  } finally { global.fetch = fetchViejo; }
});

test("Stock: catálogo desde el listado de Oficina y la planilla revisada, saldo inicial una sola vez, ajustes con movimiento, pedidos y conciliación", async () => {
  const fetchViejo = global.fetch;
  const repo = {};
  global.fetch = async (url, op = {}) => {
    const u = String(url), metodo = op.method || "GET";
    const m = u.match(/contents\/([^?]+)/);
    if (m) {
      const ruta = decodeURIComponent(m[1]);
      if (metodo === "PUT") { repo[ruta] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString()); return new Response("{}", { status: 200 }); }
      if (!(ruta in repo)) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(repo[ruta])).toString("base64") }));
    }
    return new Response("[]");
  };
  try {
    const S = require(path.join(raiz, "stock-utils.js"));
    const admin = crearSesion({ nombre: "Seba", rol: "admin" }), juan = crearSesion({ nombre: "Juan", rol: "tecnico" });
    const post = async (body, t = admin) => { const r = resFalso(); await datos(pedido("POST", { coleccion: "stock" }, body, t), r); return r; };
    const get = async (q = {}) => { const r = resFalso(); await datos(pedido("GET", { coleccion: "stock", ...q }, null, admin), r); return r.cuerpo; };
    assert.strictEqual((await post({ accion: "importar_catalogo", articulos: [{ c: "1" }] }, juan)).statusCode, 403);
    const listado = [
      { c: "20825", d: "TECLADO K10LH/V 10 ZONAS P/2 PARTICIONES PARADOX E55", dep: 8, com: 1, precio: 31.37, moneda: "USD" },
      { c: "20208", d: "SIRENA MP100 INTERIOR MONOTONAL", dep: 0, com: 7 },
      { c: "10350", d: "CABLE 2 PARES TELEFONICO", dep: 30175, com: 0 },
      { c: "215063", d: "Movistar", dep: 1, com: 0 },
    ];
    let r = await post({ accion: "importar_catalogo", articulos: listado });
    assert.deepStrictEqual([r.cuerpo.nuevos, r.cuerpo.total], [4, 4]);
    const arts = repo["stock/catalogo.json"].articulos;
    assert.deepStrictEqual([arts["20825"].tipo, arts["20208"].tipo, arts["10350"].tipo, arts["10350"].medida, arts["215063"].tipo], ["unidad", "cantidad", "cantidad", "metros", "sim"], "propuesta automática");
    // Planilla revisada: cambia el tipo y pone mínimos
    r = await post({ accion: "importar_catalogo", revisada: true, articulos: [{ c: "20208", tipo: "cantidad", min: 5, pedir: 10, prov: "Propiedad Protegida" }, { c: "20825", min: 3 }] });
    assert.strictEqual(r.cuerpo.configurados, 2);
    assert.strictEqual(repo["stock/catalogo.json"].articulos["20208"].min, 5);
    assert.strictEqual(repo["stock/catalogo.json"].articulos["20825"].precio, 31.37, "la revisada no pisa precios");
    // Saldo inicial (la SIM no entra: va en Control de SIMs)
    r = await post({ accion: "saldo_inicial", items: listado.map((x) => ({ c: x.c, dep: x.dep, com: x.com })) });
    assert.ok(r.cuerpo.ok);
    const sal = repo["stock/saldos.json"];
    // El comodato de Oficina está en el depósito de comodatos (usados o reparados).
    assert.deepStrictEqual(sal.ubic.dep, { 20825: 8, 10350: 30175 });
    assert.deepStrictEqual(sal.ubic.dcm, { 20825: 1, 20208: 7 });
    assert.strictEqual(sal.ubic["com:Sin asignar"], undefined);
    assert.strictEqual((await post({ accion: "saldo_inicial", items: [] })).statusCode, 409, "una sola vez");
    const mes = new Date().toISOString().slice(0, 7);
    assert.strictEqual(repo[`stock/movimientos-${mes}.json`].length, 4);
    // Ajuste con motivo
    assert.strictEqual((await post({ accion: "ajustar", c: "20825", ubic: "dep", cantidad: 6 })).statusCode, 400, "sin motivo no");
    r = await post({ accion: "ajustar", c: "20825", ubic: "dep", cantidad: 6, motivo: "Conteo: había 6" });
    assert.deepStrictEqual([r.cuerpo.antes, r.cuerpo.despues], [8, 6]);
    const mov = repo[`stock/movimientos-${mes}.json`].slice(-1)[0];
    assert.deepStrictEqual([mov.tipo, mov.c, mov.cant, mov.de, mov.por], ["ajuste", "20825", 2, "dep", "Seba"]);
    // Pedidos: la sirena tiene 0 en depósito y mínimo 5 -> pedir 10
    const datosStock = await get();
    let p = S.articulosParaPedir(datosStock.catalogo, datosStock.saldos);
    assert.deepStrictEqual(p.pedir.map((x) => [x.c, x.sugerido, x.prov]), [["20208", 10, "Propiedad Protegida"]]);
    await post({ accion: "marcar_pedido", items: [{ c: "20208", cantidad: 10 }], proveedor: "Propiedad Protegida" });
    const d2 = await get();
    p = S.articulosParaPedir(d2.catalogo, d2.saldos);
    assert.deepStrictEqual([p.pedir.length, p.pedidos.length], [0, 1], "ya pedido: no se repite");
    // Conciliación contra un listado nuevo de Oficina
    const nuevo = [{ c: "20825", d: "TECLADO K10LH", dep: 8, com: 1 }, { c: "20208", dep: 0, com: 7 }, { c: "10350", dep: 30175, com: 0 }, { c: "99999", d: "CAMARA NUEVA", dep: 2, com: 0 }];
    const conc = S.conciliarStock(nuevo, d2.catalogo, d2.saldos, []);
    assert.deepStrictEqual(conc.cantidadDistinta.map((x) => [x.c, x.dif]), [["20825", -2]]);
    assert.strictEqual(conc.comodatoDistinto.length, 0, "Oficina «Comodato» = depósito de comodatos + clientes");
    assert.deepStrictEqual(conc.noEnCatalogo.map((x) => x.c), ["99999"]);
    assert.deepStrictEqual(conc.unidadesSinRegistrar.map((x) => x.c), ["20825"], "faltan escanear los teclados");
    r = await post({ accion: "conc_marcar", estado: "ignorada", items: [{ codigo: "99999", categoria: "noEnCatalogo" }] });
    const conc2 = S.conciliarStock(nuevo, d2.catalogo, d2.saldos, r.cuerpo.marcas);
    assert.strictEqual(conc2.noEnCatalogo.length, 0);
    assert.strictEqual(conc2.ocultas.length, 1);
  } finally { global.fetch = fetchViejo; }
});

test("Stock: control del cuadre (servidor y cron): todo lo hecho por la API cuadra contra el historial, y si alguien toca el stock a mano lo detecta y avisa una vez", async () => {
  const fetchViejo = global.fetch;
  const repo = { "tecnicos.json": [{ nombre: "Seba", permisos: { admin: true } }, { nombre: "Melina", permisos: { stock_responsable: true } }, { nombre: "Juan", permisos: {} }] };
  let version = 0;
  global.fetch = async (url, op = {}) => {
    const u = String(url), metodo = op.method || "GET";
    const m = u.match(/contents\/([^?]+)/);
    if (m) {
      const ruta = decodeURIComponent(m[1]);
      if (metodo === "PUT") { repo[ruta] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString()); version++; return new Response("{}", { status: 200 }); }
      if (!/\.json$/.test(ruta)) { const hijos = Object.keys(repo).filter((k) => k.startsWith(ruta + "/")).map((k) => ({ name: k.slice(ruta.length + 1), type: "file" })); return new Response(JSON.stringify(hijos), { status: hijos.length ? 200 : 404 }); }
      if (!(ruta in repo)) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: `s${version}`, encoding: "base64", content: Buffer.from(JSON.stringify(repo[ruta])).toString("base64") }));
    }
    return new Response("[]");
  };
  try {
    const admin = crearSesion({ nombre: "Seba", rol: "admin" }), melina = crearSesion({ nombre: "Melina", rol: "tecnico" }), juan = crearSesion({ nombre: "Juan", rol: "tecnico" });
    const post = async (body, t = admin) => { const r = resFalso(); await datos(pedido("POST", { coleccion: "stock" }, body, t), r); return r; };
    const get = async () => { const r = resFalso(); await datos(pedido("GET", { coleccion: "stock" }, null, admin), r); return r.cuerpo; };
    await post({ accion: "importar_catalogo", articulos: [{ c: "20825", d: "TECLADO K10LH/V PARADOX", dep: 4 }, { c: "20208", d: "SIRENA MP100 INTERIOR", dep: 10, com: 2 }] });
    await post({ accion: "configurar", c: "20825", tipo: "unidad" });
    let r = await post({ accion: "saldo_inicial", items: [{ c: "20825", dep: 4 }, { c: "20208", dep: 10, com: 2 }] });
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    // Un día normal: entrega, el técnico recibe con diferencia, usa en un parte, devuelve; ajuste del admin.
    // Hay sirenas nuevas y en el depósito de comodatos: sin decir de cuál, no adivina
    r = await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20208", cant: 3 }] }, melina);
    assert.match(r.cuerpo.error || "", /hay 10 nuevos y 2 en el depósito de comodatos; elegí de cuál sale/);
    r = await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20825", cant: 2, unidades: ["GH12000001", "GH12000002"] }, { c: "20208", cant: 3, de: "dep" }] }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    r = await post({ accion: "confirmar_envio", id: r.cuerpo.envio.id, items: [{ c: "20825", cant: 2, unidades: ["GH12000001"] }, { c: "20208", cant: 2 }] }, juan);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    r = await post({ accion: "consumo_parte", op_id: "parte-1", cliente: "Kiosco", parte: "P1", usados: [{ c: "20825", cant: 1, unidades: ["GH12000002"] }, { c: "20208", cant: 1 }] }, juan);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    r = await post({ accion: "devolver", items: [{ c: "20208", cant: 1 }] }, juan);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    r = await post({ accion: "ajustar", c: "20208", ubic: "dep", cantidad: 9, motivo: "Conteo" });
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    // Solo el admin controla; y cuadra.
    assert.strictEqual((await post({ accion: "cuadrar" }, melina)).statusCode, 403);
    r = await post({ accion: "cuadrar" });
    assert.ok(r.cuerpo.cuadre.ok, JSON.stringify(r.cuerpo.cuadre.errores));
    assert.ok(r.cuerpo.cuadre.revisados.movimientos >= 8);
    assert.strictEqual((await get()).cuadre.ultimo.ok, true, "el panel ve el último control");
    // Alguien cambia el archivo a mano: el cron lo detecta, avisa una vez y no repite el mismo aviso al otro día.
    const sal = repo["stock/saldos.json"];
    sal.ubic.dep["20208"] += 5;
    const rutaPush = require.resolve(path.join(raiz, "lib/push-sender.js"));
    if (!require.cache[rutaPush]) require.cache[rutaPush] = { id: rutaPush, filename: rutaPush, loaded: true, exports: { enviarATodos: async () => ({}), enviarASeleccionados: async () => ({}) } };
    const { chequearCuadreStock } = require(path.join(raiz, "api", "cron-diario.js"));
    const t0 = Date.now();
    let txt = await chequearCuadreStock({}, t0);
    assert.match(txt, /1 problema\(s\), avisado/);
    assert.match(repo["stock/cuadre.json"].ultimo.errores[0].texto, /SIRENA MP100 INTERIOR en Depósito: el stock dice 14 y los movimientos dan 9/);
    txt = await chequearCuadreStock({}, t0 + 864e5);
    assert.match(txt, /^1 problema\(s\)$/, "el mismo problema no se avisa todos los días");
    const panel = await get();
    assert.strictEqual(panel.cuadre.ultimo.ok, false);
    assert.strictEqual(panel.cuadre.historial.length, 3);
    // Se verificó que hay 14: se regulariza (el historial queda con el movimiento que faltaba) y vuelve a cuadrar.
    assert.strictEqual((await post({ accion: "regularizar_cuadre", motivo: "Contado" }, melina)).statusCode, 403);
    assert.strictEqual((await post({ accion: "regularizar_cuadre" })).statusCode, 400, "sin motivo no");
    r = await post({ accion: "regularizar_cuadre", motivo: "Contado en el depósito: hay 14" });
    assert.strictEqual(r.cuerpo.movimientos, 1);
    assert.ok(r.cuerpo.cuadre.ok, JSON.stringify(r.cuerpo.cuadre.errores));
    assert.deepStrictEqual(repo["stock/saldos.json"].ubic.dep["20208"], 14, "regularizar no cambia cantidades");
    const reg = Object.keys(repo).filter((k) => /movimientos-/.test(k)).flatMap((k) => repo[k]).find((m) => m.tipo === "regularizacion");
    assert.deepStrictEqual([reg.c, reg.cant, reg.a, reg.por], ["20208", 5, "dep", "Seba"]);
    // Después un conteo da 9: el ajuste queda como movimiento y sigue cuadrando.
    r = await post({ accion: "ajustar", c: "20208", ubic: "dep", cantidad: 9, motivo: "Conteo" });
    assert.ok(r.cuerpo.ok);
    assert.match(await chequearCuadreStock({}, t0 + 2 * 864e5), /^cuadra/);
    // Un equipo que aparece en otro lugar sin movimiento también se regulariza.
    repo["stock/saldos.json"].unidades.GH12000001.u = "dep";
    repo["stock/saldos.json"].ubic["tec:Juan"]["20825"] -= 1; repo["stock/saldos.json"].ubic.dep["20825"] += 1;
    r = await post({ accion: "cuadrar" });
    assert.ok(r.cuerpo.cuadre.errores.some((e) => e.k === "serieLugar" && e.serie === "GH12000001"));
    r = await post({ accion: "regularizar_cuadre", motivo: "El teclado está en el depósito" });
    assert.ok(r.cuerpo.cuadre.ok, JSON.stringify(r.cuerpo.cuadre.errores));
  } finally { global.fetch = fetchViejo; }
});

test("Stock: depósito de comodatos (usados o reparados) separado de los nuevos: el comodato de Oficina va ahí, al entregar se sabe de cuál salió, y lo que la v4.75.0 pasó al depósito vuelve", async () => {
  const S = require(path.join(raiz, "stock-utils.js"));
  const fetchViejo = global.fetch;
  const mes = new Date().toISOString().slice(0, 7), fi = `${mes}-01T10:00:00.000Z`;
  const armar = (saldos, hist) => ({
    "tecnicos.json": [{ nombre: "Seba", permisos: { admin: true } }, { nombre: "Melina", permisos: { stock_responsable: true } }, { nombre: "Juan", permisos: {} }],
    "stock/catalogo.json": { articulos: { 20868: { c: "20868", d: "RX1 RECEPTOR 2 PGM PARADOX INALAMBRICO", tipo: "unidad" }, 20208: { c: "20208", d: "SIRENA MP100 INTERIOR" } } },
    "stock/saldos.json": saldos,
    [`stock/movimientos-${mes}.json`]: hist,
    ...(mes !== "2026-11" ? { "stock/movimientos-2026-11.json": hist } : {}),
  });
  let repo = {}, version = 0;
  global.fetch = async (url, op = {}) => {
    const u = String(url), metodo = op.method || "GET";
    const m = u.match(/contents\/([^?]+)/);
    if (m) {
      const ruta = decodeURIComponent(m[1]);
      if (metodo === "PUT") { repo[ruta] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString()); version++; return new Response("{}", { status: 200 }); }
      if (!/\.json$/.test(ruta)) { const hijos = Object.keys(repo).filter((k) => k.startsWith(ruta + "/")).map((k) => ({ name: k.slice(ruta.length + 1), type: "file" })); return new Response(JSON.stringify(hijos), { status: hijos.length ? 200 : 404 }); }
      if (!(ruta in repo)) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: `s${version}`, encoding: "base64", content: Buffer.from(JSON.stringify(repo[ruta])).toString("base64") }));
    }
    return new Response("[]");
  };
  try {
    const admin = crearSesion({ nombre: "Seba", rol: "admin" }), melina = crearSesion({ nombre: "Melina", rol: "tecnico" }), juan = crearSesion({ nombre: "Juan", rol: "tecnico" });
    const post = async (body, t = admin) => { const r = resFalso(); await datos(pedido("POST", { coleccion: "stock" }, body, t), r); return r; };
    const get = async (t = admin) => { const r = resFalso(); await datos(pedido("GET", { coleccion: "stock" }, null, t), r); return r.cuerpo; };
    const hist = () => repo[`stock/movimientos-${mes}.json`];
    // 1) Cargado antes como «comodato sin asignar»: se ve (y al escribir queda) en el depósito de comodatos
    repo = armar({ inicializado: fi, ubic: { dep: { 20208: 2 }, "com:Sin asignar": { 20868: 3, 20208: 1 } }, unidades: {}, envios: [] }, [
      { id: "i1", fecha: fi, tipo: "inicial", c: "20208", cant: 2, a: "dep" },
      { id: "i2", fecha: fi, tipo: "inicial", c: "20868", cant: 3, a: "com:Sin asignar" },
      { id: "i3", fecha: fi, tipo: "inicial", c: "20208", cant: 1, a: "com:Sin asignar" },
    ]);
    const d = await get(melina);
    assert.deepStrictEqual([d.saldos.ubic.dcm, d.saldos.ubic.dep, d.saldos.ubic["com:Sin asignar"]], [{ 20868: 3, 20208: 1 }, { 20208: 2 }, undefined]);
    assert.ok(repo["stock/saldos.json"].ubic["com:Sin asignar"], "leer no escribe");
    // Melina escanea dos RX1: no hay nuevos, salen del depósito de comodatos (y queda dicho)
    let r = await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20868", cant: 2, unidades: ["AI200158A2", "AI200158A3"] }] }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    let sal = repo["stock/saldos.json"];
    assert.deepStrictEqual([sal.ubic.dcm, sal.ubic.dep, sal.ubic["com:Sin asignar"], sal.comodatoSeparado], [{ 20868: 1, 20208: 1 }, { 20208: 2 }, undefined, true]);
    const salida = hist().find((m) => m.tipo === "entrega" && m.c === "20868");
    assert.deepStrictEqual([salida.de, salida.cant, salida.unidades], ["dcm", 2, ["AI200158A2", "AI200158A3"]]);
    assert.deepStrictEqual(S.movimientoParaOficina(salida) && [S.movimientoParaOficina(salida).operacion, S.movimientoParaOficina(salida).deposito, S.movimientoParaOficina(salida).comodato], ["SALE DEL DEPOSITO DE COMODATOS", 2, -2]);
    const pasaron = hist().filter((m) => m.tipo === "comodato_deposito");
    assert.deepStrictEqual(pasaron.map((m) => [m.c, m.cant, m.de, m.a]).sort(), [["20208", 1, "com:Sin asignar", "dcm"], ["20868", 3, "com:Sin asignar", "dcm"]]);
    assert.ok(pasaron.every((m) => S.movimientoParaOficina(m) === null && S.claseMovimiento(m) === ""), "es interno");
    assert.deepStrictEqual(sal.movsPend || [], []);
    // Sirenas: 2 nuevas + 1 de comodato. Sin elegir, primero las nuevas; elegido «comodato», de ahí.
    r = await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20208", cant: 1, de: "dcm" }] }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    assert.strictEqual(hist().slice(-1)[0].de, "dcm");
    assert.match((await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20208", cant: 1, de: "dcm" }] }, melina)).cuerpo.error, /Depósito de comodatos hay 0/);
    assert.match((await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20208", cant: 3 }] }, melina)).cuerpo.error, /en Depósito hay 2 y querés mover 3/);
    // Lo que el técnico no recibe vuelve a donde estaba
    const env = (await get()).saldos.envios.find((e) => e.items.some((x) => x.c === "20208"));
    r = await post({ accion: "confirmar_envio", id: env.id, accion_envio: "rechazar", motivo: "No era" }, juan);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    assert.strictEqual(repo["stock/saldos.json"].ubic.dcm["20208"], 1, "volvió al depósito de comodatos");
    // Recibir de un cliente directo al depósito de comodatos
    r = await post({ accion: "mover", de: "com:Kiosco Pérez", a: "dcm", items: [{ c: "20208", cant: 1 }] }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    assert.strictEqual(repo["stock/saldos.json"].ubic.dcm["20208"], 2);
    const ret = S.movimientoParaOficina(hist().slice(-1)[0]);
    assert.deepStrictEqual([ret.operacion, ret.deposito, ret.comodato, ret.cliente], ["RETIRO DE COMODATO", 0, 1, "Kiosco Pérez"], "vuelve al Comodato de Oficina");
    // Del depósito de comodatos a un cliente en comodato: se descuenta de Comodato
    r = await post({ accion: "mover", de: "dep", a: "com:Kiosco Pérez", items: [{ c: "20208", cant: 1, de: "dcm" }] }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    const sale = S.movimientoParaOficina(hist().slice(-1)[0]);
    assert.deepStrictEqual([sale.operacion, sale.deposito, sale.comodato], ["SALIDA A CLIENTE EN COMODATO", 0, -1]);
    let c = await post({ accion: "cuadrar" });
    assert.ok(c.cuerpo.cuadre.ok, JSON.stringify(c.cuerpo.cuadre.errores));
    // 2) Lo que la v4.75.0 pasó al depósito general vuelve al depósito de comodatos (lo que sigue ahí)
    repo = armar({ inicializado: fi, ubic: { dep: { 20868: 2, 20208: 3 } }, unidades: {}, envios: [] }, [
      { id: "i1", fecha: fi, tipo: "inicial", c: "20208", cant: 2, a: "dep" },
      { id: "i2", fecha: fi, tipo: "inicial", c: "20868", cant: 3, a: "com:Sin asignar" },
      { id: "i3", fecha: fi, tipo: "inicial", c: "20208", cant: 1, a: "com:Sin asignar" },
      { id: "comdep-1", fecha: fi, tipo: "comodato_deposito", c: "20868", cant: 3, de: "com:Sin asignar", a: "dep" },
      { id: "comdep-2", fecha: fi, tipo: "comodato_deposito", c: "20208", cant: 1, de: "com:Sin asignar", a: "dep" },
      { id: "e1", fecha: fi, tipo: "entrega", c: "20868", cant: 1, de: "dep", a: "tec:Juan" },
    ]);
    repo["stock/saldos.json"].ubic["tec:Juan"] = { 20868: 1 };
    r = await post({ accion: "ajustar", c: "20208", ubic: "dep", cantidad: 3, motivo: "Conteo" }); // (el ajuste deja 3 nuevos)
    sal = repo["stock/saldos.json"];
    assert.deepStrictEqual([sal.ubic.dep, sal.ubic.dcm, sal.comodatoSeparado], [{ 20208: 3 }, { 20868: 2, 20208: 1 }, true]);
    assert.strictEqual(hist().filter((m) => /^comsep-/.test(m.id)).length, 2);
    await post({ accion: "ajustar", c: "20208", ubic: "dep", cantidad: 2, motivo: "Conteo" });
    assert.strictEqual(hist().filter((m) => /^comsep-/.test(m.id)).length, 2, "una sola vez");
    c = await post({ accion: "cuadrar" });
    assert.ok(c.cuerpo.cuadre.ok, JSON.stringify(c.cuerpo.cuadre.errores));
  } finally { global.fetch = fetchViejo; }
});

test("Stock: entrega en mano (código QR firmado del técnico o su clave), pedidos de material y devolver lo retirado de clientes", async () => {
  const fetchViejo = global.fetch;
  const repo = {
    "tecnicos.json": [{ nombre: "Melina", password: "m1", permisos: { stock_responsable: true } }, { nombre: "Juan", password: "clave-juan", permisos: {} }, { nombre: "Luis", password: "l1", permisos: {} }],
    "stock/catalogo.json": { articulos: { 20825: { c: "20825", d: "TECLADO K10LH/V", tipo: "unidad" }, 20208: { c: "20208", d: "SIRENA MP100", tipo: "cantidad" }, 40001: { c: "40001", d: "BATERIA 12V", tipo: "cantidad" } } },
    "stock/saldos.json": { inicializado: "2026-11-01", ubic: { dep: { 20825: 3, 20208: 10, 40001: 6 } }, unidades: {}, pedidos: {} },
  };
  global.fetch = async (url, op = {}) => {
    const u = String(url), metodo = op.method || "GET";
    if (u.includes("/api/tecnicos") || u.includes("/api/login")) return new Response("{}", { status: 404 });
    const m = u.match(/contents\/([^?]+)/);
    if (m) {
      const ruta = decodeURIComponent(m[1]);
      if (metodo === "PUT") { repo[ruta] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString()); return new Response("{}", { status: 200 }); }
      if (!(ruta in repo)) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(repo[ruta])).toString("base64") }));
    }
    return new Response("[]");
  };
  const rutaPush = require.resolve(path.join(raiz, "lib/push-sender.js"));
  const viejoPush = require.cache[rutaPush], avisos = [];
  require.cache[rutaPush] = { id: rutaPush, filename: rutaPush, loaded: true, exports: { enviarATodos: async () => ({}), enviarASeleccionados: async (n, a) => { avisos.push({ n, ...a }); return {}; } } };
  try {
    const melina = crearSesion({ nombre: "Melina", rol: "tecnico" }), juan = crearSesion({ nombre: "Juan", rol: "tecnico" }), luis = crearSesion({ nombre: "Luis", rol: "tecnico" });
    const post = async (body, t) => { const r = resFalso(); await datos(pedido("POST", { coleccion: "stock" }, body, t), r); return r; };
    const get = async (q, t) => { const r = resFalso(); await datos(pedido("GET", { coleccion: "stock", ...q }, null, t), r); return r; };
    // 1) Juan pide material desde la APP: le llega a Melina.
    let r = await post({ accion: "pedir_material", items: [{ c: "40001", cant: 2 }, { c: "20825", cant: 1 }, { c: "99999", cant: 1 }], nota: "Para la obra de mañana" }, juan);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    const sol = r.cuerpo.solicitud;
    assert.deepStrictEqual(sol.items, [{ c: "40001", cant: 2 }, { c: "20825", cant: 1 }], "lo que no está en el catálogo no entra");
    assert.ok(avisos.some((a) => a.n.includes("Melina") && /Juan pide material/.test(a.titulo) && /2 BATERIA 12V/.test(a.cuerpo)));
    assert.strictEqual((await post({ accion: "pedido_listo", id: sol.id }, luis)).statusCode, 403);
    assert.strictEqual((await post({ accion: "cancelar_pedido", id: sol.id }, luis)).statusCode, 403, "otro técnico no cancela lo de Juan");
    r = await post({ accion: "pedido_listo", id: sol.id }, melina);
    assert.strictEqual(r.cuerpo.solicitud.estado, "lista");
    assert.ok(avisos.some((a) => a.n.includes("Juan") && /listo/.test(a.titulo)));
    assert.strictEqual((await get({ mio: 1 }, juan)).cuerpo.solicitudes[0].estado, "lista");
    // 2) Juan muestra su código: Melina lo escanea y entrega en mano (sin «en camino»).
    const { codigo } = (await get({ mi_codigo: 1 }, juan)).cuerpo;
    assert.match(codigo, /^SATT1\./);
    const codigoLuis = (await get({ mi_codigo: 1 }, luis)).cuerpo.codigo;
    r = await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "40001", cant: 2 }], en_mano: { codigo: codigoLuis } }, melina);
    assert.strictEqual(r.statusCode, 403, "el código de otro técnico no sirve");
    r = await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "40001", cant: 2 }], en_mano: { codigo: codigo.slice(0, -3) + "AAA" } }, melina);
    assert.strictEqual(r.statusCode, 403, "un código adulterado no sirve");
    r = await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "40001", cant: 2 }, { c: "20825", cant: 1, unidades: ["GH12000001"] }], en_mano: { codigo, escaneado: new Date().toISOString() }, solicitud: sol.id }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    assert.strictEqual(r.cuerpo.en_mano, "código");
    assert.ok(!r.cuerpo.envio, "no queda en camino");
    let sal = repo["stock/saldos.json"];
    assert.deepStrictEqual(sal.ubic["tec:Juan"], { 40001: 2, 20825: 1 });
    assert.ok(!sal.ubic["cam:Juan"]);
    assert.strictEqual(sal.unidades.GH12000001.u, "tec:Juan");
    assert.strictEqual(sal.solicitudes.find((x) => x.id === sol.id).estado, "entregada");
    const mes = new Date().toISOString().slice(0, 7);
    assert.ok(repo[`stock/movimientos-${mes}.json`].some((m) => m.tipo === "entrega_mano" && /Recibido en mano por Juan \(código\)/.test(m.motivo)));
    // Un código vencido (escaneado hace más de 15 minutos) no sirve.
    r = await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20208", cant: 1 }], en_mano: { codigo, escaneado: new Date(Date.now() - 40 * 60e3).toISOString() } }, melina);
    assert.strictEqual(r.statusCode, 403);
    const { crearPaseStock } = require(path.join(raiz, "lib/sesion.js"));
    const viejo = crearPaseStock("Juan", Date.now() - 30 * 60e3).codigo;
    r = await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20208", cant: 1 }], en_mano: { codigo: viejo } }, melina);
    assert.strictEqual(r.statusCode, 403, "un código de hace media hora (captura de pantalla) no sirve");
    assert.match(r.cuerpo.error, /venció/);
    // 3) Con la clave de Juan (no tenía el celular a mano).
    r = await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20208", cant: 1 }], en_mano: { clave: "otra" } }, melina);
    assert.strictEqual(r.statusCode, 403);
    r = await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20208", cant: 1 }], en_mano: { clave: "clave-juan" } }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    assert.strictEqual(repo["stock/saldos.json"].ubic["tec:Juan"]["20208"], 1);
    // Sin código ni clave sigue como antes: en camino hasta que confirme.
    r = await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20208", cant: 1 }] }, melina);
    assert.ok(r.cuerpo.envio);
    // 4) Retira de un cliente y después devuelve «lo retirado» de una.
    r = await post({ accion: "consumo_parte", op_id: "p-9", cliente: "Kiosco", retirados: [{ c: "20825", cant: 1, unidades: ["GH12000099"] }, { c: "20208", cant: 2 }] }, juan);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    const ret = (await get({ retirados: 1 }, juan)).cuerpo.items;
    assert.deepStrictEqual(ret.sort((x, y) => x.c.localeCompare(y.c)), [{ c: "20208", cant: 2, unidades: [] }, { c: "20825", cant: 1, unidades: ["GH12000099"] }]);
    // 5) Cancelar un pedido propio.
    r = await post({ accion: "pedir_material", items: [{ c: "20208", cant: 3 }] }, luis);
    r = await post({ accion: "cancelar_pedido", id: r.cuerpo.solicitud.id }, luis);
    assert.strictEqual(r.cuerpo.solicitud.estado, "cancelada");
    // 6) El depósito cierra un pedido que no se va a preparar, con el motivo (el de otro técnico no puede)
    r = await post({ accion: "pedir_material", items: [{ c: "20208", cant: 2 }] }, luis);
    const idSol = r.cuerpo.solicitud.id;
    assert.strictEqual((await post({ accion: "cancelar_pedido", id: idSol }, juan)).statusCode, 403);
    r = await post({ accion: "cancelar_pedido", id: idSol, motivo: "No hay stock hasta el lunes" }, melina);
    assert.deepStrictEqual([r.cuerpo.solicitud.estado, r.cuerpo.solicitud.cerrada_por, r.cuerpo.solicitud.motivo_cierre], ["cancelada", "Melina", "No hay stock hasta el lunes"]);
    // 7) Lo cargado con el catálogo de materiales (texto libre): si el técnico lo tiene, se descuenta solo de su
    //    stock; lo que no tiene queda para aprobar (con el artículo ya propuesto si se reconoce)
    const S = require(path.join(raiz, "stock-utils.js"));
    const sirJ = repo["stock/saldos.json"].ubic["tec:Juan"]["20208"], sirCli = (repo["stock/saldos.json"].ubic["cli:Kiosco"] || {})["20208"] || 0;
    assert.ok(sirJ >= 2, "Juan tiene sirenas");
    r = await post({ accion: "consumo_parte", op_id: "p-10", parte: "777", cliente: "Kiosco", sinStock: [{ texto: "Sirena mp100", cant: 1 }, { texto: "Tornillos", cant: 4 }] }, juan);
    assert.deepStrictEqual([r.cuerpo.paraAprobar, r.cuerpo.descontados], [1, [{ c: "20208", d: "SIRENA MP100", cant: 1 }]], JSON.stringify(r.cuerpo));
    assert.deepStrictEqual([repo["stock/saldos.json"].ubic["tec:Juan"]["20208"], repo["stock/saldos.json"].ubic["cli:Kiosco"]["20208"]], [sirJ - 1, sirCli + 1]);
    assert.deepStrictEqual(repo["stock/saldos.json"].aprobar.slice(0, 1).map((x) => [x.texto, x.c, x.cant]), [["Tornillos", "", 4]]);
    assert.ok(repo[`stock/movimientos-${mes}.json`].some((m) => m.tipo === "instalado_parte" && /Parte N° 777 · descontado solo de su stock \(«Sirena mp100»\)/.test(m.motivo)));
    //    Pide más de lo que tiene: se descuenta lo que tiene y el resto va a aprobar
    r = await post({ accion: "consumo_parte", op_id: "p-11", cliente: "Kiosco", sinStock: [{ texto: "SIRENA MP100", cant: sirJ + 2 }] }, juan);
    assert.deepStrictEqual([r.cuerpo.descontados[0].cant, r.cuerpo.paraAprobar], [sirJ - 1, 1], JSON.stringify(r.cuerpo));
    assert.deepStrictEqual([repo["stock/saldos.json"].ubic["tec:Juan"]["20208"] || 0, repo["stock/saldos.json"].aprobar[0].cant, repo["stock/saldos.json"].aprobar[0].c], [0, 3, "20208"]);
    //    Un equipo con N° de serie del que tiene varios: no se sabe cuál usó, lo decide el depósito
    await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20825", cant: 2, unidades: S.seriesEn(repo["stock/saldos.json"], "dep", "20825").slice(0, 2) }], en_mano: { clave: "clave-juan" } }, melina);
    const tecJ = repo["stock/saldos.json"].ubic["tec:Juan"]["20825"];
    assert.ok(tecJ >= 2 && S.seriesEn(repo["stock/saldos.json"], "tec:Juan", "20825").length >= 2);
    r = await post({ accion: "consumo_parte", op_id: "p-12", cliente: "Kiosco", sinStock: [{ texto: "Teclado K10LH/V", cant: 1 }] }, juan);
    assert.deepStrictEqual([r.cuerpo.descontados, r.cuerpo.paraAprobar, repo["stock/saldos.json"].ubic["tec:Juan"]["20825"]], [undefined, 1, tecJ], JSON.stringify(r.cuerpo));
    //    Si ya lo marcó en «Usé material de mi stock», lo mismo escrito abajo no se descuenta dos veces
    await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20208", cant: 3 }], en_mano: { clave: "clave-juan" } }, melina);
    r = await post({ accion: "consumo_parte", op_id: "p-13", cliente: "Kiosco", usados: [{ c: "20208", cant: 1 }], sinStock: [{ texto: "Sirena MP100", cant: 1 }] }, juan);
    assert.deepStrictEqual([r.cuerpo.instalados, r.cuerpo.descontados, r.cuerpo.paraAprobar, repo["stock/saldos.json"].ubic["tec:Juan"]["20208"]], [1, undefined, 1, 2], JSON.stringify(r.cuerpo));
    // 8) Material para un servicio del cronograma: queda anotado al N° de servicio; el parte de ese servicio
    //    cuenta como usado y lo que no se usó vuelve con «Vuelve de un servicio»
    r = await post({ accion: "mover", de: "dep", a: "tec:Juan", items: [{ c: "20208", cant: 2 }], en_mano: { clave: "clave-juan" }, servicio: { numero: "37895", cliente: "Kiosco Pérez" } }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    let sv = repo["stock/saldos.json"].servicios["37895"];
    assert.deepStrictEqual([sv.cliente, sv.tecnico, sv.salio], ["Kiosco Pérez", "tec:Juan", { 20208: 2 }]);
    assert.ok(repo[`stock/movimientos-${mes}.json`].some((m) => m.servicio === "37895" && /^Servicio N° 37895 · Kiosco Pérez · Recibido en mano por Juan/.test(m.motivo)));
    r = await post({ accion: "consumo_parte", op_id: "p-20", parte: "37895", cliente: "Kiosco Pérez", sinStock: [{ texto: "Sirena MP100", cant: 1 }] }, juan);
    assert.strictEqual(r.cuerpo.descontados[0].cant, 1, JSON.stringify(r.cuerpo));
    assert.deepStrictEqual(S.pendienteDeServicio(repo["stock/saldos.json"], "37895").pendientes.map((x) => [x.c, x.cant, x.salio, x.usado]), [["20208", 1, 2, 1]]);
    // (el parte de otro servicio no toca este)
    r = await post({ accion: "consumo_parte", op_id: "p-21", parte: "40000", cliente: "Otro", usados: [{ c: "20208", cant: 1 }] }, juan);
    assert.deepStrictEqual([repo["stock/saldos.json"].servicios["37895"].usado, repo["stock/saldos.json"].servicios["40000"]], [{ 20208: 1 }, undefined]);
    r = await post({ accion: "mover", de: "tec:Juan", a: "dep", items: [{ c: "20208", cant: 1 }], servicio: { numero: "37895", cliente: "Kiosco Pérez" } }, melina);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    assert.deepStrictEqual([repo["stock/saldos.json"].servicios["37895"].volvio, S.serviciosConMaterial(repo["stock/saldos.json"]).length], [{ 20208: 1 }, 0]);
    // En camino y rechazado: lo que no recibió no cuenta como entregado para el servicio
    r = await post({ accion: "mover", de: "dep", a: "tec:Luis", items: [{ c: "20208", cant: 2 }], servicio: { numero: "38000", cliente: "Farmacia" } }, melina);
    assert.deepStrictEqual([r.cuerpo.envio.servicio, repo["stock/saldos.json"].servicios["38000"].salio], ["38000", { 20208: 2 }]);
    r = await post({ accion: "confirmar_envio", id: r.cuerpo.envio.id, accion_envio: "rechazar", motivo: "No era para mí" }, luis);
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    assert.deepStrictEqual(repo["stock/saldos.json"].servicios["38000"].salio, { 20208: 0 });
  } finally { global.fetch = fetchViejo; if (viejoPush) require.cache[rutaPush] = viejoPush; else delete require.cache[rutaPush]; }
});

test("Stock: vuelve de un presupuesto (no se usó): sale al cliente con N° de presupuesto, vuelve lo que no se instaló, y para Oficina no es un retiro", async () => {
  const fetchViejo = global.fetch;
  const repo = {
    "tecnicos.json": [{ nombre: "Melina", permisos: { stock_responsable: true } }],
    "stock/catalogo.json": { articulos: { 23940: { c: "23940", d: "INFRARROJO AJAX", tipo: "unidad" }, 20825: { c: "20825", d: "TECLADO", tipo: "unidad" }, 20208: { c: "20208", d: "SIRENA", tipo: "cantidad" } } },
    "stock/saldos.json": { inicializado: "2026-11-01", ubic: { dep: { 23940: 4, 20825: 1, 20208: 5 } }, unidades: { A1: { c: "23940", u: "dep" }, A2: { c: "23940", u: "dep" }, A3: { c: "23940", u: "dep" }, A4: { c: "23940", u: "dep" }, T1: { c: "20825", u: "dep" } }, pedidos: {} },
  };
  global.fetch = async (url, op = {}) => {
    const m = String(url).match(/contents\/([^?]+)/);
    if (m) {
      const ruta = decodeURIComponent(m[1]);
      if ((op.method || "GET") === "PUT") { repo[ruta] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString()); return new Response("{}", { status: 200 }); }
      if (!(ruta in repo)) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(repo[ruta])).toString("base64") }));
    }
    return new Response("[]");
  };
  try {
    const melina = crearSesion({ nombre: "Melina", rol: "tecnico" });
    const post = async (body) => { const r = resFalso(); await datos(pedido("POST", { coleccion: "stock" }, body, melina), r); return r; };
    const S = require(path.join(raiz, "stock-utils.js"));
    // Sale la instalación del presupuesto 4521: 4 infrarrojos, el teclado y 2 sirenas.
    let r = await post({ accion: "mover", de: "dep", a: "cli:Kiosco Pérez", presupuesto: "4521", items: [{ c: "23940", cant: 4, unidades: ["A1", "A2", "A3", "A4"] }, { c: "20825", cant: 1, unidades: ["T1"] }, { c: "20208", cant: 2 }] });
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    let sal = repo["stock/saldos.json"];
    assert.deepStrictEqual(sal.presupuestos["4521"].salio, { 23940: 4, 20825: 1, 20208: 2 });
    assert.strictEqual(sal.presupuestos["4521"].cliente, "cli:Kiosco Pérez");
    // El cliente no quiso 2 infrarrojos ni una sirena: vuelven sin usar.
    r = await post({ accion: "mover", de: "cli:Kiosco Pérez", a: "dep", no_usado: true, presupuesto: "4521", items: [{ c: "23940", cant: 2, unidades: ["A3", "A4"] }, { c: "20208", cant: 1 }] });
    assert.ok(r.cuerpo.ok, JSON.stringify(r.cuerpo));
    sal = repo["stock/saldos.json"];
    assert.deepStrictEqual([sal.ubic.dep["23940"], sal.ubic["cli:Kiosco Pérez"]["23940"], sal.ubic.dep["20208"]], [2, 2, 4]);
    assert.strictEqual(sal.unidades.A3.u, "dep");
    const mes = new Date().toISOString().slice(0, 7);
    const movs = repo[`stock/movimientos-${mes}.json`].filter((m) => m.tipo === "devuelto_sin_usar");
    assert.strictEqual(movs.length, 2);
    assert.ok(movs.every((m) => m.presupuesto === "4521" && m.de === "cli:Kiosco Pérez"));
    // Lo que todavía podría volver de ese presupuesto
    assert.deepStrictEqual(S.pendienteDePresupuesto(sal, "4521").items.sort((x, y) => x.c.localeCompare(y.c)), [{ c: "20208", cant: 1, series: [] }, { c: "20825", cant: 1, series: ["T1"] }, { c: "23940", cant: 2, series: ["A1", "A2"] }]);
    // Para Oficina: vuelve sin usar, no «retiro de cliente»
    assert.deepStrictEqual(S.movimientoParaOficina(movs[0]).operacion, "VUELVE SIN USAR (PRESUPUESTO)");
    assert.strictEqual(S.movimientoParaOficina(movs[0]).presupuesto, "4521");
    // Y el cuadre sigue dando
    const todos = Object.keys(repo).filter((k) => /movimientos-/.test(k)).flatMap((k) => repo[k]);
    const inicial = [{ id: "i1", fecha: "2026-11-01T00:00:00Z", tipo: "inicial", c: "23940", cant: 4, a: "dep", unidades: ["A1", "A2", "A3", "A4"] }, { id: "i2", fecha: "2026-11-01T00:00:00Z", tipo: "inicial", c: "20825", cant: 1, a: "dep", unidades: ["T1"] }, { id: "i3", fecha: "2026-11-01T00:00:00Z", tipo: "inicial", c: "20208", cant: 5, a: "dep" }];
    const cu = S.auditarStock(sal, [...inicial, ...todos], repo["stock/catalogo.json"]);
    assert.ok(cu.ok, cu.errores.map((e) => e.texto).join("\n"));
  } finally { global.fetch = fetchViejo; }
});

test("Stock: tablero de control para la oficina: semáforo (envíos trabados, pedidos, para aprobar, retirados sin devolver, garantías, ajustes, cuadre), movimientos, por técnico y reposición; los técnicos no lo ven", async () => {
  const fetchViejo = global.fetch;
  const ahora = Date.now(), hace = (d) => new Date(ahora - d * 864e5).toISOString(), mes = (d) => hace(d).slice(0, 7);
  const movs = [
    { id: "m1", fecha: hace(2), tipo: "entrega", c: "20208", cant: 6, de: "dep", a: "cam:Juan", por: "Melina" },
    { id: "m1r", fecha: hace(2), tipo: "recibido", c: "20208", cant: 6, de: "cam:Juan", a: "tec:Juan" },
    { id: "m2", fecha: hace(1), tipo: "instalado_parte", c: "20208", cant: 2, de: "tec:Juan", a: "cli:Kiosco", por: "Juan" },
    { id: "m3", fecha: hace(10), tipo: "retirado_parte", c: "23940", cant: 1, de: "cli:Bar", a: "tec:Juan", unidades: ["R1"], por: "Juan" },
    { id: "m4", fecha: hace(3), tipo: "devolucion", c: "20208", cant: 1, de: "tec:Pedro", a: "cam:dev:Pedro", por: "Pedro" },
    { id: "m5", fecha: hace(2), tipo: "regularizacion", c: "20208", cant: 1, a: "dep", por: "Seba", motivo: "Conteo" },
    { id: "m6", fecha: hace(20), tipo: "entrega_mano", c: "20208", cant: 30, de: "dep", a: "tec:Pedro", por: "Melina" },
  ];
  const repo = {
    "tecnicos.json": [{ nombre: "Melina", permisos: { stock_responsable: true } }, { nombre: "Brenda", permisos: { dash_deposito: true } }, { nombre: "Juan", permisos: {} }],
    "stock/catalogo.json": { articulos: { 23940: { c: "23940", d: "INFRARROJO AJAX", tipo: "unidad" }, 20208: { c: "20208", d: "SIRENA", tipo: "cantidad", min: 10 }, 99: { c: "99", d: "SIM CLARO", tipo: "sim" } } },
    "stock/saldos.json": {
      inicializado: "2026-10-01",
      ubic: { dep: { 20208: 3, 99: 50 }, "tec:Juan": { 20208: 4, 23940: 1 }, "tec:Pedro": { 20208: 29 }, "cam:dev:Pedro": { 20208: 1 } },
      unidades: { R1: { c: "23940", u: "tec:Juan", h: [{ tipo: "retirado_parte", a: "tec:Juan", f: hace(10) }] }, G1: { c: "23940", u: "gar", garantia: { estado: "por_enviar", desde: hace(12) } } },
      envios: [{ id: "e1", fecha: hace(3), de: "tec:Pedro", a: "dep", camino: "cam:dev:Pedro", items: [{ c: "20208", cant: 1 }] }],
      solicitudes: [{ id: "s1", fecha: hace(2), por: "Juan", estado: "pendiente", items: [{ c: "20208", cant: 2 }] }],
      aprobar: [{ id: "a1", fecha: hace(1), por: "Juan", c: "20208", cant: 1, cliente: "Kiosco", parte: "P-9" }],
      pedidos: {},
    },
    "stock/cuadre.json": { ultimo: { fecha: hace(0.2), ok: true, errores: [], totalErrores: 0 }, historial: [{ fecha: hace(0.2), ok: true, errores: 0 }] },
  };
  movs.forEach((m) => { const k = `stock/movimientos-${m.fecha.slice(0, 7)}.json`; (repo[k] = repo[k] || []).push(m); });
  global.fetch = async (url, op = {}) => {
    const m = String(url).match(/contents\/([^?]+)/);
    if (m) {
      const ruta = decodeURIComponent(m[1]);
      if ((op.method || "GET") === "PUT") { repo[ruta] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString()); return new Response("{}", { status: 200 }); }
      if (!(ruta in repo)) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(repo[ruta])).toString("base64") }));
    }
    return new Response("[]");
  };
  try {
    const ver = async (ses) => { const r = resFalso(); await datos(pedido("GET", { coleccion: "stock", tablero: "1" }, null, ses), r); return r; };
    // Un técnico no lo ve
    let r = await ver(crearSesion({ nombre: "Juan", rol: "tecnico" }));
    assert.strictEqual(r.statusCode, 403);
    // Brenda (oficina, con el permiso), Melina (responsable) y el panel sí
    r = await ver(crearSesion({ nombre: "Melina", rol: "tecnico" }));
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.cuerpo));
    r = await ver(crearSesion({ nombre: "Admin", rol: "admin" }));
    assert.strictEqual(r.statusCode, 200);
    r = await ver(crearSesion({ nombre: "Brenda", rol: "tecnico" }));
    assert.strictEqual(r.statusCode, 200);
    const d = r.cuerpo, al = Object.fromEntries(d.alertas.map((a) => [a.k, a]));
    assert.strictEqual(al.cuadre.nivel, "ok");
    assert.strictEqual(al.camino.cantidad, 1); assert.match(al.camino.items[0].texto, /Pedro.*Depósito/);
    assert.strictEqual(al.pedidos.nivel, "rojo", "pedido sin preparar hace 2 días");
    assert.strictEqual(al.aprobar.cantidad, 1); assert.match(al.aprobar.items[0].sub, /Kiosco · parte P-9/);
    assert.strictEqual(al.retirados.cantidad, 1); assert.match(al.retirados.items[0].texto, /Juan: 1 INFRARROJO AJAX/);
    assert.strictEqual(al.garantias.cantidad, 1); assert.match(al.garantias.items[0].sub, /Sin mandar al proveedor/);
    assert.strictEqual(al.ajustes.cantidad, 1); assert.match(al.ajustes.items[0].sub, /Seba · Conteo/);
    assert.strictEqual(al.reponer.cantidad, 1); assert.match(al.reponer.items[0].sub, /Hay 3 en el depósito \(mínimo 10\)/);
    assert.ok(d.semaforo.rojo >= 1 && d.alertas[0].nivel === "rojo", "lo rojo va primero");
    // Dónde está (sin SIMs)
    assert.deepStrictEqual(d.donde, { dep: 3, tecnicos: 34, vehiculos: 0, camino: 1, garantia: 0 });
    // Movimientos de la semana: entrega 6 (no cuenta la recepción), instalado 2, devuelto 1, ajuste 1
    assert.deepStrictEqual([d.semana.entrega, d.semana.instalado, d.semana.devolucion, d.semana.ajuste], [6, 2, 1, 1]);
    assert.strictEqual(d.mes.entrega, 36);
    assert.strictEqual(d.dias.length, 14);
    const juan = d.personas.find((p) => p.quien === "Juan"), pedro = d.personas.find((p) => p.quien === "Pedro");
    assert.deepStrictEqual([juan.tiene, juan.recibio, juan.instalo, juan.retiro, juan.pedidos], [5, 6, 2, 1, 1]);
    assert.deepStrictEqual([pedro.tiene, pedro.recibio, pedro.devolvio], [29, 30, 1]);
    assert.deepStrictEqual(d.masUsados.map((x) => [x.d, x.cant]), [["SIRENA", 2]]);
    const sir = d.reponer.find((x) => x.c === "20208");
    assert.ok(sir && sir.bajo && sir.salio60 === 36 && sir.dias === 5, JSON.stringify(sir));
    assert.ok(!d.reponer.some((x) => x.c === "99"), "los SIM no se reponen desde acá");
  } finally { global.fetch = fetchViejo; }
});

test("Stock: stock inicial de un técnico desde el panel: queda con lo de la lista sin tocar el depósito, registra N° de serie, no va a Oficina y el control nocturno cuadra", async () => {
  const fetchViejo = global.fetch;
  const S = require(path.join(raiz, "stock-utils.js"));
  const ahora = new Date().toISOString(), mes = ahora.slice(0, 7);
  const repo = {
    "tecnicos.json": [{ nombre: "Juan", permisos: {} }, { nombre: "Melina", permisos: { stock_responsable: true } }],
    "stock/catalogo.json": { articulos: { 20208: { c: "20208", d: "SIRENA", tipo: "cantidad" }, 23940: { c: "23940", d: "INFRARROJO", tipo: "unidad" }, 50001: { c: "50001", d: "CABLE", tipo: "cantidad", medida: "metros" }, 99: { c: "99", d: "SIM", tipo: "sim" } } },
    "stock/saldos.json": { inicializado: "2026-10-01", ubic: { dep: { 20208: 10, 23940: 2 }, "tec:Juan": { 50001: 30 } }, unidades: { D1: { c: "23940", u: "dep" } }, pedidos: {} },
  };
  repo[`stock/movimientos-${mes}.json`] = [
    { id: "i1", fecha: "2026-10-01T00:00:00Z", tipo: "inicial", c: "20208", cant: 10, a: "dep" },
    { id: "i2", fecha: "2026-10-01T00:00:00Z", tipo: "inicial", c: "23940", cant: 2, a: "dep", unidades: ["D1"] },
    { id: "i3", fecha: "2026-10-02T00:00:00Z", tipo: "entrega_mano", c: "50001", cant: 30, de: "dep", a: "tec:Juan" },
  ];
  repo["stock/saldos.json"].ubic.dep[50001] = 0; delete repo["stock/saldos.json"].ubic.dep[50001];
  // (el depósito tenía 30 de cable antes de entregarlos: el inicial del depósito no lo incluye para simplificar)
  repo[`stock/movimientos-${mes}.json`].unshift({ id: "i0", fecha: "2026-10-01T00:00:00Z", tipo: "inicial", c: "50001", cant: 30, a: "dep" });
  global.fetch = async (url, op = {}) => {
    const m = String(url).match(/contents\/([^?]+)/);
    if (m) {
      const ruta = decodeURIComponent(m[1]);
      if ((op.method || "GET") === "PUT") { repo[ruta] = JSON.parse(Buffer.from(JSON.parse(op.body).content, "base64").toString()); return new Response(JSON.stringify({ content: { sha: "n" } }), { status: 200 }); }
      if (!(ruta in repo)) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(JSON.stringify(repo[ruta])).toString("base64") }));
    }
    return new Response("[]");
  };
  const post = async (cuerpo, ses) => { const r = resFalso(); await datos(pedido("POST", { coleccion: "stock" }, cuerpo, ses), r); return r; };
  const admin = crearSesion({ nombre: "Admin", rol: "admin" }), melina = crearSesion({ nombre: "Melina", rol: "tecnico" });
  try {
    const cuerpo = { accion: "stock_inicial_tecnico", tecnico: "Juan", items: [{ c: "20208", cant: 3 }, { c: "23940", cant: 2, series: ["gh1", "GH2"] }, { c: "99", cant: 5 }] };
    assert.strictEqual((await post(cuerpo, melina)).statusCode, 403, "solo desde el panel");
    assert.strictEqual((await post({ ...cuerpo, tecnico: "Nadie" }, admin)).statusCode, 400);
    // Un N° que está en el depósito no se puede asignar
    let r = await post({ ...cuerpo, items: [{ c: "23940", cant: 1, series: ["D1"] }] }, admin);
    assert.strictEqual(r.statusCode, 409); assert.match(r.cuerpo.error, /D1 figura en Depósito/);
    r = await post(cuerpo, admin);
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.cuerpo));
    const sal = repo["stock/saldos.json"];
    assert.deepStrictEqual(sal.ubic["tec:Juan"], { 20208: 3, 23940: 2 }, "queda lo de la lista; el cable (no estaba en la lista) a 0; el SIM no se controla");
    assert.deepStrictEqual(sal.ubic.dep, { 20208: 10, 23940: 2 }, "el depósito no cambia");
    assert.deepStrictEqual([sal.unidades.GH1.u, sal.unidades.GH2.u], ["tec:Juan", "tec:Juan"]);
    assert.ok(sal.stockInicialTec["tec:Juan"].fecha);
    const movs = repo[`stock/movimientos-${mes}.json`].filter((x) => x.tipo === "inicial_tecnico");
    assert.deepStrictEqual(movs.map((x) => [x.c, x.cant, x.de || "", x.a || ""]).sort(), [["20208", 3, "", "tec:Juan"], ["23940", 2, "", "tec:Juan"], ["50001", 30, "tec:Juan", ""]].sort());
    assert.deepStrictEqual(movs.map(S.movimientoParaOficina).filter(Boolean), [], "no va a Oficina");
    const au = S.auditarStock(sal, repo[`stock/movimientos-${mes}.json`], repo["stock/catalogo.json"], { ahora: new Date() });
    assert.deepStrictEqual(au.errores, [], "el control nocturno cuadra");
    // Se vuelve a cargar con un N° más y uno menos de cantidad: sin la opción de reemplazar, lo demás queda
    r = await post({ accion: "stock_inicial_tecnico", tecnico: "Juan", items: [{ c: "20208", cant: 1 }], reemplazar: false }, admin);
    assert.strictEqual(r.statusCode, 200);
    assert.deepStrictEqual(repo["stock/saldos.json"].ubic["tec:Juan"], { 20208: 1, 23940: 2 });
    // No puede quedar menos cantidad que equipos con N°
    r = await post({ accion: "stock_inicial_tecnico", tecnico: "Juan", items: [{ c: "23940", cant: 1 }] }, admin);
    assert.strictEqual(r.statusCode, 409); assert.match(r.cuerpo.error, /quedarían 1 pero tiene 2 con N° de serie/);
    // Vehículo
    r = await post({ accion: "stock_inicial_tecnico", tecnico: "Kangoo gris", vehiculo: true, items: [{ c: "20208", cant: 4 }] }, admin);
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.cuerpo));
    assert.deepStrictEqual(repo["stock/saldos.json"].ubic["veh:Kangoo gris"], { 20208: 4 });
    assert.strictEqual(repo["stock/saldos.json"].ubic.dep[20208], 10);
    // Camioneta (depósito móvil): Juan toma y deja, en el momento
    const juan = crearSesion({ nombre: "Juan", rol: "tecnico" });
    r = await post({ accion: "camioneta", sentido: "tomar", vehiculo: "Kangoo gris", items: [{ c: "20208", cant: 3 }] }, juan);
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.cuerpo));
    assert.deepStrictEqual([repo["stock/saldos.json"].ubic["veh:Kangoo gris"][20208], repo["stock/saldos.json"].ubic["tec:Juan"][20208]], [1, 4]);
    r = await post({ accion: "camioneta", sentido: "dejar", vehiculo: "Kangoo gris", items: [{ c: "20208", cant: 2 }], op_id: "x1" }, juan);
    assert.strictEqual(r.statusCode, 200);
    r = await post({ accion: "camioneta", sentido: "dejar", vehiculo: "Kangoo gris", items: [{ c: "20208", cant: 2 }], op_id: "x1" }, juan);
    assert.ok(r.cuerpo.duplicado, "no se aplica dos veces");
    assert.deepStrictEqual([repo["stock/saldos.json"].ubic["veh:Kangoo gris"][20208], repo["stock/saldos.json"].ubic["tec:Juan"][20208]], [3, 2]);
    assert.strictEqual((await post({ accion: "camioneta", sentido: "tomar", vehiculo: "Kangoo gris", items: [{ c: "20208", cant: 9 }] }, juan)).statusCode, 409);
    assert.strictEqual((await post({ accion: "camioneta", sentido: "tomar", vehiculo: "Fiat", items: [{ c: "20208", cant: 1 }] }, juan)).statusCode, 400);
    assert.strictEqual(repo["stock/saldos.json"].ubic.dep[20208], 10, "el depósito no se toca");
    // Una camioneta que recibió stock del depósito y quedó vacía sigue existiendo: se le puede dejar material
    r = await post({ accion: "mover", de: "dep", a: "veh:Kangoo blanca", items: [{ c: "20208", cant: 1 }] }, admin);
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.cuerpo));
    r = await post({ accion: "camioneta", sentido: "tomar", vehiculo: "Kangoo blanca", items: [{ c: "20208", cant: 1 }] }, juan);
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.cuerpo));
    assert.strictEqual(repo["stock/saldos.json"].ubic["veh:Kangoo blanca"], undefined, "quedó vacía");
    const getMio = resFalso(); await datos(pedido("GET", { coleccion: "stock", mio: 1 }, null, juan), getMio);
    assert.deepStrictEqual(Object.keys(getMio.cuerpo.camionetas).sort(), ["Kangoo blanca", "Kangoo gris"]);
    r = await post({ accion: "camioneta", sentido: "dejar", vehiculo: "Kangoo blanca", items: [{ c: "20208", cant: 1 }] }, juan);
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.cuerpo));
    assert.strictEqual(repo["stock/saldos.json"].ubic.dep[20208], 9);
    assert.deepStrictEqual(S.auditarStock(repo["stock/saldos.json"], repo[`stock/movimientos-${mes}.json`], repo["stock/catalogo.json"], { ahora: new Date() }).errores, []);
    assert.deepStrictEqual(S.auditarStock(repo["stock/saldos.json"], repo[`stock/movimientos-${mes}.json`], repo["stock/catalogo.json"], { ahora: new Date() }).errores, []);
  } finally { global.fetch = fetchViejo; }
});

test("Claves del cliente cargadas por la oficina: solo el panel las carga; se guardan cifradas; se suman a las de los partes (ficha y lista) y el registro no anota la clave", async () => {
  const fetchViejo = global.fetch;
  // historial.js usa nodemailer (para otro mail); acá no hace falta: se reemplaza por uno vacío.
  const Module = require("module"), cargarViejo = Module._load;
  Module._load = function (pedido, ...resto) { return pedido === "nodemailer" ? { createTransport: () => ({ sendMail: async () => ({}) }) } : cargarViejo.call(this, pedido, ...resto); };
  const historial = require(path.join(raiz, "api/historial.js"));
  Module._load = cargarViejo;
  const repo = {};
  const backend = [{ numero_cliente: "1234", cliente: "Kiosco Pérez", claves: [{ titulo: "Código maestro", codigo: "1111" }] }];
  global.fetch = async (url, op = {}) => {
    const u = String(url);
    const m = u.match(/contents\/([^?]+)/);
    if (m) {
      const ruta = decodeURIComponent(m[1]);
      if ((op.method || "GET") === "PUT") { repo[ruta] = Buffer.from(JSON.parse(op.body).content, "base64").toString(); return new Response("{}", { status: 200 }); }
      if (!(ruta in repo)) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: Buffer.from(repo[ruta]).toString("base64") }));
    }
    if (u.includes("/api/partes/claves-cliente")) {
      const n = new URL(u).searchParams.get("numero_cliente");
      return new Response(JSON.stringify(n ? (backend.find((x) => x.numero_cliente === n) || { claves: [] }) : backend));
    }
    return new Response("[]");
  };
  const llamar = async (metodo, query, cuerpo, ses) => { const r = resFalso(); await historial(pedido(metodo, query, cuerpo, ses), r); return r; };
  const admin = crearSesion({ nombre: "Brenda", rol: "admin" }), tec = crearSesion({ nombre: "Juan", rol: "tecnico" });
  try {
    const nueva = { accion: "claves_admin", operacion: "agregar", numero_cliente: "1234", cliente: "Kiosco Pérez", titulo: "Wi-Fi", usuario: "KIOSCO_5G", clave: "secreta-Wifi-2026", nota: "router en el depósito" };
    assert.strictEqual((await llamar("POST", {}, nueva, tec)).statusCode, 403, "un técnico no carga claves en la ficha");
    assert.strictEqual((await llamar("POST", {}, { ...nueva, titulo: "" }, admin)).statusCode, 400);
    let r = await llamar("POST", {}, nueva, admin);
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.cuerpo));
    r = await llamar("POST", {}, { ...nueva, numero_cliente: "999", cliente: "Sin partes", titulo: "Código maestro", clave: "", codigo: "4321" }, admin);
    assert.strictEqual(r.statusCode, 200);
    // En el archivo no está la clave en texto
    assert.ok(!/secreta-Wifi-2026|KIOSCO_5G|4321|router en el/.test(repo["claves-clientes.json"]), "cifradas");
    assert.match(repo["claves-clientes.json"], /"Wi-Fi"/);
    // La ficha de un cliente: primero las de la oficina, después las de los partes
    r = await llamar("GET", { tipo: "claves_cliente", numero_cliente: "1234" }, null, tec);
    assert.deepStrictEqual(r.cuerpo.claves.map((k) => [k.titulo, k.usuario || "", k.clave || "", k.codigo || "", k.origen || "parte"]), [["Wi-Fi", "KIOSCO_5G", "secreta-Wifi-2026", "", "oficina"], ["Código maestro", "", "", "1111", "parte"]]);
    // La lista completa suma el cliente que solo tiene claves de la oficina
    r = await llamar("GET", { tipo: "claves_cliente" }, null, admin);
    assert.deepStrictEqual(r.cuerpo.map((x) => [x.numero_cliente, x.claves.length]).sort(), [["1234", 2], ["999", 1]]);
    // Editar y borrar
    const id = r.cuerpo.find((x) => x.numero_cliente === "1234").claves.find((k) => k.origen === "oficina").id;
    assert.strictEqual((await llamar("POST", {}, { ...nueva, operacion: "editar", id, clave: "nueva-2027" }, admin)).statusCode, 200);
    r = await llamar("GET", { tipo: "claves_cliente", numero_cliente: "1234" }, null, tec);
    assert.strictEqual(r.cuerpo.claves[0].clave, "nueva-2027");
    assert.strictEqual(r.cuerpo.claves[0].por, "Brenda");
    assert.strictEqual((await llamar("POST", {}, { accion: "claves_admin", operacion: "borrar", id, numero_cliente: "1234" }, admin)).statusCode, 200);
    r = await llamar("GET", { tipo: "claves_cliente", numero_cliente: "1234" }, null, tec);
    assert.deepStrictEqual(r.cuerpo.claves.map((k) => k.titulo), ["Código maestro"]);
    // El registro de cambios anota para qué es, nunca la clave
    const log = repo["auditoria.json"] || "";
    assert.match(log, /Cargó claves de un cliente/);
    assert.ok(!/secreta-Wifi|nueva-2027|KIOSCO_5G/.test(log), "el registro no tiene la clave");
    // Si cambia la llave del servidor: no se muestran (ni se rompe la ficha) y no se puede modificar
    process.env.CLAVES_CLIENTES_SECRET = "otra-llave";
    r = await llamar("GET", { tipo: "claves_cliente", numero_cliente: "999" }, null, tec);
    assert.strictEqual(r.statusCode, 200);
    assert.deepStrictEqual(r.cuerpo.claves, []);
    assert.strictEqual((await llamar("POST", {}, { ...nueva, numero_cliente: "999" }, admin)).statusCode, 409);
    delete process.env.CLAVES_CLIENTES_SECRET;
  } finally { global.fetch = fetchViejo; delete process.env.CLAVES_CLIENTES_SECRET; }
});
