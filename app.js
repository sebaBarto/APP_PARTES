// ==== CONFIGURACIÓN — completar antes de publicar ====

// Versión de la app — sube con cada actualización (3.0.0 -> 3.0.1 ->
// ... -> 3.0.9 -> 3.1.0 -> ...), para poder verificar a simple vista
// que un celular tiene la última versión.
const APP_VERSION = "3.147.0";

// Si el celular quedó con un index.html viejo (de antes de los Ajustes) y
// un app.js nuevo, faltan elementos y la app se rompe a mitad de carga.
// Se detecta acá, antes de todo: se borran los cachés y se recarga una vez.
if (!document.getElementById("ajustesBtn") && !sessionStorage.getItem("recarga_html_viejo")) {
  try { sessionStorage.setItem("recarga_html_viejo", "1"); } catch (e) { /* sin sessionStorage */ }
  Promise.all([
    window.caches ? caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))) : null,
    navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister()))) : null,
  ].filter(Boolean)).catch(() => {}).then(() => location.reload());
  throw new Error("index.html desactualizado: recargando");
}

// Clave pública de notificaciones push (VAPID) — es pública a
// propósito, no es un secreto (la privada vive solo en Vercel).
const VAPID_PUBLIC_KEY = "BHqngzDxmtV7PiUQO0zMKMaysybsccUB1ibD6UK7Kj2G0EICqt6ET-4RFV9mBU4PSxD10I6krHzrIFB2Ndxq_60";

// ---------- Estilo global de los gráficos (Chart.js) ----------
// Un solo lugar para que todos los gráficos de la app compartan la
// misma tipografía y paleta, en vez de que cada uno defina la suya.
if (typeof Chart !== "undefined") {
  if (typeof ChartDataLabels !== "undefined") Chart.register(ChartDataLabels);
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = "#6B7680";
  Chart.defaults.plugins.tooltip.backgroundColor = "#101820";
  Chart.defaults.plugins.tooltip.titleFont = { family: "'Space Grotesk', sans-serif", weight: "600" };
  Chart.defaults.plugins.tooltip.bodyFont = { family: "'IBM Plex Mono', monospace" };
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.displayColors = true;
  Chart.defaults.plugins.legend.labels.font = { family: "'Inter', system-ui, sans-serif", size: 11 };
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.padding = 12;
  Chart.defaults.plugins.title.font = { family: "'Space Grotesk', sans-serif", size: 13, weight: "600" };
  Chart.defaults.plugins.title.color = "#101820";
  Chart.defaults.plugins.title.padding = { bottom: 12 };
  // Por defecto apagado — se prende explícitamente solo en los
  // gráficos de torta/dona, donde sí aporta (ver DATALABELS_PORCENTAJE).
  if (typeof ChartDataLabels !== "undefined") Chart.defaults.set("plugins.datalabels", { display: false });
}

// Skin nuevo: los gráficos toman los colores del tema (texto, grilla, series oscuras).
// En el skin clásico solo actúa en modo noche.
if (typeof Chart !== "undefined") {
  Chart.register({
    id: "temaNuevo",
    afterDestroy(chart) {
      try { chart.canvas.parentElement.classList.remove("con-grafico"); } catch (e) { /* ya no está */ }
    },
    beforeInit(chart) {
      try { chart.canvas.parentElement.classList.add("con-grafico"); } catch (e) { /* sin padre */ }
      const raiz = document.documentElement;
      // Skin nuevo: siempre. Skin clásico: solo en modo noche, para que los
      // títulos y ejes no queden oscuros sobre fondo oscuro.
      if (raiz.dataset.inicio !== "nuevo" && raiz.dataset.theme !== "night") return;
      const claro = raiz.dataset.theme === "day" || raiz.dataset.theme === "contraste";
      const fg = claro ? "#101820" : "#E8ECEF";
      const mut = claro ? "#4A5F6E" : "#9FB3C2";
      const grilla = claro ? "rgba(16,24,32,0.10)" : "rgba(255,255,255,0.10)";
      const fondo = claro ? "#FFFFFF" : "#17212B";
      const co = chart.config.options = chart.config.options || {};
      co.plugins = co.plugins || {};
      co.plugins.title = Object.assign({}, co.plugins.title, { color: fg });
      const leg = co.plugins.legend = Object.assign({}, co.plugins.legend);
      leg.labels = Object.assign({}, leg.labels, { color: fg });
      const dl = co.plugins.datalabels;
      if (dl && typeof dl.color === "string" && dl.color.toLowerCase() === "#101820") co.plugins.datalabels = Object.assign({}, dl, { color: fg });
      const tipo = chart.config.type;
      if (tipo === "bar" || tipo === "line") {
        co.scales = co.scales || {};
        ["x", "y"].forEach((eje) => {
          const sc = co.scales[eje] = Object.assign({}, co.scales[eje]);
          if (eje === "y" && tipo === "bar" && !sc.grace) sc.grace = "12%"; // (el default resuelto es 0)
          sc.ticks = Object.assign({}, sc.ticks, { color: mut });
          sc.grid = Object.assign({}, sc.grid, { color: grilla });
          sc.border = Object.assign({}, sc.border, { color: grilla });
        });
      }
      const nuevo = raiz.dataset.inicio === "nuevo";
      if (nuevo) {
        // Identidad SAT: Barlow en los gráficos.
        const fTit = { family: "'Barlow Semi Condensed', 'Barlow', sans-serif", weight: "700", size: 16 };
        co.plugins.title = Object.assign({}, co.plugins.title, { font: fTit });
        leg.labels = Object.assign({}, leg.labels, { font: { family: "'Barlow', sans-serif", size: 13 } });
        if (co.scales) Object.values(co.scales).forEach((sc) => { sc.ticks = Object.assign({}, sc.ticks, { font: { family: "'Barlow', sans-serif", size: 12 } }); });
      }
      // Skin nuevo: una sola serie va en el amarillo SAT (de día, un ocre que
      // se lee sobre blanco); las barras finas con la punta redondeada.
      const acento = claro ? "#B87F00" : "#FFC033";
      const lavado = claro ? "rgba(184,127,0,0.10)" : "rgba(255,192,51,0.10)";
      if (nuevo) {
        co.locale = "es-AR"; // 50.000 y no 50,000
        const horizontal = co.indexAxis === "y";
        if (tipo === "line" && co.scales && co.scales.x) co.scales.x.grid = Object.assign({}, co.scales.x.grid, { display: false });
        if (tipo === "bar" && co.scales) {
          const ejeCat = horizontal ? "y" : "x";
          if (co.scales[ejeCat]) co.scales[ejeCat].grid = Object.assign({}, co.scales[ejeCat].grid, { display: false });
        }
        (chart.config.data.datasets || []).forEach((ds) => {
          if (tipo === "bar") { ds.borderRadius = 4; ds.borderSkipped = "start"; ds.maxBarThickness = 24; }
          if (tipo === "line") { ds.borderWidth = 2; ds.pointHoverRadius = 5; if (ds.pointRadius === undefined || (chart.config.data.labels || []).length > 15) ds.pointRadius = 0; }
        });
      }
      const remapear = (c) => {
        if (typeof c !== "string") return c;
        if (nuevo && ["#F5A623", "#2E7D32"].includes(c.toUpperCase())) return acento;
        if (nuevo && c.toLowerCase() === "#101820" && tipo === "line") return acento;
        if (nuevo && c === "rgba(16,24,32,0.1)") return lavado;
        if (claro) return c;
        if (c.toLowerCase() === "#2e7d32") return "#5FD08A";
        if (c.toLowerCase() === "#101820") return (chart.config.type === "doughnut" || chart.config.type === "pie") ? (nuevo ? "#8A857C" : "#6F8CA0") : (nuevo ? "#EEECE7" : "#E8ECEF");
        if (c === "rgba(16,24,32,0.1)") return "rgba(232,236,239,0.14)";
        return c;
      };
      (chart.config.data.datasets || []).forEach((ds) => {
        ds.borderColor = Array.isArray(ds.borderColor) ? ds.borderColor.map(remapear) : remapear(ds.borderColor);
        ds.backgroundColor = Array.isArray(ds.backgroundColor) ? ds.backgroundColor.map(remapear) : remapear(ds.backgroundColor);
        if (tipo === "doughnut" || tipo === "pie") { ds.borderColor = fondo; ds.borderWidth = 2; }
      });
    },
  });
}

// Config de porcentaje reutilizable para los gráficos de torta — la
// guía de UX de gráficos recomienda siempre mostrar el % en la propia
// torta, no solo al pasar el mouse/dedo (accesibilidad).
const DATALABELS_PORCENTAJE = {
  color: (ctx) => {
    const bg = ctx.dataset.backgroundColor;
    const color = Array.isArray(bg) ? bg[ctx.dataIndex] : bg;
    // Texto oscuro sobre colores claros (ámbar, verdes claros), texto
    // blanco sobre colores oscuros (navy, rojos) — así siempre se lee bien.
    const clarosConocidos = ["#F5A623", "#FFD98E", "#3FAE6E", "#2E7D32", "#E8ECEF"];
    return clarosConocidos.includes((color || "").toUpperCase()) ? "#101820" : "#FFFFFF";
  },
  font: { family: "'Space Grotesk', sans-serif", weight: "700", size: 12 },
  formatter: (valor, ctx) => {
    const total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + (Number(b) || 0), 0);
    if (!total || !valor) return "";
    const pct = (valor / total) * 100;
    return pct < 6 ? "" : Math.round(pct) + "%";
  },
};


// Contraseña propia por técnico (se valida en el propio celular, no es
// un login con servidor — solo para que no cualquiera que abra la URL
// pueda cargar partes, y para saber quién entró y autocompletar el
// campo "Técnico"). Los nombres tienen que coincidir EXACTO con las
// opciones del selector de técnico en index.html.
// Lista de técnicos y contraseñas — se administra desde admin.html
// (pestaña "Técnicos"), no hace falta editar este archivo para agregar,
// sacar o cambiar la clave de un técnico. Esto de acá abajo es solo un
// respaldo de arranque: se usa si todavía nunca se guardó nada desde
// admin.html, o si no hay conexión la primera vez que se abre la app.
// Lista de técnicos de respaldo — solo para poder mostrar el
// desplegable de "elegí tu usuario" si todavía no se pudo conectar al
// servidor. Ya NO guarda contraseñas acá (antes las tenía, en texto
// plano, visibles para cualquiera que abriera el código — la
// verificación de contraseña ahora es siempre contra el servidor,
// nunca comparando localmente).
const TECNICOS_PASSWORDS_RESPALDO = {
  "Marcos Torres": "",
  "Cristian Rossetti": "",
  "Rodrigo Bertorello": "",
  "Guillermo Bertorello": "",
  "Marcos Pellegrini": "",
  "Sebastian Bartolozzi": "",
  "Alfredo Thiesing": "",
};

// URL desde donde se descarga el listado de servicios pendientes.
// Es un endpoint propio (función serverless de Vercel, ver /api/servicios.js)
// que guarda los datos en un repo privado — nunca queda como archivo
// público. No hace falta tocar esta línea si el endpoint vive en el
// mismo dominio que la app (caso normal).
const SERVICIOS_URL = "/api/servicios";

// Pase personal de la sesión: lo entrega el servidor al entrar con la
// contraseña o la huella (ver lib/sesion.js), y se manda en cada pedido.
// Ya NO hay ninguna clave fija escrita en el código de la app.
let SERVICIOS_API_TOKEN = (() => { try { return localStorage.getItem("sat_api_sesion") || ""; } catch (e) { return ""; } })();
function guardarPaseApi(pase) {
  SERVICIOS_API_TOKEN = pase || "";
  try {
    if (pase) localStorage.setItem("sat_api_sesion", pase);
    else localStorage.removeItem("sat_api_sesion");
  } catch (e) { /* sin almacenamiento: dura mientras la app esté abierta */ }
}
// Si el servidor dice que el pase no vale (venció, o se cambió la clave
// del servidor), se pide entrar de nuevo. Lo que esté en la cola de
// envíos queda guardado y sale solo después de volver a entrar.
let avisoSesionVencidaMostrado = false;
const fetchOriginalSat = window.fetch.bind(window);
window.fetch = async (...args) => {
  const r = await fetchOriginalSat(...args);
  try {
    const url = String((args[0] && args[0].url) || args[0] || "");
    if (r.status === 401 && url.includes("/api/") && !url.includes("/api/foto?id=")) sesionVencida();
  } catch (e) { /* nada */ }
  return r;
};
function sesionVencida() {
  if (typeof tecnicoLogueado === "undefined") return;
  const enTrabajo = typeof PANTALLAS_DE_TRABAJO !== "undefined" && Object.entries(screens).some(([n, s]) => s.dataset.active === "true" && PANTALLAS_DE_TRABAJO.includes(n));
  if (enTrabajo) {
    // No se le corta lo que está haciendo: se avisa y lo que mande queda en la cola.
    if (!avisoSesionVencidaMostrado) showToast("Tu sesión venció: lo que envíes queda guardado. Al terminar, cerrá sesión y volvé a entrar.");
    avisoSesionVencidaMostrado = true;
    return;
  }
  // Se cierran los carteles abiertos (ej.: detalle del parte) para que se vea el login.
  document.querySelectorAll('[id$="ModalOverlay"], .modal-overlay').forEach((el) => el.classList.add("hidden"));
  if (screens.login.dataset.active === "true") return;
  guardarPaseApi("");
  borrarSesion();
  tecnicoLogueado = "";
  showScreen("login");
  loginError.textContent = "Por seguridad, volvé a entrar con tu contraseña.";
}
// =======================================================

// ===== Registro de errores de la app =====
// Si algo falla en un celular (error de JavaScript o promesa rechazada),
// se manda un aviso discreto a /api/datos?coleccion=errores_app para
// verlo en admin.html > Errores. Tope por sesión y sin repetidos, y
// nunca puede romper la app: todo va envuelto en try/catch.
const ERRORES_MAX_POR_SESION = 5;
const erroresYaEnviados = new Set();
function registrarErrorApp(mensaje, origen, pila) {
  try {
    mensaje = String(mensaje || "").slice(0, 500);
    if (!mensaje || erroresYaEnviados.size >= ERRORES_MAX_POR_SESION) return;
    // Ruido típico que no es un fallo de la app
    if (/ResizeObserver loop|Script error\.?$|Load failed|Failed to fetch|NetworkError/i.test(mensaje)) return;
    const clave = mensaje + "|" + origen;
    if (erroresYaEnviados.has(clave)) return;
    erroresYaEnviados.add(clave);
    let pantalla = "";
    try { pantalla = pantallaActivaNombre(); } catch (e) { /* aún no cargó */ }
    let tecnico = "";
    try { tecnico = tecnicoLogueado || ""; } catch (e) { /* aún no cargó */ }
    fetch("/api/datos?coleccion=errores_app", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ mensaje, origen: origen || "", pila: pila || "", version: APP_VERSION, tecnico, pantalla, dispositivo: navigator.userAgent }),
      keepalive: true,
    }).catch(() => {});
  } catch (e) { /* el registro de errores jamás debe romper la app */ }
}
window.addEventListener("error", (ev) => {
  registrarErrorApp(ev.message, (ev.filename || "").split("/").pop() + ":" + (ev.lineno || 0) + ":" + (ev.colno || 0), ev.error && ev.error.stack);
});
window.addEventListener("unhandledrejection", (ev) => {
  const r = ev.reason;
  registrarErrorApp("Promesa rechazada: " + (r && r.message ? r.message : r), "promesa", r && r.stack);
});

// Manda un mail (copia a oficina o al cliente) por nuestro propio
// endpoint (/api/enviar-mail.js), que sale por SMTP directo desde la
// casilla propia de la empresa — reemplaza a EmailJS, que tenía un
// límite mensual de envíos.
async function enviarMail(tipo, datos) {
  const res = await fetch("/api/enviar-mail", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
    body: JSON.stringify({ tipo, datos }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const mensaje = data.error || `Error HTTP ${res.status}`;
    throw new Error(data.detail ? `${mensaje}: ${data.detail}` : mensaje);
  }
  return data;
}

const screens = {
  login: document.getElementById("screen-login"),
  home: document.getElementById("screen-home"),
  serviciosMenu: document.getElementById("screen-servicios-menu"),
  dashboardsMenu: document.getElementById("screen-dashboards-menu"),
  list: document.getElementById("screen-list"),
  cronograma: document.getElementById("screen-cronograma"),
  mapa: document.getElementById("screen-mapa"),
  dashboard: document.getElementById("screen-dashboard"),
  dashboardFinanciero: document.getElementById("screen-dashboard-financiero"),
  dashboardVehiculos: document.getElementById("screen-dashboard-vehiculos"),
  dashboardHerramientas: document.getElementById("screen-dashboard-herramientas"),
  dashboardSims: document.getElementById("screen-dashboard-sims"),
  consultas: document.getElementById("screen-consultas"),
  guardias: document.getElementById("screen-guardias"),
  historial: document.getElementById("screen-historial"),
  notas: document.getElementById("screen-notas"),
  stock: document.getElementById("screen-stock"),
  credencial: document.getElementById("screen-credencial"),
  vehiculos: document.getElementById("screen-vehiculos"),
  vehiculoDetalle: document.getElementById("screen-vehiculo-detalle"),
  sims: document.getElementById("screen-sims"),
  simDetalle: document.getElementById("screen-sim-detalle"),
  simRegistro: document.getElementById("screen-sim-registro"),
  planos: document.getElementById("screen-planos"),
  emergencia: document.getElementById("screen-emergencia"),
  herramientas: document.getElementById("screen-herramientas"),
  presencia: document.getElementById("screen-presencia"),
  instalacion: document.getElementById("screen-instalacion"),
  herramientaDetalle: document.getElementById("screen-herramienta-detalle"),
  comodatoForm: document.getElementById("screen-comodato-form"),
  comodatoFirma: document.getElementById("screen-comodato-firma"),
  rendicion: document.getElementById("screen-rendicion"),
  ajustes: document.getElementById("screen-ajustes"),
  fichaCliente: document.getElementById("screen-ficha-cliente"),
  form: document.getElementById("screen-form"),
  claves: document.getElementById("screen-claves"),
  sign: document.getElementById("screen-sign"),
  sending: document.getElementById("screen-sending"),
  done: document.getElementById("screen-done"),
};
const statusPill = document.getElementById("statusPill");
const toastEl = document.getElementById("toast");
const loginBtn = document.getElementById("loginBtn");
const actualizarAppBtn = document.getElementById("actualizarAppBtn");
const actualizarAppStatus = document.getElementById("actualizarAppStatus");
const nuevaVersionAviso = document.getElementById("nuevaVersionAviso");
const loginTecnicoSelect = document.getElementById("loginTecnicoSelect");
const loginPassword = document.getElementById("loginPassword");
const loginHuellaWrap = document.getElementById("loginHuellaWrap");
const loginHuellaBtn = document.getElementById("loginHuellaBtn");
const loginPasswordWrap = document.getElementById("loginPasswordWrap");
const loginUsarPasswordLink = document.getElementById("loginUsarPasswordLink");

// Botón de "ojito" para mostrar/ocultar contraseña — reutilizable en
// cualquier campo de este tipo. Arranca siempre oculta por defecto.
const OJO_ABIERTO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const OJO_CERRADO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M3 3l18 18"/><path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7c1.5 0 2.8-.3 4-.8"/><path d="M9.5 9.5a3 3 0 0 0 4.2 4.2"/></svg>';
function habilitarOjitoContrasena(inputEl, btnEl) {
  btnEl.addEventListener("click", () => {
    const oculta = inputEl.type === "password";
    inputEl.type = oculta ? "text" : "password";
    btnEl.innerHTML = oculta ? OJO_CERRADO_SVG : OJO_ABIERTO_SVG;
    btnEl.classList.toggle("activo", oculta);
  });
}
habilitarOjitoContrasena(loginPassword, document.getElementById("loginPasswordToggle"));
const loginError = document.getElementById("loginError");
document.getElementById("appVersion").textContent = "v" + APP_VERSION;
const refreshServiciosBtn = document.getElementById("refreshServiciosBtn");
const manualReportBtn = document.getElementById("manualReportBtn");
const syncLabel = document.getElementById("syncLabel");
const listStatus = document.getElementById("listStatus");
const serviciosListEl = document.getElementById("serviciosList");
const serviciosSearch = document.getElementById("serviciosSearch");
const colaEnviosBanner = document.getElementById("colaEnviosBanner");
const colaEnviosTexto = document.getElementById("colaEnviosTexto");
const reintentarColaBtn = document.getElementById("reintentarColaBtn");
const verCronogramaBtn = document.getElementById("verCronogramaBtn");
const volverDeCronogramaBtn = document.getElementById("volverDeCronogramaBtn");
const refreshCronogramaBtn = document.getElementById("refreshCronogramaBtn");
const cronoSyncLabel = document.getElementById("cronoSyncLabel");
const cronoDiasTabs = document.getElementById("cronoDiasTabs");
const cronoTecnicoFiltro = document.getElementById("cronoTecnicoFiltro");
const cronoStatus = document.getElementById("cronoStatus");
const cronoTareasList = document.getElementById("cronoTareasList");
const tecnicoSelect = document.getElementById("f_tecnico");
const tecnicoOtro = document.getElementById("f_tecnico_otro");
const dosTecnicosCheck = document.getElementById("f_dos_tecnicos");
const segundoTecnicoWrap = document.getElementById("segundoTecnicoWrap");
const tecnicoSelect2 = document.getElementById("f_tecnico2");
const tecnicoOtro2 = document.getElementById("f_tecnico2_otro");
const importeInput = document.getElementById("f_importe");
const descuentoRadios = document.getElementsByName("f_descuento_tipo");
const descuentoOtroPct = document.getElementById("f_descuento_otro_pct");
const numeroPresupuestoInput = document.getElementById("f_numero_presupuesto");
const costoFinalInput = document.getElementById("f_costo_final");
const formaPagoChecks = document.getElementsByName("f_forma_pago");
const backToListBtn = document.getElementById("backToListBtn");
const instalacionCheck = document.getElementById("f_instalacion");
const fotoInputCamara = document.getElementById("f_foto_camara");
const fotoInputGaleria = document.getElementById("f_foto_galeria");
const fotoCamaraBtn = document.getElementById("fotoCamaraBtn");
const fotoGaleriaBtn = document.getElementById("fotoGaleriaBtn");
const fotoPreviewWrap = document.getElementById("fotoPreviewWrap");
const fotoPreview = document.getElementById("fotoPreview");
const quitarFotoBtn = document.getElementById("quitarFotoBtn");
const fotoStatus = document.getElementById("fotoStatus");
const verMapaBtn = document.getElementById("verMapaBtn");
const volverDeMapaBtn = document.getElementById("volverDeMapaBtn");
const llamarClienteBtn = document.getElementById("llamarClienteBtn");
const verDashboardBtn = document.getElementById("verDashboardBtn");
const volverDeDashboardBtn = document.getElementById("volverDeDashboardBtn");
const dashStatus = document.getElementById("dashStatus");
const dashPendientesNum = document.getElementById("dashPendientesNum");
const dashResueltosNum = document.getElementById("dashResueltosNum");
const dashInstalacionesNum = document.getElementById("dashInstalacionesNum");
const dashServiciosNum = document.getElementById("dashServiciosNum");
const dashEstancadosNum = document.getElementById("dashEstancadosNum");
const dashResueltosDelta = document.getElementById("dashResueltosDelta");
const dashInstalacionesDelta = document.getElementById("dashInstalacionesDelta");
const dashServiciosDelta = document.getElementById("dashServiciosDelta");
const dashTiempoPromedioNum = document.getElementById("dashTiempoPromedioNum");
const dashTecnicosList = document.getElementById("dashTecnicosList");
const dashRepetidosList = document.getElementById("dashRepetidosList");
const sugerenciasWrap = document.getElementById("sugerenciasWrap");
const vehiculoRecordatorioWrap = document.getElementById("vehiculoRecordatorioWrap");
const vehiculoRecordatorioOkBtn = document.getElementById("vehiculoRecordatorioOkBtn");
const vehiculoRecordatorioIrBtn = document.getElementById("vehiculoRecordatorioIrBtn");
const sugerenciasList = document.getElementById("sugerenciasList");
const refreshDashboardBtn = document.getElementById("refreshDashboardBtn");
const dashSyncLabel = document.getElementById("dashSyncLabel");
const verDashboardFinancieroBtn = document.getElementById("verDashboardFinancieroBtn");
const descargarExcelDashboardBtn = document.getElementById("descargarExcelDashboardBtn");
const descargarExcelDashboardFinBtn = document.getElementById("descargarExcelDashboardFinBtn");
const panelSaludo = document.getElementById("panelSaludo");
const activarNotificacionesBtn = document.getElementById("activarNotificacionesBtn");
const cerrarSesionBtn = document.getElementById("cerrarSesionBtn");
const abrirAdminBtn = document.getElementById("abrirAdminBtn");
const tileServiciosBtn = document.getElementById("tileServiciosBtn");
const tileDashboardsBtn = document.getElementById("tileDashboardsBtn");
const tileGuardiasBtn = document.getElementById("tileGuardiasBtn");
const tileHistorialBtn = document.getElementById("tileHistorialBtn");
const tileCredencialBtn = document.getElementById("tileCredencialBtn");
const tileVehiculosBtn = document.getElementById("tileVehiculosBtn");
const tileSimsBtn = document.getElementById("tileSimsBtn");
const tileHerramientasBtn = document.getElementById("tileHerramientasBtn");
const tileInstaladorBtn = document.getElementById("tileInstaladorBtn");
const volverDeInstalacionBtn = document.getElementById("volverDeInstalacionBtn");
const instalacionClienteInput = document.getElementById("instalacionClienteInput");
const instalacionDireccionInput = document.getElementById("instalacionDireccionInput");
const instalacionClienteEmailInput = document.getElementById("instalacionClienteEmailInput");
const instalacionIniciarBtn = document.getElementById("instalacionIniciarBtn");
const instalacionClienteCard = document.getElementById("instalacionClienteCard");
const instalacionDetalleWrap = document.getElementById("instalacionDetalleWrap");
const instalacionActivaTexto = document.getElementById("instalacionActivaTexto");
const instZonaNumeroInput = document.getElementById("instZonaNumeroInput");
const instZonaDescripcionInput = document.getElementById("instZonaDescripcionInput");
const agregarZonaBtn = document.getElementById("agregarZonaBtn");
const instZonasList = document.getElementById("instZonasList");
const guardarZonasBtn = document.getElementById("guardarZonasBtn");
const instCanalNumeroInput = document.getElementById("instCanalNumeroInput");
const instCanalDescripcionInput = document.getElementById("instCanalDescripcionInput");
const agregarCanalBtn = document.getElementById("agregarCanalBtn");
const instCanalesList = document.getElementById("instCanalesList");
const guardarCanalesBtn = document.getElementById("guardarCanalesBtn");
const instFotoInput = document.getElementById("instFotoInput");
const instFotosStatus = document.getElementById("instFotosStatus");
const instFotosGrid = document.getElementById("instFotosGrid");
const instalacionesAbiertasParaSumarseWrap = document.getElementById("instalacionesAbiertasParaSumarseWrap");
const instalacionesAbiertasParaSumarseList = document.getElementById("instalacionesAbiertasParaSumarseList");
const instObservacionesInput = document.getElementById("instObservacionesInput");
const volverDePresenciaBtn = document.getElementById("volverDePresenciaBtn");
const presenciaEstadoTexto = document.getElementById("presenciaEstadoTexto");
const presenciaLlegadaWrap = document.getElementById("presenciaLlegadaWrap");
const presenciaSalidaWrap = document.getElementById("presenciaSalidaWrap");
const presenciaClienteInput = document.getElementById("presenciaClienteInput");
const presenciaClienteEncontradoInfo = document.getElementById("presenciaClienteEncontradoInfo");
const presenciaDireccionInput = document.getElementById("presenciaDireccionInput");
const presenciaMarcarLlegadaBtn = document.getElementById("presenciaMarcarLlegadaBtn");
const presenciaMarcarSalidaBtn = document.getElementById("presenciaMarcarSalidaBtn");
const refreshPresenciaBtn = document.getElementById("refreshPresenciaBtn");
const presenciaSyncLabel = document.getElementById("presenciaSyncLabel");
const presenciaFechaEspecificaWrap = document.getElementById("presenciaFechaEspecificaWrap");
const presenciaFechaEspecifica = document.getElementById("presenciaFechaEspecifica");
const presenciaHistorialStatus = document.getElementById("presenciaHistorialStatus");
const presenciaHistorialList = document.getElementById("presenciaHistorialList");
const tileComodatoBtn = document.getElementById("tileComodatoBtn");
const tilePlanosBtn = document.getElementById("tilePlanosBtn");
const tileEmergenciaBtn = document.getElementById("tileEmergenciaBtn");
const volverDeEmergenciaBtn = document.getElementById("volverDeEmergenciaBtn");
const cargarEmergenciaBtn = document.getElementById("cargarEmergenciaBtn");
const verOcupacionSemanaBtn = document.getElementById("verOcupacionSemanaBtn");
const ocupacionSemanaWrap = document.getElementById("ocupacionSemanaWrap");
const ocupacionSemanaStatus = document.getElementById("ocupacionSemanaStatus");
const ocupacionSemanaList = document.getElementById("ocupacionSemanaList");
const emergenciaLista = document.getElementById("emergenciaLista");
const emergenciaListaStatus = document.getElementById("emergenciaListaStatus");
const cronoEmergenciasWrap = document.getElementById("cronoEmergenciasWrap");
const cronoEmergenciasLista = document.getElementById("cronoEmergenciasLista");
const volverDePlanosBtn = document.getElementById("volverDePlanosBtn");
const planosBuscarInput = document.getElementById("planosBuscarInput");
const planosStatus = document.getElementById("planosStatus");
const planosResultados = document.getElementById("planosResultados");
const comFDNombre = document.getElementById("comFDNombre");
const comFDDireccion = document.getElementById("comFDDireccion");
const comFDCiudad = document.getElementById("comFDCiudad");
const comFDRepresentado = document.getElementById("comFDRepresentado");
const comFDOtroRepresentanteCheck = document.getElementById("comFDOtroRepresentanteCheck");
const comFDClienteEmail = document.getElementById("comFDClienteEmail");
const comBienCategoriaSelect = document.getElementById("comBienCategoriaSelect");
const comBienModeloSelect = document.getElementById("comBienModeloSelect");
const comBienCantidadInput = document.getElementById("comBienCantidadInput");
const comBienAgregarBtn = document.getElementById("comBienAgregarBtn");
const comBienesAgregadosList = document.getElementById("comBienesAgregadosList");
const comFDOtroArticulo = document.getElementById("comFDOtroArticulo");
const comFDAbono = document.getElementById("comFDAbono");
const comVolverListaBtn = document.getElementById("comVolverListaBtn");
const comContinuarFirmaBtn = document.getElementById("comContinuarFirmaBtn");
const comodatoSignCanvas = document.getElementById("comodatoSignCanvas");
const comClearSignBtn = document.getElementById("comClearSignBtn");
const comFDAclaracion = document.getElementById("comFDAclaracion");
const comFDCargo = document.getElementById("comFDCargo");
const comFDDni = document.getElementById("comFDDni");
const comodatoEnviandoAviso = document.getElementById("comodatoEnviandoAviso");
const comVolverFormBtn = document.getElementById("comVolverFormBtn");
const comConfirmarFirmaBtn = document.getElementById("comConfirmarFirmaBtn");
const herramientasListaStatus = document.getElementById("herramientasListaStatus");
const herramientasPanelTiles = document.getElementById("herramientasPanelTiles");
const volverDeHerramientasBtn = document.getElementById("volverDeHerramientasBtn");
const herramientaDetalleNombre = document.getElementById("herramientaDetalleNombre");
const herramientaDetalleStatus = document.getElementById("herramientaDetalleStatus");
const herramientaSoloLecturaInfo = document.getElementById("herramientaSoloLecturaInfo");
const herramientaTomarWrap = document.getElementById("herramientaTomarWrap");
const herramientaTomarBtn = document.getElementById("herramientaTomarBtn");
const herramientaEnUsoWrap = document.getElementById("herramientaEnUsoWrap");
const herramientaDevolverBtn = document.getElementById("herramientaDevolverBtn");
const herramientaDevolverObservacion = document.getElementById("herramientaDevolverObservacion");
const herramientaClienteInput = document.getElementById("herramientaClienteInput");
const herramientaDejarEnClienteBtn = document.getElementById("herramientaDejarEnClienteBtn");
const herramientaTecnicoNuevoSelect = document.getElementById("herramientaTecnicoNuevoSelect");
const herramientaTransferirBtn = document.getElementById("herramientaTransferirBtn");
const herramientaEnClienteWrap = document.getElementById("herramientaEnClienteWrap");
const herramientaRetirarBtn = document.getElementById("herramientaRetirarBtn");
const volverDeHerramientaDetalleBtn = document.getElementById("volverDeHerramientaDetalleBtn");
const volverDeSimsBtn = document.getElementById("volverDeSimsBtn");
const irARegistroSimsBtn = document.getElementById("irARegistroSimsBtn");
const volverDeSimRegistroBtn = document.getElementById("volverDeSimRegistroBtn");
const simRegistroBuscarInput = document.getElementById("simRegistroBuscarInput");
const simRegistroStatus = document.getElementById("simRegistroStatus");
const simRegistroResultados = document.getElementById("simRegistroResultados");
const simsListaStatus = document.getElementById("simsListaStatus");
const simsGrupos = document.getElementById("simsGrupos");
const volverDeSimDetalleBtn = document.getElementById("volverDeSimDetalleBtn");
const simDetalleNombre = document.getElementById("simDetalleNombre");
const simDetalleStatus = document.getElementById("simDetalleStatus");
const simSoloLecturaInfo = document.getElementById("simSoloLecturaInfo");
const simUsarWrap = document.getElementById("simUsarWrap");
const simClienteInput = document.getElementById("simClienteInput");
const simClienteEncontradoInfo = document.getElementById("simClienteEncontradoInfo");
const simUsarBtn = document.getElementById("simUsarBtn");
const simReemplazoWrap = document.getElementById("simReemplazoWrap");
const simReemplazoMensaje = document.getElementById("simReemplazoMensaje");
const simReemplazarBtn = document.getElementById("simReemplazarBtn");
const simAgregarSegundaBtn = document.getElementById("simAgregarSegundaBtn");
const simCancelarReemplazoBtn = document.getElementById("simCancelarReemplazoBtn");
const simDevolverWrap = document.getElementById("simDevolverWrap");
const simDevolverBtn = document.getElementById("simDevolverBtn");
const simTransferirWrap = document.getElementById("simTransferirWrap");
const simRevertirWrap = document.getElementById("simRevertirWrap");
const simRevertirBtn = document.getElementById("simRevertirBtn");
const simTecnicoNuevoSelect = document.getElementById("simTecnicoNuevoSelect");
const simTransferirBtn = document.getElementById("simTransferirBtn");
const simEstadoFisicoWrap = document.getElementById("simEstadoFisicoWrap");
const simEstadoFisicoActual = document.getElementById("simEstadoFisicoActual");
const simMarcarDefectuosaBtn = document.getElementById("simMarcarDefectuosaBtn");
const simMarcarExtraviadaBtn = document.getElementById("simMarcarExtraviadaBtn");
const simMarcarDisponibleBtn = document.getElementById("simMarcarDisponibleBtn");
const simsTransferenciasPendientesWrap = document.getElementById("simsTransferenciasPendientesWrap");
const simsTransferenciasPendientesList = document.getElementById("simsTransferenciasPendientesList");
const volverDeVehiculosBtn = document.getElementById("volverDeVehiculosBtn");
const vehiculosListaStatus = document.getElementById("vehiculosListaStatus");
const vehiculosPanelTiles = document.getElementById("vehiculosPanelTiles");
const volverDeVehiculoDetalleBtn = document.getElementById("volverDeVehiculoDetalleBtn");
const vehiculoDetalleNombre = document.getElementById("vehiculoDetalleNombre");
const vehiculoDetalleStatus = document.getElementById("vehiculoDetalleStatus");
const vehiculoAlertasWrap = document.getElementById("vehiculoAlertasWrap");
const vehiculoTomarWrap = document.getElementById("vehiculoTomarWrap");
const vehiculoHoraToma = document.getElementById("vehiculoHoraToma");
const vehiculoTomarBtn = document.getElementById("vehiculoTomarBtn");
const vehiculoDevolverWrap = document.getElementById("vehiculoDevolverWrap");
const vehiculoEventoSinDevolverWrap = document.getElementById("vehiculoEventoSinDevolverWrap");
const vehiculoTipoEventoSelect = document.getElementById("vehiculoTipoEventoSelect");
const vehiculoEventoKm = document.getElementById("vehiculoEventoKm");
const vehiculoEventoMonto = document.getElementById("vehiculoEventoMonto");
const vehiculoEventoDetalleTexto = document.getElementById("vehiculoEventoDetalleTexto");
const vehiculoRegistrarEventoBtn = document.getElementById("vehiculoRegistrarEventoBtn");
const vehiculoEnUsoInfo = document.getElementById("vehiculoEnUsoInfo");
const vehiculoHoraDevolucion = document.getElementById("vehiculoHoraDevolucion");
const vehiculoKmDevolucion = document.getElementById("vehiculoKmDevolucion");
const vehiculoEvento = document.getElementById("vehiculoEvento");
const vehiculoEventoDetalleWrap = document.getElementById("vehiculoEventoDetalleWrap");
const vehiculoEventoDetalle = document.getElementById("vehiculoEventoDetalle");
const vehiculoDevolverBtn = document.getElementById("vehiculoDevolverBtn");
const vehiculoForzarLiberarBtn = document.getElementById("vehiculoForzarLiberarBtn");
const volverDeCredencialBtn = document.getElementById("volverDeCredencialBtn");
const credencialStatus = document.getElementById("credencialStatus");
const credencialCardWrap = document.getElementById("credencialCardWrap");
const credencialFoto = document.getElementById("credencialFoto");
const credencialNombre = document.getElementById("credencialNombre");
const credencialCargo = document.getElementById("credencialCargo");
const credencialDni = document.getElementById("credencialDni");
const credencialTelefono = document.getElementById("credencialTelefono");
const credencialVigencia = document.getElementById("credencialVigencia");
const credencialSerial = document.getElementById("credencialSerial");
const credencialQr = document.getElementById("credencialQr");
const credencialFullscreenBackdrop = document.getElementById("credencialFullscreenBackdrop");
const volverDeHistorialBtn = document.getElementById("volverDeHistorialBtn");
const refreshHistorialBtn = document.getElementById("refreshHistorialBtn");
const historialSyncLabel = document.getElementById("historialSyncLabel");
const historialStatus = document.getElementById("historialStatus");
const historialList = document.getElementById("historialList");
const parteDetalleModalOverlay = document.getElementById("parteDetalleModalOverlay");
const parteDetalleModalStatus = document.getElementById("parteDetalleModalStatus");
const parteDetalleModalContenido = document.getElementById("parteDetalleModalContenido");
const parteDetalleModalCerrarBtn = document.getElementById("parteDetalleModalCerrarBtn");
const historialModoLabel = document.getElementById("historialModoLabel");
const historialSearch = document.getElementById("historialSearch");
const historialPendientesBadge = document.getElementById("historialPendientesBadge");
const descargarExcelHistorialBtn = document.getElementById("descargarExcelHistorialBtn");
const historialSeleccionBar = document.getElementById("historialSeleccionBar");
const historialSeleccionarTodos = document.getElementById("historialSeleccionarTodos");
const historialMarcarSeleccionadosBtn = document.getElementById("historialMarcarSeleccionadosBtn");
const historialSeleccionCount = document.getElementById("historialSeleccionCount");
const historialFiltroTecnicoWrap = document.getElementById("historialFiltroTecnicoWrap");
const historialFiltroTecnico = document.getElementById("historialFiltroTecnico");
const verStockBtn = document.getElementById("verStockBtn");
const volverDeStockBtn = document.getElementById("volverDeStockBtn");
const refreshStockBtn = document.getElementById("refreshStockBtn");
const stockSyncLabel = document.getElementById("stockSyncLabel");
const stockStatus = document.getElementById("stockStatus");
const stockList = document.getElementById("stockList");
const stockFechaEspecificaWrap = document.getElementById("stockFechaEspecificaWrap");
const stockFechaEspecifica = document.getElementById("stockFechaEspecifica");
const stockSearch = document.getElementById("stockSearch");
const descargarExcelStockBtn = document.getElementById("descargarExcelStockBtn");
const stockSeleccionBar = document.getElementById("stockSeleccionBar");
const stockSeleccionarTodos = document.getElementById("stockSeleccionarTodos");
const stockMarcarSeleccionadosBtn = document.getElementById("stockMarcarSeleccionadosBtn");
const stockSeleccionCount = document.getElementById("stockSeleccionCount");
const volverDeGuardiasBtn = document.getElementById("volverDeGuardiasBtn");
const guardiaStatus = document.getElementById("guardiaStatus");
const guardiaActualWrap = document.getElementById("guardiaActualWrap");
const guardiaActualNombre = document.getElementById("guardiaActualNombre");
const guardiaLlamarBtn = document.getElementById("guardiaLlamarBtn");
const guardiaWhatsappBtn = document.getElementById("guardiaWhatsappBtn");
const guardiaProximosList = document.getElementById("guardiaProximosList");
const tileServiciosPendientesBtn = document.getElementById("tileServiciosPendientesBtn");
const volverDeServiciosMenuBtn = document.getElementById("volverDeServiciosMenuBtn");
const volverDeDashboardsMenuBtn = document.getElementById("volverDeDashboardsMenuBtn");
const volverDeServiciosBtn = document.getElementById("volverDeServiciosBtn");

tileServiciosBtn.addEventListener("click", () => showScreen("serviciosMenu"));
tileDashboardsBtn.addEventListener("click", () => showScreen("dashboardsMenu"));
tileServiciosPendientesBtn.addEventListener("click", () => showScreen("list"));
volverDeServiciosMenuBtn.addEventListener("click", () => showScreen("home"));
volverDeDashboardsMenuBtn.addEventListener("click", () => showScreen("home"));
tileInstaladorBtn.addEventListener("click", () => {
  showScreen("instalacion");
  verificarInstalacionAbierta();
});
volverDeServiciosBtn.addEventListener("click", () => showScreen("serviciosMenu"));
const verConsultasBtn = document.getElementById("verConsultasBtn");
const volverDeConsultasBtn = document.getElementById("volverDeConsultasBtn");
const consultaCategoriaSelect = document.getElementById("consultaCategoriaSelect");
const consultaManualesWrap = document.getElementById("consultaManualesWrap");
const consultaManualesStatus = document.getElementById("consultaManualesStatus");
const consultaManualesList = document.getElementById("consultaManualesList");
const consultaPreguntaInput = document.getElementById("consultaPreguntaInput");
const preguntarBtn = document.getElementById("preguntarBtn");
const consultaStatus = document.getElementById("consultaStatus");
const consultaRespuestaWrap = document.getElementById("consultaRespuestaWrap");
const consultaRespuestaTexto = document.getElementById("consultaRespuestaTexto");
const consultaManualesUsados = document.getElementById("consultaManualesUsados");
const volverDeDashboardFinancieroBtn = document.getElementById("volverDeDashboardFinancieroBtn");
const verDashboardVehiculosBtn = document.getElementById("verDashboardVehiculosBtn");
const volverDeDashboardVehiculosBtn = document.getElementById("volverDeDashboardVehiculosBtn");
const refreshDashVehiculosBtn = document.getElementById("refreshDashVehiculosBtn");
const dashVehiculosSyncLabel = document.getElementById("dashVehiculosSyncLabel");
const dashVehListaWrap = document.getElementById("dashVehListaWrap");
const dashVehDetalleWrap = document.getElementById("dashVehDetalleWrap");
const dashVehBuscarInput = document.getElementById("dashVehBuscarInput");
const dashVehListaStatus = document.getElementById("dashVehListaStatus");
const dashVehListaVehiculos = document.getElementById("dashVehListaVehiculos");
const dashVehVolverListaBtn = document.getElementById("dashVehVolverListaBtn");
const dashVehNombreSeleccionado = document.getElementById("dashVehNombreSeleccionado");
const dashVehGastoCombustibleTotalNum = document.getElementById("dashVehGastoCombustibleTotalNum");
const dashVehGastoMantenimientoTotalNum = document.getElementById("dashVehGastoMantenimientoTotalNum");
const dashVehFechaEspecificaWrap = document.getElementById("dashVehFechaEspecificaWrap");
const dashVehFechaEspecifica = document.getElementById("dashVehFechaEspecifica");
const dashVehGastoCombustibleNum = document.getElementById("dashVehGastoCombustibleNum");
const dashVehGastoMantenimientoNum = document.getElementById("dashVehGastoMantenimientoNum");
const descargarExcelVehiculosBtn = document.getElementById("descargarExcelVehiculosBtn");
const dashVehiculosStatus = document.getElementById("dashVehiculosStatus");
const dashVehiculosList = document.getElementById("dashVehiculosList");
const verDashboardHerramientasBtn = document.getElementById("verDashboardHerramientasBtn");
const volverDeDashboardHerramientasBtn = document.getElementById("volverDeDashboardHerramientasBtn");
const refreshDashHerramientasBtn = document.getElementById("refreshDashHerramientasBtn");
const dashHerramientasSyncLabel = document.getElementById("dashHerramientasSyncLabel");
const dashHerrListaWrap = document.getElementById("dashHerrListaWrap");
const dashHerrDetalleWrap = document.getElementById("dashHerrDetalleWrap");
const dashHerrBuscarInput = document.getElementById("dashHerrBuscarInput");
const dashHerrListaStatus = document.getElementById("dashHerrListaStatus");
const dashHerrListaHerramientas = document.getElementById("dashHerrListaHerramientas");
const dashHerrVolverListaBtn = document.getElementById("dashHerrVolverListaBtn");
const dashHerrNombreSeleccionado = document.getElementById("dashHerrNombreSeleccionado");
const dashHerrFechaEspecificaWrap = document.getElementById("dashHerrFechaEspecificaWrap");
const dashHerrFechaEspecifica = document.getElementById("dashHerrFechaEspecifica");
const descargarExcelHerramientasBtn = document.getElementById("descargarExcelHerramientasBtn");
const dashHerramientasStatus = document.getElementById("dashHerramientasStatus");
const dashHerramientasList = document.getElementById("dashHerramientasList");
const verDashboardSimsBtn = document.getElementById("verDashboardSimsBtn");
const volverDeDashboardSimsBtn = document.getElementById("volverDeDashboardSimsBtn");
const refreshDashSimsBtn = document.getElementById("refreshDashSimsBtn");
const dashSimsSyncLabel = document.getElementById("dashSimsSyncLabel");
const descargarExcelSimsDashBtn = document.getElementById("descargarExcelSimsDashBtn");
const blanquearHistorialSimsBtn = document.getElementById("blanquearHistorialSimsBtn");
const dashSimsStatus = document.getElementById("dashSimsStatus");
const dashSimsList = document.getElementById("dashSimsList");
const dashSimsChartsPorTecnico = document.getElementById("dashSimsChartsPorTecnico");
const dashSimsEnStockNum = document.getElementById("dashSimsEnStockNum");
const dashSimsEnUsoNum = document.getElementById("dashSimsEnUsoNum");
const dashFinStatus = document.getElementById("dashFinStatus");
const dashFinPagosNum = document.getElementById("dashFinPagosNum");
const dashFinBonificadosNum = document.getElementById("dashFinBonificadosNum");
const dashFinTotalNum = document.getElementById("dashFinTotalNum");
const dashFinTotalDelta = document.getElementById("dashFinTotalDelta");
const dashFinPromedioNum = document.getElementById("dashFinPromedioNum");
const refreshDashboardFinancieroBtn = document.getElementById("refreshDashboardFinancieroBtn");
const dashFinSyncLabel = document.getElementById("dashFinSyncLabel");
const mapaStatus = document.getElementById("mapaStatus");
const mapaCercanosList = document.getElementById("mapaCercanosList");
const toSignBtn = document.getElementById("toSignBtn");
const abrirClavesBtn = document.getElementById("abrirClavesBtn");
const guardarClavesBtn = document.getElementById("guardarClavesBtn");
const agregarClaveBtn = document.getElementById("agregarClaveBtn");
const clavesTituloInput = document.getElementById("clavesTituloInput");
const clavesUsuarioInput = document.getElementById("clavesUsuarioInput");
const clavesClaveInput = document.getElementById("clavesClaveInput");
const clavesCodigoInput = document.getElementById("clavesCodigoInput");
const clavesAgregadasList = document.getElementById("clavesAgregadasList");
const backToFormBtn = document.getElementById("backToFormBtn");
const clearSignBtn = document.getElementById("clearSignBtn");
const confirmSignBtn = document.getElementById("confirmSignBtn");
const signAclaracion = document.getElementById("signAclaracion");
const signCargo = document.getElementById("signCargo");
const newReportBtn = document.getElementById("newReportBtn");
const sendingLabel = document.getElementById("sendingLabel");
const doneMessage = document.getElementById("doneMessage");
const doneId = document.getElementById("doneId");
const canvas = document.getElementById("signCanvas");
const ctx = canvas.getContext("2d");

let hasSignature = false;
let drawing = false;
let lastX = 0, lastY = 0;
let currentNumeroServicio = "";
let currentNumeroCliente = "";

// ---------- Borrador del parte en curso ----------
// Si el técnico abre un servicio, carga datos, y toca "Volver" (o
// cierra la app) antes de terminar y firmar, lo que ya había cargado
// no se pierde — queda guardado en el celular y se restaura solo la
// próxima vez que abra ESE MISMO servicio. Solo aplica a servicios
// reales de la lista (con número de servicio) — los partes cargados
// con "Cargar parte sin servicio" no tienen una clave estable para
// guardar un borrador, así que no se guardan.
// "Tarea a realizar": lo que pidió el cliente / agendó la oficina. Se muestra
// fija (no editable) arriba de "Tarea realizada", que queda vacía para que el
// técnico escriba lo que hizo. Si no hay tarea asignada, el recuadro no aparece.
let tareaAsignada = "";
function setTareaAsignada(texto) {
  tareaAsignada = String(texto || "").trim();
  const wrap = document.getElementById("tareaAsignadaWrap");
  const caja = document.getElementById("tareaAsignadaTexto");
  if (caja) caja.textContent = tareaAsignada;
  if (wrap) wrap.classList.toggle("hidden", !tareaAsignada);
}

function claveBorrador(numeroServicio) {
  return `borrador_parte_${numeroServicio}`;
}

function armarBorrador() {
  return {
    cliente: document.getElementById("f_cliente").value,
    direccion: document.getElementById("f_direccion").value,
    localidad: document.getElementById("f_localidad").value,
    cliente_email: document.getElementById("f_cliente_email").value,
    tarea: document.getElementById("f_tarea").value,
    tarea_asignada: tareaAsignada,
    materiales_otros: document.getElementById("f_materiales").value,
    materiales_agregados: materialesAgregados,
    materiales_retirados: document.getElementById("f_materiales_retirados").value,
    materiales_retirados_agregados: materialesRetiradosAgregados,
    importe: document.getElementById("f_importe").value,
    costo_final: document.getElementById("f_costo_final").value,
    descuento_tipo: (Array.from(descuentoRadios).find((r) => r.checked) || {}).value || "0",
    descuento_otro_pct: descuentoOtroPct.value,
    descuento_numero_presupuesto: numeroPresupuestoInput.value,
    forma_pago: (Array.from(formaPagoChecks).find((r) => r.checked) || {}).value || "",
    instalacion: instalacionCheck.checked,
    tecnico: tecnicoSelect.value,
    tecnico_otro: tecnicoOtro.value,
    dos_tecnicos: dosTecnicosCheck.checked,
    tecnico2: tecnicoSelect2.value,
    tecnico2_otro: tecnicoOtro2.value,
    fecha: document.getElementById("f_fecha").value,
    hora_entrada: document.getElementById("f_entrada").value,
    hora_salida: document.getElementById("f_salida").value,
    imprevisto: imprevistoCheck.checked,
    imprevisto_detalle: document.getElementById("f_imprevisto_detalle").value,
    imprevisto_minutos: document.getElementById("f_imprevisto_minutos").value,
    observaciones: document.getElementById("f_observaciones").value,
    claves: clavesAgregadas,
    guardado_en: Date.now(),
  };
}

function hayAlgoCargadoEnElForm() {
  const b = armarBorrador();
  return !!(
    b.cliente || b.direccion || b.tarea || b.materiales_agregados.length > 0 ||
    (b.materiales_retirados_agregados && b.materiales_retirados_agregados.length > 0) ||
    b.materiales_otros || b.importe || b.observaciones || b.claves.length > 0
  );
}

function guardarBorradorActual() {
  if (!currentNumeroServicio) return; // sin servicio real, no hay clave estable
  if (!hayAlgoCargadoEnElForm()) return; // no guardar un borrador vacío
  try {
    localStorage.setItem(claveBorrador(currentNumeroServicio), JSON.stringify(armarBorrador()));
  } catch (err) {
    // si falla (almacenamiento lleno, modo privado, etc.), no se
    // interrumpe el flujo — simplemente no queda guardado el borrador
  }
}

function borrarBorrador(numeroServicio) {
  if (!numeroServicio) return;
  localStorage.removeItem(claveBorrador(numeroServicio));
}

function restaurarBorradorSiExiste(numeroServicio) {
  if (!numeroServicio) return false;
  const guardado = localStorage.getItem(claveBorrador(numeroServicio));
  if (!guardado) return false;
  let b;
  try {
    b = JSON.parse(guardado);
  } catch (err) {
    return false;
  }

  document.getElementById("f_cliente").value = b.cliente || "";
  document.getElementById("f_direccion").value = b.direccion || "";
  document.getElementById("f_localidad").value = b.localidad || "";
  document.getElementById("f_cliente_email").value = b.cliente_email || "";
  document.getElementById("f_tarea").value = b.tarea || "";
  setTareaAsignada(b.tarea_asignada || "");
  document.getElementById("f_materiales").value = b.materiales_otros || "";
  materialesAgregados = Array.isArray(b.materiales_agregados) ? b.materiales_agregados : [];
  renderMaterialesAgregados();
  document.getElementById("f_materiales_retirados").value = b.materiales_retirados || "";
  materialesRetiradosAgregados = Array.isArray(b.materiales_retirados_agregados) ? b.materiales_retirados_agregados : [];
  renderMaterialesRetiradosAgregados();
  document.getElementById("f_importe").value = b.importe || "";
  document.getElementById("f_costo_final").value = b.costo_final || "";
  const radioDescuento = Array.from(descuentoRadios).find((r) => r.value === (b.descuento_tipo || "0"));
  if (radioDescuento) {
    radioDescuento.checked = true;
    radioDescuento.dispatchEvent(new Event("change", { bubbles: true }));
  }
  descuentoOtroPct.value = b.descuento_otro_pct || "";
  numeroPresupuestoInput.value = b.descuento_numero_presupuesto || "";
  if (b.forma_pago) {
    const radioPago = Array.from(formaPagoChecks).find((r) => r.value === b.forma_pago);
    if (radioPago) radioPago.checked = true;
  }
  instalacionCheck.checked = !!b.instalacion;
  tecnicoSelect.value = b.tecnico || "";
  tecnicoSelect.dispatchEvent(new Event("change", { bubbles: true }));
  tecnicoOtro.value = b.tecnico_otro || "";
  dosTecnicosCheck.checked = !!b.dos_tecnicos;
  dosTecnicosCheck.dispatchEvent(new Event("change", { bubbles: true }));
  tecnicoSelect2.value = b.tecnico2 || "";
  tecnicoSelect2.dispatchEvent(new Event("change", { bubbles: true }));
  tecnicoOtro2.value = b.tecnico2_otro || "";
  document.getElementById("f_fecha").value = b.fecha || "";
  document.getElementById("f_entrada").value = b.hora_entrada || "";
  document.getElementById("f_salida").value = b.hora_salida || "";
  imprevistoCheck.checked = !!b.imprevisto;
  imprevistoCheck.dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("f_imprevisto_detalle").value = b.imprevisto_detalle || "";
  document.getElementById("f_imprevisto_minutos").value = b.imprevisto_minutos || "";
  document.getElementById("f_observaciones").value = b.observaciones || "";
  clavesAgregadas = Array.isArray(b.claves) ? b.claves : [];
  renderClavesAgregadas();
  actualizarBotonClaves();

  return true;
}

let serviciosCache = [];
let serviciosResueltos = new Set(JSON.parse(localStorage.getItem("servicios_resueltos") || "[]"));
let fotoBase64 = null;
let fotoMimeType = null;

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.dataset.active = key === name ? "true" : "false";
  });
  // La tuerquita de Ajustes solo se ve con sesión iniciada (no en el login)
  const btnAjustes = document.getElementById("ajustesBtn");
  if (btnAjustes) btnAjustes.classList.toggle("hidden", name === "login");
  try { actualizarWakeLockPantalla(name); } catch (e) { /* los ajustes todavía no cargaron */ }
  if (name === "home") { try { actualizarProximoService(); } catch (e) { /* aún no cargó */ } }
  if (name === "home") { try { document.getElementById("homeBuscarWrap").hidden = !esSkinNuevo(); actualizarAvisosInicio(); actualizarVehiculoInicio(); setTimeout(consumirIrPendiente, 300); } catch (e) { /* aún no cargó */ } }
  try { controlarFaltantesParte(name); } catch (e) { /* aún no cargó */ }
  try { actualizarBarraSuperior(name); } catch (e) { /* aún no cargó */ }
  if (name === "form") { try { pasoParteElegido = null; } catch (e) { /* aún no cargó */ } }
  if (name === "sign") { try { pintarResumenFirma(); } catch (e) { /* aún no cargó */ } }
  if (name === "form") { try { sincronizarChipsElegidos(); refrescarAtajosMateriales(); cargarHistorialMateriales(); } catch (e) { /* aún no cargó */ } }
}

// ---------- Barra superior (skin nuevo): volver arriba a la izquierda y
// nombre de la pantalla actual ----------
function botonVolverDe(pantalla) {
  if (!pantalla) return null;
  const candidatos = Array.from(pantalla.querySelectorAll(".action-bar button, .action-bar a, button.link-btn"));
  const visibles = candidatos.filter((b) => !b.classList.contains("hidden") && b.style.display !== "none");
  return visibles.find((b) => /^volver|^back/i.test(b.id)) ||
    visibles.find((b) => /^(←\s*)?volver/i.test(b.textContent.trim())) ||
    visibles.find((b) => /^cancelar$/i.test(b.textContent.trim())) || null;
}
function nombreDePantalla(pantalla) {
  const t = pantalla && pantalla.querySelector(".review-eyebrow");
  if (!t) return "";
  const nuevo = t.querySelector(".solo-nuevo");
  const texto = ((nuevo && nuevo.textContent) || t.textContent || "").replace(/\s+/g, " ").trim();
  if (!texto) return "";
  // Los títulos vienen en mayúsculas: se pasan a oración, respetando siglas conocidas.
  const oracion = texto === texto.toUpperCase() ? texto.charAt(0) + texto.slice(1).toLowerCase() : texto;
  return oracion.replace(/\bsims\b/gi, "SIMs").replace(/\(ia\)/i, "(IA)");
}
function actualizarBarraSuperior(name) {
  const pantalla = screens[name];
  const btn = document.getElementById("topbarVolverBtn");
  const seccion = document.getElementById("topbarSeccion");
  document.querySelectorAll(".volver-arriba").forEach((b) => b.classList.remove("volver-arriba"));
  document.querySelectorAll(".action-bar.solo-volver").forEach((b) => b.classList.remove("solo-volver"));
  const volver = ["home", "login", "sending", "done"].includes(name) ? null : botonVolverDe(pantalla);
  if (btn) {
    btn.classList.toggle("hidden", !volver);
    btn._destino = volver;
  }
  if (volver && /^volver$/i.test(volver.textContent.trim()) && volver.closest(".action-bar")) {
    volver.classList.add("volver-arriba");
    const bar = volver.closest(".action-bar");
    const otros = Array.from(bar.querySelectorAll("button, a")).filter((b) => b !== volver && !b.classList.contains("hidden") && getComputedStyle(b).display !== "none");
    if (otros.length === 0) bar.classList.add("solo-volver");
  }
  const nombresCortos = { consultas: "Manuales", dashboard: "Dashboard", dashboardFinanciero: "Financiero", dashboardVehiculos: "Vehículos", dashboardHerramientas: "Herramientas", dashboardSims: "SIMs", simDetalle: "Ficha de la SIM", fichaCliente: "Ficha del cliente", sign: "Firma del cliente", simRegistro: "SIMs instaladas" };
  if (seccion) seccion.textContent = name === "home" ? "Servicio técnico" : (nombresCortos[name] || nombreDePantalla(pantalla) || "Servicio técnico");
  document.querySelector(".topbar")?.classList.toggle("en-seccion", name !== "home" && name !== "login");
}
document.getElementById("topbarVolverBtn").addEventListener("click", () => {
  const btn = document.getElementById("topbarVolverBtn");
  if (btn._destino) btn._destino.click();
});

function setStatus(text, mode) {
  statusPill.textContent = text;
  statusPill.className = "topbar-status" + (mode ? " " + mode : "");
  if (mode !== "busy") { try { actualizarPillConexion(); } catch (e) { /* aún no cargó */ } }
}

// El "LISTO" de arriba no era clickeable — ahora sirve para consultar
// el estado real de sincronización (conexión + envíos pendientes) al
// tocarlo, en vez de ser solo una etiqueta decorativa.
statusPill.addEventListener("click", () => {
  const cola = typeof obtenerColaEnvios === "function" ? obtenerColaEnvios() : [];
  const conectado = navigator.onLine !== false;
  if (!conectado) {
    showToast("Sin conexión ahora mismo — lo que cargues se guarda y se manda solo apenas vuelva la señal.");
  } else if (cola.length > 0) {
    showToast(`Conectado — hay ${cola.length} envío(s) todavía pendiente(s) por una falta de conexión anterior. Se están reintentando solos.`);
  } else {
    showToast("Conectado — todo al día, sin envíos pendientes.");
  }
});

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 3600);
}

// ---------- Login ----------
let tecnicoLogueado = "";
// Ya no guarda contraseñas de verdad (el valor siempre queda vacío) —
// se mantiene solo para tener la lista de NOMBRES a mano al armar el
// desplegable de login. La contraseña siempre se verifica contra el
// servidor, nunca comparando acá.
let tecnicosPasswords = { ...TECNICOS_PASSWORDS_RESPALDO };
let tecnicosPermisos = {}; // { nombre: {permisos...} } — se completa al cargar la lista

// Carga la lista de técnicos desde el servidor (administrada en
// admin.html). Si no hay conexión, usa la última copia guardada en el
// celular; si nunca se guardó ninguna, usa el respaldo de arranque.
async function cargarTecnicos() {
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=tecnicos", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const mapa = {};
      const mapaPermisos = {};
      data.forEach((t) => {
        if (!t.nombre) return;
        mapa[t.nombre] = t.password || "";
        if (t.permisos) mapaPermisos[t.nombre] = t.permisos;
      });
      tecnicosPasswords = mapa;
      localStorage.setItem("tecnicos_cache", JSON.stringify(mapa));
      // Sin login el servidor manda solo los nombres: ahí no se pisan los permisos guardados.
      if (Object.keys(mapaPermisos).length > 0) {
        tecnicosPermisos = mapaPermisos;
        localStorage.setItem("tecnicos_permisos_cache", JSON.stringify(mapaPermisos));
      } else {
        try { tecnicosPermisos = JSON.parse(localStorage.getItem("tecnicos_permisos_cache") || "{}") || {}; } catch (e) { /* nada */ }
      }
    }
  } catch (err) {
    const cacheado = localStorage.getItem("tecnicos_cache");
    if (cacheado) {
      try { tecnicosPasswords = JSON.parse(cacheado); } catch (e) { /* usa el respaldo de arranque */ }
    }
    const cacheadoPermisos = localStorage.getItem("tecnicos_permisos_cache");
    if (cacheadoPermisos) {
      try { tecnicosPermisos = JSON.parse(cacheadoPermisos); } catch (e) { /* sin permisos guardados */ }
    }
  }
  poblarSelectsTecnico();
}

// ---------- Permisos por técnico (configurables desde admin.html) ----------
// Antes, varias secciones estaban restringidas a nombres fijos en el
// código (Sebastian Bartolozzi para el dashboard financiero, Sebastian
// + Brenda para Administración, etc.). Ahora se administran como
// casillas por técnico desde admin.html → Técnicos. Un técnico nuevo
// arranca con todo apagado — el administrador prende lo que
// corresponda.
function permisosDelTecnico(nombre) {
  if (!nombre) {
    // Login general de oficina (sin técnico en particular): acceso
    // total, como ya era antes de este sistema.
    return {
      dash_general: true, dash_financiero: true, dash_vehiculos: true, dash_herramientas: true, dash_sims: true, dash_stock: true, instalador: true,
      historial_todos: true, vehiculos: true, sims: true, herramientas: true, marcar_pasado_sistema: true,
      comodato: true, admin: true, agendar_emergencia: true, sims_ver_todas: true,
    };
  }
  if (tecnicosPermisos[nombre]) {
    // Ya tiene permisos guardados explícitamente desde admin.html —
    // cualquier casilla que no esté ahí cuenta como apagada.
    return tecnicosPermisos[nombre];
  }
  // Técnico que existía desde antes de este sistema y todavía nadie
  // guardó sus permisos explícitamente — mantiene el acceso que ya
  // tenía, para no cortarle nada de golpe con esta actualización.
  return {
    dash_general: true,
    dash_financiero: nombre === "Sebastian Bartolozzi",
    marcar_pasado_sistema: nombre === "Sebastian Bartolozzi",
    dash_stock: nombre === "Sebastian Bartolozzi",
    dash_vehiculos: true,
    dash_herramientas: true,
    dash_sims: true,
    historial_todos: nombre === "Sebastian Bartolozzi",
    vehiculos: true,
    sims: true,
    herramientas: true,
    comodato: true,
    admin: nombre === "Sebastian Bartolozzi" || nombre === "Brenda Thiesing",
    agendar_emergencia: false,
    sims_ver_todas: false,
  };
}
const tecnicosListos = cargarTecnicos();

// Arma las opciones de los selectores de técnico (principal y
// segundo) a partir de la lista cargada, manteniendo el placeholder y
// la opción "Otro...".
function poblarSelectsTecnico() {
  const nombres = Object.keys(tecnicosPasswords).sort();
  const opciones = nombres.map((n) => `<option value="${n}">${n}</option>`).join("");

  const actual1 = tecnicoSelect.value;
  tecnicoSelect.innerHTML = `<option value="" disabled ${actual1 ? "" : "selected"}>Elegí un técnico</option>${opciones}<option value="otro">Otro...</option>`;
  if (nombres.includes(actual1)) tecnicoSelect.value = actual1;

  const actual2 = tecnicoSelect2.value;
  tecnicoSelect2.innerHTML = `<option value="" disabled ${actual2 ? "" : "selected"}>Elegí el segundo técnico</option>${opciones}<option value="otro">Otro...</option>`;
  if (nombres.includes(actual2)) tecnicoSelect2.value = actual2;

  const actualLogin = loginTecnicoSelect.value;
  loginTecnicoSelect.innerHTML = `<option value="" disabled ${actualLogin ? "" : "selected"}>Elegí tu usuario</option>${opciones}<option value="__general__">Oficina / Administración</option>`;
  if (actualLogin && (nombres.includes(actualLogin) || actualLogin === "__general__")) {
    loginTecnicoSelect.value = actualLogin;
  }
}

// La sesión se guarda en el celular y se renueva cada vez que se usa
// la app — si pasan 6 horas seguidas sin abrirla, pide loguearse de
// nuevo. Así no hace falta escribir la contraseña cada vez que se
// cierra la app, pero tampoco queda una sesión abierta para siempre.
const SESION_DURACION_MS = 6 * 60 * 60 * 1000; // 6 horas

function guardarSesion(tecnico) {
  localStorage.setItem("sesion_sat", JSON.stringify({ tecnico: tecnico || "", expira: Date.now() + SESION_DURACION_MS }));
}

function borrarSesion() {
  guardarPaseApi("");
  localStorage.removeItem("sesion_sat");
  localStorage.removeItem("tecnico_logueado"); // clave vieja, ya no se usa
}

function entrarComoTecnico(nombreTecnico) {
  tecnicoLogueado = nombreTecnico || "";
  guardarSesion(tecnicoLogueado);
  loginError.textContent = "";
  actualizarAccesoDashboardFinanciero();
  showScreen("home");
  const promesaServicios = fetchServicios();
  precargarHistorialParaVisitas().then(() => {
    actualizarBadgeHistorialPendientes();
    prepararFelicitacionSemanal();
    actualizarProximoService();
  });
  precargarNotasYAvisar();
  prepararAvisoSimsPendientes();
  Promise.allSettled([promesaServicios, precargarCronogramaParaSugerencias()]).then(() => { actualizarProximoService(); iniciarRecordatorioTestGeo(); });
  mostrarTestPendientesDeQuitar();
  cargarClientesGeneral(); // precarga, para que esté lista al completar un parte (número de cliente en Stock, etc.)
  actualizarAccesoCredencial();
  actualizarAccesoExcelDashboards();
  actualizarAccesoSeccionesPanel();
  aplicarMosaicos();
  actualizarSaludoPanel();
  verificarEstadoNotificaciones();
  actualizarBadgeColaEnvios();
  procesarColaEnvios();
}

// Si hay una sesión guardada y todavía no venció, entra directo sin
// pedir usuario/contraseña de nuevo.
function intentarRestaurarSesion() {
  try {
    const guardada = JSON.parse(localStorage.getItem("sesion_sat") || "null");
    if (guardada && typeof guardada.expira === "number" && guardada.expira > Date.now()) {
      if (!SERVICIOS_API_TOKEN) {
        // Sesión de antes del cambio de seguridad (sin pase personal): hay que volver a entrar una vez.
        borrarSesion();
        setTimeout(() => { try { loginError.textContent = "Por seguridad, volvé a entrar con tu contraseña (es una sola vez)."; } catch (e) { /* nada */ } }, 0);
        return false;
      }
      entrarComoTecnico(guardada.tecnico || "");
      return true;
    }
  } catch (err) {
    // sesión guardada corrupta — se ignora y se borra abajo
  }
  borrarSesion();
  return false;
}

async function attemptLogin() {
  const usuarioElegido = loginTecnicoSelect.value;
  const intento = loginPassword.value;

  if (!usuarioElegido) {
    loginError.textContent = "Elegí tu usuario antes de ingresar.";
    return;
  }

  loginBtn.disabled = true;
  loginError.textContent = "";
  try {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const body = usuarioElegido === "__general__"
      ? { accion: "verificar_admin", password: intento }
      : { accion: "verificar_login", nombre: usuarioElegido, password: intento };
    const res = await fetch("/api/datos?coleccion=tecnicos", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      if (data.sesion) guardarPaseApi(data.sesion);
      avisoSesionVencidaMostrado = false;
      entrarComoTecnico(usuarioElegido === "__general__" ? "" : usuarioElegido);
      cargarTecnicos().then(() => { try { actualizarAccesoSeccionesPanel(); aplicarMosaicos(); } catch (e) { /* nada */ } });
    } else if (data.bloqueado) {
      loginError.textContent = `Demasiados intentos fallidos — probá de nuevo en ${data.minutos_restantes} minuto(s).`;
      loginPassword.value = "";
    } else {
      loginError.textContent = "Contraseña incorrecta.";
      loginPassword.value = "";
      loginPassword.focus();
    }
  } catch (err) {
    loginError.textContent = "No se pudo verificar — revisá tu conexión e intentá de nuevo.";
  } finally {
    loginBtn.disabled = false;
  }
}

// Carga el historial en segundo plano al loguearse, para poder mostrar
// la info de "última visita" del cliente sin esperar a entrar al
// dashboard. Si falla, no interrumpe nada — esa info simplemente no
// se muestra.
async function precargarHistorialParaVisitas() {
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/historial", { headers, cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    historialCache = Array.isArray(data) ? data : [];
  } catch (err) {
    // silencioso — la info de visita anterior simplemente no aparece
  }
}

// Precarga el cronograma en segundo plano al loguearse, para poder
// detectar si el técnico ya terminó toda su agenda del día y sugerirle
// servicios pendientes cercanos al finalizar un parte.
let cronogramaCargadoOk = false;
async function precargarCronogramaParaSugerencias() {
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/cronograma", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    cronogramaCache = Array.isArray(data.tareas) ? data.tareas : [];
    cronogramaTecnicosCache = Array.isArray(data.tecnicos) ? data.tecnicos : [];
    cronogramaCargadoOk = true;
    localStorage.setItem("cronograma_cache", JSON.stringify(cronogramaCache));
    localStorage.setItem("cronograma_tecnicos_cache", JSON.stringify(cronogramaTecnicosCache));
    localStorage.setItem("cronograma_cache_time", String(Date.now()));
  } catch (err) {
    // Sin señal: se usa el último cronograma guardado, así el inicio igual
    // muestra el próximo servicio.
    try {
      const guardado = JSON.parse(localStorage.getItem("cronograma_cache") || "null");
      if (Array.isArray(guardado) && (!cronogramaCache || cronogramaCache.length === 0)) {
        cronogramaCache = guardado;
        cronogramaTecnicosCache = JSON.parse(localStorage.getItem("cronograma_tecnicos_cache") || "[]");
        cronogramaCargadoOk = true;
      }
    } catch (e) { /* nada guardado */ }
  }
}
// Al volver a la app (estaba en segundo plano) se refresca el próximo
// servicio si el cronograma tiene más de 10 minutos.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !tecnicoLogueado) return;
  const hace = Date.now() - Number(localStorage.getItem("cronograma_cache_time") || 0);
  if (hace > 10 * 60 * 1000) precargarCronogramaParaSugerencias().then(() => { try { actualizarProximoService(); } catch (e) { /* aún no cargó */ } });
});

// Solo Sebastian Bartolozzi ve el botón del dashboard financiero.
// Saluda por el nombre de pila del técnico logueado, arriba a la
// derecha del panel principal (o "Oficina" si entró con la clave
// general, que no está asociada a ningún técnico en particular).
function actualizarSaludoPanel() {
  const nombre = tecnicoLogueado ? tecnicoLogueado.split(" ")[0] : "Oficina";
  panelSaludo.textContent = `Hola, ${nombre}`;
  const fechaEl = document.getElementById("homeFecha");
  if (fechaEl) {
    const t = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
    fechaEl.textContent = t.charAt(0).toUpperCase() + t.slice(1);
  }
}

// ---------- Próximo service (inicio, estilo Nuevo) ----------
// Busca en el cronograma la próxima tarea del técnico logueado (de hoy
// en adelante) que todavía no tenga parte hecho, y la muestra arriba
// de todo en el inicio. Tocarla abre el parte, igual que en el cronograma.
let proximaTareaInicio = null;
function etiquetaDiaProximo(fechaISO) {
  const hoy = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
  if (fechaISO === iso(hoy)) return "Hoy";
  if (fechaISO === iso(manana)) return "Mañana";
  const [y, m, d] = fechaISO.split("-").map(Number);
  const dia = new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "long" });
  return `${dia.charAt(0).toUpperCase() + dia.slice(1)} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
function actualizarProximoService() {
  const card = document.getElementById("proximoServiceCard");
  if (!card) return;
  actualizarResumenDelDia();
  try {
    proximaTareaInicio = null;
    if (tecnicoLogueado && Array.isArray(cronogramaCache)) {
      const ahora = new Date();
      const hoyISO = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
      const candidatas = cronogramaCache
        .filter((t) => t.fecha && t.fecha >= hoyISO && coincideNombreTecnico(t.tecnico, tecnicoLogueado))
        .sort((a, b) => (a.fecha + (a.hora_inicio || "")).localeCompare(b.fecha + (b.hora_inicio || "")));
      let quedanHoy = 0;
      for (const t of candidatas) {
        const info = infoTarea(t);
        if (info.resuelto) continue;
        if (!proximaTareaInicio) proximaTareaInicio = { t, serv: info.servicio };
        if (t.fecha === hoyISO) quedanHoy++;
      }
      const tit = document.querySelector("#proximoServiceCard .proximo-service-titulo");
      if (tit) tit.textContent = quedanHoy > 1 ? `Tu próximo servicio · quedan ${quedanHoy} hoy` : "Tu próximo servicio";
    }
    const vacio = document.getElementById("proximoVacio");
    if (!proximaTareaInicio) {
      card.classList.add("hidden");
      // Solo se avisa "no tenés más" si el cronograma se pudo leer (si no, no sabemos).
      if (vacio) vacio.classList.toggle("hidden", !(tecnicoLogueado && cronogramaCargadoOk));
      return;
    }
    if (vacio) vacio.classList.add("hidden");
    const { t, serv } = proximaTareaInicio;
    const parsed = parsearTareaCronograma(t.tarea);
    const lineasExtra = (t.tarea || "").split("\n").map((l) => l.trim()).filter(Boolean).slice(2).join(" · ");
    const tareaEl = document.getElementById("proximoServiceTarea");
    if (tareaEl) tareaEl.textContent = (serv && serv.tarea) || lineasExtra || "";
    const cliente = (serv && serv.cliente) || parsed.cliente || "Servicio agendado";
    const direccion = (serv && serv.direccion) || parsed.direccion;
    const localidad = (serv && serv.localidad) || parsed.localidad;
    document.getElementById("proximoServiceCuando").textContent = `${etiquetaDiaProximo(t.fecha)}${t.hora_inicio ? " · " + t.hora_inicio : ""}`;
    document.getElementById("proximoServiceCliente").textContent = cliente;
    document.getElementById("proximoServiceDonde").textContent = [direccion, localidad].filter(Boolean).join(" — ");
    actualizarAccionesProximo(serv, direccion, localidad);
    card.classList.remove("hidden");
  } catch (e) {
    card.classList.add("hidden");
  }
}
document.getElementById("proximoServiceMain").addEventListener("click", () => {
  if (proximaTareaInicio) seleccionarTareaCronograma(proximaTareaInicio.t);
});
document.getElementById("proximoEmpezarBtn").addEventListener("click", () => {
  if (proximaTareaInicio) seleccionarTareaCronograma(proximaTareaInicio.t);
});
document.getElementById("proximoVerPendientesBtn").addEventListener("click", () => showScreen("list"));
// Botones de la tarjeta: llamar, cómo llegar y avisar que voy en camino
function actualizarAccionesProximo(serv, direccion, localidad) {
  const tel = (serv && serv.telefono || "").toString().trim();
  const llamar = document.getElementById("proximoLlamarBtn");
  const camino = document.getElementById("proximoCaminoBtn");
  const llegar = document.getElementById("proximoComoLlegarBtn");
  if (tel) {
    llamar.href = "tel:" + tel.replace(/[^\d+]/g, "");
    llamar.classList.remove("hidden");
    const numWa = limpiarTelefonoWhatsapp(tel);
    const nombre = tecnicoLogueado || "un técnico";
    const msg = `Hola! Soy ${nombre}, técnico de SAT (seguridad electrónica). Le escribo para avisarle que estoy en camino a su domicilio para el servicio técnico. ¡Nos vemos pronto!`;
    camino.href = `https://wa.me/${numWa}?text=${encodeURIComponent(msg)}`;
    camino.classList.toggle("hidden", !numWa);
  } else {
    llamar.classList.add("hidden");
    camino.classList.add("hidden");
  }
  if (direccion) {
    const q = encodeURIComponent([direccion, localidad, "Argentina"].filter(Boolean).join(", "));
    llegar.href = leerAjustes().appMapas === "waze"
      ? `https://waze.com/ul?q=${q}&navigate=yes`
      : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    llegar.classList.remove("hidden");
  } else {
    llegar.classList.add("hidden");
  }
}

// Resumen del día en el botón Servicios Técnicos: partes hechos hoy,
// agenda de hoy y pendientes en total.
function actualizarResumenDelDia() {
  const resumen = document.getElementById("tileServiciosResumen");
  const progreso = document.getElementById("tileServiciosProgreso");
  if (!resumen || !progreso) return;
  try {
    if (!tecnicoLogueado) { resumen.classList.add("hidden"); progreso.classList.add("hidden"); return; }
    const ahora = new Date();
    const hoyISO = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
    const hechos = historialCache.filter((h) => h.fecha === hoyISO && coincideNombreTecnico(h.tecnico, tecnicoLogueado)).length;
    const agenda = cronogramaCache.filter((t) => t.fecha === hoyISO && coincideNombreTecnico(t.tecnico, tecnicoLogueado)).length;
    const pendientes = serviciosCache.filter((sv) => !(sv.numero_servicio && (serviciosResueltos.has(sv.numero_servicio) || historialCache.some((h) => h.numero_servicio === sv.numero_servicio)))).length;
    const partes = [];
    partes.push(agenda > 0 && hechos <= agenda ? `Hoy ${hechos} de ${agenda} hechos` : `Hoy ${hechos} hecho${hechos === 1 ? "" : "s"}`);
    partes.push(`${pendientes} pendiente${pendientes === 1 ? "" : "s"}`);
    resumen.textContent = partes.join(" · ");
    resumen.classList.remove("hidden");
    if (agenda > 0) {
      document.getElementById("tileServiciosProgresoBarra").style.width = Math.min(100, Math.round((hechos / agenda) * 100)) + "%";
      progreso.classList.remove("hidden");
    } else {
      progreso.classList.add("hidden");
    }
  } catch (e) {
    resumen.classList.add("hidden");
    progreso.classList.add("hidden");
  }
}

// ---------- Pantallas de carga con esqueleto (estilo Nuevo) ----------
// Cuando un listado dice "Cargando..." / "Buscando...", se le agregan debajo
// unas tarjetas grises animadas con la forma de la lista. Se detecta solo,
// mirando los textos de estado (.list-status), sin tocar cada pantalla.
(function activarEsqueletos() {
  const SEL = ".list-status";
  const CARGANDO = /^(Cargando|Buscando servicios|Buscando cronograma)/;
  function sincronizar(el) {
    if (!el || !el.matches || !el.matches(SEL) || /^dash/.test(el.id)) return;
    // Si el texto de estado se oculta (ya cargó) aunque siga diciendo "Cargando...", el esqueleto se va.
    const quiere = document.documentElement.getAttribute("data-inicio") === "nuevo" && !el.classList.contains("hidden") && CARGANDO.test((el.textContent || "").trim());
    const sig = el.nextElementSibling;
    const esq = sig && sig.classList.contains("esqueleto-lista") ? sig : null;
    if (quiere && !esq) {
      const caja = document.createElement("div");
      caja.className = "esqueleto-lista";
      caja.setAttribute("aria-hidden", "true");
      caja.innerHTML = '<div class="esqueleto-card"></div><div class="esqueleto-card"></div><div class="esqueleto-card"></div>';
      el.insertAdjacentElement("afterend", caja);
    } else if (!quiere && esq) {
      esq.remove();
    }
  }
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      const base = m.target.nodeType === 3 ? m.target.parentElement : m.target;
      if (base && base.closest) sincronizar(base.closest(SEL));
    }
  });
  const iniciar = () => {
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    document.querySelectorAll(SEL).forEach(sincronizar);
  };
  if (document.body) iniciar(); else document.addEventListener("DOMContentLoaded", iniciar);
})();

// ---------- Parte (estilo Nuevo): qué falta antes de pasar a la firma ----------
let faltantesParteTimer = null;
// Marca visualmente (clase .sel) los botones de descuento / forma de pago elegidos.
// No depende de :has() (que los Android viejos no entienden) ni de que el
// cambio venga de un toque: también se sincroniza al restaurar o limpiar el parte.
function sincronizarChipsElegidos() {
  document.querySelectorAll("label.discount-chip").forEach((chip) => {
    const input = chip.querySelector("input");
    if (input) chip.classList.toggle("sel", !!input.checked);
  });
}
document.addEventListener("change", (ev) => {
  if (ev.target && ev.target.closest && ev.target.closest("label.discount-chip")) sincronizarChipsElegidos();
});
document.addEventListener("pointerup", () => setTimeout(sincronizarChipsElegidos, 60));

function actualizarFaltantesParte() {
  try { sincronizarChipsElegidos(); } catch (e) { /* aún no cargó */ }
  const el = document.getElementById("parteFaltantes");
  if (!el) return;
  try {
    const faltan = [];
    if (!document.getElementById("f_cliente").value.trim()) faltan.push("Cliente");
    if (!getTecnicoValue()) faltan.push("Técnico");
    if (!document.getElementById("f_fecha").value) faltan.push("Fecha");
    const importe = document.getElementById("f_importe").value.trim();
    el.classList.toggle("faltan", faltan.length > 0);
    if (faltan.length > 0) {
      el.textContent = "Falta completar: " + faltan.join(", ");
    } else if (importe && !getFormaPago()) {
      el.classList.add("faltan");
      el.textContent = "Cargaste un importe: elegí la forma de pago.";
    } else {
      el.textContent = "Listo para pasar a la firma.";
    }
  } catch (e) { el.textContent = ""; }
  try { actualizarPasosParte(); } catch (e) { /* aún no cargó */ }
}
// Barra de pasos del parte (skin nuevo): marca qué sección está completa y
// en cuál estás, y lleva a cada una con un toque.
function estadoPasosParte() {
  const v = (id) => ((document.getElementById(id) || {}).value || "").trim();
  let formaPago = "", descuento = "0";
  try { formaPago = getFormaPago(); descuento = getDescuentoTipo(); } catch (e) { /* aún no cargó */ }
  return [
    !!v("f_cliente"),
    !!v("f_tarea"),
    !!formaPago || descuento === "100" || descuento === "presupuesto",
    !!(getTecnicoValue() && v("f_fecha")),
  ];
}
let pasoParteElegido = null; // el que se tocó en la barra, hasta que el técnico desplace a mano
function seccionActualParte() {
  if (pasoParteElegido !== null) return pasoParteElegido;
  const scroll = document.querySelector("#screen-form .review-scroll");
  const secciones = document.querySelectorAll("#screen-form .parte-seccion");
  const barra = document.getElementById("partePasos");
  if (!scroll || !secciones.length) return 0;
  const tope = scroll.getBoundingClientRect().top + (barra ? barra.offsetHeight : 0) + 40;
  let actual = 0;
  secciones.forEach((sec, i) => { if (sec.getBoundingClientRect().top <= tope) actual = i; });
  if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 4) actual = secciones.length - 1;
  return actual;
}
function actualizarPasosParte() {
  const barra = document.getElementById("partePasos");
  if (!barra) return;
  const hechos = estadoPasosParte();
  const actual = seccionActualParte();
  barra.querySelectorAll("button").forEach((b, i) => {
    b.classList.toggle("hecho", !!hechos[i]);
    b.classList.toggle("actual", i === actual);
    b.setAttribute("aria-current", i === actual ? "step" : "false");
  });
}
document.querySelectorAll("#partePasos button").forEach((b) => {
  b.addEventListener("click", () => {
    const sec = document.querySelectorAll("#screen-form .parte-seccion")[Number(b.dataset.paso)];
    const scroll = document.querySelector("#screen-form .review-scroll");
    const barra = document.getElementById("partePasos");
    if (!sec || !scroll) return;
    pasoParteElegido = Number(b.dataset.paso);
    actualizarPasosParte();
    const destino = scroll.scrollTop + sec.getBoundingClientRect().top - scroll.getBoundingClientRect().top - (barra ? barra.offsetHeight : 0) - 8;
    scroll.scrollTo({ top: Math.max(0, destino), behavior: "smooth" });
  });
});
(function () {
  const scroll = document.querySelector("#screen-form .review-scroll");
  if (!scroll) return;
  scroll.addEventListener("scroll", () => { try { actualizarPasosParte(); } catch (e) { /* nada */ } }, { passive: true });
  ["touchstart", "wheel", "keydown"].forEach((ev) => scroll.addEventListener(ev, () => { pasoParteElegido = null; }, { passive: true }));
})();

function controlarFaltantesParte(pantalla) {
  if (pantalla === "form") {
    actualizarFaltantesParte();
    if (!faltantesParteTimer) faltantesParteTimer = setInterval(actualizarFaltantesParte, 700);
  } else if (faltantesParteTimer) {
    clearInterval(faltantesParteTimer);
    faltantesParteTimer = null;
  }
}

// Muestra u oculta las tiles del panel principal según los permisos
// del técnico logueado (configurados en admin.html → Técnicos). El
// tile de "Dashboards" en sí se oculta solo si no tiene acceso a
// NINGUNO de los 4 dashboards — si tiene al menos uno, entra al
// submenú y ahí ve solo los que le corresponden.
function actualizarAccesoSeccionesPanel() {
  const permisos = permisosDelTecnico(tecnicoLogueado);
  tileDashboardsBtn.classList.toggle("hidden", !(permisos.dash_general || permisos.dash_financiero || permisos.dash_vehiculos || permisos.dash_herramientas || permisos.dash_sims || permisos.dash_stock));
  verDashboardBtn.classList.toggle("hidden", !permisos.dash_general);
  verDashboardVehiculosBtn.classList.toggle("hidden", !permisos.dash_vehiculos);
  verDashboardHerramientasBtn.classList.toggle("hidden", !permisos.dash_herramientas);
  verDashboardSimsBtn.classList.toggle("hidden", !permisos.dash_sims);
  verStockBtn.classList.toggle("hidden", !permisos.dash_stock);
  tileVehiculosBtn.classList.toggle("hidden", !permisos.vehiculos);
  tileSimsBtn.classList.toggle("hidden", !permisos.sims);
  tileHerramientasBtn.classList.toggle("hidden", !permisos.herramientas);
  tileInstaladorBtn.classList.toggle("hidden", !permisos.instalador);
  tileComodatoBtn.classList.toggle("hidden", !permisos.comodato);
  tileEmergenciaBtn.classList.toggle("hidden", !permisos.agendar_emergencia);
}

function actualizarAccesoDashboardFinanciero() {
  const permisos = permisosDelTecnico(tecnicoLogueado);
  verDashboardFinancieroBtn.classList.toggle("hidden", !permisos.dash_financiero);
  abrirAdminBtn.classList.toggle("hidden", !permisos.admin);
}
loginBtn.addEventListener("click", attemptLogin);
loginPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptLogin();
});

// ---------- Huella digital / Face ID — login ----------
loginTecnicoSelect.addEventListener("change", actualizarOpcionHuellaEnLogin);

async function actualizarOpcionHuellaEnLogin() {
  const nombre = loginTecnicoSelect.value;
  loginHuellaWrap.classList.add("hidden");
  loginPasswordWrap.classList.remove("hidden");
  loginBtn.classList.remove("hidden");
  if (!nombre || nombre === "__general__" || !window.SimpleWebAuthnBrowser || !window.SimpleWebAuthnBrowser.browserSupportsWebAuthn()) return;
  try {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=tecnicos", {
      method: "POST", headers,
      body: JSON.stringify({ accion: "webauthn_tiene_credencial", nombre }),
    });
    const data = await res.json();
    if (data.tiene) {
      loginHuellaWrap.classList.remove("hidden");
      loginPasswordWrap.classList.add("hidden");
      loginBtn.classList.add("hidden");
    }
  } catch (err) {
    // si falla la consulta, se sigue con contraseña nomás, sin romper nada
  }
}

loginUsarPasswordLink.addEventListener("click", (e) => {
  e.preventDefault();
  loginHuellaWrap.classList.add("hidden");
  loginPasswordWrap.classList.remove("hidden");
  loginBtn.classList.remove("hidden");
});

loginHuellaBtn.addEventListener("click", async () => {
  const nombre = loginTecnicoSelect.value;
  if (!nombre) return;
  loginHuellaBtn.disabled = true;
  loginError.textContent = "";
  try {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const resOpc = await fetch("/api/datos?coleccion=tecnicos", {
      method: "POST", headers,
      body: JSON.stringify({ accion: "webauthn_login_opciones", nombre }),
    });
    const opciones = await resOpc.json();
    if (!resOpc.ok || opciones.error) throw new Error(opciones.error || "No se pudo iniciar");

    const respuesta = await window.SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: opciones });

    const resVer = await fetch("/api/datos?coleccion=tecnicos", {
      method: "POST", headers,
      body: JSON.stringify({ accion: "webauthn_login_verificar", nombre, respuesta }),
    });
    const dataVer = await resVer.json();
    if (!resVer.ok || !dataVer.ok) throw new Error(dataVer.error || "No se pudo verificar");
    if (dataVer.sesion) guardarPaseApi(dataVer.sesion);
    avisoSesionVencidaMostrado = false;

    entrarComoTecnico(nombre);
    cargarTecnicos().then(() => { try { actualizarAccesoSeccionesPanel(); aplicarMosaicos(); } catch (e) { /* nada */ } });
  } catch (err) {
    // Si el técnico cancela el pedido de huella (por ejemplo, tocó
    // "Cancelar" en el diálogo del celular), no se muestra como un
    // error real — simplemente no pasó nada.
    if (err.name !== "NotAllowedError") {
      loginError.textContent = "No se pudo entrar con huella — probá con tu contraseña.";
    }
  } finally {
    loginHuellaBtn.disabled = false;
  }
});

cerrarSesionBtn.addEventListener("click", () => {
  borrarSesion();
  tecnicoLogueado = "";
  detenerRecordatorioTestGeo();
  loginTecnicoSelect.value = "";
  loginPassword.value = "";
  showScreen("login");
});

// ---------- Listado de servicios pendientes ----------
function formatSyncTime(date) {
  return "Actualizado " + date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

// Neutraliza HTML/JS antes de insertar texto (cliente, dirección,
// tarea, claves, etc.) con innerHTML — sin esto, alguien podría
// escribir algo como <script> o <img onerror=...> en un campo de
// texto libre y que se ejecute en la pantalla de otro técnico.
function escapeHtml(s) {
  return (s ?? "").toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Semáforo de antigüedad (skin nuevo): urgente / atención / al día según los
// días que lleva el servicio en el listado (mismos umbrales que "estancado").
let filtroSemaforo = "";
// Cuántos días lleva el servicio dentro de la app (desde que apareció por
// primera vez en el listado), no la fecha de ingreso del ERP. El registro es
// compartido (servidor) y se cachea en el celular.
let serviciosVistos = {};
try { serviciosVistos = JSON.parse(localStorage.getItem("servicios_vistos") || "{}") || {}; } catch (e) { serviciosVistos = {}; }
function diasEnLista(item) {
  const reg = item && item.numero_servicio ? serviciosVistos[String(item.numero_servicio).trim()] : null;
  if (!reg || !reg.primera) return 0;
  const d = new Date(reg.primera);
  if (isNaN(d)) return 0;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoy - d) / 86400000));
}
async function sincronizarServiciosVistos(lista) {
  const url = "/api/datos?coleccion=servicios_vistos";
  const headers = { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN };
  try {
    const numeros = (lista || []).map((i) => String(i.numero_servicio || "").trim()).filter(Boolean);
    const desde = {};
    (lista || []).forEach((i) => {
      const f = parsearFechaIngreso(i.fecha_ingreso);
      if (f && i.numero_servicio) desde[String(i.numero_servicio).trim()] = f.toISOString();
    });
    const faltan = numeros.some((n) => !serviciosVistos[n]);
    const hace = Date.now() - Number(localStorage.getItem("servicios_vistos_sync") || 0);
    if (!faltan && hace < 6 * 3600 * 1000) return;
    await fetch(url, { method: "POST", headers, body: JSON.stringify({ accion: "registrar", numeros, desde }) });
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return;
    const mapa = await res.json();
    if (!mapa || typeof mapa !== "object" || Array.isArray(mapa)) return;
    serviciosVistos = mapa;
    localStorage.setItem("servicios_vistos", JSON.stringify(mapa));
    localStorage.setItem("servicios_vistos_sync", String(Date.now()));
    renderServiciosList(filtrarServicios());
  } catch (e) { /* sin conexión: se usa lo último guardado */ }
}
function estadoSemaforo(item) {
  const dias = diasEnLista(item);
  if (dias != null && dias >= DIAS_URGENTE) return "urgente";
  if (dias != null && dias >= DIAS_ATENCION) return "atencion";
  return "ok";
}
function actualizarSemaforoResumen(lista) {
  const cuenta = { urgente: 0, atencion: 0, ok: 0 };
  lista.forEach((item) => { cuenta[estadoSemaforo(item)]++; });
  const ids = { urgente: "semUrgente", atencion: "semAtencion", ok: "semOk" };
  Object.keys(ids).forEach((k) => {
    const el = document.getElementById(ids[k]);
    if (el) el.textContent = cuenta[k];
  });
  document.querySelectorAll("#semaforoResumen .semaforo-chip").forEach((chip) => {
    chip.classList.toggle("activo", chip.dataset.f === filtroSemaforo);
  });
}
document.querySelectorAll("#semaforoResumen .semaforo-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    filtroSemaforo = filtroSemaforo === chip.dataset.f ? "" : chip.dataset.f;
    renderServiciosList(filtrarServicios());
  });
});

function filtrarServicios() {
  const term = normalizeText(serviciosSearch.value);
  const sinResueltos = serviciosCache.filter(
    (item) => !(item.numero_servicio && serviciosResueltos.has(item.numero_servicio))
  );
  try { actualizarSemaforoResumen(sinResueltos); } catch (e) { /* aún no cargó */ }
  const conSemaforo = filtroSemaforo && document.documentElement.dataset.inicio === "nuevo"
    ? sinResueltos.filter((item) => estadoSemaforo(item) === filtroSemaforo)
    : sinResueltos;
  if (!term) return conSemaforo;
  return conSemaforo.filter((item) => {
    const haystack = normalizeText(
      [item.numero_servicio, item.cliente, item.direccion, item.localidad, item.tarea].join(" ")
    );
    return haystack.includes(term);
  });
}

// Umbrales para marcar un servicio como "estancado" — se administran
// desde admin.html (pestaña "Servicios pendientes"), estos valores acá
// son solo el respaldo de arranque hasta que se cargue la config real.
// Fecha YYYY-MM-DD en hora local (Argentina). toISOString() usa UTC, y de
// 21:00 a 24:00 daba la fecha del día siguiente.
function fechaLocalISO(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let DIAS_ATENCION = 3;
let DIAS_URGENTE = 7;

async function cargarConfig() {
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=config", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.dias_atencion) DIAS_ATENCION = data.dias_atencion;
    if (data.dias_urgente) DIAS_URGENTE = data.dias_urgente;
    if (data.sims_stock_minimo) SIMS_STOCK_MINIMO = Number(data.sims_stock_minimo) || SIMS_STOCK_MINIMO;
    localStorage.setItem("config_cache", JSON.stringify({ dias_atencion: DIAS_ATENCION, dias_urgente: DIAS_URGENTE }));
    if (data.app_version_actual) verificarVersionDisponible(data.app_version_actual);
  } catch (err) {
    const cacheado = localStorage.getItem("config_cache");
    if (cacheado) {
      try {
        const c = JSON.parse(cacheado);
        if (c.dias_atencion) DIAS_ATENCION = c.dias_atencion;
        if (c.dias_urgente) DIAS_URGENTE = c.dias_urgente;
      } catch (e) { /* usa el respaldo de arranque */ }
    }
  }
}
cargarConfig();

// Compara dos versiones tipo "3.0.2" numéricamente (no como texto),
// para que "3.0.10" sea mayor que "3.0.9", etc.
function compararVersiones(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

function verificarVersionDisponible(versionServidor) {
  if (compararVersiones(versionServidor, APP_VERSION) > 0) {
    nuevaVersionAviso.textContent = `Hay una nueva versión disponible (v${versionServidor}) — tocá "Actualizar app" para bajarla.`;
    nuevaVersionAviso.classList.remove("hidden");
  }
}

// Interpreta la fecha de ingreso del servicio en varios formatos
// comunes (dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd). Si no se puede
// interpretar, devuelve null (ese servicio simplemente no muestra
// alerta de estancado).
function parsearFechaIngreso(str) {
  if (!str) return null;
  const texto = str.toString().trim();
  let m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

function diasEstancado(item) {
  const fecha = parsearFechaIngreso(item.fecha_ingreso);
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  fecha.setHours(0, 0, 0, 0);
  const dias = Math.floor((hoy - fecha) / 86400000);
  return dias >= 0 ? dias : null;
}

function renderServiciosList(items) {
  serviciosListEl.innerHTML = "";
  if (!items || items.length === 0) {
    listStatus.textContent = serviciosSearch.value.trim()
      ? "No se encontraron servicios para esa búsqueda."
      : "No hay servicios pendientes por el momento.";
    return;
  }
  listStatus.textContent = "";
  items.forEach((item) => {
    const dias = diasEstancado(item);
    let claseEstancado = "";
    let badgeEstancado = "";
    if (dias != null && dias >= DIAS_URGENTE) {
      claseEstancado = " estancado-urgente";
      badgeEstancado = `<span class="servicio-card-estancado-badge urgente"><svg viewBox="0 0 24 24" fill="currentColor" width="9" height="9" style="vertical-align:0px; margin-right:4px;"><circle cx="12" cy="12" r="10"/></svg>Hace ${dias} días</span>`;
    } else if (dias != null && dias >= DIAS_ATENCION) {
      claseEstancado = " estancado-atencion";
      badgeEstancado = `<span class="servicio-card-estancado-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" style="vertical-align:-2px; margin-right:3px;"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Hace ${dias} días</span>`;
    }
    // Si el servicio volvió a aparecer en la lista (se subió de nuevo) pero ya tiene un parte hecho,
    // se muestra igual pero avisando, para no perder la memoria de que ya se hizo.
    const parteHecho = item.numero_servicio ? historialCache.find((h) => h.numero_servicio === item.numero_servicio) : null;
    const badgeParte = parteHecho ? `<span class="servicio-card-parte-badge">✓ Ya tiene parte${parteHecho.fecha ? " del " + parteHecho.fecha.split("-").reverse().slice(0, 2).join("/") : ""}</span>` : "";
    const card = document.createElement("button");
    card.type = "button";
    card.className = "servicio-card" + claseEstancado;
    const estadoN = estadoSemaforo(item);
    card.dataset.estado = estadoN;
    const diasN = diasEnLista(item);
    const edadN = diasN === 0 ? "Entró hoy" : diasN === 1 ? "Hace 1 día en la lista" : `Hace ${diasN} días en la lista`;
    card.innerHTML = `
      <div class="sv-c">
        <div class="servicio-card-num">N° ${escapeHtml(item.numero_servicio)}${badgeEstancado}${badgeParte}</div>
        <div class="servicio-card-cliente">${escapeHtml(item.cliente)}</div>
        <div class="servicio-card-direccion">${escapeHtml(item.direccion)}${item.localidad ? ", " + escapeHtml(item.localidad) : ""}</div>
        <div class="servicio-card-tarea">${escapeHtml(item.tarea)}</div>
        ${item.cobrador ? `<div class="servicio-card-cobrador">Cobrador: ${escapeHtml(item.cobrador)}</div>` : ""}
      </div>
      <div class="sv-n">
        <div class="sv-n-fila">
          <span class="sv-n-num">N° ${escapeHtml(item.numero_servicio)}</span>
          <span class="sv-n-edad e-${estadoN}">${edadN ? edadN : ""}</span>
        </div>
        <div class="sv-n-cliente">${escapeHtml(item.cliente)}</div>
        <div class="sv-n-dir">${escapeHtml(item.direccion)}${item.localidad ? " · " + escapeHtml(item.localidad) : ""}</div>
        <div class="sv-n-tarea">${escapeHtml(item.tarea)}</div>
        ${(item.cobrador || parteHecho) ? `<div class="sv-n-pie">${item.cobrador ? `<span>Cobrador: ${escapeHtml(item.cobrador)}</span>` : ""}${badgeParte}</div>` : ""}
      </div>
    `;
    card.addEventListener("click", () => seleccionarServicio(item));
    serviciosListEl.appendChild(card);
  });
}

serviciosSearch.addEventListener("input", () => {
  renderServiciosList(filtrarServicios());
});

// Saca un servicio de la lista compartida (GitHub) apenas se
// completa, para que desaparezca para todo el equipo — no solo en el
// celular de quien lo completó. Trae la lista fresca del servidor
// justo antes de guardar (en vez de confiar en la caché local) para
// minimizar el riesgo de pisar un cambio de otro técnico/oficina que
// haya pasado casi al mismo tiempo.
async function eliminarServicioDeListaCompartida(numeroServicio) {
  const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
  const res = await fetch(SERVICIOS_URL, { headers, cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo leer la lista actual (HTTP " + res.status + ")");
  const listaActual = await res.json();
  const listaFiltrada = (Array.isArray(listaActual) ? listaActual : []).filter(
    (s) => s.numero_servicio !== numeroServicio
  );
  if (listaFiltrada.length === listaActual.length) return; // ya no estaba, nada que hacer

  const resGuardar = await fetch(SERVICIOS_URL, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(listaFiltrada),
  });
  if (!resGuardar.ok) throw new Error("No se pudo guardar la lista actualizada (HTTP " + resGuardar.status + ")");
}

async function fetchServicios() {
  listStatus.textContent = "Buscando servicios...";
  try {
    const headers = {};
    if (SERVICIOS_API_TOKEN) headers["Authorization"] = "Bearer " + SERVICIOS_API_TOKEN;
    const res = await fetch(SERVICIOS_URL, { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    serviciosCache = Array.isArray(data) ? data : [];
    localStorage.setItem("servicios_cache", JSON.stringify(serviciosCache));
    localStorage.setItem("servicios_cache_time", String(Date.now()));
    // Un listado nuevo desde el servidor "reinicia" las marcas de
    // resuelto — según lo pedido, deben durar solo hasta que se
    // cargue el próximo listado.
    serviciosResueltos = new Set();
    localStorage.removeItem("servicios_resueltos");
    syncLabel.textContent = formatSyncTime(new Date());
    renderServiciosList(filtrarServicios());
    sincronizarServiciosVistos(serviciosCache);
  } catch (err) {
    const cachedRaw = localStorage.getItem("servicios_cache");
    const cachedTime = localStorage.getItem("servicios_cache_time");
    if (cachedRaw) {
      serviciosCache = JSON.parse(cachedRaw);
      renderServiciosList(filtrarServicios());
      const when = cachedTime ? formatSyncTime(new Date(Number(cachedTime))) : "";
      listStatus.textContent = "Sin conexión con el servidor. Mostrando la última lista guardada.";
      syncLabel.textContent = when;
    } else {
      serviciosCache = [];
      renderServiciosList([]);
      listStatus.textContent = "No se pudo conectar con el servidor y no hay una lista guardada.";
    }
  }
}

function actualizarBotonLlamar(telefono) {
  const numero = (telefono || "").toString().trim();
  if (numero) {
    // Se limpian espacios/guiones para armar un link tel: válido.
    llamarClienteBtn.href = "tel:" + numero.replace(/[^\d+]/g, "");
    llamarClienteBtn.classList.remove("hidden");
  } else {
    llamarClienteBtn.href = "#";
    llamarClienteBtn.classList.add("hidden");
  }
}

// ---------- Aviso "estoy en camino" por WhatsApp (link wa.me) ----------
const whatsappClienteBtn = document.getElementById("whatsappClienteBtn");

function limpiarTelefonoWhatsapp(numero) {
  let limpio = (numero || "").toString().replace(/\D/g, "");
  if (!limpio) return "";
  // Si no viene con código de país, se asume Argentina (54) + el 9 que
  // llevan los celulares en WhatsApp. Puede necesitar ajuste según el
  // formato real de los teléfonos que carga el ERP — probar con un
  // número real y corregir acá si hace falta.
  if (!limpio.startsWith("54")) {
    limpio = "549" + limpio.replace(/^0/, "");
  }
  return limpio;
}

function actualizarBotonWhatsapp(telefono) {
  const numero = (telefono || "").toString().trim();
  if (numero) {
    whatsappClienteBtn.dataset.telefono = numero;
    whatsappClienteBtn.classList.remove("hidden");
  } else {
    whatsappClienteBtn.dataset.telefono = "";
    whatsappClienteBtn.classList.add("hidden");
  }
}

whatsappClienteBtn.addEventListener("click", (e) => {
  const numero = limpiarTelefonoWhatsapp(whatsappClienteBtn.dataset.telefono);
  if (!numero) {
    e.preventDefault();
    return;
  }
  const tecnico = getTecnicoValue() || "un técnico";
  const mensaje = `Hola! Soy ${tecnico}, técnico de SAT (seguridad electrónica). Le escribo para avisarle que estoy en camino a su domicilio para el servicio técnico. ¡Nos vemos pronto!`;
  whatsappClienteBtn.href = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
});

// ---------- Acceso directo al plano del cliente, si el servicio trae número de cliente ----------
const verPlanoClienteBtn = document.getElementById("verPlanoClienteBtn");
let numeroClienteActivo = "";

function actualizarBotonVerPlano(numeroCliente) {
  numeroClienteActivo = (numeroCliente || "").toString().trim();
  verPlanoClienteBtn.classList.toggle("hidden", !numeroClienteActivo);
}

const cobradorInfo = document.getElementById("cobradorInfo");
function actualizarCobradorInfo(cobrador) {
  const nombre = (cobrador || "").toString().trim();
  cobradorInfo.textContent = "Cobrador: " + (nombre || "Sin cobrador asignado");
}

verPlanoClienteBtn.addEventListener("click", async () => {
  if (!numeroClienteActivo) return;
  const iconoOriginal = verPlanoClienteBtn.innerHTML;
  verPlanoClienteBtn.disabled = true;
  try {
    // Las carpetas de planos usan el número de cliente con 8 dígitos
    // y ceros a la izquierda (CLI_00001374) — el número que trae el
    // servicio pendiente puede venir sin ese relleno (ej: "1374"), así
    // que hay que armarlo igual antes de buscar, si no nunca matchea.
    const numeroConCeros = numeroClienteActivo.trim().replace(/\.0+$/, "").replace(/\D/g, "").padStart(8, "0");
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch(`/api/planos?nombre=${encodeURIComponent("CLI_" + numeroConCeros)}`, { headers });
    if (!res.ok) throw new Error(res.status === 404 ? "Todavía no hay un plano subido para este cliente" : "No se pudo abrir el plano");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  } catch (err) {
    showToast(err.message);
  } finally {
    verPlanoClienteBtn.innerHTML = iconoOriginal;
    verPlanoClienteBtn.disabled = false;
  }
});

function seleccionarServicio(item) {
  currentNumeroServicio = item.numero_servicio ?? "";
  currentNumeroCliente = item.numero_cliente ?? "";
  document.getElementById("f_cliente").value = item.cliente ?? "";
  document.getElementById("f_direccion").value = item.direccion ?? "";
  if (item.localidad) document.getElementById("f_localidad").value = item.localidad;
  setTareaAsignada(item.tarea);
  document.getElementById("f_tarea").value = "";
  actualizarBotonLlamar(item.telefono);
  actualizarBotonWhatsapp(item.telefono);
  actualizarBotonVerPlano(item.numero_cliente);
  actualizarCobradorInfo(item.cobrador);
  autocompletarTecnico();
  autocompletarFecha();
  mostrarVisitaAnterior();
  cargarOpcionesSimInstalar();
  const restaurado = restaurarBorradorSiExiste(currentNumeroServicio);
  if (restaurado) {
    showToast("Se restauró lo que ya tenías cargado en este servicio.");
  }
  showScreen("form");
}

refreshServiciosBtn.addEventListener("click", fetchServicios);
manualReportBtn.addEventListener("click", () => {
  currentNumeroServicio = "";
  currentNumeroCliente = "";
  actualizarBotonLlamar(null);
  actualizarBotonWhatsapp(null);
  actualizarBotonVerPlano(null);
  actualizarCobradorInfo(null);
  autocompletarTecnico();
  autocompletarFecha();
  mostrarVisitaAnterior();
  cargarOpcionesSimInstalar();
  showScreen("form");
});


// ======================================================================
// Ficha del cliente (skin nuevo): todo lo que sabemos de un cliente en
// una sola pantalla — pendientes, últimas visitas, claves, SIM, plano.
// ======================================================================
const homeBuscarCliente = document.getElementById("homeBuscarCliente");
const homeBuscarResultados = document.getElementById("homeBuscarResultados");
let fichaClienteActual = null;

function candidatosFicha() {
  // Clientes de la base + los que aparecen en pendientes (por si todavía no están en la base)
  const mapa = new Map();
  (clientesGeneralCache || []).forEach((c) => { if (c.nombre) mapa.set("c:" + (c.numero_cliente || c.nombre), { ...c }); });
  (serviciosCache || []).forEach((sv) => {
    if (!sv.cliente) return;
    const ya = [...mapa.values()].some((c) => normalizeText(c.nombre) === normalizeText(sv.cliente));
    if (!ya) mapa.set("s:" + sv.cliente, { nombre: sv.cliente, direccion: sv.direccion, localidad: sv.localidad, telefono: sv.telefono });
  });
  return [...mapa.values()];
}
function buscarClientesFicha(texto) {
  const t = normalizeText(texto);
  if (t.length < 2) return [];
  const num = texto.replace(/\D/g, "");
  return candidatosFicha().filter((c) =>
    normalizeText(`${c.nombre} ${c.direccion || ""} ${c.localidad || ""}`).includes(t) ||
    (num.length >= 2 && String(c.numero_cliente || "").replace(/\D/g, "").includes(num))
  ).slice(0, 8);
}
homeBuscarCliente.addEventListener("focus", () => { cargarClientesGeneral(); });
homeBuscarCliente.addEventListener("input", () => {
  const lista = buscarClientesFicha(homeBuscarCliente.value);
  homeBuscarResultados.innerHTML = !homeBuscarCliente.value.trim() ? "" : lista.length
    ? lista.map((c, i) => `<button type="button" class="home-buscar-item" data-i="${i}"><b>${escapeHtml(c.nombre)}</b><span>${escapeHtml([c.direccion, c.localidad].filter(Boolean).join(", "))}${c.numero_cliente ? " · N° " + escapeHtml(c.numero_cliente) : ""}</span></button>`).join("")
    : '<p class="list-status">No encontramos ese cliente.</p>';
  homeBuscarResultados.querySelectorAll(".home-buscar-item").forEach((b) => b.addEventListener("click", () => abrirFichaCliente(lista[Number(b.dataset.i)])));
});
document.getElementById("volverDeFichaBtn").addEventListener("click", () => showScreen("home"));

function mismoCliente(c, nombre, numero) {
  if (c.numero_cliente && numero && normalizarNumeroCliente(String(c.numero_cliente)) === normalizarNumeroCliente(String(numero))) return true;
  return !!nombre && normalizeText(nombre) === normalizeText(c.nombre);
}
function clavesDeParte(h) {
  let c = h.claves;
  if (typeof c === "string") { try { c = JSON.parse(c); } catch (e) { c = []; } }
  return Array.isArray(c) ? c : [];
}

async function abrirFichaCliente(c) {
  fichaClienteActual = c;
  homeBuscarCliente.value = "";
  homeBuscarResultados.innerHTML = "";
  showScreen("fichaCliente");
  document.getElementById("fichaNombre").textContent = c.nombre;
  const nombreEl = document.getElementById("fichaNombre");
  nombreEl.style.textTransform = "none";
  document.getElementById("fichaSub").textContent = [[c.direccion, c.localidad].filter(Boolean).join(", "), c.numero_cliente ? "Cliente N° " + c.numero_cliente : "", c.numero_abonado ? "Abonado " + c.numero_abonado : ""].filter(Boolean).join(" · ");
  const seccion = document.getElementById("topbarSeccion");
  if (seccion) seccion.textContent = "Ficha del cliente";

  // Acciones
  const tel = String(c.telefono || "").trim();
  const q = encodeURIComponent([c.direccion, c.localidad, "Argentina"].filter(Boolean).join(", "));
  const urlMapa = leerAjustes().appMapas === "waze" ? `https://waze.com/ul?q=${q}&navigate=yes` : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  document.getElementById("fichaAcciones").innerHTML = `
    <button type="button" class="btn btn-primary" id="fichaParteBtn">Cargar parte</button>
    <div class="ficha-acciones-fila">
      ${tel ? `<a class="btn btn-secondary" href="tel:${escapeHtml(tel.replace(/[^\d+]/g, ""))}">Llamar</a>` : ""}
      ${c.direccion ? `<a class="btn btn-secondary" href="${urlMapa}" target="_blank" rel="noopener">Cómo llegar</a>` : ""}
    </div>`;
  document.getElementById("fichaParteBtn").addEventListener("click", () => {
    const pend = (serviciosCache || []).find((sv) => mismoCliente(c, sv.cliente, sv.numero_cliente));
    if (pend) { seleccionarServicio(pend); return; }
    manualReportBtn.click();
    document.getElementById("f_cliente").value = c.nombre || "";
    document.getElementById("f_direccion").value = c.direccion || "";
    const loc = document.getElementById("f_localidad"); if (loc) loc.value = c.localidad || "";
    currentNumeroCliente = c.numero_cliente || "";
    document.getElementById("f_cliente").dispatchEvent(new Event("input", { bubbles: true }));
  });

  const cont = document.getElementById("fichaSecciones");
  cont.innerHTML = '<p class="list-status">Juntando la información del cliente...</p>';
  // Lo que ya está en memoria se muestra enseguida; lo demás se trae.
  try { if (!historialCache.length) await precargarHistorialParaVisitas(); } catch (e) { /* sin señal */ }
  if (fichaClienteActual !== c) return;
  const pendientes = (serviciosCache || []).filter((sv) => mismoCliente(c, sv.cliente, sv.numero_cliente));
  const visitas = historialCache.filter((h) => mismoCliente(c, h.cliente, h.numero_cliente))
    .sort((a, b) => `${b.fecha || ""} ${b.hora_entrada || ""}`.localeCompare(`${a.fecha || ""} ${a.hora_entrada || ""}`));
  const claves = [];
  visitas.forEach((h) => clavesDeParte(h).forEach((k) => {
    if (!claves.some((x) => x.titulo === k.titulo && x.usuario === k.usuario && x.clave === k.clave)) claves.push({ ...k, fecha: h.fecha });
  }));
  const fecha = (f) => (f ? f.split("-").reverse().join("/") : "");
  const bloques = [];
  bloques.push(`<div class="ficha-bloque"><p class="dash-subtitulo">Pendientes</p>${pendientes.length ? pendientes.map((sv) => `<button type="button" class="ficha-pend" data-num="${escapeHtml(sv.numero_servicio || "")}"><b>N° ${escapeHtml(sv.numero_servicio || "")}</b> ${escapeHtml(sv.tarea || "")}</button>`).join("") : '<p class="list-status">No tiene servicios pendientes.</p>'}</div>`);
  bloques.push(`<div class="ficha-bloque"><p class="dash-subtitulo">Últimas visitas${visitas.length ? ` <span class="ficha-cuenta">(${visitas.length})</span>` : ""}</p>${visitas.length ? visitas.slice(0, 5).map((h) => `<div class="ficha-visita"><div class="ficha-visita-top"><b>${fecha(h.fecha)}</b> · ${escapeHtml(h.tecnico || "")}${h.es_instalacion ? ' · <span class="ficha-tag">Instalación</span>' : ""}</div>${h.tarea ? `<div class="ficha-visita-tarea">${escapeHtml(h.tarea)}</div>` : ""}${h.observaciones ? `<div class="ficha-visita-obs">${escapeHtml(h.observaciones)}</div>` : ""}${h.materiales ? `<div class="ficha-visita-obs">Materiales: ${escapeHtml(h.materiales)}</div>` : ""}</div>`).join("") : '<p class="list-status">Sin visitas registradas en la app.</p>'}</div>`);
  bloques.push(`<div class="ficha-bloque"><p class="dash-subtitulo">Claves y códigos</p>${claves.length ? `<button type="button" class="btn btn-ghost btn-small" id="fichaVerClavesBtn">Mostrar ${claves.length} clave${claves.length === 1 ? "" : "s"} guardada${claves.length === 1 ? "" : "s"}</button><div id="fichaClaves" hidden>${claves.map((k) => `<div class="ficha-clave"><b>${escapeHtml(k.titulo || "Clave")}</b>${k.usuario ? `<span>Usuario: <code>${escapeHtml(k.usuario)}</code></span>` : ""}${k.clave ? `<span>Clave: <code>${escapeHtml(k.clave)}</code></span>` : ""}${k.codigo ? `<span>Código: <code>${escapeHtml(k.codigo)}</code></span>` : ""}<small>del ${fecha(k.fecha)}</small></div>`).join("")}</div>` : '<p class="list-status">No hay claves cargadas en los partes.</p>'}</div>`);
  bloques.push(`<div class="ficha-bloque" id="fichaSimBloque"><p class="dash-subtitulo">SIM instalada</p><p class="list-status">Buscando...</p></div>`);
  bloques.push(`<div class="ficha-bloque" id="fichaPlanoBloque"><p class="dash-subtitulo">Plano</p><p class="list-status">Buscando...</p></div>`);
  cont.innerHTML = bloques.join("");
  const verClaves = document.getElementById("fichaVerClavesBtn");
  if (verClaves) verClaves.addEventListener("click", () => { document.getElementById("fichaClaves").hidden = false; verClaves.remove(); });
  cont.querySelectorAll(".ficha-pend").forEach((b) => b.addEventListener("click", () => {
    const sv = pendientes.find((x) => String(x.numero_servicio || "") === b.dataset.num);
    if (sv) seleccionarServicio(sv);
  }));

  // SIM instalada (registro de instaladas)
  (async () => {
    const bloque = document.getElementById("fichaSimBloque");
    try {
      if (!simsRegistroCache) await cargarSimsRegistro();
      if (fichaClienteActual !== c || !bloque) return;
      const sims = (simsRegistroCache || []).filter((x) => mismoCliente(c, x.cliente, x.numero_cliente));
      bloque.innerHTML = `<p class="dash-subtitulo">SIM instalada</p>${sims.length ? sims.map((x) => `<div class="ficha-sim"><span class="sim-card-dot" style="background:${COLORES_COMPANIA_SIM[x.empresa] || "#8A9089"};"></span><b>${escapeHtml(x.numero)}</b> · ${escapeHtml(x.empresa || "")}${x.estado_linea ? ` · ${escapeHtml(x.estado_linea)}` : ""}${x.fecha_activacion ? `<small> desde ${escapeHtml(x.fecha_activacion)}</small>` : ""}</div>`).join("") : '<p class="list-status">No tiene una SIM registrada.</p>'}`;
    } catch (e) { if (bloque) bloque.innerHTML = '<p class="dash-subtitulo">SIM instalada</p><p class="list-status">No se pudo consultar.</p>'; }
  })();
  // Plano
  (async () => {
    const bloque = document.getElementById("fichaPlanoBloque");
    try {
      await cargarPlanos();
      if (fichaClienteActual !== c || !bloque) return;
      const planos = (planosCache || []).filter((p) => (c.numero_cliente && p.numero_cliente && normalizarNumeroCliente(p.numero_cliente) === normalizarNumeroCliente(String(c.numero_cliente))) || (p.nombre_cliente && normalizeText(p.nombre_cliente) === normalizeText(c.nombre)))
        .sort((a, b) => a.indice_plano - b.indice_plano);
      bloque.innerHTML = `<p class="dash-subtitulo">Plano</p>${planos.length ? `<div class="ficha-planos">${planos.map((p, i) => `<button type="button" class="btn btn-secondary btn-small" data-nombre="${escapeHtml(p.nombre)}">${planos.length > 1 ? "Plano " + (i + 1) : "Ver plano"}</button>`).join("")}</div>` : '<p class="list-status">No tiene plano cargado.</p>'}`;
      bloque.querySelectorAll("button[data-nombre]").forEach((b) => b.addEventListener("click", () => abrirPlano(b.dataset.nombre, b)));
    } catch (e) { if (bloque) bloque.innerHTML = '<p class="dash-subtitulo">Plano</p><p class="list-status">No se pudo consultar.</p>'; }
  })();
}


// ======================================================================
// Skin nuevo: avisos en las teclas del inicio, estado de conexión en la
// barra, deslizar para actualizar e inicio más simple.
// ======================================================================
let avisosInicioUltimo = 0;
function ponerBadge(id, n, texto) {
  const el = document.getElementById(id);
  if (!el) return;
  const mostrar = esSkinNuevo() && n > 0;
  el.classList.toggle("hidden", !mostrar);
  if (mostrar) el.textContent = texto || String(n);
}
async function actualizarAvisosInicio(forzar) {
  if (!esSkinNuevo() || !tecnicoLogueado) { ["simsAvisoBadge", "rendicionAvisoBadge", "instalacionAvisoBadge"].forEach((id) => ponerBadge(id, 0)); return; }
  if (!forzar && Date.now() - avisosInicioUltimo < 120000) return;
  avisosInicioUltimo = Date.now();
  const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
  const yo = tecnicoLogueado;
  const pedir = (url) => fetch(url, { headers, cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [pend, rends, inst] = await Promise.all([
    pedir(`/api/recurso-uso?recurso=sim&pendientes=1&tecnico=${encodeURIComponent(yo)}`),
    pedir("/api/recurso-uso?recurso=rendicion"),
    pedir(`/api/historial?tipo=instalacion_abierta&tecnico=${encodeURIComponent(yo)}`),
  ]);
  if (yo !== tecnicoLogueado) return;
  if (Array.isArray(pend)) ponerBadge("simsAvisoBadge", pend.length);
  if (Array.isArray(rends)) {
    let vistas = [];
    try { vistas = JSON.parse(localStorage.getItem("rendiciones_vistas") || "[]"); } catch (e) { vistas = []; }
    const novedades = rends.filter((r) => r.tecnico === yo && (r.estado === "rechazado" || r.estado === "pagado") && !vistas.includes(`${r.id}:${r.estado}`));
    ponerBadge("rendicionAvisoBadge", novedades.length);
  }
  if (inst && typeof inst === "object") ponerBadge("instalacionAvisoBadge", inst.abierta ? 1 : 0, "Abierta");
}
// Al entrar a Rendir ticket, lo pagado/rechazado queda como visto.
document.getElementById("tileRendicionBtn").addEventListener("click", () => {
  setTimeout(() => {
    try {
      const vistas = (rendicionesCache || []).filter((r) => r.estado === "rechazado" || r.estado === "pagado").map((r) => `${r.id}:${r.estado}`);
      const previas = JSON.parse(localStorage.getItem("rendiciones_vistas") || "[]");
      localStorage.setItem("rendiciones_vistas", JSON.stringify([...new Set([...previas, ...vistas])].slice(-300)));
      ponerBadge("rendicionAvisoBadge", 0);
    } catch (e) { /* nada */ }
  }, 2500);
});

// Estado de conexión en la barra (en vez de "LISTO" fijo)
function actualizarPillConexion() {
  if (!esSkinNuevo() || statusPill.classList.contains("busy")) return;
  const cola = typeof obtenerColaEnvios === "function" ? obtenerColaEnvios().length : 0;
  const sinSenal = navigator.onLine === false;
  statusPill.classList.toggle("sin-senal", sinSenal);
  statusPill.classList.toggle("por-enviar", !sinSenal && cola > 0);
  statusPill.textContent = sinSenal ? (cola ? `Sin señal · ${cola} por enviar` : "Sin señal") : (cola ? `${cola} por enviar` : "Conectado");
}
window.addEventListener("online", actualizarPillConexion);
window.addEventListener("offline", actualizarPillConexion);
setInterval(actualizarPillConexion, 15000);

// Botón/gesto "atrás" de Android: no hace nada (para que no se cierre
// la app sin querer). Se deja siempre una entrada "de más" en el
// historial del navegador; cuando el sistema la consume, se vuelve a
// poner. Chrome ignora las entradas agregadas sin un toque del usuario,
// así que se re-arma en el siguiente toque.
(function bloquearAtrasAndroid() {
  let armado = false;
  const armar = () => {
    if (armado) return;
    try { history.pushState({ satTrampa: Date.now() }, ""); armado = true; } catch (e) { /* nada */ }
  };
  window.addEventListener("popstate", () => {
    // Se repone ya (por si Chrome la respeta) y se vuelve a poner con el próximo toque.
    try { history.pushState({ satTrampa: Date.now() }, ""); } catch (e) { /* nada */ }
    armado = false;
  });
  ["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, armar, { capture: true, passive: true }));
  armar();
})();

// Deslizar hacia abajo para actualizar (en el celular, reemplaza los botones "Actualizar")
const ACCION_REFRESCO = {
  home: () => { precargarCronogramaParaSugerencias().then(() => actualizarProximoService()); fetchServicios(); actualizarAvisosInicio(true); actualizarVehiculoInicio(); },
  notas: () => fetchNotas(),
  sims: () => { renderSimsLista(); cargarTransferenciasPendientes(); cargarTransferenciasMandadas(); },
  vehiculos: () => renderVehiculosPicker(),
  vehiculoDetalle: () => renderVehiculoDetalle(),
};
function instalarDeslizarParaActualizar() {
  Object.entries(screens).forEach(([nombre, pantalla]) => {
    const scroll = pantalla && pantalla.querySelector(".review-scroll");
    if (!scroll) return;
    const boton = scroll.querySelector('button[id^="refresh"][id$="Btn"]');
    const accion = ACCION_REFRESCO[nombre] || (boton ? () => boton.click() : null);
    if (!accion) return;
    const ind = document.createElement("div");
    ind.className = "ptr-indicador";
    ind.innerHTML = '<span class="ptr-flecha">↓</span><span class="ptr-texto">Deslizá para actualizar</span>';
    scroll.prepend(ind);
    let y0 = null, dy = 0;
    scroll.addEventListener("touchstart", (e) => { if (!esSkinNuevo() || scroll.scrollTop > 0) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
    scroll.addEventListener("touchmove", (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      const alto = Math.min(70, dy * 0.5);
      ind.style.height = alto + "px";
      ind.classList.toggle("listo", dy > 120);
      ind.querySelector(".ptr-texto").textContent = dy > 120 ? "Soltá para actualizar" : "Deslizá para actualizar";
    }, { passive: true });
    scroll.addEventListener("touchend", () => {
      if (y0 === null) return;
      const disparar = dy > 120;
      y0 = null;
      if (disparar) {
        ind.classList.add("cargando");
        ind.querySelector(".ptr-texto").textContent = "Actualizando...";
        try { accion(); } catch (e) { /* nada */ }
        setTimeout(() => { ind.style.height = "0"; ind.classList.remove("cargando", "listo"); }, 900);
      } else {
        ind.style.height = "0";
      }
    });
  });
}
instalarDeslizarParaActualizar();
try { actualizarPillConexion(); } catch (e) { /* nada */ }

document.getElementById("ajusteOrdenAutoBtn").addEventListener("click", () => {
  const aj = leerAjustes();
  aj.mosaicos = { orden: [], ocultos: (aj.mosaicos && aj.mosaicos.ocultos) || [] };
  guardarAjustes(aj);
  aplicarMosaicos();
  renderAjustes();
  try { renderMosaicosAjustes(); } catch (e) { /* nada */ }
  showToast("Listo: las teclas se ordenan solas según el uso.");
});
document.getElementById("ajusteNotifBtn").addEventListener("click", async () => {
  try { await activarNotificacionesFlow(false); } catch (e) { /* se avisa adentro */ }
  verificarEstadoNotificaciones();
});
// Firma (skin nuevo): lo que el cliente está firmando, a la vista.
function pintarResumenFirma() {
  const el = document.getElementById("signResumen");
  if (!el) return;
  el.hidden = !esSkinNuevo();
  if (el.hidden) return;
  const v = (id) => ((document.getElementById(id) || {}).value || "").trim();
  const costo = v("f_costo_final") || v("f_importe");
  let forma = "";
  try { forma = getFormaPago(); } catch (e) { /* nada */ }
  const tarea = v("f_tarea");
  el.innerHTML = `<b>${escapeHtml(v("f_cliente") || "Cliente")}</b>${v("f_direccion") ? `<span>${escapeHtml(v("f_direccion"))}</span>` : ""}${tarea ? `<span class="sr-tarea">${escapeHtml(tarea.length > 140 ? tarea.slice(0, 140) + "…" : tarea)}</span>` : ""}${costo ? `<span class="sr-monto">Total: ${escapeHtml(costo)}${forma ? " · " + escapeHtml(forma) : ""}</span>` : ""}`;
}
// Inicio: las teclas se ordenan solas por uso (si no se ordenaron a mano)
function leerUsoMosaicos() { try { return JSON.parse(localStorage.getItem("uso_mosaicos") || "{}") || {}; } catch (e) { return {}; } }
mosaicosDelInicio().forEach((el) => el.addEventListener("click", () => {
  const uso = leerUsoMosaicos();
  uso[el.id] = (uso[el.id] || 0) + 1;
  try { localStorage.setItem("uso_mosaicos", JSON.stringify(uso)); } catch (e) { /* nada */ }
}));

// ---------- Cronograma semanal ----------
let cronogramaCache = [];
let cronogramaTecnicosCache = [];
let cronoDiaActivo = "";

async function fetchCronograma() {
  cronoStatus.textContent = "Buscando cronograma...";
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/cronograma", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    cronogramaCache = Array.isArray(data.tareas) ? data.tareas : [];
    cronogramaTecnicosCache = Array.isArray(data.tecnicos) ? data.tecnicos : [];
    localStorage.setItem("cronograma_cache", JSON.stringify(cronogramaCache));
    localStorage.setItem("cronograma_tecnicos_cache", JSON.stringify(cronogramaTecnicosCache));
    localStorage.setItem("cronograma_cache_time", String(Date.now()));
    cronoSyncLabel.textContent = formatSyncTime(new Date());
    renderCronogramaDias();
    if (data.fuente === "respaldo") {
      cronoStatus.textContent = `No se pudo leer Drive en este momento (${data.error_drive || "sin detalle"}). Mostrando la última copia guardada.`;
    }
  } catch (err) {
    const cachedRaw = localStorage.getItem("cronograma_cache");
    const cachedTecnicosRaw = localStorage.getItem("cronograma_tecnicos_cache");
    const cachedTime = localStorage.getItem("cronograma_cache_time");
    if (cachedRaw) {
      cronogramaCache = JSON.parse(cachedRaw);
      cronogramaTecnicosCache = cachedTecnicosRaw ? JSON.parse(cachedTecnicosRaw) : [];
      renderCronogramaDias();
      const when = cachedTime ? formatSyncTime(new Date(Number(cachedTime))) : "";
      cronoStatus.textContent = "Sin conexión. Mostrando el último cronograma guardado.";
      cronoSyncLabel.textContent = when;
    } else {
      cronogramaCache = [];
      cronoStatus.textContent = "No se pudo conectar y no hay un cronograma guardado.";
    }
  }
}

let aplicarFiltroPropioCrono = false;
function renderCronogramaDias() {
  const dias = [...new Set(cronogramaCache.map((t) => t.dia_label))]
    .filter(Boolean)
    .sort((a, b) => {
      const fa = (cronogramaCache.find((t) => t.dia_label === a) || {}).fecha || "";
      const fb = (cronogramaCache.find((t) => t.dia_label === b) || {}).fecha || "";
      return fa.localeCompare(fb);
    });

  if (dias.length === 0) {
    cronoDiasTabs.innerHTML = "";
    cronoStatus.textContent = "No hay ningún cronograma cargado todavía.";
    cronoTareasList.innerHTML = "";
    return;
  }

  if (!dias.includes(cronoDiaActivo)) {
    // Se prefiere el día de hoy si está en el cronograma — así el
    // técnico entra directo a lo que le importa, sin tener que
    // buscar entre los días pasados.
    const hoyLocal = new Date();
    const fechaHoyISO = `${hoyLocal.getFullYear()}-${String(hoyLocal.getMonth() + 1).padStart(2, "0")}-${String(hoyLocal.getDate()).padStart(2, "0")}`;
    const diaDeHoy = dias.find((d) => (cronogramaCache.find((t) => t.dia_label === d) || {}).fecha === fechaHoyISO);
    cronoDiaActivo = diaDeHoy || dias[0];
    aplicarFiltroPropioCrono = document.documentElement.dataset.inicio === "nuevo";
  }

  cronoDiasTabs.innerHTML = "";
  dias.forEach((dia) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "crono-dia-chip" + (dia === cronoDiaActivo ? " active" : "");
    const delDia = cronogramaCache.filter((t) => t.dia_label === dia);
    const fechaDia = (delDia[0] || {}).fecha || "";
    const hoyChip = new Date();
    const esHoy = fechaDia === `${hoyChip.getFullYear()}-${String(hoyChip.getMonth() + 1).padStart(2, "0")}-${String(hoyChip.getDate()).padStart(2, "0")}`;
    chip.dataset.dia = dia;
    chip.dataset.hoy = esHoy ? "1" : "";
    chip.innerHTML = `${escapeHtml(dia)}<span class="crono-dia-extra solo-nuevo"></span>`;
    chip.addEventListener("click", () => {
      cronoDiaActivo = dia;
      renderCronogramaDias();
    });
    cronoDiasTabs.appendChild(chip);
  });
  const chipActivo = cronoDiasTabs.querySelector(".crono-dia-chip.active");
  if (chipActivo) chipActivo.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

  // Filtro de técnicos: se arma con la lista completa detectada en el
  // Excel (todas las columnas), no solo los que ya tienen alguna tarea
  // cargada — así aparecen también los que por ahora no tienen nada.
  const tecnicoActual = cronoTecnicoFiltro.value;
  const tecnicosConTareas = cronogramaCache.map((t) => t.tecnico);
  const tecnicos = [...new Set([...cronogramaTecnicosCache, ...tecnicosConTareas])].filter(Boolean).sort();
  cronoTecnicoFiltro.innerHTML = '<option value="">Todos los técnicos</option>' +
    tecnicos.map((t) => `<option value="${t}">${t}</option>`).join("");
  cronoTecnicoFiltro.value = tecnicos.includes(tecnicoActual) ? tecnicoActual : "";
  // Skin nuevo: al entrar, el técnico ve primero SU agenda (puede cambiar a "Todos").
  if (aplicarFiltroPropioCrono) {
    aplicarFiltroPropioCrono = false;
    const propio = tecnicos.find((n) => coincideNombreTecnico(n, tecnicoLogueado));
    if (propio && tecnicoLogueado) cronoTecnicoFiltro.value = propio;
  }

  renderCronogramaTareas();
}

// Cantidad de tareas de cada día (respetando el técnico elegido), debajo del día.
function actualizarContadoresDias() {
  const tec = cronoTecnicoFiltro.value;
  cronoDiasTabs.querySelectorAll(".crono-dia-chip").forEach((chip) => {
    const n = cronogramaCache.filter((t) => t.dia_label === chip.dataset.dia && (!tec || t.tecnico === tec)).length;
    const extra = chip.querySelector(".crono-dia-extra");
    if (extra) extra.textContent = (chip.dataset.hoy ? "Hoy · " : "") + (n === 1 ? "1 tarea" : n + " tareas");
  });
}

function renderCronogramaTareas() {
  actualizarContadoresDias();
  const tecnicoFiltro = cronoTecnicoFiltro.value;
  const tareas = cronogramaCache
    .filter((t) => t.dia_label === cronoDiaActivo)
    .filter((t) => !tecnicoFiltro || t.tecnico === tecnicoFiltro)
    .sort((a, b) => (a.hora_inicio || "").localeCompare(b.hora_inicio || ""));

  cronoTareasList.innerHTML = "";
  if (tareas.length === 0) {
    cronoStatus.textContent = "No hay tareas cargadas para ese día/técnico.";
    return;
  }
  cronoStatus.textContent = "";
  tareas.forEach((t) => {
    const info = infoTarea(t);
    const vinculado = info.vinculado;
    const resuelto = info.resuelto;
    const estado = resuelto ? "resuelto" : vinculado ? "pendiente" : "sin-vincular";
    const fechaParte = info.parte && info.parte.fecha ? info.parte.fecha.split("-").reverse().slice(0, 2).join("/") : "";
    const etiquetaEstado = resuelto ? "Resuelto" + (fechaParte ? " · " + fechaParte : "") : vinculado ? "Pendiente" : "Sin vincular";
    const lineas = String(t.tarea || "").split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed = parsearTareaCronograma(t.tarea);
    const clienteN = parsed.cliente || lineas[0] || "Servicio";
    const dirN = [parsed.direccion, parsed.localidad].filter(Boolean).join(" · ");
    const detalleN = lineas.slice(2).join(" · ");
    const card = document.createElement("button");
    card.type = "button";
    card.dataset.estado = estado;
    card.className = "crono-tarea-card" + (vinculado ? "" : " sin-vincular") + (resuelto ? " resuelto" : "");
    card.innerHTML = `
      <div class="crono-c">
        <div class="crono-tarea-hora">${t.hora_inicio || ""} - ${t.hora_fin || ""}${
          resuelto ? '<span class="crono-tarea-badge resuelto">RESUELTO</span>' : vinculado ? "" : '<span class="crono-tarea-badge">SIN VINCULAR</span>'
        }</div>
        <div class="crono-tarea-tecnico">${escapeHtml(t.tecnico)}</div>
        <div class="crono-tarea-texto">${escapeHtml(t.tarea)}</div>
      </div>
      <div class="crono-n">
        <div class="crono-n-hora"><b>${escapeHtml(t.hora_inicio || "--:--")}</b>${t.hora_fin ? `<span>${escapeHtml(t.hora_fin)}</span>` : ""}</div>
        <div class="crono-n-cuerpo">
          <div class="crono-n-cliente">${escapeHtml(clienteN)}</div>
          ${dirN ? `<div class="crono-n-dir">${escapeHtml(dirN)}</div>` : ""}
          ${detalleN ? `<div class="crono-n-detalle">${escapeHtml(detalleN)}</div>` : ""}
          <div class="crono-n-pie"><span class="crono-n-tec">${escapeHtml(t.tecnico)}</span><span class="crono-n-estado e-${estado}">${escapeHtml(etiquetaEstado)}</span></div>
        </div>
      </div>
    `;
    card.addEventListener("click", () => seleccionarTareaCronograma(t));
    cronoTareasList.appendChild(card);
  });
}

cronoTecnicoFiltro.addEventListener("change", renderCronogramaTareas);

// ---------- Relación cronograma → servicio pendiente ----------
// ¿Esta tarea del cronograma ya tiene un parte hecho? La "memoria" es el
// historial de partes del servidor, que no se borra cuando el servicio sale
// de la lista de pendientes:
//  1) si la tarea todavía se vincula a un servicio pendiente, se busca su parte por número;
//  2) si el servicio ya salió de la lista (o nunca se vinculó), se busca un parte del
//     mismo cliente hecho entre 1 día antes y 3 días después de la fecha agendada.
function clienteEnTexto(cliente, textoNorm) {
  const palabras = normalizeText(cliente || "").split(/\s+/).filter((w) => w.length > 2);
  return palabras.length > 0 && palabras.every((w) => textoNorm.includes(w));
}
function diasEntreISO(a, b) {
  const x = Date.parse(a), y = Date.parse(b);
  return isNaN(x) || isNaN(y) ? null : Math.round((x - y) / 86400000);
}
function infoTarea(t) {
  const norm = normalizeText((t && t.tarea) || "");
  const servicio = encontrarServicioPorTarea(t.tarea);
  let parte = null;
  if (servicio && servicio.numero_servicio) {
    parte = historialCache.find((h) => h.numero_servicio === servicio.numero_servicio) || null;
  }
  if (!parte) {
    parte = historialCache.find((h) => {
      if (!h.cliente || !clienteEnTexto(h.cliente, norm)) return false;
      const d = diasEntreISO(h.fecha, t.fecha);
      return d !== null && d >= -1 && d <= 3;
    }) || null;
  }
  const marcadoLocal = !!(servicio && servicio.numero_servicio && serviciosResueltos.has(servicio.numero_servicio));
  return { servicio, vinculado: !!servicio, parte, resuelto: !!parte || marcadoLocal };
}

function encontrarServicioPorTarea(textoTarea) {
  const norm = normalizeText(textoTarea);
  // Antes exigía que el nombre del cliente apareciera exactamente
  // igual, palabra por palabra en el mismo orden — un cliente
  // cargado como "Marta De Simone" en un lado y "De Simone Marta" en
  // el otro nunca coincidía, y el parte se armaba "suelto" (sin
  // vincular al servicio real, sin su número). Ahora alcanza con que
  // TODAS las palabras del nombre aparezcan en el texto de la tarea,
  // sin importar el orden — mucho más tolerante a cómo esté escrito
  // cada lado.
  const candidatos = serviciosCache.filter((s) => {
    if (!s.cliente) return false;
    const palabras = normalizeText(s.cliente).split(/\s+/).filter((p) => p.length > 2); // ignora "de", "la", etc.
    if (palabras.length === 0) return false;
    return palabras.every((palabra) => norm.includes(palabra));
  });
  // Si hay más de una coincidencia (nombres parecidos), se prefiere
  // la que matchea más "de cerca" — la de nombre más largo/específico.
  candidatos.sort((a, b) => b.cliente.length - a.cliente.length);
  return candidatos[0] || null;
}

// Si no se encuentra un servicio pendiente correspondiente, se intenta
// extraer cliente/dirección/localidad directo del texto de la tarea
// (formato típico: "Servicio: Nombre\nDirección  -  Localidad").
function parsearTareaCronograma(texto) {
  const lineas = (texto || "").split("\n").map((l) => l.trim()).filter(Boolean);
  let cliente = "", direccion = "", localidad = "";
  if (lineas[0]) {
    const m = lineas[0].match(/^Servicio:\s*(.+)$/i);
    cliente = m ? m[1].trim() : lineas[0];
  }
  if (lineas[1]) {
    const partes = lineas[1].split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    if (partes.length >= 2) {
      localidad = partes[partes.length - 1];
      direccion = partes.slice(0, -1).join(" - ");
    } else {
      direccion = lineas[1];
    }
  }
  return { cliente, direccion, localidad };
}

function seleccionarTareaCronograma(t) {
  const match = encontrarServicioPorTarea(t.tarea);
  if (match) {
    seleccionarServicio(match);
    return;
  }
  const parsed = parsearTareaCronograma(t.tarea);
  currentNumeroServicio = "";
  document.getElementById("f_cliente").value = parsed.cliente;
  document.getElementById("f_direccion").value = parsed.direccion;
  if (parsed.localidad) document.getElementById("f_localidad").value = parsed.localidad;
  setTareaAsignada((t.tarea || "").replace(/\n/g, " "));
  document.getElementById("f_tarea").value = "";
  actualizarBotonLlamar(null);
  actualizarBotonWhatsapp(null);
  autocompletarTecnico();
  autocompletarFecha();
  mostrarVisitaAnterior();
  cargarOpcionesSimInstalar();
  showScreen("form");
}

verCronogramaBtn.addEventListener("click", async () => {
  showScreen("cronograma");
  cronoDiaActivo = ""; // fuerza a buscar el día de hoy de nuevo al entrar
  cargarResumenEmergenciasEnCronograma();
  await precargarHistorialParaVisitas(); // primero esto, para que "resuelto" salga bien desde el primer render
  actualizarBadgeHistorialPendientes();
  fetchCronograma();
});
refreshCronogramaBtn.addEventListener("click", fetchCronograma);
volverDeCronogramaBtn.addEventListener("click", () => {
  showScreen("serviciosMenu");
});

// ---------- Técnico: mostrar campo libre si elige "Otro..." ----------
tecnicoSelect.addEventListener("change", () => {
  if (tecnicoSelect.value === "otro") {
    tecnicoOtro.style.display = "block";
    tecnicoOtro.focus();
  } else {
    tecnicoOtro.style.display = "none";
    tecnicoOtro.value = "";
  }
});

// ---------- Segundo técnico (opcional, si fueron dos al servicio) ----------
dosTecnicosCheck.addEventListener("change", () => {
  if (dosTecnicosCheck.checked) {
    segundoTecnicoWrap.classList.remove("hidden");
  } else {
    segundoTecnicoWrap.classList.add("hidden");
    tecnicoSelect2.value = "";
    tecnicoOtro2.value = "";
    tecnicoOtro2.style.display = "none";
  }
});

tecnicoSelect2.addEventListener("change", () => {
  if (tecnicoSelect2.value === "otro") {
    tecnicoOtro2.style.display = "block";
    tecnicoOtro2.focus();
  } else {
    tecnicoOtro2.style.display = "none";
    tecnicoOtro2.value = "";
  }
});

function getTecnicoValue() {
  if (tecnicoSelect.value === "otro") return tecnicoOtro.value.trim();
  return tecnicoSelect.value;
}

function getTecnico2Value() {
  if (!dosTecnicosCheck.checked) return "";
  if (tecnicoSelect2.value === "otro") return tecnicoOtro2.value.trim();
  return tecnicoSelect2.value || "";
}

// Calcula el tiempo transcurrido entre entrada y salida, redondeando
// siempre hacia arriba al múltiplo de 5 minutos más cercano, y lo
// muestra como "horas.minutos" (no como fracción decimal real).
// Ej: 43 min -> "0.45" · 1h12min -> "1.15"
function calcularTiempoTranscurrido(entrada, salida) {
  if (!entrada || !salida) return "";
  const [hE, mE] = entrada.split(":").map(Number);
  const [hS, mS] = salida.split(":").map(Number);
  if ([hE, mE, hS, mS].some((n) => Number.isNaN(n))) return "";

  let totalMin = (hS * 60 + mS) - (hE * 60 + mE);
  if (totalMin < 0) totalMin += 24 * 60; // por si cruza medianoche
  if (totalMin === 0) return "0.00";

  const redondeado = Math.ceil(totalMin / 5) * 5;
  const horas = Math.floor(redondeado / 60);
  const minutos = redondeado % 60;
  return `${horas}.${String(minutos).padStart(2, "0")}`;
}

// Avisa si la hora de salida quedó antes que la de entrada — eso
// significa que el servicio se va a contar como terminado al día
// siguiente (o puede ser un error de carga).
const horarioCruzaDiaAviso = document.getElementById("horarioCruzaDiaAviso");
function verificarHorarioCruzaDia() {
  const entrada = document.getElementById("f_entrada").value;
  const salida = document.getElementById("f_salida").value;
  if (!entrada || !salida) {
    horarioCruzaDiaAviso.classList.add("hidden");
    return;
  }
  const [hE, mE] = entrada.split(":").map(Number);
  const [hS, mS] = salida.split(":").map(Number);
  const cruzaDia = (hS * 60 + mS) < (hE * 60 + mE);
  horarioCruzaDiaAviso.classList.toggle("hidden", !cruzaDia);
}
document.getElementById("f_entrada").addEventListener("change", verificarHorarioCruzaDia);
document.getElementById("f_salida").addEventListener("change", verificarHorarioCruzaDia);

// ---------- Imprevisto (demora) ----------
const imprevistoCheck = document.getElementById("f_imprevisto");
const imprevistoWrap = document.getElementById("imprevistoWrap");
imprevistoCheck.addEventListener("change", () => {
  if (imprevistoCheck.checked) {
    imprevistoWrap.classList.remove("hidden");
  } else {
    imprevistoWrap.classList.add("hidden");
    document.getElementById("f_imprevisto_detalle").value = "";
    document.getElementById("f_imprevisto_minutos").value = "";
  }
});

function getImprevistoTexto() {
  if (!imprevistoCheck.checked) return "";
  const detalle = document.getElementById("f_imprevisto_detalle").value.trim();
  const minutos = document.getElementById("f_imprevisto_minutos").value.trim();
  if (!detalle && !minutos) return "Sí";
  return `${detalle || "Sí"}${minutos ? ` (${minutos} min de demora)` : ""}`;
}

// Si el técnico que inició sesión coincide con una opción del selector,
// se autocompleta (pero se puede cambiar a mano si hiciera falta).
function autocompletarTecnico() {
  if (!tecnicoLogueado) return;
  const opcionExiste = Array.from(tecnicoSelect.options).some((o) => o.value === tecnicoLogueado);
  if (opcionExiste) {
    tecnicoSelect.value = tecnicoLogueado;
    tecnicoOtro.style.display = "none";
  }
}

// Autocompleta la fecha de hoy si el campo está vacío (se puede
// cambiar a mano). Evita partes que queden sin fecha y por lo tanto
// no aparezcan en ningún período del dashboard.
function autocompletarFecha() {
  const campoFecha = document.getElementById("f_fecha");
  if (!campoFecha.value) {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, "0");
    const dd = String(hoy.getDate()).padStart(2, "0");
    campoFecha.value = `${yyyy}-${mm}-${dd}`;
  }
}

// Muestra un resumen de la última visita a este cliente (según el
// historial), si hay alguna registrada. Se busca por nombre de
// cliente (sin distinguir mayúsculas/acentos), tomando la más
// reciente por fecha.
const verVisitaAnteriorBtn = document.getElementById("verVisitaAnteriorBtn");
const clienteSugerenciasWrap = document.getElementById("clienteSugerenciasWrap");
const clienteSugerenciasList = document.getElementById("clienteSugerenciasList");
const visitaAnteriorModalOverlay = document.getElementById("visitaAnteriorModalOverlay");
const visitaAnteriorModalContenido = document.getElementById("visitaAnteriorModalContenido");
let ultimaVisitaEncontrada = null;

function mostrarVisitaAnterior() {
  const nombreCliente = document.getElementById("f_cliente").value.trim();
  ultimaVisitaEncontrada = null;
  if (!nombreCliente || !Array.isArray(historialCache) || historialCache.length === 0) {
    verVisitaAnteriorBtn.disabled = true;
    return;
  }
  // Preferir el número de cliente (estable, no cambia aunque cambie
  // el titular) — si no está disponible (servicio cargado a mano,
  // sin venir de un pendiente, o partes viejos de antes de este
  // arreglo), se cae al nombre como respaldo.
  let anteriores = [];
  if (currentNumeroCliente) {
    anteriores = historialCache
      .filter((h) => h.numero_cliente && h.numero_cliente === currentNumeroCliente && h.fecha)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }
  if (anteriores.length === 0) {
    const clave = normalizeText(nombreCliente);
    anteriores = historialCache
      .filter((h) => h.cliente && normalizeText(h.cliente) === clave && h.fecha)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  if (anteriores.length === 0) {
    verVisitaAnteriorBtn.disabled = true;
    return;
  }
  ultimaVisitaEncontrada = anteriores[0];
  verVisitaAnteriorBtn.disabled = false;
}
document.getElementById("f_cliente").addEventListener("change", () => {
  const nombreEscrito = document.getElementById("f_cliente").value.trim();
  const clienteAmbiguoAviso = document.getElementById("clienteAmbiguoAviso");
  // Si ya se había validado la SIM a instalar con OTRO nombre de
  // cliente, esa decisión queda vieja — se vuelve a chequear al
  // enviar el parte (el respaldo en asignarSimInstaladaAlCliente).
  if (decisionSimInstalar) decisionSimInstalar = null;
  const cantidad = contarClientesConNombreExacto(nombreEscrito);
  if (cantidad > 1) {
    // Hay más de un cliente con este nombre exacto — no se adivina
    // cuál es (antes se agarraba el primero en silencio, y eso fue
    // justo lo que causó un movimiento de SIM al cliente equivocado
    // una vez). Se avisa y se pide elegir de la lista de sugerencias.
    clienteAmbiguoAviso.textContent = `⚠ Hay ${cantidad} clientes llamados "${nombreEscrito}" — elegí el correcto de la lista de sugerencias (fijate la dirección) para no confundirte.`;
    clienteAmbiguoAviso.classList.remove("hidden");
    // No se vincula ningún número de cliente hasta que elija uno puntual.
  } else {
    clienteAmbiguoAviso.classList.add("hidden");
    // Si escribió el nombre exacto de un cliente conocido (sin usar la
    // sugerencia), igual se vincula el número de cliente — así "última
    // visita" y las claves guardadas lo encuentran bien.
    const exacto = buscarClientePorNombre(nombreEscrito);
    if (exacto) currentNumeroCliente = exacto.numero_cliente || "";
  }
  mostrarVisitaAnterior();
});

// Sugerencias de cliente al escribir — busca por nombre O dirección a
// la vez (por eso no se usa un <datalist> nativo, que solo filtra
// por lo que ya se ve en el texto). Al elegir una, se completa todo
// lo que se pueda (dirección, localidad) y se guarda el número de
// cliente — así "última visita" y las claves guardadas encuentran
// bien el historial, aunque el cliente después cambie de nombre.
const fClienteInput = document.getElementById("f_cliente");
fClienteInput.addEventListener("input", async () => {
  const texto = fClienteInput.value.trim();
  if (texto.length < 2) {
    clienteSugerenciasWrap.classList.add("hidden");
    return;
  }
  // Espera a que termine de cargar si todavía no estaba lista (hay
  // una precarga al loguear, pero si el técnico escribe muy rápido
  // puede llegar antes de que termine) — cargarClientesGeneral()
  // devuelve enseguida si ya está cargada, así que esto no demora
  // nada en el caso normal.
  await cargarClientesGeneral();
  // El texto pudo haber cambiado mientras esperaba — si ya no
  // coincide con lo que hay ahora en el campo, no seguir.
  if (fClienteInput.value.trim() !== texto) return;
  if (!Array.isArray(clientesGeneralCache)) {
    clienteSugerenciasWrap.classList.add("hidden");
    return;
  }
  const clave = normalizeText(texto);
  const coincidencias = clientesGeneralCache
    .filter((c) => (c.nombre && normalizeText(c.nombre).includes(clave)) || (c.direccion && normalizeText(c.direccion).includes(clave)))
    .slice(0, 6);

  if (coincidencias.length === 0) {
    clienteSugerenciasWrap.classList.add("hidden");
    return;
  }
  clienteSugerenciasList.innerHTML = coincidencias.map((c, idx) => {
    const esAmbiguo = contarClientesConNombreExacto(c.nombre) > 1;
    return `
    <div class="cliente-sugerencia-item${esAmbiguo ? " cliente-sugerencia-ambiguo" : ""}" data-idx="${idx}">
      <div class="cliente-sugerencia-nombre">${escapeHtml(c.nombre)}</div>
      ${c.direccion ? `<div class="cliente-sugerencia-direccion">${escapeHtml(c.direccion)}</div>` : ""}
      ${c.numero_abonado ? `<div class="cliente-sugerencia-abonado">Abonado: ${escapeHtml(c.numero_abonado)}</div>` : ""}
    </div>
  `;
  }).join("");
  clienteSugerenciasList.querySelectorAll(".cliente-sugerencia-item").forEach((item) => {
    item.addEventListener("mousedown", (e) => {
      e.preventDefault(); // evita que el input pierda foco antes del click
      const c = coincidencias[Number(item.dataset.idx)];
      fClienteInput.value = c.nombre;
      if (c.direccion) document.getElementById("f_direccion").value = c.direccion;
      if (c.localidad) document.getElementById("f_localidad").value = c.localidad;
      currentNumeroCliente = c.numero_cliente || "";
      clienteSugerenciasWrap.classList.add("hidden");
      document.getElementById("clienteAmbiguoAviso").classList.add("hidden");
      mostrarVisitaAnterior();
    });
  });
  clienteSugerenciasWrap.classList.remove("hidden");
});
fClienteInput.addEventListener("blur", () => {
  // Se retrasa un poco para que el "mousedown" de arriba llegue a
  // disparar antes de que esto oculte la lista.
  setTimeout(() => clienteSugerenciasWrap.classList.add("hidden"), 150);
});

verVisitaAnteriorBtn.addEventListener("click", async () => {
  if (!ultimaVisitaEncontrada) return;
  const [y, m, d] = ultimaVisitaEncontrada.fecha.split("-");
  let clavesHtml = "";
  if (currentNumeroCliente) {
    try {
      const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
      const res = await fetch(`/api/historial?tipo=claves_cliente&numero_cliente=${encodeURIComponent(currentNumeroCliente)}`, { headers, cache: "no-store" });
      const datosClaves = await res.json();
      if (datosClaves && Array.isArray(datosClaves.claves) && datosClaves.claves.length > 0) {
        const filas = datosClaves.claves.map((c) => {
          const detalle = [c.usuario && `Usuario: ${escapeHtml(c.usuario)}`, c.clave && `Clave: ${escapeHtml(c.clave)}`, c.codigo && `Código: ${escapeHtml(c.codigo)}`].filter(Boolean).join(" · ");
          return `<div style="margin-bottom:4px;"><b>${escapeHtml(c.titulo)}</b>${detalle ? " — " + detalle : ""}</div>`;
        }).join("");
        clavesHtml = `
          <div style="background:#FCEEEC; border:1px solid #E4B8B2; border-radius:8px; padding:10px 12px; margin-top:10px;">
            🔑 <b>Claves guardadas de este cliente:</b><br>${filas}
          </div>
        `;
      }
    } catch (err) {
      // si falla, simplemente no se muestra esa sección
    }
  }
  visitaAnteriorModalContenido.innerHTML = `
    <p style="margin:0 0 8px;"><b>Se pidió:</b> ${escapeHtml(ultimaVisitaEncontrada.tarea || "(sin detalle)")}</p>
    ${ultimaVisitaEncontrada.observaciones ? `<p style="margin:0 0 8px;"><b>Se resolvió:</b> ${escapeHtml(ultimaVisitaEncontrada.observaciones)}</p>` : ""}
    <p style="margin:0 0 8px;"><b>Fecha:</b> ${d}/${m}/${y}</p>
    <p style="margin:0;"><b>Técnico:</b> ${escapeHtml(ultimaVisitaEncontrada.tecnico || "(sin dato)")}</p>
    ${clavesHtml}
  `;
  visitaAnteriorModalOverlay.classList.remove("hidden");
});
document.getElementById("cerrarVisitaAnteriorBtn").addEventListener("click", () => {
  visitaAnteriorModalOverlay.classList.add("hidden");
});
visitaAnteriorModalOverlay.addEventListener("click", (e) => {
  if (e.target === visitaAnteriorModalOverlay) visitaAnteriorModalOverlay.classList.add("hidden");
});

// ---------- Importe / descuento / costo final ----------
function parseMonto(str) {
  if (!str) return NaN;
  let s = String(str).replace(/[^\d,.-]/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  return parseFloat(s);
}

function formatMonto(num) {
  if (isNaN(num)) return "";
  return "$ " + num.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDescuentoTipo() {
  for (const r of descuentoRadios) if (r.checked) return r.value;
  return "0";
}

function getDescuentoPct() {
  const tipo = getDescuentoTipo();
  if (tipo === "0" || tipo === "presupuesto") return 0;
  if (tipo === "otro") return parseFloat(descuentoOtroPct.value) || 0;
  return parseFloat(tipo);
}

function getDescuentoLabel() {
  const tipo = getDescuentoTipo();
  if (tipo === "0") return "Sin descuento";
  if (tipo === "otro") {
    const pct = descuentoOtroPct.value;
    return pct ? `${pct}%` : "Otro";
  }
  if (tipo === "presupuesto") {
    const numero = numeroPresupuestoInput.value.trim();
    return numero ? `Por presupuesto N° ${numero}` : "Por presupuesto";
  }
  return `${tipo}%`;
}

function recalcularCostoFinal() {
  const importe = parseMonto(importeInput.value);
  const pct = getDescuentoPct();
  if (isNaN(importe)) {
    costoFinalInput.value = "";
    return;
  }
  const final = importe - (importe * pct / 100);
  costoFinalInput.value = formatMonto(final);
}

importeInput.addEventListener("input", recalcularCostoFinal);
descuentoOtroPct.addEventListener("input", recalcularCostoFinal);
descuentoRadios.forEach((r) => {
  r.addEventListener("change", () => {
    const tipo = getDescuentoTipo();
    descuentoOtroPct.style.display = tipo === "otro" ? "block" : "none";
    if (tipo !== "otro") descuentoOtroPct.value = "";
    numeroPresupuestoInput.style.display = tipo === "presupuesto" ? "block" : "none";
    if (tipo !== "presupuesto") numeroPresupuestoInput.value = "";
    recalcularCostoFinal();
  });
});

// Forma de pago: además del tilde nativo del label, se marca también al
// levantar el dedo (pointerup). Así no depende de que el "click" llegue
// completo (en algunos celulares se pierde si el teclado se está cerrando
// o la pantalla se acomoda justo al tocar).
document.querySelectorAll("label.discount-chip input[name='f_forma_pago']").forEach((radio) => {
  const chip = radio.closest("label");
  if (!chip) return;
  chip.style.touchAction = "manipulation";
  chip.addEventListener("pointerup", (ev) => {
    if (ev.pointerType === "mouse" || radio.checked) return;
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
  });
});

function getFormaPago() {
  return Array.from(formaPagoChecks)
    .filter((c) => c.checked)
    .map((c) => c.value)
    .join(", ");
}

// ---------- Catálogo de materiales por categoría ----------
const MATERIALES_CATALOGO_RESPALDO = [
  { categoria: "Sensores infrarrojos", modelos: ["PIR genérico"] },
  { categoria: "Sensores magnéticos", modelos: ["Contacto magnético embutir", "Contacto magnético superficie"] },
  { categoria: "Baterías", modelos: ["Batería 12V 7Ah", "Batería 12V 4Ah"] },
  { categoria: "Sirenas", modelos: ["Sirena interior", "Sirena exterior"] },
];

const matCategoriaSelect = document.getElementById("matCategoriaSelect");
const matModeloSelect = document.getElementById("matModeloSelect");
const matModeloManualInput = document.getElementById("matModeloManualInput");
const matVolverCatalogoBtn = document.getElementById("matVolverCatalogoBtn");
const matCantidadInput = document.getElementById("matCantidadInput");
const matCantidadMenosBtn = document.getElementById("matCantidadMenosBtn");
const matCantidadMasBtn = document.getElementById("matCantidadMasBtn");
matCantidadMenosBtn.addEventListener("click", () => {
  const actual = parseInt(matCantidadInput.value, 10) || 1;
  matCantidadInput.value = Math.max(1, actual - 1);
});
matCantidadMasBtn.addEventListener("click", () => {
  const actual = parseInt(matCantidadInput.value, 10) || 1;
  matCantidadInput.value = actual + 1;
});
const agregarMaterialBtn = document.getElementById("agregarMaterialBtn");
const materialesAgregadosList = document.getElementById("materialesAgregadosList");
const simInstalarWrap = document.getElementById("simInstalarWrap");
const fInstalarSim = document.getElementById("f_instalar_sim");
const simInstalarSelectWrap = document.getElementById("simInstalarSelectWrap");
const simInstalarSelect = document.getElementById("simInstalarSelect");

let materialesCatalogo = MATERIALES_CATALOGO_RESPALDO;
let materialesAgregados = [];

async function cargarMaterialesCatalogo() {
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=materiales", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      materialesCatalogo = data;
      localStorage.setItem("materiales_catalogo_cache", JSON.stringify(data));
    }
  } catch (err) {
    const cacheado = localStorage.getItem("materiales_catalogo_cache");
    if (cacheado) {
      try { materialesCatalogo = JSON.parse(cacheado); } catch (e) { /* usa el respaldo de arranque */ }
    }
  }
  poblarCategoriasMateriales();
  poblarCategoriasMaterialesRetirados();
}
cargarMaterialesCatalogo();

function poblarCategoriasMateriales() {
  const opciones = materialesCatalogo.map((c) => `<option value="${c.categoria}">${c.categoria}</option>`).join("");
  matCategoriaSelect.innerHTML = `<option value="" disabled selected>Categoría</option>${opciones}`;
}

matCategoriaSelect.addEventListener("change", () => {
  const cat = materialesCatalogo.find((c) => c.categoria === matCategoriaSelect.value);
  matModeloManualInput.classList.add("hidden");
  matModeloManualInput.value = "";
  matModeloSelect.classList.remove("hidden");
  if (!cat) {
    matModeloSelect.innerHTML = '<option value="" disabled selected>Elegí primero una categoría</option>';
    matModeloSelect.disabled = true;
    return;
  }
  const opciones = cat.modelos.map((m) => `<option value="${m}">${m}</option>`).join("");
  matModeloSelect.innerHTML = `<option value="" disabled selected>Modelo</option>${opciones}<option value="__manual__">Otro (escribir el material)</option>`;
  matModeloSelect.disabled = false;
});

matModeloSelect.addEventListener("change", () => {
  const esManual = matModeloSelect.value === "__manual__";
  matModeloSelect.classList.toggle("hidden", esManual);
  matModeloManualInput.classList.toggle("hidden", !esManual);
  matVolverCatalogoBtn.classList.toggle("hidden", !esManual);
  if (esManual) matModeloManualInput.focus();
});
matVolverCatalogoBtn.addEventListener("click", () => {
  matModeloSelect.classList.remove("hidden");
  matModeloManualInput.classList.add("hidden");
  matModeloManualInput.value = "";
  matVolverCatalogoBtn.classList.add("hidden");
  matModeloSelect.value = "";
});

function renderMaterialesAgregados() {
  renderListaMateriales(materialesAgregadosList, materialesAgregados, "usados");
}

agregarMaterialBtn.addEventListener("click", () => {
  const esManual = matModeloSelect.value === "__manual__";
  const modelo = esManual ? matModeloManualInput.value.trim() : matModeloSelect.value;
  const cantidad = parseInt(matCantidadInput.value, 10) || 1;
  if (!modelo) {
    showToast(esManual ? "Escribí el nombre del material." : "Elegí una categoría y un modelo antes de agregar.");
    return;
  }
  materialesAgregados.push({ modelo, cantidad, manual: esManual });
  renderMaterialesAgregados();
  matModeloSelect.value = "";
  matModeloSelect.classList.remove("hidden");
  matCantidadInput.value = "1";
  matModeloManualInput.value = "";
  matModeloManualInput.classList.add("hidden");
  matVolverCatalogoBtn.classList.add("hidden");
});

function getMaterialesUtilizados() {
  const agregados = materialesAgregados.map((item) => `${item.modelo} x${item.cantidad}`);
  const otros = document.getElementById("f_materiales").value.trim();
  return [...agregados, otros].filter(Boolean).join(", ");
}

// ---------- Selector estructurado de materiales retirados (mismo patrón que "usados") ----------
const matRetCategoriaSelect = document.getElementById("matRetCategoriaSelect");
const matRetModeloSelect = document.getElementById("matRetModeloSelect");
const matRetModeloManualInput = document.getElementById("matRetModeloManualInput");
const matRetVolverCatalogoBtn = document.getElementById("matRetVolverCatalogoBtn");
const matRetCantidadInput = document.getElementById("matRetCantidadInput");
const matRetCantidadMenosBtn = document.getElementById("matRetCantidadMenosBtn");
const matRetCantidadMasBtn = document.getElementById("matRetCantidadMasBtn");
matRetCantidadMenosBtn.addEventListener("click", () => {
  const actual = parseInt(matRetCantidadInput.value, 10) || 1;
  matRetCantidadInput.value = Math.max(1, actual - 1);
});
matRetCantidadMasBtn.addEventListener("click", () => {
  const actual = parseInt(matRetCantidadInput.value, 10) || 1;
  matRetCantidadInput.value = actual + 1;
});
const agregarMaterialRetiradoBtn = document.getElementById("agregarMaterialRetiradoBtn");
const materialesRetiradosAgregadosList = document.getElementById("materialesRetiradosAgregadosList");
let materialesRetiradosAgregados = [];

// ---------- Atajos de materiales: "Más usados", buscador y cantidad en la fila ----------
// Usan el catálogo (materialesCatalogo) y el historial de stock ya guardado
// (modelo/técnico/fecha de cada movimiento). No cambian cómo se guarda el parte.
function normMat(s) {
  return normalizeText(String(s || "")).replace(/\s+/g, " ").trim();
}

let stockMaterialesHist = [];
try { stockMaterialesHist = JSON.parse(localStorage.getItem("stock_materiales_cache") || "[]"); } catch (e) { stockMaterialesHist = []; }
let stockMaterialesCargadoEn = 0;

async function cargarHistorialMateriales() {
  if (Date.now() - stockMaterialesCargadoEn < 30 * 60 * 1000) return;
  try {
    const res = await fetch("/api/historial?tipo=stock", { headers: { Authorization: "Bearer " + SERVICIOS_API_TOKEN }, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (Array.isArray(data)) {
      stockMaterialesHist = data
        .map((m) => ({ modelo: m.modelo, tecnico: m.tecnico || "", fecha: m.fecha || "", parte: m.parte_id || m.numero_servicio || String(m.id || ""), i: Number(m.cantidad_instalada) || 0, r: Number(m.cantidad_retirada) || 0 }))
        .filter((m) => m.modelo);
      try { localStorage.setItem("stock_materiales_cache", JSON.stringify(stockMaterialesHist.slice(-4000))); } catch (e) { /* sin espacio: se usa solo en memoria */ }
      stockMaterialesCargadoEn = Date.now();
    }
  } catch (err) {
    // sin conexión: se siguen usando las fichas del último historial guardado
  }
  refrescarAtajosMateriales();
}

function modelosDelCatalogo() {
  return (materialesCatalogo || []).flatMap((c) => (c.modelos || []).map((m) => ({ modelo: m, categoria: c.categoria })));
}

// Los 8 materiales más usados (o retirados) del técnico logueado en los
// últimos 120 días; si tiene pocos, se completa con lo más usado por el equipo.
function materialesFrecuentes(tipo) {
  const campo = tipo === "usados" ? "i" : "r";
  const limite = Date.now() - 120 * 86400000;
  const propios = new Map();
  const todos = new Map();
  stockMaterialesHist.forEach((m) => {
    if (!m[campo]) return;
    const t = Date.parse(m.fecha);
    if (t && t < limite) return;
    const k = normMat(m.modelo);
    const sumar = (mapa) => {
      const e = mapa.get(k) || { modelo: m.modelo, partes: new Set() };
      e.partes.add(m.parte);
      mapa.set(k, e);
    };
    sumar(todos);
    if (tecnicoLogueado && coincideNombreTecnico(m.tecnico, tecnicoLogueado)) sumar(propios);
  });
  const ordenar = (mapa) => [...mapa.values()].sort((a, b) => b.partes.size - a.partes.size || a.modelo.localeCompare(b.modelo));
  const catalogo = modelosDelCatalogo();
  const salida = [];
  const vistos = new Set();
  [ordenar(propios), ordenar(todos)].forEach((lista) => lista.forEach((e) => {
    const k = normMat(e.modelo);
    if (salida.length >= 8 || vistos.has(k)) return;
    vistos.add(k);
    const canon = catalogo.find((x) => normMat(x.modelo) === k);
    salida.push(canon ? canon.modelo : e.modelo);
  }));
  return salida;
}

function listaMateriales(tipo) { return tipo === "usados" ? materialesAgregados : materialesRetiradosAgregados; }

function agregarMaterialRapido(tipo, modelo) {
  const nombre = String(modelo || "").trim();
  if (!nombre) return;
  const arr = listaMateriales(tipo);
  const k = normMat(nombre);
  const canon = modelosDelCatalogo().find((x) => normMat(x.modelo) === k);
  const existente = arr.find((i) => normMat(i.modelo) === k);
  if (existente) existente.cantidad += 1;
  else arr.push({ modelo: canon ? canon.modelo : nombre, cantidad: 1, manual: !canon });
  if (tipo === "usados") renderMaterialesAgregados(); else renderMaterialesRetiradosAgregados();
  guardarBorradorActual();
}

function renderListaMateriales(el, arr, tipo) {
  el.innerHTML = "";
  arr.forEach((item, idx) => {
    const fila = document.createElement("div");
    fila.className = "material-agregado-item";
    fila.innerHTML = `
      <span class="mat-fila-nombre">${escapeHtml(item.modelo)}${item.manual ? ' <span class="badge-material-manual">Manual</span>' : ""}</span>
      <span class="mat-fila-cant">
        <button type="button" class="mat-menos" aria-label="Restar uno">−</button>
        <b>x${item.cantidad}</b>
        <button type="button" class="mat-mas" aria-label="Sumar uno">+</button>
      </span>
      <button type="button" class="quitar" title="Quitar">✕</button>
    `;
    const redibujar = () => { (tipo === "usados" ? renderMaterialesAgregados : renderMaterialesRetiradosAgregados)(); guardarBorradorActual(); };
    fila.querySelector(".mat-menos").addEventListener("click", () => { if (item.cantidad > 1) { item.cantidad -= 1; redibujar(); } });
    fila.querySelector(".mat-mas").addEventListener("click", () => { item.cantidad += 1; redibujar(); });
    fila.querySelector(".quitar").addEventListener("click", () => { arr.splice(idx, 1); redibujar(); });
    el.appendChild(fila);
  });
  try { refrescarAtajosMateriales(); } catch (e) { /* aún no cargó */ }
}

function refrescarAtajosMateriales() {
  [["usados", "Usados"], ["retirados", "Retirados"]].forEach(([tipo, T]) => {
    const wrap = document.getElementById("matRapidos" + T + "Wrap");
    const cont = document.getElementById("matRapidos" + T);
    if (!wrap || !cont) return;
    const frecuentes = materialesFrecuentes(tipo);
    wrap.classList.toggle("hidden", frecuentes.length === 0);
    const arr = listaMateriales(tipo);
    cont.innerHTML = "";
    frecuentes.forEach((nombre) => {
      const k = normMat(nombre);
      const ya = arr.find((i) => normMat(i.modelo) === k);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mat-chip" + (ya ? " activo" : "");
      b.dataset.modelo = nombre;
      b.innerHTML = `${escapeHtml(nombre)}${ya ? ` <span class="mat-chip-n">×${ya.cantidad}</span>` : ""}`;
      cont.appendChild(b);
    });
  });
  const copiar = document.getElementById("matRetCopiarBtn");
  if (copiar) copiar.classList.toggle("hidden", materialesAgregados.length === 0);
}

function buscarMateriales(texto) {
  const tokens = normMat(texto).split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  const pool = [];
  const vistos = new Set();
  modelosDelCatalogo().forEach((x) => { vistos.add(normMat(x.modelo)); pool.push(x); });
  // también lo que ya se cargó a mano en otros partes
  stockMaterialesHist.forEach((m) => {
    const k = normMat(m.modelo);
    if (!vistos.has(k)) { vistos.add(k); pool.push({ modelo: m.modelo, categoria: "Usado antes" }); }
  });
  return pool
    .filter((x) => { const h = normMat(x.modelo + " " + x.categoria); return tokens.every((t) => h.includes(t)); })
    .slice(0, 6);
}

function montarBuscadorMateriales(tipo, T) {
  const input = document.getElementById("matBuscar" + T);
  const resultados = document.getElementById("matResultados" + T);
  const cont = document.getElementById("matRapidos" + T);
  if (!input || !resultados || !cont) return;
  const cerrar = () => { resultados.classList.add("hidden"); resultados.innerHTML = ""; };
  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (!q) { cerrar(); return; }
    const hallados = buscarMateriales(q);
    const exacto = hallados.some((x) => normMat(x.modelo) === normMat(q));
    resultados.innerHTML = hallados.map((x) => `<button type="button" class="mat-resultado" data-modelo="${escapeHtml(x.modelo)}">${escapeHtml(x.modelo)}<small>${escapeHtml(x.categoria)}</small></button>`).join("")
      + (exacto ? "" : `<button type="button" class="mat-resultado mat-resultado-nuevo" data-modelo="${escapeHtml(q)}">+ Agregar "${escapeHtml(q)}" como material nuevo</button>`);
    resultados.classList.remove("hidden");
    try { resultados.scrollIntoView({ block: "nearest" }); } catch (e) { /* navegador viejo */ }
  });
  input.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { input.value = ""; cerrar(); } });
  resultados.addEventListener("click", (ev) => {
    const b = ev.target.closest(".mat-resultado");
    if (!b) return;
    agregarMaterialRapido(tipo, b.dataset.modelo);
    input.value = "";
    cerrar();
  });
  cont.addEventListener("click", (ev) => {
    const b = ev.target.closest(".mat-chip");
    if (b) agregarMaterialRapido(tipo, b.dataset.modelo);
  });
}
montarBuscadorMateriales("usados", "Usados");
montarBuscadorMateriales("retirados", "Retirados");
document.getElementById("matRetCopiarBtn").addEventListener("click", () => {
  let agregados = 0;
  materialesAgregados.forEach((item) => {
    if (!materialesRetiradosAgregados.some((r) => normMat(r.modelo) === normMat(item.modelo))) {
      materialesRetiradosAgregados.push({ modelo: item.modelo, cantidad: item.cantidad, manual: !!item.manual });
      agregados++;
    }
  });
  renderMaterialesRetiradosAgregados();
  guardarBorradorActual();
  showToast(agregados ? "Copiado a retirados. Ajustá las cantidades si hace falta." : "Ya estaban todos en retirados.");
});

function poblarCategoriasMaterialesRetirados() {
  const opciones = materialesCatalogo.map((c) => `<option value="${c.categoria}">${c.categoria}</option>`).join("");
  matRetCategoriaSelect.innerHTML = `<option value="" disabled selected>Categoría</option>${opciones}`;
}

matRetCategoriaSelect.addEventListener("change", () => {
  const cat = materialesCatalogo.find((c) => c.categoria === matRetCategoriaSelect.value);
  matRetModeloManualInput.classList.add("hidden");
  matRetModeloManualInput.value = "";
  matRetModeloSelect.classList.remove("hidden");
  if (!cat) {
    matRetModeloSelect.innerHTML = '<option value="" disabled selected>Elegí primero una categoría</option>';
    matRetModeloSelect.disabled = true;
    return;
  }
  const opciones = cat.modelos.map((m) => `<option value="${m}">${m}</option>`).join("");
  matRetModeloSelect.innerHTML = `<option value="" disabled selected>Modelo</option>${opciones}<option value="__manual__">Otro (escribir el material)</option>`;
  matRetModeloSelect.disabled = false;
});

matRetModeloSelect.addEventListener("change", () => {
  const esManual = matRetModeloSelect.value === "__manual__";
  matRetModeloSelect.classList.toggle("hidden", esManual);
  matRetModeloManualInput.classList.toggle("hidden", !esManual);
  matRetVolverCatalogoBtn.classList.toggle("hidden", !esManual);
  if (esManual) matRetModeloManualInput.focus();
});
matRetVolverCatalogoBtn.addEventListener("click", () => {
  matRetModeloSelect.classList.remove("hidden");
  matRetModeloManualInput.classList.add("hidden");
  matRetModeloManualInput.value = "";
  matRetVolverCatalogoBtn.classList.add("hidden");
  matRetModeloSelect.value = "";
});

function renderMaterialesRetiradosAgregados() {
  renderListaMateriales(materialesRetiradosAgregadosList, materialesRetiradosAgregados, "retirados");
}

agregarMaterialRetiradoBtn.addEventListener("click", () => {
  const esManual = matRetModeloSelect.value === "__manual__";
  const modelo = esManual ? matRetModeloManualInput.value.trim() : matRetModeloSelect.value;
  const cantidad = parseInt(matRetCantidadInput.value, 10) || 1;
  if (!modelo) {
    showToast(esManual ? "Escribí el nombre del material." : "Elegí una categoría y un modelo antes de agregar.");
    return;
  }
  materialesRetiradosAgregados.push({ modelo, cantidad, manual: esManual });
  renderMaterialesRetiradosAgregados();
  matRetModeloSelect.value = "";
  matRetModeloSelect.classList.remove("hidden");
  matRetCantidadInput.value = "1";
  matRetModeloManualInput.value = "";
  matRetModeloManualInput.classList.add("hidden");
  matRetVolverCatalogoBtn.classList.add("hidden");
});

function getMaterialesRetirados() {
  const agregados = materialesRetiradosAgregados.map((item) => `${item.modelo} x${item.cantidad}`);
  const otros = document.getElementById("f_materiales_retirados").value.trim();
  return [...agregados, otros].filter(Boolean).join(", ");
}

// Arma la lista de movimientos de stock (uno por material, juntando
// usados y retirados) para mandar al guardar el parte — buscando la
// categoría de cada modelo en el catálogo, ya que el selector solo
// guarda el nombre del modelo.
function categoriaDeModelo(modelo) {
  const cat = materialesCatalogo.find((c) => (c.modelos || []).includes(modelo));
  return cat ? cat.categoria : "";
}

function armarMovimientosDeStock(instaladosParam, retiradosParam) {
  const instalados = instaladosParam || materialesAgregados;
  const retirados = retiradosParam || materialesRetiradosAgregados;
  const porModelo = {};
  instalados.forEach((item) => {
    if (!porModelo[item.modelo]) porModelo[item.modelo] = { modelo: item.modelo, categoria: categoriaDeModelo(item.modelo), cantidad_instalada: 0, cantidad_retirada: 0, es_manual: false };
    porModelo[item.modelo].cantidad_instalada += item.cantidad;
    if (item.manual) porModelo[item.modelo].es_manual = true;
  });
  retirados.forEach((item) => {
    if (!porModelo[item.modelo]) porModelo[item.modelo] = { modelo: item.modelo, categoria: categoriaDeModelo(item.modelo), cantidad_instalada: 0, cantidad_retirada: 0, es_manual: false };
    porModelo[item.modelo].cantidad_retirada += item.cantidad;
    if (item.manual) porModelo[item.modelo].es_manual = true;
  });
  return Object.values(porModelo);
}

function getSimInstaladaTexto() {
  const sim = getSimAInstalarSeleccionada();
  return sim ? `${sim.empresa}${sim.tipo ? " " + sim.tipo : ""} — ${sim.numero}` : "";
}

// ---------- Instalar una SIM del propio stock en este servicio ----------
let simsEnStockPropio = [];
// Se completa apenas el técnico elige la SIM (no al enviar el parte)
// — ahí mismo se avisa si el cliente no está en la base, y si ya
// tiene otra línea, se pregunta si reemplazarla. Al enviar el parte
// ya está resuelto, sin volver a preguntar nada.
let decisionSimInstalar = null;

function getSimAInstalarSeleccionada() {
  if (!fInstalarSim.checked || !simInstalarSelect.value) return null;
  return simsEnStockPropio.find((s) => s.numero === simInstalarSelect.value) || null;
}

async function cargarOpcionesSimInstalar() {
  fInstalarSim.checked = false;
  simInstalarSelectWrap.style.display = "none";
  simInstalarSelect.innerHTML = '<option value="" disabled selected>Elegí la SIM que instalaste</option>';
  simInstalarWrap.classList.add("hidden");
  simsEnStockPropio = [];
  decisionSimInstalar = null;
  if (!tecnicoLogueado) return; // el login general no tiene stock propio
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    let sims = null;
    try {
      const res = await fetch("/api/datos?coleccion=sims", { headers, cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      sims = await res.json();
      try { localStorage.setItem("sims_cache", JSON.stringify(sims)); } catch (e) { /* sin espacio */ }
    } catch (errRed) {
      // Sin señal: se usa la última lista guardada, para poder elegir igual la SIM instalada.
      try { sims = JSON.parse(localStorage.getItem("sims_cache") || "null"); } catch (e) { sims = null; }
      if (!sims) return;
    }
    simsEnStockPropio = (Array.isArray(sims) ? sims : []).filter(
      (s) => s.tecnico_actual === tecnicoLogueado && s.estado === "stock" && s.ubicacion_tipo !== "cliente" && (!s.estado_fisico || s.estado_fisico === "Disponible")
    );
    if (simsEnStockPropio.length === 0) return;
    const opciones = simsEnStockPropio
      .map((s) => `<option value="${s.numero}">${s.empresa}${s.tipo ? " " + s.tipo : ""} — ${s.numero}</option>`)
      .join("");
    simInstalarSelect.innerHTML = `<option value="" disabled selected>Elegí la SIM que instalaste</option>${opciones}`;
    simInstalarWrap.classList.remove("hidden");
  } catch (err) {
    // si falla, simplemente no aparece la opción de instalar SIM
  }
}

const simInstalarConfirmarBtn = document.getElementById("simInstalarConfirmarBtn");
const simInstalarEstadoInfo = document.getElementById("simInstalarEstadoInfo");

fInstalarSim.addEventListener("change", () => {
  simInstalarSelectWrap.style.display = fInstalarSim.checked ? "block" : "none";
  if (!fInstalarSim.checked) { decisionSimInstalar = null; simInstalarEstadoInfo.textContent = ""; }
});

// Se valida acá, apenas se confirma la SIM elegida — no al enviar el
// parte. Así el técnico ya sabe en el momento si el cliente no está
// en la base, o si hay que reemplazar una línea existente, y puede
// seguir completando tranquilo el resto del parte hasta la firma sin
// sorpresas al final.
//
// Se dispara desde un BOTÓN explícito ("Confirmar SIM seleccionada"),
// no solo desde el evento "change" del <select> — un técnico reportó
// que, en su celular, elegir la SIM del desplegable no disparaba
// ningún aviso a pesar de que el cliente sí tenía otra línea. No se
// pudo confirmar la causa exacta (podría ser el navegador/OS no
// disparando "change" de forma confiable en ese dispositivo puntual),
// pero un botón que se toca a propósito es un mecanismo mucho más
// confiable que depender de ese evento — así que ahora es el camino
// principal. El evento "change" se deja como respaldo silencioso,
// por si el navegador sí lo dispara solo.
async function validarSimAInstalar() {
  decisionSimInstalar = null;
  simInstalarEstadoInfo.textContent = "";
  const sim = getSimAInstalarSeleccionada();
  if (!sim) {
    simInstalarEstadoInfo.textContent = "Elegí primero una SIM de la lista.";
    return;
  }

  const clienteEscrito = document.getElementById("f_cliente").value.trim();
  if (!clienteEscrito) {
    showToast("Completá el cliente antes de confirmar la SIM que instalaste.");
    return;
  }

  // Si el nombre no coincide con ningún cliente de la base, se avisa
  // — antes esto no se chequeaba en ningún lado, así que una SIM
  // podía terminar "instalada" bajo cualquier texto escrito a mano,
  // sin ninguna relación con un cliente real.
  //
  // Se espera acá a que la lista de clientes esté cargada (no se
  // asume que la precarga de fondo ya terminó) — un técnico con mala
  // señal en el momento de iniciar sesión podía quedarse sin este
  // dato para toda la sesión, y el sistema entonces nunca encontraba
  // ningún cliente conocido, ni siquiera uno tan cargado como
  // Bartolozzi.
  await cargarClientesGeneral();
  const clienteReal = buscarClientePorNombre(clienteEscrito);
  if (!clienteReal) {
    const seguir = confirm(
      `No encontramos "${clienteEscrito}" en la base de clientes.\n\n` +
      `Revisá que el nombre esté bien escrito — si seguís igual, la SIM va a quedar instalada bajo este nombre tal cual.\n\n` +
      `Aceptar = seguir igual.\nCancelar = volver a elegir.`
    );
    if (!seguir) {
      simInstalarSelect.value = "";
      return;
    }
  }

  try {
    const sims = await fetchSimsConfig();
    const numeroClienteParaBuscar = clienteReal ? clienteReal.numero_cliente : currentNumeroCliente;
    const resultado = buscarSimExistenteEnCliente(clienteEscrito, numeroClienteParaBuscar, sims, sim.numero);
    console.log("[validarSimAInstalar]", { clienteEscrito, numeroClienteParaBuscar, resultado, candidatasEnUso: sims.filter((s) => s.estado === "uso").length });
    if (resultado.tipo === "confirmada") {
      const existente = resultado.sim;
      const reemplazar = confirm(
        `Este cliente ya tiene la línea N° ${existente.numero} de ${existente.empresa}` +
        `${existente.tipo ? " " + existente.tipo : ""}, a nombre de "${existente.cliente}".\n\n` +
        `Aceptar = reemplazarla (vuelve a tu stock).\nCancelar = dejar las dos líneas instaladas.`
      );
      decisionSimInstalar = { numeroSimARetirar: reemplazar ? existente.numero : null };
      simInstalarEstadoInfo.textContent = reemplazar
        ? `✓ Vas a reemplazar la línea ${existente.numero}.`
        : "✓ Vas a dejar las dos líneas instaladas.";
    } else if (resultado.tipo === "sin_certeza") {
      // No hay número de cliente para confirmar con seguridad — se
      // avisa y se muestra el parecido, pero no se decide solo (ver
      // el comentario en sims-utils.js sobre por qué).
      const existente = resultado.sim;
      alert(
        `No pude confirmar con certeza si este cliente ya tiene otra línea (no tengo su número de cliente).\n\n` +
        `Encontré algo parecido: línea N° ${existente.numero} de ${existente.empresa}, a nombre de "${existente.cliente}".\n\n` +
        `Si es el mismo cliente, retirala vos mismo desde "SIM instaladas" antes de continuar. Si no es el mismo, seguí tranquilo.`
      );
      decisionSimInstalar = { numeroSimARetirar: null };
      simInstalarEstadoInfo.textContent = "✓ Confirmado — revisá el aviso de arriba.";
    } else {
      decisionSimInstalar = { numeroSimARetirar: null };
      simInstalarEstadoInfo.textContent = "✓ Listo, no encontramos otra línea en este cliente.";
    }
  } catch (errConsulta) {
    console.error("No se pudo chequear si el cliente ya tenía una SIM:", errConsulta);
    showToast("No se pudo verificar si el cliente ya tenía otra línea instalada — revisalo a mano si corresponde.");
    decisionSimInstalar = { numeroSimARetirar: null };
    simInstalarEstadoInfo.textContent = "⚠ No se pudo verificar — revisalo a mano.";
  }
}

simInstalarConfirmarBtn.addEventListener("click", validarSimAInstalar);
simInstalarSelect.addEventListener("change", validarSimAInstalar);

// Después de enviar el parte con éxito, si se eligió una SIM, la marca
// como usada en el cliente del servicio (sale del stock del técnico).
// La SIM elegida en el parte, guardada junto al parte: si el parte queda en
// la cola sin señal, la SIM se registra igual cuando se envía (antes quedaba
// para siempre en el stock del técnico).
function simElegidaParaParte() {
  const sim = getSimAInstalarSeleccionada();
  if (!sim) return null;
  return { numero: sim.numero, numeroSimARetirar: decisionSimInstalar ? decisionSimInstalar.numeroSimARetirar : null };
}
async function asignarSimInstaladaAlCliente(data, simGuardada) {
  const elegida = simGuardada !== undefined ? simGuardada : simElegidaParaParte();
  const sim = elegida ? { numero: elegida.numero } : null;
  if (!sim || !data.cliente) return;
  try {
    // Si ya se decidió al elegir la SIM (ver el listener de
    // simInstalarSelect), se usa esa decisión directo. Si no, se
    // manda "usar" tal cual — el servidor hace su propia verificación
    // y, si hace falta, enviarAccionSimConRespaldo se encarga de
    // mostrar el mismo aviso de reemplazar/dejar las dos antes de
    // reintentar. Antes este respaldo se hacía acá mismo con una
    // copia de la lógica de comparación del frontend — ahora la
    // verificación real la hace el servidor, así que no hace falta
    // duplicarla: si el chequeo previo del frontend falló por
    // cualquier motivo (fue justo lo que le pasó a un técnico), el
    // servidor lo atrapa igual antes de guardar en silencio.
    const numeroSimARetirar = elegida.numeroSimARetirar || null;

    // Última chance de resolver el número de cliente antes de mandar
    // — puede haber pasado bastante entre elegir el cliente y llegar
    // acá (completar el resto del parte, sacar fotos, firmar), y
    // data.numero_cliente es una foto del momento en que se armó el
    // formulario. Si por algún motivo llegó vacío, se reintenta acá
    // con el nombre, para no perder la verificación por número
    // aunque el cliente sí esté cargado en la base.
    let numeroClienteFinal = data.numero_cliente || "";
    if (!numeroClienteFinal) {
      await cargarClientesGeneral();
      const cli = buscarClientePorNombre(data.cliente);
      numeroClienteFinal = cli ? cli.numero_cliente || "" : "";
    }

    const payload = {
      recurso: "sim",
      accion: numeroSimARetirar ? "reemplazar" : "usar",
      numero: sim.numero,
      tecnico: data.tecnico || tecnicoLogueado || "",
      cliente: data.cliente,
      direccion: data.direccion || "",
      numero_servicio: data.numero_servicio || "",
      numero_cliente: numeroClienteFinal,
      ...(numeroSimARetirar ? { numero_sim_a_retirar: numeroSimARetirar } : {}),
    };
    await enviarAccionSimConRespaldo(payload, SERVICIOS_API_TOKEN);
  } catch (err) {
    showToast("El parte se envió, pero no se pudo registrar la SIM instalada: " + err.message);
  }
}

backToListBtn.addEventListener("click", () => {
  guardarBorradorActual();
  resetForm();
  showScreen("list");
});

// Por si cierran la app o cambian de pestaña sin tocar "Volver" —
// guarda el borrador igual, mientras se esté en la pantalla del
// formulario.
document.addEventListener("visibilitychange", () => {
  const enFormOFirma = (screens.form && screens.form.dataset.active === "true") ||
    (screens.sign && screens.sign.dataset.active === "true");
  const enComodato = (screens.comodatoForm && screens.comodatoForm.dataset.active === "true") ||
    (screens.comodatoFirma && screens.comodatoFirma.dataset.active === "true");
  if (document.visibilityState === "hidden") {
    if (enFormOFirma) guardarBorradorActual();
    if (enComodato) guardarBorradorComodatoActual();
  }
});

// ---------- Foto opcional (solo va a la oficina, sube a Drive) ----------
function comprimirImagen(file, maxDim, calidad) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
      const canvasFoto = document.createElement("canvas");
      canvasFoto.width = width;
      canvasFoto.height = height;
      const ctx2 = canvasFoto.getContext("2d");
      ctx2.drawImage(img, 0, 0, width, height);
      resolve(canvasFoto.toDataURL("image/jpeg", calidad));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function procesarArchivoFoto(file) {
  if (!file) return;
  fotoStatus.textContent = "Procesando foto...";
  try {
    const dataUrl = await comprimirImagen(file, 1600, 0.75);
    fotoBase64 = dataUrl;
    fotoMimeType = "image/jpeg";
    fotoPreview.src = dataUrl;
    fotoPreviewWrap.classList.remove("hidden");
    const kb = Math.round((dataUrl.length * 0.75) / 1024);
    fotoStatus.textContent = `Foto lista (~${kb} KB).`;
  } catch (err) {
    fotoStatus.textContent = "No se pudo procesar la foto.";
    fotoBase64 = null;
  }
}

fotoCamaraBtn.addEventListener("click", () => fotoInputCamara.click());
fotoGaleriaBtn.addEventListener("click", () => fotoInputGaleria.click());
fotoInputCamara.addEventListener("change", () => procesarArchivoFoto(fotoInputCamara.files[0]));
fotoInputGaleria.addEventListener("change", () => procesarArchivoFoto(fotoInputGaleria.files[0]));

quitarFotoBtn.addEventListener("click", () => {
  fotoBase64 = null;
  fotoMimeType = null;
  fotoInputCamara.value = "";
  fotoInputGaleria.value = "";
  fotoPreviewWrap.classList.add("hidden");
  fotoStatus.textContent = "";
});

// ---------- Mapa del servicio ----------
let mapaLeafletInstance = null;

// Si por lo que sea el CDN de Leaflet no llegó a cargar (sin
// conexión, bloqueado, caído), esto no debe frenar el resto de la
// app — antes, un error acá cortaba en seco toda la ejecución del
// script que venía después (media app dejaba de funcionar por un
// mapa que ni se estaba usando en ese momento).
if (typeof L !== "undefined") {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "vendor/leaflet/images/marker-icon-2x.png",
    iconUrl: "vendor/leaflet/images/marker-icon.png",
    shadowUrl: "vendor/leaflet/images/marker-shadow.png",
  });
}

function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function abrirMapa() {
  const direccion = document.getElementById("f_direccion").value.trim();
  const localidad = document.getElementById("f_localidad").value.trim();
  if (!direccion) {
    showToast("Completá la dirección antes de ver el mapa.");
    return;
  }

  showScreen("mapa");
  mapaStatus.textContent = "Buscando ubicación...";
  mapaCercanosList.innerHTML = "";

  const items = [{ id: "actual", direccion, localidad }];
  serviciosCache.forEach((s, idx) => {
    if (s.direccion) items.push({ id: `s${idx}`, direccion: s.direccion, localidad: s.localidad || "" });
  });

  try {
    const res = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    const porId = {};
    (data.results || []).forEach((r) => { porId[r.id] = r; });

    const actual = porId["actual"];
    if (!actual || actual.error) {
      mapaStatus.textContent = "No se pudo ubicar esa dirección en el mapa.";
      return;
    }
    if (actual.pendiente) {
      mapaStatus.textContent = "Ubicando la dirección, probá de nuevo en unos segundos...";
      return;
    }

    mapaStatus.textContent = "";
    renderizarMapa(actual, porId);
  } catch (err) {
    mapaStatus.textContent = "No se pudo mostrar el mapa (revisá la conexión e intentá de nuevo).";
  }
}

function renderizarMapa(actual, porId) {
  if (mapaLeafletInstance) {
    mapaLeafletInstance.remove();
    mapaLeafletInstance = null;
  }

  const map = L.map("mapaLeaflet").setView([actual.lat, actual.lon], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; colaboradores de OpenStreetMap",
  }).addTo(map);

  L.circleMarker([actual.lat, actual.lon], {
    radius: 10, color: "#101820", fillColor: "#101820", fillOpacity: 1, weight: 2,
  }).addTo(map).bindPopup("Servicio actual").openPopup();

  const cercanos = [];
  serviciosCache.forEach((s, idx) => {
    const r = porId[`s${idx}`];
    if (!r || r.error || r.pendiente) return;
    const dist = distanciaMetros(actual.lat, actual.lon, r.lat, r.lon);
    if (dist <= 3 || dist > 1000) return;

    const esMuyCercano = dist <= 500;
    const color = esMuyCercano ? "#F5A623" : "#2E86DE";
    cercanos.push({ servicio: s, dist, esMuyCercano });
    L.circleMarker([r.lat, r.lon], {
      radius: 8, color, fillColor: color, fillOpacity: 0.9, weight: 2,
    }).addTo(map).bindPopup(`${s.cliente || ""} (${Math.round(dist)} m)`);
  });

  mapaCercanosList.innerHTML = "";
  if (cercanos.length > 0) {
    const muyCercanos = cercanos.filter((c) => c.esMuyCercano).length;
    const soloCercanos = cercanos.length - muyCercanos;
    const titulo = document.createElement("p");
    titulo.className = "list-status";
    titulo.textContent = `${muyCercanos} a menos de 500 m` +
      (soloCercanos > 0 ? `, ${soloCercanos} entre 500 m y 1 km` : "") + ":";
    mapaCercanosList.appendChild(titulo);
    cercanos.sort((a, b) => a.dist - b.dist).forEach(({ servicio, dist, esMuyCercano }) => {
      const card = document.createElement("div");
      card.className = "mapa-cercano-card" + (esMuyCercano ? "" : " lejano");
      card.innerHTML = `
        <div class="mapa-cercano-num">N° ${escapeHtml(servicio.numero_servicio)}</div>
        <div class="mapa-cercano-cliente">${escapeHtml(servicio.cliente)}</div>
        <div class="mapa-cercano-dist">${Math.round(dist)} m — ${escapeHtml(servicio.direccion)}</div>
      `;
      mapaCercanosList.appendChild(card);
    });
  }

  mapaLeafletInstance = map;
  setTimeout(() => map.invalidateSize(), 0);
}

verMapaBtn.addEventListener("click", abrirMapa);

// ---------- Sugerencia de servicios cercanos al terminar la agenda ----------
// Si el técnico ya completó todas las tareas de HOY que tenía en el
// cronograma, sugiere los servicios pendientes más cercanos al último
// que completó — para que no tenga que volver a la oficina de una.
async function verificarYSugerirCercanos(data) {
  try {
    const tecnico = data.tecnico;
    const fechaHoy = data.fecha;
    if (!tecnico || !fechaHoy || !data.direccion) return;

    const tareasDeHoy = cronogramaCache.filter((t) => t.tecnico === tecnico && t.fecha === fechaHoy);
    if (tareasDeHoy.length === 0) return; // no hay agenda cargada para hoy, no aplica

    const quedanPendientes = tareasDeHoy.some((t) => {
      const match = encontrarServicioPorTarea(t.tarea);
      return match && !(match.numero_servicio && serviciosResueltos.has(match.numero_servicio));
    });
    if (quedanPendientes) return; // todavía le queda algo agendado hoy

    const pendientesReales = serviciosCache.filter(
      (s) => !(s.numero_servicio && serviciosResueltos.has(s.numero_servicio))
    );
    if (pendientesReales.length === 0) return;

    const items = [{ id: "actual", direccion: data.direccion, localidad: data.localidad || "" }];
    pendientesReales.forEach((s, idx) => {
      if (s.direccion) items.push({ id: `s${idx}`, direccion: s.direccion, localidad: s.localidad || "" });
    });
    if (items.length <= 1) return;

    const res = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ items }),
    });
    const geoData = await res.json();
    const porId = {};
    (geoData.results || []).forEach((r) => { porId[r.id] = r; });
    const actual = porId["actual"];
    if (!actual || actual.error || actual.pendiente) return;

    const cercanos = [];
    pendientesReales.forEach((s, idx) => {
      const r = porId[`s${idx}`];
      if (!r || r.error || r.pendiente) return;
      const dist = distanciaMetros(actual.lat, actual.lon, r.lat, r.lon);
      if (dist > 3) cercanos.push({ servicio: s, dist });
    });
    if (cercanos.length === 0) return;

    cercanos.sort((a, b) => a.dist - b.dist);
    sugerenciasList.innerHTML = "";
    cercanos.slice(0, 5).forEach(({ servicio, dist }) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "sugerencia-card";
      card.innerHTML = `
        <div class="sugerencia-card-cliente">${escapeHtml(servicio.cliente)}</div>
        <div class="sugerencia-card-dist">${(dist / 1000).toFixed(1)} km — ${escapeHtml(servicio.direccion)}</div>
      `;
      card.addEventListener("click", () => seleccionarServicio(servicio));
      sugerenciasList.appendChild(card);
    });
    sugerenciasWrap.classList.remove("hidden");
  } catch (err) {
    // si falla algo (geocodificación, conexión), simplemente no se
    // muestra ninguna sugerencia — no interrumpe el flujo del parte.
  }
}

// Si este es el primer parte que el técnico cierra hoy, y no figura
// que haya tomado ningún vehículo de la empresa, se lo recuerda —
// puede confirmar que no usa vehículo (por ejemplo, camina o usa el
// propio) o ir directo a tomar uno.
async function verificarPrimerServicioSinVehiculo(data) {
  try {
    if (!data.tecnico || !data.fecha) return;
    if (colaVehiculos().some((i) => i.cuerpo.accion === "tomar" && i.cuerpo.tecnico === data.tecnico)) return;

    const yaTeniaOtroHoy = historialCache.some((h) => h.tecnico === data.tecnico && h.fecha === data.fecha);
    if (yaTeniaOtroHoy) return; // no es el primer parte de hoy

    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/recurso-uso?recurso=vehiculo", { headers, cache: "no-store" });
    if (!res.ok) return;
    const historialVehiculos = await res.json();
    const tieneVehiculoTomado = Array.isArray(historialVehiculos) &&
      historialVehiculos.some((h) => h.tecnico === data.tecnico && !h.hora_devolucion);
    if (tieneVehiculoTomado) return;

    vehiculoRecordatorioWrap.classList.remove("hidden");
  } catch (err) {
    // si falla la verificación, no se muestra nada — no bloquea el envío
  }
}

vehiculoRecordatorioOkBtn.addEventListener("click", () => {
  vehiculoRecordatorioWrap.classList.add("hidden");
});
vehiculoRecordatorioIrBtn.addEventListener("click", () => {
  vehiculoRecordatorioWrap.classList.add("hidden");
  showScreen("vehiculos");
  renderVehiculosPicker();
});

volverDeMapaBtn.addEventListener("click", () => {
  showScreen("form");
});

function getFormData() {
  return {
    numero_servicio: currentNumeroServicio,
    numero_cliente: currentNumeroCliente,
    es_instalacion: instalacionCheck.checked,
    tipo_servicio: instalacionCheck.checked ? "Instalación" : "Servicio técnico",
    cliente: document.getElementById("f_cliente").value.trim(),
    direccion: document.getElementById("f_direccion").value.trim(),
    localidad: document.getElementById("f_localidad").value.trim(),
    cliente_email: document.getElementById("f_cliente_email").value.trim(),
    // Si el técnico no escribió nada, se guarda la tarea asignada (como pasaba antes con el texto precargado).
    tarea: document.getElementById("f_tarea").value.trim() || tareaAsignada,
    materiales: getMaterialesUtilizados(),
    sim_instalada_texto: getSimInstaladaTexto(),
    materiales_retirados: getMaterialesRetirados(),
    importe: document.getElementById("f_importe").value.trim(),
    descuento: getDescuentoLabel(),
    costo_final: document.getElementById("f_costo_final").value.trim(),
    forma_pago: getFormaPago(),
    tecnico: getTecnicoValue(),
    tecnico2: getTecnico2Value(),
    fecha: document.getElementById("f_fecha").value,
    hora_entrada: document.getElementById("f_entrada").value,
    hora_salida: document.getElementById("f_salida").value,
    tiempo_transcurrido: calcularTiempoTranscurrido(
      document.getElementById("f_entrada").value,
      document.getElementById("f_salida").value
    ),
    observaciones: document.getElementById("f_observaciones").value.trim(),
    imprevisto: getImprevistoTexto(),
    claves: clavesAgregadas,
  };
}

function resetForm() {
  instalacionCheck.checked = false;
  signAclaracion.value = "";
  signCargo.value = "";
  clavesAgregadas = [];
  renderClavesAgregadas();
  actualizarBotonClaves();
  ["f_cliente","f_direccion","f_localidad","f_cliente_email","f_tarea",
   "f_materiales","f_materiales_retirados","f_importe","f_costo_final",
   "f_observaciones"].forEach(id => document.getElementById(id).value = "");
  setTareaAsignada("");
  tecnicoSelect.value = "";
  tecnicoOtro.value = "";
  tecnicoOtro.style.display = "none";
  dosTecnicosCheck.checked = false;
  segundoTecnicoWrap.classList.add("hidden");
  tecnicoSelect2.value = "";
  tecnicoOtro2.value = "";
  tecnicoOtro2.style.display = "none";
  document.getElementById("f_fecha").value = "";
  document.getElementById("f_entrada").value = "";
  document.getElementById("f_salida").value = "";
  horarioCruzaDiaAviso.classList.add("hidden");
  imprevistoCheck.checked = false;
  imprevistoWrap.classList.add("hidden");
  document.getElementById("f_imprevisto_detalle").value = "";
  document.getElementById("f_imprevisto_minutos").value = "";
  descuentoRadios[0].checked = true;
  descuentoOtroPct.value = "";
  descuentoOtroPct.style.display = "none";
  numeroPresupuestoInput.value = "";
  numeroPresupuestoInput.style.display = "none";
  formaPagoChecks.forEach((c) => { c.checked = false; });
  materialesAgregados = [];
  renderMaterialesAgregados();
  matCategoriaSelect.value = "";
  matModeloSelect.innerHTML = '<option value="" disabled selected>Elegí primero una categoría</option>';
  matModeloSelect.disabled = true;
  matModeloSelect.classList.remove("hidden");
  matCantidadInput.value = "1";
  matModeloManualInput.value = "";
  matModeloManualInput.classList.add("hidden");
  matVolverCatalogoBtn.classList.add("hidden");
  materialesRetiradosAgregados = [];
  renderMaterialesRetiradosAgregados();
  matRetCategoriaSelect.value = "";
  matRetModeloSelect.innerHTML = '<option value="" disabled selected>Elegí primero una categoría</option>';
  matRetModeloSelect.disabled = true;
  matRetModeloSelect.classList.remove("hidden");
  matRetModeloManualInput.value = "";
  matRetModeloManualInput.classList.add("hidden");
  matRetVolverCatalogoBtn.classList.add("hidden");
  matRetCantidadInput.value = "1";
  currentNumeroServicio = "";
  fotoBase64 = null;
  fotoMimeType = null;
  fotoInputCamara.value = "";
  fotoInputGaleria.value = "";
  fotoPreviewWrap.classList.add("hidden");
  fotoStatus.textContent = "";
  actualizarBotonLlamar(null);
  actualizarBotonWhatsapp(null);
  autocompletarTecnico();
  autocompletarFecha();
  mostrarVisitaAnterior();
  cargarOpcionesSimInstalar();
  clearSignature();
}

// ---------- ID único por parte ----------
function generarIdParte() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const fecha = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
  const hora = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const azar = String(Math.floor(Math.random() * 900) + 100); // 3 dígitos
  return `SAT-${fecha}-${hora}-${azar}`;
}

// ---------- Navegación entre pasos ----------
// Claves y códigos (título + usuario/clave/código) — se pueden
// cargar varias. Quedan guardadas en el parte, pero solo se mandan
// al mail de oficina, nunca al cliente (ver enviar-mail.js).
let clavesAgregadas = [];

function actualizarBotonClaves() {
  abrirClavesBtn.innerHTML = clavesAgregadas.length > 0
    ? `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" style="vertical-align:-2px; margin-right:4px;"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2.5-2.5M19 10l2-2"/></svg>Claves ✓ (${clavesAgregadas.length})`
    : `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" style="vertical-align:-2px; margin-right:4px;"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2.5-2.5M19 10l2-2"/></svg>Claves`;
}

function renderClavesAgregadas() {
  clavesAgregadasList.innerHTML = "";
  clavesAgregadas.forEach((c, idx) => {
    const detalle = [c.usuario && `Usuario: ${escapeHtml(c.usuario)}`, c.clave && `Clave: ${escapeHtml(c.clave)}`, c.codigo && `Código: ${escapeHtml(c.codigo)}`]
      .filter(Boolean).join(" · ");
    const fila = document.createElement("div");
    fila.className = "material-agregado-item";
    fila.innerHTML = `<span><b>${escapeHtml(c.titulo)}</b>${detalle ? " — " + detalle : ""}</span>`;
    const quitarBtn = document.createElement("button");
    quitarBtn.type = "button";
    quitarBtn.textContent = "✕";
    quitarBtn.addEventListener("click", () => {
      clavesAgregadas.splice(idx, 1);
      renderClavesAgregadas();
      actualizarBotonClaves();
    });
    fila.appendChild(quitarBtn);
    clavesAgregadasList.appendChild(fila);
  });
}

agregarClaveBtn.addEventListener("click", () => {
  const titulo = clavesTituloInput.value.trim();
  if (!titulo) {
    showToast("Escribí un título para saber de qué es esta clave (ej: WiFi del cliente).");
    return;
  }
  clavesAgregadas.push({
    titulo,
    usuario: clavesUsuarioInput.value.trim(),
    clave: clavesClaveInput.value.trim(),
    codigo: clavesCodigoInput.value.trim(),
  });
  renderClavesAgregadas();
  actualizarBotonClaves();
  clavesTituloInput.value = "";
  clavesUsuarioInput.value = "";
  clavesClaveInput.value = "";
  clavesCodigoInput.value = "";
  clavesTituloInput.focus();
});

abrirClavesBtn.addEventListener("click", () => showScreen("claves"));
guardarClavesBtn.addEventListener("click", () => showScreen("form"));

toSignBtn.addEventListener("click", () => {
  // Se completa sola con la hora actual del celular, si todavía no
  // se había puesto nada — así el técnico no tiene que acordarse de
  // tocarla a mano. Si ya tenía algo cargado (por ejemplo, restauró
  // un borrador), se respeta lo que ya había.
  const salidaInput = document.getElementById("f_salida");
  if (!salidaInput.value) {
    const ahora = new Date();
    salidaInput.value = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
    verificarHorarioCruzaDia();
  }
  const data = getFormData();
  if (!data.cliente || !data.tecnico) {
    showToast("Completá al menos Cliente y Técnico antes de continuar.");
    return;
  }
  if (!data.fecha) {
    showToast("Falta completar la Fecha del servicio.");
    return;
  }
  // Si eligió categoría y modelo pero nunca tocó "+ Agregar", esa
  // selección se pierde en silencio — se avisa antes de dejar
  // continuar, para no perder el material cargado.
  if (matModeloSelect.value && !matModeloSelect.disabled) {
    showToast('Tenés un material elegido sin agregar — tocá "+ Agregar" o borralo antes de continuar.');
    return;
  }
  if (matRetModeloSelect.value && !matRetModeloSelect.disabled) {
    showToast('Tenés un material retirado elegido sin agregar — tocá "+ Agregar" o borralo antes de continuar.');
    return;
  }
  // Mismo caso para una clave escrita pero nunca agregada a la lista
  // — sin este aviso, se pierde en silencio (fue justo lo que pasó
  // con un parte real).
  if (clavesTituloInput.value.trim() || clavesUsuarioInput.value.trim() || clavesClaveInput.value.trim() || clavesCodigoInput.value.trim()) {
    showToast('Tenés una clave escrita sin agregar — andá a "Claves" y tocá "+ Agregar" antes de continuar.');
    return;
  }
  showScreen("sign");
  setupCanvas();
});

backToFormBtn.addEventListener("click", () => {
  showScreen("form");
});

newReportBtn.addEventListener("click", () => {
  resetForm();
  setStatus("LISTO");
  // El servicio recién completado desaparece del listado de
  // pendientes (serviciosResueltos lo filtra en filtrarServicios) y
  // queda marcado como resuelto en el cronograma de esta sesión, hasta
  // que se cargue un listado nuevo desde el servidor.
  renderServiciosList(filtrarServicios());
  showScreen("list");
});

// ---------- Pad de firma (canvas) ----------
// La firma se dibuja en un canvas cuyo tamaño real en píxeles cambia
// según el celular (ancho de pantalla, densidad de píxeles) — si se
// manda tal cual al mail, la proporción nunca es la misma dos veces y
// termina viéndose grande o estirada según el cliente de correo. Acá
// se la redibuja centrada, con fondo blanco, sobre un lienzo de
// tamaño y proporción SIEMPRE iguales (320×110), para que en el mail
// se vea del mismo tamaño consistente sin importar desde qué celular
// se firmó.
function normalizarFirmaParaMail(canvasOriginal) {
  const ANCHO_FINAL = 320;
  const ALTO_FINAL = 110;
  const destino = document.createElement("canvas");
  destino.width = ANCHO_FINAL;
  destino.height = ALTO_FINAL;
  const destCtx = destino.getContext("2d");
  destCtx.fillStyle = "#FFFFFF";
  destCtx.fillRect(0, 0, ANCHO_FINAL, ALTO_FINAL);

  const escala = Math.min(ANCHO_FINAL / canvasOriginal.width, ALTO_FINAL / canvasOriginal.height);
  const anchoEscalado = canvasOriginal.width * escala;
  const altoEscalado = canvasOriginal.height * escala;
  const offsetX = (ANCHO_FINAL - anchoEscalado) / 2;
  const offsetY = (ALTO_FINAL - altoEscalado) / 2;
  destCtx.drawImage(canvasOriginal, offsetX, offsetY, anchoEscalado, altoEscalado);

  return destino.toDataURL("image/png");
}

function setupCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#101820";
  clearSignature();
}

function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  return { x: point.clientX - rect.left, y: point.clientY - rect.top };
}

function startDraw(e) {
  e.preventDefault();
  drawing = true;
  const p = pointerPos(e);
  lastX = p.x; lastY = p.y;
}
function moveDraw(e) {
  if (!drawing) return;
  e.preventDefault();
  const p = pointerPos(e);
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  lastX = p.x; lastY = p.y;
  hasSignature = true;
}
function endDraw(e) { drawing = false; }

canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", moveDraw);
window.addEventListener("mouseup", endDraw);
canvas.addEventListener("touchstart", startDraw, { passive: false });
canvas.addEventListener("touchmove", moveDraw, { passive: false });
canvas.addEventListener("touchend", endDraw);

function clearSignature() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#F4F5F0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  hasSignature = false;
}
clearSignBtn.addEventListener("click", clearSignature);

// ---------- Confirmar firma y enviar ----------
// Intenta enviar un parte completo (foto, mail de oficina, historial,
// mail de cliente). No toca la navegación de pantallas — el que llama
// decide qué mostrar según el resultado. Se usa tanto para el envío
// en el momento como para los reintentos automáticos en segundo plano.
async function intentarEnviarParte(payload, interactivo) {
  const { idParte, data, signatureImgTag, signatureDataUrl, fotoBase64: fb64, fotoMimeType: fmt } = payload;

  let fotoLink = "";
  let fotoError = "";
  if (fb64) {
    try {
      if (interactivo) sendingLabel.textContent = "Subiendo foto...";
      const fotoRes = await fetch("/api/foto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + SERVICIOS_API_TOKEN,
        },
        body: JSON.stringify({
          filename: `${idParte}.jpg`,
          mimeType: fmt || "image/jpeg",
          base64: fb64,
        }),
      });
      const fotoData = await fotoRes.json();
      if (fotoRes.ok && fotoData.id) {
        fotoLink = `${window.location.origin}/api/foto?id=${fotoData.id}`;
      } else {
        fotoError = fotoData.detail || fotoData.error || `Error HTTP ${fotoRes.status}`;
        console.error("Error subiendo foto:", fotoData);
      }
    } catch (err) {
      fotoError = err.message || String(err);
      console.error("Error subiendo foto:", err);
    }
  }

  // La firma se sube igual que la foto — antes solo quedaba embebida
  // en el mail (como imagen incrustada en el HTML), sin ningún link
  // que se pudiera volver a abrir después desde la app.
  let firmaLink = "";
  if (signatureDataUrl) {
    try {
      const firmaRes = await fetch("/api/foto", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
        body: JSON.stringify({ base64: signatureDataUrl }),
      });
      const firmaData = await firmaRes.json();
      if (firmaRes.ok && firmaData.id) {
        firmaLink = `${window.location.origin}/api/foto?id=${firmaData.id}`;
      } else {
        console.error("Error subiendo firma:", firmaData);
      }
    } catch (err) {
      console.error("Error subiendo firma:", err);
    }
  }

  const basePayload = {
    id_parte: idParte,
    numero_servicio: data.numero_servicio,
    tipo_servicio: data.tipo_servicio,
    cliente: data.cliente,
    direccion: data.direccion,
    localidad: data.localidad,
    tarea: data.tarea,
    materiales: data.materiales,
    materiales_retirados: data.materiales_retirados,
    sim_instalada_texto: data.sim_instalada_texto,
    cliente_email_usado: data.cliente_email,
    importe: data.importe,
    descuento: data.descuento,
    costo_final: data.costo_final,
    forma_pago: data.forma_pago,
    tecnico: data.tecnico,
    tecnico2: data.tecnico2,
    fecha: data.fecha,
    hora_entrada: data.hora_entrada,
    hora_salida: data.hora_salida,
    observaciones: data.observaciones,
    firma_img: signatureImgTag,
    firma_aclaracion: data.firma_aclaracion,
    firma_cargo: data.firma_cargo,
    claves: data.claves,
  };

  let oficinaOk = false;
  let clienteOk = false;
  const clienteIntentado = !!data.cliente_email;

  try {
    if (interactivo) sendingLabel.textContent = "Enviando copia a la oficina…";
    await enviarMail("oficina", {
      ...basePayload,
      foto_link: fotoLink,
      tiempo_transcurrido: data.tiempo_transcurrido,
      imprevisto: data.imprevisto,
    });
    oficinaOk = true;
    // Se anota en la memoria local del historial, así el inicio pasa
    // enseguida al servicio que sigue sin esperar a recargar.
    try { historialCache.unshift({ numero_servicio: data.numero_servicio || "", cliente: data.cliente || "", fecha: data.fecha || fechaLocalISO(), tecnico: data.tecnico || tecnicoLogueado || "" }); } catch (e) { /* sin historial */ }
    if (data.numero_servicio) {
      serviciosResueltos.add(data.numero_servicio);
      localStorage.setItem("servicios_resueltos", JSON.stringify([...serviciosResueltos]));
      borrarBorrador(data.numero_servicio);
      // Además de esconderlo en este celular (arriba), se saca de la
      // lista compartida — así desaparece para todo el equipo, no
      // solo acá. No se espera a que termine (no debe frenar el
      // flujo de "listo"); si falla, el servicio simplemente queda
      // en la lista como antes, sin romper nada.
      eliminarServicioDeListaCompartida(data.numero_servicio).catch((err) => {
        console.error("No se pudo quitar el servicio de la lista compartida:", err);
      });
    }
    try {
      const histRes = await fetch("/api/historial", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
        body: JSON.stringify({
          numero_servicio: data.numero_servicio || "",
          numero_cliente: data.numero_cliente || "",
          es_instalacion: data.es_instalacion,
          tipo_servicio: data.tipo_servicio || "",
          id_parte: idParte,
          cliente: data.cliente,
          direccion: data.direccion,
          localidad: data.localidad,
          cliente_email: data.cliente_email || "",
          tarea: data.tarea,
          materiales: data.materiales || "",
          materiales_retirados: data.materiales_retirados || "",
          sim_instalada_texto: data.sim_instalada_texto || "",
          observaciones: data.observaciones,
          tecnico: data.tecnico,
          tecnico2: data.tecnico2,
          fecha: data.fecha,
          hora_entrada: data.hora_entrada,
          hora_salida: data.hora_salida,
          importe: data.importe,
          descuento: data.descuento,
          descuento_pct: data.descuento_pct,
          numero_presupuesto: data.numero_presupuesto || "",
          costo_final: data.costo_final,
          forma_pago: data.forma_pago,
          imprevisto: data.imprevisto,
          firma_aclaracion: data.firma_aclaracion || "",
          firma_cargo: data.firma_cargo || "",
          claves: data.claves,
          foto_ref: fotoLink,
          firma_img_ref: firmaLink,
        }),
      });
      if (!histRes.ok) {
        const histData = await histRes.json().catch(() => ({}));
        console.error("Error registrando historial:", histData);
        // Este caso (backend avisando error) ahora es rarísimo — el
        // backend reintenta solo con sufijo /2, /3, etc. antes de
        // rendirse. Si aun así llega acá, es porque ni 10 intentos
        // alcanzaron, así que sí amerita una alerta que no se pueda
        // ignorar.
        if (interactivo) {
          if (histData.id_duplicado) {
            alert(`⚠️ ATENCIÓN: ${histData.error}\n\nEl mail a la oficina SÍ se mandó, pero este parte NO quedó guardado en el sistema — avisale a la oficina de este problema para que lo carguen a mano.`);
          } else {
            showToast("El mail se envió, pero no se pudo registrar en el dashboard.");
          }
        }
      } else {
        // Si el número de servicio ya estaba usado (un número
        // reciclado, una prueba vieja, lo que sea), el backend lo
        // guardó igual, agregándole un sufijo /2, /3, etc. para no
        // pisar el que ya existía. Se avisa (sin frenar nada — el
        // parte ya está guardado) para que quede claro que ese
        // número de servicio tiene algo raro para revisar.
        const histData = await histRes.json().catch(() => ({}));
        if (histData.duplicado && interactivo) {
          alert(`ℹ️ El número de servicio "${idParte}" ya se había usado antes en otro parte — este quedó guardado como "${histData.numero_servicio}" para no pisar el anterior. No hace falta que hagas nada ahora, pero convendría avisarle a la oficina para que revisen de dónde salió ese número repetido.`);
        }
        // Movimientos de stock (materiales instalados/retirados) —
        // no bloquea nada si falla, el parte ya quedó guardado.
        try {
          // Se busca el número de cliente por nombre (igual que ya
          // se hace en SIMs y Emergencias) — así quien pasa esto al
          // sistema offline no se confunde de cliente.
          const clienteEncontradoStock = buscarClientePorNombre(data.cliente);
          const movimientos = armarMovimientosDeStock(data.materiales_agregados, data.materiales_retirados_agregados).map((m) => ({
            ...m,
            numero_servicio: data.numero_servicio || "",
            numero_cliente: clienteEncontradoStock ? clienteEncontradoStock.numero_cliente || "" : "",
            cliente: data.cliente,
            direccion: data.direccion,
            fecha: data.fecha,
            hora: data.hora_entrada,
            tecnico: data.tecnico,
          }));
          if (movimientos.length > 0) {
            const resStock = await fetch("/api/historial", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
              body: JSON.stringify({ accion: "guardar_stock", parte_id: idParte, movimientos }),
            });
            const dataStock = await resStock.json().catch(() => ({}));
            if (!resStock.ok) {
              console.error("Error guardando movimientos de stock:", dataStock);
            }
          }
        } catch (errStock) {
          console.error("Error registrando movimientos de stock:", errStock);
        }
      }
    } catch (err) {
      console.error("Error registrando historial:", err);
      if (interactivo) showToast("El mail se envió, pero no se pudo registrar en el dashboard.");
    }
  } catch (err) {
    console.error("Error enviando a oficina:", err);
  }

  if (oficinaOk && clienteIntentado) {
    try {
      if (interactivo) sendingLabel.textContent = "Enviando copia al cliente…";
      await enviarMail("cliente", {
        ...basePayload,
        cliente_email: data.cliente_email,
      });
      clienteOk = true;
    } catch (err) {
      console.error("Error enviando al cliente:", err);
    }
  }

  return { idParte, oficinaOk, clienteOk, clienteIntentado, fotoError };
}

// ---------- Cola de envíos pendientes (sin conexión) ----------
const COLA_ENVIOS_KEY = "cola_envios_pendientes";

function obtenerColaEnvios() {
  try {
    return JSON.parse(localStorage.getItem(COLA_ENVIOS_KEY) || "[]");
  } catch (err) {
    return [];
  }
}
function guardarColaEnvios(cola) {
  localStorage.setItem(COLA_ENVIOS_KEY, JSON.stringify(cola));
  actualizarBadgeColaEnvios();
}
function agregarAColaEnvios(payload) {
  const cola = obtenerColaEnvios();
  cola.push(payload);
  guardarColaEnvios(cola);
}

function actualizarBadgeColaEnvios() {
  const cola = obtenerColaEnvios();
  if (!colaEnviosBanner) return;
  if (cola.length > 0) {
    const detalle = cola
      .map((item) => {
        if ((item.tipo || "parte") === "comodato") {
          return `Comodato: ${(item.datos && item.datos.comodatario) || "sin nombre"}`;
        }
        if (item.tipo === "vehiculo") {
          return `Vehículo: ${TEXTO_ACCION_VEHICULO[item.cuerpo && item.cuerpo.accion] || ""} ${(item.cuerpo && item.cuerpo.vehiculo) || ""}`.trim();
        }
        if (item.tipo === "rendicion") {
          return `Rendición: ${(item.cuerpo && item.cuerpo.categoria) || ""} ${item.cuerpo ? formatoPesos(item.cuerpo.monto) : ""}`.trim();
        }
        const tecnico = (item.data && item.data.tecnico) || "técnico sin especificar";
        const cliente = (item.data && item.data.cliente) || "";
        return cliente ? `${tecnico} (${cliente})` : tecnico;
      })
      .join(", ");
    colaEnviosTexto.textContent = `${cola.length} envío(s) pendiente(s) de enviar (sin conexión) — de: ${detalle}.`;
    colaEnviosBanner.classList.remove("hidden");
  } else {
    colaEnviosBanner.classList.add("hidden");
  }
  try { actualizarPillConexion(); } catch (e) { /* aún no cargó */ }
}

let procesandoColaEnvios = false;
async function procesarColaEnvios() {
  if (procesandoColaEnvios) return;
  procesandoColaEnvios = true;
  const cola = obtenerColaEnvios();
  if (cola.length === 0) {
    procesandoColaEnvios = false;
    return;
  }

  const restantes = [];
  let enviadosOk = 0;
  let vehiculoTrabado = false;
  const vehiculoDescartados = [];
  for (const item of cola) {
    if (item.tipo === "vehiculo") {
      // Van en orden: si uno no sale por señal, los que siguen esperan.
      if (vehiculoTrabado) { restantes.push(item); continue; }
      try {
        await postAccionVehiculo(await cuerpoConFotosSubidas(item.cuerpo, item.fotos || []));
        enviadosOk++;
      } catch (err) {
        if (err.delServidor) vehiculoDescartados.push(`${TEXTO_ACCION_VEHICULO[item.cuerpo.accion] || ""} ${item.cuerpo.vehiculo}: ${err.message}`);
        else { vehiculoTrabado = true; restantes.push(item); }
      }
      continue;
    }
    try {
      const tipo = item.tipo || "parte"; // los ya guardados antes de este cambio no tienen tipo -> son partes
      const resultado = tipo === "comodato"
        ? await intentarEnviarComodato(item, false)
        : tipo === "rendicion"
          ? await intentarEnviarRendicionPendiente(item)
          : await intentarEnviarParte(item, false);
      if (resultado.oficinaOk) {
        enviadosOk++;
        if (tipo === "parte" && item.sim) {
          try { await asignarSimInstaladaAlCliente(item.data, item.sim); } catch (e) { /* se avisa adentro */ }
        }
      } else {
        restantes.push(item);
      }
    } catch (err) {
      restantes.push(item);
    }
  }
  guardarColaEnvios(restantes);
  procesandoColaEnvios = false;
  if (vehiculoDescartados.length) {
    alert("No se pudo registrar en el sistema:\n\n" + vehiculoDescartados.join("\n") + "\n\nRevisalo en Vehículos.");
  }
  if (cola.some((i) => i.tipo === "vehiculo")) {
    try {
      if (screens.vehiculos.dataset.active === "true") renderVehiculosPicker();
      actualizarVehiculoInicio();
    } catch (e) { /* aún no cargó */ }
  }

  if (enviadosOk > 0) {
    showToast(`Se enviaron ${enviadosOk} envío(s) que estaban pendientes por falta de conexión.`);
    if (screens.list.dataset.active === "true") {
      renderServiciosList(filtrarServicios());
    }
  }
}

window.addEventListener("online", procesarColaEnvios);
reintentarColaBtn.addEventListener("click", procesarColaEnvios);

confirmSignBtn.addEventListener("click", async () => {
  if (!hasSignature) {
    showToast("Falta la firma del cliente.");
    return;
  }
  const aclaracion = signAclaracion.value.trim();
  if (!aclaracion) {
    showToast("Falta la aclaración de quien firma.");
    signAclaracion.focus();
    return;
  }

  const data = getFormData();
  data.firma_aclaracion = aclaracion;
  data.firma_cargo = signCargo.value.trim();
  data.numero_presupuesto = numeroPresupuestoInput.value.trim();
  data.descuento_pct = getDescuentoPct();
  // Garantiza que el costo final SIEMPRE quede con un valor (importe
  // menos el descuento aplicado) aunque el técnico haya dejado el
  // campo en blanco sin querer -- antes, si quedaba vacío, se
  // guardaba vacío en la base sin ningún respaldo.
  if (!data.costo_final) {
    const importeNum = parseMonto(document.getElementById("f_importe").value);
    if (!isNaN(importeNum)) {
      data.costo_final = formatMonto(importeNum - (importeNum * data.descuento_pct / 100));
    }
  }
  // El N° de parte que se muestra y se manda por mail toma el N° de
  // servicio real (el que viene del listado precargado). Solo se genera
  // uno automático si el técnico cargó el parte manualmente, sin elegir
  // un servicio de la lista.
  const idParte = data.numero_servicio ? data.numero_servicio : generarIdParte();
  const signatureDataUrl = normalizarFirmaParaMail(canvas);
  const signatureImgTag = `<img src="${signatureDataUrl}" alt="Firma del cliente" width="320" height="110" style="display:block; width:320px; height:110px; border:0;" />`;

  const payload = { tipo: "parte", idParte, data, signatureImgTag, signatureDataUrl, fotoBase64, fotoMimeType, sim: simElegidaParaParte() };

  showScreen("sending");
  setStatus("ENVIANDO", "busy");

  if (navigator.onLine === false) {
    // Directo a la cola, sin ni siquiera intentar (ahorra la espera
    // del timeout de red cuando ya se sabe que no hay conexión).
    agregarAColaEnvios(payload);
    setStatus("");
    doneId.textContent = `N° de parte: ${idParte}`;
    doneMessage.textContent = "Sin conexión — el parte se guardó en el celular y se va a enviar solo apenas vuelva la señal.";
    showScreen("done");
    sonarError();
    registrarTestPendienteDeQuitar(data.cliente);
    return;
  }

  const resultado = await intentarEnviarParte(payload, true);
  const { oficinaOk, clienteOk, clienteIntentado, fotoError } = resultado;

  setStatus(oficinaOk ? "LISTO" : "");
  doneId.textContent = `N° de parte: ${idParte}`;
  sugerenciasWrap.classList.add("hidden");
  sugerenciasList.innerHTML = "";
  vehiculoRecordatorioWrap.classList.add("hidden");
  seguimientoDoneWrap.classList.add("hidden");
  if (oficinaOk) {
    verificarYSugerirCercanos(data);
    verificarPrimerServicioSinVehiculo(data);
    // Se espera a que esto termine antes de seguir — si no, el
    // técnico podía ver "Enviado" y entrar a "Tus SIMs" en el
    // segundo siguiente, viendo el dato viejo porque el guardado
    // todavía estaba en camino (confuso, aunque no era ningún error
    // real: apenas terminaba de guardar, quedaba bien).
    await asignarSimInstaladaAlCliente(data, payload.sim);
    // Este, en cambio, no se espera — no es crítico, y no tiene
    // sentido demorar la pantalla de "enviado" por un extra.
    if (data.numero_servicio) iniciarSeguimientoSiCorresponde(data);
  }

  let mensajeFoto = "";
  if (fotoBase64 && fotoError) {
    mensajeFoto = ` (la foto no se pudo subir: ${fotoError})`;
  }

  if (oficinaOk && (clienteOk || !clienteIntentado)) {
    doneMessage.textContent = (clienteIntentado
      ? "Copia enviada a la oficina y al cliente"
      : "Copia enviada a la oficina (sin mail de cliente)") + mensajeFoto;
    showScreen("done");
    sonarExito();
  } else if (oficinaOk && clienteIntentado && !clienteOk) {
    doneMessage.textContent = "Enviado a la oficina, pero falló el envío al cliente" + mensajeFoto;
    showScreen("done");
    sonarExito();
  } else {
    // Falló el envío principal (a oficina) — se guarda para reintentar
    // solo automáticamente en vez de perder el parte.
    agregarAColaEnvios(payload);
    doneMessage.textContent = "No se pudo enviar en este momento — el parte quedó guardado y se va a reintentar solo cuando vuelva la conexión.";
    showScreen("done");
    sonarError();
  }
  registrarTestPendienteDeQuitar(data.cliente);
});

// ---------- Dashboard ----------
let historialCache = [];
let dashPeriodoActivo = "mes";
let chartTecnico = null;
let chartDias = null;
let chartDistancia = null;
let chartTipo = null;

function obtenerRangoPeriodo(periodo, inputFechaEspecifica) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (periodo === "todo") {
    return { desde: new Date(2000, 0, 1), hasta: new Date(2100, 0, 1) };
  }
  if (periodo === "dia") {
    return { desde: hoy, hasta: hoy };
  }
  if (periodo === "fecha") {
    // Fecha puntual elegida a mano — si todavía no eligió ninguna,
    // se muestra hoy por defecto (para no dejar la lista vacía).
    const elemento = inputFechaEspecifica || dashVehFechaEspecifica;
    const valor = elemento.value;
    if (!valor) return { desde: hoy, hasta: hoy };
    const [y, m, d] = valor.split("-").map(Number);
    const elegida = new Date(y, m - 1, d);
    return { desde: elegida, hasta: elegida };
  }
  if (periodo === "semana") {
    const diaSemana = (hoy.getDay() + 6) % 7; // 0 = lunes
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diaSemana);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    return { desde: lunes, hasta: domingo };
  }
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  return { desde: primero, hasta: ultimo };
}

// El mismo tipo de período, pero el tramo inmediato anterior — para
// mostrar "▲ 12% vs. período anterior" en las tarjetas KPI. "Todo" no
// tiene un "anterior" con sentido, así que no se compara.
function obtenerRangoPeriodoAnterior(periodo) {
  if (periodo === "todo") return null;
  if (periodo === "dia") {
    const ayer = new Date();
    ayer.setHours(0, 0, 0, 0);
    ayer.setDate(ayer.getDate() - 1);
    return { desde: ayer, hasta: ayer };
  }
  if (periodo === "semana") {
    const actual = obtenerRangoPeriodo("semana");
    const desde = new Date(actual.desde);
    desde.setDate(desde.getDate() - 7);
    const hasta = new Date(actual.hasta);
    hasta.setDate(hasta.getDate() - 7);
    return { desde, hasta };
  }
  const hoy = new Date();
  const primero = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  return { desde: primero, hasta: ultimo };
}

// Arma el HTML de "▲ 12% vs. período anterior" para meter debajo de un
// número de tarjeta KPI. actual/anterior son cantidades; null si ese
// período no tiene comparación (p. ej. "Todo").
function armarDeltaPeriodo(actual, anterior) {
  if (anterior == null) return "";
  if (anterior === 0) {
    return actual > 0
      ? `<div class="dash-card-delta up">▲ nuevo</div>`
      : `<div class="dash-card-delta neutral">= sin cambios</div>`;
  }
  const cambio = ((actual - anterior) / anterior) * 100;
  if (Math.abs(cambio) < 1) return `<div class="dash-card-delta neutral">= vs. anterior</div>`;
  const signo = cambio > 0 ? "▲" : "▼";
  const clase = cambio > 0 ? "up" : "down";
  return `<div class="dash-card-delta ${clase}">${signo} ${Math.abs(Math.round(cambio))}% vs. anterior</div>`;
}

function fechaEnRango(fechaStr, rango) {
  if (!fechaStr) return false;
  const [y, m, d] = fechaStr.split("-").map(Number);
  if (!y || !m || !d) return false;
  const f = new Date(y, m - 1, d);
  return f >= rango.desde && f <= rango.hasta;
}

function minutosEntre(entrada, salida) {
  if (!entrada || !salida) return null;
  const [hE, mE] = entrada.split(":").map(Number);
  const [hS, mS] = salida.split(":").map(Number);
  if ([hE, mE, hS, mS].some((n) => Number.isNaN(n))) return null;
  let total = (hS * 60 + mS) - (hE * 60 + mE);
  if (total < 0) total += 24 * 60;
  return total;
}


// ======================================================================
// Dashboards del skin nuevo: cifra principal, variación, mini-gráfico,
// mosaicos y barra de proporción (el skin clásico sigue con sus tarjetas).
// ======================================================================
function coloresDash() {
  const claro = ["day", "contraste"].includes(document.documentElement.dataset.theme);
  // Par validado (contraste y daltonismo) para comparar dos cosas: ocre SAT + azul.
  return claro
    ? { acento: "#B87F00", lavado: "rgba(184,127,0,0.10)", par: ["#B87F00", "#2F6AA8"], superficie: "#FFFFFF", gris: "#C4C1B8" }
    : { acento: "#FFC033", lavado: "rgba(255,192,51,0.10)", par: ["#BE8B00", "#4A86C4"], superficie: "#23211E", gris: "#4A4741" };
}
function serieDiaria(rango, filas, valorDe) {
  const porDia = {};
  const cursor = new Date(rango.desde);
  const hoy = new Date();
  while (cursor <= rango.hasta && cursor <= hoy) {
    porDia[fechaLocalISO(cursor)] = 0;
    cursor.setDate(cursor.getDate() + 1);
  }
  filas.forEach((h) => { if (h.fecha && h.fecha in porDia) porDia[h.fecha] += valorDe(h); });
  return Object.keys(porDia).sort().map((k) => porDia[k]);
}
function sparklineSVG(valores) {
  if (!valores || valores.length < 2) return "";
  const c = coloresDash();
  const W = 300, H = 56, P = 5;
  const max = Math.max(...valores, 1);
  const x = (i) => P + (i * (W - 2 * P)) / (valores.length - 1);
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const puntos = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const ultimo = valores.length - 1;
  return `<svg class="dash-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path d="M${x(0)},${H - P} L${puntos.join(" L")} L${x(ultimo)},${H - P} Z" fill="${c.lavado}" stroke="none"/>
    <polyline points="${puntos.join(" ")}" fill="none" stroke="${c.acento}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg><span class="dash-spark-punto" style="left:calc(${(x(ultimo) / W) * 100}% - 6px); top:calc(${(y(valores[ultimo]) / H) * 100}% - 6px); background:${c.acento}; box-shadow:0 0 0 2px ${c.superficie};"></span>`;
}
function deltaPill(actual, anterior, periodoAnterior, subirEsBueno = true) {
  if (anterior == null) return "";
  if (anterior === 0 && actual === 0) return `<span class="dash-delta neutro">Igual que ${periodoAnterior}</span>`;
  if (anterior === 0) return `<span class="dash-delta ${subirEsBueno ? "bien" : "mal"}">▲ Más que ${periodoAnterior} (sin registros)</span>`;
  const cambio = Math.round(((actual - anterior) / anterior) * 100);
  if (Math.abs(cambio) < 1) return `<span class="dash-delta neutro">= Igual que ${periodoAnterior}</span>`;
  const sube = cambio > 0;
  const clase = sube === subirEsBueno ? "bien" : "mal";
  return `<span class="dash-delta ${clase}">${sube ? "▲" : "▼"} ${Math.abs(cambio)}% vs. ${periodoAnterior}</span>`;
}
const TEXTO_PERIODO = { dia: ["hoy", "ayer"], semana: ["esta semana", "la semana pasada"], mes: ["este mes", "el mes pasado"] };
function heroDash({ valor, etiqueta, delta, serie }) {
  return `<div class="dash-hero-num">${valor}</div>
    <div class="dash-hero-label">${etiqueta}</div>
    ${delta || ""}
    ${serie ? `<div class="dash-spark-wrap">${sparklineSVG(serie)}</div>` : ""}`;
}
function tileDash({ valor, etiqueta, nota, estado }) {
  return `<div class="dash-tile${estado ? " estado-" + estado : ""}">
    <div class="dash-tile-num">${valor}</div>
    <div class="dash-tile-label">${estado === "atencion" ? "⚠ " : ""}${etiqueta}</div>
    ${nota ? `<div class="dash-tile-nota">${nota}</div>` : ""}
  </div>`;
}
function renderDashGeneralNuevo(d) {
  const hero = document.getElementById("dashHero");
  const tiles = document.getElementById("dashTiles");
  const mix = document.getElementById("dashMix");
  const activo = esSkinNuevo();
  [hero, tiles, mix].forEach((el) => { if (el) el.hidden = !activo; });
  if (!activo) return;
  const [ahora, antes] = TEXTO_PERIODO[dashPeriodoActivo] || ["en el período", "el período anterior"];
  const rangoAnterior = obtenerRangoPeriodoAnterior(dashPeriodoActivo);
  const anterior = rangoAnterior ? historialCache.filter((h) => fechaEnRango(h.fecha, rangoAnterior)).length : null;
  const serie = dashPeriodoActivo === "dia" ? null : serieDiaria(d.rango, d.enPeriodo, () => 1);
  hero.innerHTML = heroDash({
    valor: d.enPeriodo.length,
    etiqueta: `servicio${d.enPeriodo.length === 1 ? "" : "s"} resuelto${d.enPeriodo.length === 1 ? "" : "s"} ${ahora}`,
    delta: deltaPill(d.enPeriodo.length, anterior, antes),
    serie,
  });
  const diasTranscurridos = Math.max(1, serie ? serie.length : 1);
  tiles.innerHTML = [
    tileDash({ valor: d.pendientes, etiqueta: "Pendientes ahora" }),
    tileDash({ valor: d.estancados, etiqueta: d.estancados ? "Esperando hace 3+ días" : "Ninguno trabado", estado: d.estancados ? "atencion" : "ok" }),
    tileDash({ valor: d.tiempoPromedio, etiqueta: "Tiempo promedio en el cliente" }),
    tileDash({ valor: (d.enPeriodo.length / diasTranscurridos).toFixed(1).replace(".", ","), etiqueta: "Resueltos por día", nota: dashPeriodoActivo === "dia" ? "" : `en ${diasTranscurridos} día${diasTranscurridos === 1 ? "" : "s"}` }),
  ].join("");
  const total = d.instalaciones + d.servicios;
  const c = coloresDash();
  mix.innerHTML = total ? `
    <div class="dash-mix-titulo">Qué se hizo ${ahora}</div>
    <div class="dash-mix-barra" role="img" aria-label="${d.instalaciones} instalaciones y ${d.servicios} servicios técnicos">
      ${d.instalaciones ? `<span style="flex:${d.instalaciones}; background:${c.par[0]};"></span>` : ""}
      ${d.servicios ? `<span style="flex:${d.servicios}; background:${c.par[1]};"></span>` : ""}
    </div>
    <div class="dash-mix-leyenda">
      <span><i style="background:${c.par[0]};"></i>Instalaciones <b>${d.instalaciones}</b> · ${Math.round((d.instalaciones / total) * 100)}%</span>
      <span><i style="background:${c.par[1]};"></i>Servicios técnicos <b>${d.servicios}</b> · ${Math.round((d.servicios / total) * 100)}%</span>
    </div>` : "";
  mix.hidden = !total;
}
function renderDashFinNuevo(d) {
  const hero = document.getElementById("dashFinHero");
  const tiles = document.getElementById("dashFinTiles");
  const pagoWrap = document.getElementById("dashFinPagoWrap");
  const activo = esSkinNuevo();
  [hero, tiles, pagoWrap].forEach((el) => { if (el) el.hidden = !activo; });
  if (!activo) return;
  const [ahora, antes] = TEXTO_PERIODO[dashFinPeriodoActivo] || ["en el período", "el período anterior"];
  const rangoAnt = obtenerRangoPeriodoAnterior(dashFinPeriodoActivo);
  const montoAnt = rangoAnt ? historialCache.filter((h) => fechaEnRango(h.fecha, rangoAnt) && !esBonificado(h.costo_final)).reduce((a, h) => a + (parseMonto(h.costo_final) || 0), 0) : null;
  const serie = dashFinPeriodoActivo === "dia" ? null : serieDiaria(d.rango, d.enPeriodo.filter((h) => !esBonificado(h.costo_final)), (h) => parseMonto(h.costo_final) || 0);
  hero.innerHTML = heroDash({
    valor: "$" + Math.round(d.montoTotal).toLocaleString("es-AR"),
    etiqueta: `cobrado ${ahora}`,
    delta: deltaPill(d.montoTotal, montoAnt, antes),
    serie,
  });
  const total = d.pagos + d.bonificados;
  tiles.innerHTML = [
    tileDash({ valor: d.pagos, etiqueta: "Servicios cobrados" }),
    tileDash({ valor: d.bonificados, etiqueta: "Sin cargo", nota: total ? `${Math.round((d.bonificados / total) * 100)}% del total` : "" }),
    tileDash({ valor: d.pagos ? "$" + Math.round(d.montoTotal / d.pagos).toLocaleString("es-AR") : "—", etiqueta: "Ticket promedio" }),
  ].join("");
  // Cobrado por forma de pago (barras horizontales, de mayor a menor)
  const porForma = {};
  d.enPeriodo.filter((h) => !esBonificado(h.costo_final)).forEach((h) => {
    const f = (h.forma_pago || "Sin indicar").toString().trim() || "Sin indicar";
    const k = f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
    porForma[k] = (porForma[k] || 0) + (parseMonto(h.costo_final) || 0);
  });
  const formas = Object.keys(porForma).sort((a, b) => porForma[b] - porForma[a]);
  if (chartFinPago) { chartFinPago.destroy(); chartFinPago = null; }
  if (!formas.length) { pagoWrap.hidden = true; return; }
  pagoWrap.style.height = `${80 + formas.length * 40}px`;
  chartFinPago = new Chart(document.getElementById("dashChartFinPago"), {
    type: "bar",
    data: { labels: formas, datasets: [{ label: "Cobrado", data: formas.map((f) => porForma[f]), backgroundColor: "#F5A623" }] },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 70 } },
      plugins: {
        legend: { display: false },
        title: { display: true, text: "Cobrado por forma de pago" },
        datalabels: { display: true, anchor: "end", align: "right", clip: false, color: "#101820", font: { weight: "700", size: 12 }, formatter: (v) => "$" + Math.round(v).toLocaleString("es-AR") },
        tooltip: { callbacks: { label: (ctx) => " $" + Math.round(ctx.raw).toLocaleString("es-AR") } },
      },
      scales: { x: { beginAtZero: true, ticks: { callback: (v) => "$" + (v >= 1000 ? Math.round(v / 1000) + " mil" : v) } } },
    },
  });
}
let chartFinPago = null;

async function fetchDashboard() {
  dashStatus.textContent = "Cargando datos...";
  dashTecnicosList.innerHTML = "";
  dashRepetidosList.innerHTML = "";
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/historial", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    historialCache = Array.isArray(data) ? data : [];
    dashSyncLabel.textContent = formatSyncTime(new Date());
    await renderDashboard();
  } catch (err) {
    dashStatus.textContent = "No se pudo cargar el historial para el dashboard.";
  }
}
refreshDashboardBtn.addEventListener("click", fetchDashboard);

let ultimoEnPeriodoGeneral = [];

async function renderDashboard() {
  const rango = obtenerRangoPeriodo(dashPeriodoActivo);
  const enPeriodo = historialCache.filter((h) => fechaEnRango(h.fecha, rango));
  ultimoEnPeriodoGeneral = enPeriodo;

  // Pendientes actuales: servicios cargados que todavía no aparecen en
  // el historial (nunca se completaron).
  const numerosCompletados = new Set(historialCache.map((h) => h.numero_servicio).filter(Boolean));
  const pendientesActuales = serviciosCache.filter((s) => !numerosCompletados.has(s.numero_servicio)).length;
  dashPendientesNum.textContent = pendientesActuales;
  dashResueltosNum.textContent = enPeriodo.length;

  const instalaciones = enPeriodo.filter((h) => h.es_instalacion).length;
  const serviciosComunes = enPeriodo.length - instalaciones;
  dashInstalacionesNum.textContent = instalaciones;
  dashServiciosNum.textContent = serviciosComunes;

  // Comparación contra el mismo período anterior (semana pasada, mes
  // pasado, etc.) — para saber de un vistazo si veníamos mejor o peor,
  // no solo el número suelto de este período. "Todo" no se compara.
  const rangoAnterior = obtenerRangoPeriodoAnterior(dashPeriodoActivo);
  if (rangoAnterior) {
    const enPeriodoAnterior = historialCache.filter((h) => fechaEnRango(h.fecha, rangoAnterior));
    const instalacionesAnterior = enPeriodoAnterior.filter((h) => h.es_instalacion).length;
    dashResueltosDelta.innerHTML = armarDeltaPeriodo(enPeriodo.length, enPeriodoAnterior.length);
    dashInstalacionesDelta.innerHTML = armarDeltaPeriodo(instalaciones, instalacionesAnterior);
    dashServiciosDelta.innerHTML = armarDeltaPeriodo(serviciosComunes, enPeriodoAnterior.length - instalacionesAnterior);
  } else {
    dashResueltosDelta.innerHTML = "";
    dashInstalacionesDelta.innerHTML = "";
    dashServiciosDelta.innerHTML = "";
  }

  // Pendientes hace 3+ días (mismo umbral "atención" que ya se usa en
  // el listado de servicios) y tiempo promedio por servicio resuelto
  // en el período — dan una foto rápida de cómo viene la carga de
  // trabajo, más allá de solo contar cuántos se resolvieron.
  const estancados = serviciosCache.filter((s) => {
    if (numerosCompletados.has(s.numero_servicio)) return false;
    const dias = diasEstancado(s);
    return dias != null && dias >= DIAS_ATENCION;
  }).length;
  dashEstancadosNum.textContent = estancados;

  const duraciones = enPeriodo.map((h) => minutosEntre(h.hora_entrada, h.hora_salida)).filter((m) => m != null && m >= 0);
  if (duraciones.length > 0) {
    const promedioMin = Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length);
    const horas = Math.floor(promedioMin / 60);
    const minutos = promedioMin % 60;
    dashTiempoPromedioNum.textContent = horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;
  } else {
    dashTiempoPromedioNum.textContent = "—";
  }
  try {
    renderDashGeneralNuevo({ rango, enPeriodo, pendientes: pendientesActuales, estancados, tiempoPromedio: dashTiempoPromedioNum.textContent, instalaciones, servicios: serviciosComunes });
  } catch (e) { /* el resto del dashboard sigue */ }

  const canvasTipo = document.getElementById("dashChartTipo");
  if (chartTipo) chartTipo.destroy();
  if (enPeriodo.length > 0) {
    chartTipo = new Chart(canvasTipo, {
      type: "doughnut",
      data: {
        labels: ["Instalaciones", "Servicios técnicos"],
        datasets: [{ data: [instalaciones, serviciosComunes], backgroundColor: ["#F5A623", "#101820"] }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 10 } } },
          title: { display: true, text: "Instalación vs. servicio técnico" },
          datalabels: DATALABELS_PORCENTAJE,
        },
      },
    });
  }

  // Agrupar por técnico: cantidad, tiempo promedio, y días (para calcular
  // distancia entre paradas consecutivas del mismo día). Si el parte
  // tiene un segundo técnico, el servicio cuenta completo para los dos.
  const porTecnico = {};
  enPeriodo.forEach((h) => {
    const nombres = [h.tecnico, h.tecnico2].filter(Boolean);
    if (nombres.length === 0) nombres.push("(sin técnico)");
    nombres.forEach((nombre) => {
      if (!porTecnico[nombre]) porTecnico[nombre] = { cantidad: 0, minutosTotal: 0, conTiempo: 0, dias: {} };
      porTecnico[nombre].cantidad++;
      const minutos = minutosEntre(h.hora_entrada, h.hora_salida);
      if (minutos != null) {
        porTecnico[nombre].minutosTotal += minutos;
        porTecnico[nombre].conTiempo++;
      }
      const dia = h.fecha || "sin-fecha";
      if (!porTecnico[nombre].dias[dia]) porTecnico[nombre].dias[dia] = [];
      porTecnico[nombre].dias[dia].push(h);
    });
  });

  dashStatus.textContent = Object.keys(porTecnico).length > 0 ? "Calculando distancias..." : "";

  renderChartTecnico(porTecnico);
  renderChartDias(rango, enPeriodo);

  // Distancia aproximada: geocodifica las direcciones de cada día y
  // suma la distancia entre paradas consecutivas (ordenadas por hora
  // de entrada). Es una aproximación en línea recta, no una ruta real.
  for (const nombre of Object.keys(porTecnico)) {
    const dias = porTecnico[nombre].dias;
    let distanciaTotal = 0;
    for (const dia of Object.keys(dias)) {
      const paradas = dias[dia]
        .filter((h) => h.direccion)
        .sort((a, b) => (a.hora_entrada || "").localeCompare(b.hora_entrada || ""));
      if (paradas.length < 2) continue;
      const items = paradas.map((h, i) => ({ id: `p${i}`, direccion: h.direccion, localidad: h.localidad || "" }));
      try {
        const geoRes = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
          body: JSON.stringify({ items }),
        });
        const geoData = await geoRes.json();
        const porId = {};
        (geoData.results || []).forEach((r) => { porId[r.id] = r; });
        for (let i = 1; i < paradas.length; i++) {
          const a = porId[`p${i - 1}`];
          const b = porId[`p${i}`];
          if (a && b && !a.error && !b.error && !a.pendiente && !b.pendiente) {
            distanciaTotal += distanciaMetros(a.lat, a.lon, b.lat, b.lon);
          }
        }
      } catch (err) {
        // si falla la geocodificación de ese día, se sigue sin sumarlo
      }
    }
    porTecnico[nombre].distanciaKm = distanciaTotal / 1000;
  }
  dashStatus.textContent = "";
  renderChartDistancia(porTecnico);

  // Ranking del período elegido arriba (Día / Semana / Mes) para las
  // medallas — el técnico con más resueltos en ese período.
  const nombresOrdenados = Object.keys(porTecnico).sort((a, b) => porTecnico[b].cantidad - porTecnico[a].cantidad);
  const medallas = {
    [nombresOrdenados[0]]: { texto: "1°", clase: "medalla-oro" },
    [nombresOrdenados[1]]: { texto: "2°", clase: "medalla-plata" },
    [nombresOrdenados[2]]: { texto: "3°", clase: "medalla-bronce" },
  };
  const etiquetaPeriodo = { dia: "hoy", semana: "esta semana", mes: "este mes" }[dashPeriodoActivo];

  dashTecnicosList.innerHTML = "";
  const nombresTecnicos = Object.keys(porTecnico);
  if (nombresTecnicos.length === 0) {
    dashTecnicosList.innerHTML = '<p class="list-status">No hay servicios resueltos en este período.</p>';
  } else {
    nombresOrdenados
      .forEach((nombre) => {
        const stats = porTecnico[nombre];
        const promedioMin = stats.conTiempo > 0 ? Math.round(stats.minutosTotal / stats.conTiempo) : null;
        const promedioTexto = promedioMin == null ? "—" :
          (promedioMin >= 60 ? `${Math.floor(promedioMin / 60)}h ${promedioMin % 60}m` : `${promedioMin} min`);
        const medalla = medallas[nombre] || "";
        const card = document.createElement("div");
        card.className = "dash-tecnico-card";
        card.style.setProperty("--avance", String(Math.round((stats.cantidad / Math.max(1, porTecnico[nombresOrdenados[0]].cantidad)) * 100) / 100));
        card.innerHTML = `
          <div class="dash-tecnico-nombre">${escapeHtml(nombre)}${medalla ? ` <span class="dash-medalla ${medalla.clase}" title="Ranking de ${etiquetaPeriodo}">${medalla.texto}</span>` : ""}</div>
          <div class="dash-tecnico-stats">
            <span class="dash-tecnico-stat"><b>${stats.cantidad}</b> resueltos</span>
            <span class="dash-tecnico-stat">Promedio: <b>${promedioTexto}</b></span>
            <span class="dash-tecnico-stat">Distancia aprox.: <b>${stats.distanciaKm.toFixed(1)} km</b></span>
          </div>
        `;
        dashTecnicosList.appendChild(card);
      });
  }

  // Clientes repetidos: siempre en base al mes actual, sin importar el
  // período elegido arriba (así lo pediste).
  const rangoMes = obtenerRangoPeriodo("mes");
  const delMes = historialCache.filter((h) => fechaEnRango(h.fecha, rangoMes));
  const porTecnicoCliente = {};
  delMes.forEach((h) => {
    if (!h.cliente) return;
    const nombres = [h.tecnico, h.tecnico2].filter(Boolean);
    if (nombres.length === 0) nombres.push("");
    nombres.forEach((nombreTecnico) => {
      const clave = `${nombreTecnico}|${h.cliente}`;
      if (!porTecnicoCliente[clave]) porTecnicoCliente[clave] = { n: 0, fechas: [] };
      porTecnicoCliente[clave].n++;
      if (h.fecha) porTecnicoCliente[clave].fechas.push(h.fecha);
    });
  });
  const repetidos = Object.entries(porTecnicoCliente)
    .filter(([, info]) => info.n > 1)
    .map(([clave, info]) => {
      const [tecnico, cliente] = clave.split("|");
      return { tecnico, cliente, n: info.n, fechas: info.fechas.sort() };
    })
    .sort((a, b) => b.n - a.n);

  dashRepetidosList.innerHTML = "";
  if (repetidos.length === 0) {
    dashRepetidosList.innerHTML = '<p class="list-status">Ningún técnico repitió cliente este mes.</p>';
  } else {
    repetidos.forEach(({ tecnico, cliente, n, fechas }) => {
      const card = document.createElement("div");
      card.className = "dash-repetido-card";
      card.innerHTML = `
        <div><b>${escapeHtml(tecnico) || "(sin técnico)"}</b> volvió a <b>${escapeHtml(cliente)}</b> ${n} veces este mes</div>
        <div class="dash-repetido-fechas">Fechas: ${fechas.join(", ")}</div>
      `;
      dashRepetidosList.appendChild(card);
    });
  }
}

function renderChartTecnico(porTecnico) {
  const canvas = document.getElementById("dashChartTecnico");
  if (chartTecnico) chartTecnico.destroy();
  const nombres = Object.keys(porTecnico).sort((a, b) => porTecnico[b].cantidad - porTecnico[a].cantidad);
  if (nombres.length === 0) return;
  if (esSkinNuevo()) {
    canvas.parentElement.style.height = `${90 + nombres.length * 40}px`;
    chartTecnico = new Chart(canvas, {
      type: "bar",
      data: { labels: nombres, datasets: [{ label: "Resueltos", data: nombres.map((n) => porTecnico[n].cantidad), backgroundColor: "#F5A623" }] },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 36 } },
        plugins: {
          legend: { display: false }, title: { display: true, text: "Resueltos por técnico" },
          datalabels: { display: true, anchor: "end", align: "right", clip: false, color: "#101820", font: { weight: "700", size: 13 }, formatter: (v) => (v > 0 ? v : "") },
        },
        scales: { x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } },
      },
    });
    return;
  }
  canvas.parentElement.style.height = "";
  chartTecnico = new Chart(canvas, {
    type: "bar",
    data: {
      labels: nombres,
      datasets: [{ label: "Resueltos", data: nombres.map((n) => porTecnico[n].cantidad), backgroundColor: "#F5A623" }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: "Resueltos por técnico" },
        datalabels: {
          display: true,
          anchor: "end",
          align: "top",
          color: "#101820",
          font: { family: "'Space Grotesk', sans-serif", weight: "700", size: 12 },
          formatter: (v) => (v > 0 ? v : ""),
        },
      },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      layout: { padding: { top: 16 } },
    },
  });
}

function renderChartDias(rango, enPeriodo) {
  const canvas = document.getElementById("dashChartDias");
  if (chartDias) chartDias.destroy();

  const porDia = {};
  const cursor = new Date(rango.desde);
  while (cursor <= rango.hasta) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    porDia[key] = 0;
    cursor.setDate(cursor.getDate() + 1);
  }
  enPeriodo.forEach((h) => { if (h.fecha && Object.prototype.hasOwnProperty.call(porDia, h.fecha)) porDia[h.fecha]++; });

  const claves = Object.keys(porDia).sort();
  const labels = claves.map((k) => { const [, m, d] = k.split("-"); return `${d}/${m}`; });
  const datos = claves.map((k) => porDia[k]);

  chartDias = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Resueltos",
        data: datos,
        borderColor: "#101820",
        backgroundColor: "rgba(16,24,32,0.1)",
        fill: true,
        tension: 0.3,
        pointRadius: labels.length > 15 ? 0 : 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, title: { display: true, text: "Resueltos por día" } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

const PALETA_TECNICOS = ["#F5A623", "#2E86DE", "#7B4B94", "#2E9E4F", "#C0392B", "#17A2A0", "#101820", "#8B5E3C"];

function renderChartDistancia(porTecnico) {
  const canvas = document.getElementById("dashChartDistancia");
  if (chartDistancia) chartDistancia.destroy();
  const nombres = Object.keys(porTecnico).filter((n) => porTecnico[n].distanciaKm > 0);
  if (nombres.length === 0) return;
  if (esSkinNuevo()) {
    // Una torta con muchos técnicos no se compara bien: barras ordenadas.
    nombres.sort((a, b) => porTecnico[b].distanciaKm - porTecnico[a].distanciaKm);
    canvas.parentElement.style.height = `${90 + nombres.length * 40}px`;
    chartDistancia = new Chart(canvas, {
      type: "bar",
      data: { labels: nombres, datasets: [{ label: "Km", data: nombres.map((n) => Math.round(porTecnico[n].distanciaKm * 10) / 10), backgroundColor: "#F5A623" }] },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 56 } },
        plugins: {
          legend: { display: false }, title: { display: true, text: "Distancia aproximada recorrida" },
          datalabels: { display: true, anchor: "end", align: "right", clip: false, color: "#101820", font: { weight: "700", size: 12 }, formatter: (v) => `${String(v).replace(".", ",")} km` },
        },
        scales: { x: { beginAtZero: true, ticks: { callback: (v) => v + " km" } } },
      },
    });
    return;
  }
  canvas.parentElement.style.height = "";
  chartDistancia = new Chart(canvas, {
    type: "pie",
    data: {
      labels: nombres.map((n) => `${n} (${porTecnico[n].distanciaKm.toFixed(1)} km)`),
      datasets: [{
        data: nombres.map((n) => porTecnico[n].distanciaKm),
        backgroundColor: nombres.map((_, i) => PALETA_TECNICOS[i % PALETA_TECNICOS.length]),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 10 } } },
        title: { display: true, text: "Distancia aproximada recorrida" },
        datalabels: DATALABELS_PORCENTAJE,
      },
    },
  });
}

document.querySelectorAll(".dash-periodo-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".dash-periodo-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    dashPeriodoActivo = chip.dataset.periodo;
    renderDashboard();
  });
});

verDashboardBtn.addEventListener("click", () => {
  showScreen("dashboard");
  fetchDashboard();
});
volverDeDashboardBtn.addEventListener("click", () => {
  showScreen("dashboardsMenu");
});

// ---------- Dashboard financiero (solo Sebastian Bartolozzi) ----------
let dashFinPeriodoActivo = "mes";
let chartFinDias = null;

function esBonificado(costoFinalTexto) {
  const valor = parseMonto(costoFinalTexto);
  return !valor || valor <= 0;
}

async function fetchDashboardFinanciero() {
  dashFinStatus.textContent = "Cargando datos...";
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/historial", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    historialCache = Array.isArray(data) ? data : [];
    dashFinSyncLabel.textContent = formatSyncTime(new Date());
    dashFinStatus.textContent = "";
    renderDashboardFinanciero();
  } catch (err) {
    dashFinStatus.textContent = "No se pudo cargar el historial para el dashboard financiero.";
  }
}
refreshDashboardFinancieroBtn.addEventListener("click", fetchDashboardFinanciero);

let ultimoEnPeriodoFinanciero = [];

function renderDashboardFinanciero() {
  const rango = obtenerRangoPeriodo(dashFinPeriodoActivo);
  const enPeriodo = historialCache.filter((h) => fechaEnRango(h.fecha, rango));
  ultimoEnPeriodoFinanciero = enPeriodo;

  let pagos = 0;
  let bonificados = 0;
  let montoTotal = 0;

  enPeriodo.forEach((h) => {
    if (esBonificado(h.costo_final)) {
      bonificados++;
    } else {
      pagos++;
      montoTotal += parseMonto(h.costo_final) || 0;
    }
  });

  dashFinPagosNum.textContent = pagos;
  dashFinBonificadosNum.textContent = bonificados;
  dashFinTotalNum.textContent = formatMonto(montoTotal);
  dashFinPromedioNum.textContent = pagos > 0 ? formatMonto(montoTotal / pagos) : "—";

  // Comparación contra el mismo período anterior, igual que en el
  // dashboard general.
  const rangoAnteriorFin = obtenerRangoPeriodoAnterior(dashFinPeriodoActivo);
  if (rangoAnteriorFin) {
    const montoAnterior = historialCache
      .filter((h) => fechaEnRango(h.fecha, rangoAnteriorFin) && !esBonificado(h.costo_final))
      .reduce((acc, h) => acc + (parseMonto(h.costo_final) || 0), 0);
    dashFinTotalDelta.innerHTML = armarDeltaPeriodo(montoTotal, montoAnterior);
  } else {
    dashFinTotalDelta.innerHTML = "";
  }

  try { renderDashFinNuevo({ rango, enPeriodo, pagos, bonificados, montoTotal }); } catch (e) { /* el resto sigue */ }

  // Gráfico: monto generado por día a lo largo del período.
  const porDia = {};
  const cursor = new Date(rango.desde);
  while (cursor <= rango.hasta) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    porDia[key] = 0;
    cursor.setDate(cursor.getDate() + 1);
  }
  enPeriodo.forEach((h) => {
    if (h.fecha && Object.prototype.hasOwnProperty.call(porDia, h.fecha) && !esBonificado(h.costo_final)) {
      porDia[h.fecha] += parseMonto(h.costo_final) || 0;
    }
  });
  const claves = Object.keys(porDia).sort();
  const labels = claves.map((k) => { const [, m, d] = k.split("-"); return `${d}/${m}`; });
  const datos = claves.map((k) => porDia[k]);

  const canvas = document.getElementById("dashChartFinDias");
  if (chartFinDias) chartFinDias.destroy();
  chartFinDias = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Monto generado", data: datos, backgroundColor: "#2E7D32" }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, title: { display: true, text: "Monto generado por día" } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

document.querySelectorAll(".dash-fin-periodo-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".dash-fin-periodo-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    dashFinPeriodoActivo = chip.dataset.periodo;
    renderDashboardFinanciero();
  });
});

verDashboardFinancieroBtn.addEventListener("click", () => {
  showScreen("dashboardFinanciero");
  fetchDashboardFinanciero();
});
volverDeDashboardFinancieroBtn.addEventListener("click", () => {
  showScreen("dashboardsMenu");
});

// ---------- Consultas a manuales con IA ----------
let consultasCategoriasCache = [];
let consultasCategoriasCargadas = false;
let manualesCategoriaActual = [];
const consultaManualSelect = document.getElementById("consultaManualSelect");
const consultaManualSelectWrap = document.getElementById("consultaManualSelectWrap");
const consultaManualesFiltro = document.getElementById("consultaManualesFiltro");
const CACHE_MANUALES = "manuales-sat-v1";
const CONSULTAS_RECIENTES_KEY = "consultas_recientes";

async function cargarConsultasCategorias() {
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=consultas-categorias", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    consultasCategoriasCache = Array.isArray(data) ? data : [];
    consultasCategoriasCargadas = true;
  } catch (err) {
    consultasCategoriasCache = [];
  }
  const opciones = consultasCategoriasCache
    .map((c) => `<option value="${escapeHtml(c.categoria)}">${escapeHtml(c.categoria)}</option>`)
    .join("");
  consultaCategoriaSelect.innerHTML = `<option value="" disabled selected>Elegí una categoría</option>${opciones}`;
}

verConsultasBtn.addEventListener("click", () => {
  showScreen("consultas");
  consultaRespuestaWrap.classList.add("hidden");
  consultaManualesWrap.classList.add("hidden");
  consultaManualSelectWrap.classList.add("hidden");
  consultaStatus.textContent = "";
  hiloConsulta = []; hiloMeta = null;
  if (!consultasCategoriasCargadas) cargarConsultasCategorias();
  renderConsultasRecientes();
  cambiarTabManuales("ia");
});

consultaCategoriaSelect.addEventListener("change", () => {
  cargarManualesDeCategoria(consultaCategoriaSelect.value);
});

// ¿Qué manuales ya están guardados en el celular para verlos sin señal?
async function manualesGuardados() {
  try {
    if (!("caches" in window)) return new Set();
    const cache = await caches.open(CACHE_MANUALES);
    const claves = await cache.keys();
    return new Set(claves.map((r) => decodeURIComponent(new URL(r.url).pathname.split("/").pop())));
  } catch (e) { return new Set(); }
}

async function cargarManualesDeCategoria(categoria) {
  manualesCategoriaActual = [];
  consultaManualSelect.innerHTML = '<option value="">Todos los de la categoría (más lento)</option>';
  consultaManualSelectWrap.classList.add("hidden");
  if (!categoria) {
    consultaManualesWrap.classList.add("hidden");
    return;
  }
  consultaManualesWrap.classList.remove("hidden");
  consultaManualesStatus.textContent = "Buscando manuales...";
  consultaManualesList.innerHTML = "";
  consultaManualesFiltro.value = "";
  consultaManualesFiltro.classList.add("hidden");
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch(`/api/consultas?categoria=${encodeURIComponent(categoria)}`, { headers, cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    if (!Array.isArray(data) || data.length === 0) {
      consultaManualesStatus.textContent = "No hay manuales cargados en esta categoría todavía.";
      return;
    }
    manualesCategoriaActual = data.slice().sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
    consultaManualesStatus.textContent = "";
    consultaManualesFiltro.classList.toggle("hidden", manualesCategoriaActual.length <= 5);
    consultaManualSelect.innerHTML = '<option value="">Todos los de la categoría (más lento)</option>' +
      manualesCategoriaActual.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(nombreManualCorto(m.nombre))}</option>`).join("");
    if (manualesCategoriaActual.length === 1) consultaManualSelect.value = manualesCategoriaActual[0].id;
    consultaManualSelectWrap.classList.toggle("hidden", manualesCategoriaActual.length < 2);
    await renderListaManuales();
  } catch (err) {
    // Sin señal: se muestran los que estén guardados en el celular.
    const guardados = await manualesGuardados();
    const offline = JSON.parse(localStorage.getItem("manuales_nombres") || "{}");
    const propios = [...guardados].filter((id) => offline[id] && offline[id].categoria === categoria).map((id) => ({ id, nombre: offline[id].nombre }));
    if (propios.length) {
      manualesCategoriaActual = propios;
      consultaManualesStatus.textContent = "Sin señal: estos son los manuales que tenés guardados en el celular.";
      await renderListaManuales();
    } else {
      consultaManualesStatus.textContent = "No se pudieron cargar los manuales de esta categoría.";
    }
  }
}

function nombreManualCorto(nombre) {
  return String(nombre || "").replace(/\.pdf$/i, "");
}

let renderManualesGen = 0;
async function renderListaManuales() {
  const gen = ++renderManualesGen;
  const term = normalizeText(consultaManualesFiltro.value || "");
  const guardados = await manualesGuardados();
  if (gen !== renderManualesGen) return; // llegó otra búsqueda más nueva
  const lista = manualesCategoriaActual.filter((m) => !term || normalizeText(m.nombre).includes(term));
  consultaManualesList.innerHTML = "";
  if (!lista.length) {
    consultaManualesList.innerHTML = '<p class="list-status">Ningún manual coincide con esa búsqueda.</p>';
    return;
  }
  lista.forEach((manual) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "consulta-manual-item";
    const enCel = guardados.has(manual.id);
    item.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="vertical-align:-2px; margin-right:4px; flex-shrink:0;"><path d="M8 3h6l4 4v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/></svg><span class="cm-nombre">${escapeHtml(nombreManualCorto(manual.nombre))}</span>${enCel ? '<span class="cm-guardado" title="Se puede abrir sin señal">En el celular</span>' : ""}`;
    item.addEventListener("click", () => abrirManual(consultaCategoriaSelect.value, manual.id, manual.nombre, item));
    consultaManualesList.appendChild(item);
  });
}
consultaManualesFiltro.addEventListener("input", () => { renderListaManuales(); });

// Abre el manual. La primera vez lo baja y lo deja guardado en el celular
// (para verlo sin señal en la obra). En Android se baja como archivo con su
// nombre, así lo abre el visor de PDF del teléfono (las pestañas "blob:"
// muchas veces quedan en blanco en Android).
async function abrirManual(categoria, archivoId, nombre, botonElemento) {
  const esAndroid = /Android/i.test(navigator.userAgent);
  const nuevaVentana = esAndroid ? null : window.open("", "_blank");
  const nombreEl = botonElemento.querySelector(".cm-nombre");
  const textoOriginal = nombreEl ? nombreEl.textContent : botonElemento.textContent;
  if (nombreEl) nombreEl.textContent = "Abriendo..."; 
  botonElemento.disabled = true;
  try {
    let blob = null;
    let cache = null;
    const clave = `/manual-cache/${encodeURIComponent(archivoId)}`;
    try { if ("caches" in window) { cache = await caches.open(CACHE_MANUALES); const g = await cache.match(clave); if (g) blob = await g.blob(); } } catch (e) { /* sin cache */ }
    if (!blob) {
      const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
      const res = await fetch(`/api/consultas?categoria=${encodeURIComponent(categoria)}&archivo=${encodeURIComponent(archivoId)}`, { headers });
      if (!res.ok) throw new Error(navigator.onLine === false ? "sin señal y no está guardado en el celular" : "HTTP " + res.status);
      blob = await res.blob();
      try {
        if (cache) {
          await cache.put(clave, new Response(blob, { headers: { "Content-Type": "application/pdf" } }));
          const nombres = JSON.parse(localStorage.getItem("manuales_nombres") || "{}");
          nombres[archivoId] = { nombre, categoria };
          localStorage.setItem("manuales_nombres", JSON.stringify(nombres));
        }
      } catch (e) { /* sin espacio: se abre igual */ }
    }
    const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
    if (esAndroid) {
      const a = document.createElement("a");
      a.href = url;
      a.download = /\.pdf$/i.test(nombre) ? nombre : nombre + ".pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast("Manual descargado: abrilo desde la notificación o desde Descargas.");
    } else if (nuevaVentana) {
      nuevaVentana.location.href = url;
    } else {
      window.open(url, "_blank");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (nuevaVentana) nuevaVentana.close();
    showToast("No se pudo abrir el manual: " + err.message);
  } finally {
    if (nombreEl) nombreEl.textContent = textoOriginal;
    botonElemento.disabled = false;
    renderListaManuales();
  }
}
volverDeConsultasBtn.addEventListener("click", () => {
  showScreen("home");
});

// La IA responde con un markdown simple (**negrita**, listas, títulos):
// se muestra con formato en vez de con asteriscos sueltos.
function formatearRespuestaIA(texto) {
  const lineas = escapeHtml(String(texto || "")).split(/\r?\n/);
  let html = "", lista = null;
  const cerrar = () => { if (lista) { html += `</${lista}>`; lista = null; } };
  const inline = (t) => t.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<i>$2</i>").replace(/`([^`]+)`/g, "<code>$1</code>");
  lineas.forEach((l) => {
    const num = l.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const vin = l.match(/^\s*[-*•]\s+(.*)$/);
    const tit = l.match(/^\s*#{1,6}\s+(.*)$/);
    if (num) { if (lista !== "ol") { cerrar(); html += "<ol>"; lista = "ol"; } html += `<li>${inline(num[2])}</li>`; }
    else if (vin) { if (lista !== "ul") { cerrar(); html += "<ul>"; lista = "ul"; } html += `<li>${inline(vin[1])}</li>`; }
    else if (tit) { cerrar(); html += `<p class="cr-titulo">${inline(tit[1])}</p>`; }
    else if (!l.trim()) { cerrar(); }
    else { cerrar(); html += `<p>${inline(l)}</p>`; }
  });
  cerrar();
  return html;
}

function leerConsultasRecientes() {
  try { return JSON.parse(localStorage.getItem(CONSULTAS_RECIENTES_KEY) || "[]"); } catch (e) { return []; }
}
function guardarConsultaReciente(item) {
  const lista = [item, ...leerConsultasRecientes().filter((c) => !(c.pregunta === item.pregunta && c.categoria === item.categoria))].slice(0, 10);
  if (item.hilo) item.archivo = hiloMeta && hiloMeta.archivo;
  try { localStorage.setItem(CONSULTAS_RECIENTES_KEY, JSON.stringify(lista)); } catch (e) { /* sin espacio */ }
}
function mostrarRespuestaConsulta(c) {
  consultaRespuestaTexto.innerHTML = formatearRespuestaIA(c.respuesta);
  consultaManualesUsados.textContent = c.manuales && c.manuales.length ? `Basado en: ${c.manuales.join(", ")}` : "";
  consultaRespuestaWrap.classList.remove("hidden");
}
function renderConsultasRecientes() {
  const wrap = document.getElementById("consultaRecientesWrap");
  const cont = document.getElementById("consultaRecientesList");
  if (!wrap || !cont) return;
  const lista = leerConsultasRecientes();
  wrap.classList.toggle("hidden", lista.length === 0);
  cont.innerHTML = "";
  lista.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "consulta-reciente";
    const fecha = c.fecha ? new Date(c.fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "";
    b.innerHTML = `<span class="crc-preg">${escapeHtml(c.pregunta)}</span><span class="crc-meta">${escapeHtml(c.categoria)}${c.manualNombre ? " · " + escapeHtml(c.manualNombre) : ""}${fecha ? " · " + fecha : ""}</span>`;
    b.addEventListener("click", () => {
      consultaPreguntaInput.value = c.pregunta;
      hiloConsulta = Array.isArray(c.hilo) && c.hilo.length ? c.hilo.slice() : [{ pregunta: c.pregunta, respuesta: c.respuesta }];
      hiloMeta = { categoria: c.categoria, archivo: c.archivo || "", manualNombre: c.manualNombre || "", manuales: c.manuales || [] };
      renderHiloConsulta();
      consultaRespuestaWrap.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    cont.appendChild(b);
  });
}

// ---- Conversación con la IA: foto opcional y repreguntas ----
let hiloConsulta = [];      // [{ pregunta, respuesta }] de la consulta actual
let hiloMeta = null;        // { categoria, archivo, manualNombre, manuales }
let consultaFotoDataUrl = "";
const consultaFotoInput = document.getElementById("consultaFotoInput");
const consultaFotoPreview = document.getElementById("consultaFotoPreview");
const consultaRepreguntaInput = document.getElementById("consultaRepreguntaInput");
const repreguntarBtn = document.getElementById("repreguntarBtn");
const consultaHiloList = document.getElementById("consultaHiloList");

function renderFotoConsulta() {
  consultaFotoPreview.classList.toggle("hidden", !consultaFotoDataUrl);
  consultaFotoPreview.innerHTML = consultaFotoDataUrl
    ? `<img src="${consultaFotoDataUrl}" alt="Foto adjunta"><button type="button" class="consulta-foto-quitar" aria-label="Quitar foto">✕</button>` : "";
  const q = consultaFotoPreview.querySelector(".consulta-foto-quitar");
  if (q) q.addEventListener("click", () => { consultaFotoDataUrl = ""; renderFotoConsulta(); });
}
// Dos entradas: la cámara directa (capture) y la galería. En muchos Android
// el selector de archivos solo ofrece la galería, por eso van separadas.
[consultaFotoInput, document.getElementById("consultaCamaraInput")].forEach((input) => {
  if (!input) return;
  input.addEventListener("change", async () => {
    const f = input.files && input.files[0];
    input.value = "";
    if (!f) return;
    try { consultaFotoDataUrl = await comprimirImagen(f, 1280, 0.72); renderFotoConsulta(); }
    catch (e) { showToast("No se pudo leer la foto."); }
  });
});

function renderHiloConsulta() {
  // Las vueltas anteriores quedan arriba, la última respuesta abajo.
  consultaHiloList.innerHTML = hiloConsulta.slice(0, -1).map((t) =>
    `<div class="hilo-turno"><p class="hilo-preg">${escapeHtml(t.pregunta)}</p><div class="consulta-respuesta-texto">${formatearRespuestaIA(t.respuesta)}</div></div>`).join("");
  const ultima = hiloConsulta[hiloConsulta.length - 1];
  if (!ultima) return;
  consultaRespuestaTexto.innerHTML = (hiloConsulta.length > 1 ? `<p class="hilo-preg">${escapeHtml(ultima.pregunta)}</p>` : "") + formatearRespuestaIA(ultima.respuesta);
  consultaManualesUsados.textContent = hiloMeta && hiloMeta.manuales && hiloMeta.manuales.length ? `Basado en: ${hiloMeta.manuales.join(", ")}` : "";
  consultaRespuestaWrap.classList.remove("hidden");
}

async function enviarConsulta(pregunta, esRepregunta) {
  const categoria = esRepregunta ? hiloMeta.categoria : consultaCategoriaSelect.value;
  if (!categoria) { showToast("Elegí una categoría antes de preguntar."); return; }
  if (!pregunta && !consultaFotoDataUrl) { showToast(esRepregunta ? "Escribí la repregunta." : "Escribí tu pregunta o agregá una foto."); return; }
  const archivo = esRepregunta ? hiloMeta.archivo : (consultaManualSelect.value || "");
  const manualNombre = esRepregunta ? hiloMeta.manualNombre : (archivo ? nombreManualCorto((manualesCategoriaActual.find((m) => m.id === archivo) || {}).nombre) : "");
  const boton = esRepregunta ? repreguntarBtn : preguntarBtn;
  boton.disabled = true;
  if (!esRepregunta) { consultaRespuestaWrap.classList.add("hidden"); hiloConsulta = []; }
  const inicio = Date.now();
  const base = archivo ? `Leyendo "${manualNombre}" y consultando a la IA` : "Leyendo todos los manuales de la categoría y consultando a la IA";
  consultaStatus.textContent = base + "...";
  const reloj = setInterval(() => { consultaStatus.textContent = `${base}... ${Math.round((Date.now() - inicio) / 1000)} s`; }, 1000);
  try {
    const res = await fetch("/api/consultas", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ categoria, pregunta, archivo: archivo || undefined, imagen: consultaFotoDataUrl || undefined, historial: esRepregunta ? hiloConsulta : undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 429 || res.status === 504) throw new Error(data.error || "La consulta tardó demasiado. Probá eligiendo un manual puntual.");
      const detalle = typeof data.detail === "string" ? data.detail : "";
      throw new Error((data.error || "Error desconocido") + (detalle ? ` — ${detalle}` : ""));
    }
    consultaStatus.textContent = "";
    const preguntaMostrada = pregunta || "(consulta con foto)";
    if (!esRepregunta) hiloMeta = { categoria, archivo, manualNombre, manuales: data.manuales_usados || [] };
    hiloConsulta.push({ pregunta: preguntaMostrada, respuesta: data.respuesta });
    renderHiloConsulta();
    consultaFotoDataUrl = ""; renderFotoConsulta();
    if (esRepregunta) consultaRepreguntaInput.value = "";
    const item = { categoria, pregunta: hiloConsulta[0].pregunta, manualNombre, respuesta: data.respuesta, manuales: hiloMeta.manuales, hilo: hiloConsulta.slice(), fecha: new Date().toISOString() };
    guardarConsultaReciente(item);
    renderConsultasRecientes();
  } catch (err) {
    consultaStatus.textContent = (navigator.onLine === false ? "Sin señal: " : "No se pudo obtener una respuesta: ") + err.message;
  } finally {
    clearInterval(reloj);
    boton.disabled = false;
  }
}
preguntarBtn.addEventListener("click", () => enviarConsulta(consultaPreguntaInput.value.trim(), false));
repreguntarBtn.addEventListener("click", () => enviarConsulta(consultaRepreguntaInput.value.trim(), true));
document.getElementById("consultaNuevaBtn").addEventListener("click", () => {
  hiloConsulta = []; hiloMeta = null;
  consultaRespuestaWrap.classList.add("hidden");
  consultaPreguntaInput.value = "";
  consultaPreguntaInput.focus();
});
document.getElementById("consultaCompartirBtn").addEventListener("click", () => {
  if (!hiloConsulta.length) return;
  const contenido = hiloConsulta.map((t, i) => (hiloConsulta.length > 1 ? `${i === 0 ? "" : "\n"}Pregunta: ${t.pregunta}\n` : "") + t.respuesta).join("\n");
  cambiarTabManuales("equipo");
  abrirFormEquipo({ titulo: hiloConsulta[0].pregunta.slice(0, 150), contenido, categoria: hiloMeta ? hiloMeta.categoria : "", origen: "ia" });
});

// ---------- Datos del equipo (sección cooperativa de Manuales) ----------
let datosEquipoCache = [];
const CATEGORIAS_EQUIPO_FIJAS = ["General", "APN y líneas", "Códigos y claves de fábrica", "Configuraciones"];
const equipoLista = document.getElementById("equipoLista");
const equipoStatus = document.getElementById("equipoStatus");
const equipoForm = document.getElementById("equipoForm");

function cambiarTabManuales(tab) {
  document.querySelectorAll("#manTabs button").forEach((b) => {
    const act = b.dataset.tab === tab;
    b.classList.toggle("active", act);
    b.setAttribute("aria-selected", act ? "true" : "false");
  });
  document.getElementById("manTabIa").classList.toggle("hidden", tab !== "ia");
  document.getElementById("manTabEquipo").classList.toggle("hidden", tab !== "equipo");
  if (tab === "equipo") cargarDatosEquipo();
}
document.querySelectorAll("#manTabs button").forEach((b) => b.addEventListener("click", () => cambiarTabManuales(b.dataset.tab)));

function categoriasEquipo() {
  const set = new Set(CATEGORIAS_EQUIPO_FIJAS);
  (consultasCategoriasCache || []).forEach((c) => c.categoria && set.add(c.categoria));
  datosEquipoCache.forEach((d) => d.categoria && set.add(d.categoria));
  return [...set];
}
function poblarCategoriasEquipo() {
  const cats = categoriasEquipo();
  const filtro = document.getElementById("equipoFiltroCat");
  const elegido = filtro.value;
  filtro.innerHTML = '<option value="">Todas las categorías</option>' + cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  filtro.value = cats.includes(elegido) ? elegido : "";
  const sel = document.getElementById("equipoFormCategoria");
  const prev = sel.value;
  sel.innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if (prev && cats.includes(prev)) sel.value = prev;
}

async function cargarDatosEquipo() {
  try { datosEquipoCache = JSON.parse(localStorage.getItem("datos_equipo_cache") || "[]"); } catch (e) { datosEquipoCache = []; }
  if (!consultasCategoriasCargadas) cargarConsultasCategorias().then(poblarCategoriasEquipo);
  poblarCategoriasEquipo();
  renderDatosEquipo();
  equipoStatus.textContent = datosEquipoCache.length ? "" : "Cargando...";
  try {
    const res = await fetch("/api/datos?coleccion=datos_equipo", { headers: { Authorization: "Bearer " + SERVICIOS_API_TOKEN }, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    datosEquipoCache = Array.isArray(data) ? data : [];
    try { localStorage.setItem("datos_equipo_cache", JSON.stringify(datosEquipoCache)); } catch (e) { /* sin espacio */ }
    equipoStatus.textContent = "";
    poblarCategoriasEquipo();
    renderDatosEquipo();
  } catch (err) {
    equipoStatus.textContent = datosEquipoCache.length ? "Sin señal: mostrando lo último guardado en el celular." : "No se pudieron cargar los datos del equipo.";
  }
}

function fechaCortaAR(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function renderDatosEquipo() {
  const term = normalizeText(document.getElementById("equipoBuscar").value || "");
  const cat = document.getElementById("equipoFiltroCat").value;
  const lista = datosEquipoCache.filter((d) => (!cat || d.categoria === cat) && (!term || normalizeText(`${d.titulo} ${d.contenido} ${d.categoria} ${d.autor}`).includes(term)));
  equipoLista.innerHTML = "";
  if (!lista.length) {
    if (!equipoStatus.textContent || equipoStatus.textContent === "Cargando...") {
      equipoLista.innerHTML = `<p class="list-status">${datosEquipoCache.length ? "Nada coincide con esa búsqueda." : "Todavía no hay datos. Sé el primero en dejar uno: un APN, un código de fábrica, un truco de configuración."}</p>`;
    }
    return;
  }
  lista.forEach((d) => {
    const card = document.createElement("div");
    card.className = "equipo-card";
    const ult = (d.ediciones || [])[(d.ediciones || []).length - 1];
    const propio = tecnicoLogueado && d.autor === tecnicoLogueado;
    card.innerHTML = `
      <div class="equipo-card-top"><span class="equipo-cat">${escapeHtml(d.categoria || "General")}</span>${d.origen === "ia" ? '<span class="equipo-ia">Respuesta de la IA revisada</span>' : ""}</div>
      <p class="equipo-titulo">${escapeHtml(d.titulo)}</p>
      <div class="equipo-contenido consulta-respuesta-texto">${formatearRespuestaIA(d.contenido)}</div>
      <p class="equipo-meta">Aportó <b>${escapeHtml(d.autor || "")}</b> el ${fechaCortaAR(d.fecha)}${ult ? ` · Editado por <b>${escapeHtml(ult.autor)}</b> el ${fechaCortaAR(ult.fecha)}${d.ediciones.length > 1 ? ` (${d.ediciones.length} ediciones)` : ""}` : ""}</p>
      <div class="equipo-acciones">
        <button type="button" class="btn btn-ghost btn-small eq-copiar">Copiar</button>
        <button type="button" class="btn btn-ghost btn-small eq-editar">Editar / agregar</button>
        ${propio ? '<button type="button" class="btn btn-ghost btn-small eq-borrar">Borrar</button>' : ""}
      </div>`;
    card.querySelector(".eq-copiar").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(`${d.titulo}\n${d.contenido}`); showToast("Copiado."); } catch (e) { showToast("No se pudo copiar."); }
    });
    card.querySelector(".eq-editar").addEventListener("click", () => abrirFormEquipo(d));
    const borrar = card.querySelector(".eq-borrar");
    if (borrar) borrar.addEventListener("click", async () => {
      if (!confirm(`¿Borrar "${d.titulo}" para todo el equipo?`)) return;
      await guardarDatoEquipo({ accion: "borrar", id: d.id }, "Borrado.");
    });
    equipoLista.appendChild(card);
  });
}
document.getElementById("equipoBuscar").addEventListener("input", renderDatosEquipo);
document.getElementById("equipoFiltroCat").addEventListener("change", renderDatosEquipo);

function abrirFormEquipo(d) {
  poblarCategoriasEquipo();
  const editando = !!(d && d.id);
  document.getElementById("equipoFormTitulo").textContent = editando ? "Editar o agregar información" : "Nuevo dato para el equipo";
  document.getElementById("equipoFormId").value = editando ? d.id : "";
  document.getElementById("equipoFormTituloInput").value = (d && d.titulo) || "";
  document.getElementById("equipoFormContenido").value = (d && d.contenido) || "";
  document.getElementById("equipoFormOrigen").value = (d && d.origen) || "";
  const cats = categoriasEquipo();
  const sel = document.getElementById("equipoFormCategoria");
  sel.value = d && d.categoria && cats.includes(d.categoria) ? d.categoria : (document.getElementById("equipoFiltroCat").value || "General");
  equipoForm.classList.remove("hidden");
  document.getElementById("equipoNuevoBtn").classList.add("hidden");
  equipoForm.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("equipoFormTituloInput").focus();
}
function cerrarFormEquipo() {
  equipoForm.classList.add("hidden");
  document.getElementById("equipoNuevoBtn").classList.remove("hidden");
}
document.getElementById("equipoNuevoBtn").addEventListener("click", () => abrirFormEquipo(null));
document.getElementById("equipoCancelarBtn").addEventListener("click", cerrarFormEquipo);

async function guardarDatoEquipo(cuerpo, mensajeOk) {
  const body = JSON.stringify({ ...cuerpo, autor: tecnicoLogueado || "Oficina" });
  for (let intento = 0; intento < 2; intento++) {
    try {
      const res = await fetch("/api/datos?coleccion=datos_equipo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 502 && intento === 0) continue; // otro técnico guardó justo al mismo tiempo: se reintenta
      if (!res.ok || !data.ok) throw new Error(data.error || "Error desconocido");
      datosEquipoCache = Array.isArray(data.lista) ? data.lista : datosEquipoCache;
      try { localStorage.setItem("datos_equipo_cache", JSON.stringify(datosEquipoCache)); } catch (e) { /* sin espacio */ }
      poblarCategoriasEquipo();
      renderDatosEquipo();
      showToast(mensajeOk);
      return true;
    } catch (err) {
      showToast((navigator.onLine === false ? "Sin señal: " : "No se pudo guardar: ") + err.message);
      return false;
    }
  }
  showToast("No se pudo guardar. Probá de nuevo.");
  return false;
}
document.getElementById("equipoGuardarBtn").addEventListener("click", async () => {
  const id = document.getElementById("equipoFormId").value;
  const titulo = document.getElementById("equipoFormTituloInput").value.trim();
  const contenido = document.getElementById("equipoFormContenido").value.trim();
  if (!titulo || !contenido) { showToast("Completá el título y el dato."); return; }
  const btn = document.getElementById("equipoGuardarBtn");
  btn.disabled = true;
  const ok = await guardarDatoEquipo({
    accion: id ? "editar" : "crear", id: id || undefined, titulo, contenido,
    categoria: document.getElementById("equipoFormCategoria").value,
    origen: document.getElementById("equipoFormOrigen").value || undefined,
  }, id ? "Cambios guardados para todo el equipo." : "Guardado: ya lo ve todo el equipo.");
  btn.disabled = false;
  if (ok) cerrarFormEquipo();
});

// ---------- Guardia técnica rotativa ----------
tileGuardiasBtn.addEventListener("click", () => {
  showScreen("guardias");
  cargarYRenderGuardias();
});
volverDeGuardiasBtn.addEventListener("click", () => {
  showScreen("home");
});

// Devuelve, para una fecha dada, el índice de la secuencia que está de
// guardia esa semana (rotación semanal desde el lunes de referencia).
function indiceGuardiaEnFecha(fechaInicioRef, cantidad, fecha) {
  const diffMs = fecha.getTime() - fechaInicioRef.getTime();
  const semanas = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return ((semanas % cantidad) + cantidad) % cantidad;
}

// Si hay una excepción cargada para la semana de "fecha" (mismo
// formato de clave que usa admin.html: el lunes de esa semana en
// YYYY-MM-DD), esa gana por sobre lo que daría la secuencia normal.
function resolverTecnicoSemana(secuencia, excepciones, inicioRef, fecha) {
  const claveSemana = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
  if (excepciones && excepciones[claveSemana]) {
    const nombreExcepcion = excepciones[claveSemana];
    const enSecuencia = secuencia.find((t) => t.nombre === nombreExcepcion);
    return enSecuencia || { nombre: nombreExcepcion, telefono: "" };
  }
  const indice = indiceGuardiaEnFecha(inicioRef, secuencia.length, fecha);
  return secuencia[indice];
}

async function cargarYRenderGuardias() {
  guardiaStatus.textContent = "Cargando...";
  guardiaActualWrap.classList.add("hidden");
  guardiaProximosList.innerHTML = "";
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=guardias", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const secuencia = data.secuencia || [];
    const excepciones = data.excepciones || {};
    if (!data.fecha_inicio_referencia || secuencia.length === 0) {
      guardiaStatus.textContent = "Todavía no se cargó la secuencia de guardias.";
      return;
    }

    const [y, m, d] = data.fecha_inicio_referencia.split("-").map(Number);
    const inicioRef = new Date(y, m - 1, d, 9, 0, 0, 0);
    const ahora = new Date();

    if (ahora < inicioRef) {
      guardiaStatus.textContent = `La secuencia todavía no arrancó (empieza el ${d}/${m}/${y} a las 9:00).`;
    } else {
      guardiaStatus.textContent = "";
      const actual = resolverTecnicoSemana(secuencia, excepciones, inicioRef, ahora);
      guardiaActualNombre.textContent = actual.nombre;
      guardiaLlamarBtn.href = "tel:" + (actual.telefono || "").replace(/[^\d+]/g, "");
      const numeroWa = limpiarTelefonoWhatsapp(actual.telefono);
      const mensaje = `Hola ${actual.nombre}, te contacto por un tema de guardia técnica.`;
      guardiaWhatsappBtn.href = numeroWa ? `https://wa.me/${numeroWa}?text=${encodeURIComponent(mensaje)}` : "#";
      guardiaActualWrap.classList.remove("hidden");
    }

    // Próximos turnos: los siguientes lunes, con quién arranca cada uno.
    const proximos = [];
    let cursor = new Date(inicioRef);
    while (cursor <= ahora) cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
    // Retrocedemos una semana para incluir el turno vigente en la lista.
    cursor = new Date(cursor.getTime() - 7 * 24 * 60 * 60 * 1000);
    for (let i = 0; i < 5; i++) {
      const tecnico = resolverTecnicoSemana(secuencia, excepciones, inicioRef, cursor);
      proximos.push({ fecha: new Date(cursor), tecnico });
      cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    guardiaProximosList.innerHTML = "";
    proximos.forEach(({ fecha, tecnico }, idx) => {
      const dd = String(fecha.getDate()).padStart(2, "0");
      const mm = String(fecha.getMonth() + 1).padStart(2, "0");
      const card = document.createElement("div");
      card.className = "guardia-proximo-card" + (idx === 0 && ahora >= inicioRef ? " guardia-proximo-vigente" : "");
      card.innerHTML = `<span>${escapeHtml(tecnico.nombre)}</span><span class="guardia-proximo-fecha">desde ${dd}/${mm}</span>`;
      guardiaProximosList.appendChild(card);
    });
  } catch (err) {
    guardiaStatus.textContent = "No se pudo cargar la información de guardias.";
  }
}

// ---------- Historial (extendido, con filtros por período) ----------
let histPeriodoActivo = "4dias";
let histPasadoActivo = "todos";
let historialSeleccionados = new Set(); // ids (id_parte) marcados para la acción en lote
let historialFiltradoActual = []; // última lista filtrada/ordenada, para exportar a Excel
const histFechaEspecificaWrap = document.getElementById("histFechaEspecificaWrap");
const histFechaEspecifica = document.getElementById("histFechaEspecifica");

historialSeleccionarTodos.addEventListener("change", () => {
  const seleccionables = historialFiltradoActual.filter((h) => permisosDelTecnico(tecnicoLogueado).marcar_pasado_sistema && !h.pasado_sistema_offline);
  if (historialSeleccionarTodos.checked) {
    seleccionables.forEach((h) => historialSeleccionados.add(h.id_parte));
  } else {
    seleccionables.forEach((h) => historialSeleccionados.delete(h.id_parte));
  }
  renderHistorialReciente();
});

historialMarcarSeleccionadosBtn.addEventListener("click", marcarSeleccionadosComoPasados);

descargarExcelHistorialBtn.addEventListener("click", () => {
  if (historialFiltradoActual.length === 0) {
    showToast("No hay servicios para descargar con estos filtros.");
    return;
  }
  const filas = historialFiltradoActual.map((h) => ({
    "N° Servicio": h.numero_servicio || h.id_parte || "",
    Cliente: h.cliente || "",
    Dirección: h.direccion || "",
    Localidad: h.localidad || "",
    Fecha: h.fecha || "",
    "Hora entrada": h.hora_entrada || "",
    "Hora salida": h.hora_salida || "",
    Técnico: h.tecnico || "",
    "Técnico 2": h.tecnico2 || "",
    Tarea: h.tarea || "",
    Observaciones: h.observaciones || "",
    "Costo final": h.costo_final || "",
    "Forma de pago": h.forma_pago || "",
    "Pasado a sistema": h.pasado_sistema_offline ? "Sí" : "No",
    "Pasado por": h.pasado_sistema_por || "",
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Historial");
  XLSX.writeFile(libro, `historial_${histPeriodoActivo}_${fechaActualISOVehiculo()}.xlsx`);
});

document.querySelectorAll(".hist-pasado-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".hist-pasado-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    histPasadoActivo = chip.dataset.pasado;
    renderHistorialReciente();
  });
});

// Arma las opciones del filtro por técnico en Historial (solo se
// muestra a quien tiene historial_todos, ya que si no siempre ve
// solo lo propio).
function poblarFiltroTecnicoHistorial() {
  const nombres = Object.keys(tecnicosPasswords).sort();
  const actual = historialFiltroTecnico.value;
  historialFiltroTecnico.innerHTML = `<option value="">Todos los técnicos</option>${nombres.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")}`;
  historialFiltroTecnico.value = actual;
}
historialFiltroTecnico.addEventListener("change", renderHistorialReciente);

historialSearch.addEventListener("input", renderHistorialReciente);

tileHistorialBtn.addEventListener("click", () => {
  showScreen("historial");
  histFiltrosBtn.hidden = !esSkinNuevo();
  document.getElementById("histFiltrosTit").hidden = !esSkinNuevo();
  document.querySelector('.hist-periodo-chip[data-periodo="4dias"]').textContent = esSkinNuevo() ? "4 días" : "Últimos 4 días";
  historialSearch.placeholder = esSkinNuevo() ? "Buscar cliente, N°, dirección, tarea, material..." : "Buscar por cliente, N° o dirección...";
  const veTodoHistorial = permisosDelTecnico(tecnicoLogueado).historial_todos;
  historialFiltroTecnicoWrap.classList.toggle("hidden", !veTodoHistorial);
  if (veTodoHistorial) poblarFiltroTecnicoHistorial();
  fetchHistorialReciente();
});
volverDeHistorialBtn.addEventListener("click", () => {
  showScreen("home");
});
refreshHistorialBtn.addEventListener("click", fetchHistorialReciente);

document.querySelectorAll(".hist-periodo-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".hist-periodo-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    histPeriodoActivo = chip.dataset.periodo;
    histFechaEspecificaWrap.classList.toggle("hidden", histPeriodoActivo !== "fecha");
    if (histPeriodoActivo === "fecha" && !histFechaEspecifica.value) {
      histFechaEspecifica.value = fechaLocalISO();
    }
    renderHistorialReciente();
  });
});
histFechaEspecifica.addEventListener("change", renderHistorialReciente);

async function fetchHistorialReciente() {
  historialStatus.textContent = "Cargando...";
  historialList.innerHTML = "";
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/historial", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    historialCache = Array.isArray(data) ? data : [];
    historialSyncLabel.textContent = formatSyncTime(new Date());
    renderHistorialReciente();
    actualizarBadgeHistorialPendientes();
  } catch (err) {
    historialStatus.textContent = "No se pudo cargar el historial.";
  }
}

async function enviarMarcarPasadoSistema(h, marcarComo) {
  const res = await fetch("/api/historial", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
    body: JSON.stringify({ accion: "marcar_pasado_sistema", id_parte: h.id_parte, pasado: marcarComo, tecnico: tecnicoLogueado || "" }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  h.pasado_sistema_offline = marcarComo;
  h.pasado_sistema_por = marcarComo ? tecnicoLogueado || "" : "";
}

async function marcarPartePasadoSistema(h, marcarComo) {
  const verbo = marcarComo ? "marcar" : "desmarcar";
  const ok = confirm(
    marcarComo
      ? `¿Confirmás que el parte N° ${h.numero_servicio || h.id_parte} (${h.cliente}) ya está pasado a tu sistema?`
      : `¿Desmarcar el parte N° ${h.numero_servicio || h.id_parte} (${h.cliente})?`
  );
  if (!ok) return;
  try {
    await enviarMarcarPasadoSistema(h, marcarComo);
    historialSeleccionados.delete(h.id_parte);
    renderHistorialReciente();
    actualizarBadgeHistorialPendientes();
  } catch (err) {
    showToast(`No se pudo ${verbo}: ` + err.message);
  }
}

async function marcarSeleccionadosComoPasados() {
  const ids = Array.from(historialSeleccionados);
  if (ids.length === 0) return;
  const ok = confirm(`¿Confirmás que marcás ${ids.length} parte(s) como pasados a tu sistema?`);
  if (!ok) return;
  historialMarcarSeleccionadosBtn.disabled = true;
  const objetivos = ids.map((id) => historialCache.find((h) => h.id_parte === id)).filter(Boolean);
  const resultados = await Promise.allSettled(objetivos.map((h) => enviarMarcarPasadoSistema(h, true)));
  const exitos = resultados.filter((r) => r.status === "fulfilled").length;
  const fallos = resultados.length - exitos;
  historialSeleccionados.clear();
  renderHistorialReciente();
  actualizarBadgeHistorialPendientes();
  showToast(fallos > 0 ? `${exitos} marcado(s), ${fallos} fallaron.` : `${exitos} parte(s) marcados como pasados.`);
}

function actualizarBadgeHistorialPendientes() {
  const permisos = permisosDelTecnico(tecnicoLogueado);
  if (!permisos.marcar_pasado_sistema) {
    historialPendientesBadge.classList.add("hidden");
    return;
  }
  let items = historialCache;
  if (!permisos.historial_todos) {
    items = items.filter((h) => h.tecnico === tecnicoLogueado || h.tecnico2 === tecnicoLogueado);
  }
  const pendientes = items.filter((h) => !h.pasado_sistema_offline).length;
  if (pendientes > 0) {
    historialPendientesBadge.textContent = pendientes > 99 ? "99+" : String(pendientes);
    historialPendientesBadge.classList.remove("hidden");
  } else {
    historialPendientesBadge.classList.add("hidden");
  }
}

function actualizarBarraSeleccionHistorial(seleccionables) {
  if (seleccionables.length === 0) {
    historialSeleccionBar.classList.add("hidden");
    return;
  }
  historialSeleccionBar.classList.remove("hidden");
  const seleccionadosVisibles = seleccionables.filter((h) => historialSeleccionados.has(h.id_parte)).length;
  historialSeleccionCount.textContent = String(seleccionadosVisibles);
  historialMarcarSeleccionadosBtn.disabled = seleccionadosVisibles === 0;
  historialSeleccionarTodos.checked = seleccionadosVisibles > 0 && seleccionadosVisibles === seleccionables.length;
  historialSeleccionarTodos.indeterminate = seleccionadosVisibles > 0 && seleccionadosVisibles < seleccionables.length;
}

function minutosEntre(desde, hasta) {
  const a = /^(\d{1,2}):(\d{2})/.exec(desde || ""), b = /^(\d{1,2}):(\d{2})/.exec(hasta || "");
  if (!a || !b) return 0;
  const m = (Number(b[1]) * 60 + Number(b[2])) - (Number(a[1]) * 60 + Number(a[2]));
  return m > 0 && m < 16 * 60 ? m : 0;
}
function textoMinutos(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? " " + m + " min" : ""}` : `${m} min`;
}
function nombreDiaHistorial(fecha) {
  if (!fecha) return "Sin fecha";
  const hoy = fechaLocalISO();
  const ay = new Date(); ay.setDate(ay.getDate() - 1);
  if (fecha === hoy) return "Hoy";
  if (fecha === fechaLocalISO(ay)) return "Ayer";
  const [y, m, d] = fecha.split("-").map(Number);
  const f = new Date(y, m - 1, d);
  const dia = f.toLocaleDateString("es-AR", { weekday: "long" });
  const anio = y !== new Date().getFullYear() ? `/${y}` : "";
  return `${dia.charAt(0).toUpperCase() + dia.slice(1)} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}${anio}`;
}
// Skin nuevo: técnico, "pasados" y Excel quedan dentro de "Filtros".
const histFiltrosBtn = document.getElementById("histFiltrosBtn");
function actualizarCuentaFiltrosHistorial() {
  const activos = (historialFiltroTecnico.value ? 1 : 0) + (histPasadoActivo !== "todos" ? 1 : 0);
  document.getElementById("histFiltrosCuenta").textContent = activos ? String(activos) : "";
  histFiltrosBtn.classList.toggle("con-filtros", activos > 0);
}
histFiltrosBtn.addEventListener("click", () => {
  const abierto = screens.historial.classList.toggle("hist-filtros-abiertos");
  histFiltrosBtn.setAttribute("aria-expanded", String(abierto));
});

function renderHistorialReciente() {
  const permisos = permisosDelTecnico(tecnicoLogueado);
  const veTodo = permisos.historial_todos;
  const puedeMarcarPasado = permisos.marcar_pasado_sistema;

  const terminoBusqueda = normalizeText(historialSearch.value);
  let filtrados;
  screens.historial.classList.toggle("hist-buscando", !!terminoBusqueda);
  if (terminoBusqueda) {
    // Al buscar se busca en todas las fechas: el cliente que fuiste hace
    // un mes tiene que aparecer aunque esté elegido "Últimos 4 días".
    filtrados = historialCache.slice();
    historialModoLabel.textContent = veTodo ? "Buscando en todas las fechas, de todo el equipo." : "Buscando en todas tus fechas.";
  } else if (histPeriodoActivo === "4dias") {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() - 3);
    filtrados = historialCache.filter((h) => {
      if (!h.fecha) return false;
      const [y, m, d] = h.fecha.split("-").map(Number);
      const f = new Date(y, m - 1, d);
      return f >= limite && f <= hoy;
    });
    historialModoLabel.textContent = (veTodo ? "Viendo los últimos 4 días de todo el equipo." : "Viendo tus últimos 4 días.");
  } else {
    const rango = obtenerRangoPeriodo(histPeriodoActivo, histFechaEspecifica);
    filtrados = historialCache.filter((h) => fechaEnRango(h.fecha, rango));
    const fechaElegida = histFechaEspecifica.value ? histFechaEspecifica.value.split("-").reverse().join("/") : "hoy";
    const textoPeriodo = { semana: "esta semana", mes: "este mes", todo: "el historial completo", fecha: `el ${fechaElegida}` }[histPeriodoActivo] || "el período elegido";
    historialModoLabel.textContent = veTodo ? `Viendo ${textoPeriodo} de todo el equipo.` : `Viendo ${textoPeriodo === "el historial completo" ? "tu historial completo" : textoPeriodo}.`;
  }

  if (!veTodo) {
    filtrados = filtrados.filter((h) => h.tecnico === tecnicoLogueado || h.tecnico2 === tecnicoLogueado);
  } else {
    const filtroTecnico = historialFiltroTecnico.value;
    if (filtroTecnico) {
      filtrados = filtrados.filter((h) => h.tecnico === filtroTecnico || h.tecnico2 === filtroTecnico);
    }
  }

  if (histPasadoActivo === "si") {
    filtrados = filtrados.filter((h) => !!h.pasado_sistema_offline);
  } else if (histPasadoActivo === "no") {
    filtrados = filtrados.filter((h) => !h.pasado_sistema_offline);
  }

  if (terminoBusqueda) {
    // Cada palabra tiene que aparecer en algún dato del parte (cliente,
    // N°, dirección, tarea, observaciones, materiales, técnico...).
    const palabras = terminoBusqueda.split(/\s+/).filter(Boolean);
    filtrados = filtrados.filter((h) => {
      const haystack = normalizeText([
        h.cliente, h.numero_servicio, h.id_parte, h.numero_cliente, h.direccion, h.localidad,
        h.tarea, h.observaciones, h.imprevisto, h.materiales, h.materiales_otros,
        h.tecnico, h.tecnico2, h.tecnico_segundo, h.forma_pago,
      ].filter(Boolean).join(" "));
      return palabras.every((w) => haystack.includes(w));
    });
  }

  // Los no pasados a sistema van primero (son los que hay que accionar);
  // dentro de cada grupo, más reciente primero. En el skin nuevo se
  // agrupa por día (más nuevo arriba) y dentro del día van primero los no pasados.
  const agrupar = esSkinNuevo();
  filtrados.sort((a, b) => {
    if (agrupar && a.fecha !== b.fecha) return (b.fecha || "").localeCompare(a.fecha || "");
    const aPend = a.pasado_sistema_offline ? 1 : 0;
    const bPend = b.pasado_sistema_offline ? 1 : 0;
    if (aPend !== bPend) return aPend - bPend;
    const claveA = `${a.fecha} ${a.hora_entrada || ""}`;
    const claveB = `${b.fecha} ${b.hora_entrada || ""}`;
    return claveB.localeCompare(claveA);
  });

  historialFiltradoActual = filtrados;

  // Ya no tiene sentido mantener seleccionados ítems que salieron de la
  // vista filtrada actual (o que alguien más ya pasó a sistema).
  const idsVisibles = new Set(filtrados.map((h) => h.id_parte));
  historialSeleccionados.forEach((id) => {
    if (!idsVisibles.has(id)) historialSeleccionados.delete(id);
  });

  historialList.innerHTML = "";
  actualizarCuentaFiltrosHistorial();
  if (filtrados.length === 0) {
    historialStatus.textContent = terminoBusqueda ? "No se encontró nada con esa búsqueda." : "No hay servicios completados en ese período.";
    actualizarBarraSeleccionHistorial([]);
    return;
  }
  historialStatus.textContent = `${filtrados.length} servicio(s).`;
  const seleccionables = [];
  // Skin nuevo: encabezado por día con cantidad y horas trabajadas.
  const porDia = {};
  if (agrupar) filtrados.forEach((h) => { (porDia[h.fecha || ""] = porDia[h.fecha || ""] || []).push(h); });
  let diaActual = null;
  filtrados.forEach((h) => {
    if (agrupar && (h.fecha || "") !== diaActual) {
      diaActual = h.fecha || "";
      const delDia = porDia[diaActual];
      const minutos = delDia.reduce((acc, x) => acc + minutosEntre(x.hora_entrada, x.hora_salida), 0);
      const cab = document.createElement("div");
      cab.className = "hist-dia";
      cab.innerHTML = `<span class="hist-dia-nombre">${escapeHtml(nombreDiaHistorial(diaActual))}</span><span class="hist-dia-meta">${delDia.length} servicio${delDia.length === 1 ? "" : "s"}${minutos ? " · " + textoMinutos(minutos) : ""}</span>`;
      historialList.appendChild(cab);
    }
    let fechaTexto = h.fecha || "";
    if (h.fecha) {
      const [y, m, d] = h.fecha.split("-");
      fechaTexto = `${d}/${m}/${y}`;
    }
    const card = document.createElement("div");
    card.className = "historial-card" + (h.pasado_sistema_offline ? " historial-card-pasado" : "");
    card.style.cursor = "pointer";
    const clavesHtml = (h.claves && h.claves.length > 0) ? `
      ${agrupar ? `<button type="button" class="hist-claves-btn">🔑 ${h.claves.length === 1 ? "1 clave" : h.claves.length + " claves"} · tocá para ver</button>` : ""}
      <div class="historial-card-claves${agrupar ? " hist-claves-ocultas" : ""}">
        🔑 ${h.claves.map((c) => {
          const detalle = [c.usuario && `Usuario: ${escapeHtml(c.usuario)}`, c.clave && `Clave: ${escapeHtml(c.clave)}`, c.codigo && `Código: ${escapeHtml(c.codigo)}`].filter(Boolean).join(" · ");
          return `<b>${escapeHtml(c.titulo)}</b>${detalle ? " — " + detalle : ""}`;
        }).join("<br>")}
      </div>
    ` : "";
    const costoFinalNum = parseFloat(h.costo_final);
    const tieneCobro = !isNaN(costoFinalNum) && costoFinalNum > 0;
    const pagoHtml = tieneCobro ? `
      <div class="historial-card-pago">
        ${h.forma_pago ? `<span class="historial-card-metodo-pago">${escapeHtml(h.forma_pago)}</span>` : ""}
        <span class="historial-card-cobrar" title="Tiene un valor a cobrar">$</span>
      </div>
    ` : "";
    const textoResena = (h.tarea || h.observaciones || "").trim();
    const resenaCorta = textoResena.length > 160 ? textoResena.slice(0, 160).trim() + "…" : textoResena;
    const resenaHtml = resenaCorta ? `<div class="historial-card-resena">${escapeHtml(resenaCorta)}</div>` : "";
    const puedeSeleccionar = puedeMarcarPasado && !h.pasado_sistema_offline;
    if (puedeSeleccionar) seleccionables.push(h);
    const seleccionHtml = puedeSeleccionar ? `
      <label class="historial-card-seleccionar" title="Seleccionar para marcar en lote">
        <input type="checkbox" class="historial-check-seleccion" ${historialSeleccionados.has(h.id_parte) ? "checked" : ""}>
      </label>
    ` : "";
    card.innerHTML = `
      <div class="historial-card-header">
        <div class="historial-card-header-izq">
          ${seleccionHtml}
          <div class="historial-card-num">N° ${escapeHtml(h.numero_servicio || h.id_parte)}</div>
        </div>
        ${pagoHtml}
      </div>
      <div class="historial-card-cliente">${escapeHtml(h.cliente)}</div>
      <div class="historial-card-direccion">${escapeHtml(h.direccion)}${h.localidad ? ", " + escapeHtml(h.localidad) : ""}</div>
      <div class="historial-card-horario">${fechaTexto} — ${h.hora_entrada || "?"} a ${h.hora_salida || "?"}</div>
      ${resenaHtml}
      ${clavesHtml}
      ${puedeMarcarPasado ? `
        <label class="historial-card-check">
          <input type="checkbox" class="historial-check-pasado" ${h.pasado_sistema_offline ? "checked" : ""}>
          ${h.pasado_sistema_offline ? `Pasado a sistema (${escapeHtml(h.pasado_sistema_por || "")})` : "Pasado a mi sistema"}
        </label>
      ` : ""}
    `;
    if (puedeMarcarPasado) {
      const checkbox = card.querySelector(".historial-check-pasado");
      checkbox.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        marcarPartePasadoSistema(h, !h.pasado_sistema_offline);
      });
    }
    if (puedeSeleccionar) {
      const checkboxSel = card.querySelector(".historial-check-seleccion");
      checkboxSel.addEventListener("click", (e) => {
        e.stopPropagation();
        if (checkboxSel.checked) historialSeleccionados.add(h.id_parte);
        else historialSeleccionados.delete(h.id_parte);
        actualizarBarraSeleccionHistorial(seleccionables);
      });
    }
    const clavesBtn = card.querySelector(".hist-claves-btn");
    if (clavesBtn) {
      clavesBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const caja = card.querySelector(".historial-card-claves");
        const mostrar = caja.classList.toggle("hist-claves-ocultas") === false;
        clavesBtn.textContent = mostrar ? "🔑 Ocultar claves" : `🔑 ${h.claves.length === 1 ? "1 clave" : h.claves.length + " claves"} · tocá para ver`;
      });
    }
    card.addEventListener("click", () => abrirParteDetalleModal(h.id_parte));
    historialList.appendChild(card);
  });
  actualizarBarraSeleccionHistorial(seleccionables);
}

// Foto o firma en grande (toca para cerrar).
function ampliarImagenParte(src) {
  const caja = document.createElement("div");
  caja.className = "pd-lightbox";
  caja.innerHTML = `<img src="${escapeHtml(src)}" alt=""><span class="pd-lightbox-x" aria-hidden="true">×</span>`;
  caja.addEventListener("click", () => caja.remove());
  document.body.appendChild(caja);
}
async function abrirParteDetalleModal(idParte) {
  parteDetalleModalOverlay.classList.remove("hidden");
  parteDetalleModalOverlay.classList.toggle("pd-nuevo", esSkinNuevo());
  parteDetalleModalStatus.classList.remove("hidden");
  parteDetalleModalStatus.textContent = "Cargando...";
  parteDetalleModalContenido.innerHTML = "";
  try {
    const res = await fetch(`/api/historial?tipo=parte&id=${encodeURIComponent(idParte)}`, {
      headers: { Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      cache: "no-store",
    });
    const p = await res.json();
    if (!res.ok) throw new Error(p.error || "Error desconocido");
    parteDetalleModalStatus.classList.add("hidden");

    let fechaTexto = p.fecha || "";
    if (p.fecha) {
      const [y, m, d] = p.fecha.split("-");
      fechaTexto = `${d}/${m}/${y}`;
    }

    // Cada fila guarda su valor "de verdad" (sin el redondeo de
    // pantalla) en este array, y el botón de copiar lo lee de ahí por
    // índice — así no hay que escapar texto con saltos de línea o
    // comillas dentro de un atributo HTML. opciones.copiar permite
    // que lo que se copia sea distinto de lo que se muestra (ej: el
    // horario muestra "14:00 a 17:30 (3.50 hs)" pero copia solo "3.50").
    const valoresParaCopiar = [];
    const fila = (etiqueta, valorMostrar, opciones = {}) => {
      if (!valorMostrar) return "";
      const aCopiar = opciones.copiar !== undefined ? opciones.copiar : valorMostrar;
      const idx = valoresParaCopiar.length;
      valoresParaCopiar.push(String(aCopiar));
      const estiloValor = opciones.fondo
        ? `background:${opciones.fondo}; color:${opciones.color}; border-radius:8px; padding:6px 8px; margin-top:2px;`
        : "";
      return `
        <div style="padding:8px 0; border-bottom:1px solid #F4F5F0;">
          <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">
            <div style="color:#8A9089; font-size:12px;">${escapeHtml(etiqueta)}</div>
            <button type="button" class="copiar-campo-btn" data-copiar-idx="${idx}" title="Copiar" style="background:none; border:none; cursor:pointer; padding:2px; color:#8A9089; flex-shrink:0;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
          <div style="white-space:pre-line; ${estiloValor}">${escapeHtml(String(valorMostrar))}</div>
        </div>
      `;
    };

    const claves = Array.isArray(p.claves) ? p.claves : [];
    const clavesTexto = claves.map((c) => {
      const detalle = [c.usuario && `Usuario: ${c.usuario}`, c.clave && `Clave: ${c.clave}`, c.codigo && `Código: ${c.codigo}`].filter(Boolean).join(" · ");
      return `${c.titulo}${detalle ? " — " + detalle : ""}`;
    }).join("\n");

    // Misma cuenta que ya usa el mail a oficina (redondea a 5 min).
    const demora = calcularTiempoTranscurrido(p.hora_entrada, p.hora_salida);
    const horarioTexto = `${p.hora_entrada || "?"} a ${p.hora_salida || "?"}${demora ? ` (${demora} hs)` : ""}`;

    // Respaldo para partes viejos que se guardaron antes de que el
    // costo final quedara garantizado siempre -- si sigue faltando,
    // se calcula acá mismo a partir del importe y el % de descuento,
    // en vez de mostrar el campo vacío.
    let costoFinalTexto = p.costo_final ? "$" + p.costo_final : "";
    if (!costoFinalTexto && p.importe) {
      const pct = Number(p.descuento_pct) || 0;
      const calculado = Number(p.importe) - (Number(p.importe) * pct / 100);
      if (!isNaN(calculado)) costoFinalTexto = "$" + calculado.toFixed(2);
    }

    if (esSkinNuevo()) {
      // ---- Skin nuevo: encabezado, acciones y secciones ----
      const filaN = (etiqueta, valor, opciones = {}) => {
        if (!valor) return "";
        const idx = valoresParaCopiar.length;
        valoresParaCopiar.push(String(opciones.copiar !== undefined ? opciones.copiar : valor));
        return `<div class="pd-fila${opciones.clase ? " " + opciones.clase : ""}">
          <div class="pd-fila-top"><span class="pd-etiqueta">${escapeHtml(etiqueta)}</span>
            <button type="button" class="copiar-campo-btn pd-copiar" data-copiar-idx="${idx}" title="Copiar" aria-label="Copiar ${escapeHtml(etiqueta)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
          <div class="pd-valor">${escapeHtml(String(valor))}</div></div>`;
      };
      const seccion = (titulo, cuerpo) => (cuerpo.trim() ? `<section class="pd-sec"><h3 class="pd-sec-tit">${titulo}</h3>${cuerpo}</section>` : "");
      const direccionCompleta = [p.direccion, p.localidad].filter(Boolean).join(", ");
      const telefonoNum = String(p.telefono || "").replace(/[^\d+]/g, "");
      const tecnicos = [p.tecnico, p.tecnico_segundo].filter(Boolean).join(" y ");
      const ico = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
      const acciones = [
        telefonoNum ? `<a class="pd-accion" href="tel:${escapeHtml(telefonoNum)}">${ico('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 2.9a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5c.9.4 1.9.6 2.9.7a2 2 0 0 1 1.8 2.1z"/>')}Llamar</a>` : "",
        direccionCompleta ? `<a class="pd-accion" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccionCompleta)}" target="_blank" rel="noopener">${ico('<path d="M3 11l19-9-9 19-2-8z"/>')}Cómo llegar</a>` : "",
        p.cliente ? `<button type="button" class="pd-accion" id="pdFichaBtn">${ico('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>')}Ficha</button>` : "",
        `<button type="button" class="pd-accion" id="pdCompartirBtn">${ico('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>')}Compartir</button>`,
      ].filter(Boolean).join("");
      const fotoMini = p.foto_ref ? `<div class="pd-fila"><div class="pd-fila-top"><span class="pd-etiqueta">Foto</span></div>
        <button type="button" class="pd-foto-mini" data-ampliar="${escapeHtml(p.foto_ref)}" aria-label="Ver foto grande"><img src="${escapeHtml(p.foto_ref)}" alt="Foto del trabajo"></button></div>` : "";
      const claves = Array.isArray(p.claves) ? p.claves : [];
      const clavesHtml = claves.length ? `<button type="button" class="hist-claves-btn pd-claves-btn" id="pdClavesBtn">🔑 ${claves.length === 1 ? "1 clave" : claves.length + " claves"} · tocá para ver</button>
        <div class="pd-claves hidden" id="pdClaves">${filaN("Claves", clavesTexto)}</div>` : "";
      const firmaHtml = (p.firma_img_ref || p.firma_aclaracion || p.firma_cargo || p.cliente_email) ? `<div class="pd-firma">
        <h3 class="pd-sec-tit">Firma del cliente</h3>
        ${p.firma_img_ref ? `<button type="button" class="pd-firma-img" data-ampliar="${escapeHtml(p.firma_img_ref)}" aria-label="Ver firma grande"><img src="${escapeHtml(p.firma_img_ref)}" alt="Firma del cliente"></button>` : ""}
        ${filaN("Aclaración", p.firma_aclaracion)}
        ${filaN("Cargo", p.firma_cargo)}
        ${filaN("Mail del cliente", p.cliente_email)}
      </div>` : "";

      parteDetalleModalContenido.innerHTML = `
        <div class="pd-cab">
          <div class="pd-num">N° ${escapeHtml(p.numero_servicio || p.id || "")}${p.tipo_servicio ? " · " + escapeHtml(p.tipo_servicio) : ""}</div>
          <h2 class="pd-cliente">${escapeHtml(p.cliente || "Sin cliente")}</h2>
          <div class="pd-meta">${escapeHtml(p.fecha ? nombreDiaHistorial(p.fecha) + (nombreDiaHistorial(p.fecha).length < 6 ? " · " + fechaTexto : "") : "")}${p.hora_entrada || p.hora_salida ? " · " + escapeHtml(horarioTexto) : ""}</div>
          ${tecnicos ? `<div class="pd-meta">${escapeHtml(tecnicos)}</div>` : ""}
        </div>
        <div class="pd-acciones">${acciones}</div>
        ${seccion("Trabajo", filaN("Horario", horarioTexto, { copiar: demora || horarioTexto }) + filaN("Tarea", p.tarea) + filaN("Observaciones", p.observaciones) + filaN("Imprevisto", p.imprevisto, { clase: "pd-alerta" }) + filaN("SIM instalada", p.sim_instalada_texto) + fotoMini)}
        ${seccion("Materiales", filaN("Instalados", p.materiales, { clase: "pd-mat-ok" }) + filaN("Retirados", p.materiales_otros, { clase: "pd-mat-ret" }))}
        ${seccion("Cobro", filaN("Importe", p.importe ? "$" + p.importe : "") + filaN("Descuento", p.descuento_tipo ? `${p.descuento_tipo}${p.descuento_pct ? " (" + p.descuento_pct + "%)" : ""}` : "") + filaN("N° de presupuesto", p.numero_presupuesto) + filaN("Costo final", costoFinalTexto, { copiar: (costoFinalTexto.match(/[\d.]+/) || [""])[0], clase: "pd-total" }) + filaN("Forma de pago", p.forma_pago))}
        ${seccion("Cliente", filaN("N° de servicio", p.numero_servicio || p.id) + filaN("N° de cliente", p.numero_cliente) + filaN("Dirección", direccionCompleta) + filaN("Teléfono", p.telefono) + clavesHtml)}
        ${firmaHtml}
        <button type="button" class="btn btn-secondary pd-cerrar" id="pdCerrarBtn">Cerrar</button>
      `;
      const q = (id) => parteDetalleModalContenido.querySelector("#" + id);
      q("pdCerrarBtn").addEventListener("click", () => parteDetalleModalOverlay.classList.add("hidden"));
      if (q("pdClavesBtn")) q("pdClavesBtn").addEventListener("click", () => {
        const visible = q("pdClaves").classList.toggle("hidden") === false;
        q("pdClavesBtn").textContent = visible ? "🔑 Ocultar claves" : `🔑 ${claves.length === 1 ? "1 clave" : claves.length + " claves"} · tocá para ver`;
      });
      if (q("pdFichaBtn")) q("pdFichaBtn").addEventListener("click", () => {
        parteDetalleModalOverlay.classList.add("hidden");
        const base = (typeof clientesGeneralCache !== "undefined" && Array.isArray(clientesGeneralCache) ? clientesGeneralCache : [])
          .find((c) => (p.numero_cliente && String(c.numero_cliente) === String(p.numero_cliente)) || normalizeText(c.nombre || "") === normalizeText(p.cliente || ""));
        abrirFichaCliente(base || { nombre: p.cliente, direccion: p.direccion, localidad: p.localidad, numero_cliente: p.numero_cliente, telefono: p.telefono });
      });
      q("pdCompartirBtn").addEventListener("click", async () => {
        const texto = [
          `Parte N° ${p.numero_servicio || p.id || ""} — ${p.cliente || ""}`,
          [fechaTexto, horarioTexto].filter(Boolean).join(" · "),
          direccionCompleta,
          tecnicos ? `Técnico: ${tecnicos}` : "",
          p.tarea ? `Tarea: ${p.tarea}` : "",
          p.observaciones ? `Observaciones: ${p.observaciones}` : "",
          p.materiales ? `Materiales: ${String(p.materiales).replace(/\n/g, ", ")}` : "",
          costoFinalTexto ? `Costo final: ${costoFinalTexto}${p.forma_pago ? " (" + p.forma_pago + ")" : ""}` : "",
        ].filter(Boolean).join("\n");
        try {
          if (navigator.share) { await navigator.share({ text: texto }); return; }
        } catch (e) { if (e && e.name === "AbortError") return; }
        window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
      });
      parteDetalleModalContenido.querySelectorAll("[data-ampliar]").forEach((b) => b.addEventListener("click", () => ampliarImagenParte(b.dataset.ampliar)));
    } else {
    parteDetalleModalContenido.innerHTML = `
      ${fila("N° de servicio", p.numero_servicio || p.id)}
      ${fila("Tipo", p.tipo_servicio)}
      ${fila("Cliente", p.cliente)}
      ${fila("N° de cliente", p.numero_cliente)}
      ${fila("Dirección", [p.direccion, p.localidad].filter(Boolean).join(", "))}
      ${fila("Teléfono", p.telefono)}
      ${fila("Técnico(s)", [p.tecnico, p.tecnico_segundo].filter(Boolean).join(" y "))}
      ${fila("Fecha", fechaTexto)}
      ${fila("Horario", horarioTexto, { copiar: demora || horarioTexto })}
      ${fila("Tarea", p.tarea)}
      ${fila("Materiales usados", p.materiales, { fondo: "#E1F0E4", color: "#1F6B34" })}
      ${fila("Materiales retirados", p.materiales_otros, { fondo: "#FBE8DC", color: "#B5541A" })}
      ${fila("SIM instalada", p.sim_instalada_texto)}
      ${fila("Observaciones", p.observaciones)}
      ${fila("Imprevisto", p.imprevisto)}
      ${clavesTexto ? fila("Claves", clavesTexto) : ""}
      ${fila("Importe", p.importe ? "$" + p.importe : "")}
      ${fila("Descuento", p.descuento_tipo ? `${p.descuento_tipo}${p.descuento_pct ? " (" + p.descuento_pct + "%)" : ""}` : "")}
      ${fila("N° de presupuesto", p.numero_presupuesto)}
      ${fila("Costo final", costoFinalTexto, { copiar: (costoFinalTexto.match(/[\d.]+/) || [""])[0] })}
      ${fila("Forma de pago", p.forma_pago)}
      ${fila("Firmó", [p.firma_aclaracion, p.firma_cargo].filter(Boolean).join(" — "))}
      ${fila("Mail del cliente", p.cliente_email)}
      ${p.foto_ref ? `
        <div style="padding:8px 0; border-bottom:1px solid #F4F5F0;">
          <div style="color:#8A9089; font-size:12px; margin-bottom:6px;">Foto</div>
          <a href="${escapeHtml(p.foto_ref)}" target="_blank" rel="noopener"><img src="${escapeHtml(p.foto_ref)}" style="max-width:100%; border-radius:8px; display:block;"></a>
        </div>
      ` : ""}
      ${p.firma_img_ref ? `
        <div style="padding:8px 0; border-bottom:1px solid #F4F5F0;">
          <div style="color:#8A9089; font-size:12px; margin-bottom:6px;">Firma</div>
          <a href="${escapeHtml(p.firma_img_ref)}" target="_blank" rel="noopener"><img src="${escapeHtml(p.firma_img_ref)}" style="max-width:100%; max-height:140px; background:#F4F5F0; border-radius:8px; display:block;"></a>
        </div>
      ` : ""}
    `;
    }

    parteDetalleModalContenido.querySelectorAll(".copiar-campo-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const valor = valoresParaCopiar[Number(btn.dataset.copiarIdx)];
        try {
          await navigator.clipboard.writeText(valor);
          showToast("Copiado.");
        } catch (err) {
          showToast("No se pudo copiar.");
        }
      });
    });
  } catch (err) {
    parteDetalleModalStatus.classList.remove("hidden");
    parteDetalleModalStatus.textContent = "No se pudo cargar: " + err.message;
  }
}

parteDetalleModalCerrarBtn.addEventListener("click", () => parteDetalleModalOverlay.classList.add("hidden"));
parteDetalleModalOverlay.addEventListener("click", (e) => {
  if (e.target === parteDetalleModalOverlay) parteDetalleModalOverlay.classList.add("hidden");
});

// ---------- Historial de Stock (materiales instalados/retirados) ----------
let stockCache = [];
let stockPeriodoActivo = "semana";
let stockPasadoActivo = "todos";
let stockSeleccionados = new Set();
let stockFiltradoActual = [];
let stockGruposExpandidos = new Set(); // ids de parte que el técnico dejó desplegados

verStockBtn.addEventListener("click", () => {
  showScreen("stock");
  fetchStock();
});
volverDeStockBtn.addEventListener("click", () => showScreen("dashboardsMenu"));
refreshStockBtn.addEventListener("click", fetchStock);

document.querySelectorAll(".stock-periodo-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".stock-periodo-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    stockPeriodoActivo = chip.dataset.periodo;
    stockFechaEspecificaWrap.classList.toggle("hidden", stockPeriodoActivo !== "fecha");
    if (stockPeriodoActivo === "fecha" && !stockFechaEspecifica.value) {
      stockFechaEspecifica.value = fechaLocalISO();
    }
    renderStock();
  });
});
stockFechaEspecifica.addEventListener("change", renderStock);

document.querySelectorAll(".stock-pasado-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".stock-pasado-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    stockPasadoActivo = chip.dataset.pasado;
    renderStock();
  });
});

stockSearch.addEventListener("input", renderStock);

stockSeleccionarTodos.addEventListener("change", () => {
  const seleccionables = stockFiltradoActual.filter((m) => permisosDelTecnico(tecnicoLogueado).marcar_pasado_sistema && !m.pasado_sistema_offline);
  if (stockSeleccionarTodos.checked) {
    seleccionables.forEach((m) => stockSeleccionados.add(m.id));
  } else {
    seleccionables.forEach((m) => stockSeleccionados.delete(m.id));
  }
  renderStock();
});

stockMarcarSeleccionadosBtn.addEventListener("click", marcarStockSeleccionadosComoPasados);

descargarExcelStockBtn.addEventListener("click", () => {
  if (stockFiltradoActual.length === 0) {
    showToast("No hay movimientos para descargar con estos filtros.");
    return;
  }
  const filas = stockFiltradoActual.map((m) => ({
    "N° Servicio": m.numero_servicio || "",
    "N° Cliente": m.numero_cliente || "",
    Cliente: m.cliente || "",
    Dirección: m.direccion || "",
    Modelo: m.modelo || "",
    Categoría: m.categoria || "",
    "Cant. instalada": m.cantidad_instalada || 0,
    "Cant. retirada": m.cantidad_retirada || 0,
    Técnico: m.tecnico || "",
    Fecha: m.fecha || "",
    "Cargado a mano": m.es_manual ? "Sí" : "No",
    "Pasado a sistema": m.pasado_sistema_offline ? "Sí" : "No",
    "Pasado por": m.pasado_sistema_por || "",
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Stock");
  XLSX.writeFile(libro, `stock_${stockPeriodoActivo}_${fechaActualISOVehiculo()}.xlsx`);
});

async function fetchStock() {
  stockStatus.textContent = "Cargando...";
  stockList.innerHTML = "";
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/historial?tipo=stock", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    stockCache = Array.isArray(data) ? data : [];
    stockSyncLabel.textContent = formatSyncTime(new Date());
    renderStock();
  } catch (err) {
    stockStatus.textContent = "No se pudo cargar el historial de stock.";
  }
}

async function enviarMarcarStockPasadoSistema(m, marcarComo) {
  const res = await fetch("/api/historial", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
    body: JSON.stringify({ accion: "marcar_pasado_sistema_stock", id: m.id, pasado: marcarComo, tecnico: tecnicoLogueado || "" }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  m.pasado_sistema_offline = marcarComo ? 1 : 0;
  m.pasado_sistema_por = marcarComo ? tecnicoLogueado || "" : "";
}

async function marcarStockPasadoSistema(m, marcarComo) {
  const ok = confirm(
    marcarComo
      ? `¿Confirmás que este movimiento (${m.modelo}, ${m.cliente}) ya está pasado a tu sistema?`
      : `¿Desmarcar este movimiento (${m.modelo}, ${m.cliente})?`
  );
  if (!ok) return;
  try {
    await enviarMarcarStockPasadoSistema(m, marcarComo);
    stockSeleccionados.delete(m.id);
    renderStock();
  } catch (err) {
    showToast("No se pudo actualizar: " + err.message);
  }
}

async function marcarStockSeleccionadosComoPasados() {
  const ids = Array.from(stockSeleccionados);
  if (ids.length === 0) return;
  const ok = confirm(`¿Confirmás que marcás ${ids.length} movimiento(s) como pasados a tu sistema?`);
  if (!ok) return;
  stockMarcarSeleccionadosBtn.disabled = true;
  const objetivos = ids.map((id) => stockCache.find((m) => m.id === id)).filter(Boolean);
  const resultados = await Promise.allSettled(objetivos.map((m) => enviarMarcarStockPasadoSistema(m, true)));
  const exitos = resultados.filter((r) => r.status === "fulfilled").length;
  const fallos = resultados.length - exitos;
  stockSeleccionados.clear();
  renderStock();
  showToast(fallos > 0 ? `${exitos} marcado(s), ${fallos} fallaron.` : `${exitos} movimiento(s) marcados como pasados.`);
}

function actualizarBarraSeleccionStock(seleccionables) {
  if (seleccionables.length === 0) {
    stockSeleccionBar.classList.add("hidden");
    return;
  }
  stockSeleccionBar.classList.remove("hidden");
  const seleccionadosVisibles = seleccionables.filter((m) => stockSeleccionados.has(m.id)).length;
  stockSeleccionCount.textContent = String(seleccionadosVisibles);
  stockMarcarSeleccionadosBtn.disabled = seleccionadosVisibles === 0;
  stockSeleccionarTodos.checked = seleccionadosVisibles > 0 && seleccionadosVisibles === seleccionables.length;
  stockSeleccionarTodos.indeterminate = seleccionadosVisibles > 0 && seleccionadosVisibles < seleccionables.length;
}

function renderStock() {
  const puedeMarcarPasado = permisosDelTecnico(tecnicoLogueado).marcar_pasado_sistema;
  const rango = obtenerRangoPeriodo(stockPeriodoActivo, stockFechaEspecifica);
  let filtrados = stockCache.filter((m) => fechaEnRango(m.fecha, rango));

  if (stockPasadoActivo === "si") {
    filtrados = filtrados.filter((m) => !!m.pasado_sistema_offline);
  } else if (stockPasadoActivo === "no") {
    filtrados = filtrados.filter((m) => !m.pasado_sistema_offline);
  }

  const terminoBusqueda = normalizeText(stockSearch.value);
  if (terminoBusqueda) {
    filtrados = filtrados.filter((m) => {
      const haystack = normalizeText([m.cliente, m.modelo, m.numero_servicio, m.direccion].join(" "));
      return haystack.includes(terminoBusqueda);
    });
  }

  // Los no pasados a sistema van primero; dentro de cada grupo, más reciente primero.
  filtrados.sort((a, b) => {
    const aPend = a.pasado_sistema_offline ? 1 : 0;
    const bPend = b.pasado_sistema_offline ? 1 : 0;
    if (aPend !== bPend) return aPend - bPend;
    const claveA = `${a.fecha || ""} ${a.hora || ""}`;
    const claveB = `${b.fecha || ""} ${b.hora || ""}`;
    return claveB.localeCompare(claveA);
  });

  stockFiltradoActual = filtrados;

  const idsVisibles = new Set(filtrados.map((m) => m.id));
  stockSeleccionados.forEach((id) => {
    if (!idsVisibles.has(id)) stockSeleccionados.delete(id);
  });

  stockList.innerHTML = "";
  if (filtrados.length === 0) {
    stockStatus.textContent = "No hay movimientos de stock en ese período.";
    actualizarBarraSeleccionStock([]);
    return;
  }
  stockStatus.textContent = `${filtrados.length} movimiento(s).`;

  // Se agrupa por parte (N° de servicio) — un técnico piensa en
  // términos de "qué cargué en esta visita", no en movimientos
  // sueltos. La clave preferida es parte_id (más precisa); si algún
  // movimiento viejo/manual no lo tiene, se cae a numero_servicio, y
  // si tampoco hay eso, queda solo (no se agrupa con nada).
  const gruposMapa = new Map();
  filtrados.forEach((m) => {
    const clave = m.parte_id || m.numero_servicio || `individual-${m.id}`;
    if (!gruposMapa.has(clave)) gruposMapa.set(clave, []);
    gruposMapa.get(clave).push(m);
  });

  // El orden de los grupos respeta el mismo criterio que antes tenían
  // los movimientos sueltos: los que tengan algo pendiente de pasar a
  // sistema van primero, y dentro de cada tanda, el más reciente.
  const grupos = [...gruposMapa.entries()].map(([clave, movimientos]) => {
    const tienePendiente = movimientos.some((m) => !m.pasado_sistema_offline);
    const claveOrden = movimientos.reduce((max, m) => {
      const c = `${m.fecha || ""} ${m.hora || ""}`;
      return c > max ? c : max;
    }, "");
    return { clave, movimientos, tienePendiente, claveOrden };
  });
  grupos.sort((a, b) => {
    if (a.tienePendiente !== b.tienePendiente) return a.tienePendiente ? -1 : 1;
    return b.claveOrden.localeCompare(a.claveOrden);
  });

  const seleccionables = [];
  grupos.forEach((grupo) => {
    const primero = grupo.movimientos[0];
    let fechaTexto = primero.fecha || "";
    if (primero.fecha) {
      const [y, mm, d] = primero.fecha.split("-");
      fechaTexto = `${d}/${mm}/${y}`;
    }
    const totalInstalado = grupo.movimientos.reduce((s, m) => s + (m.cantidad_instalada || 0), 0);
    const totalRetirado = grupo.movimientos.reduce((s, m) => s + (m.cantidad_retirada || 0), 0);
    const resumenPartes = [];
    if (totalInstalado > 0) resumenPartes.push(`<span class="badge-stock badge-instalado">↑ ${totalInstalado} instalado${totalInstalado === 1 ? "" : "s"}</span>`);
    if (totalRetirado > 0) resumenPartes.push(`<span class="badge-stock badge-retirado">↓ ${totalRetirado} retirado${totalRetirado === 1 ? "" : "s"}</span>`);

    const expandido = stockGruposExpandidos.has(grupo.clave);
    const card = document.createElement("div");
    card.className = "historial-card" + (grupo.tienePendiente ? "" : " historial-card-pasado");

    const cabecera = document.createElement("div");
    cabecera.style.cursor = "pointer";
    cabecera.innerHTML = `
      <div class="historial-card-header-izq">
        <div class="historial-card-num">N° ${escapeHtml(primero.numero_servicio || "s/n")}${primero.numero_cliente ? " · Cliente " + escapeHtml(primero.numero_cliente) : ""}</div>
        <span style="margin-left:auto; color:#8A9089;">${expandido ? "▲" : "▼"}</span>
      </div>
      <div class="historial-card-direccion">${escapeHtml(primero.cliente)} — ${escapeHtml(primero.direccion || "")}</div>
      <div class="historial-card-horario">${escapeHtml(primero.tecnico)} — ${fechaTexto} · ${grupo.movimientos.length} artículo${grupo.movimientos.length === 1 ? "" : "s"}</div>
      <div class="historial-card-badges">${resumenPartes.join("")}</div>
    `;
    cabecera.addEventListener("click", () => {
      if (stockGruposExpandidos.has(grupo.clave)) stockGruposExpandidos.delete(grupo.clave);
      else stockGruposExpandidos.add(grupo.clave);
      renderStock();
    });
    card.appendChild(cabecera);

    if (expandido) {
      const detalle = document.createElement("div");
      detalle.style.cssText = "margin-top:10px; padding-top:10px; border-top:1px dashed #D8DCD4;";
      grupo.movimientos.forEach((m) => {
        const partesLinea = [];
        if (m.cantidad_instalada > 0) partesLinea.push(`<span class="badge-stock badge-instalado">↑ Instaló x${m.cantidad_instalada}</span>`);
        if (m.cantidad_retirada > 0) partesLinea.push(`<span class="badge-stock badge-retirado">↓ Retiró x${m.cantidad_retirada}</span>`);
        if (m.es_manual) partesLinea.push(`<span class="badge-material-manual">✎ Cargado a mano</span>`);

        const puedeSeleccionar = puedeMarcarPasado && !m.pasado_sistema_offline;
        if (puedeSeleccionar) seleccionables.push(m);
        const seleccionHtml = puedeSeleccionar ? `
          <label class="historial-card-seleccionar" title="Seleccionar para marcar en lote">
            <input type="checkbox" class="stock-check-seleccion" ${stockSeleccionados.has(m.id) ? "checked" : ""}>
          </label>
        ` : "";

        const linea = document.createElement("div");
        linea.style.cssText = "padding:8px 0; border-bottom:1px solid #F4F5F0;";
        linea.innerHTML = `
          <div class="historial-card-header-izq">
            ${seleccionHtml}
            <div class="historial-card-cliente" style="margin:0;">${escapeHtml(m.modelo)}${m.categoria ? " · " + escapeHtml(m.categoria) : ""}</div>
          </div>
          <div class="historial-card-badges">${partesLinea.join("")}</div>
          ${puedeMarcarPasado ? `
            <label class="historial-card-check">
              <input type="checkbox" class="stock-check-pasado" ${m.pasado_sistema_offline ? "checked" : ""}>
              ${m.pasado_sistema_offline ? `Pasado a sistema (${escapeHtml(m.pasado_sistema_por || "")})` : "Pasado a mi sistema"}
            </label>
          ` : ""}
        `;
        if (puedeMarcarPasado) {
          const checkbox = linea.querySelector(".stock-check-pasado");
          checkbox.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            marcarStockPasadoSistema(m, !m.pasado_sistema_offline);
          });
        }
        if (puedeSeleccionar) {
          const checkboxSel = linea.querySelector(".stock-check-seleccion");
          checkboxSel.addEventListener("click", (e) => {
            e.stopPropagation();
            if (checkboxSel.checked) stockSeleccionados.add(m.id);
            else stockSeleccionados.delete(m.id);
            actualizarBarraSeleccionStock(seleccionables);
          });
        }
        detalle.appendChild(linea);
      });
      card.appendChild(detalle);
    } else {
      // aunque esté colapsado, sus movimientos siguen contando para
      // "seleccionar todos" — si no, ese botón dejaría afuera todo lo
      // que el técnico no llegó a desplegar
      grupo.movimientos.forEach((m) => {
        if (puedeMarcarPasado && !m.pasado_sistema_offline) seleccionables.push(m);
      });
    }

    stockList.appendChild(card);
  });
  actualizarBarraSeleccionStock(seleccionables);
}

// ---------- Notas entre usuarios ----------
// Cada fila que llega de /api/datos?coleccion=notas es (nota,
// destinatario) — una nota mandada a 3 personas llega como 3 filas
// con el mismo "id" pero distinto "tecnico"/"leido". Se filtra por
// tecnico===yo para "Recibidas", y se agrupa por id para "Enviadas"
// (así se ve a quién le llegó y a quién todavía no).
let notasCache = [];
let notaTabActiva = "recibidas";
let notaClienteEncontrado = null;
let notaServicioEncontrado = null;
let notaFotoUrl = "";
let notasModalYaMostrado = false;

const tileNotasBtn = document.getElementById("tileNotasBtn");
const notasPendientesBadge = document.getElementById("notasPendientesBadge");
const volverDeNotasBtn = document.getElementById("volverDeNotasBtn");
const notaNuevaBtn = document.getElementById("notaNuevaBtn");
const notaFormWrap = document.getElementById("notaFormWrap");
const notaMensajeInput = document.getElementById("notaMensajeInput");
const notaDestinatariosLista = document.getElementById("notaDestinatariosLista");
const notaClienteInput = document.getElementById("notaClienteInput");
const notaServicioInput = document.getElementById("notaServicioInput");
const notaFotoInput = document.getElementById("notaFotoInput");
const notaFotoPreviewWrap = document.getElementById("notaFotoPreviewWrap");
const notaFotoPreviewImg = document.getElementById("notaFotoPreviewImg");
const notaFotoQuitarBtn = document.getElementById("notaFotoQuitarBtn");
const notaUrgenteInput = document.getElementById("notaUrgenteInput");
const notaEnviarBtn = document.getElementById("notaEnviarBtn");
const notaCancelarBtn = document.getElementById("notaCancelarBtn");
const notaOcultarLeidasCheck = document.getElementById("notaOcultarLeidasCheck");
const notaSearchInput = document.getElementById("notaSearchInput");
const notasStatus = document.getElementById("notasStatus");
const notasList = document.getElementById("notasList");
const notasModalOverlay = document.getElementById("notasModalOverlay");
const notasModalResumen = document.getElementById("notasModalResumen");
const notasModalVerBtn = document.getElementById("notasModalVerBtn");
const notasModalDespuesBtn = document.getElementById("notasModalDespuesBtn");

tileNotasBtn.addEventListener("click", () => {
  showScreen("notas");
  fetchNotas();
});
volverDeNotasBtn.addEventListener("click", () => {
  showScreen("home");
  // Si estuvo mirando "Recibidas", lo que tenía en pantalla se da por
  // leído (antes había que tocar cada nota una por una, y quien las lee
  // sin tocarlas las seguía viendo como pendientes en cada ingreso).
  if (notaTabActiva === "recibidas") marcarNotasLeidas(notasSinLeerDelTecnico());
});

document.querySelectorAll(".nota-tab-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".nota-tab-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    notaTabActiva = chip.dataset.tab;
    renderNotas();
  });
});

notaNuevaBtn.addEventListener("click", () => {
  const iraMostrar = notaFormWrap.classList.contains("hidden");
  if (iraMostrar) abrirFormularioNota();
  else notaFormWrap.classList.add("hidden");
});

function abrirFormularioNota(destinatarioPrefijado) {
  notaFormWrap.classList.remove("hidden");
  poblarDestinatariosNota();
  poblarDatalistClientesNota();
  poblarDatalistServiciosNota();
  if (destinatarioPrefijado) {
    const check = notaDestinatariosLista.querySelector(`.nota-dest-check[value="${CSS.escape(destinatarioPrefijado)}"]`);
    if (check) check.checked = true;
  }
  notaMensajeInput.focus();
  notaFormWrap.scrollIntoView({ behavior: "smooth", block: "start" });
}
notaCancelarBtn.addEventListener("click", limpiarFormularioNota);

let notaFormGeneracion = 0; // se incrementa cada vez que el formulario se limpia/cierra —
// así una subida de foto que sigue en curso en ese momento no "resucita" en la nota siguiente.

function limpiarFormularioNota() {
  notaFormGeneracion++;
  notaFormWrap.classList.add("hidden");
  notaMensajeInput.value = "";
  notaClienteInput.value = "";
  notaServicioInput.value = "";
  notaUrgenteInput.checked = false;
  notaClienteEncontrado = null;
  notaServicioEncontrado = null;
  notaFotoUrl = "";
  notaFotoInput.value = "";
  notaFotoPreviewWrap.classList.add("hidden");
  notaFotoPreviewImg.src = "";
}

notaFotoInput.addEventListener("change", async () => {
  const archivo = notaFotoInput.files && notaFotoInput.files[0];
  if (!archivo) return;
  const generacionAlSubir = notaFormGeneracion;
  notaFotoPreviewWrap.classList.remove("hidden");
  notaFotoPreviewImg.src = "";
  notaEnviarBtn.disabled = true;
  notaEnviarBtn.textContent = "Subiendo foto...";
  try {
    // Comprimir antes de subir — igual que el resto de la app
    // (partes, instalaciones). Sin esto, una foto sacada directo con
    // la cámara del celular (varios MB) puede superar el límite de
    // tamaño que acepta la función de Vercel y subir corrupta/rota.
    const base64 = await comprimirImagen(archivo, 1600, 0.75);
    const res = await fetch("/api/foto", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ base64 }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Error desconocido");
    if (generacionAlSubir !== notaFormGeneracion) return; // se canceló/mandó el formulario mientras subía — no aplicar sobre el siguiente
    notaFotoUrl = `${window.location.origin}/api/foto?id=${data.id}`;
    notaFotoPreviewImg.src = notaFotoUrl;
  } catch (err) {
    if (generacionAlSubir !== notaFormGeneracion) return;
    showToast("No se pudo subir la foto: " + err.message);
    notaFotoPreviewWrap.classList.add("hidden");
    notaFotoInput.value = "";
    notaFotoUrl = "";
  } finally {
    if (generacionAlSubir === notaFormGeneracion) {
      notaEnviarBtn.disabled = false;
      notaEnviarBtn.textContent = "Mandar";
    }
  }
});
notaFotoQuitarBtn.addEventListener("click", () => {
  notaFotoUrl = "";
  notaFotoInput.value = "";
  notaFotoPreviewWrap.classList.add("hidden");
  notaFotoPreviewImg.src = "";
});

function poblarDestinatariosNota() {
  const nombres = Object.keys(tecnicosPasswords || {}).sort();
  notaDestinatariosLista.innerHTML = `
    <label class="historial-select-all" style="width:100%;">
      <input type="checkbox" id="notaDestTodos"> Todos
    </label>
    ${nombres.map((n) => `
      <label class="historial-select-all" style="width:auto;">
        <input type="checkbox" class="nota-dest-check" value="${escapeHtml(n)}"> ${escapeHtml(n)}
      </label>
    `).join("")}
  `;
  const todosCheck = document.getElementById("notaDestTodos");
  todosCheck.addEventListener("change", () => {
    document.querySelectorAll(".nota-dest-check").forEach((c) => { c.checked = todosCheck.checked; });
  });
}

function poblarDatalistClientesNota() {
  const datalist = document.getElementById("notaClientesLista");
  datalist.innerHTML = (clientesGeneralCache || [])
    .filter((c) => c.nombre)
    .map((c) => `<option value="${escapeHtml(c.nombre)}"></option>`)
    .join("");
}

notaClienteInput.addEventListener("input", () => {
  notaClienteEncontrado = buscarClientePorNombre(notaClienteInput.value.trim());
});

// Igual que el buscador de cliente, pero contra los servicios
// pendientes — el datalist muestra "N° - Cliente" y al elegir uno se
// resuelve buscando el que empieza con ese número.
function poblarDatalistServiciosNota() {
  const datalist = document.getElementById("notaServiciosLista");
  datalist.innerHTML = (serviciosCache || [])
    .filter((s) => s.numero_servicio)
    .map((s) => `<option value="${escapeHtml(s.numero_servicio + " - " + (s.cliente || ""))}"></option>`)
    .join("");
}

notaServicioInput.addEventListener("input", () => {
  const texto = notaServicioInput.value.trim();
  const numeroBuscado = texto.split(" - ")[0].trim();
  notaServicioEncontrado = (serviciosCache || []).find((s) => s.numero_servicio === numeroBuscado) || null;
});

notaEnviarBtn.addEventListener("click", async () => {
  const mensaje = notaMensajeInput.value.trim();
  if (!mensaje) {
    showToast("Escribí un mensaje.");
    return;
  }
  const destinatarios = [...document.querySelectorAll(".nota-dest-check:checked")].map((c) => c.value);
  if (destinatarios.length === 0) {
    showToast("Elegí al menos un destinatario.");
    return;
  }
  notaEnviarBtn.disabled = true;
  try {
    const res = await fetch("/api/datos?coleccion=notas", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        accion: "crear",
        de: tecnicoLogueado || "",
        mensaje,
        urgente: notaUrgenteInput.checked,
        numero_cliente: notaClienteEncontrado ? notaClienteEncontrado.numero_cliente : "",
        cliente: notaClienteEncontrado ? notaClienteEncontrado.nombre : notaClienteInput.value.trim(),
        numero_servicio: notaServicioEncontrado ? notaServicioEncontrado.numero_servicio : "",
        foto_url: notaFotoUrl,
        destinatarios,
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    showToast("Nota enviada.");
    limpiarFormularioNota();
    notaTabActiva = "enviadas";
    document.querySelectorAll(".nota-tab-chip").forEach((c) => c.classList.toggle("active", c.dataset.tab === "enviadas"));
    await fetchNotas();
  } catch (err) {
    showToast("No se pudo enviar la nota: " + err.message);
  } finally {
    notaEnviarBtn.disabled = false;
  }
});

async function fetchNotas() {
  notasStatus.textContent = "Cargando...";
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=notas", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    notasCache = Array.isArray(data) ? data : [];
    renderNotas();
    actualizarBadgeNotas();
  } catch (err) {
    notasStatus.textContent = "No se pudieron cargar las notas.";
  }
}

async function marcarNotaLeida(n) {
  try {
    const res = await fetch("/api/datos?coleccion=notas", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ accion: "marcar_leida", nota_id: n.id, tecnico: tecnicoLogueado || "" }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    n.leido = 1;
    renderNotas();
    actualizarBadgeNotas();
  } catch (err) {
    showToast("No se pudo marcar como leída: " + err.message);
  }
}

// Marca varias notas como leídas de una vez (en paralelo). Devuelve
// cuántas se pudieron marcar. Un solo repintado al final.
async function marcarNotasLeidas(lista) {
  if (!lista || lista.length === 0) return 0;
  const resultados = await Promise.allSettled(lista.map(async (n) => {
    const res = await fetch("/api/datos?coleccion=notas", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ accion: "marcar_leida", nota_id: n.id, tecnico: tecnicoLogueado || "" }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    n.leido = 1;
  }));
  renderNotas();
  actualizarBadgeNotas();
  return resultados.filter((r) => r.status === "fulfilled").length;
}
function notasSinLeerDelTecnico() {
  return notasCache.filter((f) => f.tecnico === tecnicoLogueado && !f.leido);
}

function agruparNotasEnviadas(filas) {
  const mapa = new Map();
  filas.forEach((f) => {
    if (!mapa.has(f.id)) {
      mapa.set(f.id, { id: f.id, de: f.de, mensaje: f.mensaje, urgente: f.urgente, cliente: f.cliente, numero_servicio: f.numero_servicio, foto_url: f.foto_url, creado_en: f.creado_en, destinatarios: [] });
    }
    mapa.get(f.id).destinatarios.push({ tecnico: f.tecnico, leido: f.leido });
  });
  return [...mapa.values()].sort(ordenarUrgentesPrimero);
}

// Urgentes arriba de todo, sin importar cuándo llegaron; dentro de
// cada grupo (urgentes / no urgentes), la más nueva primero.
function ordenarUrgentesPrimero(a, b) {
  const aUrg = a.urgente ? 1 : 0;
  const bUrg = b.urgente ? 1 : 0;
  if (aUrg !== bUrg) return bUrg - aUrg;
  return b.id - a.id;
}

function actualizarBadgeNotas() {
  const pendientes = notasCache.filter((f) => f.tecnico === tecnicoLogueado && !f.leido).length;
  if (pendientes > 0) {
    notasPendientesBadge.textContent = pendientes > 99 ? "99+" : String(pendientes);
    notasPendientesBadge.classList.remove("hidden");
  } else {
    notasPendientesBadge.classList.add("hidden");
  }
}

notaOcultarLeidasCheck.addEventListener("change", renderNotas);
notaSearchInput.addEventListener("input", renderNotas);

function renderNotas() {
  notasList.innerHTML = "";
  let items;
  if (notaTabActiva === "recibidas") {
    items = notasCache.filter((f) => f.tecnico === tecnicoLogueado).sort(ordenarUrgentesPrimero);
  } else {
    items = agruparNotasEnviadas(notasCache.filter((f) => f.de === tecnicoLogueado));
  }

  if (notaOcultarLeidasCheck.checked) {
    const limite = Date.now() - 3 * 24 * 60 * 60 * 1000;
    items = items.filter((n) => {
      const yaLeida = notaTabActiva === "recibidas" ? !!n.leido : n.destinatarios.every((d) => d.leido);
      const esVieja = n.creado_en && new Date(n.creado_en).getTime() < limite;
      return !(yaLeida && esVieja);
    });
  }

  const termino = normalizeText(notaSearchInput.value.trim());
  if (termino) {
    items = items.filter((n) => {
      const personas = notaTabActiva === "recibidas" ? n.de : n.destinatarios.map((d) => d.tecnico).join(" ");
      const haystack = normalizeText([n.mensaje, n.cliente, personas].join(" "));
      return haystack.includes(termino);
    });
  }

  if (items.length === 0) {
    notasStatus.textContent = notaTabActiva === "recibidas" ? "No tenés notas." : "Todavía no mandaste ninguna nota.";
    return;
  }
  notasStatus.textContent = `${items.length} nota(s).`;

  items.forEach((n) => {
    const fecha = n.creado_en ? new Date(n.creado_en).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
    const noLeida = notaTabActiva === "recibidas" && !n.leido;
    const card = document.createElement("div");
    card.className = "historial-card" + (n.urgente ? " nota-card-urgente" : "") + (noLeida ? " nota-card-no-leida" : "");

    const clienteHtml = n.cliente ? `<div class="historial-card-direccion">📍 ${escapeHtml(n.cliente)}</div>` : "";
    const servicioHtml = n.numero_servicio ? `<div class="historial-card-direccion">🧾 Servicio N° ${escapeHtml(n.numero_servicio)}</div>` : "";
    const fotoHtml = n.foto_url ? `<a href="${escapeHtml(n.foto_url)}" target="_blank" rel="noopener"><img src="${escapeHtml(n.foto_url)}" style="max-width:100%; border-radius:8px; margin-top:8px; display:block;"></a>` : "";
    const deHtml = notaTabActiva === "recibidas" ? `<div class="nota-card-de">De: ${escapeHtml(n.de)}</div>` : "";
    const paraHtml = notaTabActiva === "enviadas"
      ? `<div class="nota-card-de">Para: ${n.destinatarios.map((d) => `${escapeHtml(d.tecnico)}${d.leido ? " ✓" : ""}`).join(", ")}</div>`
      : "";
    const responderHtml = notaTabActiva === "recibidas"
      ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
          <button type="button" class="btn btn-ghost-light nota-responder-btn" style="padding:4px 10px; font-size:12px;">↩ Responder</button>
          ${noLeida ? '<button type="button" class="btn btn-ghost-light nota-leida-btn" style="padding:4px 10px; font-size:12px;">✓ Marcar como leída</button>' : ""}
        </div>`
      : "";

    card.innerHTML = `
      <div class="historial-card-header">
        <div class="historial-card-num">${n.urgente ? "🔴 " : ""}${fecha}</div>
      </div>
      ${deHtml}
      <div class="historial-card-cliente">${escapeHtml(n.mensaje)}</div>
      ${clienteHtml}
      ${servicioHtml}
      ${fotoHtml}
      ${paraHtml}
      ${responderHtml}
    `;

    if (noLeida) {
      card.style.cursor = "pointer";
      card.addEventListener("click", (e) => {
        if (e.target.closest(".nota-responder-btn") || e.target.closest("a")) return;
        marcarNotaLeida(n);
      });
    }
    const btnResponder = card.querySelector(".nota-responder-btn");
    if (btnResponder) {
      btnResponder.addEventListener("click", (e) => {
        e.stopPropagation();
        if (noLeida) marcarNotaLeida(n); // si la va a responder, ya la leyó
        abrirFormularioNota(n.de);
      });
    }
    const btnLeida = card.querySelector(".nota-leida-btn");
    if (btnLeida) {
      btnLeida.addEventListener("click", (e) => {
        e.stopPropagation();
        marcarNotaLeida(n);
      });
    }
    notasList.appendChild(card);
  });

  // Atajo: marcar todas las pendientes de una vez
  const pendientesAca = notaTabActiva === "recibidas" ? items.filter((n) => !n.leido) : [];
  if (pendientesAca.length > 1) {
    const btnTodas = document.createElement("button");
    btnTodas.type = "button";
    btnTodas.className = "btn btn-secondary";
    btnTodas.style.marginBottom = "10px";
    btnTodas.textContent = `✓ Marcar las ${pendientesAca.length} como leídas`;
    btnTodas.addEventListener("click", async () => {
      btnTodas.disabled = true;
      const ok = await marcarNotasLeidas(pendientesAca);
      if (ok < pendientesAca.length) showToast("Algunas no se pudieron marcar. Probá de nuevo.");
    });
    notasList.insertBefore(btnTodas, notasList.firstChild);
  }
}

async function precargarNotasYAvisar() {
  await fetchNotas();
  const pendientes = notasCache.filter((f) => f.tecnico === tecnicoLogueado && !f.leido);
  if (pendientes.length > 0 && !notasModalYaMostrado) {
    notasModalYaMostrado = true;
    const urgentes = pendientes.filter((f) => f.urgente).length;
    notasModalResumen.textContent = `Tenés ${pendientes.length} nota${pendientes.length === 1 ? "" : "s"} sin leer${urgentes > 0 ? ` (${urgentes} urgente${urgentes === 1 ? "" : "s"})` : ""}.`;
    notasModalOverlay.classList.remove("hidden");
  }
}

notasModalVerBtn.addEventListener("click", () => {
  notasModalOverlay.classList.add("hidden");
  showScreen("notas");
  notaTabActiva = "recibidas";
  document.querySelectorAll(".nota-tab-chip").forEach((c) => c.classList.toggle("active", c.dataset.tab === "recibidas"));
  renderNotas();
});
notasModalDespuesBtn.addEventListener("click", () => {
  notasModalOverlay.classList.add("hidden");
});

// ---------- Ajustes (apariencia + carteles de aviso) ----------
// Se guardan solo en este celular (localStorage).
const AJUSTES_DEFECTO = { tema: "clasico", tamano: "normal", avisoTestPoner: true, avisoTestQuitar: true, sonidoBotones: true, vibracionBotones: true, sonidoResultado: true, sonidoFelicitacion: true, confetiFelicitacion: true, volumen: 50, botonesGrandes: false, estiloInicio: "clasico", pantallaEncendida: false, appMapas: "google", bloqueoHuella: false, cierreInactividad: 0, mosaicos: { orden: [], ocultos: [] }, estiloSonido: "suave", avisoSims: true, avisoFelicitacion: true };
function leerAjustes() {
  try {
    const guardado = JSON.parse(localStorage.getItem("ajustes_app") || "{}");
    return Object.assign({}, AJUSTES_DEFECTO, guardado && typeof guardado === "object" ? guardado : {});
  } catch (e) {
    return Object.assign({}, AJUSTES_DEFECTO);
  }
}
function guardarAjustes(ajustes) {
  try { localStorage.setItem("ajustes_app", JSON.stringify(ajustes)); } catch (e) {}
}
function aplicarTema() {
  let t = leerAjustes().tema;
  if (t === "auto") t = (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "night" : "day";
  if (t === "night" || t === "day" || t === "contraste") document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "contraste" ? "#FFFFFF" : t === "day" ? "#EEF0EA" : "#101820");
}
function aplicarTamano() {
  const esc = { chico: 0.88, normal: 1, grande: 1.2 }[leerAjustes().tamano] || 1;
  document.documentElement.style.setProperty("--escala", esc);
}
// En modo Automático, acompaña al celular si cambia de claro a oscuro
if (window.matchMedia) {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const alCambiar = () => { if (leerAjustes().tema === "auto") aplicarTema(); };
  if (mq.addEventListener) mq.addEventListener("change", alCambiar);
  else if (mq.addListener) mq.addListener(alCambiar);
}

const ajustesBtn = document.getElementById("ajustesBtn");
const volverDeAjustesBtn = document.getElementById("volverDeAjustesBtn");
let pantallaAntesDeAjustes = "home";

function renderAjustes() {
  const aj = leerAjustes();
  try {
    const nuevo = document.documentElement.dataset.inicio === "nuevo";
    const manual = Array.isArray((aj.mosaicos || {}).orden) && aj.mosaicos.orden.length > 0;
    const wrapOrden = document.getElementById("ajusteOrdenAuto");
    wrapOrden.hidden = !nuevo;
    document.getElementById("ajusteOrdenAutoTexto").textContent = manual ? "Las teclas del inicio tienen un orden armado a mano." : "Las teclas del inicio se ordenan solas según cuánto las usás.";
    document.getElementById("ajusteOrdenAutoBtn").classList.toggle("hidden", !manual);
    document.getElementById("ajusteNotifWrap").hidden = !nuevo;
    verificarEstadoNotificaciones();
  } catch (e) { /* aún no cargó */ }
  document.querySelectorAll("#ajusteTemas .ajuste-tema-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.tema === aj.tema);
  });
  document.querySelectorAll("#ajusteTamanos .ajuste-tema-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.tamano === aj.tamano);
  });
  document.querySelectorAll("#ajusteEstiloSonido .ajuste-tema-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.estilo === aj.estiloSonido);
  });
  const rangoVol = document.getElementById("ajusteVolumen");
  if (rangoVol) rangoVol.value = aj.volumen;
  renderGruposChips();
  renderMosaicosAjustes();
  document.querySelectorAll("#screen-ajustes input[data-ajuste]").forEach((inp) => {
    inp.checked = !!aj[inp.dataset.ajuste];
  });
}
ajustesBtn.addEventListener("click", () => {
  const actual = Object.entries(screens).find(([, el]) => el.dataset.active === "true");
  if (actual && actual[0] !== "ajustes") pantallaAntesDeAjustes = actual[0];
  renderAjustes();
  showScreen("ajustes");
});
volverDeAjustesBtn.addEventListener("click", () => showScreen(screens[pantallaAntesDeAjustes] ? pantallaAntesDeAjustes : "home"));
document.querySelectorAll("#ajusteTemas .ajuste-tema-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const aj = leerAjustes();
    aj.tema = chip.dataset.tema;
    guardarAjustes(aj);
    aplicarTema();
    renderAjustes();
  });
});
document.querySelectorAll("#ajusteTamanos .ajuste-tema-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const aj = leerAjustes();
    aj.tamano = chip.dataset.tamano;
    guardarAjustes(aj);
    aplicarTamano();
    renderAjustes();
  });
});
document.querySelectorAll("#screen-ajustes input[data-ajuste]").forEach((inp) => {
  inp.addEventListener("change", () => {
    const aj = leerAjustes();
    aj[inp.dataset.ajuste] = inp.checked;
    guardarAjustes(aj);
    if (inp.dataset.ajuste === "botonesGrandes") aplicarBotonesGrandes();
    if (inp.dataset.ajuste === "pantallaEncendida") actualizarWakeLockPantalla();
    if (inp.dataset.ajuste === "avisoTestPoner") {
      if (inp.checked) iniciarRecordatorioTestGeo();
      else detenerRecordatorioTestGeo();
    }
    showToast("Guardado.");
  });
});
aplicarTema();
aplicarTamano();
aplicarBotonesGrandes();
document.getElementById("probarSonidosBtn").addEventListener("click", () => {
  sonarToque(true);
  setTimeout(() => sonarExito(true), 350);
  setTimeout(() => sonarError(true), 1300);
  setTimeout(() => { sonarVitoreo(true); lanzarConfeti(true); }, 2300);
});
document.querySelectorAll("#ajusteEstiloSonido .ajuste-tema-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const aj = leerAjustes();
    aj.estiloSonido = chip.dataset.estilo;
    guardarAjustes(aj);
    renderAjustes();
    sonarToque(true);
    setTimeout(() => sonarExito(true), 300);
  });
});
const ajusteVolumen = document.getElementById("ajusteVolumen");
ajusteVolumen.addEventListener("input", () => {
  const aj = leerAjustes();
  aj.volumen = Number(ajusteVolumen.value);
  guardarAjustes(aj);
});
ajusteVolumen.addEventListener("change", () => sonarToque(true)); // al soltar, se escucha el nuevo volumen

// ---------- Sonidos y vibración (botones, parte enviado / error) ----------
// Los sonidos se generan con Web Audio (sin archivos). El navegador solo
// deja sonar después de un toque del usuario, por eso el contexto se crea
// recién en el primer toque.
let audioCtx = null;
function obtenerAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch (e) { return null; }
}
// Estilos de sonido. Cada nota: [frecuencia Hz, inicio s, duración s, volumen, onda]
const ESTILOS_SONIDO = {
  suave: {
    toque: [[1400, 0, 0.05, 0.07, "triangle"]],
    exito: [[523, 0, 0.16, 0.12, "sine"], [659, 0.12, 0.16, 0.12, "sine"], [784, 0.24, 0.32, 0.12, "sine"]],
    error: [[220, 0, 0.2, 0.1, "sawtooth"], [165, 0.24, 0.3, 0.1, "sawtooth"]],
  },
  digital: {
    toque: [[1900, 0, 0.03, 0.06, "square"]],
    exito: [[659, 0, 0.08, 0.07, "square"], [880, 0.09, 0.08, 0.07, "square"], [1175, 0.18, 0.18, 0.07, "square"]],
    error: [[150, 0, 0.12, 0.08, "square"], [150, 0.16, 0.12, 0.08, "square"], [110, 0.32, 0.24, 0.08, "square"]],
  },
  campana: {
    toque: [[2200, 0, 0.09, 0.06, "sine"], [3300, 0, 0.06, 0.02, "sine"]],
    exito: [[880, 0, 0.5, 0.1, "sine"], [1760, 0, 0.3, 0.03, "sine"], [1109, 0.14, 0.5, 0.1, "sine"], [1319, 0.28, 0.7, 0.1, "sine"], [2638, 0.28, 0.4, 0.03, "sine"]],
    error: [[330, 0, 0.28, 0.12, "triangle"], [247, 0.22, 0.45, 0.12, "triangle"]],
  },
};
// Volumen: 10..100 (50 = el de antes). Se multiplica el volumen de cada nota.
function multiplicadorVolumen() {
  const v = Number(leerAjustes().volumen);
  return (isFinite(v) ? Math.min(100, Math.max(10, v)) : 50) / 50;
}
function reproducirSonido(tipo) {
  const ctx = obtenerAudio();
  if (!ctx) return;
  const estilo = ESTILOS_SONIDO[leerAjustes().estiloSonido] || ESTILOS_SONIDO.suave;
  const mult = multiplicadorVolumen();
  (estilo[tipo] || []).forEach(([freq, inicio, dur, vol, onda]) => tonoSuave(ctx, freq, inicio, dur, Math.min(0.5, vol * mult), onda));
}
function tonoSuave(ctx, freq, inicio, dur, vol, tipo) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = tipo || "sine";
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + inicio;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}
function vibrar(patron) {
  try { if (navigator.vibrate) navigator.vibrate(patron); } catch (e) {}
}
// Vitoreo: fanfarria corta + aplauso (ráfagas de ruido filtrado). Dura ~3 s.
function sonarVitoreo(forzar) {
  if (!leerAjustes().sonidoFelicitacion && !forzar) return;
  const ctx = obtenerAudio();
  if (!ctx) return;
  const mult = multiplicadorVolumen();
  // Fanfarria ascendente
  [[523, 0, 0.16], [659, 0.16, 0.16], [784, 0.32, 0.16], [1047, 0.48, 0.7]].forEach(([f, ini, dur]) => {
    tonoSuave(ctx, f, ini, dur, Math.min(0.5, 0.11 * mult), "triangle");
    tonoSuave(ctx, f * 2, ini, dur, Math.min(0.5, 0.03 * mult), "sine");
  });
  // Aplauso: muchas palmadas cortas, más densas al medio
  const base = ctx.currentTime + 0.35;
  const palmadas = 70;
  for (let i = 0; i < palmadas; i++) {
    const u = Math.random();
    const t = base + (u * 0.5 + Math.pow(Math.random(), 1.4) * 2.0); // entre 0 y ~2.5 s
    const dur = 0.035 + Math.random() * 0.05;
    const largo = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, largo, ctx.sampleRate);
    const datos = buf.getChannelData(0);
    for (let k = 0; k < largo; k++) datos[k] = (Math.random() * 2 - 1) * (1 - k / largo);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filtro = ctx.createBiquadFilter();
    filtro.type = "bandpass";
    filtro.frequency.value = 1300 + Math.random() * 2400;
    filtro.Q.value = 0.9;
    const gain = ctx.createGain();
    // un poco menos fuerte hacia el final (se va apagando)
    const caida = 1 - Math.min(1, (t - base) / 3);
    gain.gain.value = Math.min(1, (0.35 + Math.random() * 0.3) * mult * (0.4 + 0.6 * caida));
    src.connect(filtro); filtro.connect(gain); gain.connect(ctx.destination);
    src.start(t);
  }
  vibrar([60, 40, 60, 40, 120]);
}
// Papel picado: lluvia de confeti en un canvas a pantalla completa
// (por encima de todo, sin bloquear los toques). Dura ~5 s y se borra solo.
function lanzarConfeti(forzar) {
  if (!leerAjustes().confetiFelicitacion && !forzar) return;
  try { if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches && !forzar) return; } catch (e) {}
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed; inset:0; width:100vw; height:100vh; pointer-events:none; z-index:9999;";
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  document.body.appendChild(canvas);
  const g = canvas.getContext("2d");
  g.scale(dpr, dpr);
  const colores = ["#F5A623", "#17A2A0", "#E4402C", "#6C63C4", "#2E9E4F", "#2E86DE", "#FFD98E", "#FFFFFF"];
  const cantidad = Math.min(170, Math.round(W / 3));
  const piezas = [];
  for (let i = 0; i < cantidad; i++) {
    piezas.push({
      x: Math.random() * W,
      y: -20 - Math.random() * H * 0.6,          // salen escalonadas desde arriba
      w: 6 + Math.random() * 7,
      h: 9 + Math.random() * 9,
      vx: (Math.random() - 0.5) * 1.6,
      vy: 2 + Math.random() * 3.2,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      sway: Math.random() * Math.PI * 2,
      color: colores[Math.floor(Math.random() * colores.length)],
    });
  }
  const DURACION = 5200;
  const t0 = performance.now();
  function cuadro(ahora) {
    const t = ahora - t0;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = t > DURACION - 900 ? Math.max(0, (DURACION - t) / 900) : 1; // se desvanece al final
    piezas.forEach((p) => {
      p.x += p.vx + Math.sin(p.sway + t / 400) * 0.9;
      p.y += p.vy;
      p.rot += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.scale(1, Math.cos(p.rot * 1.7)); // simula el giro del papelito
      g.fillStyle = p.color;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    });
    if (t < DURACION) requestAnimationFrame(cuadro);
    else canvas.remove();
  }
  requestAnimationFrame(cuadro);
}
// forzar = true: para las pruebas desde Ajustes (suena aunque el interruptor esté apagado)
function sonarToque(forzar) {
  const aj = leerAjustes();
  if (aj.sonidoBotones || forzar) reproducirSonido("toque");
  if (aj.vibracionBotones && !forzar) vibrar(12);
}
function sonarExito(forzar) {
  if (!leerAjustes().sonidoResultado && !forzar) return;
  reproducirSonido("exito");
  vibrar([40, 60, 40]);
}
function sonarError(forzar) {
  if (!leerAjustes().sonidoResultado && !forzar) return;
  reproducirSonido("error");
  vibrar([200, 90, 200]);
}
// Un solo oyente para todos los botones/menús de la app
document.addEventListener("click", (e) => {
  obtenerAudio(); // desbloquea el audio con cualquier toque (aunque los sonidos de botón estén apagados)
  const el = e.target.closest && e.target.closest("button, .panel-tile, .servicio-card, .crono-tarea-card, .sim-card, .consulta-manual-item");
  if (!el || el.disabled || el.id === "probarSonidosBtn" || el.closest("#ajusteEstiloSonido")) return;
  sonarToque();
}, true);

// ---------- Opciones nuevas de Ajustes ----------
// Botones grandes
function aplicarBotonesGrandes() {
  if (leerAjustes().botonesGrandes) document.documentElement.setAttribute("data-botones", "grandes");
  else document.documentElement.removeAttribute("data-botones");
}

// Mantener la pantalla encendida mientras se carga un parte/instalación/firma/rendición
const PANTALLAS_DE_TRABAJO = ["form", "claves", "sign", "sending", "instalacion", "comodatoForm", "comodatoFirma", "rendicion", "presencia"];
let pantallaWakeLock = null;
let pantallaActualNombre = "";
function pantallaActivaNombre() {
  const act = Object.entries(screens).find(([, el]) => el.dataset.active === "true");
  return act ? act[0] : "";
}
async function actualizarWakeLockPantalla(nombre) {
  pantallaActualNombre = nombre || pantallaActivaNombre();
  const debeTenerla = leerAjustes().pantallaEncendida && PANTALLAS_DE_TRABAJO.includes(pantallaActualNombre) && !!tecnicoLogueado;
  if (debeTenerla) {
    if (pantallaWakeLock || !("wakeLock" in navigator)) return;
    try {
      pantallaWakeLock = await navigator.wakeLock.request("screen");
      pantallaWakeLock.addEventListener("release", () => { pantallaWakeLock = null; });
    } catch (e) { pantallaWakeLock = null; }
  } else if (pantallaWakeLock) {
    pantallaWakeLock.release().catch(() => {});
    pantallaWakeLock = null;
  }
}

// Cómo llegar (Google Maps / Waze)
const comoLlegarBtn = document.getElementById("comoLlegarBtn");
comoLlegarBtn.addEventListener("click", () => {
  const dir = document.getElementById("f_direccion").value.trim();
  const loc = document.getElementById("f_localidad").value.trim();
  if (!dir) { showToast("Completá la dirección antes de pedir cómo llegar."); return; }
  const q = encodeURIComponent([dir, loc, "Argentina"].filter(Boolean).join(", "));
  const url = leerAjustes().appMapas === "waze"
    ? `https://waze.com/ul?q=${q}&navigate=yes`
    : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  window.open(url, "_blank", "noopener");
});

// Mosaicos del inicio: orden y ocultos (por celular)
function mosaicosDelInicio() {
  return [...document.querySelectorAll("#screen-home .panel-tiles-grid > .panel-tile")];
}
function aplicarMosaicos() {
  const m = leerAjustes().mosaicos || {};
  let orden = Array.isArray(m.orden) ? m.orden : [];
  if (!orden.length && document.documentElement.dataset.inicio === "nuevo") {
    // Sin orden manual: Servicios Técnicos primero y el resto por cuánto se usa.
    let uso = {};
    try { uso = JSON.parse(localStorage.getItem("uso_mosaicos") || "{}") || {}; } catch (e) { uso = {}; }
    const todos = mosaicosDelInicio();
    orden = todos.map((el, i) => ({ id: el.id, i, n: el.id === "tileServiciosBtn" ? Infinity : (uso[el.id] || 0) }))
      .sort((a, b) => b.n - a.n || a.i - b.i).map((x) => x.id);
  }
  const ocultos = new Set(Array.isArray(m.ocultos) ? m.ocultos : []);
  mosaicosDelInicio().forEach((el, i) => {
    const idx = orden.indexOf(el.id);
    el.style.order = idx >= 0 ? idx : 1000 + i;
    el.classList.toggle("mosaico-oculto", ocultos.has(el.id));
  });
}
function renderMosaicosAjustes() {
  const cont = document.getElementById("ajusteMosaicos");
  if (!cont) return;
  const m = leerAjustes().mosaicos || {};
  const orden = Array.isArray(m.orden) ? m.orden : [];
  const ocultos = new Set(Array.isArray(m.ocultos) ? m.ocultos : []);
  const todos = mosaicosDelInicio();
  // Solo los que este usuario tiene habilitados (permisos), en el orden actual
  const visibles = todos
    .filter((el) => !el.classList.contains("hidden"))
    .sort((x, y) => {
      const ix = orden.indexOf(x.id), iy = orden.indexOf(y.id);
      return (ix >= 0 ? ix : 1000 + todos.indexOf(x)) - (iy >= 0 ? iy : 1000 + todos.indexOf(y));
    });
  const restoIds = todos.filter((el) => el.classList.contains("hidden")).map((el) => el.id);
  const guardarOrden = (ids) => {
    const aj = leerAjustes();
    aj.mosaicos = { orden: ids.concat(restoIds), ocultos: [...ocultos] };
    guardarAjustes(aj);
    aplicarMosaicos();
    renderMosaicosAjustes();
  };
  const flecha = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const ojo = (tachado) => `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>${tachado ? '<path d="M3 3l18 18"/>' : ""}</svg>`;
  cont.innerHTML = "";
  visibles.forEach((el, i) => {
    const fila = document.createElement("div");
    const oculto = ocultos.has(el.id);
    fila.className = "mosaico-fila" + (oculto ? " oculto" : "");
    const badge = el.querySelector(".panel-tile-icon-badge");
    const etiqueta = (el.querySelector(".panel-tile-label")?.textContent || el.id).trim();
    const cls = [...el.classList].find((c) => c.startsWith("tile-")) || "";
    fila.innerHTML = `
      <span class="${cls}">${badge ? badge.outerHTML : ""}</span>
      <span class="mosaico-nombre">${escapeHtml(etiqueta)}</span>
      <button type="button" class="mosaico-btn" data-acc="subir" title="Subir" aria-label="Subir" ${i === 0 ? "disabled" : ""}>${flecha("M6 15l6-6 6 6")}</button>
      <button type="button" class="mosaico-btn" data-acc="bajar" title="Bajar" aria-label="Bajar" ${i === visibles.length - 1 ? "disabled" : ""}>${flecha("M6 9l6 6 6-6")}</button>
      <button type="button" class="mosaico-btn" data-acc="ojo" title="${oculto ? "Mostrar" : "Ocultar"}" aria-label="${oculto ? "Mostrar" : "Ocultar"}">${ojo(oculto)}</button>`;
    fila.querySelector('[data-acc="subir"]').addEventListener("click", () => {
      const ids = visibles.map((x) => x.id); [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; guardarOrden(ids);
    });
    fila.querySelector('[data-acc="bajar"]').addEventListener("click", () => {
      const ids = visibles.map((x) => x.id); [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; guardarOrden(ids);
    });
    fila.querySelector('[data-acc="ojo"]').addEventListener("click", () => {
      if (ocultos.has(el.id)) ocultos.delete(el.id); else ocultos.add(el.id);
      guardarOrden(visibles.map((x) => x.id));
    });
    cont.appendChild(fila);
  });
}

// Grupos de botones tipo "chips" genéricos (mapa, cierre de sesión)
const GRUPOS_CHIPS = [
  { sel: "#ajusteEstiloInicio", attr: "estilo", clave: "estiloInicio", num: false },
  { sel: "#ajusteMapas", attr: "mapa", clave: "appMapas", num: false },
  { sel: "#ajusteCierre", attr: "cierre", clave: "cierreInactividad", num: true },
];
function renderGruposChips() {
  const aj = leerAjustes();
  GRUPOS_CHIPS.forEach((g) => {
    document.querySelectorAll(`${g.sel} .ajuste-tema-chip`).forEach((chip) => {
      const v = g.num ? Number(chip.dataset[g.attr]) : chip.dataset[g.attr];
      chip.classList.toggle("active", v === aj[g.clave]);
    });
  });
}
GRUPOS_CHIPS.forEach((g) => {
  document.querySelectorAll(`${g.sel} .ajuste-tema-chip`).forEach((chip) => {
    chip.addEventListener("click", () => {
      const aj = leerAjustes();
      aj[g.clave] = g.num ? Number(chip.dataset[g.attr]) : chip.dataset[g.attr];
      guardarAjustes(aj);
      renderGruposChips();
      aplicarEstiloInicio();
    });
  });
});
function aplicarEstiloInicio() {
  document.documentElement.setAttribute("data-inicio", leerAjustes().estiloInicio === "nuevo" ? "nuevo" : "clasico");
}

// Restablecer todo
document.getElementById("restablecerAjustesBtn").addEventListener("click", () => {
  if (!confirm("¿Restablecer todos los ajustes (apariencia, tamaño, sonidos, avisos, mosaicos del inicio) a los valores de fábrica?")) return;
  try { localStorage.removeItem("ajustes_app"); } catch (e) {}
  aplicarTema(); aplicarTamano(); aplicarBotonesGrandes(); aplicarEstiloInicio(); aplicarMosaicos();
  actualizarWakeLockPantalla();
  renderAjustes();
  showToast("Ajustes restablecidos.");
});

// ----- Seguridad: huella al abrir + cierre por inactividad -----
const bloqueoOverlay = document.getElementById("bloqueoOverlay");
const bloqueoDesbloquearBtn = document.getElementById("bloqueoDesbloquearBtn");
const bloqueoSalirBtn = document.getElementById("bloqueoSalirBtn");
const bloqueoError = document.getElementById("bloqueoError");
const huellaCache = {};
async function tecnicoTieneHuella(nombre) {
  if (!nombre || nombre === "__general__") return false;
  if (huellaCache[nombre] !== undefined) return huellaCache[nombre];
  try {
    if (!window.SimpleWebAuthnBrowser || !window.SimpleWebAuthnBrowser.browserSupportsWebAuthn()) return false;
    const res = await fetch("/api/datos?coleccion=tecnicos", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ accion: "webauthn_tiene_credencial", nombre }),
    });
    const data = await res.json();
    huellaCache[nombre] = !!data.tiene;
  } catch (e) {
    return false; // sin conexión: no se bloquea (para no dejar afuera a nadie)
  }
  return huellaCache[nombre];
}
async function bloquearSiCorresponde() {
  if (!tecnicoLogueado || !leerAjustes().bloqueoHuella) return;
  if (!bloqueoOverlay.classList.contains("hidden")) return;
  if (!(await tecnicoTieneHuella(tecnicoLogueado))) return;
  bloqueoError.textContent = "";
  bloqueoOverlay.classList.remove("hidden");
  desbloquearConHuella(true);
}
async function desbloquearConHuella(silencioso) {
  const nombre = tecnicoLogueado;
  if (!nombre) return;
  bloqueoDesbloquearBtn.disabled = true;
  bloqueoError.textContent = "";
  try {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const resOpc = await fetch("/api/datos?coleccion=tecnicos", { method: "POST", headers, body: JSON.stringify({ accion: "webauthn_login_opciones", nombre }) });
    const opciones = await resOpc.json();
    if (!resOpc.ok || opciones.error) throw new Error(opciones.error || "No se pudo iniciar");
    const respuesta = await window.SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: opciones });
    const resVer = await fetch("/api/datos?coleccion=tecnicos", { method: "POST", headers, body: JSON.stringify({ accion: "webauthn_login_verificar", nombre, respuesta }) });
    const dataVer = await resVer.json();
    if (!resVer.ok || !dataVer.ok) throw new Error(dataVer.error || "No se pudo verificar");
    if (dataVer.sesion) guardarPaseApi(dataVer.sesion);
    bloqueoOverlay.classList.add("hidden");
  } catch (err) {
    if (!silencioso && err.name !== "NotAllowedError") bloqueoError.textContent = "No se pudo desbloquear. Probá de nuevo.";
  } finally {
    bloqueoDesbloquearBtn.disabled = false;
  }
}
bloqueoDesbloquearBtn.addEventListener("click", () => desbloquearConHuella(false));
bloqueoSalirBtn.addEventListener("click", () => {
  bloqueoOverlay.classList.add("hidden");
  cerrarSesionBtn.click();
});

let ultimaActividad = Date.now();
let ultimoOculto = 0;
["click", "touchstart", "keydown"].forEach((ev) => document.addEventListener(ev, () => { ultimaActividad = Date.now(); }, true));
function revisarCierreInactividad() {
  const min = Number(leerAjustes().cierreInactividad) || 0;
  if (!min || !tecnicoLogueado) return;
  if (Date.now() - ultimaActividad < min * 60000) return;
  if (PANTALLAS_DE_TRABAJO.includes(pantallaActivaNombre())) return; // no corta una carga a medias
  bloqueoOverlay.classList.add("hidden");
  cerrarSesionBtn.click();
  showToast("Cerraste sesión por inactividad.");
}
setInterval(revisarCierreInactividad, 60000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    ultimoOculto = Date.now();
  } else {
    revisarCierreInactividad();
    if (tecnicoLogueado && ultimoOculto && Date.now() - ultimoOculto > 2 * 60 * 1000) bloquearSiCorresponde();
    // La pantalla encendida se pierde al ocultar la app: se vuelve a pedir
    actualizarWakeLockPantalla();
  }
});

// ---------- Recordatorio "cliente en TEST" (al llegar y al cerrar) ----------
// 1) Al acercarse (por GPS, con la app abierta) a un servicio que tiene
//    asignado HOY en el cronograma: "PONER EL CLIENTE EN TEST".
// 2) Al cerrar el parte: "QUITAR EL CLIENTE DE TEST Y NOTIFICAR CAMBIOS".
//    Queda pendiente (en el celular) hasta que el técnico toque "Listo",
//    así que si lo posterga o cierra la app, vuelve a aparecer al entrar.
const TEST_RADIO_METROS = 200;
const TEST_SNOOZE_MS = 10 * 60 * 1000;
const recordatorioTestOverlay = document.getElementById("recordatorioTestOverlay");
const recordatorioTestEyebrow = document.getElementById("recordatorioTestEyebrow");
const recordatorioTestTitulo = document.getElementById("recordatorioTestTitulo");
const recordatorioTestCliente = document.getElementById("recordatorioTestCliente");
const recordatorioTestDetalle = document.getElementById("recordatorioTestDetalle");
const recordatorioTestOkBtn = document.getElementById("recordatorioTestOkBtn");
const recordatorioTestLuegoBtn = document.getElementById("recordatorioTestLuegoBtn");

let colaCartelesTest = [];
let cartelTestActual = null;
let testGeoObjetivos = []; // [{key, cliente, lat, lon}]
let testGeoWatchId = null;
let testGeoSnoozeHasta = {}; // key -> timestamp
let testGeoGeneracion = 0;
let testGeoTimerRefresco = null;

function fechaHoyLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function lsGetJSON(clave, defecto) {
  try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : defecto; } catch (e) { return defecto; }
}
function lsSetJSON(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) {}
}

function encolarCartelTest(cartel) {
  if (cartelTestActual && cartelTestActual.key === cartel.key && cartelTestActual.tipo === cartel.tipo) return;
  if (colaCartelesTest.some((c) => c.key === cartel.key && c.tipo === cartel.tipo)) return;
  colaCartelesTest.push(cartel);
  if (!cartelTestActual) mostrarSiguienteCartelTest();
}
function mostrarSiguienteCartelTest() {
  cartelTestActual = colaCartelesTest.shift() || null;
  if (!cartelTestActual) {
    recordatorioTestOverlay.classList.add("hidden");
    return;
  }
  const c = cartelTestActual;
  if (c.tipo === "poner") {
    recordatorioTestEyebrow.innerHTML = tituloAvisoHtml("pin", "LLEGASTE AL SERVICIO");
    recordatorioTestTitulo.textContent = "PONER EL CLIENTE EN TEST";
    recordatorioTestDetalle.textContent = "Antes de empezar, poné la cuenta en test.";
    recordatorioTestOkBtn.innerHTML = tituloAvisoHtml("check", "Ya lo puse en test");
  } else {
    recordatorioTestEyebrow.innerHTML = tituloAvisoHtml("check", "SERVICIO CERRADO");
    recordatorioTestTitulo.textContent = "QUITAR EL CLIENTE DE TEST Y NOTIFICAR CAMBIOS";
    recordatorioTestDetalle.textContent = "No te vayas sin sacarlo de test y avisar lo que modificaste.";
    recordatorioTestOkBtn.innerHTML = tituloAvisoHtml("check", "Listo, ya lo hice");
  }
  recordatorioTestCliente.textContent = c.cliente || "";
  recordatorioTestOverlay.classList.remove("hidden");
  try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) {}
}
recordatorioTestOkBtn.addEventListener("click", () => {
  const c = cartelTestActual;
  if (c) {
    if (c.tipo === "poner") {
      const avisados = lsGetJSON("test_avisados", {});
      avisados[c.key] = true;
      lsSetJSON("test_avisados", avisados);
    } else {
      lsSetJSON("test_quitar_pendientes", lsGetJSON("test_quitar_pendientes", []).filter((p) => p.id !== c.key));
    }
  }
  mostrarSiguienteCartelTest();
});
recordatorioTestLuegoBtn.addEventListener("click", () => {
  const c = cartelTestActual;
  if (c && c.tipo === "poner") testGeoSnoozeHasta[c.key] = Date.now() + TEST_SNOOZE_MS;
  // "quitar" sigue guardado como pendiente: reaparece al volver a entrar a la app
  mostrarSiguienteCartelTest();
});

// --- Cartel 2: al cerrar el parte ---
function registrarTestPendienteDeQuitar(cliente) {
  if (!cliente || !tecnicoLogueado || !leerAjustes().avisoTestQuitar) return;
  const id = `${fechaHoyLocalISO()}|${normalizeText(cliente)}`;
  const lista = lsGetJSON("test_quitar_pendientes", []);
  if (!lista.some((p) => p.id === id)) {
    lista.push({ id, cliente, tecnico: tecnicoLogueado, fecha: fechaHoyLocalISO() });
    lsSetJSON("test_quitar_pendientes", lista.slice(-30));
  }
  encolarCartelTest({ tipo: "quitar", key: id, cliente });
}
// Al entrar a la app: lo que quedó sin confirmar (de hoy o de días anteriores)
function mostrarTestPendientesDeQuitar() {
  if (!leerAjustes().avisoTestQuitar) return;
  lsGetJSON("test_quitar_pendientes", [])
    .filter((p) => p.tecnico === tecnicoLogueado)
    .forEach((p) => encolarCartelTest({ tipo: "quitar", key: p.id, cliente: p.cliente }));
}

// --- Cartel 1: por geolocalización ---
function detenerRecordatorioTestGeo() {
  testGeoGeneracion++;
  if (testGeoWatchId != null && navigator.geolocation) navigator.geolocation.clearWatch(testGeoWatchId);
  testGeoWatchId = null;
  testGeoObjetivos = [];
  if (testGeoTimerRefresco) { clearTimeout(testGeoTimerRefresco); testGeoTimerRefresco = null; }
}

async function iniciarRecordatorioTestGeo() {
  detenerRecordatorioTestGeo();
  if (!tecnicoLogueado || !navigator.geolocation || !leerAjustes().avisoTestPoner) return;
  const miGeneracion = testGeoGeneracion;
  const hoy = fechaHoyLocalISO();
  const avisados = lsGetJSON("test_avisados", {});

  // Servicios de HOY asignados a este técnico, aún sin resolver
  const vistos = new Set();
  const candidatos = [];
  cronogramaCache
    .filter((t) => coincideNombreTecnico(t.tecnico, tecnicoLogueado) && t.fecha === hoy)
    .forEach((t) => {
      const info = infoTarea(t);
      const s = info.servicio;
      if (!s || !s.direccion) return;
      if (info.resuelto) return;
      const key = `${hoy}|${s.numero_servicio || normalizeText(s.cliente)}`;
      if (vistos.has(key) || avisados[key]) return;
      vistos.add(key);
      candidatos.push({ key, cliente: s.cliente, direccion: s.direccion, localidad: s.localidad || "" });
    });

  if (candidatos.length > 0) {
    // Geocodifica (puede venir "pendiente" la primera vez: se reintenta)
    let porGeocodificar = candidatos.slice(0, 12);
    for (let intento = 0; intento < 4 && porGeocodificar.length > 0; intento++) {
      try {
        const res = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
          body: JSON.stringify({ items: porGeocodificar.map((c, i) => ({ id: `t${i}`, direccion: c.direccion, localidad: c.localidad })) }),
        });
        const data = await res.json();
        if (miGeneracion !== testGeoGeneracion) return;
        const porId = {};
        (data.results || []).forEach((r) => { porId[r.id] = r; });
        const aunPendientes = [];
        porGeocodificar.forEach((c, i) => {
          const r = porId[`t${i}`];
          if (r && !r.error && !r.pendiente && typeof r.lat === "number") {
            testGeoObjetivos.push({ key: c.key, cliente: c.cliente, lat: r.lat, lon: r.lon });
          } else if (r && r.pendiente) {
            aunPendientes.push(c);
          }
        });
        porGeocodificar = aunPendientes;
      } catch (err) {
        break;
      }
      if (porGeocodificar.length > 0) await new Promise((ok) => setTimeout(ok, 5000));
      if (miGeneracion !== testGeoGeneracion) return;
    }
  }

  if (testGeoObjetivos.length > 0) {
    testGeoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!leerAjustes().avisoTestPoner) return;
        const ahora = Date.now();
        const avis = lsGetJSON("test_avisados", {});
        testGeoObjetivos.forEach((o) => {
          if (avis[o.key] || (testGeoSnoozeHasta[o.key] || 0) > ahora) return;
          const dist = distanciaMetros(pos.coords.latitude, pos.coords.longitude, o.lat, o.lon);
          // Si el GPS es poco preciso, se da un poco más de margen (hasta 100 m)
          if (dist <= TEST_RADIO_METROS + Math.min(pos.coords.accuracy || 0, 100)) {
            encolarCartelTest({ tipo: "poner", key: o.key, cliente: o.cliente });
          }
        });
      },
      () => {}, // sin permiso de ubicación: simplemente no se dispara este cartel
      { enableHighAccuracy: false, maximumAge: 20000, timeout: 30000 }
    );
  }

  // Refresca la lista cada 30 min (por si cambió la agenda o se resolvió algo)
  testGeoTimerRefresco = setTimeout(() => { if (tecnicoLogueado) iniciarRecordatorioTestGeo(); }, 30 * 60 * 1000);
}

// Íconos de línea para los títulos de los carteles de aviso (en vez de emojis)
const ICONOS_AVISO = {
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
  sim: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><rect x="9.5" y="12" width="5" height="5" rx="1"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
};
function tituloAvisoHtml(icono, texto) {
  const d = ICONOS_AVISO[icono] || "";
  return `<svg class="aviso-ico" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>${escapeHtml(texto)}`;
}

// ---------- Avisos al iniciar sesión (SIMs por aceptar / felicitación semanal) ----------
// Mismo formato que el cartel de notas sin leer. Se encolan para mostrar
// de a uno; se muestran por debajo del cartel de notas (z-index menor).
const avisoInicioOverlay = document.getElementById("avisoInicioOverlay");
const avisoInicioEyebrow = document.getElementById("avisoInicioEyebrow");
const avisoInicioTexto = document.getElementById("avisoInicioTexto");
const avisoInicioAccionBtn = document.getElementById("avisoInicioAccionBtn");
const avisoInicioCerrarBtn = document.getElementById("avisoInicioCerrarBtn");
let colaAvisosInicio = [];
let avisoInicioActual = null;

function encolarAvisoInicio(aviso) {
  colaAvisosInicio.push(aviso);
  if (!avisoInicioActual) mostrarSiguienteAvisoInicio();
}
function mostrarSiguienteAvisoInicio() {
  avisoInicioActual = colaAvisosInicio.shift() || null;
  if (!avisoInicioActual) {
    avisoInicioOverlay.classList.add("hidden");
    return;
  }
  avisoInicioEyebrow.innerHTML = tituloAvisoHtml(avisoInicioActual.icono, avisoInicioActual.eyebrow);
  avisoInicioTexto.textContent = avisoInicioActual.texto;
  avisoInicioAccionBtn.textContent = avisoInicioActual.accionTexto;
  avisoInicioCerrarBtn.textContent = avisoInicioActual.cerrarTexto || "Después";
  avisoInicioOverlay.classList.remove("hidden");
  if (typeof avisoInicioActual.sonido === "function") avisoInicioActual.sonido();
  if (typeof avisoInicioActual.efecto === "function") avisoInicioActual.efecto();
}
avisoInicioAccionBtn.addEventListener("click", () => {
  const a = avisoInicioActual;
  avisoInicioActual = null;
  avisoInicioOverlay.classList.add("hidden");
  if (a && a.accion) a.accion();
  mostrarSiguienteAvisoInicio();
});
avisoInicioCerrarBtn.addEventListener("click", () => {
  avisoInicioActual = null;
  mostrarSiguienteAvisoInicio();
});

async function prepararAvisoSimsPendientes() {
  if (!tecnicoLogueado || !leerAjustes().avisoSims) return;
  const tecnicoAlPedir = tecnicoLogueado;
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch(`/api/recurso-uso?recurso=sim&pendientes=1&tecnico=${encodeURIComponent(tecnicoAlPedir)}`, { headers, cache: "no-store" });
    if (!res.ok) return;
    const pendientes = await res.json();
    if (!Array.isArray(pendientes) || pendientes.length === 0) return;
    if (tecnicoAlPedir !== tecnicoLogueado) return; // cerró sesión / cambió de usuario mientras tanto
    const n = pendientes.length;
    const origenes = [...new Set(pendientes.map((t) => t.tecnico_origen).filter(Boolean))];
    encolarAvisoInicio({
      icono: "sim",
      eyebrow: "TENÉS SIMs POR ACEPTAR",
      texto: `Tenés ${n} SIM${n === 1 ? "" : "s"} pendiente${n === 1 ? "" : "s"} de aceptar o rechazar${origenes.length ? " (de " + origenes.join(", ") + ")" : ""}.`,
      accionTexto: "Revisar",
      accion: () => {
        showScreen("sims");
        renderSimsLista();
        cargarTransferenciasPendientes();
      },
    });
  } catch (err) {
    // silencioso — el aviso simplemente no aparece
  }
}

// Felicitación semanal: la misma que sale por push los viernes, pero
// mostrada en pantalla al entrar. Se calcula con el historial ya
// precargado (lunes a hoy), igual que el cron. Viernes desde las 15hs
// hasta el domingo (para quien no abrió la app el viernes). Una sola vez
// por semana y por técnico.
async function prepararFelicitacionSemanal() {
  if (!tecnicoLogueado || !leerAjustes().avisoFelicitacion) return;
  try {
    const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date());
    const p = {};
    partes.forEach((x) => { p[x.type] = x.value; });
    const dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
    const hora = Number(p.hour);
    if (dow < 5 || (dow === 5 && hora < 15)) return;
    const hoyStr = `${p.year}-${p.month}-${p.day}`;
    const d = new Date(`${hoyStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (dow - 1));
    const lunesStr = d.toISOString().slice(0, 10);
    const claveVisto = `felicitacion_vista_${tecnicoLogueado}_${lunesStr}`;
    try { if (localStorage.getItem(claveVisto)) return; } catch (e) {}

    // Respeta el interruptor de admin (felicitacion_semanal_activa)
    try {
      const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
      const r = await fetch("/api/datos?coleccion=config", { headers, cache: "no-store" });
      if (r.ok) {
        const cfg = await r.json();
        if (cfg && cfg.felicitacion_semanal_activa === false) return;
      }
    } catch (e) {}

    const conteos = {};
    (historialCache || []).forEach((h) => {
      if (!h.fecha || !h.tecnico) return;
      if (h.fecha < lunesStr || h.fecha > hoyStr) return;
      conteos[h.tecnico] = (conteos[h.tecnico] || 0) + 1;
    });
    const nombres = Object.keys(conteos);
    if (nombres.length === 0) return;
    const max = Math.max(...nombres.map((n) => conteos[n]));
    const ganadores = nombres.filter((n) => conteos[n] === max);
    const soyGanador = ganadores.includes(tecnicoLogueado);
    let texto;
    if (ganadores.length === 1) {
      texto = soyGanador
        ? `¡Felicitaciones! Fuiste quien más servicios resolvió esta semana (${max}). 🎉`
        : `${ganadores[0]} resolvió más servicios esta semana (${max}). ¡Felicitaciones! 🎉`;
    } else {
      texto = `¡Empate esta semana entre ${ganadores.join(" y ")}, con ${max} servicios cada uno! 🎉`;
    }
    try { localStorage.setItem(claveVisto, "1"); } catch (e) {}
    encolarAvisoInicio({ sonido: () => sonarVitoreo(), efecto: () => lanzarConfeti(), icono: "trophy", eyebrow: "MEJOR DESEMPEÑO DE LA SEMANA", texto, accionTexto: "¡Gracias!", cerrarTexto: "Cerrar" });
  } catch (err) {
    // silencioso
  }
}

// ---------- Rendir ticket (gastos de bolsillo del técnico) ----------
const tileRendicionBtn = document.getElementById("tileRendicionBtn");
const volverDeRendicionBtn = document.getElementById("volverDeRendicionBtn");
const rendCategoria = document.getElementById("rendCategoria");
const rendDetalle = document.getElementById("rendDetalle");
const rendCliente = document.getElementById("rendCliente");
const rendMonto = document.getElementById("rendMonto");
const rendFecha = document.getElementById("rendFecha");
const rendFotoInput = document.getElementById("rendFotoInput");
const rendFotoPreviewWrap = document.getElementById("rendFotoPreviewWrap");
const rendEnviarBtn = document.getElementById("rendEnviarBtn");
const rendMisStatus = document.getElementById("rendMisStatus");
const rendMisLista = document.getElementById("rendMisLista");

// Cada foto es { url } (ya subida) o { base64 } (sin señal: se sube después,
// desde la cola de envíos). Se manda como JSON en foto_ref.
let rendFotos = [];
let rendFormGeneracion = 0; // mismo truco que en Notas -- evita que una
// foto que sigue subiendo en segundo plano "resucite" en el siguiente envío.
let rendicionesCache = [];
const rendSinTicket = document.getElementById("rendSinTicket");
const rendSinTicketWrap = document.getElementById("rendSinTicketWrap");
const rendFotoLabel = document.getElementById("rendFotoLabel");
const rendResumen = document.getElementById("rendResumen");
const CATEGORIAS_SIN_TICKET = ["Estacionamiento", "Peaje"];

// Montos con la costumbre argentina: punto de miles, coma decimal ("18.500,50").
function parseMontoRendicion(texto) {
  const limpio = String(texto || "").replace(/[^\d,.]/g, "");
  if (!limpio) return NaN;
  return parseFloat(limpio.replace(/\./g, "").replace(",", "."));
}
function formatoPesos(n) {
  const num = Number(n);
  if (!isFinite(num)) return String(n ?? "");
  return "$" + num.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fotoRendicionObligatoria() {
  return !CATEGORIAS_SIN_TICKET.includes(rendCategoria.value) && !rendSinTicket.checked;
}
function actualizarAyudaFotoRendicion() {
  const exenta = CATEGORIAS_SIN_TICKET.includes(rendCategoria.value);
  rendSinTicketWrap.classList.toggle("hidden", exenta);
  rendFotoLabel.textContent = fotoRendicionObligatoria()
    ? "Foto del ticket (obligatoria — podés elegir varias o sacarlas con la cámara)"
    : "Foto del ticket (opcional)";
}
rendCategoria.addEventListener("change", actualizarAyudaFotoRendicion);
rendSinTicket.addEventListener("change", actualizarAyudaFotoRendicion);

rendMonto.addEventListener("blur", () => {
  const n = parseMontoRendicion(rendMonto.value);
  if (isFinite(n) && n > 0) rendMonto.value = n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
});

function limpiarFormularioRendicion() {
  rendFormGeneracion++;
  rendCategoria.value = "Materiales";
  rendDetalle.value = "";
  rendCliente.value = "";
  rendMonto.value = "";
  rendFecha.value = fechaLocalISO();
  rendFotos = [];
  rendFotoInput.value = "";
  rendSinTicket.checked = false;
  actualizarAyudaFotoRendicion();
  renderRendFotosPreview();
}

async function poblarClientesRendicion() {
  await cargarClientesGeneral();
  const lista = document.getElementById("rendClientesLista");
  if (!lista) return;
  const vistos = new Set();
  lista.innerHTML = (clientesGeneralCache || [])
    .filter((c) => c.nombre && !vistos.has(c.nombre) && vistos.add(c.nombre))
    .map((c) => `<option value="${escapeHtml(c.nombre)}"></option>`)
    .join("");
}

tileRendicionBtn.addEventListener("click", () => {
  limpiarFormularioRendicion();
  if (typeof actualizarAvisoCombustibleRendicion === "function") actualizarAvisoCombustibleRendicion();
  showScreen("rendicion");
  cargarMisRendiciones();
  poblarClientesRendicion();
});
volverDeRendicionBtn.addEventListener("click", () => showScreen("home"));

function renderRendFotosPreview() {
  if (rendFotos.length === 0) {
    rendFotoPreviewWrap.classList.add("hidden");
    rendFotoPreviewWrap.innerHTML = "";
    return;
  }
  rendFotoPreviewWrap.classList.remove("hidden");
  rendFotoPreviewWrap.innerHTML = rendFotos.map((f, idx) => `
    <div style="position:relative;">
      <img src="${escapeHtml(f.url || f.base64)}" style="width:70px; height:70px; object-fit:cover; border-radius:8px; display:block;">
      ${f.base64 ? '<span class="rend-foto-pend" title="Se sube sola cuando vuelva la señal">sin subir</span>' : ""}
      <button type="button" class="rend-foto-quitar" data-idx="${idx}" title="Quitar esta foto"
        style="position:absolute; top:-6px; right:-6px; background:#C0392B; color:#fff; border:none; border-radius:50%; width:20px; height:20px; cursor:pointer; font-size:13px; line-height:1;">×</button>
    </div>
  `).join("");
  rendFotoPreviewWrap.querySelectorAll(".rend-foto-quitar").forEach((btn) => {
    btn.addEventListener("click", () => {
      rendFotos.splice(Number(btn.dataset.idx), 1);
      renderRendFotosPreview();
    });
  });
}

async function subirFotoRendicion(base64) {
  const res = await fetch("/api/foto", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
    body: JSON.stringify({ base64 }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || "Error desconocido");
  return `${window.location.origin}/api/foto?id=${data.id}`;
}

// Sube todas las fotos elegidas (varias de galería de una, o de a una
// si se van sacando con la cámara) -- se pueden ir agregando en más
// de una tanda, no se pisan las que ya se subieron antes. Sin señal, la
// foto queda guardada en el celular y se sube junto con el envío.
rendFotoInput.addEventListener("change", async () => {
  const archivos = Array.from(rendFotoInput.files || []);
  if (archivos.length === 0) return;
  const generacionAlSubir = rendFormGeneracion;
  rendEnviarBtn.disabled = true;
  for (let i = 0; i < archivos.length; i++) {
    rendEnviarBtn.textContent = archivos.length > 1 ? `Subiendo foto ${i + 1} de ${archivos.length}...` : "Subiendo foto...";
    let base64 = null;
    try {
      base64 = await comprimirImagen(archivos[i], 1600, 0.75);
      const url = await subirFotoRendicion(base64);
      if (generacionAlSubir !== rendFormGeneracion) return;
      rendFotos.push({ url });
    } catch (err) {
      if (generacionAlSubir !== rendFormGeneracion) return;
      if (base64) {
        rendFotos.push({ base64: await comprimirImagen(archivos[i], 1200, 0.6).catch(() => base64) });
        showToast("Sin señal: la foto queda guardada y se sube sola después.");
      } else {
        showToast(`No se pudo leer una foto: ${err.message}`);
      }
    }
  }
  if (generacionAlSubir === rendFormGeneracion) {
    renderRendFotosPreview();
    rendFotoInput.value = "";
    rendEnviarBtn.disabled = false;
    rendEnviarBtn.textContent = "Enviar rendición";
  }
});

async function postRendicion(cuerpo) {
  const res = await fetch("/api/recurso-uso?recurso=rendicion", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
    body: JSON.stringify(cuerpo),
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* sin cuerpo */ }
  if (!res.ok || !data.ok) {
    const err = new Error(data.error || "Error desconocido");
    err.delServidor = res.status >= 400 && res.status < 500 && res.status !== 401;
    throw err;
  }
  return data;
}

// Para la cola sin conexión: sube las fotos que quedaron guardadas y manda la rendición.
async function intentarEnviarRendicionPendiente(item) {
  const urls = [];
  for (const f of item.fotos || []) {
    urls.push(f.url ? f.url : await subirFotoRendicion(f.base64));
  }
  const cuerpo = { ...item.cuerpo, foto_ref: urls.length ? JSON.stringify(urls) : "" };
  await postRendicion(cuerpo);
  return { oficinaOk: true };
}

rendEnviarBtn.addEventListener("click", async () => {
  const detalle = rendDetalle.value.trim();
  const monto = parseMontoRendicion(rendMonto.value);
  if (!detalle) {
    showToast("Contá qué compraste.");
    rendDetalle.focus();
    return;
  }
  if (!isFinite(monto) || monto <= 0) {
    showToast("Cargá un monto válido (mayor a cero).");
    rendMonto.focus();
    return;
  }
  if (fotoRendicionObligatoria() && rendFotos.length === 0) {
    showToast("Falta la foto del ticket. Si no te dieron, tildá \"No me dieron ticket\".");
    return;
  }
  const fecha = rendFecha.value || fechaLocalISO();
  const parecida = rendicionesCache.find((r) => r.estado !== "rechazado" && r.fecha === fecha && Math.abs(Number(r.monto) - monto) < 0.01);
  if (parecida && !confirm(`Ya mandaste una rendición de ${formatoPesos(monto)} con fecha ${fecha.split("-").reverse().join("/")} (${parecida.categoria || ""}). ¿Es otra distinta y querés mandarla igual?`)) {
    return;
  }
  const cuerpo = {
    accion: "crear",
    tecnico: tecnicoLogueado || "",
    categoria: rendCategoria.value,
    detalle: rendSinTicket.checked && !CATEGORIAS_SIN_TICKET.includes(rendCategoria.value) ? detalle + " (sin ticket)" : detalle,
    cliente: rendCliente.value.trim(),
    monto: String(monto),
    fecha,
  };
  rendEnviarBtn.disabled = true;
  try {
    if (rendFotos.some((f) => f.base64)) throw Object.assign(new Error("fotos sin subir"), { sinSenal: true });
    await postRendicion({ ...cuerpo, foto_ref: rendFotos.length > 0 ? JSON.stringify(rendFotos.map((f) => f.url)) : "" });
    showToast("Rendición enviada.");
    limpiarFormularioRendicion();
    cargarMisRendiciones();
  } catch (err) {
    if (err.delServidor) {
      showToast("No se pudo enviar: " + err.message);
    } else {
      // Sin señal (o el servidor no respondió): queda en la cola y se manda sola.
      try {
        agregarAColaEnvios({ tipo: "rendicion", cuerpo, fotos: rendFotos.slice() });
        showToast("Sin señal: la rendición quedó guardada y se manda sola cuando vuelva la conexión.");
        limpiarFormularioRendicion();
      } catch (errCola) {
        showToast("No se pudo guardar en el celular (poco espacio). Probá de nuevo con señal.");
      }
    }
  } finally {
    rendEnviarBtn.disabled = false;
    rendEnviarBtn.textContent = "Enviar rendición";
  }
});

async function cargarMisRendiciones() {
  rendMisStatus.textContent = "Cargando...";
  rendMisLista.innerHTML = "";
  try {
    const res = await fetch("/api/recurso-uso?recurso=rendicion", {
      headers: { Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    rendicionesCache = (Array.isArray(data) ? data : []).filter((r) => r.tecnico === tecnicoLogueado);
    renderMisRendiciones();
  } catch (err) {
    rendMisStatus.textContent = "No se pudo cargar: " + err.message;
  }
}

// El foto_ref de una rendición puede ser una URL sola (formato viejo)
// o una lista en JSON (varias fotos) -- esto entiende los dos casos.
function fotosDeRendicion(r) {
  if (!r.foto_ref) return [];
  try {
    const parseado = JSON.parse(r.foto_ref);
    return Array.isArray(parseado) ? parseado : [r.foto_ref];
  } catch (err) {
    return [r.foto_ref];
  }
}

function renderMisRendiciones() {
  if (rendicionesCache.length === 0) {
    rendMisStatus.textContent = "Todavía no rendiste ningún ticket.";
    rendMisLista.innerHTML = "";
    rendResumen.classList.add("hidden");
    return;
  }
  rendMisStatus.textContent = `${rendicionesCache.length} rendición(es).`;
  const pendientes = rendicionesCache.filter((r) => r.estado === "pendiente");
  const deuda = pendientes.reduce((t, r) => t + (Number(r.monto) || 0), 0);
  const enCola = obtenerColaEnvios().filter((i) => i.tipo === "rendicion" && i.cuerpo && i.cuerpo.tecnico === tecnicoLogueado).length;
  rendResumen.classList.toggle("hidden", !(pendientes.length || enCola));
  rendResumen.innerHTML = `${pendientes.length ? `Te deben <b>${formatoPesos(deuda)}</b> · ${pendientes.length} pendiente${pendientes.length === 1 ? "" : "s"}` : ""}${enCola ? `${pendientes.length ? "<br>" : ""}${enCola} sin enviar todavía (sin señal)` : ""}`;
  const etiquetaEstado = { pendiente: "🟠 Pendiente", pagado: "✅ Pagado", rechazado: "❌ Rechazado" };
  const ordenadas = [...rendicionesCache].sort((a, b) => (b.creado_en || "").localeCompare(a.creado_en || ""));
  rendMisLista.innerHTML = ordenadas.map((r) => {
    let fechaTexto = r.fecha || "";
    if (r.fecha) {
      const [y, m, d] = r.fecha.split("-");
      fechaTexto = `${d}/${m}/${y}`;
    }
    const fotos = fotosDeRendicion(r);
    const fotosTexto = fotos.length === 1
      ? ` · <a href="${escapeHtml(fotos[0])}" target="_blank" rel="noopener">Ver foto</a>`
      : fotos.length > 1
        ? ` · ${fotos.map((f, i) => `<a href="${escapeHtml(f)}" target="_blank" rel="noopener">Foto ${i + 1}</a>`).join(" ")}`
        : "";
    return `
      <div class="historial-card rend-card" data-estado="${escapeHtml(r.estado || "")}">
        <div class="historial-card-num">${escapeHtml(r.categoria || "")} — <span class="rend-monto">${escapeHtml(formatoPesos(r.monto))}</span></div>
        <div class="historial-card-cliente">${escapeHtml(r.detalle || "")}</div>
        <div class="historial-card-direccion">${escapeHtml(fechaTexto)}${r.cliente ? " — " + escapeHtml(r.cliente) : ""}</div>
        <div class="historial-card-badges">${etiquetaEstado[r.estado] || escapeHtml(r.estado || "")}${fotosTexto}</div>
        ${r.estado === "rechazado" && r.observaciones_admin ? `<div class="rend-motivo">Motivo: ${escapeHtml(r.observaciones_admin)}</div>` : ""}
      </div>
    `;
  }).join("");
}

// ---------- Seguimiento en vivo (avisarle al próximo cliente que el
// técnico va en camino, con un link de mapa) ----------
// Cuando se cierra un parte con éxito, se busca en el cronograma cuál
// es la siguiente tarea de HOY para este mismo técnico, después de la
// que se acaba de cerrar. Si esa tarea está vinculada a un servicio
// real (con cliente/dirección), se crea un "seguimiento": un link
// público (sin login) que muestra un mapa con la posición aproximada
// del técnico, actualizada mientras tenga la app abierta.
let seguimientoActivoId = localStorage.getItem("seguimiento_activo_id") || null;
let seguimientoWatchId = null;
let seguimientoUltimoEnvio = 0;

const seguimientoDoneWrap = document.getElementById("seguimientoDoneWrap");
const seguimientoProximoNombre = document.getElementById("seguimientoProximoNombre");
const seguimientoYaAvisadoMail = document.getElementById("seguimientoYaAvisadoMail");
const seguimientoYaAvisadoMailDireccion = document.getElementById("seguimientoYaAvisadoMailDireccion");
const seguimientoSinMailWrap = document.getElementById("seguimientoSinMailWrap");
const seguimientoEmailInput = document.getElementById("seguimientoEmailInput");
const seguimientoMandarMailBtn = document.getElementById("seguimientoMandarMailBtn");
const seguimientoWhatsappBtn = document.getElementById("seguimientoWhatsappBtn");
const seguimientoHomeBanner = document.getElementById("seguimientoHomeBanner");
const seguimientoHomeNombre = document.getElementById("seguimientoHomeNombre");
const seguimientoLlegueBtn = document.getElementById("seguimientoLlegueBtn");
const seguimientoCancelarBtn = document.getElementById("seguimientoCancelarBtn");

// Busca, dentro del cronograma de HOY para este técnico, la primera
// tarea vinculada a un servicio real que venga DESPUÉS (por horario)
// de la que se acaba de cerrar.
// Mismo criterio tolerante que ya usa encontrarServicioPorTarea para
// nombres de cliente — acá para nombres de técnico. Hace falta
// porque el cronograma puede tener el nombre completo con segundo
// nombre ("Marcos Manuel Pellegrini") mientras que el login usa uno
// más corto ("Marcos Pellegrini") — un "===" exacto nunca matcheaba.
function coincideNombreTecnico(nombreCronograma, nombreLogueado) {
  if (!nombreCronograma || !nombreLogueado) return false;
  const palabrasCortas = normalizeText(nombreLogueado).split(/\s+/).filter((p) => p.length > 1);
  const normLargo = normalizeText(nombreCronograma);
  return palabrasCortas.length > 0 && palabrasCortas.every((palabra) => normLargo.includes(palabra));
}

function encontrarProximaTareaCronograma(numeroServicioActual) {
  if (!numeroServicioActual) return null;
  // Fecha local (no toISOString, que es UTC y puede dar el día
  // siguiente durante la noche en Argentina, UTC-3).
  const ahora = new Date();
  const fechaHoyISO = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
  const tareasHoy = cronogramaCache
    .filter((t) => coincideNombreTecnico(t.tecnico, tecnicoLogueado) && t.fecha === fechaHoyISO)
    .sort((a, b) => (a.hora_inicio || "").localeCompare(b.hora_inicio || ""));

  const indiceActual = tareasHoy.findIndex((t) => {
    const s = encontrarServicioPorTarea(t.tarea);
    return s && s.numero_servicio === numeroServicioActual;
  });
  if (indiceActual === -1) return null;

  for (let i = indiceActual + 1; i < tareasHoy.length; i++) {
    const servicio = encontrarServicioPorTarea(tareasHoy[i].tarea);
    if (servicio) return { servicio, hora_inicio: tareasHoy[i].hora_inicio || "" };
  }
  return null;
}

async function iniciarSeguimientoSiCorresponde(dataParteRecienEnviado) {
  try {
    if (seguimientoActivoId) {
      // Puede que el anterior ya haya terminado (llegó, venció, o se
      // canceló) sin que este celular se haya enterado — antes de
      // asumir que sigue bloqueando, se chequea el estado real contra
      // el servidor. Sin esto, un solo "Llegué" olvidado dejaba sin
      // avisar a TODOS los clientes siguientes del día.
      try {
        const resCheck = await fetch(`/api/recurso-uso?recurso=seguimiento&id=${encodeURIComponent(seguimientoActivoId)}`, { cache: "no-store" });
        const dataCheck = await resCheck.json();
        if (dataCheck.estado && dataCheck.estado !== "en_camino") {
          detenerSeguimientoActivo();
        } else {
          return; // sigue realmente activo, no se pisa
        }
      } catch (errCheck) {
        return; // si no se puede confirmar el estado, mejor no arriesgarse a pisarlo
      }
    }
    const resultadoProximo = encontrarProximaTareaCronograma(dataParteRecienEnviado.numero_servicio);
    if (!resultadoProximo) return;
    const proximo = resultadoProximo.servicio;

    // Alerta de atraso a la oficina — si ya pasaron 20+ minutos desde
    // la hora prevista para el próximo turno, se avisa (no al
    // cliente, a la oficina, para que sepa que el día se está
    // atrasando sin tener que ir chequeando el cronograma a mano).
    // Fire-and-forget: no bloquea nada de lo que sigue.
    if (resultadoProximo.hora_inicio) {
      const [hIni, mIni] = resultadoProximo.hora_inicio.split(":").map(Number);
      if (!isNaN(hIni) && !isNaN(mIni)) {
        const ahoraDate = new Date();
        const atrasoMin = (ahoraDate.getHours() * 60 + ahoraDate.getMinutes()) - (hIni * 60 + mIni);
        if (atrasoMin >= 20) {
          fetch("/api/recurso-uso?recurso=seguimiento", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
            body: JSON.stringify({
              accion: "avisar_atraso",
              tecnico: tecnicoLogueado || "",
              cliente_proximo: proximo.cliente || "",
              hora_prevista: resultadoProximo.hora_inicio,
              atraso_minutos: atrasoMin,
            }),
          }).catch(() => {});
        }
      }
    }

    // Se pide la lista de clientes FRESCA (no la cacheada del login)
    // — el mail puede haberse guardado recién, en este mismo turno
    // del técnico o en el de otro, y clientesGeneralCache solo se
    // carga una vez por sesión.
    let clienteInfo = null;
    if (proximo.numero_cliente) {
      try {
        const resClientes = await fetch("/api/datos?coleccion=clientes", {
          headers: { Authorization: "Bearer " + SERVICIOS_API_TOKEN },
          cache: "no-store",
        });
        const clientesFrescos = await resClientes.json();
        clienteInfo = (Array.isArray(clientesFrescos) ? clientesFrescos : []).find((c) => c.numero_cliente === proximo.numero_cliente) || null;
      } catch (errClientes) {
        // si falla, se sigue sin el mail — el técnico lo puede cargar a mano
      }
    }

    // Geocodificación best-effort — si falla, el seguimiento se crea
    // igual, solo que el mapa del cliente no va a tener el pin de
    // "destino" hasta que haya una primera posición del técnico.
    let latDestino = null;
    let lngDestino = null;
    try {
      const geoRes = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
        body: JSON.stringify({ items: [{ id: "destino", direccion: proximo.direccion, localidad: proximo.localidad || "" }] }),
      });
      const geoData = await geoRes.json();
      const encontrado = (geoData.results || []).find((r) => r.id === "destino");
      if (encontrado && !encontrado.error && !encontrado.pendiente) {
        latDestino = encontrado.lat;
        lngDestino = encontrado.lon;
      }
    } catch (errGeo) {
      // sin geocodificación, se sigue igual
    }

    const emailDestino = (clienteInfo && clienteInfo.email) || "";
    const res = await fetch("/api/recurso-uso?recurso=seguimiento", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        accion: "crear",
        tecnico: tecnicoLogueado || "",
        numero_servicio_origen: dataParteRecienEnviado.numero_servicio || "",
        numero_servicio_destino: proximo.numero_servicio || "",
        numero_cliente_destino: proximo.numero_cliente || "",
        cliente_destino: proximo.cliente || "",
        direccion_destino: proximo.direccion || "",
        lat_destino: latDestino,
        lng_destino: lngDestino,
        cliente_email: emailDestino,
        origen: window.location.origin,
        horas_vencimiento: 2,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return;

    seguimientoActivoId = data.id;
    localStorage.setItem("seguimiento_activo_id", data.id);
    localStorage.setItem("seguimiento_activo_cliente", proximo.cliente || "");
    localStorage.setItem("seguimiento_activo_telefono", (clienteInfo && clienteInfo.telefono) || "");

    iniciarWatcherUbicacion();
    mostrarSeguimientoEnPantallas(proximo.cliente, (clienteInfo && clienteInfo.telefono) || "", emailDestino);
  } catch (err) {
    // el seguimiento es un extra — si algo falla acá, nunca debe
    // afectar al envío del parte en sí, que ya terminó bien
    console.error("No se pudo iniciar el seguimiento:", err);
  }
}

function mostrarSeguimientoEnPantallas(nombreCliente, telefono, email) {
  seguimientoProximoNombre.textContent = nombreCliente || "el próximo cliente";
  seguimientoDoneWrap.classList.remove("hidden");
  seguimientoDoneWrap.dataset.telefono = telefono || "";

  // Si ya teníamos el mail cargado, el aviso automático ya salió —
  // se muestra el cartel de confirmación en vez del campo para
  // cargarlo (evita que el técnico lo mande de nuevo sin necesidad).
  if (email) {
    seguimientoYaAvisadoMailDireccion.textContent = email;
    seguimientoYaAvisadoMail.classList.remove("hidden");
    seguimientoSinMailWrap.classList.add("hidden");
  } else {
    seguimientoYaAvisadoMail.classList.add("hidden");
    seguimientoSinMailWrap.classList.remove("hidden");
    seguimientoEmailInput.value = "";
  }

  seguimientoHomeNombre.textContent = nombreCliente || "";
  seguimientoHomeBanner.classList.remove("hidden");
}

seguimientoMandarMailBtn.addEventListener("click", async () => {
  const email = seguimientoEmailInput.value.trim();
  if (!email) {
    showToast("Escribí el mail del cliente primero.");
    return;
  }
  if (!seguimientoActivoId) {
    showToast("No hay ningún seguimiento activo para mandar.");
    return;
  }
  seguimientoMandarMailBtn.disabled = true;
  try {
    const res = await fetch("/api/recurso-uso?recurso=seguimiento", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        accion: "reenviar_mail",
        id: seguimientoActivoId,
        cliente_email: email,
        origen: window.location.origin,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast("Mail enviado.");
    seguimientoYaAvisadoMailDireccion.textContent = email;
    seguimientoYaAvisadoMail.classList.remove("hidden");
    seguimientoSinMailWrap.classList.add("hidden");
  } catch (err) {
    showToast("No se pudo mandar el mail: " + err.message);
  } finally {
    seguimientoMandarMailBtn.disabled = false;
  }
});

seguimientoWhatsappBtn.addEventListener("click", () => {
  if (!seguimientoActivoId) return;
  const link = `${window.location.origin}/seguimiento.html?id=${seguimientoActivoId}`;
  const telefono = seguimientoDoneWrap.dataset.telefono || localStorage.getItem("seguimiento_activo_telefono") || "";
  const numeroWa = limpiarTelefonoWhatsapp(telefono);
  const mensaje = `Hola! Soy de Servicio Técnico SAT, voy en camino. Podés seguir mi recorrido acá: ${link}`;
  const url = numeroWa ? `https://wa.me/${numeroWa}?text=${encodeURIComponent(mensaje)}` : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
  window.open(url, "_blank");
});

// Wake Lock — evita que la pantalla se apague sola mientras el
// seguimiento está activo (la causa más común de que se corte el
// envío de ubicación: no es que se cierre la app, es que se apaga la
// pantalla por inactividad mientras el técnico maneja). No es
// rastreo en segundo plano real — si el técnico abre otra app o
// bloquea el celular a mano, se sigue cortando igual — pero cubre el
// caso más frecuente. Soportado en Android y en iPhones más nuevos;
// donde no está soportado, simplemente no hace nada (no rompe nada).
let seguimientoWakeLock = null;

async function solicitarWakeLockSeguimiento() {
  if (!("wakeLock" in navigator)) return;
  try {
    seguimientoWakeLock = await navigator.wakeLock.request("screen");
    seguimientoWakeLock.addEventListener("release", () => { seguimientoWakeLock = null; });
  } catch (err) {
    // puede fallar por batería baja o por decisión del navegador —
    // no es crítico, el resto del seguimiento sigue funcionando igual
    seguimientoWakeLock = null;
  }
}

function liberarWakeLockSeguimiento() {
  if (seguimientoWakeLock) {
    seguimientoWakeLock.release().catch(() => {});
    seguimientoWakeLock = null;
  }
}

// El wake lock se suelta solo apenas la pestaña deja de estar visible
// (por ejemplo, el técnico mira otra app un segundo) — hay que
// pedirlo de nuevo cuando vuelve a estar visible, si el seguimiento
// sigue activo.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && seguimientoActivoId && !seguimientoWakeLock) {
    solicitarWakeLockSeguimiento();
  }
});

function iniciarWatcherUbicacion() {
  solicitarWakeLockSeguimiento();
  if (!navigator.geolocation || seguimientoWatchId != null) return;
  seguimientoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const ahora = Date.now();
      if (ahora - seguimientoUltimoEnvio < 20000) return; // como mucho cada 20s, para no gastar de más
      seguimientoUltimoEnvio = ahora;
      fetch("/api/recurso-uso?recurso=seguimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
        body: JSON.stringify({
          accion: "actualizar_ubicacion",
          id: seguimientoActivoId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: pos.coords.accuracy,
        }),
      }).catch(() => {});
    },
    () => {}, // si falla la ubicación, simplemente no se manda esa actualización
    { enableHighAccuracy: false, maximumAge: 15000, timeout: 20000 }
  );
}

function detenerSeguimientoActivo() {
  if (seguimientoWatchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(seguimientoWatchId);
    seguimientoWatchId = null;
  }
  liberarWakeLockSeguimiento();
  seguimientoActivoId = null;
  localStorage.removeItem("seguimiento_activo_id");
  localStorage.removeItem("seguimiento_activo_cliente");
  localStorage.removeItem("seguimiento_activo_telefono");
  seguimientoDoneWrap.classList.add("hidden");
  seguimientoHomeBanner.classList.add("hidden");
}

seguimientoLlegueBtn.addEventListener("click", async () => {
  if (!seguimientoActivoId) { detenerSeguimientoActivo(); return; }
  seguimientoLlegueBtn.disabled = true;
  try {
    await fetch("/api/recurso-uso?recurso=seguimiento", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ accion: "llegue", id: seguimientoActivoId }),
    });
  } catch (err) {
    // aunque falle el aviso, se corta igual del lado del técnico
  } finally {
    detenerSeguimientoActivo();
    seguimientoLlegueBtn.disabled = false;
  }
});

seguimientoCancelarBtn.addEventListener("click", async () => {
  if (!seguimientoActivoId) { detenerSeguimientoActivo(); return; }
  const confirmar = confirm("¿Cancelar el seguimiento? El cliente va a dejar de ver tu ubicación.");
  if (!confirmar) return;
  seguimientoCancelarBtn.disabled = true;
  try {
    await fetch("/api/recurso-uso?recurso=seguimiento", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ accion: "cancelar", id: seguimientoActivoId }),
    });
  } catch (err) {
    // aunque falle el aviso, se corta igual del lado del técnico
  } finally {
    detenerSeguimientoActivo();
    seguimientoCancelarBtn.disabled = false;
  }
});

// Si quedó un seguimiento activo de antes de recargar la página (se
// cerró/reabrió la app a mitad de un viaje), se retoma solo.
if (seguimientoActivoId) {
  const clienteGuardado = localStorage.getItem("seguimiento_activo_cliente") || "";
  seguimientoHomeNombre.textContent = clienteGuardado;
  seguimientoHomeBanner.classList.remove("hidden");
  iniciarWatcherUbicacion();
}

// ---------- Presencia en obra (llegada/salida) ----------

let presenciaHistorialCache = [];
let presenciaPeriodoActivo = "semana";
let presenciaClienteEncontrado = null;

volverDePresenciaBtn.addEventListener("click", () => showScreen("home"));
refreshPresenciaBtn.addEventListener("click", fetchHistorialPresencia);

function poblarDatalistClientesPresencia() {
  const datalist = document.getElementById("presenciaClientesLista");
  datalist.innerHTML = (clientesGeneralCache || [])
    .filter((c) => c.nombre)
    .map((c) => `<option value="${c.nombre.replace(/"/g, "&quot;")}"></option>`)
    .join("");
}

presenciaClienteInput.addEventListener("input", () => {
  presenciaClienteEncontrado = buscarClientePorNombre(presenciaClienteInput.value.trim());
  if (presenciaClienteEncontrado) {
    presenciaDireccionInput.value = presenciaClienteEncontrado.direccion || "";
    presenciaClienteEncontradoInfo.textContent = "✓ Cliente encontrado en la base.";
    presenciaClienteEncontradoInfo.className = "hint-text hint-ok";
  } else {
    presenciaDireccionInput.value = "";
    presenciaClienteEncontradoInfo.textContent = presenciaClienteInput.value.trim() ? "Cliente nuevo — no está en la base, se guarda tal cual se escribió." : "";
    presenciaClienteEncontradoInfo.className = "hint-text";
  }
});

async function actualizarEstadoPresencia() {
  presenciaEstadoTexto.textContent = "Consultando...";
  presenciaLlegadaWrap.classList.add("hidden");
  presenciaSalidaWrap.classList.add("hidden");
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/recurso-uso?recurso=presencia&tecnico=" + encodeURIComponent(tecnicoLogueado || ""), { headers, cache: "no-store" });
    const data = await res.json();
    if (data.activa && data.activa.instalacion_id) {
      // La entrada abierta pertenece a una instalación de varios días
      // — se marca desde esa pantalla, no desde acá, para no
      // confundir con dos lugares distintos haciendo lo mismo.
      presenciaEstadoTexto.className = "status ok";
      presenciaEstadoTexto.textContent = `📍 Tenés una instalación abierta en ${data.activa.cliente} — marcá tu entrada/salida desde Instalador → Instalación.`;
    } else if (data.activa) {
      presenciaEstadoTexto.className = "status ok";
      presenciaEstadoTexto.textContent = `📍 Estás en obra en ${data.activa.cliente}, desde las ${data.activa.hora_llegada}.`;
      presenciaSalidaWrap.classList.remove("hidden");
    } else {
      presenciaEstadoTexto.className = "status";
      presenciaEstadoTexto.textContent = "No tenés ninguna llegada marcada ahora.";
      presenciaClienteInput.value = "";
      presenciaDireccionInput.value = "";
      presenciaClienteEncontradoInfo.textContent = "";
      presenciaLlegadaWrap.classList.remove("hidden");
    }
  } catch (err) {
    presenciaEstadoTexto.textContent = "No se pudo consultar el estado.";
  }
}

// Devuelve {lat, lng, precision} o null si no hay permiso/no se
// puede — nunca bloquea el marcado de llegada/salida por esto, es
// un dato adicional, no un requisito.
function obtenerUbicacionActual() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

presenciaMarcarLlegadaBtn.addEventListener("click", async () => {
  const textoEscrito = presenciaClienteInput.value.trim();
  if (!textoEscrito) {
    showToast("Escribí el cliente/obra antes de marcar la llegada.");
    return;
  }
  const cliente = presenciaClienteEncontrado ? presenciaClienteEncontrado.nombre : textoEscrito;
  presenciaMarcarLlegadaBtn.disabled = true;
  presenciaMarcarLlegadaBtn.textContent = "Ubicando...";
  try {
    const ubicacion = await obtenerUbicacionActual();
    presenciaMarcarLlegadaBtn.textContent = "📍 Marcar llegada";
    const ahora = new Date();
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        recurso: "presencia", accion: "llegada", tecnico: tecnicoLogueado, cliente,
        direccion: presenciaDireccionInput.value.trim(),
        numero_cliente: presenciaClienteEncontrado ? presenciaClienteEncontrado.numero_cliente || "" : "",
        fecha: fechaLocalISO(ahora),
        hora: ahora.toTimeString().slice(0, 5),
        lat: ubicacion?.lat, lng: ubicacion?.lng, precision: ubicacion?.precision,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast(ubicacion ? `Llegada marcada en ${cliente}, con ubicación.` : `Llegada marcada en ${cliente} (sin ubicación — revisá el permiso de GPS).`);
    actualizarEstadoPresencia();
    fetchHistorialPresencia();
  } catch (err) {
    showToast("No se pudo marcar: " + err.message);
  } finally {
    presenciaMarcarLlegadaBtn.disabled = false;
    presenciaMarcarLlegadaBtn.textContent = "📍 Marcar llegada";
  }
});

presenciaMarcarSalidaBtn.addEventListener("click", async () => {
  presenciaMarcarSalidaBtn.disabled = true;
  presenciaMarcarSalidaBtn.textContent = "Ubicando...";
  try {
    const ubicacion = await obtenerUbicacionActual();
    presenciaMarcarSalidaBtn.textContent = "📍 Marcar salida";
    const ahora = new Date();
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        recurso: "presencia", accion: "salida", tecnico: tecnicoLogueado,
        fecha: fechaLocalISO(ahora), hora: ahora.toTimeString().slice(0, 5),
        lat: ubicacion?.lat, lng: ubicacion?.lng, precision: ubicacion?.precision,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast("Salida marcada.");
    actualizarEstadoPresencia();
    fetchHistorialPresencia();
  } catch (err) {
    showToast("No se pudo marcar: " + err.message);
  } finally {
    presenciaMarcarSalidaBtn.disabled = false;
    presenciaMarcarSalidaBtn.textContent = "📍 Marcar salida";
  }
});

document.querySelectorAll(".presencia-periodo-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".presencia-periodo-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    presenciaPeriodoActivo = chip.dataset.periodo;
    presenciaFechaEspecificaWrap.classList.toggle("hidden", presenciaPeriodoActivo !== "fecha");
    if (presenciaPeriodoActivo === "fecha" && !presenciaFechaEspecifica.value) {
      presenciaFechaEspecifica.value = fechaLocalISO();
    }
    renderHistorialPresencia();
  });
});
presenciaFechaEspecifica.addEventListener("change", renderHistorialPresencia);

async function fetchHistorialPresencia() {
  presenciaHistorialStatus.textContent = "Cargando...";
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/recurso-uso?recurso=presencia&historial=1", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    presenciaHistorialCache = Array.isArray(data) ? data : [];
    presenciaSyncLabel.textContent = formatSyncTime(new Date());
    renderHistorialPresencia();
  } catch (err) {
    presenciaHistorialStatus.textContent = "No se pudo cargar el historial.";
  }
}

function renderHistorialPresencia() {
  const veTodo = permisosDelTecnico(tecnicoLogueado).historial_todos;
  const rango = obtenerRangoPeriodo(presenciaPeriodoActivo, presenciaFechaEspecifica);
  let filtrados = presenciaHistorialCache.filter((p) => fechaEnRango(p.fecha_llegada, rango));
  if (!veTodo) filtrados = filtrados.filter((p) => p.tecnico === tecnicoLogueado);
  filtrados.sort((a, b) => {
    const claveA = `${a.fecha_llegada} ${a.hora_llegada || ""}`;
    const claveB = `${b.fecha_llegada} ${b.hora_llegada || ""}`;
    return claveB.localeCompare(claveA);
  });

  presenciaHistorialList.innerHTML = "";
  if (filtrados.length === 0) {
    presenciaHistorialStatus.textContent = "No hay presencias registradas en ese período.";
    return;
  }
  presenciaHistorialStatus.textContent = `${filtrados.length} presencia(s).`;
  filtrados.forEach((p) => {
    const [y, m, d] = p.fecha_llegada.split("-");
    const fechaTexto = `${d}/${m}/${y}`;
    const sigueEnObra = !p.hora_salida;
    const card = document.createElement("div");
    card.className = "historial-card" + (sigueEnObra ? " historial-card-en-obra" : "");
    card.innerHTML = `
      <div class="historial-card-num">${escapeHtml(p.tecnico)}${p.numero_cliente ? " · Cliente " + escapeHtml(p.numero_cliente) : ""}</div>
      <div class="historial-card-cliente">${escapeHtml(p.cliente)}</div>
      <div class="historial-card-direccion">${escapeHtml(p.direccion || "")}</div>
      <div class="historial-card-horario">
        ${fechaTexto} — Llegó ${p.hora_llegada}${sigueEnObra ? " — <b>sigue en obra</b>" : ` — Salió ${p.hora_salida}`}
      </div>
    `;
    presenciaHistorialList.appendChild(card);
  });
}

// ---------- Instalación (zonas, canales, fotos — de varios días) ----------
let instalacionActivaId = null;
let instalacionActivaEstado = null; // 'abierta' | 'cerrada'
let instZonasAgregadas = [];
let instCanalesAgregadas = [];
const instalacionActivaBtn = document.getElementById("instMarcarLlegadaBtn");
const instalacionSalidaBtn = document.getElementById("instMarcarSalidaBtn");
const instDiaLlegadaWrap = document.getElementById("instDiaLlegadaWrap");
const instDiaSalidaWrap = document.getElementById("instDiaSalidaWrap");
const instDiasList = document.getElementById("instDiasList");
const instalacionAbiertaWrap = document.getElementById("instalacionAbiertaWrap");
const instalacionCerrarBtn = document.getElementById("instalacionCerrarBtn");
const instalacionGuardarYCerrarBtn = document.getElementById("instalacionGuardarYCerrarBtn");

volverDeInstalacionBtn.addEventListener("click", () => showScreen("home"));

function resetearPantallaInstalacion() {
  instalacionActivaId = null;
  try { instDetalleCargado = false; } catch (e) { /* aún no cargó */ }
  instalacionActivaEstado = null;
  instZonasAgregadas = [];
  instCanalesAgregadas = [];
  instalacionClienteInput.value = "";
  instalacionDireccionInput.value = "";
  instalacionClienteEmailInput.value = "";
  instObservacionesInput.value = "";
  instalacionClienteCard.classList.remove("hidden");
  instalacionesAbiertasParaSumarseWrap.classList.add("hidden");
  instalacionAbiertaWrap.classList.add("hidden");
  instalacionDetalleWrap.classList.add("hidden");
  renderInstZonas();
  renderInstCanales();
  instFotosGrid.innerHTML = "";
  instFotosStatus.textContent = "";
  ["instZonasEstado", "instCanalesEstado", "instDiasResumen"].forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = ""; });
}

// Al entrar a la pantalla, se fija primero si ya hay una instalación
// abierta sin cerrar para este técnico — si la hay, la retoma
// directo (con sus días ya marcados), en vez de arrancar siempre de
// cero como si no existiera.
async function poblarClientesInstalacion() {
  await cargarClientesGeneral();
  const lista = document.getElementById("instClientesLista");
  if (!lista) return;
  const vistos = new Set();
  lista.innerHTML = (clientesGeneralCache || [])
    .filter((c) => c.nombre && !vistos.has(c.nombre) && vistos.add(c.nombre))
    .map((c) => `<option value="${escapeHtml(c.nombre)}"></option>`).join("");
}
instalacionClienteInput.addEventListener("input", () => {
  const c = buscarClientePorNombre(instalacionClienteInput.value.trim());
  if (!c) return;
  if (c.direccion && !instalacionDireccionInput.value.trim()) instalacionDireccionInput.value = [c.direccion, c.localidad].filter(Boolean).join(", ");
  const mail = c.email || c.mail || c.cliente_email;
  if (mail && !instalacionClienteEmailInput.value.trim()) instalacionClienteEmailInput.value = mail;
});

async function verificarInstalacionAbierta() {
  resetearPantallaInstalacion();
  poblarClientesInstalacion();
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };

    // 1) ¿Tengo una instalación que YO abrí, todavía sin cerrar?
    const res = await fetch("/api/historial?tipo=instalacion_abierta&tecnico=" + encodeURIComponent(tecnicoLogueado || ""), { headers, cache: "no-store" });
    const data = await res.json();
    if (data.abierta) {
      mostrarInstalacionAbierta(data.abierta);
      return;
    }

    // 2) ¿Estoy marcado presente ahora mismo en la instalación de OTRO
    // técnico? (me sumé como ayudante)
    const resActiva = await fetch("/api/recurso-uso?recurso=presencia&tecnico=" + encodeURIComponent(tecnicoLogueado || ""), { headers, cache: "no-store" });
    const dataActiva = await resActiva.json();
    if (dataActiva.activa && dataActiva.activa.instalacion_id) {
      const resInst = await fetch("/api/historial?tipo=instalacion&id=" + dataActiva.activa.instalacion_id, { headers, cache: "no-store" });
      const inst = await resInst.json();
      if (inst && !inst.error) {
        mostrarInstalacionAbierta(inst);
        return;
      }
    }

    // 3) No tengo ninguna propia — ver si hay instalaciones abiertas
    // de otros técnicos, por si soy el ayudante de alguna.
    await mostrarInstalacionesParaSumarse();
  } catch (err) {
    // si falla la consulta, se deja la pantalla de "abrir nueva" —
    // no bloquea nada, el técnico puede seguir usándola normal
  }
}

function mostrarInstalacionAbierta(inst) {
  instalacionActivaId = inst.id;
  instalacionActivaEstado = "abierta";
  instalacionClienteInput.value = inst.cliente; // lo necesita el botón de marcar entrada
  instalacionDireccionInput.value = inst.direccion || "";
  instalacionActivaTexto.textContent = `Instalación abierta: ${inst.cliente}`;
  instalacionClienteCard.classList.add("hidden");
  instalacionesAbiertasParaSumarseWrap.classList.add("hidden");
  instalacionAbiertaWrap.classList.remove("hidden");
  instalacionDetalleWrap.classList.remove("hidden");
  actualizarEstadoDiaInstalacion();
  cargarDetalleInstalacion();
}

// Trae lo que ya se guardó (zonas, canales, fotos) para seguir cargando
// sobre eso — antes, al volver a entrar, las listas aparecían vacías.
async function cargarDetalleInstalacion() {
  if (!instalacionActivaId) return;
  const id = instalacionActivaId;
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch(`/api/historial?tipo=instalacion&id=${id}`, { headers, cache: "no-store" });
    const inst = await res.json();
    if (!res.ok || id !== instalacionActivaId) return;
    // Se suman a lo que el técnico haya agregado mientras cargaba (sin duplicar).
    const unir = (servidor, locales) => {
      const lista = (servidor || []).map((z) => ({ numero: String(z.numero ?? ""), descripcion: z.descripcion || "" }));
      locales.forEach((z) => { if (!lista.some((x) => x.numero === z.numero && x.descripcion === z.descripcion)) lista.push(z); });
      return lista;
    };
    instZonasAgregadas = unir(inst.zonas, instZonasAgregadas);
    instCanalesAgregadas = unir(inst.canales, instCanalesAgregadas);
    instDetalleCargado = true;
    if (inst.observaciones && !instObservacionesInput.value) instObservacionesInput.value = inst.observaciones;
    renderInstZonas();
    renderInstCanales();
    pintarFotosInstalacion(inst.fotos || []);
    instZonaNumeroInput.value = ""; instCanalNumeroInput.value = "";
    prepararNumeroInst();
  } catch (err) {
    // sin señal: se sigue con lo que haya en pantalla
  }
}

// Autoguardado de zonas/canales (se manda la lista completa, como antes).
const instGuardadoTimers = {};
let instDetalleCargado = false; // hasta saber qué hay guardado, no se pisa nada en el servidor
function programarGuardadoItems(tipo) {
  const estado = document.getElementById(tipo === "zona" ? "instZonasEstado" : "instCanalesEstado");
  if (estado) estado.textContent = "Guardando…";
  clearTimeout(instGuardadoTimers[tipo]);
  instGuardadoTimers[tipo] = setTimeout(() => guardarItemsInstalacion(tipo), 700);
}
async function guardarItemsInstalacion(tipo) {
  if (!instalacionActivaId) return false;
  // Se manda la lista completa: si todavía no se leyó lo guardado (sin
  // señal al entrar), primero se lee y se une, para no borrar nada.
  if (!instDetalleCargado) {
    await cargarDetalleInstalacion();
    if (!instDetalleCargado) {
      const est = document.getElementById(tipo === "zona" ? "instZonasEstado" : "instCanalesEstado");
      if (est) est.textContent = "Sin señal: se guarda cuando vuelva la conexión.";
      return false;
    }
  }
  const items = tipo === "zona" ? instZonasAgregadas : instCanalesAgregadas;
  const estado = document.getElementById(tipo === "zona" ? "instZonasEstado" : "instCanalesEstado");
  try {
    const res = await fetch("/api/historial", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ accion: "guardar_items_instalacion", instalacion_id: instalacionActivaId, tipo, items }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || "Error desconocido");
    if (estado) estado.textContent = items.length ? `✓ Guardado (${items.length})` : "";
    return true;
  } catch (err) {
    if (estado) estado.textContent = "No se pudo guardar (¿sin señal?). Se reintenta al cerrar.";
    return false;
  }
}

async function mostrarInstalacionesParaSumarse() {
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/historial?tipo=instalaciones_abiertas", { headers, cache: "no-store" });
    const lista = await res.json();
    if (!Array.isArray(lista) || lista.length === 0) {
      instalacionesAbiertasParaSumarseWrap.classList.add("hidden");
      return;
    }
    instalacionesAbiertasParaSumarseWrap.classList.remove("hidden");
    instalacionesAbiertasParaSumarseList.innerHTML = lista.map((inst) => {
      const tecnicos = (inst.tecnicos_involucrados || []).join(", ") || inst.tecnico;
      return `
        <div class="card" style="margin-bottom:10px;">
          <b>${escapeHtml(inst.cliente)}</b><br>
          <span style="color:#6B7680; font-size:13px;">Con: ${escapeHtml(tecnicos)}</span><br>
          <button type="button" class="btn btn-secondary btn-small sumarme-btn" style="margin-top:8px;"
            data-id="${inst.id}" data-cliente="${escapeHtml(inst.cliente)}" data-direccion="${escapeHtml(inst.direccion || "")}">
            Sumarme (marcar mi entrada)
          </button>
        </div>
      `;
    }).join("");
    instalacionesAbiertasParaSumarseList.querySelectorAll(".sumarme-btn").forEach((btn) => {
      btn.addEventListener("click", () => sumarmeAInstalacion(btn.dataset.id, btn.dataset.cliente, btn.dataset.direccion));
    });
  } catch (err) {
    instalacionesAbiertasParaSumarseWrap.classList.add("hidden");
  }
}

async function sumarmeAInstalacion(id, cliente, direccion) {
  try {
    const ubicacion = await obtenerUbicacionActual();
    const ahora = new Date();
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        recurso: "presencia", accion: "llegada", tecnico: tecnicoLogueado, cliente, direccion,
        fecha: fechaLocalISO(ahora), hora: ahora.toTimeString().slice(0, 5),
        lat: ubicacion?.lat, lng: ubicacion?.lng, precision: ubicacion?.precision,
        instalacion_id: Number(id),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast(`Te sumaste a la instalación en ${cliente}.`);
    verificarInstalacionAbierta();
  } catch (err) {
    showToast("No se pudo sumar: " + err.message);
  }
}

instalacionIniciarBtn.addEventListener("click", async () => {
  const nombreInstalacion = instalacionClienteInput.value.trim();
  if (!nombreInstalacion) {
    showToast("Ponele un nombre a la instalación antes de abrirla.");
    return;
  }
  instalacionIniciarBtn.disabled = true;
  try {
    const ahora = new Date();
    const res = await fetch("/api/historial", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        accion: "crear_instalacion", tecnico: tecnicoLogueado, cliente: nombreInstalacion,
        direccion: instalacionDireccionInput.value.trim(),
        cliente_email: instalacionClienteEmailInput.value.trim(),
        fecha: fechaLocalISO(ahora), hora: ahora.toTimeString().slice(0, 5),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Error desconocido");
    instalacionActivaId = data.id;
    instalacionActivaEstado = "abierta";
    instalacionActivaTexto.textContent = `Instalación abierta: ${nombreInstalacion}`;
    instalacionClienteCard.classList.add("hidden");
    instalacionesAbiertasParaSumarseWrap.classList.add("hidden");
    instalacionAbiertaWrap.classList.remove("hidden");
    instalacionDetalleWrap.classList.remove("hidden");
    instDetalleCargado = true;
    instDiaLlegadaWrap.classList.remove("hidden");
    instDiaSalidaWrap.classList.add("hidden");
    renderInstDias([]);
  } catch (err) {
    showToast("No se pudo abrir: " + err.message);
  } finally {
    instalacionIniciarBtn.disabled = false;
  }
});

function minutosEntre(h1, h2) {
  const m = (h) => { const [hh, mm] = String(h || "").split(":").map(Number); return isFinite(hh) ? hh * 60 + (mm || 0) : null; };
  const a = m(h1), b = m(h2);
  if (a === null || b === null) return 0;
  return b >= a ? b - a : 0;
}
function textoHoras(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? " " + m + " min" : ""}` : `${m} min`;
}
// Días agrupados por fecha, con cada técnico y sus horas (antes cada
// marca contaba como un "día", y con un ayudante se duplicaban).
function renderInstDias(dias) {
  instDiasList.innerHTML = "";
  const resumen = document.getElementById("instDiasResumen");
  if (!dias || dias.length === 0) {
    instDiasList.innerHTML = "<p style='color:#6B7680; font-size:13px;'>Todavía no marcaste ningún día.</p>";
    if (resumen) resumen.textContent = "";
    return;
  }
  const porFecha = {};
  dias.forEach((d) => { (porFecha[d.fecha_llegada] = porFecha[d.fecha_llegada] || []).push(d); });
  const fechas = Object.keys(porFecha).sort();
  let totalMin = 0;
  fechas.forEach((fecha, idx) => {
    const [y, m, dd] = fecha.split("-");
    const enObra = porFecha[fecha].some((d) => !d.hora_salida);
    const card = document.createElement("div");
    card.className = "historial-card" + (enObra ? " historial-card-en-obra" : "");
    const lineas = porFecha[fecha].map((d) => {
      const min = d.hora_salida ? minutosEntre(d.hora_llegada, d.hora_salida) : 0;
      totalMin += min;
      return `<div class="historial-card-horario">${escapeHtml(d.tecnico || "")}: ${escapeHtml(d.hora_llegada || "")}${d.hora_salida ? ` a ${escapeHtml(d.hora_salida)} (${textoHoras(min)})` : " — <b>sigue en obra</b>"}</div>`;
    }).join("");
    card.innerHTML = `<div class="historial-card-num">Día ${idx + 1} — ${dd}/${m}/${y}</div>${lineas}`;
    instDiasList.appendChild(card);
  });
  if (resumen) resumen.textContent = `${fechas.length} día${fechas.length === 1 ? "" : "s"} de obra · ${textoHoras(totalMin)} de trabajo en total (sumando técnicos).`;
}

async function actualizarEstadoDiaInstalacion() {
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/recurso-uso?recurso=presencia&tecnico=" + encodeURIComponent(tecnicoLogueado || ""), { headers, cache: "no-store" });
    const data = await res.json();
    const enEstaInstalacion = data.activa && data.activa.instalacion_id === instalacionActivaId;
    instDiaLlegadaWrap.classList.toggle("hidden", !!enEstaInstalacion);
    instDiaSalidaWrap.classList.toggle("hidden", !enEstaInstalacion);
  } catch (err) {
    // si falla, se deja como estaba
  }

  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch(`/api/recurso-uso?recurso=presencia&presencias_de_instalacion=${instalacionActivaId}`, { headers, cache: "no-store" });
    const dias = await res.json();
    renderInstDias(Array.isArray(dias) ? dias : []);
  } catch (err) {
    // si falla, se deja la lista como estaba
  }
}

instalacionActivaBtn.addEventListener("click", async () => {
  const cliente = instalacionClienteInput.value.trim();
  instalacionActivaBtn.disabled = true;
  instalacionActivaBtn.textContent = "Ubicando...";
  try {
    const ubicacion = await obtenerUbicacionActual();
    instalacionActivaBtn.textContent = "📍 Marcar entrada de hoy";
    if (!ubicacion) {
      showToast("No se pudo obtener tu ubicación — activá el GPS/ubicación del celular e intentá de nuevo.");
      return;
    }
    const ahora = new Date();
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        recurso: "presencia", accion: "llegada", tecnico: tecnicoLogueado, cliente,
        direccion: instalacionDireccionInput.value.trim(),
        fecha: fechaLocalISO(ahora), hora: ahora.toTimeString().slice(0, 5),
        lat: ubicacion.lat, lng: ubicacion.lng, precision: ubicacion.precision,
        instalacion_id: instalacionActivaId,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast("Entrada marcada.");
    actualizarEstadoDiaInstalacion();
  } catch (err) {
    showToast("No se pudo marcar: " + err.message);
  } finally {
    instalacionActivaBtn.disabled = false;
    instalacionActivaBtn.textContent = "📍 Marcar entrada de hoy";
  }
});

instalacionSalidaBtn.addEventListener("click", async () => {
  instalacionSalidaBtn.disabled = true;
  instalacionSalidaBtn.textContent = "Ubicando...";
  try {
    const ubicacion = await obtenerUbicacionActual();
    instalacionSalidaBtn.textContent = "📍 Marcar salida de hoy";
    if (!ubicacion) {
      showToast("No se pudo obtener tu ubicación — activá el GPS/ubicación del celular e intentá de nuevo.");
      return;
    }
    const ahora = new Date();
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        recurso: "presencia", accion: "salida", tecnico: tecnicoLogueado,
        fecha: fechaLocalISO(ahora), hora: ahora.toTimeString().slice(0, 5),
        lat: ubicacion.lat, lng: ubicacion.lng, precision: ubicacion.precision,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast("Salida marcada.");
    actualizarEstadoDiaInstalacion();
  } catch (err) {
    showToast("No se pudo marcar: " + err.message);
  } finally {
    instalacionSalidaBtn.disabled = false;
    instalacionSalidaBtn.textContent = "📍 Marcar salida de hoy";
  }
});

instalacionCerrarBtn.addEventListener("click", () => {
  instalacionAbiertaWrap.classList.add("hidden");
  instalacionDetalleWrap.classList.remove("hidden");
});

function renderInstZonas() {
  instZonasList.innerHTML = "";
  instZonasAgregadas.forEach((z, idx) => {
    const fila = document.createElement("div");
    fila.className = "material-agregado-item";
    fila.innerHTML = `<span>Zona ${escapeHtml(z.numero)} — ${escapeHtml(z.descripcion)}</span><button type="button" class="quitar" title="Quitar">✕</button>`;
    fila.querySelector(".quitar").addEventListener("click", () => { instZonasAgregadas.splice(idx, 1); renderInstZonas(); programarGuardadoItems("zona"); });
    instZonasList.appendChild(fila);
  });
}
agregarZonaBtn.addEventListener("click", () => {
  const numero = instZonaNumeroInput.value.trim();
  const descripcion = instZonaDescripcionInput.value.trim();
  if (!numero) { showToast("Escribí el número de zona."); return; }
  instZonasAgregadas.push({ numero, descripcion });
  renderInstZonas();
  programarGuardadoItems("zona");
  instZonaNumeroInput.value = siguienteNumeroInst(instZonasAgregadas);
  instZonaDescripcionInput.value = "";
});
guardarZonasBtn.addEventListener("click", async () => {
  if (!instalacionActivaId) return;
  guardarZonasBtn.disabled = true;
  try {
    const res = await fetch("/api/historial", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ accion: "guardar_items_instalacion", instalacion_id: instalacionActivaId, tipo: "zona", items: instZonasAgregadas }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Error desconocido");
    showToast(`${instZonasAgregadas.length} zona(s) guardada(s).`);
  } catch (err) {
    showToast("No se pudo guardar: " + err.message);
  } finally {
    guardarZonasBtn.disabled = false;
  }
});

function renderInstCanales() {
  instCanalesList.innerHTML = "";
  instCanalesAgregadas.forEach((z, idx) => {
    const fila = document.createElement("div");
    fila.className = "material-agregado-item";
    fila.innerHTML = `<span>Canal ${escapeHtml(z.numero)} — ${escapeHtml(z.descripcion)}</span><button type="button" class="quitar" title="Quitar">✕</button>`;
    fila.querySelector(".quitar").addEventListener("click", () => { instCanalesAgregadas.splice(idx, 1); renderInstCanales(); programarGuardadoItems("canal"); });
    instCanalesList.appendChild(fila);
  });
}
agregarCanalBtn.addEventListener("click", () => {
  const numero = instCanalNumeroInput.value.trim();
  const descripcion = instCanalDescripcionInput.value.trim();
  if (!numero) { showToast("Escribí el número de canal."); return; }
  instCanalesAgregadas.push({ numero, descripcion });
  renderInstCanales();
  programarGuardadoItems("canal");
  instCanalNumeroInput.value = siguienteNumeroInst(instCanalesAgregadas);
  instCanalDescripcionInput.value = "";
});
// Atajos de zonas y canales: el tipo completa la descripción (después se le
// agrega dónde va, ej. "PIR living") y el número siguiente se pone solo.
function siguienteNumeroInst(lista) {
  const nums = lista.map((z) => parseInt(z.numero, 10)).filter((n) => isFinite(n));
  return String(nums.length ? Math.max(...nums) + 1 : 1);
}
function prepararNumeroInst() {
  if (!instZonaNumeroInput.value.trim()) instZonaNumeroInput.value = siguienteNumeroInst(instZonasAgregadas);
  if (!instCanalNumeroInput.value.trim()) instCanalNumeroInput.value = siguienteNumeroInst(instCanalesAgregadas);
}
[["instZonaAtajos", () => instZonaNumeroInput, () => instZonaDescripcionInput, () => instZonasAgregadas],
 ["instCanalAtajos", () => instCanalNumeroInput, () => instCanalDescripcionInput, () => instCanalesAgregadas]].forEach(([id, num, desc, lista]) => {
  const cont = document.getElementById(id);
  if (!cont) return;
  cont.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    if (!num().value.trim()) num().value = siguienteNumeroInst(lista());
    desc().value = b.dataset.txt + " ";
    desc().focus();
    try { desc().setSelectionRange(desc().value.length, desc().value.length); } catch (e) { /* nada */ }
  }));
});
instZonaDescripcionInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); agregarZonaBtn.click(); } });
instCanalDescripcionInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); agregarCanalBtn.click(); } });

guardarCanalesBtn.addEventListener("click", async () => {
  if (!instalacionActivaId) return;
  guardarCanalesBtn.disabled = true;
  try {
    const res = await fetch("/api/historial", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ accion: "guardar_items_instalacion", instalacion_id: instalacionActivaId, tipo: "canal", items: instCanalesAgregadas }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Error desconocido");
    showToast(`${instCanalesAgregadas.length} canal(es) guardado(s).`);
  } catch (err) {
    showToast("No se pudo guardar: " + err.message);
  } finally {
    guardarCanalesBtn.disabled = false;
  }
});

function leerArchivoComoBase64Instalacion(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function pintarFotosInstalacion(fotos) {
  const id = instalacionActivaId;
  instFotosGrid.innerHTML = "";
  fotos.forEach((nombre) => {
    const item = document.createElement("div");
    item.className = "instalacion-foto-item";
    item.innerHTML = `
      <img src="/api/historial?tipo=foto-instalacion&id=${id}&nombre=${encodeURIComponent(nombre)}" loading="lazy" alt="Foto de la instalación">
      <button type="button" class="instalacion-foto-borrar" title="Borrar">✕</button>
    `;
    item.querySelector("button").addEventListener("click", async () => {
      if (!confirm("¿Borrar esta foto de la instalación?")) return;
      try {
        const res = await fetch("/api/historial", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
          body: JSON.stringify({ accion: "borrar_foto_instalacion", instalacion_id: id, nombre }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        renderInstFotos();
      } catch (err) {
        showToast("No se pudo borrar la foto.");
      }
    });
    instFotosGrid.appendChild(item);
  });
  instFotosStatus.textContent = fotos.length ? `${fotos.length} foto${fotos.length === 1 ? "" : "s"} guardada${fotos.length === 1 ? "" : "s"}.` : "";
}

async function renderInstFotos() {
  if (!instalacionActivaId) return;
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch(`/api/historial?tipo=instalacion&id=${instalacionActivaId}`, { headers, cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return;
    pintarFotosInstalacion(data.fotos || []);
  } catch (err) {
    // si falla, se deja la grilla como estaba
  }
}

// Las fotos se achican antes de subirlas (una foto de celular pesa varios
// MB y el servidor rechaza envíos de más de ~4 MB: antes fallaban sin avisar).
instFotoInput.addEventListener("change", async () => {
  if (!instalacionActivaId) return;
  const archivos = Array.from(instFotoInput.files || []);
  if (archivos.length === 0) return;
  let fallidas = 0;
  for (let i = 0; i < archivos.length; i++) {
    instFotosStatus.textContent = `Subiendo foto ${i + 1} de ${archivos.length}...`;
    try {
      const base64 = await comprimirImagen(archivos[i], 1600, 0.75);
      const res = await fetch("/api/historial", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
        body: JSON.stringify({ accion: "subir_foto_instalacion", instalacion_id: instalacionActivaId, nombre_archivo: `foto-${Date.now()}-${i}.jpg`, base64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || "HTTP " + res.status);
    } catch (err) {
      fallidas++;
    }
  }
  if (fallidas) showToast(fallidas === archivos.length ? "No se pudieron subir las fotos. Revisá la señal e intentá de nuevo." : `${fallidas} foto(s) no se pudieron subir. Probá de nuevo con esas.`);
  instFotoInput.value = "";
  renderInstFotos();
});

instalacionGuardarYCerrarBtn.addEventListener("click", async () => {
  if (!instalacionActivaId) return;
  instalacionGuardarYCerrarBtn.disabled = true;
  instalacionGuardarYCerrarBtn.textContent = "Guardando...";
  try {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    clearTimeout(instGuardadoTimers.zona);
    clearTimeout(instGuardadoTimers.canal);
    if (!(await guardarItemsInstalacion("zona")) || !(await guardarItemsInstalacion("canal"))) {
      throw new Error("no se pudieron guardar las zonas o los canales (¿sin señal?)");
    }
    const res = await fetch("/api/historial", { method: "POST", headers, body: JSON.stringify({ accion: "cerrar_instalacion", instalacion_id: instalacionActivaId, observaciones: instObservacionesInput.value.trim() }) });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      // Si el motivo es que falta marcar una salida, se manda de
      // vuelta a esa pantalla para que la marque — sin perder nada
      // de lo que ya cargó acá (zonas, canales, fotos y
      // observaciones quedan tal cual, para retomar el cierre
      // después sin tener que volver a escribir todo).
      if (data.error && data.error.includes("sin salida")) {
        showToast(data.error);
        instalacionAbiertaWrap.classList.remove("hidden");
        instalacionAbiertaWrap.scrollIntoView({ behavior: "smooth", block: "start" });
        actualizarEstadoDiaInstalacion();
        return;
      }
      throw new Error(data.error || "No se pudo cerrar");
    }
    showToast("Instalación cerrada correctamente.");
    resetearPantallaInstalacion();
    showScreen("home");
  } catch (err) {
    showToast("No se pudo cerrar: " + err.message);
  } finally {
    instalacionGuardarYCerrarBtn.disabled = false;
    instalacionGuardarYCerrarBtn.textContent = "✔ Guardar y cerrar instalación";
  }
});

// ---------- Credencial digital del técnico ----------
const webauthnEstadoTexto = document.getElementById("webauthnEstadoTexto");
const activarHuellaBtn = document.getElementById("activarHuellaBtn");

tileCredencialBtn.addEventListener("click", () => {
  showScreen("credencial");
  fetchYRenderCredencial();
  actualizarEstadoWebauthn();
});

async function actualizarEstadoWebauthn() {
  if (!window.SimpleWebAuthnBrowser || !window.SimpleWebAuthnBrowser.browserSupportsWebAuthn()) {
    webauthnEstadoTexto.textContent = "Este celular/navegador no admite huella o Face ID para apps web.";
    activarHuellaBtn.classList.add("hidden");
    return;
  }
  webauthnEstadoTexto.textContent = "Consultando...";
  try {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=tecnicos", {
      method: "POST", headers,
      body: JSON.stringify({ accion: "webauthn_tiene_credencial", nombre: tecnicoLogueado }),
    });
    const data = await res.json();
    if (data.tiene) {
      webauthnEstadoTexto.className = "status ok";
      webauthnEstadoTexto.textContent = "✓ Ya está activada en este celular.";
      activarHuellaBtn.textContent = "👆 Activar en otro celular / volver a activar acá";
    } else {
      webauthnEstadoTexto.className = "status";
      webauthnEstadoTexto.textContent = "Todavía no la activaste en ningún celular.";
      activarHuellaBtn.textContent = "👆 Activar huella / Face ID en este celular";
    }
  } catch (err) {
    webauthnEstadoTexto.textContent = "";
  }
}

activarHuellaBtn.addEventListener("click", async () => {
  activarHuellaBtn.disabled = true;
  webauthnEstadoTexto.className = "status";
  webauthnEstadoTexto.textContent = "Activando...";
  try {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const resOpc = await fetch("/api/datos?coleccion=tecnicos", {
      method: "POST", headers,
      body: JSON.stringify({ accion: "webauthn_registro_opciones", nombre: tecnicoLogueado }),
    });
    const opciones = await resOpc.json();
    if (!resOpc.ok || opciones.error) throw new Error(opciones.error || "No se pudo iniciar");

    const respuesta = await window.SimpleWebAuthnBrowser.startRegistration({ optionsJSON: opciones });

    const nombreDispositivo = /iPhone|iPad/.test(navigator.userAgent) ? "iPhone/iPad"
      : /Android/.test(navigator.userAgent) ? "Celular Android"
      : "Este dispositivo";
    const resVer = await fetch("/api/datos?coleccion=tecnicos", {
      method: "POST", headers,
      body: JSON.stringify({ accion: "webauthn_registro_verificar", nombre: tecnicoLogueado, respuesta, nombre_dispositivo: nombreDispositivo }),
    });
    const dataVer = await resVer.json();
    if (!resVer.ok || !dataVer.ok) throw new Error(dataVer.error || "No se pudo activar");

    showToast("¡Listo! Ya podés entrar con huella o Face ID la próxima vez.");
    actualizarEstadoWebauthn();
  } catch (err) {
    if (err.name !== "NotAllowedError") {
      showToast("No se pudo activar: " + err.message);
    }
  } finally {
    activarHuellaBtn.disabled = false;
  }
});

function salirDeCredencialPantallaCompleta() {
  credencialCardWrap.classList.remove("pantalla-completa");
  credencialFullscreenBackdrop.classList.add("hidden");
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function alternarCredencialPantallaCompleta() {
  const activo = credencialCardWrap.classList.toggle("pantalla-completa");
  credencialFullscreenBackdrop.classList.toggle("hidden", !activo);
  if (activo) {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } else {
    salirDeCredencialPantallaCompleta();
  }
}
credencialCardWrap.addEventListener("click", alternarCredencialPantallaCompleta);
credencialFullscreenBackdrop.addEventListener("click", alternarCredencialPantallaCompleta);
// Si el técnico sale de pantalla completa con el botón atrás del
// sistema (en vez de tocar la credencial de nuevo), se mantiene todo
// sincronizado igual.
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) {
    credencialCardWrap.classList.remove("pantalla-completa");
    credencialFullscreenBackdrop.classList.add("hidden");
  }
});

volverDeCredencialBtn.addEventListener("click", () => {
  salirDeCredencialPantallaCompleta();
  showScreen("home");
});

// Se fija si el técnico logueado tiene una credencial cargada, para
// mostrar u ocultar el botón en el panel principal (los que todavía no
// tienen una cargada, o el login general de oficina, no lo ven).
async function actualizarAccesoCredencial() {
  if (!tecnicoLogueado) {
    tileCredencialBtn.classList.add("hidden");
    return;
  }
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=credenciales", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const tieneCredencial = (Array.isArray(data) ? data : []).some((c) => c.nombre === tecnicoLogueado);
    tileCredencialBtn.classList.toggle("hidden", !tieneCredencial);
  } catch (err) {
    tileCredencialBtn.classList.add("hidden");
  }
}

async function fetchYRenderCredencial() {
  salirDeCredencialPantallaCompleta();
  credencialStatus.textContent = "Cargando...";
  credencialCardWrap.classList.add("hidden");
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=credenciales", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const propia = (Array.isArray(data) ? data : []).find((c) => c.nombre === tecnicoLogueado);
    if (!propia) {
      credencialStatus.textContent = "No hay una credencial cargada para tu usuario todavía.";
      return;
    }
    credencialStatus.textContent = "";
    credencialFoto.src = propia.foto_base64 || "";
    credencialNombre.textContent = propia.nombre || "";
    credencialCargo.textContent = propia.cargo || "";
    credencialDni.textContent = propia.dni || "-";
    credencialTelefono.textContent = propia.telefono_contacto || "-";
    if (propia.vigencia) {
      const [y, m, d] = propia.vigencia.split("-");
      credencialVigencia.textContent = `${d}/${m}/${y}`;
    } else {
      credencialVigencia.textContent = "-";
    }
    credencialSerial.textContent = generarSerialCredencial(propia.nombre, propia.dni);
    const serialN = document.getElementById("credencialSerialN");
    if (serialN) serialN.textContent = "Credencial " + credencialSerial.textContent;
    // Estado de vigencia, para que el cliente vea de un vistazo si es válida.
    const estado = document.getElementById("credencialEstado");
    if (estado) {
      estado.className = "credencial-card-estado solo-nuevo";
      if (propia.vigencia) {
        const vigente = propia.vigencia >= fechaLocalISO();
        estado.classList.add(vigente ? "vigente" : "vencida");
        estado.textContent = (vigente ? "Vigente hasta " : "Vencida el ") + credencialVigencia.textContent;
      } else {
        estado.textContent = "";
      }
    }
    iniciarRelojCredencial();
    credencialQr.innerHTML = "";
    new QRCode(credencialQr, {
      text: "https://www.sat365.com.ar",
      width: 120,
      height: 120,
      colorDark: "#101820",
      colorLight: "#FFFFFF",
      correctLevel: QRCode.CorrectLevel.M,
    });
    credencialCardWrap.classList.remove("hidden");
  } catch (err) {
    credencialStatus.textContent = "No se pudo cargar la credencial.";
  }
}

// Genera un "número de serie" con aspecto de credencial oficial, a
// partir del nombre y el DNI — no hace falta que la oficina cargue
// ningún dato extra, sale solo y siempre es igual para la misma persona.
// Reloj en vivo en la credencial (skin nuevo): segundos que corren, así
// una captura de pantalla vieja no pasa por una credencial real.
let relojCredencialTimer = null;
function iniciarRelojCredencial() {
  const el = document.getElementById("credencialReloj");
  if (!el) return;
  const pintar = () => {
    if (screens.credencial.dataset.active !== "true") { clearInterval(relojCredencialTimer); relojCredencialTimer = null; return; }
    const d = new Date();
    const dos = (n) => String(n).padStart(2, "0");
    el.textContent = `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} · ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
  };
  clearInterval(relojCredencialTimer);
  pintar();
  relojCredencialTimer = setInterval(pintar, 1000);
}

function generarSerialCredencial(nombre, dni) {
  const texto = `${nombre || ""}|${dni || ""}`;
  let hash = 0;
  for (let i = 0; i < texto.length; i++) {
    hash = (hash * 31 + texto.charCodeAt(i)) >>> 0;
  }
  const codigo = hash.toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
  return `SAT-${codigo}`;
}

// ---------- Vehículos de la empresa ----------
let vehiculoSeleccionado = "";

function horaActualHHMM() {
  const ahora = new Date();
  return `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
}
function fechaActualISOVehiculo() {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
}

function encontrarRegistroAbierto(historial, vehiculo) {
  return [...historial].reverse().find((h) => h.vehiculo === vehiculo && !h.hora_devolucion && h.accion !== "evento") || null;
}

function calcularAlertasVehiculo(vehiculoConfig) {
  const alertas = [];
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  (vehiculoConfig.umbrales || []).forEach((u) => {
    if (!u.nombre || !u.valor) return;
    if (u.tipo === "fecha") {
      const [y, m, d] = u.valor.split("-").map(Number);
      const fechaLimite = new Date(y, m - 1, d);
      const diasRestantes = Math.round((fechaLimite - hoy) / 86400000);
      const avisoAntes = Number(u.aviso_antes) || 0;
      if (diasRestantes <= 0) {
        alertas.push({ nivel: "urgente", mensaje: `${u.nombre}: venció (${diasRestantes === 0 ? "hoy" : Math.abs(diasRestantes) + " día(s) atrás"})` });
      } else if (diasRestantes <= avisoAntes) {
        alertas.push({ nivel: "atencion", mensaje: `${u.nombre}: faltan ${diasRestantes} día(s)` });
      }
    } else {
      const kmActual = Number(vehiculoConfig.km_actual) || 0;
      const valor = Number(u.valor) || 0;
      const restante = valor - kmActual;
      const avisoAntes = Number(u.aviso_antes) || 0;
      if (restante <= 0) {
        alertas.push({ nivel: "urgente", mensaje: `${u.nombre}: ya se pasó por ${Math.abs(restante)} km` });
      } else if (restante <= avisoAntes) {
        alertas.push({ nivel: "atencion", mensaje: `${u.nombre}: faltan ${restante} km` });
      }
    }
  });
  return alertas;
}

tileVehiculosBtn.addEventListener("click", () => {
  showScreen("vehiculos");
  renderVehiculosPicker();
});
volverDeVehiculosBtn.addEventListener("click", () => showScreen("home"));
volverDeVehiculoDetalleBtn.addEventListener("click", () => showScreen("vehiculos"));

// ---------- Vehículos sin señal: caché local + cola de envíos ----------
// Lo último que se leyó del servidor queda guardado en el celular, así
// en la cochera o en un sótano igual se ve el estado. Tomar, devolver y
// los eventos que no salen por falta de señal van a la misma cola que
// los partes, y se aplican "por encima" de lo guardado para que el
// técnico vea el resultado al instante.
let vehiculosDesdeCache = false;
function leerCacheVehiculos() {
  try { return JSON.parse(localStorage.getItem("vehiculos_cache") || "{}") || {}; } catch (e) { return {}; }
}
function guardarCacheVehiculos(parte, datos) {
  try {
    const c = leerCacheVehiculos();
    c[parte] = parte === "historial" ? datos.slice(-400) : datos;
    c.cuando = Date.now();
    localStorage.setItem("vehiculos_cache", JSON.stringify(c));
  } catch (e) { /* sin espacio: no pasa nada */ }
}
async function fetchVehiculosConfig() {
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=vehiculos", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const lista = Array.isArray(data) ? data : [];
    guardarCacheVehiculos("config", lista);
    return lista;
  } catch (err) {
    const c = leerCacheVehiculos();
    if (Array.isArray(c.config)) { vehiculosDesdeCache = true; return c.config; }
    throw err;
  }
}
async function fetchVehiculosHistorial() {
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/recurso-uso?recurso=vehiculo", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const lista = Array.isArray(data) ? data : [];
    guardarCacheVehiculos("historial", lista);
    return lista;
  } catch (err) {
    const c = leerCacheVehiculos();
    if (Array.isArray(c.historial)) { vehiculosDesdeCache = true; return c.historial; }
    throw err;
  }
}
function colaVehiculos() {
  return obtenerColaEnvios().filter((i) => i.tipo === "vehiculo" && i.cuerpo);
}
function aplicarColaVehiculos(historial) {
  const h = historial.map((x) => ({ ...x }));
  colaVehiculos().forEach((item) => {
    const c = item.cuerpo;
    if (c.accion === "tomar") {
      h.push({ vehiculo: c.vehiculo, tecnico: c.tecnico, fecha: c.fecha, hora_toma: c.hora_toma, hora_devolucion: "", pendiente: true });
    } else if (c.accion === "devolver") {
      const ab = [...h].reverse().find((x) => x.vehiculo === c.vehiculo && x.tecnico === c.tecnico && !x.hora_devolucion && x.accion !== "evento");
      if (ab) { ab.hora_devolucion = c.hora_devolucion || "—"; ab.km_devolucion = c.km_devolucion; ab.pendiente = true; }
    } else if (c.accion === "evento") {
      h.push({ vehiculo: c.vehiculo, tecnico: c.tecnico, fecha: item.fecha || fechaLocalISO(), hora: c.hora, accion: "evento", tipo_evento: c.tipo_evento, km: c.km, monto: c.monto, detalle: c.detalle, pendiente: true });
    }
  });
  return h;
}
async function historialVehiculosConCola() {
  return aplicarColaVehiculos(await fetchVehiculosHistorial());
}
async function postAccionVehiculo(cuerpo) {
  const res = await fetch("/api/recurso-uso", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
    body: JSON.stringify({ ...cuerpo, recurso: "vehiculo" }),
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* sin cuerpo */ }
  if (!res.ok) {
    const err = new Error(data.error || "HTTP " + res.status);
    err.delServidor = res.status >= 400 && res.status < 500 && res.status !== 401;
    throw err;
  }
  return data;
}
// Las fotos (daños de la revisión) se suben primero y sus links quedan
// al final del detalle: "… · Fotos: url1 url2".
async function cuerpoConFotosSubidas(cuerpo, fotos) {
  if (!fotos || !fotos.length) return cuerpo;
  const urls = [];
  for (const f of fotos) urls.push(f.url ? f.url : await subirFotoRendicion(f.base64));
  return { ...cuerpo, detalle: [cuerpo.detalle, "Fotos: " + urls.join(" ")].filter(Boolean).join(" · ") };
}
// Devuelve { ok } si salió, { enCola } si quedó guardado para después,
// o tira error si el servidor lo rechazó (ej.: otro lo tomó antes).
async function enviarAccionVehiculo(cuerpo, fotos = []) {
  const encolar = () => {
    agregarAColaEnvios({ tipo: "vehiculo", cuerpo, fotos, fecha: fechaLocalISO() });
    return { enCola: true };
  };
  // Si ya hay algo de vehículos esperando, va detrás para respetar el orden (tomar → evento → devolver).
  if (navigator.onLine === false || colaVehiculos().length > 0) {
    const r = encolar();
    if (navigator.onLine !== false) procesarColaEnvios();
    return r;
  }
  try {
    await postAccionVehiculo(await cuerpoConFotosSubidas(cuerpo, fotos));
    return { ok: true };
  } catch (err) {
    if (err.delServidor) throw err;
    return encolar();
  }
}
const TEXTO_ACCION_VEHICULO = { tomar: "Tomar", devolver: "Devolver", evento: "Evento en" };
setInterval(() => { if (navigator.onLine !== false && obtenerColaEnvios().length > 0) procesarColaEnvios(); }, 60000);

// ---------- Revisión rápida al tomar el vehículo ----------
const vehiculoKmToma = document.getElementById("vehiculoKmToma");
const vehiculoRevisionObs = document.getElementById("vehiculoRevisionObs");
const vehiculoDanoPreview = document.getElementById("vehiculoDanoPreview");
const vehRevision = { nafta: "", luces: "", cubiertas: "", limpieza: "" };
let vehDanoFotos = [];
document.querySelectorAll("#vehiculoRevision .veh-seg").forEach((seg) => {
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    const k = seg.dataset.rev;
    vehRevision[k] = vehRevision[k] === b.dataset.v ? "" : b.dataset.v;
    seg.querySelectorAll("button").forEach((x) => x.classList.toggle("activo", x.dataset.v === vehRevision[k]));
  });
});
function limpiarRevisionVehiculo() {
  Object.keys(vehRevision).forEach((k) => { vehRevision[k] = ""; });
  document.querySelectorAll("#vehiculoRevision .veh-seg button").forEach((x) => x.classList.remove("activo"));
  vehiculoKmToma.value = "";
  vehiculoRevisionObs.value = "";
  vehDanoFotos = [];
  renderFotosVehiculo(vehiculoDanoPreview, () => vehDanoFotos);
  ayudaKm(vehiculoKmToma, document.getElementById("vehiculoKmTomaAyuda"), "Son");
}
vehiculoKmToma.addEventListener("input", () => ayudaKm(vehiculoKmToma, document.getElementById("vehiculoKmTomaAyuda"), "Son"));
function textoRevisionVehiculo() {
  const p = [];
  if (vehRevision.nafta) p.push(`Nafta ${vehRevision.nafta}`);
  [["luces", "Luces"], ["cubiertas", "Cubiertas"], ["limpieza", "Limpieza"]].forEach(([k, et]) => {
    const v = vehRevision[k];
    if (v) p.push(`${et}: ${v === "Problema" || v === "Sucio" ? v.toUpperCase() : v.toLowerCase()}`);
  });
  const obs = vehiculoRevisionObs.value.trim();
  if (obs) p.push(`Obs: ${obs}`);
  return p.join(" · ");
}
function renderFotosVehiculo(cont, getLista) {
  const lista = getLista();
  cont.innerHTML = lista.map((f, i) => `
    <span class="veh-ticket-foto"><img src="${escapeHtml(f.url || f.base64)}" alt="Foto ${i + 1}">${f.base64 ? '<span class="rend-foto-pend">sin subir</span>' : ""}
    <button type="button" data-i="${i}" aria-label="Quitar foto">×</button></span>`).join("");
  cont.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    getLista().splice(Number(b.dataset.i), 1);
    renderFotosVehiculo(cont, getLista);
  }));
}
async function cargarFotosVehiculo(input, getLista, cont, boton, textoBoton) {
  const archivos = Array.from(input.files || []);
  input.value = "";
  if (!archivos.length) return;
  const lista = getLista();
  boton.disabled = true;
  boton.textContent = "Subiendo foto...";
  try {
    for (const archivo of archivos) {
      let base64 = null;
      try {
        base64 = await comprimirImagen(archivo, 1600, 0.75);
        const url = await subirFotoRendicion(base64);
        if (lista !== getLista()) return;
        lista.push({ url });
      } catch (err) {
        if (lista !== getLista()) return;
        if (base64) {
          lista.push({ base64: await comprimirImagen(archivo, 1200, 0.6).catch(() => base64) });
          showToast("Sin señal: la foto queda guardada y se sube sola después.");
        } else showToast("No se pudo leer la foto: " + err.message);
      }
    }
    renderFotosVehiculo(cont, getLista);
  } finally {
    boton.disabled = false;
    boton.textContent = textoBoton;
  }
}
document.getElementById("vehiculoDanoCamaraBtn").addEventListener("click", () => document.getElementById("vehiculoDanoCamaraInput").click());
document.getElementById("vehiculoDanoGaleriaBtn").addEventListener("click", () => document.getElementById("vehiculoDanoGaleriaInput").click());
["vehiculoDanoCamaraInput", "vehiculoDanoGaleriaInput"].forEach((id) => {
  const input = document.getElementById(id);
  input.addEventListener("change", () => cargarFotosVehiculo(input, () => vehDanoFotos, vehiculoDanoPreview, vehiculoTomarBtn, "Tomar vehículo"));
});
function ultimaRevisionVehiculo(historial, nombre) {
  return [...historial].reverse().find((h) => h.vehiculo === nombre && h.accion === "evento" && h.tipo_evento === "Revisión al tomar") || null;
}
// Detalle de evento con los links de fotos convertidos en "📷 Foto 1".
function htmlDetalleVehiculo(texto) {
  const s = String(texto || "");
  const m = s.match(/(?:^| · )Fotos: (.+)$/);
  const base = m ? s.slice(0, m.index) : s;
  let html = escapeHtml(base);
  if (m) {
    const links = m[1].trim().split(/\s+/).filter((u) => /^https?:\/\//.test(u))
      .map((u, i) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">📷 Foto ${i + 1}</a>`).join(" ");
    html += (html ? " · " : "") + links;
  }
  return html;
}

// ---------- El vehículo que tenés, en el inicio ----------
function pintarVehiculoInicio(historial) {
  const chip = document.getElementById("homeVehiculoChip");
  const yo = tecnicoLogueado;
  const mio = yo && esSkinNuevo() && !tileVehiculosBtn.classList.contains("hidden")
    ? [...historial].reverse().find((h) => h.tecnico === yo && !h.hora_devolucion && h.accion !== "evento")
    : null;
  chip.hidden = !mio;
  ponerBadge("vehiculosAvisoBadge", mio ? 1 : 0, mio && tomaVencida(mio) ? "Devolver" : "En uso");
  document.getElementById("vehiculosAvisoBadge").classList.toggle("badge-alerta", !!(mio && tomaVencida(mio)));
  if (!mio) return;
  chip.dataset.vehiculo = mio.vehiculo;
  chip.classList.toggle("vencida", tomaVencida(mio));
  document.getElementById("homeVehiculoNombre").textContent = `Tenés ${mio.vehiculo}`;
  const dur = duracionDesde(mio.fecha, mio.hora_toma);
  document.getElementById("homeVehiculoDesde").textContent =
    `Desde ${cuandoVehiculo(mio.fecha, mio.hora_toma)}${tomaVencida(mio) ? " · sin devolver" : dur ? " · " + dur : ""}${mio.pendiente ? " · por enviar" : ""}`;
}
async function actualizarVehiculoInicio() {
  if (!esSkinNuevo() || !tecnicoLogueado || tileVehiculosBtn.classList.contains("hidden")) {
    pintarVehiculoInicio([]);
    return;
  }
  try { pintarVehiculoInicio(await historialVehiculosConCola()); } catch (e) { /* sin datos: queda como estaba */ }
}
document.getElementById("homeVehiculoChip").addEventListener("click", (e) => irADevolverVehiculo(e.currentTarget.dataset.vehiculo));
async function irADevolverVehiculo(nombre) {
  if (!nombre) {
    try {
      const h = await historialVehiculosConCola();
      const ab = [...h].reverse().find((x) => x.tecnico === tecnicoLogueado && !x.hora_devolucion && x.accion !== "evento");
      nombre = ab && ab.vehiculo;
    } catch (e) { /* sin datos */ }
  }
  if (!nombre) { tileVehiculosBtn.click(); return; }
  vehiculoSeleccionado = nombre;
  showScreen("vehiculoDetalle");
  await renderVehiculoDetalle();
  if (screens.vehiculoDetalle.dataset.modo === "mio") ponerModoVehiculo("mio-devolver");
}
// La notificación de las 15 h ("acordate de devolver") abre directo la devolución.
let irPendienteVehiculo = (() => {
  try {
    const ir = new URLSearchParams(location.search).get("ir");
    if (ir) history.replaceState(null, "", location.pathname);
    return ir === "devolver-vehiculo";
  } catch (e) { return false; }
})();
function consumirIrPendiente() {
  if (!irPendienteVehiculo || !tecnicoLogueado || screens.home.dataset.active !== "true") return;
  irPendienteVehiculo = false;
  irADevolverVehiculo();
}
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.tipo === "abrir-url" && String(d.url || "").includes("ir=devolver-vehiculo") && tecnicoLogueado) irADevolverVehiculo();
  });
}
setTimeout(consumirIrPendiente, 1500);

// --- Kilometraje: último conocido y control de lo que se carga ---
function kmNumero(v) {
  const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
  return isFinite(n) && n > 0 ? n : 0;
}
function formatoKm(n) { return Number(n || 0).toLocaleString("es-AR"); }
// El último km registrado: lo más nuevo del historial (devoluciones y
// eventos), o el km_actual de la configuración si es mayor (la oficina
// lo puede corregir desde admin).
function ultimoKmVehiculo(vConfig, historial) {
  let ultimo = 0;
  historial.filter((h) => h.vehiculo === vConfig.nombre).forEach((h) => {
    const k = h.accion === "evento" ? kmNumero(h.km) : kmNumero(h.km_devolucion || h.km_final);
    if (k) ultimo = k;
  });
  return Math.max(kmNumero(vConfig.km_actual), ultimo);
}
const SALTO_KM_SOSPECHOSO = 600;
let vehKmUltimo = 0;
function ayudaKm(input, ayuda, verbo) {
  const n = kmNumero(input.value);
  ayuda.className = "veh-km-ayuda";
  if (!vehKmUltimo) { ayuda.textContent = ""; return; }
  if (!n) { ayuda.textContent = `Último registrado: ${formatoKm(vehKmUltimo)} km`; return; }
  const dif = n - vehKmUltimo;
  if (dif < 0) {
    ayuda.classList.add("alerta");
    ayuda.textContent = `⚠ Es menor que el último registrado (${formatoKm(vehKmUltimo)} km). Revisá el número.`;
  } else if (dif > SALTO_KM_SOSPECHOSO) {
    ayuda.classList.add("alerta");
    ayuda.textContent = `⚠ Serían ${formatoKm(dif)} km desde el último registro (${formatoKm(vehKmUltimo)} km). ¿No sobra un número?`;
  } else {
    ayuda.classList.add("ok");
    ayuda.textContent = `${verbo} ${formatoKm(dif)} km desde el último registro.`;
  }
}
vehiculoKmDevolucion.addEventListener("input", () => ayudaKm(vehiculoKmDevolucion, document.getElementById("vehiculoKmAyuda"), "Recorriste"));
vehiculoEventoKm.addEventListener("input", () => ayudaKm(vehiculoEventoKm, document.getElementById("vehiculoEventoKmAyuda"), "Son"));
// Devuelve null si el técnico cancela, o una nota para dejar registrada
// cuando confirma un número raro (vacía si estaba todo bien).
function confirmarKm(n) {
  if (!vehKmUltimo) return "";
  if (n < vehKmUltimo) {
    const ok = confirm(`El kilometraje que pusiste (${formatoKm(n)} km) es MENOR que el último registrado (${formatoKm(vehKmUltimo)} km).\n\nSeguí solo si el tablero marca eso: queda anotado para que la oficina lo revise.`);
    return ok ? `⚠ Km menor al último registrado (${formatoKm(vehKmUltimo)})` : null;
  }
  if (n - vehKmUltimo > SALTO_KM_SOSPECHOSO) {
    const ok = confirm(`Serían ${formatoKm(n - vehKmUltimo)} km desde el último registro (${formatoKm(vehKmUltimo)} km).\n\n¿Está bien el número (${formatoKm(n)} km)?`);
    return ok ? `⚠ Salto de ${formatoKm(n - vehKmUltimo)} km confirmado por el técnico` : null;
  }
  return "";
}

// --- Fechas de toma: "hoy", "ayer" o la fecha ---
function cuandoVehiculo(fecha, hora) {
  const hoy = fechaLocalISO();
  const d = new Date(); d.setDate(d.getDate() - 1);
  const ayer = fechaLocalISO(d);
  const h = hora ? ` a las ${hora}` : "";
  if (!fecha || fecha === hoy) return `hoy${h}`;
  if (fecha === ayer) return `ayer${h}`;
  const [, m, dd] = fecha.split("-");
  return `el ${dd}/${m}${h}`;
}
function tomaVencida(registro) {
  return !!(registro && registro.fecha && registro.fecha < fechaLocalISO());
}
function duracionDesde(fecha, hora) {
  if (!hora) return "";
  const inicio = new Date(`${fecha || fechaLocalISO()}T${hora}`);
  const min = Math.floor((Date.now() - inicio) / 60000);
  if (!isFinite(min) || min < 0) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  return `${h} h ${min % 60} min`;
}
function ultimoUsoVehiculo(historial, nombre) {
  return [...historial].reverse().find((h) => h.vehiculo === nombre && h.accion !== "evento" && h.hora_devolucion) || null;
}

const ICONO_AUTO = '<path d="M3 13l2-6a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 6"/><rect x="2" y="13" width="20" height="5" rx="1.5"/><circle cx="7" cy="18.5" r="1.5"/><circle cx="17" cy="18.5" r="1.5"/>';
const ICONO_MOTO = '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h4l3-7h3"/><path d="M13 17l-2-5-3-1"/>';
const esMoto = (nombre) => /moto/i.test(nombre || "");

async function renderVehiculosPicker() {
  vehiculosListaStatus.textContent = "Cargando...";
  vehiculosPanelTiles.innerHTML = "";
  const nuevo = esSkinNuevo();
  vehiculosPanelTiles.classList.toggle("veh-lista", nuevo);
  try {
    vehiculosDesdeCache = false;
    const [config, historial] = await Promise.all([fetchVehiculosConfig(), historialVehiculosConCola()]);
    vehiculosListaStatus.textContent = !config.length ? "Todavía no hay vehículos cargados."
      : vehiculosDesdeCache ? "Sin señal: se muestra lo último guardado en el celular." : "";
    const yo = tecnicoLogueado || "Oficina";
    const filas = config.map((v, i) => ({ v, i, abierto: encontrarRegistroAbierto(historial, v.nombre) }));
    if (nuevo) filas.sort((a, b) => ((b.abierto && b.abierto.tecnico === yo) - (a.abierto && a.abierto.tecnico === yo)) || a.i - b.i);
    filas.forEach(({ v, abierto }) => {
      const vencida = tomaVencida(abierto);
      const tile = document.createElement("button");
      tile.type = "button";
      const icono = esMoto(v.nombre) ? ICONO_MOTO : ICONO_AUTO;
      if (nuevo) {
        const mio = abierto && abierto.tecnico === yo;
        const km = ultimoKmVehiculo(v, historial);
        const alertas = calcularAlertasVehiculo({ ...v, km_actual: km });
        const uso = ultimoUsoVehiculo(historial, v.nombre);
        const estado = !abierto ? "Libre"
          : mio ? `Lo tenés vos desde ${cuandoVehiculo(abierto.fecha, abierto.hora_toma)}`
          : `En uso por ${abierto.tecnico} desde ${cuandoVehiculo(abierto.fecha, abierto.hora_toma)}`;
        tile.className = `veh-card${abierto ? " en-uso" : " libre"}${mio ? " mio" : ""}${vencida ? " vencida" : ""}`;
        const meta = [km ? `${formatoKm(km)} km` : "", !abierto && uso ? `Último uso: ${uso.tecnico}, ${cuandoVehiculo(uso.fecha, uso.hora_devolucion)}` : ""].filter(Boolean).join(" · ");
        tile.innerHTML = `
          <span class="veh-card-ico"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icono}</svg></span>
          <span class="veh-card-cuerpo">
            <span class="veh-card-nombre">${escapeHtml(v.nombre)}</span>
            <span class="veh-card-estado">${escapeHtml(estado)}${vencida ? " · sin devolver" : ""}</span>
            ${meta ? `<span class="veh-card-meta">${escapeHtml(meta)}</span>` : ""}
            ${alertas.length ? `<span class="veh-card-alertas">${alertas.map((a) => `<span class="veh-chip ${a.nivel}">${escapeHtml(a.mensaje)}</span>`).join("")}</span>` : ""}
          </span>
          <span class="veh-card-flecha" aria-hidden="true">›</span>`;
      } else {
        const estado = abierto ? `En uso por ${abierto.tecnico} desde ${vencida ? cuandoVehiculo(abierto.fecha, abierto.hora_toma) : "las " + abierto.hora_toma}` : "Libre";
        tile.className = `panel-tile panel-tile-grid ${abierto ? "tile-vehiculo-en-uso" : "tile-vehiculo-libre"}`;
        tile.innerHTML = `
          <span class="panel-tile-icon-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icono}</svg>
          </span>
          <span class="panel-tile-label">${escapeHtml(v.nombre)}</span>
          <span class="vehiculo-panel-status" style="color:${vencida ? "#C0392B" : abierto ? "#B5772A" : "#2E7D32"};">${escapeHtml(estado)}</span>
        `;
      }
      tile.addEventListener("click", () => {
        vehiculoSeleccionado = v.nombre;
        showScreen("vehiculoDetalle");
        renderVehiculoDetalle();
      });
      vehiculosPanelTiles.appendChild(tile);
    });
  } catch (err) {
    vehiculosListaStatus.textContent = "No se pudo cargar la información de vehículos.";
  }
}

const vehiculoEstadoCard = document.getElementById("vehiculoEstadoCard");
function ponerModoVehiculo(modo) {
  screens.vehiculoDetalle.dataset.modo = modo;
  vehiculoEstadoCard.querySelectorAll("[data-ir-modo]").forEach((b) => b.classList.toggle("activo", b.dataset.irModo === modo));
  if (modo === "mio-devolver") setTimeout(() => vehiculoKmDevolucion.focus(), 50);
}

async function renderVehiculoDetalle() {
  const nuevo = esSkinNuevo();
  vehiculoDetalleNombre.textContent = nuevo ? vehiculoSeleccionado : vehiculoSeleccionado.toUpperCase();
  vehiculoDetalleStatus.textContent = "Cargando...";
  vehiculoAlertasWrap.classList.add("hidden");
  vehiculoTomarWrap.classList.add("hidden");
  vehiculoDevolverWrap.classList.add("hidden");
  vehiculoForzarLiberarBtn.classList.add("hidden");
  vehiculoEventoSinDevolverWrap.classList.add("hidden");
  vehiculoEstadoCard.hidden = true;
  vehiculoEnUsoInfo.classList.remove("status-error");
  screens.vehiculoDetalle.dataset.modo = "";
  try {
    vehiculosDesdeCache = false;
    const [config, historial] = await Promise.all([fetchVehiculosConfig(), historialVehiculosConCola()]);
    const vConfig = config.find((v) => v.nombre === vehiculoSeleccionado) || { nombre: vehiculoSeleccionado, km_actual: 0, umbrales: [] };
    const abierto = encontrarRegistroAbierto(historial, vehiculoSeleccionado);
    vehKmUltimo = ultimoKmVehiculo(vConfig, historial);

    vehiculoDetalleStatus.textContent = `Kilometraje actual: ${formatoKm(vehKmUltimo)} km${vehiculosDesdeCache ? " · sin señal, datos guardados" : ""}`;

    const alertas = calcularAlertasVehiculo({ ...vConfig, km_actual: vehKmUltimo });
    if (alertas.length > 0) {
      vehiculoAlertasWrap.innerHTML = alertas
        .map((a) => `<div class="vehiculo-alerta-card ${a.nivel}">${escapeHtml(a.mensaje)}</div>`)
        .join("");
      vehiculoAlertasWrap.classList.remove("hidden");
    }

    const tecnicoActual = tecnicoLogueado || "Oficina";
    const vencida = tomaVencida(abierto);
    const uso = ultimoUsoVehiculo(historial, vehiculoSeleccionado);
    let tarjeta = "";

    if (!abierto) {
      vehiculoHoraToma.value = horaActualHHMM();
      limpiarRevisionVehiculo();
      vehiculoTomarWrap.classList.remove("hidden");
      const rev = ultimaRevisionVehiculo(historial, vehiculoSeleccionado);
      const revConProblema = rev && /PROBLEMA|SUCIO|Obs:|Fotos:/.test(rev.detalle || "");
      tarjeta = `<div class="veh-estado-tit libre">Libre</div>
        <div class="veh-estado-sub">${uso ? `Último uso: ${escapeHtml(uso.tecnico)}, ${cuandoVehiculo(uso.fecha, uso.hora_devolucion)}` : "Listo para usar"}</div>
        ${rev ? `<div class="veh-estado-rev${revConProblema ? " problema" : ""}">Última revisión (${escapeHtml(rev.tecnico)}, ${cuandoVehiculo(rev.fecha, rev.hora)}): ${htmlDetalleVehiculo(rev.detalle) || "sin novedades"}</div>` : ""}`;
      screens.vehiculoDetalle.dataset.modo = "libre";
    } else if (abierto.tecnico === tecnicoActual) {
      const desde = cuandoVehiculo(abierto.fecha, abierto.hora_toma);
      vehiculoEnUsoInfo.textContent = vencida
        ? `Lo tomaste vos ${desde} y todavía no lo devolviste.`
        : `Lo tomaste vos ${desde}.`;
      vehiculoEnUsoInfo.classList.toggle("status-error", vencida);
      vehiculoForzarLiberarBtn.classList.add("hidden");
      vehiculoHoraDevolucion.parentElement.classList.remove("hidden");
      vehiculoKmDevolucion.parentElement.classList.remove("hidden");
      vehiculoEvento.parentElement.classList.remove("hidden");
      vehiculoDevolverBtn.classList.remove("hidden");
      vehiculoHoraDevolucion.value = horaActualHHMM();
      vehiculoKmDevolucion.value = "";
      vehiculoKmDevolucion.placeholder = vehKmUltimo ? `Más de ${formatoKm(vehKmUltimo)}` : "";
      ayudaKm(vehiculoKmDevolucion, document.getElementById("vehiculoKmAyuda"), "Recorriste");
      vehiculoEvento.value = "";
      vehiculoEventoDetalle.value = "";
      vehiculoEventoDetalleWrap.classList.remove("hidden");
      vehiculoEventoDetalleWrap.style.display = "none";
      vehiculoDevolverWrap.classList.remove("hidden");

      // Mientras tenga el vehículo tomado, también puede registrar un
      // evento (combustible, gomería, mecánico, lavadero) sin devolverlo.
      vehiculoTipoEventoSelect.value = "";
      vehiculoEventoKm.value = "";
      vehiculoEventoKm.placeholder = vehKmUltimo ? `Más de ${formatoKm(vehKmUltimo)}` : "";
      ayudaKm(vehiculoEventoKm, document.getElementById("vehiculoEventoKmAyuda"), "Son");
      vehiculoEventoMonto.value = "";
      vehiculoEventoDetalleTexto.value = "";
      limpiarRendirVehiculo();
      vehiculoEventoSinDevolverWrap.classList.remove("hidden");

      const dur = duracionDesde(abierto.fecha, abierto.hora_toma);
      tarjeta = `<div class="veh-estado-tit ${vencida ? "vencida" : "mio"}">${vencida ? "Sin devolver" : "Lo tenés vos"}</div>
        <div class="veh-estado-sub">Desde ${escapeHtml(desde)}${dur ? ` · ${dur}` : ""}${abierto.pendiente ? " · se envía cuando haya señal" : ""}</div>
        <div class="veh-estado-acciones">
          <button type="button" class="veh-accion" data-ir-modo="mio-devolver"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>Devolver</button>
          <button type="button" class="veh-accion" data-ir-modo="mio-evento"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17"/><path d="M3 22h12M6 8h6"/><path d="M15 11h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-3-3"/></svg>Cargar evento</button>
        </div>`;
      screens.vehiculoDetalle.dataset.modo = "mio";
    } else {
      const desde = cuandoVehiculo(abierto.fecha, abierto.hora_toma);
      vehiculoEnUsoInfo.textContent = `Este vehículo lo tiene ${abierto.tecnico} desde ${desde}${vencida ? " (no lo devolvió)" : ""}. No se puede tomar hasta que lo devuelva.`;
      vehiculoDevolverWrap.classList.remove("hidden");
      vehiculoForzarLiberarBtn.classList.remove("hidden");
      vehiculoForzarLiberarBtn.dataset.tecnicoActual = abierto.tecnico;
      vehiculoHoraDevolucion.parentElement.classList.add("hidden");
      vehiculoKmDevolucion.parentElement.classList.add("hidden");
      vehiculoEvento.parentElement.classList.add("hidden");
      vehiculoEventoDetalleWrap.classList.add("hidden");
      vehiculoDevolverBtn.classList.add("hidden");
      tarjeta = `<div class="veh-estado-tit ${vencida ? "vencida" : "otro"}">En uso por ${escapeHtml(abierto.tecnico)}</div>
        <div class="veh-estado-sub">Desde ${escapeHtml(desde)}${vencida ? " · no lo devolvió" : ""}. No se puede tomar hasta que lo devuelva.</div>`;
      screens.vehiculoDetalle.dataset.modo = "otro";
    }
    if (nuevo) {
      vehiculoEstadoCard.innerHTML = tarjeta;
      vehiculoEstadoCard.hidden = false;
      vehiculoEstadoCard.querySelectorAll("[data-ir-modo]").forEach((b) => b.addEventListener("click", () => {
        ponerModoVehiculo(screens.vehiculoDetalle.dataset.modo === b.dataset.irModo ? "mio" : b.dataset.irModo);
      }));
    }
  } catch (err) {
    vehiculoDetalleStatus.textContent = "No se pudo cargar la información de este vehículo.";
  }
}

vehiculoEvento.addEventListener("change", () => {
  vehiculoEventoDetalleWrap.style.display = vehiculoEvento.value ? "block" : "none";
});

// --- Rendir el ticket desde el evento del vehículo (una sola carga) ---
const vehiculoRendirWrap = document.getElementById("vehiculoRendirWrap");
const vehiculoRendirCheck = document.getElementById("vehiculoRendirCheck");
const vehiculoRendirFotosWrap = document.getElementById("vehiculoRendirFotosWrap");
const vehiculoSinTicket = document.getElementById("vehiculoSinTicket");
const vehiculoTicketPreview = document.getElementById("vehiculoTicketPreview");
const vehiculoTicketCamaraInput = document.getElementById("vehiculoTicketCamaraInput");
const vehiculoTicketGaleriaInput = document.getElementById("vehiculoTicketGaleriaInput");
let vehTicketFotos = [];
let vehTicketGeneracion = 0;
function limpiarRendirVehiculo() {
  vehTicketGeneracion++;
  vehTicketFotos = [];
  vehiculoRendirCheck.checked = true;
  vehiculoSinTicket.checked = false;
  renderTicketVehiculo();
  actualizarRendirVehiculo();
}
function actualizarRendirVehiculo() {
  const monto = parseMontoRendicion(vehiculoEventoMonto.value);
  vehiculoRendirWrap.classList.toggle("hidden", !(isFinite(monto) && monto > 0));
  vehiculoRendirFotosWrap.classList.toggle("hidden", !vehiculoRendirCheck.checked);
}
function renderTicketVehiculo() {
  vehiculoTicketPreview.innerHTML = vehTicketFotos.map((f, i) => `
    <span class="veh-ticket-foto"><img src="${escapeHtml(f.url || f.base64)}" alt="Ticket ${i + 1}">${f.base64 ? '<span class="rend-foto-pend">sin subir</span>' : ""}
    <button type="button" data-i="${i}" aria-label="Quitar foto">×</button></span>`).join("");
  vehiculoTicketPreview.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    vehTicketFotos.splice(Number(b.dataset.i), 1);
    renderTicketVehiculo();
  }));
}
async function agregarTicketVehiculo(input) {
  const archivos = Array.from(input.files || []);
  input.value = "";
  if (!archivos.length) return;
  const gen = vehTicketGeneracion;
  vehiculoRegistrarEventoBtn.disabled = true;
  vehiculoRegistrarEventoBtn.textContent = "Subiendo foto...";
  for (const archivo of archivos) {
    let base64 = null;
    try {
      base64 = await comprimirImagen(archivo, 1600, 0.75);
      const url = await subirFotoRendicion(base64);
      if (gen !== vehTicketGeneracion) return;
      vehTicketFotos.push({ url });
    } catch (err) {
      if (gen !== vehTicketGeneracion) return;
      if (base64) {
        vehTicketFotos.push({ base64: await comprimirImagen(archivo, 1200, 0.6).catch(() => base64) });
        showToast("Sin señal: la foto queda guardada y se sube sola después.");
      } else showToast("No se pudo leer la foto: " + err.message);
    }
  }
  renderTicketVehiculo();
  vehiculoRegistrarEventoBtn.disabled = false;
  vehiculoRegistrarEventoBtn.textContent = "Registrar evento";
}
vehiculoEventoMonto.addEventListener("input", actualizarRendirVehiculo);
vehiculoEventoMonto.addEventListener("blur", () => {
  const n = parseMontoRendicion(vehiculoEventoMonto.value);
  if (isFinite(n) && n > 0) vehiculoEventoMonto.value = n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
});
vehiculoRendirCheck.addEventListener("change", actualizarRendirVehiculo);
document.getElementById("vehiculoTicketCamaraBtn").addEventListener("click", () => vehiculoTicketCamaraInput.click());
document.getElementById("vehiculoTicketGaleriaBtn").addEventListener("click", () => vehiculoTicketGaleriaInput.click());
vehiculoTicketCamaraInput.addEventListener("change", () => agregarTicketVehiculo(vehiculoTicketCamaraInput));
vehiculoTicketGaleriaInput.addEventListener("change", () => agregarTicketVehiculo(vehiculoTicketGaleriaInput));

// En Rendir ticket: si eligen Combustible, se les recuerda que la carga
// de un vehículo de la empresa conviene hacerla desde Vehículos.
const rendAvisoVehiculo = document.getElementById("rendAvisoVehiculo");
function actualizarAvisoCombustibleRendicion() {
  rendAvisoVehiculo.classList.toggle("hidden", !(rendCategoria.value === "Combustible" && !tileVehiculosBtn.classList.contains("hidden")));
}
rendCategoria.addEventListener("change", actualizarAvisoCombustibleRendicion);
document.getElementById("rendIrVehiculosBtn").addEventListener("click", () => tileVehiculosBtn.click());

vehiculoRegistrarEventoBtn.addEventListener("click", async () => {
  const tipoEvento = vehiculoTipoEventoSelect.value;
  const km = kmNumero(vehiculoEventoKm.value);
  if (!tipoEvento) {
    showToast("Elegí el tipo de evento.");
    return;
  }
  if (!km) {
    showToast("Cargá el kilometraje actual del vehículo.");
    vehiculoEventoKm.focus();
    return;
  }
  const monto = parseMontoRendicion(vehiculoEventoMonto.value);
  const hayMonto = isFinite(monto) && monto > 0;
  const rendir = hayMonto && vehiculoRendirCheck.checked;
  if (rendir && !vehiculoSinTicket.checked && vehTicketFotos.length === 0) {
    showToast("Falta la foto del ticket. Si no te dieron, tildá \"No me dieron ticket\".");
    return;
  }
  const notaKm = confirmarKm(km);
  if (notaKm === null) { vehiculoEventoKm.focus(); return; }
  const detalleTexto = vehiculoEventoDetalleTexto.value.trim();
  const detalle = [detalleTexto, rendir ? "Rendido por el técnico" : "", notaKm].filter(Boolean).join(" · ");
  vehiculoRegistrarEventoBtn.disabled = true;
  let resultadoEvento;
  try {
    resultadoEvento = await enviarAccionVehiculo({
      accion: "evento",
      vehiculo: vehiculoSeleccionado,
      tecnico: tecnicoLogueado || "Oficina",
      hora: horaActualHHMM(),
      tipo_evento: tipoEvento,
      km: String(km),
      monto: hayMonto ? String(monto) : "",
      detalle,
    });
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
    vehiculoRegistrarEventoBtn.disabled = false;
    return;
  }
  let mensaje = resultadoEvento.enCola ? `Sin señal: el evento (${tipoEvento}) quedó guardado y se manda solo.` : `Evento registrado: ${tipoEvento}.`;
  if (rendir) {
    const esNafta = tipoEvento === "Carga de combustible";
    const cuerpo = {
      accion: "crear",
      tecnico: tecnicoLogueado || "",
      categoria: esNafta ? "Combustible" : "Otro",
      detalle: `${esNafta ? "Combustible" : tipoEvento} — ${vehiculoSeleccionado} (${formatoKm(km)} km)${detalleTexto ? ": " + detalleTexto : ""}${vehiculoSinTicket.checked ? " (sin ticket)" : ""}`,
      cliente: "",
      monto: String(monto),
      fecha: fechaLocalISO(),
    };
    const fotos = vehTicketFotos.slice();
    try {
      if (fotos.some((f) => f.base64)) throw Object.assign(new Error("fotos sin subir"), { sinSenal: true });
      await postRendicion({ ...cuerpo, foto_ref: fotos.length ? JSON.stringify(fotos.map((f) => f.url)) : "" });
      mensaje = resultadoEvento.enCola ? `Sin señal: el evento quedó guardado; la rendición de ${formatoPesos(monto)} ya se envió.` : `Evento registrado y rendición de ${formatoPesos(monto)} enviada.`;
    } catch (err) {
      if (err.delServidor) {
        mensaje = `El evento quedó registrado, pero la rendición no se pudo enviar (${err.message}). Cargala en Rendir ticket.`;
      } else {
        try {
          agregarAColaEnvios({ tipo: "rendicion", cuerpo, fotos });
          mensaje = resultadoEvento.enCola ? "Sin señal: el evento y la rendición quedaron guardados y se mandan solos." : "Evento registrado. La rendición quedó guardada y se manda sola cuando vuelva la señal.";
        } catch (e) {
          mensaje = "El evento quedó registrado, pero no se pudo guardar la rendición. Cargala en Rendir ticket.";
        }
      }
    }
  }
  vehiculoRegistrarEventoBtn.disabled = false;
  showToast(mensaje);
  limpiarRendirVehiculo();
  showScreen("vehiculos");
  renderVehiculosPicker();
});

vehiculoTomarBtn.addEventListener("click", async () => {
  const kmToma = kmNumero(vehiculoKmToma.value);
  const revision = textoRevisionVehiculo();
  const hayRevision = !!(kmToma || revision || vehDanoFotos.length);
  let notaKm = "";
  if (kmToma) {
    notaKm = confirmarKm(kmToma);
    if (notaKm === null) { vehiculoKmToma.focus(); return; }
    // Al tomarlo, cualquier diferencia con la última devolución son km que nadie registró.
    if (!notaKm && vehKmUltimo && kmToma - vehKmUltimo > 5) notaKm = `⚠ ${formatoKm(kmToma - vehKmUltimo)} km más que el último registro`;
  }
  const tecnico = tecnicoLogueado || "Oficina";
  const vehiculo = vehiculoSeleccionado;
  vehiculoTomarBtn.disabled = true;
  try {
    const r = await enviarAccionVehiculo({
      accion: "tomar",
      vehiculo,
      tecnico,
      fecha: fechaActualISOVehiculo(),
      hora_toma: vehiculoHoraToma.value || horaActualHHMM(),
    });
    let enCola = !!r.enCola;
    if (hayRevision) {
      try {
        const r2 = await enviarAccionVehiculo({
          accion: "evento",
          vehiculo,
          tecnico,
          hora: horaActualHHMM(),
          tipo_evento: "Revisión al tomar",
          km: String(kmToma || vehKmUltimo || 0),
          monto: "",
          detalle: [revision, kmToma ? "" : "km no informado", notaKm].filter(Boolean).join(" · ") || "Sin novedades",
        }, vehDanoFotos.slice());
        enCola = enCola || !!r2.enCola;
      } catch (err) {
        showToast("Lo tomaste, pero la revisión no se pudo guardar: " + err.message);
      }
    }
    showToast(enCola ? `Sin señal: quedó guardado que tomaste ${vehiculo}. Se manda solo cuando vuelva la conexión.` : `Tomaste ${vehiculo}.`);
    limpiarRevisionVehiculo();
    showScreen("vehiculos");
    renderVehiculosPicker();
    actualizarVehiculoInicio();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  } finally {
    vehiculoTomarBtn.disabled = false;
  }
});

vehiculoDevolverBtn.addEventListener("click", async () => {
  const km = kmNumero(vehiculoKmDevolucion.value);
  if (!km) {
    showToast("Completá los kilómetros de devolución.");
    vehiculoKmDevolucion.focus();
    return;
  }
  const notaKm = confirmarKm(km);
  if (notaKm === null) { vehiculoKmDevolucion.focus(); return; }
  const eventoCompleto = [
    vehiculoEvento.value ? `${vehiculoEvento.value}${vehiculoEventoDetalle.value ? ": " + vehiculoEventoDetalle.value : ""}` : "",
    notaKm,
  ].filter(Boolean).join(" · ");
  vehiculoDevolverBtn.disabled = true;
  try {
    const r = await enviarAccionVehiculo({
      accion: "devolver",
      vehiculo: vehiculoSeleccionado,
      tecnico: tecnicoLogueado || "Oficina",
      hora_devolucion: vehiculoHoraDevolucion.value || horaActualHHMM(),
      km_devolucion: String(km),
      evento: eventoCompleto,
    });
    showToast(r.enCola ? `Sin señal: quedó guardado que devolviste ${vehiculoSeleccionado}. Se manda solo cuando vuelva la conexión.` : `Devolviste ${vehiculoSeleccionado}. ¡Gracias!`);
    showScreen("vehiculos");
    renderVehiculosPicker();
    actualizarVehiculoInicio();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  } finally {
    vehiculoDevolverBtn.disabled = false;
  }
});

// Cuando otro técnico se olvidó de devolver el vehículo, cualquiera
// puede forzar la liberación desde acá — con una advertencia clara y
// dejando registrado en el log tanto quién liberó como quién lo
// tenía antes, para que quede trazabilidad de lo que pasó. OJO: no
// se pide kilometraje acá — el que libera no manejó el vehículo, así
// que no tiene forma de saberlo; se manda vacío para no pisar el
// km_actual con un número inventado.
vehiculoForzarLiberarBtn.addEventListener("click", async () => {
  const tecnicoQueLoTenia = vehiculoForzarLiberarBtn.dataset.tecnicoActual || "otro técnico";
  const confirmar = confirm(
    `¿Forzar la liberación de "${vehiculoSeleccionado}"?\n\n` +
    `Lo tenía tomado ${tecnicoQueLoTenia}. Esta acción queda registrada en el historial, con tu nombre y el de quién lo tenía antes.\n\n` +
    `Usalo solo si estás seguro de que en verdad está libre (por ejemplo, si ${tecnicoQueLoTenia} se olvidó de devolverlo).`
  );
  if (!confirmar) return;
  vehiculoForzarLiberarBtn.disabled = true;
  try {
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        recurso: "vehiculo",
        accion: "devolver",
        vehiculo: vehiculoSeleccionado,
        tecnico: tecnicoQueLoTenia, // tiene que matchear el registro abierto para poder cerrarlo
        hora_devolucion: horaActualHHMM(),
        km_devolucion: "",
        evento: `Liberación forzada por ${tecnicoLogueado || "Oficina"} — anteriormente lo tenía ${tecnicoQueLoTenia}`,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast(`Liberaste "${vehiculoSeleccionado}". Ahora lo podés tomar vos.`);
    renderVehiculoDetalle();
  } catch (err) {
    showToast("No se pudo liberar: " + err.message);
  } finally {
    vehiculoForzarLiberarBtn.disabled = false;
  }
});

// ---------- Dashboard de vehículos ----------
let dashVehiculosCache = [];
let dashVehConfigCache = [];
let dashVehPeriodoActivo = "mes";
let dashVehVehiculoSeleccionado = "";

verDashboardVehiculosBtn.addEventListener("click", () => {
  dashVehVehiculoSeleccionado = "";
  dashVehDetalleWrap.classList.add("hidden");
  dashVehListaWrap.classList.remove("hidden");
  showScreen("dashboardVehiculos");
  fetchDashVehiculos();
});
volverDeDashboardVehiculosBtn.addEventListener("click", () => showScreen("dashboardsMenu"));
refreshDashVehiculosBtn.addEventListener("click", fetchDashVehiculos);
dashVehBuscarInput.addEventListener("input", renderListaVehiculosDash);
dashVehVolverListaBtn.addEventListener("click", () => {
  dashVehVehiculoSeleccionado = "";
  dashVehDetalleWrap.classList.add("hidden");
  dashVehListaWrap.classList.remove("hidden");
});

document.querySelectorAll(".dash-veh-periodo-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".dash-veh-periodo-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    dashVehPeriodoActivo = chip.dataset.periodo;
    dashVehFechaEspecificaWrap.classList.toggle("hidden", dashVehPeriodoActivo !== "fecha");
    if (dashVehPeriodoActivo === "fecha" && !dashVehFechaEspecifica.value) {
      dashVehFechaEspecifica.value = fechaLocalISO();
    }
    renderDashVehiculos();
    renderResumenGastoFlota();
  });
});
dashVehFechaEspecifica.addEventListener("change", () => { renderDashVehiculos(); renderResumenGastoFlota(); });

async function fetchDashVehiculos() {
  dashVehListaStatus.textContent = "Cargando...";
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const [vehiculos, res] = await Promise.all([
      fetchVehiculosConfig().catch(() => []),
      fetch("/api/recurso-uso?recurso=vehiculo", { headers, cache: "no-store" }),
    ]);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    dashVehiculosCache = Array.isArray(data) ? data : [];
    dashVehConfigCache = Array.isArray(vehiculos) ? vehiculos : [];
    dashVehiculosSyncLabel.textContent = formatSyncTime(new Date());
    renderListaVehiculosDash();
    renderResumenGastoFlota();
    if (dashVehVehiculoSeleccionado) renderDashVehiculos();
  } catch (err) {
    dashVehListaStatus.textContent = "No se pudo cargar el historial de vehículos.";
  }
}

const formatoPesosVeh = (n) => "$" + Math.round(n).toLocaleString("es-AR");

// Suma de gastos de TODA la flota en el período elegido — se muestra
// en la pantalla de la lista, antes de elegir un vehículo puntual.

// ---- Mismo formato (cifra principal + mosaicos) para vehículos, herramientas y SIMs ----
function textoPeriodoDash(periodo) {
  if (periodo === "todo") return ["en total", null];
  if (periodo === "fecha") return ["ese día", null];
  return TEXTO_PERIODO[periodo] || ["en el período", null];
}
function pintarDashNuevo(heroId, tilesId, { valor, etiqueta, actual, anterior, antes, serie, subirEsBueno = true, tiles = [] }) {
  const hero = document.getElementById(heroId);
  const tl = document.getElementById(tilesId);
  const activo = esSkinNuevo();
  if (hero) hero.hidden = !activo;
  if (tl) tl.hidden = !activo || !tiles.length;
  if (!activo) return false;
  if (hero) hero.innerHTML = heroDash({ valor, etiqueta, delta: antes && anterior != null ? deltaPill(actual, anterior, antes, subirEsBueno) : "", serie });
  if (tl) tl.innerHTML = tiles.map(tileDash).join("");
  return true;
}
function barrasHorizontalesDash(canvasId, wrapId, chartPrevio, titulo, etiquetas, valores, formato) {
  const wrap = document.getElementById(wrapId);
  if (chartPrevio) chartPrevio.destroy();
  if (!esSkinNuevo() || !etiquetas.length || !valores.some((v) => v > 0)) { if (wrap) wrap.hidden = true; return null; }
  wrap.hidden = false;
  wrap.style.height = `${90 + etiquetas.length * 40}px`;
  return new Chart(document.getElementById(canvasId), {
    type: "bar",
    data: { labels: etiquetas, datasets: [{ label: titulo, data: valores, backgroundColor: "#F5A623" }] },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 72 } },
      plugins: {
        legend: { display: false }, title: { display: true, text: titulo },
        datalabels: { display: true, anchor: "end", align: "right", clip: false, color: "#101820", font: { weight: "700", size: 12 }, formatter: (v) => (v > 0 ? formato(v) : "") },
        tooltip: { callbacks: { label: (ctx) => " " + formato(ctx.raw) } },
      },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}
const gastoDeEventos = (filas) => filas.filter((h) => h.accion === "evento" && h.monto).reduce((acc, h) => {
  const m = Number(h.monto) || 0;
  if (h.tipo_evento === "Carga de combustible") acc.combustible += m; else acc.mantenimiento += m;
  return acc;
}, { combustible: 0, mantenimiento: 0 });
let chartVehGasto = null;
let chartHerrUsos = null;
function renderVehiculosNuevo() {
  const periodo = dashVehPeriodoActivo;
  const rango = obtenerRangoPeriodo(periodo, dashVehFechaEspecifica);
  const [ahora, antes] = textoPeriodoDash(periodo);
  const enRango = dashVehiculosCache.filter((h) => fechaEnRango(h.fecha, rango));
  const g = gastoDeEventos(enRango);
  const rangoAnt = antes ? obtenerRangoPeriodoAnterior(periodo) : null;
  const gAnt = rangoAnt ? gastoDeEventos(dashVehiculosCache.filter((h) => fechaEnRango(h.fecha, rangoAnt))) : null;
  const enUso = dashVehConfigCache.filter((v) => dashVehiculosCache.some((h) => h.vehiculo === v.nombre && h.hora_toma && !h.hora_devolucion)).length;
  const salidas = enRango.filter((h) => h.hora_toma).length;
  const pintado = pintarDashNuevo("dashVehHero", "dashVehTiles", {
    valor: formatoPesosVeh(g.combustible + g.mantenimiento),
    etiqueta: `gastado en la flota ${ahora}`,
    actual: g.combustible + g.mantenimiento, anterior: gAnt ? gAnt.combustible + gAnt.mantenimiento : null, antes, subirEsBueno: false,
    serie: ["dia", "fecha", "todo"].includes(periodo) ? null : serieDiaria(rango, enRango.filter((h) => h.accion === "evento"), (h) => Number(h.monto) || 0),
    tiles: [
      { valor: formatoPesosVeh(g.combustible), etiqueta: "Combustible" },
      { valor: formatoPesosVeh(g.mantenimiento), etiqueta: "Gomería, mecánico y lavadero" },
      { valor: `${enUso}<small> de ${dashVehConfigCache.length}</small>`, etiqueta: "En la calle ahora", estado: enUso === dashVehConfigCache.length && enUso ? "atencion" : "" },
      { valor: salidas, etiqueta: `Salidas ${ahora}` },
    ],
  });
  if (!pintado) { const w = document.getElementById("dashVehGastoWrap"); if (w) w.hidden = true; return; }
  const porVeh = dashVehConfigCache.map((v) => { const x = gastoDeEventos(enRango.filter((h) => h.vehiculo === v.nombre)); return [v.nombre, x.combustible + x.mantenimiento]; })
    .sort((a, b) => b[1] - a[1]);
  chartVehGasto = barrasHorizontalesDash("dashChartVehGasto", "dashVehGastoWrap", chartVehGasto, `Gasto por vehículo ${ahora}`, porVeh.map((x) => x[0]), porVeh.map((x) => x[1]), formatoPesosVeh);
}
function renderVehiculoDetalleNuevo(filtrados) {
  const [ahora, antes] = textoPeriodoDash(dashVehPeriodoActivo);
  const g = gastoDeEventos(filtrados);
  const rangoAnt = antes ? obtenerRangoPeriodoAnterior(dashVehPeriodoActivo) : null;
  const gAnt = rangoAnt ? gastoDeEventos(dashVehiculosCache.filter((h) => h.vehiculo === dashVehVehiculoSeleccionado && fechaEnRango(h.fecha, rangoAnt))) : null;
  const conf = dashVehConfigCache.find((v) => v.nombre === dashVehVehiculoSeleccionado) || {};
  pintarDashNuevo("dashVehDetHero", "dashVehDetTiles", {
    valor: formatoPesosVeh(g.combustible + g.mantenimiento),
    etiqueta: `gastado en este vehículo ${ahora}`,
    actual: g.combustible + g.mantenimiento, anterior: gAnt ? gAnt.combustible + gAnt.mantenimiento : null, antes, subirEsBueno: false,
    tiles: [
      { valor: filtrados.filter((h) => h.hora_toma).length, etiqueta: `Salidas ${ahora}` },
      { valor: filtrados.filter((h) => h.accion === "evento").length, etiqueta: "Eventos registrados" },
      { valor: formatoPesosVeh(g.combustible), etiqueta: "Combustible" },
      { valor: conf.km_actual ? Number(conf.km_actual).toLocaleString("es-AR") : "—", etiqueta: "Km actuales" },
    ],
  });
}
function renderHerramientasNuevo() {
  const rango = obtenerRangoPeriodo("mes");
  const [ahora, antes] = textoPeriodoDash("mes");
  const usos = (filas) => filas.filter((m) => m.accion === "tomar" || m.accion === "dejar_en_cliente");
  const delMes = dashHerramientasCache.filter((m) => fechaEnRango(m.fecha, rango));
  const rangoAnt = obtenerRangoPeriodoAnterior("mes");
  const usosAnt = usos(dashHerramientasCache.filter((m) => fechaEnRango(m.fecha, rangoAnt))).length;
  const total = dashHerrConfigCache.length;
  // Igual que la lista: todo lo que no está "libre" está afuera.
  const enCliente = dashHerrConfigCache.filter((h) => h.estado === "cliente").length;
  const enUso = dashHerrConfigCache.filter((h) => h.estado !== "libre" && h.estado !== "cliente").length;
  const pintado = pintarDashNuevo("dashHerrHero", "dashHerrTiles", {
    valor: `${enUso + enCliente}<small> de ${total}</small>`,
    etiqueta: "herramientas afuera ahora",
    tiles: [
      { valor: total - enUso - enCliente, etiqueta: "Libres en el depósito" },
      { valor: enUso, etiqueta: "En uso por un técnico" },
      { valor: enCliente, etiqueta: "Dejadas en un cliente", estado: enCliente ? "atencion" : "" },
      { valor: usos(delMes).length, etiqueta: `Usos ${ahora}`, nota: antes ? deltaTextoSimple(usos(delMes).length, usosAnt, antes) : "" },
    ],
  });
  if (!pintado) { const w = document.getElementById("dashHerrUsosWrap"); if (w) w.hidden = true; return; }
  const porHerr = dashHerrConfigCache.map((h) => [h.nombre, usos(delMes.filter((m) => m.herramienta === h.nombre)).length]).sort((a, b) => b[1] - a[1]);
  chartHerrUsos = barrasHorizontalesDash("dashChartHerrUsos", "dashHerrUsosWrap", chartHerrUsos, `Más usadas ${ahora}`, porHerr.map((x) => x[0]), porHerr.map((x) => x[1]), (v) => `${v} uso${v === 1 ? "" : "s"}`);
}
function deltaTextoSimple(actual, anterior, antes) {
  if (anterior == null) return "";
  if (anterior === 0) return actual ? `${antes}: ninguno` : "";
  const c = Math.round(((actual - anterior) / anterior) * 100);
  return Math.abs(c) < 1 ? `igual que ${antes}` : `${c > 0 ? "▲" : "▼"} ${Math.abs(c)}% vs. ${antes}`;
}
function renderSimsDashNuevo(filtrados, sims) {
  const periodo = dashSimsPeriodoActivo;
  const rango = obtenerRangoPeriodo(periodo);
  const [ahora, antes] = textoPeriodoDash(periodo);
  const esInst = (h) => h.accion === "usar" || h.accion === "reemplazar";
  const instaladas = filtrados.filter(esInst);
  const rangoAnt = antes ? obtenerRangoPeriodoAnterior(periodo) : null;
  const instAnt = rangoAnt ? dashSimsCache.filter((h) => fechaEnRango(h.fecha, rangoAnt) && esInst(h)).length : null;
  pintarDashNuevo("dashSimsHero", "dashSimsTiles", {
    valor: instaladas.length,
    etiqueta: `SIM${instaladas.length === 1 ? "" : "s"} instalada${instaladas.length === 1 ? "" : "s"} en clientes ${ahora}`,
    actual: instaladas.length, anterior: instAnt, antes,
    serie: ["dia", "todo"].includes(periodo) ? null : serieDiaria(rango, instaladas, () => 1),
    tiles: [
      { valor: dashSimsEnStockNum.textContent, etiqueta: "En stock ahora" },
      { valor: dashSimsEnUsoNum.textContent, etiqueta: "En uso ahora" },
      { valor: filtrados.filter((h) => h.accion === "transferir").length, etiqueta: `Transferencias ${ahora}` },
      { valor: filtrados.filter((h) => h.accion === "devolver" || h.accion === "retirar_de_registro").length, etiqueta: `Devueltas o retiradas ${ahora}` },
    ],
  });
}

function renderResumenGastoFlota() {
  const rango = obtenerRangoPeriodo(dashVehPeriodoActivo, dashVehFechaEspecifica);
  const enRango = dashVehiculosCache.filter((h) => fechaEnRango(h.fecha, rango));
  const eventosConMonto = enRango.filter((h) => h.accion === "evento" && h.monto);
  const gastoCombustible = eventosConMonto.filter((h) => h.tipo_evento === "Carga de combustible").reduce((acc, h) => acc + (Number(h.monto) || 0), 0);
  const gastoMantenimiento = eventosConMonto.filter((h) => h.tipo_evento !== "Carga de combustible").reduce((acc, h) => acc + (Number(h.monto) || 0), 0);
  dashVehGastoCombustibleTotalNum.textContent = gastoCombustible > 0 ? formatoPesosVeh(gastoCombustible) : "—";
  dashVehGastoMantenimientoTotalNum.textContent = gastoMantenimiento > 0 ? formatoPesosVeh(gastoMantenimiento) : "—";
  try { renderVehiculosNuevo(); } catch (e) { /* el resto sigue */ }
}

function renderListaVehiculosDash() {
  const termino = normalizeText(dashVehBuscarInput.value || "");
  const filtrados = !termino ? dashVehConfigCache : dashVehConfigCache.filter((v) => normalizeText(v.nombre || "").includes(termino));

  if (dashVehConfigCache.length === 0) {
    dashVehListaStatus.textContent = "No hay vehículos cargados.";
    dashVehListaVehiculos.innerHTML = "";
    return;
  }
  dashVehListaStatus.textContent = `${filtrados.length} vehículo(s).`;

  dashVehListaVehiculos.innerHTML = filtrados.map((v) => {
    // "Abierto" = tomado y sin devolver todavía — mismo criterio que
    // ya usa el resto de la app para saber si un vehículo está en uso.
    const abierto = dashVehiculosCache.find((h) => h.vehiculo === v.nombre && h.hora_toma && !h.hora_devolucion);
    const estadoTexto = abierto ? `🔴 En uso — ${escapeHtml(abierto.tecnico)}` : "🟢 Libre";
    const cantidad = dashVehiculosCache.filter((h) => h.vehiculo === v.nombre).length;
    return `
      <div class="historial-card" style="cursor:pointer;" data-vehiculo="${escapeHtml(v.nombre)}">
        <div class="historial-card-num">${escapeHtml(v.nombre)}</div>
        <div class="historial-card-cliente">${estadoTexto}</div>
        <div class="historial-card-direccion">${cantidad} registro${cantidad === 1 ? "" : "s"}${v.km_actual ? " · " + Number(v.km_actual).toLocaleString("es-AR") + " km" : ""}</div>
      </div>
    `;
  }).join("");

  dashVehListaVehiculos.querySelectorAll("[data-vehiculo]").forEach((card) => {
    card.addEventListener("click", () => {
      dashVehVehiculoSeleccionado = card.dataset.vehiculo;
      dashVehNombreSeleccionado.textContent = dashVehVehiculoSeleccionado;
      dashVehListaWrap.classList.add("hidden");
      dashVehDetalleWrap.classList.remove("hidden");
      renderDashVehiculos();
    });
  });
}

function filtrarDashVehiculos() {
  const rango = obtenerRangoPeriodo(dashVehPeriodoActivo, dashVehFechaEspecifica);
  return dashVehiculosCache
    .filter((h) => h.vehiculo === dashVehVehiculoSeleccionado && fechaEnRango(h.fecha, rango))
    .sort((a, b) => {
      const claveA = `${a.fecha || ""} ${a.hora_toma || ""}`;
      const claveB = `${b.fecha || ""} ${b.hora_toma || ""}`;
      return claveB.localeCompare(claveA);
    });
}

function renderDashVehiculos() {
  const filtrados = filtrarDashVehiculos();

  // Gasto en combustible vs. gomería/mecánico/lavadero/otro — suma de
  // los montos cargados en "Registrar un evento sin devolver el
  // vehículo", para tener a la vista cuánto se está gastando, no solo
  // el detalle uno por uno en la lista de abajo.
  const eventosConMonto = filtrados.filter((h) => h.accion === "evento" && h.monto);
  const gastoCombustible = eventosConMonto
    .filter((h) => h.tipo_evento === "Carga de combustible")
    .reduce((acc, h) => acc + (Number(h.monto) || 0), 0);
  const gastoMantenimiento = eventosConMonto
    .filter((h) => h.tipo_evento !== "Carga de combustible")
    .reduce((acc, h) => acc + (Number(h.monto) || 0), 0);
  dashVehGastoCombustibleNum.textContent = gastoCombustible > 0 ? formatoPesosVeh(gastoCombustible) : "—";
  dashVehGastoMantenimientoNum.textContent = gastoMantenimiento > 0 ? formatoPesosVeh(gastoMantenimiento) : "—";
  try { renderVehiculoDetalleNuevo(filtrados); } catch (e) { /* el resto sigue */ }

  dashVehiculosList.innerHTML = "";
  if (filtrados.length === 0) {
    dashVehiculosStatus.textContent = "No hay registros para mostrar en ese período.";
    return;
  }
  dashVehiculosStatus.textContent = "";
  filtrados.forEach((h) => {
    let fechaTexto = h.fecha || "";
    if (h.fecha) {
      const [y, m, d] = h.fecha.split("-");
      fechaTexto = `${d}/${m}/${y}`;
    }
    const card = document.createElement("div");
    card.className = "historial-card";
    if (h.accion === "evento") {
      card.innerHTML = `
        <div class="historial-card-num">${escapeHtml(h.vehiculo)}</div>
        <div class="historial-card-cliente">${escapeHtml(h.tecnico)} — ${escapeHtml(h.tipo_evento) || "Evento"}</div>
        <div class="historial-card-direccion">${fechaTexto}${h.hora ? " " + h.hora : ""} — Km: ${h.km || "?"}</div>
        <div class="historial-card-horario">${h.monto ? "Monto: $" + h.monto : ""}${h.detalle ? (h.monto ? " · " : "") + htmlDetalleVehiculo(h.detalle) : ""}</div>
      `;
    } else {
      card.innerHTML = `
        <div class="historial-card-num">${escapeHtml(h.vehiculo)}</div>
        <div class="historial-card-cliente">${escapeHtml(h.tecnico)}</div>
        <div class="historial-card-direccion">${fechaTexto} — ${h.hora_toma || "?"} a ${h.hora_devolucion || "(en uso)"}</div>
        <div class="historial-card-horario">Km devolución: ${h.km_devolucion || "—"}${h.evento ? " · " + escapeHtml(h.evento) : ""}</div>
      `;
    }
    dashVehiculosList.appendChild(card);
  });
}

descargarExcelVehiculosBtn.addEventListener("click", () => {
  const filtrados = filtrarDashVehiculos();
  if (filtrados.length === 0) {
    showToast("No hay datos para descargar en ese período.");
    return;
  }
  const filas = filtrados.map((h) => ({
    Vehículo: h.vehiculo || "",
    Técnico: h.tecnico || "",
    Fecha: h.fecha || "",
    "Tipo de registro": h.accion === "evento" ? "Evento" : "Toma/devolución",
    "Hora toma": h.hora_toma || "",
    "Hora devolución": h.hora_devolucion || "",
    "Km devolución": h.km_devolucion || "",
    Evento: h.evento || "",
    "Tipo de evento": h.tipo_evento || "",
    "Hora del evento": h.hora || "",
    "Km del evento": h.km || "",
    "Monto del evento": h.monto || "",
    "Detalle del evento": h.detalle || "",
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Vehículos");
  const hoy = fechaActualISOVehiculo();
  XLSX.writeFile(libro, `vehiculos_${dashVehVehiculoSeleccionado || "todos"}_${dashVehPeriodoActivo}_${hoy}.xlsx`);
});

// ---------- Dashboard de Herramientas ----------
let dashHerramientasCache = [];
let dashHerrConfigCache = [];
let dashHerrPeriodoActivo = "mes";
let dashHerrHerramientaSeleccionada = "";

verDashboardHerramientasBtn.addEventListener("click", () => {
  dashHerrHerramientaSeleccionada = "";
  dashHerrDetalleWrap.classList.add("hidden");
  dashHerrListaWrap.classList.remove("hidden");
  showScreen("dashboardHerramientas");
  fetchDashHerramientas();
});
volverDeDashboardHerramientasBtn.addEventListener("click", () => showScreen("dashboardsMenu"));
refreshDashHerramientasBtn.addEventListener("click", fetchDashHerramientas);
dashHerrBuscarInput.addEventListener("input", renderListaHerramientasDash);
dashHerrVolverListaBtn.addEventListener("click", () => {
  dashHerrHerramientaSeleccionada = "";
  dashHerrDetalleWrap.classList.add("hidden");
  dashHerrListaWrap.classList.remove("hidden");
});

document.querySelectorAll(".dash-herr-periodo-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".dash-herr-periodo-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    dashHerrPeriodoActivo = chip.dataset.periodo;
    dashHerrFechaEspecificaWrap.classList.toggle("hidden", dashHerrPeriodoActivo !== "fecha");
    if (dashHerrPeriodoActivo === "fecha" && !dashHerrFechaEspecifica.value) {
      dashHerrFechaEspecifica.value = fechaLocalISO();
    }
    renderDashHerramientas();
  });
});
dashHerrFechaEspecifica.addEventListener("change", renderDashHerramientas);

async function fetchDashHerramientas() {
  dashHerrListaStatus.textContent = "Cargando...";
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const [herramientas, res] = await Promise.all([
      fetchHerramientasConfig().catch(() => []),
      fetch("/api/recurso-uso?recurso=herramienta", { headers, cache: "no-store" }),
    ]);
    if (!res.ok) throw new Error("HTTP " + res.status);
    dashHerramientasCache = await res.json();
    if (!Array.isArray(dashHerramientasCache)) dashHerramientasCache = [];
    dashHerrConfigCache = Array.isArray(herramientas) ? herramientas : [];
    dashHerramientasSyncLabel.textContent = formatSyncTime(new Date());
    renderListaHerramientasDash();
    try { renderHerramientasNuevo(); } catch (e) { /* el resto sigue */ }
    if (dashHerrHerramientaSeleccionada) renderDashHerramientas();
  } catch (err) {
    dashHerrListaStatus.textContent = "No se pudo cargar el historial de herramientas.";
  }
}

function renderListaHerramientasDash() {
  const termino = normalizeText(dashHerrBuscarInput.value || "");
  // Se lista el catálogo completo (no solo las que ya tienen
  // movimientos) para poder elegir cualquiera, incluso una que
  // todavía no registró nada.
  const filtradas = !termino ? dashHerrConfigCache : dashHerrConfigCache.filter((h) => normalizeText(h.nombre || "").includes(termino));

  if (dashHerrConfigCache.length === 0) {
    dashHerrListaStatus.textContent = "No hay herramientas cargadas.";
    dashHerrListaHerramientas.innerHTML = "";
    return;
  }
  dashHerrListaStatus.textContent = `${filtradas.length} herramienta(s).`;

  dashHerrListaHerramientas.innerHTML = filtradas.map((h) => {
    const cantidad = dashHerramientasCache.filter((m) => m.herramienta === h.nombre).length;
    const estadoTexto = h.estado === "libre" ? "🟢 Libre" : `🔴 En uso${h.tecnico_actual ? " — " + escapeHtml(h.tecnico_actual) : ""}`;
    return `
      <div class="historial-card" style="cursor:pointer;" data-herramienta="${escapeHtml(h.nombre)}">
        <div class="historial-card-num">${escapeHtml(h.nombre)}</div>
        <div class="historial-card-cliente">${estadoTexto}</div>
        <div class="historial-card-direccion">${cantidad} movimiento${cantidad === 1 ? "" : "s"} registrado${cantidad === 1 ? "" : "s"}</div>
      </div>
    `;
  }).join("");

  dashHerrListaHerramientas.querySelectorAll("[data-herramienta]").forEach((card) => {
    card.addEventListener("click", () => {
      dashHerrHerramientaSeleccionada = card.dataset.herramienta;
      dashHerrNombreSeleccionado.textContent = dashHerrHerramientaSeleccionada;
      dashHerrListaWrap.classList.add("hidden");
      dashHerrDetalleWrap.classList.remove("hidden");
      renderDashHerramientas();
    });
  });
}

function filtrarDashHerramientas() {
  const rango = obtenerRangoPeriodo(dashHerrPeriodoActivo, dashHerrFechaEspecifica);
  return dashHerramientasCache
    .filter((h) => h.herramienta === dashHerrHerramientaSeleccionada && fechaEnRango(h.fecha, rango))
    .sort((a, b) => {
      const claveA = `${a.fecha || ""} ${a.hora || ""}`;
      const claveB = `${b.fecha || ""} ${b.hora || ""}`;
      return claveB.localeCompare(claveA);
    });
}

// Un solo texto por acción, para que la tarjeta cuente "toda la
// trazabilidad" de un vistazo — quién, qué hizo, y con qué cliente
// (cuando corresponde), sin tener que adivinar según el campo.
function descripcionAccionHerramienta(h) {
  if (h.accion === "tomar") return `${h.tecnico} la tomó`;
  if (h.accion === "devolver") return `${h.tecnico} la devolvió`;
  if (h.accion === "transferir") return `${h.tecnico} se la transfirió a ${h.detalle || "otro técnico"}`;
  if (h.accion === "dejar_en_cliente") return `${h.tecnico} la dejó en ${h.cliente || "un cliente"}`;
  if (h.accion === "retirar_de_cliente") return `${h.tecnico} la retiró de ${h.cliente || "un cliente"}`;
  return `${h.tecnico} — ${h.accion || "movimiento"}`;
}

function renderDashHerramientas() {
  const filtrados = filtrarDashHerramientas();
  dashHerramientasList.innerHTML = "";
  if (filtrados.length === 0) {
    dashHerramientasStatus.textContent = "No hay registros para mostrar en ese período.";
    return;
  }
  dashHerramientasStatus.textContent = `${filtrados.length} registro(s).`;
  filtrados.forEach((h) => {
    let fechaTexto = h.fecha || "";
    if (h.fecha) {
      const [y, m, d] = h.fecha.split("-");
      fechaTexto = `${d}/${m}/${y}`;
    }
    const card = document.createElement("div");
    card.className = "historial-card";
    card.innerHTML = `
      <div class="historial-card-num">${escapeHtml(h.herramienta)}</div>
      <div class="historial-card-cliente">${escapeHtml(descripcionAccionHerramienta(h))}</div>
      <div class="historial-card-direccion">${fechaTexto}${h.hora ? " — " + h.hora : ""}</div>
      ${h.detalle && h.accion !== "transferir" ? `<div class="historial-card-horario">💬 ${escapeHtml(h.detalle)}</div>` : ""}
    `;
    dashHerramientasList.appendChild(card);
  });
}

descargarExcelHerramientasBtn.addEventListener("click", () => {
  const filtrados = filtrarDashHerramientas();
  if (filtrados.length === 0) {
    showToast("No hay datos para descargar en ese período.");
    return;
  }
  const filas = filtrados.map((h) => ({
    Herramienta: h.herramienta || "",
    Técnico: h.tecnico || "",
    Acción: h.accion || "",
    Fecha: h.fecha || "",
    Hora: h.hora || "",
    "Cliente (si corresponde)": h.cliente || "",
    "Transferida a (si corresponde)": h.accion === "transferir" ? h.detalle || "" : "",
    Descripción: descripcionAccionHerramienta(h),
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Herramientas");
  const hoy = fechaActualISOVehiculo();
  XLSX.writeFile(libro, `herramientas_${dashHerrHerramientaSeleccionada || "todas"}_${dashHerrPeriodoActivo}_${hoy}.xlsx`);
});

// ---------- Dashboard de SIMs ----------
let dashSimsCache = [];
let chartSimsGeneral = null;
let chartsSimsPorTecnico = {};
const COLORES_COMPANIA_SIM = { Movistar: "#2E9E4F", Personal: "#29ABE2", Claro: "#E4402C" };
let dashSimsPeriodoActivo = "mes";
let dashSimsGruposExpandidos = new Set(); // técnicos que el usuario dejó desplegados

verDashboardSimsBtn.addEventListener("click", () => {
  showScreen("dashboardSims");
  fetchDashSims();
});
volverDeDashboardSimsBtn.addEventListener("click", () => showScreen("dashboardsMenu"));
refreshDashSimsBtn.addEventListener("click", fetchDashSims);
document.querySelectorAll(".dash-sims-periodo-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".dash-sims-periodo-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    dashSimsPeriodoActivo = chip.dataset.periodo;
    renderDashSims();
  });
});

async function fetchDashSims() {
  dashSimsStatus.textContent = "Cargando...";
  dashSimsList.innerHTML = "";
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const [resHistorial, sims] = await Promise.all([
      fetch("/api/recurso-uso?recurso=sim", { headers, cache: "no-store" }),
      fetchSimsConfig().catch(() => []),
    ]);
    if (!resHistorial.ok) throw new Error("HTTP " + resHistorial.status);
    const data = await resHistorial.json();
    dashSimsCache = Array.isArray(data) ? data : [];
    dashSimsSyncLabel.textContent = formatSyncTime(new Date());

    // Foto actual (no depende del período elegido): cuántas SIMs
    // están en stock vs. instaladas en un cliente en este momento.
    dashSimsEnStockNum.textContent = sims.filter((s) => s.estado === "stock").length;
    dashSimsEnUsoNum.textContent = sims.filter((s) => s.estado === "uso").length;

    renderDashSims();
  } catch (err) {
    dashSimsStatus.textContent = "No se pudo cargar el historial de SIMs.";
  }
}

const ETIQUETA_ACCION_SIM = { usar: "Usada en cliente", devolver: "Devuelta a stock", transferir: "Transferida", reemplazar: "Reemplazo en cliente", transferencia_pendiente: "Transferencia enviada", transferencia_aceptada: "Transferencia aceptada", transferencia_rechazada: "Transferencia rechazada", transferencia_cancelada: "Transferencia cancelada", retirar_de_registro: "Retirada de un cliente", marcar_defectuosa: "Marcada defectuosa", marcar_extraviada: "Marcada extraviada", marcar_disponible: "Marcada disponible", alta: "Alta en el stock", baja: "Dada de baja", editar: "Corrección de datos", editar_instalada: "Datos corregidos" };

function filtrarDashSims() {
  const rango = obtenerRangoPeriodo(dashSimsPeriodoActivo);
  return dashSimsCache
    .filter((h) => fechaEnRango(h.fecha, rango))
    .sort((a, b) => {
      const claveA = `${a.fecha || ""} ${a.hora || ""}`;
      const claveB = `${b.fecha || ""} ${b.hora || ""}`;
      return claveB.localeCompare(claveA);
    });
}

function renderDashSims() {
  const filtrados = filtrarDashSims();
  try { renderSimsDashNuevo(filtrados); } catch (e) { /* el resto sigue */ }
  dashSimsList.innerHTML = "";
  renderChartsSims(filtrados);
  if (filtrados.length === 0) {
    dashSimsStatus.textContent = "No hay movimientos para mostrar en ese período.";
    return;
  }
  dashSimsStatus.textContent = "";

  // Se agrupa por técnico — complementa el gráfico de arriba (que ya
  // muestra cuántos movimientos hizo cada uno) dejando entrar al
  // detalle de cuáles fueron, sin tener que scrollear una lista
  // plana mezclada con la de todos los demás.
  const gruposMapa = new Map();
  filtrados.forEach((h) => {
    const clave = h.tecnico || "Sin técnico";
    if (!gruposMapa.has(clave)) gruposMapa.set(clave, []);
    gruposMapa.get(clave).push(h);
  });

  // Orden: el técnico con más movimientos primero.
  const grupos = [...gruposMapa.entries()]
    .map(([tecnico, movimientos]) => ({ tecnico, movimientos }))
    .sort((a, b) => b.movimientos.length - a.movimientos.length);

  grupos.forEach((grupo) => {
    const conteoPorAccion = {};
    grupo.movimientos.forEach((h) => {
      const etiqueta = ETIQUETA_ACCION_SIM[h.accion] || h.accion;
      conteoPorAccion[etiqueta] = (conteoPorAccion[etiqueta] || 0) + 1;
    });
    const resumenAcciones = Object.entries(conteoPorAccion).map(([etiqueta, n]) => `${n}× ${etiqueta}`).join(" · ");

    const expandido = dashSimsGruposExpandidos.has(grupo.tecnico);
    const card = document.createElement("div");
    card.className = "historial-card";

    const cabecera = document.createElement("div");
    cabecera.style.cursor = "pointer";
    cabecera.innerHTML = `
      <div class="historial-card-header-izq">
        <div class="historial-card-num">${escapeHtml(grupo.tecnico)}</div>
        <span style="margin-left:auto; color:#8A9089;">${expandido ? "▲" : "▼"}</span>
      </div>
      <div class="historial-card-cliente">${grupo.movimientos.length} movimiento${grupo.movimientos.length === 1 ? "" : "s"}</div>
      <div class="historial-card-horario">${resumenAcciones}</div>
    `;
    cabecera.addEventListener("click", () => {
      if (dashSimsGruposExpandidos.has(grupo.tecnico)) dashSimsGruposExpandidos.delete(grupo.tecnico);
      else dashSimsGruposExpandidos.add(grupo.tecnico);
      renderDashSims();
    });
    card.appendChild(cabecera);

    if (expandido) {
      const detalleWrap = document.createElement("div");
      detalleWrap.style.cssText = "margin-top:10px; padding-top:10px; border-top:1px dashed #D8DCD4;";
      grupo.movimientos.forEach((h) => {
        let fechaTexto = h.fecha || "";
        if (h.fecha) {
          const [y, m, d] = h.fecha.split("-");
          fechaTexto = `${d}/${m}/${y}`;
        }
        let detalle = "";
        if (h.accion === "usar") detalle = `Cliente: ${escapeHtml(h.cliente) || "?"}`;
        else if (h.accion === "transferir") detalle = `A: ${escapeHtml(h.tecnico_nuevo) || "?"}`;
        else if (h.accion === "reemplazar") detalle = `Cliente: ${escapeHtml(h.cliente) || "?"} · reemplazó a la SIM ${escapeHtml(h.sim_retirada) || "?"} (${escapeHtml(h.empresa_retirada) || "?"})`;

        const linea = document.createElement("div");
        linea.style.cssText = "padding:8px 0; border-bottom:1px solid #F4F5F0;";
        linea.innerHTML = `
          <div class="historial-card-num">${h.empresa || ""} · ${escapeHtml(h.numero)}</div>
          <div class="historial-card-cliente">${ETIQUETA_ACCION_SIM[h.accion] || h.accion}</div>
          <div class="historial-card-direccion">${fechaTexto}${h.hora ? " " + h.hora : ""}</div>
          <div class="historial-card-horario">${detalle}</div>
        `;
        detalleWrap.appendChild(linea);
      });
      card.appendChild(detalleWrap);
    }

    dashSimsList.appendChild(card);
  });
}

// Cuenta como "uso" las acciones que reflejan una SIM instalada en un
// cliente (usar y reemplazar) — transferir/devolver son movimientos de
// stock, no reflejan tendencia de uso por compañía.
function renderChartsSims(movimientos) {
  const eventosUso = movimientos.filter((h) => h.accion === "usar" || h.accion === "reemplazar");

  const generalCanvas = document.getElementById("dashSimsChartGeneral");
  if (chartSimsGeneral) chartSimsGeneral.destroy();
  Object.values(chartsSimsPorTecnico).forEach((c) => c.destroy());
  chartsSimsPorTecnico = {};
  dashSimsChartsPorTecnico.innerHTML = "";

  if (eventosUso.length === 0) {
    generalCanvas.getContext("2d").clearRect(0, 0, generalCanvas.width, generalCanvas.height);
    dashSimsChartsPorTecnico.innerHTML = '<p class="list-status">No hay uso de SIMs para graficar en este período.</p>';
    return;
  }

  const empresas = ["Movistar", "Personal", "Claro"];
  const colores = empresas.map((e) => COLORES_COMPANIA_SIM[e]);

  function contarPorEmpresa(lista) {
    const conteo = { Movistar: 0, Personal: 0, Claro: 0 };
    lista.forEach((h) => { if (conteo[h.empresa] !== undefined) conteo[h.empresa]++; else conteo[h.empresa] = (conteo[h.empresa] || 0) + 1; });
    return conteo;
  }

  const conteoGeneral = contarPorEmpresa(eventosUso);
  chartSimsGeneral = new Chart(generalCanvas, {
    type: "pie",
    data: {
      labels: empresas,
      datasets: [{ data: empresas.map((e) => conteoGeneral[e] || 0), backgroundColor: colores }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" }, title: { display: false }, datalabels: DATALABELS_PORCENTAJE },
    },
  });

  const porTecnico = {};
  eventosUso.forEach((h) => {
    const nombre = h.tecnico || "Sin técnico";
    if (!porTecnico[nombre]) porTecnico[nombre] = [];
    porTecnico[nombre].push(h);
  });

  Object.keys(porTecnico).sort().forEach((nombre) => {
    const wrap = document.createElement("div");
    wrap.className = "dash-chart-wrap";
    const titulo = document.createElement("p");
    titulo.className = "list-status";
    titulo.style.margin = "0 0 4px";
    titulo.textContent = nombre;
    const canvas = document.createElement("canvas");
    canvas.style.maxHeight = "160px";
    wrap.appendChild(titulo);
    wrap.appendChild(canvas);
    dashSimsChartsPorTecnico.appendChild(wrap);

    const conteo = contarPorEmpresa(porTecnico[nombre]);
    chartsSimsPorTecnico[nombre] = new Chart(canvas, {
      type: "pie",
      data: {
        labels: empresas,
        datasets: [{ data: empresas.map((e) => conteo[e] || 0), backgroundColor: colores }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 10 } } }, datalabels: DATALABELS_PORCENTAJE },
      },
    });
  });
}

descargarExcelSimsDashBtn.addEventListener("click", () => {
  const filtrados = filtrarDashSims();
  if (filtrados.length === 0) {
    showToast("No hay datos para descargar en ese período.");
    return;
  }
  const filas = filtrados.map((h) => ({
    Empresa: h.empresa || "",
    Número: h.numero || "",
    Técnico: h.tecnico || "",
    Acción: ETIQUETA_ACCION_SIM[h.accion] || h.accion || "",
    Fecha: h.fecha || "",
    Cliente: h.cliente || "",
    "Transferida a": h.tecnico_nuevo || "",
    "SIM retirada (reemplazo)": h.sim_retirada || "",
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "SIMs");
  XLSX.writeFile(libro, `sims_${dashSimsPeriodoActivo}_${fechaActualISOVehiculo()}.xlsx`);
});

// ---------- Descarga a Excel de los dashboards general y financiero ----------
// Solo Sebastian Bartolozzi (o el login general de oficina) ven estos
// botones — el resto de los técnicos puede ver los dashboards pero no
// descargarlos.
function actualizarAccesoExcelDashboards() {
  const permisos = permisosDelTecnico(tecnicoLogueado);
  descargarExcelDashboardBtn.classList.toggle("hidden", !permisos.dash_general);
  descargarExcelDashboardFinBtn.classList.toggle("hidden", !permisos.dash_financiero);
  descargarExcelVehiculosBtn.classList.toggle("hidden", !permisos.dash_vehiculos);
  descargarExcelSimsDashBtn.classList.toggle("hidden", !permisos.dash_sims);

  // El blanqueo del historial de SIMs es una acción destructiva —
  // queda atada al permiso de Administración.
  blanquearHistorialSimsBtn.classList.toggle("hidden", !permisos.admin);
}

blanquearHistorialSimsBtn.addEventListener("click", async () => {
  const confirmar = window.confirm(
    "Esto borra TODO el historial de movimientos de SIMs (usar/devolver/transferir/reemplazar) de forma permanente.\n\n" +
    "No afecta qué SIM tiene cada técnico ahora mismo, solo el historial de este dashboard.\n\n" +
    "¿Confirmás que querés blanquearlo?"
  );
  if (!confirmar) return;

  blanquearHistorialSimsBtn.disabled = true;
  try {
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ recurso: "sim",
        accion: "blanquear_historial", tecnico: tecnicoLogueado || "" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast("Historial de SIMs blanqueado.");
    fetchDashSims();
  } catch (err) {
    showToast("No se pudo blanquear: " + err.message);
  } finally {
    blanquearHistorialSimsBtn.disabled = false;
  }
});

descargarExcelDashboardBtn.addEventListener("click", () => {
  if (ultimoEnPeriodoGeneral.length === 0) {
    showToast("No hay datos para descargar en ese período.");
    return;
  }
  const filas = ultimoEnPeriodoGeneral.map((h) => ({
    "N° servicio": h.numero_servicio || h.id_parte || "",
    Tipo: h.es_instalacion ? "Instalación" : "Servicio técnico",
    Cliente: h.cliente || "",
    Dirección: h.direccion || "",
    Localidad: h.localidad || "",
    Técnico: h.tecnico || "",
    "Segundo técnico": h.tecnico2 || "",
    Fecha: h.fecha || "",
    "Hora entrada": h.hora_entrada || "",
    "Hora salida": h.hora_salida || "",
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Dashboard");
  XLSX.writeFile(libro, `dashboard_${dashPeriodoActivo}_${fechaActualISOVehiculo()}.xlsx`);
});

descargarExcelDashboardFinBtn.addEventListener("click", () => {
  if (ultimoEnPeriodoFinanciero.length === 0) {
    showToast("No hay datos para descargar en ese período.");
    return;
  }
  const filas = ultimoEnPeriodoFinanciero.map((h) => ({
    "N° servicio": h.numero_servicio || h.id_parte || "",
    Cliente: h.cliente || "",
    Técnico: h.tecnico || "",
    Fecha: h.fecha || "",
    Importe: h.importe || "",
    Descuento: h.descuento || "",
    "Costo final": h.costo_final || "",
    "Forma de pago": h.forma_pago || "",
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Financiero");
  XLSX.writeFile(libro, `dashboard_financiero_${dashFinPeriodoActivo}_${fechaActualISOVehiculo()}.xlsx`);
});

// ---------- Notificaciones push ----------
// Convierte la clave pública VAPID (base64 url-safe) al formato de
// bytes que pide pushManager.subscribe.
function convertirClaveVapid(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function verificarEstadoNotificaciones() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    activarNotificacionesBtn.classList.add("hidden");
    return;
  }
  try {
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.getSubscription();
    try {
      const nuevoSkin = document.documentElement.dataset.inicio === "nuevo";
      const resuelto = !!suscripcion || Notification.permission === "denied";
      activarNotificacionesBtn.classList.toggle("oculto-nuevo", nuevoSkin && resuelto);
      const t = document.getElementById("ajusteNotifTexto"), b = document.getElementById("ajusteNotifBtn");
      if (t) t.textContent = suscripcion ? "Activadas en este celular." : Notification.permission === "denied" ? "Bloqueadas: hay que habilitarlas desde los permisos del navegador." : "Desactivadas.";
      if (b) b.classList.toggle("hidden", !!suscripcion || Notification.permission === "denied");
    } catch (e) { /* nada */ }
    activarNotificacionesBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" style="vertical-align:-2px; margin-right:4px;"><path d="M12 3a5 5 0 0 0-5 5c0 6-3 8-3 8h16s-3-2-3-8a5 5 0 0 0-5-5z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>${suscripcion ? "Notificaciones activadas" : "Activar notificaciones"}`;
    // Notificaciones activadas por defecto: si nunca se le preguntó
    // a este navegador (Notification.permission === "default", ni
    // aceptó ni rechazó antes), se dispara sola la activación al
    // entrar — no hace falta que el técnico busque el botón. Si en
    // algún momento lo rechazó explícitamente ("denied"), no se
    // vuelve a insistir — solo puede reactivarlo él mismo, a mano,
    // con el botón (que sigue estando siempre disponible para
    // desactivar/reactivar cuando quiera).
    if (!suscripcion && Notification.permission === "default") {
      await activarNotificacionesFlow(/* silencioso */ true);
    }
  } catch (err) {
    // si falla la verificación, se deja el botón con su texto por defecto
  }
}

async function activarNotificacionesFlow(silencioso) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    if (!silencioso) showToast("Este celular/navegador no admite notificaciones push.");
    return;
  }
  activarNotificacionesBtn.disabled = true;
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") {
      if (!silencioso) showToast("No se activaron las notificaciones — hace falta el permiso.");
      return;
    }
    const registro = await navigator.serviceWorker.ready;
    let suscripcion = await registro.pushManager.getSubscription();
    if (!suscripcion) {
      suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertirClaveVapid(VAPID_PUBLIC_KEY),
      });
    }
    const res = await fetch("/api/datos?coleccion=push-subscripciones", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ ...suscripcion.toJSON(), tecnico: tecnicoLogueado || "" }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    activarNotificacionesBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" style="vertical-align:-2px; margin-right:4px;"><path d="M12 3a5 5 0 0 0-5 5c0 6-3 8-3 8h16s-3-2-3-8a5 5 0 0 0-5-5z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>Notificaciones activadas';
    if (!silencioso) showToast("Notificaciones activadas.");
  } catch (err) {
    if (!silencioso) showToast("No se pudo activar las notificaciones: " + err.message);
  } finally {
    activarNotificacionesBtn.disabled = false;
  }
}

activarNotificacionesBtn.addEventListener("click", () => activarNotificacionesFlow(false));

// Registrar service worker para instalación como PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ---------- Actualizar app a la última versión (sin desinstalar) ----------
actualizarAppBtn.addEventListener("click", async () => {
  actualizarAppBtn.disabled = true;
  actualizarAppStatus.classList.remove("hidden");
  actualizarAppStatus.textContent = "Actualizando...";
  try {
    if ("caches" in window) {
      const nombres = await caches.keys();
      await Promise.all(nombres.map((n) => caches.delete(n)));
    }
    if ("serviceWorker" in navigator) {
      const registros = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registros.map((r) => r.unregister()));
    }
  } catch (err) {
    console.error("Error actualizando la app:", err);
  } finally {
    // Se recarga sin usar ninguna copia guardada, para bajar todo de nuevo.
    location.reload();
  }
});

// ---------- Herramientas especiales (escaleras, computadora, taladros, etc.) ----------
let herramientaSeleccionada = "";

async function fetchHerramientasConfig() {
  const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
  const res = await fetch("/api/datos?coleccion=herramientas", { headers, cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

tileHerramientasBtn.addEventListener("click", () => {
  showScreen("herramientas");
  renderHerramientasPicker();
});
volverDeHerramientasBtn.addEventListener("click", () => showScreen("home"));
volverDeHerramientaDetalleBtn.addEventListener("click", () => showScreen("herramientas"));

function claseYTextoEstadoHerramienta(h) {
  if (h.estado === "cliente") return { clase: "tile-herr-cliente", texto: `En ${h.cliente || "un cliente"} (${h.tecnico_actual || "?"})` };
  if (h.estado === "uso") return { clase: "tile-herr-uso", texto: `En uso: ${h.tecnico_actual || "?"}` };
  return { clase: "tile-herr-libre", texto: "Libre" };
}

function iconoSvgHerramienta(tipo) {
  if (tipo === "escalera") {
    return '<line x1="7" y1="3" x2="7" y2="21"/><line x1="17" y1="3" x2="17" y2="21"/><line x1="7" y1="7" x2="17" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="17" x2="17" y2="17"/>';
  }
  if (tipo === "computadora") {
    return '<rect x="5" y="4" width="14" height="9" rx="1"/><path d="M3 18h18l-1.5-3h-15z"/>';
  }
  if (tipo === "electrica") {
    return '<rect x="4" y="10" width="9" height="5" rx="1"/><path d="M13 11l6-2v7l-6-2z"/><line x1="7" y1="15" x2="7" y2="19"/>';
  }
  // "otro" / sin tipo cargado -> caja de herramientas genérica
  return '<path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="4" y1="12" x2="20" y2="12"/>';
}

async function renderHerramientasPicker() {
  herramientasListaStatus.textContent = "Cargando...";
  herramientasPanelTiles.innerHTML = "";
  try {
    const herramientas = await fetchHerramientasConfig();
    if (herramientas.length === 0) {
      herramientasListaStatus.textContent = "Todavía no hay herramientas cargadas.";
      return;
    }
    herramientasListaStatus.textContent = "";
    herramientas.forEach((h) => {
      const { clase, texto } = claseYTextoEstadoHerramienta(h);
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = `panel-tile panel-tile-grid ${clase}`;
      tile.innerHTML = `
        <span class="panel-tile-icon-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconoSvgHerramienta(h.tipo)}</svg>
        </span>
        <span class="panel-tile-label">${h.nombre}</span>
        <span class="vehiculo-panel-status" style="color:#101820;">${texto}</span>
      `;
      tile.addEventListener("click", () => {
        herramientaSeleccionada = h.nombre;
        showScreen("herramientaDetalle");
        renderHerramientaDetalle();
      });
      herramientasPanelTiles.appendChild(tile);
    });
  } catch (err) {
    herramientasListaStatus.textContent = "No se pudo cargar la lista de herramientas.";
  }
}

async function renderHerramientaDetalle() {
  herramientaDetalleStatus.textContent = "Cargando...";
  herramientaSoloLecturaInfo.classList.add("hidden");
  herramientaTomarWrap.classList.add("hidden");
  herramientaEnUsoWrap.classList.add("hidden");
  herramientaEnClienteWrap.classList.add("hidden");
  herramientaDevolverObservacion.value = "";
  try {
    const herramientas = await fetchHerramientasConfig();
    const h = herramientas.find((x) => x.nombre === herramientaSeleccionada);
    if (!h) {
      herramientaDetalleStatus.textContent = "No se encontró esa herramienta.";
      return;
    }
    herramientaDetalleNombre.textContent = h.nombre;
    herramientaDetalleStatus.textContent = "";

    const esMia = h.tecnico_actual === (tecnicoLogueado || "");

    if (h.estado === "libre") {
      herramientaTomarWrap.classList.remove("hidden");
      return;
    }

    if (h.estado === "uso" && esMia) {
      herramientaClienteInput.value = "";
      const otrosTecnicos = Object.keys(tecnicosPasswords).filter((n) => n !== tecnicoLogueado).sort();
      herramientaTecnicoNuevoSelect.innerHTML =
        '<option value="" disabled selected>Elegí un técnico</option>' +
        otrosTecnicos.map((n) => `<option value="${n}">${n}</option>`).join("");
      herramientaEnUsoWrap.classList.remove("hidden");
      return;
    }

    if (h.estado === "cliente") {
      // Cualquier técnico puede retirarla de donde quedó, no solo
      // quien la dejó — en la práctica, puede pasar a buscarla otro.
      herramientaEnClienteWrap.classList.remove("hidden");
      herramientaSoloLecturaInfo.textContent = `${h.tecnico_actual || "Alguien"} la dejó en ${h.cliente || "un cliente"}.`;
      herramientaSoloLecturaInfo.classList.remove("hidden");
      return;
    }

    // En uso, pero por otro técnico — solo informativo.
    herramientaSoloLecturaInfo.textContent = `La tiene ${h.tecnico_actual || "alguien"} en este momento.`;
    herramientaSoloLecturaInfo.classList.remove("hidden");
  } catch (err) {
    herramientaDetalleStatus.textContent = "No se pudo cargar la información de esta herramienta.";
  }
}

async function llamarHerramientaUso(accion, extra) {
  const res = await fetch("/api/recurso-uso", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
    body: JSON.stringify({
      recurso: "herramienta",
      accion,
      nombre: herramientaSeleccionada,
      tecnico: tecnicoLogueado || "",
      hora: horaActualHHMM(),
      ...extra,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error desconocido");
  return data;
}

herramientaTomarBtn.addEventListener("click", async () => {
  herramientaTomarBtn.disabled = true;
  try {
    await llamarHerramientaUso("tomar");
    showToast(`Tomaste "${herramientaSeleccionada}".`);
    showScreen("herramientas");
    renderHerramientasPicker();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  } finally {
    herramientaTomarBtn.disabled = false;
  }
});

herramientaDevolverBtn.addEventListener("click", async () => {
  herramientaDevolverBtn.disabled = true;
  try {
    const observacion = herramientaDevolverObservacion.value.trim();
    await llamarHerramientaUso("devolver", observacion ? { detalle: observacion } : {});
    herramientaDevolverObservacion.value = "";
    showToast(`Devolviste "${herramientaSeleccionada}".`);
    showScreen("herramientas");
    renderHerramientasPicker();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  } finally {
    herramientaDevolverBtn.disabled = false;
  }
});

herramientaDejarEnClienteBtn.addEventListener("click", async () => {
  const cliente = herramientaClienteInput.value.trim();
  if (!cliente) {
    showToast("Escribí el nombre del cliente.");
    return;
  }
  herramientaDejarEnClienteBtn.disabled = true;
  try {
    await llamarHerramientaUso("dejar_en_cliente", { cliente });
    showToast(`Quedó registrado que dejaste "${herramientaSeleccionada}" en ${cliente}.`);
    showScreen("herramientas");
    renderHerramientasPicker();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  } finally {
    herramientaDejarEnClienteBtn.disabled = false;
  }
});

herramientaTransferirBtn.addEventListener("click", async () => {
  const tecnicoNuevo = herramientaTecnicoNuevoSelect.value;
  if (!tecnicoNuevo) {
    showToast("Elegí a qué técnico transferírsela.");
    return;
  }
  herramientaTransferirBtn.disabled = true;
  try {
    await llamarHerramientaUso("transferir", { tecnico_nuevo: tecnicoNuevo });
    showToast(`Transferiste "${herramientaSeleccionada}" a ${tecnicoNuevo}.`);
    showScreen("herramientas");
    renderHerramientasPicker();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  } finally {
    herramientaTransferirBtn.disabled = false;
  }
});

herramientaRetirarBtn.addEventListener("click", async () => {
  herramientaRetirarBtn.disabled = true;
  try {
    await llamarHerramientaUso("retirar_de_cliente");
    showToast(`Retiraste "${herramientaSeleccionada}" — vuelve a tu stock.`);
    showScreen("herramientas");
    renderHerramientasPicker();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  } finally {
    herramientaRetirarBtn.disabled = false;
  }
});

// ---------- Contrato de comodato ----------
let comodatoBienesAgregados = [];
let comodatoHasSignature = false;
let comodatoDrawing = false;
let comodatoLastX = 0;
let comodatoLastY = 0;
const comodatoCtx = comodatoSignCanvas.getContext("2d");

function MESES_ES() {
  return ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
}

function poblarCategoriasComodato() {
  const opciones = materialesCatalogo.map((c) => `<option value="${c.categoria}">${c.categoria}</option>`).join("");
  comBienCategoriaSelect.innerHTML = `<option value="" disabled selected>Elegí una categoría</option>${opciones}`;
}

comBienCategoriaSelect.addEventListener("change", () => {
  const cat = materialesCatalogo.find((c) => c.categoria === comBienCategoriaSelect.value);
  if (!cat) {
    comBienModeloSelect.innerHTML = '<option value="" disabled selected>Elegí primero una categoría</option>';
    comBienModeloSelect.disabled = true;
    return;
  }
  const opciones = cat.modelos.map((m) => `<option value="${m}">${m}</option>`).join("");
  comBienModeloSelect.innerHTML = `<option value="" disabled selected>Modelo</option>${opciones}`;
  comBienModeloSelect.disabled = false;
});

comBienAgregarBtn.addEventListener("click", () => {
  const modelo = comBienModeloSelect.value;
  const cantidad = parseInt(comBienCantidadInput.value, 10) || 1;
  if (!modelo) {
    showToast("Elegí una categoría y un modelo antes de agregar.");
    return;
  }
  comodatoBienesAgregados.push({ modelo, cantidad });
  renderComodatoBienesAgregados();
  comBienModeloSelect.value = "";
  comBienCantidadInput.value = "1";
});

function renderComodatoBienesAgregados() {
  comBienesAgregadosList.innerHTML = "";
  comodatoBienesAgregados.forEach((item, idx) => {
    const fila = document.createElement("div");
    fila.className = "material-agregado-item";
    fila.innerHTML = `<span>${item.modelo} x${item.cantidad}</span>`;
    const quitarBtn = document.createElement("button");
    quitarBtn.type = "button";
    quitarBtn.textContent = "✕";
    quitarBtn.addEventListener("click", () => {
      comodatoBienesAgregados.splice(idx, 1);
      renderComodatoBienesAgregados();
    });
    fila.appendChild(quitarBtn);
    comBienesAgregadosList.appendChild(fila);
  });
}

function getBienesComodatoTexto() {
  const agregados = comodatoBienesAgregados.map((item) => `${item.modelo} x${item.cantidad}`);
  const otro = comFDOtroArticulo.value.trim();
  return [...agregados, otro].filter(Boolean).join(", ");
}

// ---------- Borrador del comodato en curso ----------
// Mismo mecanismo que el borrador de partes: si el técnico carga
// datos en el formulario de comodato y toca "Cancelar" (o cierra la
// app) antes de firmar y enviar, lo que ya había cargado no se
// pierde. A diferencia de los partes, acá no hay un número de
// servicio para usar como clave — como en la práctica hay como mucho
// un comodato en curso a la vez, alcanza con una sola clave fija.
const CLAVE_BORRADOR_COMODATO = "borrador_comodato";

function armarBorradorComodato() {
  return {
    comodatario: comFDNombre.value,
    direccion_comodatario: comFDDireccion.value,
    ciudad_comodatario: comFDCiudad.value,
    otro_representante: comFDOtroRepresentanteCheck.checked,
    representado_por: comFDRepresentado.value,
    cliente_email: comFDClienteEmail.value,
    bienes_agregados: comodatoBienesAgregados,
    otro_articulo: comFDOtroArticulo.value,
    abono_mensual: comFDAbono.value,
  };
}

function hayAlgoCargadoEnComodato() {
  const b = armarBorradorComodato();
  return !!(b.comodatario || b.direccion_comodatario || b.bienes_agregados.length > 0 || b.otro_articulo || b.abono_mensual);
}

function guardarBorradorComodatoActual() {
  if (!hayAlgoCargadoEnComodato()) return;
  try {
    localStorage.setItem(CLAVE_BORRADOR_COMODATO, JSON.stringify(armarBorradorComodato()));
  } catch (err) {
    // si falla (almacenamiento lleno, modo privado, etc.), no se
    // interrumpe el flujo — simplemente no queda guardado el borrador
  }
}

function borrarBorradorComodato() {
  localStorage.removeItem(CLAVE_BORRADOR_COMODATO);
}

function restaurarBorradorComodatoSiExiste() {
  const guardado = localStorage.getItem(CLAVE_BORRADOR_COMODATO);
  if (!guardado) return false;
  let b;
  try {
    b = JSON.parse(guardado);
  } catch (err) {
    return false;
  }

  comFDNombre.value = b.comodatario || "";
  comFDDireccion.value = b.direccion_comodatario || "";
  comFDCiudad.value = b.ciudad_comodatario || "Rosario";
  comFDOtroRepresentanteCheck.checked = !!b.otro_representante;
  comFDRepresentado.readOnly = !b.otro_representante;
  comFDRepresentado.value = b.representado_por || "";
  comFDClienteEmail.value = b.cliente_email || "";
  comodatoBienesAgregados = Array.isArray(b.bienes_agregados) ? b.bienes_agregados : [];
  renderComodatoBienesAgregados();
  comFDOtroArticulo.value = b.otro_articulo || "";
  comFDAbono.value = b.abono_mensual || "";
  return true;
}

function resetFormularioComodato() {
  comFDNombre.value = "";
  comFDDireccion.value = "";
  comFDCiudad.value = "Rosario";
  comFDOtroRepresentanteCheck.checked = false;
  comFDRepresentado.value = "";
  comFDRepresentado.readOnly = true;
  comFDClienteEmail.value = "";
  comFDOtroArticulo.value = "";
  comFDAbono.value = "";
  comodatoBienesAgregados = [];
  renderComodatoBienesAgregados();
  comBienModeloSelect.value = "";
  comFDAclaracion.value = "";
  comFDCargo.value = "";
  comFDDni.value = "";
}

// Si nadie tildó "lo representa otra persona", el campo "representado
// en este acto por" se completa solo con el nombre del titular
// (evita que quede vacío por olvido, para el caso más común).
comFDNombre.addEventListener("input", () => {
  if (!comFDOtroRepresentanteCheck.checked) {
    comFDRepresentado.value = comFDNombre.value;
  }
});
comFDOtroRepresentanteCheck.addEventListener("change", () => {
  if (comFDOtroRepresentanteCheck.checked) {
    comFDRepresentado.value = "";
    comFDRepresentado.readOnly = false;
    comFDRepresentado.focus();
  } else {
    comFDRepresentado.readOnly = true;
    comFDRepresentado.value = comFDNombre.value;
  }
});

// Formatea el abono como moneda ($ 15.000,00) al salir del campo —
// para que quede prolijo y consistente sin que el técnico tenga que
// tipear los puntos/comas él mismo.
function formatearAbono(valorCrudo) {
  const soloDigitos = valorCrudo.replace(/[^\d]/g, "");
  if (!soloDigitos) return "";
  const numero = parseInt(soloDigitos, 10);
  return numero.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
comFDAbono.addEventListener("blur", () => {
  comFDAbono.value = formatearAbono(comFDAbono.value);
});

tileComodatoBtn.addEventListener("click", () => {
  if (materialesCatalogo.length > 0) poblarCategoriasComodato();
  resetFormularioComodato();
  const restaurado = restaurarBorradorComodatoSiExiste();
  if (restaurado) {
    showToast("Se restauró un comodato que tenías sin terminar.");
  }
  showScreen("comodatoForm");
});

comVolverListaBtn.addEventListener("click", () => {
  guardarBorradorComodatoActual();
  showScreen("home");
});

comContinuarFirmaBtn.addEventListener("click", () => {
  if (!comFDNombre.value.trim() || !comFDDireccion.value.trim() || !comFDCiudad.value.trim() || !comFDRepresentado.value.trim()) {
    showToast("Completá los datos del comodatario antes de continuar.");
    return;
  }
  if (!comFDAbono.value) {
    showToast("Falta el monto del abono mensual.");
    return;
  }
  if (comodatoBienesAgregados.length === 0 && !comFDOtroArticulo.value.trim()) {
    showToast("Agregá al menos un artículo que se deja en comodato.");
    return;
  }
  if (comBienModeloSelect.value && !comBienModeloSelect.disabled) {
    showToast('Tenés un artículo elegido sin agregar — tocá "+ Agregar" o borralo antes de continuar.');
    return;
  }
  showScreen("comodatoFirma");
  setupComodatoCanvas();
});

comVolverFormBtn.addEventListener("click", () => showScreen("comodatoForm"));

function setupComodatoCanvas() {
  const rect = comodatoSignCanvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  comodatoSignCanvas.width = rect.width * dpr;
  comodatoSignCanvas.height = rect.height * dpr;
  comodatoCtx.scale(dpr, dpr);
  comodatoCtx.lineWidth = 2.4;
  comodatoCtx.lineCap = "round";
  comodatoCtx.lineJoin = "round";
  comodatoCtx.strokeStyle = "#101820";
  clearComodatoSignature();
}
function comodatoPointerPos(e) {
  const rect = comodatoSignCanvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  return { x: point.clientX - rect.left, y: point.clientY - rect.top };
}
function comodatoStartDraw(e) {
  e.preventDefault();
  comodatoDrawing = true;
  const p = comodatoPointerPos(e);
  comodatoLastX = p.x; comodatoLastY = p.y;
}
function comodatoMoveDraw(e) {
  if (!comodatoDrawing) return;
  e.preventDefault();
  const p = comodatoPointerPos(e);
  comodatoCtx.beginPath();
  comodatoCtx.moveTo(comodatoLastX, comodatoLastY);
  comodatoCtx.lineTo(p.x, p.y);
  comodatoCtx.stroke();
  comodatoLastX = p.x; comodatoLastY = p.y;
  comodatoHasSignature = true;
}
function comodatoEndDraw() { comodatoDrawing = false; }
comodatoSignCanvas.addEventListener("mousedown", comodatoStartDraw);
comodatoSignCanvas.addEventListener("mousemove", comodatoMoveDraw);
window.addEventListener("mouseup", comodatoEndDraw);
comodatoSignCanvas.addEventListener("touchstart", comodatoStartDraw, { passive: false });
comodatoSignCanvas.addEventListener("touchmove", comodatoMoveDraw, { passive: false });
comodatoSignCanvas.addEventListener("touchend", comodatoEndDraw);

function clearComodatoSignature() {
  comodatoCtx.clearRect(0, 0, comodatoSignCanvas.width, comodatoSignCanvas.height);
  comodatoHasSignature = false;
}
comClearSignBtn.addEventListener("click", clearComodatoSignature);

async function intentarEnviarComodato(item, interactivo) {
  const res = await fetch("/api/comodato", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
    body: JSON.stringify({
      datos: item.datos,
      firma_comodatario_base64: item.firma_comodatario_base64,
      cliente_email: item.cliente_email,
      tecnico: item.tecnico,
      fecha_iso: item.fecha_iso,
      cantidad: item.cantidad,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { oficinaOk: false, clienteOk: false };
  }
  return { oficinaOk: !!data.oficinaOk, clienteOk: !!data.clienteOk };
}

comConfirmarFirmaBtn.addEventListener("click", async () => {
  if (!comodatoHasSignature) {
    showToast("Falta la firma del comodatario.");
    return;
  }
  const aclaracion = comFDAclaracion.value.trim();
  const cargo = comFDCargo.value.trim();
  const dni = comFDDni.value.trim();
  if (!aclaracion || !cargo || !dni) {
    showToast("Completá aclaración, cargo y DNI de quien firma.");
    return;
  }

  const hoy = new Date();
  const datos = {
    comodatario: comFDNombre.value.trim(),
    direccion_comodatario: comFDDireccion.value.trim(),
    ciudad_comodatario: comFDCiudad.value.trim(),
    representado_por: comFDRepresentado.value.trim(),
    bienes: getBienesComodatoTexto(),
    abono_mensual: comFDAbono.value,
    dia: String(hoy.getDate()),
    mes: MESES_ES()[hoy.getMonth()],
    anio: String(hoy.getFullYear()),
    aclaracion_comodatario: aclaracion,
    cargo_comodatario: cargo,
    dni_comodatario: dni,
  };
  const firmaBase64 = normalizarFirmaParaMail(comodatoSignCanvas).replace(/^data:image\/png;base64,/, "");
  const clienteEmail = comFDClienteEmail.value.trim();
  // Cantidad total de unidades prestadas — suma de cada artículo
  // agregado (ej: 2 PIR + 1 central = 3), más 1 si además se cargó
  // algo en "otro artículo" (ese campo es texto libre, sin cantidad
  // propia, así que solo se puede contar como una unidad más).
  const cantidadTotal = comodatoBienesAgregados.reduce((suma, b) => suma + (Number(b.cantidad) || 0), 0) + (comFDOtroArticulo.value.trim() ? 1 : 0);
  const item = { tipo: "comodato", datos, firma_comodatario_base64: firmaBase64, cliente_email: clienteEmail, tecnico: tecnicoLogueado || "", fecha_iso: fechaLocalISO(hoy), cantidad: cantidadTotal };

  comConfirmarFirmaBtn.disabled = true;
  comodatoEnviandoAviso.style.display = "block";

  if (navigator.onLine === false) {
    agregarAColaEnvios(item);
    comodatoEnviandoAviso.style.display = "none";
    comConfirmarFirmaBtn.disabled = false;
    showToast("Sin conexión — el comodato se guardó en el celular y se va a enviar solo apenas vuelva la señal.");
    showScreen("home");
    return;
  }

  try {
    const resultado = await intentarEnviarComodato(item, true);
    if (resultado.oficinaOk) {
      borrarBorradorComodato();
      showToast(resultado.clienteOk
        ? "Comodato enviado a la oficina y al cliente."
        : "Comodato enviado a la oficina (sin copia al cliente).");
      showScreen("home");
    } else {
      // No se pudo confirmar que llegó a oficina — se guarda para
      // reintentar solo, en vez de darlo por enviado y borrar la
      // firma del celular sin estar seguros de que llegó.
      agregarAColaEnvios(item);
      showToast("No se pudo confirmar el envío a la oficina — se guardó y se va a reintentar solo.");
      showScreen("home");
    }
  } catch (err) {
    agregarAColaEnvios(item);
    showToast("No se pudo confirmar el envío a la oficina — se guardó y se va a reintentar solo.");
    showScreen("home");
  } finally {
    comConfirmarFirmaBtn.disabled = false;
    comodatoEnviandoAviso.style.display = "none";
  }
});

// ---------- SIMs de los técnicos ----------
let simSeleccionada = "";

async function fetchSimsConfig() {
  const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
  const res = await fetch("/api/datos?coleccion=sims", { headers, cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

tileSimsBtn.addEventListener("click", () => {
  showScreen("sims");
  simsHistorialCache = null;
  try { document.getElementById("simsBuscarInput").value = ""; simsFiltroEmpresa = ""; } catch (e) { /* aún no cargó */ }
  renderSimsLista();
  cargarTransferenciasPendientes();
  cargarTransferenciasMandadas();
});
volverDeSimsBtn.addEventListener("click", () => showScreen("home"));
volverDeSimDetalleBtn.addEventListener("click", () => showScreen("sims"));

let simsListaCache = [];

// El orden y el colapso de los grupos de SIMs por técnico son
// preferencias personales de quien mira la pantalla (con permiso
// sims_ver_todas) — se guardan en este celular, no en el servidor,
// así cada uno los arma a su gusto sin pisar el de otro.
function obtenerOrdenTecnicosSims() {
  try {
    const guardado = JSON.parse(localStorage.getItem("sims_orden_tecnicos") || "[]");
    return Array.isArray(guardado) ? guardado : [];
  } catch (err) {
    return [];
  }
}
function guardarOrdenTecnicosSims(orden) {
  localStorage.setItem("sims_orden_tecnicos", JSON.stringify(orden));
}
function obtenerColapsadosSims() {
  try {
    const guardado = JSON.parse(localStorage.getItem("sims_colapsados") || "[]");
    return new Set(Array.isArray(guardado) ? guardado : []);
  } catch (err) {
    return new Set();
  }
}
function guardarColapsadosSims(set) {
  localStorage.setItem("sims_colapsados", JSON.stringify([...set]));
}

async function renderSimsLista() {
  simsListaStatus.textContent = "Cargando...";
  simsGrupos.innerHTML = "";
  try {
    simsListaCache = await fetchSimsConfig();
    try { localStorage.setItem("sims_cache", JSON.stringify(simsListaCache)); } catch (e) { /* sin espacio */ }
    renderResumenSims();
    dibujarSimsLista();
  } catch (err) {
    simsListaStatus.textContent = "No se pudo cargar la lista de SIMs.";
  }
}

function dibujarSimsLista() {
  simsGrupos.innerHTML = "";

  if (simsListaCache.length === 0) {
    simsListaStatus.textContent = "Todavía no hay SIMs cargadas.";
    return;
  }

  function crearCard(s, mostrarTecnico) {
    const card = document.createElement("div");
    card.className = "sim-card";
    const colorEmpresa = COLORES_COMPANIA_SIM[s.empresa] || "#8A9089";
    card.style.borderLeft = `4px solid ${colorEmpresa}`;
    const badgeFisico = s.estado_fisico && s.estado_fisico !== "Disponible"
      ? `<span class="sim-card-badge-fisico">${escapeHtml(s.estado_fisico)}</span>` : "";
    card.innerHTML = `
      <div>
        <div class="sim-card-empresa"><span class="sim-card-dot" style="background:${colorEmpresa};"></span>${s.empresa}${s.tipo ? " · " + escapeHtml(s.tipo) : ""}${badgeFisico}</div>
        <div class="sim-card-numero">${escapeHtml(s.numero)}${mostrarTecnico ? " · " + escapeHtml(s.tecnico_actual) : ""}</div>
      </div>
      <span class="sim-card-estado ${s.estado}">${s.ubicacion_tipo === "cliente" ? "Instalada: " + escapeHtml(s.ubicacion_nombre || "?") : s.ubicacion_tipo === "oficina" ? "En Oficina" : "En tu stock"}</span>
    `;
    card.addEventListener("click", () => {
      simSeleccionada = s.numero;
      showScreen("simDetalle");
      renderSimDetalle();
    });
    return card;
  }

  // Un técnico solo ve sus propias SIMs — nunca las de otro técnico,
  // ni siquiera con el permiso de Administración (ese permiso da
  // acceso al panel de admin.html, que es donde sí se ve y se
  // reasigna todo; acá adentro de la app queda siempre acotado a lo
  // propio, por privacidad entre técnicos) — salvo que tenga el
  // permiso puntual "sims_ver_todas", pensado para quien necesita
  // supervisar/operar el listado completo sin tener que ser admin.
  //
  // "Mis SIMs" es el stock personal (lo que tiene para instalar) —
  // no incluye las que ya instaló en algún cliente, esas se buscan
  // aparte con "Buscar SIM instalada".
  const propio = tecnicoLogueado || "";
  const veTodas = !!permisosDelTecnico(tecnicoLogueado).sims_ver_todas;
  const listaVisible = veTodas
    ? simsListaCache.filter((s) => s.ubicacion_tipo !== "cliente")
    : simsListaCache.filter((s) => s.ubicacion_tipo === "tecnico" && s.tecnico_actual === propio);

  if (listaVisible.length === 0) {
    simsListaStatus.textContent = "Todavía no tenés ninguna SIM asignada.";
    return;
  }
  simsListaStatus.textContent = "";

  if (veTodas) {
    // Agrupadas por técnico, para que quede claro de quién es cada
    // una — con orden personalizable (▲▼) y colapso por grupo, ambos
    // guardados en este celular (no es algo que tenga que verse igual
    // para todos los que tienen este permiso).
    const porTecnico = {};
    listaVisible.forEach((s) => {
      const clave = s.tecnico_actual || "(sin asignar)";
      (porTecnico[clave] = porTecnico[clave] || []).push(s);
    });

    const nombresPresentes = Object.keys(porTecnico);
    const ordenGuardado = obtenerOrdenTecnicosSims();
    let orden = ordenGuardado.filter((n) => nombresPresentes.includes(n));
    const faltantes = nombresPresentes.filter((n) => !orden.includes(n)).sort();
    orden = [...orden, ...faltantes];

    const colapsados = obtenerColapsadosSims();

    const barra = document.createElement("div");
    barra.className = "sim-grupos-barra";
    barra.innerHTML = `
      <button type="button" class="btn-chip" id="simsColapsarTodosBtn">Colapsar todos</button>
      <button type="button" class="btn-chip" id="simsExpandirTodosBtn">Expandir todos</button>
      <button type="button" class="btn-chip" id="simsRestablecerOrdenBtn">Restablecer orden</button>
    `;
    simsGrupos.appendChild(barra);
    barra.querySelector("#simsColapsarTodosBtn").addEventListener("click", () => {
      orden.forEach((n) => colapsados.add(n));
      guardarColapsadosSims(colapsados);
      dibujarSimsLista();
    });
    barra.querySelector("#simsExpandirTodosBtn").addEventListener("click", () => {
      colapsados.clear();
      guardarColapsadosSims(colapsados);
      dibujarSimsLista();
    });
    barra.querySelector("#simsRestablecerOrdenBtn").addEventListener("click", () => {
      guardarOrdenTecnicosSims([]);
      dibujarSimsLista();
    });

    orden.forEach((nombreTec, idx) => {
      const grupo = document.createElement("div");
      grupo.className = "sim-grupo";

      const items = porTecnico[nombreTec];
      const enStock = items.filter((s) => s.estado === "stock").length;
      const enUso = items.filter((s) => s.estado === "uso").length;
      const desglose = [enStock > 0 ? `${enStock} en stock` : "", enUso > 0 ? `${enUso} en uso` : ""].filter(Boolean).join(", ");

      const estaColapsado = colapsados.has(nombreTec);
      const titulo = document.createElement("div");
      titulo.className = "sim-grupo-titulo sim-grupo-header";
      titulo.innerHTML = `
        <span>${nombreTec === propio ? "Tus SIMs" : escapeHtml(nombreTec)} <span class="sim-grupo-count">(${items.length}${desglose ? " — " + desglose : ""})</span></span>
        <span class="sim-grupo-controles">
          <button type="button" class="sim-grupo-btn sim-grupo-subir" ${idx === 0 ? "disabled" : ""} title="Subir">▲</button>
          <button type="button" class="sim-grupo-btn sim-grupo-bajar" ${idx === orden.length - 1 ? "disabled" : ""} title="Bajar">▼</button>
          <button type="button" class="sim-grupo-btn sim-grupo-colapsar" title="${estaColapsado ? "Mostrar" : "Ocultar"}">${estaColapsado ? "▸" : "▾"}</button>
        </span>
      `;
      grupo.appendChild(titulo);

      const contenido = document.createElement("div");
      contenido.className = "sim-grupo-contenido" + (estaColapsado ? " hidden" : "");
      items.forEach((s) => contenido.appendChild(crearCard(s, false)));
      grupo.appendChild(contenido);

      simsGrupos.appendChild(grupo);

      const btnSubir = titulo.querySelector(".sim-grupo-subir");
      const btnBajar = titulo.querySelector(".sim-grupo-bajar");
      const btnColapsar = titulo.querySelector(".sim-grupo-colapsar");

      btnSubir.addEventListener("click", () => {
        const i = orden.indexOf(nombreTec);
        if (i <= 0) return;
        [orden[i - 1], orden[i]] = [orden[i], orden[i - 1]];
        guardarOrdenTecnicosSims(orden);
        dibujarSimsLista();
      });
      btnBajar.addEventListener("click", () => {
        const i = orden.indexOf(nombreTec);
        if (i === -1 || i >= orden.length - 1) return;
        [orden[i + 1], orden[i]] = [orden[i], orden[i + 1]];
        guardarOrdenTecnicosSims(orden);
        dibujarSimsLista();
      });
      btnColapsar.addEventListener("click", () => {
        if (colapsados.has(nombreTec)) colapsados.delete(nombreTec);
        else colapsados.add(nombreTec);
        guardarColapsadosSims(colapsados);
        contenido.classList.toggle("hidden");
        btnColapsar.textContent = colapsados.has(nombreTec) ? "▸" : "▾";
        btnColapsar.title = colapsados.has(nombreTec) ? "Mostrar" : "Ocultar";
      });
    });
    return;
  }

  const titulo = document.createElement("p");
  titulo.className = "sim-grupo-titulo";
  titulo.textContent = "Tus SIMs";
  simsGrupos.appendChild(titulo);
  const filtroNum = esSkinNuevo() ? (document.getElementById("simsBuscarInput").value || "").replace(/\D/g, "") : "";
  const filtroEmp = esSkinNuevo() ? simsFiltroEmpresa : "";
  const mostradas = listaVisible.filter((s) => (!filtroNum || String(s.numero).replace(/\D/g, "").includes(filtroNum)) && (!filtroEmp || s.empresa === filtroEmp));
  if (!mostradas.length) {
    const p = document.createElement("p");
    p.className = "list-status";
    p.textContent = "Ninguna SIM coincide con esa búsqueda.";
    simsGrupos.appendChild(p);
  }
  mostradas.forEach((s) => simsGrupos.appendChild(crearCard(s, false)));
}

// ---- Mis SIMs (skin nuevo): resumen por empresa, buscador y stock bajo ----
let simsFiltroEmpresa = "";
let SIMS_STOCK_MINIMO = 2;
function esSkinNuevo() { return document.documentElement.dataset.inicio === "nuevo"; }
function renderResumenSims() {
  const wrap = document.getElementById("simsResumenWrap");
  if (!wrap) return;
  const propias = simsListaCache.filter((s) => s.ubicacion_tipo === "tecnico" && s.tecnico_actual === (tecnicoLogueado || ""));
  wrap.hidden = !esSkinNuevo() || !tecnicoLogueado;
  if (wrap.hidden) return;
  const disponibles = propias.filter((s) => !s.estado_fisico || s.estado_fisico === "Disponible");
  const empresas = ["Claro", "Movistar", "Personal"];
  const cuenta = Object.fromEntries(empresas.map((e) => [e, disponibles.filter((s) => s.empresa === e).length]));
  document.getElementById("simsResumenChips").innerHTML = empresas.map((e) => `
    <button type="button" class="sims-chip${simsFiltroEmpresa === e ? " activo" : ""}" data-emp="${e}">
      <span class="sim-card-dot" style="background:${COLORES_COMPANIA_SIM[e] || "#8A9089"};"></span>${e} <b>${cuenta[e]}</b>
    </button>`).join("");
  document.querySelectorAll("#simsResumenChips .sims-chip").forEach((b) => b.addEventListener("click", () => {
    simsFiltroEmpresa = simsFiltroEmpresa === b.dataset.emp ? "" : b.dataset.emp;
    renderResumenSims();
    dibujarSimsLista();
  }));
  const bajas = empresas.filter((e) => cuenta[e] < SIMS_STOCK_MINIMO);
  const aviso = document.getElementById("simsStockBajo");
  aviso.classList.toggle("hidden", bajas.length === 0);
  aviso.innerHTML = bajas.length
    ? `<b>Stock bajo:</b> ${bajas.map((e) => `${e} (${cuenta[e] === 0 ? "ninguna" : cuenta[e]})`).join(", ")}. Pedile a la oficina antes de quedarte sin.`
    : "";
}
document.getElementById("simsBuscarInput").addEventListener("input", () => dibujarSimsLista());

// ---- Transferencias que mandé y todavía no aceptaron (skin nuevo) ----
async function cargarTransferenciasMandadas() {
  const wrap = document.getElementById("simsMandadasWrap");
  const lista = document.getElementById("simsMandadasList");
  if (!wrap || !esSkinNuevo() || !tecnicoLogueado) { if (wrap) wrap.hidden = true; return; }
  const otros = Object.keys(tecnicosPasswords || {}).filter((n) => n !== tecnicoLogueado);
  const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
  const resultados = await Promise.all(otros.map((n) =>
    fetch(`/api/recurso-uso?recurso=sim&pendientes=1&tecnico=${encodeURIComponent(n)}`, { headers, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : [])).catch(() => [])));
  const mias = resultados.flat().filter((t) => t && t.tecnico_origen === tecnicoLogueado);
  wrap.hidden = mias.length === 0;
  lista.innerHTML = mias.map((t) => `
    <div class="sim-mandada">
      <div><b>${escapeHtml(t.empresa || "")}</b> · ${escapeHtml(t.numero)}<br><span class="sim-mandada-a">Para ${escapeHtml(t.tecnico_destino || "")}${t.fecha ? " · desde el " + escapeHtml(String(t.fecha).split("-").reverse().join("/")) : ""}</span></div>
      <button type="button" class="btn btn-ghost btn-small sim-cancelar-transf" data-id="${escapeHtml(String(t.id))}" data-destino="${escapeHtml(t.tecnico_destino || "")}">Cancelar</button>
    </div>`).join("");
  lista.querySelectorAll(".sim-cancelar-transf").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("¿Cancelar esta transferencia? La SIM sigue en tu stock.")) return;
    b.disabled = true;
    try {
      const res = await fetch("/api/recurso-uso", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
        body: JSON.stringify({ recurso: "sim", accion: "rechazar_transferencia", tecnico: b.dataset.destino, cancelada_por: tecnicoLogueado, id_transferencia: Number(b.dataset.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error desconocido");
      showToast("Transferencia cancelada.");
      cargarTransferenciasMandadas();
      renderSimsLista();
    } catch (err) {
      showToast("No se pudo cancelar: " + err.message);
      b.disabled = false;
    }
  }));
}

// ---- Historial de una SIM (skin nuevo) ----
const ETIQUETA_ACCION_SIM_LARGA = {
  usar: "Instalada en un cliente", reemplazar: "Instalada reemplazando otra línea", devolver: "Devuelta al stock",
  transferir: "Transferida", aceptar_transferencia: "Transferencia aceptada", rechazar_transferencia: "Transferencia rechazada",
  retirar_de_registro: "Retirada de un cliente", marcar_estado_fisico: "Cambio de estado", revertir: "Revertida", alta: "Alta en el stock",
  transferencia_pendiente: "Transferencia enviada", transferencia_aceptada: "Transferencia aceptada", transferencia_rechazada: "Transferencia rechazada",
  transferencia_cancelada: "Transferencia cancelada", marcar_defectuosa: "Marcada defectuosa", marcar_extraviada: "Marcada extraviada",
  marcar_disponible: "Marcada disponible", baja: "Dada de baja", editar: "Corrección de datos", editar_instalada: "Datos corregidos",
};
let simsHistorialCache = null;
async function renderHistorialSim(numero) {
  const wrap = document.getElementById("simHistorialWrap");
  if (!wrap) return;
  wrap.hidden = !esSkinNuevo();
  if (wrap.hidden) return;
  const st = document.getElementById("simHistorialStatus");
  const ol = document.getElementById("simHistorialLista");
  ol.innerHTML = "";
  st.textContent = "Cargando historial...";
  try {
    if (!simsHistorialCache) {
      const res = await fetch("/api/recurso-uso?recurso=sim", { headers: { Authorization: "Bearer " + SERVICIOS_API_TOKEN }, cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      simsHistorialCache = Array.isArray(data) ? data : [];
    }
    if (numero !== simSeleccionada) return;
    const movs = simsHistorialCache.filter((h) => h.numero === numero || h.sim_retirada === numero)
      .sort((a, b) => `${b.fecha || ""} ${b.hora || ""}`.localeCompare(`${a.fecha || ""} ${a.hora || ""}`));
    st.textContent = movs.length ? "" : "Sin movimientos registrados todavía.";
    ol.innerHTML = movs.map((h) => {
      const fecha = h.fecha ? h.fecha.split("-").reverse().join("/") : "";
      let que = ETIQUETA_ACCION_SIM_LARGA[h.accion] || String(h.accion || "").replace(/_/g, " ");
      let detalle = "";
      if (h.sim_retirada === numero && h.numero !== numero) { que = "Retirada al reemplazarla por otra"; detalle = `en ${h.cliente || "el cliente"} (la nueva es ${h.numero})`; }
      else if (h.accion === "transferir") detalle = `de ${h.tecnico || "?"} a ${h.tecnico_nuevo || "?"}`;
      else if (h.accion === "usar" || h.accion === "reemplazar" || h.accion === "retirar_de_registro") detalle = `${h.cliente ? "en " + h.cliente : ""}${h.numero_servicio ? " · servicio " + h.numero_servicio : ""}`;
      else if (h.accion === "marcar_estado_fisico") detalle = h.estado_fisico || h.detalle || "";
      return `<li><span class="sh-fecha">${escapeHtml(fecha)}${h.hora ? " " + escapeHtml(h.hora) : ""}</span><span class="sh-que">${escapeHtml(que)}</span>${detalle ? `<span class="sh-detalle">${escapeHtml(detalle)}</span>` : ""}<span class="sh-quien">${escapeHtml(h.tecnico || "")}</span></li>`;
    }).join("");
  } catch (err) {
    st.textContent = "No se pudo cargar el historial.";
  }
}

async function poblarClientesParaSim() {
  // Antes se mezclaban acá los nombres de clientes con los nombres
  // sueltos de servicios pendientes (texto libre, sin garantía de
  // coincidir con la base) — eso fue justo la causa de un problema
  // real (una SIM que no completaba los datos ni se encontraba
  // después). Ahora la lista sale solo de la base de Clientes, que
  // es la fuente confiable — se precarga acá, y la lista visual de
  // sugerencias (con dirección y abonado) se arma al tipear.
  await cargarClientesGeneral();
}

// ---------- Caché compartido de la base de Clientes ----------
// Se usa para autocompletar dirección/teléfono en varias pantallas
// (SIMs, servicios de emergencia) a partir de lo cargado en la
// pestaña Clientes de admin.html — evita tener que escribir todo a
// mano si el cliente ya está cargado ahí.
let clientesGeneralCache = null;
let clientesGeneralCargadoOk = false;
// Antes, si la precarga fallaba por una mala señal (muy común en el
// campo), el catch dejaba clientesGeneralCache en un array vacío —
// y como [] es "verdadero" en JS, la próxima llamada lo tomaba como
// "ya está cargado" y nunca reintentaba. Un técnico con esa mala
// suerte se quedaba SIN caché de clientes por el resto de la sesión,
// sin ningún aviso — buscarClientePorNombre siempre devolvía null,
// aunque el cliente sí existiera en la base. Ahora se distingue
// "nunca se intentó" de "se intentó y falló", y en el segundo caso
// se reintenta la próxima vez que haga falta.
async function cargarClientesGeneral() {
  if (clientesGeneralCargadoOk) return clientesGeneralCache;
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=clientes", { headers, cache: "no-store" });
    const data = await res.json();
    clientesGeneralCache = Array.isArray(data) ? data : [];
    clientesGeneralCargadoOk = true;
  } catch (err) {
    console.error("No se pudo cargar la lista de clientes (se reintentará la próxima vez que haga falta):", err);
    clientesGeneralCache = clientesGeneralCache || [];
  }
  return clientesGeneralCache;
}
function buscarClientePorNombre(nombre) {
  const clave = normalizeText(nombre);
  return (clientesGeneralCache || []).find((c) => c.nombre && normalizeText(c.nombre) === clave) || null;
}

// Cuántos clientes distintos hay con este nombre EXACTO — para avisar
// cuando hay más de uno (mismo nombre, distinta dirección/abonado),
// que es justo el caso que puede confundir a un técnico si no elige
// explícitamente de la lista de sugerencias.
function contarClientesConNombreExacto(nombre) {
  const clave = normalizeText(nombre);
  if (!clave) return 0;
  return (clientesGeneralCache || []).filter((c) => c.nombre && normalizeText(c.nombre) === clave).length;
}

// buscarSimExistenteEnCliente y limpiarNumeroClienteParaComparar
// viven en sims-utils.js — se comparten con admin.html para que un
// arreglo futuro valga en los dos lugares a la vez, sin depender de
// mantener dos copias sincronizadas a mano.

const simDireccionInstalacion = document.getElementById("simDireccionInstalacion");
const simNumeroAbonadoInfo = document.getElementById("simNumeroAbonadoInfo");
const simClienteSugerenciasWrap = document.getElementById("simClienteSugerenciasWrap");
const simClienteSugerenciasList = document.getElementById("simClienteSugerenciasList");
const simClienteAmbiguoAviso = document.getElementById("simClienteAmbiguoAviso");
let simNumeroClienteActivo = "";
let simNumeroAbonadoActivo = "";

function limpiarSeleccionClienteSim() {
  simDireccionInstalacion.value = "";
  simNumeroClienteActivo = "";
  simNumeroAbonadoActivo = "";
  simNumeroAbonadoInfo.textContent = "";
}

function elegirClienteParaSim(c) {
  simClienteInput.value = c.nombre;
  simDireccionInstalacion.value = c.direccion || "";
  simNumeroClienteActivo = c.numero_cliente || "";
  simNumeroAbonadoActivo = c.numero_abonado || "";
  simNumeroAbonadoInfo.textContent = simNumeroAbonadoActivo ? "Número de abonado: " + simNumeroAbonadoActivo : "";
  simClienteSugerenciasWrap.classList.add("hidden");
  simClienteAmbiguoAviso.classList.add("hidden");

  // Si este cliente YA tiene una SIM instalada, avisar acá mismo —
  // es justo el caso real que pasó: un técnico instaló una línea
  // nueva con "Usar" (que da por hecho que el cliente no tenía nada
  // antes) cuando en realidad estaba reemplazando una existente. La
  // vieja, al no decirle nada al sistema, nunca quedó registrada
  // como retirada — ni instalada, ni en ningún stock.
  //
  // Usa la misma función compartida que las otras dos pantallas —
  // antes comparaba solo por nombre exacto, sin la tolerancia ni el
  // respaldo por número de cliente que ya tienen las demás.
  const resultado = buscarSimExistenteEnCliente(c.nombre, c.numero_cliente, simsListaCache, null);
  if (resultado.tipo === "confirmada") {
    const yaInstalada = resultado.sim;
    simClienteEncontradoInfo.textContent = `⚠ Este cliente ya tiene la línea ${yaInstalada.numero} (${yaInstalada.empresa}) instalada. Al tocar "Marcar como usada" te va a preguntar si querés reemplazarla.`;
    simClienteEncontradoInfo.className = "hint-text hint-warn";
  } else if (resultado.tipo === "sin_certeza") {
    const yaInstalada = resultado.sim;
    simClienteEncontradoInfo.textContent = `⚠ No tengo el número de este cliente para confirmarlo, pero hay una línea parecida (${yaInstalada.numero}, ${yaInstalada.empresa}) a nombre de "${yaInstalada.cliente}" — fijate si es el mismo antes de continuar.`;
    simClienteEncontradoInfo.className = "hint-text hint-warn";
  } else {
    simClienteEncontradoInfo.textContent = "✓ Cliente encontrado en la base.";
    simClienteEncontradoInfo.className = "hint-text hint-ok";
  }
}

// Lista visual de sugerencias al tipear (nombre o dirección), igual
// que en el campo de Cliente del parte técnico — antes esto era un
// <datalist> nativo que solo mostraba nombres, y apenas se tipeaba
// un nombre que coincidía EXACTO con alguno de la base, se
// completaba la dirección/abonado en silencio, agarrando siempre el
// primero que encontraba. Con varios clientes con el mismo nombre
// (mismo caso real que causó un movimiento de SIM al domicilio
// equivocado), eso llevaba al error sin ningún aviso en pantalla.
simClienteInput.addEventListener("input", () => {
  const texto = simClienteInput.value.trim();
  limpiarSeleccionClienteSim();
  simClienteEncontradoInfo.textContent = "";
  simClienteAmbiguoAviso.classList.add("hidden");

  if (texto.length < 2 || !Array.isArray(clientesGeneralCache)) {
    simClienteSugerenciasWrap.classList.add("hidden");
    return;
  }
  const clave = normalizeText(texto);
  const coincidencias = clientesGeneralCache
    .filter((c) => (c.nombre && normalizeText(c.nombre).includes(clave)) || (c.direccion && normalizeText(c.direccion).includes(clave)))
    .slice(0, 6);

  if (coincidencias.length === 0) {
    simClienteSugerenciasWrap.classList.add("hidden");
    return;
  }
  simClienteSugerenciasList.innerHTML = coincidencias.map((c, idx) => {
    const esAmbiguo = contarClientesConNombreExacto(c.nombre) > 1;
    return `
    <div class="cliente-sugerencia-item${esAmbiguo ? " cliente-sugerencia-ambiguo" : ""}" data-idx="${idx}">
      <div class="cliente-sugerencia-nombre">${escapeHtml(c.nombre)}</div>
      ${c.direccion ? `<div class="cliente-sugerencia-direccion">${escapeHtml(c.direccion)}</div>` : ""}
      ${c.numero_abonado ? `<div class="cliente-sugerencia-abonado">Abonado: ${escapeHtml(c.numero_abonado)}</div>` : ""}
    </div>
  `;
  }).join("");
  simClienteSugerenciasList.querySelectorAll(".cliente-sugerencia-item").forEach((item) => {
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      elegirClienteParaSim(coincidencias[Number(item.dataset.idx)]);
    });
  });
  simClienteSugerenciasWrap.classList.remove("hidden");
});

simClienteInput.addEventListener("change", () => {
  // Si ya eligió de la lista, esto no hace nada nuevo (ya está
  // resuelto). Esto es para cuando tipeó el nombre completo a mano
  // sin tocar ninguna sugerencia.
  if (simNumeroClienteActivo) return;
  const texto = simClienteInput.value.trim();
  const cantidad = contarClientesConNombreExacto(texto);
  if (cantidad > 1) {
    simClienteAmbiguoAviso.textContent = `⚠ Hay ${cantidad} clientes llamados "${texto}" — elegí el correcto de la lista de sugerencias (fijate la dirección) antes de continuar.`;
    simClienteAmbiguoAviso.classList.remove("hidden");
  } else if (cantidad === 1) {
    elegirClienteParaSim(buscarClientePorNombre(texto));
  } else {
    simClienteEncontradoInfo.textContent = texto ? "Cliente nuevo — no está en la base, se guarda tal cual se escribió." : "";
    simClienteEncontradoInfo.className = "hint-text";
  }
});

async function renderSimDetalle() {
  simDetalleStatus.textContent = "Cargando...";
  simSoloLecturaInfo.classList.add("hidden");
  simUsarWrap.classList.add("hidden");
  simReemplazoWrap.classList.add("hidden");
  simDevolverWrap.classList.add("hidden");
  simRevertirWrap.classList.add("hidden");
  simTransferirWrap.classList.add("hidden");
  simEstadoFisicoWrap.classList.add("hidden");
  try {
    const sims = await fetchSimsConfig();
    const sim = sims.find((s) => s.numero === simSeleccionada);
    if (!sim) {
      simDetalleStatus.textContent = "No se encontró esa SIM.";
      return;
    }
    const colorEmpresaDetalle = COLORES_COMPANIA_SIM[sim.empresa] || "#8A9089";
    simDetalleNombre.innerHTML = `<span class="sim-card-dot" style="background:${colorEmpresaDetalle};"></span>${sim.empresa}${sim.tipo ? " · " + sim.tipo : ""} — ${sim.numero}`;
    simDetalleStatus.textContent = "";
    renderHistorialSim(sim.numero);

    const esPropia = sim.tecnico_actual === (tecnicoLogueado || "") || !!permisosDelTecnico(tecnicoLogueado).sims_ver_todas;
    if (!esPropia) {
      simSoloLecturaInfo.textContent = sim.ubicacion_tipo === "cliente"
        ? `Esta SIM está instalada en ${sim.ubicacion_nombre || "un cliente"} (la puso ${sim.tecnico_instalador || sim.tecnico_actual}).`
        : `Esta SIM la tiene ${sim.tecnico_actual}, en stock.`;
      simSoloLecturaInfo.classList.remove("hidden");
      return;
    }

    if (sim.ubicacion_tipo === "cliente") {
      simDevolverWrap.classList.remove("hidden");
    } else if (sim.estado_fisico && sim.estado_fisico !== "Disponible") {
      simSoloLecturaInfo.textContent = `Esta SIM está marcada como "${sim.estado_fisico}" — no se puede instalar hasta que vuelva a estar Disponible.`;
      simSoloLecturaInfo.classList.remove("hidden");
    } else {
      await poblarClientesParaSim();
      simClienteInput.value = "";
      simClienteEncontradoInfo.textContent = "";
      simDireccionInstalacion.value = "";
      simNumeroAbonadoInfo.textContent = "";
      simNumeroClienteActivo = "";
      simNumeroAbonadoActivo = "";
      simClienteSugerenciasWrap.classList.add("hidden");
      simClienteAmbiguoAviso.classList.add("hidden");
      simUsarWrap.classList.remove("hidden");
    }

    if (sim.tecnico_anterior && sim.tecnico_anterior !== tecnicoLogueado) {
      simRevertirBtn.textContent = `↩ Revertir a ${sim.tecnico_anterior} (por si fue un error)`;
      simRevertirWrap.classList.remove("hidden");
    }

    const otrosTecnicos = Object.keys(tecnicosPasswords).filter((n) => n !== tecnicoLogueado).sort();
    const opciones = otrosTecnicos.map((n) => `<option value="${n}">${n}</option>`).join("");
    const opcionOficina = tecnicoLogueado !== "" ? `<option value="Oficina">Oficina (stock general, sin técnico)</option>` : "";
    simTecnicoNuevoSelect.innerHTML = `<option value="" disabled selected>Elegí un técnico</option>${opcionOficina}${opciones}`;
    if (sim.ubicacion_tipo !== "cliente") simTransferirWrap.classList.remove("hidden");

    // Estado físico — solo tiene sentido para SIMs en stock (una vez
    // instalada, se maneja como "retirar", no como defectuosa/perdida).
    if (sim.ubicacion_tipo !== "cliente") {
      const estadoActual = sim.estado_fisico || "Disponible";
      simEstadoFisicoActual.textContent = `Estado actual: ${estadoActual}`;
      simMarcarDefectuosaBtn.classList.toggle("hidden", estadoActual === "Defectuosa");
      simMarcarExtraviadaBtn.classList.toggle("hidden", estadoActual === "Extraviada");
      simMarcarDisponibleBtn.classList.toggle("hidden", estadoActual === "Disponible");
      simEstadoFisicoWrap.classList.remove("hidden");
    }
  } catch (err) {
    simDetalleStatus.textContent = "No se pudo cargar la información de esta SIM.";
  }
}

let simClienteParaReemplazo = "";
let simExistenteParaReemplazo = "";

async function marcarSimComoUsada(cliente) {
  try {
    const payload = {
      recurso: "sim",
      accion: "usar", numero: simSeleccionada, tecnico: tecnicoLogueado || "", cliente,
      direccion: simDireccionInstalacion.value.trim(), numero_cliente: simNumeroClienteActivo,
      numero_abonado: simNumeroAbonadoActivo,
    };
    await enviarAccionSimConRespaldo(payload, SERVICIOS_API_TOKEN);
    showToast("SIM marcada como usada.");
    renderSimDetalle();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  }
}

simUsarBtn.addEventListener("click", async () => {
  const textoEscrito = simClienteInput.value.trim();
  if (!textoEscrito) {
    showToast("Escribí el nombre del cliente.");
    return;
  }
  // Si hay varios clientes con este nombre exacto y no se resolvió
  // cuál es (no se tocó ninguna sugerencia ni quedó vinculado un
  // número de cliente), no se deja continuar — evita justo el caso
  // real que pasó una vez: quedarse con el primero de la lista sin
  // que nadie elija cuál era en realidad.
  if (!simNumeroClienteActivo && contarClientesConNombreExacto(textoEscrito) > 1) {
    showToast("Hay varios clientes con este nombre — elegí el correcto de la lista de sugerencias antes de continuar.");
    return;
  }
  // Si coincide con un cliente real, se usa el nombre EXACTO como
  // está guardado en la base — evita instalar bajo un nombre
  // levemente distinto (con o sin tilde, etc.) al que ya existe.
  const clienteEncontrado = buscarClientePorNombre(textoEscrito);
  const cliente = clienteEncontrado ? clienteEncontrado.nombre : textoEscrito;
  simUsarBtn.disabled = true;
  try {
    const sims = await fetchSimsConfig();
    // Misma función compartida que usa el parte técnico y el admin
    // (sims-utils.js) — antes cada pantalla tenía su propia copia de
    // este chequeo, y se desincronizaron sin que nadie lo notara.
    const resultado = buscarSimExistenteEnCliente(cliente, simNumeroClienteActivo, sims, simSeleccionada);
    if (resultado.tipo === "confirmada" || resultado.tipo === "sin_certeza") {
      const existente = resultado.sim;
      simClienteParaReemplazo = cliente;
      simExistenteParaReemplazo = existente.numero;
      simReemplazoMensaje.textContent = resultado.tipo === "confirmada"
        ? `Este cliente ya tiene la línea N° ${existente.numero} de ${existente.empresa}` +
          `${existente.tipo ? " " + existente.tipo : ""}, a nombre de "${existente.cliente}". ¿Querés reemplazarla o agregar esta como segunda línea?`
        : `No tengo el número de este cliente para confirmarlo, pero hay una línea parecida: N° ${existente.numero} de ${existente.empresa}` +
          `${existente.tipo ? " " + existente.tipo : ""}, a nombre de "${existente.cliente}". Fijate bien si es el mismo cliente antes de elegir.`;
      simUsarWrap.classList.add("hidden");
      simReemplazoWrap.classList.remove("hidden");
    } else {
      await marcarSimComoUsada(cliente);
    }
  } catch (err) {
    showToast("No se pudo verificar el cliente: " + err.message);
  } finally {
    simUsarBtn.disabled = false;
  }
});

simCancelarReemplazoBtn.addEventListener("click", () => {
  simReemplazoWrap.classList.add("hidden");
  simUsarWrap.classList.remove("hidden");
});

simAgregarSegundaBtn.addEventListener("click", async () => {
  simAgregarSegundaBtn.disabled = true;
  simReemplazoWrap.classList.add("hidden");
  await marcarSimComoUsada(simClienteParaReemplazo);
  simAgregarSegundaBtn.disabled = false;
});

simReemplazarBtn.addEventListener("click", async () => {
  simReemplazarBtn.disabled = true;
  try {
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        recurso: "sim",
        accion: "reemplazar",
        numero: simSeleccionada,
        tecnico: tecnicoLogueado || "",
        cliente: simClienteParaReemplazo,
        numero_sim_a_retirar: simExistenteParaReemplazo,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast("Listo — la línea anterior volvió a tu stock.");
    simReemplazoWrap.classList.add("hidden");
    renderSimDetalle();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  } finally {
    simReemplazarBtn.disabled = false;
  }
});

simDevolverBtn.addEventListener("click", async () => {
  simDevolverBtn.disabled = true;
  try {
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ recurso: "sim",
        accion: "devolver", numero: simSeleccionada, tecnico: tecnicoLogueado || "" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast("SIM devuelta a stock.");
    renderSimDetalle();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  } finally {
    simDevolverBtn.disabled = false;
  }
});

async function transferirSim(tecnicoNuevo) {
  try {
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ recurso: "sim",
        accion: "transferir", numero: simSeleccionada, tecnico: tecnicoLogueado || "", tecnico_nuevo: tecnicoNuevo }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast(data.pendiente ? `Transferencia a ${tecnicoNuevo} enviada — queda pendiente hasta que la acepte.` : `SIM transferida a ${tecnicoNuevo}.`);
    showScreen("sims");
    renderSimsLista();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  }
}

simTransferirBtn.addEventListener("click", async () => {
  const tecnicoNuevo = simTecnicoNuevoSelect.value;
  if (!tecnicoNuevo) {
    showToast("Elegí a qué técnico transferírsela.");
    return;
  }
  simTransferirBtn.disabled = true;
  await transferirSim(tecnicoNuevo);
  simTransferirBtn.disabled = false;
});

simRevertirBtn.addEventListener("click", async () => {
  const textoOriginal = simRevertirBtn.textContent;
  simRevertirBtn.disabled = true;
  simRevertirBtn.textContent = "Revirtiendo...";
  const sims = await fetchSimsConfig().catch(() => []);
  const sim = sims.find((s) => s.numero === simSeleccionada);
  if (!sim || !sim.tecnico_anterior) {
    showToast("No se pudo determinar a quién revertirla.");
    simRevertirBtn.disabled = false;
    simRevertirBtn.textContent = textoOriginal;
    return;
  }
  await transferirSim(sim.tecnico_anterior);
});

// ---------- Estado físico (Disponible / Defectuosa / Extraviada) ----------
async function marcarEstadoFisicoSim(estadoFisico) {
  try {
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ recurso: "sim", accion: "marcar_estado_fisico", numero: simSeleccionada, tecnico: tecnicoLogueado || "", estado_fisico: estadoFisico }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast(`Marcada como ${estadoFisico}.`);
    renderSimDetalle();
  } catch (err) {
    showToast("No se pudo marcar: " + err.message);
  }
}
simMarcarDefectuosaBtn.addEventListener("click", () => marcarEstadoFisicoSim("Defectuosa"));
simMarcarExtraviadaBtn.addEventListener("click", () => marcarEstadoFisicoSim("Extraviada"));
simMarcarDisponibleBtn.addEventListener("click", () => marcarEstadoFisicoSim("Disponible"));

// ---------- Transferencias pendientes de aceptación ----------
async function cargarTransferenciasPendientes() {
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch(`/api/recurso-uso?recurso=sim&pendientes=1&tecnico=${encodeURIComponent(tecnicoLogueado || "")}`, { headers, cache: "no-store" });
    const pendientes = await res.json();
    if (!Array.isArray(pendientes) || pendientes.length === 0) {
      simsTransferenciasPendientesWrap.classList.add("hidden");
      return;
    }
    simsTransferenciasPendientesWrap.classList.remove("hidden");
    simsTransferenciasPendientesList.innerHTML = pendientes.map((t) => `
      <div class="card" style="margin-bottom:10px;">
        <b>${escapeHtml(t.empresa || "")}${t.tipo ? " · " + escapeHtml(t.tipo) : ""}</b><br>
        <span style="font-family:'IBM Plex Mono', monospace;">${escapeHtml(t.numero)}</span><br>
        <span style="color:#6B7680; font-size:13px;">De: ${escapeHtml(t.tecnico_origen)}</span>
        <div style="margin-top:8px;">
          <button type="button" class="btn btn-primary btn-small aceptar-transf-btn" data-id="${t.id}">Aceptar</button>
          <button type="button" class="btn btn-ghost btn-small rechazar-transf-btn" data-id="${t.id}" style="margin-left:8px;">Rechazar</button>
        </div>
      </div>
    `).join("");
    simsTransferenciasPendientesList.querySelectorAll(".aceptar-transf-btn").forEach((btn) => {
      btn.addEventListener("click", () => resolverTransferenciaPendiente(btn.dataset.id, "aceptar_transferencia"));
    });
    simsTransferenciasPendientesList.querySelectorAll(".rechazar-transf-btn").forEach((btn) => {
      btn.addEventListener("click", () => resolverTransferenciaPendiente(btn.dataset.id, "rechazar_transferencia"));
    });
  } catch (err) {
    simsTransferenciasPendientesWrap.classList.add("hidden");
  }
}

async function resolverTransferenciaPendiente(idTransferencia, accion) {
  try {
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ recurso: "sim", accion, tecnico: tecnicoLogueado || "", id_transferencia: Number(idTransferencia) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast(accion === "aceptar_transferencia" ? "Transferencia aceptada — ya está en tu stock." : "Transferencia rechazada.");
    cargarTransferenciasPendientes();
    renderSimsLista();
  } catch (err) {
    showToast("No se pudo resolver: " + err.message);
  }
}

// ---------- Registro de SIMs instaladas (buscar / retirar) ----------
let simsRegistroCache = null; // se trae una sola vez y se cachea (es un archivo grande, ~900 líneas)
const LIMITE_RESULTADOS_REGISTRO = 30;

irARegistroSimsBtn.addEventListener("click", () => {
  showScreen("simRegistro");
  simRegistroBuscarInput.value = "";
  simRegistroResultados.innerHTML = "";
  simRegistroStatus.textContent = "Escribí para buscar entre las líneas instaladas.";
  cargarSimsRegistro();
});
volverDeSimRegistroBtn.addEventListener("click", () => showScreen("sims"));

async function cargarSimsRegistro() {
  if (simsRegistroCache) return; // ya está en memoria, no hace falta volver a pedirlo
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=sims_instaladas", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    simsRegistroCache = await res.json();
    if (!Array.isArray(simsRegistroCache)) simsRegistroCache = [];
  } catch (err) {
    simRegistroStatus.textContent = "No se pudo cargar el registro de instaladas.";
    simsRegistroCache = [];
  }
}

function renderResultadosSimRegistro() {
  const busqueda = normalizeText(simRegistroBuscarInput.value.trim());
  simRegistroResultados.innerHTML = "";
  if (!busqueda) {
    simRegistroStatus.textContent = "Escribí para buscar entre las líneas instaladas.";
    return;
  }
  if (!simsRegistroCache) {
    simRegistroStatus.textContent = "Cargando...";
    return;
  }
  const coincidencias = simsRegistroCache.filter((s) =>
    normalizeText(s.cliente).includes(busqueda) ||
    normalizeText(s.numero).includes(busqueda) ||
    normalizeText(s.direccion).includes(busqueda)
  );
  if (coincidencias.length === 0) {
    simRegistroStatus.textContent = "Ninguna coincidencia.";
    return;
  }
  simRegistroStatus.textContent = coincidencias.length > LIMITE_RESULTADOS_REGISTRO
    ? `${coincidencias.length} coincidencias — mostrando las primeras ${LIMITE_RESULTADOS_REGISTRO}.`
    : `${coincidencias.length} coincidencia(s).`;

  coincidencias.slice(0, LIMITE_RESULTADOS_REGISTRO).forEach((s) => {
    const colorEmpresa = COLORES_COMPANIA_SIM[s.empresa] || "#8A9089";
    const card = document.createElement("div");
    card.className = "sim-card";
    card.style.borderLeft = `4px solid ${colorEmpresa}`;
    card.innerHTML = `
      <div>
        <div class="sim-card-empresa"><span class="sim-card-dot" style="background:${colorEmpresa};"></span>${s.empresa || "?"}</div>
        <div class="sim-card-numero">${escapeHtml(s.numero)} · ${escapeHtml(s.cliente) || "sin nombre"}</div>
        <div style="font-size:12px; color:#6B7680; margin-top:2px;">${escapeHtml(s.direccion)}</div>
        <div style="font-size:12px; color:#2E7D32; margin-top:2px; font-weight:600;">${escapeHtml(s.estado_linea) || "Activo"}</div>
      </div>
      <button type="button" class="btn-small btn-secondary btn-secondary-en-card" style="width:auto;">Retirar</button>
    `;
    card.querySelector("button").addEventListener("click", (e) => {
      e.stopPropagation();
      confirmarRetirarSim(s);
    });
    simRegistroResultados.appendChild(card);
  });
}
simRegistroBuscarInput.addEventListener("input", renderResultadosSimRegistro);

async function confirmarRetirarSim(sim) {
  const ok = confirm(`¿Retirar la línea ${sim.numero} (${sim.cliente || "sin nombre"})? Vuelve a tu stock personal.`);
  if (!ok) return;
  try {
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        recurso: "sim",
        accion: "retirar_de_registro",
        numero: sim.numero,
        tecnico: tecnicoLogueado || "",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    // Sale del registro cacheado localmente, para que la búsqueda ya
    // no la muestre sin tener que volver a pedir todo el archivo.
    simsRegistroCache = simsRegistroCache.filter((s) => s.numero !== sim.numero);
    renderResultadosSimRegistro();
    showToast(`Retiraste la línea ${sim.numero} — ya está en tu stock.`);
  } catch (err) {
    showToast("No se pudo retirar: " + err.message);
  }
}

// ---------- Agenda de emergencia ----------
tileEmergenciaBtn.addEventListener("click", async () => {
  showScreen("emergencia");
  cargarListaEmergencias();
  await cargarClientesGeneral();
});

const emergClienteInput = document.getElementById("emerg_cliente");
const emergClienteSugerenciasWrap = document.getElementById("emergClienteSugerenciasWrap");
const emergClienteSugerenciasList = document.getElementById("emergClienteSugerenciasList");
const emergClienteAmbiguoAviso = document.getElementById("emergClienteAmbiguoAviso");

function elegirClienteParaEmerg(c) {
  emergClienteInput.value = c.nombre;
  const telInput = document.getElementById("emerg_telefono");
  const dirInput = document.getElementById("emerg_direccion");
  if (c.telefono) telInput.value = c.telefono;
  if (c.direccion) dirInput.value = c.direccion;
  emergClienteSugerenciasWrap.classList.add("hidden");
  emergClienteAmbiguoAviso.classList.add("hidden");
}

// Misma lista visual (nombre + dirección + abonado) que ya se usa en
// "Cliente" del parte técnico y en SIMs — antes era un <datalist>
// nativo que solo mostraba nombres, y con clientes de nombre muy
// parecido (ej: "Soy Lola 1", "Soy Lola 2", "Soy Lola 3") no había
// forma de saber cuál dirección se estaba por completar.
emergClienteInput.addEventListener("input", () => {
  const texto = emergClienteInput.value.trim();
  emergClienteAmbiguoAviso.classList.add("hidden");

  if (texto.length < 2 || !Array.isArray(clientesGeneralCache)) {
    emergClienteSugerenciasWrap.classList.add("hidden");
    return;
  }
  const clave = normalizeText(texto);
  const coincidencias = clientesGeneralCache
    .filter((c) => (c.nombre && normalizeText(c.nombre).includes(clave)) || (c.direccion && normalizeText(c.direccion).includes(clave)))
    .slice(0, 6);

  if (coincidencias.length === 0) {
    emergClienteSugerenciasWrap.classList.add("hidden");
    return;
  }
  emergClienteSugerenciasList.innerHTML = coincidencias.map((c, idx) => {
    const esAmbiguo = contarClientesConNombreExacto(c.nombre) > 1;
    return `
    <div class="cliente-sugerencia-item${esAmbiguo ? " cliente-sugerencia-ambiguo" : ""}" data-idx="${idx}">
      <div class="cliente-sugerencia-nombre">${escapeHtml(c.nombre)}</div>
      ${c.direccion ? `<div class="cliente-sugerencia-direccion">${escapeHtml(c.direccion)}</div>` : ""}
      ${c.numero_abonado ? `<div class="cliente-sugerencia-abonado">Abonado: ${escapeHtml(c.numero_abonado)}</div>` : ""}
    </div>
  `;
  }).join("");
  emergClienteSugerenciasList.querySelectorAll(".cliente-sugerencia-item").forEach((item) => {
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      elegirClienteParaEmerg(coincidencias[Number(item.dataset.idx)]);
    });
  });
  emergClienteSugerenciasWrap.classList.remove("hidden");
});

document.getElementById("emerg_cliente").addEventListener("change", (e) => {
  const texto = e.target.value.trim();
  const cantidad = contarClientesConNombreExacto(texto);
  if (cantidad > 1) {
    // Varios clientes con el mismo nombre — no se adivina cuál es
    // (antes se agarraba el primero en silencio). Se avisa y se pide
    // elegir de la lista de sugerencias, fijándose la dirección.
    emergClienteAmbiguoAviso.textContent = `⚠ Hay ${cantidad} clientes llamados "${texto}" — elegí el correcto de la lista de sugerencias (fijate la dirección) para no confundirte.`;
    emergClienteAmbiguoAviso.classList.remove("hidden");
    return;
  }
  emergClienteAmbiguoAviso.classList.add("hidden");
  const encontrado = buscarClientePorNombre(texto);
  if (!encontrado) return;
  const telInput = document.getElementById("emerg_telefono");
  const dirInput = document.getElementById("emerg_direccion");
  if (!telInput.value.trim() && encontrado.telefono) telInput.value = encontrado.telefono;
  if (!dirInput.value.trim() && encontrado.direccion) dirInput.value = encontrado.direccion;
});
volverDeEmergenciaBtn.addEventListener("click", () => showScreen("home"));

// ---------- Vista semanal de ocupación (para agendar emergencias sin pisarse) ----------
let ocupacionSemanaAbierta = false;
verOcupacionSemanaBtn.addEventListener("click", async () => {
  ocupacionSemanaAbierta = !ocupacionSemanaAbierta;
  ocupacionSemanaWrap.classList.toggle("hidden", !ocupacionSemanaAbierta);
  verOcupacionSemanaBtn.textContent = ocupacionSemanaAbierta ? "📅 Ocultar ocupación de la semana" : "📅 Ver ocupación de la semana";
  if (ocupacionSemanaAbierta) await renderOcupacionSemana();
});

async function renderOcupacionSemana() {
  ocupacionSemanaStatus.textContent = "Cargando...";
  ocupacionSemanaList.innerHTML = "";
  try {
    // Trae emergencias ya agendadas fresco (el cronograma ya viene
    // precargado desde el login, no hace falta pedirlo de nuevo).
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=servicios_emergencia", { headers, cache: "no-store" });
    const data = await res.json();
    const emergenciasAgendadas = Array.isArray(data) ? data : [];

    const hoy = new Date();
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(hoy);
      d.setDate(hoy.getDate() + i);
      dias.push(d);
    }

    ocupacionSemanaStatus.textContent = "";
    ocupacionSemanaList.innerHTML = dias.map((d) => {
      const fechaISO = fechaLocalISO(d);
      const etiquetaDia = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short" });

      const delCronograma = (cronogramaCache || [])
        .filter((t) => t.fecha === fechaISO)
        .sort((a, b) => (a.hora_inicio || "").localeCompare(b.hora_inicio || ""))
        .map((t) => `<div class="ocupacion-item">🔧 ${escapeHtml(t.hora_inicio || "")}${t.hora_fin ? "–" + escapeHtml(t.hora_fin) : ""} — ${escapeHtml(t.tecnico || "")}${t.tarea ? ": " + escapeHtml(t.tarea.slice(0, 60)) : ""}</div>`);

      const delasEmergencias = emergenciasAgendadas
        .filter((e) => e.fecha === fechaISO)
        .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""))
        .map((e) => `<div class="ocupacion-item ocupacion-item-emergencia">🚨 ${escapeHtml(e.hora || "(sin hora)")} — ${escapeHtml(e.cliente || "")}</div>`);

      const items = [...delCronograma, ...delasEmergencias];
      return `
        <div class="ocupacion-dia-card">
          <div class="ocupacion-dia-titulo">${etiquetaDia}</div>
          ${items.length > 0 ? items.join("") : `<div class="ocupacion-item ocupacion-item-libre">Sin nada agendado — día libre</div>`}
        </div>
      `;
    }).join("");
  } catch (err) {
    ocupacionSemanaStatus.textContent = "No se pudo cargar la ocupación de la semana.";
  }
}

async function cargarListaEmergencias() {
  emergenciaListaStatus.textContent = "Cargando...";
  emergenciaLista.innerHTML = "";
  try {
    const res = await fetch("/api/datos?coleccion=servicios_emergencia", {
      headers: { Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      cache: "no-store",
    });
    const data = await res.json();
    const lista = Array.isArray(data) ? data : [];
    if (lista.length === 0) {
      emergenciaListaStatus.textContent = "Todavía no se cargó ningún servicio de emergencia.";
      return;
    }
    emergenciaListaStatus.textContent = "";
    lista
      .slice()
      .sort((a, b) => (b.fecha_carga || "").localeCompare(a.fecha_carga || ""))
      .slice(0, 20)
      .forEach((e) => {
        const card = document.createElement("div");
        card.className = "sim-card";
        card.innerHTML = `
          <div>
            <div class="sim-card-numero">${escapeHtml(e.cliente) || "(sin cliente)"} ${e.revisado ? "· <span style=\"color:#2E7D32;\">ya pasado</span>" : ""}</div>
            <div style="font-size:12px; color:#6B7680; margin-top:2px;">${escapeHtml(e.direccion)}</div>
            <div style="font-size:12px; color:#6B7680; margin-top:2px;">${escapeHtml(e.tarea)}</div>
            <div style="font-size:12px; color:#8A9089; margin-top:4px;">Para: ${e.fecha_deseada || "?"}${e.hora_deseada ? " " + e.hora_deseada : ""} — cargado por ${escapeHtml(e.cargado_por) || "?"}</div>
          </div>
        `;
        emergenciaLista.appendChild(card);
      });
  } catch (err) {
    emergenciaListaStatus.textContent = "No se pudo cargar la lista.";
  }
}

cargarEmergenciaBtn.addEventListener("click", async () => {
  const cliente = document.getElementById("emerg_cliente").value.trim();
  const direccion = document.getElementById("emerg_direccion").value.trim();
  const telefono = document.getElementById("emerg_telefono").value.trim();
  const tarea = document.getElementById("emerg_tarea").value.trim();
  const fecha_deseada = document.getElementById("emerg_fecha").value;
  const hora_deseada = document.getElementById("emerg_hora").value;

  if (!cliente || !direccion || !tarea || !fecha_deseada) {
    showToast("Completá al menos cliente, dirección, motivo y fecha deseada.");
    return;
  }

  cargarEmergenciaBtn.disabled = true;
  cargarEmergenciaBtn.textContent = "Cargando...";
  try {
    const resActual = await fetch("/api/datos?coleccion=servicios_emergencia", {
      headers: { Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      cache: "no-store",
    });
    const listaActual = await resActual.json();
    const lista = Array.isArray(listaActual) ? listaActual : [];

    const nuevaEntrada = {
      id: "emerg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      cliente, direccion, telefono, tarea, fecha_deseada, hora_deseada,
      cargado_por: tecnicoLogueado || "Oficina",
      fecha_carga: new Date().toISOString(),
      revisado: false,
    };

    const res = await fetch("/api/datos?coleccion=servicios_emergencia", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify([...lista, nuevaEntrada]),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");

    showToast("Servicio de emergencia cargado — se le avisó a todo el equipo.");
    document.getElementById("emerg_cliente").value = "";
    document.getElementById("emerg_direccion").value = "";
    document.getElementById("emerg_telefono").value = "";
    document.getElementById("emerg_tarea").value = "";
    document.getElementById("emerg_fecha").value = "";
    document.getElementById("emerg_hora").value = "";
    cargarListaEmergencias();
  } catch (err) {
    showToast("No se pudo cargar: " + err.message);
  } finally {
    cargarEmergenciaBtn.disabled = false;
    cargarEmergenciaBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="vertical-align:-3px; margin-right:5px;"><path d="M12 9v4M12 17h.01M10.29 3.86l-8.18 14.18A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-3l-8.18-14.14a2 2 0 0 0-3.42 0z"/></svg>Cargar servicio de emergencia';
  }
});


// ---------- Resumen de emergencias pendientes, mostrado en Cronograma ----------
async function cargarResumenEmergenciasEnCronograma() {
  try {
    const res = await fetch("/api/datos?coleccion=servicios_emergencia", {
      headers: { Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      cache: "no-store",
    });
    const data = await res.json();
    const pendientes = (Array.isArray(data) ? data : []).filter((e) => !e.revisado);
    if (pendientes.length === 0) {
      cronoEmergenciasWrap.classList.add("hidden");
      return;
    }
    cronoEmergenciasWrap.classList.remove("hidden");
    cronoEmergenciasLista.innerHTML = pendientes
      .map((e) => `
        <div style="font-size:13px; margin-top:4px;">
          <b>${escapeHtml(e.cliente)}</b> — ${escapeHtml(e.tarea)} · para ${e.fecha_deseada || "?"}${e.hora_deseada ? " " + e.hora_deseada : ""}
          <span style="color:#8A9089;">(cargó ${escapeHtml(e.cargado_por)})</span>
        </div>
      `)
      .join("");
  } catch (err) {
    // si falla, simplemente no se muestra el resumen — no es crítico para ver el resto del cronograma
    cronoEmergenciasWrap.classList.add("hidden");
  }
}

// ---------- Planos de cableado ----------
// Saca ceros a la izquierda para que "98", "098" y "00000098" se
// traten como el mismo número — protege contra el caso típico de
// Excel guardando la columna como número en vez de texto.
function normalizarNumeroCliente(numero) {
  const limpio = String(numero || "").trim().replace(/^0+(?=\d)/, "");
  return limpio || "0";
}

let planosCache = null; // se trae una sola vez y se cachea (nombres, es liviano)
let clientesParaPlanosCache = null; // numero_cliente -> nombre, para poder mostrar el nombre real en vez de "CLI_XXXXXX"
const LIMITE_RESULTADOS_PLANOS = 30;

tilePlanosBtn.addEventListener("click", () => {
  showScreen("planos");
  planosBuscarInput.value = "";
  planosResultados.innerHTML = "";
  planosStatus.textContent = "Escribí para buscar por nombre o número de cliente.";
  cargarPlanos();
});
volverDePlanosBtn.addEventListener("click", () => showScreen("home"));

async function cargarPlanos() {
  const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
  if (!clientesParaPlanosCache) {
    try {
      const resClientes = await fetch("/api/datos?coleccion=clientes", { headers, cache: "no-store" });
      const dataClientes = await resClientes.json();
      clientesParaPlanosCache = {};
      (Array.isArray(dataClientes) ? dataClientes : []).forEach((c) => {
        // Se normaliza sacando los ceros a la izquierda — si en el
        // Excel la columna no quedó como texto, Excel convierte
        // "00000098" en el número 98 solo, perdiendo los ceros. Sin
        // normalizar esto, "CLI_00000098" (el archivo) nunca
        // cruzaría con un cliente cargado como "98".
        if (c.numero_cliente) clientesParaPlanosCache[normalizarNumeroCliente(c.numero_cliente)] = c.nombre || "";
      });
    } catch (err) {
      clientesParaPlanosCache = {}; // si falla, se sigue igual mostrando el nombre de archivo tal cual
    }
  }
  if (planosCache) return; // ya está en memoria
  try {
    const res = await fetch("/api/planos", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const lista = await res.json();
    // A cada plano, si su nombre sigue el patrón "CLI_XXXXXX" (o
    // "CLI_XXXXXX_2", "CLI_XXXXXX_3"... cuando un cliente tiene más
    // de un plano), se le suma el nombre real del cliente (buscado
    // en la base de Clientes) — así se puede mostrar y buscar por
    // cualquiera de los dos, y agrupar los planos de un mismo
    // cliente juntos.
    planosCache = (Array.isArray(lista) ? lista : []).map((p) => {
      const match = /^CLI_(\d+)(?:_(\d+))?$/i.exec(p.nombre);
      const numeroCliente = match ? match[1] : null;
      const indicePlano = match && match[2] ? Number(match[2]) : 1;
      const nombreCliente = numeroCliente ? clientesParaPlanosCache[normalizarNumeroCliente(numeroCliente)] : null;
      return { ...p, numero_cliente: numeroCliente, indice_plano: indicePlano, nombre_cliente: nombreCliente || null };
    });
  } catch (err) {
    planosStatus.textContent = "No se pudo cargar la lista de planos.";
    planosCache = [];
  }
}

function renderResultadosPlanos() {
  const busqueda = normalizeText(planosBuscarInput.value.trim());
  planosResultados.innerHTML = "";
  if (!busqueda) {
    planosStatus.textContent = "Escribí para buscar por nombre o número de cliente.";
    return;
  }
  if (!planosCache) {
    planosStatus.textContent = "Cargando...";
    return;
  }
  const coincidencias = planosCache.filter((p) =>
    normalizeText(p.nombre).includes(busqueda) ||
    (p.nombre_cliente && normalizeText(p.nombre_cliente).includes(busqueda)) ||
    (p.numero_cliente && p.numero_cliente.includes(busqueda))
  );
  if (coincidencias.length === 0) {
    planosStatus.textContent = "Ningún plano coincide con esa búsqueda.";
    return;
  }

  // Agrupar por cliente (o por nombre de archivo crudo, si no tiene
  // número de cliente reconocido) — así un cliente con varios planos
  // aparece en UNA sola tarjeta, con un botón por cada uno.
  const grupos = new Map();
  coincidencias.forEach((p) => {
    const clave = p.numero_cliente || p.nombre;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(p);
  });

  planosStatus.textContent = grupos.size > LIMITE_RESULTADOS_PLANOS
    ? `${grupos.size} coincidencias — mostrando las primeras ${LIMITE_RESULTADOS_PLANOS}.`
    : `${grupos.size} coincidencia(s).`;

  Array.from(grupos.values()).slice(0, LIMITE_RESULTADOS_PLANOS).forEach((planosDelCliente) => {
    planosDelCliente.sort((a, b) => a.indice_plano - b.indice_plano);
    const primero = planosDelCliente[0];
    const card = document.createElement("div");
    card.className = "sim-card";
    const tituloPrincipal = primero.nombre_cliente || primero.nombre;
    const subtitulo = primero.nombre_cliente ? `N° de cliente ${escapeHtml(primero.numero_cliente)}` : "PDF";
    const botones = planosDelCliente.map((p, i) =>
      `<button type="button" class="btn-small btn-secondary btn-secondary-en-card" style="width:auto;" data-nombre="${escapeHtml(p.nombre)}">${planosDelCliente.length > 1 ? `Plano ${i + 1}` : "Ver"}</button>`
    ).join(" ");
    card.innerHTML = `
      <div style="flex:1;">
        <div class="sim-card-numero">${escapeHtml(tituloPrincipal)}</div>
        <div style="font-size:12px; color:#6B7680; margin-top:2px;">${subtitulo}</div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">${botones}</div>
    `;
    card.querySelectorAll("button[data-nombre]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        abrirPlano(btn.dataset.nombre, btn);
      });
    });
    planosResultados.appendChild(card);
  });
}
planosBuscarInput.addEventListener("input", renderResultadosPlanos);

async function abrirPlano(nombre, boton) {
  const textoOriginal = boton.textContent;
  boton.textContent = "...";
  boton.disabled = true;
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch(`/api/planos?nombre=${encodeURIComponent(nombre)}`, { headers });
    if (!res.ok) throw new Error("No se pudo abrir el plano");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  } catch (err) {
    showToast("No se pudo abrir el plano: " + err.message);
  } finally {
    boton.textContent = textoOriginal;
    boton.disabled = false;
  }
}

// Al abrir la app, si hay una sesión guardada y vigente, entra directo
// sin pasar por el login (ver SESION_DURACION_MS más arriba).
if (intentarRestaurarSesion()) bloquearSiCorresponde();
