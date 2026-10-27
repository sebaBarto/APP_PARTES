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
  for (const archivo of ["app.js", "admin.html", "README.md", "sims-utils.js"]) {
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
    await datos(pedido("POST", { coleccion: "presupuestos_express" }, { accion: "nuevo", cliente: "Otro", total: 5 }, admin), r);
    assert.strictEqual(r.cuerpo.numero, "E-0002");
    assert.deepStrictEqual(archivos["presupuestos-express.json"].presupuestos.map((p) => [p.numero, p.emitido_por]), [["E-0002", "Oficina"], ["E-0001", "Juan"]]);
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
