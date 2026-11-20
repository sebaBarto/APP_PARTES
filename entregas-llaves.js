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
  // Las entregas son de la oficina (permiso "entrega_llaves"). Un técnico sin el
  // permiso solo ve el ícono si la oficina le habilitó alguna entrega puntual.
  const nombreLogueado = () => (typeof tecnicoLogueado !== "undefined" ? tecnicoLogueado : "") || "";
  const esDeOficina = () => {
    try { return !!(typeof permisosDelTecnico === "function" && (permisosDelTecnico(nombreLogueado()) || {}).entrega_llaves); } catch (e) { return false; }
  };
  let nombreDeLaLista = null;
  function actualizarTile() {
    // Si cambió quién está logueado, la lista anterior no vale: se vuelve a pedir.
    if (nombreDeLaLista !== null && nombreDeLaLista !== nombreLogueado()) { pendientes = []; nombreDeLaLista = null; setTimeout(actualizarContador, 300); }
    const tile = $("tileEntregasBtn");
    if (tile) tile.classList.toggle("hidden", !(esDeOficina() || pendientes.length));
  }
  window.actualizarTileEntregas = actualizarTile;
  const cabeceras = (json) => ({ Authorization: "Bearer " + SERVICIOS_API_TOKEN, ...(json ? { "Content-Type": "application/json" } : {}) });

  // ---------- Contador en el inicio ----------
  async function actualizarContador() {
    if (!SERVICIOS_API_TOKEN) return;
    try {
      const r = await fetch(URL_API, { headers: cabeceras(), cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      pendientes = Array.isArray(d) ? d : [];
      nombreDeLaLista = nombreLogueado();
      const b = $("entregasPendientesBadge");
      b.textContent = pendientes.length;
      b.classList.toggle("hidden", !pendientes.length);
      actualizarTile();
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
      pendientes = Array.isArray(d) ? d : [];
      $("entregasStatus").textContent = "";
      renderLista();
      const b = $("entregasPendientesBadge");
      b.textContent = pendientes.length; b.classList.toggle("hidden", !pendientes.length);
    } catch (e) { $("entregasStatus").textContent = e.message; }
  }
  // Se pueden elegir varios pedidos (los que retira una misma persona): firma una sola vez.
  const claveDe = (p) => `${p.edificio}|${p.id}`;
  let elegidas = new Set();
  const grupoDe = (p) => `${p.edificio_nombre} · ${p.unidad || "sin unidad"}`;
  function renderLista() {
    const cont = $("entregasLista");
    // Las que ya no están pendientes dejan de estar elegidas.
    elegidas = new Set([...elegidas].filter((k) => pendientes.some((p) => claveDe(p) === k)));
    if (!pendientes.length) { cont.innerHTML = '<p class="subtitle-consultas" style="text-align:center;padding:24px 0;">No hay llaves para entregar. 🎉</p>'; actualizarSeleccion(); return; }
    // Agrupadas por edificio y depto, así se ve de un vistazo todo lo de una misma unidad.
    const orden = pendientes.map((p, i) => ({ p, i })).sort((x, y) => grupoDe(x.p).localeCompare(grupoDe(y.p), "es", { numeric: true }) || x.i - y.i);
    const cuenta = {};
    orden.forEach(({ p }) => { cuenta[grupoDe(p)] = (cuenta[grupoDe(p)] || 0) + 1; });
    let ultimo = null;
    cont.innerHTML = orden.map(({ p, i }) => {
      const g = grupoDe(p);
      const cab = g !== ultimo ? `<div class="entregas-grupo"><span>${esc(g)}</span>${cuenta[g] > 1 ? `<button type="button" class="btn btn-ghost entregas-elegir-grupo" data-g="${esc(g)}">Elegir las ${cuenta[g]}</button>` : ""}</div>` : "";
      ultimo = g;
      return `${cab}<button type="button" class="entrega-item${elegidas.has(claveDe(p)) ? " elegida" : ""}" data-i="${i}" aria-pressed="${elegidas.has(claveDe(p))}">
      <b>${esc(p.edificio_nombre)} · ${esc(p.unidad || "")}</b>
      ${p.habilitada_a ? `<div class="entrega-sub">🔓 ${p.habilitada_a === nombreLogueado() ? "Habilitada para vos" : "Habilitada a " + esc(p.habilitada_a)}</div>` : ""}
      <div class="entrega-sub">Pedido N° ${esc(p.numero || "")} · ${esc(TIPOS[p.tipo] || p.tipo)} · para <b>${esc(p.recibe)}</b>${p.recibe_telefono ? " · " + esc(p.recibe_telefono) : ""}</div>
      ${p.direccion ? `<div class="entrega-sub">📍 ${esc(p.direccion)}</div>` : ""}
      <div class="entrega-llaves">${p.llaves.map((l) => `${l.tipo === "control" ? "📟" : "🔑"} ${esc(l.tag || "s/n")}${l.usuario ? " · usuario " + esc(l.usuario) : ""}`).join("<br>")}</div>
      ${p.nota_sat ? `<div class="entrega-sub">Oficina: ${esc(p.nota_sat)}</div>` : ""}
    </button>`;
    }).join("");
    cont.querySelectorAll(".entrega-item").forEach((b) => b.addEventListener("click", () => {
      const k = claveDe(pendientes[Number(b.dataset.i)]);
      if (elegidas.has(k)) elegidas.delete(k); else elegidas.add(k);
      b.classList.toggle("elegida", elegidas.has(k));
      b.setAttribute("aria-pressed", elegidas.has(k));
      actualizarSeleccion();
    }));
    cont.querySelectorAll(".entregas-elegir-grupo").forEach((b) => b.addEventListener("click", () => {
      const delGrupo = pendientes.filter((p) => grupoDe(p) === b.dataset.g).map(claveDe);
      const todas = delGrupo.every((k) => elegidas.has(k));
      delGrupo.forEach((k) => (todas ? elegidas.delete(k) : elegidas.add(k)));
      renderLista();
    }));
    actualizarSeleccion();
  }
  function seleccionadas() { return pendientes.filter((p) => elegidas.has(claveDe(p))); }
  function actualizarSeleccion() {
    const sel = seleccionadas();
    const n = sel.reduce((t, p) => t + p.llaves.length, 0);
    $("entregasSeleccionBar").classList.toggle("hidden", !sel.length || !!actual);
    $("entregasSeleccionTxt").textContent = sel.length ? `${sel.length} ${sel.length === 1 ? "pedido" : "pedidos"} · ${n} ${n === 1 ? "llave/control" : "llaves/controles"}` : "";
    $("entregasSeleccionBtn").textContent = sel.length > 1 ? "Entregar todas" : "Entregar";
  }
  $("entregasSeleccionBtn").addEventListener("click", () => { const sel = seleccionadas(); if (sel.length) abrir(sel); });

  // ---------- Formulario de entrega ----------
  function abrir(lista) {
    actual = Array.isArray(lista) ? lista : [lista];
    $("entregasLista").classList.add("hidden");
    $("entregasSeleccionBar").classList.add("hidden");
    $("entregasRecargarBtn").parentElement.classList.add("hidden");
    $("entregaForm").classList.remove("hidden");
    $("entregaConfirmarBtn").classList.remove("hidden");
    const total = actual.reduce((t, p) => t + p.llaves.length, 0);
    const cab = actual.length > 1 ? `<b style="font-size:17px;">Retira ${actual.length} pedidos · ${total} ${total === 1 ? "llave/control" : "llaves/controles"}</b><br><span style="opacity:.75;">Firma una sola vez por todo.</span>` : "";
    $("entregaResumen").innerHTML = cab + actual.map((p) => `<div class="${actual.length > 1 ? "entrega-resumen-ped" : ""}"><b style="font-size:${actual.length > 1 ? 15 : 17}px;">${esc(p.edificio_nombre)} · ${esc(p.unidad || "")}</b><br>Pedido N° ${esc(p.numero || "")} · ${esc(TIPOS[p.tipo] || p.tipo)}<br>Para: <b>${esc(p.recibe)}</b></div>`).join("");
    // Si la oficina no cargó el número de alguna llave, se completa acá.
    $("entregaNumeros").innerHTML = actual.map((p, pi) => p.llaves.map((l, i) => {
      const nombre = `${l.tipo === "control" ? "control" : "llave"} ${p.llaves.length > 1 ? i + 1 : ""}${actual.length > 1 ? ` · pedido ${esc(p.numero || "")}` : ""}`;
      return l.tag
        ? `<div class="field-group"><span class="field-label">${nombre.charAt(0).toUpperCase() + nombre.slice(1)}</span><div style="font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:600;">${l.tipo === "control" ? "📟" : "🔑"} ${esc(l.tag)}${l.usuario ? ` <span style="font-size:13px;opacity:.7;">usuario ${esc(l.usuario)}</span>` : ""}</div></div>`
        : `<div class="field-group"><label class="field-label">N° de ${nombre} <span style="font-weight:400;opacity:.7;">(si lo tenés)</span></label><input type="text" class="field-input entrega-num" data-p="${pi}" data-i="${i}" placeholder="000:00000" inputmode="numeric" style="font-family:'IBM Plex Mono',monospace;"></div>`;
    }).join("")).join("");
    const personas = [...new Set(actual.map((p) => p.recibe || "").filter(Boolean))];
    $("entregaRecibio").value = personas.length === 1 ? personas[0] : "";
    $("entregaDni").value = ""; $("entregaObs").value = "";
    $("entregaConfirmarBtn").textContent = actual.length > 1 ? `✓ Entregar las ${actual.length} y registrar la firma` : "✓ Entregar y registrar la firma";
    // La oficina elige si sale del depósito o de su propio stock; el técnico habilitado, de su stock.
    $("entregaDeWrap").classList.toggle("hidden", !esDeOficina());
    $("entregaDe").value = "dep";
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
    actualizarSeleccion();
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
    if (!$("entregaRecibio").value.trim()) { st.textContent = "Escribí quién retira."; return; }
    if (!hayFirma) { st.textContent = "Falta la firma de quien recibe."; return; }
    const btn = $("entregaConfirmarBtn");
    btn.disabled = true; st.textContent = "Registrando la entrega…";
    try {
      const pedidos = actual.map((p, pi) => ({ edificio: p.edificio, id: p.id, llaves: p.llaves.map((l, i) => { const inp = document.querySelector(`.entrega-num[data-p="${pi}"][data-i="${i}"]`); return { tag: inp ? inp.value.trim() : "" }; }) }));
      const r = await fetch(URL_API, { method: "POST", headers: cabeceras(true), body: JSON.stringify({ accion: "entregar", pedidos, recibio: $("entregaRecibio").value.trim(), dni: $("entregaDni").value.trim(), observaciones: $("entregaObs").value.trim(), firma: firmaJpeg(), de: esDeOficina() && $("entregaDe").value === "yo" ? "tec:" + nombreLogueado() : "dep" }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No se pudo registrar");
      const s = d.entrega && d.entrega.stock;
      const txtStock = s && s.ok ? (s.para_aprobar ? " Parte del material quedó para que lo apruebe el responsable de stock." : d.entrega.de === "dep" ? " Se descontó del depósito." : " Se descontó de tu stock.") : " Ojo: no se pudo descontar del stock, avisá a la oficina.";
      const cuantas = (d.entregas || []).length || 1;
      const faltaron = (d.errores || []).length ? ` Ojo: ${d.errores.length} no se pudo registrar (${d.errores.map((x) => "N° " + (x.numero || "?")).join(", ")}): revisalo en la lista.` : "";
      const txt = (cuantas > 1 ? `✓ ${cuantas} entregas registradas con una sola firma.` : "✓ Entrega registrada.") + txtStock + faltaron;
      if (typeof showToast === "function") showToast(txt); else alert(txt);
      (d.entregas || []).forEach((x) => elegidas.delete(`${x.edificio}|${x.id}`));
      cerrar();
      await cargar();
    } catch (e) { st.textContent = e.message; }
    btn.disabled = false;
  });

  $("tileEntregasBtn").addEventListener("click", () => { elegidas = new Set(); cerrar(); window.showScreen("entregas"); cargar(); });
  $("entregasRecargarBtn").addEventListener("click", cargar);
  $("volverDeEntregasBtn").addEventListener("click", () => { if (actual) { cerrar(); return; } window.showScreen("home"); });
})();
