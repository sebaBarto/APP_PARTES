// Seguimiento de las propuestas 3D mandadas a clientes: a quién conviene
// llamar y por qué. Lo usan el cron (recordatorios por push) y la app.
const DIA = 24 * 60 * 60 * 1000;
function seguimientoPropuesta(v, ahora) {
  if (!v || v.estado === "ganada" || v.estado === "perdida") return null;
  const t = ahora || Date.now();
  const ap = Number(v.aperturas) || 0;
  const ultima = Date.parse(v.ultima || "") || 0, enviada = Date.parse(v.fecha || "") || t;
  const llamadas = Array.isArray(v.llamadas) ? v.llamadas : [];
  if (llamadas.length && !v.llamada_atendida) return { regla: "llamar", prioridad: 1, texto: `Pidió que lo llamen: ${llamadas[llamadas.length - 1].telefono}` };
  if (ap >= 2 && t - ultima < 3 * DIA) return { regla: "caliente", prioridad: 2, texto: `La miró ${ap} veces: buen momento para llamarlo` };
  if (ap === 0 && t - enviada > 2 * DIA) return { regla: "sin_abrir", prioridad: 3, texto: `Hace ${Math.floor((t - enviada) / DIA)} días que se la mandaste y todavía no la abrió` };
  if (ap > 0 && t - ultima > 5 * DIA) return { regla: "enfriando", prioridad: 4, texto: `Hace ${Math.floor((t - ultima) / DIA)} días que no la mira` };
  return null;
}
module.exports = { seguimientoPropuesta };
