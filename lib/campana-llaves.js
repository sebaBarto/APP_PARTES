// ============================================================
// CAMPAÑA DE REGISTRO DE LLAVES (por edificio)
//
// Cierra el circuito que promete el cartel del QR: "las llaves que nadie
// registre podrán darse de baja".
//
//   1. SAT abre la campaña con una fecha límite (admin.html). Se le avisa al
//      administrador del consorcio y el formulario del QR muestra la fecha.
//   2. Mientras está abierta, el administrador ve en su portal el avance
//      (cuántas llaves de la estación ya tienen dueño) y puede reenviar el
//      link del registro. 7 días antes del límite le llega un recordatorio.
//   3. Al vencer (o antes, si SAT quiere), se arma la PROPUESTA DE BAJAS: las
//      llaves que están en la estación y que nadie registró (sale del cruce con
//      el Excel de la estación). Le llega al administrador para que la revise.
//   4. El administrador aprueba la baja de cada llave o pide conservarla (con
//      el motivo: "es del encargado", etc.). Lo aprobado queda marcado en la
//      conciliación como "Dar de baja" y a SAT le llega un mail; desde ahí se
//      hace en la estación como cualquier otra baja.
//
// Datos: registro-llaves/<codigo>.campana.json. En edificios.json se guarda
// solo un reflejo { estado, limite } (lo usa el formulario público y el
// resumen del portal sin leer otro archivo).
// El cron diario (api/cron-diario.js) llama a chequearCampanas().
// ============================================================

const rutaCampana = (codigo) => `registro-llaves/${codigo}.campana.json`;
const ESTADOS = ["activa", "en_revision", "aprobada", "cerrada", "cancelada"];
const ABIERTAS = ["activa", "en_revision", "aprobada"];
const DIA = 864e5;
const MAX_PROPUESTA = 1500;
const URL_PORTAL = "https://pedido.sat365.com.ar/consorcio.html";
const URL_REGISTRO = (codigo) => `https://pedido.sat365.com.ar/registro-llaves.html?e=${encodeURIComponent(codigo)}`;

const rl = () => require("./registro-llaves");

// ---------- Fechas (la fecha límite es un día de Argentina) ----------
const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;
const finDelDia = (f) => Date.parse(`${f}T23:59:59-03:00`);
function diasHasta(limite, ahora) { return Math.ceil((finDelDia(limite) - ahora) / DIA); }
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function fechaTexto(f) { const [a, m, d] = String(f).split("-").map(Number); return a && m && d ? `${d} de ${MESES[m - 1]}` : String(f || ""); }

// ---------- Cruce con la estación: el mismo de la conciliación de admin.html (cruce-llaves.js) ----------
const Cruce = require("../cruce-llaves");
function cruzar(registros, filasEstacion) {
  const disp = [];
  (registros || []).forEach((r) => {
    (r.llaves || []).forEach((l, i) => { if (l.estado !== "dada_de_baja") disp.push({ r, l, i, perdida: false }); });
    (r.perdidas || []).forEach((l, i) => disp.push({ r, l, i, perdida: true }));
  });
  return Cruce.cruzar(disp, filasEstacion, registros || []).estacion;
}
const esControlEstacion = Cruce.esControlEstacion;
const claveFila = (f) => `${f.tag || ""}|${f.usuario || ""}`;

// Avance del registro: cuánto de lo que hay en la estación ya tiene dueño.
function progreso(registros, conc) {
  const regs = registros || [];
  const unidades = new Set(regs.map((r) => [r.piso, r.unidad, r.cochera].map((x) => String(x || "").toLowerCase().replace(/\s/g, "")).join("|")));
  const p = { personas: regs.length, unidades: unidades.size, estacion: null };
  const filas = conc && Array.isArray(conc.filas) ? conc.filas : null;
  if (filas && filas.length) {
    // Lo que no es de vecinos (SAT, funciones, proveedores) no cuenta para el avance.
    const cruce = cruzar(regs, filas);
    const vivas = cruce.filter((c) => !["hecho", "borrar"].includes(filas[c.i].decision) && c.res !== "no_vecino");
    const con = vivas.filter((c) => c.res === "encontrada" || c.res === "otra_llave").length;
    p.estacion = { total: vivas.length, con_dueno: con, sin_dueno: vivas.filter((c) => c.res === "no_registrada").length, porcentaje: vivas.length ? Math.round((con / vivas.length) * 100) : 0, archivo_fecha: conc.fecha || null };
  }
  return p;
}

