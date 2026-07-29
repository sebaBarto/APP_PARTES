// ==== CONFIGURACIÓN — completar antes de publicar ====

// Versión de la app — sube con cada actualización (3.0.0 -> 3.0.1 ->
// ... -> 3.0.9 -> 3.1.0 -> ...), para poder verificar a simple vista
// que un celular tiene la última versión.
const APP_VERSION = "3.2.9";

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
const TECNICOS_PASSWORDS_RESPALDO = {
  "Marcos Torres": "MarcosT@253",
  "Cristian Rossetti": "CristianR@5890",
  "Rodrigo Bertorello": "CAMBIAR_CLAVE_RODRIGO_BERTORELLO",
  "Guillermo Bertorello": "GuillermoB@849",
  "Marcos Pellegrini": "MarcosP@2907",
  "Sebastian Bartolozzi": "Sebab031",
  "Alfredo Thiesing": "AlfredoT@3972",
};

// Contraseña general de respaldo (para oficina/pruebas) — entra sin
// asociarse a ningún técnico en particular, y el campo Técnico queda
// para elegir a mano como antes.
const APP_PASSWORD_GENERAL = "Marcos@2018";

const EMAILJS_PUBLIC_KEY = "-4JfiB5vtz2jMgIpi";

// Plantilla que manda SIEMPRE a la casilla fija de la oficina
// (el "To email" de esta plantilla está configurado en emailjs.com)
const EMAILJS_SERVICE_ID = "service_b7zraoh";
const EMAILJS_TEMPLATE_OFICINA = "template_bzy9t47";

// Plantilla que manda al mail del cliente (variable, cargado en el form).
// Esta plantilla debe tener el campo "To email" configurado como
// {{cliente_email}} en emailjs.com, NO una casilla fija.
const EMAILJS_TEMPLATE_CLIENTE = "template_jtmn27i";

// URL desde donde se descarga el listado de servicios pendientes.
// Es un endpoint propio (función serverless de Vercel, ver /api/servicios.js)
// que guarda los datos en un repo privado — nunca queda como archivo
// público. No hace falta tocar esta línea si el endpoint vive en el
// mismo dominio que la app (caso normal).
const SERVICIOS_URL = "/api/servicios";

// Clave secreta compartida entre esta app, admin.html y la función
// serverless (ver variable de entorno SERVICIOS_API_TOKEN en Vercel).
// Cambiala antes de publicar — que sea larga y difícil de adivinar.
const SERVICIOS_API_TOKEN = "54455ad29a4eb28e48ca915e3510ff95ceb682523fa74b32";
// =======================================================

if (window.emailjs && EMAILJS_PUBLIC_KEY !== "TU_PUBLIC_KEY") {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
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
  consultas: document.getElementById("screen-consultas"),
  guardias: document.getElementById("screen-guardias"),
  historial: document.getElementById("screen-historial"),
  credencial: document.getElementById("screen-credencial"),
  vehiculos: document.getElementById("screen-vehiculos"),
  vehiculoDetalle: document.getElementById("screen-vehiculo-detalle"),
  form: document.getElementById("screen-form"),
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

// Botón de "ojito" para mostrar/ocultar contraseña — reutilizable en
// cualquier campo de este tipo. Arranca siempre oculta por defecto.
function habilitarOjitoContrasena(inputEl, btnEl) {
  btnEl.addEventListener("click", () => {
    const oculta = inputEl.type === "password";
    inputEl.type = oculta ? "text" : "password";
    btnEl.textContent = oculta ? "🙈" : "👁";
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
const dashTecnicosList = document.getElementById("dashTecnicosList");
const dashRepetidosList = document.getElementById("dashRepetidosList");
const sugerenciasWrap = document.getElementById("sugerenciasWrap");
const sugerenciasList = document.getElementById("sugerenciasList");
const refreshDashboardBtn = document.getElementById("refreshDashboardBtn");
const dashSyncLabel = document.getElementById("dashSyncLabel");
const verDashboardFinancieroBtn = document.getElementById("verDashboardFinancieroBtn");
const descargarExcelDashboardBtn = document.getElementById("descargarExcelDashboardBtn");
const descargarExcelDashboardFinBtn = document.getElementById("descargarExcelDashboardFinBtn");
const panelSaludo = document.getElementById("panelSaludo");
const abrirAdminBtn = document.getElementById("abrirAdminBtn");
const tileServiciosBtn = document.getElementById("tileServiciosBtn");
const tileDashboardsBtn = document.getElementById("tileDashboardsBtn");
const tileGuardiasBtn = document.getElementById("tileGuardiasBtn");
const tileHistorialBtn = document.getElementById("tileHistorialBtn");
const tileCredencialBtn = document.getElementById("tileCredencialBtn");
const tileVehiculosBtn = document.getElementById("tileVehiculosBtn");
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
const vehiculoEnUsoInfo = document.getElementById("vehiculoEnUsoInfo");
const vehiculoHoraDevolucion = document.getElementById("vehiculoHoraDevolucion");
const vehiculoKmDevolucion = document.getElementById("vehiculoKmDevolucion");
const vehiculoEvento = document.getElementById("vehiculoEvento");
const vehiculoEventoDetalleWrap = document.getElementById("vehiculoEventoDetalleWrap");
const vehiculoEventoDetalle = document.getElementById("vehiculoEventoDetalle");
const vehiculoDevolverBtn = document.getElementById("vehiculoDevolverBtn");
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
const historialModoLabel = document.getElementById("historialModoLabel");
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
volverDeServiciosBtn.addEventListener("click", () => showScreen("serviciosMenu"));
const verConsultasBtn = document.getElementById("verConsultasBtn");
const volverDeConsultasBtn = document.getElementById("volverDeConsultasBtn");
const consultaCategoriaSelect = document.getElementById("consultaCategoriaSelect");
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
const dashVehiculosFiltro = document.getElementById("dashVehiculosFiltro");
const descargarExcelVehiculosBtn = document.getElementById("descargarExcelVehiculosBtn");
const dashVehiculosStatus = document.getElementById("dashVehiculosStatus");
const dashVehiculosList = document.getElementById("dashVehiculosList");
const dashFinStatus = document.getElementById("dashFinStatus");
const dashFinPagosNum = document.getElementById("dashFinPagosNum");
const dashFinBonificadosNum = document.getElementById("dashFinBonificadosNum");
const dashFinTotalNum = document.getElementById("dashFinTotalNum");
const dashFinPromedioNum = document.getElementById("dashFinPromedioNum");
const refreshDashboardFinancieroBtn = document.getElementById("refreshDashboardFinancieroBtn");
const dashFinSyncLabel = document.getElementById("dashFinSyncLabel");
const mapaStatus = document.getElementById("mapaStatus");
const mapaCercanosList = document.getElementById("mapaCercanosList");
const toSignBtn = document.getElementById("toSignBtn");
const backToFormBtn = document.getElementById("backToFormBtn");
const clearSignBtn = document.getElementById("clearSignBtn");
const confirmSignBtn = document.getElementById("confirmSignBtn");
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
let serviciosCache = [];
let serviciosResueltos = new Set(JSON.parse(localStorage.getItem("servicios_resueltos") || "[]"));
let fotoBase64 = null;
let fotoMimeType = null;

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.dataset.active = key === name ? "true" : "false";
  });
}

function setStatus(text, mode) {
  statusPill.textContent = text;
  statusPill.className = "topbar-status" + (mode ? " " + mode : "");
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 3600);
}

