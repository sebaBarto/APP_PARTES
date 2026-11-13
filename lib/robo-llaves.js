// ============================================================
// Denuncia de llave robada o perdida — acceso de emergencia del vecino (24 h)
// ============================================================
// El vecino no tiene usuario: entra a robo-llave.html (desde el QR del hall, el
// cartel, la web de SAT o el link personal que le llega al registrarse) y denuncia
// el robo o la pérdida a cualquier hora, sin depender del administrador ni de SAT.
//
// Qué se dispara:
//   1. Mail a la estación de monitoreo (Security24, atiende las 24 h): si hay un
//      acceso con esa tarjeta, que despachen un móvil al edificio y llamen al titular.
//      Lleva el N° de usuario de la placa (lo que ve la estación en el evento), el
//      N° de tarjeta, cuánto se pudo verificar quién denuncia y la foto del DNI.
//   2. Un pedido de baja (prioridad robo) en el panel de SAT, para borrar la tarjeta
//      de la central. El administrador lo ve en su portal y le llegan los avisos.
//   3. Cuando SAT lo marca Hecho (o lo rechaza), un segundo mail a la estación para
//      que quite la alerta.
//
// Cómo se sabe quién es (sin nadie que atienda):
//   - "link": entró con su link personal (lo tiene solo él).
//   - "registro": su unidad y su teléfono coinciden con el padrón.
//   - "dni": no coincide, pero mandó la foto del DNI (va adjunta, no se guarda).
//   - "sin_verificar": no tenía el DNI a mano. Se manda igual y la estación llama
//     al titular antes de despachar.
//
// Destino del mail a la estación: LLAVES_ROBO_EMAIL. Mientras no esté configurada,
// va a SAT (LLAVES_AVISO_EMAIL) marcado como PRUEBA, así no le llegan pruebas a
// Security24.
// ============================================================
const crypto = require("crypto");
const RL = require("./registro-llaves");
const Cruce = require("../cruce-llaves");
const { util, normalizarTag, fotos, mandarMail, verificarCaptcha } = RL;
const { txt, txtPublico, soloTelefono, soloTag, MAIL_VALIDO, codigoValido, modificar, pasaTope, ipDe, cuerpo, leerEdificios, rutaEdificio, rutaConciliacion } = util;

const URL_PAGINA = "https://pedido.sat365.com.ar/robo-llave.html";
const AVISO_SAT = () => process.env.LLAVES_AVISO_EMAIL || "administracion@sat365.com.ar,edificios@sat365.com.ar";
const TOPES = {
  getPorIp: { n: 40, ms: 60 * 1000 },
  buscarPorIp: { n: 20, ms: 60 * 1000 },
  identificarPorIp: { n: 8, ms: 10 * 60 * 1000 },
  reportarPorIp: { n: 4, ms: 30 * 60 * 1000 },
  reportarTotal: { n: 30, ms: 60 * 60 * 1000 },
};
const MOTIVOS = { robo: "Robo", extravio: "Extravío" };
const VERIFICACION = {
  link: "Verificado: entró con su link personal de vecino registrado.",
  registro: "Verificado: su unidad y su teléfono coinciden con el registro del edificio.",
  dni: "No coincide con el registro del edificio. Mandó la foto del DNI (adjunta): compárenla con el titular antes de actuar.",
  sin_verificar: "SIN VERIFICAR: no coincide con el registro y no tenía el DNI a mano. Antes de despachar, llamen al titular registrado.",
};
const TICKET_MIN = 30;

// ---------- Destino de los mails a la estación ----------
function destinoEstacion() {
  const real = String(process.env.LLAVES_ROBO_EMAIL || "").trim();
  if (real) return { para: real, prueba: false };
  return { para: AVISO_SAT(), prueba: true };
}