// Llaves que están en la estación y que nadie registró (ni SAT ya decidió qué hacer).
function sinDueno(registros, conc) {
  const filas = conc && Array.isArray(conc.filas) ? conc.filas : [];
  return cruzar(registros, filas)
    .filter((c) => c.res === "no_registrada" && !filas[c.i].decision)
    .map((c) => {
      const f = filas[c.i];
      return {
        k: claveFila(f), tag: f.tag || "", usuario: f.usuario || "",
        nombre: [f.nombre, f.apellido].filter(Boolean).join(" "),
        unidad: [f.piso ? f.piso + "°" : "", f.depto].filter(Boolean).join(" "),
        tipo: esControlEstacion(f) ? "control" : "tag",
      };
    })
    .slice(0, MAX_PROPUESTA);
}

// ---------- Lectura / escritura ----------
async function leerCampana(gh, codigo) {
  const { data } = await gh.leer(rutaCampana(codigo), null);
  return data && typeof data === "object" && ESTADOS.includes(data.estado) ? data : null;
}
// Reflejo en edificios.json (estado y fecha límite, nada privado).
async function reflejar(gh, codigo, c) {
  const { util } = rl();
  await util.modificar(gh, util.RUTA_EDIFICIOS, null, (lista) => {
    const l = Array.isArray(lista) ? lista : rl().EDIFICIOS_POR_DEFECTO.map((e) => ({ ...e }));
    const ed = l.find((e) => e.codigo === codigo);
    if (!ed) return null;
    if (c && ABIERTAS.includes(c.estado)) ed.campana = { estado: c.estado, limite: c.limite };
    else delete ed.campana;
    return l;
  }, `Registro de llaves: campaña ${c ? c.estado : "sin campaña"} (${codigo})`);
  rl().util.olvidarEdificios();
}
async function guardar(gh, codigo, cambiar, mensaje) {
  const { util } = rl();
  let res = null;
  await util.modificar(gh, rutaCampana(codigo), null, (actual) => {
    const nuevo = cambiar(actual && ESTADOS.includes(actual.estado) ? actual : null);
    res = nuevo;
    return nuevo;
  }, mensaje);
  return res;
}
const historial = (c, que, por) => { c.historial = (c.historial || []).concat({ fecha: new Date().toISOString(), que, por }).slice(-100); };

async function datosEdificio(gh, codigo) {
  const { util } = rl();
  const [{ lista }, { data: regs }, { data: conc }] = await Promise.all([
    util.leerEdificiosFresco(gh), gh.leer(util.rutaEdificio(codigo), []), gh.leer(util.rutaConciliacion(codigo), null),
  ]);
  return { ed: lista.find((e) => e.codigo === codigo) || null, regs: Array.isArray(regs) ? regs : [], conc: conc && typeof conc === "object" ? conc : null };
}

// ---------- Mails ----------
async function adminsDelEdificio(gh, codigo) {
  const { data } = await gh.leer("registro-llaves/administradores.json", []);
  return (Array.isArray(data) ? data : []).filter((a) => a && a.activo !== false && (a.edificios || []).includes(codigo) && a.email);
}
async function mailAdmins(gh, codigo, ed, etapa, extra) {
  const admins = await adminsDelEdificio(gh, codigo);
  let n = 0;
  for (const a of admins) {
    const ok = await rl().mandarMail("campana_admin", { para: a.email, nombre: a.nombre, edificio: ed ? ed.nombre : codigo, etapa, portal: URL_PORTAL, link_registro: URL_REGISTRO(codigo), ...extra });
    if (ok) n++;
  }
  return n;
}
async function mailSat(etapa, datos) {
  try {
    if (!process.env.SERVICIOS_API_TOKEN) return false;
    const enviarMail = require("../api/enviar-mail");
    let ok = false;
    const resFalso = { status: (c) => { ok = c === 200; return resFalso; }, json: () => resFalso, setHeader: () => resFalso };
    await enviarMail({ method: "POST", headers: { authorization: `Bearer ${process.env.SERVICIOS_API_TOKEN}` }, body: { tipo: "campana_sat", datos: { etapa, ...datos } } }, resFalso);
    return ok;
  } catch (e) { console.error("No se pudo avisar a SAT de la campaña:", e); return false; }
}
function textoProgreso(p) {
  if (p.estacion) return `${p.estacion.con_dueno} de ${p.estacion.total} llaves de la estación ya tienen dueño (${p.estacion.porcentaje}%). Faltan ${p.estacion.sin_dueno}.`;
  return `${p.personas} ${p.personas === 1 ? "vecino registrado" : "vecinos registrados"} en ${p.unidades} ${p.unidades === 1 ? "unidad" : "unidades"}.`;
}