// ---------- Login ----------
let tecnicoLogueado = "";
let tecnicosPasswords = { ...TECNICOS_PASSWORDS_RESPALDO };

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
      data.forEach((t) => { if (t.nombre) mapa[t.nombre] = t.password || ""; });
      tecnicosPasswords = mapa;
      localStorage.setItem("tecnicos_cache", JSON.stringify(mapa));
    }
  } catch (err) {
    const cacheado = localStorage.getItem("tecnicos_cache");
    if (cacheado) {
      try { tecnicosPasswords = JSON.parse(cacheado); } catch (e) { /* usa el respaldo de arranque */ }
    }
  }
  poblarSelectsTecnico();
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

function attemptLogin() {
  const usuarioElegido = loginTecnicoSelect.value;
  const intento = loginPassword.value;

  if (!usuarioElegido) {
    loginError.textContent = "Elegí tu usuario antes de ingresar.";
    return;
  }

  const esValido = usuarioElegido === "__general__"
    ? intento === APP_PASSWORD_GENERAL
    : tecnicosPasswords[usuarioElegido] === intento;

  if (esValido) {
    tecnicoLogueado = usuarioElegido === "__general__" ? "" : usuarioElegido;
    if (tecnicoLogueado) {
      localStorage.setItem("tecnico_logueado", tecnicoLogueado);
    } else {
      localStorage.removeItem("tecnico_logueado");
    }
    loginError.textContent = "";
    actualizarAccesoDashboardFinanciero();
    showScreen("home");
    fetchServicios();
    precargarHistorialParaVisitas();
    precargarCronogramaParaSugerencias();
    actualizarAccesoCredencial();
    actualizarAccesoExcelDashboards();
    actualizarSaludoPanel();
    actualizarBadgeColaEnvios();
    procesarColaEnvios();
  } else {
    loginError.textContent = "Contraseña incorrecta.";
    loginPassword.value = "";
    loginPassword.focus();
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
async function precargarCronogramaParaSugerencias() {
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/cronograma", { headers, cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    cronogramaCache = Array.isArray(data.tareas) ? data.tareas : [];
    cronogramaTecnicosCache = Array.isArray(data.tecnicos) ? data.tecnicos : [];
  } catch (err) {
    // silencioso — la sugerencia de servicios cercanos simplemente no aparece
  }
}

// Solo Sebastian Bartolozzi ve el botón del dashboard financiero.
// Saluda por el nombre de pila del técnico logueado, arriba a la
// derecha del panel principal (o "Oficina" si entró con la clave
// general, que no está asociada a ningún técnico en particular).
function actualizarSaludoPanel() {
  const nombre = tecnicoLogueado ? tecnicoLogueado.split(" ")[0] : "Oficina";
  panelSaludo.textContent = `Hola, ${nombre}`;
}

function actualizarAccesoDashboardFinanciero() {
  if (tecnicoLogueado === "Sebastian Bartolozzi") {
    verDashboardFinancieroBtn.classList.remove("hidden");
    abrirAdminBtn.classList.remove("hidden");
  } else {
    verDashboardFinancieroBtn.classList.add("hidden");
    abrirAdminBtn.classList.add("hidden");
  }
}
loginBtn.addEventListener("click", attemptLogin);
loginPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptLogin();
});

// ---------- Listado de servicios pendientes ----------
function formatSyncTime(date) {
  return "Actualizado " + date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function normalizeText(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function filtrarServicios() {
  const term = normalizeText(serviciosSearch.value);
  if (!term) return serviciosCache;
  return serviciosCache.filter((item) => {
    const haystack = normalizeText(
      [item.numero_servicio, item.cliente, item.direccion, item.localidad, item.tarea].join(" ")
    );
    return haystack.includes(term);
  });
}

// Umbrales para marcar un servicio como "estancado" — se administran
// desde admin.html (pestaña "Servicios pendientes"), estos valores acá
// son solo el respaldo de arranque hasta que se cargue la config real.
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
    const resuelto = item.numero_servicio && serviciosResueltos.has(item.numero_servicio);
    const dias = resuelto ? null : diasEstancado(item);
    let claseEstancado = "";
    let badgeEstancado = "";
    if (dias != null && dias >= DIAS_URGENTE) {
      claseEstancado = " estancado-urgente";
      badgeEstancado = `<span class="servicio-card-estancado-badge urgente">🔴 Hace ${dias} días</span>`;
    } else if (dias != null && dias >= DIAS_ATENCION) {
      claseEstancado = " estancado-atencion";
      badgeEstancado = `<span class="servicio-card-estancado-badge">🕒 Hace ${dias} días</span>`;
    }
    const card = document.createElement("button");
    card.type = "button";
    card.className = "servicio-card" + (resuelto ? " resuelto" : "") + claseEstancado;
    card.innerHTML = `
      <div class="servicio-card-num">N° ${item.numero_servicio ?? ""}${resuelto ? '<span class="servicio-card-resuelto-badge">RESUELTO</span>' : badgeEstancado}</div>
      <div class="servicio-card-cliente">${item.cliente ?? ""}</div>
      <div class="servicio-card-direccion">${item.direccion ?? ""}${item.localidad ? ", " + item.localidad : ""}</div>
      <div class="servicio-card-tarea">${item.tarea ?? ""}</div>
    `;
    card.addEventListener("click", () => seleccionarServicio(item));
    serviciosListEl.appendChild(card);
  });
}

