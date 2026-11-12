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
  (g.piso || g.unidad) ? sinAcentos(r.piso) === sinAcentos(g.piso) && sinAcentos(r.unidad) === sinAcentos(g.unidad)
    : !!g.cochera && sinAcentos(r.cochera) === sinAcentos(g.cochera);
const unidadTxt = (x) => [x.piso || x.unidad ? `${x.piso ? x.piso + "°" : ""} ${x.unidad || ""}`.trim() : "", x.cochera ? "cochera " + x.cochera : ""].filter(Boolean).join(" · ") || "sin unidad";
const activa = (l) => l.estado !== "dada_de_baja";

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
async function aplicarGestion(gh, codigo, g, nuevas, quien, simular) {
  const ahora = new Date().toISOString();
  const pedido = g.numero ? `pedido N° ${g.numero}` : "pedido";
  const entregadas = (Array.isArray(nuevas) ? nuevas : []).slice(0, 10)
    .map((n) => {
      const tipo = n && n.tipo === "control" ? "control" : (n && n.tipo) === "tag" ? "tag" : (g.dispositivo === "control" ? "control" : "tag");
      return { tipo, tag: tipo === "tag" ? normalizarTag(n && n.tag) : soloTag(n && n.tag), usuario: soloUsuario(n && n.usuario) };
    })
    .filter((n) => n.tag || n.usuario);

  const cambiar = (regs) => {
    const acciones = [];
    const hist = (r, que) => { r.historial = (r.historial || []).concat({ fecha: ahora, que, por: quien, pedido: g.numero || null }); };
    const persona = () => regs.find((r) => g.registro_id && r.id === g.registro_id)
      || regs.find((r) => mismaUnidad(r, g) && sinAcentos(r.nombre) === sinAcentos(g.titular));
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
      const vieja = buscarLlave(g.tag, g.dispositivo, null) || (p && buscarLlave("", g.dispositivo, p));
      if (vieja) darDeBaja(vieja, "Reemplazada");
      else acciones.push(`No se encontró en el padrón la llave a reemplazar${g.tag ? " " + g.tag : ""}`);
      darDeAlta((vieja && vieja.r) || p || crear(g.titular, g.telefono, g.email));
    } else if (g.tipo === "baja") {
      const p = persona();
      const enc = buscarLlave(g.tag, g.dispositivo, null) || (p && buscarLlave("", g.dispositivo, p));
      const motivos = { extravio: "Extravío", robo: "Robo", ya_no_vive: "Ya no vive", otro: "Baja" };
      if (enc) darDeBaja(enc, motivos[g.motivo] || "Baja");
      else acciones.push(`No se encontró en el padrón la llave${g.tag ? " " + g.tag : ""} de ${g.titular}: revisá la estación igual`);
    } else if (g.tipo === "titularidad") {
      const anterior = persona();
      if (g.llaves_titularidad === "transferir" && anterior) {
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
          const act = (anterior.llaves || []).filter(activa);
          act.forEach((l) => darDeBaja({ r: anterior, l }, `Cambio de titularidad a ${g.nuevo_titular}`));
          hist(anterior, `Dejó de ser titular (pasa a ${g.nuevo_titular})`);
          if (!act.length) acciones.push(`${anterior.nombre} no tenía llaves activas en el padrón`);
        } else acciones.push(`No se encontró a ${g.titular} en el padrón de esa unidad`);
        const nuevo = crear(g.nuevo_titular, g.nuevo_telefono, g.nuevo_email);
        darDeAlta(nuevo);
      }
    }
    return { regs, acciones };
  };

  if (simular) {
    const { data } = await gh.leer(rutaEdificio(codigo), []);
    return cambiar(JSON.parse(JSON.stringify(Array.isArray(data) ? data : []))).acciones;
  }
  let acciones = [];
  await modificar(gh, rutaEdificio(codigo), [], (regs) => { const r = cambiar(regs); acciones = r.acciones; return r.regs; }, `Padrón de llaves: ${pedido} (${quien})`);
  return acciones;
}

// Alta manual de SAT (carga inicial, alguien que no usó el QR…).
async function agregarManual(gh, codigo, b, quien) {
  const g = { piso: txtPublico(b.piso, 10), unidad: txtPublico(b.unidad, 10), cochera: txtPublico(b.cochera, 15), relacion: b.relacion };
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

module.exports = { aplicarGestion, agregarManual, claveTag };
