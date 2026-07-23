// ==== CONFIGURACIÓN — completar antes de publicar ====
const EMAILJS_PUBLIC_KEY = "-4JfiB5vtz2jMgIpi";

// Plantilla que manda SIEMPRE a la casilla fija de la oficina
// (el "To email" de esta plantilla está configurado en emailjs.com)
const EMAILJS_SERVICE_ID = "service_b7zraoh";
const EMAILJS_TEMPLATE_OFICINA = "template_bzy9t47";

// Plantilla que manda al mail del cliente (variable, cargado en el form).
// Esta plantilla debe tener el campo "To email" configurado como
// {{cliente_email}} en emailjs.com, NO una casilla fija.
const EMAILJS_TEMPLATE_CLIENTE = "TU_TEMPLATE_ID_CLIENTE";
// =======================================================

if (window.emailjs && EMAILJS_PUBLIC_KEY !== "TU_PUBLIC_KEY") {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

const screens = {
  form: document.getElementById("screen-form"),
  sign: document.getElementById("screen-sign"),
  sending: document.getElementById("screen-sending"),
  done: document.getElementById("screen-done"),
};
const statusPill = document.getElementById("statusPill");
const toastEl = document.getElementById("toast");
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

function getFormData() {
  return {
    cliente: document.getElementById("f_cliente").value.trim(),
    direccion: document.getElementById("f_direccion").value.trim(),
    localidad: document.getElementById("f_localidad").value.trim(),
    cliente_email: document.getElementById("f_cliente_email").value.trim(),
    tarea: document.getElementById("f_tarea").value.trim(),
    materiales: document.getElementById("f_materiales").value.trim(),
    importe: document.getElementById("f_importe").value.trim(),
    tecnico: document.getElementById("f_tecnico").value.trim(),
    fecha: document.getElementById("f_fecha").value,
    hora_entrada: document.getElementById("f_entrada").value,
    hora_salida: document.getElementById("f_salida").value,
  };
}

function resetForm() {
  ["f_cliente","f_direccion","f_localidad","f_cliente_email","f_tarea",
   "f_materiales","f_importe","f_tecnico"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("f_fecha").value = "";
  document.getElementById("f_entrada").value = "";
  document.getElementById("f_salida").value = "";
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
  showScreen("form");
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
    cliente: data.cliente,
    direccion: data.direccion,
    localidad: data.localidad,
    tarea: data.tarea,
    materiales: data.materiales,
    importe: data.importe,
    tecnico: data.tecnico,
    fecha: data.fecha,
    hora_entrada: data.hora_entrada,
    hora_salida: data.hora_salida,
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