serviciosSearch.addEventListener("input", () => {
  renderServiciosList(filtrarServicios());
});

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

function seleccionarServicio(item) {
  currentNumeroServicio = item.numero_servicio ?? "";
  document.getElementById("f_cliente").value = item.cliente ?? "";
  document.getElementById("f_direccion").value = item.direccion ?? "";
  if (item.localidad) document.getElementById("f_localidad").value = item.localidad;
  document.getElementById("f_tarea").value = item.tarea ?? "";
  actualizarBotonLlamar(item.telefono);
  actualizarBotonWhatsapp(item.telefono);
  autocompletarTecnico();
  autocompletarFecha();
  mostrarVisitaAnterior();
  showScreen("form");
}

refreshServiciosBtn.addEventListener("click", fetchServicios);
manualReportBtn.addEventListener("click", () => {
  currentNumeroServicio = "";
  actualizarBotonLlamar(null);
  actualizarBotonWhatsapp(null);
  autocompletarTecnico();
  autocompletarFecha();
  mostrarVisitaAnterior();
  showScreen("form");
});

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
      cronoStatus.textContent = `⚠ No se pudo leer Drive en este momento (${data.error_drive || "sin detalle"}). Mostrando la última copia guardada.`;
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

  if (!dias.includes(cronoDiaActivo)) cronoDiaActivo = dias[0];

  cronoDiasTabs.innerHTML = "";
  dias.forEach((dia) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "crono-dia-chip" + (dia === cronoDiaActivo ? " active" : "");
    chip.textContent = dia;
    chip.addEventListener("click", () => {
      cronoDiaActivo = dia;
      renderCronogramaDias();
    });
    cronoDiasTabs.appendChild(chip);
  });

  // Filtro de técnicos: se arma con la lista completa detectada en el
  // Excel (todas las columnas), no solo los que ya tienen alguna tarea
  // cargada — así aparecen también los que por ahora no tienen nada.
  const tecnicoActual = cronoTecnicoFiltro.value;
  const tecnicosConTareas = cronogramaCache.map((t) => t.tecnico);
  const tecnicos = [...new Set([...cronogramaTecnicosCache, ...tecnicosConTareas])].filter(Boolean).sort();
  cronoTecnicoFiltro.innerHTML = '<option value="">Todos los técnicos</option>' +
    tecnicos.map((t) => `<option value="${t}">${t}</option>`).join("");
  cronoTecnicoFiltro.value = tecnicos.includes(tecnicoActual) ? tecnicoActual : "";

  renderCronogramaTareas();
}

function renderCronogramaTareas() {
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
    const vinculado = !!encontrarServicioPorTarea(t.tarea);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "crono-tarea-card" + (vinculado ? "" : " sin-vincular");
    card.innerHTML = `
      <div class="crono-tarea-hora">${t.hora_inicio || ""} - ${t.hora_fin || ""}${vinculado ? "" : '<span class="crono-tarea-badge">SIN VINCULAR</span>'}</div>
      <div class="crono-tarea-tecnico">${t.tecnico || ""}</div>
      <div class="crono-tarea-texto">${t.tarea || ""}</div>
    `;
    card.addEventListener("click", () => seleccionarTareaCronograma(t));
    cronoTareasList.appendChild(card);
  });
}

cronoTecnicoFiltro.addEventListener("change", renderCronogramaTareas);

// ---------- Relación cronograma → servicio pendiente ----------
function encontrarServicioPorTarea(textoTarea) {
  const norm = normalizeText(textoTarea);
  const candidatos = serviciosCache.filter((s) => s.cliente && norm.includes(normalizeText(s.cliente)));
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
  document.getElementById("f_tarea").value = (t.tarea || "").replace(/\n/g, " ");
  actualizarBotonLlamar(null);
  actualizarBotonWhatsapp(null);
  autocompletarTecnico();
  autocompletarFecha();
  mostrarVisitaAnterior();
  showScreen("form");
}

