// Tarjeta de contacto digital de quien asesoró al cliente (va en la vista 3D
// que se le manda). Acá se limpian los datos: textos cortos y links que solo
// pueden ser http(s), así nadie mete un "javascript:" en la página pública.

const texto = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);

function link(v) {
  let u = texto(v, 200);
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/+/, "");
  return /^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s<>"']*)?$/i.test(u) ? u : "";
}
// "@sat365", "sat365", "instagram.com/sat365" o el link completo.
function red(v, dominio) {
  const t = texto(v, 200);
  if (!t) return "";
  if (/^https?:\/\//i.test(t) || t.includes(dominio)) return link(t);
  const usuario = t.replace(/^@/, "");
  return /^[\w.-]{1,60}$/.test(usuario) ? `https://${dominio}/${usuario}` : "";
}
function telefono(v) {
  const t = texto(v, 30).replace(/[^\d+()\s-]/g, "").trim();
  return t.replace(/\D/g, "").length >= 6 ? t : "";
}
function email(v) {
  const t = texto(v, 80).toLowerCase();
  return /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/.test(t) ? t : "";
}

function limpiarTarjeta(t) {
  const x = t && typeof t === "object" ? t : {};
  return { nombre: texto(x.nombre, 60), puesto: texto(x.puesto, 60), telefono: telefono(x.telefono), email: email(x.email) };
}
function limpiarEmpresa(e) {
  const x = e && typeof e === "object" ? e : {};
  return {
    nombre: texto(x.nombre, 60), horarios: texto(x.horarios, 160), telefono: telefono(x.telefono),
    web: link(x.web), instagram: red(x.instagram, "instagram.com"), facebook: red(x.facebook, "facebook.com"),
  };
}
// Lo que va en la vista: la persona y los datos de la empresa. Sin nombre ni
// forma de contacto, no hay tarjeta.
function armarContacto(c) {
  if (!c || typeof c !== "object") return null;
  const p = limpiarTarjeta(c), empresa = limpiarEmpresa(c.empresa);
  if (!p.nombre && !empresa.nombre) return null;
  if (!p.telefono && !p.email && !empresa.telefono && !empresa.web && !empresa.instagram && !empresa.facebook) return null;
  return { ...p, empresa };
}

module.exports = { limpiarTarjeta, limpiarEmpresa, armarContacto };
