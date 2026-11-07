// Cuadre del stock: recalcula todo desde el historial de movimientos y lo compara con el saldo
// guardado (ver auditarStock en stock-utils.js). Lo usan el cron diario (control nocturno, avisa
// al administrador si algo no da) y el panel (botón «Controlar ahora»). Solo lee; el resultado se
// guarda en stock/cuadre.json.
const S = require("../stock-utils.js");

const RUTA_CUADRE = "stock/cuadre.json";
const url = (ruta) => `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${ruta}`;
const headers = (extra) => ({ Authorization: `Bearer ${process.env.GITHUB_DATA_TOKEN}`, Accept: "application/vnd.github+json", ...(extra || {}) });

// Lee un archivo del repo de datos (también los de más de 1 MB). Si existe pero no se puede leer, falla:
// un historial a medias daría un cuadre falso.
async function leer(ruta, porDefecto) {
  const r = await fetch(url(ruta), { headers: headers() });
  if (r.status === 404) return { data: porDefecto, sha: null };
  if (!r.ok) throw new Error(`No se pudo leer ${ruta} (${r.status})`);
  const meta = await r.json();
  let texto;
  if (meta.content && meta.encoding === "base64") texto = Buffer.from(meta.content, "base64").toString("utf-8");
  else {
    const r2 = await fetch(url(ruta), { headers: headers({ Accept: "application/vnd.github.raw" }) });
    if (!r2.ok) throw new Error(`No se pudo leer ${ruta} (${r2.status})`);
    texto = await r2.text();
  }
  try { return { data: JSON.parse(texto), sha: meta.sha }; } catch (e) { throw new Error(`El archivo ${ruta} está dañado (no es JSON válido)`); }
}
async function listar(carpeta) {
  const r = await fetch(url(carpeta), { headers: headers() });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`No se pudo listar ${carpeta} (${r.status})`);
  const d = await r.json();
  return Array.isArray(d) ? d.map((x) => x.name) : [];
}

// Lee todo lo que hace falta para el cuadre. Si el saldo cambió mientras se leía (alguien estaba
// operando), lo dice con «estable: false».
async function leerParaCuadre() {
  const sal1 = await leer("stock/saldos.json", null);
  if (!sal1.data || !sal1.data.inicializado) return { sinStock: true };
  const { data: cat } = await leer("stock/catalogo.json", { articulos: {} });
  const archivos = (await listar("stock")).filter((n) => /^movimientos-\d{4}-\d{2}\.json$/.test(n)).sort();
  const movs = [];
  for (const n of archivos) {
    const { data } = await leer(`stock/${n}`, []);
    if (!Array.isArray(data)) throw new Error(`El historial ${n} no tiene el formato esperado`);
    movs.push(...data);
  }
  const sal2 = await leer("stock/saldos.json", null);
  return { saldos: sal2.data, catalogo: cat, movimientos: movs, archivos, estable: sal1.sha === sal2.sha };
}
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Hace el cuadre (si no cuadra, lo repite una vez, por si justo alguien estaba operando).
async function cuadrarStock(ahora) {
  const fecha = ahora || new Date();
  let ultimo = null;
  for (let intento = 0; intento < 3; intento++) {
    const x = await leerParaCuadre();
    if (x.sinStock) return { fecha: fecha.toISOString(), sinStock: true, ok: true, errores: [], avisos: [], revisados: {} };
    const r = S.auditarStock(x.saldos, x.movimientos, x.catalogo, { ahora: fecha });
    ultimo = { fecha: fecha.toISOString(), ok: r.ok, errores: r.errores.slice(0, 100).map(({ k, texto, c, ubic, serie }) => ({ k, texto, ...(c ? { c } : {}), ...(ubic ? { ubic } : {}), ...(serie ? { serie } : {}) })), totalErrores: r.errores.length, avisos: r.avisos.slice(0, 30), revisados: { ...r.revisados, archivos: x.archivos.length } };
    if (x.estable && (r.ok || intento > 0)) return ultimo;
    await esperar(intento ? 4000 : 1500);
  }
  return ultimo;
}

// Firma de los problemas (para no repetir el mismo aviso todos los días).
const firmaCuadre = (r) => (r && !r.ok ? (r.errores || []).map((e) => e.texto).sort().join("|").slice(0, 2000) : "");

// Guarda el resultado: el último y un historial corto. Devuelve lo guardado (con «avisado» al día).
async function guardarCuadre(resultado, cambiarAvisado) {
  for (let i = 0; i < 4; i++) {
    const { data, sha } = await leer(RUTA_CUADRE, {});
    const prev = data && typeof data === "object" ? data : {};
    const historial = [{ fecha: resultado.fecha, ok: resultado.ok, errores: resultado.totalErrores || 0, por: resultado.por || "control nocturno" }, ...(prev.historial || [])].slice(0, 60);
    const nuevo = { ultimo: resultado, historial, avisado: cambiarAvisado ? cambiarAvisado(prev.avisado || null) : prev.avisado || null };
    const r = await fetch(url(RUTA_CUADRE), {
      method: "PUT",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: `Stock: cuadre ${resultado.ok ? "OK" : `con ${resultado.totalErrores} problema(s)`} (${resultado.por || "control nocturno"})`, content: Buffer.from(JSON.stringify(nuevo)).toString("base64"), ...(sha ? { sha } : {}) }),
    });
    if (r.ok) return nuevo;
    if (r.status !== 409 && r.status !== 422) throw new Error(`No se pudo guardar el cuadre (${r.status})`);
  }
  throw new Error("No se pudo guardar el cuadre");
}

module.exports = { leerParaCuadre, cuadrarStock, guardarCuadre, firmaCuadre, leerCuadre: () => leer(RUTA_CUADRE, {}), RUTA_CUADRE };
