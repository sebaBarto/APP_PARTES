// ============================================================
// PADRÓN DE LLAVES POR EDIFICIO
//
// El padrón es el mismo archivo donde caen los registros del QR
// (registro-llaves/<codigo>.json): una entrada por persona, con su unidad y
// sus llaves/controles. Ahora también lo alimentan:
//   - las gestiones de los administradores de consorcio, al marcarlas
//     "Hecha" (alta, reemplazo, baja, cambio de titularidad);
//   - las altas manuales de SAT.
// Cada persona guarda un historial de lo que le pasó a sus llaves.
// ============================================================
const crypto = require("crypto");
const { util, normalizarTag } = require("./registro-llaves");
const { normPiso, normDepto, pisoGrado } = require("./unidad");
const { txtPublico, soloTelefono, soloUsuario, soloTag, modificar, rutaEdificio } = util;

const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
// "069:02561", "69,2561", "0004521873"… → misma clave
function claveTag(t) {
  const n = normalizarTag(t);
  if (/^\d{3}:\d{5}$/.test(n)) return n;
  const d = String(n || "").replace(/\D/g, "");
  if (/^\d{10}$/.test(d) && Number(d) < 2 ** 32) {
    const v = Number(d);
    return String(Math.floor(v / 65536) % 256).padStart(3, "0") + ":" + String(v % 65536).padStart(5, "0");
  }
  return d ? "n" + d.replace(/^0+/, "") : sinAcentos(n);
}
const mismaUnidad = (r, g) =>
  (g.piso || g.unidad) ? normPiso(r.piso) === normPiso(g.piso) && normDepto(r.unidad) === normDepto(g.unidad)
    : !!g.cochera && sinAcentos(r.cochera) === sinAcentos(g.cochera);
const unidadTxt = (x) => [x.piso || x.unidad ? `${x.piso ? pisoGrado(x.piso) : ""} ${x.unidad || ""}`.trim() : "", x.cochera ? "cochera " + x.cochera : ""].filter(Boolean).join(" · ") || "sin unidad";
const activa = (l) => l.estado !== "dada_de_baja";
// Identifica una llave de una persona para elegirla en el panel: por su N° (serial) o su N° de usuario.
const claveLlave = (l, i) => (l.tag ? "t:" + claveTag(l.tag) : l.usuario ? "u:" + l.usuario : "i:" + i);

function nuevaPersona(g, nombre, telefono, email, origen) {
  return {
    id: Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
    fecha: new Date().toISOString(),
    nombre, telefono: telefono || "", email: email || "",
    relacion: g.relacion === "inquilino" ? "inquilino" : g.relacion === "otro" ? "otro" : "titular",
    relacion_otro: "",
    tipo: !g.piso && !g.unidad && g.cochera ? "cochera" : g.cochera ? "ambas" : "vivienda",
    piso: g.piso || "", unidad: g.unidad || "", cochera: g.cochera || "",
    llaves: [], perdidas: [], comentario: "",
    origen,
    historial: [],
  };
}

