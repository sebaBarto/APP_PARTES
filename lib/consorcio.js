// ============================================================
// PORTAL DE ADMINISTRADORES DE CONSORCIO
//
// El administrador de consorcio (puede tener 1 o más edificios) entra a
// consorcio.html con su mail y una clave que le da SAT. Ahí:
//   - ve el listado de vecinos y llaves registrados en sus edificios;
//   - carga gestiones: nuevo tag, reemplazo, baja (extravío / robo / ya no
//     vive) y cambio de titularidad;
//   - sigue el estado de cada gestión.
// SAT administra todo desde admin.html → "Llaves de edificios".
//
// Archivos en el repo privado de datos:
//   registro-llaves/administradores.json       administradores (clave hasheada, nunca en claro)
//   registro-llaves/<codigo>.gestiones.json    gestiones de cada edificio
//
// SEGURIDAD
//  - La sesión del administrador es un pase propio ("c1.…"), firmado con una
//    clave distinta a la de la APP: no sirve para ninguna otra parte de la API
//    (los pases de la APP empiezan con "s1." y van en otro encabezado).
//  - Cada pedido vuelve a comprobar que el administrador siga activo, que no
//    le hayan cambiado la clave y que el edificio sea suyo.
//  - Topes de intentos de ingreso por IP y por mail (fuerza bruta).
// ============================================================
const crypto = require("crypto");
const { util, normalizarTag, fotos, mandarMail } = require("./registro-llaves");
const { txt, txtPublico, soloTelefono, soloUsuario, soloTag, MAIL_VALIDO, codigoValido, modificar, pasaTope, ipDe, cuerpo, leerEdificios, rutaEdificio } = util;

const RUTA_ADMINS = "registro-llaves/administradores.json";
const rutaGestiones = (codigo) => `registro-llaves/${codigo}.gestiones.json`;
// Links únicos que el administrador le manda a un vecino para que cargue él
// mismo el pedido (ver "Links para vecinos" más abajo).
const rutaInvitaciones = (codigo) => `registro-llaves/${codigo}.invitaciones.json`;
const DIAS_INVITACION = 15;
const MAX_INVITACIONES_POR_EDIFICIO = 3000;
const HORAS_SESION = 12;
const MAX_GESTIONES_POR_EDIFICIO = 5000;

const TIPOS = {
  nuevo: "Nuevo tag",
  reemplazo: "Reemplazo de tag",
  baja: "Baja (extravío / robo / ya no vive)",
  titularidad: "Cambio de titularidad",
};
const MOTIVOS = {
  reemplazo: { no_funciona: "No funciona", rotura: "Se rompió", desgaste: "Desgaste", otro: "Otro" },
  baja: { extravio: "Extravío", robo: "Robo", ya_no_vive: "Ya no vive / no corresponde", otro: "Otro" },
};
const ESTADOS_GESTION = { pendiente: "Pendiente", en_curso: "En curso", hecha: "Hecha", rechazada: "Rechazada", cancelada: "Cancelada por el administrador" };
const URL_PORTAL = "https://pedido.sat365.com.ar/consorcio.html";

