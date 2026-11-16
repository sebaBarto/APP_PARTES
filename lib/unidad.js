// Un solo formato de piso y depto, escriba lo que escriba el vecino o el administrador:
// piso "01", "1", "1er", "1°", "Piso 1" → "1"; "0", "00", "PB", "P.B.", "Planta baja" → "PB".
// Depto "A" → "1", "B" → "2"…; "01" → "1"; "00" → "0". Lo demás queda como vino (en mayúsculas).
function normPiso(p) {
  const t = String(p == null ? "" : p).trim().toUpperCase().replace(/[°º.]/g, "").replace(/^PISO\s*/, "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/^(PB|P B|PLANTA BAJA)$/.test(t)) return "PB";
  const m = t.match(/^(\d+)\s*(ER|RO|DO|TO|MO|NO|VO|O)?$/);
  if (m) return Number(m[1]) === 0 ? "PB" : String(Number(m[1]));
  return t;
}
function normDepto(u) {
  const t = String(u == null ? "" : u).trim().toUpperCase().replace(/^(DEPTO|DPTO|DTO|DEPARTAMENTO|UNIDAD)\.?\s*/, "").replace(/\s+/g, "").trim();
  if (/^[A-Z]$/.test(t)) return String(t.charCodeAt(0) - 64);
  if (/^\d+$/.test(t)) return String(Number(t));
  return t;
}
// "PB 1", "3° 2"
const textoUnidad = (piso, depto) => { const p = normPiso(piso), d = normDepto(depto); return `${p ? (p === "PB" ? "PB" : p + "°") : ""} ${d}`.trim(); };
module.exports = { normPiso, normDepto, textoUnidad };
