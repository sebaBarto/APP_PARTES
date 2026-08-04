// ==== CONFIGURACIÓN — completar antes de publicar ====

// Versión de la app — sube con cada actualización (3.0.0 -> 3.0.1 ->
// ... -> 3.0.9 -> 3.1.0 -> ...), para poder verificar a simple vista
// que un celular tiene la última versión.
const APP_VERSION = "3.34.1";

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

// Config de porcentaje reutilizable para los gráficos de torta — la
// guía de UX de gráficos recomienda siempre mostrar el % en la propia
// torta, no solo al pasar el mouse/dedo (accesibilidad).
const DATALABELS_PORCENTAJE = {
  color: (ctx) => {
    const bg = ctx.dataset.backgroundColor;
    const color = Array.isArray(bg) ? bg[ctx.dataIndex] : bg;
    // Texto oscuro sobre colores claros (ámbar, verdes claros), texto
    // blanco sobre colores oscuros (navy, rojos) — así siempre se lee bien.
    const clarosConocidos = ["#F5A623", "#FFD98E", "#3FAE6E", "#2E7D32"];
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

// Clave secreta compartida entre esta app, admin.html y la función
// serverless (ver variable de entorno SERVICIOS_API_TOKEN en Vercel).
// Cambiala antes de publicar — que sea larga y difícil de adivinar.
const SERVICIOS_API_TOKEN = "54455ad29a4eb28e48ca915e3510ff95ceb682523fa74b32";
// =======================================================

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
  dashboardSims: document.getElementById("screen-dashboard-sims"),
  consultas: document.getElementById("screen-consultas"),
  guardias: document.getElementById("screen-guardias"),
  historial: document.getElementById("screen-historial"),
  credencial: document.getElementById("screen-credencial"),
  vehiculos: document.getElementById("screen-vehiculos"),
  vehiculoDetalle: document.getElementById("screen-vehiculo-detalle"),
  sims: document.getElementById("screen-sims"),
  simDetalle: document.getElementById("screen-sim-detalle"),
  simRegistro: document.getElementById("screen-sim-registro"),
  planos: document.getElementById("screen-planos"),
  emergencia: document.getElementById("screen-emergencia"),
  herramientas: document.getElementById("screen-herramientas"),
  herramientaDetalle: document.getElementById("screen-herramienta-detalle"),
  comodatoForm: document.getElementById("screen-comodato-form"),
  comodatoFirma: document.getElementById("screen-comodato-firma"),
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
const tileComodatoBtn = document.getElementById("tileComodatoBtn");
const tilePlanosBtn = document.getElementById("tilePlanosBtn");
const tileEmergenciaBtn = document.getElementById("tileEmergenciaBtn");
const volverDeEmergenciaBtn = document.getElementById("volverDeEmergenciaBtn");
const cargarEmergenciaBtn = document.getElementById("cargarEmergenciaBtn");
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
const simClienteSelect = document.getElementById("simClienteSelect");
const simClienteOtroWrap = document.getElementById("simClienteOtroWrap");
const simClienteOtro = document.getElementById("simClienteOtro");
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
const dashVehiculosFiltro = document.getElementById("dashVehiculosFiltro");
const dashVehGastoCombustibleNum = document.getElementById("dashVehGastoCombustibleNum");
const dashVehGastoMantenimientoNum = document.getElementById("dashVehGastoMantenimientoNum");
const descargarExcelVehiculosBtn = document.getElementById("descargarExcelVehiculosBtn");
const dashVehiculosStatus = document.getElementById("dashVehiculosStatus");
const dashVehiculosList = document.getElementById("dashVehiculosList");
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

// ---------- Borrador del parte en curso ----------
// Si el técnico abre un servicio, carga datos, y toca "Volver" (o
// cierra la app) antes de terminar y firmar, lo que ya había cargado
// no se pierde — queda guardado en el celular y se restaura solo la
// próxima vez que abra ESE MISMO servicio. Solo aplica a servicios
// reales de la lista (con número de servicio) — los partes cargados
// con "Cargar parte sin servicio" no tienen una clave estable para
// guardar un borrador, así que no se guardan.
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
    materiales_otros: document.getElementById("f_materiales").value,
    materiales_agregados: materialesAgregados,
    materiales_retirados: document.getElementById("f_materiales_retirados").value,
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
  document.getElementById("f_materiales").value = b.materiales_otros || "";
  materialesAgregados = Array.isArray(b.materiales_agregados) ? b.materiales_agregados : [];
  renderMaterialesAgregados();
  document.getElementById("f_materiales_retirados").value = b.materiales_retirados || "";
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
}

function setStatus(text, mode) {
  statusPill.textContent = text;
  statusPill.className = "topbar-status" + (mode ? " " + mode : "");
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
      tecnicosPermisos = mapaPermisos;
      localStorage.setItem("tecnicos_cache", JSON.stringify(mapa));
      localStorage.setItem("tecnicos_permisos_cache", JSON.stringify(mapaPermisos));
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
      dash_general: true, dash_financiero: true, dash_vehiculos: true, dash_sims: true,
      historial_todos: true, vehiculos: true, sims: true, herramientas: true,
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
    dash_vehiculos: true,
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
  localStorage.removeItem("sesion_sat");
  localStorage.removeItem("tecnico_logueado"); // clave vieja, ya no se usa
}

function entrarComoTecnico(nombreTecnico) {
  tecnicoLogueado = nombreTecnico || "";
  guardarSesion(tecnicoLogueado);
  loginError.textContent = "";
  actualizarAccesoDashboardFinanciero();
  showScreen("home");
  fetchServicios();
  precargarHistorialParaVisitas();
  precargarCronogramaParaSugerencias();
  actualizarAccesoCredencial();
  actualizarAccesoExcelDashboards();
  actualizarAccesoSeccionesPanel();
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
      entrarComoTecnico(usuarioElegido === "__general__" ? "" : usuarioElegido);
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

// Muestra u oculta las tiles del panel principal según los permisos
// del técnico logueado (configurados en admin.html → Técnicos). El
// tile de "Dashboards" en sí se oculta solo si no tiene acceso a
// NINGUNO de los 4 dashboards — si tiene al menos uno, entra al
// submenú y ahí ve solo los que le corresponden.
function actualizarAccesoSeccionesPanel() {
  const permisos = permisosDelTecnico(tecnicoLogueado);
  tileDashboardsBtn.classList.toggle("hidden", !(permisos.dash_general || permisos.dash_financiero || permisos.dash_vehiculos || permisos.dash_sims));
  verDashboardBtn.classList.toggle("hidden", !permisos.dash_general);
  verDashboardVehiculosBtn.classList.toggle("hidden", !permisos.dash_vehiculos);
  verDashboardSimsBtn.classList.toggle("hidden", !permisos.dash_sims);
  tileVehiculosBtn.classList.toggle("hidden", !permisos.vehiculos);
  tileSimsBtn.classList.toggle("hidden", !permisos.sims);
  tileHerramientasBtn.classList.toggle("hidden", !permisos.herramientas);
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

cerrarSesionBtn.addEventListener("click", () => {
  borrarSesion();
  tecnicoLogueado = "";
  loginTecnicoSelect.value = "";
  loginPassword.value = "";
  showScreen("login");
});

// ---------- Listado de servicios pendientes ----------
function formatSyncTime(date) {
  return "Actualizado " + date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function normalizeText(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

function filtrarServicios() {
  const term = normalizeText(serviciosSearch.value);
  const sinResueltos = serviciosCache.filter(
    (item) => !(item.numero_servicio && serviciosResueltos.has(item.numero_servicio))
  );
  if (!term) return sinResueltos;
  return sinResueltos.filter((item) => {
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
    const card = document.createElement("button");
    card.type = "button";
    card.className = "servicio-card" + claseEstancado;
    card.innerHTML = `
      <div class="servicio-card-num">N° ${escapeHtml(item.numero_servicio)}${badgeEstancado}</div>
      <div class="servicio-card-cliente">${escapeHtml(item.cliente)}</div>
      <div class="servicio-card-direccion">${escapeHtml(item.direccion)}${item.localidad ? ", " + escapeHtml(item.localidad) : ""}</div>
      <div class="servicio-card-tarea">${escapeHtml(item.tarea)}</div>
      ${item.cobrador ? `<div class="servicio-card-cobrador">Cobrador: ${escapeHtml(item.cobrador)}</div>` : ""}
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
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch(`/api/planos?nombre=${encodeURIComponent("CLI_" + numeroClienteActivo)}`, { headers });
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
  document.getElementById("f_cliente").value = item.cliente ?? "";
  document.getElementById("f_direccion").value = item.direccion ?? "";
  if (item.localidad) document.getElementById("f_localidad").value = item.localidad;
  document.getElementById("f_tarea").value = item.tarea ?? "";
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
    const servicioVinculado = encontrarServicioPorTarea(t.tarea);
    const vinculado = !!servicioVinculado;
    // Antes esto se guardaba de forma temporal en el celular (se
    // borraba solo al actualizar el listado de pendientes) — ahora
    // se compara directo contra el historial real, así queda
    // permanente sin importar cuándo se actualizó nada.
    const resuelto = vinculado && servicioVinculado.numero_servicio &&
      historialCache.some((h) => h.numero_servicio === servicioVinculado.numero_servicio);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "crono-tarea-card" + (vinculado ? "" : " sin-vincular") + (resuelto ? " resuelto" : "");
    card.innerHTML = `
      <div class="crono-tarea-hora">${t.hora_inicio || ""} - ${t.hora_fin || ""}${
        resuelto ? '<span class="crono-tarea-badge resuelto">RESUELTO</span>' : vinculado ? "" : '<span class="crono-tarea-badge">SIN VINCULAR</span>'
      }</div>
      <div class="crono-tarea-tecnico">${escapeHtml(t.tecnico)}</div>
      <div class="crono-tarea-texto">${escapeHtml(t.tarea)}</div>
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
  cargarOpcionesSimInstalar();
  showScreen("form");
}

verCronogramaBtn.addEventListener("click", async () => {
  showScreen("cronograma");
  cargarResumenEmergenciasEnCronograma();
  await precargarHistorialParaVisitas(); // primero esto, para que "resuelto" salga bien desde el primer render
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
  const clave = normalizeText(nombreCliente);
  const anteriores = historialCache
    .filter((h) => h.cliente && normalizeText(h.cliente) === clave && h.fecha)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (anteriores.length === 0) {
    verVisitaAnteriorBtn.disabled = true;
    return;
  }
  ultimaVisitaEncontrada = anteriores[0];
  verVisitaAnteriorBtn.disabled = false;
}
document.getElementById("f_cliente").addEventListener("change", mostrarVisitaAnterior);

verVisitaAnteriorBtn.addEventListener("click", () => {
  if (!ultimaVisitaEncontrada) return;
  const [y, m, d] = ultimaVisitaEncontrada.fecha.split("-");
  visitaAnteriorModalContenido.innerHTML = `
    <p style="margin:0 0 8px;"><b>Se pidió:</b> ${escapeHtml(ultimaVisitaEncontrada.tarea || "(sin detalle)")}</p>
    ${ultimaVisitaEncontrada.observaciones ? `<p style="margin:0 0 8px;"><b>Se resolvió:</b> ${escapeHtml(ultimaVisitaEncontrada.observaciones)}</p>` : ""}
    <p style="margin:0 0 8px;"><b>Fecha:</b> ${d}/${m}/${y}</p>
    <p style="margin:0;"><b>Técnico:</b> ${escapeHtml(ultimaVisitaEncontrada.tecnico || "(sin dato)")}</p>
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

function getSimInstaladaTexto() {
  const sim = getSimAInstalarSeleccionada();
  return sim ? `${sim.empresa}${sim.tipo ? " " + sim.tipo : ""} — ${sim.numero}` : "";
}

// ---------- Instalar una SIM del propio stock en este servicio ----------
let simsEnStockPropio = [];

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
  if (!tecnicoLogueado) return; // el login general no tiene stock propio
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/datos?coleccion=sims", { headers, cache: "no-store" });
    if (!res.ok) return;
    const sims = await res.json();
    simsEnStockPropio = (Array.isArray(sims) ? sims : []).filter(
      (s) => s.tecnico_actual === tecnicoLogueado && s.estado === "stock"
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

fInstalarSim.addEventListener("change", () => {
  simInstalarSelectWrap.style.display = fInstalarSim.checked ? "block" : "none";
});

// Después de enviar el parte con éxito, si se eligió una SIM, la marca
// como usada en el cliente del servicio (sale del stock del técnico).
async function asignarSimInstaladaAlCliente(data) {
  const sim = getSimAInstalarSeleccionada();
  if (!sim || !data.cliente) return;
  try {
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        recurso: "sim",
        accion: "usar",
        numero: sim.numero,
        tecnico: data.tecnico || tecnicoLogueado || "",
        cliente: data.cliente,
        direccion: data.direccion || "",
        numero_servicio: data.numero_servicio || "",
      }),
    });
    const respuesta = await res.json();
    if (!res.ok) throw new Error(respuesta.error || "Error desconocido");
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
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
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
    es_instalacion: instalacionCheck.checked,
    tipo_servicio: instalacionCheck.checked ? "Instalación" : "Servicio técnico",
    cliente: document.getElementById("f_cliente").value.trim(),
    direccion: document.getElementById("f_direccion").value.trim(),
    localidad: document.getElementById("f_localidad").value.trim(),
    cliente_email: document.getElementById("f_cliente_email").value.trim(),
    tarea: document.getElementById("f_tarea").value.trim(),
    materiales: getMaterialesUtilizados(),
    sim_instalada_texto: getSimInstaladaTexto(),
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
  const { idParte, data, signatureImgTag, fotoBase64: fb64, fotoMimeType: fmt } = payload;

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
    if (data.numero_servicio) {
      serviciosResueltos.add(data.numero_servicio);
      localStorage.setItem("servicios_resueltos", JSON.stringify([...serviciosResueltos]));
      borrarBorrador(data.numero_servicio);
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
          tarea: data.tarea,
          observaciones: data.observaciones,
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
        if (interactivo) showToast("El mail se envió, pero no se pudo registrar en el dashboard.");
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
      const tipo = item.tipo || "parte"; // los ya guardados antes de este cambio no tienen tipo -> son partes
      const resultado = tipo === "comodato"
        ? await intentarEnviarComodato(item, false)
        : await intentarEnviarParte(item, false);
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
  // El N° de parte que se muestra y se manda por mail toma el N° de
  // servicio real (el que viene del listado precargado). Solo se genera
  // uno automático si el técnico cargó el parte manualmente, sin elegir
  // un servicio de la lista.
  const idParte = data.numero_servicio ? data.numero_servicio : generarIdParte();
  const signatureDataUrl = normalizarFirmaParaMail(canvas);
  const signatureImgTag = `<img src="${signatureDataUrl}" alt="Firma del cliente" width="320" height="110" style="display:block; width:320px; height:110px; border:0;" />`;

  const payload = { tipo: "parte", idParte, data, signatureImgTag, fotoBase64, fotoMimeType };

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
  vehiculoRecordatorioWrap.classList.add("hidden");
  if (oficinaOk) {
    verificarYSugerirCercanos(data);
    verificarPrimerServicioSinVehiculo(data);
    asignarSimInstaladaAlCliente(data);
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
  consultaManualesWrap.classList.add("hidden");
  consultaStatus.textContent = "";
  if (!consultasCategoriasCargadas) cargarConsultasCategorias();
});

consultaCategoriaSelect.addEventListener("change", () => {
  cargarManualesDeCategoria(consultaCategoriaSelect.value);
});

async function cargarManualesDeCategoria(categoria) {
  if (!categoria) {
    consultaManualesWrap.classList.add("hidden");
    return;
  }
  consultaManualesWrap.classList.remove("hidden");
  consultaManualesStatus.textContent = "Buscando manuales...";
  consultaManualesList.innerHTML = "";
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch(`/api/consultas?categoria=${encodeURIComponent(categoria)}`, { headers, cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    if (!Array.isArray(data) || data.length === 0) {
      consultaManualesStatus.textContent = "No hay manuales cargados en esta categoría todavía.";
      return;
    }
    consultaManualesStatus.textContent = "";
    data.forEach((manual) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "consulta-manual-item";
      item.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="vertical-align:-2px; margin-right:4px; flex-shrink:0;"><path d="M8 3h6l4 4v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/></svg>${escapeHtml(manual.nombre)}`;
      item.addEventListener("click", () => abrirManual(categoria, manual.id, manual.nombre, item));
      consultaManualesList.appendChild(item);
    });
  } catch (err) {
    consultaManualesStatus.textContent = "No se pudieron cargar los manuales de esta categoría.";
  }
}

async function abrirManual(categoria, archivoId, nombre, botonElemento) {
  // Se abre la pestaña ya mismo (todavía vacía), antes de esperar la
  // descarga — así los navegadores que bloquean popups fuera de un
  // gesto directo del usuario (como Safari) no la bloquean.
  const nuevaVentana = window.open("", "_blank");
  const textoOriginal = botonElemento.textContent;
  botonElemento.textContent = "Abriendo...";
  botonElemento.disabled = true;
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch(
      `/api/consultas?categoria=${encodeURIComponent(categoria)}&archivo=${encodeURIComponent(archivoId)}`,
      { headers }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (nuevaVentana) {
      nuevaVentana.location.href = url;
    } else {
      window.open(url, "_blank");
    }
  } catch (err) {
    if (nuevaVentana) nuevaVentana.close();
    showToast("No se pudo abrir el manual: " + err.message);
  } finally {
    botonElemento.textContent = textoOriginal;
    botonElemento.disabled = false;
  }
}
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
      card.innerHTML = `<span>${escapeHtml(tecnico.nombre)}</span><span class="guardia-proximo-fecha">desde ${dd}/${mm}</span>`;
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
  const veTodo = permisosDelTecnico(tecnicoLogueado).historial_todos;
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
      <div class="historial-card-num">N° ${escapeHtml(h.numero_servicio || h.id_parte)}</div>
      <div class="historial-card-cliente">${escapeHtml(h.cliente)}</div>
      <div class="historial-card-direccion">${escapeHtml(h.direccion)}${h.localidad ? ", " + escapeHtml(h.localidad) : ""}</div>
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
  const res = await fetch("/api/recurso-uso?recurso=vehiculo", { headers, cache: "no-store" });
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
      tile.className = `panel-tile panel-tile-grid ${abierto ? "tile-vehiculo-en-uso" : "tile-vehiculo-libre"}`;
      const iconoSvg = v.nombre === "Moto"
        ? '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h4l3-7h3"/><path d="M13 17l-2-5-3-1"/>'
        : '<path d="M3 13l2-6a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 6"/><rect x="2" y="13" width="20" height="5" rx="1.5"/><circle cx="7" cy="18.5" r="1.5"/><circle cx="17" cy="18.5" r="1.5"/>';
      tile.innerHTML = `
        <span class="panel-tile-icon-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconoSvg}</svg>
        </span>
        <span class="panel-tile-label">${v.nombre}</span>
        <span class="vehiculo-panel-status" style="color:${abierto ? "#B5772A" : "#2E7D32"};">${estado}</span>
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
  vehiculoEventoSinDevolverWrap.classList.add("hidden");
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

      // Mientras tenga el vehículo tomado, también puede registrar un
      // evento (combustible, gomería, mecánico, lavadero) sin devolverlo.
      vehiculoTipoEventoSelect.value = "";
      vehiculoEventoKm.value = "";
      vehiculoEventoMonto.value = "";
      vehiculoEventoDetalleTexto.value = "";
      vehiculoEventoSinDevolverWrap.classList.remove("hidden");
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

vehiculoRegistrarEventoBtn.addEventListener("click", async () => {
  const tipoEvento = vehiculoTipoEventoSelect.value;
  const km = vehiculoEventoKm.value;
  if (!tipoEvento) {
    showToast("Elegí el tipo de evento.");
    return;
  }
  if (!km) {
    showToast("Cargá el kilometraje actual del vehículo.");
    return;
  }
  vehiculoRegistrarEventoBtn.disabled = true;
  try {
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        recurso: "vehiculo",
        accion: "evento",
        vehiculo: vehiculoSeleccionado,
        tecnico: tecnicoLogueado || "Oficina",
        hora: horaActualHHMM(),
        tipo_evento: tipoEvento,
        km,
        monto: vehiculoEventoMonto.value || "",
        detalle: vehiculoEventoDetalleTexto.value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast(`Evento registrado: ${tipoEvento}.`);
    showScreen("vehiculos");
    renderVehiculosPicker();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  } finally {
    vehiculoRegistrarEventoBtn.disabled = false;
  }
});

vehiculoTomarBtn.addEventListener("click", async () => {
  vehiculoTomarBtn.disabled = true;
  try {
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        recurso: "vehiculo",
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
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({
        recurso: "vehiculo",
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
    const res = await fetch("/api/recurso-uso?recurso=vehiculo", { headers, cache: "no-store" });
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

  // Gasto en combustible vs. gomería/mecánico/lavadero/otro — suma de
  // los montos cargados en "Registrar un evento sin devolver el
  // vehículo", para tener a la vista cuánto se está gastando, no solo
  // el detalle uno por uno en la lista de abajo.
  const formatoPesos = (n) => "$" + Math.round(n).toLocaleString("es-AR");
  const eventosConMonto = filtrados.filter((h) => h.accion === "evento" && h.monto);
  const gastoCombustible = eventosConMonto
    .filter((h) => h.tipo_evento === "Carga de combustible")
    .reduce((acc, h) => acc + (Number(h.monto) || 0), 0);
  const gastoMantenimiento = eventosConMonto
    .filter((h) => h.tipo_evento !== "Carga de combustible")
    .reduce((acc, h) => acc + (Number(h.monto) || 0), 0);
  dashVehGastoCombustibleNum.textContent = gastoCombustible > 0 ? formatoPesos(gastoCombustible) : "—";
  dashVehGastoMantenimientoNum.textContent = gastoMantenimiento > 0 ? formatoPesos(gastoMantenimiento) : "—";

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
        <div class="historial-card-horario">${h.monto ? "Monto: $" + h.monto : ""}${h.detalle ? (h.monto ? " · " : "") + escapeHtml(h.detalle) : ""}</div>
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
  XLSX.writeFile(libro, `vehiculos_${dashVehPeriodoActivo}_${hoy}.xlsx`);
});

// ---------- Dashboard de SIMs ----------
let dashSimsCache = [];
let chartSimsGeneral = null;
let chartsSimsPorTecnico = {};
const COLORES_COMPANIA_SIM = { Movistar: "#2E9E4F", Personal: "#29ABE2", Claro: "#E4402C" };
let dashSimsPeriodoActivo = "mes";

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

const ETIQUETA_ACCION_SIM = { usar: "Usada en cliente", devolver: "Devuelta a stock", transferir: "Transferida", reemplazar: "Reemplazo en cliente" };

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
  dashSimsList.innerHTML = "";
  renderChartsSims(filtrados);
  if (filtrados.length === 0) {
    dashSimsStatus.textContent = "No hay movimientos para mostrar en ese período.";
    return;
  }
  dashSimsStatus.textContent = "";
  filtrados.forEach((h) => {
    let fechaTexto = h.fecha || "";
    if (h.fecha) {
      const [y, m, d] = h.fecha.split("-");
      fechaTexto = `${d}/${m}/${y}`;
    }
    let detalle = "";
    if (h.accion === "usar") detalle = `Cliente: ${escapeHtml(h.cliente) || "?"}`;
    else if (h.accion === "transferir") detalle = `A: ${escapeHtml(h.tecnico_nuevo) || "?"}`;
    else if (h.accion === "reemplazar") detalle = `Cliente: ${escapeHtml(h.cliente) || "?"} · reemplazó a la SIM ${escapeHtml(h.sim_retirada) || "?"} (${escapeHtml(h.empresa_retirada) || "?"})`;
    const card = document.createElement("div");
    card.className = "historial-card";
    card.innerHTML = `
      <div class="historial-card-num">${h.empresa || ""} · ${escapeHtml(h.numero)}</div>
      <div class="historial-card-cliente">${escapeHtml(h.tecnico)} — ${ETIQUETA_ACCION_SIM[h.accion] || h.accion}</div>
      <div class="historial-card-direccion">${fechaTexto}${h.hora ? " " + h.hora : ""}</div>
      <div class="historial-card-horario">${detalle}</div>
    `;
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
    activarNotificacionesBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" style="vertical-align:-2px; margin-right:4px;"><path d="M12 3a5 5 0 0 0-5 5c0 6-3 8-3 8h16s-3-2-3-8a5 5 0 0 0-5-5z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>${suscripcion ? "Notificaciones activadas" : "Activar notificaciones"}`;
  } catch (err) {
    // si falla la verificación, se deja el botón con su texto por defecto
  }
}

activarNotificacionesBtn.addEventListener("click", async () => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    showToast("Este celular/navegador no admite notificaciones push.");
    return;
  }
  activarNotificacionesBtn.disabled = true;
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") {
      showToast("No se activaron las notificaciones — hace falta el permiso.");
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
    showToast("Notificaciones activadas.");
  } catch (err) {
    showToast("No se pudo activar las notificaciones: " + err.message);
  } finally {
    activarNotificacionesBtn.disabled = false;
  }
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
    await llamarHerramientaUso("devolver");
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
  const item = { tipo: "comodato", datos, firma_comodatario_base64: firmaBase64, cliente_email: clienteEmail };

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
  renderSimsLista();
});
volverDeSimsBtn.addEventListener("click", () => showScreen("home"));
volverDeSimDetalleBtn.addEventListener("click", () => showScreen("sims"));

let simsListaCache = [];

async function renderSimsLista() {
  simsListaStatus.textContent = "Cargando...";
  simsGrupos.innerHTML = "";
  try {
    simsListaCache = await fetchSimsConfig();
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
    card.innerHTML = `
      <div>
        <div class="sim-card-empresa"><span class="sim-card-dot" style="background:${colorEmpresa};"></span>${s.empresa}${s.tipo ? " · " + escapeHtml(s.tipo) : ""}</div>
        <div class="sim-card-numero">${escapeHtml(s.numero)}${mostrarTecnico ? " · " + escapeHtml(s.tecnico_actual) : ""}</div>
      </div>
      <span class="sim-card-estado ${s.estado}">${s.estado === "uso" ? "En uso: " + escapeHtml(s.cliente || "?") : "En stock"}</span>
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
  const propio = tecnicoLogueado || "";
  const veTodas = !!permisosDelTecnico(tecnicoLogueado).sims_ver_todas;
  const listaVisible = veTodas ? simsListaCache.slice() : simsListaCache.filter((s) => s.tecnico_actual === propio);

  if (listaVisible.length === 0) {
    simsListaStatus.textContent = "Todavía no tenés ninguna SIM asignada.";
    return;
  }
  simsListaStatus.textContent = "";

  if (veTodas) {
    // Agrupadas por técnico, para que quede claro de quién es cada una.
    const porTecnico = {};
    listaVisible.forEach((s) => {
      const clave = s.tecnico_actual || "(sin asignar)";
      (porTecnico[clave] = porTecnico[clave] || []).push(s);
    });
    Object.keys(porTecnico).sort().forEach((nombreTec) => {
      const titulo = document.createElement("p");
      titulo.className = "sim-grupo-titulo";
      titulo.textContent = nombreTec === propio ? "Tus SIMs" : nombreTec;
      simsGrupos.appendChild(titulo);
      porTecnico[nombreTec].forEach((s) => simsGrupos.appendChild(crearCard(s, false)));
    });
    return;
  }

  const titulo = document.createElement("p");
  titulo.className = "sim-grupo-titulo";
  titulo.textContent = "Tus SIMs";
  simsGrupos.appendChild(titulo);
  listaVisible.forEach((s) => simsGrupos.appendChild(crearCard(s, false)));
}

function poblarClientesParaSim() {
  const opciones = serviciosCache
    .filter((s) => s.cliente)
    .map((s) => `<option value="${s.cliente}">${s.cliente}</option>`)
    .join("");
  simClienteSelect.innerHTML = `<option value="" disabled selected>Elegí un cliente</option>${opciones}<option value="__otro__">Otro (escribir)</option>`;
}

simClienteSelect.addEventListener("change", () => {
  const esOtro = simClienteSelect.value === "__otro__";
  simClienteOtroWrap.style.display = esOtro ? "block" : "none";
});

async function renderSimDetalle() {
  simDetalleStatus.textContent = "Cargando...";
  simSoloLecturaInfo.classList.add("hidden");
  simUsarWrap.classList.add("hidden");
  simReemplazoWrap.classList.add("hidden");
  simDevolverWrap.classList.add("hidden");
  simRevertirWrap.classList.add("hidden");
  simTransferirWrap.classList.add("hidden");
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

    const esPropia = sim.tecnico_actual === (tecnicoLogueado || "") || !!permisosDelTecnico(tecnicoLogueado).sims_ver_todas;
    if (!esPropia) {
      simSoloLecturaInfo.textContent = sim.estado === "uso"
        ? `Esta SIM la tiene ${sim.tecnico_actual}, en uso en ${sim.cliente || "un cliente"}.`
        : `Esta SIM la tiene ${sim.tecnico_actual}, en stock.`;
      simSoloLecturaInfo.classList.remove("hidden");
      return;
    }

    if (sim.estado === "stock") {
      poblarClientesParaSim();
      simClienteSelect.value = "";
      simClienteOtro.value = "";
      simClienteOtroWrap.style.display = "none";
      simUsarWrap.classList.remove("hidden");
    } else {
      simDevolverWrap.classList.remove("hidden");
    }

    if (sim.tecnico_anterior && sim.tecnico_anterior !== tecnicoLogueado) {
      simRevertirBtn.textContent = `↩ Revertir a ${sim.tecnico_anterior} (por si fue un error)`;
      simRevertirWrap.classList.remove("hidden");
    }

    const otrosTecnicos = Object.keys(tecnicosPasswords).filter((n) => n !== tecnicoLogueado).sort();
    const opciones = otrosTecnicos.map((n) => `<option value="${n}">${n}</option>`).join("");
    const opcionOficina = tecnicoLogueado !== "" ? `<option value="Oficina">Oficina (stock general, sin técnico)</option>` : "";
    simTecnicoNuevoSelect.innerHTML = `<option value="" disabled selected>Elegí un técnico</option>${opcionOficina}${opciones}`;
    simTransferirWrap.classList.remove("hidden");
  } catch (err) {
    simDetalleStatus.textContent = "No se pudo cargar la información de esta SIM.";
  }
}

let simClienteParaReemplazo = "";
let simExistenteParaReemplazo = "";

async function marcarSimComoUsada(cliente) {
  try {
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICIOS_API_TOKEN },
      body: JSON.stringify({ recurso: "sim",
        accion: "usar", numero: simSeleccionada, tecnico: tecnicoLogueado || "", cliente }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    showToast("SIM marcada como usada.");
    renderSimDetalle();
  } catch (err) {
    showToast("No se pudo registrar: " + err.message);
  }
}

simUsarBtn.addEventListener("click", async () => {
  const cliente = simClienteSelect.value === "__otro__" ? simClienteOtro.value.trim() : simClienteSelect.value;
  if (!cliente) {
    showToast("Elegí o escribí el cliente.");
    return;
  }
  simUsarBtn.disabled = true;
  try {
    const sims = await fetchSimsConfig();
    const existente = sims.find((s) => s.estado === "uso" && s.cliente === cliente && s.numero !== simSeleccionada);
    if (existente) {
      simClienteParaReemplazo = cliente;
      simExistenteParaReemplazo = existente.numero;
      simReemplazoMensaje.textContent =
        `Este cliente ya tiene la línea N° ${existente.numero} de ${existente.empresa}` +
        `${existente.tipo ? " " + existente.tipo : ""}. ¿Querés reemplazarla o agregar esta como segunda línea?`;
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
    showToast(`SIM transferida a ${tecnicoNuevo}.`);
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
  const busqueda = simRegistroBuscarInput.value.trim().toLowerCase();
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
    (s.cliente || "").toLowerCase().includes(busqueda) ||
    (s.numero || "").toLowerCase().includes(busqueda) ||
    (s.direccion || "").toLowerCase().includes(busqueda)
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
tileEmergenciaBtn.addEventListener("click", () => {
  showScreen("emergencia");
  cargarListaEmergencias();
});
volverDeEmergenciaBtn.addEventListener("click", () => showScreen("home"));

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
intentarRestaurarSesion();