// Número de pedido: correlativo por edificio, asignado al guardar (dentro de la
// misma escritura, así dos pedidos a la vez nunca sacan el mismo número).
function agregarConNumero(lista, g) {
  g.numero = lista.reduce((m, x) => Math.max(m, Number(x.numero) || 0), 0) + 1;
  lista.push(g);
  return lista;
}
// Aviso por mail a SAT de cada gestión nueva. Si el mail falla, la gestión
// ya quedó guardada igual: nunca se le muestra un error al que la cargó.
async function avisarPorMail(g, edificioNombre) {
  try {
    if (!process.env.SERVICIOS_API_TOKEN) return;
    const enviarMail = require("../api/enviar-mail");
    const unidad = [g.piso || g.unidad ? `${g.piso ? g.piso + "°" : ""} ${g.unidad || ""}`.trim() : "", g.cochera ? "Cochera " + g.cochera : ""].filter(Boolean).join(" · ");
    const datos = {
      numero: g.numero, tipo: g.tipo, tipo_txt: TIPOS[g.tipo], edificio: edificioNombre, administrador: g.admin_nombre,
      origen_txt: g.cancelado ? `⚠ ${g.admin_nombre} CANCELÓ este pedido desde el portal: no hay que hacerlo` : g.origen === "emergencia" ? `🚨 DENUNCIA DE EMERGENCIA de ${g.cargada_por || "un vecino"} (${g.motivo === "robo" ? "robo" : "extravío"}). ${g.robo && g.robo.estacion && g.robo.estacion.ok ? "Ya se avisó a la estación de monitoreo" + (g.robo.estacion.prueba ? " (modo PRUEBA: el aviso fue a SAT, falta configurar LLAVES_ROBO_EMAIL)" : "") + "." : "⚠ NO se pudo avisar a la estación: llamar."} Hay que dar de baja la tarjeta en la central y marcar el pedido Hecho (así la estación quita la alerta).` : g.origen === "vecino" ? `Lo cargó el vecino con el link que le mandó ${g.admin_nombre}` : `Lo cargó ${g.admin_nombre} desde el portal de administradores`,
      cancelado: !!g.cancelado,
      unidad, titular: g.titular, telefono: g.telefono, email: g.email,
      dispositivo: g.dispositivo === "control" ? "Control de cochera" : "Tag", cantidad: g.tipo === "nuevo" ? String(g.cantidad) : "",
      tag: g.tag, usuario: g.usuario, motivo_txt: (MOTIVOS[g.tipo] || {})[g.motivo] || "",
      nuevo_titular: g.nuevo_titular, nuevo_telefono: g.nuevo_telefono,
      llaves_titularidad: g.llaves_titularidad === "transferir" ? "Se las queda el nuevo titular" : g.llaves_titularidad === "reemplazar" ? "Bajar las anteriores y entregar nuevas" : "",
      fotos: (g.fotos || []).length, observaciones: g.observaciones,
    };
    const resFalso = { status: () => resFalso, json: () => resFalso, setHeader: () => resFalso };
    await enviarMail({ method: "POST", headers: { authorization: `Bearer ${process.env.SERVICIOS_API_TOKEN}` }, body: { tipo: "gestion_llaves", datos } }, resFalso);
  } catch (e) { console.error("No se pudo avisar por mail la gestión de llaves:", e); }
}
// Mail al administrador (y al vecino del link) cuando SAT cambia el estado de su pedido.
async function avisarCambioEstado(gh, codigo, g) {
  try {
    if (!process.env.SERVICIOS_API_TOKEN) return;
    const admin = (await leerAdmins(gh, true)).find((a) => a.id === g.admin_id);
    const para = [];
    if (admin && admin.activo !== false && MAIL_VALIDO.test(admin.email || "")) para.push({ email: admin.email, nombre: admin.nombre, rol: "administrador" });
    if ((g.origen === "vecino" || g.origen === "emergencia") && MAIL_VALIDO.test(g.email || "")) para.push({ email: g.email, nombre: g.titular, rol: "vecino" });
    if (!para.length) return;
    const enviarMail = require("../api/enviar-mail");
    const edificio = await nombreEdificio(gh, codigo);
    const unidad = [g.piso || g.unidad ? `${g.piso ? g.piso + "°" : ""} ${g.unidad || ""}`.trim() : "", g.cochera ? "Cochera " + g.cochera : ""].filter(Boolean).join(" · ");
    for (const p of para) {
      const resFalso = { status: () => resFalso, json: () => resFalso, setHeader: () => resFalso };
      await enviarMail({ method: "POST", headers: { authorization: `Bearer ${process.env.SERVICIOS_API_TOKEN}` }, body: { tipo: "aviso_gestion", datos: {
        para: p.email, nombre: p.nombre, rol: p.rol, numero: g.numero, tipo_txt: TIPOS[g.tipo], edificio, unidad, titular: g.titular,
        estado: g.estado, estado_txt: ESTADOS_GESTION[g.estado], nota: g.nota_sat || "",
        portal: p.rol === "administrador" ? "https://pedido.sat365.com.ar/consorcio.html" : "",
      } } }, resFalso);
    }
  } catch (e) { console.error("No se pudo avisar el cambio de estado:", e); }
}
// Mail al administrador cuando se entregan las llaves de su pedido (con firma).
async function avisarEntrega(gh, codigo, g) {
  try {
    if (!process.env.SERVICIOS_API_TOKEN) return;
    const admin = (await leerAdmins(gh, true)).find((a) => a.id === g.admin_id);
    if (!admin || admin.activo === false || !MAIL_VALIDO.test(admin.email || "")) return;
    const enviarMail = require("../api/enviar-mail");
    const resFalso = { status: () => resFalso, json: () => resFalso, setHeader: () => resFalso };
    const unidad = [g.piso || g.unidad ? `${g.piso ? g.piso + "°" : ""} ${g.unidad || ""}`.trim() : "", g.cochera ? "Cochera " + g.cochera : ""].filter(Boolean).join(" · ");
    await enviarMail({ method: "POST", headers: { authorization: `Bearer ${process.env.SERVICIOS_API_TOKEN}` }, body: { tipo: "aviso_gestion", datos: {
      para: admin.email, nombre: admin.nombre, rol: "administrador", numero: g.numero, tipo_txt: TIPOS[g.tipo], edificio: await nombreEdificio(gh, codigo), unidad, titular: g.titular,
      estado: "hecha", estado_txt: `Entregada a ${g.entrega.recibio} el ${new Date(g.entrega.fecha).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })} (firmó la recepción)`,
      nota: g.nota_sat || "", portal: URL_PORTAL,
    } } }, resFalso);
  } catch (e) { console.error("No se pudo avisar la entrega:", e); }
}
const nombreEdificio = async (gh, codigo) => { try { const { lista } = await leerEdificios(gh); const e = lista.find((x) => x.codigo === codigo); return e ? e.nombre : codigo; } catch (e) { return codigo; } };
const TOPES = {
  loginPorIp: { n: 10, ms: 15 * 60 * 1000 },
  loginPorMail: { n: 6, ms: 15 * 60 * 1000 },
  lecturasPorAdmin: { n: 120, ms: 60 * 1000 },
  gestionesPorAdmin: { n: 30, ms: 60 * 60 * 1000 },
  invitacionesPorAdmin: { n: 60, ms: 60 * 60 * 1000 },
  linkPorIp: { n: 30, ms: 10 * 60 * 1000 },
  envioLinkPorIp: { n: 5, ms: 10 * 60 * 1000 },
  olvidePorIp: { n: 5, ms: 30 * 60 * 1000 },
  olvidePorMail: { n: 3, ms: 60 * 60 * 1000 },
};

