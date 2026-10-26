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
