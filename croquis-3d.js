// Vista 3D de un croquis (three.js, se carga solo cuando se usa).
// Levanta las paredes del plano, pone cada equipo a su altura y dibuja la
// cobertura de los infrarrojos y las cámaras, para ver a simple vista qué
// queda sin cubrir. Usa las funciones de croquis-utils.js (que tiene que
// estar cargado antes) y THREE + THREE.OrbitControls (vendor/three).
//
// Croquis3D.crear(contenedor, elementos, opciones) -> { destruir, alternar, vista }

const CROQUIS_3D_VERSION = 1;
const Croquis3D = (() => {
  const M = (v) => v / CROQUIS_POR_METRO; // unidades del croquis -> metros
  const ALTO = 2.6, ESPESOR = 0.12, ALTO_PUERTA = 2.05, ALTO_SENSOR = 2.3;
  // Altura (m), tamaño (ancho, alto, prof) y forma de cada equipo.
  const EQUIPOS = {
    central: { h: 1.6, caja: [0.32, 0.24, 0.09], color: "#F2C94C", pared: true },
    hub: { h: 1.7, caja: [0.16, 0.16, 0.04], color: "#E6E6E6", pared: true },
    repetidor: { h: 1.9, caja: [0.16, 0.16, 0.04], color: "#E6E6E6", pared: true },
    teclado: { h: 1.4, caja: [0.17, 0.11, 0.03], color: "#D9D9D9", pared: true },
    sirena_int: { h: 2.35, caja: [0.2, 0.2, 0.08], color: "#D9D9D9", pared: true },
    sirena_ext: { h: 2.9, caja: [0.32, 0.36, 0.1], color: "#E05050", pared: true },
    sirena_flash: { h: 2.9, caja: [0.3, 0.34, 0.1], color: "#E05050", pared: true },
    magnetico: { h: 2.0, caja: [0.06, 0.03, 0.03], color: "#2E9E4F", pared: true },
    humo: { h: ALTO - 0.03, disco: 0.07, color: "#FFFFFF" },
    gas: { h: ALTO - 0.4, disco: 0.06, color: "#FFFFFF" },
    detector_360: { h: ALTO - 0.03, disco: 0.06, color: "#FFFFFF", ir360: true },
    rotura_vidrio: { h: 2.2, caja: [0.07, 0.07, 0.03], color: "#17809B", pared: true },
    pulsador_incendio: { h: 1.4, caja: [0.09, 0.09, 0.04], color: "#E00000", pared: true },
    pulsador_asalto: { h: 1.0, caja: [0.08, 0.08, 0.04], color: "#E8741E", pared: true },
    dvr: { h: 0.9, caja: [0.36, 0.06, 0.26], color: "#2B2F33" },
    monitor: { h: 1.3, caja: [0.5, 0.3, 0.04], color: "#2B2F33" },
    camara_ip: { h: 2.6, caja: [0.09, 0.09, 0.18], color: "#F4F4F4", camara: true },
    camara_analoga: { h: 2.6, caja: [0.09, 0.09, 0.18], color: "#F4F4F4", camara: true },
    camara_domo: { h: ALTO - 0.05, disco: 0.07, color: "#F4F4F4", camara: true },
  };
  const COLOR_PARED = "#E9E5DC", COLOR_PISO = "#C9C2B5";
  // Los equipos se dibujan más grandes que en la realidad para que se vean.
  const AUMENTO = 2.2;
  // Alcance real de cada sensor (m): el del croquis es solo el tamaño del dibujo.
  const ALCANCE_REAL = { infrarrojo: 11, infrarrojo_ext: 12, infrarrojo_cortina: 10 };

  // Texto (número de zona) como cartelito que siempre mira a la cámara.
  function cartel(texto, color) {
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 64;
    const c = cv.getContext("2d");
    c.fillStyle = "rgba(255,255,255,0.92)"; c.strokeStyle = color || "#1C1E21"; c.lineWidth = 6;
    const r = 18; c.beginPath(); c.moveTo(r, 3); c.arcTo(125, 3, 125, 61, r); c.arcTo(125, 61, 3, 61, r); c.arcTo(3, 61, 3, 3, r); c.arcTo(3, 3, 125, 3, r); c.fill(); c.stroke();
    c.fillStyle = "#1C1E21"; c.font = "bold 40px Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(texto).slice(0, 5), 64, 34);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
    s.scale.set(0.9, 0.45, 1);
    s.renderOrder = 10;
    return s;
  }
  // Sector de cobertura: del equipo (a su altura) hasta el piso, abierto en
  // el ángulo del sensor. Es una "carpa" transparente con el borde marcado.
  function sector(apice, alturaApice, puntos, alturaFin, color, opacidad) {
    const g = new THREE.Group();
    const pos = [];
    for (let i = 0; i < puntos.length - 1; i++) {
      pos.push(apice[0], alturaApice, apice[1], puntos[i][0], alturaFin, puntos[i][1], puntos[i + 1][0], alturaFin, puntos[i + 1][1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacidad * 0.55, side: THREE.DoubleSide, depthWrite: false })));
    // Mancha en el piso: lo que cubre.
    const piso = [];
    for (let i = 0; i < puntos.length - 1; i++) piso.push(apice[0], 0.012, apice[1], puntos[i][0], 0.012, puntos[i][1], puntos[i + 1][0], 0.012, puntos[i + 1][1]);
    const gp = new THREE.BufferGeometry();
    gp.setAttribute("position", new THREE.Float32BufferAttribute(piso, 3));
    g.add(new THREE.Mesh(gp, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.min(0.4, opacidad * 2.4), side: THREE.DoubleSide, depthWrite: false })));
    // Borde marcado solo en el piso (lo que cubre), para no llenar de líneas.
    const y0 = 0.02;
    const borde = [apice[0], y0, apice[1], puntos[0][0], y0, puntos[0][1], apice[0], y0, apice[1], puntos[puntos.length - 1][0], y0, puntos[puntos.length - 1][1]];
    puntos.forEach((p, i) => { if (i) borde.push(puntos[i - 1][0], y0, puntos[i - 1][1], p[0], y0, p[1]); });
    const gb = new THREE.BufferGeometry();
    gb.setAttribute("position", new THREE.Float32BufferAttribute(borde, 3));
    g.add(new THREE.LineSegments(gb, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 })));
    g.userData.cobertura = true;
    return g;
  }
  // Hasta dónde llega un rayo desde p en la dirección d sin atravesar una
  // pared (las puertas son huecos en la pared, así que por ahí pasa).
  function rayo(p, d, max, paredes) {
    let t = max;
    paredes.forEach(([a, b]) => {
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const den = d[0] * ez - d[1] * ex;
      if (Math.abs(den) < 1e-9) return;
      const qx = a[0] - p[0], qz = a[1] - p[1];
      const tt = (qx * ez - qz * ex) / den, u = (qx * d[1] - qz * d[0]) / den;
      if (tt > 0.15 && u >= -0.001 && u <= 1.001 && tt < t) t = tt;
    });
    return [p[0] + d[0] * t, p[1] + d[1] * t];
  }
  function pared(a, b, alto, color, desde) {
    const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (largo < 0.02) return null;
    const m = new THREE.Mesh(new THREE.BoxGeometry(largo + ESPESOR, alto, ESPESOR), new THREE.MeshLambertMaterial({ color }));
    m.position.set((a[0] + b[0]) / 2, (desde || 0) + alto / 2, (a[1] + b[1]) / 2);
    m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    m.userData.pared = true;
    return m;
  }
  // Una pared se ve "de frente" hacia el lado donde está el equipo apoyado.
  function paredMasCercana(x, z, paredes) {
    let mejor = null;
    paredes.forEach(([a, b]) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
      const px = a[0] + t * dx, pz = a[1] + t * dz, d = Math.hypot(x - px, z - pz);
      if (!mejor || d < mejor.d) mejor = { d, px, pz, ang: Math.atan2(dz, dx), nx: x - px, nz: z - pz };
    });
    return mejor;
  }

  function crear(contenedor, elementos, opciones) {
    const o = opciones || {};
    const ancho = () => contenedor.clientWidth || 600, alto = () => contenedor.clientHeight || 400;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!o.paraCaptura });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(ancho(), alto());
    renderer.setClearColor(o.fondo || "#EEF1F4");
    contenedor.appendChild(renderer.domElement);
    const escena = new THREE.Scene();
    const camara = new THREE.PerspectiveCamera(45, ancho() / alto(), 0.1, 400);
    escena.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.85));
    const sol = new THREE.DirectionalLight(0xffffff, 0.55); sol.position.set(-12, 25, 18); escena.add(sol);

    const grupoParedes = new THREE.Group(), grupoEquipos = new THREE.Group(), grupoCobertura = new THREE.Group(), grupoCarteles = new THREE.Group();
    escena.add(grupoParedes, grupoEquipos, grupoCobertura, grupoCarteles);
    const segmentos = []; // paredes en metros, para apoyar los equipos
    const pt = (x, y) => [M(x), M(y)];
    const els = (elementos || []).filter((e) => e && !(o.ocultarAntes && e.prev));
    // ---- Paredes ----
    els.forEach((e) => {
      if (e.t === "linea") {
        if (Array.isArray(e.c)) {
          let prev = pt(e.x1, e.y1);
          for (let i = 1; i <= 12; i++) {
            const t = i / 12, u = 1 - t;
            const p = pt(u * u * e.x1 + 2 * u * t * e.c[0] + t * t * e.x2, u * u * e.y1 + 2 * u * t * e.c[1] + t * t * e.y2);
            segmentos.push([prev, p]); prev = p;
          }
        } else segmentos.push([pt(e.x1, e.y1), pt(e.x2, e.y2)]);
      } else if (e.t === "rect" && (!e.forma || e.forma === "rect")) {
        const w = M(Math.abs(e.w)), h = M(Math.abs(e.h)), x = M(Math.min(e.x, e.x + e.w)), z = M(Math.min(e.y, e.y + e.h));
        if (w * h < 1.5) {
          // Rectángulo chico (mueble, tablero): una caja de 1 m.
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1, h), new THREE.MeshLambertMaterial({ color: e.color || "#8E949A" }));
          m.position.set(x + w / 2, 0.5, z + h / 2); grupoParedes.add(m);
        } else {
          const p = [[x, z], [x + w, z], [x + w, z + h], [x, z + h]];
          for (let i = 0; i < 4; i++) segmentos.push([p[i], p[(i + 1) % 4]]);
        }
      }
    });
    const altoParedes = () => (vista.paredesBajas ? 1.1 : ALTO);
    function armarParedes() {
      grupoParedes.children.filter((c) => c.userData.pared).forEach((c) => { grupoParedes.remove(c); c.geometry.dispose(); });
      segmentos.forEach(([a, b]) => { const m = pared(a, b, altoParedes(), COLOR_PARED); if (m) grupoParedes.add(m); });
      // Dinteles sobre las puertas (solo con paredes altas).
      if (!vista.paredesBajas) els.filter((e) => e.t === "simbolo" && CROQUIS_ABERTURAS.includes(e.tipo)).forEach((e) => {
        const ancho2 = (CROQUIS_ANCHO_ABERTURA[e.tipo] || 40) / 2;
        const a = croquisLocalAMundo(e, -ancho2, 0), b = croquisLocalAMundo(e, ancho2, 0);
        const desde = e.tipo === "ventana" ? 2.1 : e.tipo.startsWith("porton") ? 2.4 : ALTO_PUERTA;
        const m = pared(pt(a[0], a[1]), pt(b[0], b[1]), ALTO - desde, COLOR_PARED, desde);
        if (m) grupoParedes.add(m);
      });
    }
    // ---- Piso ----
    const caja = croquisCaja({ elementos: els });
    const cx = M(caja.x + caja.w / 2), cz = M(caja.y + caja.h / 2), lado = Math.max(M(caja.w), M(caja.h), 4);
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(M(caja.w) + 2, M(caja.h) + 2), new THREE.MeshLambertMaterial({ color: COLOR_PISO }));
    piso.rotation.x = -Math.PI / 2; piso.position.set(cx, 0, cz); escena.add(piso);
    const grilla = new THREE.GridHelper(Math.ceil(lado + 2), Math.ceil(lado + 2), 0xb5ad9f, 0xb5ad9f);
    grilla.position.set(cx, 0.005, cz); grilla.material.transparent = true; grilla.material.opacity = 0.35; escena.add(grilla);

    // ---- Puertas (hoja abierta) ----
    els.filter((e) => e.t === "simbolo" && e.tipo === "puerta").forEach((e) => {
      const bis = croquisLocalAMundo(e, -20, 0), punta = croquisLocalAMundo(e, -20, -40);
      const a = pt(bis[0], bis[1]), b = pt(punta[0], punta[1]);
      const m = pared(a, b, ALTO_PUERTA - 0.02, "#B98C5A");
      if (m) { m.scale.z = 0.35; m.userData.pared = false; grupoParedes.add(m); }
    });

    // ---- Equipos ----
    const opac = (e) => (e.prev ? 0.35 : 1);
    els.filter((e) => e.t === "simbolo" && CROQUIS_SIMBOLOS[e.tipo] && CROQUIS_SIMBOLOS[e.tipo].cat === "equipo").forEach((e) => {
      const def = CROQUIS_SIMBOLOS[e.tipo];
      const p3 = EQUIPOS[e.tipo] || { h: 1.5, caja: [0.12, 0.12, 0.06], color: e.color || def.color, pared: true };
      const color = def.ir ? (e.color || def.color) : (p3.color || e.color || def.color);
      const mat = new THREE.MeshLambertMaterial({ color, transparent: !!e.prev, opacity: opac(e), emissive: e.inst ? 0x553300 : 0x000000 });
      let x, z, h = p3.h, obj;
      if (def.ir) {
        // El vértice de captación es la esquina donde va el sensor.
        const ap = croquisLocalAMundo(e, 0, 0); [x, z] = pt(ap[0], ap[1]); h = ALTO_SENSOR;
        obj = new THREE.Mesh(new THREE.BoxGeometry(0.09 * AUMENTO, 0.12 * AUMENTO, 0.07 * AUMENTO), mat);
        obj.position.set(x, h, z);
        const { ang, doble } = croquisIRParams(e, def);
        const total = Math.min(359, doble ? ang * 2 : ang);
        const arco = [];
        const pasos = Math.max(12, Math.round(total / 3));
        const alcance = ALCANCE_REAL[e.tipo] || 10;
        for (let i = 0; i <= pasos; i++) {
          const g = (CROQUIS_IR_BIS - total / 2 + total * i / pasos) * Math.PI / 180;
          // Dirección del rayo en el plano (con el giro y espejado del equipo).
          const w = croquisLocalAMundo(e, Math.cos(g) * 100, Math.sin(g) * 100), w0 = croquisLocalAMundo(e, 0, 0);
          const dx = w[0] - w0[0], dz = w[1] - w0[1], n = Math.hypot(dx, dz) || 1;
          arco.push(rayo([x, z], [dx / n, dz / n], alcance, segmentos));
        }
        const s = sector([x, z], h, arco, 0.02, e.tipo === "infrarrojo" ? 0xe00000 : 0x7b4b94, e.prev ? 0.05 : 0.11);
        grupoCobertura.add(s);
      } else {
        [x, z] = pt(e.x, e.y);
        if (p3.disco) {
          obj = new THREE.Mesh(new THREE.CylinderGeometry(p3.disco * AUMENTO, p3.disco * AUMENTO, 0.05, 24), mat);
          obj.position.set(x, h, z);
        } else {
          obj = new THREE.Mesh(new THREE.BoxGeometry(...p3.caja.map((v) => v * AUMENTO)), mat);
          const pc = p3.pared ? paredMasCercana(x, z, segmentos) : null;
          if (pc && pc.d < 0.6) {
            // Apoyado contra la pared, del lado donde está dibujado.
            const n = Math.hypot(pc.nx, pc.nz) || 1;
            obj.position.set(pc.px + pc.nx / n * (ESPESOR / 2 + p3.caja[2] * AUMENTO / 2), h, pc.pz + pc.nz / n * (ESPESOR / 2 + p3.caja[2] * AUMENTO / 2));
            obj.rotation.y = -pc.ang;
          } else obj.position.set(x, h, z);
        }
        if (p3.camara) {
          const ang = 80, alc = 15, giro = ((e.rot || 0) - 90) * Math.PI / 180, arco = [];
          for (let i = 0; i <= 26; i++) { const g = giro - (ang / 2) * Math.PI / 180 + (ang * Math.PI / 180) * i / 26; arco.push(rayo([x, z], [Math.cos(g), Math.sin(g)], alc, segmentos)); }
          grupoCobertura.add(sector([x, z], h, arco, 0.02, 0x2e86de, e.prev ? 0.04 : 0.08));
        }
      }
      obj.userData.equipo = e;
      grupoEquipos.add(obj);
      const etq = String(e.etq || "").trim();
      if (etq) {
        const c = cartel(etq, e.inst ? "#E8741E" : color);
        c.position.set(obj.position.x, Math.min(ALTO + 0.35, h + 0.3), obj.position.z);
        c.material.opacity = e.prev ? 0.5 : 1;
        grupoCarteles.add(c);
      }
      if (e.inst) {
        // A instalar: aro naranja en el piso debajo.
        const aro = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.24, 24), new THREE.MeshBasicMaterial({ color: 0xe8741e, side: THREE.DoubleSide }));
        aro.rotation.x = -Math.PI / 2; aro.position.set(obj.position.x, 0.02, obj.position.z); grupoEquipos.add(aro);
      }
    });

    // ---- Cámara y controles ----
    const vista = { paredesBajas: !!o.paredesBajas, cobertura: o.cobertura !== false };
    grupoCobertura.visible = vista.cobertura;
    armarParedes();
    const controles = new THREE.OrbitControls(camara, renderer.domElement);
    controles.target.set(cx, 0, cz);
    controles.maxPolarAngle = Math.PI / 2 - 0.05;
    controles.minDistance = 2; controles.maxDistance = lado * 4;
    controles.enableDamping = true;
    function vistaInicial(arriba) {
      // En el celular (pantalla angosta) se aleja para que entre la casa entera.
      const f = Math.min(2.2, Math.max(1, 0.85 / (ancho() / Math.max(1, alto()))));
      if (arriba) camara.position.set(cx, lado * 1.75 * f, cz + 0.01);
      else camara.position.set(cx - lado * 0.55 * f, lado * 0.85 * f, cz + lado * 0.95 * f);
      controles.target.set(cx, 0, cz);
      controles.update();
    }
    vistaInicial(false);
    let vivo = true, pedido = 0;
    function dibujar() { if (!vivo) return; controles.update(); renderer.render(escena, camara); pedido = requestAnimationFrame(dibujar); }
    dibujar();
    const ro = window.ResizeObserver ? new ResizeObserver(() => { renderer.setSize(ancho(), alto()); camara.aspect = ancho() / alto(); camara.updateProjectionMatrix(); }) : null;
    if (ro) ro.observe(contenedor);
    return {
      vista,
      alternar(que) {
        if (que === "cobertura") { vista.cobertura = !vista.cobertura; grupoCobertura.visible = vista.cobertura; }
        if (que === "paredes") { vista.paredesBajas = !vista.paredesBajas; armarParedes(); }
        if (que === "arriba") vistaInicial(true);
        if (que === "inicio") vistaInicial(false);
        return vista;
      },
      captura() { renderer.render(escena, camara); return renderer.domElement.toDataURL("image/png"); },
      escena,
      resumen: { equipos: grupoEquipos.children.filter((c) => c.userData.equipo).length, paredes: segmentos.length, coberturas: grupoCobertura.children.length },
      destruir() {
        vivo = false; cancelAnimationFrame(pedido); if (ro) ro.disconnect(); controles.dispose();
        escena.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } });
        renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      },
    };
  }
  // Carga three.js (de vendor/three) la primera vez.
  let cargando = null;
  function cargar() {
    if (window.THREE && window.THREE.OrbitControls) return Promise.resolve();
    if (cargando) return cargando;
    const script = (src) => new Promise((ok, mal) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => mal(new Error("No se pudo cargar la vista 3D (¿sin señal?)")); document.head.appendChild(s); });
    cargando = script("vendor/three/three.min.js").then(() => script("vendor/three/OrbitControls.js")).catch((e) => { cargando = null; throw e; });
    return cargando;
  }
  function disponible() {
    try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); } catch (e) { return false; }
  }
  return { crear, cargar, disponible };
})();

