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
const Cruce = require("../cruce-llaves");

const RUTA_EDIFICIOS = "registro-llaves/edificios.json";
const rutaEdificio = (codigo) => `registro-llaves/${codigo}.json`;
// Último Excel de la estación de monitoreo que se subió para conciliar, con
// lo que se decidió sobre cada fila (dar de baja, borrar, mantener...).
const rutaConciliacion = (codigo) => `registro-llaves/${codigo}.conciliacion.json`;
const DECISIONES = ["", "dar_de_baja", "borrar", "hecho", "mantener"];

// ---------- Fotos de las llaves ----------
// Privadas: van al repo de datos en registro-llaves/fotos/<edificio>/<id>.jpg
// y solo se pueden ver con el pase de SAT o con el del administrador de ese
// edificio (nunca por un link público: una foto del número sirve para copiar la llave).
// El celular las achica y las vuelve a codificar antes de subirlas (eso borra
// los metadatos, como la ubicación GPS). Acá se controla que sea un JPEG y su tamaño.
const MAX_FOTO_BYTES = 560 * 1024;
const rutaFoto = (codigo, id) => `registro-llaves/fotos/${codigo}/${id}.jpg`;
const fotoIdValido = (id) => /^[a-f0-9]{20}$/.test(String(id || ""));
function decodificarFoto(v) {
  const b64 = String(v || "").replace(/^data:image\/jpeg;base64,/, "");
  if (!b64 || b64.length > Math.ceil(MAX_FOTO_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return null;
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 1500 || buf.length > MAX_FOTO_BYTES) return null;
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return null; // tiene que ser JPEG
  return buf;
}
function headersGh(extra) {
  return { Authorization: `Bearer ${process.env.GITHUB_DATA_TOKEN}`, Accept: "application/vnd.github+json", ...(extra || {}) };
}
const urlGh = (ruta) => `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${ruta}`;
// Se pueden reemplazar en los tests.
const fotosGh = {
  async subir(ruta, buf) {
    const r = await fetch(urlGh(ruta), { method: "PUT", headers: headersGh({ "Content-Type": "application/json" }), body: JSON.stringify({ message: "Foto de llave", content: buf.toString("base64") }) });
    if (!r.ok) throw new Error("No se pudo guardar la foto");
  },
  async leer(ruta) {
    const r = await fetch(urlGh(ruta), { headers: headersGh({ Accept: "application/vnd.github.raw" }) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  },
  async borrar(ruta) {
    const m = await fetch(urlGh(ruta), { headers: headersGh() });
    if (!m.ok) return;
    const { sha } = await m.json();
    await fetch(urlGh(ruta), { method: "DELETE", headers: headersGh({ "Content-Type": "application/json" }), body: JSON.stringify({ message: "Foto de llave borrada", sha }) });
  },
};
async function guardarFoto(codigo, buf) {
  const id = crypto.randomBytes(10).toString("hex");
  await fotosGh.subir(rutaFoto(codigo, id), buf);
  return id;
}
async function enviarFoto(res, codigo, id) {
  if (!codigoValido(codigo) || !fotoIdValido(id)) { res.status(400).json({ error: "Foto inválida" }); return; }
  const buf = await fotosGh.leer(rutaFoto(codigo, id));
  if (!buf) { res.status(404).json({ error: "No se encontró la foto" }); return; }
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(buf);
}
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
// Al volver a cruzar (otro Excel, la placa) se mantiene lo ya decidido sobre cada llave:
// primero por N° de llave + usuario, después solo por usuario o solo por llave.
function conservarDecisiones(anterior, filas) {
  const exacta = {}, porU = {}, porT = {};
  const kt = (f) => (f && f.tag ? Cruce.claveTag(f.tag) : ""), ku = (f) => Cruce.claveUsuario(f && f.usuario);
  ((anterior && anterior.filas) || []).forEach((f) => {
    if (!f.decision) return;
    const d = { decision: f.decision, decidido_por: f.decidido_por, decidido_en: f.decidido_en };
    exacta[kt(f) + "|" + ku(f)] = d;
    if (ku(f)) porU[ku(f)] = porU[ku(f)] || d;
    if (kt(f)) porT[kt(f)] = porT[kt(f)] || d;
  });
  return filas.map((f) => {
    const d = exacta[kt(f) + "|" + ku(f)] || (ku(f) && porU[ku(f)]) || (kt(f) && porT[kt(f)]) || null;
    const g = { ...f, decision: d ? d.decision : "" };
    if (d && d.decidido_por) { g.decidido_por = d.decidido_por; g.decidido_en = d.decidido_en; } else { delete g.decidido_por; delete g.decidido_en; }
    return g;
  });
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
// ---------- Mismo vecino que vuelve a registrarse ----------
// Si ya hay alguien en la misma unidad que es la misma persona, se actualiza
// ese registro en vez de crear otro.
const normTexto = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ultimos8 = (t) => String(t || "").replace(/\D/g, "").slice(-8);
function mismaPersona(r, n) {
  const unidad = (n.piso || n.unidad)
    ? normTexto(r.piso) === normTexto(n.piso) && normTexto(r.unidad) === normTexto(n.unidad)
    : !!n.cochera && normTexto(r.cochera) === normTexto(n.cochera);
  if (!unidad) return false;
  // Mismo nombre, o mismo teléfono y mismo primer nombre (una pareja que comparte
  // el teléfono sigue siendo dos personas distintas).
  const tel = ultimos8(n.telefono);
  const primero = (x) => normTexto(String(x || "").trim().split(/\s+/)[0]);
  return normTexto(r.nombre) === normTexto(n.nombre) || (tel.length >= 6 && ultimos8(r.telefono) === tel && primero(r.nombre) === primero(n.nombre));
}
function fusionar(r, n) {
  ["nombre", "telefono", "relacion", "relacion_otro", "cochera"].forEach((k) => { if (n[k]) r[k] = n[k]; });
  // Si ya tenía cochera y ahora marcó solo vivienda, no se le pierde la cochera.
  if (n.tipo) r.tipo = r.cochera && n.tipo === "vivienda" ? "ambas" : n.tipo;
  if (n.email) r.email = n.email;
  r.llaves = r.llaves || [];
  const cambios = [];
  n.llaves.forEach((l) => {
    const k = normalizarTag(l.tag);
    const igual = k ? r.llaves.find((x) => x.estado !== "dada_de_baja" && normalizarTag(x.tag) === k) : null;
    if (igual) {
      if (l.usuario && !igual.usuario) igual.usuario = l.usuario;
      if (l.foto && !igual.foto) igual.foto = l.foto;
    } else if (r.llaves.length < 12) { r.llaves.push(l); cambios.push(`sumó ${l.tipo === "control" ? "control" : "llave"} ${l.tag || "s/n"}`); }
  });
  if (n.perdidas.length) { r.perdidas = (r.perdidas || []).concat(n.perdidas); cambios.push(`reportó ${n.perdidas.length} perdida(s)`); }
  if (n.comentario) r.comentario = [r.comentario, n.comentario].filter(Boolean).join(" / ").slice(0, 800);
  r.actualizado = n.fecha;
  r.historial = (r.historial || []).concat({ fecha: n.fecha, que: `Volvió a registrarse por el QR${cambios.length ? ": " + cambios.join(", ") : " (actualizó sus datos)"}`, por: "Vecino (QR)" });
}

// ---------- Copias por mail al vecino (constancia) ----------
async function mandarMail(tipo, datos) {
  try {
    // Uno o varios destinatarios separados por coma.
    const paras = String(datos.para || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!process.env.SERVICIOS_API_TOKEN || !paras.length || !paras.every((x) => MAIL_VALIDO.test(x))) return false;
    const enviarMail = require("../api/enviar-mail");
    let ok = false;
    const resFalso = { status: (c) => { ok = c === 200; return resFalso; }, json: () => resFalso, setHeader: () => resFalso };
    ok = true;
    await enviarMail({ method: "POST", headers: { authorization: `Bearer ${process.env.SERVICIOS_API_TOKEN}` }, body: { tipo, datos } }, resFalso);
    return ok;
  } catch (e) { console.error("No se pudo mandar el mail " + tipo + ":", e); return false; }
}

// ---------- Anti-robots (Cloudflare Turnstile) ----------
// Se activa solo cuando están TURNSTILE_SITE_KEY y TURNSTILE_SECRET_KEY en Vercel.
// Si Cloudflare no responde, se deja pasar (siguen los topes por IP y por día):
// es preferible eso a que un vecino no pueda registrarse.
async function verificarCaptcha(token, ip) {
  const secreto = process.env.TURNSTILE_SECRET_KEY;
  if (!secreto || !process.env.TURNSTILE_SITE_KEY) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const cuerpoForm = new URLSearchParams({ secret: secreto, response: token });
    if (ip && ip !== "sin-ip") cuerpoForm.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: cuerpoForm, signal: AbortSignal.timeout(5000) });
    if (!r.ok) { console.error("Turnstile respondió", r.status); return true; }
    const d = await r.json();
    return d && d.success === true;
  } catch (e) {
    console.error("No se pudo verificar el captcha (se deja pasar):", e.message || e);
    return true;
  }
}

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
      const salida = { nombre: ed.nombre, direccion: ed.direccion || "" };
      if (ed.campana && ed.campana.estado === "activa" && ed.campana.limite) salida.limite = ed.campana.limite;
      if (process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY) salida.captcha = process.env.TURNSTILE_SITE_KEY;
      res.status(200).json(salida);
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
  if (!(await verificarCaptcha(b.captcha, ip))) { res.status(400).json({ error: "No pudimos verificar que no seas un robot. Esperá unos segundos y probá de nuevo", captcha: true }); return; }

  let fotoInvalida = false;
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
        const foto = l && l.foto ? decodificarFoto(l.foto) : null;
        if (l && l.foto && !foto) fotoInvalida = true;
        return { tipo: disp, tag: disp === "tag" ? normalizarTag(l && l.tag) : soloTag(l && l.tag), usuario: soloUsuario(l && l.usuario), estado: "pendiente", nota: "", _foto: foto };
      })
      // Una llave sin número vale si mandó la foto (SAT completa el número mirándola).
      .filter((l) => l.tag || l.tipo === "control" || l._foto),
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
  if (fotoInvalida) { res.status(400).json({ error: "Una de las fotos no se pudo leer o es muy pesada. Sacala de nuevo" }); return; }

  try {
    const lista = await edificiosCacheados(gh);
    const ed = lista.find((x) => x.codigo === codigo);
    if (!ed || ed.activo === false) { res.status(404).json({ error: "Este código ya no está habilitado" }); return; }
    for (const l of registro.llaves) {
      if (l._foto) l.foto = await guardarFoto(codigo, l._foto);
      delete l._foto;
    }
    let lleno = false, topeDia = false, actualizado = null, numero = null;
    await modificar(gh, rutaEdificio(codigo), [], (regs) => {
      actualizado = null;
      const desde = Date.now() - 24 * 60 * 60 * 1000;
      const hoy = regs.filter((r) => Date.parse(r.actualizado || r.fecha) > desde);
      if (hoy.length >= TOPES.porEdificioPorDia || hoy.filter((r) => r.ip === registro.ip).length >= TOPES.porIpPorDia) { topeDia = true; return null; }
      const existente = regs.find((r) => mismaPersona(r, registro));
      if (existente) {
        fusionar(existente, registro);
        existente.ip = registro.ip;
        if (!existente.clave_emergencia) existente.clave_emergencia = require("./robo-llaves").nuevaClave();
        actualizado = existente;
        if (!existente.numero) existente.numero = regs.reduce((m, x) => Math.max(m, Number(x.numero) || 0), 0) + 1;
        numero = existente.numero;
        return regs;
      }
      if (regs.length >= MAX_REGISTROS_POR_EDIFICIO) { lleno = true; return null; }
      registro.numero = regs.reduce((m, x) => Math.max(m, Number(x.numero) || 0), 0) + 1;
      registro.origen = "qr";
      // Link personal de emergencia (para denunciar la llave robada o perdida a cualquier hora).
      registro.clave_emergencia = require("./robo-llaves").nuevaClave();
      registro.historial = [{ fecha: registro.fecha, que: "Se registró por el QR", por: "Vecino (QR)" }];
      numero = registro.numero;
      regs.push(registro);
      return regs;
    }, `Registro de llaves ${ed.nombre}: ${registro.piso || ""}${registro.unidad ? " " + registro.unidad : ""}`.trim());
    if (lleno || topeDia) { res.status(429).json({ error: topeDia ? "Se alcanzó el máximo de registros por hoy desde esta conexión. Probá mañana o comunicate con SAT" : "No se pudo registrar, comunicate con SAT" }); return; }
    // Copia por mail, si la pidió (lo que cargó y su N° de registro).
    let copia = false;
    const emergencia = require("./robo-llaves").linkPersonal(codigo, actualizado || registro);
    if (b.copia === true && registro.email) {
      const final = actualizado || registro;
      copia = await mandarMail("constancia_registro", {
        para: registro.email, nombre: final.nombre, edificio: ed.nombre, numero, actualizado: !!actualizado,
        unidad: [final.piso || final.unidad ? `${final.piso ? final.piso + "°" : ""} ${final.unidad || ""}`.trim() : "", final.cochera ? "Cochera " + final.cochera : ""].filter(Boolean).join(" · "),
        llaves: (final.llaves || []).filter((l) => l.estado !== "dada_de_baja").map((l) => `${l.tipo === "control" ? "Control de cochera" : "Llave"} ${l.tag || "(número en la foto)"}${l.usuario ? " · usuario " + l.usuario : ""}`),
        perdidas: registro.perdidas.map((l) => l.tag || "sin número"),
        emergencia,
      });
    }
    res.status(200).json({ ok: true, edificio: ed.nombre, numero, actualizado: !!actualizado, copia, emergencia });
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
    // Campaña de registro (lib/campana-llaves.js).
    if ((req.method === "GET" && req.query.campana) || (req.method === "POST" && /^campana_/.test(String(cuerpo(req).accion || "")))) {
      await require("./campana-llaves").manejarAdminSat(req, res, gh, autorizacion.nombre || "admin");
      return;
    }
    if (req.method === "GET") {
      const codigo = String(req.query.edificio || "");
      if (codigo) {
        if (!codigoValido(codigo)) { res.status(400).json({ error: "Código inválido" }); return; }
        if (req.query.foto) { await enviarFoto(res, codigo, String(req.query.foto)); return; }
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
          // Estado de la conciliación de este edificio (para verlas todas de un vistazo).
          let conciliacion = null;
          const { data: conc } = await gh.leer(rutaConciliacion(e.codigo), null);
          if (conc && Array.isArray(conc.filas)) {
            const p = require("./campana-llaves").progreso(regs, conc);
            conciliacion = { fecha: conc.fecha, archivo: conc.archivo || "", abonado_archivo: conc.abonado_archivo || "", filas: conc.filas.length, estacion: p.estacion, por_decidir: conc.filas.filter((f) => f.decision === "dar_de_baja" || f.decision === "borrar").length, placa: conc.placa ? { fecha: conc.placa.fecha, archivo: conc.placa.archivo || "", usuarios: (conc.placa.usuarios || []).length } : null };
          }
          return { ...e, registros: regs.length, pendientes, ultimo: regs.length ? regs[regs.length - 1].fecha : null, conciliacion };
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
      // N° de abonado en la estación de monitoreo (p. ej. D018): sirve para comprobar
      // que el Excel que se sube en la conciliación es de este edificio.
      const abonado = b.abonado === undefined ? undefined : txt(b.abonado, 12).toUpperCase().replace(/\s+/g, "");
      let guardado = null, repetido = null;
      await modificar(gh, RUTA_EDIFICIOS, null, (lista) => {
        const l = Array.isArray(lista) ? lista : EDIFICIOS_POR_DEFECTO.map((e) => ({ ...e }));
        const existente = b.codigo ? l.find((x) => x.codigo === b.codigo) : null;
        if (abonado) {
          const otro = l.find((x) => x !== existente && x.abonado && Cruce.normAbonado(x.abonado) === Cruce.normAbonado(abonado));
          if (otro) { repetido = otro.nombre; return null; }
        }
        if (existente) {
          existente.nombre = nombre;
          existente.direccion = txt(b.direccion, 100);
          existente.activo = b.activo !== false;
          if (abonado !== undefined) { if (abonado) existente.abonado = abonado; else delete existente.abonado; }
          guardado = existente;
        } else {
          // Código con una parte al azar: no se puede adivinar el de otro edificio.
          guardado = { codigo: `${slug(nombre)}-${crypto.randomBytes(2).toString("hex")}`, nombre, direccion: txt(b.direccion, 100), activo: true, creado_en: new Date().toISOString(), creado_por: quien };
          if (abonado) guardado.abonado = abonado;
          l.push(guardado);
        }
        return l;
      }, `Registro de llaves: edificio ${nombre}`);
      if (repetido) { res.status(409).json({ error: `Ese N° de abonado ya lo tiene ${repetido}` }); return; }
      cacheEdificios = null;
      res.status(200).json({ ok: true, edificio: guardado });
      return;
    }

    if (b.accion === "estado_llave" || b.accion === "borrar_registro") {
      const codigo = String(b.edificio || "");
      if (!codigoValido(codigo)) { res.status(400).json({ error: "Código inválido" }); return; }
      if (b.estado !== undefined && !ESTADOS.includes(b.estado)) { res.status(400).json({ error: "Estado inválido" }); return; }
      let encontrado = false, fotosBorrar = [];
      await modificar(gh, rutaEdificio(codigo), [], (regs) => {
        const i = regs.findIndex((r) => r.id === b.id);
        if (i < 0) return null;
        encontrado = true;
        if (b.accion === "borrar_registro") { fotosBorrar = (regs[i].llaves || []).map((l) => l.foto).filter(fotoIdValido); regs.splice(i, 1); return regs; }
        const lista = b.perdida ? regs[i].perdidas : regs[i].llaves;
        const llave = Array.isArray(lista) ? lista[Number(b.indice)] : null;
        if (!llave) { encontrado = false; return null; }
        if (b.estado !== undefined) llave.estado = b.estado;
        if (b.nota !== undefined) llave.nota = txtPublico(b.nota, 200);
        if (b.usuario !== undefined) llave.usuario = soloUsuario(b.usuario);
        if (b.tag !== undefined) llave.tag = (llave.tipo || "tag") === "tag" ? normalizarTag(b.tag) : soloTag(b.tag);
        llave.revisado_por = quien;
        llave.revisado_en = new Date().toISOString();
        return regs;
      }, `Registro de llaves: ${b.accion === "borrar_registro" ? "borrado" : "conciliación"} (${quien})`);
      if (!encontrado) { res.status(404).json({ error: "No se encontró el registro (¿lo borró otra persona?)" }); return; }
      // Al borrar a una persona se borran también las fotos de sus llaves.
      await Promise.all(fotosBorrar.map((id) => fotosGh.borrar(rutaFoto(codigo, id)).catch(() => {})));
      res.status(200).json({ ok: true });
      return;
    }
    // Alta manual en el padrón (persona que no usó el QR, carga inicial…).
    if (b.accion === "agregar_registro") {
      const codigo = String(b.edificio || "");
      if (!codigoValido(codigo)) { res.status(400).json({ error: "Código inválido" }); return; }
      const r = await require("./padron").agregarManual(gh, codigo, b, quien);
      if (r.error) { res.status(400).json({ error: r.error }); return; }
      res.status(200).json({ ok: true, registro: r.registro });
      return;
    }
    // ---------- Conciliación con la estación de monitoreo ----------
    if (b.accion === "guardar_conciliacion") {
      const codigo = String(b.edificio || "");
      if (!codigoValido(codigo)) { res.status(400).json({ error: "Código inválido" }); return; }
      const filas = (Array.isArray(b.filas) ? b.filas : []).slice(0, MAX_FILAS_ESTACION).map((f) => ({
        tag: soloTag(f && f.tag), usuario: txt(f && f.usuario, 20), nombre: txt(f && f.nombre, 80), apellido: txt(f && f.apellido, 60),
        piso: txt(f && f.piso, 10), depto: txt(f && f.depto, 10), telefono: txt(f && f.telefono, 30), tipo: txt(f && f.tipo, 30), obs: txt(f && f.obs, 160), decision: "",
      })).filter((f) => f.tag || f.usuario || f.nombre);
      if (!filas.length) { res.status(400).json({ error: "El archivo no tiene filas con número de llave, de usuario o nombre" }); return; }
      // ¿El archivo es de este edificio? Si el edificio tiene N° de abonado y el archivo dice
      // otro, no se guarda salvo que lo confirmen (forzar).
      const abonadoArchivo = txt(b.abonado_archivo, 12).toUpperCase();
      const { lista: edificiosTodos } = await leerEdificios(gh);
      const ed = edificiosTodos.find((e) => e.codigo === codigo);
      if (!ed) { res.status(404).json({ error: "No existe ese edificio" }); return; }
      if (ed.abonado && abonadoArchivo && Cruce.normAbonado(ed.abonado) !== Cruce.normAbonado(abonadoArchivo) && !b.forzar) {
        const otro = edificiosTodos.find((e) => e.abonado && Cruce.normAbonado(e.abonado) === Cruce.normAbonado(abonadoArchivo));
        res.status(409).json({ error: `El archivo es del abonado ${abonadoArchivo}${otro ? " (" + otro.nombre + ")" : ""} y ${ed.nombre} es ${ed.abonado}. No se cargó.`, otro_edificio: otro ? otro.codigo : null });
        return;
      }
      if (b.fijar_abonado && abonadoArchivo && !ed.abonado && !edificiosTodos.some((e) => e.abonado && Cruce.normAbonado(e.abonado) === Cruce.normAbonado(abonadoArchivo))) {
        await modificar(gh, RUTA_EDIFICIOS, null, (lista) => {
          const l = Array.isArray(lista) ? lista : EDIFICIOS_POR_DEFECTO.map((e) => ({ ...e }));
          const x = l.find((e) => e.codigo === codigo);
          if (!x || x.abonado) return null;
          x.abonado = abonadoArchivo;
          return l;
        }, `Registro de llaves: abonado ${abonadoArchivo} para ${ed.nombre}`);
        cacheEdificios = null;
      }
      let guardado = null;
      await modificar(gh, rutaConciliacion(codigo), null, (anterior) => {
        // Si ya estaba cargada la placa, se vuelve a cruzar con el Excel nuevo.
        const placa = anterior && anterior.placa ? anterior.placa : null;
        guardado = { ...(anterior || {}), fecha: new Date().toISOString(), por: quien, archivo: txt(b.archivo, 120), abonado_archivo: abonadoArchivo, edificio_nombre: ed.nombre, estacion: filas, placa, filas: conservarDecisiones(anterior, Cruce.combinarPlaca(filas, placa)) };
        return guardado;
      }, `Registro de llaves: conciliación con la estación (${quien})`);
      res.status(200).json(guardado);
      return;
    }
    // Placa de la central (Paradox, «User Report» de BabyWare): el panel lee el PDF y
    // manda los usuarios. Se cruzan con el Excel de la estación por N° de usuario.
    if (b.accion === "guardar_placa" || b.accion === "quitar_placa") {
      const codigo = String(b.edificio || "");
      if (!codigoValido(codigo)) { res.status(400).json({ error: "Código inválido" }); return; }
      const { lista: edificiosTodos } = await leerEdificios(gh);
      const ed = edificiosTodos.find((e) => e.codigo === codigo);
      if (!ed) { res.status(404).json({ error: "No existe ese edificio" }); return; }
      let placa = null;
      if (b.accion === "guardar_placa") {
        const usuarios = (Array.isArray(b.usuarios) ? b.usuarios : []).slice(0, MAX_FILAS_ESTACION).map((u) => {
          const numero = Number(u && u.numero);
          if (!Number.isInteger(numero) || numero < 1 || numero > 9999) return null;
          const etiqueta = txt(u.etiqueta, 40);
          const tag = Cruce.claveTag(soloTag(u.tag));
          return { numero, usuario: String(numero >= 1000 ? numero - 1000 : numero).padStart(3, "0"), etiqueta, generica: Cruce.etiquetaGenerica(etiqueta), tag: /^\d{3}:\d{5}$/.test(tag) && !/^0+:0+$/.test(tag) ? tag : "", control: /^\d{1,10}$/.test(String(u.control || "")) && !/^0+$/.test(String(u.control)) ? String(u.control) : "", tipo: txt(u.tipo, 20) };
        }).filter(Boolean);
        if (!usuarios.length) { res.status(400).json({ error: "El PDF no tiene usuarios de la placa" }); return; }
        // ¿Es de este edificio? La placa trae el nombre de la cuenta («Account: MUELLE 11»).
        const cuenta = txt(b.cuenta, 80);
        if (cuenta && !b.forzar) {
          const v = Cruce.verificarArchivo(cuenta, ed, edificiosTodos);
          if (v.veredicto === "otro" && v.otro) { res.status(409).json({ error: `La placa es de la cuenta «${cuenta}» (${v.otro.nombre}), no de ${ed.nombre}. No se cargó.`, otro_edificio: v.otro.codigo }); return; }
        }
        placa = { fecha: new Date().toISOString(), por: quien, archivo: txt(b.archivo, 120), cuenta, usuarios };
      }
      let guardado = null;
      await modificar(gh, rutaConciliacion(codigo), null, (anterior) => {
        if (!anterior && !placa) return null;
        // Archivos de antes de la placa: las filas son las de la estación tal cual.
        const estacion = anterior ? (Array.isArray(anterior.estacion) ? anterior.estacion : (anterior.filas || []).filter((f) => f.fuente !== "placa")) : [];
        const filas = Cruce.combinarPlaca(estacion, placa);
        if (!filas.length && !placa) return null;
        guardado = { ...(anterior || { fecha: new Date().toISOString(), por: quien, archivo: "", abonado_archivo: "" }), edificio_nombre: ed.nombre, estacion, placa, filas: conservarDecisiones(anterior, filas) };
        return guardado;
      }, `Registro de llaves: ${placa ? "placa cargada" : "placa quitada"} (${quien})`);
      res.status(200).json(guardado || { filas: [] });
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
          // Conciliación por nombre: se completa el N° de usuario con el de la estación.
          if (c.usuario !== undefined && soloUsuario(c.usuario)) llave.usuario = soloUsuario(c.usuario);
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
  fotos: { decodificarFoto, guardarFoto, enviarFoto, fotoIdValido, fotosGh },
  mandarMail,
  util: { txt, txtPublico, soloTelefono, soloUsuario, soloTag, MAIL_VALIDO, codigoValido, modificar, pasaTope, ipDe, cuerpo, leerEdificios, leerEdificiosFresco: leerEdificios, rutaEdificio, rutaConciliacion, RUTA_EDIFICIOS, edificiosCacheados, olvidarEdificios: () => { cacheEdificios = null; } },
  verificarCaptcha,
};
