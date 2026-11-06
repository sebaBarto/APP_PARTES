// Stock de artículos: lógica compartida por el panel de administración, la
// APP y el servidor (en Node se usa con require). Funciones puras: no leen ni
// escriben nada; reciben los datos y devuelven el resultado.
//
// Datos:
//  - catálogo: { articulos: { "<código>": { c, d, tipo, medida, min, pedir, prov, alias[], baja, precio, moneda } } }
//      tipo: "unidad" (equipo con N° de unidad), "cantidad", "sim", "herramienta", "no"
//  - saldos: { inicializado, ubic: { "<ubicación>": { "<código>": cantidad } }, unidades: { "<tracking>": { c, u, f } }, pedidos: { "<código>": { fecha, cantidad, por } } }
//      ubicaciones: "dep" (depósito), "tec:<nombre>", "veh:<nombre>", "cli:<cliente>" (instalado), "com:<cliente>" (comodato)

(function (raiz) {
  const STOCK_TIPOS = {
    unidad: "Equipo con N° de unidad",
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
    if (/ADAPTADOR|ANTENA|SOPORTE|BRAZO|CAJA|GABINETE|BASE |LENTE|TAPA|CARCAZA|FICHA|CONECTOR|BALUN|FUENTE|TRAFO|TRANSFORMADOR|BATERIA|PILA/.test(D) && !/^(CENTRAL|CAMARA|DVR|NVR)/.test(D)) return "cantidad";
    if (/\b(CENTRAL|TECLADO|KEYPAD|CAMARA|CÁMARA|DVR|NVR|XVR|VIDEOGRABADOR|GRABADOR|COMUNICADOR|ED5800|IP100|IP150|ROUTER|SWITCH|ACCESS POINT|DISCO|HDD|INVERSOR|CENTRO DE MONITOREO|VIDEOPORTERO|MONITOR|LECTOR|UPS|PANEL M\d|MODEM)/.test(D)
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
  const UBIC_TEXTO = { dep: "Depósito", tec: "Técnico", veh: "Vehículo", cli: "Cliente (instalado)", com: "Cliente (comodato)", cam: "En camino" };
  function nombreUbicacion(u) {
    if (u === "dep") return "Depósito";
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
        const x = (tot[c] = tot[c] || { sat: 0, dep: 0, tec: 0, veh: 0, cam: 0, cli: 0, com: 0, detalle: {} });
        const n = Number(cant) || 0;
        if (!n) return;
        x.detalle[u] = n;
        if (t === "dep") { x.dep += n; x.sat += n; }
        else if (t === "tec") { x.tec += n; x.sat += n; }
        else if (t === "veh") { x.veh += n; x.sat += n; }
        else if (t === "cam") { x.cam += n; x.sat += n; }
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
    { k: "unidadesSinRegistrar", corto: "Unidades sin escanear", titulo: "Equipos sin todas sus unidades registradas", ayuda: "Hay más equipos que números de unidad escaneados: falta escanearlos (inventario)." },
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
    (mov.unidades || []).forEach((t) => { s.unidades[t] = { c: mov.c, u: mov.a || "baja", f: mov.fecha || new Date().toISOString() }; });
    return s;
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

  const api = { STOCK_TIPOS, esDescripcionSim, STOCK_CONC_CATEGORIAS, codigoArticulo, leerEtiquetaSat, esEanValido, clasificarArticulo, medidaArticulo, columnasOficina, leerListadoOficina, nombreUbicacion, totalesPorArticulo, unidadesPorArticulo, conciliarStock, articulosParaPedir, pedidosCumplidos, aplicarMovimiento, filasDelListado, numStock: num };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else Object.assign(raiz, api);
})(typeof window !== "undefined" ? window : globalThis);