// ---------- Visor para el cliente ----------
// Página completa (encabezado con la marca, botones, leyenda y lo que se
// instala) a partir de los datos de un croquis. La usan el link que se
// manda por WhatsApp (vista-3d.html) y el archivo HTML para descargar.
// datos: { titulo, cliente, fecha, empresa, paginas: [{ nombre, elementos }] }
const CROQUIS_3D_ESTILO = `
.v3-raiz{--bg:#EEF1F4;--fg:#1C1E21;--sup:#fff;--bd:#C9CED4;--ac:#F2C94C;--tenue:#5B6B7B;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
@media (prefers-color-scheme:dark){.v3-raiz{--bg:#14171A;--fg:#EEF0F2;--sup:#1F2429;--bd:#38414A;--tenue:#A6B0BA}}
.v3-raiz *{box-sizing:border-box}html.v3-pagina,html.v3-pagina body{margin:0;height:100%;overflow:hidden}
.v3-capa{position:fixed;inset:0;z-index:9000}
.v3-lienzo{position:fixed;inset:0}
.v3-cab{position:fixed;z-index:2;top:0;left:0;right:0;display:flex;gap:10px;align-items:center;padding:10px 14px;background:linear-gradient(var(--bg) 60%,transparent);pointer-events:none}
.v3-cab img{height:34px;border-radius:6px;pointer-events:auto}
.v3-cab b{display:block;font-size:16px;line-height:1.2}.v3-cab small{display:block;font-size:12.5px;color:var(--tenue)}
.v3-barra{position:fixed;z-index:2;left:50%;transform:translateX(-50%);bottom:12px;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;width:calc(100% - 20px);max-width:620px}
.v3-barra button{font:600 14px inherit;font-family:inherit;padding:10px 12px;border-radius:12px;border:1px solid var(--bd);background:var(--sup);color:var(--fg);box-shadow:0 2px 8px rgba(0,0,0,.15);cursor:pointer}
.v3-barra button.on{background:var(--ac);color:#1C1E21;border-color:#D4A017}
.v3-ley{position:fixed;z-index:2;color:var(--fg);right:10px;top:62px;max-width:min(260px,calc(100% - 20px));background:var(--sup);border:1px solid var(--bd);border-radius:12px;padding:10px 12px;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,.12)}
.v3-ley summary{font-weight:700;cursor:pointer}
.v3-ley ul{margin:6px 0 0;padding:0;list-style:none}.v3-ley li{display:flex;align-items:center;gap:8px;margin:4px 0}
.v3-ley i{width:14px;height:14px;border-radius:3px;display:inline-block;flex:none;border:1px solid rgba(0,0,0,.25)}
.v3-ley .v3-nota{color:var(--tenue);font-size:12px;margin:6px 0 0}
.v3-pags{position:fixed;z-index:2;left:10px;top:62px;display:flex;flex-direction:column;gap:6px}
.v3-pags button{font:600 13px inherit;font-family:inherit;padding:7px 10px;border-radius:10px;border:1px solid var(--bd);background:var(--sup);color:var(--fg)}
.v3-pags button.on{background:var(--ac);color:#1C1E21}
@media (max-width:480px){.v3-barra{gap:4px}.v3-barra button{padding:9px 9px;font-size:13px}}
.v3-error{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:30px;text-align:center;font-size:16px}
`;
const CROQUIS_3D_LEYENDA = {
  infrarrojo: ["Sensor de movimiento (infrarrojo)", "#E00000"], infrarrojo_ext: ["Sensor de movimiento exterior", "#7B4B94"], infrarrojo_cortina: ["Sensor cortina", "#7B4B94"],
  magnetico: ["Sensor de apertura (puertas y ventanas)", "#2E9E4F"], humo: ["Detector de humo", "#FFFFFF"], gas: ["Detector de gas", "#FFFFFF"],
  central: ["Central de alarma", "#F2C94C"], hub: ["Central inalámbrica (Hub)", "#E6E6E6"], repetidor: ["Repetidor de señal", "#E6E6E6"], teclado: ["Teclado", "#D9D9D9"],
  sirena_int: ["Sirena interior", "#D9D9D9"], sirena_ext: ["Sirena exterior", "#E05050"], sirena_flash: ["Sirena con flash", "#E05050"],
  rotura_vidrio: ["Detector de rotura de vidrio", "#17809B"], pulsador_asalto: ["Botón de pánico", "#E8741E"], pulsador_incendio: ["Pulsador de incendio", "#E00000"],
  camara_ip: ["Cámara", "#F4F4F4"], camara_analoga: ["Cámara", "#F4F4F4"], camara_domo: ["Cámara domo", "#F4F4F4"], dvr: ["Grabador de cámaras", "#2B2F33"], detector_360: ["Detector de techo 360°", "#FFFFFF"],
};
function iniciarVisor3D(datos, opciones) {
  const o = opciones || {};
  const d = datos || {};
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  if (!document.getElementById("v3-estilo")) { const st = document.createElement("style"); st.id = "v3-estilo"; st.textContent = CROQUIS_3D_ESTILO; document.head.appendChild(st); }
  const raiz = o.contenedor || document.body;
  raiz.classList.add("v3-raiz");
  if (!o.contenedor) document.documentElement.classList.add("v3-pagina");
  const paginas = (Array.isArray(d.paginas) && d.paginas.length ? d.paginas : [{ nombre: "", elementos: d.elementos || [] }]).filter((p) => (p.elementos || []).length);
  if (!paginas.length) { raiz.innerHTML = `<div class="v3-error">Este plano no tiene nada para mostrar en 3D.</div>`; return null; }
  const todos = paginas.flatMap((p) => p.elementos || []);
  const hayInst = todos.some((e) => e.inst), hayAntes = todos.some((e) => e.prev);
  // Leyenda: qué equipos tiene (y cuántos se instalan).
  const cuenta = {};
  todos.filter((e) => e.t === "simbolo" && CROQUIS_3D_LEYENDA[e.tipo] && !e.prev).forEach((e) => {
    const k = CROQUIS_3D_LEYENDA[e.tipo][0];
    cuenta[k] = cuenta[k] || { n: 0, color: CROQUIS_3D_LEYENDA[e.tipo][1] };
    cuenta[k].n++;
  });
  const titulo = d.titulo || "Tu sistema de seguridad";
  raiz.insertAdjacentHTML("beforeend", `
    <div class="v3-lienzo"></div>
    <div class="v3-cab">${d.logo ? `<img src="${d.logo}" alt="">` : ""}<div><b>${esc(titulo)}</b><small>${esc([d.cliente, d.empresa ? "Propuesta de " + d.empresa : ""].filter(Boolean).join(" · "))}</small></div></div>
    ${paginas.length > 1 ? `<div class="v3-pags">${paginas.map((p, i) => `<button type="button" data-pag="${i}" class="${i ? "" : "on"}">${esc(p.nombre || "Planta " + (i + 1))}</button>`).join("")}</div>` : ""}
    <details class="v3-ley" ${window.innerWidth > 700 ? "open" : ""}><summary>Qué se instala</summary><ul>${Object.entries(cuenta).map(([k, v]) => `<li><i style="background:${v.color}"></i>${v.n} × ${esc(k)}</li>`).join("")}
      <li><i style="background:rgba(224,0,0,.35)"></i>Zona que cubre cada sensor</li></ul>
      ${hayInst ? `<p class="v3-nota">Con aro naranja: lo que se agrega.</p>` : ""}${hayAntes ? `<p class="v3-nota">Atenuado: lo que ya está instalado.</p>` : ""}
      <p class="v3-nota">Arrastrá para girar · dos dedos para acercar.</p></details>
    <div class="v3-barra"><button type="button" data-a="cobertura" class="on">Coberturas</button><button type="button" data-a="paredes">Ver adentro</button><button type="button" data-a="arriba">Desde arriba</button><button type="button" data-a="inicio">Volver</button>${(o.extras || []).map((x, i) => `<button type="button" data-extra="${i}">${esc(x.texto)}</button>`).join("")}${o.botonCerrar ? `<button type="button" data-a="cerrar">Cerrar</button>` : ""}</div>`);
  const lienzo = raiz.querySelector(".v3-lienzo");
  let visor = Croquis3D.crear(lienzo, paginas[0].elementos, { paraCaptura: o.paraCaptura });
  raiz.querySelectorAll(".v3-pags button").forEach((b) => b.addEventListener("click", () => {
    raiz.querySelectorAll(".v3-pags button").forEach((x) => x.classList.toggle("on", x === b));
    const v = visor.vista; visor.destruir();
    visor = Croquis3D.crear(lienzo, paginas[Number(b.dataset.pag)].elementos, { paraCaptura: o.paraCaptura, paredesBajas: v.paredesBajas, cobertura: v.cobertura });
  }));
  raiz.querySelectorAll(".v3-barra button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.extra != null) { const x = o.extras[Number(b.dataset.extra)]; if (x && x.alHacer) x.alHacer(); return; }
    if (b.dataset.a === "cerrar") { if (o.alCerrar) o.alCerrar(); return; }
    const v = visor.alternar(b.dataset.a);
    if (b.dataset.a === "cobertura") b.classList.toggle("on", v.cobertura);
    if (b.dataset.a === "paredes") b.classList.toggle("on", v.paredesBajas);
  }));
  return { destruir() { visor.destruir(); raiz.innerHTML = ""; }, captura() { return visor.captura(); }, get visor() { return visor; } };
}
if (typeof window !== "undefined") window.iniciarVisor3D = iniciarVisor3D;

