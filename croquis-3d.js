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

  // Las aberturas son huecos en la pared: para dibujarlas se corta la pared
  // en todas. Para lo que ven los sensores solo se corta en los pasos (vanos
  // sin puerta): una puerta puede estar cerrada y por el vidrio no se detecta.
  function tramosAbertura(els, todas) {
    return els.filter((e) => e.t === "simbolo" && CROQUIS_ABERTURAS.includes(e.tipo) && (todas || e.tipo === "paso")).map((e) => {
      const w2 = (CROQUIS_ANCHO_ABERTURA[e.tipo] || 40) / 2;
      const a = croquisLocalAMundo(e, -w2, 0), b = croquisLocalAMundo(e, w2, 0);
      return [[M(a[0]), M(a[1])], [M(b[0]), M(b[1])]];
    });
  }
  function cortarParedes(segs, huecos) {
    let res = segs.slice();
    huecos.forEach(([ha, hb]) => {
      const sig = [];
      res.forEach(([a, b]) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        if (L < 1e-6) return;
        const ux = dx / L, uy = dy / L;
        // El hueco tiene que estar sobre esta pared (cerca y casi paralelo).
        const dist = (p) => Math.abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux);
        const hx = hb[0] - ha[0], hy = hb[1] - ha[1], hl = Math.hypot(hx, hy) || 1;
        if (dist(ha) > 0.2 || dist(hb) > 0.2 || Math.abs((hx * ux + hy * uy) / hl) < 0.9) { sig.push([a, b]); return; }
        let t1 = (ha[0] - a[0]) * ux + (ha[1] - a[1]) * uy, t2 = (hb[0] - a[0]) * ux + (hb[1] - a[1]) * uy;
        if (t1 > t2) [t1, t2] = [t2, t1];
        if (t2 <= 0.01 || t1 >= L - 0.01) { sig.push([a, b]); return; }
        if (t1 > 0.01) sig.push([a, [a[0] + ux * t1, a[1] + uy * t1]]);
        if (t2 < L - 0.01) sig.push([[a[0] + ux * t2, a[1] + uy * t2], b]);
      });
      res = sig;
    });
    return res;
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
      if (croquisEsCerco(e)) return; // los cercos van aparte
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
    // Paredes cortadas en las aberturas: para dibujar (todas) y para lo que
    // ven los sensores (solo los pasos).
    const paredesEnteras = segmentos.slice();
    const paredesDibujo = cortarParedes(segmentos, tramosAbertura(els, true));
    const sinPuertas = cortarParedes(segmentos, tramosAbertura(els, false));
    segmentos.length = 0; sinPuertas.forEach((x) => segmentos.push(x));
    const altoParedes = () => (vista.paredesBajas ? 1.1 : ALTO);
    function armarParedes() {
      grupoParedes.children.filter((c) => c.userData.pared).forEach((c) => { grupoParedes.remove(c); c.geometry.dispose(); });
      paredesDibujo.forEach(([a, b]) => { const m = pared(a, b, altoParedes(), COLOR_PARED); if (m) grupoParedes.add(m); });
      els.filter((e) => e.t === "simbolo" && CROQUIS_ABERTURAS.includes(e.tipo)).forEach((e) => {
        const ancho2 = (CROQUIS_ANCHO_ABERTURA[e.tipo] || 40) / 2;
        const a = croquisLocalAMundo(e, -ancho2, 0), b = croquisLocalAMundo(e, ancho2, 0);
        const A = pt(a[0], a[1]), B = pt(b[0], b[1]);
        // Una abertura que no está en una pared (p. ej. un portón en la reja) no lleva dintel ni antepecho.
        const pc = paredMasCercana((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, paredesEnteras);
        if (!pc || pc.d > 0.2) return;
        // Antepecho de la ventana (debajo) y vidrio.
        if (e.tipo === "ventana") {
          const m = pared(A, B, Math.min(1.0, altoParedes()), COLOR_PARED); if (m) grupoParedes.add(m);
          if (!vista.paredesBajas) { const v = pared(A, B, 1.1, "#9CC7E0", 1.0); if (v) { v.material.transparent = true; v.material.opacity = 0.35; v.scale.z = 0.3; grupoParedes.add(v); } }
        }
        // Marco del paso (jambas y travesaño), para que se vea que es un vano.
        if (e.tipo === "paso") {
          const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L, g = 0.06;
          const alto = Math.min(ALTO_PUERTA, altoParedes());
          [[A, [A[0] + ux * g, A[1] + uz * g]], [[B[0] - ux * g, B[1] - uz * g], B]].forEach(([p, q]) => { const j = pared(p, q, alto, "#B98C5A"); if (j) { j.scale.z = 1.5; grupoParedes.add(j); } });
          if (!vista.paredesBajas) { const t = pared(A, B, 0.06, "#B98C5A", ALTO_PUERTA - 0.06); if (t) { t.scale.z = 1.5; grupoParedes.add(t); } }
        }
        // Dintel sobre la abertura (solo con paredes altas).
        if (vista.paredesBajas) return;
        const desde = e.tipo === "ventana" ? 2.1 : e.tipo.startsWith("porton") ? 2.4 : ALTO_PUERTA;
        const m = pared(A, B, ALTO - desde, COLOR_PARED, desde);
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

    // ---- Cercos perimetrales (reja, reja con tapial, tejido) ----
    const grupoCercos = new THREE.Group();
    escena.add(grupoCercos);
    let texTejido = null;
    els.filter(croquisEsCerco).forEach((e) => {
      const def = CROQUIS_CERCOS[e.cerco];
      const color = e.cerco === "tejido" ? 0x5f6b63 : 0x2b2f33;
      const tramos = croquisCercoPuntos(e, 8).pts.map((p) => [M(p.x), M(p.y)]);
      const desde = def.tapial || 0, alto = def.alto - desde;
      // Tramo a tramo (así sigue también las curvas).
      const largoTotal = [];
      for (let i = 1; i < tramos.length; i++) largoTotal.push([tramos[i - 1], tramos[i]]);
      largoTotal.forEach(([a, b]) => {
        if (def.tapial) { const t = pared(a, b, def.tapial, "#B7B1A6"); if (t) { t.scale.z = 1.6; grupoCercos.add(t); } }
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (l < 0.01) return;
        const ang = -Math.atan2(b[1] - a[1], b[0] - a[0]);
        // Caños de arriba y abajo.
        [desde + 0.05, desde + alto - 0.03].forEach((y) => {
          const r = new THREE.Mesh(new THREE.BoxGeometry(l, 0.04, 0.04), new THREE.MeshLambertMaterial({ color }));
          r.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2); r.rotation.y = ang; grupoCercos.add(r);
        });
        if (e.cerco === "tejido") {
          if (!texTejido) {
            const cv = document.createElement("canvas"); cv.width = cv.height = 64;
            const g = cv.getContext("2d"); g.strokeStyle = "rgba(70,80,74,0.9)"; g.lineWidth = 3;
            g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
            texTejido = new THREE.CanvasTexture(cv); texTejido.wrapS = texTejido.wrapT = THREE.RepeatWrapping;
          }
          const tx = texTejido.clone(); tx.needsUpdate = true; tx.repeat.set(l / 0.12, alto / 0.12);
          const malla = new THREE.Mesh(new THREE.PlaneGeometry(l, alto), new THREE.MeshBasicMaterial({ map: tx, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
          malla.position.set((a[0] + b[0]) / 2, desde + alto / 2, (a[1] + b[1]) / 2); malla.rotation.y = ang; grupoCercos.add(malla);
        }
      });
      // Barrotes (reja) o postes (tejido), en una sola malla instanciada.
      const sep = e.cerco === "tejido" ? 2.5 : 0.12;
      const pts = croquisCercoPuntos(e, sep * CROQUIS_POR_METRO).pts;
      const geo = e.cerco === "tejido" ? new THREE.CylinderGeometry(0.035, 0.035, alto + 0.1, 8) : new THREE.BoxGeometry(0.018, alto, 0.018);
      const inst = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color }), pts.length);
      const mtx = new THREE.Matrix4();
      pts.forEach((p, i) => { mtx.makeTranslation(M(p.x), desde + alto / 2, M(p.y)); inst.setMatrixAt(i, mtx); });
      grupoCercos.add(inst);
    });

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
        c.userData.equipo = e;
        grupoCarteles.add(c);
      }
      if (e.inst) {
        // A instalar: aro naranja en el piso debajo.
        const aro = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.24, 24), new THREE.MeshBasicMaterial({ color: 0xe8741e, side: THREE.DoubleSide }));
        aro.rotation.x = -Math.PI / 2; aro.position.set(obj.position.x, 0.02, obj.position.z); aro.userData.de = e; grupoEquipos.add(aro);
      }
    });

    // ---- Cámara y controles ----
    const vista = { paredesBajas: !!o.paredesBajas, cobertura: o.cobertura !== false, debiles: !!o.debiles };
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
    if (o.camaraInicial) { camara.position.set(...o.camaraInicial.p); controles.target.set(...o.camaraInicial.t); controles.update(); }
    // Toque corto (no arrastre): qué equipo o qué punto del piso se tocó.
    // Sirve para editar desde el 3D (agregar, mover, sacar equipos).
    const marca = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 32), new THREE.MeshBasicMaterial({ color: 0xf2c94c, side: THREE.DoubleSide, depthTest: false, transparent: true }));
    marca.rotation.x = -Math.PI / 2; marca.renderOrder = 12; marca.visible = false; escena.add(marca);
    let toque = null;
    const lienzo = renderer.domElement;
    const alBajar = (ev) => { toque = { x: ev.clientX, y: ev.clientY, t: Date.now(), n: (toque && Date.now() - toque.t < 400 ? toque.n : 0) + 1 }; };
    const alSubir = (ev) => {
      if (!toque || !o.alTocar) return;
      const lejos = Math.hypot(ev.clientX - toque.x, ev.clientY - toque.y) > 8 || Date.now() - toque.t > 500;
      toque = null;
      if (lejos) return;
      const r = lienzo.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camara);
      const golpes = ray.intersectObjects([...grupoEquipos.children, ...grupoCarteles.children], false).filter((g) => g.object.userData.equipo || g.object.userData.de);
      const piso0 = new THREE.Vector3();
      const enPiso = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), piso0) ? [piso0.x * CROQUIS_POR_METRO, piso0.z * CROQUIS_POR_METRO] : null;
      const eq = golpes.length ? (golpes[0].object.userData.equipo || golpes[0].object.userData.de) : null;
      o.alTocar({ equipo: eq, punto: enPiso });
    };
    lienzo.addEventListener("pointerdown", alBajar);
    lienzo.addEventListener("pointerup", alSubir);
    // ---- Puntos débiles: lo que no cubre ningún sensor y aberturas sin sensor ----
    const an = analizar(els);
    const grupoDebiles = new THREE.Group();
    escena.add(grupoDebiles);
    const cuadro = []; // cosas que se animan en cada cuadro
    if (an) {
      const cv = document.createElement("canvas"); cv.width = cv.height = 64;
      const g = cv.getContext("2d");
      g.fillStyle = "rgba(255,176,32,0.35)"; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = "rgba(214,120,0,0.85)"; g.lineWidth = 7;
      for (let k = -64; k <= 64; k += 32) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); }
      const tex = new THREE.CanvasTexture(cv);
      const pos = [], uv = [], c = an.celda / 2;
      for (let k = 0; k < an.nx * an.ny; k++) if (an.interior[k] && !an.cubierto[k]) {
        const [x, z] = an.centro(k % an.nx, Math.floor(k / an.nx));
        pos.push(x - c, 0.018, z - c, x + c, 0.018, z + c, x + c, 0.018, z - c, x - c, 0.018, z - c, x - c, 0.018, z + c, x + c, 0.018, z + c);
        uv.push(0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1);
      }
      if (pos.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        grupoDebiles.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })));
      }
      // Aberturas que dan afuera sin sensor: marco rojo que late y un "!".
      an.aberturasSinProteger.forEach((ab) => {
        const largo = Math.hypot(ab.b[0] - ab.a[0], ab.b[1] - ab.a[1]);
        const alto = ab.el.tipo === "ventana" ? 1.1 : 2.05, desde = ab.el.tipo === "ventana" ? 1.0 : 0;
        const m = new THREE.Mesh(new THREE.BoxGeometry(largo, alto, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2d20, transparent: true, opacity: 0.55, depthWrite: false }));
        m.position.set((ab.a[0] + ab.b[0]) / 2, desde + alto / 2, (ab.a[1] + ab.b[1]) / 2);
        m.rotation.y = -Math.atan2(ab.b[1] - ab.a[1], ab.b[0] - ab.a[0]);
        grupoDebiles.add(m);
        const aviso = cartel("!", "#FF2D20"); aviso.scale.set(0.6, 0.3, 1); aviso.position.set(m.position.x, desde + alto + 0.45, m.position.z);
        grupoDebiles.add(aviso);
        cuadro.push((t) => { m.material.opacity = 0.3 + 0.3 * (1 + Math.sin(t / 220)) / 2; });
      });
    }
    grupoDebiles.visible = vista.debiles;
    // ---- Simulación de un intruso ----
    let sim = null;
    const malla = (id) => grupoEquipos.children.find((c) => c.userData.equipo && c.userData.equipo.id === id);
    function pararSimulacion() {
      if (!sim) return;
      escena.remove(sim.figura);
      sim.figura.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
      sim.encendidos.forEach((m) => { m.material.emissive.setHex(m.userData.emisivoOriginal); });
      sim = null;
    }
    function simular(alEvento) {
      pararSimulacion();
      if (!an) return false;
      const r = an.recorrido();
      if (!r || r.puntos.length < 2) return false;
      const figura = new THREE.Group();
      const piel = new THREE.MeshLambertMaterial({ color: 0x2b2f33 });
      const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 1.2, 14), piel); cuerpo.position.y = 0.95; figura.add(cuerpo);
      const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), piel); cabeza.position.y = 1.72; figura.add(cabeza);
      const piernas = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.42, 12), piel); piernas.position.y = 0.21; figura.add(piernas);
      const sombra = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })); sombra.rotation.x = -Math.PI / 2; sombra.position.y = 0.015; figura.add(sombra);
      escena.add(figura);
      // Largo acumulado del recorrido, para avanzar a velocidad pareja.
      const acum = [0];
      for (let i = 1; i < r.puntos.length; i++) acum.push(acum[i - 1] + Math.hypot(r.puntos[i][0] - r.puntos[i - 1][0], r.puntos[i][1] - r.puntos[i - 1][1]));
      sim = { figura, r, acum, inicio: performance.now(), vistos: new Set(), encendidos: [], primera: null, alEvento: alEvento || (() => {}), fin: false };
      sim.alEvento({ tipo: "entra", entrada: r.entrada ? r.entrada.el : null, protegida: r.entrada ? !!r.entrada.protegida : null });
      return true;
    }
    const VELOCIDAD = window.CROQUIS_3D_VELOCIDAD || 1.8; // m/s (más rápido en las pruebas)
    cuadro.push((t) => {
      if (!sim || sim.fin) return;
      const seg = (t - sim.inicio) / 1000, d = seg * VELOCIDAD, { puntos } = sim.r, acum = sim.acum;
      let i = 1; while (i < acum.length - 1 && acum[i] < d) i++;
      const f = Math.min(1, Math.max(0, (d - acum[i - 1]) / ((acum[i] - acum[i - 1]) || 1)));
      const x = puntos[i - 1][0] + (puntos[i][0] - puntos[i - 1][0]) * f, z = puntos[i - 1][1] + (puntos[i][1] - puntos[i - 1][1]) * f;
      sim.figura.position.set(x, 0, z);
      sim.figura.rotation.y = -Math.atan2(puntos[i][1] - puntos[i - 1][1], puntos[i][0] - puntos[i - 1][0]);
      sim.figura.children[0].position.y = 0.95 + Math.abs(Math.sin(seg * 9)) * 0.04;
      // Quién lo detecta acá.
      const nuevos = an.detecta([x, z]).filter((e) => !sim.vistos.has(e.id));
      // Apertura: al pasar por una abertura con magnético.
      an.aberturas.forEach((ab) => {
        if (!ab.exterior || !ab.por || ab.por.tipo !== "magnetico" || sim.vistos.has(ab.por.id)) return;
        if (Math.hypot(ab.c[0] - x, ab.c[1] - z) < 0.5) nuevos.push(ab.por);
      });
      nuevos.forEach((e) => {
        sim.vistos.add(e.id);
        const m = malla(e.id);
        if (m) { if (m.userData.emisivoOriginal == null) m.userData.emisivoOriginal = m.material.emissive.getHex(); sim.encendidos.push(m); }
        if (sim.primera == null) {
          sim.primera = seg;
          // Suenan las sirenas.
          grupoEquipos.children.filter((c) => c.userData.equipo && /^sirena/.test(c.userData.equipo.tipo)).forEach((c) => { if (c.userData.emisivoOriginal == null) c.userData.emisivoOriginal = c.material.emissive.getHex(); sim.encendidos.push(c); });
        }
        sim.alEvento({ tipo: "detecta", equipo: e, segundos: seg });
      });
      const prende = Math.sin(t / 90) > 0;
      sim.encendidos.forEach((m) => m.material.emissive.setHex(prende ? 0xff0000 : 0x330000));
      if (d >= acum[acum.length - 1]) {
        sim.fin = true;
        sim.alEvento({ tipo: "fin", detectores: sim.vistos.size, primera: sim.primera, segundos: seg });
      }
    });
    // ---- Lo que ve una cámara ----
    let enCamara = null;
    function verCamara(id) {
      const m = malla(id);
      if (!m) return false;
      const e = m.userData.equipo;
      if (!enCamara) enCamara = { p: camara.position.clone(), t: controles.target.clone(), fov: camara.fov, bajas: vista.paredesBajas, cob: grupoCobertura.visible, carteles: grupoCarteles.visible, deb: grupoDebiles.visible };
      const giro = ((e.rot || 0) - 90) * Math.PI / 180, dir = [Math.cos(giro), Math.sin(giro)];
      if (vista.paredesBajas) { vista.paredesBajas = false; armarParedes(); }
      grupoCobertura.visible = false; grupoCarteles.visible = false; grupoDebiles.visible = false; m.visible = false;
      const h = m.position.y - 0.05;
      camara.position.set(m.position.x + dir[0] * 0.2, h, m.position.z + dir[1] * 0.2);
      // 80° de ancho; en el celular parado se limita para que no se deforme.
      const asp = ancho() / alto();
      camara.fov = Math.min(95, 2 * Math.atan(Math.tan(40 * Math.PI / 180) / asp) * 180 / Math.PI);
      camara.updateProjectionMatrix();
      controles.enabled = false;
      controles.target.set(m.position.x + dir[0] * 5, Math.max(0.3, h - 1.9), m.position.z + dir[1] * 5);
      camara.lookAt(controles.target);
      enCamara.malla = m;
      return true;
    }
    function salirCamara() {
      if (!enCamara) return;
      camara.position.copy(enCamara.p); controles.target.copy(enCamara.t); camara.fov = enCamara.fov; camara.updateProjectionMatrix();
      if (enCamara.bajas !== vista.paredesBajas) { vista.paredesBajas = enCamara.bajas; armarParedes(); }
      grupoCobertura.visible = enCamara.cob; grupoCarteles.visible = enCamara.carteles; grupoDebiles.visible = enCamara.deb; enCamara.malla.visible = true;
      controles.enabled = true; enCamara = null; controles.update();
    }
    let vivo = true, pedido = 0;
    function dibujar() {
      if (!vivo) return;
      const t = performance.now();
      cuadro.forEach((f) => f(t));
      if (enCamara) camara.lookAt(controles.target); else controles.update();
      renderer.render(escena, camara); pedido = requestAnimationFrame(dibujar);
    }
    dibujar();
    const ro = window.ResizeObserver ? new ResizeObserver(() => { renderer.setSize(ancho(), alto()); camara.aspect = ancho() / alto(); camara.updateProjectionMatrix(); }) : null;
    if (ro) ro.observe(contenedor);
    return {
      vista,
      alternar(que) {
        if (que === "cobertura") { vista.cobertura = !vista.cobertura; grupoCobertura.visible = vista.cobertura; }
        if (que === "paredes") { vista.paredesBajas = !vista.paredesBajas; armarParedes(); }
        if (que === "debiles") { vista.debiles = !vista.debiles; grupoDebiles.visible = vista.debiles; }
        if (que === "arriba" || que === "inicio") salirCamara();
        if (que === "arriba") vistaInicial(true);
        if (que === "inicio") vistaInicial(false);
        return vista;
      },
      analisis: an,
      simular, pararSimulacion,
      get simulando() { return !!(sim && !sim.fin); },
      verCamara, salirCamara,
      get enCamara() { return !!enCamara; },
      captura() { renderer.render(escena, camara); return renderer.domElement.toDataURL("image/png"); },
      // Punto del plano (unidades del croquis, a h metros) -> lugar en la pantalla.
      aPantalla(ux, uy, h) {
        const v = new THREE.Vector3(M(ux), h || 0, M(uy)).project(camara);
        const r = renderer.domElement.getBoundingClientRect();
        return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
      },
      estadoCamara() { return { p: camara.position.toArray(), t: controles.target.toArray() }; },
      // Resalta un equipo (por id) con un aro amarillo; null lo saca.
      marcar(id) {
        const m = id ? grupoEquipos.children.find((c) => c.userData.equipo && c.userData.equipo.id === id) : null;
        marca.visible = !!m;
        if (m) marca.position.set(m.position.x, 0.03, m.position.z);
      },
      escena,
      resumen: { equipos: grupoEquipos.children.filter((c) => c.userData.equipo).length, paredes: segmentos.length, coberturas: grupoCobertura.children.length },
      destruir() {
        pararSimulacion();
        vivo = false; cancelAnimationFrame(pedido); if (ro) ro.disconnect(); controles.dispose();
        lienzo.removeEventListener("pointerdown", alBajar); lienzo.removeEventListener("pointerup", alSubir);
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
  // ---- Análisis: qué parte de la casa cubren los sensores ----
  // Se divide el piso en celdas; una celda es "de adentro" si en las 8
  // direcciones choca con una pared (o abertura). Una celda está cubierta si
  // algún infrarrojo (o detector 360) la ve: dentro del alcance y del ángulo,
  // sin una pared en el medio. También se ven las aberturas que dan afuera y
  // si están protegidas, y se arman recorridos (para simular un intruso).
  const ALCANCE_360 = 6;
  function analizar(elementos) {
    const els = (elementos || []).filter(Boolean);
    const paredes = [];
    els.forEach((e) => {
      if (croquisEsCerco(e)) return;
      if (e.t === "linea") {
        if (Array.isArray(e.c)) {
          let prev = [M(e.x1), M(e.y1)];
          for (let i = 1; i <= 12; i++) { const t = i / 12, u = 1 - t; const q = [M(u * u * e.x1 + 2 * u * t * e.c[0] + t * t * e.x2), M(u * u * e.y1 + 2 * u * t * e.c[1] + t * t * e.y2)]; paredes.push([prev, q]); prev = q; }
        } else paredes.push([[M(e.x1), M(e.y1)], [M(e.x2), M(e.y2)]]);
      } else if (e.t === "rect" && (!e.forma || e.forma === "rect")) {
        const w = M(Math.abs(e.w)), h = M(Math.abs(e.h)), x = M(Math.min(e.x, e.x + e.w)), z = M(Math.min(e.y, e.y + e.h));
        if (w * h >= 1.5) { const q = [[x, z], [x + w, z], [x + w, z + h], [x, z + h]]; for (let i = 0; i < 4; i++) paredes.push([q[i], q[(i + 1) % 4]]); }
      }
    });
    if (paredes.length < 3) return null;
    const norm = (v) => { const n = Math.hypot(v[0], v[1]) || 1; return [v[0] / n, v[1] / n]; };
    const aberturas = els.filter((e) => e.t === "simbolo" && CROQUIS_ABERTURAS.includes(e.tipo)).map((e) => {
      const w2 = (CROQUIS_ANCHO_ABERTURA[e.tipo] || 40) / 2;
      const a = croquisLocalAMundo(e, -w2, 0), b = croquisLocalAMundo(e, w2, 0), c = croquisLocalAMundo(e, 0, 0), n = croquisLocalAMundo(e, 0, 40);
      return { el: e, a: [M(a[0]), M(a[1])], b: [M(b[0]), M(b[1])], c: [M(c[0]), M(c[1])], n: norm([n[0] - c[0], n[1] - c[1]]) };
    });
    // Los sensores ven a través de los pasos (vanos sin puerta).
    { const cortadas = cortarParedes(paredes, tramosAbertura(els, false)); paredes.length = 0; cortadas.forEach((x) => paredes.push(x)); }
    // Intersección de p-q con a-b: parámetro sobre p-q (o null).
    const corte = (p, q, a, b) => {
      const rx = q[0] - p[0], ry = q[1] - p[1], sx = b[0] - a[0], sy = b[1] - a[1];
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) return null;
      const t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / den, u = ((a[0] - p[0]) * ry - (a[1] - p[1]) * rx) / den;
      return t >= 0 && t <= 1 && u >= -0.001 && u <= 1.001 ? t : null;
    };
    const distSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    paredes.forEach(([a, b]) => { x0 = Math.min(x0, a[0], b[0]); y0 = Math.min(y0, a[1], b[1]); x1 = Math.max(x1, a[0], b[0]); y1 = Math.max(y1, a[1], b[1]); });
    const celda = (x1 - x0) * (y1 - y0) > 2500 ? 0.6 : 0.4;
    x0 -= celda; y0 -= celda; x1 += celda; y1 += celda;
    const nx = Math.ceil((x1 - x0) / celda), ny = Math.ceil((y1 - y0) / celda);
    const centro = (i, j) => [x0 + (i + 0.5) * celda, y0 + (j + 0.5) * celda];
    const indice = (p) => { const i = Math.floor((p[0] - x0) / celda), j = Math.floor((p[1] - y0) / celda); return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i; };
    const bloqueos = paredes.concat(aberturas.map((ab) => [ab.a, ab.b]));
    const largo = Math.hypot(x1 - x0, y1 - y0);
    const interior = new Uint8Array(nx * ny);
    const dirs8 = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)]);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const p = centro(i, j);
      interior[j * nx + i] = dirs8.every((d) => { const q = [p[0] + d[0] * largo, p[1] + d[1] * largo]; return bloqueos.some(([a, b]) => corte(p, q, a, b) !== null); }) ? 1 : 0;
    }
    // Sensores que cubren superficie.
    const sensores = els.filter((e) => e.t === "simbolo" && CROQUIS_SIMBOLOS[e.tipo] && (CROQUIS_SIMBOLOS[e.tipo].ir || e.tipo === "detector_360")).map((e) => {
      const def = CROQUIS_SIMBOLOS[e.tipo];
      const ap = croquisLocalAMundo(e, 0, 0);
      if (!def.ir) return { el: e, p: [M(e.x), M(e.y)], alc: ALCANCE_360, medio: 180, dir: [1, 0] };
      const { ang, doble } = croquisIRParams(e, def);
      const g = CROQUIS_IR_BIS * Math.PI / 180, w = croquisLocalAMundo(e, Math.cos(g) * 100, Math.sin(g) * 100);
      return { el: e, p: [M(ap[0]), M(ap[1])], alc: ALCANCE_REAL[e.tipo] || 10, medio: Math.min(179.5, (doble ? ang * 2 : ang) / 2), dir: norm([w[0] - ap[0], w[1] - ap[1]]) };
    });
    const ve = (s, q) => {
      const dx = q[0] - s.p[0], dy = q[1] - s.p[1], d = Math.hypot(dx, dy);
      if (d > s.alc) return false;
      if (d > 0.05 && s.medio < 179.5) {
        const cos = (dx * s.dir[0] + dy * s.dir[1]) / d;
        if (Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI > s.medio + 0.5) return false;
      }
      const t0 = d > 0 ? 0.15 / d : 1, t1 = d > 0 ? 1 - 0.03 / d : 1;
      return !paredes.some(([a, b]) => { const t = corte(s.p, q, a, b); return t !== null && t > t0 && t < t1; });
    };
    const detecta = (q) => sensores.filter((s) => ve(s, q)).map((s) => s.el);
    const cubierto = new Uint8Array(nx * ny);
    let nInt = 0, nCub = 0;
    for (let k = 0; k < nx * ny; k++) if (interior[k]) {
      nInt++;
      const q = centro(k % nx, Math.floor(k / nx));
      if (sensores.some((s) => ve(s, q))) { cubierto[k] = 1; nCub++; }
    }
    const esInterior = (q) => { const k = indice(q); return k >= 0 && !!interior[k]; };
    // Aberturas que dan afuera: ¿tienen sensor?
    const magneticos = els.filter((e) => e.t === "simbolo" && e.tipo === "magnetico").map((e) => ({ el: e, p: [M(e.x), M(e.y)] }));
    const vidrios = els.filter((e) => e.t === "simbolo" && e.tipo === "rotura_vidrio").map((e) => ({ el: e, p: [M(e.x), M(e.y)], alc: 6, medio: 180, dir: [1, 0] }));
    aberturas.forEach((ab) => {
      const lado1 = [ab.c[0] + ab.n[0] * 0.6, ab.c[1] + ab.n[1] * 0.6], lado2 = [ab.c[0] - ab.n[0] * 0.6, ab.c[1] - ab.n[1] * 0.6];
      const i1 = esInterior(lado1), i2 = esInterior(lado2);
      ab.exterior = i1 !== i2;
      ab.adentro = i1 ? ab.n : [-ab.n[0], -ab.n[1]];
      if (!ab.exterior) return;
      const dentro = i1 ? lado1 : lado2;
      const mag = magneticos.find((m) => distSeg(m.p, ab.a, ab.b) < 1.2);
      const vid = ab.el.tipo !== "puerta" && !ab.el.tipo.startsWith("porton") ? vidrios.find((v) => ve(v, dentro)) : null;
      const ir = detecta(dentro)[0];
      ab.protegida = !!(mag || vid || ir);
      ab.por = mag ? mag.el : vid ? vid.el : ir || null;
    });
    // Moverse de una celda a la vecina: no se cruza una pared, salvo por una abertura.
    const pasa = (p, q) => !paredes.some(([a, b]) => {
      const t = corte(p, q, a, b);
      if (t === null) return false;
      const x = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      return !aberturas.some((ab) => distSeg(x, ab.a, ab.b) < 0.2);
    });
    const vecinos = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    function bfs(desde) {
      const dist = new Int32Array(nx * ny).fill(-1), padre = new Int32Array(nx * ny).fill(-1);
      const cola = [desde]; dist[desde] = 0;
      for (let h = 0; h < cola.length; h++) {
        const k = cola[h], i = k % nx, j = Math.floor(k / nx), p = centro(i, j);
        vecinos.forEach(([di, dj]) => {
          const ii = i + di, jj = j + dj, kk = jj * nx + ii;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny || !interior[kk] || dist[kk] >= 0) return;
          if (!pasa(p, centro(ii, jj))) return;
          dist[kk] = dist[k] + 1; padre[kk] = k; cola.push(kk);
        });
      }
      return { dist, padre };
    }
    const camino = (padre, hasta) => { const r = []; for (let k = hasta; k >= 0; k = padre[k]) r.push(k); return r.reverse(); };
    // Recorrido de un intruso: entra por una abertura que da afuera (la que
    // no tiene sensor, si hay) y recorre la casa hasta lo más lejos.
    function recorrido() {
      const ext = aberturas.filter((ab) => ab.exterior);
      const entrada = ext.find((ab) => !ab.protegida && ab.el.tipo !== "ventana") || ext.find((ab) => !ab.protegida) || ext.find((ab) => ab.el.tipo === "puerta") || ext[0];
      let ini, puntos = [];
      if (entrada) {
        const afuera = [entrada.c[0] - entrada.adentro[0] * 1.8, entrada.c[1] - entrada.adentro[1] * 1.8];
        const adentro = [entrada.c[0] + entrada.adentro[0] * 0.5, entrada.c[1] + entrada.adentro[1] * 0.5];
        ini = indice(adentro);
        if (ini < 0 || !interior[ini]) { let mejor = -1, md = Infinity; for (let k = 0; k < nx * ny; k++) if (interior[k]) { const q = centro(k % nx, Math.floor(k / nx)), d = Math.hypot(q[0] - adentro[0], q[1] - adentro[1]); if (d < md) { md = d; mejor = k; } } ini = mejor; }
        puntos = [afuera, entrada.c];
      } else {
        for (let k = 0; k < nx * ny && ini == null; k++) if (interior[k]) ini = k;
        if (ini == null) return null;
        const q = centro(ini % nx, Math.floor(ini / nx));
        puntos = [[q[0], y0 - 1]];
      }
      if (ini == null || ini < 0) return null;
      const visitado = [ini];
      let actual = ini;
      for (let tramo = 0; tramo < 3; tramo++) {
        const { dist, padre } = bfs(actual);
        // El más lejos de todo lo ya recorrido (así pasa por otros ambientes).
        let mejor = -1, md = 0;
        for (let k = 0; k < nx * ny; k++) if (dist[k] > 0) {
          const q = centro(k % nx, Math.floor(k / nx));
          let m = Infinity;
          for (let v = 0; v < visitado.length; v += 3) { const w = centro(visitado[v] % nx, Math.floor(visitado[v] / nx)); m = Math.min(m, Math.hypot(q[0] - w[0], q[1] - w[1])); }
          if (m > md) { md = m; mejor = k; }
        }
        if (mejor < 0 || md < 2) break;
        const c = camino(padre, mejor);
        c.slice(1).forEach((k) => visitado.push(k));
        actual = mejor;
      }
      visitado.forEach((k) => puntos.push(centro(k % nx, Math.floor(k / nx))));
      return { puntos, entrada: entrada || null };
    }
    return {
      celda, x0, y0, nx, ny, interior, cubierto, centro, aberturas, sensores, detecta, recorrido,
      porcentaje: nInt ? Math.round(100 * nCub / nInt) : null,
      aberturasSinProteger: aberturas.filter((ab) => ab.exterior && !ab.protegida),
    };
  }
  // ---- Ubicar un equipo nuevo (o movido) donde se tocó en el 3D ----
  // Un infrarrojo o una cámara va a la esquina más cercana mirando hacia el
  // ambiente (si no hay esquina cerca, contra la pared); lo que va en la
  // pared se apoya en la pared; lo del techo queda donde se tocó.
  function ubicar(el, punto, elementos) {
    const def = CROQUIS_SIMBOLOS[el.tipo] || {};
    const p3 = EQUIPOS[el.tipo] || {};
    const segs = [];
    (elementos || []).forEach((e) => {
      if (e.id === el.id || croquisEsCerco(e)) return;
      if (e.t === "linea") segs.push([[e.x1, e.y1], [e.x2, e.y2]]);
      else if (e.t === "rect" && (!e.forma || e.forma === "rect") && Math.abs(e.w * e.h) >= 1.5 * CROQUIS_POR_METRO * CROQUIS_POR_METRO) {
        const x = Math.min(e.x, e.x + e.w), y = Math.min(e.y, e.y + e.h), w = Math.abs(e.w), h = Math.abs(e.h);
        const q = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
        for (let i = 0; i < 4; i++) segs.push([q[i], q[(i + 1) % 4]]);
      }
    });
    const [px, py] = punto;
    const cruza = (a, b, c, d) => {
      const o1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]), o2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
      const o3 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]), o4 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
      return o1 * o2 < -1e-6 && o3 * o4 < -1e-6;
    };
    const visible = (c) => !segs.some(([a, b]) => cruza([px, py], c, a, b));
    const grados = (dx, dy) => Math.atan2(dy, dx) * 180 / Math.PI;
    const norm = (v) => { const n = Math.hypot(v[0], v[1]) || 1; return [v[0] / n, v[1] / n]; };
    const pared = () => {
      let m = null;
      segs.forEach(([a, b]) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2));
        const qx = a[0] + t * dx, qy = a[1] + t * dy, d = Math.hypot(px - qx, py - qy);
        if ((!m || d < m.d) && visible([qx + (px - qx) * 0.02, qy + (py - qy) * 0.02])) m = { d, x: qx, y: qy, ang: grados(dx, dy), n: norm([px - qx, py - qy]) };
      });
      return m;
    };
    if (def.ir || p3.camara && !p3.disco) {
      const giro = def.ir ? 135 : 90; // rot = dirección + giro (bisectriz del sensor / frente de la cámara)
      // Esquinas: puntas de pared con dos paredes que se juntan.
      // Esquinas: donde se juntan, se tocan (T) o se cruzan dos paredes; de cada
      // una salen las direcciones de las paredes que llegan ahí.
      const puntas = new Map();
      const agregar = (c, dir) => {
        const k = Math.round(c[0] / 4) + "," + Math.round(c[1] / 4);
        if (!puntas.has(k)) puntas.set(k, { c, dirs: [] });
        puntas.get(k).dirs.push(norm(dir));
      };
      for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
        const [a1, a2] = segs[i], [b1, b2] = segs[j];
        const rx = a2[0] - a1[0], ry = a2[1] - a1[1], sx = b2[0] - b1[0], sy = b2[1] - b1[1];
        const den = rx * sy - ry * sx, La = Math.hypot(rx, ry), Lb = Math.hypot(sx, sy);
        if (Math.abs(den) < 1e-6 || La < 1 || Lb < 1) continue;
        const t = ((b1[0] - a1[0]) * sy - (b1[1] - a1[1]) * sx) / den, u = ((b1[0] - a1[0]) * ry - (b1[1] - a1[1]) * rx) / den;
        if (t < -4 / La || t > 1 + 4 / La || u < -4 / Lb || u > 1 + 4 / Lb) continue;
        const q = [a1[0] + t * rx, a1[1] + t * ry];
        [a1, a2, b1, b2].forEach((f) => { if (Math.hypot(f[0] - q[0], f[1] - q[1]) > 4) agregar(q, [f[0] - q[0], f[1] - q[1]]); });
      }
      let mejor = null;
      puntas.forEach(({ c, dirs }) => {
        const d = Math.hypot(px - c[0], py - c[1]);
        if (d > 2.5 * CROQUIS_POR_METRO || (mejor && d >= mejor.d)) return;
        const hacia = norm([px - c[0], py - c[1]]);
        const dentro = [c[0] + hacia[0] * 4, c[1] + hacia[1] * 4];
        if (!visible(dentro)) return;
        // Bisectriz entre las dos paredes que encierran el lado tocado.
        let bis = null, mejorCos = -2;
        for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) {
          const b = norm([dirs[i][0] + dirs[j][0], dirs[i][1] + dirs[j][1]]);
          if (Math.hypot(dirs[i][0] + dirs[j][0], dirs[i][1] + dirs[j][1]) < 0.1) continue;
          const cos = b[0] * hacia[0] + b[1] * hacia[1];
          // Que la bisectriz entre en el mismo ambiente que se tocó.
          if (cos > mejorCos && visible([c[0] + b[0] * 20, c[1] + b[1] * 20])) { mejorCos = cos; bis = b; }
        }
        if (!bis || mejorCos < 0.2) return;
        mejor = { d, c, bis };
      });
      if (mejor) {
        el.x = Math.round(mejor.c[0]); el.y = Math.round(mejor.c[1]);
        el.rot = Math.round(grados(mejor.bis[0], mejor.bis[1]) + giro); delete el.esp;
        return el;
      }
      const w = pared();
      if (w && w.d < 1.5 * CROQUIS_POR_METRO) {
        el.x = Math.round(w.x + w.n[0] * 3); el.y = Math.round(w.y + w.n[1] * 3);
        el.rot = Math.round(grados(w.n[0], w.n[1]) + giro); delete el.esp;
        return el;
      }
      el.x = Math.round(px); el.y = Math.round(py);
      return el;
    }
    if (p3.pared || (!p3.disco && !EQUIPOS[el.tipo])) {
      const w = pared();
      if (w && w.d < 1.2 * CROQUIS_POR_METRO) {
        el.x = Math.round(w.x + w.n[0] * 6); el.y = Math.round(w.y + w.n[1] * 6);
        el.rot = Math.round(w.ang);
        return el;
      }
    }
    el.x = Math.round(px); el.y = Math.round(py);
    return el;
  }
  return { crear, cargar, disponible, ubicar, analizar };
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
.v3-raiz .hidden{display:none!important}
.v3-capa{position:fixed;inset:0;z-index:9000}
.v3-lienzo{position:fixed;inset:0}
.v3-cab{position:fixed;z-index:2;top:0;left:0;right:0;display:flex;gap:10px;align-items:center;padding:10px 14px;background:linear-gradient(var(--bg) 60%,transparent);pointer-events:none}
.v3-cab img{height:34px;border-radius:6px;pointer-events:auto}
.v3-cab b{display:block;font-size:16px;line-height:1.2}.v3-cab small{display:block;font-size:12.5px;color:var(--tenue)}
.v3-pie{position:fixed;z-index:3;left:50%;transform:translateX(-50%);bottom:10px;width:calc(100% - 20px);max-width:620px;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none}
.v3-pie>*{pointer-events:auto}
.v3-barra,.v3-props{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.v3-barra button,.v3-props button{font:600 14px inherit;font-family:inherit;padding:10px 12px;border-radius:12px;border:1px solid var(--bd);background:var(--sup);color:var(--fg);box-shadow:0 2px 8px rgba(0,0,0,.15);cursor:pointer}
.v3-barra button.on,.v3-props button.on{background:var(--ac);color:#1C1E21;border-color:#D4A017}
.v3-barra button.v3-fuerte{background:#1C1E21;color:#fff;border-color:#1C1E21}
.v3-barra button:disabled{opacity:.45}
.v3-props button small{font-weight:500;opacity:.8}
.v3-ley{position:fixed;z-index:2;color:var(--fg);right:10px;top:62px;max-width:min(270px,calc(100% - 20px));background:var(--sup);border:1px solid var(--bd);border-radius:12px;padding:10px 12px;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,.12)}
.v3-ley summary{font-weight:700;cursor:pointer}
.v3-ley ul{margin:6px 0 0;padding:0;list-style:none}.v3-ley li{display:flex;align-items:center;gap:8px;margin:4px 0}
.v3-ley i{width:14px;height:14px;border-radius:3px;display:inline-block;flex:none;border:1px solid rgba(0,0,0,.25)}
.v3-ley i.v3-rayado{background:repeating-linear-gradient(135deg,#F6B544 0 3px,#FFE3AE 3px 6px)}
.v3-ley .v3-nota{color:var(--tenue);font-size:12px;margin:6px 0 0}
.v3-ley .v3-cubre{font-weight:700;margin:2px 0 4px}.v3-ley .v3-mal{color:#C0392B;font-weight:700}
.v3-pags{position:fixed;z-index:2;left:10px;top:62px;display:flex;flex-direction:column;gap:6px}
.v3-pags button{font:600 13px inherit;font-family:inherit;padding:7px 10px;border-radius:10px;border:1px solid var(--bd);background:var(--sup);color:var(--fg)}
.v3-pags button.on{background:var(--ac);color:#1C1E21}
.v3-aviso{max-width:100%;background:#1C1E21;color:#fff;padding:8px 14px;border-radius:12px;font-size:13.5px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.25)}
.v3-aviso.v3-alarma{background:#C0392B}
.v3-hoja{width:100%;max-width:520px;max-height:55vh;overflow-y:auto;background:var(--sup);color:var(--fg);border:1px solid var(--bd);border-radius:16px;padding:12px;box-shadow:0 6px 24px rgba(0,0,0,.25);font-size:14px}
.v3-hoja b{display:block;margin-bottom:8px;font-size:15px}
.v3-hoja .v3-nota{color:var(--tenue);font-size:12.5px;margin:-4px 0 8px}
.v3-hoja p{margin:0 0 8px;line-height:1.4}
.v3-hoja input,.v3-hoja textarea{width:100%;font:15px inherit;font-family:inherit;padding:10px;border-radius:10px;border:1px solid var(--bd);background:var(--bg);color:var(--fg);margin:0 0 8px}
.v3-paleta{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.v3-paleta button,.v3-acciones button{display:flex;gap:8px;align-items:center;font:600 13.5px inherit;font-family:inherit;padding:10px;border-radius:10px;border:1px solid var(--bd);background:var(--bg);color:var(--fg);text-align:left;cursor:pointer}
.v3-paleta i{width:14px;height:14px;border-radius:3px;flex:none;border:1px solid rgba(0,0,0,.3)}
.v3-acciones{display:flex;flex-wrap:wrap;gap:6px}.v3-acciones button{justify-content:center;flex:1 1 auto}
.v3-acciones button.on{background:var(--ac);color:#1C1E21}.v3-acciones .v3-peligro{color:#C0392B;border-color:#C0392B}
.v3-acciones button.v3-primario{background:#1C1E21;color:#fff;border-color:#1C1E21}
.v3-link{display:block;margin:10px auto 0;background:none;border:0;color:var(--tenue);font:600 14px inherit;font-family:inherit;text-decoration:underline;cursor:pointer}
@media (max-width:480px){.v3-barra,.v3-props{gap:4px}.v3-barra button,.v3-props button{padding:9px 9px;font-size:13px}}
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
// Equipos que se pueden agregar tocando en el 3D (en este orden).
const CROQUIS_3D_PALETA = ["infrarrojo", "infrarrojo_ext", "infrarrojo_cortina", "magnetico", "humo", "rotura_vidrio", "detector_360", "sirena_int", "sirena_ext", "teclado", "central", "pulsador_asalto", "camara_ip", "camara_domo"];
const CROQUIS_3D_CON_ZONA = ["infrarrojo", "infrarrojo_ext", "infrarrojo_cortina", "magnetico", "humo", "gas", "rotura_vidrio", "detector_360", "pulsador_asalto", "pulsador_incendio"];
// Pitido corto (detección) — solo si el navegador lo permite.
let croquis3dAudio = null;
function croquis3dPitido(frec, dur) {
  try {
    croquis3dAudio = croquis3dAudio || new (window.AudioContext || window.webkitAudioContext)();
    const o = croquis3dAudio.createOscillator(), g = croquis3dAudio.createGain();
    o.type = "square"; o.frequency.value = frec || 880; g.gain.value = 0.04;
    o.connect(g); g.connect(croquis3dAudio.destination);
    o.start(); o.stop(croquis3dAudio.currentTime + (dur || 0.12));
  } catch (e) { /* sin sonido */ }
}
// opciones: contenedor, botonCerrar, alCerrar, extras [{texto, alHacer}],
//   edicion { alCambiar(indicePagina, elementos), marcarInst },
//   debiles (mostrar puntos débiles al abrir), llamar(datos) -> Promise (botón
//   "Quiero que me llamen"), paraCaptura.
function iniciarVisor3D(datos, opciones) {
  const o = opciones || {};
  const d = datos || {};
  const ed = o.edicion || null;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  if (!document.getElementById("v3-estilo")) { const st = document.createElement("style"); st.id = "v3-estilo"; st.textContent = CROQUIS_3D_ESTILO; document.head.appendChild(st); }
  const raiz = o.contenedor || document.body;
  raiz.classList.add("v3-raiz");
  if (!o.contenedor) document.documentElement.classList.add("v3-pagina");
  const limpiarPaginas = (pp) => JSON.parse(JSON.stringify(Array.isArray(pp) ? pp : []))
    .map((p, i) => ({ ...p, idx: p.idx != null ? p.idx : i, elementos: p.elementos || [] }))
    .filter((p) => p.elementos.length);
  // Una o varias propuestas (para comparar). Cada una con sus plantas.
  const propuestas = (Array.isArray(d.propuestas) && d.propuestas.length ? d.propuestas : [{ nombre: "", paginas: d.paginas && d.paginas.length ? d.paginas : [{ nombre: "", elementos: d.elementos || [] }] }])
    .map((pr) => ({ nombre: String(pr.nombre || ""), paginas: limpiarPaginas(pr.paginas) }))
    .filter((pr) => pr.paginas.length);
  if (!propuestas.length) { raiz.innerHTML = `<div class="v3-error">Este plano no tiene nada para mostrar en 3D.</div>`; return null; }
  let prop = 0, pag = 0;
  let paginas = propuestas[0].paginas;
  const titulo = d.titulo || "Tu sistema de seguridad";
  const nombreDe = (tipo) => (CROQUIS_3D_LEYENDA[tipo] || [(CROQUIS_SIMBOLOS[tipo] || {}).nombre || tipo])[0];
  const zonaDe = (e) => (e && e.etq ? " (zona " + e.etq + ")" : "");
  // Para usar dentro de una frase: "el sensor de movimiento de la zona 2".
  const enFrase = (e) => nombreDe(e.tipo).replace(/\s*\(.*?\)/g, "").toLowerCase() + (e.etq ? " de la zona " + e.etq : "");
  raiz.insertAdjacentHTML("beforeend", `
    <div class="v3-lienzo"></div>
    <div class="v3-cab">${d.logo ? `<img src="${d.logo}" alt="">` : ""}<div><b>${esc(titulo)}</b><small>${esc([d.cliente, d.empresa ? "Propuesta de " + d.empresa : ""].filter(Boolean).join(" · "))}</small></div></div>
    <div class="v3-pags hidden"></div>
    <details class="v3-ley" ${window.innerWidth > 700 ? "open" : ""}></details>
    <div class="v3-pie"><div class="v3-aviso hidden"></div><div class="v3-hoja hidden"></div><div class="v3-props hidden"></div><div class="v3-barra"></div></div>`);
  const lienzo = raiz.querySelector(".v3-lienzo"), ley = raiz.querySelector(".v3-ley"), barra = raiz.querySelector(".v3-barra"), aviso = raiz.querySelector(".v3-aviso"), hoja = raiz.querySelector(".v3-hoja"), propsEl = raiz.querySelector(".v3-props"), pagsEl = raiz.querySelector(".v3-pags");
  let editando = false, sel = null, moviendo = null, visor = null, debiles = !!o.debiles, avisoTimer = null;
  const pila = [];
  // % cubierto de cada propuesta (de todas sus plantas juntas).
  const cobertura = (pr) => {
    let suma = 0, n = 0, abiertas = 0;
    pr.paginas.forEach((p) => { const a = Croquis3D.analizar(p.elementos); if (a && a.porcentaje != null) { suma += a.porcentaje; n++; abiertas += a.aberturasSinProteger.length; } });
    return n ? { pct: Math.round(suma / n), abiertas } : null;
  };
  const pintarProps = () => {
    propsEl.classList.toggle("hidden", propuestas.length < 2 || editando);
    propsEl.innerHTML = propuestas.map((pr, i) => { const c = cobertura(pr); return `<button type="button" data-prop="${i}" class="${i === prop ? "on" : ""}">${esc(pr.nombre || "Propuesta " + (i + 1))}${c ? ` <small>· ${c.pct}%</small>` : ""}</button>`; }).join("");
  };
  const pintarPags = () => {
    pagsEl.classList.toggle("hidden", paginas.length < 2);
    pagsEl.innerHTML = paginas.map((p, i) => `<button type="button" data-pag="${i}" class="${i === pag ? "on" : ""}">${esc(p.nombre || "Planta " + (i + 1))}</button>`).join("");
  };
  const pintarLeyenda = () => {
    const todos = paginas.flatMap((p) => p.elementos);
    const cuenta = {};
    todos.filter((e) => e.t === "simbolo" && CROQUIS_3D_LEYENDA[e.tipo] && !e.prev).forEach((e) => {
      const k = CROQUIS_3D_LEYENDA[e.tipo][0];
      cuenta[k] = cuenta[k] || { n: 0, color: CROQUIS_3D_LEYENDA[e.tipo][1] };
      cuenta[k].n++;
    });
    const an = visor && visor.analisis;
    const abiertas = an ? an.aberturasSinProteger.length : 0;
    const abierto = ley.open;
    ley.innerHTML = `<summary>Qué se instala</summary>
      ${an && an.porcentaje != null ? `<p class="v3-cubre">Cubre el ${an.porcentaje}% de ${paginas.length > 1 ? "esta planta" : "la casa"}</p>` : ""}
      ${abiertas ? `<p class="v3-mal">${abiertas === 1 ? "1 abertura que da afuera no tiene sensor" : abiertas + " aberturas que dan afuera no tienen sensor"}</p>` : ""}
      <ul>${Object.entries(cuenta).map(([k, v]) => `<li><i style="background:${v.color}"></i>${v.n} × ${esc(k)}</li>`).join("")}
      <li><i style="background:rgba(224,0,0,.35)"></i>Zona que cubre cada sensor</li>
      ${an && an.porcentaje != null && an.porcentaje < 100 ? `<li><i class="v3-rayado"></i>Sin cubrir (con «Puntos débiles»)</li>` : ""}</ul>
      ${todos.some((e) => e.inst) ? `<p class="v3-nota">Con aro naranja: lo que se agrega.</p>` : ""}${todos.some((e) => e.prev) ? `<p class="v3-nota">Atenuado: lo que ya está instalado.</p>` : ""}
      <p class="v3-nota">Arrastrá para girar · dos dedos para acercar · tocá una cámara para ver lo que ve.</p>`;
    ley.open = abierto;
  };
  const pintarBarra = () => {
    const v = visor ? visor.vista : {};
    if (visor && visor.enCamara) { barra.innerHTML = `<button type="button" data-a="salircam" class="v3-fuerte">Salir de la cámara</button>`; return; }
    barra.innerHTML = editando
      ? `<button type="button" data-a="deshacer" ${pila.length ? "" : "disabled"}>Deshacer</button><button type="button" data-a="cobertura" class="${v.cobertura === false ? "" : "on"}">Coberturas</button><button type="button" data-a="debiles" class="${debiles ? "on" : ""}">Puntos débiles</button><button type="button" data-a="listo" class="on">Listo</button>`
      : `<button type="button" data-a="cobertura" class="${v.cobertura === false ? "" : "on"}">Coberturas</button><button type="button" data-a="debiles" class="${debiles ? "on" : ""}">Puntos débiles</button><button type="button" data-a="simular">${visor && visor.simulando ? "Parar" : "Simular intruso"}</button><button type="button" data-a="vista">Vista ▾</button>${ed ? `<button type="button" data-a="editar">Editar</button>` : ""}${o.llamar ? `<button type="button" data-a="llamar" class="v3-fuerte">Quiero que me llamen</button>` : ""}${(o.extras || []).map((x, i) => `<button type="button" data-extra="${i}">${esc(x.texto)}</button>`).join("")}${o.botonCerrar ? `<button type="button" data-a="cerrar">Cerrar</button>` : ""}`;
  };
  const decir = (t, alarma, segundos) => {
    clearTimeout(avisoTimer);
    aviso.textContent = t || ""; aviso.classList.toggle("hidden", !t); aviso.classList.toggle("v3-alarma", !!alarma);
    if (t && segundos) avisoTimer = setTimeout(() => decir(editando ? textoEdicion() : ""), segundos * 1000);
  };
  const textoEdicion = () => (moviendo ? "Tocá dónde va " + nombreDe(moviendo.tipo).toLowerCase() + "." : "Tocá un ambiente para agregar un equipo, o un equipo para cambiarlo.");
  const armar = (mantenerCamara) => {
    const v = visor ? visor.vista : {};
    const cam = mantenerCamara && visor && !visor.enCamara ? visor.estadoCamara() : null;
    if (visor) visor.destruir();
    visor = Croquis3D.crear(lienzo, paginas[pag].elementos, { paraCaptura: o.paraCaptura, paredesBajas: v.paredesBajas, cobertura: v.cobertura, debiles, camaraInicial: cam, alTocar: tocar });
    if (sel) visor.marcar(sel.id);
  };
  const cerrarHoja = () => { hoja.classList.add("hidden"); hoja.innerHTML = ""; hoja.onclick = null; sel = null; if (visor) visor.marcar(null); };
  const todo = () => { armar(true); pintarLeyenda(); pintarBarra(); pintarProps(); };
  const cambiar = (fn) => {
    pila.push({ pag, els: JSON.stringify(paginas[pag].elementos) });
    if (pila.length > 60) pila.shift();
    fn(paginas[pag].elementos);
    todo();
    ed.alCambiar(paginas[pag].idx, JSON.parse(JSON.stringify(paginas[pag].elementos)));
  };
  const siguienteZona = () => {
    let max = 0;
    paginas.forEach((p) => p.elementos.forEach((e) => { const n = parseInt(String(e.etq || "").replace(/\D/g, ""), 10); if (e.t === "simbolo" && n > max && n < 1000) max = n; }));
    return String(max + 1);
  };
  const idNuevo = () => "v3" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esCamara = (e) => e && /^camara/.test(e.tipo);
  function verCamara(e) {
    if (visor.simulando) { /* se sigue viendo al intruso desde la cámara */ }
    if (!visor.verCamara(e.id)) return;
    cerrarHoja(); pintarBarra();
    ley.classList.add("hidden");
    decir("Lo que ve la cámara" + zonaDe(e) + ". Tocá «Salir de la cámara» para volver.");
  }
  function salirCamara() { visor.salirCamara(); if (!editando) ley.classList.remove("hidden"); decir(editando ? textoEdicion() : ""); pintarBarra(); }
  function hojaPaleta(punto) {
    sel = null; visor.marcar(null);
    hoja.innerHTML = `<b>¿Qué agregás acá?</b><div class="v3-paleta">${CROQUIS_3D_PALETA.filter((t) => CROQUIS_SIMBOLOS[t]).map((t) => `<button type="button" data-tipo="${t}"><i style="background:${(CROQUIS_3D_LEYENDA[t] || [0, CROQUIS_SIMBOLOS[t].color])[1]}"></i>${esc(nombreDe(t))}</button>`).join("")}</div><button type="button" class="v3-link" data-h="cancelar">Cancelar</button>`;
    hoja.classList.remove("hidden");
    hoja.onclick = (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.h === "cancelar") { cerrarHoja(); return; }
      const tipo = b.dataset.tipo; if (!tipo) return;
      const el = { id: idNuevo(), t: "simbolo", tipo, x: 0, y: 0, rot: 0, esc: 1 };
      if (CROQUIS_3D_CON_ZONA.includes(tipo)) el.etq = siguienteZona();
      if (ed.marcarInst) el.inst = true;
      cerrarHoja();
      cambiar((els) => { Croquis3D.ubicar(el, punto, els); els.push(el); });
      hojaEquipo(el);
    };
  }
  function hojaEquipo(e) {
    sel = paginas[pag].elementos.find((x) => x.id === e.id) || null;
    if (!sel) { cerrarHoja(); return; }
    visor.marcar(sel.id);
    const def = CROQUIS_SIMBOLOS[sel.tipo] || {};
    hoja.innerHTML = `<b>${esc(nombreDe(sel.tipo))}${sel.etq ? " · zona " + esc(sel.etq) : ""}</b>${sel.prev ? `<p class="v3-nota">Ya estaba instalado.</p>` : ""}
      <div class="v3-acciones"><button type="button" data-h="girar">Girar</button><button type="button" data-h="mover">Mover</button><button type="button" data-h="zona">Zona</button>${sel.prev ? "" : `<button type="button" data-h="inst" class="${sel.inst ? "on" : ""}">A instalar</button>`}${esCamara(sel) ? `<button type="button" data-h="vercam">Ver lo que ve</button>` : ""}<button type="button" data-h="sacar" class="v3-peligro">Sacar</button></div>
      <button type="button" class="v3-link" data-h="cerrar">Cerrar</button>`;
    hoja.classList.remove("hidden");
    hoja.onclick = (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      const id = sel && sel.id;
      const con = (fn) => cambiar((els) => { const x = els.find((y) => y.id === id); if (x) fn(x, els); });
      const h = b.dataset.h;
      if (h === "cerrar") { cerrarHoja(); return; }
      if (h === "girar") { con((x) => { x.rot = (((x.rot || 0) + (def.ir || esCamara(x) ? 45 : 90)) % 360 + 360) % 360; }); hojaEquipo({ id }); }
      if (h === "inst") { con((x) => { if (x.inst) delete x.inst; else x.inst = true; }); hojaEquipo({ id }); }
      if (h === "zona") {
        const nuevo = prompt("Número de zona (vacío = sin número):", sel.etq || "");
        if (nuevo == null) return;
        con((x) => { const t = String(nuevo).trim().slice(0, 8); if (t) x.etq = t; else delete x.etq; });
        hojaEquipo({ id });
      }
      if (h === "vercam") verCamara(sel);
      if (h === "mover") { moviendo = sel; hoja.classList.add("hidden"); decir(textoEdicion()); }
      if (h === "sacar") { con((x, els) => { els.splice(els.indexOf(x), 1); }); cerrarHoja(); }
    };
  }
  function tocar({ equipo, punto }) {
    if (visor.enCamara) return;
    if (!editando) {
      if (!equipo) return;
      if (esCamara(equipo)) { verCamara(equipo); return; }
      decir(nombreDe(equipo.tipo) + zonaDe(equipo) + (equipo.prev ? " · ya instalado" : equipo.inst ? " · a instalar" : ""), false, 3);
      return;
    }
    if (moviendo) {
      if (!punto) return;
      const id = moviendo.id; moviendo = null; decir(textoEdicion());
      cambiar((els) => { const x = els.find((y) => y.id === id); if (x) Croquis3D.ubicar(x, punto, els); });
      hojaEquipo({ id });
      return;
    }
    if (equipo) { hojaEquipo(equipo); return; }
    if (punto) hojaPaleta(punto);
  }
  // ---- Simulación ----
  function simular() {
    cerrarHoja();
    if (visor.simulando) { visor.pararSimulacion(); decir(""); pintarBarra(); return; }
    let primera = null;
    const ok = visor.simular((ev) => {
      if (ev.tipo === "entra") {
        const por = ev.entrada ? (ev.entrada.tipo === "ventana" ? "una ventana" : ev.entrada.tipo.startsWith("porton") ? "el portón" : ev.entrada.tipo === "paso" ? "una abertura" : "una puerta") : "afuera";
        decir("Un intruso entra por " + por + (ev.protegida === false ? " que no tiene sensor…" : "…"));
      }
      if (ev.tipo === "detecta") {
        if (primera == null) { primera = ev; croquis3dPitido(660, 0.5); setTimeout(() => croquis3dPitido(880, 0.5), 520); } else croquis3dPitido(880, 0.1);
        decir("¡Lo detectó el " + enFrase(ev.equipo) + "! (a los " + ev.segundos.toFixed(1).replace(".", ",") + " s)", true);
      }
      if (ev.tipo === "fin") {
        pintarBarra();
        hoja.innerHTML = primera
          ? `<b>Resultado de la simulación</b><p>Lo detectó el <strong>${esc(enFrase(primera.equipo))}</strong> a los <strong>${primera.segundos.toFixed(1).replace(".", ",")} segundos</strong> de entrar, y sonó la alarma.</p><p>En el recorrido lo detectaron ${ev.detectores} ${ev.detectores === 1 ? "sensor" : "sensores"}.</p>`
          : `<b>Resultado de la simulación</b><p class="v3-mal" style="color:#C0392B;font-weight:700">Recorrió la casa sin que lo detecte ningún sensor.</p><p>Revisá los puntos débiles (rayado naranja) y agregá sensores donde haga falta.</p>`;
        hoja.innerHTML += `<div class="v3-acciones"><button type="button" data-h="otra" class="v3-primario">Repetir</button></div><button type="button" class="v3-link" data-h="cerrar">Cerrar</button>`;
        hoja.classList.remove("hidden");
        decir("");
        hoja.onclick = (e2) => { const b = e2.target.closest("button"); if (!b) return; if (b.dataset.h === "otra") simular(); else { cerrarHoja(); visor.pararSimulacion(); } };
      }
    });
    if (!ok) { decir("Para simular hacen falta las paredes de la casa.", false, 3); return; }
    pintarBarra();
  }
  // ---- Vista ▾ ----
  function hojaVista() {
    const v = visor.vista;
    hoja.innerHTML = `<b>Vista</b><div class="v3-acciones"><button type="button" data-h="paredes" class="${v.paredesBajas ? "on" : ""}">Ver adentro (paredes bajas)</button><button type="button" data-h="arriba">Desde arriba</button><button type="button" data-h="inicio">Vista inicial</button></div><button type="button" class="v3-link" data-h="cerrar">Cerrar</button>`;
    hoja.classList.remove("hidden");
    hoja.onclick = (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      const h = b.dataset.h;
      if (h !== "cerrar") visor.alternar(h);
      cerrarHoja();
    };
  }
  // ---- Quiero que me llamen ----
  function hojaLlamar() {
    hoja.innerHTML = `<b>¿Te llamamos?</b><p>Dejanos tu teléfono y te contactamos para charlar la propuesta.</p>
      <input type="tel" inputmode="tel" autocomplete="tel" placeholder="Teléfono" class="v3-tel">
      <textarea rows="2" placeholder="Comentario (opcional)" class="v3-msj"></textarea>
      <div class="v3-acciones"><button type="button" data-h="enviar" class="v3-primario">Enviar</button></div><button type="button" class="v3-link" data-h="cerrar">Cancelar</button>`;
    hoja.classList.remove("hidden");
    hoja.querySelector(".v3-tel").focus();
    hoja.onclick = async (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.h === "cerrar") { cerrarHoja(); return; }
      if (b.dataset.h !== "enviar") return;
      const telefono = hoja.querySelector(".v3-tel").value.trim(), mensaje = hoja.querySelector(".v3-msj").value.trim();
      if (telefono.replace(/\D/g, "").length < 6) { hoja.querySelector(".v3-tel").focus(); decir("Poné un teléfono para que te podamos llamar.", false, 3); return; }
      b.disabled = true; b.textContent = "Enviando…";
      try {
        await o.llamar({ telefono, mensaje, propuesta: propuestas.length > 1 ? propuestas[prop].nombre || "Propuesta " + (prop + 1) : "" });
        hoja.innerHTML = `<b>¡Listo!</b><p>Recibimos tu pedido. Te vamos a llamar a la brevedad.</p><button type="button" class="v3-link" data-h="cerrar">Cerrar</button>`;
      } catch (e) {
        b.disabled = false; b.textContent = "Enviar";
        decir(e && e.message ? e.message : "No se pudo enviar. Revisá la conexión.", false, 4);
      }
    };
  }
  armar(false); pintarLeyenda(); pintarBarra(); pintarProps(); pintarPags();
  pagsEl.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-pag]"); if (!b) return;
    pag = Number(b.dataset.pag); moviendo = null; cerrarHoja(); armar(false); pintarLeyenda(); pintarPags(); pintarBarra();
    decir(editando ? textoEdicion() : "");
  });
  propsEl.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-prop]"); if (!b) return;
    prop = Number(b.dataset.prop); paginas = propuestas[prop].paginas; pag = Math.min(pag, paginas.length - 1);
    cerrarHoja(); decir(""); armar(true);
    pintarLeyenda(); pintarProps(); pintarPags(); pintarBarra();
  });
  barra.addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.extra != null) { const x = o.extras[Number(b.dataset.extra)]; if (x && x.alHacer) x.alHacer(); return; }
    const a = b.dataset.a;
    if (a === "cerrar") { if (o.alCerrar) o.alCerrar(); return; }
    if (a === "salircam") { salirCamara(); return; }
    if (a === "simular") { simular(); return; }
    if (a === "vista") { hojaVista(); return; }
    if (a === "llamar") { hojaLlamar(); return; }
    if (a === "debiles") { debiles = !debiles; visor.alternar("debiles"); b.classList.toggle("on", debiles); return; }
    if (a === "editar") { visor.pararSimulacion(); editando = true; ley.classList.add("hidden"); if (!visor.vista.paredesBajas) visor.alternar("paredes"); cerrarHoja(); pintarBarra(); pintarProps(); decir(textoEdicion()); return; }
    if (a === "listo") { editando = false; moviendo = null; ley.classList.remove("hidden"); cerrarHoja(); decir(""); pintarBarra(); pintarProps(); return; }
    if (a === "deshacer") {
      const u = pila.pop(); if (!u) return;
      moviendo = null; cerrarHoja();
      paginas[u.pag].elementos = JSON.parse(u.els);
      if (u.pag !== pag) { pag = u.pag; pintarPags(); armar(false); } else armar(true);
      pintarLeyenda(); pintarBarra(); pintarProps();
      ed.alCambiar(paginas[pag].idx, JSON.parse(JSON.stringify(paginas[pag].elementos)));
      return;
    }
    const v = visor.alternar(a);
    if (a === "cobertura") b.classList.toggle("on", v.cobertura);
  });
  return { destruir() { visor.destruir(); raiz.innerHTML = ""; }, captura() { return visor.captura(); }, get visor() { return visor; }, get paginas() { return paginas; } };
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
<script>(function(){var d=${json};if(!Croquis3D.disponible()){document.body.innerHTML="<p style='font:16px system-ui;padding:30px;text-align:center'>Este navegador no puede mostrar 3D. Abrí el archivo con Chrome o Safari.</p>";return;}
var op={};
if(d.id&&d.servidor){try{fetch(d.servidor+"/api/datos?publico=vista3d&id="+d.id).catch(function(){});}catch(e){}
op.llamar=function(p){return fetch(d.servidor+"/api/datos?publico=vista3d_llamar",{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify(Object.assign({id:d.id},p))}).then(function(r){return r.json().then(function(x){if(!r.ok)throw new Error(x.error||"No se pudo enviar");return x;});},function(){throw new Error("Sin conexión: escribinos por WhatsApp.");});};}
iniciarVisor3D(d,op);})();<\/script>
</body></html>`;
}
if (typeof window !== "undefined") window.croquis3dHtmlIndependiente = croquis3dHtmlIndependiente;
