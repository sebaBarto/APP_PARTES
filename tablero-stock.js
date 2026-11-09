// Tablero de control del stock (lo usan la APP —Dashboards— y el panel —Stock → Tablero—).
// Recibe lo que arma tableroStock() en el servidor y lo dibuja: semáforo de lo que hay que
// resolver, dónde está el material, cómo se movió, por técnico, lo más usado y qué reponer.
// TableroStock.pintar(contenedor, datos, { ir: (clave) => {}, ayuda: (clave) => "<html del ?>" })
(function (raiz) {
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 1 });
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const NIVEL = { rojo: "Resolver", amarillo: "Mirar", ok: "En orden" };
  // A dónde lleva «Ver» en el panel (en la APP no hay destino: no se muestra).
  const IR = { cuadre: "salud", reponer: "pedidos", garantias: "garantia", ajustes: "movimientos" };

  // Textos de los «?» del tablero (los usan la APP y el panel).
  const AYUDAS = {
    tablero_semaforo: { titulo: "Tablero: qué hay que resolver", gif: "assets/ayuda/stock-tablero.gif", texto: [
      "Arriba, el semáforo: rojo es para resolver ya, amarillo para mirar, verde está en orden.",
      "Cada tema se abre y muestra el detalle: el stock que no cuadra, envíos que nadie confirmó, pedidos de técnicos sin entregar, material usado en partes sin tenerlo, equipos retirados que no volvieron, garantías demoradas, ajustes a mano y lo que hay que reponer.",
      "Es solo para mirar: lo que se resuelve, se resuelve en Depósito (APP) o en Stock (panel)." ] },
    tablero_donde: { titulo: "Dónde está el material", texto: [
      "Cuántos artículos hay ahora en el depósito, en manos de los técnicos, en los vehículos, en camino y en garantía.",
      "No cuenta SIMs ni herramientas (tienen su propia sección)." ] },
    tablero_movimientos: { titulo: "Movimientos", texto: [
      "El número grande es la cantidad de artículos de los últimos 7 días; abajo, los de 30 días.",
      "Las barras muestran día por día las dos últimas semanas: lo que se entregó a técnicos, lo que se instaló en clientes, lo que volvió al depósito y lo que se retiró de clientes." ] },
    tablero_personas: { titulo: "Por técnico", texto: [
      "Lo que tiene cada técnico (y cada vehículo) ahora, y lo que recibió, instaló, devolvió y retiró en 30 días.",
      "En naranja: alguien que recibió mucho más de lo que instaló y acumula material. Conviene preguntar si lo necesita o que lo devuelva." ] },
    tablero_reponer: { titulo: "Para reponer", texto: [
      "Artículos por debajo del mínimo, o que se van a terminar en menos de 15 días al ritmo de los últimos 60 días.",
      "«Alcanza para»: lo que hay en el depósito dividido por lo que salió por día. Lo que ya está pedido figura como «Pedido»." ] },
  };
  const CSS = `
  .tbs { --tbs-rojo:#D93B2B; --tbs-amarillo:#E39A0B; --tbs-ok:#2E9E5B; --tbs-azul:#3E86D6; --tbs-borde:rgba(127,127,127,.28); --tbs-suave:rgba(127,127,127,.09); display:flex; flex-direction:column; gap:14px; font-size:14px; }
  .tbs h3 { margin:0 0 8px; font-size:15px; display:flex; align-items:center; gap:6px; }
  .tbs-caja { border:1px solid var(--tbs-borde); border-radius:12px; padding:12px 14px; }
  .tbs-sem { display:flex; align-items:center; gap:12px; padding:14px; border-radius:12px; border:1px solid var(--tbs-borde); }
  .tbs-sem-luz { width:18px; height:18px; border-radius:50%; flex:none; }
  .tbs-sem b { font-size:17px; display:block; }
  .tbs-sem small { opacity:.75; }
  .tbs-al { border:1px solid var(--tbs-borde); border-left:5px solid var(--tbs-c); border-radius:10px; overflow:hidden; }
  .tbs-al > summary { list-style:none; cursor:pointer; padding:10px 12px; display:flex; align-items:center; gap:10px; }
  .tbs-al > summary::-webkit-details-marker { display:none; }
  .tbs-al-t { flex:1; font-weight:600; }
  .tbs-al-n { min-width:26px; text-align:center; font-weight:700; border-radius:999px; padding:2px 8px; background:var(--tbs-c); color:#fff; }
  .tbs-al-tag { font-size:11px; text-transform:uppercase; letter-spacing:.04em; opacity:.7; }
  .tbs-al ul { margin:0; padding:0 12px 10px 12px; list-style:none; display:flex; flex-direction:column; gap:6px; }
  .tbs-al li { padding:7px 10px; background:var(--tbs-suave); border-radius:8px; }
  .tbs-al li small { display:block; opacity:.75; margin-top:2px; }
  .tbs-ver { background:none; border:0; color:inherit; text-decoration:underline; cursor:pointer; padding:0 2px; font:inherit; font-size:13px; opacity:.8; }
  .tbs-enorden { display:flex; flex-wrap:wrap; gap:6px; }
  .tbs-enorden span { display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:999px; background:var(--tbs-suave); font-size:13px; }
  .tbs-enorden span::before { content:""; width:8px; height:8px; border-radius:50%; background:var(--tbs-ok); }
  .tbs-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(118px,1fr)); gap:8px; }
  .tbs-card { border:1px solid var(--tbs-borde); border-radius:10px; padding:10px; }
  .tbs-card b { display:block; font-size:22px; line-height:1.1; }
  .tbs-card span { font-size:12px; opacity:.8; }
  .tbs-card em { display:block; font-style:normal; font-size:12px; opacity:.65; margin-top:2px; }
  .tbs-barras { display:grid; grid-template-columns:repeat(14,1fr); gap:4px; align-items:end; height:120px; padding-top:6px; }
  .tbs-col { display:flex; flex-direction:column-reverse; height:100%; border-radius:4px 4px 0 0; overflow:hidden; background:var(--tbs-suave); }
  .tbs-col i { display:block; }
  .tbs-dias { display:grid; grid-template-columns:repeat(14,1fr); gap:4px; font-size:10px; text-align:center; opacity:.7; margin-top:4px; }
  .tbs-ley { display:flex; flex-wrap:wrap; gap:12px; font-size:12px; margin-top:8px; opacity:.85; }
  .tbs-ley span::before { content:""; display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:5px; vertical-align:-1px; background:var(--c); }
  .tbs-tabla { overflow-x:auto; }
  .tbs-tabla table { border-collapse:collapse; width:100%; min-width:520px; font-size:13px; }
  .tbs-tabla th, .tbs-tabla td { padding:7px 8px; border-bottom:1px solid var(--tbs-borde); text-align:right; white-space:nowrap; }
  .tbs-tabla th:first-child, .tbs-tabla td:first-child { text-align:left; white-space:normal; }
  .tbs-tabla th { font-size:12px; font-weight:600; opacity:.75; }
  .tbs-mucho { color:var(--tbs-amarillo); font-weight:700; }
  .tbs-top { display:flex; flex-direction:column; gap:6px; }
  .tbs-top div { display:grid; grid-template-columns:1fr auto; gap:2px 10px; align-items:center; }
  .tbs-top i { grid-column:1 / -1; height:6px; border-radius:3px; background:var(--tbs-azul); display:block; }
  .tbs-puntos { display:flex; gap:5px; align-items:center; flex-wrap:wrap; font-size:12px; opacity:.85; }
  .tbs-puntos i { width:12px; height:12px; border-radius:50%; display:inline-block; }
  .tbs-vacio { opacity:.7; margin:0; }
  .tbs-pie { font-size:12px; opacity:.65; text-align:right; }
  @media (max-width:560px) { .tbs-barras { height:90px; } .tbs-card b { font-size:19px; } }
  `;
  function estilos() {
    if (document.getElementById("tbs-css")) return;
    const st = document.createElement("style"); st.id = "tbs-css"; st.textContent = CSS; document.head.appendChild(st);
  }
  const color = (nivel) => `var(--tbs-${nivel === "ok" ? "ok" : nivel})`;

  function pintar(cont, d, opciones) {
    estilos();
    const op = opciones || {}, ayuda = op.ayuda || (() => "");
    if (!d || !Array.isArray(d.alertas)) { cont.innerHTML = '<p class="tbs-vacio">No hay datos del stock todavía.</p>'; return; }
    const r = d.semaforo || {}, problemas = d.alertas.filter((a) => a.nivel !== "ok"), enOrden = d.alertas.filter((a) => a.nivel === "ok");
    const sem = r.rojo ? ["rojo", `${r.rojo} ${r.rojo === 1 ? "tema" : "temas"} para resolver`] : r.amarillo ? ["amarillo", `${r.amarillo} ${r.amarillo === 1 ? "tema" : "temas"} para mirar`] : ["ok", "Todo en orden"];
    const subSem = r.rojo && r.amarillo ? `y ${r.amarillo} para mirar` : r.rojo || r.amarillo ? "Tocá cada uno para ver el detalle" : "El stock cuadra y no hay nada trabado";
    const ver = (k) => (op.ir && IR[k] ? ` <button type="button" class="tbs-ver" data-ir="${k}">Ver</button>` : "");
    const alertaHtml = (a) => `<details class="tbs-al" style="--tbs-c:${color(a.nivel)}"${a.nivel === "rojo" ? " open" : ""}>
        <summary><span class="tbs-al-t">${esc(a.titulo)}</span><span class="tbs-al-tag">${NIVEL[a.nivel]}</span><span class="tbs-al-n">${a.cantidad}</span></summary>
        <ul>${a.items.map((x) => `<li>${esc(x.texto)}${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</li>`).join("")}${a.cantidad > a.items.length ? `<li><small>y ${a.cantidad - a.items.length} más</small></li>` : ""}</ul>
        ${ver(a.k) ? `<div style="padding:0 12px 10px;">${ver(a.k)}</div>` : ""}
      </details>`;

    const dn = d.donde || {};
    const cards = (lista) => `<div class="tbs-cards">${lista.map(([n, t, e]) => `<div class="tbs-card"><b>${fmt(n)}</b><span>${esc(t)}</span>${e ? `<em>${esc(e)}</em>` : ""}</div>`).join("")}</div>`;
    const se = d.semana || {}, me = d.mes || {};

    // Barras de 14 días: entregas, instalado, devoluciones y retiros apilados.
    const SERIES = [["entrega", "Entregado a técnicos", "var(--tbs-amarillo)"], ["instalado", "Instalado en clientes", "var(--tbs-azul)"], ["devolucion", "Devuelto al depósito", "var(--tbs-ok)"], ["retirado", "Retirado de clientes", "#8E6FD1"]];
    const dias = d.dias || [], max = Math.max(1, ...dias.map((x) => SERIES.reduce((t, [k]) => t + (x[k] || 0), 0)));
    const barras = dias.map((x) => `<div class="tbs-col" title="${esc(x.fecha)}: ${SERIES.map(([k, t]) => `${t.toLowerCase()} ${fmt(x[k])}`).join(", ")}">${SERIES.map(([k, , c]) => (x[k] ? `<i style="height:${(x[k] / max) * 100}%;background:${c}"></i>` : "")).join("")}</div>`).join("");
    const etiquetas = dias.map((x) => { const f = new Date(x.fecha + "T12:00:00"); return `<span>${DIAS[f.getDay()]}<br>${f.getDate()}</span>`; }).join("");
    const hayMov = dias.some((x) => SERIES.some(([k]) => x[k]));

    const pers = d.personas || [];
    const tabla = pers.length ? `<div class="tbs-tabla"><table><thead><tr><th>Quién</th><th>Tiene ahora</th><th>Recibió</th><th>Instaló</th><th>Devolvió</th><th>Retiró</th><th>Pedidos</th></tr></thead><tbody>${pers.map((p) => {
      const acumula = p.tiene > 0 && p.recibio > 0 && p.instalo < p.recibio * 0.3 && p.tiene > 10;
      return `<tr><td>${esc(p.quien)}${p.vehiculo ? " <small>(vehículo)</small>" : ""}</td><td${acumula ? ' class="tbs-mucho" title="Recibió mucho más de lo que instaló: revisar si lo necesita"' : ""}>${fmt(p.tiene)}</td><td>${fmt(p.recibio)}</td><td>${fmt(p.instalo)}</td><td>${fmt(p.devolvio)}</td><td>${fmt(p.retiro)}</td><td>${p.pedidos || ""}</td></tr>`;
    }).join("")}</tbody></table></div><p class="tbs-pie">Recibió, instaló, devolvió y retiró: últimos 30 días.</p>` : '<p class="tbs-vacio">Nadie tiene material asignado.</p>';

    const top = d.masUsados || [], maxTop = Math.max(1, ...top.map((x) => x.cant));
    const topHtml = top.length ? `<div class="tbs-top">${top.map((x) => `<div><span>${esc(x.d)}</span><b>${fmt(x.cant)}</b><i style="width:${(x.cant / maxTop) * 100}%"></i></div>`).join("")}</div>` : '<p class="tbs-vacio">Todavía no se instaló material en estos 30 días.</p>';

    const rep = d.reponer || [];
    const repHtml = rep.length ? `<div class="tbs-tabla"><table><thead><tr><th>Artículo</th><th>En depósito</th><th>Mínimo</th><th>Alcanza para</th><th>Salió (60 días)</th><th></th></tr></thead><tbody>${rep.map((x) => `<tr><td>${esc(x.d)}</td><td>${fmt(x.dep)}</td><td>${x.min ? fmt(x.min) : "—"}</td><td${x.dias !== null && x.dias < 7 ? ' class="tbs-mucho"' : ""}>${x.dias === null ? "—" : `${x.dias} día${x.dias === 1 ? "" : "s"}`}</td><td>${fmt(x.salio60)}</td><td>${x.pedido ? "Pedido" : ""}</td></tr>`).join("")}</tbody></table></div><p class="tbs-pie">«Alcanza para»: lo que hay en el depósito dividido por lo que salió por día en los últimos 60 días.</p>` : '<p class="tbs-vacio">No hay nada por debajo del mínimo ni por terminarse.</p>';

    const hc = d.historialCuadre || [];
    const puntos = hc.length ? `<div class="tbs-puntos">Controles: ${hc.slice().reverse().map((h) => `<i title="${esc(new Date(h.fecha).toLocaleString("es-AR"))}: ${h.ok ? "cuadra" : h.errores + " problema(s)"}" style="background:${h.ok ? "var(--tbs-ok)" : "var(--tbs-rojo)"}"></i>`).join("")}</div>` : "";

    cont.innerHTML = `<div class="tbs">
      <div class="tbs-sem" style="border-color:${color(sem[0])}"><span class="tbs-sem-luz" style="background:${color(sem[0])}"></span><div><b>${esc(sem[1])}</b><small>${esc(subSem)}</small></div><span style="margin-left:auto">${ayuda("semaforo")}</span></div>
      ${problemas.map(alertaHtml).join("")}
      ${enOrden.length ? `<div class="tbs-enorden">${enOrden.map((a) => `<span>${esc(a.titulo)}${a.sub ? " · " + esc(a.sub) : ""}</span>`).join("")}</div>` : ""}
      ${puntos}
      <div class="tbs-caja"><h3>Dónde está el material ${ayuda("donde")}</h3>${cards([[dn.dep, "En el depósito"], [dn.tecnicos, "En manos de técnicos"], [dn.vehiculos, "En vehículos"], [dn.camino, "En camino"], [dn.garantia, "En garantía"]].filter((x, i) => i < 2 || x[0]))}</div>
      <div class="tbs-caja"><h3>Movimientos ${ayuda("movimientos")}</h3>
        ${cards([[se.entrega, "Entregado a técnicos", `30 días: ${fmt(me.entrega)}`], [se.instalado, "Instalado en clientes", `30 días: ${fmt(me.instalado)}`], [se.devolucion, "Devuelto al depósito", `30 días: ${fmt(me.devolucion)}`], [se.retirado, "Retirado de clientes", `30 días: ${fmt(me.retirado)}`], [se.ingreso, "Ingresó de proveedores", `30 días: ${fmt(me.ingreso)}`]])}
        <p class="tbs-pie" style="text-align:left;margin:6px 0 0;">Números grandes: últimos 7 días (cantidad de artículos).</p>
        ${hayMov ? `<div class="tbs-barras">${barras}</div><div class="tbs-dias">${etiquetas}</div><div class="tbs-ley">${SERIES.map(([, t, c]) => `<span style="--c:${c}">${t}</span>`).join("")}</div>` : '<p class="tbs-vacio" style="margin-top:8px;">No hubo movimientos en las últimas dos semanas.</p>'}
      </div>
      <div class="tbs-caja"><h3>Por técnico ${ayuda("personas")}</h3>${tabla}</div>
      <div class="tbs-caja"><h3>Lo más instalado (30 días)</h3>${topHtml}</div>
      <div class="tbs-caja"><h3>Para reponer ${ayuda("reponer")}</h3>${repHtml}</div>
      <p class="tbs-pie">Actualizado ${esc(new Date(d.fecha).toLocaleString("es-AR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }))}</p>
    </div>`;
    if (op.ir) cont.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); op.ir(IR[b.dataset.ir]); }));
  }
  raiz.TableroStock = { pintar, AYUDAS };
})(typeof window !== "undefined" ? window : globalThis);