verCronogramaBtn.addEventListener("click", () => {
  showScreen("cronograma");
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
const visitaAnteriorInfo = document.getElementById("visitaAnteriorInfo");
function mostrarVisitaAnterior() {
  const nombreCliente = document.getElementById("f_cliente").value.trim();
  if (!nombreCliente || !Array.isArray(historialCache) || historialCache.length === 0) {
    visitaAnteriorInfo.classList.add("hidden");
    return;
  }
  const clave = normalizeText(nombreCliente);
  const anteriores = historialCache
    .filter((h) => h.cliente && normalizeText(h.cliente) === clave && h.fecha)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (anteriores.length === 0) {
    visitaAnteriorInfo.classList.add("hidden");
    return;
  }
  const ultima = anteriores[0];
  const [y, m, d] = ultima.fecha.split("-");
  const tareaCorta = (ultima.tarea || "").slice(0, 80);
  visitaAnteriorInfo.textContent = `Última visita: ${d}/${m}/${y}` +
    (ultima.tecnico ? ` (técnico: ${ultima.tecnico})` : "") +
    (tareaCorta ? ` — ${tareaCorta}` : "");
  visitaAnteriorInfo.classList.remove("hidden");
}
document.getElementById("f_cliente").addEventListener("change", mostrarVisitaAnterior);

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
  if (tipo === "0") return 0;
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
    const esOtro = getDescuentoTipo() === "otro";
    descuentoOtroPct.style.display = esOtro ? "block" : "none";
    if (!esOtro) descuentoOtroPct.value = "";
    recalcularCostoFinal();
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
const matCantidadInput = document.getElementById("matCantidadInput");
const agregarMaterialBtn = document.getElementById("agregarMaterialBtn");
const materialesAgregadosList = document.getElementById("materialesAgregadosList");

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
}
cargarMaterialesCatalogo();

function poblarCategoriasMateriales() {
  const opciones = materialesCatalogo.map((c) => `<option value="${c.categoria}">${c.categoria}</option>`).join("");
  matCategoriaSelect.innerHTML = `<option value="" disabled selected>Categoría</option>${opciones}`;
}

matCategoriaSelect.addEventListener("change", () => {
  const cat = materialesCatalogo.find((c) => c.categoria === matCategoriaSelect.value);
  if (!cat) {
    matModeloSelect.innerHTML = '<option value="" disabled selected>Elegí primero una categoría</option>';
    matModeloSelect.disabled = true;
    return;
  }
  const opciones = cat.modelos.map((m) => `<option value="${m}">${m}</option>`).join("");
  matModeloSelect.innerHTML = `<option value="" disabled selected>Modelo</option>${opciones}`;
  matModeloSelect.disabled = false;
});

function renderMaterialesAgregados() {
  materialesAgregadosList.innerHTML = "";
  materialesAgregados.forEach((item, idx) => {
    const fila = document.createElement("div");
    fila.className = "material-agregado-item";
    fila.innerHTML = `
      <span>${item.modelo} — x${item.cantidad}</span>
      <button type="button" class="quitar" title="Quitar">✕</button>
    `;
    fila.querySelector(".quitar").addEventListener("click", () => {
      materialesAgregados.splice(idx, 1);
      renderMaterialesAgregados();
    });
    materialesAgregadosList.appendChild(fila);
  });
}

agregarMaterialBtn.addEventListener("click", () => {
  const modelo = matModeloSelect.value;
  const cantidad = parseInt(matCantidadInput.value, 10) || 1;
  if (!modelo) {
    showToast("Elegí una categoría y un modelo antes de agregar.");
    return;
  }
  materialesAgregados.push({ modelo, cantidad });
  renderMaterialesAgregados();
  matModeloSelect.value = "";
  matCantidadInput.value = "";
});

function getMaterialesUtilizados() {
  const agregados = materialesAgregados.map((item) => `${item.modelo} x${item.cantidad}`);
  const otros = document.getElementById("f_materiales").value.trim();
  return [...agregados, otros].filter(Boolean).join(", ");
}

backToListBtn.addEventListener("click", () => {
  resetForm();
  showScreen("list");
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

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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
    mapaStatus.textContent = "No se pudo conectar para buscar la ubicación.";
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
        <div class="mapa-cercano-num">N° ${servicio.numero_servicio || ""}</div>
        <div class="mapa-cercano-cliente">${servicio.cliente || ""}</div>
        <div class="mapa-cercano-dist">${Math.round(dist)} m — ${servicio.direccion || ""}</div>
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
        <div class="sugerencia-card-cliente">${servicio.cliente || ""}</div>
        <div class="sugerencia-card-dist">${(dist / 1000).toFixed(1)} km — ${servicio.direccion || ""}</div>
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
volverDeMapaBtn.addEventListener("click", () => {
  showScreen("form");
});

function getFormData() {
  return {
    numero_servicio: currentNumeroServicio,
    es_instalacion: instalacionCheck.checked,
    tipo_servicio: instalacionCheck.checked ? "Instalación" : "Servicio técnico",
    cliente: document.getElementById("f_cliente").value.trim(),
    direccion: document.getElementById("f_direccion").value.trim(),
    localidad: document.getElementById("f_localidad").value.trim(),
    cliente_email: document.getElementById("f_cliente_email").value.trim(),
    tarea: document.getElementById("f_tarea").value.trim(),
    materiales: getMaterialesUtilizados(),
    materiales_retirados: document.getElementById("f_materiales_retirados").value.trim(),
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
  };
}

function resetForm() {
  instalacionCheck.checked = false;
  ["f_cliente","f_direccion","f_localidad","f_cliente_email","f_tarea",
   "f_materiales","f_materiales_retirados","f_importe","f_costo_final",
   "f_observaciones"].forEach(id => document.getElementById(id).value = "");
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
  formaPagoChecks.forEach((c) => { c.checked = false; });
  materialesAgregados = [];
  renderMaterialesAgregados();
  matCategoriaSelect.value = "";
  matModeloSelect.innerHTML = '<option value="" disabled selected>Elegí primero una categoría</option>';
  matModeloSelect.disabled = true;
  matCantidadInput.value = "";
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
toSignBtn.addEventListener("click", () => {
  const data = getFormData();
  if (!data.cliente || !data.tecnico) {
    showToast("Completá al menos Cliente y Técnico antes de continuar.");
    return;
  }
  if (!data.fecha) {
    showToast("Falta completar la Fecha del servicio.");
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
  // El servicio recién completado se queda en la lista, marcado como
  // "resuelto" (por serviciosResueltos), en vez de desaparecer — así
  // se puede verificar de un vistazo que ya se hizo.
  renderServiciosList(filtrarServicios());
  showScreen("list");
});

// ---------- Pad de firma (canvas) ----------
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
  const { idParte, data, signatureImgTag, fotoBase64: fb64, fotoMimeType: fmt } = payload;

  let fotoLink = "";
  let fotoError = "";
  if (fb64) {
    try {
      if (interactivo) sendingLabel.textContent = "Subiendo foto...";
      const fotoRes = await fetch("/api/upload-foto", {
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
  };

  let oficinaOk = false;
  let clienteOk = false;
  const clienteIntentado = !!data.cliente_email;

  try {
    if (interactivo) sendingLabel.textContent = "Enviando copia a la oficina…";
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_OFICINA, {
      ...basePayload,
      foto_link: fotoLink,
      tiempo_transcurrido: data.tiempo_transcurrido,
      imprevisto: data.imprevisto,
    });
    oficinaOk = true;
    if (data.numero_servicio) {
      serviciosResueltos.add(data.numero_servicio);
      localStorage.setItem("servicios_resueltos", JSON.stringify([...serviciosResueltos]));
    }
    try {
      const histRes = await fetch("/api/historial", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
        body: JSON.stringify({
          numero_servicio: data.numero_servicio || "",
          es_instalacion: data.es_instalacion,
          id_parte: idParte,
          cliente: data.cliente,
          direccion: data.direccion,
          localidad: data.localidad,
          tecnico: data.tecnico,
          tecnico2: data.tecnico2,
          fecha: data.fecha,
          hora_entrada: data.hora_entrada,
          hora_salida: data.hora_salida,
          importe: data.importe,
          descuento: data.descuento,
          costo_final: data.costo_final,
          forma_pago: data.forma_pago,
          imprevisto: data.imprevisto,
        }),
      });
      if (!histRes.ok) {
        const histData = await histRes.json().catch(() => ({}));
        console.error("Error registrando historial:", histData);
        if (interactivo) showToast("⚠ El mail se envió, pero no se pudo registrar en el dashboard.");
      }
    } catch (err) {
      console.error("Error registrando historial:", err);
      if (interactivo) showToast("⚠ El mail se envió, pero no se pudo registrar en el dashboard.");
    }
  } catch (err) {
    console.error("Error enviando a oficina:", err);
  }

  if (oficinaOk && clienteIntentado) {
    try {
      if (interactivo) sendingLabel.textContent = "Enviando copia al cliente…";
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_CLIENTE, {
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
  const cantidad = obtenerColaEnvios().length;
  if (!colaEnviosBanner) return;
  if (cantidad > 0) {
    colaEnviosTexto.textContent = `${cantidad} parte(s) pendiente(s) de enviar (sin conexión).`;
    colaEnviosBanner.classList.remove("hidden");
  } else {
    colaEnviosBanner.classList.add("hidden");
  }
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
  for (const item of cola) {
    try {
      const resultado = await intentarEnviarParte(item, false);
      if (resultado.oficinaOk) {
        enviadosOk++;
      } else {
        restantes.push(item);
      }
    } catch (err) {
      restantes.push(item);
    }
  }
  guardarColaEnvios(restantes);
  procesandoColaEnvios = false;

  if (enviadosOk > 0) {
    showToast(`Se enviaron ${enviadosOk} parte(s) que estaban pendientes por falta de conexión.`);
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

  const data = getFormData();
  // El N° de parte que se muestra y se manda por mail toma el N° de
  // servicio real (el que viene del listado precargado). Solo se genera
  // uno automático si el técnico cargó el parte manualmente, sin elegir
  // un servicio de la lista.
  const idParte = data.numero_servicio ? data.numero_servicio : generarIdParte();
  const signatureDataUrl = canvas.toDataURL("image/png");
  const signatureImgTag = `<img src="${signatureDataUrl}" alt="Firma del cliente" width="260" style="display:block;" />`;

  const payload = { idParte, data, signatureImgTag, fotoBase64, fotoMimeType };

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
    return;
  }

  const resultado = await intentarEnviarParte(payload, true);
  const { oficinaOk, clienteOk, clienteIntentado, fotoError } = resultado;

  setStatus(oficinaOk ? "LISTO" : "");
  doneId.textContent = `N° de parte: ${idParte}`;
  sugerenciasWrap.classList.add("hidden");
  sugerenciasList.innerHTML = "";
  if (oficinaOk) {
    verificarYSugerirCercanos(data);
  }

  let mensajeFoto = "";
  if (fotoBase64 && fotoError) {
    mensajeFoto = ` (⚠ la foto no se pudo subir: ${fotoError})`;
  }

  if (oficinaOk && (clienteOk || !clienteIntentado)) {
    doneMessage.textContent = (clienteIntentado
      ? "Copia enviada a la oficina y al cliente"
      : "Copia enviada a la oficina (sin mail de cliente)") + mensajeFoto;
    showScreen("done");
  } else if (oficinaOk && clienteIntentado && !clienteOk) {
    doneMessage.textContent = "Enviado a la oficina, pero falló el envío al cliente" + mensajeFoto;
    showScreen("done");
  } else {
    // Falló el envío principal (a oficina) — se guarda para reintentar
    // solo automáticamente en vez de perder el parte.
    agregarAColaEnvios(payload);
    doneMessage.textContent = "No se pudo enviar en este momento — el parte quedó guardado y se va a reintentar solo cuando vuelva la conexión.";
    showScreen("done");
  }
});

// ---------- Dashboard ----------
let historialCache = [];
let dashPeriodoActivo = "mes";
let chartTecnico = null;
let chartDias = null;
let chartDistancia = null;
let chartTipo = null;

function obtenerRangoPeriodo(periodo) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (periodo === "todo") {
    return { desde: new Date(2000, 0, 1), hasta: new Date(2100, 0, 1) };
  }
  if (periodo === "dia") {
    return { desde: hoy, hasta: hoy };
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
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 10 } } },
          title: { display: true, text: "Instalación vs. servicio técnico" },
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
  const medallas = { [nombresOrdenados[0]]: "🥇", [nombresOrdenados[1]]: "🥈", [nombresOrdenados[2]]: "🥉" };
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
        card.innerHTML = `
          <div class="dash-tecnico-nombre">${nombre}${medalla ? ` <span class="dash-medalla" title="Ranking de ${etiquetaPeriodo}">${medalla}</span>` : ""}</div>
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
        <div><b>${tecnico || "(sin técnico)"}</b> volvió a <b>${cliente}</b> ${n} veces este mes</div>
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
  chartTecnico = new Chart(canvas, {
    type: "bar",
    data: {
      labels: nombres,
      datasets: [{ label: "Resueltos", data: nombres.map((n) => porTecnico[n].cantidad), backgroundColor: "#F5A623" }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, title: { display: true, text: "Resueltos por técnico" } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
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

const PALETA_TECNICOS = ["#F5A623", "#101820", "#2E86DE", "#2E7D32", "#B5772A", "#8A9089", "#C0392B", "#6B7680"];

function renderChartDistancia(porTecnico) {
  const canvas = document.getElementById("dashChartDistancia");
  if (chartDistancia) chartDistancia.destroy();
  const nombres = Object.keys(porTecnico).filter((n) => porTecnico[n].distanciaKm > 0);
  if (nombres.length === 0) return;
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

async function cargarConsultasCategorias() {
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=consultas-categorias", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    consultasCategoriasCache = Array.isArray(data) ? data : [];
  } catch (err) {
    consultasCategoriasCache = [];
  }
  const opciones = consultasCategoriasCache
    .map((c) => `<option value="${c.categoria}">${c.categoria}</option>`)
    .join("");
  consultaCategoriaSelect.innerHTML = `<option value="" disabled selected>Elegí una categoría</option>${opciones}`;
  consultasCategoriasCargadas = true;
}

verConsultasBtn.addEventListener("click", () => {
  showScreen("consultas");
  consultaRespuestaWrap.classList.add("hidden");
  consultaStatus.textContent = "";
  if (!consultasCategoriasCargadas) cargarConsultasCategorias();
});
volverDeConsultasBtn.addEventListener("click", () => {
  showScreen("home");
});

preguntarBtn.addEventListener("click", async () => {
  const categoria = consultaCategoriaSelect.value;
  const pregunta = consultaPreguntaInput.value.trim();
  if (!categoria) {
    showToast("Elegí una categoría antes de preguntar.");
    return;
  }
  if (!pregunta) {
    showToast("Escribí tu pregunta antes de enviarla.");
    return;
  }

  preguntarBtn.disabled = true;
  consultaRespuestaWrap.classList.add("hidden");
  consultaStatus.textContent = "Buscando en los manuales y consultando a la IA... puede tardar unos segundos.";

  try {
    const res = await fetch("/api/consultas", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ categoria, pregunta }),
    });
    const data = await res.json();
    if (!res.ok) {
      const detalle = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail || "");
      throw new Error((data.error || "Error desconocido") + (detalle ? ` — ${detalle}` : ""));
    }

    consultaStatus.textContent = "";
    consultaRespuestaTexto.textContent = data.respuesta;
    const usados = data.manuales_usados || [];
    consultaManualesUsados.textContent = usados.length > 0 ? `Basado en: ${usados.join(", ")}` : "";
    consultaRespuestaWrap.classList.remove("hidden");
  } catch (err) {
    consultaStatus.textContent = "No se pudo obtener una respuesta: " + err.message;
  } finally {
    preguntarBtn.disabled = false;
  }
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
      const indiceActual = indiceGuardiaEnFecha(inicioRef, secuencia.length, ahora);
      const actual = secuencia[indiceActual];
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
      const indice = indiceGuardiaEnFecha(inicioRef, secuencia.length, cursor);
      proximos.push({ fecha: new Date(cursor), tecnico: secuencia[indice] });
      cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    guardiaProximosList.innerHTML = "";
    proximos.forEach(({ fecha, tecnico }) => {
      const dd = String(fecha.getDate()).padStart(2, "0");
      const mm = String(fecha.getMonth() + 1).padStart(2, "0");
      const card = document.createElement("div");
      card.className = "guardia-proximo-card";
      card.innerHTML = `<span>${tecnico.nombre}</span><span class="guardia-proximo-fecha">desde ${dd}/${mm}</span>`;
      guardiaProximosList.appendChild(card);
    });
  } catch (err) {
    guardiaStatus.textContent = "No se pudo cargar la información de guardias.";
  }
}

// ---------- Historial (últimos 4 días) ----------
tileHistorialBtn.addEventListener("click", () => {
  showScreen("historial");
  fetchHistorialReciente();
});
volverDeHistorialBtn.addEventListener("click", () => {
  showScreen("home");
});
refreshHistorialBtn.addEventListener("click", fetchHistorialReciente);

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
  } catch (err) {
    historialStatus.textContent = "No se pudo cargar el historial.";
  }
}

function renderHistorialReciente() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() - 3); // hoy + 3 días atrás = últimos 4 días

  // Cada técnico ve solo lo suyo — salvo Sebastian Bartolozzi (y el
  // login general de oficina), que ven el listado completo del equipo.
  const veTodo = !tecnicoLogueado || tecnicoLogueado === "Sebastian Bartolozzi";
  historialModoLabel.textContent = veTodo
    ? "Viendo los servicios de todo el equipo."
    : "Viendo solo tus servicios.";

  const recientes = historialCache
    .filter((h) => {
      if (!h.fecha) return false;
      const [y, m, d] = h.fecha.split("-").map(Number);
      const f = new Date(y, m - 1, d);
      if (!(f >= limite && f <= hoy)) return false;
      if (veTodo) return true;
      return h.tecnico === tecnicoLogueado || h.tecnico2 === tecnicoLogueado;
    })
    .sort((a, b) => {
      const claveA = `${a.fecha} ${a.hora_entrada || ""}`;
      const claveB = `${b.fecha} ${b.hora_entrada || ""}`;
      return claveB.localeCompare(claveA);
    });

  historialList.innerHTML = "";
  if (recientes.length === 0) {
    historialStatus.textContent = "No hay servicios completados en los últimos 4 días.";
    return;
  }
  historialStatus.textContent = "";
  recientes.forEach((h) => {
    let fechaTexto = h.fecha || "";
    if (h.fecha) {
      const [y, m, d] = h.fecha.split("-");
      fechaTexto = `${d}/${m}/${y}`;
    }
    const card = document.createElement("div");
    card.className = "historial-card";
    card.innerHTML = `
      <div class="historial-card-num">N° ${h.numero_servicio || h.id_parte || ""}</div>
      <div class="historial-card-cliente">${h.cliente || ""}</div>
      <div class="historial-card-direccion">${h.direccion || ""}${h.localidad ? ", " + h.localidad : ""}</div>
      <div class="historial-card-horario">${fechaTexto} — ${h.hora_entrada || "?"} a ${h.hora_salida || "?"}</div>
    `;
    historialList.appendChild(card);
  });
}

// ---------- Credencial digital del técnico ----------
tileCredencialBtn.addEventListener("click", () => {
  showScreen("credencial");
  fetchYRenderCredencial();
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

async function fetchVehiculosConfig() {
  const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
  const res = await fetch("/api/datos?coleccion=vehiculos", { headers, cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
async function fetchVehiculosHistorial() {
  const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
  const res = await fetch("/api/vehiculo-uso", { headers, cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
function encontrarRegistroAbierto(historial, vehiculo) {
  return [...historial].reverse().find((h) => h.vehiculo === vehiculo && !h.hora_devolucion) || null;
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
        alertas.push({ nivel: "urgente", mensaje: `⚠ ${u.nombre}: venció (${diasRestantes === 0 ? "hoy" : Math.abs(diasRestantes) + " día(s) atrás"})` });
      } else if (diasRestantes <= avisoAntes) {
        alertas.push({ nivel: "atencion", mensaje: `${u.nombre}: faltan ${diasRestantes} día(s)` });
      }
    } else {
      const kmActual = Number(vehiculoConfig.km_actual) || 0;
      const valor = Number(u.valor) || 0;
      const restante = valor - kmActual;
      const avisoAntes = Number(u.aviso_antes) || 0;
      if (restante <= 0) {
        alertas.push({ nivel: "urgente", mensaje: `⚠ ${u.nombre}: ya se pasó por ${Math.abs(restante)} km` });
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

async function renderVehiculosPicker() {
  vehiculosListaStatus.textContent = "Cargando...";
  vehiculosPanelTiles.innerHTML = "";
  try {
    const [config, historial] = await Promise.all([fetchVehiculosConfig(), fetchVehiculosHistorial()]);
    vehiculosListaStatus.textContent = "";
    config.forEach((v) => {
      const abierto = encontrarRegistroAbierto(historial, v.nombre);
      const estado = abierto ? `En uso por ${abierto.tecnico} desde las ${abierto.hora_toma}` : "Libre";
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "panel-tile";
      tile.innerHTML = `
        <span class="panel-tile-icon">${v.nombre === "Moto" ? "🏍️" : "🚐"}</span>
        <span>
          <span class="panel-tile-label" style="display:block;">${v.nombre}</span>
          <span class="vehiculo-panel-status" style="color:${abierto ? "#B5772A" : "#3FAE6E"};">${estado}</span>
        </span>
      `;
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

async function renderVehiculoDetalle() {
  vehiculoDetalleNombre.textContent = vehiculoSeleccionado.toUpperCase();
  vehiculoDetalleStatus.textContent = "Cargando...";
  vehiculoAlertasWrap.classList.add("hidden");
  vehiculoTomarWrap.classList.add("hidden");
  vehiculoDevolverWrap.classList.add("hidden");
  try {
    const [config, historial] = await Promise.all([fetchVehiculosConfig(), fetchVehiculosHistorial()]);
    const vConfig = config.find((v) => v.nombre === vehiculoSeleccionado) || { nombre: vehiculoSeleccionado, km_actual: 0, umbrales: [] };
    const abierto = encontrarRegistroAbierto(historial, vehiculoSeleccionado);

    vehiculoDetalleStatus.textContent = `Kilometraje actual: ${vConfig.km_actual || 0} km`;

    const alertas = calcularAlertasVehiculo(vConfig);
    if (alertas.length > 0) {
      vehiculoAlertasWrap.innerHTML = alertas
        .map((a) => `<div class="vehiculo-alerta-card ${a.nivel}">${a.mensaje}</div>`)
        .join("");
      vehiculoAlertasWrap.classList.remove("hidden");
    }

    const tecnicoActual = tecnicoLogueado || "Oficina";

    if (!abierto) {
      vehiculoHoraToma.value = horaActualHHMM();
      vehiculoTomarWrap.classList.remove("hidden");
    } else if (abierto.tecnico === tecnicoActual) {
      vehiculoEnUsoInfo.textContent = `Lo tomaste vos hoy a las ${abierto.hora_toma}.`;
      vehiculoHoraDevolucion.parentElement.classList.remove("hidden");
      vehiculoKmDevolucion.parentElement.classList.remove("hidden");
      vehiculoEvento.parentElement.classList.remove("hidden");
      vehiculoDevolverBtn.classList.remove("hidden");
      vehiculoHoraDevolucion.value = horaActualHHMM();
      vehiculoKmDevolucion.value = "";
      vehiculoEvento.value = "";
      vehiculoEventoDetalle.value = "";
      vehiculoEventoDetalleWrap.classList.remove("hidden");
      vehiculoEventoDetalleWrap.style.display = "none";
      vehiculoDevolverWrap.classList.remove("hidden");
    } else {
      vehiculoEnUsoInfo.textContent = `Este vehículo lo tiene ${abierto.tecnico} desde las ${abierto.hora_toma}. No se puede tomar hasta que lo devuelva.`;
      vehiculoDevolverWrap.classList.remove("hidden");
      vehiculoHoraDevolucion.parentElement.classList.add("hidden");
      vehiculoKmDevolucion.parentElement.classList.add("hidden");
      vehiculoEvento.parentElement.classList.add("hidden");
      vehiculoEventoDetalleWrap.classList.add("hidden");
      vehiculoDevolverBtn.classList.add("hidden");
    }
  } catch (err) {
    vehiculoDetalleStatus.textContent = "No se pudo cargar la información de este vehículo.";
  }
}

vehiculoEvento.addEventListener("change", () => {
  vehiculoEventoDetalleWrap.style.display = vehiculoEvento.value ? "block" : "none";
});

vehiculoTomarBtn.addEventListener("click", async () => {
  vehiculoTomarBtn.disabled = true;
  try {
    const res = await fetch("/api/vehiculo-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        accion: "tomar",
        vehiculo: vehiculoSeleccionado,
        tecnico: tecnicoLogueado || "Oficina",
        fecha: fechaActualISOVehiculo(),
        hora_toma: vehiculoHoraToma.value || horaActualHHMM(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast(`Tomaste ${vehiculoSeleccionado}.`);
    renderVehiculoDetalle();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  } finally {
    vehiculoTomarBtn.disabled = false;
  }
});

vehiculoDevolverBtn.addEventListener("click", async () => {
  if (!vehiculoKmDevolucion.value) {
    showToast("Completá los kilómetros de devolución.");
    return;
  }
  const eventoCompleto = vehiculoEvento.value
    ? `${vehiculoEvento.value}${vehiculoEventoDetalle.value ? ": " + vehiculoEventoDetalle.value : ""}`
    : "";
  vehiculoDevolverBtn.disabled = true;
  try {
    const res = await fetch("/api/vehiculo-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        accion: "devolver",
        vehiculo: vehiculoSeleccionado,
        tecnico: tecnicoLogueado || "Oficina",
        hora_devolucion: vehiculoHoraDevolucion.value || horaActualHHMM(),
        km_devolucion: vehiculoKmDevolucion.value,
        evento: eventoCompleto,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast(`Devolviste ${vehiculoSeleccionado}. ¡Gracias!`);
    showScreen("vehiculos");
    renderVehiculosPicker();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  } finally {
    vehiculoDevolverBtn.disabled = false;
  }
});

// ---------- Dashboard de vehículos ----------
let dashVehiculosCache = [];
let dashVehPeriodoActivo = "mes";

verDashboardVehiculosBtn.addEventListener("click", () => {
  showScreen("dashboardVehiculos");
  fetchDashVehiculos();
});
volverDeDashboardVehiculosBtn.addEventListener("click", () => showScreen("dashboardsMenu"));
refreshDashVehiculosBtn.addEventListener("click", fetchDashVehiculos);
dashVehiculosFiltro.addEventListener("change", renderDashVehiculos);
document.querySelectorAll(".dash-veh-periodo-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".dash-veh-periodo-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    dashVehPeriodoActivo = chip.dataset.periodo;
    renderDashVehiculos();
  });
});

async function poblarFiltroVehiculosDashboard() {
  const actual = dashVehiculosFiltro.value;
  try {
    const vehiculos = await fetchVehiculosConfig();
    const opciones = vehiculos.map((v) => `<option value="${v.nombre}">${v.nombre}</option>`).join("");
    dashVehiculosFiltro.innerHTML = `<option value="">Todos los vehículos</option>${opciones}`;
    dashVehiculosFiltro.value = actual;
  } catch (err) {
    // si falla, se queda con lo que ya estaba cargado (o vacío)
  }
}

async function fetchDashVehiculos() {
  dashVehiculosStatus.textContent = "Cargando...";
  dashVehiculosList.innerHTML = "";
  try {
    await poblarFiltroVehiculosDashboard();
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/vehiculo-uso", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    dashVehiculosCache = Array.isArray(data) ? data : [];
    dashVehiculosSyncLabel.textContent = formatSyncTime(new Date());
    renderDashVehiculos();
  } catch (err) {
    dashVehiculosStatus.textContent = "No se pudo cargar el historial de vehículos.";
  }
}

function filtrarDashVehiculos() {
  const filtro = dashVehiculosFiltro.value;
  const rango = obtenerRangoPeriodo(dashVehPeriodoActivo);
  return dashVehiculosCache
    .filter((h) => (!filtro || h.vehiculo === filtro) && fechaEnRango(h.fecha, rango))
    .sort((a, b) => {
      const claveA = `${a.fecha || ""} ${a.hora_toma || ""}`;
      const claveB = `${b.fecha || ""} ${b.hora_toma || ""}`;
      return claveB.localeCompare(claveA);
    });
}

function renderDashVehiculos() {
  const filtrados = filtrarDashVehiculos();
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
    card.innerHTML = `
      <div class="historial-card-num">${h.vehiculo || ""}</div>
      <div class="historial-card-cliente">${h.tecnico || ""}</div>
      <div class="historial-card-direccion">${fechaTexto} — ${h.hora_toma || "?"} a ${h.hora_devolucion || "(en uso)"}</div>
      <div class="historial-card-horario">Km devolución: ${h.km_devolucion || "—"}${h.evento ? " · ⚠ " + h.evento : ""}</div>
    `;
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
    "Hora toma": h.hora_toma || "",
    "Hora devolución": h.hora_devolucion || "",
    "Km devolución": h.km_devolucion || "",
    Evento: h.evento || "",
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Vehículos");
  const hoy = fechaActualISOVehiculo();
  XLSX.writeFile(libro, `vehiculos_${dashVehPeriodoActivo}_${hoy}.xlsx`);
});

// ---------- Descarga a Excel de los dashboards general y financiero ----------
// Solo Sebastian Bartolozzi (o el login general de oficina) ven estos
// botones — el resto de los técnicos puede ver los dashboards pero no
// descargarlos.
function actualizarAccesoExcelDashboards() {
  const puede = !tecnicoLogueado || tecnicoLogueado === "Sebastian Bartolozzi";
  descargarExcelDashboardBtn.classList.toggle("hidden", !puede);
  descargarExcelDashboardFinBtn.classList.toggle("hidden", !puede);
  descargarExcelVehiculosBtn.classList.toggle("hidden", !puede);
}

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
