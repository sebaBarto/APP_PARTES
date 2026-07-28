// ==== CONFIGURACIÓN — completar antes de publicar ====

// Contraseña simple para entrar a la app (se valida en el propio
// celular, no es un login con servidor — solo para que no cualquiera
// que abra la URL pueda cargar partes).
const APP_PASSWORD = "Marcos@2018";

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
const importeInput = document.getElementById("f_importe");
const descuentoRadios = document.getElementsByName("f_descuento_tipo");
const descuentoOtroPct = document.getElementById("f_descuento_otro_pct");
const costoFinalInput = document.getElementById("f_costo_final");
const formaPagoChecks = document.getElementsByName("f_forma_pago");
const backToListBtn = document.getElementById("backToListBtn");
const fotoInput = document.getElementById("f_foto");
const fotoPreviewWrap = document.getElementById("fotoPreviewWrap");
const fotoPreview = document.getElementById("fotoPreview");
const quitarFotoBtn = document.getElementById("quitarFotoBtn");
const fotoStatus = document.getElementById("fotoStatus");
const verMapaBtn = document.getElementById("verMapaBtn");
const volverDeMapaBtn = document.getElementById("volverDeMapaBtn");
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
function attemptLogin() {
  if (loginPassword.value === APP_PASSWORD) {
    loginError.textContent = "";
    showScreen("list");
    fetchServicios();
  } else {
    loginError.textContent = "Contraseña incorrecta.";
    loginPassword.value = "";
    loginPassword.focus();
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

function seleccionarServicio(item) {
  currentNumeroServicio = item.numero_servicio ?? "";
  document.getElementById("f_cliente").value = item.cliente ?? "";
  document.getElementById("f_direccion").value = item.direccion ?? "";
  if (item.localidad) document.getElementById("f_localidad").value = item.localidad;
  document.getElementById("f_tarea").value = item.tarea ?? "";
  showScreen("form");
}

refreshServiciosBtn.addEventListener("click", fetchServicios);
manualReportBtn.addEventListener("click", () => {
  currentNumeroServicio = "";
  showScreen("form");
});

// ---------- Cronograma semanal ----------
let cronogramaCache = [];
let cronoDiaActivo = "";

async function fetchCronograma() {
  cronoStatus.textContent = "Buscando cronograma...";
  try {
    const headers = { Authorization: "Bearer " + SERVICIOS_API_TOKEN };
    const res = await fetch("/api/cronograma", { headers, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    cronogramaCache = Array.isArray(data.tareas) ? data.tareas : [];
    localStorage.setItem("cronograma_cache", JSON.stringify(cronogramaCache));
    localStorage.setItem("cronograma_cache_time", String(Date.now()));
    cronoSyncLabel.textContent = formatSyncTime(new Date());
    renderCronogramaDias();
    if (data.fuente === "respaldo") {
      cronoStatus.textContent = `⚠ No se pudo leer Drive en este momento (${data.error_drive || "sin detalle"}). Mostrando la última copia guardada.`;
    }
  } catch (err) {
    const cachedRaw = localStorage.getItem("cronograma_cache");
    const cachedTime = localStorage.getItem("cronograma_cache_time");
    if (cachedRaw) {
      cronogramaCache = JSON.parse(cachedRaw);
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

  // Filtro de técnicos, con las opciones detectadas
  const tecnicoActual = cronoTecnicoFiltro.value;
  const tecnicos = [...new Set(cronogramaCache.map((t) => t.tecnico))].filter(Boolean).sort();
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
    const card = document.createElement("button");
    card.type = "button";
    card.className = "crono-tarea-card";
    card.innerHTML = `
      <div class="crono-tarea-hora">${t.hora_inicio || ""} - ${t.hora_fin || ""}</div>
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

function getTecnicoValue() {
  if (tecnicoSelect.value === "otro") return tecnicoOtro.value.trim();
  return tecnicoSelect.value;
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
    fecha: document.getElementById("f_fecha").value,
    hora_entrada: document.getElementById("f_entrada").value,
    hora_salida: document.getElementById("f_salida").value,
    observaciones: document.getElementById("f_observaciones").value.trim(),
  };
}

function resetForm() {
  ["f_cliente","f_direccion","f_localidad","f_cliente_email","f_tarea",
   "f_materiales","f_materiales_retirados","f_importe","f_costo_final",
   "f_observaciones"].forEach(id => document.getElementById(id).value = "");
  tecnicoSelect.value = "";
  tecnicoOtro.value = "";
  tecnicoOtro.style.display = "none";
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
    });
    oficinaOk = true;
    if (data.numero_servicio) {
      serviciosResueltos.add(data.numero_servicio);
      localStorage.setItem("servicios_resueltos", JSON.stringify([...serviciosResueltos]));
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

// Registrar service worker para instalación como PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
