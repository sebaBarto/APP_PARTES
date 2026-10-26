// Sesiones firmadas por persona.
//
// Antes, la app y admin.html mandaban en cada pedido una clave fija
// (SERVICIOS_API_TOKEN) que estaba escrita en el código de la página —
// cualquiera que la copiara podía usar la API sin pasar por el login.
// Ahora el login, si la contraseña es correcta, devuelve un "pase"
// propio de esa persona: nombre + rol + vencimiento, firmado con un
// secreto que solo conoce el servidor. Sin el secreto no se puede
// fabricar ni modificar un pase.
//
// La clave fija sigue existiendo, pero SOLO del lado del servidor
// (variable de entorno): la usan los procesos internos (mails
// internos, el script de planos de la oficina). Nunca más en el navegador.
const crypto = require("crypto");

const DIAS_VIGENCIA = 30;

function secreto() {
  // SESION_SECRET es opcional: si no está, se deriva de la clave del
  // servidor. Al cambiar esa clave, todas las sesiones viejas dejan de valer.
  return process.env.SESION_SECRET || process.env.SERVICIOS_API_TOKEN || "";
}
function firmar(texto) {
  return crypto.createHmac("sha256", "sat-sesion-v1:" + secreto()).update(texto).digest("base64url");
}
function igualSeguro(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function crearSesion({ nombre, rol }) {
  if (!secreto()) return "";
  const datos = Buffer.from(JSON.stringify({ n: nombre || "", r: rol || "tecnico", e: Date.now() + DIAS_VIGENCIA * 864e5 })).toString("base64url");
  return `s1.${datos}.${firmar(datos)}`;
}

function leerSesion(token) {
  if (!token || !secreto() || !token.startsWith("s1.")) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [, datos, firma] = partes;
  if (!igualSeguro(firma, firmar(datos))) return null;
  try {
    const d = JSON.parse(Buffer.from(datos, "base64url").toString("utf-8"));
    if (!d.e || d.e < Date.now()) return null;
    return { nombre: d.n, rol: d.r, vence: d.e };
  } catch (e) {
    return null;
  }
}

// Devuelve quién hace el pedido, o null si no está autorizado:
//  - { tipo: "sesion", nombre, rol }  -> una persona logueada
//  - { tipo: "servicio", rol: "admin" } -> un proceso interno con la clave del servidor
function autorizar(req) {
  const header = (req.headers && (req.headers["authorization"] || req.headers.Authorization)) || "";
  const token = String(header).replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const sesion = leerSesion(token);
  if (sesion) return { tipo: "sesion", ...sesion };
  const fija = process.env.SERVICIOS_API_TOKEN;
  if (fija && igualSeguro(token, fija)) return { tipo: "servicio", nombre: "", rol: "admin" };
  return null;
}

module.exports = { crearSesion, leerSesion, autorizar };