// ---------- Propuesta de bajas ----------
async function armarPropuesta(gh, codigo, quien, ahora) {
  const { ed, regs, conc } = await datosEdificio(gh, codigo);
  if (!conc || !Array.isArray(conc.filas) || !conc.filas.length) return { error: "Primero hay que subir el Excel de la estación (Conciliación) para saber qué llaves no tienen dueño" };
  const filas = sinDueno(regs, conc);
  const c = await guardar(gh, codigo, (actual) => {
    if (!actual || !["activa", "en_revision"].includes(actual.estado)) return null;
    actual.estado = "en_revision";
    actual.propuesta = { fecha: new Date(ahora).toISOString(), por: quien, filas, archivo_fecha: conc.fecha || null };
    delete actual.respuesta;
    actual.avisos = { ...(actual.avisos || {}), recordatorio_revision: null };
    historial(actual, `Propuesta de bajas: ${filas.length} ${filas.length === 1 ? "llave" : "llaves"} sin dueño`, quien);
    return actual;
  }, `Registro de llaves: propuesta de bajas (${quien})`);
  if (!c) return { error: "La campaña no está abierta" };
  await reflejar(gh, codigo, c);
  const enviados = await mailAdmins(gh, codigo, ed, "revision", { cantidad: filas.length, limite_txt: fechaTexto(c.limite), progreso_txt: textoProgreso(progreso(regs, conc)) });
  return { campana: c, avisados: enviados };
}

