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

  return { cruzar, claveTag, tagCalculado, claveUsuario, esControl, esControlEstacion, esNoVecino, enComun, mismaPersona, palabras, claveUnidad, tel7 };
});
