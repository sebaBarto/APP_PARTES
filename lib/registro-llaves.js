// ============================================================
// REGISTRO DE LLAVES POR EDIFICIO (QR en el hall)
//
// Un QR por edificio abre registro-llaves.html?e=<codigo>. El vecino
// (propietario o inquilino) carga sus datos y los de su(s) llave(s)
// electrónica(s); la oficina los ve en admin.html → "Registro de llaves"
// y los concilia con lo que hay cargado en la estación de monitoreo.
//
// Se guarda en el mismo repo privado de datos (GITHUB_DATA_REPO):
//   registro-llaves/edificios.json      lista de edificios con su código
//   registro-llaves/<codigo>.json       los registros de ese edificio
// (un archivo por edificio: así dos edificios nunca se pisan al guardar).
//
// No es un archivo nuevo en /api a propósito: el plan Hobby de Vercel
// tiene un tope de 12 funciones. Se llama desde api/datos.js.
// ============================================================
const crypto = require("crypto");

const RUTA_EDIFICIOS = "registro-llaves/edificios.json";
const rutaEdificio = (codigo) => `registro-llaves/${codigo}.json`;
// Último Excel de la estación de monitoreo que se subió para conciliar, con
// lo que se decidió sobre cada fila (dar de baja, borrar, mantener...).
const rutaConciliacion = (codigo) => `registro-llaves/${codigo}.conciliacion.json`;
const DECISIONES = ["", "dar_de_baja", "borrar", "hecho", "mantener"];
const MAX_FILAS_ESTACION = 5000;
// El primer edificio viene precargado, así el QR que se imprime hoy
// sigue sirviendo aunque nunca se haya guardado la lista.
const EDIFICIOS_POR_DEFECTO = [{ codigo: "muelle11-k7p3", nombre: "MUELLE 11", direccion: "", activo: true, creado_en: "2026-11-12T00:00:00.000Z" }];
const ESTADOS = ["pendiente", "conciliada", "baja", "dada_de_baja"];
const MAX_REGISTROS_POR_EDIFICIO = 3000;
const MAX_LLAVES = 6;