// Aplica una gestión hecha al padrón. Con simular=true no guarda nada y solo
// devuelve qué haría (para mostrarlo antes de confirmar).
// nuevas: llaves que entregó SAT [{ tag, usuario, tipo }].
// elegidas: claves (claveLlave) de las llaves de la persona que SAT eligió en el panel: en un cambio de
// titularidad, cuáles pasan al nuevo titular (o se dan de baja); en un reemplazo o una baja, cuál es.
// Sin elegir (undefined) se hace como antes: todas / la única que tiene.
async function aplicarGestion(gh, codigo, g, nuevas, quien, simular, elegidas) {
  const elegir = Array.isArray(elegidas) ? new Set(elegidas.map(String)) : null;
  const ahora = new Date().toISOString();
  const pedido = g.numero ? `pedido N° ${g.numero}` : "pedido";
  const entregadas = (Array.isArray(nuevas) ? nuevas : []).slice(0, 10)
    .map((n) => {
      const tipo = n && n.tipo === "control" ? "control" : (n && n.tipo) === "tag" ? "tag" : (g.dispositivo === "control" ? "control" : "tag");
      return { tipo, tag: tipo === "tag" ? normalizarTag(n && n.tag) : soloTag(n && n.tag), usuario: soloUsuario(n && n.usuario) };
    })
    .filter((n) => n.tag || n.usuario);

  // Persona a la que se refiere el pedido: la elegida, la de esa unidad con ese nombre o, si no
  // se sabe el nombre (p. ej. cambio de titularidad sabiendo solo la llave o la unidad), la que
  // tiene esa llave en la unidad o la única persona de la unidad.
  const buscarPersona = (regs) => {
    const elegida = regs.find((r) => g.registro_id && r.id === g.registro_id);
    if (elegida) return elegida;
    if (g.titular) { const r = regs.find((r) => mismaUnidad(r, g) && sinAcentos(r.nombre) === sinAcentos(g.titular)); if (r) return r; }
    const k = g.tag ? claveTag(g.tag) : "";
    const deLaUnidad = regs.filter((r) => mismaUnidad(r, g));
    if (k) { const r = deLaUnidad.find((r) => (r.llaves || []).some((l) => l.tag && claveTag(l.tag) === k && l.estado !== "dada_de_baja")); if (r) return r; }
    if (!g.titular && deLaUnidad.length === 1) return deLaUnidad[0];
    return null;
  };
  const cambiar = (regs) => {
    const acciones = [];
    const hist = (r, que) => { r.historial = (r.historial || []).concat({ fecha: ahora, que, por: quien, pedido: g.numero || null }); };
    const persona = () => buscarPersona(regs);
    const buscarLlave = (tag, tipo, dentroDe) => {
      const k = tag ? claveTag(tag) : "";
      for (const r of dentroDe ? [dentroDe] : regs) {
        for (const l of r.llaves || []) {
          if (!activa(l)) continue;
          if (k && l.tag && claveTag(l.tag) === k) return { r, l };
        }
      }
      // Sin número: si la persona tiene una sola llave activa de ese tipo, es esa.
      if (dentroDe && !k) {
        const act = (dentroDe.llaves || []).filter((l) => activa(l) && (l.tipo || "tag") === tipo);
        if (act.length === 1) return { r: dentroDe, l: act[0] };
      }
      return null;
    };
    // La llave que eligió SAT entre las de la persona (cuando el pedido no trae el número).
    const elegidaDe = (p) => {
      if (!p || !elegir || !elegir.size) return null;
      const i = (p.llaves || []).findIndex((l, k) => activa(l) && elegir.has(claveLlave(l, k)));
      return i >= 0 ? { r: p, l: p.llaves[i] } : null;
    };
    const darDeBaja = (enc, motivo) => {
      enc.l.estado = "dada_de_baja";
      enc.l.nota = [enc.l.nota, `${motivo} (${pedido})`].filter(Boolean).join(" · ");
      enc.l.revisado_por = quien; enc.l.revisado_en = ahora;
      hist(enc.r, `Baja de ${enc.l.tipo === "control" ? "control" : "llave"} ${enc.l.tag || "s/n"}: ${motivo}`);
      acciones.push(`Dada de baja la ${enc.l.tipo === "control" ? "control" : "llave"} ${enc.l.tag || "s/n"} de ${enc.r.nombre} (${unidadTxt(enc.r)})`);
    };
    const darDeAlta = (r) => {
      if (!entregadas.length) { acciones.push(`Sin número de llave cargado para ${r.nombre}: completalo después en el padrón`); return; }
      entregadas.forEach((n) => {
        r.llaves = r.llaves || [];
        r.llaves.push({ tipo: n.tipo, tag: n.tag, usuario: n.usuario, estado: "conciliada", nota: `Entregada (${pedido})`, revisado_por: quien, revisado_en: ahora });
        hist(r, `Alta de ${n.tipo === "control" ? "control" : "llave"} ${n.tag || "s/n"}${n.usuario ? " (usuario " + n.usuario + ")" : ""}`);
        acciones.push(`Alta de ${n.tipo === "control" ? "control" : "llave"} ${n.tag || "s/n"} para ${r.nombre} (${unidadTxt(r)})`);
      });
    };
    const crear = (nombre, telefono, email) => {
      const r = nuevaPersona(g, nombre, telefono, email, "pedido");
      hist(r, `Agregado al padrón por el ${pedido}`);
      regs.push(r);
      acciones.push(`Nueva persona en el padrón: ${nombre} (${unidadTxt(r)})`);
      return r;
    };

    if (g.tipo === "nuevo") {
      let r = persona();
      if (!r) r = crear(g.titular, g.telefono, g.email);
      darDeAlta(r);
    } else if (g.tipo === "reemplazo") {
      const p = persona();
      const vieja = buscarLlave(g.tag, g.dispositivo, null) || elegidaDe(p) || (p && buscarLlave("", g.dispositivo, p));
      if (vieja) darDeBaja(vieja, "Reemplazada");
      else acciones.push(`No se encontró en el padrón la llave a reemplazar${g.tag ? " " + g.tag : ""}`);
      darDeAlta((vieja && vieja.r) || p || crear(g.titular, g.telefono, g.email));
    } else if (g.tipo === "baja") {
      const p = persona();
      const enc = buscarLlave(g.tag, g.dispositivo, null) || elegidaDe(p) || (p && buscarLlave("", g.dispositivo, p));
      const motivos = { extravio: "Extravío", robo: "Robo", ya_no_vive: "Ya no vive", otro: "Baja" };
      if (enc) darDeBaja(enc, motivos[g.motivo] || "Baja");
      else acciones.push(`No se encontró en el padrón la llave${g.tag ? " " + g.tag : ""} de ${g.titular}: revisá la estación igual`);
    } else if (g.tipo === "reactivacion") {
      // La llave había quedado dada de baja (o para dar de baja) por una denuncia, y apareció.
      const k = g.tag ? claveTag(g.tag) : "";
      const p = persona();
      const deBaja = (l) => l.estado === "baja" || l.estado === "dada_de_baja";
      let enc = null;
      for (const r of p ? [p, ...regs] : regs) {
        const l = (r.llaves || []).find((l) => deBaja(l) && ((k && l.tag && claveTag(l.tag) === k) || (!k && g.usuario && l.usuario === g.usuario)));
        if (l) { enc = { r, l }; break; }
      }
      if (enc) {
        enc.l.estado = "conciliada";
        enc.l.nota = [enc.l.nota, `Reactivada: la recuperó (${pedido})`].filter(Boolean).join(" · ");
        enc.l.revisado_por = quien; enc.l.revisado_en = ahora;
        hist(enc.r, `Reactivación de ${enc.l.tipo === "control" ? "control" : "llave"} ${enc.l.tag || "s/n"}: la recuperó`);
        acciones.push(`Vuelve a estar activa la ${enc.l.tipo === "control" ? "control" : "llave"} ${enc.l.tag || "s/n"} de ${enc.r.nombre} (${unidadTxt(enc.r)})`);
      } else {
        const activaYa = k && regs.some((r) => (r.llaves || []).some((l) => activa(l) && !deBaja(l) && l.tag && claveTag(l.tag) === k));
        acciones.push(activaYa ? `La llave ${g.tag} ya figura activa en el padrón` : `No se encontró en el padrón la llave ${g.tag || "s/n"} dada de baja: revisá la estación igual`);
      }
    } else if (g.tipo === "titularidad") {
      const anterior = persona();
      const act = anterior ? (anterior.llaves || []).map((l, i) => ({ l, k: claveLlave(l, i) })).filter((x) => activa(x.l)) : [];
      const elegidasAct = elegir ? act.filter((x) => elegir.has(x.k)) : act;
      const parcial = !!anterior && elegir && elegidasAct.length < act.length; // el anterior se queda con alguna
      const tx = (l) => `${l.tipo === "control" ? "control" : "llave"} ${l.tag || "s/n"}${l.usuario ? " (usuario " + l.usuario + ")" : ""}`;
      if (g.llaves_titularidad === "transferir" && anterior && parcial) {
        // Le cede solo algunas: el nuevo titular queda como otra persona de la unidad, con esas llaves.
        const nuevo = crear(g.nuevo_titular, g.nuevo_telefono, g.nuevo_email);
        elegidasAct.forEach(({ l }) => {
          anterior.llaves = anterior.llaves.filter((x) => x !== l);
          nuevo.llaves.push({ ...l, nota: [l.nota, `Cedida por ${anterior.nombre} (${pedido})`].filter(Boolean).join(" · "), revisado_por: quien, revisado_en: ahora });
          hist(anterior, `Le cedió la ${tx(l)} a ${g.nuevo_titular}`);
          hist(nuevo, `Recibió la ${tx(l)} de ${anterior.nombre}`);
          acciones.push(`La ${tx(l)} pasa de ${anterior.nombre} a ${g.nuevo_titular}`);
        });
        if (!elegidasAct.length) acciones.push(`Ninguna llave pasa a ${g.nuevo_titular}`);
        acciones.push(`${anterior.nombre} se queda con: ${anterior.llaves.filter(activa).map(tx).join(", ")}`);
        if (entregadas.length) darDeAlta(nuevo);
      } else if (g.llaves_titularidad === "transferir" && anterior) {
        const antes = anterior.nombre;
        anterior.nombre = g.nuevo_titular;
        anterior.telefono = g.nuevo_telefono || anterior.telefono;
        anterior.email = g.nuevo_email || "";
        anterior.relacion = "titular";
        hist(anterior, `Cambio de titularidad: ${antes} → ${g.nuevo_titular} (se queda con las llaves)`);
        acciones.push(`Las llaves de ${antes} (${unidadTxt(anterior)}) pasan a ${g.nuevo_titular}`);
        if (entregadas.length) darDeAlta(anterior);
      } else {
        if (anterior) {
          // Se dan de baja las que eligió SAT (todas, si no eligió); con las demás se queda.
          elegidasAct.forEach(({ l }) => darDeBaja({ r: anterior, l }, `Cambio de titularidad a ${g.nuevo_titular}`));
          if (parcial) acciones.push(`${anterior.nombre} se queda con: ${anterior.llaves.filter(activa).map(tx).join(", ")}`);
          else hist(anterior, `Dejó de ser titular (pasa a ${g.nuevo_titular})`);
          if (!act.length) acciones.push(`${anterior.nombre} no tenía llaves activas en el padrón`);
        } else acciones.push(`No se encontró ${g.titular ? "a " + g.titular : "al titular anterior"} en el padrón de esa unidad`);
        const nuevo = crear(g.nuevo_titular, g.nuevo_telefono, g.nuevo_email);
        darDeAlta(nuevo);
      }
    }
    // Las llaves activas de la persona del pedido (para elegir en el panel).
    const p = (g.tipo === "titularidad" || g.tipo === "reemplazo" || g.tipo === "baja") ? personaInicial : null;
    llavesPersona = p ? (p.llaves || []).map((l, i) => ({ clave: claveLlave(l, i), tipo: l.tipo || "tag", tag: l.tag || "", usuario: l.usuario || "", estado: l.estado || "" })).filter((x) => x.estado !== "dada_de_baja") : [];
    return { regs, acciones };
  };
  let llavesPersona = [], personaInicial = null;

  if (simular) {
    const { data } = await gh.leer(rutaEdificio(codigo), []);
    const regs = JSON.parse(JSON.stringify(Array.isArray(data) ? data : []));
    personaInicial = JSON.parse(JSON.stringify(buscarPersona(regs) || null));
    const acciones = cambiar(regs).acciones;
    if (simular === "detalle") return { acciones, llaves_persona: llavesPersona, persona: personaInicial ? personaInicial.nombre : "" };
    return acciones;
  }
  let acciones = [];
  await modificar(gh, rutaEdificio(codigo), [], (regs) => { const r = cambiar(regs); acciones = r.acciones; return r.regs; }, `Padrón de llaves: ${pedido} (${quien})`);
  return acciones;
}