// ---------- Claves y pases ----------
function secreto() {
  return process.env.SESION_SECRET || process.env.SERVICIOS_API_TOKEN || "";
}
function firmar(texto) {
  return crypto.createHmac("sha256", "sat-consorcio-v1:" + secreto()).update(texto).digest("base64url");
}
function igualSeguro(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
function hashClave(clave, sal) {
  return crypto.pbkdf2Sync(String(clave), sal, 120000, 32, "sha256").toString("hex");
}
// Clave fácil de dictar por teléfono: sin 0/O ni 1/l/I.
// Claves que no se aceptan al cambiarla: las de siempre, o el propio mail/nombre.
const CLAVES_DEBILES = ["12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "password", "contraseña", "contrasena", "qwertyui", "qwerty123", "abc12345", "abcd1234", "consorcio", "administracion", "edificio", "sat12345", "sat365sat"];
function claveDebil(nueva, admin) {
  const n = String(nueva).toLowerCase();
  if (CLAVES_DEBILES.includes(n) || /^(.)\1+$/.test(n) || /^\d+$/.test(n)) return true;
  const usuario = String((admin && admin.email) || "").toLowerCase().split("@")[0];
  return !!usuario && usuario.length >= 4 && n.includes(usuario);
}
function generarClave() {
  const letras = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(10);
  let c = "";
  for (let i = 0; i < 10; i++) c += letras[bytes[i] % letras.length];
  return c.slice(0, 5) + "-" + c.slice(5);
}
function crearPase(admin) {
  const datos = Buffer.from(JSON.stringify({ a: admin.id, v: admin.v || 1, e: Date.now() + HORAS_SESION * 3600e3 })).toString("base64url");
  return `c1.${datos}.${firmar(datos)}`;
}
function leerPase(token) {
  const t = String(token || "").trim();
  if (!secreto() || !t.startsWith("c1.")) return null;
  const partes = t.split(".");
  if (partes.length !== 3 || !igualSeguro(partes[2], firmar(partes[1]))) return null;
  try {
    const d = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf-8"));
    return d && d.e > Date.now() ? d : null;
  } catch (e) { return null; }
}

// Bloqueo por intentos fallidos que no depende de la memoria del servidor (Vercel reparte
// los pedidos entre varias instancias): se guarda en el backend nuevo, el mismo servicio
// que protege el ingreso al panel. Si no responde, quedan los topes en memoria.
async function bloqueoPersistente(clave, exito) {
  const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
  if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) return null;
  try {
    const h = { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" };
    const r = exito === undefined
      ? await fetch(`${BACKEND_NUEVO_URL}/api/admin-login/estado?ip=${encodeURIComponent(clave)}`, { headers: h, signal: AbortSignal.timeout(3000) })
      : await fetch(`${BACKEND_NUEVO_URL}/api/admin-login/registrar`, { method: "POST", headers: h, body: JSON.stringify({ ip: clave, exito }), signal: AbortSignal.timeout(3000) });
    return await r.json();
  } catch (e) { return null; }
}

// ---------- Datos ----------
let cacheAdmins = null;
async function leerAdmins(gh, fresco) {
  if (!fresco && cacheAdmins && Date.now() - cacheAdmins.t < 30 * 1000) return cacheAdmins.lista;
  const { data } = await gh.leer(RUTA_ADMINS, []);
  const lista = Array.isArray(data) ? data : [];
  cacheAdmins = { t: Date.now(), lista };
  return lista;
}
const adminPublico = (a) => ({ id: a.id, nombre: a.nombre, email: a.email, telefono: a.telefono || "", edificios: a.edificios || [], activo: a.activo !== false, creado_en: a.creado_en, clave_cambiada_en: a.clave_cambiada_en || null, cambio_clave_propia: !!a.cambio_clave_propia });

// Quién pide, desde el portal: el administrador (activo, con la clave vigente) o null.
async function adminDelPedido(req, gh) {
  const h = (req.headers && (req.headers["x-consorcio"] || req.headers["X-Consorcio"])) || "";
  const pase = leerPase(h);
  if (!pase) return null;
  const a = (await leerAdmins(gh)).find((x) => x.id === pase.a);
  if (!a || a.activo === false || (a.v || 1) !== pase.v) return null;
  return a;
}

// Lo que el administrador ve de cada registro: lo necesario para gestionar,
// sin datos internos de SAT (huella de IP, notas internas, quién revisó).
function registroParaConsorcio(r) {
  return {
    id: r.id, fecha: r.fecha, nombre: r.nombre, telefono: r.telefono, email: r.email || "",
    relacion: r.relacion, relacion_otro: r.relacion_otro || "", tipo: r.tipo,
    piso: r.piso || "", unidad: r.unidad || "", cochera: r.cochera || "",
    llaves: (r.llaves || []).map((l) => ({ tipo: l.tipo || "tag", tag: l.tag || "", usuario: l.usuario || "", estado: l.estado, foto: l.foto || "" })),
    perdidas: (r.perdidas || []).map((l) => ({ tipo: l.tipo || "tag", tag: l.tag || "", estado: l.estado })),
  };
}
function gestionParaConsorcio(g) {
  const { historial, ...resto } = g;
  return { ...resto, historial: (historial || []).map((h) => ({ fecha: h.fecha, estado: h.estado })) };
}

// ---------- Portal (público, con pase propio) ----------
async function manejarPortal(req, res, gh) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.GITHUB_DATA_TOKEN || !process.env.GITHUB_DATA_REPO || !secreto()) { res.status(500).json({ error: "Falta configuración del servidor" }); return; }
  const ip = ipDe(req);
  try {
    if (req.method === "POST") {
      const b = cuerpo(req);
      // ---------- Olvidé mi clave ----------
      // Se manda un link al mail del administrador (vale 1 hora, una sola vez).
      // La respuesta es siempre la misma, exista o no el mail: así no se puede
      // averiguar qué mails están cargados.
      if (b.accion === "olvide_clave") {
        const email = txt(b.email, 80).toLowerCase();
        const respuesta = { ok: true, mensaje: "Si ese mail está cargado, te llega un link para crear una clave nueva (revisá también el spam). Vale por 1 hora." };
        if (!pasaTope("co|" + ip, TOPES.olvidePorIp) || !pasaTope("cm2|" + email, TOPES.olvidePorMail)) { res.status(200).json(respuesta); return; }
        const a = (await leerAdmins(gh, true)).find((x) => x.email === email && x.activo !== false);
        if (a) {
          const token = crypto.randomBytes(24).toString("hex");
          await modificar(gh, RUTA_ADMINS, [], (lista) => {
            const x = lista.find((y) => y.id === a.id);
            if (!x) return null;
            x.reset = { hash: crypto.createHash("sha256").update(token).digest("hex"), vence: new Date(Date.now() + 3600e3).toISOString() };
            return lista;
          }, "Consorcio: pedido de clave nueva");
          cacheAdmins = null;
          await mandarMail("restablecer_clave", { para: a.email, nombre: a.nombre, link: `${URL_PORTAL}?r=${a.id}.${token}` });
        }
        res.status(200).json(respuesta);
        return;
      }
      if (b.accion === "restablecer_clave") {
        if (!pasaTope("cr2|" + ip, TOPES.loginPorIp)) { res.status(429).json({ error: "Demasiados intentos. Esperá 15 minutos" }); return; }
        const m = String(b.codigo || "").match(/^(adm[a-f0-9]{10})\.([a-f0-9]{48})$/);
        const nueva = String(b.nueva || "");
        if (nueva.length < 8 || nueva.length > 72) { res.status(400).json({ error: "La clave nueva tiene que tener entre 8 y 72 caracteres" }); return; }
        if (claveDebil(nueva, null)) { res.status(400).json({ error: "Esa clave es muy fácil de adivinar. Usá letras y números, y que no sea tu mail" }); return; }
        let hecho = null;
        if (m) {
          const hash = crypto.createHash("sha256").update(m[2]).digest("hex");
          await modificar(gh, RUTA_ADMINS, [], (lista) => {
            const a = lista.find((x) => x.id === m[1]);
            if (!a || a.activo === false || !a.reset || Date.parse(a.reset.vence) < Date.now() || !igualSeguro(a.reset.hash, hash)) return null;
            a.sal = crypto.randomBytes(16).toString("hex");
            a.hash = hashClave(nueva, a.sal);
            a.v = (a.v || 1) + 1;
            a.cambio_clave_propia = true;
            a.clave_cambiada_en = new Date().toISOString();
            delete a.reset;
            hecho = a;
            return lista;
          }, "Consorcio: clave restablecida por mail");
          cacheAdmins = null;
        }
        if (!hecho) { res.status(400).json({ error: "El link venció o ya se usó. Pedí uno nuevo desde «Olvidé mi clave»" }); return; }
        res.status(200).json({ ok: true, pase: crearPase(hecho), nombre: hecho.nombre });
        return;
      }

      if (b.accion === "login") {
        const email = txt(b.email, 80).toLowerCase();
        if (!pasaTope("cl|" + ip, TOPES.loginPorIp) || !pasaTope("cm|" + email, TOPES.loginPorMail)) {
          res.status(429).json({ error: "Demasiados intentos. Esperá 15 minutos y probá de nuevo" });
          return;
        }
        const bloqueo = await bloqueoPersistente("cons:" + email);
        if (bloqueo && bloqueo.bloqueado) { res.status(429).json({ error: `Demasiados intentos con este mail. Probá de nuevo en ${bloqueo.minutos_restantes || 15} minutos o pedí una clave nueva` }); return; }
        const a = (await leerAdmins(gh, true)).find((x) => x.email === email);
        // Se calcula el hash aunque el mail no exista: así la demora no revela qué mails están cargados.
        const clave = String(b.clave == null ? "" : b.clave).slice(0, 200);
        const ok = a ? igualSeguro(hashClave(clave, a.sal), a.hash) : (hashClave(clave, "x"), false);
        if (!ok || a.activo === false) {
          const reg = email ? await bloqueoPersistente("cons:" + email, false) : null;
          if (reg && reg.bloqueado) { res.status(429).json({ error: `Demasiados intentos con este mail. Probá de nuevo en ${reg.minutos_restantes || 15} minutos o pedí una clave nueva` }); return; }
          res.status(401).json({ error: "Mail o clave incorrectos" });
          return;
        }
        await bloqueoPersistente("cons:" + email, true);
        res.status(200).json({ pase: crearPase(a), nombre: a.nombre, debe_cambiar_clave: !a.cambio_clave_propia });
        return;
      }
      const admin = await adminDelPedido(req, gh);
      if (!admin) { res.status(401).json({ error: "La sesión venció. Volvé a entrar", sesion_vencida: true }); return; }

      if (b.accion === "cambiar_clave") {
        if (!igualSeguro(hashClave(String(b.actual == null ? "" : b.actual).slice(0, 200), admin.sal), admin.hash)) { res.status(400).json({ error: "La clave actual no es correcta" }); return; }
        const nueva = String(b.nueva || "");
        if (nueva.length < 8 || nueva.length > 72) { res.status(400).json({ error: "La clave nueva tiene que tener entre 8 y 72 caracteres" }); return; }
        if (claveDebil(nueva, admin)) { res.status(400).json({ error: "Esa clave es muy fácil de adivinar. Usá letras y números, y que no sea tu mail" }); return; }
        let actualizado = null;
        await modificar(gh, RUTA_ADMINS, [], (lista) => {
          const a = lista.find((x) => x.id === admin.id);
          if (!a) return null;
          a.sal = crypto.randomBytes(16).toString("hex");
          a.hash = hashClave(nueva, a.sal);
          a.v = (a.v || 1) + 1;
          a.cambio_clave_propia = true;
          a.clave_cambiada_en = new Date().toISOString();
          actualizado = a;
          return lista;
        }, `Consorcio: ${admin.nombre} cambió su clave`);
        cacheAdmins = null;
        res.status(200).json({ ok: true, pase: actualizado ? crearPase(actualizado) : null });
        return;
      }

      if (b.accion === "crear_invitacion" || b.accion === "cancelar_invitacion") {
        const codigo = String(b.edificio || "");
        if (!codigoValido(codigo) || !(admin.edificios || []).includes(codigo)) { res.status(403).json({ error: "Ese edificio no está a tu cargo" }); return; }
        if (b.accion === "cancelar_invitacion") {
          let hay = false;
          await modificar(gh, rutaInvitaciones(codigo), [], (lista) => {
            const inv = lista.find((x) => x.id === b.id);
            if (!inv || inv.usada) return null;
            inv.cancelada = new Date().toISOString(); hay = true;
            return lista;
          }, `Consorcio: link cancelado (${admin.nombre})`);
          if (!hay) { res.status(404).json({ error: "No se encontró el link o ya se usó" }); return; }
          res.status(200).json({ ok: true });
          return;
        }
        // Uno solo, o varios de una vez (lote: una línea por vecino o unidad, hasta 60).
        const pedidos = Array.isArray(b.lote) ? b.lote.slice(0, 60) : [b];
        if (!pedidos.length) { res.status(400).json({ error: "La lista está vacía" }); return; }
        for (let k = 0; k < Math.min(pedidos.length, 5); k++) {
          if (!pasaTope("ci|" + admin.id, TOPES.invitacionesPorAdmin)) { res.status(429).json({ error: "Generaste muchos links seguidos. Esperá un rato" }); return; }
        }
        const tipo = Object.keys(TIPOS).includes(b.tipo) ? b.tipo : "";
        const invs = pedidos.map((p) => ({
          id: crypto.randomBytes(12).toString("hex"),
          creada: new Date().toISOString(),
          vence: new Date(Date.now() + DIAS_INVITACION * 864e5).toISOString(),
          admin_id: admin.id,
          admin_nombre: admin.nombre,
          tipo,
          destinatario: txtPublico(p && p.destinatario, 80),
          piso: txtPublico(p && p.piso, 10),
          unidad: txtPublico(p && p.unidad, 10),
          usada: null,
          cancelada: null,
        }));
        let lleno = false;
        await modificar(gh, rutaInvitaciones(codigo), [], (lista) => {
          if (lista.length + invs.length > MAX_INVITACIONES_POR_EDIFICIO) { lleno = true; return null; }
          return lista.concat(invs);
        }, `Consorcio: ${invs.length} link(s) para vecinos (${admin.nombre})`);
        if (lleno) { res.status(429).json({ error: "No se pudo crear el link, comunicate con SAT" }); return; }
        const conCodigo = invs.map((i) => ({ ...i, codigo: `${codigo}.${i.id}` }));
        res.status(200).json({ ok: true, invitacion: conCodigo[0], codigo: conCodigo[0].codigo, invitaciones: conCodigo });
        return;
      }

      if (b.accion === "cancelar_gestion") {
        const codigo = String(b.edificio || "");
        if (!codigoValido(codigo) || !(admin.edificios || []).includes(codigo)) { res.status(403).json({ error: "Ese edificio no está a tu cargo" }); return; }
        let cancelada = null, motivo = "", bloqueada = false;
        await modificar(gh, rutaGestiones(codigo), [], (lista) => {
          const g = lista.find((x) => x.id === b.id);
          // Solo mientras SAT no empezó a trabajarla. Las denuncias de robo/extravío las cierra SAT.
          if (g && g.origen === "emergencia") { bloqueada = true; return null; }
          if (!g || g.estado !== "pendiente") { cancelada = null; return null; }
          g.estado = "cancelada";
          g.motivo_cancelacion = txtPublico(b.motivo, 300);
          g.historial = (g.historial || []).concat({ fecha: new Date().toISOString(), estado: "cancelada", por: admin.nombre });
          cancelada = { ...g }; motivo = g.motivo_cancelacion;
          return lista;
        }, `Consorcio: pedido cancelado por ${admin.nombre}`);
        if (bloqueada) { res.status(409).json({ error: "Las denuncias de llave robada o perdida las cierra SAT (ya se avisó a la central de monitoreo). Si fue un error, comunicate con SAT" }); return; }
        if (!cancelada) { res.status(409).json({ error: "Ya no se puede cancelar: SAT empezó a trabajarlo o ya está cerrado. Comunicate con SAT" }); return; }
        await avisarPorMail({ ...cancelada, cancelado: true, observaciones: motivo ? "Motivo de la cancelación: " + motivo : cancelada.observaciones }, await nombreEdificio(gh, codigo));
        res.status(200).json({ ok: true });
        return;
      }

      // Respuesta a la propuesta de bajas de la campaña de registro.
      if (b.accion === "campana_responder") {
        const codigo = String(b.edificio || "");
        if (!codigoValido(codigo) || !(admin.edificios || []).includes(codigo)) { res.status(403).json({ error: "Ese edificio no está a tu cargo" }); return; }
        const r = await require("./campana-llaves").responder(gh, admin, codigo, b);
        if (r.error) { res.status(409).json({ error: r.error }); return; }
        res.status(200).json({ ok: true, estado: r.campana.estado });
        return;
      }

      if (b.accion === "gestion") {
        if (!pasaTope("cg|" + admin.id, TOPES.gestionesPorAdmin)) { res.status(429).json({ error: "Cargaste muchas gestiones seguidas. Esperá un rato o comunicate con SAT" }); return; }
        const codigo = String(b.edificio || "");
        if (!codigoValido(codigo) || !(admin.edificios || []).includes(codigo)) { res.status(403).json({ error: "Ese edificio no está a tu cargo" }); return; }
        const g = armarGestion(b, admin, codigo);
        if (g.error) { res.status(400).json({ error: g.error }); return; }
        // Fotos del tag (hasta 2), privadas como las del QR.
        const crudas = (Array.isArray(b.fotos) ? b.fotos : []).slice(0, 2).map(fotos.decodificarFoto);
        if (crudas.some((f) => !f)) { res.status(400).json({ error: "Una de las fotos no se pudo leer o es muy pesada. Sacala de nuevo" }); return; }
        g.gestion.fotos = [];
        for (const f of crudas) g.gestion.fotos.push(await fotos.guardarFoto(codigo, f));
        let lleno = false;
        await modificar(gh, rutaGestiones(codigo), [], (lista) => {
          if (lista.length >= MAX_GESTIONES_POR_EDIFICIO) { lleno = true; return null; }
          return agregarConNumero(lista, g.gestion);
        }, `Consorcio: ${TIPOS[g.gestion.tipo]} (${admin.nombre})`);
        if (lleno) { res.status(429).json({ error: "No se pudo guardar, comunicate con SAT" }); return; }
        await avisarPorMail(g.gestion, await nombreEdificio(gh, codigo));
        res.status(200).json({ ok: true, gestion: gestionParaConsorcio(g.gestion), numero: g.gestion.numero });
        return;
      }
      res.status(400).json({ error: "Acción inválida" });
      return;
    }

    if (req.method !== "GET") { res.status(405).json({ error: "Método no permitido" }); return; }
    const admin = await adminDelPedido(req, gh);
    if (!admin) { res.status(401).json({ error: "La sesión venció. Volvé a entrar", sesion_vencida: true }); return; }
    if (!pasaTope("cr|" + admin.id, TOPES.lecturasPorAdmin)) { res.status(429).json({ error: "Demasiadas consultas seguidas, esperá un minuto" }); return; }
    const { lista: edificios } = await leerEdificios(gh);
    const suyos = (admin.edificios || []).map((c) => edificios.find((e) => e.codigo === c)).filter(Boolean);

    if (req.query.foto) {
      const codigo = String(req.query.e || "");
      if (!codigoValido(codigo) || !(admin.edificios || []).includes(codigo)) { res.status(403).json({ error: "Ese edificio no está a tu cargo" }); return; }
      await fotos.enviarFoto(res, codigo, String(req.query.foto));
      return;
    }
    if (req.query.que === "edificio") {
      const codigo = String(req.query.e || "");
      if (!codigoValido(codigo) || !(admin.edificios || []).includes(codigo)) { res.status(403).json({ error: "Ese edificio no está a tu cargo" }); return; }
      const [{ data: regs }, { data: gest }, { data: invs }] = await Promise.all([gh.leer(rutaEdificio(codigo), []), gh.leer(rutaGestiones(codigo), []), gh.leer(rutaInvitaciones(codigo), [])]);
      let campana = null;
      try { campana = await require("./campana-llaves").paraPortal(gh, codigo, Array.isArray(regs) ? regs : []); } catch (e) { console.error("Campaña:", e); }
      res.status(200).json({
        campana,
        registros: (Array.isArray(regs) ? regs : []).map(registroParaConsorcio),
        gestiones: (Array.isArray(gest) ? gest : []).map(gestionParaConsorcio).reverse(),
        invitaciones: (Array.isArray(invs) ? invs : []).slice(-200).reverse().map((i) => ({ ...i, codigo: `${codigo}.${i.id}` })),
      });
      return;
    }
    // Resumen de cada edificio para la pantalla de inicio.
    const resumenes = await Promise.all(suyos.map(async (e) => {
      try {
        const [{ data: regs }, { data: gest }] = await Promise.all([gh.leer(rutaEdificio(e.codigo), []), gh.leer(rutaGestiones(e.codigo), [])]);
        const rs = Array.isArray(regs) ? regs : [], gs = Array.isArray(gest) ? gest : [];
        const llaves = rs.flatMap((r) => r.llaves || []).filter((l) => l.estado !== "dada_de_baja");
        const unidades = new Set(rs.map((r) => [r.piso, r.unidad, r.cochera].map((x) => String(x || "").toLowerCase().replace(/\s/g, "")).join("|")));
        return {
          personas: rs.length, unidades: unidades.size,
          tags: llaves.filter((l) => (l.tipo || "tag") === "tag").length, controles: llaves.filter((l) => l.tipo === "control").length,
          abiertos: gs.filter((g) => g.estado === "pendiente" || g.estado === "en_curso").length,
          hechos_30: gs.filter((g) => g.estado === "hecha" && Date.now() - Date.parse(g.actualizado_en || g.fecha) < 30 * 864e5).length,
          // Denuncias de llave robada/perdida todavía abiertas (para "Para hoy").
          emergencias: gs.filter((g) => g.origen === "emergencia" && (g.estado === "pendiente" || g.estado === "en_curso")).map((g) => ({ piso: g.piso || "", unidad: g.unidad || "", cochera: g.cochera || "", fecha: g.fecha || "" })).slice(-5),
        };
      } catch (err) { return null; }
    }));
    res.status(200).json({
      nombre: admin.nombre,
      debe_cambiar_clave: !admin.cambio_clave_propia,
      edificios: suyos.map((e, i) => ({ codigo: e.codigo, nombre: e.nombre, direccion: e.direccion || "", resumen: resumenes[i], campana: e.campana || null })),
    });
  } catch (e) {
    res.status(502).json({ error: "No se pudo completar, probá de nuevo en un momento" });
  }
}