const codigoValido = (c) => /^[a-z0-9-]{3,40}$/.test(String(c || ""));
const txt = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
// Lo que llega del formulario público nunca trae caracteres que sirvan para
// inyectar HTML/JS (< > " ` \), aunque el panel igual escapa todo al mostrar.
const txtPublico = (v, n) => txt(String(v == null ? "" : v).replace(/[<>"`\\\u0000-\u001f]/g, ""), n);
const soloTelefono = (v) => txt(String(v == null ? "" : v).replace(/[^0-9+()\-\s]/g, ""), 30);
const soloUsuario = (v) => txt(String(v == null ? "" : v).replace(/[^0-9A-Za-z\-]/g, ""), 15);
const MAIL_VALIDO = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

// ---------- Freno contra abusos del formulario público ----------
// El formulario está en un QR pegado en un hall: cualquiera puede llegar.
// Cada registro gasta llamadas a la API de GitHub, que comparte TODA la APP
// (5.000 por hora): un robot mandando sin parar podría dejar sin servicio a
// los técnicos. Por eso hay varios topes, y casi todos cortan ANTES de tocar
// GitHub:
//  - por IP, en memoria de la función (registros y lecturas por minuto);
//  - total por instancia (aunque cambien de IP);
//  - por IP y por edificio por día, y total por edificio por día (contados
//    sobre lo guardado, así valen aunque la función se reinicie).
const TOPES = {
  postPorIp: { n: 6, ms: 10 * 60 * 1000 },
  getPorIp: { n: 40, ms: 60 * 1000 },
  postTotal: { n: 60, ms: 60 * 1000 },
  porIpPorDia: 15,
  porEdificioPorDia: 400,
};
const memoriaTopes = new Map();
function pasaTope(clave, { n, ms }) {
  const ahora = Date.now();
  const lista = (memoriaTopes.get(clave) || []).filter((t) => ahora - t < ms);
  if (lista.length >= n) { memoriaTopes.set(clave, lista); return false; }
  lista.push(ahora);
  memoriaTopes.set(clave, lista);
  if (memoriaTopes.size > 5000) { for (const k of memoriaTopes.keys()) { memoriaTopes.delete(k); if (memoriaTopes.size < 2500) break; } }
  return true;
}
function ipDe(req) {
  const h = (req && req.headers) || {};
  return String(h["x-real-ip"] || String(h["x-forwarded-for"] || "").split(",")[0] || "").trim().slice(0, 60) || "sin-ip";
}
// Se guarda solo un resumen de la IP (no la IP): sirve para contar envíos sin guardar el dato.
function huellaIp(ip) {
  return crypto.createHash("sha256").update(String(process.env.SESION_SECRET || process.env.SERVICIOS_API_TOKEN || "sat") + "|" + ip).digest("hex").slice(0, 16);
}
// La lista de edificios casi no cambia: se guarda un minuto en memoria para
// no ir a GitHub en cada apertura del QR.
let cacheEdificios = null;
async function edificiosCacheados(gh) {
  if (cacheEdificios && Date.now() - cacheEdificios.t < 60 * 1000) return cacheEdificios.lista;
  const { lista } = await leerEdificios(gh);
  cacheEdificios = { t: Date.now(), lista };
  return lista;
}
const soloTag = (v) => String(v == null ? "" : v).replace(/[^0-9A-Za-z,.:;\-\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
// El número grabado en el tag es casi siempre "3 números : 5 números"
// (ej. 069:02561). Se guarda siempre así, aunque lo escriban con coma,
// punto o espacio; si no tiene esa forma se guarda tal cual lo escribieron.
function normalizarTag(v) {
  const t = soloTag(v);
  if (/^\d{8}$/.test(t)) return `${t.slice(0, 3)}:${t.slice(3)}`; // escrito sin los dos puntos
  const m = t.match(/^(\d{1,3})\s*[:.,;\s]\s*(\d{1,5})$/);
  return m ? `${m[1].padStart(3, "0")}:${m[2].padStart(5, "0")}` : t;
}
const TIPOS_DISPOSITIVO = ["tag", "control"];

function slug(nombre) {
  return String(nombre || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "edificio";
}

async function leerEdificios(gh) {
  const { data, sha } = await gh.leer(RUTA_EDIFICIOS, null);
  return { lista: Array.isArray(data) ? data : EDIFICIOS_POR_DEFECTO.map((e) => ({ ...e })), sha };
}

// Lee, cambia y guarda con reintento (si otro guardó en el medio, GitHub
// responde 409/422 y se vuelve a leer).
async function modificar(gh, ruta, porDefecto, cambiar, mensaje) {
  for (let intento = 0; intento < 6; intento++) {
    const { data, sha } = await gh.leer(ruta, porDefecto);
    // Las listas siempre llegan como lista; los archivos que son un objeto (la conciliación), tal cual.
    const resultado = cambiar(Array.isArray(porDefecto) ? (Array.isArray(data) ? data : porDefecto) : (data == null ? porDefecto : data));
    if (!resultado) return null;
    const r = await gh.escribir(ruta, resultado, sha, mensaje);
    if (r.ok) return resultado;
    if (r.status !== 409 && r.status !== 422) throw new Error("No se pudo guardar (" + r.status + ")");
    await new Promise((ok) => setTimeout(ok, 200 + Math.random() * 400 * (intento + 1)));
  }
  throw new Error("El servidor está ocupado, probá de nuevo");
}

function cuerpo(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b && typeof b === "object" ? b : {};
}

// ---------- Público (sin login) ----------
async function manejarPublico(req, res, gh) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.GITHUB_DATA_TOKEN || !process.env.GITHUB_DATA_REPO) { res.status(500).json({ error: "Falta configuración del servidor" }); return; }

  const ip = ipDe(req);
  if (req.method === "GET") {
    const codigo = String(req.query.e || "").toLowerCase();
    if (!codigoValido(codigo)) { res.status(404).json({ error: "Código de edificio inválido" }); return; }
    if (!pasaTope("g|" + ip, TOPES.getPorIp)) { res.status(429).json({ error: "Demasiados intentos, esperá un minuto" }); return; }
    try {
      const lista = await edificiosCacheados(gh);
      const ed = lista.find((x) => x.codigo === codigo);
      if (!ed || ed.activo === false) { res.status(404).json({ error: "Este código ya no está habilitado" }); return; }
      // Solo nombre y dirección (nada privado): el CDN de Vercel la puede guardar un rato.
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
      res.status(200).json({ nombre: ed.nombre, direccion: ed.direccion || "" });
    } catch (e) { res.status(502).json({ error: "No se pudo cargar" }); }
    return;
  }

  if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
  if (!pasaTope("p|" + ip, TOPES.postPorIp) || !pasaTope("p|total", TOPES.postTotal)) {
    res.status(429).json({ error: "Se mandaron muchos registros seguidos. Esperá unos minutos y probá de nuevo" });
    return;
  }
  const b = cuerpo(req);
  // Campo trampa: los robots lo completan, una persona nunca lo ve.
  if (txt(b.sitio_web, 10)) { res.status(200).json({ ok: true }); return; }
  const codigo = String(b.edificio || "").toLowerCase();
  if (!codigoValido(codigo)) { res.status(400).json({ error: "Código de edificio inválido" }); return; }

  const tipo = ["vivienda", "cochera", "ambas"].includes(b.tipo) ? b.tipo : "";
  const relacion = ["titular", "inquilino", "otro"].includes(b.relacion) ? b.relacion : "";
  const registro = {
    id: Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
    fecha: new Date().toISOString(),
    nombre: txtPublico(b.nombre, 80),
    telefono: soloTelefono(b.telefono),
    email: txt(b.email, 80).toLowerCase(),
    relacion,
    relacion_otro: relacion === "otro" ? txtPublico(b.relacion_otro, 40) : "",
    tipo,
    piso: txtPublico(b.piso, 10),
    unidad: txtPublico(b.unidad, 10),
    cochera: tipo !== "vivienda" ? txtPublico(b.cochera, 15) : "",
    control_remoto: tipo !== "vivienda" && ["si", "no"].includes(b.control_remoto) ? b.control_remoto : "",
    // Cada dispositivo de la persona: tags (llave de la puerta) y/o
    // controles remotos de la cochera. El control puede no tener número
    // visible, por eso es el único que se acepta sin número.
    llaves: (Array.isArray(b.llaves) ? b.llaves : []).slice(0, MAX_LLAVES)
      .map((l) => {
        const disp = TIPOS_DISPOSITIVO.includes(l && l.tipo) ? l.tipo : "tag";
        return { tipo: disp, tag: disp === "tag" ? normalizarTag(l && l.tag) : soloTag(l && l.tag), usuario: soloUsuario(l && l.usuario), estado: "pendiente", nota: "" };
      })
      .filter((l) => l.tag || l.tipo === "control"),
    perdidas: (Array.isArray(b.perdidas) ? b.perdidas : []).slice(0, MAX_LLAVES)
      .map((l) => ({ tipo: TIPOS_DISPOSITIVO.includes(l && l.tipo) ? l.tipo : "tag", tag: normalizarTag(l && l.tag), detalle: txtPublico(l && l.detalle, 200), estado: "baja", nota: "" }))
      .filter((l) => l.tag || l.detalle),
    comentario: txtPublico(b.comentario, 400),
    ip: huellaIp(ip),
  };

  if (!registro.nombre || registro.telefono.replace(/\D/g, "").length < 6) { res.status(400).json({ error: "Faltan el nombre o un teléfono válido" }); return; }
  if (!tipo || !relacion) { res.status(400).json({ error: "Faltan datos del formulario" }); return; }
  if (tipo !== "cochera" && (!registro.piso || !registro.unidad)) { res.status(400).json({ error: "Falta el piso o el departamento" }); return; }
  if (!registro.llaves.length && !registro.perdidas.length) { res.status(400).json({ error: "Falta el número de al menos una llave" }); return; }
  if (registro.llaves.some((l) => l.tipo === "control") && tipo === "vivienda") { res.status(400).json({ error: "El control remoto es solo para cochera" }); return; }
  if (registro.llaves.some((l) => l.tipo === "control")) registro.control_remoto = "si";
  if (registro.email && !MAIL_VALIDO.test(registro.email)) { res.status(400).json({ error: "El mail no parece válido" }); return; }
  if (b.acepta !== true) { res.status(400).json({ error: "Falta aceptar el uso de los datos" }); return; }

  try {
    const lista = await edificiosCacheados(gh);
    const ed = lista.find((x) => x.codigo === codigo);
    if (!ed || ed.activo === false) { res.status(404).json({ error: "Este código ya no está habilitado" }); return; }
    let lleno = false, topeDia = false;
    await modificar(gh, rutaEdificio(codigo), [], (regs) => {
      if (regs.length >= MAX_REGISTROS_POR_EDIFICIO) { lleno = true; return null; }
      const desde = Date.now() - 24 * 60 * 60 * 1000;
      const hoy = regs.filter((r) => Date.parse(r.fecha) > desde);
      if (hoy.length >= TOPES.porEdificioPorDia || hoy.filter((r) => r.ip === registro.ip).length >= TOPES.porIpPorDia) { topeDia = true; return null; }
      regs.push(registro);
      return regs;
    }, `Registro de llaves ${ed.nombre}: ${registro.piso || ""}${registro.unidad ? " " + registro.unidad : ""}`.trim());
    if (lleno || topeDia) { res.status(429).json({ error: topeDia ? "Se alcanzó el máximo de registros por hoy desde esta conexión. Probá mañana o comunicate con SAT" : "No se pudo registrar, comunicate con SAT" }); return; }
    res.status(200).json({ ok: true, edificio: ed.nombre });
  } catch (e) {
    res.status(502).json({ error: "No se pudo registrar, probá de nuevo en un momento" });
  }
}

// ---------- Panel de administración ----------
async function manejarAdmin(req, res, autorizacion, gh) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (!autorizacion || autorizacion.rol !== "admin") { res.status(403).json({ error: "Solo desde el panel de administración" }); return; }
  if (!process.env.GITHUB_DATA_TOKEN || !process.env.GITHUB_DATA_REPO) { res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" }); return; }
  try {
    if (req.method === "GET") {
      const codigo = String(req.query.edificio || "");
      if (codigo) {
        if (!codigoValido(codigo)) { res.status(400).json({ error: "Código inválido" }); return; }
        if (req.query.conciliacion) {
          const { data } = await gh.leer(rutaConciliacion(codigo), null);
          res.status(200).json(data && typeof data === "object" ? data : null);
          return;
        }
        const { data } = await gh.leer(rutaEdificio(codigo), []);
        res.status(200).json(Array.isArray(data) ? data : []);
        return;
      }
      const { lista } = await leerEdificios(gh);
      // Cuántos registros tiene cada uno (para la lista del panel).
      const conConteo = await Promise.all(lista.map(async (e) => {
        try {
          const { data } = await gh.leer(rutaEdificio(e.codigo), []);
          const regs = Array.isArray(data) ? data : [];
          const pendientes = regs.reduce((n, r) => n + (r.llaves || []).concat(r.perdidas || []).filter((l) => l.estado === "pendiente" || l.estado === "baja").length, 0);
          return { ...e, registros: regs.length, pendientes, ultimo: regs.length ? regs[regs.length - 1].fecha : null };
        } catch (err) { return { ...e, registros: null }; }
      }));
      res.status(200).json(conConteo);
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    const b = cuerpo(req);
    const quien = autorizacion.nombre || "admin";

    if (b.accion === "guardar_edificio") {
      const nombre = txt(b.nombre, 60);
      if (!nombre) { res.status(400).json({ error: "Falta el nombre del edificio" }); return; }
      let guardado = null;
      await modificar(gh, RUTA_EDIFICIOS, null, (lista) => {
        const l = Array.isArray(lista) ? lista : EDIFICIOS_POR_DEFECTO.map((e) => ({ ...e }));
        const existente = b.codigo ? l.find((x) => x.codigo === b.codigo) : null;
        if (existente) {
          existente.nombre = nombre;
          existente.direccion = txt(b.direccion, 100);
          existente.activo = b.activo !== false;
          guardado = existente;
        } else {
          // Código con una parte al azar: no se puede adivinar el de otro edificio.
          guardado = { codigo: `${slug(nombre)}-${crypto.randomBytes(2).toString("hex")}`, nombre, direccion: txt(b.direccion, 100), activo: true, creado_en: new Date().toISOString(), creado_por: quien };
          l.push(guardado);
        }
        return l;
      }, `Registro de llaves: edificio ${nombre}`);
      cacheEdificios = null;
      res.status(200).json({ ok: true, edificio: guardado });
      return;
    }

    if (b.accion === "estado_llave" || b.accion === "borrar_registro") {
      const codigo = String(b.edificio || "");
      if (!codigoValido(codigo)) { res.status(400).json({ error: "Código inválido" }); return; }
      if (b.estado !== undefined && !ESTADOS.includes(b.estado)) { res.status(400).json({ error: "Estado inválido" }); return; }
      let encontrado = false;
      await modificar(gh, rutaEdificio(codigo), [], (regs) => {
        const i = regs.findIndex((r) => r.id === b.id);
        if (i < 0) return null;
        encontrado = true;
        if (b.accion === "borrar_registro") { regs.splice(i, 1); return regs; }
        const lista = b.perdida ? regs[i].perdidas : regs[i].llaves;
        const llave = Array.isArray(lista) ? lista[Number(b.indice)] : null;
        if (!llave) { encontrado = false; return null; }
        if (b.estado !== undefined) llave.estado = b.estado;
        if (b.nota !== undefined) llave.nota = txtPublico(b.nota, 200);
        if (b.usuario !== undefined) llave.usuario = soloUsuario(b.usuario);
        llave.revisado_por = quien;
        llave.revisado_en = new Date().toISOString();
        return regs;
      }, `Registro de llaves: ${b.accion === "borrar_registro" ? "borrado" : "conciliación"} (${quien})`);
      if (!encontrado) { res.status(404).json({ error: "No se encontró el registro (¿lo borró otra persona?)" }); return; }
      res.status(200).json({ ok: true });
      return;
    }
    // ---------- Conciliación con la estación de monitoreo ----------
    if (b.accion === "guardar_conciliacion") {
      const codigo = String(b.edificio || "");
      if (!codigoValido(codigo)) { res.status(400).json({ error: "Código inválido" }); return; }
      const filas = (Array.isArray(b.filas) ? b.filas : []).slice(0, MAX_FILAS_ESTACION).map((f) => ({
        tag: soloTag(f && f.tag), usuario: txt(f && f.usuario, 20), nombre: txt(f && f.nombre, 80), apellido: txt(f && f.apellido, 60),
        piso: txt(f && f.piso, 10), depto: txt(f && f.depto, 10), telefono: txt(f && f.telefono, 30), tipo: txt(f && f.tipo, 30), decision: "",
      })).filter((f) => f.tag || f.usuario || f.nombre);
      if (!filas.length) { res.status(400).json({ error: "El archivo no tiene filas con número de llave, de usuario o nombre" }); return; }
      let guardado = null;
      await modificar(gh, rutaConciliacion(codigo), null, (anterior) => {
        // Lo que ya se había decidido sobre una misma llave se mantiene al subir el archivo de nuevo.
        const previas = {};
        if (anterior && Array.isArray(anterior.filas)) anterior.filas.forEach((f) => { if (f.decision) previas[`${f.tag}|${f.usuario}`] = f.decision; });
        filas.forEach((f) => { f.decision = previas[`${f.tag}|${f.usuario}`] || ""; });
        guardado = { fecha: new Date().toISOString(), por: quien, archivo: txt(b.archivo, 120), filas };
        return guardado;
      }, `Registro de llaves: conciliación con la estación (${quien})`);
      res.status(200).json(guardado);
      return;
    }
    if (b.accion === "decision_conciliacion") {
      const codigo = String(b.edificio || "");
      if (!codigoValido(codigo)) { res.status(400).json({ error: "Código inválido" }); return; }
      if (!DECISIONES.includes(b.decision)) { res.status(400).json({ error: "Decisión inválida" }); return; }
      const indices = (Array.isArray(b.indices) ? b.indices : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0);
      let hay = false;
      await modificar(gh, rutaConciliacion(codigo), null, (c) => {
        if (!c || !Array.isArray(c.filas)) return null;
        indices.forEach((i) => { if (c.filas[i]) { c.filas[i].decision = b.decision; c.filas[i].decidido_por = quien; c.filas[i].decidido_en = new Date().toISOString(); hay = true; } });
        return hay ? c : null;
      }, `Registro de llaves: decisión de conciliación (${quien})`);
      if (!hay) { res.status(404).json({ error: "No se encontraron esas filas (¿se subió otro archivo?)" }); return; }
      res.status(200).json({ ok: true });
      return;
    }
    if (b.accion === "estado_lote") {
      const codigo = String(b.edificio || "");
      if (!codigoValido(codigo)) { res.status(400).json({ error: "Código inválido" }); return; }
      const cambios = (Array.isArray(b.cambios) ? b.cambios : []).filter((c) => c && ESTADOS.includes(c.estado));
      if (!cambios.length) { res.status(400).json({ error: "No hay cambios" }); return; }
      let aplicados = 0;
      await modificar(gh, rutaEdificio(codigo), [], (regs) => {
        aplicados = 0;
        cambios.forEach((c) => {
          const r = regs.find((x) => x.id === c.id);
          const lista = r && (c.perdida ? r.perdidas : r.llaves);
          const llave = Array.isArray(lista) ? lista[Number(c.indice)] : null;
          if (!llave) return;
          llave.estado = c.estado;
          if (c.nota !== undefined) llave.nota = txt(c.nota, 200);
          llave.revisado_por = quien;
          llave.revisado_en = new Date().toISOString();
          aplicados++;
        });
        return aplicados ? regs : null;
      }, `Registro de llaves: conciliación en lote (${quien})`);
      res.status(200).json({ ok: true, aplicados });
      return;
    }
    res.status(400).json({ error: "Acción inválida" });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}

module.exports = {
  manejarPublico, manejarAdmin, normalizarTag, EDIFICIOS_POR_DEFECTO, ESTADOS,
  _reiniciarTopes: () => { memoriaTopes.clear(); cacheEdificios = null; },
  // Herramientas compartidas con el portal de administradores de consorcio (lib/consorcio.js).
  util: { txt, txtPublico, soloTelefono, soloUsuario, soloTag, MAIL_VALIDO, codigoValido, modificar, pasaTope, ipDe, cuerpo, leerEdificios, rutaEdificio, edificiosCacheados },
};
