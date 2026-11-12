// Entregas de llaves de edificios (APP de técnicos).
// Lista las llaves que la oficina ya programó (pedidos de los administradores
// de consorcio marcados "Hecha") y registra la entrega: quién recibe, su firma
// en pantalla y, en el servidor, el descuento del tag del stock del técnico.
// Backend: /api/datos?coleccion=entregas_llaves (lib/entregas-llaves.js).
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
  const URL_API = "/api/datos?coleccion=entregas_llaves";
  const pantalla = $("screen-entregas");
  if (!pantalla || typeof screens === "undefined") return;
  screens.entregas = pantalla;

  let pendientes = [];
  let actual = null;
  const cabeceras = (json) => ({ Authorization: "Bearer " + SERVICIOS_API_TOKEN, ...(json ? { "Content-Type": "application/json" } : {}) });

  // ---------- Contador en el inicio ----------
  async function actualizarContador() {
    if (!SERVICIOS_API_TOKEN) return;
    try {
      const r = await fetch(URL_API, { headers: cabeceras(), cache: "no-store" });
      if (!r.ok) return;
      pendientes = await r.json();
      const b = $("entregasPendientesBadge");
      b.textContent = pendientes.length;
      b.classList.toggle("hidden", !pendientes.length);
    } catch (e) { /* sin conexión: queda el número anterior */ }
  }
  const showScreenOriginal = window.showScreen;
  window.showScreen = function (nombre) {
    showScreenOriginal(nombre);
    if (nombre === "home") setTimeout(actualizarContador, 600);
  };
  setTimeout(actualizarContador, 2500);

  // ---------- Lista ----------
  const TIPOS = { nuevo: "Nuevo tag", reemplazo: "Reemplazo de tag", titularidad: "Cambio de titularidad" };
  async function cargar() {
    $("entregasStatus").textContent = "Cargando…";
    try {
      const r = await fetch(URL_API, { headers: cabeceras(), cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo cargar");
      pendientes = d;
      $("entregasStatus").textContent = "";
      renderLista();
      const b = $("entregasPendientesBadge");
      b.textContent = pendientes.length; b.classList.toggle("hidden", !pendientes.length);
    } catch (e) { $("entregasStatus").textContent = e.message; }
  }
  function renderLista() {
    const cont = $("entregasLista");
    if (!pendientes.length) { cont.innerHTML = '<p class="subtitle-consultas" style="text-align:center;padding:24px 0;">No hay llaves para entregar. 🎉</p>'; return; }
    cont.innerHTML = pendientes.map((p, i) => `<button type="button" class="entrega-item" data-i="${i}">
      <b>${esc(p.edificio_nombre)} · ${esc(p.unidad || "")}</b>
      <div class="entrega-sub">Pedido N° ${esc(p.numero || "")} · ${esc(TIPOS[p.tipo] || p.tipo)} · para <b>${esc(p.recibe)}</b>${p.recibe_telefono ? " · " + esc(p.recibe_telefono) : ""}</div>
      ${p.direccion ? `<div class="entrega-sub">📍 ${esc(p.direccion)}</div>` : ""}
      <div class="entrega-llaves">${p.llaves.map((l) => `${l.tipo === "control" ? "📟" : "🔑"} ${esc(l.tag || "s/n")}${l.usuario ? " · usuario " + esc(l.usuario) : ""}`).join("<br>")}</div>
      ${p.nota_sat ? `<div class="entrega-sub">Oficina: ${esc(p.nota_sat)}</div>` : ""}
    </button>`).join("");
    cont.querySelectorAll(".entrega-item").forEach((b) => b.addEventListener("click", () => abrir(pendientes[Number(b.dataset.i)])));
  }

  // ---------- Formulario de entrega ----------
  function abrir(p) {
    actual = p;
    $("entregasLista").classList.add("hidden");
    $("entregasRecargarBtn").parentElement.classList.add("hidden");
    $("entregaForm").classList.remove("hidden");
    $("entregaConfirmarBtn").classList.remove("hidden");
    $("entregaResumen").innerHTML = `<b style="font-size:17px;">${esc(p.edificio_nombre)} · ${esc(p.unidad || "")}</b><br>Pedido N° ${esc(p.numero || "")} · ${esc(TIPOS[p.tipo] || p.tipo)}<br>Para: <b>${esc(p.recibe)}</b>`;
    // Si la oficina no cargó el número de alguna llave, se completa acá.
    $("entregaNumeros").innerHTML = p.llaves.map((l, i) => l.tag
      ? `<div class="field-group"><span class="field-label">${l.tipo === "control" ? "Control" : "Llave"} ${p.llaves.length > 1 ? i + 1 : ""}</span><div style="font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:600;">${esc(l.tag)}${l.usuario ? ` <span style="font-size:13px;opacity:.7;">usuario ${esc(l.usuario)}</span>` : ""}</div></div>`
      : `<div class="field-group"><label class="field-label">N° de ${l.tipo === "control" ? "control" : "llave"} ${p.llaves.length > 1 ? i + 1 : ""} <span style="font-weight:400;opacity:.7;">(si lo tenés)</span></label><input type="text" class="field-input entrega-num" data-i="${i}" placeholder="000:00000" inputmode="numeric" style="font-family:'IBM Plex Mono',monospace;"></div>`).join("");
    $("entregaRecibio").value = p.recibe || "";
    $("entregaDni").value = ""; $("entregaObs").value = "";
    $("entregaFormStatus").textContent = "";
    setTimeout(prepararFirma, 50);
    window.scrollTo({ top: 0 });
  }
  function cerrar() {
    actual = null;
    $("entregaForm").classList.add("hidden");
    $("entregaConfirmarBtn").classList.add("hidden");
    $("entregasLista").classList.remove("hidden");
    $("entregasRecargarBtn").parentElement.classList.remove("hidden");
  }

  // Firma: mismo criterio que la del parte (trazo con el dedo, se guarda como imagen).
  const lienzo = $("entregaFirma");
  const ctx = lienzo.getContext("2d");
  let hayFirma = false, dibujando = false, ultimo = null;
  function prepararFirma() {
    const r = lienzo.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    lienzo.width = Math.max(1, r.width * dpr); lienzo.height = Math.max(1, r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#101820";
    hayFirma = false;
  }
  const punto = (e) => { const r = lienzo.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  lienzo.addEventListener("pointerdown", (e) => { dibujando = true; ultimo = punto(e); lienzo.setPointerCapture(e.pointerId); e.preventDefault(); });
  lienzo.addEventListener("pointermove", (e) => {
    if (!dibujando) return;
    const p = punto(e);
    ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ultimo = p; hayFirma = true; e.preventDefault();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((t) => lienzo.addEventListener(t, () => { dibujando = false; }));
  $("entregaBorrarFirma").addEventListener("click", () => { ctx.clearRect(0, 0, lienzo.width, lienzo.height); hayFirma = false; });
  function firmaJpeg() {
    const c = document.createElement("canvas");
    const escala = Math.min(1, 900 / lienzo.width);
    c.width = Math.round(lienzo.width * escala); c.height = Math.round(lienzo.height * escala);
    const g = c.getContext("2d");
    g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(lienzo, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  }

  $("entregaConfirmarBtn").addEventListener("click", async () => {
    const st = $("entregaFormStatus");
    if (!actual) return;
    if (!$("entregaRecibio").value.trim()) { st.textContent = "Escribí quién recibe la llave."; return; }
    if (!hayFirma) { st.textContent = "Falta la firma de quien recibe."; return; }
    const btn = $("entregaConfirmarBtn");
    btn.disabled = true; st.textContent = "Registrando la entrega…";
    try {
      const llaves = actual.llaves.map((l, i) => { const inp = document.querySelector(`.entrega-num[data-i="${i}"]`); return { tag: inp ? inp.value.trim() : "" }; });
      const r = await fetch(URL_API, { method: "POST", headers: cabeceras(true), body: JSON.stringify({ accion: "entregar", edificio: actual.edificio, id: actual.id, recibio: $("entregaRecibio").value.trim(), dni: $("entregaDni").value.trim(), observaciones: $("entregaObs").value.trim(), llaves, firma: firmaJpeg() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No se pudo registrar");
      const s = d.entrega && d.entrega.stock;
      const txtStock = s && s.ok ? (s.para_aprobar ? " Parte del material quedó para que lo apruebe el responsable de stock." : " Se descontó de tu stock.") : " Ojo: no se pudo descontar del stock, avisá a la oficina.";
      if (typeof showToast === "function") showToast("✓ Entrega registrada." + txtStock); else alert("✓ Entrega registrada." + txtStock);
      cerrar();
      await cargar();
    } catch (e) { st.textContent = e.message; }
    btn.disabled = false;
  });

  $("tileEntregasBtn").addEventListener("click", () => { cerrar(); window.showScreen("entregas"); cargar(); });
  $("entregasRecargarBtn").addEventListener("click", cargar);
  $("volverDeEntregasBtn").addEventListener("click", () => { if (actual) { cerrar(); return; } window.showScreen("home"); });
})();