// Arma un .html que se abre solo, sin internet: trae adentro three.js, el
// dibujo y el visor. Para mandarlo como archivo (WhatsApp, mail).
async function croquis3dHtmlIndependiente(datos) {
  const traer = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error("No se pudo preparar el archivo (" + u + ")"); return r.text(); });
  const [three, orbit, utils, visor] = await Promise.all(["vendor/three/three.min.js", "vendor/three/OrbitControls.js", "croquis-utils.js", "croquis-3d.js"].map(traer));
  let logo = "";
  try {
    const b = await fetch("icons/logo.png").then((r) => (r.ok ? r.blob() : null));
    if (b) logo = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => ok(""); fr.readAsDataURL(b); });
  } catch (e) { logo = ""; }
  const seguro = (t) => t.replace(/<\/script/gi, "<\\/script");
  const json = JSON.stringify({ ...datos, logo }).replace(/</g, "\\u003c");
  const titulo = String(datos.titulo || "Tu casa en 3D").replace(/[<>&"]/g, "");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"><title>${titulo} — SAT</title><style>html,body{margin:0;height:100%;background:#EEF1F4}</style></head><body>
<script>${seguro(three)}<\/script>
<script>${seguro(orbit)}<\/script>
<script>${seguro(utils)}<\/script>
<script>${seguro(visor)}<\/script>
<script>(function(){var d=${json};if(!Croquis3D.disponible()){document.body.innerHTML="<p style='font:16px system-ui;padding:30px;text-align:center'>Este navegador no puede mostrar 3D. Abrí el archivo con Chrome o Safari.</p>";return;}iniciarVisor3D(d);})();<\/script>
</body></html>`;
}
if (typeof window !== "undefined") window.croquis3dHtmlIndependiente = croquis3dHtmlIndependiente;