// Alta manual de SAT (carga inicial, alguien que no usó el QR…).
async function agregarManual(gh, codigo, b, quien) {
  const g = { piso: normPiso(txtPublico(b.piso, 20)), unidad: normDepto(txtPublico(b.unidad, 10)), cochera: txtPublico(b.cochera, 15), relacion: b.relacion };
  const nombre = txtPublico(b.nombre, 80);
  if (!nombre) return { error: "Falta el nombre" };
  if (!g.piso && !g.unidad && !g.cochera) return { error: "Falta la unidad" };
  let r;
  await modificar(gh, rutaEdificio(codigo), [], (regs) => {
    r = nuevaPersona(g, nombre, soloTelefono(b.telefono), "", "sat");
    const tipo = b.dispositivo === "control" ? "control" : "tag";
    const tag = tipo === "tag" ? normalizarTag(b.tag) : soloTag(b.tag);
    if (tag || b.usuario) r.llaves.push({ tipo, tag, usuario: soloUsuario(b.usuario), estado: "conciliada", nota: "", revisado_por: quien, revisado_en: new Date().toISOString() });
    r.historial.push({ fecha: new Date().toISOString(), que: "Cargado a mano por SAT", por: quien });
    regs.push(r);
    return regs;
  }, `Padrón de llaves: alta manual (${quien})`);
  return { registro: r };
}

