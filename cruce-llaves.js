// ============================================================
// CRUCE PADRÓN ↔ ESTACIÓN DE MONITOREO (llaves de edificios)
//
// Un solo criterio para la conciliación del panel (admin.html, en el
// navegador como window.CruceLlaves) y para la campaña de registro
// (lib/campana-llaves.js, en el servidor con require).
//
// Cada fila de la estación es un usuario (una llave o un control). Se busca
// en el padrón, en este orden:
//   1. por N° de llave (tag)            — exacto
//   2. por N° de usuario                — exacto
//   3. por nombre                       — el Excel de Security24 no trae el N° de
//      tag y muchos vecinos no saben su N° de usuario. Nombres en cualquier orden
//      («Pérez Ana» = «Ana Pérez»), sin tildes, «Ma.» = «María» y con
//      un error de tipeo por palabra («Gonzales» = «González»). Hacen falta al
//      menos 2 palabras en común; la misma unidad o el mismo teléfono suman.
// Lo que no aparece queda:
//   - "otra_llave": la persona SÍ está registrada pero esta llave no la declaró
//     (tiene más usuarios en la estación que llaves cargadas) → revisar, no baja.
//   - "no_vecino":  personal de SAT, funciones del sistema, proveedores
//     (según Observaciones o el nombre) → no se propone dar de baja.
//   - "no_registrada": nadie la reclamó → candidata a baja.
//
// La placa (central de alarma Paradox) es una segunda fuente: el «User Report»
// de BabyWare en PDF trae, por usuario, la etiqueta y el N° de tarjeta
// (lote:número), que el Excel de Security24 no tiene. Se cruza con la estación
// por N° de usuario (en BabyWare el 1049 es el usuario 049) y así cada fila
// queda con su N° de llave; lo que está en un lado y no en el otro se marca.
// ============================================================
(function (raiz, fabrica) {
  if (typeof module === "object" && module.exports) module.exports = fabrica();
  else raiz.CruceLlaves = fabrica();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- Números de llave y de usuario ----------
  function tagCalculado(tag) {
    const d = String(tag || "").replace(/\s/g, "");
    if (/^\d{8}$/.test(d)) return d.slice(0, 3) + ":" + d.slice(3);
    if (!/^\d{10}$/.test(d)) return "";
    const n = Number(d);
    if (!(n < 2 ** 32)) return "";
    return String(Math.floor(n / 65536) % 256).padStart(3, "0") + ":" + String(n % 65536).padStart(5, "0");
  }
  function claveTag(v) {
    const t = String(v == null ? "" : v).trim();
    if (!t) return "";
    const m = t.match(/^(\d{1,3})\s*[:.,;\s]\s*(\d{1,5})$/);
    if (m) return m[1].padStart(3, "0") + ":" + m[2].padStart(5, "0");
    const calc = tagCalculado(t);
    if (calc) return calc;
    const d = t.replace(/\D/g, "").replace(/^0+/, "");
    return d ? "n" + d : t.toLowerCase();
  }
  const claveUsuario = (v) => String(v == null ? "" : v).replace(/\D/g, "").replace(/^0+/, "");
  const esControl = (l) => !!l && l.tipo === "control";
  const esControlEstacion = (f) => /control|remoto|\brf\b|\btx\b|cochera|garage/i.test((f && f.tipo) || "");

  // ---------- Filas que no son vecinos ----------
  const RE_NO_VECINO_OBS = /empresa\s*sat|\bsat\b|c[oó]digo de funci[oó]n|no es una persona|funci[oó]n del sistema|proveedor|limpieza|bomba|ascensor|asensor|service|port[oó]n|mantenimiento|encargad|portero|vigilancia|seguridad|jardin|piscina|pileta|fumigaci/i;
  const RE_NO_VECINO_NOMBRE = /desactivaci[oó]n|activaci[oó]n|apertura|funci[oó]n|^prueba|^test\b|full service|ascensor|asensor|bombas?\b/i;
  function esNoVecino(f) {
    if (!f) return false;
    return RE_NO_VECINO_OBS.test(f.obs || "") || RE_NO_VECINO_NOMBRE.test([f.nombre, f.apellido].filter(Boolean).join(" "));
  }

  // ---------- Nombres ----------
  const VACIAS = new Set(["de", "del", "la", "las", "los", "y", "da", "di", "e", "el"]);
  function palabras(nombre) {
    return String(nombre || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/\bma\.?(?=\s|$)/g, "maria").replace(/\bfco\.?(?=\s|$)/g, "francisco")
      .replace(/[^a-z\s]/g, " ").split(/\s+/).filter((p) => p.length >= 2 && !VACIAS.has(p));
  }
  function distancia(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = fila[0]; fila[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = fila[j];
        fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return fila[b.length];
  }
  function levenshtein(a, b) {
    const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = fila[0]; fila[0] = i;
      for (let j = 1; j <= b.length; j++) { const tmp = fila[j]; fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
    }
    return fila[b.length];
  }
  const parecidas = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && distancia(a, b) <= 1);
  // Cuántas palabras tienen en común (cada palabra se usa una vez).
  function enComun(a, b) {
    const pa = palabras(a), pb = palabras(b).slice();
    let n = 0;
    pa.forEach((p) => { const j = pb.findIndex((q) => parecidas(p, q)); if (j >= 0) { n++; pb.splice(j, 1); } });
    return n;
  }
  const mismaPersona = (a, b) => enComun(a, b) >= 2;

  // ---------- Unidad y teléfono ----------
  function parteUnidad(v) {
    let t = String(v == null ? "" : v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[°º]|piso|depto|dpto|departamento|unidad/g, "").replace(/\s+/g, "");
    if (/^(pb|plantabaja)$/.test(t)) t = "0";
    return t.replace(/^0+(?=\d)/, "");
  }
  const claveUnidad = (piso, depto) => { const p = parteUnidad(piso), d = parteUnidad(depto); return p || d ? p + "|" + d : ""; };
  const tel7 = (v) => { const d = String(v || "").replace(/\D/g, ""); return d.length >= 7 ? d.slice(-7) : ""; };

  // ---------- Cruce ----------
  // disp: [{ r: registro del padrón, l: llave, perdida: bool, ... }] (lo que el llamador
  //       considere vigente; se devuelve el mismo objeto en .d).
  // filas: filas de la estación { tag, usuario, nombre, apellido, piso, depto, telefono, tipo, obs }.
  // personas (opcional): todos los registros del padrón, también los que no cargaron
  //   ninguna llave; sirve para no proponer la baja de la llave de alguien registrado.
  // Devuelve { estacion: [{ i, res, d, por, nota }], faltan: [d…] }  (faltan = del padrón, no están en la estación)
  function cruzar(disp, filas, personas) {
    disp = disp || []; filas = filas || [];
    const porTag = {}, porUsuario = {}, perdidas = {};
    disp.forEach((d) => {
      const kt = d.l && d.l.tag ? (esControl(d.l) ? "c" + claveUsuario(d.l.tag) : claveTag(d.l.tag)) : "";
      if (d.perdida) { if (kt) (perdidas[kt] = perdidas[kt] || []).push(d); return; }
      if (kt && kt !== "c") (porTag[kt] = porTag[kt] || []).push(d);
      const ku = claveUsuario(d.l && d.l.usuario);
      if (ku) (porUsuario[ku] = porUsuario[ku] || []).push(d);
    });
    const usados = new Set();
    const out = filas.map((est, i) => ({ i, res: "no_registrada", d: null, por: "", nota: "" }));
    const nombreEst = (est) => [est.nombre, est.apellido].filter(Boolean).join(" ");
    const unidadTxt = (piso, depto) => [piso ? piso + "°" : "", depto].filter(Boolean).join(" ");

    // 1 y 2: por número (tag, después usuario).
    filas.forEach((est, i) => {
      const control = esControlEstacion(est);
      const kt = est.tag ? (control ? "c" + claveUsuario(est.tag) : claveTag(est.tag)) : "";
      const ku = claveUsuario(est.usuario);
      const o = out[i];
      if (kt && kt !== "c" && perdidas[kt]) { o.res = "perdida"; o.d = perdidas[kt][0]; o.por = "tag"; return; }
      const candTag = kt && kt !== "c" ? (porTag[kt] || []) : [];
      const candUsu = ku ? (porUsuario[ku] || []).filter((d) => esControl(d.l) === control || !est.tipo) : [];
      const d = candTag.find((x) => !usados.has(x)) || candTag[0] || candUsu.find((x) => !usados.has(x)) || null;
      if (!d) return;
      o.res = "encontrada"; o.d = d; o.por = candTag.includes(d) ? "tag" : "usuario";
      usados.add(d);
      const uReg = claveUsuario(d.l.usuario);
      if (ku && uReg && ku !== uReg) o.nota = `N° de usuario distinto: estación ${est.usuario}, vecino ${d.l.usuario}`;
      if (o.por === "usuario" && kt && d.l.tag && claveTag(d.l.tag) !== kt && !esControl(d.l)) o.nota = `Coincide el usuario pero no el tag (estación ${est.tag}, vecino ${d.l.tag})`;
    });

    // 3: por nombre. Se arman todos los pares posibles y se asignan de mejor a peor.
    const pares = [];
    filas.forEach((est, i) => {
      if (out[i].res !== "no_registrada") return;
      const nEst = nombreEst(est);
      if (palabras(nEst).length < 2) return;
      const control = esControlEstacion(est);
      const uEst = claveUnidad(est.piso, est.depto), tEst = tel7(est.telefono);
      disp.forEach((d) => {
        if (d.perdida || usados.has(d) || !d.l) return;
        if (est.tipo && esControl(d.l) !== control) return;
        const c = enComun(nEst, d.r && d.r.nombre);
        if (c < 2) return;
        const uReg = claveUnidad(d.r.piso, d.r.unidad);
        const mismaU = !!uEst && uEst === uReg, mismoT = !!tEst && tEst === tel7(d.r.telefono);
        // Usuarios distintos cargados en los dos lados: no es la misma llave.
        if (claveUsuario(est.usuario) && claveUsuario(d.l.usuario) && claveUsuario(est.usuario) !== claveUsuario(d.l.usuario)) return;
        pares.push({ i, d, puntos: c * 10 + (mismaU ? 6 : 0) + (mismoT ? 3 : 0) + (claveUsuario(d.l.usuario) ? 0 : 1) + (esControl(d.l) ? 0 : 0.5), mismaU, uEst, uReg });
      });
    });
    pares.sort((a, b) => b.puntos - a.puntos || a.i - b.i);
    pares.forEach((p) => {
      const o = out[p.i];
      if (o.res !== "no_registrada" || usados.has(p.d)) return;
      o.res = "encontrada"; o.d = p.d; o.por = "nombre";
      usados.add(p.d);
      const est = filas[p.i];
      const notas = [];
      if (!claveUsuario(p.d.l.usuario) && claveUsuario(est.usuario)) notas.push(`Coincide por nombre. Falta el N° de usuario en el padrón (en la estación es ${est.usuario})`);
      else notas.push("Coincide por nombre");
      if (p.uEst && p.uReg && !p.mismaU) notas.push(`unidad distinta: estación ${unidadTxt(est.piso, est.depto)}, padrón ${unidadTxt(p.d.r.piso, p.d.r.unidad)}`);
      o.nota = notas.join(" · ");
    });

    // 4: lo que sigue sin dueño: ¿es de alguien registrado? ¿no es un vecino?
    filas.forEach((est, i) => {
      const o = out[i];
      if (o.res !== "no_registrada") return;
      if (esNoVecino(est)) { o.res = "no_vecino"; o.nota = est.obs || ""; return; }
      const nEst = nombreEst(est);
      let de = palabras(nEst).length >= 2 ? disp.find((d) => !d.perdida && d.r && mismaPersona(nEst, d.r.nombre)) : null;
      if (!de && palabras(nEst).length >= 2 && Array.isArray(personas)) {
        const r = personas.find((x) => x && mismaPersona(nEst, x.nombre));
        if (r) de = { r, l: { tipo: "tag", tag: "" }, i: -1, perdida: false, sinLlave: true };
      }
      if (de) {
        o.res = "otra_llave"; o.d = de; o.por = "nombre";
        o.nota = `${de.r.nombre}${de.r.piso || de.r.unidad ? " (" + unidadTxt(de.r.piso, de.r.unidad) + ")" : ""} está registrada pero declaró menos llaves que las que tiene en la estación`;
      }
    });

    const faltan = disp.filter((d) => !d.perdida && !usados.has(d));
    return { estacion: out, faltan };
  }

  // ---------- ¿De qué edificio es este Excel? ----------
  // Lee el título del archivo (las filas antes de los encabezados, p. ej.
  // «D018 - Edificio Muelle 11 (…)») y el nombre del archivo
  // («Usuarios_D018_Muelle11.xlsx»), y busca el N° de abonado y el nombre de
  // alguno de los edificios cargados.
  const normAbonado = (v) => String(v == null ? "" : v).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^([A-Z]*)0+(?=\d)/, "$1");
  const compacto = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  function identificarArchivo(texto, edificios) {
    const t = String(texto || "").replace(/_/g, " ");
    const abonados = [];
    const re = /(?:^|[^A-Za-z0-9])([A-Za-z]\d{2,5})(?=[^A-Za-z0-9]|$)/g;
    let m;
    while ((m = re.exec(t))) { const a = m[1].toUpperCase(); if (!abonados.includes(a)) abonados.push(a); }
    const reNum = /(?:abonado|cuenta|cliente)\s*(?:n[°º.]?|nro\.?|#)?\s*:?\s*([A-Za-z]?\d{2,6})/gi;
    while ((m = reNum.exec(t))) { const a = m[1].toUpperCase(); if (!abonados.includes(a)) abonados.push(a); }
    const plano = compacto(t);
    const lista = Array.isArray(edificios) ? edificios : [];
    const porAbonado = lista.filter((e) => e.abonado && abonados.some((a) => normAbonado(a) === normAbonado(e.abonado)));
    const porNombre = lista.filter((e) => { const n = compacto(e.nombre); return n.length >= 4 && plano.includes(n); });
    return { abonados, porAbonado, porNombre };
  }
  // Veredicto para el edificio abierto: "ok" (coincide), "otro" (es de otro edificio),
  // "dudoso" (no se pudo confirmar) y, si el edificio no tiene abonado, cuál sugerir.
  function verificarArchivo(texto, edificio, edificios) {
    const id = identificarArchivo(texto, edificios);
    const mio = (e) => e && edificio && e.codigo === edificio.codigo;
    const otroAb = id.porAbonado.find((e) => !mio(e));
    const otroNom = id.porNombre.find((e) => !mio(e));
    const miAb = edificio && edificio.abonado ? normAbonado(edificio.abonado) : "";
    const nombreOk = id.porNombre.some(mio);
    if (miAb && id.abonados.some((a) => normAbonado(a) === miAb)) return { veredicto: "ok", abonado: edificio.abonado, por: "abonado", id };
    if (otroAb) return { veredicto: "otro", otro: otroAb, abonado: id.abonados.find((a) => normAbonado(a) === normAbonado(otroAb.abonado)), id };
    if (otroNom && !nombreOk) return { veredicto: "otro", otro: otroNom, abonado: id.abonados[0] || "", id };
    if (miAb && id.abonados.length && !nombreOk) return { veredicto: "otro", otro: null, abonado: id.abonados[0], id };
    if (nombreOk) return { veredicto: "ok", por: "nombre", abonado: id.abonados[0] || "", sugerir: !miAb && id.abonados.length === 1 ? id.abonados[0] : "", id };
    return { veredicto: "dudoso", abonado: id.abonados[0] || "", id };
  }

  // ---------- Placa Paradox (BabyWare «User Report» en PDF) ----------
  // pdf.js devuelve los textos de cada página sueltos y desordenados: se arman
  // los renglones por altura (y) y se ordenan de izquierda a derecha (x).
  function lineasPdf(paginas) {
    const out = [];
    (paginas || []).forEach((items) => {
      const filas = [];
      (items || []).filter((i) => i && String(i.str || "").trim()).forEach((i) => {
        let f = filas.find((r) => Math.abs(r.y - i.y) <= 2.5);
        if (!f) { f = { y: i.y, items: [] }; filas.push(f); }
        f.items.push(i);
      });
      filas.sort((a, b) => b.y - a.y).forEach((f) => {
        let txt = "", fin = null;
        f.items.sort((a, b) => a.x - b.x).forEach((i) => {
          if (fin != null) txt += i.x - fin > 3 ? "   " : (i.x - fin > 0.5 ? " " : "");
          txt += String(i.str).trim();
          fin = i.x + (i.w || 0);
        });
        out.push(txt);
      });
    });
    return out.join("\n");
  }
  const RE_ETIQUETA_GENERICA = /^(user|usuario)\s*0*\d+$/i;
  const etiquetaGenerica = (e) => !String(e || "").trim() || RE_ETIQUETA_GENERICA.test(String(e).trim());
  // Devuelve null si el texto no es un reporte de usuarios de BabyWare.
  function leerPlacaParadox(texto) {
    const t = String(texto || "");
    if (!/User Report/i.test(t) || !/Card\s*#/i.test(t)) return null;
    const cuenta = ((t.match(/Account:\s*([^\n]+)/i) || [])[1] || "").replace(/\s{2,}.*$/, "").trim();
    const usuarios = [];
    const partes = t.split(/^\s*(?=\[\d{1,4}\])/m);
    partes.forEach((b) => {
      const m = b.match(/^\[(\d{1,4})\][ \t]*([^\n]*)/);
      if (!m) return;
      const numero = Number(m[1]);
      const etiqueta = m[2].replace(/\s{2,}.*$/, "").trim();
      const tras = b.slice(b.search(/Card\s*#/i) + 1);
      const c = tras.match(/\b(\d{3}):(\d{5})\b(?:\s+(\d{6})\b)?/);
      const tag = c && !/^0+$/.test(c[1] + c[2]) ? `${c[1]}:${c[2]}` : "";
      const control = c && c[3] && !/^0+$/.test(c[3]) ? c[3] : "";
      const tipo = (b.match(/\b(FullMaster|Master|Regular)\b/) || [])[1] || "";
      usuarios.push({ numero, usuario: String(numero >= 1000 ? numero - 1000 : numero).padStart(3, "0"), etiqueta, generica: etiquetaGenerica(etiqueta), tag, control, tipo });
    });
    return usuarios.length ? { cuenta, usuarios } : null;
  }
  // Une las filas de la estación con los usuarios de la placa (por N° de usuario).
  // Cada fila queda con fuente: "ambas" | "estacion" (no está en la placa) |
  // "placa" (está programado en la placa y la estación no lo tiene).
  // De la placa solo entran los usuarios que tienen tarjeta o control: los demás
  // no son llaves (códigos de teclado, la cuenta de SAT, el instalador).
  function combinarPlaca(estacion, placa) {
    const filas = (estacion || []).map((f) => ({ ...f }));
    const us = placa && Array.isArray(placa.usuarios) ? placa.usuarios : null;
    if (!us) return filas.map((f) => { const g = { ...f }; delete g.fuente; delete g.placa_nombre; delete g.placa_tag; delete g.placa_control; return g; });
    const porU = {};
    us.forEach((u) => { const k = claveUsuario(u.usuario); if (k && !porU[k]) porU[k] = u; });
    const usados = new Set();
    filas.forEach((f) => {
      const u = porU[claveUsuario(f.usuario)];
      if (!u) { f.fuente = "estacion"; return; }
      usados.add(u);
      f.fuente = "ambas";
      f.placa_nombre = u.generica ? "" : u.etiqueta;
      f.placa_tag = u.tag || "";
      f.placa_control = u.control || "";
      if (!f.tag && u.tag) f.tag = u.tag;
    });
    us.forEach((u) => {
      if (usados.has(u) || (!u.tag && !u.control)) return;
      filas.push({ tag: u.tag || "", usuario: u.usuario, nombre: u.generica ? "" : u.etiqueta, apellido: "", piso: "", depto: "", telefono: "", tipo: !u.tag && u.control ? "control" : "", obs: u.control ? "Control remoto SN " + u.control : "", fuente: "placa", placa_nombre: u.generica ? "" : u.etiqueta, placa_tag: u.tag || "", placa_control: u.control || "" });
    });
    return filas;
  }
  // Diferencias entre la estación y la placa para una fila ya combinada.
  function avisoPlaca(f) {
    if (!f || !f.fuente) return "";
    if (f.fuente === "placa") return "Programado en la placa pero no está en la estación";
    if (f.fuente === "estacion") return "Está en la estación pero no en la placa";
    const av = [];
    if (f.placa_tag && f.tag && claveTag(f.placa_tag) !== claveTag(f.tag)) av.push(`N° de llave distinto: estación ${f.tag}, placa ${f.placa_tag}`);
    else if (!f.placa_tag && !f.placa_control) av.push("En la placa no tiene tarjeta");
    const nom = [f.nombre, f.apellido].filter(Boolean).join(" ");
    // La placa suele tener «Apellido I.»: se avisa solo si el apellido no se parece a
    // ninguna palabra del nombre de la estación (tolera errores de tipeo y palabras pegadas).
    const pn = palabras(nom);
    if (f.placa_nombre && pn.length >= 2) {
      const ap = palabras(String(f.placa_nombre).replace(/([a-z])([A-Z])/g, "$1 $2")).filter((w) => w.length > 2);
      const parecida = (w) => pn.some((x) => x === w || (Math.min(x.length, w.length) >= 4 && (x.includes(w) || w.includes(x))) || (Math.min(x.length, w.length) >= 5 && levenshtein(x, w) <= 2));
      if (ap.length && !ap.some(parecida)) av.push(`En la placa figura «${f.placa_nombre}»`);
    }
    return av.join(" · ");
  }

  return { identificarArchivo, verificarArchivo, normAbonado, cruzar, claveTag, tagCalculado, claveUsuario, esControl, esControlEstacion, esNoVecino, enComun, mismaPersona, palabras, claveUnidad, tel7, lineasPdf, leerPlacaParadox, combinarPlaca, avisoPlaca, etiquetaGenerica };
});
