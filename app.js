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
const EMAILJS_TEMPLATE_CLIENTE = "TU_TEMPLATE_ID_CLIENTE";

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
const tecnicoSelect = document.getElementById("f_tecnico");
const tecnicoOtro = document.getElementById("f_tecnico_otro");
const importeInput = document.getElementById("f_importe");
const descuentoRadios = document.getElementsByName("f_descuento_tipo");
const descuentoOtroPct = document.getElementById("f_descuento_otro_pct");
const costoFinalInput = document.getElementById("f_costo_final");
const formaPagoChecks = document.getElementsByName("f_forma_pago");
const backToListBtn = document.getElementById("backToListBtn");
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

function renderServiciosList(items) {
  serviciosListEl.innerHTML = "";
  if (!items || items.length === 0) {
    listStatus.textContent = "No hay servicios pendientes por el momento.";
    return;
  }
  listStatus.textContent = "";
  items.forEach((item) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "servicio-card";
    card.innerHTML = `
      <div class="servicio-card-num">N° ${item.numero_servicio ?? ""}</div>
      <div class="servicio-card-cliente">${item.cliente ?? ""}</div>
      <div class="servicio-card-direccion">${item.direccion ?? ""}${item.localidad ? ", " + item.localidad : ""}</div>
      <div class="servicio-card-tarea">${item.tarea ?? ""}</div>
    `;
    card.addEventListener("click", () => seleccionarServicio(item));
    serviciosListEl.appendChild(card);
  });
}

async function fetchServicios() {
  listStatus.textContent = "Buscando servicios...";
  try {
    const headers = {};
    if (SERVICIOS_API_TOKEN) headers["Authorization"] = "Bearer " + SERVICIOS_API_TOKEN;
    const res = await fetch(SERVICIOS_URL, { headers });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    serviciosCache = Array.isArray(data) ? data : [];
    localStorage.setItem("servicios_cache", JSON.stringify(serviciosCache));
    localStorage.setItem("servicios_cache_time", String(Date.now()));
    syncLabel.textContent = formatSyncTime(new Date());
    renderServiciosList(serviciosCache);
  } catch (err) {
    const cachedRaw = localStorage.getItem("servicios_cache");
    const cachedTime = localStorage.getItem("servicios_cache_time");
    if (cachedRaw) {
      serviciosCache = JSON.parse(cachedRaw);
      renderServiciosList(serviciosCache);
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
  const numeroCompletado = currentNumeroServicio;
  resetForm();
  setStatus("LISTO");
  // Saco el servicio recién completado de la lista en pantalla para
  // que no lo vuelvan a elegir por error (el próximo fetch real ya
  // no debería traerlo desde el sistema de origen).
  serviciosCache = serviciosCache.filter((s) => s.numero_servicio !== numeroCompletado);
  renderServiciosList(serviciosCache);
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
  const idParte = generarIdParte();
  const signatureDataUrl = canvas.toDataURL("image/png");
  const signatureImgTag = `<img src="${signatureDataUrl}" alt="Firma del cliente" width="260" style="display:block;" />`;

  showScreen("sending");
  setStatus("ENVIANDO", "busy");

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
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_OFICINA, basePayload);
    oficinaOk = true;
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

  if (oficinaOk && (clienteOk || !clienteIntentado)) {
    doneMessage.textContent = clienteIntentado
      ? "Copia enviada a la oficina y al cliente"
      : "Copia enviada a la oficina (sin mail de cliente)";
    showScreen("done");
  } else if (oficinaOk && clienteIntentado && !clienteOk) {
    doneMessage.textContent = "Enviado a la oficina, pero falló el envío al cliente";
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