// ---------- Links para vecinos (sin login, con el código del link) ----------
// El link es pedido.sat365.com.ar/consorcio.html?i=<edificio>.<id>: el id es
// al azar (24 caracteres), sirve UNA vez y vence a los 15 días. El vecino
// solo puede cargar el pedido: no ve ningún dato del edificio ni de otros vecinos.
function leerCodigoLink(v) {
  const m = String(v || "").match(/^([a-z0-9-]{3,40})\.([a-f0-9]{24})$/);
  return m ? { codigo: m[1], id: m[2] } : null;
}
async function invitacionValida(gh, link) {
  const { data } = await gh.leer(rutaInvitaciones(link.codigo), []);
  const inv = (Array.isArray(data) ? data : []).find((x) => x.id === link.id);
  if (!inv || inv.cancelada || Date.parse(inv.vence) < Date.now()) return { error: "Este link ya no es válido. Pedile uno nuevo a tu administración" };
  if (inv.usada) return { error: "Este link ya se usó. Si necesitás otro pedido, pedile un link nuevo a tu administración" };
  const admin = (await leerAdmins(gh)).find((x) => x.id === inv.admin_id);
  if (!admin || admin.activo === false || !(admin.edificios || []).includes(link.codigo)) return { error: "Este link ya no es válido. Pedile uno nuevo a tu administración" };
  return { inv, admin };
}
async function manejarLink(req, res, gh) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.GITHUB_DATA_TOKEN || !process.env.GITHUB_DATA_REPO) { res.status(500).json({ error: "Falta configuración del servidor" }); return; }
  const ip = ipDe(req);
  if (!pasaTope("lk|" + ip, TOPES.linkPorIp)) { res.status(429).json({ error: "Demasiados intentos, esperá unos minutos" }); return; }
  try {
    const b = req.method === "POST" ? cuerpo(req) : {};
    const link = leerCodigoLink(req.method === "POST" ? b.i : req.query.i);
    if (!link) { res.status(404).json({ error: "Este link no es válido" }); return; }
    const v = await invitacionValida(gh, link);
    if (v.error) { res.status(410).json({ error: v.error }); return; }
    const { lista: edificios } = await leerEdificios(gh);
    const ed = edificios.find((e) => e.codigo === link.codigo);
    if (!ed) { res.status(410).json({ error: "Este link ya no es válido" }); return; }
    if (req.method === "GET") {
      res.status(200).json({ edificio: ed.nombre, direccion: ed.direccion || "", administrador: v.admin.nombre, tipo: v.inv.tipo, destinatario: v.inv.destinatario, piso: v.inv.piso, unidad: v.inv.unidad, vence: v.inv.vence });
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    if (!pasaTope("le|" + ip, TOPES.envioLinkPorIp)) { res.status(429).json({ error: "Se mandaron muchos pedidos seguidos. Esperá unos minutos" }); return; }
    if (txt(b.sitio_web, 10)) { res.status(200).json({ ok: true }); return; }
    if (v.inv.tipo) b.tipo = v.inv.tipo; // si el administrador eligió la gestión, no se puede cambiar
    const g = armarGestion(b, v.admin, link.codigo);
    if (g.error) { res.status(400).json({ error: g.error }); return; }
    const crudas = (Array.isArray(b.fotos) ? b.fotos : []).slice(0, 2).map(fotos.decodificarFoto);
    if (crudas.some((f) => !f)) { res.status(400).json({ error: "Una de las fotos no se pudo leer o es muy pesada. Sacala de nuevo" }); return; }
    // Primero se "reserva" el link (así dos envíos a la vez no generan dos pedidos).
    let reservado = false;
    await modificar(gh, rutaInvitaciones(link.codigo), [], (lista) => {
      const inv = lista.find((x) => x.id === link.id);
      if (!inv || inv.usada || inv.cancelada) return null;
      inv.usada = { fecha: new Date().toISOString(), gestion: g.gestion.id };
      reservado = true;
      return lista;
    }, "Consorcio: link usado");
    if (!reservado) { res.status(410).json({ error: "Este link ya se usó" }); return; }
    try {
      g.gestion.fotos = [];
      for (const f of crudas) g.gestion.fotos.push(await fotos.guardarFoto(link.codigo, f));
      g.gestion.origen = "vecino";
      g.gestion.invitacion = link.id;
      g.gestion.cargada_por = txtPublico(b.cargada_por, 80) || g.gestion.titular;
      g.gestion.contacto_vecino = soloTelefono(b.contacto_vecino);
      // El link ya es la autorización del administrador: el pedido va directo a SAT.
      g.gestion.estado = "pendiente";
      g.gestion.historial = [{ fecha: new Date().toISOString(), estado: "pendiente", por: "Vecino (link)" }];
      await modificar(gh, rutaGestiones(link.codigo), [], (lista) => agregarConNumero(lista, g.gestion), `Consorcio: pedido de vecino por link (${v.admin.nombre})`);
    } catch (e) {
      // Si no se pudo guardar el pedido, el link vuelve a quedar disponible.
      await modificar(gh, rutaInvitaciones(link.codigo), [], (lista) => { const inv = lista.find((x) => x.id === link.id); if (inv) inv.usada = null; return lista; }, "Consorcio: link liberado").catch(() => {});
      throw e;
    }
    await avisarPorMail(g.gestion, ed.nombre);
    // Copia para el vecino, si la pidió.
    let copia = false;
    if (b.copia === true && g.gestion.email) {
      const G = g.gestion;
      copia = await mandarMail("constancia_pedido", {
        para: G.email, nombre: G.titular, edificio: ed.nombre, numero: G.numero, tipo_txt: TIPOS[G.tipo], administrador: v.admin.nombre,
        unidad: [G.piso || G.unidad ? `${G.piso ? G.piso + "°" : ""} ${G.unidad || ""}`.trim() : "", G.cochera ? "Cochera " + G.cochera : ""].filter(Boolean).join(" · "),
        detalle: [G.tipo === "nuevo" ? `${G.cantidad} × ${G.dispositivo === "control" ? "control de cochera" : "tag"}` : "", G.tag ? "Llave " + G.tag : "", (MOTIVOS[G.tipo] || {})[G.motivo] ? "Motivo: " + MOTIVOS[G.tipo][G.motivo] : "", G.tipo === "titularidad" ? "Nuevo titular: " + G.nuevo_titular : "", G.observaciones].filter(Boolean),
      });
    }
    res.status(200).json({ ok: true, numero: g.gestion.numero, administrador: v.admin.nombre, copia });
  } catch (e) {
    res.status(502).json({ error: "No se pudo completar, probá de nuevo en un momento" });
  }
}