// ---------- SAT (admin.html): /api/datos?coleccion=registro_llaves ----------
// GET  ?edificio=X&campana=1                          -> { campana, progreso, sin_dueno (vista previa), hay_estacion }
// POST { accion: "campana_iniciar", edificio, limite, avisar }
// POST { accion: "campana_limite", edificio, limite }
// POST { accion: "campana_propuesta", edificio }       -> arma la propuesta ya (sin esperar la fecha)
// POST { accion: "campana_cerrar" | "campana_cancelar", edificio }
async function manejarAdminSat(req, res, gh, quien) {
  const { util } = rl();
  if (req.method === "GET") {
    const codigo = String(req.query.edificio || "");
    if (!util.codigoValido(codigo)) { res.status(400).json({ error: "Código inválido" }); return; }
    const [c, { regs, conc }] = await Promise.all([leerCampana(gh, codigo), datosEdificio(gh, codigo)]);
    const lista = sinDueno(regs, conc);
    res.status(200).json({ campana: c, progreso: progreso(regs, conc), sin_dueno: lista.length, hay_estacion: !!(conc && conc.filas && conc.filas.length) });
    return;
  }
  const b = util.cuerpo(req);
  const codigo = String(b.edificio || "");
  if (!util.codigoValido(codigo)) { res.status(400).json({ error: "Código inválido" }); return; }
  const ahora = Date.now();

  if (b.accion === "campana_iniciar" || b.accion === "campana_limite") {
    const limite = String(b.limite || "");
    if (!FECHA_VALIDA.test(limite) || !finDelDia(limite)) { res.status(400).json({ error: "Fecha límite inválida" }); return; }
    const dias = diasHasta(limite, ahora);
    if (dias < 1) { res.status(400).json({ error: "La fecha límite tiene que ser a partir de mañana" }); return; }
    if (dias > 180) { res.status(400).json({ error: "La fecha límite no puede ser a más de 6 meses" }); return; }
    const { ed } = await datosEdificio(gh, codigo);
    if (!ed) { res.status(404).json({ error: "No existe ese edificio" }); return; }
    let error = null;
    const c = await guardar(gh, codigo, (actual) => {
      if (b.accion === "campana_iniciar") {
        if (actual && ABIERTAS.includes(actual.estado)) { error = "Ya hay una campaña abierta en este edificio"; return null; }
        // Con 7 días o menos, el aviso de inicio ya hace de recordatorio.
        const nueva = { estado: "activa", inicio: new Date(ahora).toISOString(), limite, abierta_por: quien, avisos: dias <= 7 ? { recordatorio: new Date(ahora).toISOString() } : {} };
        historial(nueva, `Campaña abierta hasta el ${fechaTexto(limite)}`, quien);
        return nueva;
      }
      if (!actual || actual.estado !== "activa") { error = "Solo se puede cambiar la fecha mientras el registro está abierto"; return null; }
      actual.limite = limite;
      actual.avisos = { ...(actual.avisos || {}), recordatorio: dias <= 7 ? new Date(ahora).toISOString() : null, vencida_sat: null };
      historial(actual, `Nueva fecha límite: ${fechaTexto(limite)}`, quien);
      return actual;
    }, `Registro de llaves: campaña (${quien})`);
    if (error) { res.status(409).json({ error }); return; }
    await reflejar(gh, codigo, c);
    let avisados = 0;
    if (b.avisar !== false) {
      const { regs, conc } = await datosEdificio(gh, codigo);
      avisados = await mailAdmins(gh, codigo, ed, b.accion === "campana_iniciar" ? "inicio" : "nueva_fecha", { limite_txt: fechaTexto(limite), dias, progreso_txt: textoProgreso(progreso(regs, conc)) });
      if (avisados) await guardar(gh, codigo, (x) => { if (!x) return null; x.avisos = { ...(x.avisos || {}), inicio: new Date().toISOString() }; return x; }, "Registro de llaves: campaña avisada");
    }
    res.status(200).json({ ok: true, campana: c, avisados });
    return;
  }
  if (b.accion === "campana_propuesta") {
    const r = await armarPropuesta(gh, codigo, quien, ahora);
    if (r.error) { res.status(409).json({ error: r.error }); return; }
    res.status(200).json({ ok: true, campana: r.campana, avisados: r.avisados });
    return;
  }
  if (b.accion === "campana_cerrar" || b.accion === "campana_cancelar") {
    const cerrar = b.accion === "campana_cerrar";
    let error = null;
    const c = await guardar(gh, codigo, (actual) => {
      if (!actual || !ABIERTAS.includes(actual.estado)) { error = "No hay una campaña abierta"; return null; }
      if (cerrar && actual.estado !== "aprobada") { error = "Se cierra cuando el administrador ya respondió la propuesta de bajas (si no, cancelala)"; return null; }
      actual.estado = cerrar ? "cerrada" : "cancelada";
      actual.fin = new Date().toISOString();
      historial(actual, cerrar ? "Campaña cerrada" : "Campaña cancelada", quien);
      return actual;
    }, `Registro de llaves: campaña ${cerrar ? "cerrada" : "cancelada"} (${quien})`);
    if (error) { res.status(409).json({ error }); return; }
    await reflejar(gh, codigo, c);
    res.status(200).json({ ok: true, campana: c });
    return;
  }
  res.status(400).json({ error: "Acción inválida" });
}

// ---------- Portal del administrador de consorcio ----------
// Lo que ve: estado, fecha, avance y (en revisión) la lista para aprobar.
async function paraPortal(gh, codigo, regs) {
  const c = await leerCampana(gh, codigo);
  if (!c || !ABIERTAS.includes(c.estado)) return null;
  const { data: conc } = await gh.leer(rl().util.rutaConciliacion(codigo), null);
  const salida = {
    estado: c.estado, limite: c.limite, limite_txt: fechaTexto(c.limite), dias: diasHasta(c.limite, Date.now()),
    progreso: progreso(regs, conc && typeof conc === "object" ? conc : null), link_registro: URL_REGISTRO(codigo),
  };
  if (c.propuesta) salida.propuesta = { fecha: c.propuesta.fecha, filas: c.propuesta.filas };
  if (c.respuesta) salida.respuesta = { fecha: c.respuesta.fecha, por: c.respuesta.por, bajas: c.respuesta.bajas.length, conservar: c.respuesta.conservar.length };
  return salida;
}

