// Stock de artículos: lógica compartida por el panel de administración, la
// APP y el servidor (en Node se usa con require). Funciones puras: no leen ni
// escriben nada; reciben los datos y devuelven el resultado.
//
// Datos:
//  - catálogo: { articulos: { "<código>": { c, d, tipo, medida, min, pedir, prov, alias[], baja, precio, moneda } } }
//      tipo: "unidad" (equipo con N° de serie), "cantidad", "sim", "herramienta", "no"
//  - saldos: { inicializado, ubic: { "<ubicación>": { "<código>": cantidad } }, unidades: { "<tracking>": { c, u, f } }, pedidos: { "<código>": { fecha, cantidad, por } } }
//      ubicaciones: "dep" (depósito), "tec:<nombre>", "veh:<nombre>", "cli:<cliente>" (instalado), "com:<cliente>" (comodato)

(function (raiz) {
  const STOCK_TIPOS = {
    unidad: "Equipo con N° de serie",
    cantidad: "Por cantidad",
    sim: "SIM (va en Control de SIMs)",
    herramienta: "Herramienta (va en Herramientas)",
    no: "No controlar",
  };
  const num = (v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const t = String(v == null ? "" : v).trim().replace(/\s/g, "");
    if (!t) return 0;
    // "1.234,5" (formato argentino) o "1234.5"
    const n = /,\d{1,3}$/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const codigoArticulo = (v) => String(v == null ? "" : v).trim().replace(/\.0+$/, "").replace(/^0+(?=\d)/, "");
  const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Código de proveedor (los 4 últimos dígitos de la etiqueta de SAT): "2779".
  const codigoProveedor = (v) => { const t = String(v == null ? "" : v).replace(/\D/g, "").slice(0, 6); return t && Number(t) ? t : ""; };
  // Nombre del proveedor según la tabla que se carga en el admin (catalogo.proveedores).
  const nombreProveedor = (catalogo, codigo) => { const c = codigoProveedor(codigo); return c ? ((catalogo && catalogo.proveedores) || {})[c] || "" : ""; };
  // Etiqueta propia de SAT: 12 dígitos = 8 del artículo (con ceros adelante) + 4 del proveedor.
  // "000208252779" -> { codigo: "20825", proveedor: "2779" }
  function leerEtiquetaSat(texto) {
    const t = String(texto || "").trim();
    if (!/^\d{12}$/.test(t)) return null;
    const codigo = codigoArticulo(t.slice(0, 8));
    if (!codigo || codigo === "0") return null;
    return { codigo, proveedor: t.slice(8) };
  }
  // EAN-13 / UPC-A válido (código de producto del fabricante: igual en todas las cajas).
  function esEanValido(texto) {
    const t = String(texto || "").trim();
    if (!/^\d{12,13}$/.test(t)) return false;
    const d = t.padStart(13, "0").split("").map(Number);
    const suma = d.slice(0, 12).reduce((s, x, i) => s + x * (i % 2 ? 3 : 1), 0);
    return (10 - (suma % 10)) % 10 === d[12];
  }

  // Chips: "MOVISTAR", "MOVISTAR M2M", "MOVISTAR KITE", "PERSONAL", "PERSONAL JASPER" (o "JAPER"),
  // "JASPER", "JASPER PERSONAL", "CLARO", "CLARO IOT", "KITE MOVISTAR", "MOVISTAR GLOBAL SIM", con errores
  // de tipeo comunes ("PESONAL", "GASPER") y con o sin un número adelante o atrás
  // ("251062 PERSONAL JASPER", "MOVISTAR 133858"). Un equipo que nombra la empresa no es un SIM.
  function esDescripcionSim(desc) {
    const D = String(desc || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/^(\d+ )+|( \d+)+$/g, "").trim();
    // Todas las palabras tienen que ser de chip, y al menos una la empresa (o Jasper, la plataforma de Personal).
    const palabras = D ? D.split(" ") : [];
    const CHIP = /^(MOVISTAR|PERSONAL|PESONAL|PERSONA|PARSONAL|CLARO|JASPER|JAPER|GASPER|M2M|KITE|IOT|GLOBAL|SIM|CHIP|\d+)$/, EMPRESA = /^(MOVISTAR|PERSONAL|PESONAL|PARSONAL|CLARO|JASPER|JAPER|GASPER)$/;
    return palabras.length > 0 && palabras.length <= 5 && palabras.every((w) => CHIP.test(w)) && palabras.some((w) => EMPRESA.test(w));
  }
  // Propuesta de cómo controlar un artículo según su descripción (después se revisa a mano).
  function clasificarArticulo(desc) {
    const D = String(desc || "").toUpperCase();
    if (esDescripcionSim(D)) return "sim";
    if (/\b(DESTORNILLADOR|MECHA|PINZA|TALADRO|TESTER|ALICATE|MARTILLO|ESCALERA|CRIMP|PELACABLE|SOLDADOR|AMOLADORA|SIERRA|CUTTER|ATORNILLADOR|MULTIMETRO|PISTOLA)/.test(D)) return "herramienta";
    // Sensores y equipos electrónicos: cada uno trae su N° de serie del fabricante (garantía).
    // Los accesorios (soportes, bases, cubiertas, cajas de montaje) no.
    const ACCESORIO = /\b(BASE PARA|BASES?\b(?! *[-/]?\s*\w*\s*(FIESA|INCLUIDA))|REJA|CARCAZA|SOPORTE|BRACKET|LENTE|TAPA|CUBIERTA|CAJA DE MONTAJE|FUNDA|PLACA DE MONTAJE)\b/;
    if (/\bAJAX\b/.test(D) && !ACCESORIO.test(D)) return "unidad";
    // Comunicadores, módulos, receptores y transmisores: cada uno con su N° de serie o MAC.
    if (/\b(CITYMESH|GPRS|COMUNICADOR|NT ?-?LINK|NT ?-?COM\d?|NTCOM\d?|LANTRIX|IP1\d\d|IP180|EXPANSOR|RECEPTOR|TRANSMISOR|REM\d+\w*|RTX3|RX1|PGM4|ZX\d+\w*|MODEM|HUB)\b/.test(D) && !/^(\S+ )?(ANTENA|CONO|CONECTOR|COMCAB|CABLE|SOPORTE|BRACKET|FUENTE)\b/.test(D) && !/\b(CORREA|PILA|BATERIA)\b/.test(D)) return "unidad";
    if (/\b(PIR|INFRARROJOS?|DETECTOR(ES)?|D\. HUMO|BARRERA|SENSOR(ES)?|SISMICO|MAGNETICO INAL|CONTACTO INAL|MOTIONPROTECT|DOORPROTECT|FIREPROTECT|GLASSPROTECT|LEAKSPROTECT|COMBIPROTECT|HOMESIREN|STREETSIREN|SPACECONTROL)\b/.test(D) && !/^(BASE|A35BS BASE)|\b(BASE PARA|REJA|CARCAZA|SOPORTE|BRACKET|LENTE|TAPA|CUBIERTA)\b/.test(D)) return "unidad";
    if (/ADAPTADOR|ANTENA|SOPORTE|BRAZO|CAJA|GABINETE|BASE |LENTE|TAPA|CARCAZA|FICHA|CONECTOR|BALUN|FUENTE|TRAFO|TRANSFORMADOR|BATERIA|PILA/.test(D) && !/^(CENTRAL|CAMARA|DVR|NVR)/.test(D)) return "cantidad";
    if (/\b(CENTRAL|TECLADO|KEYPAD|CAMARA|CÁMARA|DOMO|BULLET|DVR|NVR|XVR|VIDEOGRABADOR|GRABADOR|COMUNICADOR|ED5800|IP100|IP150|ROUTER|SWITCH|ACCESS POINT|DISCO|HDD|INVERSOR|CENTRO DE MONITOREO|VIDEOPORTERO|MONITOR|LECTOR|UPS|PANEL M\d|MODEM)/.test(D)
      || /MODULO (INTERNET|EXPANSOR|DE AUDIO|IP|GPRS|WIFI|RADIO)/.test(D) || /^GPRS/.test(D)
      || /TRANSMISOR (FULL|REMOTO DR|PARA MONITOREO)|RECEPTOR (CE|INALAMBRICO|DR)|CONTROL DE ACCESO KIT|CERBO/.test(D)) return "unidad";
    return "cantidad";
  }
  const medidaArticulo = (desc) => /\bCABLE|CABLECANAL|UTP|COAXIL|\bCF -/.test(String(desc || "").toUpperCase()) && !/PRECINTO|TESTER|CONECTOR|FICHA/.test(String(desc || "").toUpperCase()) ? "metros" : "unidades";

  // ---------- Lectura del listado que exporta el sistema de Oficina ----------
  // Columnas (se buscan por nombre): Código, Descripción, Cant. Depósito, Cant. Tránsito,
  // Cant. Comodato, Precio Compra/Venta, Moneda, Deshabilitado.
  function columnasOficina(filas) {
    const cab = [...new Set((filas || []).slice(0, 50).flatMap((f) => Object.keys(f)))];
    const buscar = (re) => cab.find((c) => re.test(sinAcentos(c))) || "";
    return {
      codigo: buscar(/^cod(igo)?\b|^cod\.|articulo$/),
      descripcion: buscar(/descrip|detalle|nombre/),
      deposito: buscar(/deposito/),
      transito: buscar(/transito/),
      comodato: buscar(/comodato/),
      precio: buscar(/precio (de )?compra|costo/) || buscar(/precio/),
      moneda: buscar(/moneda/),
      deshabilitado: buscar(/deshabilit|baja|inactiv/),
      // Planilla revisada (la propuesta que se completa a mano)
      tipo: buscar(/propuesta|como se controla|tipo de control/),
      medida: buscar(/^unidad$|medida/),
      minimo: buscar(/minimo/),
      pedir: buscar(/cantidad a pedir|a pedir|lote/),
      proveedor: buscar(/proveedor/),
    };
  }
  function tipoDesdeTexto(t) {
    const s = sinAcentos(t);
    if (!s) return "";
    if (/unidad|serie|equipo/.test(s) && !/por cantidad/.test(s)) return "unidad";
    if (/cantidad/.test(s)) return "cantidad";
    if (/sim|chip/.test(s)) return "sim";
    if (/herramienta/.test(s)) return "herramienta";
    if (/no controlar|ignorar|no$/.test(s)) return "no";
    return "";
  }
  // Devuelve [{ c, d, dep, tra, com, precio, moneda, baja, tipo?, medida?, min?, pedir?, prov? }]
  function leerListadoOficina(filas) {
    const col = columnasOficina(filas);
    if (!col.codigo || !col.descripcion) throw new Error("No se encontraron las columnas «Código» y «Descripción» del listado.");
    const vistos = new Set(), salida = [];
    (filas || []).forEach((f) => {
      const c = codigoArticulo(f[col.codigo]);
      if (!c || !/^[\w.-]{1,20}$/.test(c) || vistos.has(c)) return;
      vistos.add(c);
      const moneda = sinAcentos(f[col.moneda]);
      const it = {
        c, d: String(f[col.descripcion] || "").replace(/\s+/g, " ").trim().slice(0, 160),
        dep: col.deposito ? num(f[col.deposito]) : 0, tra: col.transito ? num(f[col.transito]) : 0, com: col.comodato ? num(f[col.comodato]) : 0,
        precio: col.precio ? num(f[col.precio]) : 0, moneda: /dolar|u\$s|usd/.test(moneda) ? "USD" : moneda ? "ARS" : "",
        baja: col.deshabilitado ? /^(s|si|x|1|true|verdadero)$/i.test(String(f[col.deshabilitado] || "").trim()) : false,
      };
      if (col.tipo) { const t = tipoDesdeTexto(f[col.tipo]); if (t) it.tipo = t; }
      if (col.medida && /metro/i.test(String(f[col.medida] || ""))) it.medida = "metros";
      else if (col.medida && /unidad/i.test(String(f[col.medida] || ""))) it.medida = "unidades";
      if (col.minimo && String(f[col.minimo] ?? "").trim() !== "") it.min = Math.max(0, num(f[col.minimo]));
      if (col.pedir && String(f[col.pedir] ?? "").trim() !== "") it.pedir = Math.max(0, num(f[col.pedir]));
      if (col.proveedor && String(f[col.proveedor] || "").trim()) it.prov = String(f[col.proveedor]).trim().slice(0, 60);
      salida.push(it);
    });
    return { articulos: salida, columnas: col, esRevisada: !!col.tipo };
  }

  // ---------- Saldos ----------
  const UBIC_TEXTO = { gar: "Garantía (fallados)", dep: "Depósito", tec: "Técnico", veh: "Vehículo", cli: "Cliente (instalado)", com: "Cliente (comodato)", cam: "En camino" };
  function nombreUbicacion(u) {
    if (u === "dep") return "Depósito";
    if (u === "gar") return "Garantía (fallados)";
    if (u === "baja") return "Dado de baja";
    if (/^cam:dev:/.test(u || "")) return `En camino al depósito (devuelve ${u.slice(8)})`;
    if (/^cam:/.test(u || "")) return `En camino a ${u.slice(4)}`;
    const [t, ...r] = String(u || "").split(":");
    return `${UBIC_TEXTO[t] || t}${r.length ? ": " + r.join(":") : ""}`;
  }
  // Totales por artículo, separados como los ve el sistema de Oficina:
  // en poder de SAT (depósito + técnicos + vehículos + en camino) y en comodato.
  function totalesPorArticulo(saldos) {
    const tot = {};
    Object.entries((saldos && saldos.ubic) || {}).forEach(([u, items]) => {
      const t = u.split(":")[0];
      Object.entries(items || {}).forEach(([c, cant]) => {
        const x = (tot[c] = tot[c] || { sat: 0, dep: 0, tec: 0, veh: 0, cam: 0, gar: 0, cli: 0, com: 0, detalle: {} });
        const n = Number(cant) || 0;
        if (!n) return;
        x.detalle[u] = n;
        if (t === "dep") { x.dep += n; x.sat += n; }
        else if (t === "tec") { x.tec += n; x.sat += n; }
        else if (t === "veh") { x.veh += n; x.sat += n; }
        else if (t === "cam") { x.cam += n; x.sat += n; }
        else if (t === "gar") { x.gar += n; x.sat += n; } // fallados en garantía: siguen en poder de SAT
        else if (t === "com") x.com += n;
        else if (t === "cli") x.cli += n;
      });
    });
    return tot;
  }
  function unidadesPorArticulo(saldos) {
    const r = {};
    Object.values((saldos && saldos.unidades) || {}).forEach((u) => { if (u && u.c && !/^(cli|com|baja)/.test(u.u || "")) r[u.c] = (r[u.c] || 0) + 1; });
    return r;
  }

  // ---------- Conciliación: listado de Oficina contra la APP ----------
  const STOCK_CONC_CATEGORIAS = [
    { k: "noEnCatalogo", corto: "No está en la APP", titulo: "Con stock en Oficina, pero no están en el catálogo de la APP", ayuda: "Artículos nuevos o que nunca se cargaron. Agregalos al catálogo para controlarlos." },
    { k: "cantidadDistinta", corto: "Cantidad distinta", titulo: "Cantidad distinta (en poder de SAT)", ayuda: "Oficina cuenta el depósito; la APP suma depósito + técnicos + vehículos + en camino. Abajo de cada uno, dónde está según la APP." },
    { k: "soloEnApp", corto: "Solo en la APP", titulo: "La APP tiene stock y Oficina dice 0", ayuda: "Puede faltar cargar una compra en Oficina, o se usó/vendió sin registrarlo en la APP." },
    { k: "comodatoDistinto", corto: "Comodato distinto", titulo: "Cantidad en comodato distinta", ayuda: "Oficina y la APP no cuentan lo mismo en comodato en clientes." },
    { k: "unidadesSinRegistrar", corto: "Sin N° de serie", titulo: "Equipos sin todos sus N° de serie registrados", ayuda: "Hay más equipos que N° de serie registrados: falta escanearlos (inventario)." },
    { k: "deshabilitado", corto: "Deshabilitado en Oficina", titulo: "Deshabilitados en Oficina, con stock en la APP", ayuda: "Oficina ya no los usa, pero la APP tiene stock." },
    { k: "negativo", corto: "Negativo en la APP", titulo: "Stock negativo en la APP", ayuda: "Salió más de lo que entró: falta registrar una entrada o se cargó mal una salida." },
  ];
  function conciliarStock(listado, catalogo, saldos, marcas, hoy) {
    const arts = (catalogo && catalogo.articulos) || {};
    const tot = totalesPorArticulo(saldos), uni = unidadesPorArticulo(saldos);
    const r = { coinciden: 0, revisados: 0, ocultas: [] };
    STOCK_CONC_CATEGORIAS.forEach((c) => { r[c.k] = []; });
    const controla = (a) => a && a.tipo !== "sim" && a.tipo !== "herramienta" && a.tipo !== "no";
    const deOficina = new Map(listado.map((x) => [x.c, x]));
    const codigos = new Set([...listado.filter((x) => x.dep || x.com || x.tra).map((x) => x.c), ...Object.keys(tot)]);
    codigos.forEach((c) => {
      const of = deOficina.get(c) || { c, dep: 0, tra: 0, com: 0, d: "" };
      const a = arts[c], t = tot[c] || { sat: 0, com: 0, detalle: {} };
      if (!a) { if (of.dep || of.com) r.noEnCatalogo.push({ c, of, t, d: of.d }); return; }
      if (!controla(a)) return;
      r.revisados++;
      let ok = true;
      const it = { c, of, t, d: a.d || of.d, a };
      Object.entries(t.detalle || {}).forEach(([u, n]) => { if (n < 0) { r.negativo.push({ ...it, u, n }); ok = false; } });
      if (of.baja && (t.sat || t.com)) { r.deshabilitado.push(it); ok = false; }
      if (!of.dep && t.sat > 0) { r.soloEnApp.push(it); ok = false; }
      else if (Math.abs((of.dep || 0) - (t.sat || 0)) > 1e-9) { r.cantidadDistinta.push({ ...it, dif: (t.sat || 0) - (of.dep || 0) }); ok = false; }
      if (Math.abs((of.com || 0) - (t.com || 0)) > 1e-9) { r.comodatoDistinto.push({ ...it, dif: (t.com || 0) - (of.com || 0) }); ok = false; }
      if (a.tipo === "unidad" && (uni[c] || 0) < Math.max(0, t.sat || 0)) { r.unidadesSinRegistrar.push({ ...it, registradas: uni[c] || 0 }); ok = false; }
      if (ok) r.coinciden++;
    });
    // Resuelto / Ignorar (Resuelto vuelve a aparecer a los 40 días si sigue igual)
    const ahora = (hoy || new Date()).getTime();
    const mk = new Map((marcas || []).map((m) => [`${m.categoria}|${m.codigo}`, m]));
    STOCK_CONC_CATEGORIAS.forEach((cat) => {
      r[cat.k] = r[cat.k].filter((it) => {
        const m = mk.get(`${cat.k}|${it.c}`);
        if (!m) return true;
        if (m.estado === "resuelta" && (ahora - new Date(m.fecha).getTime()) / 864e5 > 40) { it.reaparece = m; return true; }
        r.ocultas.push({ ...m, titulo: cat.corto, d: it.d });
        return false;
      });
      r[cat.k].sort((x, y) => Math.abs(y.dif || 0) - Math.abs(x.dif || 0) || String(x.d).localeCompare(String(y.d), "es"));
    });
    return r;
  }

  // ---------- Pedidos automáticos ----------
  // Entra en el pedido lo que tiene mínimo y quedó en el mínimo o por debajo
  // (se mira el depósito: lo que tienen los técnicos ya está asignado).
  function articulosParaPedir(catalogo, saldos) {
    const arts = (catalogo && catalogo.articulos) || {}, tot = totalesPorArticulo(saldos), ped = (saldos && saldos.pedidos) || {};
    const pedir = [], pedidos = [];
    Object.values(arts).forEach((a) => {
      if (!a || a.baja || !(Number(a.min) > 0) || a.tipo === "sim" || a.tipo === "herramienta" || a.tipo === "no") return;
      const dep = (tot[a.c] || {}).dep || 0;
      if (dep > Number(a.min)) return;
      const sugerido = Number(a.pedir) > 0 ? Number(a.pedir) : Math.max(1, Number(a.min) * 2 - dep);
      const it = { c: a.c, d: a.d, prov: a.prov || "Sin proveedor", dep, min: Number(a.min), sugerido, medida: a.medida || "unidades" };
      if (ped[a.c]) pedidos.push({ ...it, pedido: ped[a.c] }); else pedir.push(it);
    });
    const orden = (x, y) => x.prov.localeCompare(y.prov, "es") || x.d.localeCompare(y.d, "es");
    return { pedir: pedir.sort(orden), pedidos: pedidos.sort(orden) };
  }
  // Pedido pendiente que ya no hace falta (el depósito volvió a estar por encima del mínimo).
  function pedidosCumplidos(catalogo, saldos) {
    const arts = (catalogo && catalogo.articulos) || {}, tot = totalesPorArticulo(saldos);
    return Object.keys((saldos && saldos.pedidos) || {}).filter((c) => { const a = arts[c]; return !a || !(Number(a.min) > 0) || ((tot[c] || {}).dep || 0) > Number(a.min); });
  }

  // ---------- Movimientos ----------
  // Aplica un movimiento a los saldos (devuelve saldos nuevos; no toca el original).
  // mov: { tipo, c, cant, de?, a?, unidades?: [tracking] }
  function aplicarMovimiento(saldos, mov) {
    const s = JSON.parse(JSON.stringify(saldos || {}));
    s.ubic = s.ubic || {}; s.unidades = s.unidades || {};
    const cant = Number(mov.cant) || 0;
    const mover = (u, n) => {
      if (!u) return;
      const caja = (s.ubic[u] = s.ubic[u] || {});
      const v = Math.round(((caja[mov.c] || 0) + n) * 1000) / 1000;
      if (v) caja[mov.c] = v; else delete caja[mov.c];
      if (!Object.keys(caja).length) delete s.ubic[u];
    };
    if (mov.de) mover(mov.de, -cant);
    if (mov.a) mover(mov.a, cant);
    (mov.unidades || []).forEach((t) => {
      const antes = s.unidades[t] || {}, f = mov.fecha || new Date().toISOString();
      // Historia del equipo (para garantía: a qué cliente fue, cuándo, con qué presupuesto).
      const h = [...(antes.h || []), { f, a: mov.a || "baja", ...(mov.de ? { de: mov.de } : {}), tipo: mov.tipo || "", ...(mov.por ? { por: mov.por } : {}), ...(mov.presupuesto ? { presupuesto: mov.presupuesto } : {}), ...(mov.motivo ? { motivo: String(mov.motivo).slice(0, 120) } : {}) }].slice(-30);
      s.unidades[t] = { ...antes, c: mov.c, u: mov.a || "baja", f, h, ...(mov.prov ? { prov: mov.prov } : {}) };
    });
    return s;
  }

  // ---------- Escaneo: qué es cada código ----------
  // Forma de un N° de serie: letras -> A, dígitos -> 9 ("GH120FF156" -> "AA999AA999").
  // La APP va guardando las formas que ve en cada artículo y así aprende el formato de cada marca.
  const limpiarCodigo = (t) => String(t == null ? "" : t).trim().replace(/^\]\w\d/, "").replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, "").toUpperCase().slice(0, 64);
  // Los N° hexadecimales (MAC, IDs de Ajax o Citymesh: «7A1D9CFC») mezclan letras y números al azar,
  // así que su forma es solo «hexadecimal de N caracteres» (H8).
  const esHex = (t) => /^[0-9A-F]{6,}$/.test(t) && /[A-F]/.test(t) && /\d/.test(t);
  const formaCodigo = (t) => { const x = limpiarCodigo(t); return esHex(x) ? `H${x.length}` : x.replace(/[A-Z]/g, "A").replace(/\d/g, "9").replace(/[^A9]/g, "-"); };
  function coincideFormato(tracking, formatos) {
    const x = limpiarCodigo(tracking), f = formaCodigo(x), lista = Array.isArray(formatos) ? formatos : [];
    if (!lista.length) return null; // todavía no se aprendió nada: no se puede decir
    return lista.some((y) => y === f || (y[0] !== "H" && f[0] !== "H" && y.length === f.length && y.slice(0, 2) === f.slice(0, 2)) || (y === `H${x.length}` && /^[0-9A-F]+$/.test(x)));
  }
  function agregarFormato(formatos, tracking) {
    const f = formaCodigo(tracking), lista = Array.isArray(formatos) ? formatos.slice() : [];
    if (!f || f.length < 4 || lista.includes(f)) return lista;
    return [...lista, f].slice(-10);
  }
  // Devuelve qué se escaneó:
  //  { tipo: "articulo", c, via: "etiqueta"|"ean"|"codigo" }   -> un artículo (si es por unidad, después va su N° de serie)
  //  { tipo: "unidad", c, tracking, ubic?, nuevo, aviso? }    -> un equipo puntual
  //  { tipo: "ean_nuevo", ean }                                -> código de fabricante que todavía no se asoció a un artículo
  //  { tipo: "desconocido", texto, aviso }
  // actual: código del artículo de la última etiqueta escaneada (para leer a continuación sus N° de serie).
  function interpretarCodigo(texto, catalogo, saldos, actual) {
    const t = limpiarCodigo(texto), arts = (catalogo && catalogo.articulos) || {};
    if (!t) return { tipo: "desconocido", texto: t, aviso: "Código vacío" };
    if (esCodigoIgnorable(t)) return { tipo: "ignorar", texto: t, aviso: "Es un link (el QR del manual): no se usa." };
    const sat = leerEtiquetaSat(t);
    if (sat) {
      if (arts[sat.codigo]) return { tipo: "articulo", c: sat.codigo, via: "etiqueta", proveedor: sat.proveedor };
      return { tipo: "desconocido", texto: t, aviso: `La etiqueta es del artículo ${sat.codigo}, que no está en el catálogo de la APP.` };
    }
    const u = ((saldos && saldos.unidades) || {})[t];
    if (u && u.c) return { tipo: "unidad", c: u.c, tracking: t, ubic: u.u, nuevo: false };
    // También por los otros datos del equipo (Serial o MAC de Paradox, guardados junto al Tracking).
    const otro = buscarPorDatos(saldos, t);
    if (otro) return { tipo: "unidad", c: otro.u.c, tracking: otro.t, ubic: otro.u.u, nuevo: false, via: otro.via };
    if (esEanValido(t)) {
      const a = Object.values(arts).find((x) => Array.isArray(x.alias) && x.alias.includes(t));
      return a ? { tipo: "articulo", c: a.c, via: "ean" } : { tipo: "ean_nuevo", ean: t };
    }
    // Código que se repite en todas las cajas (de fabricante o del modelo, ej. «K10H-J9B»):
    // identifica el artículo, nunca es un N° de serie.
    const a2 = Object.values(arts).find((x) => Array.isArray(x.alias) && x.alias.includes(t));
    if (a2) return { tipo: "articulo", c: a2.c, via: a2.tipo === "unidad" ? "modelo" : "ean" };
    if (/^\d{1,8}$/.test(t) && arts[codigoArticulo(t)]) return { tipo: "articulo", c: codigoArticulo(t), via: "codigo" };
    if (actual && arts[actual] && arts[actual].tipo === "unidad") {
      if (t.length < 4) return { tipo: "desconocido", texto: t, aviso: "Ese código es muy corto para ser un N° de serie." };
      const ok = coincideFormato(t, arts[actual].formatos);
      return { tipo: "unidad", c: actual, tracking: t, nuevo: true, aviso: ok === false ? `No se parece a los N° de serie que ya vi de este artículo (${arts[actual].formatos.join(", ")}). ¿Seguro que es de esta caja?` : "" };
    }
    // Sin etiqueta antes: se busca un artículo cuyo formato aprendido coincida.
    const candidatos = Object.values(arts).filter((x) => x.tipo === "unidad" && coincideFormato(t, x.formatos) && (x.formatos || []).includes(formaCodigo(t)));
    if (candidatos.length === 1) return { tipo: "unidad", c: candidatos[0].c, tracking: t, nuevo: true, adivinado: true, aviso: `Parece un ${candidatos[0].d}: confirmalo escaneando la etiqueta de SAT.` };
    return { tipo: "desconocido", texto: t, aviso: "No reconozco este código. Escaneá primero la etiqueta de SAT de la caja." };
  }

  // Links (QR de manuales) y textos largos: no son ni artículo ni N° de serie.
  function esCodigoIgnorable(t) { return /^(HTTPS?:\/\/|WWW\.)/.test(t) || /\.(COM|AR|NET|ORG)(\/|$)/.test(t) || t.length > 40; }
  // Una caja tiene varios códigos a la vista (modelo, N° de serie, QR). De lo que la cámara leyó
  // en un mismo cuadro decide cuál usar:
  //  { usar: texto }            -> ese (la etiqueta de SAT primero, después un N° de serie ya conocido o con el formato aprendido)
  //  { elegir: [textos] }       -> hay más de un candidato a N° de serie y todavía no se sabe el formato: que elija la persona
  //  { usar: null }             -> nada útil (links, el código del modelo de la caja que ya se está escaneando)
  // pendiente: el artículo actual tiene cajas esperando su N° de serie. Si no, un código que no tiene
  // el formato aprendido se ignora (es de otra caja que todavía no se identificó con su etiqueta).
  function elegirCodigoDelCuadro(textos, catalogo, saldos, actual, pendiente) {
    const arts = (catalogo && catalogo.articulos) || {};
    const lista = [...new Set((textos || []).map(limpiarCodigo).filter(Boolean))];
    const info = lista.map((t) => ({ t, r: interpretarCodigo(t, catalogo, saldos, actual) })).filter((x) => x.r.tipo !== "ignorar");
    const sat = info.find((x) => leerEtiquetaSat(x.t));
    if (sat) return { usar: sat.t };
    const conocida = info.find((x) => x.r.tipo === "unidad" && !x.r.nuevo);
    if (conocida) return { usar: conocida.t };
    // El código del modelo del mismo artículo que se está escaneando no cambia nada.
    const utiles = info.filter((x) => !(x.r.tipo === "articulo" && x.r.c === actual && (x.r.via === "modelo" || (x.r.via === "ean" && pendiente && (arts[actual] || {}).tipo === "unidad"))));
    const a = arts[actual];
    if (a && a.tipo === "unidad") {
      const candidatos = utiles.filter((x) => x.r.tipo === "unidad" && x.r.c === actual);
      const conFormato = candidatos.filter((x) => coincideFormato(x.t, a.formatos) === true);
      if (conFormato.length) return { usar: conFormato[0].t };
      if (candidatos.length > 1 && !(a.formatos || []).length) return { elegir: candidatos.map((x) => x.t) };
      if (candidatos.length && (pendiente !== false || !(a.formatos || []).length)) return { usar: candidatos[0].t };
      if (candidatos.length) return { usar: null };
    }
    // Con la cámara, lo que no se reconoce no hace ruido (el N° de serie suelto antes de la etiqueta,
    // el código del modelo que todavía no se aprendió): arriba se indica qué escanear.
    const art = utiles.find((x) => x.r.tipo !== "desconocido" && !x.r.adivinado);
    return { usar: art ? art.t : null };
  }

  // ---------- Un solo lugar: N° de serie contra cantidades ----------
  // N° de serie registrados de un artículo en un lugar.
  const seriesEn = (saldos, ubic, c) => Object.entries((saldos && saldos.unidades) || {}).filter(([, u]) => u && u.c === c && u.u === ubic).map(([t]) => t);
  // Lo que sale «sin N°» no puede ser más que los equipos sin N° que hay en el origen.
  // Devuelve [{ c, d, faltan, conSerie }] (vacío = está bien).
  function controlarSalidaConSerie(saldos, de, items, catalogo) {
    const arts = (catalogo && catalogo.articulos) || {}, porArticulo = {};
    (items || []).forEach((x) => {
      const c = codigoArticulo(x.c);
      const p = (porArticulo[c] = porArticulo[c] || { cant: 0, unidades: [] });
      p.cant += Number(x.cant) || 0;
      p.unidades.push(...(x.unidades || []).map(limpiarCodigo));
    });
    const r = [];
    Object.entries(porArticulo).forEach(([c, x]) => {
      if ((arts[c] || {}).tipo !== "unidad") return;
      const conSerie = seriesEn(saldos, de, c);
      if (!conSerie.length) return;
      const hay = (((saldos && saldos.ubic) || {})[de] || {})[c] || 0;
      const identificados = x.unidades.filter((t) => conSerie.includes(t)).length;
      const salenSinN = Math.max(x.cant, x.unidades.length) - identificados, sinNDisponibles = Math.max(0, hay - conSerie.length);
      if (salenSinN > sinNDisponibles) r.push({ c, d: (arts[c] || {}).d || c, faltan: salenSinN - sinNDisponibles, conSerie: conSerie.filter((t) => !x.unidades.includes(t)) });
    });
    return r;
  }
  // Salud del stock: todo lo que rompe una regla, con qué hacer.
  // Devuelve [{ k, nivel: "error"|"aviso"|"info", titulo, ayuda, items: [{ texto, c?, ubic?, serie?, id? }] }]
  function saludStock(catalogo, saldos, ahora) {
    const arts = (catalogo && catalogo.articulos) || {}, s = saldos || {}, ubic = s.ubic || {}, uni = s.unidades || {};
    const d = (c) => (arts[c] || {}).d || c, t0 = (ahora || new Date()).getTime();
    const out = [];
    const grupo = (k, nivel, titulo, ayuda, items) => { if (items.length) out.push({ k, nivel, titulo, ayuda, items }); };
    // 1) N° de serie de más en un lugar (más N° que cantidad)
    const cuenta = {};
    Object.entries(uni).forEach(([t, u]) => { if (!u || !u.c || !u.u || u.u === "baja") return; const k2 = `${u.u}|${u.c}`; (cuenta[k2] = cuenta[k2] || []).push(t); });
    grupo("seriesDeMas", "error", "Más N° de serie que cantidad", "En ese lugar figuran más equipos identificados que la cantidad. Hay que dar de baja el N° que ya no está, o corregir la cantidad.",
      Object.entries(cuenta).filter(([k2, ts]) => { const [u, c] = k2.split("|"); return ts.length > ((ubic[u] || {})[c] || 0); }).map(([k2, ts]) => { const [u, c] = k2.split("|"); return { texto: `${d(c)} en ${nombreUbicacion(u)}: ${ts.length} N° de serie y cantidad ${(ubic[u] || {})[c] || 0}`, c, ubic: u, series: ts }; }));
    // 2) Cantidades negativas
    const neg = [];
    Object.entries(ubic).forEach(([u, items]) => Object.entries(items || {}).forEach(([c, n]) => { if (n < 0) neg.push({ texto: `${d(c)} en ${nombreUbicacion(u)}: ${n}`, c, ubic: u }); }));
    grupo("negativo", "error", "Cantidades negativas", "Salió más de lo que había: falta registrar una entrada o se cargó mal una salida.", neg);
    // 3) SIM, herramientas o «no controlar» con stock
    const otros = [];
    Object.entries(ubic).forEach(([u, items]) => Object.entries(items || {}).forEach(([c, n]) => { if (n && /^(sim|herramienta|no)$/.test((arts[c] || {}).tipo)) otros.push({ texto: `${d(c)} en ${nombreUbicacion(u)}: ${n}`, c, ubic: u }); }));
    grupo("otros", "aviso", "SIM o herramientas en el stock", "Estos artículos se manejan en Control de SIMs o Herramientas: ajustalos a 0 acá.", otros);
    // 4) Envíos sin confirmar hace más de 2 días
    grupo("envios", "aviso", "Envíos sin confirmar hace más de 2 días", "Material en camino que nadie confirmó: llamar al que tiene que tocar «Recibí».",
      (s.envios || []).filter((e) => t0 - new Date(e.fecha).getTime() > 2 * 864e5).map((e) => ({ texto: `${e.a === "dep" ? `Devolución de ${e.de.replace(/^tec:/, "")}` : `A ${e.a.replace(/^tec:/, "")}`}: ${e.items.map((x) => `${d(x.c)} ×${x.cant}`).join(", ")} (desde el ${new Date(e.fecha).toLocaleDateString("es-AR")})`, id: e.id })));
    // 4b) Materiales de partes que no estaban en el stock del técnico
    grupo("aprobar", "aviso", "Materiales de partes para aprobar", "El técnico los cargó en un parte y no estaban en su stock. Se aprueban en Depósito (de dónde salió) o acá sin descontar.",
      (s.aprobar || []).map((x) => ({ texto: `${x.por}: ${x.texto || d(x.c)} ×${x.cant} → ${x.cliente}${x.parte ? ` (parte ${x.parte})` : ""}`, id: x.id })));
    // 5) Retiros que no figuraban en la APP
    grupo("revisar", "aviso", "Entraron cosas que no figuraban en la APP", "Retiros de clientes que la APP no tenía registrados. Revisá que estén bien y marcalos como revisados.",
      (s.revisar || []).map((x) => ({ texto: `${d(x.c)} ×${x.cant} de ${nombreUbicacion(x.de)} (${new Date(x.fecha).toLocaleDateString("es-AR")}, ${x.por || ""})`, id: x.id })));
    // 6) Comodato sin cliente
    const sinCli = Object.entries(ubic["com:Sin asignar"] || {}).filter(([, n]) => n > 0);
    grupo("comodatoSinCliente", "info", "Comodato sin cliente asignado", "Viene del saldo inicial. Se asigna a cada cliente con la planilla de comodatos.", sinCli.map(([c, n]) => ({ texto: `${d(c)}: ${n}`, c, ubic: "com:Sin asignar" })));
    // 7) Equipos sin N° de serie todavía (en poder de SAT)
    const sinN = [];
    Object.entries(ubic).forEach(([u, items]) => {
      if (!/^(dep|gar|tec:|veh:)/.test(u)) return;
      Object.entries(items || {}).forEach(([c, n]) => { if ((arts[c] || {}).tipo !== "unidad") return; const f = n - ((cuenta[`${u}|${c}`] || []).length); if (f > 0) sinN.push({ texto: `${d(c)} en ${nombreUbicacion(u)}: ${f} sin N°`, c, ubic: u, n: f }); });
    });
    grupo("sinSerie", "info", "Equipos sin N° de serie todavía", "Se registran con el Inventario del Depósito (escanear etiqueta y N° de cada caja).", sinN);
    // 8) Movimientos esperando pasar al historial
    grupo("movsPend", "info", "Movimientos esperando pasar al historial", "Se pasan solos en la próxima operación.", (s.movsPend || []).length ? [{ texto: `${s.movsPend.length} movimiento(s)` }] : []);
    return out;
  }

  // ---------- Datos extra de cada equipo ----------
  // Paradox: el código de barras es el Tracking (único por equipo); el Serial y la MAC no tienen
  // código de barras y se guardan como datos del mismo equipo. Ajax: el código de barras de la caja
  // trae el ID del equipo (6 caracteres, el que muestra la app de Ajax) y un control.
  const normMac = (t) => String(t || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  function datosLimpios(d) {
    const r = {};
    if (!d || typeof d !== "object") return r;
    const serial = limpiarCodigo(d.serial).slice(0, 40), mac = normMac(d.mac);
    if (serial) r.serial = serial;
    if (mac.length === 12) r.mac = mac.match(/../g).join(":");
    return r;
  }
  function buscarPorDatos(saldos, t) {
    const x = limpiarCodigo(t), m = normMac(t);
    if (!x) return null;
    for (const [k, u] of Object.entries((saldos && saldos.unidades) || {})) {
      const d = (u && u.datos) || {};
      if (d.serial && d.serial === x) return { t: k, u, via: "serial" };
      if (d.mac && m.length === 12 && normMac(d.mac) === m) return { t: k, u, via: "mac" };
    }
    return null;
  }
  // Texto que ayuda a reconocer el N° de serie (ej. el ID de Ajax).
  function infoSerie(t, u) {
    const x = limpiarCodigo(t), partes = [];
    if (/^[0-9A-F]{6}[0-9]{5}$/.test(x)) partes.push(`ID Ajax ${x.slice(0, 6)}`);
    const d = (u && u.datos) || {};
    if (d.serial) partes.push(`Serial ${d.serial}`);
    if (d.mac) partes.push(`MAC ${d.mac}`);
    return partes.join(" · ");
  }

  // ---------- Movimientos con confirmación ----------
  // Lo que va a un técnico (o vuelve de un técnico al depósito) queda «en camino» hasta que
  // el que recibe confirma. Los envíos pendientes se guardan en saldos.envios.
  const camino = (a, de) => (/^dep$/.test(a) && /^tec:/.test(de || "") ? `cam:dev:${de.slice(4)}` : `cam:${String(a).replace(/^tec:/, "")}`);
  const idMov = (i) => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}${i == null ? "" : "-" + i}`;
  // items: [{ c, cant, unidades?: [tracking] }]. op: { tipo, de?, a, por, fecha, motivo?, confirmar? }
  // Devuelve { saldos, movs, envio } o { error }.
  function moverStock(saldos, items, op, catalogo) {
    const arts = (catalogo && catalogo.articulos) || {};
    let s = JSON.parse(JSON.stringify(saldos || {}));
    s.ubic = s.ubic || {}; s.unidades = s.unidades || {}; s.envios = Array.isArray(s.envios) ? s.envios : [];
    const fecha = op.fecha || new Date().toISOString();
    const lista = (items || []).map((x) => ({ c: codigoArticulo(x.c), cant: Math.round((Number(x.cant) || 0) * 1000) / 1000, unidades: [...new Set((x.unidades || []).map(limpiarCodigo).filter(Boolean))], prov: codigoProveedor(x.prov) }))
      .map((x) => ({ ...x, cant: x.unidades.length > x.cant ? x.unidades.length : x.cant })).filter((x) => x.c && x.cant > 0);
    if (!lista.length) return { error: "No hay nada para mover" };
    if (!op.a && !op.de) return { error: "Falta el destino" };
    if (op.a && op.a === op.de) return { error: "El origen y el destino son el mismo" };
    for (const x of lista) {
      if (!arts[x.c]) return { error: `El artículo ${x.c} no está en el catálogo` };
      if (!op.permitirOtros && /^(sim|herramienta|no)$/.test(arts[x.c].tipo)) return { error: `${arts[x.c].d}: ${arts[x.c].tipo === "sim" ? "es un SIM, se maneja en Control de SIMs" : arts[x.c].tipo === "herramienta" ? "es una herramienta, se maneja en Herramientas" : "está marcado «No controlar»"}.` };
      if (op.de && op.de !== "proveedor" && !op.deFlexible) {
        const hay = (s.ubic[op.de] || {})[x.c] || 0;
        if (hay < x.cant) return { error: `${arts[x.c].d}: en ${nombreUbicacion(op.de)} hay ${hay} y querés mover ${x.cant}.` };
      }
      for (const t of x.unidades) {
        const u = s.unidades[t];
        if (u && u.c !== x.c) return { error: `El N° de serie ${t} es de otro artículo (${(arts[u.c] || {}).d || u.c}).` };
        if (u && op.de && op.de !== "proveedor" && !op.deFlexible && u.u !== op.de) return { error: `El equipo ${t} figura en ${nombreUbicacion(u.u)}, no en ${nombreUbicacion(op.de)}.` };
      }
    }
    // Regla de un solo lugar: si en el origen hay equipos con N° de serie, se dice cuáles salen.
    if (op.de && op.de !== "proveedor" && !op.deFlexible) {
      const faltan = controlarSalidaConSerie(s, op.de, lista, catalogo);
      if (faltan.length) return { error: faltan.map((f) => `${f.d}: en ${nombreUbicacion(op.de)} hay ${f.conSerie.length} con N° de serie; escaneá o elegí cuál${f.faltan > 1 ? "es" : ""} sale${f.faltan > 1 ? "n" : ""} (faltan ${f.faltan}).`).join(" "), faltanSerie: faltan };
    }
    const de = op.de === "proveedor" ? null : op.de || null;
    const destino = op.confirmar ? camino(op.a, de) : op.a;
    const base = (x, i, cant, desde, extra) => ({ id: idMov(i), fecha, por: op.por || "", tipo: op.tipo || "movimiento", c: x.c, cant, ...(desde ? { de: desde } : {}), a: destino, ...(op.motivo ? { motivo: op.motivo } : {}), ...(op.presupuesto ? { presupuesto: op.presupuesto } : {}), ...(extra || {}) });
    const movs = [];
    lista.forEach((x, i) => {
      const uni = { ...(x.unidades.length ? { unidades: x.unidades } : {}), ...(x.prov ? { prov: x.prov } : {}) };
      // Retiro de un cliente que la APP no tenía registrado (o con menos): lo que falta sale del
      // comodato «Sin asignar» si es comodato, y si no, entra igual (no figuraba en la APP).
      let hay = de ? (s.ubic[de] || {})[x.c] || 0 : x.cant;
      // Un equipo con N° que no figuraba en el cliente no puede «llevarse» la cantidad de otro equipo
      // identificado que sigue registrado ahí: de ese lugar sale solo lo identificado y lo sin N°.
      if (de && op.deFlexible && (arts[x.c] || {}).tipo === "unidad") {
        const conSerie = seriesEn(s, de, x.c), identificados = x.unidades.filter((t) => conSerie.includes(t)).length;
        hay = Math.min(hay, identificados + Math.max(0, hay - conSerie.length));
      }
      if (!op.deFlexible || hay >= x.cant) { movs.push(base(x, i, x.cant, de, uni)); return; }
      let resto = x.cant;
      const pv = x.prov ? { prov: x.prov } : {};
      if (hay > 0) { movs.push(base(x, `${i}a`, hay, de, pv)); resto -= hay; }
      const sinAsignar = /^com:/.test(de) ? (s.ubic["com:Sin asignar"] || {})[x.c] || 0 : 0;
      if (sinAsignar > 0) { const n = Math.min(sinAsignar, resto); movs.push(base(x, `${i}b`, n, "com:Sin asignar", pv)); resto -= n; }
      if (resto > 0) movs.push(base(x, `${i}c`, Math.round(resto * 1000) / 1000, null, { ...pv, motivo: `${op.motivo ? op.motivo + " · " : ""}no figuraba en la APP en ${nombreUbicacion(de)}` }));
      if (x.unidades.length) movs[movs.length - 1].unidades = x.unidades;
    });
    movs.forEach((m) => { s = aplicarMovimiento(s, m); });
    (items || []).forEach((x) => Object.entries((x && x.extras) || {}).forEach(([t, d]) => {
      const k = limpiarCodigo(t), limpio = datosLimpios(d);
      if (s.unidades[k] && Object.keys(limpio).length) s.unidades[k] = { ...s.unidades[k], datos: { ...(s.unidades[k].datos || {}), ...limpio } };
    }));
    let envio = null;
    if (op.confirmar) {
      envio = { id: idMov(), tipo: op.tipo || "entrega", fecha, por: op.por || "", de: de || "dep", a: op.a, camino: destino, items: lista, ...(op.motivo ? { motivo: op.motivo } : {}), ...(op.fallado ? { fallado: true, falla: String(op.falla || "").slice(0, 200) } : {}) };
      s.envios = [...s.envios, envio];
      movs.forEach((m) => { m.envio = envio.id; });
    }
    return { saldos: s, movs, envio };
  }
  // El que recibe confirma (todo o parte) o rechaza. Lo que no se recibe vuelve al origen.
  // resp: { accion: "recibi"|"rechazar", items?: [{ c, cant, unidades? }], por, fecha, motivo?, destino? }
  function cerrarEnvio(saldos, id, resp) {
    let s = JSON.parse(JSON.stringify(saldos || {}));
    const envio = (s.envios || []).find((e) => e.id === id);
    if (!envio) return { error: "Ese envío ya se confirmó o no existe" };
    const fecha = resp.fecha || new Date().toISOString(), movs = [];
    const final = resp.destino && envio.a === "dep" ? resp.destino : envio.a;
    const recibidos = new Map();
    if (resp.accion === "recibi") {
      if (Array.isArray(resp.items)) resp.items.forEach((x) => recibidos.set(codigoArticulo(x.c), { cant: Number(x.cant) || 0, unidades: x.unidades }));
      else envio.items.forEach((x) => recibidos.set(x.c, { cant: x.cant, unidades: x.unidades }));
    } else if (resp.accion !== "rechazar") return { error: "Acción inválida" };
    const diferencias = [];
    envio.items.forEach((x, i) => {
      const r = recibidos.get(x.c) || { cant: 0 };
      const cant = Math.max(0, Math.min(x.cant, Math.round(r.cant * 1000) / 1000));
      // Cada equipo del envío termina en un solo lado: los que el que recibe marcó, con él (hasta lo
      // recibido); el resto vuelve, sin pasar de lo que vuelve. Si sobran N° (marcó menos equipos que
      // la cantidad que recibió), esos también quedan con él: nunca un N° queda colgado «en camino».
      const todas = x.unidades || [];
      let uniRec = todas.filter((t) => !Array.isArray(r.unidades) || r.unidades.map(limpiarCodigo).includes(t)).slice(0, cant || 0);
      let uniVuelven = todas.filter((t) => !uniRec.includes(t));
      const lugaresVuelta = Math.max(0, Math.floor(x.cant - cant));
      if (uniVuelven.length > lugaresVuelta) { uniRec = [...uniRec, ...uniVuelven.slice(lugaresVuelta)]; uniVuelven = uniVuelven.slice(0, lugaresVuelta); }
      if (cant > 0) movs.push({ id: idMov(`r${i}`), fecha, por: resp.por || "", tipo: "recibido", c: x.c, cant, de: envio.camino, a: final, envio: envio.id, ...(uniRec.length ? { unidades: uniRec } : {}) });
      if (cant < x.cant) {
        diferencias.push({ c: x.c, enviado: x.cant, recibido: cant });
        movs.push({ id: idMov(`v${i}`), fecha, por: resp.por || "", tipo: resp.accion === "rechazar" ? "rechazado" : "diferencia", c: x.c, cant: Math.round((x.cant - cant) * 1000) / 1000, de: envio.camino, a: envio.de, envio: envio.id, motivo: resp.motivo || (resp.accion === "rechazar" ? "Rechazado" : "No llegó todo"), ...(uniVuelven.length ? { unidades: uniVuelven } : {}) });
      }
    });
    movs.forEach((m) => { s = aplicarMovimiento(s, m); });
    s.envios = s.envios.filter((e) => e.id !== id);
    const cerrado = { ...envio, estado: resp.accion === "rechazar" ? "rechazado" : diferencias.length ? "con_diferencias" : "recibido", cerrado: fecha, cerrado_por: resp.por || "", diferencias, ...(resp.motivo ? { motivo_cierre: resp.motivo } : {}) };
    return { saldos: s, movs, envio: cerrado };
  }
  // Inventario de N° de serie: registra los equipos que ya están en una ubicación (sin mover cantidades).
  // No se registran más N° de serie que los equipos que hay ahí según la APP.
  function registrarUnidades(saldos, ubic, items, fecha) {
    const s = JSON.parse(JSON.stringify(saldos || {}));
    s.unidades = s.unidades || {};
    const r = { registradas: 0, yaEstaban: [], enOtroLado: [], deOtroArticulo: [], sobran: [] };
    (items || []).forEach((x) => {
      const c = codigoArticulo(x.c);
      const hay = ((s.ubic || {})[ubic] || {})[c] || 0;
      let conSerie = Object.values(s.unidades).filter((u) => u.c === c && u.u === ubic).length;
      [...new Set((x.unidades || []).map(limpiarCodigo).filter(Boolean))].forEach((t) => {
        const u = s.unidades[t];
        if (u && u.c !== c) { r.deOtroArticulo.push({ t, c: u.c }); return; }
        if (u && u.u === ubic) { r.yaEstaban.push(t); return; }
        if (u) { r.enOtroLado.push({ t, c, u: u.u }); return; }
        if (conSerie >= hay) { r.sobran.push({ t, c, hay }); return; }
        const extra = datosLimpios(((x.extras || {})[t]));
        s.unidades[t] = { c, u: ubic, f: fecha || new Date().toISOString(), inventario: true, ...(codigoProveedor(x.prov) ? { prov: codigoProveedor(x.prov) } : {}), ...(Object.keys(extra).length ? { datos: extra } : {}) };
        conSerie++; r.registradas++;
      });
    });
    return { saldos: s, ...r };
  }
  // ---------- Cuadre: el saldo guardado contra todos los movimientos ----------
  // Recalcula el stock desde cero con el historial (saldo inicial + cada movimiento) y lo compara con
  // lo guardado. Además revisa las reglas que nunca se pueden romper. No modifica nada.
  // movimientos: todos los de los archivos del mes (en el orden del archivo) + saldos.movsPend.
  // Devuelve { ok, errores: [{ k, texto, ... }], avisos: [...], revisados: { movimientos, articulos, series } }.
  const red3 = (n) => Math.round(n * 1000) / 1000;
  function recalcularDesdeMovimientos(movimientos) {
    const vistos = new Set(), lista = [];
    let duplicados = 0;
    (movimientos || []).forEach((m, i) => {
      if (!m || typeof m !== "object") return;
      if (m.id && vistos.has(m.id)) { duplicados++; return; }
      if (m.id) vistos.add(m.id);
      lista.push({ m, i });
    });
    // Orden de la operación: por fecha y, en la misma fecha, como quedaron guardados.
    lista.sort((x, y) => (String(x.m.fecha || "") < String(y.m.fecha || "") ? -1 : String(x.m.fecha || "") > String(y.m.fecha || "") ? 1 : x.i - y.i));
    const q = {}, donde = {}, ultimo = {};
    let inicialFecha = null, usados = 0;
    const sumar = (u, c, n) => { const caja = (q[u] = q[u] || {}); caja[c] = red3((caja[c] || 0) + n); };
    lista.forEach(({ m }) => {
      if (m.tipo === "inventario_series" || !m.c) return; // el inventario de N° no mueve cantidades
      // Un saldo inicial (o uno nuevo, forzado) deja el depósito y el comodato sin asignar en cero y carga lo del listado.
      if (m.tipo === "inicial" && m.fecha !== inicialFecha) { inicialFecha = m.fecha; delete q.dep; delete q["com:Sin asignar"]; }
      const cant = Number(m.cant) || 0;
      if (m.de) sumar(m.de, m.c, -cant);
      if (m.a) sumar(m.a, m.c, cant);
      (m.unidades || []).forEach((t) => { donde[t] = { u: m.a || "baja", c: m.c }; ultimo[t] = m; });
      usados++;
    });
    return { q, donde, ultimo, usados, duplicados };
  }
  function auditarStock(saldos, movimientos, catalogo, opciones) {
    const arts = (catalogo && catalogo.articulos) || {}, s = saldos || {}, ubic = s.ubic || {}, uni = s.unidades || {};
    const d = (c) => (arts[c] || {}).d || c;
    const t0 = ((opciones && opciones.ahora) || new Date()).getTime();
    const errores = [], avisos = [];
    const r = recalcularDesdeMovimientos([...(movimientos || []), ...(s.movsPend || [])]);
    // 1) Cada cantidad guardada tiene que ser igual a la que dan los movimientos.
    const lugares = new Set([...Object.keys(ubic), ...Object.keys(r.q)]);
    let articulos = 0;
    lugares.forEach((u) => {
      const g = ubic[u] || {}, c2 = r.q[u] || {};
      new Set([...Object.keys(g), ...Object.keys(c2)]).forEach((c) => {
        articulos++;
        const guardado = Number(g[c]) || 0, calculado = Number(c2[c]) || 0;
        if (Math.abs(guardado - calculado) > 1e-6) errores.push({ k: "cantidad", c, ubic: u, guardado, calculado, texto: `${d(c)} en ${nombreUbicacion(u)}: el stock dice ${guardado} y los movimientos dan ${calculado} (diferencia ${red3(guardado - calculado) > 0 ? "+" : ""}${red3(guardado - calculado)}).` });
      });
    });
    // 2) Nada negativo.
    Object.entries(ubic).forEach(([u, items]) => Object.entries(items || {}).forEach(([c, n]) => {
      if (Number(n) < 0) errores.push({ k: "negativo", c, ubic: u, texto: `${d(c)} en ${nombreUbicacion(u)}: cantidad negativa (${n}).` });
    }));
    // 3) Cada equipo en un solo lugar: no más N° de serie que cantidad, y el lugar es el que dicen los movimientos.
    const cuenta = {};
    Object.entries(uni).forEach(([t, u]) => {
      if (!u || !u.c) { errores.push({ k: "serieRota", serie: t, texto: `El N° de serie ${t} quedó sin artículo.` }); return; }
      if (u.u && u.u !== "baja") (cuenta[`${u.u}|${u.c}`] = cuenta[`${u.u}|${u.c}`] || []).push(t);
      if (!arts[u.c]) avisos.push({ k: "serieSinArticulo", serie: t, texto: `El N° de serie ${t} es del artículo ${u.c}, que no está en el catálogo.` });
    });
    Object.entries(cuenta).forEach(([k2, ts]) => {
      const [u, c] = k2.split("|"), n = Number((ubic[u] || {})[c]) || 0;
      if (ts.length > n) errores.push({ k: "seriesDeMas", c, ubic: u, series: ts, texto: `${d(c)} en ${nombreUbicacion(u)}: ${ts.length} equipos con N° de serie y la cantidad es ${n}.` });
    });
    Object.entries(r.donde).forEach(([t, x]) => {
      const u = uni[t];
      if (!u && x.u === "baja") return; // dado de baja y ya borrado: está bien
      if (!u) errores.push({ k: "serieFalta", serie: t, c: x.c, texto: `El equipo ${t} (${d(x.c)}) se movió, pero no figura en el stock (según los movimientos está en ${nombreUbicacion(x.u)}).` });
      else if (u.u !== x.u || u.c !== x.c) errores.push({ k: "serieLugar", serie: t, c: u.c, texto: `El equipo ${t} (${d(u.c)}) figura en ${nombreUbicacion(u.u)}, pero según los movimientos está en ${nombreUbicacion(x.u)}.` });
    });
    // 4) Lo que está «en camino» tiene que ser exactamente lo de los envíos abiertos.
    const enCamino = {}, seriesEnCamino = new Set();
    (Array.isArray(s.envios) ? s.envios : []).forEach((e) => (e.items || []).forEach((x) => {
      const caja = (enCamino[e.camino] = enCamino[e.camino] || {});
      caja[x.c] = red3((caja[x.c] || 0) + (Number(x.cant) || 0));
      (x.unidades || []).forEach((t) => seriesEnCamino.add(t));
    }));
    new Set([...Object.keys(ubic).filter((u) => /^cam:/.test(u)), ...Object.keys(enCamino)]).forEach((u) => {
      const g = ubic[u] || {}, e = enCamino[u] || {};
      new Set([...Object.keys(g), ...Object.keys(e)]).forEach((c) => {
        const a = Number(g[c]) || 0, b = Number(e[c]) || 0;
        if (Math.abs(a - b) > 1e-6) errores.push({ k: "camino", c, ubic: u, texto: `${d(c)} (${nombreUbicacion(u)}): el stock dice ${a} y los envíos sin confirmar suman ${b}.` });
      });
    });
    Object.entries(uni).forEach(([t, u]) => { if (u && /^cam:/.test(u.u || "") && !seriesEnCamino.has(t)) errores.push({ k: "serieCamino", serie: t, c: u.c, texto: `El equipo ${t} (${d(u.c)}) figura «${nombreUbicacion(u.u)}», pero no está en ningún envío sin confirmar.` }); });
    // 5) Avisos: historial con repetidos, movimientos que no pasaron al historial del mes.
    if (r.duplicados) avisos.push({ k: "duplicados", texto: `Hay ${r.duplicados} movimiento(s) repetido(s) en el historial (se contaron una sola vez).` });
    const viejos = (s.movsPend || []).filter((m) => t0 - new Date(m.fecha).getTime() > 864e5);
    if (viejos.length) avisos.push({ k: "movsPend", texto: `${viejos.length} movimiento(s) de hace más de un día todavía no pasaron al historial del mes (se pasan en la próxima operación).` });
    return { ok: !errores.length, errores, avisos, revisados: { movimientos: r.usados, articulos, series: Object.keys(uni).length } };
  }

  // Regularizar: cuando lo guardado es lo correcto (se verificó), se agregan al historial los
  // movimientos que faltan para que cuadre. No toca el saldo: solo el historial, y todo queda a la vista.
  function movimientosDeRegularizacion(saldos, movimientos, catalogo, op) {
    const s = saldos || {}, ubic = s.ubic || {}, uni = s.unidades || {};
    const r = recalcularDesdeMovimientos([...(movimientos || []), ...(s.movsPend || [])]);
    const fecha = (op && op.fecha) || new Date().toISOString(), por = (op && op.por) || "";
    const motivo = (op && op.motivo) || "Regularización del cuadre: se acepta el stock guardado";
    const movs = [];
    const base = (extra) => ({ id: `${idMov(movs.length)}-reg`, fecha, por, tipo: "regularizacion", motivo, ...extra });
    new Set([...Object.keys(ubic), ...Object.keys(r.q)]).forEach((u) => {
      const g = ubic[u] || {}, c2 = r.q[u] || {};
      new Set([...Object.keys(g), ...Object.keys(c2)]).forEach((c) => {
        const dif = red3((Number(g[c]) || 0) - (Number(c2[c]) || 0));
        if (Math.abs(dif) > 1e-6) movs.push(base({ c, cant: Math.abs(dif), ...(dif > 0 ? { a: u } : { de: u }) }));
      });
    });
    Object.entries(r.donde).forEach(([t, x]) => {
      const u = uni[t];
      if (!u) { if (x.u !== "baja") movs.push(base({ c: x.c, cant: 0, de: x.u, unidades: [t] })); return; }
      if (u.u !== x.u || u.c !== x.c) movs.push(base({ c: u.c, cant: 0, ...(x.u !== "baja" ? { de: x.u } : {}), ...(u.u && u.u !== "baja" ? { a: u.u } : {}), unidades: [t] }));
    });
    return movs;
  }

  // ---------- Archivo para el sistema de Oficina ----------
  // Oficina cuenta «Depósito» (todo lo que está en poder de SAT: depósito, técnicos, vehículos, en
  // camino) y «Comodato». Los pases internos no le cambian nada; sí lo que sale a un cliente, lo que
  // vuelve de un cliente, los ajustes y las compras.
  const grupoOficina = (u) => (!u ? "afuera" : /^(dep|gar|tec:|veh:|cam:)/.test(u) ? "sat" : /^com:/.test(u) ? "comodato" : /^cli:/.test(u) ? "cliente" : "otro");
  function movimientoParaOficina(m) {
    if (!m || !m.c || !(Number(m.cant) > 0) || m.tipo === "inicial" || m.tipo === "inventario_series" || m.tipo === "garantia_reemplazo") return null;
    const de = grupoOficina(m.de), a = grupoOficina(m.a);
    if (de === a) return null;
    const cliente = (u) => String(u || "").replace(/^(cli|com):/, "");
    let operacion = "", deposito = 0, comodato = 0, quien = "";
    if (de === "sat" && a === "cliente") { operacion = "SALIDA A CLIENTE"; deposito = -m.cant; quien = cliente(m.a); }
    else if (de === "sat" && a === "comodato") { operacion = "PASE A COMODATO"; deposito = -m.cant; comodato = m.cant; quien = cliente(m.a); }
    else if (de === "comodato" && a === "sat") { operacion = "DEVOLUCION DE COMODATO"; deposito = m.cant; comodato = -m.cant; quien = cliente(m.de); }
    else if (de === "cliente" && a === "sat") { operacion = "RETIRO DE CLIENTE"; deposito = m.cant; quien = cliente(m.de); }
    else if (de === "afuera" && a === "sat") { operacion = m.tipo === "ajuste" || m.tipo === "regularizacion" ? "AJUSTE" : "INGRESO"; deposito = m.cant; }
    else if (de === "sat" && a === "afuera") { operacion = "AJUSTE"; deposito = -m.cant; }
    else if (de === "afuera" && a === "comodato") { operacion = "AJUSTE"; comodato = m.cant; quien = cliente(m.a); }
    else if (de === "comodato" && a === "afuera") { operacion = "AJUSTE"; comodato = -m.cant; quien = cliente(m.de); }
    else if (de === "comodato" && a === "cliente") { operacion = "COMODATO A VENTA"; comodato = -m.cant; quien = cliente(m.a); }
    else return null;
    return { id: m.id, fecha: m.fecha, operacion, c: m.c, deposito, comodato, cliente: quien, presupuesto: m.presupuesto || "", series: (m.unidades || []).join(" "), prov: m.prov || "", por: m.por || "", motivo: m.motivo || "" };
  }
  // ---------- Garantía ----------
  const GARANTIA_ESTADOS = {
    por_enviar: "Fallado: por mandar al proveedor",
    enviado: "Mandado al proveedor",
    reparado: "Volvió reparado",
    reemplazado: "El proveedor lo reemplazó",
    rechazado: "Garantía rechazada",
  };
  // Los equipos que entran a «Garantía» quedan con su ficha de garantía abierta.
  function abrirGarantias(saldos, movs, datos) {
    (movs || []).forEach((m) => {
      if (m.a !== "gar") return;
      (m.unidades || []).forEach((t) => {
        const u = saldos.unidades && saldos.unidades[t];
        if (!u) return;
        u.garantia = { estado: "por_enviar", desde: m.fecha, por: m.por || datos.por || "", falla: String(datos.falla || m.motivo || "").slice(0, 200), instalacion: instalacionDeUnidad(u), historial: [...(((u.garantia && u.garantia.cerrada) ? u.garantia.historial : []) || [])] };
      });
    });
    return saldos;
  }
  // Del historial de un equipo: a qué cliente fue y cuándo (lo último antes de volver).
  function instalacionDeUnidad(u) {
    const h = (u && u.h) || [];
    for (let i = h.length - 1; i >= 0; i--) if (/^(cli|com):/.test(h[i].a)) return { cliente: h[i].a.replace(/^(cli|com):/, ""), comodato: /^com:/.test(h[i].a), fecha: h[i].f, presupuesto: h[i].presupuesto || "" };
    return null;
  }
  // Lo que tiene una persona: su ubicación, lo que le llega y lo que devolvió y falta confirmar.
  function stockDePersona(saldos, nombre) {
    const s = saldos || {}, envios = Array.isArray(s.envios) ? s.envios : [];
    const unidades = Object.entries(s.unidades || {}).filter(([, u]) => u && u.u === `tec:${nombre}`).map(([t, u]) => ({ tracking: t, c: u.c }));
    return {
      tiene: { ...((s.ubic || {})[`tec:${nombre}`] || {}) },
      unidades,
      porRecibir: envios.filter((e) => e.a === `tec:${nombre}`),
      devueltos: envios.filter((e) => e.de === `tec:${nombre}` && e.a === "dep"),
    };
  }

  // De un libro de Excel (SheetJS), las filas de la hoja que tiene el listado
  // (la que trae «Código» y «Descripción»; las hojas de instrucciones se saltean).
  function filasDelListado(wb, XLSX) {
    let mejor = [];
    (wb.SheetNames || []).forEach((n) => {
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: "" });
      const cab = Object.keys(filas[0] || {}).map(sinAcentos);
      if (cab.some((c) => /^cod/.test(c)) && cab.some((c) => /descrip/.test(c)) && filas.length > mejor.length) mejor = filas;
    });
    return mejor;
  }

  const api = { codigoProveedor, nombreProveedor, STOCK_TIPOS, esDescripcionSim, STOCK_CONC_CATEGORIAS, codigoArticulo, leerEtiquetaSat, esEanValido, clasificarArticulo, medidaArticulo, columnasOficina, leerListadoOficina, nombreUbicacion, totalesPorArticulo, unidadesPorArticulo, conciliarStock, articulosParaPedir, pedidosCumplidos, aplicarMovimiento, filasDelListado, numStock: num, limpiarCodigo, formaCodigo, coincideFormato, agregarFormato, interpretarCodigo, datosLimpios, buscarPorDatos, infoSerie, seriesEn, controlarSalidaConSerie, saludStock, esCodigoIgnorable, elegirCodigoDelCuadro, registrarUnidades, movimientoParaOficina, GARANTIA_ESTADOS, instalacionDeUnidad, abrirGarantias, moverStock, cerrarEnvio, stockDePersona, auditarStock, recalcularDesdeMovimientos, movimientosDeRegularizacion };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else Object.assign(raiz, api);
})(typeof window !== "undefined" ? window : globalThis);