function armarGestion(b, admin, codigo) {
  const tipo = Object.keys(TIPOS).includes(b.tipo) ? b.tipo : "";
  if (!tipo) return { error: "Elegí qué gestión querés hacer" };
  const motivos = MOTIVOS[tipo] || {};
  const g = {
    id: Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
    fecha: new Date().toISOString(),
    edificio: codigo,
    admin_id: admin.id,
    admin_nombre: admin.nombre,
    tipo,
    piso: txtPublico(b.piso, 10),
    unidad: txtPublico(b.unidad, 10),
    cochera: txtPublico(b.cochera, 15),
    titular: txtPublico(b.titular, 80),
    telefono: soloTelefono(b.telefono),
    email: txt(b.email, 80).toLowerCase(),
    relacion: ["propietario", "inquilino", "otro"].includes(b.relacion) ? b.relacion : "",
    dispositivo: ["tag", "control"].includes(b.dispositivo) ? b.dispositivo : "tag",
    cantidad: Math.min(10, Math.max(1, parseInt(b.cantidad, 10) || 1)),
    tag: b.dispositivo === "control" ? soloTag(b.tag) : normalizarTag(b.tag),
    usuario: soloUsuario(b.usuario),
    motivo: Object.keys(motivos).includes(b.motivo) ? b.motivo : "",
    nuevo_titular: tipo === "titularidad" ? txtPublico(b.nuevo_titular, 80) : "",
    nuevo_telefono: tipo === "titularidad" ? soloTelefono(b.nuevo_telefono) : "",
    nuevo_email: tipo === "titularidad" ? txt(b.nuevo_email, 80).toLowerCase() : "",
    llaves_titularidad: tipo === "titularidad" && ["transferir", "reemplazar"].includes(b.llaves_titularidad) ? b.llaves_titularidad : "",
    registro_id: /^[a-z0-9]{6,30}$/.test(String(b.registro_id || "")) ? b.registro_id : "",
    observaciones: txtPublico(b.observaciones, 600),
    estado: "pendiente",
    nota_sat: "",
    historial: [{ fecha: new Date().toISOString(), estado: "pendiente", por: admin.nombre }],
  };
  if (!g.piso && !g.unidad && !g.cochera) return { error: "Falta la unidad (piso y depto, o cochera)" };
  if (!g.titular) return { error: tipo === "titularidad" ? "Falta el titular actual" : "Falta el nombre del titular" };
  if (g.email && !MAIL_VALIDO.test(g.email)) return { error: "El mail no parece válido" };
  if (g.nuevo_email && !MAIL_VALIDO.test(g.nuevo_email)) return { error: "El mail del nuevo titular no parece válido" };
  if (tipo === "nuevo" && g.telefono.replace(/\D/g, "").length < 6) return { error: "Falta el teléfono del titular" };
  if ((tipo === "reemplazo" || tipo === "baja") && !g.motivo) return { error: "Falta el motivo" };
  if (tipo === "titularidad") {
    if (!g.nuevo_titular) return { error: "Falta el nuevo titular" };
    if (g.nuevo_telefono.replace(/\D/g, "").length < 6) return { error: "Falta el teléfono del nuevo titular" };
    if (!g.llaves_titularidad) return { error: "Elegí qué pasa con las llaves" };
  }
  return { gestion: g };
}