// El administrador responde la propuesta: qué llaves se dan de baja y cuáles se conservan (con motivo).
async function responder(gh, admin, codigo, b) {
  const { util } = rl();
  const bajasPedidas = new Set((Array.isArray(b.bajas) ? b.bajas : []).map(String));
  const conservarPedidas = new Map((Array.isArray(b.conservar) ? b.conservar : []).filter((x) => x && x.k).map((x) => [String(x.k), util.txtPublico(x.motivo, 120)]));
  let error = null, respuesta = null;
  const c = await guardar(gh, codigo, (actual) => {
    if (!actual || actual.estado !== "en_revision" || !actual.propuesta) { error = "Esta propuesta ya no está esperando respuesta"; return null; }
    const filas = actual.propuesta.filas || [];
    const bajas = [], conservar = [];
    for (const f of filas) {
      if (bajasPedidas.has(f.k)) bajas.push(f.k);
      else if (conservarPedidas.has(f.k)) conservar.push({ k: f.k, motivo: conservarPedidas.get(f.k) });
      else { error = "Falta decidir alguna de las llaves de la lista. Recargá la página y probá de nuevo"; return null; }
    }
    respuesta = { fecha: new Date().toISOString(), por: admin.nombre, admin_id: admin.id, bajas, conservar };
    actual.respuesta = respuesta;
    actual.estado = "aprobada";
    historial(actual, `${admin.nombre} aprobó ${bajas.length} ${bajas.length === 1 ? "baja" : "bajas"}${conservar.length ? ` y pidió conservar ${conservar.length}` : ""}`, admin.nombre);
    return actual;
  }, `Registro de llaves: respuesta de ${admin.nombre} a la propuesta de bajas`);
  if (error) return { error };
  // En la conciliación quedan marcadas: lo aprobado, "Dar de baja"; lo que se conserva, "Mantener".
  const bajasSet = new Set(respuesta.bajas), cons = new Map(respuesta.conservar.map((x) => [x.k, x.motivo]));
  await util.modificar(gh, util.rutaConciliacion(codigo), null, (conc) => {
    if (!conc || !Array.isArray(conc.filas)) return null;
    let tocado = false;
    conc.filas.forEach((f) => {
      if (f.decision) return;
      const k = claveFila(f);
      if (bajasSet.has(k)) { f.decision = "dar_de_baja"; f.decidido_por = `${admin.nombre} (campaña)`; f.decidido_en = respuesta.fecha; tocado = true; }
      else if (cons.has(k)) { f.decision = "mantener"; f.nota = cons.get(k) ? "Administrador: " + cons.get(k) : "Lo pidió conservar el administrador"; f.decidido_por = `${admin.nombre} (campaña)`; f.decidido_en = respuesta.fecha; tocado = true; }
    });
    return tocado ? conc : null;
  }, `Registro de llaves: bajas aprobadas por ${admin.nombre}`);
  await reflejar(gh, codigo, c);
  const { lista } = await util.leerEdificiosFresco(gh);
  const ed = lista.find((e) => e.codigo === codigo);
  const filasPorK = new Map((c.propuesta.filas || []).map((f) => [f.k, f]));
  await mailSat("aprobada", {
    edificio: ed ? ed.nombre : codigo, administrador: admin.nombre, bajas: respuesta.bajas.length,
    conservar: respuesta.conservar.map((x) => { const f = filasPorK.get(x.k) || {}; return `${f.tag || f.usuario || "s/n"}${f.nombre ? " (" + f.nombre + ")" : ""}${x.motivo ? " — " + x.motivo : ""}`; }),
  });
  return { ok: true, campana: c };
}

