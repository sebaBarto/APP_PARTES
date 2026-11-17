// ============================================================
// EQUIPO DEL CLIENTE: qué sistema de alarma tiene y de cuándo es la batería
//
// Se deduce de los partes (materiales, lo que se pidió y lo que se hizo) y
// la oficina lo puede corregir a mano desde el panel. Lo usan la ficha del
// cliente (APP y panel) y el aviso al técnico cuando abre un service.
// Funciones puras: se cargan en el navegador y en Node (pruebas).
// ============================================================
(function (raiz) {
  const EQUIPO_BATERIA_ATENCION = 18; // meses: «prestá atención»
  const EQUIPO_BATERIA_CAMBIAR = 24; // meses: «cambiala»
  const EQUIPO_MARCAS = ["Paradox", "Ajax", "DSC", "Caddx"];
  // Marca y modelos típicos de cada una (centrales, teclados, comunicadores).
  const PATRONES_MARCA = {
    Paradox: [/paradox/, /\bsp-?(4000|5500|6000|7000|65)\b/, /\bmg-?(5000|5050|5075)\b/, /\bevo-?(48|96|192|hd)\b/, /\bk-?(32|35|10|636|641|656)(lcd|h|plus|\+)?\b/, /\btm-?(50|70)\b/, /\bipw?-?150\b/, /\bpcs-?2[56]\d\b/],
    Ajax: [/\bajax\b/, /\bhub ?(2|plus|hybrid)\b/],
    DSC: [/\bdsc\b/, /\bpc-?(1616|1832|1864|585|1555|1565|5010)\w*\b/, /\bpk-?55\d\d\b/, /\bpowerseries\b/],
    Caddx: [/\bcadd?x\b/, /\bnx-?(4|6|8|8e|148e?|1192)\b/, /\bnetworx\b/],
  };
  const EQUIPOS = /\b(central|panel|teclado|hub|sistema|comunicador|placa|alarma)\b/;
  const CAMBIO = /\b(cambio|cambi[oó]|reemplaz\w*|recambio|migraci[oó]n|migr[oó]|actualiz\w*|nueva central|central nueva|se instal\w*|instalaci[oó]n)\b[^.;\n]{0,40}\b(sistema|central|panel|alarma|equipo|hub)\b|\b(sistema|central|panel|alarma|hub)\b[^.;\n]{0,15}\b(nuev[oa]|cambiad[oa]|reemplazad[oa])\b/;

  const sinAcentos = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const normalizarNombre = (t) => sinAcentos(t).replace(/[^a-z0-9]+/g, " ").trim();
  const normalizarNumero = (n) => String(n == null ? "" : n).replace(/\D/g, "").replace(/^0+/, "");
  // Clave del cliente: el N° de cliente si hay, si no el nombre.
  function claveCliente(numero, nombre) {
    const n = normalizarNumero(numero);
    if (n) return "n:" + n;
    const c = normalizarNombre(nombre);
    return c ? "c:" + c : "";
  }

  // ---------- Batería ----------
  const BAT = "bater[ií]as?";
  const BAT_SI = [
    new RegExp(`\\b(cambi\\w*|reemplaz\\w*|recambio|coloc\\w*|instal\\w*|puse|pusimos|se puso|se pone|nueva|repuse|repuso)\\b[^.;\\n]{0,25}\\b${BAT}\\b`),
    new RegExp(`\\b${BAT}\\b[^.;\\n]{0,15}\\b(nueva|nuevas|cambiada|cambiadas|reemplazada|reemplazadas|colocada)\\b`),
    new RegExp(`\\b${BAT}\\b[^.;\\n]{0,30}\\b(se cambi\\w*|se reemplaz\\w*|la cambi\\w*|la reemplac\\w*)`),
  ];
  // «Hay que cambiar la batería», «no se cambió la batería», «presupuesto de batería»…: no es un cambio hecho.
  const BAT_NO = new RegExp(`\\b(no se|no|sin|falta|faltaria|hay que|habria que|hace falta|necesita|requiere|recomend\\w*|sugier\\w*|cotiz\\w*|presupuest\\w*|pendiente|proxima|probar|revisar|controlar|medir)\\b[^.;\\n]{0,25}\\b${BAT}\\b|\\b${BAT}\\b[^.;\\n]{0,10}\\b(baja|agotada|descargada|vieja|hinchada)\\b(?![^.;\\n]{0,25}\\b(cambi|reemplaz))`);
  function cambioDeBateriaEn(texto) {
    const t = sinAcentos(texto);
    if (!new RegExp(BAT).test(t)) return false;
    // Se revisa cada frase por separado.
    return t.split(/[.;\n]+/).some((f) => BAT_SI.some((r) => r.test(f)) && !BAT_NO.test(f));
  }
  // De un parte: { fecha, fuente: "materiales" | "hecho" | "pedido" | "instalacion" } o null.
  function bateriaDeParte(p) {
    if (!p || !p.fecha) return null;
    const mats = sinAcentos(p.materiales || "");
    if (new RegExp(`\\b${BAT}\\b`).test(mats)) return { fecha: p.fecha, fuente: "materiales" };
    if (cambioDeBateriaEn(p.observaciones)) return { fecha: p.fecha, fuente: "hecho" };
    if (p.es_instalacion) return { fecha: p.fecha, fuente: "instalacion" };
    if (cambioDeBateriaEn(p.tarea) || /^\s*(cambio|reemplazo|recambio)\s+(de\s+)?bater/.test(sinAcentos(p.tarea))) return { fecha: p.fecha, fuente: "pedido" };
    return null;
  }

  // ---------- Sistema ----------
  // Marcas que nombra un texto, con dónde aparecen.
  function marcasEn(texto) {
    const t = sinAcentos(texto), r = [];
    Object.entries(PATRONES_MARCA).forEach(([marca, pats]) => {
      let pos = -1, modelo = false;
      pats.forEach((p, k) => { const m = new RegExp(p.source, "g"); let x; while ((x = m.exec(t))) { pos = Math.max(pos, x.index); if (k > 0) modelo = true; } });
      if (pos >= 0) r.push({ marca, pos, modelo }); // modelo: nombró un equipo (SP5500, PC1616…), no solo la marca
    });
    return r;
  }
  // De un parte: { marca, fuerza (1 mención, 2 junto a un equipo, 3 instalado/cambio), cambio } o null.
  function sistemaDeParte(p) {
    if (!p) return null;
    const enMat = marcasEn(p.materiales);
    const texto = [p.tarea, p.observaciones].filter(Boolean).join(". ");
    const enTexto = marcasEn(texto);
    if (!enMat.length && !enTexto.length) return null;
    const t = sinAcentos(texto);
    // «Cambio de batería» no es un cambio de sistema.
    const sinBateria = t.replace(/\b(cambi\w*|reemplaz\w*|recambio)\s+(de\s+)?(la\s+|las\s+)?bater[ií]as?\b/g, (m) => " ".repeat(m.length)); // mismo largo: las posiciones no cambian
    const cambio = CAMBIO.test(sinBateria) || !!p.es_instalacion;
    // «de DSC a Ajax», «reemplazo la central DSC por una Ajax»: la que va después de «a» / «por».
    const elegir = (lista, txt) => {
      if (lista.length === 1) return lista[0].marca;
      const despues = lista.filter((x) => /\b(a|por|->|→|hacia)\s+(una?\s+|la\s+|el\s+|central\s+|sistema\s+)*$/.test(txt.slice(Math.max(0, x.pos - 25), x.pos)));
      if (despues.length) return despues[despues.length - 1].marca;
      return lista.slice().sort((a, b) => b.pos - a.pos)[0].marca;
    };
    if (enMat.length) {
      // Un equipo instalado de esa marca: dato firme.
      return { marca: elegir(enMat, sinAcentos(p.materiales)), fuerza: 3, cambio };
    }
    const marca = elegir(enTexto, t);
    const pos = enTexto.find((x) => x.marca === marca).pos;
    const cerca = enTexto.find((x) => x.marca === marca).modelo || EQUIPOS.test(t.slice(Math.max(0, pos - 30), pos + 40));
    // «Migración a Ajax», «se pasó a Paradox», «cambio a DSC»: cambio de sistema aunque no diga «central».
    const aMarca = /\b(migraci[oó]n|migr\w*|cambi\w*|pas[oóa]\w*|reemplaz\w*|instal\w*)\b[^.;\n]{0,25}$/.test(sinBateria.slice(Math.max(0, pos - 40), pos));
    if (aMarca) return { marca, fuerza: 3, cambio: true };
    return { marca, fuerza: cambio && cerca ? 3 : cerca ? 2 : 1, cambio: cambio && cerca };
  }

  // ---------- Junta todo ----------
  function mesesEntre(desde, hasta) {
    const [y1, m1, d1] = String(desde).slice(0, 10).split("-").map(Number);
    const [y2, m2, d2] = String(hasta).slice(0, 10).split("-").map(Number);
    if (!y1 || !y2) return null;
    let m = (y2 - y1) * 12 + (m2 - m1);
    if (d2 < d1) m -= 1;
    return Math.max(0, m);
  }
  function textoAntiguedad(meses) {
    if (meses == null) return "";
    if (meses < 1) return "menos de 1 mes";
    const a = Math.floor(meses / 12), m = meses % 12;
    const ta = a ? `${a} año${a === 1 ? "" : "s"}` : "", tm = m ? `${m} mes${m === 1 ? "" : "es"}` : "";
    return [ta, tm].filter(Boolean).join(" y ");
  }
  function nivelBateria(meses) {
    if (meses == null) return "sin_datos";
    if (meses >= EQUIPO_BATERIA_CAMBIAR) return "cambiar";
    if (meses >= EQUIPO_BATERIA_ATENCION) return "atencion";
    return "ok";
  }
  const FUENTE_BATERIA = { materiales: "materiales del parte", hecho: "lo que se hizo en el parte", pedido: "lo que se pidió en el parte", instalacion: "instalación", oficina: "cargado por la oficina" };

  // partes: los del cliente (cualquier orden). manual: lo que cargó la oficina { sistema, sistema_fecha, sistema_por, bateria_fecha, bateria_por, nota }.
  function equipoDeCliente(partes, manual, hoy) {
    const lista = (partes || []).filter((p) => p && p.fecha).slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    // Batería: el último cambio.
    let bat = null;
    lista.forEach((p) => { const b = bateriaDeParte(p); if (b && (!bat || b.fecha >= bat.fecha)) bat = { ...b, parte: p.numero_servicio || p.id_parte || "" }; });
    if (manual && manual.bateria_fecha && (!bat || manual.bateria_fecha >= bat.fecha)) bat = { fecha: manual.bateria_fecha, fuente: "oficina", por: manual.bateria_por || "" };
    const fechaHoy = hoy || new Date().toISOString().slice(0, 10);
    const meses = bat ? mesesEntre(bat.fecha, fechaHoy) : null;
    const bateria = bat
      ? { fecha: bat.fecha, fuente: bat.fuente, fuenteTexto: FUENTE_BATERIA[bat.fuente] || "", parte: bat.parte || "", meses, antiguedad: textoAntiguedad(meses), nivel: nivelBateria(meses), segura: bat.fuente !== "pedido" }
      : { fecha: "", meses: null, antiguedad: "", nivel: "sin_datos", segura: false };
    // Sistema: el último firme; los cambios de sistema reemplazan al anterior.
    let actual = null;
    const anteriores = [];
    lista.forEach((p) => {
      const s = sistemaDeParte(p);
      if (!s) return;
      if (!actual) { actual = { marca: s.marca, fuerza: s.fuerza, desde: p.fecha, fecha: p.fecha }; return; }
      if (s.marca === actual.marca) { actual.fecha = p.fecha; actual.fuerza = Math.max(actual.fuerza, s.fuerza); return; }
      // Otra marca: cambia si es un cambio/instalación firme, o si la que había era solo una mención.
      if (s.fuerza >= 3 || (actual.fuerza <= 1 && s.fuerza >= 2)) {
        anteriores.push({ marca: actual.marca, hasta: p.fecha });
        actual = { marca: s.marca, fuerza: s.fuerza, desde: p.fecha, fecha: p.fecha };
      }
    });
    let sistema = actual ? { marca: actual.marca, estado: actual.fuerza >= 3 ? "confirmado" : "probable", fecha: actual.fecha, desde: actual.desde, fuente: "partes", anteriores } : { marca: "", estado: "sin_datos", anteriores };
    // Lo que cargó la oficina manda, salvo que después haya un cambio firme en un parte.
    if (manual && manual.sistema) {
      const despues = actual && actual.fuerza >= 3 && actual.desde > (manual.sistema_fecha || "") && actual.marca !== manual.sistema;
      if (!despues) sistema = { marca: manual.sistema, estado: "confirmado", fecha: manual.sistema_fecha || "", fuente: "oficina", por: manual.sistema_por || "", anteriores: actual && actual.marca !== manual.sistema ? [...anteriores, { marca: actual.marca, hasta: manual.sistema_fecha || "" }] : anteriores };
    }
    return { sistema, bateria, nota: (manual && manual.nota) || "" };
  }

  const api = { EQUIPO_BATERIA_ATENCION, EQUIPO_BATERIA_CAMBIAR, EQUIPO_MARCAS, claveCliente, cambioDeBateriaEn, bateriaDeParte, marcasEn, sistemaDeParte, equipoDeCliente, mesesEntre, textoAntiguedad, nivelBateria };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.EquipoCliente = api;
})(typeof window !== "undefined" ? window : globalThis);