// ---------- Panel de SAT (admin.html) ----------
async function manejarAdmin(req, res, autorizacion, gh) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (!autorizacion || autorizacion.rol !== "admin") { res.status(403).json({ error: "Solo desde el panel de administración" }); return; }
  if (!process.env.GITHUB_DATA_TOKEN || !process.env.GITHUB_DATA_REPO) { res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" }); return; }
  const quien = autorizacion.nombre || "admin";
  try {
    if (req.method === "GET") {
      if (req.query.foto) { await fotos.enviarFoto(res, String(req.query.edificio || ""), String(req.query.foto)); return; }
      const { lista: edificios } = await leerEdificios(gh);
      if (req.query.gestiones) {
        const codigos = req.query.edificio ? [String(req.query.edificio)].filter(codigoValido) : edificios.map((e) => e.codigo);
        const todas = (await Promise.all(codigos.map(async (c) => {
          const { data } = await gh.leer(rutaGestiones(c), []);
          const ed = edificios.find((e) => e.codigo === c);
          return (Array.isArray(data) ? data : []).map((g) => ({ ...g, edificio_nombre: ed ? ed.nombre : c }));
        }))).flat().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
        res.status(200).json(todas);
        return;
      }
      res.status(200).json((await leerAdmins(gh, true)).map(adminPublico));
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    const b = cuerpo(req);
    const { lista: edificios } = await leerEdificios(gh);
    const codigosValidos = new Set(edificios.map((e) => e.codigo));

    if (b.accion === "guardar_admin") {
      const nombre = txtPublico(b.nombre, 80);
      const email = txt(b.email, 80).toLowerCase();
      if (!nombre) { res.status(400).json({ error: "Falta el nombre" }); return; }
      if (!MAIL_VALIDO.test(email)) { res.status(400).json({ error: "El mail no parece válido (es con lo que entra al portal)" }); return; }
      const eds = (Array.isArray(b.edificios) ? b.edificios : []).map(String).filter((c) => codigosValidos.has(c));
      let clave = null, guardado = null, repetido = false;
      await modificar(gh, RUTA_ADMINS, [], (lista) => {
        if (lista.some((x) => x.email === email && x.id !== b.id)) { repetido = true; return null; }
        let a = b.id ? lista.find((x) => x.id === b.id) : null;
        if (b.id && !a) return null;
        if (!a) {
          clave = generarClave();
          const sal = crypto.randomBytes(16).toString("hex");
          a = { id: "adm" + crypto.randomBytes(5).toString("hex"), creado_en: new Date().toISOString(), creado_por: quien, sal, hash: hashClave(clave, sal), v: 1, cambio_clave_propia: false };
          lista.push(a);
        }
        a.nombre = nombre;
        a.email = email;
        a.telefono = soloTelefono(b.telefono);
        a.edificios = eds;
        if (b.activo === false && a.activo !== false) a.v = (a.v || 1) + 1; // al desactivarlo se le cierra la sesión
        a.activo = b.activo !== false;
        guardado = a;
        return lista;
      }, `Consorcio: administrador ${nombre} (${quien})`);
      cacheAdmins = null;
      if (repetido) { res.status(400).json({ error: "Ya hay un administrador con ese mail" }); return; }
      if (!guardado) { res.status(404).json({ error: "No se encontró el administrador" }); return; }
      res.status(200).json({ ok: true, admin: adminPublico(guardado), clave });
      return;
    }
    if (b.accion === "nueva_clave") {
      const clave = generarClave();
      let a = null;
      await modificar(gh, RUTA_ADMINS, [], (lista) => {
        a = lista.find((x) => x.id === b.id);
        if (!a) return null;
        a.sal = crypto.randomBytes(16).toString("hex");
        a.hash = hashClave(clave, a.sal);
        a.v = (a.v || 1) + 1;
        a.cambio_clave_propia = false;
        a.clave_cambiada_en = new Date().toISOString();
        return lista;
      }, `Consorcio: nueva clave para ${b.id} (${quien})`);
      cacheAdmins = null;
      if (!a) { res.status(404).json({ error: "No se encontró el administrador" }); return; }
      res.status(200).json({ ok: true, clave });
      return;
    }
    if (b.accion === "borrar_admin") {
      let hay = false;
      await modificar(gh, RUTA_ADMINS, [], (lista) => {
        const i = lista.findIndex((x) => x.id === b.id);
        if (i < 0) return null;
        lista.splice(i, 1); hay = true;
        return lista;
      }, `Consorcio: borrado administrador ${b.id} (${quien})`);
      cacheAdmins = null;
      if (!hay) { res.status(404).json({ error: "No se encontró el administrador" }); return; }
      res.status(200).json({ ok: true });
      return;
    }
    if (b.accion === "estado_gestion" || b.accion === "previsualizar_gestion") {
      const codigo = String(b.edificio || "");
      if (!codigoValido(codigo)) { res.status(400).json({ error: "Código inválido" }); return; }
      if (b.estado !== undefined && !ESTADOS_GESTION[b.estado]) { res.status(400).json({ error: "Estado inválido" }); return; }
      const { data } = await gh.leer(rutaGestiones(codigo), []);
      const actual = (Array.isArray(data) ? data : []).find((x) => x.id === b.id);
      if (!actual) { res.status(404).json({ error: "No se encontró la gestión" }); return; }
      const padron = require("./padron");
      // Qué le haría al padrón marcarla hecha (sin guardar nada).
      if (b.accion === "previsualizar_gestion") {
        res.status(200).json({ acciones: await padron.aplicarGestion(gh, codigo, actual, b.llaves_nuevas, quien, true), ya_aplicada: !!actual.aplicada });
        return;
      }
      // Al pasar a "Hecha", primero se actualiza el padrón (si falla, la gestión no cambia).
      let aplicada = null;
      if (b.estado === "hecha" && actual.estado !== "hecha" && !actual.aplicada && b.aplicar !== false) {
        aplicada = { fecha: new Date().toISOString(), por: quien, acciones: await padron.aplicarGestion(gh, codigo, actual, b.llaves_nuevas, quien, false) };
      }
      let antes = null, despues = null;
      await modificar(gh, rutaGestiones(codigo), [], (lista) => {
        const g = lista.find((x) => x.id === b.id);
        if (!g) return null;
        antes = g.estado;
        if (b.estado !== undefined && b.estado !== g.estado) {
          g.estado = b.estado;
          g.historial = (g.historial || []).concat({ fecha: new Date().toISOString(), estado: b.estado, por: quien });
        }
        if (b.nota_sat !== undefined) g.nota_sat = txtPublico(b.nota_sat, 400);
        if (aplicada) g.aplicada = aplicada;
        // Las llaves que SAT cargó al marcarla hecha: son las que después se entregan (con firma).
        if (b.estado === "hecha" && Array.isArray(b.llaves_nuevas)) {
          g.llaves_entregadas = b.llaves_nuevas.slice(0, 10).map((n) => {
            const tipo = n && n.tipo === "control" ? "control" : "tag";
            return { tipo, tag: tipo === "tag" ? normalizarTag(n && n.tag) : soloTag(n && n.tag), usuario: soloUsuario(n && n.usuario) };
          }).filter((n) => n.tag || n.usuario);
        }
        g.actualizado_por = quien;
        g.actualizado_en = new Date().toISOString();
        despues = { ...g };
        return lista;
      }, `Consorcio: gestión ${b.id} (${quien})`);
      if (!despues) { res.status(404).json({ error: "No se encontró la gestión" }); return; }
      // Cambió el estado: se le avisa por mail al administrador (y al vecino, si la cargó él y dejó su mail).
      if (despues.estado !== antes && despues.estado !== "pendiente") await avisarCambioEstado(gh, codigo, despues);
      // Denuncia de robo/extravío terminada: la estación quita la alerta de esa tarjeta.
      if (despues.estado !== antes && despues.origen === "emergencia") await require("./robo-llaves").cerrarAlerta(gh, codigo, despues);
      res.status(200).json({ ok: true, aplicada });
      return;
    }
    res.status(400).json({ error: "Acción inválida" });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}

module.exports = { manejarPortal, manejarAdmin, manejarLink, avisarEntrega, TIPOS, MOTIVOS, ESTADOS_GESTION, _interno: { leerAdmins: (...a) => leerAdmins(...a), agregarConNumero, avisarPorMail }, _leerPase: leerPase, _reiniciar: () => { cacheAdmins = null; } };