// ---------- Cron diario ----------
// Recordatorio 7 días antes; al vencer, arma la propuesta (o avisa a SAT si falta
// el Excel de la estación); si el administrador no responde en 7 días, se le recuerda.
async function chequearCampanas(gh, ahora) {
  ahora = ahora || Date.now();
  const { util } = rl();
  const { lista } = await util.leerEdificiosFresco(gh);
  const hechos = [];
  for (const ed of lista) {
    if (!ed.campana || !ABIERTAS.includes(ed.campana.estado)) continue;
    try {
      const c = await leerCampana(gh, ed.codigo);
      if (!c) continue;
      const dias = diasHasta(c.limite, ahora);
      const avisos = c.avisos || {};
      const marcar = (k) => guardar(gh, ed.codigo, (x) => { if (!x) return null; x.avisos = { ...(x.avisos || {}), [k]: new Date(ahora).toISOString() }; return x; }, `Registro de llaves: aviso de campaña (${k})`);
      if (c.estado === "activa" && dias <= 0) {
        const { conc } = await datosEdificio(gh, ed.codigo);
        if (conc && Array.isArray(conc.filas) && conc.filas.length) {
          const r = await armarPropuesta(gh, ed.codigo, "Automático (fecha límite)", ahora);
          hechos.push(`${ed.nombre}: propuesta de bajas${r.error ? " (error: " + r.error + ")" : ""}`);
        } else if (!avisos.vencida_sat) {
          await mailSat("vencida_sin_estacion", { edificio: ed.nombre, limite_txt: fechaTexto(c.limite) });
          await marcar("vencida_sat");
          hechos.push(`${ed.nombre}: venció sin Excel de la estación (aviso a SAT)`);
        }
      } else if (c.estado === "activa" && dias <= 7 && !avisos.recordatorio) {
        const { regs, conc } = await datosEdificio(gh, ed.codigo);
        await mailAdmins(gh, ed.codigo, ed, "recordatorio", { limite_txt: fechaTexto(c.limite), dias, progreso_txt: textoProgreso(progreso(regs, conc)) });
        await marcar("recordatorio");
        hechos.push(`${ed.nombre}: recordatorio (${dias} días)`);
      } else if (c.estado === "en_revision" && c.propuesta && ahora - Date.parse(c.propuesta.fecha) > 7 * DIA && !avisos.recordatorio_revision) {
        await mailAdmins(gh, ed.codigo, ed, "recordatorio_revision", { cantidad: (c.propuesta.filas || []).length, limite_txt: fechaTexto(c.limite) });
        await marcar("recordatorio_revision");
        hechos.push(`${ed.nombre}: recordatorio de revisión`);
      }
    } catch (e) { hechos.push(`${ed.nombre}: error ${e.message || e}`); }
  }
  return hechos;
}

// Acceso directo a GitHub para el cron (el resto lo recibe desde api/datos.js).
function ghDirecto() {
  const url = (ruta) => `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${ruta}`;
  const h = (extra) => ({ Authorization: `Bearer ${process.env.GITHUB_DATA_TOKEN}`, Accept: "application/vnd.github+json", ...(extra || {}) });
  return {
    async leer(ruta, porDefecto) {
      const r = await fetch(url(ruta), { headers: h() });
      if (r.status === 404) return { data: porDefecto, sha: undefined };
      if (!r.ok) throw new Error("No se pudo leer " + ruta);
      const meta = await r.json();
      let texto;
      if (meta.content && meta.encoding === "base64") texto = Buffer.from(meta.content, "base64").toString("utf-8");
      else { const raw = await fetch(url(ruta), { headers: h({ Accept: "application/vnd.github.raw" }) }); texto = await raw.text(); }
      try { return { data: JSON.parse(texto), sha: meta.sha }; } catch (e) { return { data: porDefecto, sha: meta.sha }; }
    },
    escribir(ruta, data, sha, mensaje) {
      return fetch(url(ruta), { method: "PUT", headers: h({ "Content-Type": "application/json" }), body: JSON.stringify({ message: mensaje, content: Buffer.from(JSON.stringify(data)).toString("base64"), sha }) });
    },
  };
}

module.exports = { manejarAdminSat, paraPortal, responder, chequearCampanas, ghDirecto, cruzar, sinDueno, progreso, fechaTexto, diasHasta, rutaCampana };
