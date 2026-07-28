// ==== CONFIGURACIÓN — completar antes de publicar ====

// Contraseña propia por técnico (se valida en el propio celular, no es
// un login con servidor — solo para que no cualquiera que abra la URL
// pueda cargar partes, y para saber quién entró y autocompletar el
// campo "Técnico"). Los nombres tienen que coincidir EXACTO con las
// opciones del selector de técnico en index.html.
const TECNICOS_PASSWORDS = {
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
  list: document.getElementById("screen-list"),
  cronograma: document.getElementById("screen-cronograma"),
  mapa: document.getElementById("screen-mapa"),
  dashboard: document.getElementById("screen-dashboard"),
  dashboardFinanciero: document.getElementById("screen-dashboard-financiero"),
  form: document.getElementById("screen-form"),
  sign: document.getElementById("screen-sign"),
  sending: document.getElementById("screen-sending"),
  done: document.getElementById("screen-done"),
};
const statusPill = document.getElementById("statusPill");
const toastEl = document.getElementById("toast");
const loginBtn = document.getElementById("loginBtn");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");
const refreshServiciosBtn = document.getElementById("refreshServiciosBtn");
const manualReportBtn = document.getElementById("manualReportBtn");
const syncLabel = document.getElementById("syncLabel");
const listStatus = document.getElementById("listStatus");
const serviciosListEl = document.getElementById("serviciosList");
const serviciosSearch = document.getElementById("serviciosSearch");
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
const fotoInput = document.getElementById("f_foto");
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
const refreshDashboardBtn = document.getElementById("refreshDashboardBtn");
const dashSyncLabel = document.getElementById("dashSyncLabel");
const verDashboardFinancieroBtn = document.getElementById("verDashboardFinancieroBtn");
const volverDeDashboardFinancieroBtn = document.getElementById("volverDeDashboardFinancieroBtn");
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

function attemptLogin() {
  const intento = loginPassword.value;
  const nombreCoincidente = Object.keys(TECNICOS_PASSWORDS).find(
    (nombre) => TECNICOS_PASSWORDS[nombre] === intento
  );

  if (nombreCoincidente) {
    tecnicoLogueado = nombreCoincidente;
    localStorage.setItem("tecnico_logueado", tecnicoLogueado);
    loginError.textContent = "";
    actualizarAccesoDashboardFinanciero();
    showScreen("list");
    fetchServicios();
  } else if (intento === APP_PASSWORD_GENERAL) {
    tecnicoLogueado = "";
    localStorage.removeItem("tecnico_logueado");
    loginError.textContent = "";
    actualizarAccesoDashboardFinanciero();
    showScreen("list");
    fetchServicios();
  } else {
    loginError.textContent = "Contraseña incorrecta.";
    loginPassword.value = "";
    loginPassword.focus();
  }
}

