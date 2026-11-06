// Vencimientos de la oficina (matafuegos, seguros, habilitaciones,
// calibraciones, licencias...): lo que no es ni de un vehículo ni una
// credencial, que ya tienen su propio lugar. Acá se limpian los datos y se
// calcula en qué estado está cada uno; lo usan el servidor y el cron diario.
const texto = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const esFecha = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || "")) && !Number.isNaN(new Date(f + "T12:00:00").getTime());
const REPETIR = [0, 1, 2, 3, 6, 12, 24, 36, 60];

function limpiarVencimiento(x, previo) {
  const v = x && typeof x === "object" ? x : {};
  const id = /^[a-z0-9]{6,20}$/.test(String(v.id || "")) ? String(v.id) : Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const repetir = REPETIR.includes(Number(v.repetir)) ? Number(v.repetir) : 0;
  return {
    id,
    nombre: texto(v.nombre, 100),
    categoria: texto(v.categoria, 40) || "Otro",
    fecha: esFecha(v.fecha) ? v.fecha : "",
    aviso_dias: Math.min(365, Math.max(0, Math.round(Number(v.aviso_dias == null || v.aviso_dias === "" ? 30 : v.aviso_dias) || 0))),
    repetir,
    responsable: texto(v.responsable, 60),
    nota: texto(v.nota, 300),
    historial: Array.isArray(previo && previo.historial) ? previo.historial.slice(0, 20) : [],
  };
}
// Días que faltan (negativo: venció hace tantos días) y nivel:
// "vencido", "pronto" (dentro del aviso), "ok" o "sin" (sin fecha).
function estadoVencimiento(fecha, avisoDias, hoy = new Date()) {
  if (!esFecha(fecha)) return { nivel: "sin", dias: null };
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const [y, m, d] = fecha.split("-").map(Number);
  const dias = Math.round((new Date(y, m - 1, d) - h) / 864e5);
  return { dias, nivel: dias < 0 ? "vencido" : dias <= (Number(avisoDias) || 0) ? "pronto" : "ok" };
}
// Fecha + meses, sin pasarse de mes (31/01 + 1 mes = 28 o 29/02).
function sumarMeses(fecha, meses) {
  const [y, m, d] = fecha.split("-").map(Number);
  const base = new Date(y, m - 1 + meses, 1);
  const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(d, ultimo));
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}
// Renovado: la fecha nueva es la que se indica o, si se repite, la misma
// fecha corrida los meses que corresponda. Queda anotado en el historial.
function renovarVencimiento(item, fechaNueva, por, hoy = new Date()) {
  let nueva = esFecha(fechaNueva) ? fechaNueva : "";
  if (!nueva && item.repetir && esFecha(item.fecha)) {
    nueva = sumarMeses(item.fecha, item.repetir);
    // Si estaba muy atrasado, se sigue corriendo hasta que quede en el futuro.
    const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    for (let i = 0; i < 200 && nueva < hoyISO; i++) nueva = sumarMeses(nueva, item.repetir);
  }
  if (!nueva) return null;
  return { ...item, fecha: nueva, historial: [{ antes: item.fecha, nueva, por: texto(por, 60), el: new Date().toISOString() }, ...(item.historial || [])].slice(0, 20) };
}

module.exports = { limpiarVencimiento, estadoVencimiento, renovarVencimiento, sumarMeses, esFecha };
