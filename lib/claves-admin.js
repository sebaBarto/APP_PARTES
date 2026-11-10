// Claves y códigos de los clientes cargados por la oficina (desde el panel), además de las que los
// técnicos cargan en los partes. Se guardan en el repo de datos (privado) en «claves-clientes.json»,
// con el usuario, la clave, el código y la nota CIFRADOS (AES-256-GCM): en el archivo solo se ve el
// título. La llave sale de CLAVES_CLIENTES_SECRET (o, si no está, de SESION_SECRET / la clave del
// servidor). Si esa variable cambia, las claves ya guardadas no se pueden leer: por eso se guarda la
// huella de la llave y se avisa en vez de mostrar basura.
const crypto = require("crypto");

const RUTA = "claves-clientes.json";
const url = (ruta) => `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${ruta}`;
const headers = (extra) => ({ Authorization: `Bearer ${process.env.GITHUB_DATA_TOKEN}`, Accept: "application/vnd.github+json", ...(extra || {}) });

function secreto() { return process.env.CLAVES_CLIENTES_SECRET || process.env.SESION_SECRET || process.env.SERVICIOS_API_TOKEN || ""; }
function llave() { return crypto.createHash("sha256").update("sat-claves-clientes-v1:" + secreto()).digest(); }
function huella() { return crypto.createHash("sha256").update("huella:" + llave().toString("hex")).digest("hex").slice(0, 16); }
function cifrar(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", llave(), iv);
  const txt = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), txt]).toString("base64");
}
function descifrar(b64) {
  const b = Buffer.from(String(b64 || ""), "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", llave(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
}
const numeroCliente = (n) => String(n == null ? "" : n).replace(/\s+/g, "").replace(/^0+(?=\d)/, "").slice(0, 30);

async function leerArchivo() {
  const r = await fetch(url(RUTA), { headers: headers() });
  if (r.status === 404) return { data: { clientes: {} }, sha: null };
  if (!r.ok) throw new Error(`No se pudieron leer las claves (${r.status})`);
  const meta = await r.json();
  let texto;
  if (meta.content && meta.encoding === "base64") texto = Buffer.from(meta.content, "base64").toString("utf-8");
  else { const r2 = await fetch(url(RUTA), { headers: headers({ Accept: "application/vnd.github.raw" }) }); if (!r2.ok) throw new Error(`No se pudieron leer las claves (${r2.status})`); texto = await r2.text(); }
  return { data: JSON.parse(texto), sha: meta.sha };
}

// Todas, descifradas: { [numero_cliente]: { cliente, claves: [{ id, titulo, usuario, clave, codigo, nota, por, fecha, origen }] } }
async function leerClavesAdmin() {
  if (!process.env.GITHUB_DATA_REPO || !secreto()) return { clientes: {}, ilegibles: 0 };
  const { data } = await leerArchivo();
  const out = {};
  let ilegibles = 0;
  const llaveOk = !data.huella || data.huella === huella();
  Object.entries((data && data.clientes) || {}).forEach(([num, c]) => {
    const claves = (c.items || []).map((x) => {
      let s = {};
      if (llaveOk) { try { s = descifrar(x.enc); } catch (e) { ilegibles++; return null; } } else { ilegibles++; return null; }
      return { id: x.id, titulo: x.titulo, usuario: s.usuario || "", clave: s.clave || "", codigo: s.codigo || "", nota: s.nota || "", por: x.por, fecha: x.fecha, origen: "oficina" };
    }).filter(Boolean);
    out[num] = { numero_cliente: num, cliente: c.cliente || "", claves };
  });
  return { clientes: out, ilegibles };
}

// Agrega, cambia o borra una clave de un cliente. op: { accion: "agregar"|"editar"|"borrar", numero_cliente, cliente, id, titulo, usuario, clave, codigo, nota }
async function guardarClaveAdmin(op, quien) {
  const num = numeroCliente(op.numero_cliente);
  if (!num) throw Object.assign(new Error("Falta el N° de cliente"), { status: 400 });
  const limpio = (v, n) => String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").trim().slice(0, n);
  const titulo = limpio(op.titulo, 80), datos = { usuario: limpio(op.usuario, 120), clave: limpio(op.clave, 160), codigo: limpio(op.codigo, 120), nota: limpio(op.nota, 300) };
  if (op.accion !== "borrar") {
    if (!titulo) throw Object.assign(new Error("Poné para qué es (ej: Código maestro, Wi-Fi, App Ajax)"), { status: 400 });
    if (!datos.usuario && !datos.clave && !datos.codigo) throw Object.assign(new Error("Cargá al menos el usuario, la clave o el código"), { status: 400 });
  }
  for (let intento = 0; intento < 4; intento++) {
    const { data, sha } = await leerArchivo();
    const base = data && typeof data === "object" ? data : { clientes: {} };
    if (base.huella && base.huella !== huella()) throw Object.assign(new Error("Las claves guardadas se cifraron con otra llave del servidor (cambió CLAVES_CLIENTES_SECRET / SESION_SECRET): no se pueden modificar hasta volver a la anterior"), { status: 409 });
    const clientes = { ...(base.clientes || {}) };
    const c = { cliente: limpio(op.cliente, 120) || (clientes[num] || {}).cliente || "", items: [...((clientes[num] || {}).items || [])] };
    const ahora = new Date().toISOString();
    if (op.accion === "agregar") c.items.push({ id: crypto.randomBytes(6).toString("hex"), titulo, enc: cifrar(datos), por: quien || "Oficina", fecha: ahora });
    else {
      const i = c.items.findIndex((x) => x.id === op.id);
      if (i < 0) throw Object.assign(new Error("Esa clave ya no existe (¿la borró otra persona?)"), { status: 404 });
      if (op.accion === "borrar") c.items.splice(i, 1);
      else c.items[i] = { ...c.items[i], titulo, enc: cifrar(datos), por: quien || "Oficina", fecha: ahora };
    }
    if (c.items.length) clientes[num] = c; else delete clientes[num];
    const nuevo = { version: 1, huella: huella(), clientes };
    const r = await fetch(url(RUTA), {
      method: "PUT",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: `Claves: ${op.accion} en cliente ${num} (por ${quien || "Oficina"})`, content: Buffer.from(JSON.stringify(nuevo, null, 1)).toString("base64"), ...(sha ? { sha } : {}) }),
    });
    if (r.ok) return { ok: true };
    if (r.status !== 409 && r.status !== 422) throw new Error(`No se pudo guardar (${r.status})`);
  }
  throw new Error("No se pudo guardar: probá de nuevo");
}

// Junta las de los partes (backend) con las de la oficina.
function unirClaves(deBackend, admin, numero) {
  const num = numero ? numeroCliente(numero) : "";
  if (num) {
    const b = deBackend && typeof deBackend === "object" && !Array.isArray(deBackend) ? deBackend : {};
    const extra = (admin[num] || {}).claves || [];
    return { ...b, numero_cliente: b.numero_cliente || num, claves: [...extra, ...(Array.isArray(b.claves) ? b.claves : [])] };
  }
  const lista = Array.isArray(deBackend) ? deBackend.map((x) => ({ ...x, claves: Array.isArray(x.claves) ? [...x.claves] : [] })) : [];
  Object.values(admin).forEach((a) => {
    const x = lista.find((y) => numeroCliente(y.numero_cliente) === a.numero_cliente);
    if (x) { x.claves = [...a.claves, ...x.claves]; if (!x.cliente) x.cliente = a.cliente; }
    else lista.push({ numero_cliente: a.numero_cliente, cliente: a.cliente, claves: [...a.claves] });
  });
  return lista;
}

module.exports = { leerClavesAdmin, guardarClaveAdmin, unirClaves, numeroCliente, _cifrar: cifrar, _descifrar: descifrar };