// ---------- Ticket firmado entre "identificar" y "reportar" ----------
const secreto = () => "sat-robo-v1:" + (process.env.SESION_SECRET || process.env.SERVICIOS_API_TOKEN || "");
const hmac = (d) => crypto.createHmac("sha256", secreto()).update(d).digest("base64url");
function firmarTicket(o) {
  const d = Buffer.from(JSON.stringify({ ...o, exp: Date.now() + TICKET_MIN * 60 * 1000 })).toString("base64url");
  return d + "." + hmac(d);
}
function leerTicket(t) {
  const [d, f] = String(t || "").split(".");
  if (!d || !f) return null;
  const esperado = hmac(d);
  if (f.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(f), Buffer.from(esperado))) return null;
  try { const o = JSON.parse(Buffer.from(d, "base64url").toString("utf8")); return o.exp > Date.now() ? o : null; } catch (e) { return null; }
}

// ---------- Link personal (se genera al registrarse por el QR) ----------
const nuevaClave = () => crypto.randomBytes(12).toString("base64url");
const linkPersonal = (codigo, r) => (r && r.clave_emergencia ? `${URL_PAGINA}?e=${encodeURIComponent(codigo)}&k=${encodeURIComponent(r.id + "." + r.clave_emergencia)}` : "");
function registroDeClave(regs, k) {
  const [id, clave] = String(k || "").split(".");
  if (!id || !clave) return null;
  const r = regs.find((x) => x.id === id);
  if (!r || !r.clave_emergencia || r.clave_emergencia.length !== clave.length) return null;
  return crypto.timingSafeEqual(Buffer.from(r.clave_emergencia), Buffer.from(clave)) ? r : null;
}

// ---------- Ayudas ----------
const unidadTxt = (o) => [o.piso || o.unidad ? `${o.piso ? o.piso + "°" : ""} ${o.unidad || ""}`.trim() : "", o.cochera ? "Cochera " + o.cochera : ""].filter(Boolean).join(" · ");
const mismaUnidad = (r, d) => (d.piso || d.unidad)
  ? Cruce.claveUnidad(r.piso, r.unidad) === Cruce.claveUnidad(d.piso, d.unidad)
  : !!d.cochera && String(r.cochera || "").replace(/\s+/g, "").toLowerCase() === String(d.cochera).replace(/\s+/g, "").toLowerCase();
const vigentes = (r) => (r.llaves || []).map((l, i) => ({ l, i })).filter((x) => x.l.estado !== "dada_de_baja");
// Lo que ve el vecino de sus llaves: el tipo y los últimos 3 números.
const llavePublica = ({ l, i }) => ({ i, tipo: l.tipo === "control" ? "control" : "tag", fin: l.tag ? "…" + String(l.tag).replace(/\D/g, "").slice(-3) : "", foto: !l.tag && !!l.foto, denunciada: !!l.denunciada });
async function usuarioEnPlaca(gh, codigo, tag) {
  if (!tag) return "";
  try {
    const { data } = await gh.leer(rutaConciliacion(codigo), null);
    const k = Cruce.claveTag(tag);
    const f = data && (data.filas || []).find((x) => x.tag && Cruce.claveTag(x.tag) === k && x.usuario);
    return f ? String(f.usuario) : "";
  } catch (e) { return ""; }
}
async function edificioActivo(gh, codigo) {
  const { lista } = await leerEdificios(gh);
  const ed = lista.find((e) => e.codigo === codigo);
  return ed && ed.activo !== false ? ed : null;
}
const capt = () => (process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY ? process.env.TURNSTILE_SITE_KEY : "");

