// ==== CONFIGURACIÓN — completar antes de publicar ====
const EMAILJS_PUBLIC_KEY = "TU_PUBLIC_KEY";
const EMAILJS_SERVICE_ID = "TU_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "TU_TEMPLATE_ID";
// El mail de destino fijo se configura DENTRO de la plantilla en emailjs.com
// (campo "To email"), no acá.
// =======================================================

if (window.emailjs && EMAILJS_PUBLIC_KEY !== "TU_PUBLIC_KEY") {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

const screens = {
  capture: document.getElementById("screen-capture"),
  processing: document.getElementById("screen-processing"),
  review: document.getElementById("screen-review"),
  done: document.getElementById("screen-done"),
};
const statusPill = document.getElementById("statusPill");
const toastEl = document.getElementById("toast");
const fileInput = document.getElementById("fileInput");
const previewImg = document.getElementById("previewImg");
const reviewThumb = document.getElementById("reviewThumb");
const processingLabel = document.getElementById("processingLabel");
const sendBtn = document.getElementById("sendBtn");
const retakeBtn = document.getElementById("retakeBtn");
const newReportBtn = document.getElementById("newReportBtn");

let currentImageDataUrl = null;

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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    currentImageDataUrl = await fileToDataUrl(file);
  } catch (err) {
    showToast("No se pudo leer la foto. Probá de nuevo.");
    return;
  }

  previewImg.src = currentImageDataUrl;
  reviewThumb.src = currentImageDataUrl;
  showScreen("processing");
  setStatus("LEYENDO", "busy");
  processingLabel.textContent = "Leyendo datos del parte…";

  try {
    const data = await extractFromImage(currentImageDataUrl);
    fillForm(data);
    setStatus("LISTO", "ok");
    showScreen("review");
  } catch (err) {
    console.error(err);
    setStatus("LISTO");
    showScreen("review");
    fillForm({});
    showToast("No se pudo leer la foto automáticamente. Completá los datos a mano.");
  }
});

async function extractFromImage(dataUrl) {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl }),
  });
  if (!res.ok) throw new Error("Fallo la extracción: " + res.status);
  const json = await res.json();
  return json.fields || {};
}

function fillForm(f) {
  document.getElementById("f_cliente").value = f.cliente || "";
  document.getElementById("f_direccion").value = f.direccion || "";
  document.getElementById("f_localidad").value = f.localidad || "";
  document.getElementById("f_tarea").value = f.tarea || "";
  document.getElementById("f_materiales").value = f.materiales || "";
  document.getElementById("f_importe").value = f.importe || "";
  document.getElementById("f_tecnico").value = f.tecnico || "";
  document.getElementById("f_fecha").value = f.fecha || "";
  document.getElementById("f_entrada").value = f.hora_entrada || "";
  document.getElementById("f_salida").value = f.hora_salida || "";
}

retakeBtn.addEventListener("click", () => {
  fileInput.value = "";
  currentImageDataUrl = null;
  setStatus("LISTO");
  showScreen("capture");
});

newReportBtn.addEventListener("click", () => {
  fileInput.value = "";
  currentImageDataUrl = null;
  setStatus("LISTO");
  showScreen("capture");
});

sendBtn.addEventListener("click", async () => {
  const payload = {
    cliente: document.getElementById("f_cliente").value,
    direccion: document.getElementById("f_direccion").value,
    localidad: document.getElementById("f_localidad").value,
    tarea: document.getElementById("f_tarea").value,
    materiales: document.getElementById("f_materiales").value,
    importe: document.getElementById("f_importe").value,
    tecnico: document.getElementById("f_tecnico").value,
    fecha: document.getElementById("f_fecha").value,
    hora_entrada: document.getElementById("f_entrada").value,
    hora_salida: document.getElementById("f_salida").value,
  };

  if (!payload.cliente || !payload.tecnico) {
    showToast("Completá al menos Cliente y Técnico antes de enviar.");
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = "Enviando…";

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, payload);
    showScreen("done");
  } catch (err) {
    console.error(err);
    showToast("No se pudo enviar el mail. Revisá la conexión e intentá de nuevo.");
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "Enviar por mail";
  }
});

// Registrar service worker para instalación como PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