// Solo Sebastian Bartolozzi ve el botón del dashboard financiero.
function actualizarAccesoDashboardFinanciero() {
  if (tecnicoLogueado === "Sebastian Bartolozzi") {
    verDashboardFinancieroBtn.classList.remove("hidden");
  } else {
    verDashboardFinancieroBtn.classList.add("hidden");
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
    const card = document.createElement("button");
    card.type = "button";
    card.className = "servicio-card" + (resuelto ? " resuelto" : "");
    card.innerHTML = `
      <div class="servicio-card-num">N° ${item.numero_servicio ?? ""}${resuelto ? '<span class="servicio-card-resuelto-badge">RESUELTO</span>' : ""}</div>
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

function seleccionarServicio(item) {
  currentNumeroServicio = item.numero_servicio ?? "";
  document.getElementById("f_cliente").value = item.cliente ?? "";
  document.getElementById("f_direccion").value = item.direccion ?? "";
  if (item.localidad) document.getElementById("f_localidad").value = item.localidad;
  document.getElementById("f_tarea").value = item.tarea ?? "";
  actualizarBotonLlamar(item.telefono);
  autocompletarTecnico();
  showScreen("form");
}

refreshServiciosBtn.addEventListener("click", fetchServicios);
manualReportBtn.addEventListener("click", () => {
  currentNumeroServicio = "";
  actualizarBotonLlamar(null);
  autocompletarTecnico();
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
  autocompletarTecnico();
  showScreen("form");
}

verCronogramaBtn.addEventListener("click", () => {
  showScreen("cronograma");
  fetchCronograma();
});
refreshCronogramaBtn.addEventListener("click", fetchCronograma);
volverDeCronogramaBtn.addEventListener("click", () => {
  showScreen("list");
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

fotoInput.addEventListener("change", async () => {
  const file = fotoInput.files[0];
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
});

quitarFotoBtn.addEventListener("click", () => {
  fotoBase64 = null;
  fotoMimeType = null;
  fotoInput.value = "";
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
    materiales: document.getElementById("f_materiales").value.trim(),
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
  descuentoRadios[0].checked = true;
  descuentoOtroPct.value = "";
  descuentoOtroPct.style.display = "none";
  formaPagoChecks.forEach((c) => { c.checked = false; });
  currentNumeroServicio = "";
  fotoBase64 = null;
  fotoMimeType = null;
  fotoInput.value = "";
  fotoPreviewWrap.classList.add("hidden");
  fotoStatus.textContent = "";
  actualizarBotonLlamar(null);
  autocompletarTecnico();
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

  showScreen("sending");
  setStatus("ENVIANDO", "busy");

  let fotoLink = "";
  let fotoError = "";
  if (fotoBase64) {
    try {
      sendingLabel.textContent = "Subiendo foto...";
      const fotoRes = await fetch("/api/upload-foto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + SERVICIOS_API_TOKEN,
        },
        body: JSON.stringify({
          filename: `${idParte}.jpg`,
          mimeType: fotoMimeType || "image/jpeg",
          base64: fotoBase64,
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
  let clienteIntentado = !!data.cliente_email;

  try {
    sendingLabel.textContent = "Enviando copia a la oficina…";
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_OFICINA, {
      ...basePayload,
      foto_link: fotoLink,
      tiempo_transcurrido: data.tiempo_transcurrido,
    });
    oficinaOk = true;
    if (data.numero_servicio) {
      serviciosResueltos.add(data.numero_servicio);
      localStorage.setItem("servicios_resueltos", JSON.stringify([...serviciosResueltos]));
    }
    // Registro en el historial para el dashboard — si falla, no se
    // interrumpe el flujo (el mail ya se mandó bien, lo importante),
    // pero se avisa para poder detectarlo.
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
        }),
      });
      if (!histRes.ok) {
        const histData = await histRes.json().catch(() => ({}));
        console.error("Error registrando historial:", histData);
        showToast("⚠ El mail se envió, pero no se pudo registrar en el dashboard.");
      }
    } catch (err) {
      console.error("Error registrando historial:", err);
      showToast("⚠ El mail se envió, pero no se pudo registrar en el dashboard.");
    }
  } catch (err) {
    console.error("Error enviando a oficina:", err);
  }

  if (clienteIntentado) {
    try {
      sendingLabel.textContent = "Enviando copia al cliente…";
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_CLIENTE, {
        ...basePayload,
        cliente_email: data.cliente_email,
      });
      clienteOk = true;
    } catch (err) {
      console.error("Error enviando al cliente:", err);
    }
  }

  setStatus(oficinaOk ? "LISTO" : "");
  doneId.textContent = `N° de parte: ${idParte}`;

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
    showScreen("sign");
    showToast("No se pudo enviar el mail. Revisá la conexión e intentá de nuevo.");
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

async function renderDashboard() {
  const rango = obtenerRangoPeriodo(dashPeriodoActivo);
  const enPeriodo = historialCache.filter((h) => fechaEnRango(h.fecha, rango));

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
  showScreen("list");
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

function renderDashboardFinanciero() {
  const rango = obtenerRangoPeriodo(dashFinPeriodoActivo);
  const enPeriodo = historialCache.filter((h) => fechaEnRango(h.fecha, rango));

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
  showScreen("list");
});

// Registrar service worker para instalación como PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