// ---------- Público ----------
async function manejarPublico(req, res, gh) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.GITHUB_DATA_TOKEN || !process.env.GITHUB_DATA_REPO) { res.status(500).json({ error: "Falta configuración del servidor" }); return; }
  const ip = ipDe(req);
  const telefonoEstacion = txt(process.env.LLAVES_ROBO_TELEFONO, 30);
  try {
    if (req.method === "GET") {
      // Buscar el edificio (cuando entra sin el código: desde la web o el cartel).
      if (req.query.buscar !== undefined) {
        if (!pasaTope("rb|" + ip, TOPES.buscarPorIp)) { res.status(429).json({ error: "Demasiadas búsquedas, esperá un minuto" }); return; }
        const q = String(req.query.buscar || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
        if (q.length < 4) { res.status(200).json({ edificios: [] }); return; }
        const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const { lista } = await leerEdificios(gh);
        const hallados = lista.filter((e) => e.activo !== false && (norm(e.nombre).includes(q) || norm(e.direccion).includes(q))).slice(0, 5);
        res.status(200).json({ edificios: hallados.map((e) => ({ codigo: e.codigo, nombre: e.nombre, direccion: e.direccion || "" })) });
        return;
      }
      if (!pasaTope("rg|" + ip, TOPES.getPorIp)) { res.status(429).json({ error: "Demasiados intentos, esperá un minuto" }); return; }
      const salida = { captcha: capt(), telefono_estacion: telefonoEstacion };
      const codigo = String(req.query.e || "").toLowerCase();
      if (!codigo) { res.status(200).json(salida); return; }
      if (!codigoValido(codigo)) { res.status(404).json({ error: "Código de edificio inválido" }); return; }
      const ed = await edificioActivo(gh, codigo);
      if (!ed) { res.status(404).json({ error: "Este edificio no está habilitado" }); return; }
      Object.assign(salida, { codigo, nombre: ed.nombre, direccion: ed.direccion || "" });
      // Link personal: entra ya identificado y ve sus llaves.
      if (req.query.k) {
        const { data } = await gh.leer(rutaEdificio(codigo), []);
        const r = registroDeClave(Array.isArray(data) ? data : [], req.query.k);
        if (r) {
          salida.personal = { nombre: r.nombre, unidad: unidadTxt(r), llaves: vigentes(r).map(llavePublica) };
          salida.ticket = firmarTicket({ c: codigo, r: r.id, v: "link" });
        } else salida.link_invalido = true;
      }
      res.status(200).json(salida);
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    const b = cuerpo(req);
    if (txt(b.sitio_web, 10)) { res.status(200).json({ ok: true }); return; }
    const codigo = String(b.edificio || "").toLowerCase();
    if (!codigoValido(codigo)) { res.status(400).json({ error: "Falta el edificio" }); return; }
    const ed = await edificioActivo(gh, codigo);
    if (!ed) { res.status(404).json({ error: "Este edificio no está habilitado" }); return; }

    // 1) Identificarse: unidad + nombre + teléfono contra el padrón.
    if (b.accion === "identificar") {
      if (!pasaTope("ri|" + ip, TOPES.identificarPorIp)) { res.status(429).json({ error: "Demasiados intentos. Esperá unos minutos o llamá a SAT" }); return; }
      if (!(await verificarCaptcha(b.captcha, ip))) { res.status(400).json({ error: "No pudimos verificar que no seas un robot. Esperá unos segundos y probá de nuevo", captcha: true }); return; }
      const d = { piso: txtPublico(b.piso, 10), unidad: txtPublico(b.unidad, 10), cochera: txtPublico(b.cochera, 15), nombre: txtPublico(b.nombre, 80), telefono: soloTelefono(b.telefono) };
      if (!d.piso && !d.unidad && !d.cochera) { res.status(400).json({ error: "Falta tu unidad (piso y depto, o cochera)" }); return; }
      if (!d.nombre) { res.status(400).json({ error: "Falta tu nombre" }); return; }
      if (d.telefono.replace(/\D/g, "").length < 6) { res.status(400).json({ error: "Falta tu teléfono" }); return; }
      const { data } = await gh.leer(rutaEdificio(codigo), []);
      const regs = Array.isArray(data) ? data : [];
      const t7 = Cruce.tel7(d.telefono);
      // Unidad + teléfono: lo que un desconocido no puede adivinar. El nombre solo no alcanza.
      const r = t7 ? regs.find((x) => mismaUnidad(x, d) && Cruce.tel7(x.telefono) === t7) : null;
      if (r) {
        res.status(200).json({ verificado: true, nombre: r.nombre, llaves: vigentes(r).map(llavePublica), ticket: firmarTicket({ c: codigo, r: r.id, v: "registro", ...d }) });
      } else {
        res.status(200).json({ verificado: false, ticket: firmarTicket({ c: codigo, r: "", v: "", ...d }) });
      }
      return;
    }

    // 2) Denunciar.
    if (b.accion === "reportar") {
      if (!pasaTope("rr|" + ip, TOPES.reportarPorIp) || !pasaTope("rr|total", TOPES.reportarTotal)) { res.status(429).json({ error: "Se mandaron muchas denuncias seguidas. Si es urgente, llamá a SAT" }); return; }
      const tk = leerTicket(b.ticket);
      if (!tk || tk.c !== codigo) { res.status(400).json({ error: "Pasó mucho tiempo. Volvé a cargar tus datos", reiniciar: true }); return; }
      const motivo = MOTIVOS[b.motivo] ? b.motivo : "";
      if (!motivo) { res.status(400).json({ error: "Elegí si fue robo o extravío" }); return; }
      const { data } = await gh.leer(rutaEdificio(codigo), []);
      const regs = Array.isArray(data) ? data : [];
      let declarante = tk.r ? regs.find((x) => x.id === tk.r) : null;
      let verificacion = declarante ? tk.v : "";
      // DNI: obligatorio si no se pudo verificar por el padrón (salvo que no lo tenga a mano).
      const dni = b.dni ? fotos.decodificarFoto(b.dni) : null;
      if (b.dni && !dni) { res.status(400).json({ error: "La foto del DNI no se pudo leer o es muy pesada. Sacala de nuevo" }); return; }
      if (!verificacion) {
        if (dni) verificacion = "dni";
        else if (b.sin_dni === true) verificacion = "sin_verificar";
        else { res.status(400).json({ error: "Subí una foto del DNI del titular (frente)", falta_dni: true }); return; }
      }
      // Qué llave: una de las suyas (si se identificó) o la que escribió.
      let titularReg = null, llave = null, idx = -1;
      if (declarante && b.llave !== undefined && b.llave !== "otra") {
        idx = Number(b.llave);
        llave = (declarante.llaves || [])[idx] && declarante.llaves[idx].estado !== "dada_de_baja" ? declarante.llaves[idx] : null;
        if (!llave) { res.status(400).json({ error: "Elegí qué llave perdiste" }); return; }
        titularReg = declarante;
      }
      const dispositivo = llave ? (llave.tipo === "control" ? "control" : "tag") : (b.dispositivo === "control" ? "control" : "tag");
      const tag = llave ? llave.tag || "" : (dispositivo === "control" ? soloTag(b.tag) : normalizarTag(b.tag));
      // ¿De quién es esa tarjeta según el padrón?
      if (!titularReg && tag) {
        const k = Cruce.claveTag(tag);
        for (const r of regs) {
          const j = (r.llaves || []).findIndex((l) => l.estado !== "dada_de_baja" && l.tag && Cruce.claveTag(l.tag) === k);
          if (j >= 0) { titularReg = r; idx = j; llave = r.llaves[j]; break; }
        }
      }
      const usuario = (llave && llave.usuario) || (await usuarioEnPlaca(gh, codigo, tag));
      const decl = declarante
        ? { nombre: declarante.nombre, telefono: declarante.telefono, email: txt(b.email, 80).toLowerCase() || declarante.email || "" }
        : { nombre: tk.nombre || txtPublico(b.nombre, 80), telefono: tk.telefono || soloTelefono(b.telefono), email: txt(b.email, 80).toLowerCase() };
      if (decl.email && !MAIL_VALIDO.test(decl.email)) { res.status(400).json({ error: "El mail no parece válido" }); return; }
      const unidad = declarante ? { piso: declarante.piso || "", unidad: declarante.unidad || "", cochera: declarante.cochera || "" } : { piso: tk.piso || "", unidad: tk.unidad || "", cochera: tk.cochera || "" };
      const cuando = txtPublico(b.cuando, 40), donde = txtPublico(b.donde, 120), obs = txtPublico(b.observaciones, 400);

      // ¿Ya estaba denunciada (doble toque, o la denunció otro de la familia)?
      const { data: gs } = await gh.leer(`registro-llaves/${codigo}.gestiones.json`, []);
      const hace48 = Date.now() - 48 * 3600 * 1000;
      const previa = (Array.isArray(gs) ? gs : []).find((g) => g.origen === "emergencia" && ["pendiente", "en_curso"].includes(g.estado) && Date.parse(g.fecha) > hace48 &&
        (tag ? g.tag && Cruce.claveTag(g.tag) === Cruce.claveTag(tag) : (g.registro_id && g.registro_id === (titularReg && titularReg.id) && !g.tag)));
      if (previa) { res.status(200).json({ ok: true, numero: previa.numero, ya_estaba: true, estacion_avisada: !!(previa.robo && previa.robo.estacion && previa.robo.estacion.ok), telefono_estacion: txt(process.env.LLAVES_ROBO_TELEFONO, 30) }); return; }

      const C = require("./consorcio")._interno;
      const admins = (await C.leerAdmins(gh, true)).filter((a) => a.activo !== false && (a.edificios || []).includes(codigo));
      const admin = admins[0] || null;
      const ahora = new Date().toISOString();
      const titular = titularReg ? titularReg.nombre : decl.nombre;
      const g = {
        id: Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
        fecha: ahora, edificio: codigo,
        admin_id: admin ? admin.id : "", admin_nombre: admin ? admin.nombre : "",
        tipo: "baja", motivo, dispositivo, cantidad: 1,
        piso: titularReg ? titularReg.piso || "" : unidad.piso, unidad: titularReg ? titularReg.unidad || "" : unidad.unidad, cochera: titularReg ? titularReg.cochera || "" : unidad.cochera,
        titular, telefono: titularReg ? titularReg.telefono || "" : decl.telefono, email: decl.email, relacion: "",
        tag, usuario, registro_id: titularReg ? titularReg.id : "",
        nuevo_titular: "", nuevo_telefono: "", nuevo_email: "", llaves_titularidad: "",
        observaciones: [cuando ? "Cuándo: " + cuando : "", donde ? "Dónde: " + donde : "", obs].filter(Boolean).join(" · "),
        estado: "pendiente", nota_sat: "", fotos: [],
        origen: "emergencia", cargada_por: decl.nombre, contacto_vecino: decl.telefono,
        historial: [{ fecha: ahora, estado: "pendiente", por: "Vecino (denuncia de emergencia)" }],
        robo: { verificacion, declarante: decl, cuando, donde, dni: !!dni, estacion: null, cierre: null },
      };
      await modificar(gh, `registro-llaves/${codigo}.gestiones.json`, [], (lista) => C.agregarConNumero(lista, g), `Denuncia de llave ${motivo === "robo" ? "robada" : "perdida"} (${ed.nombre})`);

      // Mail a la estación (lo urgente primero).
      const dest = destinoEstacion();
      const okEstacion = await mandarMail("robo_llave_estacion", {
        para: dest.para, prueba: dest.prueba, numero: g.numero, edificio: ed.nombre, abonado: ed.abonado || "", direccion: ed.direccion || "",
        motivo, motivo_txt: MOTIVOS[motivo], dispositivo, tag, usuario,
        titular, unidad: unidadTxt(g), telefono_titular: g.telefono,
        declarante: decl.nombre, telefono_declarante: decl.telefono, mismo: !!titularReg && titularReg === declarante,
        verificacion, verificacion_txt: VERIFICACION[verificacion], cuando, donde, observaciones: obs,
        adjuntos: dni ? [{ nombre: `DNI-${ed.nombre.replace(/[^A-Za-z0-9]+/g, "_")}-pedido-${g.numero}.jpg`, base64: dni.toString("base64") }] : [],
      });
      const estacion = { para: dest.para, prueba: dest.prueba, fecha: new Date().toISOString(), ok: okEstacion };
      await modificar(gh, `registro-llaves/${codigo}.gestiones.json`, [], (lista) => { const x = lista.find((y) => y.id === g.id); if (!x) return null; x.robo.estacion = estacion; return lista; }, "Denuncia: estación avisada").catch(() => {});
      g.robo.estacion = estacion;

      // En el padrón, la llave queda «Para dar de baja».
      if (titularReg && idx >= 0) {
        await modificar(gh, rutaEdificio(codigo), [], (lista) => {
          const r = lista.find((x) => x.id === titularReg.id);
          const l = r && (r.llaves || [])[idx];
          if (!l) return null;
          l.estado = "baja";
          l.denunciada = { fecha: ahora, motivo, numero: g.numero };
          l.nota = `Denunciada (${MOTIVOS[motivo].toLowerCase()}) por el vecino — pedido N° ${g.numero}`;
          r.historial = (r.historial || []).concat({ fecha: ahora, que: `Denunció ${dispositivo === "control" ? "el control" : "la llave"} ${tag || "sin número"} (${MOTIVOS[motivo].toLowerCase()}) — pedido N° ${g.numero}`, por: decl.nombre || "Vecino" });
          return lista;
        }, "Denuncia: llave para dar de baja").catch(() => {});
      }
      // Avisos: SAT, administradores, el vecino y el titular (si la denunció otro).
      await C.avisarPorMail(g, ed.nombre);
      for (const a of admins) {
        if (MAIL_VALIDO.test(a.email || "")) await mandarMail("robo_llave_admin", { para: a.email, nombre: a.nombre, edificio: ed.nombre, numero: g.numero, motivo_txt: MOTIVOS[motivo], unidad: unidadTxt(g), titular, verificacion_txt: VERIFICACION[verificacion], portal: "https://pedido.sat365.com.ar/consorcio.html" });
      }
      let copia = false;
      if (decl.email) copia = await mandarMail("constancia_pedido", {
        para: decl.email, nombre: decl.nombre, edificio: ed.nombre, numero: g.numero, tipo_txt: `Denuncia de ${dispositivo === "control" ? "control" : "llave"} ${motivo === "robo" ? "robado" : "perdido"}`.replace("llave robado", "llave robada").replace("llave perdido", "llave perdida"),
        administrador: admin ? admin.nombre : "SAT", unidad: unidadTxt(g),
        detalle: [tag ? (dispositivo === "control" ? "Control " : "Llave ") + tag : "", "Ya le avisamos a la central de monitoreo: si alguien la usa, despachan un móvil.", "SAT la va a dar de baja de la central."].filter(Boolean),
      });
      if (titularReg && titularReg !== declarante && MAIL_VALIDO.test(titularReg.email || "") && titularReg.email !== decl.email) {
        await mandarMail("robo_llave_titular", { para: titularReg.email, nombre: titularReg.nombre, edificio: ed.nombre, numero: g.numero, motivo_txt: MOTIVOS[motivo].toLowerCase(), fin: tag ? "…" + tag.replace(/\D/g, "").slice(-3) : "", declarante: decl.nombre });
      }
      res.status(200).json({ ok: true, numero: g.numero, estacion_avisada: okEstacion, copia, telefono_estacion: telefonoEstacion });
      return;
    }
    res.status(400).json({ error: "Acción inválida" });
  } catch (e) {
    console.error("Denuncia de llave:", e);
    res.status(502).json({ error: "No se pudo completar. Si es urgente, llamá a SAT" });
  }
}

// ---------- Cierre: SAT terminó (o rechazó) el pedido → la estación quita la alerta ----------
async function cerrarAlerta(gh, codigo, g) {
  try {
    if (!g || !g.robo || !g.robo.estacion || !g.robo.estacion.ok || g.robo.cierre) return false;
    if (!["hecha", "rechazada", "cancelada"].includes(g.estado)) return false;
    const { lista } = await leerEdificios(gh);
    const ed = lista.find((e) => e.codigo === codigo) || { nombre: codigo };
    const ok = await mandarMail("robo_llave_cierre", {
      para: g.robo.estacion.para, prueba: g.robo.estacion.prueba, numero: g.numero, edificio: ed.nombre, abonado: ed.abonado || "",
      dispositivo: g.dispositivo, tag: g.tag, usuario: g.usuario, estado: g.estado, nota: g.nota_sat || "",
      llaves_nuevas: (g.llaves_entregadas || []).map((l) => l.tag).filter(Boolean),
    });
    await modificar(gh, `registro-llaves/${codigo}.gestiones.json`, [], (lista) => { const x = lista.find((y) => y.id === g.id); if (!x || !x.robo) return null; x.robo.cierre = { fecha: new Date().toISOString(), estado: g.estado, ok }; return lista; }, "Denuncia: alerta cerrada en la estación");
    return ok;
  } catch (e) { console.error("No se pudo cerrar la alerta en la estación:", e); return false; }
}

module.exports = { manejarPublico, cerrarAlerta, linkPersonal, nuevaClave, destinoEstacion, _leerTicket: leerTicket, VERIFICACION };