// ---------- Carga del padrón desde un Excel de SAT ----------
// filas: [{ piso, unidad, cochera, nombre, relacion, telefono, email, dispositivo, tag, usuario, estado }]
// modo "actualizar": suma y corrige, no borra a nadie.
// modo "reemplazar": el Excel pasa a ser el padrón; quien no figura se quita.
// A cada persona que ya estaba (misma unidad y mismo nombre) se le conservan id, fecha,
// historial, fotos y notas de sus llaves.
const MAX_FILAS_IMPORT = 3000;
const ESTADO_EXCEL = (txt, def) => {
  const t = sinAcentos(txt);
  if (!t) return def;
  if (/dadadebaja|dadodebaja/.test(t)) return "dada_de_baja";
  if (/baja/.test(t)) return "baja";
  if (/pendiente|revision|registrada/.test(t)) return "pendiente";
  if (/concil|aldia|activa|activo|ok|control/.test(t)) return "conciliada";
  return def;
};
async function importarPadron(gh, codigo, b, quien, simular) {
  const modo = b.modo === "reemplazar" ? "reemplazar" : "actualizar";
  const estadoDef = b.estado_defecto === "pendiente" ? "pendiente" : "conciliada";
  const ahora = new Date().toISOString();
  const avisos = [];
  // 1) Agrupar las filas por persona (misma unidad + mismo nombre).
  const grupos = new Map();
  (Array.isArray(b.filas) ? b.filas : []).slice(0, MAX_FILAS_IMPORT).forEach((f, i) => {
    if (!f || typeof f !== "object") return;
    const fila = Number(f.fila) || i + 2;
    const g = { piso: normPiso(txtPublico(f.piso, 20)), unidad: normDepto(txtPublico(f.unidad, 10)), cochera: txtPublico(f.cochera, 15) };
    const nombre = txtPublico(f.nombre, 80) || "Sin nombre";
    const tipo = /control|remoto|cochera/i.test(String(f.dispositivo || "")) ? "control" : "tag";
    const tagTxt = String(f.tag == null ? "" : f.tag).trim();
    const tag = tipo === "tag" ? normalizarTag(tagTxt) : soloTag(tagTxt);
    const usuario = soloUsuario(f.usuario);
    if (!g.piso && !g.unidad && !g.cochera) { if (nombre !== "Sin nombre" || tag) avisos.push(`Fila ${fila}: sin piso, depto ni cochera; no se cargó`); return; }
    const k = [sinAcentos(nombre), g.piso, g.unidad, sinAcentos(g.cochera)].join("|");
    if (!grupos.has(k)) grupos.set(k, { g, nombre, telefono: "", email: "", relacion: "", llaves: [], fila });
    const P = grupos.get(k);
    if (!P.telefono) P.telefono = soloTelefono(f.telefono);
    if (!P.email) P.email = txtPublico(f.email, 80);
    if (!P.relacion) { const r = sinAcentos(f.relacion); P.relacion = /inquilin/.test(r) ? "inquilino" : /titular|propiet|dueno/.test(r) ? "titular" : r ? "otro" : ""; }
    if (tag || usuario) {
      const ck = tag ? claveTag(tag) : "u" + usuario;
      if (P.llaves.some((l) => l.ck === ck)) return;
      P.llaves.push({ ck, tipo, tag, usuario, estado: ESTADO_EXCEL(f.estado, estadoDef) });
    }
  });
  // Un mismo número de llave en dos personas distintas.
  const vistos = new Map();
  for (const P of grupos.values()) for (const l of P.llaves) {
    if (!l.tag) continue;
    if (vistos.has(l.ck) && vistos.get(l.ck) !== P) avisos.push(`La llave ${l.tag} figura en ${vistos.get(l.ck).nombre} y en ${P.nombre}`);
    else vistos.set(l.ck, P);
  }
  if (!grupos.size) return { error: "El Excel no tiene filas con unidad y nombre o llave" };

  const resumen = { personas: grupos.size, nuevas: 0, actualizadas: 0, quitadas: 0, llaves_nuevas: 0, llaves_cambiadas: 0, llaves_quitadas: 0, quitados: [], avisos: avisos.slice(0, 60) };
  let fotosBorrar = [];
  const cambiar = (regs) => {
    regs = Array.isArray(regs) ? regs : [];
    const usados = new Set();
    const buscar = (P) => {
      let i = regs.findIndex((r, j) => !usados.has(j) && mismaUnidad(r, P.g) && sinAcentos(r.nombre) === sinAcentos(P.nombre));
      if (i < 0) {
        const cks = new Set(P.llaves.map((l) => l.ck));
        i = regs.findIndex((r, j) => !usados.has(j) && mismaUnidad(r, P.g) && (r.llaves || []).some((l) => l.tag && cks.has(claveTag(l.tag))));
      }
      return i;
    };
    const salida = [];
    for (const P of grupos.values()) {
      const i = buscar(P);
      let r;
      if (i >= 0) {
        usados.add(i); r = regs[i]; resumen.actualizadas++;
        r.nombre = P.nombre !== "Sin nombre" ? P.nombre : r.nombre;
        if (P.telefono) r.telefono = P.telefono;
        if (P.email) r.email = P.email;
        if (P.relacion) { r.relacion = P.relacion; if (P.relacion !== "otro") r.relacion_otro = ""; }
        r.piso = P.g.piso; r.unidad = P.g.unidad; if (P.g.cochera || modo === "reemplazar") r.cochera = P.g.cochera;
        r.tipo = !r.piso && !r.unidad && r.cochera ? "cochera" : r.cochera ? "ambas" : "vivienda";
      } else {
        r = nuevaPersona({ ...P.g, relacion: P.relacion }, P.nombre, P.telefono, P.email, "excel_sat"); resumen.nuevas++;
      }
      const antes = Array.isArray(r.llaves) ? r.llaves : [];
      const llaves = modo === "reemplazar" ? [] : antes.slice();
      for (const n of P.llaves) {
        const viejo = antes.find((l) => (l.tag && n.tag && claveTag(l.tag) === n.ck) || (!n.tag && n.usuario && l.usuario === n.usuario));
        const nueva = { ...(viejo || {}), tipo: n.tipo, tag: n.tag || (viejo && viejo.tag) || "", usuario: n.usuario || (viejo && viejo.usuario) || "", estado: n.estado };
        if (!viejo || viejo.estado !== n.estado) { nueva.revisado_por = quien; nueva.revisado_en = ahora; }
        if (!viejo) resumen.llaves_nuevas++;
        else if (viejo.estado !== n.estado || viejo.usuario !== nueva.usuario || viejo.tipo !== nueva.tipo) resumen.llaves_cambiadas++;
        if (modo === "reemplazar") llaves.push(nueva);
        else { const j = llaves.indexOf(viejo); if (j >= 0) llaves[j] = nueva; else llaves.push(nueva); }
      }
      if (modo === "reemplazar") {
        const quedan = new Set(llaves.map((l) => l.tag ? claveTag(l.tag) : "u" + l.usuario));
        antes.forEach((l) => { if (!quedan.has(l.tag ? claveTag(l.tag) : "u" + l.usuario)) { resumen.llaves_quitadas++; if (l.foto) fotosBorrar.push(l.foto); } });
      }
      r.llaves = llaves;
      r.historial = Array.isArray(r.historial) ? r.historial : [];
      r.historial.push({ fecha: ahora, que: i >= 0 ? "Actualizado desde el Excel de SAT" : "Cargado desde el Excel de SAT", por: quien });
      salida.push(r);
    }
    regs.forEach((r, j) => {
      if (usados.has(j)) return;
      if (modo === "reemplazar") {
        resumen.quitadas++; resumen.llaves_quitadas += (r.llaves || []).length;
        if (resumen.quitados.length < 80) resumen.quitados.push(`${unidadTxt(r)} · ${r.nombre}`);
        (r.llaves || []).forEach((l) => { if (l.foto) fotosBorrar.push(l.foto); });
      } else salida.push(r);
    });
    return salida;
  };
  if (simular) {
    const { data } = await gh.leer(rutaEdificio(codigo), []);
    cambiar(JSON.parse(JSON.stringify(Array.isArray(data) ? data : [])));
    return { resumen };
  }
  await modificar(gh, rutaEdificio(codigo), [], (regs) => {
    for (const k of Object.keys(resumen)) if (typeof resumen[k] === "number" && k !== "personas") resumen[k] = 0;
    resumen.quitados = []; fotosBorrar = [];
    return cambiar(regs);
  }, `Padrón de llaves: carga desde Excel, ${modo} (${quien})`);
  return { resumen, fotosBorrar };
}

module.exports = { aplicarGestion, agregarManual, importarPadron, claveTag };
