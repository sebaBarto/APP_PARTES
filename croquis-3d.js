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
  const distSegM = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
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
    lector_acceso: { h: 1.3, caja: [0.05, 0.09, 0.02], color: "#2B2F33", pared: true },
    cerradura: { h: 1.0, caja: [0.03, 0.2, 0.03], color: "#BFC3C8", pared: true },
    cerradura_magnetica: { h: 2.02, caja: [0.25, 0.045, 0.07], color: "#BFC3C8", pared: true },
    boton_salida: { h: 1.2, caja: [0.09, 0.09, 0.03], color: "#FFFFFF", pared: true },
    videoportero: { h: 1.5, caja: [0.1, 0.18, 0.03], color: "#2B2F33", pared: true },
    comunicador: { h: 1.7, caja: [0.12, 0.1, 0.04], color: "#E6E6E6", pared: true },
    energizador: { h: 1.6, caja: [0.2, 0.25, 0.08], color: "#F2C94C", pared: true },
    reflector: { h: 2.6, caja: [0.2, 0.14, 0.08], color: "#2B2F33", pared: true, luz: true },
    monoxido: { h: 1.5, caja: [0.12, 0.12, 0.04], color: "#FFFFFF", pared: true },
    control_remoto: { h: 1.0, caja: [0.035, 0.06, 0.012], color: "#2B2F33" },
    modulo_rele: { h: 1.6, caja: [0.08, 0.06, 0.03], color: "#FFFFFF", pared: true },
    camara_solar: { h: 2.8, caja: [0.12, 0.12, 0.2], color: "#F4F4F4", camara: true },
    panico_colgante: { h: 1.0, caja: [0.035, 0.047, 0.016], color: "#FFFFFF" },
    fuente_ups: { h: 0.5, caja: [0.25, 0.3, 0.09], color: "#BFC3C8", pared: true },
    sismico: { h: 0.8, caja: [0.08, 0.06, 0.03], color: "#8E949A", pared: true },
    inundacion: { h: 0.012, caja: [0.056, 0.014, 0.056], color: "#FFFFFF" },
    vibracion: { h: 1.2, caja: [0.06, 0.04, 0.02], color: "#FFFFFF", pared: true },
  };
  const COLOR_PARED = "#E9E5DC", COLOR_PISO = "#C9C2B5";
  // Los equipos se dibujan más grandes que en la realidad para que se vean.
  const AUMENTO = 2.2;
  const COLOR_CAMARA = "#1593B5";
  // Alcance real de cada sensor (m): el del croquis es solo el tamaño del dibujo.
  // ---- Muebles en 3D ----
  // Partes de cada mueble en coordenadas del símbolo (unidades del croquis,
  // centradas): [x, y, ancho, prof, desde (m), hasta (m), color, forma, giro°].
  // Con estas mismas cajas se calcula qué le tapan a los sensores y cámaras.
  const MADERA = "#B98C5A", BLANCO = "#ECEBE6", TELA = "#8E949A", OSCURO = "#3B4046", ACERO = "#C9CED3", VIDRIO = "vidrio";
  const silla = (x, y, g) => [[x, y, 14, 13, 0, 0.47, MADERA, "", g, 0, 0.5], [x, y, 14, 3.5, 0.47, 0.92, MADERA, "", g, 0, -4.8]];
  const cama = (w) => [[0, 2, w, 76, 0, 0.5, BLANCO], [0, -38.5, w, 3, 0, 1.0, MADERA]];
  const sillon = (w) => [[0, 4.5, w, 25, 0, 0.42, TELA], [0, -12.5, w, 9, 0, 0.85, TELA], [-w / 2 + 4, 4.5, 8, 25, 0, 0.62, TELA], [w / 2 - 4, 4.5, 8, 25, 0, 0.62, TELA]];
  const MUEBLES_3D = {
    sillon: sillon(80), sillon_1: sillon(34), silla: silla(0, 0, 0),
    mesa_rect: [[0, 0, 60, 36, 0.72, 0.76, MADERA], ...[[-27, -15], [27, -15], [-27, 15], [27, 15]].map(([x, y]) => [x, y, 3, 3, 0, 0.72, MADERA]), ...[[-14, -27, 0], [14, -27, 0], [-14, 27, 180], [14, 27, 180], [-39, 0, 270], [39, 0, 90]].flatMap(([x, y, g]) => silla(x, y, g))],
    mesa_redonda: [[0, 0, 44, 44, 0.72, 0.76, MADERA, "c"], [0, 0, 6, 6, 0, 0.72, MADERA, "c"], ...[0, 90, 180, 270].flatMap((g) => { const a = (g - 90) * Math.PI / 180; return silla(Math.cos(a) * 31, Math.sin(a) * 31, g); })],
    cama_doble: cama(64), cama_simple: cama(36),
    ropero: [[0, 0, 60, 22, 0, 2.2, MADERA]],
    escritorio: [[0, 0, 56, 28, 0.72, 0.76, MADERA], [-26, 0, 4, 28, 0, 0.72, MADERA], [26, 0, 4, 28, 0, 0.72, MADERA], ...silla(0, 22, 180)],
    tv: [[0, 0, 44, 3, 0.75, 1.35, OSCURO]],
    ducha: [[0, 0, 36, 36, 0, 0.05, BLANCO], [0, 17.5, 36, 1, 0, 2.0, VIDRIO], [17.5, 0, 1, 36, 0, 2.0, VIDRIO]],
    banera: [[0, 0, 70, 32, 0, 0.55, BLANCO]],
    inodoro: [[0, -13, 22, 8, 0, 0.8, BLANCO], [0, 3, 18, 24, 0, 0.42, BLANCO, "c"]],
    lavatorio: [[0, 0, 26, 20, 0, 0.85, BLANCO]],
    mesada: [[0, 0, 80, 24, 0, 0.86, MADERA], [0, 0, 80, 24, 0.86, 0.9, "#5B5F66"]],
    anafe: [[0, 0, 28, 28, 0, 0.9, ACERO]],
    heladera: [[0, 0, 28, 30, 0, 1.8, "#E3E6E9"]],
    mesa_luz: [[0, 0, 14, 14, 0, 0.55, MADERA]],
    mesa_ratona: [[0, 0, 40, 22, 0, 0.42, MADERA]],
    rack_tv: [[0, 0, 60, 16, 0, 0.55, MADERA], [0, -2, 44, 3, 0.6, 1.2, OSCURO]],
    pileta_lavadero: [[0, 0, 28, 24, 0, 0.85, BLANCO]],
    termotanque: [[0, 0, 24, 24, 0, 1.5, BLANCO, "c"]],
    aire_split: [[0, 0, 44, 12, 2.0, 2.3, BLANCO]],
    estufa: [[0, 0, 32, 18, 0, 0.75, OSCURO]],
    parrilla: [[0, 0, 48, 28, 0, 0.95, "#9A6B4F"]],
    lavarropas: [[0, 0, 28, 28, 0, 0.85, BLANCO]],
    arbol: [[0, 0, 12, 12, 0, 2.4, "#6B4F3A", "c"], [0, 0, 112, 112, 1.9, 5.2, "#4E8F45", "esfera"]],
    arbusto: [[0, 0, 40, 40, 0, 1.2, "#4E8F45", "esfera"]],
    cantero: [[0, 0, 60, 24, 0, 0.45, "#B08A64"], ...[-20, -7, 7, 20].map((x, i) => [x, i % 2 ? 2 : -2, 15, 15, 0.42, 0.95, "#3F8F4A", "esfera"])],
  };
  // Cada parte, en metros: centro, esquinas (en el plano), alturas y giro.
  function partesMueble(e) {
    return (MUEBLES_3D[e.tipo] || []).map(([px, py, w, d, desde, hasta, color, forma, g, ox, oy]) => {
      const ga = (g || 0) * Math.PI / 180, rot = (x, y) => [x * Math.cos(ga) - y * Math.sin(ga), x * Math.sin(ga) + y * Math.cos(ga)];
      const [cx, cy] = ((o) => [px + o[0], py + o[1]])(rot(ox || 0, oy || 0));
      const esquinas = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, y]) => { const r = rot(x, y), m = croquisLocalAMundo(e, cx + r[0], cy + r[1]); return [M(m[0]), M(m[1])]; });
      const c = croquisLocalAMundo(e, cx, cy);
      return { e, c: [M(c[0]), M(c[1])], w: M(w * (e.esc || 1)), d: M(d * (e.esc || 1)), desde, hasta, color, forma, giro: ((e.rot || 0) + (e.esp ? -(g || 0) : (g || 0))) * Math.PI / 180, esquinas };
    });
  }
  // Hojas de un portón (o puerta) entre A y B (metros): el corredizo, una hoja
  // cerrada; el batiente, dos hojas entreabiertas hacia el lado del arco.
  let texPorton = null;
  function hojasPorton(e, A, B, alto, grupo, marca) {
    if (!texPorton) {
      const cv = document.createElement("canvas"); cv.width = 64; cv.height = 64;
      const g2 = cv.getContext("2d"); g2.fillStyle = "rgba(59,64,70,0.25)"; g2.fillRect(0, 0, 64, 64); g2.strokeStyle = "#2b2f33"; g2.lineWidth = 6;
      g2.strokeRect(0, 0, 64, 64); for (let x = 8; x < 64; x += 12) { g2.beginPath(); g2.moveTo(x, 0); g2.lineTo(x, 64); g2.stroke(); }
      texPorton = new THREE.CanvasTexture(cv); texPorton.wrapS = THREE.RepeatWrapping;
    }
    const hoja = (P, Q) => {
      const l = Math.hypot(Q[0] - P[0], Q[1] - P[1]); if (l < 0.05) return;
      const tx = texPorton.clone(); tx.needsUpdate = true; tx.repeat.set(Math.max(1, Math.round(l / 0.6)), 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(l, alto), new THREE.MeshLambertMaterial({ map: tx, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      m.position.set((P[0] + Q[0]) / 2, alto / 2, (P[1] + Q[1]) / 2); m.rotation.y = -Math.atan2(Q[1] - P[1], Q[0] - P[0]);
      const marco = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(l, alto, 0.04)), new THREE.LineBasicMaterial({ color: 0x2b2f33 }));
      marco.position.copy(m.position); marco.rotation.copy(m.rotation);
      [m, marco].forEach((x) => { if (marca) Object.assign(x.userData, marca); grupo.add(x); });
    };
    if (e.tipo === "porton_batiente") {
      // Hacia dónde abren: el lado del arco del símbolo.
      const c = croquisLocalAMundo(e, 0, 0), n0 = croquisLocalAMundo(e, 0, -40);
      const n = [M(n0[0] - c[0]), M(n0[1] - c[1])], nl = Math.hypot(n[0], n[1]) || 1, u = [(B[0] - A[0]), (B[1] - A[1])], L = Math.hypot(u[0], u[1]) || 1;
      const ux = u[0] / L, uy = u[1] / L, nx = n[0] / nl, ny = n[1] / nl, a = 0.42, w = L / 2;
      hoja(A, [A[0] + (ux * Math.cos(a) + nx * Math.sin(a)) * w, A[1] + (uy * Math.cos(a) + ny * Math.sin(a)) * w]);
      hoja(B, [B[0] + (-ux * Math.cos(a) + nx * Math.sin(a)) * w, B[1] + (-uy * Math.cos(a) + ny * Math.sin(a)) * w]);
    } else hoja(A, B);
  }
  // Semicubierto (galería, sector techado): techo fino sobre columnas, sin
  // paredes. Balcón: baranda de caño y vidrio, sin techo.
  function armarCierre(e, g) {
    const w = M(Math.abs(e.w)), h = M(Math.abs(e.h)), x = M(Math.min(e.x, e.x + e.w)), z = M(Math.min(e.y, e.y + e.h));
    if (e.cierre === "semi") {
      const techo = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.12, h + 0.2), new THREE.MeshLambertMaterial({ color: 0xb9a58a, transparent: true, opacity: 0.55, depthWrite: false }));
      techo.position.set(x + w / 2, ALTO - 0.06, z + h / 2); techo.userData.techo = true; g.add(techo);
      const borde = new THREE.LineSegments(new THREE.EdgesGeometry(techo.geometry), new THREE.LineBasicMaterial({ color: 0x8a6a4a }));
      borde.position.copy(techo.position); borde.userData.techo = true; g.add(borde);
      // Columnas en las esquinas y, en los lados largos, cada 3 m como mucho.
      const nx = Math.max(1, Math.ceil(w / 3)), nz = Math.max(1, Math.ceil(h / 3)), pts = [];
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) if (i === 0 || j === 0 || i === nx || j === nz) pts.push([x + w * i / nx, z + h * j / nz]);
      pts.forEach(([px, pz]) => { const c = new THREE.Mesh(new THREE.BoxGeometry(0.15, ALTO - 0.12, 0.15), new THREE.MeshLambertMaterial({ color: 0xd8d2c8 })); c.position.set(px, (ALTO - 0.12) / 2, pz); g.add(c); });
      // El piso de la galería, un poco distinto (si no se eligió el suelo).
      if (e.suelo) return;
      const piso = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: 0xd9cdb8 }));
      piso.rotation.x = -Math.PI / 2; piso.position.set(x + w / 2, 0.008, z + h / 2); g.add(piso);
    } else if (e.cierre === "balcon") {
      const p = [[x, z], [x + w, z], [x + w, z + h], [x, z + h]];
      for (let i = 0; i < 4; i++) {
        const a = p[i], b = p[(i + 1) % 4], l = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = -Math.atan2(b[1] - a[1], b[0] - a[0]);
        const vidrio = new THREE.Mesh(new THREE.BoxGeometry(l, 0.9, 0.02), new THREE.MeshLambertMaterial({ color: 0x9cc7e0, transparent: true, opacity: 0.35, depthWrite: false }));
        vidrio.position.set((a[0] + b[0]) / 2, 0.5, (a[1] + b[1]) / 2); vidrio.rotation.y = ang; g.add(vidrio);
        const cano = new THREE.Mesh(new THREE.BoxGeometry(l, 0.05, 0.06), new THREE.MeshLambertMaterial({ color: 0x5b5f66 }));
        cano.position.set((a[0] + b[0]) / 2, 1.0, (a[1] + b[1]) / 2); cano.rotation.y = ang; g.add(cano);
      }
      if (e.suelo) return;
      const piso = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: 0xcfc6b8 }));
      piso.rotation.x = -Math.PI / 2; piso.position.set(x + w / 2, 0.008, z + h / 2); g.add(piso);
    }
  }
  // Suelo de un sector: césped o piso de baldosas (texturas dibujadas acá).
  const texSuelo = {};
  function texturaSuelo(tipo) {
    if (texSuelo[tipo]) return texSuelo[tipo];
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    if (tipo === "cesped") {
      g.fillStyle = "#6FAE5E"; g.fillRect(0, 0, 128, 128);
      let sem = 7;
      const azar = () => { sem = (sem * 9301 + 49297) % 233280; return sem / 233280; };
      for (let i = 0; i < 900; i++) { g.strokeStyle = azar() > 0.5 ? "rgba(60,120,50,0.55)" : "rgba(150,200,110,0.5)"; const x = azar() * 128, y = azar() * 128; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (azar() - 0.5) * 3, y - 2 - azar() * 4); g.stroke(); }
    } else {
      g.fillStyle = "#D6CCBC"; g.fillRect(0, 0, 128, 128);
      g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(6, 6, 50, 50); g.fillRect(70, 70, 50, 50);
      g.strokeStyle = "#9C907C"; g.lineWidth = 5; g.strokeRect(0, 0, 128, 128);
    }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texSuelo[tipo] = t;
    return t;
  }
  function armarSuelo(e, g) {
    const w = M(Math.abs(e.w)), h = M(Math.abs(e.h)), x = M(Math.min(e.x, e.x + e.w)), z = M(Math.min(e.y, e.y + e.h));
    if (e.suelo === "pileta") {
      // Pileta: borde de piedra y el agua un poco más abajo, que brilla.
      const borde = 0.2;
      [[x, z, w, borde], [x, z + h - borde, w, borde], [x, z, borde, h], [x + w - borde, z, borde, h]].forEach(([bx, bz, bw, bh]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.06, bh), new THREE.MeshLambertMaterial({ color: 0xe8e2d6 })); m.position.set(bx + bw / 2, 0.03, bz + bh / 2); g.add(m);
      });
      const agua = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.1, w - borde * 2), Math.max(0.1, h - borde * 2)), new THREE.MeshPhongMaterial({ color: 0x4aa8de, shininess: 90, specular: 0xffffff, transparent: true, opacity: 0.9 }));
      agua.rotation.x = -Math.PI / 2; agua.position.set(x + w / 2, 0.015, z + h / 2); agua.userData.agua = true; g.add(agua);
      return;
    }
    if (e.suelo !== "cesped" && e.suelo !== "piso") return;
    const t = texturaSuelo(e.suelo).clone(); t.needsUpdate = true;
    const lado = e.suelo === "cesped" ? 1.5 : 0.5; // una baldosa de 50 cm
    t.repeat.set(w / lado, h / lado);
    const geo = e.forma === "elipse" ? new THREE.CircleGeometry(0.5, 40) : new THREE.PlaneGeometry(1, 1);
    // Un poco "hacia atrás" en profundidad: la cobertura y las capas se dibujan encima sin parpadear.
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: t }));
    m.rotation.x = -Math.PI / 2; m.scale.set(w, h, 1); m.position.set(x + w / 2, 0.01, z + h / 2);
    if (e.forma && e.forma !== "rect" && e.forma !== "elipse") return;
    g.add(m);
  }
  function armarMuebles(els, padre) {
    const g = new THREE.Group();
    els.filter((e) => e.t === "simbolo" && MUEBLES_3D[e.tipo]).forEach((e) => partesMueble(e).forEach((p) => {
      const h = Math.max(0.01, p.hasta - p.desde);
      const geo = p.forma === "c" ? new THREE.CylinderGeometry(p.w / 2, p.w / 2, h, 20) : p.forma === "esfera" ? new THREE.SphereGeometry(p.w / 2, 14, 10) : new THREE.BoxGeometry(p.w, h, p.d);
      const mat = p.color === VIDRIO ? new THREE.MeshLambertMaterial({ color: 0x9cc7e0, transparent: true, opacity: 0.35, depthWrite: false }) : new THREE.MeshLambertMaterial({ color: p.color });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.c[0], p.desde + h / 2, p.c[1]); m.rotation.y = -p.giro; m.userData.mueble = e;
      if (p.forma === "esfera") m.scale.y = h / p.w;
      g.add(m);
    }));
    padre.add(g);
    return g;
  }
  const ALTO_CUERPO_3D = 1.0;
  const ALCANCE_REAL = { infrarrojo: 11, infrarrojo_ext: 12, infrarrojo_cortina: 10, doble_tecnologia: 12 };

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
  // Banda en el piso entre dos arcos (el de adentro puede no estar: desde el vértice).
  function anillo(apice, dentro, fuera, y, color, opacidad) {
    const pos = [];
    for (let i = 0; i < fuera.length - 1; i++) {
      const a0 = dentro ? dentro[i] : apice, a1 = dentro ? dentro[i + 1] : apice, b0 = fuera[i], b1 = fuera[i + 1];
      pos.push(a0[0], y, a0[1], b0[0], y, b0[1], b1[0], y, b1[1], a0[0], y, a0[1], b1[0], y, b1[1], a1[0], y, a1[1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacidad, side: THREE.DoubleSide, depthWrite: false }));
  }
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

  // Barrera infrarroja: dos columnas que se miran, con los haces entre ellas.
  function puntasBarrera(e) { const a = croquisLocalAMundo(e, -57, 0), b = croquisLocalAMundo(e, 57, 0); return [[M(a[0]), M(a[1])], [M(b[0]), M(b[1])]]; }
  function armarBarrera(e, fant) {
    const [a, b] = puntasBarrera(e);
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x2b2f33, transparent: !!fant || !!e.prev, opacity: fant ? 0.7 : e.prev ? 0.35 : 1, emissive: fant ? 0x443300 : e.inst ? 0x331100 : 0 });
    [a, b].forEach((p) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), mat); col.position.set(p[0], 0.55, p[1]); g.add(col);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), new THREE.MeshLambertMaterial({ color: 0xd23b34 })); cab.position.set(p[0], 1.14, p[1]); g.add(cab);
    });
    [0.35, 0.65, 0.95].forEach((y) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], y, a[1]), new THREE.Vector3(b[0], y, b[1])]);
      const l = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: fant ? 0xf2a900 : 0xff2020, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.85 }));
      l.computeLineDistances(); g.add(l);
    });
    g.userData.equipo = e;
    g.children.forEach((c) => { c.userData.equipo = e; });
    const obj = g.children[0];
    let cartelZona = null, aro = null;
    if (String(e.etq || "").trim()) { cartelZona = cartel(String(e.etq).trim(), e.inst ? "#E8741E" : "#E00000"); cartelZona.position.set(a[0], 1.5, a[1]); cartelZona.userData.equipo = e; }
    if (e.inst && !fant) { aro = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.24, 24), new THREE.MeshBasicMaterial({ color: 0xe8741e, side: THREE.DoubleSide })); aro.rotation.x = -Math.PI / 2; aro.position.set(a[0], 0.02, a[1]); aro.userData.de = e; }
    return { obj: g, cobertura: null, cartel: cartelZona, aro, _obj: obj };
  }
  // Un equipo en 3D: la pieza, su cobertura (infrarrojo o cámara), el cartel
  // con la zona y el aro naranja si se instala. segmentos: paredes (m).
  function armarEquipo(e, segmentos, opc) {
    const op = opc || {};
    const pt = (x, y) => [M(x), M(y)];
    const def = CROQUIS_SIMBOLOS[e.tipo];
    const p3 = EQUIPOS[e.tipo] || { h: 1.5, caja: [0.12, 0.12, 0.06], color: e.color || def.color, pared: true };
    // Las cámaras van en color (en blanco no se distinguían de la pared).
    const color = def.ir ? (e.color || def.color) : p3.camara ? COLOR_CAMARA : (p3.color || e.color || def.color);
    const fant = op.fantasma; // vista previa (mientras se arrastra)
    if (e.tipo === "barrera") return armarBarrera(e, fant);
    const mat = new THREE.MeshLambertMaterial({ color, transparent: !!e.prev || !!fant, opacity: fant ? 0.75 : e.prev ? 0.35 : 1, emissive: fant ? 0x443300 : e.inst ? 0x553300 : p3.camara ? 0x06303a : 0x000000 });
    let x, z, h = p3.h, obj, cobertura = null;
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
      cobertura = sector([x, z], h, arco, 0.045, fant ? 0xf2a900 : e.tipo === "infrarrojo" ? 0xe00000 : 0x7b4b94, fant ? 0.16 : e.prev ? 0.05 : 0.11);
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
        // Bandas en el piso: identifica (verde oscuro), reconoce (verde), observa (amarillo) y detecta (celeste).
        const d = croquisCamaraDori(e), ang = p3.disco ? 359 : d.fov, giro = ((e.rot || 0) - 90) * Math.PI / 180, n = Math.max(26, Math.round(ang / 3));
        const arcoA = (r) => { const a = []; for (let i = 0; i <= n; i++) { const g = giro - (ang / 2) * Math.PI / 180 + (ang * Math.PI / 180) * i / n; a.push(rayo([x, z], [Math.cos(g), Math.sin(g)], r, segmentos)); } return a; };
        const tope = Math.min(d.detecta, 30);
        if (fant || e.prev) cobertura = sector([x, z], h, arcoA(tope), 0.045, fant ? 0xf2a900 : 0x2e86de, fant ? 0.12 : 0.04);
        else {
          cobertura = new THREE.Group();
          const bandas = [[0, d.identifica, 0x1e8449, 0.42], [d.identifica, d.reconoce, 0x27ae60, 0.3], [d.reconoce, d.observa, 0xe6b800, 0.24], [d.observa, tope, 0x2e86de, 0.14]];
          bandas.forEach(([r0, r1, color, op]) => { if (r1 > r0) cobertura.add(anillo([x, z], r0 ? arcoA(r0) : null, arcoA(Math.min(r1, tope)), 0.03, color, op)); });
          // El abanico de la vista (sin relleno en el piso).
          const ab = sector([x, z], h, arcoA(tope), 0.045, 0x2e86de, 0.05); ab.children[1].visible = false; cobertura.add(ab);
          cobertura.userData.cobertura = true;
        }
      }
    }
    obj.userData.equipo = e;
    if (cobertura) cobertura.userData.de = e;
    let cartelZona = null, aro = null;
    const etq = String(e.etq || "").trim();
    if (etq) {
      cartelZona = cartel(etq, e.inst ? "#E8741E" : color);
      cartelZona.position.set(obj.position.x, Math.min(ALTO + 0.35, h + 0.3), obj.position.z);
      cartelZona.material.opacity = e.prev ? 0.5 : 1;
      cartelZona.userData.equipo = e;
    }
    if (p3.camara && !fant && !e.inst) {
      // Cámara: aro de su color en el piso y un poste fino, para ubicarla de un vistazo.
      aro = new THREE.Group();
      const r = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 28), new THREE.MeshBasicMaterial({ color: COLOR_CAMARA, side: THREE.DoubleSide, transparent: true, opacity: e.prev ? 0.35 : 0.9 }));
      r.rotation.x = -Math.PI / 2; r.position.set(obj.position.x, 0.055, obj.position.z); r.userData.de = e; aro.add(r);
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, Math.max(0.1, obj.position.y - 0.1), 6), new THREE.MeshBasicMaterial({ color: COLOR_CAMARA, transparent: true, opacity: 0.45 }));
      poste.position.set(obj.position.x, (obj.position.y - 0.1) / 2, obj.position.z); aro.add(poste);
    }
    if (e.inst && !fant) {
      // A instalar: aro naranja en el piso debajo.
      aro = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.24, 24), new THREE.MeshBasicMaterial({ color: 0xe8741e, side: THREE.DoubleSide }));
      aro.rotation.x = -Math.PI / 2; aro.position.set(obj.position.x, 0.02, obj.position.z); aro.userData.de = e;
    }
    return { obj, cobertura, cartel: cartelZona, aro };
  }
  // El intruso de la simulación: un ladrón de historieta (traje a rayas
  // blancas y negras, antifaz, gorro y bolsa), mirando hacia +x.
  function armarLadron() {
    const g = new THREE.Group(), cuerpo = new THREE.Group();
    g.add(cuerpo);
    const negro = new THREE.MeshLambertMaterial({ color: 0x1c1e21 }), piel = new THREE.MeshLambertMaterial({ color: 0xf1c27d }), blanco = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 64;
    const c = cv.getContext("2d");
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? "#FFFFFF" : "#1C1E21"; c.fillRect(0, i * 8, 8, 8); }
    const rayas = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(cv) });
    const cvB = document.createElement("canvas"); cvB.width = 8; cvB.height = 24;
    const cb = cvB.getContext("2d");
    for (let i = 0; i < 3; i++) { cb.fillStyle = i % 2 ? "#FFFFFF" : "#1C1E21"; cb.fillRect(0, i * 8, 8, 8); }
    const rayasBrazo = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(cvB) });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.62, 18), rayas); torso.position.y = 1.12; cuerpo.add(torso);
    const cadera = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.14, 18), negro); cadera.position.y = 0.76; cuerpo.add(cadera);
    const piernas = [-0.1, 0.1].map((zz) => {
      const p = new THREE.Group(); p.position.set(0, 0.72, zz);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.66, 10), negro); m.position.y = -0.33; p.add(m);
      const zap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.12), negro); zap.position.set(0.05, -0.68, 0); p.add(zap);
      g.add(p); return p;
    });
    const brazos = [-0.26, 0.26].map((zz) => {
      const p = new THREE.Group(); p.position.set(0, 1.38, zz);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.52, 10), rayasBrazo); m.position.y = -0.26; p.add(m);
      const mano = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), piel); mano.position.y = -0.55; p.add(mano);
      cuerpo.add(p); return p;
    });
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), piel); cabeza.position.y = 1.62; cuerpo.add(cabeza);
    const gorro = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), negro); gorro.position.y = 1.66; cuerpo.add(gorro);
    const pompon = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), negro); pompon.position.y = 1.86; cuerpo.add(pompon);
    // Antifaz: una banda negra con los ojos blancos adelante.
    const antifaz = new THREE.Mesh(new THREE.CylinderGeometry(0.178, 0.178, 0.075, 24, 1, true), new THREE.MeshLambertMaterial({ color: 0x1c1e21, side: THREE.DoubleSide })); antifaz.position.y = 1.635; cuerpo.add(antifaz);
    [-0.065, 0.065].forEach((zz) => {
      const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), blanco); ojo.position.set(0.162, 1.635, zz); cuerpo.add(ojo);
      const pupila = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), negro); pupila.position.set(0.19, 1.635, zz); cuerpo.add(pupila);
    });
    const nariz = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), piel); nariz.position.set(0.17, 1.58, 0); cuerpo.add(nariz);
    // Bolsa del botín, colgando en la espalda.
    const bolsa = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), new THREE.MeshLambertMaterial({ color: 0xc8a96e })); bolsa.scale.set(0.9, 1.1, 0.9); bolsa.position.set(-0.3, 1.22, 0); cuerpo.add(bolsa);
    const nudo = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.1, 8), new THREE.MeshLambertMaterial({ color: 0xa88a52 })); nudo.position.set(-0.3, 1.46, 0); cuerpo.add(nudo);
    const sombra = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })); sombra.rotation.x = -Math.PI / 2; sombra.position.y = 0.015; g.add(sombra);
    g.scale.setScalar(1.2); // un poco más grande, para que se vea desde lejos
    g.userData = { piernas, brazos, cuerpo };
    return g;
  }
  // ---- Pisos de la casa ----
  const LOSA = 0.2, ALTO_NIVEL = ALTO + LOSA; // un piso arriba del otro
  // Escaleras: escalones macizos que suben hasta el piso de arriba.
  function armarEscaleras(els, padre) {
    const mat = new THREE.MeshLambertMaterial({ color: "#C9B79C" });
    els.filter((e) => e.t === "simbolo" && CROQUIS_ESCALERA_CAJA[e.tipo]).forEach((e) => {
      const esc = e.esc || 1, rot = -((e.rot || 0) * Math.PI / 180);
      const pasos = []; // [lx, ly, ancho (x), largo (y), alto]
      const tramo = (x0, x1, yDesde, yHasta, n, h0, h1) => { for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; pasos.push([(x0 + x1) / 2, yDesde + (yHasta - yDesde) * t, Math.abs(x1 - x0), Math.abs(yHasta - yDesde) / n, h0 + (h1 - h0) * (i + 1) / n]); } };
      const H = ALTO_NIVEL;
      if (e.tipo === "escalera_recta") tramo(-20, 20, 50, -50, 16, 0, H);
      else if (e.tipo === "escalera_u") {
        tramo(-46, -6, 60, -20, 8, 0, H * 8 / 17);
        pasos.push([0, -50, 92, 40, H * 9 / 17]);
        tramo(6, 46, -20, 60, 8, H * 9 / 17, H);
      } else if (e.tipo === "escalera_l_izq" || e.tipo === "escalera_l_der") {
        const lado = e.tipo === "escalera_l_izq" ? -1 : 1, dx = -40 * lado;
        tramo(-20 + dx, 20 + dx, 60, -20, 8, 0, H * 8 / 17);
        pasos.push([dx, -50, 40, 40, H * 9 / 17]);
        for (let i = 0; i < 8; i++) { const x = (20 + i * 10 + 5) * lado + dx; pasos.push([x, -50, 10, 40, H * (10 + i) / 17]); }
      } else if (e.tipo === "escalera_caracol") {
        for (let i = 0; i < 14; i++) {
          const a = (90 - i * 24) * Math.PI / 180, top = H * (i + 1) / 14;
          const m = new THREE.Mesh(new THREE.BoxGeometry(M(36 * esc), 0.06, M(16 * esc)), mat);
          const c = croquisLocalAMundo(e, Math.cos(a) * 24, Math.sin(a) * 24);
          m.position.set(M(c[0]), top - 0.03, M(c[1])); m.rotation.y = rot - a; padre.add(m);
        }
        const c0 = croquisLocalAMundo(e, 0, 0);
        const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, H, 10), new THREE.MeshLambertMaterial({ color: "#5B5F66" }));
        poste.position.set(M(c0[0]), H / 2, M(c0[1])); padre.add(poste);
        return;
      }
      pasos.forEach(([lx, ly, w, l, h]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(M(w * esc), h, M(l * esc)), mat);
        const c = croquisLocalAMundo(e, lx, ly);
        m.position.set(M(c[0]), h / 2, M(c[1])); m.rotation.y = rot; padre.add(m);
      });
    });
  }
  // Losa de un piso de arriba: cubre lo que ocupa ese piso, con el hueco de
  // las escaleras que suben desde el piso de abajo.
  function armarLosa(paredes, abajo) {
    if (!paredes.length) return null;
    const c = croquisCaja({ elementos: paredes });
    const forma = new THREE.Shape();
    const x0 = M(c.x), z0 = M(c.y), x1 = M(c.x + c.w), z1 = M(c.y + c.h);
    // La forma se dibuja en (x, -z) y se gira para quedar acostada.
    forma.moveTo(x0, -z0); forma.lineTo(x1, -z0); forma.lineTo(x1, -z1); forma.lineTo(x0, -z1); forma.lineTo(x0, -z0);
    abajo.filter((e) => e && e.t === "simbolo" && CROQUIS_ESCALERA_CAJA[e.tipo]).forEach((e) => {
      const [a, b, cc, d] = CROQUIS_ESCALERA_CAJA[e.tipo];
      const q = [[a, b], [cc, b], [cc, d], [a, d]].map(([x, y]) => croquisLocalAMundo(e, x, y)).map(([x, y]) => [M(x), -M(y)]);
      const hueco = new THREE.Path();
      // Sentido contrario al contorno.
      const area = q.reduce((s, p, i) => s + p[0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * p[1], 0);
      const pts = area > 0 ? q.slice().reverse() : q;
      hueco.moveTo(...pts[0]); pts.slice(1).forEach((p) => hueco.lineTo(...p)); hueco.lineTo(...pts[0]);
      forma.holes.push(hueco);
    });
    const geo = new THREE.ExtrudeGeometry(forma, { depth: LOSA, bevelEnabled: false });
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: "#D8D3C8" }));
    m.rotation.x = -Math.PI / 2; m.position.y = -LOSA;
    return m;
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
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.85); escena.add(hemi);
    const sol = new THREE.DirectionalLight(0xffffff, 0.55); sol.position.set(-12, 25, 18); escena.add(sol); escena.add(sol.target);

    const pt = (x, y) => [M(x), M(y)];
    const els = (elementos || []).filter((e) => e && !(o.ocultarAntes && e.prev));
    const vista = { paredesBajas: !!o.paredesBajas, cobertura: o.cobertura !== false, debiles: !!o.debiles, muebles: !!o.muebles, alarma: o.alarma !== false, camaras: o.camaras !== false };
    const cuadro = []; // cosas que se animan en cada cuadro
    const fantasma = (g) => g.traverse((c) => { if (c.material) { c.material.transparent = true; c.material.opacity = 0.16; c.material.depthWrite = false; c.material.needsUpdate = true; } });
    // ---- Un piso de la casa: paredes, aberturas, cercos, equipos, coberturas
    // y puntos débiles, dentro de "padre" (a la altura de ese piso).
    // nv: { suelo (el de abajo: piso y grilla), abajo (elementos del piso de
    // abajo, para el hueco de la escalera en la losa), fantasma (solo paredes,
    // transparentes) }.
    function construirNivel(els, padre, nv) {
      const grupoParedes = new THREE.Group(), grupoEquipos = new THREE.Group(), grupoCobertura = new THREE.Group(), grupoCarteles = new THREE.Group();
      padre.add(grupoParedes, grupoEquipos, grupoCobertura, grupoCarteles);
      const grupoCierres = new THREE.Group(); padre.add(grupoCierres);
      const segmentos = []; // paredes en metros, para apoyar los equipos
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
        } else if (e.t === "rect" && (!e.forma || e.forma === "rect") && e.cierre) {
          armarCierre(e, grupoCierres);
          armarSuelo(e, grupoCierres);
        } else if (e.t === "rect" && (!e.forma || e.forma === "rect")) {
          const w = M(Math.abs(e.w)), h = M(Math.abs(e.h)), x = M(Math.min(e.x, e.x + e.w)), z = M(Math.min(e.y, e.y + e.h));
          armarSuelo(e, grupoCierres);
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
      // Los tapiales cortan lo que dibuja la cobertura (y los equipos se pueden apoyar en ellos).
      els.filter((e) => croquisEsCerco(e) && CROQUIS_CERCOS[e.cerco].macizo).forEach((e) => { const ps = croquisCercoPuntos(e, 20).pts.map((p) => [M(p.x), M(p.y)]); for (let i = 1; i < ps.length; i++) segmentos.push([ps[i - 1], ps[i]]); });
      const altoParedes = () => (vista.paredesBajas ? 1.1 : ALTO);
      function armarParedes() {
        grupoParedes.children.filter((c) => c.userData.pared).forEach((c) => { grupoParedes.remove(c); c.geometry.dispose(); });
        grupoCierres.children.forEach((c) => { if (c.userData.techo) c.visible = !vista.paredesBajas; });
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
          // Portón en una pared (garaje): sus hojas.
          if (e.tipo.startsWith("porton")) hojasPorton(e, A, B, Math.min(2.38, altoParedes()), grupoParedes, { pared: true });
          // Dintel sobre la abertura (solo con paredes altas).
          if (vista.paredesBajas) return;
          const desde = e.tipo === "ventana" ? 2.1 : e.tipo.startsWith("porton") ? 2.4 : ALTO_PUERTA;
          const m = pared(A, B, ALTO - desde, COLOR_PARED, desde);
          if (m) grupoParedes.add(m);
        });
        if (nv.fantasma) fantasma(grupoParedes);
      }
      // ---- Piso (el de abajo de todo) o losa (los pisos de arriba) ----
      const caja = croquisCaja({ elementos: els.length ? els : [{ t: "rect", x: 0, y: 0, w: 160, h: 160 }] });
      if (nv.suelo) {
        const cx = M(caja.x + caja.w / 2), cz = M(caja.y + caja.h / 2), lado = Math.max(M(caja.w), M(caja.h), 4);
        const piso = new THREE.Mesh(new THREE.PlaneGeometry(M(caja.w) + 2, M(caja.h) + 2), new THREE.MeshLambertMaterial({ color: COLOR_PISO }));
        piso.rotation.x = -Math.PI / 2; piso.position.set(cx, 0, cz); padre.add(piso);
        const grilla = new THREE.GridHelper(Math.ceil(lado + 2), Math.ceil(lado + 2), 0xb5ad9f, 0xb5ad9f);
        grilla.position.set(cx, 0.005, cz); grilla.material.transparent = true; grilla.material.opacity = 0.35; padre.add(grilla);
      } else {
        const losa = armarLosa(els.filter((e) => !croquisEsCerco(e) && (e.t === "linea" || e.t === "rect" && e.cierre !== "semi")), nv.abajo || []);
        if (losa) { padre.add(losa); if (nv.fantasma) fantasma(losa); }
      }
      armarEscaleras(els, padre);
      const grupoMuebles = armarMuebles(els, padre);
      // Norte: flecha en el piso.
      els.filter((e) => e.t === "simbolo" && e.tipo === "norte").forEach((e) => {
        const r = (e.rot || 0) * Math.PI / 180, forma = new THREE.Shape();
        forma.moveTo(0, 0.9); forma.lineTo(0.35, -0.5); forma.lineTo(0, -0.25); forma.lineTo(-0.35, -0.5); forma.closePath();
        const f = new THREE.Mesh(new THREE.ShapeGeometry(forma), new THREE.MeshBasicMaterial({ color: 0xc0392b, side: THREE.DoubleSide }));
        f.rotation.x = -Math.PI / 2; f.rotation.z = -r; f.position.set(M(e.x), 0.06, M(e.y)); padre.add(f);
        const n = cartel("N", "#C0392B"); n.scale.set(0.5, 0.3, 1); n.position.set(M(e.x) + Math.sin(r) * 1.3, 0.4, M(e.y) - Math.cos(r) * 1.3); padre.add(n);
      });
      if (nv.fantasma) { fantasma(grupoMuebles); fantasma(grupoCierres); }

      // ---- Cercos perimetrales (reja, reja con tapial, tejido) ----
      const grupoCercos = new THREE.Group();
      padre.add(grupoCercos);
      let texTejido = null;
      // Portones y puertas puestos sobre un cerco: el cerco se corta ahí y va la hoja.
      const enCerco = els.filter((e) => e.t === "simbolo" && CROQUIS_ABERTURAS.includes(e.tipo)).map((e) => {
        const w2 = (CROQUIS_ANCHO_ABERTURA[e.tipo] || 40) / 2, a = croquisLocalAMundo(e, -w2, 0), b = croquisLocalAMundo(e, w2, 0);
        return { e, a: [M(a[0]), M(a[1])], b: [M(b[0]), M(b[1])] };
      }).filter((ab) => els.some((c) => croquisEsCerco(c) && croquisCercoPuntos(c, 10).pts.some((p) => distSegM([M(p.x), M(p.y)], ab.a, ab.b) < 0.2)));
      const cortado = (a, b) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; return enCerco.some((ab) => distSegM(m, ab.a, ab.b) < 0.25); };
      enCerco.forEach((ab) => {
        const l = Math.hypot(ab.b[0] - ab.a[0], ab.b[1] - ab.a[1]), ang = -Math.atan2(ab.b[1] - ab.a[1], ab.b[0] - ab.a[0]);
        const alto = 1.9;
        if (l < 0.01) return;
        hojasPorton(ab.e, ab.a, ab.b, alto, grupoCercos);
        [ab.a, ab.b].forEach((p) => { const c = new THREE.Mesh(new THREE.BoxGeometry(0.1, alto + 0.1, 0.1), new THREE.MeshLambertMaterial({ color: 0x2b2f33 })); c.position.set(p[0], (alto + 0.1) / 2, p[1]); grupoCercos.add(c); });
      });
      els.filter(croquisEsCerco).forEach((e) => {
        const def = { ...CROQUIS_CERCOS[e.cerco], ...croquisAltoCerco(e) };
        const color = e.cerco === "tejido" ? 0x5f6b63 : 0x2b2f33;
        const tramos = croquisCercoPuntos(e, 8).pts.map((p) => [M(p.x), M(p.y)]);
        const desde = def.tapial || 0, alto = def.alto - desde;
        // Tramo a tramo (así sigue también las curvas).
        const largoTotal = [];
        for (let i = 1; i < tramos.length; i++) if (!cortado(tramos[i - 1], tramos[i])) largoTotal.push([tramos[i - 1], tramos[i]]);
        // Cerco eléctrico arriba: postes cada 2,5 m, 4 hilos y carteles amarillos.
        if (e.electrico) {
          const top = def.alto, hilos = [0.12, 0.24, 0.36, 0.48];
          largoTotal.forEach(([a, b]) => hilos.forEach((dy) => {
            const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.01) return;
            const h = new THREE.Mesh(new THREE.BoxGeometry(l, 0.008, 0.008), new THREE.MeshBasicMaterial({ color: 0xc9ced3 }));
            h.position.set((a[0] + b[0]) / 2, top + dy, (a[1] + b[1]) / 2); h.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); grupoCercos.add(h);
          }));
          croquisCercoPuntos(e, 2.5 * CROQUIS_POR_METRO).pts.forEach((p, i) => {
            const q = [M(p.x), M(p.y)];
            if (enCerco.some((ab) => distSegM(q, ab.a, ab.b) < 0.2)) return;
            const poste = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.56, 0.03), new THREE.MeshLambertMaterial({ color: 0x3b4046 })); poste.position.set(q[0], top + 0.28, q[1]); grupoCercos.add(poste);
            if (i % 2) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.01), new THREE.MeshLambertMaterial({ color: 0xf2c94c })); c.position.set(q[0], top + 0.3, q[1]); c.rotation.y = -Math.atan2(p.ny, p.nx) + Math.PI / 2; grupoCercos.add(c); }
          });
        }
        largoTotal.forEach(([a, b]) => {
          if (def.tapial) { const t = pared(a, b, def.tapial, def.macizo ? "#CFC7BA" : "#B7B1A6"); if (t) { t.scale.z = def.macizo ? 1.8 : 1.6; grupoCercos.add(t); } }
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (l < 0.01 || def.macizo) return;
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
        if (def.macizo) return;
        // Barrotes (reja) o postes (tejido), en una sola malla instanciada.
        const sep = e.cerco === "tejido" ? 2.5 : 0.12;
        const pts = croquisCercoPuntos(e, sep * CROQUIS_POR_METRO).pts.filter((p) => !enCerco.some((ab) => distSegM([M(p.x), M(p.y)], ab.a, ab.b) < 0.2));
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
      els.filter((e) => e.t === "simbolo" && CROQUIS_SIMBOLOS[e.tipo] && CROQUIS_SIMBOLOS[e.tipo].cat === "equipo").forEach((e) => {
        const q = armarEquipo(e, segmentos);
        grupoEquipos.add(q.obj);
        if (q.cobertura) grupoCobertura.add(q.cobertura);
        if (q.cartel) grupoCarteles.add(q.cartel);
        if (q.aro) grupoEquipos.add(q.aro);
      });

      // ---- Puntos débiles: lo que no cubre ningún sensor y aberturas sin sensor ----
      const an = nv.fantasma ? null : analizar(els);
      const grupoDebiles = new THREE.Group();
      padre.add(grupoDebiles);
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
          pos.push(x - c, 0.04, z - c, x + c, 0.04, z + c, x + c, 0.04, z - c, x - c, 0.04, z - c, x - c, 0.04, z + c, x + c, 0.04, z + c);
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
  
      // ---- Lo que tapan los muebles: sombra violeta rayada y el mueble resaltado ----
      const grupoSombras = new THREE.Group();
      padre.add(grupoSombras);
      if (an && an.hayMuebles) {
        const cv = document.createElement("canvas"); cv.width = cv.height = 64;
        const g = cv.getContext("2d");
        g.fillStyle = "rgba(123,75,148,0.42)"; g.fillRect(0, 0, 64, 64);
        g.strokeStyle = "rgba(90,40,120,0.9)"; g.lineWidth = 6;
        for (let k = -64; k <= 64; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); }
        const tex = new THREE.CanvasTexture(cv);
        const pos = [], uv = [], c = an.celda / 2;
        for (let k = 0; k < an.nx * an.ny; k++) if (an.sombra[k]) {
          const [x, z] = an.centro(k % an.nx, Math.floor(k / an.nx));
          pos.push(x - c, 0.05, z - c, x + c, 0.05, z + c, x + c, 0.05, z - c, x - c, 0.05, z - c, x - c, 0.05, z + c, x + c, 0.05, z + c);
          uv.push(0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1);
        }
        if (pos.length) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
          grupoSombras.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })));
        }
        // Los muebles que tapan: una caja violeta alrededor.
        const vistos = new Set();
        an.tapados.forEach((t) => {
          if (vistos.has(t.mueble)) return; vistos.add(t.mueble);
          partesMueble(t.mueble).filter((p) => p.hasta > ALTO_CUERPO_3D).forEach((p) => {
            const h = p.hasta - p.desde;
            const caja = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.04, h + 0.04, p.d + 0.04), new THREE.MeshBasicMaterial({ color: 0x7b4b94, transparent: true, opacity: 0.35, depthWrite: false }));
            caja.position.set(p.c[0], p.desde + h / 2, p.c[1]); caja.rotation.y = -p.giro; grupoSombras.add(caja);
            const borde = new THREE.LineSegments(new THREE.EdgesGeometry(caja.geometry), new THREE.LineBasicMaterial({ color: 0x5a2878 }));
            borde.position.copy(caja.position); borde.rotation.copy(caja.rotation); grupoSombras.add(borde);
          });
          const p0 = partesMueble(t.mueble)[0];
          if (p0) { const av = cartel("Tapa", "#7B4B94"); av.scale.set(0.7, 0.32, 1); av.position.set(p0.c[0], Math.max(...partesMueble(t.mueble).map((p) => p.hasta)) + 0.4, p0.c[1]); grupoSombras.add(av); }
        });
      }
      if (nv.fantasma) { grupoEquipos.visible = grupoCobertura.visible = grupoCarteles.visible = grupoDebiles.visible = grupoSombras.visible = false; fantasma(grupoCercos); }
      return { grupoParedes, grupoEquipos, grupoCobertura, grupoCarteles, grupoDebiles, grupoSombras, segmentos, armarParedes, caja, an, fantasma: !!nv.fantasma };
    }
    // El piso activo (el que se edita, simula, etc.) y los otros pisos.
    const altura = o.altura || 0;
    const mundo = new THREE.Group(); mundo.position.y = altura; escena.add(mundo);
    const extras = (o.niveles || []).map((n) => { const g = new THREE.Group(); g.position.y = n.altura || 0; escena.add(g); return construirNivel((n.elementos || []).filter(Boolean), g, { suelo: !!n.suelo, abajo: n.abajo, fantasma: n.modo === "fantasma" }); });
    const activo = construirNivel(els, mundo, { suelo: o.suelo !== false && !altura ? true : !!o.suelo, abajo: o.abajo });
    const { grupoParedes, grupoEquipos, grupoCobertura, grupoCarteles, grupoDebiles, grupoSombras, segmentos, armarParedes, an } = activo;
    const todos = [activo, ...extras];
    // Encuadre: todo lo que se ve.
    const cajas = todos.filter((n) => !n.fantasma || true).map((n) => n.caja);
    const x0 = Math.min(...cajas.map((c) => c.x)), y0 = Math.min(...cajas.map((c) => c.y)), x1 = Math.max(...cajas.map((c) => c.x + c.w)), y1 = Math.max(...cajas.map((c) => c.y + c.h));
    const cx = M((x0 + x1) / 2), cz = M((y0 + y1) / 2), lado = Math.max(M(x1 - x0), M(y1 - y0), 4);
    const alturaMax = Math.max(altura, ...(o.niveles || []).map((n) => n.altura || 0));
    const centroY = o.todaLaCasa ? (alturaMax + ALTO) / 2 : altura;
    // ---- Cámara y controles ----
    todos.forEach((n) => { if (!n.fantasma) { n.grupoCobertura.visible = vista.cobertura; n.grupoDebiles.visible = vista.debiles; n.grupoSombras.visible = vista.muebles; } n.armarParedes(); });
    // Capas: alarma y cámaras se pueden ocultar por separado (con sus coberturas).
    function aplicarCapas() {
      todos.forEach((n) => [n.grupoEquipos, n.grupoCobertura, n.grupoCarteles].forEach((g) => g.children.forEach((c) => {
        const e = c.userData.equipo || c.userData.de || (c.children && c.children[0] && c.children[0].userData.de);
        if (e && e.tipo) c.visible = croquisEsVideo(e.tipo) ? vista.camaras : vista.alarma;
      })));
    }
    aplicarCapas();
    const controles = new THREE.OrbitControls(camara, renderer.domElement);
    controles.target.set(cx, centroY, cz);
    controles.maxPolarAngle = Math.PI / 2 - 0.05;
    controles.minDistance = 2; controles.maxDistance = lado * 4;
    controles.enableDamping = true;
    function vistaInicial(arriba) {
      // En el celular (pantalla angosta) se aleja para que entre la casa entera.
      const f = Math.min(2.2, Math.max(1, 0.85 / (ancho() / Math.max(1, alto()))));
      if (arriba) camara.position.set(cx, centroY + lado * 1.75 * f, cz + 0.01);
      else camara.position.set(cx - lado * 0.55 * f, centroY + lado * 0.85 * f, cz + lado * 0.95 * f);
      controles.target.set(cx, centroY, cz);
      controles.update();
    }
    vistaInicial(false);
    if (o.camaraInicial) { camara.position.set(...o.camaraInicial.p); controles.target.set(...o.camaraInicial.t); controles.update(); }
    // Toque corto (no arrastre): qué equipo o qué punto del piso se tocó.
    // Sirve para editar desde el 3D (agregar, mover, sacar equipos).
    const marca = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 32), new THREE.MeshBasicMaterial({ color: 0xf2c94c, side: THREE.DoubleSide, depthTest: false, transparent: true }));
    marca.rotation.x = -Math.PI / 2; marca.renderOrder = 12; marca.visible = false; mundo.add(marca);
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
      const golpes = ray.intersectObjects([...grupoEquipos.children, ...grupoCarteles.children], true).filter((g) => g.object.userData.equipo || g.object.userData.de);
      const piso0 = new THREE.Vector3();
      const enPiso = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -altura), piso0) ? [piso0.x * CROQUIS_POR_METRO, piso0.z * CROQUIS_POR_METRO] : null;
      const eq = golpes.length ? (golpes[0].object.userData.equipo || golpes[0].object.userData.de) : null;
      // Una propuesta (sensor sugerido) tocada.
      const prop = grupoPrevia.children.length ? ray.intersectObjects(grupoPrevia.children, true).map((g) => { let x = g.object; while (x && x.userData.propuesta == null) x = x.parent; return x; }).find(Boolean) : null;
      if (prop) { o.alTocar({ propuesta: prop.userData.propuesta }); return; }
      o.alTocar({ equipo: eq, punto: enPiso });
    };
    lienzo.addEventListener("pointerdown", alBajar);
    lienzo.addEventListener("pointerup", alSubir);
    // ---- Edición con el dedo: arrastrar un equipo para moverlo y girar con la manija ----
    const grupoPrevia = new THREE.Group(); mundo.add(grupoPrevia); // vista previa / propuestas
    const rayoEn = (cxp, cyp) => {
      const r = lienzo.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((cxp - r.left) / r.width) * 2 - 1, -((cyp - r.top) / r.height) * 2 + 1), camara);
      return ray;
    };
    const pisoEn = (cxp, cyp) => {
      const r = lienzo.getBoundingClientRect();
      if (cxp < r.left || cxp > r.right || cyp < r.top || cyp > r.bottom) return null;
      const v = new THREE.Vector3();
      return rayoEn(cxp, cyp).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -altura), v) ? [v.x * CROQUIS_POR_METRO, v.z * CROQUIS_POR_METRO] : null;
    };
    const limpiar = (g) => { while (g.children.length) { const c = g.children.pop(); c.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) { if (x.material.map) x.material.map.dispose(); x.material.dispose(); } }); } };
    function previa(el) {
      limpiar(grupoPrevia);
      if (!el) return;
      const q = armarEquipo(el, segmentos, { fantasma: true });
      [q.obj, q.cobertura, q.cartel].filter(Boolean).forEach((x) => grupoPrevia.add(x));
      const aro = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32), new THREE.MeshBasicMaterial({ color: 0xf2a900, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false }));
      aro.rotation.x = -Math.PI / 2; aro.position.set(q.obj.position.x, 0.03, q.obj.position.z); aro.renderOrder = 13; grupoPrevia.add(aro);
    }
    // Sensores sugeridos ("Completar la protección"): fantasmas con lo que suman.
    function mostrarPropuestas(lista) {
      limpiar(grupoPrevia);
      (lista || []).forEach((el, i) => {
        const g = new THREE.Group(); g.userData.propuesta = i;
        const q = armarEquipo(el, segmentos, { fantasma: true });
        [q.obj, q.cobertura].filter(Boolean).forEach((x) => g.add(x));
        const c = cartel(el.ganancia ? "+" + el.ganancia + "%" : "+", "#F2A900"); c.scale.set(1.1, 0.55, 1);
        c.position.set(q.obj.position.x, Math.min(ALTO + 0.5, q.obj.position.y + 0.5), q.obj.position.z); g.add(c);
        // Zona grande para tocarla fácil.
        const toqueM = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), new THREE.MeshBasicMaterial({ visible: false }));
        toqueM.position.set(q.obj.position.x, q.obj.position.y, q.obj.position.z); g.add(toqueM);
        grupoPrevia.add(g);
      });
    }
    const piezasDe = (id) => [...grupoEquipos.children, ...grupoCobertura.children, ...grupoCarteles.children].filter((c) => (c.userData.equipo && c.userData.equipo.id === id) || (c.userData.de && c.userData.de.id === id));
    const ocultarEquipo = (id, si) => piezasDe(id).forEach((c) => { c.visible = !si; });
    // Manija para girar el sensor elegido (infrarrojos y cámaras).
    const manija = new THREE.Group(); manija.visible = false; mundo.add(manija);
    const manijaDisco = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), new THREE.MeshBasicMaterial({ color: 0xf2a900, side: THREE.DoubleSide, depthTest: false }));
    manijaDisco.rotation.x = -Math.PI / 2; manijaDisco.renderOrder = 14; manija.add(manijaDisco);
    const manijaToque = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.2, 16), new THREE.MeshBasicMaterial({ visible: false })); manija.add(manijaToque);
    let manijaDe = null, manijaLinea = null;
    const giroDe = (e) => (CROQUIS_SIMBOLOS[e.tipo] && CROQUIS_SIMBOLOS[e.tipo].ir ? 135 : /^camara/.test(e.tipo) ? 90 : null);
    function ponerManija(e) {
      if (manijaLinea) { mundo.remove(manijaLinea); manijaLinea.geometry.dispose(); manijaLinea = null; }
      manijaDe = e && giroDe(e) != null ? e : null;
      manija.visible = !!manijaDe;
      if (!manijaDe) return;
      const ap = croquisLocalAMundo(e, 0, 0), ang = ((e.rot || 0) - giroDe(e)) * Math.PI / 180;
      const p0 = [M(ap[0]), M(ap[1])], p1 = [p0[0] + Math.cos(ang) * 1.3, p0[1] + Math.sin(ang) * 1.3];
      manija.position.set(p1[0], 0.06, p1[1]);
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p0[0], 0.05, p0[1]), new THREE.Vector3(p1[0], 0.05, p1[1])]);
      manijaLinea = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xf2a900, dashSize: 0.12, gapSize: 0.08, depthTest: false }));
      manijaLinea.computeLineDistances(); manijaLinea.renderOrder = 14; mundo.add(manijaLinea);
    }
    let gesto = null;
    const capt = (ev) => {
      if (!o.editable || !o.editable() || enCamara || ev.button > 0) return;
      const ray = rayoEn(ev.clientX, ev.clientY);
      if (manija.visible && ray.intersectObjects(manija.children, false).length) {
        gesto = { tipo: "girar", e: manijaDe, x: ev.clientX, y: ev.clientY };
        controles.enabled = false;
        return;
      }
      const g = ray.intersectObjects([...grupoEquipos.children, ...grupoCarteles.children], true).find((x) => x.object.userData.equipo || x.object.userData.de);
      if (g) { gesto = { tipo: "mover", e: g.object.userData.equipo || g.object.userData.de, x: ev.clientX, y: ev.clientY, activo: false }; controles.enabled = false; }
    };
    const mueve = (ev) => {
      if (!gesto) return;
      if (gesto.tipo === "mover" && !gesto.activo) {
        if (Math.hypot(ev.clientX - gesto.x, ev.clientY - gesto.y) < 10) return;
        gesto.activo = true; ocultarEquipo(gesto.e.id, true); ponerManija(null);
        if (o.alArrastrar) o.alArrastrar({ fase: "inicio", equipo: gesto.e });
      }
      const p = pisoEn(ev.clientX, ev.clientY);
      if (!p) return;
      if (gesto.tipo === "mover" && o.alArrastrar) o.alArrastrar({ fase: "mueve", equipo: gesto.e, punto: p });
      if (gesto.tipo === "girar") {
        const ap = croquisLocalAMundo(gesto.e, 0, 0);
        const rot = Math.round(((Math.atan2(p[1] - ap[1], p[0] - ap[0]) * 180 / Math.PI + giroDe(gesto.e)) % 360 + 360) % 360);
        gesto.rot = rot;
        ocultarEquipo(gesto.e.id, true); manija.visible = false;
        previa({ ...gesto.e, rot, esp: false });
        if (o.alArrastrar) o.alArrastrar({ fase: "gira", equipo: gesto.e, rot });
      }
    };
    const suelta = (ev) => {
      if (!gesto) return;
      const g = gesto; gesto = null;
      controles.enabled = !enCamara;
      if (g.tipo === "mover" && g.activo) {
        toque = null; // no es un toque
        const p = pisoEn(ev.clientX, ev.clientY);
        limpiar(grupoPrevia); ocultarEquipo(g.e.id, false);
        if (o.alArrastrar) o.alArrastrar({ fase: p ? "suelta" : "cancela", equipo: g.e, punto: p });
      }
      if (g.tipo === "girar") {
        toque = null;
        limpiar(grupoPrevia); ocultarEquipo(g.e.id, false); ponerManija(g.e);
        if (g.rot != null && o.alArrastrar) o.alArrastrar({ fase: "girado", equipo: g.e, rot: g.rot });
      }
    };
    contenedor.addEventListener("pointerdown", capt, true);
    window.addEventListener("pointermove", mueve);
    window.addEventListener("pointerup", suelta);
    window.addEventListener("pointercancel", suelta);
    // ---- Simulación de un intruso ----
    let sim = null;
    const malla = (id) => grupoEquipos.children.find((c) => c.userData.equipo && c.userData.equipo.id === id);
    function pararSimulacion() {
      if (!sim) return;
      mundo.remove(sim.figura);
      sim.figura.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
      sim.encendidos.forEach((m) => { m.material.emissive.setHex(m.userData.emisivoOriginal); });
      sim = null;
    }
    function simular(alEvento, op) {
      pararSimulacion();
      if (!an) return false;
      const r = op && op.r ? op.r : an.recorrido(op);
      if (!r || r.puntos.length < 2) return false;
      const figura = armarLadron();
      mundo.add(figura);
      // Largo acumulado del recorrido, para avanzar a velocidad pareja.
      const acum = [0];
      for (let i = 1; i < r.puntos.length; i++) acum.push(acum[i - 1] + Math.hypot(r.puntos[i][0] - r.puntos[i - 1][0], r.puntos[i][1] - r.puntos[i - 1][1]));
      sim = { figura, r, acum, inicio: performance.now(), vistos: new Set(), encendidos: [], primera: null, alEvento: alEvento || (() => {}), fin: false };
      sim.alEvento({ tipo: "entra", entrada: r.entrada ? r.entrada.el : null, protegida: r.entrada ? !!r.entrada.protegida : null, porton: r.porton ? r.porton.el : null, salto: r.salto ? r.salto.el : null });
      return true;
    }
    const VELOCIDAD = window.CROQUIS_3D_VELOCIDAD || 1.8; // m/s (más rápido en las pruebas)
    cuadro.push((t) => {
      if (!sim || sim.fin) return;
      const seg = (t - sim.inicio) / 1000, { puntos } = sim.r, acum = sim.acum;
      const d = sim.primera == null ? seg * VELOCIDAD : sim.primera * VELOCIDAD + (seg - sim.primera) * VELOCIDAD * 1.7;
      let i = 1; while (i < acum.length - 1 && acum[i] < d) i++;
      const f = Math.min(1, Math.max(0, (d - acum[i - 1]) / ((acum[i] - acum[i - 1]) || 1)));
      const x = puntos[i - 1][0] + (puntos[i][0] - puntos[i - 1][0]) * f, z = puntos[i - 1][1] + (puntos[i][1] - puntos[i - 1][1]) * f;
      sim.figura.position.set(x, 0, z);
      sim.figura.rotation.y = -Math.atan2(puntos[i][1] - puntos[i - 1][1], puntos[i][0] - puntos[i - 1][0]);
      // Camina: piernas y brazos van y vienen; cuando lo detectan, levanta los brazos y corre.
      const asustado = sim.primera != null, fase = seg * (asustado ? 15 : 9);
      const u = sim.figura.userData;
      u.piernas[0].rotation.z = Math.sin(fase) * 0.55; u.piernas[1].rotation.z = -Math.sin(fase) * 0.55;
      if (asustado) { u.brazos[0].rotation.z = Math.PI * 0.85 + Math.sin(fase * 1.3) * 0.25; u.brazos[1].rotation.z = Math.PI * 0.85 - Math.sin(fase * 1.3) * 0.25; }
      else { u.brazos[0].rotation.z = -Math.sin(fase) * 0.5; u.brazos[1].rotation.z = Math.sin(fase) * 0.5; }
      u.cuerpo.position.y = Math.abs(Math.sin(fase)) * 0.05;
      // Quién lo detecta acá.
      // Se revisa todo el tramo desde el cuadro anterior (en un celular lento
      // el muñeco avanza a saltos y podría "saltar" una barrera).
      const prev = sim.ultimo || [x, z], pasos = Math.max(1, Math.ceil(Math.hypot(x - prev[0], z - prev[1]) / 0.15));
      const nuevos = [];
      for (let k = 1; k <= pasos; k++) an.detecta([prev[0] + (x - prev[0]) * k / pasos, prev[1] + (z - prev[1]) * k / pasos]).forEach((e) => { if (!sim.vistos.has(e.id) && !nuevos.includes(e)) nuevos.push(e); });
      sim.ultimo = [x, z];
      // Saltando un cerco eléctrico: lo detecta el energizador.
      if (sim.r.salto && sim.r.salto.electrico && !sim.vistos.has("cerco-electrico") && Math.hypot(sim.r.salto.punto[0] - x, sim.r.salto.punto[1] - z) < 0.5) nuevos.push({ id: "cerco-electrico", tipo: "energizador", etq: "" });
      // Apertura: al pasar por una abertura con magnético.
      an.aberturas.forEach((ab) => {
        if (!ab.exterior || !ab.por || ab.por.tipo !== "magnetico" || sim.vistos.has(ab.por.id)) return;
        if (Math.hypot(ab.c[0] - x, ab.c[1] - z) < 0.5) nuevos.push(ab.por);
      });
      nuevos.forEach((e) => {
        sim.vistos.add(e.id);
        const m = malla(e.id);
        if (m && m.material && m.material.emissive) { if (m.userData.emisivoOriginal == null) m.userData.emisivoOriginal = m.material.emissive.getHex(); sim.encendidos.push(m); }
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
    // ---- Hora del día: sol (con el Norte del plano), contraluz y noche ----
    const datosSol = croquis3dSol(els.find((e) => e.t === "simbolo" && e.tipo === "norte")) || croquis3dSol({ rot: 0 });
    let momento = null, lucesNoche = [], brillo = null;
    const fondoNormal = o.fondo || "#EEF1F4";
    function ponerMomento(m) {
      momento = m || null;
      lucesNoche.forEach((l) => { escena.remove(l); if (l.target) escena.remove(l.target); }); lucesNoche = [];
      renderer.domElement.style.filter = "";
      sol.target.position.set(cx, 0, cz);
      if (!momento) { hemi.intensity = 0.85; hemi.color.set(0xffffff); sol.intensity = 0.55; sol.color.set(0xffffff); sol.position.set(-12, 25, 18); renderer.setClearColor(fondoNormal); actualizarBrillo(); return null; }
      if (momento === "noche") {
        hemi.intensity = 0.07; hemi.color.set(0x6070a0); sol.intensity = 0; renderer.setClearColor("#0B1220");
        // Reflectores: luz hacia donde apuntan.
        els.filter((e) => e.t === "simbolo" && EQUIPOS[e.tipo] && EQUIPOS[e.tipo].luz).forEach((e) => {
          const g = ((e.rot || 0) - 90) * Math.PI / 180, x = M(e.x), z = M(e.y);
          const l = new THREE.SpotLight(0xfff2c0, 2.4, 16, Math.PI / 3.2, 0.5, 1); l.position.set(x, altura + EQUIPOS[e.tipo].h, z);
          l.target.position.set(x + Math.cos(g) * 4, altura, z + Math.sin(g) * 4); escena.add(l); escena.add(l.target); lucesNoche.push(l);
        });
        // La cámara de noche ve con su infrarrojo (en blanco y negro).
        if (enCamara) {
          const ir = new THREE.PointLight(0xffffff, 0.9, 12, 1.2); ir.position.copy(camara.position); escena.add(ir); lucesNoche.push(ir);
          renderer.domElement.style.filter = "grayscale(1) contrast(1.15) brightness(1.15)";
        }
        actualizarBrillo();
        return { noche: true, reflectores: lucesNoche.length - (enCamara ? 1 : 0) };
      }
      const h = datosSol[momento], alt = datosSol.altura[momento] * Math.PI / 180;
      const d = new THREE.Vector3(h[0] * Math.cos(alt), Math.sin(alt), h[1] * Math.cos(alt));
      sol.position.set(cx + d.x * 40, d.y * 40, cz + d.z * 40);
      sol.intensity = momento === "mediodia" ? 0.95 : 0.85; sol.color.set(momento === "manana" ? 0xffd9a8 : momento === "tarde" ? 0xffbf80 : 0xffffff);
      hemi.intensity = momento === "mediodia" ? 0.75 : 0.55; hemi.color.set(0xffffff);
      renderer.setClearColor(momento === "mediodia" ? "#DDEBF7" : momento === "manana" ? "#F3E3CF" : "#F2D3B8");
      return { contraluz: actualizarBrillo() };
    }
    // Encandilamiento: si la cámara mira hacia el sol, un resplandor donde está el sol.
    function actualizarBrillo() {
      if (!brillo) { brillo = document.createElement("div"); brillo.className = "v3-brillo"; brillo.style.cssText = "position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .4s"; contenedor.appendChild(brillo); }
      if (!enCamara || !momento || momento === "noche") { brillo.style.opacity = 0; return false; }
      const h = datosSol[momento], alt = datosSol.altura[momento] * Math.PI / 180;
      const d = new THREE.Vector3(h[0] * Math.cos(alt), Math.sin(alt), h[1] * Math.cos(alt)).normalize();
      const adelante = new THREE.Vector3(); camara.getWorldDirection(adelante);
      const cos = adelante.dot(d), lim = Math.cos(60 * Math.PI / 180);
      if (cos < lim) { brillo.style.opacity = 0; return false; }
      const pS = camara.position.clone().add(d.clone().multiplyScalar(50)).project(camara);
      // El sol puede quedar fuera del cuadro (más arriba): el resplandor entra desde ese borde.
      const x = Math.max(-5, Math.min(105, (pS.x + 1) / 2 * 100)), y = Math.max(-5, Math.min(105, (1 - pS.y) / 2 * 100)), f = Math.max(0.35, (cos - lim) / (1 - lim));
      brillo.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,250,1) 0%, rgba(255,250,225,0.95) ${10 + f * 12}%, rgba(255,240,200,${0.45 + 0.4 * f}) ${30 + f * 25}%, rgba(255,245,230,${0.3 + 0.3 * f}) 100%)`;
      brillo.style.opacity = Math.min(0.95, 0.55 + f * 0.4);
      return true;
    }
    // ---- Lo que ve una cámara ----
    let enCamara = null;
    function verCamara(id) {
      const m = malla(id);
      if (!m) return false;
      const e = m.userData.equipo;
      if (!enCamara) enCamara = { p: camara.position.clone(), t: controles.target.clone(), fov: camara.fov, bajas: vista.paredesBajas, cob: grupoCobertura.visible, carteles: grupoCarteles.visible, deb: grupoDebiles.visible, som: grupoSombras.visible };
      const giro = ((e.rot || 0) - 90) * Math.PI / 180, dir = [Math.cos(giro), Math.sin(giro)];
      if (vista.paredesBajas) { vista.paredesBajas = false; todos.forEach((n) => n.armarParedes()); }
      grupoCobertura.visible = false; grupoCarteles.visible = false; grupoDebiles.visible = false; grupoSombras.visible = false; m.visible = false;
      const h = m.position.y + altura - 0.05;
      camara.position.set(m.position.x + dir[0] * 0.2, h, m.position.z + dir[1] * 0.2);
      // El ancho del lente de la cámara; en el celular parado se limita para que no se deforme.
      const asp = ancho() / alto();
      const medioAncho = Math.min(55, croquisCamaraDori(e).fov / 2);
      camara.fov = Math.min(100, 2 * Math.atan(Math.tan(medioAncho * Math.PI / 180) / asp) * 180 / Math.PI);
      camara.updateProjectionMatrix();
      controles.enabled = false;
      controles.target.set(m.position.x + dir[0] * 5, Math.max(altura + 0.3, h - 1.9), m.position.z + dir[1] * 5);
      camara.lookAt(controles.target);
      enCamara.malla = m;
      return true;
    }
    function salirCamara() {
      if (!enCamara) return;
      camara.position.copy(enCamara.p); controles.target.copy(enCamara.t); camara.fov = enCamara.fov; camara.updateProjectionMatrix();
      if (enCamara.bajas !== vista.paredesBajas) { vista.paredesBajas = enCamara.bajas; todos.forEach((n) => n.armarParedes()); }
      grupoCobertura.visible = enCamara.cob; grupoCarteles.visible = enCamara.carteles; grupoDebiles.visible = enCamara.deb; grupoSombras.visible = enCamara.som; enCamara.malla.visible = true;
      controles.enabled = true; enCamara = null; controles.update();
      ponerMomento(null);
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
        if (que === "cobertura") { vista.cobertura = !vista.cobertura; todos.forEach((n) => { if (!n.fantasma) n.grupoCobertura.visible = vista.cobertura; }); }
        if (que === "paredes") { vista.paredesBajas = !vista.paredesBajas; todos.forEach((n) => n.armarParedes()); }
        if (que === "debiles") { vista.debiles = !vista.debiles; todos.forEach((n) => { if (!n.fantasma) n.grupoDebiles.visible = vista.debiles; }); }
        if (que === "alarma" || que === "camaras") { vista[que] = !vista[que]; aplicarCapas(); }
        if (que === "muebles") { vista.muebles = !vista.muebles; todos.forEach((n) => { if (!n.fantasma) n.grupoSombras.visible = vista.muebles; }); }
        if (que === "arriba" || que === "inicio") salirCamara();
        if (que === "arriba") vistaInicial(true);
        if (que === "inicio") vistaInicial(false);
        return vista;
      },
      analisis: an,
      simular, pararSimulacion,
      get simulando() { return !!(sim && !sim.fin); },
      verCamara, salirCamara, momento: ponerMomento, get momentoActual() { return momento; },
      get enCamara() { return !!enCamara; },
      captura() { renderer.render(escena, camara); return renderer.domElement.toDataURL("image/png"); },
      // Punto del plano (unidades del croquis, a h metros) -> lugar en la pantalla.
      aPantalla(ux, uy, h) {
        camara.updateMatrixWorld();
        const v = new THREE.Vector3(M(ux), (h || 0) + altura, M(uy)).project(camara);
        const r = renderer.domElement.getBoundingClientRect();
        return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
      },
      estadoCamara() { return { p: camara.position.toArray(), t: controles.target.toArray() }; },
      // Resalta un equipo (por id) con un aro amarillo; null lo saca.
      marcar(id) {
        const m = id ? grupoEquipos.children.find((c) => c.userData.equipo && c.userData.equipo.id === id) : null;
        marca.visible = !!m;
        if (m) { const c = m.isGroup ? new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).sub(mundo.position) : m.position; marca.position.set(c.x, 0.03, c.z); }
        ponerManija(m ? m.userData.equipo : null);
      },
      pisoEn, previa, mostrarPropuestas, elementos: els,
      // Vista para editar: casi desde arriba.
      vistaPlanta() {
        salirCamara();
        // Casi desde arriba; la casa un poco más arriba en la pantalla (abajo están los botones).
        const f = Math.min(2.2, Math.max(1, 0.85 / (ancho() / Math.max(1, alto())))), corr = lado * 0.16 * f;
        camara.position.set(cx, altura + lado * 1.45 * f, cz + lado * 0.45 * f + corr); controles.target.set(cx, altura, cz + corr); controles.update();
      },
      vistaInclinada() { salirCamara(); vistaInicial(false); },
      escena,
      resumen: { equipos: grupoEquipos.children.filter((c) => c.userData.equipo).length, paredes: segmentos.length, coberturas: grupoCobertura.children.length },
      destruir() {
        pararSimulacion();
        vivo = false; cancelAnimationFrame(pedido); if (ro) ro.disconnect(); controles.dispose();
        lienzo.removeEventListener("pointerdown", alBajar); lienzo.removeEventListener("pointerup", alSubir);
        contenedor.removeEventListener("pointerdown", capt, true); window.removeEventListener("pointermove", mueve); window.removeEventListener("pointerup", suelta); window.removeEventListener("pointercancel", suelta);
        escena.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } });
        renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      },
    };
  }
  // ---- Vitrina: cada equipo en 3D, como es de verdad, montado en su lugar ----
  // Unidades: centímetros. Se muestra en la ficha del equipo (al tocarlo).
  function vitrina(contenedor, tipo, opciones) {
    const opc = opciones || {};
    const anim = []; // animaciones propias de cada equipo (f(t))
    const W = () => contenedor.clientWidth || 300, H = () => contenedor.clientHeight || 180;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W(), H());
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    contenedor.appendChild(renderer.domElement);
    const escena = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(26, W() / H(), 1, 500);
    // Luz de estudio: una principal con sombra, relleno suave y contraluz.
    escena.add(new THREE.HemisphereLight(0xffffff, 0x8a9099, 0.42));
    const clave = new THREE.DirectionalLight(0xffffff, 0.72); clave.position.set(28, 40, 38); clave.castShadow = true;
    clave.shadow.mapSize.set(1024, 1024); Object.assign(clave.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 }); clave.shadow.radius = 4; clave.shadow.bias = -0.0008;
    escena.add(clave);
    const relleno = new THREE.DirectionalLight(0xdfe8ff, 0.22); relleno.position.set(-40, 10, 30); escena.add(relleno);
    const contra = new THREE.DirectionalLight(0xffffff, 0.3); contra.position.set(-10, 30, -40); escena.add(contra);
    const pieza = new THREE.Group(), fondo = new THREE.Group();
    escena.add(fondo, pieza);
    const mat = (color, o) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0, ...(o || {}) });
    const plastico = mat(0xf1f1ee, { roughness: 0.32 }), gris = mat(0x9aa0a6), oscuro = mat(0x24282c, { roughness: 0.3 });
    const pared = mat(0xddd8cf, { roughness: 0.95 }), madera = mat(0x9c7146, { roughness: 0.7 }), metal = mat(0xbfc3c8, { roughness: 0.32, metalness: 0.55 });
    const lente = new THREE.MeshStandardMaterial({ color: 0xbcc3ca, roughness: 0.12, metalness: 0.05, flatShading: true });
    // Lente de Fresnel: una cúpula facetada que sobresale del frente.
    const fresnel = (w, h, prof, x, y, z) => { const l = M(new THREE.SphereGeometry(1, 14, 8), lente, x, y, z); l.scale.set(w / 2, h / 2, prof); return l; };
    const vidrio = new THREE.MeshStandardMaterial({ color: 0x1a1d21, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 });
    const leds = [];
    const led = (color, x, y, z, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r || 0.25, 12, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9 })); m.position.set(x, y, z); leds.push(m); return m; };
    // Caja con bordes redondeados (extrusión con bisel).
    const caja = (w, h, d, r) => {
      const b = Math.min(r, d / 3), rr = Math.max(0.01, r - b * 0.2), x = w / 2 - b, y = h / 2 - b, s = new THREE.Shape();
      s.moveTo(-x + rr, -y); s.lineTo(x - rr, -y); s.quadraticCurveTo(x, -y, x, -y + rr); s.lineTo(x, y - rr); s.quadraticCurveTo(x, y, x - rr, y); s.lineTo(-x + rr, y); s.quadraticCurveTo(-x, y, -x, y - rr); s.lineTo(-x, -y + rr); s.quadraticCurveTo(-x, -y, -x + rr, -y);
      const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 10 });
      g.center(); return g;
    };
    const M = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); return o; };
    const Mx = (g, m, x, y, z) => { const o = M(g, m, x, y, z); o.rotation.x = Math.PI / 2; return o; }; // cilindro acostado (mirando al frente)
    const texto = (t, w, h, o) => {
      const cv = document.createElement("canvas"); cv.width = 256; cv.height = Math.round(256 * h / w);
      const c = cv.getContext("2d"); c.fillStyle = (o && o.fondo) || "#000"; c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = (o && o.color) || "#fff"; c.font = `${(o && o.peso) || 700} ${Math.round(cv.height * ((o && o.tam) || 0.6))}px Arial, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(t, cv.width / 2, cv.height / 2 + 2);
      const tx = new THREE.CanvasTexture(cv); tx.encoding = THREE.sRGBEncoding;
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.4 }));
    };
    // Calco "inalámbrico" (ondas) para el frente.
    const calcoInal = (w) => {
      const cv = document.createElement("canvas"); cv.width = cv.height = 64;
      const c = cv.getContext("2d"); c.fillStyle = "#F1F1EE"; c.fillRect(0, 0, 64, 64); c.strokeStyle = "#8E949A"; c.lineWidth = 5; c.lineCap = "round";
      [10, 20, 30].forEach((r) => { c.beginPath(); c.arc(32, 50, r, Math.PI * 1.25, Math.PI * 1.75); c.stroke(); });
      c.fillStyle = "#8E949A"; c.beginPath(); c.arc(32, 50, 4, 0, Math.PI * 2); c.fill();
      return new THREE.Mesh(new THREE.PlaneGeometry(w, w), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), roughness: 0.4 }));
    };
    // Piso de pasto (afuera).
    const pasto = () => { const p = M(new THREE.PlaneGeometry(400, 300), mat(0x8fb07a, { roughness: 1 }), 0, 0, 0); p.rotation.x = -Math.PI / 2; fondo.add(p); };
    // Fondos: esquina de pared, pared, techo, marco de puerta.
    // Esquina de dos paredes (el rincón queda atrás, en z = -6).
    const esquina = () => { [[-1, Math.PI / 4], [1, -Math.PI / 4]].forEach(([sx, giro]) => { const p = M(new THREE.PlaneGeometry(60, 120), pared, sx * 21.2, 0, -6 + 21.2); p.rotation.y = giro; fondo.add(p); }); };
    const paredAtras = (z) => { fondo.add(M(new THREE.PlaneGeometry(200, 160), pared, 0, 0, z)); };
    const techo = (y) => { const p = M(new THREE.PlaneGeometry(200, 160), pared, 0, y, 0); p.rotation.x = Math.PI / 2; fondo.add(p); };
    let girar = true, base = 0.35, abajo = false; // oscilación suave (que siempre se vea el frente); abajo: va en el techo
    const t0 = performance.now();
    const arma = {
      infrarrojo() {
        esquina();
        const g = new THREE.Group();
        g.add(M(caja(6.4, 10.5, 4.6, 1.6), plastico));
        // Lente de Fresnel (facetada) arriba al frente.
        g.add(fresnel(5.2, 4.6, 1.1, 0, 2.4, 1.75));
        g.add(M(new THREE.BoxGeometry(5.4, 0.15, 0.3), gris, 0, -0.6, 2.33));
        g.add(led(0xff2020, opc.video ? 1.8 : 0, opc.video ? -3.9 : -2.5, 2.35));
        if (opc.video) {
          // PIR CAM: la cámara abajo de la lente, con su anillo de LEDs infrarrojos.
          g.add(Mx(new THREE.CylinderGeometry(1.25, 1.25, 0.4, 28), oscuro, 0, -2.2, 2.3));
          g.add(Mx(new THREE.CylinderGeometry(0.55, 0.65, 0.5, 20), vidrio, 0, -2.2, 2.55));
          for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.add(M(new THREE.SphereGeometry(0.13, 8, 6), mat(0x5a1515), Math.cos(a) * 0.95, -2.2 + Math.sin(a) * 0.95, 2.55)); }
        }
        if (opc.inal) { const w = calcoInal(1.3); w.position.set(-1.9, -3.9, 2.34); g.add(w); }
        if (opc.mascota && !opc.video) { const pet = texto("PET", 1.9, 0.75, { fondo: "#f1f1ee", color: "#5b6b7b" }); pet.position.set(0, -4.2, 2.34); g.add(pet); }
        // Rótula a la pared.
        g.add(Mx(new THREE.CylinderGeometry(0.8, 1, 2.2, 12), plastico, 0, 0, -3));
        g.position.set(0, 4, -2.6); g.rotation.x = -0.18; pieza.add(g);
      },
      infrarrojo_ext() {
        paredAtras(-4);
        const g = new THREE.Group();
        g.add(M(caja(8, 15, 5.5, 2), plastico));
        const visera = M(caja(8.6, 1.2, 6.5, 0.5), plastico, 0, 7.8, 0.6); visera.rotation.x = 0.15; g.add(visera);
        [3.4, -1.8].forEach((y) => g.add(fresnel(6, 4, 1.2, 0, y, 2.3)));
        g.add(led(0x2e86de, 0, -5.4, 2.8));
        g.position.y = 1; pieza.add(g);
      },
      infrarrojo_cortina() {
        paredAtras(-3);
        const g = new THREE.Group();
        g.add(M(caja(3, 16, 3, 1.2), plastico));
        const l = M(caja(2, 12, 1, 0.4), lente, 0, 0.6, 1.2); g.add(l);
        g.add(led(0xff2020, 0, -6.6, 1.6, 0.2));
        pieza.add(g);
      },
      magnetico() {
        // Marco de la puerta y la hoja apenas abierta; el imán en la hoja, el contacto en el marco.
        fondo.add(M(new THREE.BoxGeometry(5, 34, 4), madera, -2.5, 0, 0));
        const hoja = new THREE.Group(); hoja.add(M(new THREE.BoxGeometry(22, 34, 3.2), mat(0xc9a26f, { roughness: 0.6 }), 11, 0, 0)); hoja.position.set(0, 0, -0.4); hoja.rotation.y = -0.35;
        hoja.add(M(caja(1.6, 3.2, 1.2, 0.4), plastico, 1.4, 9, 2.2));
        fondo.add(hoja);
        const contacto = new THREE.Group();
        if (opc.inal) {
          // Transmisor inalámbrico: más grande (lleva la pila), sin cable.
          contacto.add(M(caja(2.8, 7.5, 2, 0.6), plastico)); contacto.add(led(0x2ecc71, 0, 2.6, 1.02, 0.2));
          const w = calcoInal(1.6); w.position.set(0, -1.6, 1.02); contacto.add(w);
          contacto.position.set(-2.6, 8.6, 2.9);
        } else {
          contacto.add(M(caja(1.8, 5.2, 1.4, 0.45), plastico)); contacto.add(led(0x2ecc71, 0, 1.6, 0.75, 0.18));
          contacto.position.set(-2.4, 9, 2.6);
          pieza.add(M(new THREE.CylinderGeometry(0.15, 0.15, 9, 8), mat(0xffffff), -2.4, 15, 2.2));
        }
        pieza.add(contacto);
        girar = false; base = 0;
      },
      humo() {
        abajo = true;
        techo(4.5);
        const g = new THREE.Group();
        const perfil = [[0, 0], [5.6, 0], [5.8, 0.6], [5.6, 2.2], [4.6, 3.6], [0, 3.8]].map(([x, y]) => new THREE.Vector2(x, y));
        g.add(M(new THREE.LatheGeometry(perfil, 48), plastico));
        for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = M(new THREE.BoxGeometry(0.35, 1.4, 0.6), gris, Math.cos(a) * 5.15, 1.5, Math.sin(a) * 5.15); r.rotation.y = -a; g.add(r); }
        g.add(M(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 24), plastico, 0, 3.9, 0));
        g.add(led(0xff2020, 2.6, 3.75, 0, 0.22));
        g.rotation.x = Math.PI; g.position.y = 4.4; pieza.add(g);
        base = 0.6;
      },
      gas() { arma.humo(); },
      detector_360() {
        abajo = true;
        techo(3.2);
        const g = new THREE.Group();
        const perfil = [[0, 0], [5.4, 0], [5.4, 1.2], [4.8, 1.8], [0, 1.9]].map(([x, y]) => new THREE.Vector2(x, y));
        g.add(M(new THREE.LatheGeometry(perfil, 48), plastico));
        const domo = M(new THREE.SphereGeometry(2.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), lente, 0, 1.8, 0); g.add(domo);
        g.add(led(0xff2020, 4, 1.7, 0, 0.2));
        g.rotation.x = Math.PI; g.position.y = 3.1; pieza.add(g);
        base = 0.6;
      },
      sirena_int() {
        if (opc.inal) {
          // Sirena interior inalámbrica (estilo Ajax HomeSiren): chiquita, redondeada, con su LED.
          paredAtras(-1.6);
          const g = new THREE.Group();
          g.add(M(caja(5.2, 5.2, 2.2, 1.6), mat(0xf6f6f4, { roughness: 0.25 })));
          const l = led(0xff2020, 0, 1.4, 1.12, 0.22); g.add(l);
          for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.6 + i * 0.4, 0.05, 6, 32), mat(0xc9ced3)); r.position.set(0, -0.6, 1.12); g.add(r); }
          pieza.add(g); return;
        }
        paredAtras(-3);
        const g = new THREE.Group();
        g.add(M(caja(11, 11, 5, 2), plastico));
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (i * i + j * j <= 5) g.add(Mx(new THREE.CylinderGeometry(0.4, 0.4, 0.4, 10), oscuro, i * 1.5, j * 1.5, 2.45));
        pieza.add(g);
      },
      sirena_ext() {
        if (opc.inal) {
          // Sirena exterior inalámbrica (estilo Ajax StreetSiren): cuadrada redondeada, lisa, con el marco de luz.
          paredAtras(-3);
          const g = new THREE.Group();
          g.add(M(caja(20, 20, 5.1, 4), mat(0xf6f6f4, { roughness: 0.25 })));
          g.add(M(caja(15.5, 15.5, 0.6, 3), mat(0xeeeeeb, { roughness: 0.3 }), 0, 0, 2.6));
          const marco = new THREE.Mesh(caja(17.4, 17.4, 0.3, 3.4), new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }));
          marco.position.set(0, 0, 2.45); g.add(marco); leds.push(marco);
          g.add(led(0x2ecc71, 0, -6.2, 2.95, 0.22));
          pieza.add(g); return;
        }
        paredAtras(-4);
        const g = new THREE.Group();
        g.add(M(caja(17, 24, 6.5, 2.5), mat(0xd23b34, { roughness: 0.35 })));
        const tapa = M(caja(13.5, 16, 1.2, 1.5), mat(0xf3f3f0, { roughness: 0.35 }), 0, -2.5, 3.4); g.add(tapa);
        const logo = texto("SAT", 9, 3.6, { fondo: "#F3F3F0", color: "#D23B34", tam: 0.82 }); logo.position.set(0, -2.5, 4.05); g.add(logo);
        const flash = new THREE.Mesh(caja(13.5, 4.6, 2.6, 1.2), new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff8c00, emissiveIntensity: 0.3, roughness: 0.15, transparent: true, opacity: 0.9 }));
        flash.position.set(0, 9.2, 2.2); g.add(flash); leds.push(flash);
        pieza.add(g);
      },
      sirena_flash() { arma.sirena_ext(); },
      teclado() {
        paredAtras(-2.4);
        const g = new THREE.Group();
        if (opc.inal) {
          // Teclado inalámbrico táctil (estilo Ajax): plano, liso, con las teclas impresas y lector de tags.
          g.add(M(caja(15, 10.3, 1.4, 1.6), mat(0xf6f6f4, { roughness: 0.25 })));
          const cv = document.createElement("canvas"); cv.width = 450; cv.height = 300;
          const c = cv.getContext("2d"); c.fillStyle = "#F6F6F4"; c.fillRect(0, 0, 450, 300);
          c.fillStyle = "#9aa0a6"; c.font = "400 34px Arial"; c.textAlign = "center"; c.textBaseline = "middle";
          "123456789*0C".split("").forEach((k, i) => c.fillText(k, 70 + (i % 3) * 80, 70 + Math.floor(i / 3) * 56));
          // Armar / desarmar / modo noche.
          c.strokeStyle = "#9aa0a6"; c.lineWidth = 4;
          const candado = (x, y, abierto) => { c.strokeRect(x - 14, y - 4, 28, 22); c.beginPath(); c.arc(x, y - 4, 9, Math.PI, abierto ? Math.PI * 1.75 : 0); c.stroke(); };
          candado(350, 66, false); candado(350, 128, true);
          c.beginPath(); c.arc(350, 190, 13, Math.PI * 0.35, Math.PI * 1.65); c.arc(357, 190, 10, Math.PI * 1.4, Math.PI * 0.6, true); c.stroke();
          c.beginPath(); [12, 20, 28].forEach((r) => { c.moveTo(395 + r * Math.cos(-0.7), 250 + r * Math.sin(-0.7)); c.arc(395, 250, r, -0.7, 0.7); }); c.stroke();
          const tx = new THREE.CanvasTexture(cv);
          g.add(M(new THREE.PlaneGeometry(14, 9.3), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.25 }), 0, -0.2, 0.71));
          [-1.5, -0.5, 0.5, 1.5].forEach((x, i) => g.add(led([0xff2020, 0x2ecc71, 0x2e86de, 0xffb020][i], x, 4.5, 0.72, 0.13)));
          g.rotation.y = -0.15; pieza.add(g); base = 0.25;
          return;
        }
        // Teclado cableado con pantalla LCD (estilo Paradox K32): pantalla azul, teclas de goma y teclas de función.
        g.add(M(caja(13.5, 11.5, 2.6, 1.2), mat(0xeeeeea, { roughness: 0.35 })));
        const lcd = new THREE.Group();
        const cvL = document.createElement("canvas"); cvL.width = 320; cvL.height = 80;
        const cl = cvL.getContext("2d"); cl.fillStyle = "#2b6fd6"; cl.fillRect(0, 0, 320, 80); cl.fillStyle = "#e9f2ff"; cl.font = "700 26px monospace"; cl.textBaseline = "middle"; cl.fillText("Sistema armado", 14, 24); cl.fillText("Zona 1: cerrada", 14, 58);
        lcd.add(M(new THREE.PlaneGeometry(8.6, 2.15), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cvL), emissive: 0x1a3f80, emissiveIntensity: 0.35, roughness: 0.2 }), 0, 3.6, 1.32));
        lcd.add(M(new THREE.BoxGeometry(9.4, 2.9, 0.2), oscuro, 0, 3.6, 1.2));
        g.add(lcd);
        // Teclas numéricas (goma gris) y columna de funciones.
        const tecla = (txt, x, y, w, col) => {
          const cv = document.createElement("canvas"); cv.width = 96; cv.height = 64;
          const c = cv.getContext("2d"); c.fillStyle = col || "#cfd3d7"; c.fillRect(0, 0, 96, 64); c.fillStyle = "#2b2f33"; c.font = `700 ${txt.length > 2 ? 22 : 32}px Arial`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(txt, 48, 34);
          const t = M(caja(w || 1.7, 1.05, 0.5, 0.25), mat(col ? 0xb9c2cc : 0xcfd3d7, { roughness: 0.7 }), x, y, 1.35); g.add(t);
          const cara = M(new THREE.PlaneGeometry((w || 1.7) * 0.9, 0.9), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), roughness: 0.7 }), x, y, 1.61); g.add(cara);
        };
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "CLEAR", "0", "ENTER"].forEach((k, i) => tecla(k, -4.3 + (i % 3) * 2.1, 1.3 - Math.floor(i / 3) * 1.4, k.length > 1 ? 1.8 : 1.7));
        ["STAY", "SLEEP", "OFF", "BYP"].forEach((k, i) => tecla(k, 3.6, 1.3 - i * 1.4, 2.4, "#b9c2cc"));
        g.add(led(0x2ecc71, -5.6, 3.6, 1.32, 0.18)); g.add(led(0xff2020, 5.6, 3.6, 1.32, 0.18));
        g.rotation.y = -0.18; pieza.add(g); base = 0.25;
      },
      doble_tecnologia() {
        esquina();
        const g = new THREE.Group();
        g.add(M(caja(6.8, 12, 5, 1.8), plastico));
        g.add(fresnel(5.4, 4.4, 1.1, 0, 3, 1.95));
        // Ventana de la microondas (más oscura) abajo de la lente.
        g.add(M(caja(4.6, 2.6, 0.4, 0.6), mat(0x9aa3ad, { roughness: 0.3 }), 0, -1.2, 2.35));
        const tx = texto("DT", 1.6, 0.8, { fondo: "#f1f1ee", color: "#5b6b7b" }); tx.position.set(0, -3.6, 2.52); g.add(tx);
        g.add(led(0xff2020, -1.6, -4.4, 2.5, 0.22)); g.add(led(0x2ecc71, 1.6, -4.4, 2.5, 0.22));
        g.add(Mx(new THREE.CylinderGeometry(0.8, 1, 2.2, 12), plastico, 0, 0, -3));
        g.position.set(0, 4, -2.8); g.rotation.x = -0.18; pieza.add(g);
      },
      monoxido() {
        paredAtras(-2.2);
        const g = new THREE.Group();
        g.add(Mx(new THREE.CylinderGeometry(6, 6.2, 3.6, 48), mat(0xf6f6f4, { roughness: 0.3 })));
        for (let i = -2; i <= 2; i++) g.add(M(new THREE.BoxGeometry(6.4 - Math.abs(i) * 1.1, 0.35, 0.3), mat(0xb9bfc5), 0, -3.2 + i * 0.75, 1.85));
        const t = texto("CO", 3, 1.6, { fondo: "#f6f6f4", color: "#6b6f76" }); t.position.set(-1.6, 2.6, 1.82); g.add(t);
        const disp = texto("0 ppm", 3.4, 1.4, { fondo: "#1d2a1d", color: "#7CFC8A", tam: 0.55 }); disp.position.set(0.4, 0.6, 1.82); g.add(disp);
        g.add(led(0x2ecc71, 2.4, 2.7, 1.85, 0.22));
        g.rotation.y = -0.2; pieza.add(g);
      },
      control_remoto() {
        // Llavero de 4 botones (armar, desarmar, parcial y pánico) con su argolla.
        const g = new THREE.Group();
        g.add(M(caja(3.6, 6.2, 1.2, 1.3), mat(0x23272b, { roughness: 0.35 })));
        const ic = ["A", "D", "P", "!"];
        [[-0.85, 1.1], [0.85, 1.1], [-0.85, -0.7], [0.85, -0.7]].forEach(([x, y], i) => {
          g.add(Mx(new THREE.CylinderGeometry(0.62, 0.62, 0.2, 24), mat(i === 3 ? 0xd63031 : 0x3b4046, { roughness: 0.5 }), x, y, 0.62));
          const t = texto(ic[i], 0.9, 0.9, { fondo: i === 3 ? "#d63031" : "#3b4046", color: "#e9ecef", tam: 0.7 }); t.position.set(x, y, 0.73); g.add(t);
        });
        g.add(led(0x2ecc71, 0, -2.2, 0.62, 0.13));
        g.add(M(new THREE.TorusGeometry(0.5, 0.18, 8, 20), mat(0x23272b), 0, 3.4, 0));
        g.add(M(new THREE.TorusGeometry(1.6, 0.12, 8, 40), metal, 0, 5.2, 0));
        g.rotation.set(0.25, -0.35, 0.12);
        anim.push((t) => { g.rotation.z = 0.12 + Math.sin(t * 1.3) * 0.06; });
        paredAtras(-4);
        pieza.add(g); girar = false;
      },
      modulo_rele() {
        // Módulo relé inalámbrico: cajita blanca con borneras, LED y los cables al motor del portón.
        paredAtras(-1.6);
        const g = new THREE.Group();
        g.add(M(caja(7.5, 5, 2.6, 0.8), mat(0xf6f6f4, { roughness: 0.3 })));
        for (let i = 0; i < 4; i++) {
          g.add(M(new THREE.BoxGeometry(1.2, 1.2, 1), mat(0x2e7d32, { roughness: 0.5 }), -2.4 + i * 1.6, -1.4, 1.4));
          g.add(Mx(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 12), metal, -2.4 + i * 1.6, -1.4, 1.95));
        }
        g.add(led(0x2e86de, 2.7, 1.4, 1.32, 0.22));
        const c = calcoInal(1.3); c.position.set(-2.4, 1.2, 1.31); g.add(c);
        [0x1c1e21, 0xc0392b].forEach((col, i) => g.add(M(new THREE.CylinderGeometry(0.18, 0.18, 6, 8), mat(col), -1.6 + i * 1.6, -5, 1.4)));
        pieza.add(g); base = 0.3;
      },
      camara_solar() {
        // Cámara 4G en un caño, con el panel solar arriba y la antena.
        const g = new THREE.Group();
        g.add(M(new THREE.CylinderGeometry(1.2, 1.2, 14, 16), metal, 0, -6, -3));
        const panel = new THREE.Group();
        panel.add(M(new THREE.BoxGeometry(26, 0.8, 18), mat(0xc9ced3, { metalness: 0.6, roughness: 0.35 })));
        const cv = document.createElement("canvas"); cv.width = 260; cv.height = 180; const cx = cv.getContext("2d");
        cx.fillStyle = "#16283f"; cx.fillRect(0, 0, 260, 180); cx.strokeStyle = "#5f86b3"; cx.lineWidth = 2;
        for (let x = 0; x <= 260; x += 26) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, 180); cx.stroke(); }
        for (let y = 0; y <= 180; y += 30) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(260, y); cx.stroke(); }
        const cel = M(new THREE.PlaneGeometry(25, 17), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), roughness: 0.15, metalness: 0.4 }), 0, 0.42, 0); cel.rotation.x = -Math.PI / 2; panel.add(cel);
        panel.position.set(0, 12, -3); panel.rotation.x = 0.6; g.add(panel);
        g.add(M(new THREE.CylinderGeometry(0.6, 0.6, 10, 10), metal, 0, 6, -3));
        const cam = new THREE.Group();
        cam.add(M(caja(9, 6, 9, 2), plastico));
        cam.add(M(new THREE.SphereGeometry(4.2, 32, 20), plastico, 0, -4.6, 0));
        cam.add(Mx(new THREE.CylinderGeometry(1.6, 1.6, 0.8, 24), oscuro, 0, -4.8, 3.9));
        cam.add(Mx(new THREE.CylinderGeometry(0.8, 0.9, 0.5, 20), vidrio, 0, -4.8, 4.35));
        cam.add(M(new THREE.CylinderGeometry(0.35, 0.35, 9, 8), oscuro, 3.6, 6, -2.4));
        cam.position.set(0, -2, 1.5); g.add(cam);
        pieza.add(g); base = 0.2;
      },
      panico_colgante() {
        // Botón colgante: cuerpo chico redondeado con el botón grande, y el cordón.
        const g = new THREE.Group();
        g.add(M(caja(3.5, 4.7, 1.6, 1.2), mat(0xf6f6f4, { roughness: 0.25 })));
        const b = Mx(new THREE.CylinderGeometry(1.25, 1.3, 0.35, 32), mat(0xe8741e, { roughness: 0.3 }), 0, -0.3, 0.8); g.add(b); leds.push(b);
        g.add(led(0x2ecc71, 0, 1.8, 0.82, 0.12));
        const cordon = new THREE.Mesh(new THREE.TorusGeometry(4, 0.13, 8, 64), mat(0x2b2f33, { roughness: 0.8 }));
        cordon.scale.set(0.75, 1, 1); cordon.position.set(0, 6.9, -0.2); g.add(cordon);
        g.add(M(new THREE.TorusGeometry(0.45, 0.1, 8, 20), metal, 0, 2.75, 0));
        paredAtras(-3);
        anim.push((t) => { g.rotation.z = Math.sin(t * 1.5) * 0.12; });
        pieza.add(g); girar = false;
      },
      fuente_ups() {
        // Fuente con batería para cámaras y alarma: gabinete metálico con cerradura y LEDs.
        paredAtras(-5);
        const g = new THREE.Group();
        g.add(M(caja(25, 30, 9, 0.8), metal));
        g.add(Mx(new THREE.CylinderGeometry(0.9, 0.9, 0.6, 20), mat(0x8a8f96, { metalness: 0.7, roughness: 0.3 }), 9, 10, 4.6));
        const tx = texto("12V  ·  UPS", 12, 2.4, { fondo: "#bfc3c8", color: "#2b2f33", tam: 0.6 }); tx.position.set(-3, 10, 4.52); g.add(tx);
        [["AC", 0x2ecc71], ["BAT", 0xffb020], ["OUT", 0x2e86de]].forEach(([n, c], i) => { g.add(led(c, -8 + i * 4, -9, 4.55, 0.35)); const l = texto(n, 3, 1.2, { fondo: "#bfc3c8", color: "#2b2f33" }); l.position.set(-8 + i * 4, -10.6, 4.52); g.add(l); });
        for (let i = 0; i < 6; i++) g.add(M(new THREE.BoxGeometry(14, 0.5, 0.3), mat(0x9aa0a6), -1, -1 + i * 1.2 - 3, 4.5));
        pieza.add(g);
      },
      sismico() {
        // Caja fuerte con el sensor sísmico pegado en la puerta.
        fondo.add(M(caja(40, 46, 34, 2), mat(0x3b4046, { roughness: 0.4, metalness: 0.5 }), 0, -6, -18));
        fondo.add(Mx(new THREE.CylinderGeometry(4, 4, 1.5, 32), mat(0x8a8f96, { metalness: 0.8, roughness: 0.25 }), -8, -4, -0.3));
        fondo.add(M(new THREE.BoxGeometry(1.2, 9, 1.2), mat(0x8a8f96, { metalness: 0.8, roughness: 0.25 }), 6, -4, 0));
        const g = new THREE.Group();
        g.add(M(caja(8, 6, 2.6, 0.8), mat(0xe9e9e6, { roughness: 0.35 })));
        g.add(led(0xffb020, 2.8, 1.8, 1.32, 0.22));
        const onda = new THREE.Group();
        const pts = [[-2.6, 0], [-1.6, 0], [-1, 1.2], [0, -1.2], [0.8, 1], [1.4, 0], [2.6, 0]].map(([x, y]) => new THREE.Vector3(x, y - 0.4, 1.32));
        onda.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8a5a00 })));
        g.add(onda);
        g.position.set(8, 10, 1.4); pieza.add(g); base = 0.3;
      },
      inundacion() {
        // Va en el piso, cerca de donde puede haber agua; el charco se acerca.
        const piso = M(new THREE.PlaneGeometry(200, 160), mat(0xd9d4cb, { roughness: 0.9 }), 0, 0, 0); piso.rotation.x = -Math.PI / 2; fondo.add(piso);
        fondo.add(M(new THREE.PlaneGeometry(200, 60), pared, 0, 30, -12));
        const g = new THREE.Group();
        const cuerpo = M(caja(5.6, 5.6, 1.4, 1.4), mat(0xf6f6f4, { roughness: 0.25 }), 0, 0.7, 0); cuerpo.rotation.x = -Math.PI / 2; g.add(cuerpo);
        g.add(led(0x2e86de, 0, 1.45, -1.8, 0.18));
        [-1.6, 1.6].forEach((x) => g.add(M(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 10), metal, x, 0.1, 2.2)));
        pieza.add(g);
        const charco = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ color: 0x5aa9e6, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.2 }));
        charco.rotation.x = -Math.PI / 2; charco.position.set(3, 0.05, 5); fondo.add(charco);
        anim.push((t) => { const f = (t * 0.35) % 1; charco.scale.setScalar(2 + f * 7); charco.material.opacity = 0.55 * (1 - f * 0.4); });
        girar = false;
      },
      central() {
        paredAtras(-5);
        const g = new THREE.Group();
        g.add(M(caja(26, 30, 8, 0.8), metal, 0, 0, -0.5));
        const pcb = M(new THREE.BoxGeometry(20, 14, 0.3), mat(0x2e7d4f, { roughness: 0.6 }), 0, 4, 3.5); g.add(pcb);
        for (let i = 0; i < 6; i++) g.add(M(new THREE.BoxGeometry(2.2, 1.2, 1), oscuro, -7 + i * 2.8, 9, 4.2));
        g.add(M(new THREE.BoxGeometry(8, 6, 6), mat(0x2b2f33, { roughness: 0.5 }), 6, -8, 1)); // batería
        g.add(M(new THREE.BoxGeometry(6, 4, 1), mat(0xe6e6e6), -6, -2, 4));
        g.add(led(0x2ecc71, -8, -10, 3.8, 0.35)); g.add(led(0xffb020, -6.5, -10, 3.8, 0.35));
        // Tapa abierta.
        const tapa = new THREE.Group(); tapa.add(M(caja(26, 30, 1, 0.5), metal, 13, 0, 0)); tapa.position.set(13, 0, 3.6); tapa.rotation.y = -1.1;
        const marca = texto("SAT", 8, 3, { fondo: "#d5d8dc", color: "#1C1E21" }); marca.position.set(13, 8, 0.55); tapa.add(marca);
        g.add(tapa);
        pieza.add(g); base = 0.25;
      },
      hub() {
        const g = new THREE.Group();
        g.add(M(caja(11, 11, 3, 3.2), plastico));
        const logo = texto("SAT", 4, 1.6, { fondo: "#F3F3F0", color: "#8e949a" }); logo.position.set(0, 1, 1.52); g.add(logo);
        g.add(led(0x2ecc71, 0, -2.6, 1.55, 0.3));
        g.rotation.x = -0.5; pieza.add(g);
      },
      repetidor() { arma.hub(); },
      rotura_vidrio() {
        paredAtras(-2);
        const g = new THREE.Group();
        const perfil = [[0, 0], [3.6, 0], [3.8, 0.5], [3.4, 1.8], [0, 2]].map(([x, y]) => new THREE.Vector2(x, y));
        const cuerpo = M(new THREE.LatheGeometry(perfil, 40), plastico); cuerpo.rotation.x = Math.PI / 2; g.add(cuerpo);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.add(Mx(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 8), oscuro, Math.cos(a) * 1.4, Math.sin(a) * 1.4, 2)); }
        g.add(led(0x17a2b8, 0, 0, 2.05, 0.3));
        pieza.add(g);
      },
      pulsador_asalto() {
        paredAtras(-2);
        const g = new THREE.Group();
        g.add(M(caja(8, 8, 3, 1.2), plastico));
        const b = M(new THREE.CylinderGeometry(2.4, 2.6, 1.4, 32), mat(0xd93a2b, { roughness: 0.3 }), 0, 0, 1.9); b.rotation.x = Math.PI / 2; g.add(b);
        pieza.add(g); leds.push(b);
      },
      pulsador_incendio() { arma.pulsador_asalto(); },
      camara_ip() {
        paredAtras(-9);
        const g = new THREE.Group();
        // Soporte a la pared.
        g.add(Mx(new THREE.CylinderGeometry(3.2, 3.2, 1.2, 28), plastico, 0, 0, -8.4));
        const brazo = M(new THREE.CylinderGeometry(1, 1, 7, 14), plastico, 0, 1.4, -5); brazo.rotation.x = Math.PI / 2 - 0.35; g.add(brazo);
        const cuerpo = new THREE.Group();
        const tubo = M(new THREE.CylinderGeometry(3.4, 3.4, 15, 32), plastico); tubo.rotation.x = Math.PI / 2; cuerpo.add(tubo);
        // Visera arriba (parasol), que sobresale un poco adelante.
        const visera = M(new THREE.CylinderGeometry(3.85, 3.85, 9, 32, 1, true, Math.PI * 0.62, Math.PI * 0.76), mat(0xf1f1ee, { side: THREE.DoubleSide, roughness: 0.32 }), 0, 0, 5); visera.rotation.x = Math.PI / 2; cuerpo.add(visera);
        const frente = M(new THREE.CylinderGeometry(3.1, 3.1, 0.4, 32), oscuro, 0, 0, 7.55); frente.rotation.x = Math.PI / 2; cuerpo.add(frente);
        const lens = M(new THREE.CylinderGeometry(1.2, 1.4, 0.8, 24), vidrio, 0, 0.4, 7.9); lens.rotation.x = Math.PI / 2; cuerpo.add(lens);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; cuerpo.add(led(0x6b1010, Math.cos(a) * 2.2, Math.sin(a) * 2.2 + 0.2, 7.85, 0.28)); }
        cuerpo.position.set(0, 3.2, 0); cuerpo.rotation.x = 0.25; g.add(cuerpo);
        g.rotation.y = 0.5; pieza.add(g); base = 0.3;
      },
      camara_analoga() { arma.camara_ip(); },
      camara_domo() {
        abajo = true;
        techo(4);
        const g = new THREE.Group();
        const perfil = [[0, 0], [6.4, 0], [6.6, 0.6], [6.2, 1.6], [0, 1.7]].map(([x, y]) => new THREE.Vector2(x, y));
        g.add(M(new THREE.LatheGeometry(perfil, 48), plastico));
        const domo = M(new THREE.SphereGeometry(4.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x30353a, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.7 }), 0, 1.6, 0); g.add(domo);
        const bola = M(new THREE.SphereGeometry(2.6, 24, 16), oscuro, 0, 2.6, 0); g.add(bola);
        const lens = M(new THREE.CylinderGeometry(0.9, 1, 0.6, 20), vidrio, 1.6, 3.6, 1.2); lens.lookAt(4, 8, 3); g.add(lens);
        g.rotation.x = Math.PI; g.position.y = 3.9; pieza.add(g); base = 0.5;
      },
      dvr() {
        // Grabador (DVR o NVR): gabinete negro, frente con LEDs y la marca.
        const g = new THREE.Group();
        g.add(M(caja(32, 5, 24, 0.6), mat(0x23272b, { roughness: 0.35, metalness: 0.35 })));
        const frente = texto("DVR / NVR", 10, 1.8, { fondo: "#23272b", color: "#c9ced3", tam: 0.62 }); frente.position.set(-8, 0.4, 12.01); g.add(frente);
        for (let i = 0; i < 4; i++) g.add(led(i ? 0x2e86de : 0x2ecc71, 7 + i * 2, 0.4, 12.05, 0.28));
        g.add(M(new THREE.BoxGeometry(32.2, 0.4, 24.2), mat(0x15181b), 0, -2.6, 0)); // patitas
        g.rotation.x = 0.32; pieza.add(g); base = 0.4;
      },
      barrera() {
        // Dos columnas en el jardín, con los haces invisibles (acá en rojo) entre ellas.
        pasto();
        const col = (x) => { const c = new THREE.Group(); c.add(M(caja(5, 60, 5, 1), mat(0x2b2f33, { roughness: 0.35 }), 0, 30, 0)); c.add(M(caja(5.6, 3, 5.6, 1), mat(0xd23b34, { roughness: 0.35 }), 0, 61.5, 0)); [12, 30, 48].forEach((y) => c.add(Mx(new THREE.CylinderGeometry(1.4, 1.4, 0.6, 18), vidrio, 0, y, x > 0 ? -2.6 : 2.6))); c.position.x = x; return c; };
        pieza.add(col(-45)); pieza.add(col(45));
        [12, 30, 48].forEach((y) => {
          const haz = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 90, 8), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.55 }));
          haz.rotation.z = Math.PI / 2; haz.position.y = y; pieza.add(haz); anim.push((t) => { haz.material.opacity = 0.3 + 0.3 * (1 + Math.sin(t * 5 + y)) / 2; });
        });
        pieza.rotation.y = -0.35; girar = false;
      },
      lector_acceso() {
        // Lectora al lado del marco de la puerta; el llavero se acerca y se prende la luz.
        paredAtras(-1.6);
        fondo.add(M(new THREE.BoxGeometry(5, 40, 3), madera, -11, 0, 0));
        const g = new THREE.Group();
        g.add(M(caja(5, 9, 1.6, 0.8), mat(0x23272b, { roughness: 0.3 })));
        const anillo = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.18, 10, 32), new THREE.MeshStandardMaterial({ color: 0x2e86de, emissive: 0x2e86de, emissiveIntensity: 0.3 })); anillo.position.set(0, 1.2, 0.85); g.add(anillo);
        g.add(led(0x2ecc71, 0, -2.8, 0.85, 0.2));
        pieza.add(g);
        const llavero = new THREE.Group(); llavero.add(M(caja(2.6, 3.4, 0.6, 0.9), mat(0x1b5fa8, { roughness: 0.35 }))); llavero.add(Mx(new THREE.TorusGeometry(0.6, 0.12, 8, 20), metal, 0, 2.2, 0));
        pieza.add(llavero);
        anim.push((t) => { const f = (Math.sin(t * 1.6) + 1) / 2; llavero.position.set(5 - f * 4.2, 1.2, 7 - f * 5.6); llavero.rotation.y = 0.5 - f * 0.5; anillo.material.emissiveIntensity = f > 0.85 ? 1 : 0.25; });
        girar = false;
      },
      cerradura_magnetica() {
        // Electroimán bajo el dintel; la placa de anclaje en la hoja de la puerta.
        fondo.add(M(new THREE.BoxGeometry(46, 5, 6), madera, 0, 4, 0));
        fondo.add(M(new THREE.BoxGeometry(40, 30, 4), mat(0xc9a26f, { roughness: 0.6 }), 0, -14, 1));
        pieza.add(M(caja(25, 4.5, 6.5, 0.6), metal, 0, -1.2, 3.6));
        pieza.add(M(caja(18, 3.8, 1.2, 0.3), metal, 0, -1.2, 7.4));
        pieza.add(led(0xff2020, 10.5, -1.2, 6.9, 0.3));
        const tx = texto("12V", 4, 1.4, { fondo: "#bfc3c8", color: "#2b2f33", tam: 0.7 }); tx.position.set(-8, -1.2, 6.87); pieza.add(tx);
        base = 0.25;
      },
      cerradura() {
        // Cerradero eléctrico (pestillo) en el marco, frente a la cerradura de la puerta.
        fondo.add(M(new THREE.BoxGeometry(6, 40, 4), madera, -4, 0, 0));
        const puerta = M(new THREE.BoxGeometry(24, 40, 4), mat(0xc9a26f, { roughness: 0.6 }), 11, 0, -0.5); puerta.rotation.y = -0.45; fondo.add(puerta);
        pieza.add(M(caja(3, 16, 1, 0.3), metal, -1.4, 0, 2.2));
        pieza.add(M(new THREE.BoxGeometry(1.2, 3, 0.4), oscuro, -1.4, 0.5, 2.75));
        pieza.add(led(0x2ecc71, -1.4, 6, 2.8, 0.22));
        base = 0.3;
      },
      boton_salida() {
        paredAtras(-1.6);
        const g = new THREE.Group();
        g.add(M(caja(8.6, 8.6, 1.6, 0.8), plastico));
        const b = Mx(new THREE.CylinderGeometry(2.6, 2.8, 1.2, 32), mat(0x2e9e4f, { roughness: 0.3 }), 0, 0.4, 1.2); g.add(b); leds.push(b);
        const tx = texto("SALIDA", 5.2, 1.1, { fondo: "#F1F1EE", color: "#2b2f33", tam: 0.75 }); tx.position.set(0, -3.4, 0.81); g.add(tx);
        pieza.add(g);
      },
      videoportero() {
        paredAtras(-1.6);
        const g = new THREE.Group();
        g.add(M(caja(10, 18, 2.2, 1), mat(0x2b2f33, { roughness: 0.3, metalness: 0.4 })));
        g.add(Mx(new THREE.CylinderGeometry(1, 1, 0.4, 24), vidrio, 0, 5.5, 1.2));
        for (let i = 0; i < 4; i++) g.add(led(0x5a1515, -2 + i * 1.33, 3.6, 1.15, 0.18));
        for (let i = 0; i < 9; i++) g.add(Mx(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 8), oscuro, -1.2 + (i % 3) * 1.2, 0.5 - Math.floor(i / 3) * 1.2, 1.15));
        const boton = Mx(new THREE.CylinderGeometry(1.4, 1.4, 0.6, 28), metal, 0, -5.5, 1.25); g.add(boton);
        const anilloB = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.12, 8, 32), new THREE.MeshStandardMaterial({ color: 0x2e86de, emissive: 0x2e86de, emissiveIntensity: 0.8 })); anilloB.position.set(0, -5.5, 1.5); g.add(anilloB); leds.push(anilloB);
        pieza.add(g);
      },
      comunicador() { paredAtras(-2.2); const g = new THREE.Group(); g.add(M(caja(12, 10, 4, 1), plastico)); g.add(M(new THREE.CylinderGeometry(0.4, 0.5, 8, 10), oscuro, 4.5, 8, 0)); g.add(led(0x2ecc71, -3.5, -3, 2.05)); g.add(led(0x2e86de, -2, -3, 2.05)); const tx = texto("4G", 3, 1.6, { fondo: "#F1F1EE", color: "#2b2f33" }); tx.position.set(0, 1, 2.02); g.add(tx); pieza.add(g); },
      reflector() {
        // Reflector LED con su sensor de movimiento abajo.
        paredAtras(-6);
        const g = new THREE.Group();
        g.add(M(caja(16, 11, 4, 1), mat(0x2b2f33, { roughness: 0.4, metalness: 0.3 })));
        const vidrioL = M(new THREE.PlaneGeometry(13, 8), new THREE.MeshStandardMaterial({ color: 0xfff6cc, emissive: 0xfff0a0, emissiveIntensity: 0.9 }), 0, 0, 2.05); g.add(vidrioL); leds.push(vidrioL);
        for (let i = -6; i <= 6; i += 2) g.add(M(new THREE.BoxGeometry(0.3, 3, 1.6), mat(0x2b2f33), i, 0, -2.6));
        g.add(Mx(new THREE.CylinderGeometry(1.4, 1.4, 1.6, 20), mat(0x2b2f33), 0, -7.6, 0));
        g.add(M(new THREE.SphereGeometry(1.2, 16, 12), mat(0xeeeeee, { roughness: 0.2 }), 0, -7.6, 0.9));
        g.add(M(new THREE.BoxGeometry(2, 4, 2), mat(0x2b2f33), 0, 0, -4.5));
        g.rotation.x = 0.35; pieza.add(g);
      },
      energizador() { paredAtras(-4); const g = new THREE.Group(); g.add(M(caja(20, 25, 8, 1.4), mat(0xf2c94c, { roughness: 0.4 }))); const tx = texto("ALTA TENSIÓN", 15, 2.4, { fondo: "#f2c94c", color: "#1C1E21", tam: 0.55 }); tx.position.set(0, 6, 4.02); g.add(tx); g.add(led(0xff2020, -6, -8, 4.05, 0.4)); pieza.add(g); },
    };
    (arma[tipo] || (() => { paredAtras(-3); pieza.add(M(caja(9, 9, 4, 1.5), plastico)); pieza.add(led(0x2ecc71, 3, -3, 2.1)); }))();
    // Sombras (la pieza sobre la pared/techo) y encuadre.
    pieza.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    fondo.traverse((c) => { if (c.isMesh) { c.receiveShadow = true; c.castShadow = true; } });
    const caja3 = new THREE.Box3().setFromObject(pieza), centro = caja3.getCenter(new THREE.Vector3()), tam = caja3.getSize(new THREE.Vector3());
    // Distancia para que entre la pieza (con aire) a lo alto y a lo ancho.
    const tv = Math.tan(cam.fov * Math.PI / 360), th = tv * (W() / H());
    const dist = Math.max((tam.y / 2) * 1.55 / tv, (Math.max(tam.x, tam.z) / 2) * 1.55 / th) + tam.z / 2;
    if (abajo) { clave.position.set(25, -35, 40); relleno.position.set(-30, -20, 20); cam.position.set(centro.x + dist * 0.3, centro.y - dist * 0.45, centro.z + dist * 0.85); }
    else cam.position.set(centro.x + dist * 0.35, centro.y + dist * 0.22, centro.z + dist * 0.92);
    cam.lookAt(centro);
    let vivo = true, pedido = 0;
    const dibujar = () => {
      if (!vivo) return;
      if (!renderer.domElement.isConnected) { destruir(); return; }
      const t = (performance.now() - t0) / 1000;
      if (girar) pieza.rotation.y = Math.sin(t * 0.7) * base;
      const prende = Math.sin(t * 4) > 0;
      leds.forEach((l) => { if (l.material.emissive) l.material.emissiveIntensity = prende ? 0.95 : 0.15; });
      anim.forEach((f) => f(t));
      renderer.render(escena, cam);
      pedido = requestAnimationFrame(dibujar);
    };
    function destruir() {
      if (!vivo) return;
      vivo = false; cancelAnimationFrame(pedido);
      escena.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } });
      renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      try { renderer.forceContextLoss(); } catch (e) { /* nada */ }
    }
    dibujar();
    return { destruir, escena };
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
      } else if (e.t === "rect" && (!e.forma || e.forma === "rect") && !e.cierre) {
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
    const paredesEnteras = paredes.slice();
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
    // Muebles: lo que tapan depende de la altura. El rayo va del sensor (en
    // la esquina, arriba) al cuerpo de la persona (~1 m): un sillón casi no
    // tapa; un placard, una heladera o una mampara sí, y dejan "sombra".
    const ALTO_CUERPO = ALTO_CUERPO_3D;
    // Los tapiales también tapan (a la altura del tapial).
    const tramosTapial = els.filter((e) => croquisEsCerco(e) && CROQUIS_CERCOS[e.cerco].tapial).flatMap((e) => {
      const ps = croquisCercoPuntos(e, 20).pts.map((p) => [M(p.x), M(p.y)]), r = [];
      for (let i = 1; i < ps.length; i++) {
        const a = ps[i - 1], b = ps[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l * 0.08, ny = (b[0] - a[0]) / l * 0.08;
        r.push({ e, esquinas: [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], desde: 0, hasta: croquisAltoCerco(e).tapial });
      }
      return r;
    });
    const obstaculos = els.filter((e) => e.t === "simbolo" && MUEBLES_3D[e.tipo]).flatMap(partesMueble).concat(tramosTapial).filter((p) => p.hasta > 0.3).map((p) => {
      const cx = p.esquinas.reduce((a, q) => a + q[0], 0) / 4, cy = p.esquinas.reduce((a, q) => a + q[1], 0) / 4;
      const lados = p.esquinas.map((a, i) => { const b = p.esquinas[(i + 1) % 4]; let n = [b[1] - a[1], -(b[0] - a[0])]; if (n[0] * (a[0] - cx) + n[1] * (a[1] - cy) < 0) n = [-n[0], -n[1]]; return { a, n }; });
      return { ...p, lados };
    });
    // ¿Qué mueble se interpone entre el sensor (a su altura) y la persona?
    const tapaMueble = (s, q) => {
      if (!obstaculos.length) return null;
      const d = [q[0] - s.p[0], q[1] - s.p[1]], hs = s.h || ALTO_SENSOR;
      for (const o of obstaculos) {
        let tE = 0, tL = 1, fuera = false;
        for (const { a, n } of o.lados) {
          const num = n[0] * (a[0] - s.p[0]) + n[1] * (a[1] - s.p[1]), den = n[0] * d[0] + n[1] * d[1];
          if (Math.abs(den) < 1e-12) { if (num < 0) { fuera = true; break; } continue; }
          const t = num / den;
          if (den < 0) tE = Math.max(tE, t); else tL = Math.min(tL, t);
          if (tE > tL) { fuera = true; break; }
        }
        // La persona parada adentro del mueble (o el sensor arriba de él) no cuenta.
        if (fuera || tL >= 0.995 || tE <= 0.005) continue;
        const h1 = hs + (ALTO_CUERPO - hs) * tE, h2 = hs + (ALTO_CUERPO - hs) * tL;
        if (Math.min(h1, h2) < o.hasta && Math.max(h1, h2) > o.desde) return o;
      }
      return null;
    };
    // Sensores que cubren superficie.
    const sensores = els.filter((e) => e.t === "simbolo" && CROQUIS_SIMBOLOS[e.tipo] && (CROQUIS_SIMBOLOS[e.tipo].ir || e.tipo === "detector_360")).map((e) => {
      const def = CROQUIS_SIMBOLOS[e.tipo];
      const ap = croquisLocalAMundo(e, 0, 0);
      if (!def.ir) return { el: e, p: [M(e.x), M(e.y)], alc: ALCANCE_360, medio: 180, dir: [1, 0], h: ALTO - 0.03 };
      const { ang, doble } = croquisIRParams(e, def);
      const g = CROQUIS_IR_BIS * Math.PI / 180, w = croquisLocalAMundo(e, Math.cos(g) * 100, Math.sin(g) * 100);
      return { el: e, p: [M(ap[0]), M(ap[1])], alc: Math.min(ALCANCE_REAL[e.tipo] || 10, Number(e.alcReal) || 99), medio: Math.min(179.5, (doble ? ang * 2 : ang) / 2), dir: norm([w[0] - ap[0], w[1] - ap[1]]), h: ALTO_SENSOR };
    });
    const ve = (s, q, sinMuebles) => veParedes(s, q) && (sinMuebles || !tapaMueble(s, q));
    const veParedes = (s, q) => {
      const dx = q[0] - s.p[0], dy = q[1] - s.p[1], d = Math.hypot(dx, dy);
      if (d > s.alc) return false;
      if (d > 0.05 && s.medio < 179.5) {
        const cos = (dx * s.dir[0] + dy * s.dir[1]) / d;
        if (Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI > s.medio + 0.5) return false;
      }
      const t0 = d > 0 ? 0.15 / d : 1, t1 = d > 0 ? 1 - 0.03 / d : 1;
      return !paredes.some(([a, b]) => { const t = corte(s.p, q, a, b); return t !== null && t > t0 && t < t1; });
    };
    // Barreras: detectan a quien cruza la línea de los haces.
    const barreras = els.filter((e) => e.t === "simbolo" && e.tipo === "barrera").map((e) => ({ el: e, seg: puntasBarrera(e) }));
    const detecta = (q) => sensores.filter((s) => ve(s, q)).map((s) => s.el).concat(barreras.filter((b) => distSeg(q, b.seg[0], b.seg[1]) < 0.35).map((b) => b.el));
    const cubierto = new Uint8Array(nx * ny);
    let nInt = 0, nCub = 0;
    for (let k = 0; k < nx * ny; k++) if (interior[k]) {
      nInt++;
      const q = centro(k % nx, Math.floor(k / nx));
      if (sensores.some((s) => ve(s, q))) { cubierto[k] = 1; nCub++; }
    }
    const esInterior = (q) => { const k = indice(q); return k >= 0 && !!interior[k]; };
    // Lo que tapan los muebles: lo que el sensor o la cámara vería si no
    // estuviera el mueble. Para la capa "Lo que tapan los muebles".
    const camaras = els.filter((e) => e.t === "simbolo" && EQUIPOS[e.tipo] && EQUIPOS[e.tipo].camara).map((e) => {
      const g = ((e.rot || 0) - 90) * Math.PI / 180, domo = !!EQUIPOS[e.tipo].disco;
      const dori = croquisCamaraDori(e);
      return { el: e, p: [M(e.x), M(e.y)], alc: Math.min(30, dori.detecta), medio: domo ? 180 : dori.fov / 2, dir: [Math.cos(g), Math.sin(g)], h: EQUIPOS[e.tipo].h, camara: true, dori };
    });
    const sombra = new Uint8Array(nx * ny), tapados = [];
    if (obstaculos.length) {
      const dentroDe = (q, o) => o.lados.every(({ a, n }) => n[0] * (q[0] - a[0]) + n[1] * (q[1] - a[1]) <= 0);
      const cuenta = new Map();
      sensores.concat(camaras).forEach((s) => {
        for (let k = 0; k < nx * ny; k++) {
          if (!interior[k]) continue;
          const q = centro(k % nx, Math.floor(k / nx));
          if (!veParedes(s, q)) continue;
          const o = tapaMueble(s, q);
          if (!o || obstaculos.some((x) => x.hasta > ALTO_CUERPO && dentroDe(q, x))) continue;
          if (!s.camara && cubierto[k]) continue; // otro sensor lo ve igual
          sombra[k] = 1;
          const clave = s.el.id + "|" + (o.e.id || o.e.tipo);
          if (!cuenta.has(clave)) cuenta.set(clave, { equipo: s.el, mueble: o.e, celdas: 0 });
          cuenta.get(clave).celdas++;
        }
      });
      cuenta.forEach((v) => { const m2 = v.celdas * celda * celda; if (m2 >= 0.7) tapados.push({ equipo: v.equipo, mueble: v.mueble, m2: Math.round(m2 * 10) / 10 }); });
      tapados.sort((a, b) => b.m2 - a.m2);
    }
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
    // op: { abertura } entra directo por esa abertura; { porton } entra al
    // terreno por el portón del cerco; { tapial } salta ese cerco; sin op, lo
    // de siempre (por el portón si hay, después lo que no tiene sensor).
    function recorrido(op) {
      const o = op || {};
      const ext = aberturas.filter((ab) => ab.exterior);
      const entrada = o.abertura || ext.find((ab) => !ab.protegida && ab.el.tipo !== "ventana") || ext.find((ab) => !ab.protegida) || ext.find((ab) => ab.el.tipo === "puerta") || ext[0];
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
      let cxs = 0, czs = 0, nn = 0;
      for (let k = 0; k < nx * ny; k++) if (interior[k]) { const q = centro(k % nx, Math.floor(k / nx)); cxs += q[0]; czs += q[1]; nn++; }
      const casa = nn ? [cxs / nn, czs / nn] : [0, 0];
      // De la calle al terreno: por un punto P del cerco con normal n.
      const cruzar = (P, n) => {
        const l1 = [P[0] + n[0] * 1.6, P[1] + n[1] * 1.6], l2 = [P[0] - n[0] * 1.6, P[1] - n[1] * 1.6];
        const calle = Math.hypot(l1[0] - casa[0], l1[1] - casa[1]) > Math.hypot(l2[0] - casa[0], l2[1] - casa[1]) ? l1 : l2;
        return [calle, P, calle === l1 ? l2 : l1];
      };
      if (o.tapial && entrada) {
        // Salta el cerco por el medio del tramo más largo.
        const ps = croquisCercoPuntos(o.tapial, 10).pts, q = ps[Math.floor(ps.length / 2)];
        const P = [M(q.x), M(q.y)];
        puntos.unshift(...cruzar(P, [q.nx, q.ny]));
        return { puntos, entrada, salto: { el: o.tapial, punto: P, electrico: !!o.tapial.electrico } };
      }
      // Si hay un portón en el cerco, primero entra al terreno por ahí.
      const pc = o.abertura ? null : o.porton || portonesCerco[0];
      if (pc && entrada) {
        puntos.unshift(...cruzar(pc.c, pc.n));
        return { puntos, entrada, porton: pc };
      }
      return { puntos, entrada: entrada || null };
    }
    // Por dónde puede entrar (para elegir en la simulación).
    function opciones() {
      const r = [];
      const cuenta = {};
      aberturas.filter((ab) => ab.exterior).forEach((ab) => {
        const t = ab.el.tipo === "ventana" ? "Ventana" : ab.el.tipo.startsWith("porton") ? "Portón" : ab.el.tipo === "paso" ? "Abertura" : ab.el.tipo === "corrediza" ? "Corrediza" : "Puerta";
        cuenta[t] = (cuenta[t] || 0) + 1;
        r.push({ clave: "ab:" + (ab.el.id || r.length), texto: `${t} ${cuenta[t]}${ab.protegida ? "" : " (sin sensor)"}`, op: { abertura: ab } });
      });
      portonesCerco.forEach((pc, i) => r.push({ clave: "po:" + (pc.el.id || i), texto: portonesCerco.length > 1 ? `El portón ${i + 1}` : "El portón del frente", op: { porton: pc } }));
      const tipoCerco = (e) => (CROQUIS_CERCOS[e.cerco].macizo ? "el tapial" : CROQUIS_CERCOS[e.cerco].nombre.toLowerCase().startsWith("tejido") ? "el tejido" : "la reja");
      const nCerco = {};
      els.filter((e) => croquisEsCerco(e)).forEach((e, i) => {
        const t = tipoCerco(e), mismos = els.filter((x) => croquisEsCerco(x) && tipoCerco(x) === t).length;
        nCerco[t] = (nCerco[t] || 0) + 1;
        r.push({ clave: "ta:" + (e.id || i), texto: `Saltando ${t}${mismos > 1 ? " " + nCerco[t] : ""}${e.electrico ? " (eléctrico)" : ""}`, op: { tapial: e } });
      });
      return r;
    }
    // Hasta dónde llega sin que lo detecten (metros), o null si nadie lo detecta.
    function evaluar(r) {
      if (!r) return null;
      let andado = 0;
      for (let i = 1; i < r.puntos.length; i++) {
        const a = r.puntos[i - 1], b = r.puntos[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.15));
        for (let k = 1; k <= n; k++) {
          const q = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n];
          const d = andado + L * k / n;
          if (detecta(q).length) return d;
          if (r.salto && r.salto.electrico && Math.hypot(q[0] - r.salto.punto[0], q[1] - r.salto.punto[1]) < 0.3) return d;
          if (r.entrada && r.entrada.por && r.entrada.por.tipo === "magnetico" && Math.hypot(q[0] - r.entrada.c[0], q[1] - r.entrada.c[1]) < 0.4) return d;
        }
        andado += L;
      }
      return null;
    }
    // El peor caso: por donde llega más lejos sin que lo detecten.
    function peorCaso() {
      let peor = null;
      opciones().forEach((x) => {
        const r = recorrido(x.op);
        if (!r || r.puntos.length < 2) return;
        const d = evaluar(r), valor = d == null ? Infinity : d;
        if (!peor || valor > peor.valor) peor = { ...x, r, valor, distancia: d };
      });
      return peor;
    }
    // ---- "Completar la protección": dónde agregar sensores ----
    // Infrarrojos en esquinas (mirando al ambiente) que cubran lo que falta,
    // de a uno el que más suma; después, magnéticos en las aberturas que dan
    // afuera y siguen sin sensor. Devuelve elementos del croquis (unidades).
    function sugerir(opc) {
      const op = opc || {};
      const maxIR = op.max || 10, minM2 = op.minimo || 4;
      const defIR = CROQUIS_SIMBOLOS.infrarrojo, { ang } = croquisIRParams({}, defIR);
      // Esquinas: donde se juntan o cruzan dos paredes.
      const esq = new Map();
      const agregar = (c, d) => { const k = Math.round(c[0] / 0.1) + "," + Math.round(c[1] / 0.1); if (!esq.has(k)) esq.set(k, { c, dirs: [] }); esq.get(k).dirs.push(norm(d)); };
      for (let i = 0; i < paredesEnteras.length; i++) for (let j = i + 1; j < paredesEnteras.length; j++) {
        const [a1, a2] = paredesEnteras[i], [b1, b2] = paredesEnteras[j];
        const rx = a2[0] - a1[0], ry = a2[1] - a1[1], sx = b2[0] - b1[0], sy = b2[1] - b1[1];
        const den = rx * sy - ry * sx, La = Math.hypot(rx, ry), Lb = Math.hypot(sx, sy);
        if (Math.abs(den) < 1e-9 || La < 0.05 || Lb < 0.05) continue;
        const t = ((b1[0] - a1[0]) * sy - (b1[1] - a1[1]) * sx) / den, u = ((b1[0] - a1[0]) * ry - (b1[1] - a1[1]) * rx) / den;
        if (t < -0.1 / La || t > 1 + 0.1 / La || u < -0.1 / Lb || u > 1 + 0.1 / Lb) continue;
        const q = [a1[0] + t * rx, a1[1] + t * ry];
        [a1, a2, b1, b2].forEach((f) => { if (Math.hypot(f[0] - q[0], f[1] - q[1]) > 0.1) agregar(q, [f[0] - q[0], f[1] - q[1]]); });
      }
      const faltan = [];
      for (let k = 0; k < nx * ny; k++) if (interior[k] && !cubierto[k]) faltan.push(k);
      if (!faltan.length && !aberturas.some((ab) => ab.exterior && !ab.protegida)) return { elementos: [], antes: nInt ? Math.round(100 * nCub / nInt) : null, despues: nInt ? Math.round(100 * nCub / nInt) : null };
      const candidatos = [];
      esq.forEach(({ c, dirs }) => {
        for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) {
          const dot = dirs[i][0] * dirs[j][0] + dirs[i][1] * dirs[j][1];
          if (dot < -0.5 || dot > 0.5) continue; // esquina de unos 90°
          const bis = norm([dirs[i][0] + dirs[j][0], dirs[i][1] + dirs[j][1]]);
          const dentro = [c[0] + bis[0] * 0.6, c[1] + bis[1] * 0.6];
          if (!esInterior(dentro)) continue;
          const sen = { p: [c[0] + bis[0] * 0.02, c[1] + bis[1] * 0.02], alc: ALCANCE_REAL.infrarrojo, medio: ang / 2, dir: bis };
          if (!ve(sen, dentro)) continue;
          if (sensores.some((x) => Math.hypot(x.p[0] - c[0], x.p[1] - c[1]) < 0.5)) continue; // ya hay uno ahí
          const celdas = faltan.filter((k) => { const q = centro(k % nx, Math.floor(k / nx)); return Math.hypot(q[0] - sen.p[0], q[1] - sen.p[1]) <= sen.alc && ve(sen, q); });
          if (celdas.length) candidatos.push({ c, bis, sen, celdas });
        }
      });
      const tapado = new Uint8Array(nx * ny);
      const elegidos = [];
      let suma = nCub;
      while (elegidos.length < maxIR) {
        let mejor = null, mg = 0;
        candidatos.forEach((cd) => { if (cd.usado) return; const g = cd.celdas.reduce((n, k) => n + (tapado[k] ? 0 : 1), 0); if (g > mg) { mg = g; mejor = cd; } });
        if (!mejor || mg * celda * celda < minM2) break;
        mejor.usado = true;
        mejor.celdas.forEach((k) => { tapado[k] = 1; });
        suma += mg;
        // No dos en la misma esquina.
        candidatos.forEach((cd) => { if (Math.hypot(cd.c[0] - mejor.c[0], cd.c[1] - mejor.c[1]) < 0.5) cd.usado = true; });
        const grados = Math.atan2(mejor.bis[1], mejor.bis[0]) * 180 / Math.PI;
        elegidos.push({ t: "simbolo", tipo: "infrarrojo", x: Math.round(mejor.c[0] * CROQUIS_POR_METRO), y: Math.round(mejor.c[1] * CROQUIS_POR_METRO), rot: Math.round(((grados + 135) % 360 + 360) % 360), esc: 1, ganancia: nInt ? Math.max(1, Math.round(100 * mg / nInt)) : 0, sen: mejor.sen });
      }
      // Aberturas que dan afuera: si ningún sensor (de antes o nuevo) ve la
      // entrada, un magnético.
      aberturas.filter((ab) => ab.exterior && !ab.protegida).forEach((ab) => {
        const dentro = [ab.c[0] + ab.adentro[0] * 0.6, ab.c[1] + ab.adentro[1] * 0.6];
        if (elegidos.some((x) => ve(x.sen, dentro))) return;
        const w2 = (CROQUIS_ANCHO_ABERTURA[ab.el.tipo] || 40) / 2;
        const j = croquisLocalAMundo(ab.el, w2 - 6, 0);
        elegidos.push({ t: "simbolo", tipo: "magnetico", x: Math.round(j[0] + ab.adentro[0] * 6), y: Math.round(j[1] + ab.adentro[1] * 6), rot: Math.round(ab.el.rot || 0), esc: 1, apertura: true });
      });
      elegidos.forEach((x) => { delete x.sen; });
      return { elementos: elegidos, antes: nInt ? Math.round(100 * nCub / nInt) : null, despues: nInt ? Math.round(100 * suma / nInt) : null };
    }
    // ---- Avisos para el técnico (exteriores): plantas, pileta, reja hacia la
    // vereda, sol de frente (con el Norte puesto en el plano) y cerco eléctrico
    // sin energizador.
    const norteEl = els.find((e) => e.t === "simbolo" && e.tipo === "norte");
    const sol = croquis3dSol(norteEl);
    const avisos = [];
    const adelante = (s) => [s.p[0] + s.dir[0] * 0.8, s.p[1] + s.dir[1] * 0.8];
    const exterior = (s) => !esInterior(adelante(s)) && !esInterior(s.p);
    const plantas = els.filter((e) => e.t === "simbolo" && /^(arbol|arbusto|cantero)$/.test(e.tipo));
    const piletas = els.filter((e) => e.t === "rect" && e.suelo === "pileta");
    const rejas = els.filter((e) => croquisEsCerco(e) && !CROQUIS_CERCOS[e.cerco].macizo);
    const nombreDe = (e) => (CROQUIS_SIMBOLOS[e.tipo] || {}).nombre || "";
    const angulo = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) * 180 / Math.PI;
    const exteriores = sensores.filter((x) => CROQUIS_SIMBOLOS[x.el.tipo].ir && exterior(x)).concat(camaras.filter(exterior));
    exteriores.forEach((s) => {
      const cam = !!s.camara;
      if (!cam) {
        const pl = plantas.find((e) => veParedes(s, [M(e.x), M(e.y)]));
        if (pl) avisos.push({ equipo: s.el, tipo: "plantas", texto: `Mira ${pl.tipo === "arbol" ? "un árbol" : pl.tipo === "arbusto" ? "un arbusto" : "un cantero"}: con viento las plantas se mueven y pueden dar falsas alarmas. Giralo o achicale el alcance.` });
        const pi = piletas.find((e) => [[0.5, 0.5], [0.2, 0.2], [0.8, 0.8], [0.2, 0.8], [0.8, 0.2]].some(([fx, fy]) => veParedes(s, [M(e.x + e.w * fx), M(e.y + e.h * fy)])));
        if (pi) avisos.push({ equipo: s.el, tipo: "agua", texto: "Mira a la pileta: los reflejos y el agua en movimiento pueden dar falsas alarmas." });
        const rj = rejas.find((e) => croquisCercoPuntos(e, 20).pts.some((q) => { const w = [M(q.x), M(q.y)]; return Math.hypot(w[0] - s.p[0], w[1] - s.p[1]) < s.alc - 0.5 && ve(s, w); }));
        if (rj) avisos.push({ equipo: s.el, tipo: "vereda", texto: `Ve a través ${CROQUIS_CERCOS[rj.cerco].nombre.toLowerCase().startsWith("tejido") ? "del tejido" : "de la reja"} hacia afuera: va a detectar a la gente que pasa por la vereda. Achicale el alcance o giralo.` });
      }
      if (sol) {
        const f = s.dir;
        if (angulo(f, sol.manana) < 45) avisos.push({ equipo: s.el, tipo: "sol", momento: "manana", texto: cam ? "Contraluz a la mañana: mira al este y el sol de frente encandila la imagen. Conviene una cámara con WDR o girarla." : "Le da el sol de frente a la mañana (mira al este): el sol directo puede dar falsas alarmas." });
        else if (angulo(f, sol.tarde) < 45) avisos.push({ equipo: s.el, tipo: "sol", momento: "tarde", texto: cam ? "Contraluz a la tarde: mira al oeste y el sol de frente encandila la imagen. Conviene una cámara con WDR o girarla." : "Le da el sol de frente a la tarde (mira al oeste): el sol directo puede dar falsas alarmas." });
        else if (cam && angulo(f, sol.mediodia) < 35) avisos.push({ equipo: s.el, tipo: "sol", momento: "mediodia", texto: "Mira al norte: en invierno el sol del mediodía queda bajo y puede encandilarla." });
      }
    });
    if (exteriores.length && !sol) avisos.push({ equipo: null, tipo: "norte", texto: "Poné el Norte en el plano (en Objetos) para revisar si a los equipos de afuera les da el sol de frente." });
    // ---- Señal inalámbrica: del hub (o la central) a cada equipo inalámbrico ----
    // Distancia + 25 m "equivalentes" por cada pared o tapial que atraviesa.
    const muros = paredesEnteras.concat(els.filter((e) => croquisEsCerco(e) && CROQUIS_CERCOS[e.cerco].macizo).flatMap((e) => { const ps = croquisCercoPuntos(e, 20).pts.map((q) => [M(q.x), M(q.y)]); return ps.slice(1).map((q, i) => [ps[i], q]); }));
    const costo = (a, b) => {
      const n = muros.reduce((k, [p, q]) => { const t = corte(a, b, p, q); return k + (t !== null && t > 0.02 && t < 0.98 ? 1 : 0); }, 0);
      return { metros: Math.hypot(b[0] - a[0], b[1] - a[1]), paredes: n, eq: Math.hypot(b[0] - a[0], b[1] - a[1]) + n * 25 };
    };
    const BUENA = 150, DEBIL = 220;
    const pos = (e) => [M(e.x), M(e.y)];
    const bases = els.filter((e) => e.t === "simbolo" && e.tipo === "hub");
    if (!bases.length) bases.push(...els.filter((e) => e.t === "simbolo" && e.tipo === "central"));
    const repes = els.filter((e) => e.t === "simbolo" && e.tipo === "repetidor").filter((r) => bases.some((b) => costo(pos(b), pos(r)).eq <= BUENA));
    const inalambricos = els.filter((e) => e.t === "simbolo" && e.inal && CROQUIS_SIMBOLOS[e.tipo] && CROQUIS_SIMBOLOS[e.tipo].cat === "equipo");
    const senal = [];
    if (inalambricos.length && !bases.length) avisos.push({ equipo: null, tipo: "hub", texto: "Hay equipos inalámbricos pero en esta planta no hay hub ni central." });
    if (bases.length) inalambricos.forEach((e) => {
      let mejor = null;
      bases.concat(repes).forEach((b) => { const c = costo(pos(b), pos(e)); if (!mejor || c.eq < mejor.eq) mejor = { ...c, via: b }; });
      const nivel = mejor.eq <= BUENA ? "buena" : mejor.eq <= DEBIL ? "debil" : "sin";
      senal.push({ equipo: e, nivel, ...mejor });
      if (nivel !== "buena") {
        const desde = mejor.via.tipo === "repetidor" ? "el repetidor" : mejor.via.tipo === "hub" ? "el hub" : "la central";
        avisos.push({ equipo: e, tipo: "senal", base: mejor.via, texto: `${nivel === "sin" ? "Sin señal segura" : "Señal débil"} desde ${desde} (${Math.round(mejor.metros)} m y ${mejor.paredes} ${mejor.paredes === 1 ? "pared" : "paredes"} en el medio): conviene un repetidor entre los dos.` });
      }
    });
    if (els.some((e) => croquisEsCerco(e) && e.electrico) && !els.some((e) => e.t === "simbolo" && e.tipo === "energizador")) avisos.push({ equipo: null, tipo: "energizador", texto: "Hay cerco eléctrico pero falta el energizador." });
    // Portón (o puerta) en el cerco: por ahí entra el intruso de la simulación.
    const portonesCerco = aberturas.filter((ab) => !ab.exterior && els.some((c) => croquisEsCerco(c) && croquisCercoPuntos(c, 10).pts.some((q) => distSeg([M(q.x), M(q.y)], ab.a, ab.b) < 0.2)));
    return {
      celda, x0, y0, nx, ny, interior, cubierto, centro, aberturas, sensores, detecta, recorrido, opciones, evaluar, peorCaso, sugerir, senal, sombra, tapados, hayMuebles: obstaculos.length > 0, avisos, sol, portonesCerco,
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
      else if (e.t === "rect" && (!e.forma || e.forma === "rect") && !e.cierre && Math.abs(e.w * e.h) >= 1.5 * CROQUIS_POR_METRO * CROQUIS_POR_METRO) {
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
    // Barrera: donde se tocó, paralela a la pared o cerco más cercano.
    if (el.tipo === "barrera") {
      let mejor = null;
      (elementos || []).filter((e) => e.t === "linea" && e.id !== el.id).forEach((e) => {
        const dx = e.x2 - e.x1, dy = e.y2 - e.y1, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - e.x1) * dx + (py - e.y1) * dy) / L2));
        const d = Math.hypot(px - e.x1 - t * dx, py - e.y1 - t * dy);
        if (!mejor || d < mejor.d) mejor = { d, ang: Math.atan2(dy, dx) * 180 / Math.PI };
      });
      el.x = Math.round(px); el.y = Math.round(py); el.rot = mejor && mejor.d < 3 * CROQUIS_POR_METRO ? Math.round(((mejor.ang % 180) + 180) % 180) : 0;
      return el;
    }
    // Control de acceso: junto a la puerta más cercana.
    const ACCESO = { lector_acceso: 1, cerradura: 2, cerradura_magnetica: 3, boton_salida: 4, videoportero: 1 };
    if (ACCESO[el.tipo]) {
      let ab = null, md = 2 * CROQUIS_POR_METRO;
      (elementos || []).forEach((e) => {
        if (e.t !== "simbolo" || !["puerta", "porton_batiente", "porton_corredizo", "corrediza"].includes(e.tipo)) return;
        const d = Math.hypot(e.x - px, e.y - py);
        if (d < md) { md = d; ab = e; }
      });
      if (ab) {
        const w2 = (CROQUIS_ANCHO_ABERTURA[ab.tipo] || 40) / 2;
        const n0 = croquisLocalAMundo(ab, 0, 0), n1 = croquisLocalAMundo(ab, 0, 10);
        let nx = n1[0] - n0[0], ny = n1[1] - n0[1]; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        if ((px - n0[0]) * nx + (py - n0[1]) * ny < 0) { nx = -nx; ny = -ny; }
        // Lectora y portero: en la pared al lado del marco; pestillo: en el marco; electroimán: arriba al centro; botón de salida: del otro lado.
        const lx = { 1: w2 + 12, 2: w2 - 3, 3: 0, 4: -(w2 + 12) }[ACCESO[el.tipo]];
        const base = croquisLocalAMundo(ab, lx, 0);
        el.x = Math.round(base[0] + nx * 5); el.y = Math.round(base[1] + ny * 5); el.rot = Math.round(ab.rot || 0);
        return el;
      }
    }
    // Apertura (o rotura de vidrio): a la abertura más cercana, del lado tocado.
    if (el.tipo === "magnetico" || el.tipo === "rotura_vidrio") {
      let ab = null, md = 1.6 * CROQUIS_POR_METRO;
      (elementos || []).forEach((e) => {
        if (e.t !== "simbolo" || !CROQUIS_ABERTURAS.includes(e.tipo) || e.tipo === "paso" || (el.tipo === "rotura_vidrio" && !["ventana", "corrediza"].includes(e.tipo))) return;
        const d = Math.hypot(e.x - px, e.y - py);
        if (d < md) { md = d; ab = e; }
      });
      if (ab) {
        const n0 = croquisLocalAMundo(ab, 0, 0), n1 = croquisLocalAMundo(ab, 0, 10);
        let nx = n1[0] - n0[0], ny = n1[1] - n0[1]; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        if ((px - n0[0]) * nx + (py - n0[1]) * ny < 0) { nx = -nx; ny = -ny; } // del lado donde se tocó
        const base = el.tipo === "magnetico" ? croquisLocalAMundo(ab, (CROQUIS_ANCHO_ABERTURA[ab.tipo] || 40) / 2 - 6, 0) : n0;
        const sep = el.tipo === "magnetico" ? 6 : 40;
        el.x = Math.round(base[0] + nx * sep); el.y = Math.round(base[1] + ny * sep); el.rot = Math.round(ab.rot || 0);
        return el;
      }
    }
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
  return { crear, cargar, disponible, ubicar, analizar, vitrina, ALTO_NIVEL };
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
.v3-asesor{margin-left:auto;pointer-events:auto;display:flex;gap:8px;align-items:center;max-width:52%;padding:5px 10px 5px 5px;border-radius:999px;border:1px solid var(--bd);background:var(--sup);color:var(--fg);font:inherit;text-align:left;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.v3-asesor b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v3-asesor small{font-size:11px}.v3-asesor>span:last-child{min-width:0}
.v3-av{flex:none;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#1C1E21;color:#F2C94C;font:700 13px system-ui,sans-serif;letter-spacing:.5px}
.v3-tarjeta .v3-av{width:52px;height:52px;font-size:18px}
.v3-asesor{position:relative}
@media (max-width:600px){.v3-asesor{padding:3px;max-width:none;border-color:#25D366;border-width:2px}.v3-asesor>span:last-child{display:none}.v3-asesor .v3-av{width:40px;height:40px}.v3-asesor::after{content:"";position:absolute;right:-1px;bottom:-1px;width:13px;height:13px;border-radius:50%;background:#25D366;border:2px solid var(--sup)}}
.v3-tj-cab{display:flex;gap:12px;align-items:center;margin-bottom:12px}.v3-tj-cab b{display:block;font-size:17px}.v3-tj-cab small{display:block;color:var(--tenue);font-size:13px;margin-top:2px}
.v3-tj-acc{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:6px;margin-bottom:10px}
.v3-tj-acc a,.v3-tj-redes a{display:flex;gap:6px;align-items:center;justify-content:center;padding:10px 8px;border-radius:10px;border:1px solid var(--bd);background:var(--bg);color:var(--fg);font:600 13.5px system-ui,sans-serif;text-decoration:none}
.v3-tj-acc a.v3-wa{background:#25D366;border-color:#25D366;color:#fff}
.v3-tj-dato{display:flex;gap:8px;align-items:flex-start;margin:6px 0;color:var(--tenue);font-size:13.5px}
.v3-tj-redes{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.v3-tj-redes a{flex:1 1 auto;padding:8px}
.v3-tj-redes svg,.v3-tj-acc svg{width:17px;height:17px;flex:none}
.v3-lista{display:flex;flex-direction:column;gap:2px;margin:4px 0 8px}.v3-lista button{display:flex;align-items:center;gap:8px;text-align:left;padding:7px 8px;border:0;border-radius:8px;background:var(--bg);color:var(--fg);font:500 13.5px system-ui,sans-serif;cursor:pointer}
.v3-lista i{width:12px;height:12px;border-radius:3px;flex:none;border:1px solid rgba(0,0,0,.2)}.v3-lista small{color:var(--tenue)}.v3-lista .v3-inst{color:#E8741E;font-weight:700}
.v3-arreglar{margin-left:4px;padding:2px 8px;border-radius:999px;border:1px solid #8A5A00;background:#FFF6DA;color:#8A5A00;font:700 11.5px system-ui,sans-serif;cursor:pointer}
.v3-avisos{margin:6px 0 0;font-size:12.5px;color:#8A5A00}.v3-avisos summary{font-weight:700;cursor:pointer}.v3-avisos ul{margin:4px 0 0;padding-left:16px}.v3-avisos li{margin:3px 0;list-style:disc}
.v3-tapa{margin:6px 0 0;color:#7B4B94;font-weight:600;font-size:12.5px}
.v3-rayado-violeta{background:repeating-linear-gradient(45deg,rgba(123,75,148,.45) 0 4px,rgba(90,40,120,.9) 4px 6px)!important}
.v3-link{display:block;margin:10px auto 0;background:none;border:0;color:var(--tenue);font:600 14px inherit;font-family:inherit;text-decoration:underline;cursor:pointer}
@media (max-width:480px){.v3-barra,.v3-props{gap:4px}.v3-barra button,.v3-props button{padding:9px 9px;font-size:13px}}
.v3-vitrina{height:170px;margin:-4px -4px 10px;border-radius:12px;overflow:hidden;background:linear-gradient(#FFFFFF,#E4E8EC)}
.v3-vitrina canvas{display:block}
.v3-puntos{display:flex;gap:6px;justify-content:center;margin:0 0 8px}.v3-puntos i{width:8px;height:8px;border-radius:50%;background:var(--bd)}.v3-puntos i.on{background:var(--ac);width:20px;border-radius:4px}
.v3-presentando .v3-barra,.v3-presentando .v3-props,.v3-presentando .v3-tira{display:none}
.v3-hoja .v3-paso-texto{font-size:15px}
.v3-tira{display:flex;gap:6px;overflow-x:auto;max-width:100%;padding:2px;scrollbar-width:none}
.v3-tira button{flex:none;display:flex;flex-direction:column;align-items:center;gap:1px;width:68px;padding:5px 2px 4px;border-radius:12px;border:1px solid var(--bd);background:var(--sup);color:var(--fg);box-shadow:0 2px 8px rgba(0,0,0,.15);font:600 10px inherit;font-family:inherit;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}
.v3-tira button svg{width:26px;height:26px;pointer-events:none}.v3-tira button span{pointer-events:none;line-height:1.1;text-align:center}
.v3-tira button b{font-size:20px;line-height:26px}
.v3-tira button.on{background:var(--ac);color:#1C1E21;border-color:#D4A017}
.v3-error{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:30px;text-align:center;font-size:16px}
`;
const CROQUIS_3D_LEYENDA = {
  infrarrojo: ["Sensor de movimiento (infrarrojo)", "#E00000"], infrarrojo_ext: ["Sensor de movimiento exterior", "#7B4B94"], infrarrojo_cortina: ["Sensor cortina", "#7B4B94"],
  magnetico: ["Sensor de apertura (puertas y ventanas)", "#2E9E4F"], humo: ["Detector de humo", "#FFFFFF"], gas: ["Detector de gas", "#FFFFFF"],
  central: ["Central de alarma", "#F2C94C"], hub: ["Central inalámbrica (Hub)", "#E6E6E6"], repetidor: ["Repetidor de señal", "#E6E6E6"], teclado: ["Teclado", "#D9D9D9"],
  sirena_int: ["Sirena interior", "#D9D9D9"], sirena_ext: ["Sirena exterior", "#E05050"], sirena_flash: ["Sirena con flash", "#E05050"],
  rotura_vidrio: ["Detector de rotura de vidrio", "#17809B"], pulsador_asalto: ["Botón de pánico", "#E8741E"], pulsador_incendio: ["Pulsador de incendio", "#E00000"],
  camara_ip: ["Cámara", "#1593B5"], camara_analoga: ["Cámara", "#1593B5"], camara_domo: ["Cámara domo", "#1593B5"], dvr: ["Grabador DVR / NVR", "#2B2F33"], detector_360: ["Detector de techo 360°", "#FFFFFF"],
  barrera: ["Barrera infrarroja exterior", "#E00000"], lector_acceso: ["Lectora de tag / tarjeta", "#1B5FA8"], cerradura: ["Cerradura de pestillo", "#1B5FA8"], cerradura_magnetica: ["Cerradura electromagnética", "#1B5FA8"],
  boton_salida: ["Botón de salida", "#2E9E4F"], doble_tecnologia: ["Sensor de doble tecnología", "#C0392B"], panico_colgante: ["Botón de pánico colgante", "#E8741E"], fuente_ups: ["UPS / fuente con batería", "#5B5F66"], monoxido: ["Detector de monóxido (CO)", "#6B6F76"], reflector: ["Reflector con sensor", "#E0A800"], control_remoto: ["Control remoto (llavero)", "#2B2F33"], modulo_rele: ["Módulo relé (portón / automatización)", "#2E86DE"], camara_solar: ["Cámara 4G con panel solar", "#1593B5"], sismico: ["Sensor sísmico (caja fuerte)", "#8A5A00"], videoportero: ["Videoportero", "#1C1E21"], comunicador: ["Comunicador 4G", "#D9D9D9"], energizador: ["Energizador de cerco eléctrico", "#F2C94C"], vibracion: ["Sensor de vibración", "#8A5A00"], inundacion: ["Detector de inundación", "#2E86DE"],
};
// Nombre de un equipo según cómo es (inalámbrico, PIR con cámara...).
function croquis3dNombre(e) {
  if (!e) return "";
  const base = (CROQUIS_3D_LEYENDA[e.tipo] || [(CROQUIS_SIMBOLOS[e.tipo] || {}).nombre || e.tipo])[0];
  if (e.tipo === "infrarrojo" && e.video) return "Sensor de movimiento con cámara (PIR CAM)";
  if (e.tipo === "infrarrojo" && e.mascota) return "Sensor de movimiento antimascotas" + (e.inal ? " inalámbrico" : "");
  if (e.inal && /^(infrarrojo|magnetico|humo|sirena|teclado|rotura|pulsador|detector_360|vibracion|doble_tecnologia)/.test(e.tipo)) return base.replace(/ \(.*?\)$/, "") + (/^sirena/.test(e.tipo) ? " inalámbrica" : " inalámbrico");
  return base;
}
// Equipos con variantes ("tipo|marca,marca"): PIR inalámbrico, PIR CAM...
function croquis3dDePreset(p) {
  const [tipo, m] = String(p).split("|"), el = { tipo };
  (m || "").split(",").filter(Boolean).forEach((k) => { el[k] = true; });
  return el;
}
// Qué hace cada equipo, en palabras simples (para el cliente).
const CROQUIS_3D_EXPLICA = {
  infrarrojo: "Detecta el movimiento de una persona en el ambiente y le avisa a la central.",
  infrarrojo_ext: "Detecta movimiento afuera (patio, cochera, frente) antes de que alguien llegue a la casa.",
  infrarrojo_cortina: "Forma una cortina invisible frente a una abertura: detecta si alguien la cruza.",
  detector_360: "Va en el techo y detecta movimiento alrededor, en todas las direcciones.",
  magnetico: "Avisa apenas se abre la puerta o la ventana, aunque la alarma esté activada solo en el perímetro.",
  rotura_vidrio: "Detecta el sonido de un vidrio que se rompe y avisa al instante.",
  humo: "Detecta humo de un principio de incendio y hace sonar la alarma aunque no estés.",
  gas: "Detecta pérdidas de gas y avisa antes de que sea peligroso.",
  central: "Es el cerebro del sistema: recibe los avisos de los sensores, hace sonar las sirenas y avisa al monitoreo.",
  hub: "Central inalámbrica: recibe los avisos de los sensores sin cables y avisa al monitoreo.",
  repetidor: "Extiende el alcance de la señal inalámbrica a los sensores más lejanos.",
  teclado: "Desde acá se activa y desactiva la alarma con tu clave; la pantalla muestra el estado del sistema y qué zona está abierta.",
  sirena_int: "Suena fuerte adentro para asustar al intruso.",
  sirena_ext: "Suena afuera y alerta a los vecinos: muchas veces el intruso se va apenas la escucha.",
  sirena_flash: "Suena y destella afuera para que se vea desde lejos dónde está la alarma.",
  pulsador_asalto: "Botón de pánico: con un toque pedís ayuda en una emergencia.",
  pulsador_incendio: "Para dar aviso manual de un incendio.",
  camara_ip: "Graba y te deja ver en vivo desde el celular lo que pasa en esa zona.",
  camara_analoga: "Graba lo que pasa en esa zona para poder verlo después.",
  camara_domo: "Cámara de techo que vigila todo el ambiente.",
  dvr: "Grabador de las cámaras (DVR para cámaras analógicas, NVR para cámaras IP): guarda las grabaciones y te deja verlas desde el celular.",
  barrera: "Dos columnas que se miran con haces infrarrojos invisibles: si alguien cruza la línea (por ejemplo en el jardín o el frente), avisa antes de que llegue a la casa.",
  lector_acceso: "Se acerca el tag o la tarjeta y la puerta se abre: cada persona tiene el suyo y queda registrado quién entró y a qué hora.",
  cerradura: "Cerradura de pestillo eléctrica: la puerta queda trabada y se libera desde la lectora, el botón de salida o el portero.",
  cerradura_magnetica: "Un electroimán muy fuerte arriba de la puerta la mantiene cerrada; se libera con el tag, el botón de salida o a distancia.",
  boton_salida: "Para salir: se aprieta y libera la cerradura sin necesidad de tag.",
  videoportero: "Ves y hablás con quien toca el timbre, y le abrís desde adentro o desde el celular.",
  comunicador: "Manda los avisos de la alarma al monitoreo por la red celular, aunque se corte internet o el teléfono.",
  energizador: "Alimenta el cerco eléctrico: da una descarga disuasiva y avisa si cortan o tocan los hilos.",
  vibracion: "Detecta golpes o vibraciones en una pared, una caja fuerte o una reja, antes de que la rompan.",
  inundacion: "Va en el piso: avisa apenas detecta agua (pérdidas, lavarropas, termotanque, bombas) antes de que sea un problema.",
  doble_tecnologia: "Combina infrarrojo y microondas: solo avisa cuando las dos tecnologías detectan a la vez. Ideal para garajes, galpones o lugares con corrientes de aire, sol o calefacción, porque casi no da falsas alarmas.",
  reflector: "Se prende solo cuando detecta movimiento: ilumina el patio de noche, ahuyenta y ayuda a que las cámaras vean mejor.",
  monoxido: "Avisa si hay monóxido de carbono, el gas invisible y sin olor que largan calefactores, estufas y calefones mal ventilados. Salva vidas.",
  control_remoto: "Un llavero para activar y desactivar la alarma sin tocar el teclado, desde el auto o la puerta. También tiene botón de pánico.",
  modulo_rele: "Abre el portón o prende luces y riego desde el celular, o automáticamente cuando suena la alarma.",
  camara_solar: "Cámara que funciona sin cables: se alimenta con el panel solar y transmite por 4G. Ideal para campos, obras, quintas o lugares sin luz ni internet.",
  panico_colgante: "Se lleva colgado del cuello o en la muñeca: con un toque pedís ayuda desde cualquier lugar de la casa. Ideal para personas mayores.",
  fuente_ups: "Mantiene funcionando las cámaras, el grabador y la alarma cuando se corta la luz.",
  sismico: "Va pegado a la caja fuerte o al tesoro: detecta golpes, taladros y amoladoras antes de que logren abrirla.",
};
const ALCANCE_TXT = { infrarrojo: "11", infrarrojo_ext: "12", infrarrojo_cortina: "10", doble_tecnologia: "12" };
// Equipos que se pueden agregar tocando en el 3D (en este orden).
const CROQUIS_3D_PALETA = ["infrarrojo", "infrarrojo|inal", "infrarrojo|video,inal", "infrarrojo|mascota", "doble_tecnologia", "infrarrojo_ext", "infrarrojo_cortina", "barrera", "magnetico", "magnetico|inal", "humo", "monoxido", "inundacion", "rotura_vidrio", "sismico", "detector_360", "sirena_int", "sirena_int|inal", "sirena_ext", "sirena_ext|inal", "teclado", "teclado|inal", "control_remoto", "central", "hub", "modulo_rele", "pulsador_asalto", "panico_colgante", "fuente_ups", "camara_ip", "camara_domo", "camara_solar", "reflector", "dvr", "lector_acceso", "cerradura_magnetica", "cerradura", "boton_salida", "videoportero"];
const CROQUIS_3D_CON_ZONA = ["barrera", "monoxido", "doble_tecnologia", "panico_colgante", "sismico", "inundacion", "infrarrojo", "infrarrojo_ext", "infrarrojo_cortina", "magnetico", "humo", "gas", "rotura_vidrio", "detector_360", "pulsador_asalto", "pulsador_incendio"];
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
// Qué se puede arreglar con un toque, según el aviso.
const ARREGLOS = { plantas: ["girar", "alcance"], agua: ["girar", "alcance"], vereda: ["alcance", "girar"], sol: ["girar"], senal: ["repetidor"], norte: ["norte"] };
function croquis3dDori(e) {
  const d = croquisCamaraDori(e), m = (v) => String(v).replace(".", ",") + " m";
  return { ...d, txt: { identifica: m(d.identifica), reconoce: m(d.reconoce), observa: m(d.observa), detecta: m(Math.min(30, d.detecta)) } };
}
// Orientación con el símbolo "Norte" del plano (Argentina, hemisferio sur):
// el sol sale por el este, al mediodía está al norte y se pone al oeste.
// Devuelve direcciones en el plano (x a la derecha, y hacia abajo).
function croquis3dSol(norteEl) {
  if (!norteEl) return null;
  const r = (norteEl.rot || 0) * Math.PI / 180;
  const norte = [Math.sin(r), -Math.cos(r)], este = [Math.cos(r), Math.sin(r)];
  const mezcla = (a, b, g) => { const v = [a[0] * Math.cos(g) + b[0] * Math.sin(g), a[1] * Math.cos(g) + b[1] * Math.sin(g)], n = Math.hypot(v[0], v[1]) || 1; return [v[0] / n, v[1] / n]; };
  const g = 20 * Math.PI / 180;
  return { norte, este, manana: mezcla(este, norte, g), tarde: mezcla([-este[0], -este[1]], norte, g), mediodia: norte, altura: { manana: 14, mediodia: 40, tarde: 14 } };
}
// "El placard", "La heladera": para las frases de lo que tapan los muebles.
function croquis3dMueble(e) {
  if (croquisEsCerco(e)) { const n = CROQUIS_CERCOS[e.cerco].nombre; return (/^reja/i.test(n) ? "La " : "El ") + n.toLowerCase(); }
  const n = ((CROQUIS_SIMBOLOS[e.tipo] || {}).nombre || "Un mueble").split(" / ")[0];
  const fem = /^(heladera|mesa|mesada|cama|ducha|bañera|cocina|estufa|parrilla|pileta|silla|tv)/i.test(n) && !/^tv/i.test(n) ? "La " : /^tv/i.test(n) ? "La " : "El ";
  return fem + n.toLowerCase().replace(/^tv$/, "tele");
}
// Tarjeta de contacto (quien asesoró): se vuelve a limpiar acá porque el
// archivo HTML independiente no pasa por el servidor.
function croquis3dContacto(c) {
  if (!c || typeof c !== "object") return null;
  const t = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
  const url = (v) => { const u = t(v, 200); return /^https?:\/\/[^\s<>"']+$/i.test(u) ? u : ""; };
  const e = c.empresa && typeof c.empresa === "object" ? c.empresa : {};
  const r = { nombre: t(c.nombre, 60), puesto: t(c.puesto, 60), telefono: t(c.telefono, 30), email: /^[^\s@<>"]+@[^\s@<>"]+$/.test(t(c.email, 80)) ? t(c.email, 80) : "",
    empresa: { nombre: t(e.nombre, 60), horarios: t(e.horarios, 160), telefono: t(e.telefono, 30), web: url(e.web), instagram: url(e.instagram), facebook: url(e.facebook) } };
  if (!r.nombre && !r.empresa.nombre) return null;
  r.iniciales = (r.nombre || r.empresa.nombre).split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("");
  r.whatsapp = croquis3dWhatsapp(r.telefono || r.empresa.telefono);
  return r;
}
// Número para wa.me (Argentina): "011 15 5555-1234" -> 5491155551234.
function croquis3dWhatsapp(tel) {
  let d = String(tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (/^549\d{10}$/.test(d)) return d;
  if (/^54\d{10}$/.test(d)) return "549" + d.slice(2);
  d = d.replace(/^0/, "");
  if (d.length === 12) for (const a of [2, 3, 4]) if (d.substr(a, 2) === "15") { d = d.slice(0, a) + d.slice(a + 2); break; }
  return d.length === 10 ? "549" + d : d.length >= 11 ? d : "";
}
function croquis3dVCard(c) {
  const e = c.empresa || {}, x = (v) => String(v || "").replace(/[\\;,]/g, (m) => "\\" + m);
  const partes = String(c.nombre || e.nombre || "").split(" ");
  return ["BEGIN:VCARD", "VERSION:3.0", `FN:${x(c.nombre || e.nombre)}`, `N:${x(partes.slice(1).join(" "))};${x(partes[0])};;;`,
    e.nombre ? `ORG:${x(e.nombre)}` : "", c.puesto ? `TITLE:${x(c.puesto)}` : "",
    c.telefono ? `TEL;TYPE=CELL:${c.telefono}` : "", e.telefono ? `TEL;TYPE=WORK:${e.telefono}` : "", c.email ? `EMAIL:${c.email}` : "",
    e.web ? `URL:${e.web}` : "", e.instagram ? `URL:${e.instagram}` : "", e.horarios ? `NOTE:${x("Horarios: " + e.horarios)}` : "", "END:VCARD"].filter(Boolean).join("\r\n");
}
if (typeof window !== "undefined") Object.assign(window, { croquis3dContacto, croquis3dWhatsapp, croquis3dVCard });
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
  const contacto = croquis3dContacto(d.contacto);
  let prop = 0, pag = 0;
  let paginas = propuestas[0].paginas;
  const titulo = d.titulo || "Tu sistema de seguridad";
  const nombreDe = (tipo) => (String(tipo).includes("|") ? croquis3dNombre(croquis3dDePreset(tipo)) : (CROQUIS_3D_LEYENDA[tipo] || [(CROQUIS_SIMBOLOS[tipo] || {}).nombre || tipo])[0]);
  const colorDe = (p) => { const t = String(p).split("|")[0]; return (CROQUIS_3D_LEYENDA[t] || [0, (CROQUIS_SIMBOLOS[t] || {}).color || "#8E949A"])[1]; };
  const zonaDe = (e) => (e && e.etq ? " (zona " + e.etq + ")" : "");
  // Para usar dentro de una frase: "el sensor de movimiento de la zona 2".
  const enFrase = (e) => croquis3dNombre(e).replace(/\s*\(.*?\)/g, "").toLowerCase() + (e.etq ? " de la zona " + e.etq : "");
  raiz.insertAdjacentHTML("beforeend", `
    <div class="v3-lienzo"></div>
    <div class="v3-cab">${d.logo ? `<img src="${d.logo}" alt="">` : ""}<div><b>${esc(titulo)}</b><small>${esc([d.cliente, d.empresa ? "Propuesta de " + d.empresa : ""].filter(Boolean).join(" · "))}</small></div>${contacto ? `<button type="button" class="v3-asesor" data-a="contacto" aria-label="Contacto de quien te asesoró"><span class="v3-av">${esc(contacto.iniciales)}</span><span><small>Te asesoró</small><b>${esc(contacto.nombre || contacto.empresa.nombre)}</b></span></button>` : ""}</div>
    <div class="v3-pags hidden"></div>
    <details class="v3-ley" ${window.innerWidth > 700 ? "open" : ""}></details>
    <div class="v3-pie"><div class="v3-aviso hidden"></div><div class="v3-hoja hidden"></div><div class="v3-props hidden"></div><div class="v3-tira hidden"></div><div class="v3-barra"></div></div>`);
  const lienzo = raiz.querySelector(".v3-lienzo"), ley = raiz.querySelector(".v3-ley"), barra = raiz.querySelector(".v3-barra"), aviso = raiz.querySelector(".v3-aviso"), hoja = raiz.querySelector(".v3-hoja"), propsEl = raiz.querySelector(".v3-props"), pagsEl = raiz.querySelector(".v3-pags"), tira = raiz.querySelector(".v3-tira"), pie = raiz.querySelector(".v3-pie");
  let editando = false, sel = null, moviendo = null, visor = null, debiles = !!o.debiles, avisoTimer = null, verMuebles = !!o.muebles, capaAlarma = true, capaCamaras = true;
  // Casa de varias plantas: las páginas que son pisos se ven una arriba de la otra.
  const pisosDe = () => paginas.map((p, i) => ({ i, nivel: croquisNivelPagina(p) })).filter((x) => x.nivel != null).sort((a, b) => a.nivel - b.nivel);
  let todo = pisosDe().length >= 2;
  if (todo) pag = pisosDe()[0].i;
  const opcionesPisos = () => {
    const pisos = pisosDe();
    if (pisos.length < 2) return {};
    const min = pisos[0].nivel, altura = (n) => (n - min) * Croquis3D.ALTO_NIVEL;
    const actual = pisos.find((x) => x.i === pag);
    if (!actual) return {};
    const abajoDe = (n) => { const b = pisos.find((x) => x.nivel === n - 1); return b ? paginas[b.i].elementos : []; };
    if (todo) return { altura: altura(actual.nivel), suelo: actual.nivel === min, todaLaCasa: true, niveles: pisos.filter((x) => x.i !== pag).map((x) => ({ elementos: filtro(paginas[x.i].elementos), altura: altura(x.nivel), suelo: x.nivel === min, abajo: abajoDe(x.nivel), modo: "completo" })) };
    // Un piso solo: los de abajo como referencia (transparentes); los de arriba no se ven.
    return { altura: altura(actual.nivel), suelo: actual.nivel === min, abajo: abajoDe(actual.nivel), niveles: pisos.filter((x) => x.nivel < actual.nivel).map((x) => ({ elementos: paginas[x.i].elementos, altura: altura(x.nivel), suelo: x.nivel === min, abajo: abajoDe(x.nivel), modo: "fantasma" })) };
  };
  const pila = [];
  let sello = null, propuesta = null, vistaEd = "planta";
  // "Sin alarma": la casa como está hoy (sin los equipos nuevos), para comparar.
  let sinAlarma = false, presentando = null;
  const filtro = (els) => (sinAlarma ? els.filter((e) => !(e.t === "simbolo" && CROQUIS_SIMBOLOS[e.tipo] && CROQUIS_SIMBOLOS[e.tipo].cat === "equipo" && !e.prev)) : els);
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
    const pisos = pisosDe();
    const nombre = (p, i) => esc(p.nombre || (croquisNivelPagina(p) != null ? CROQUIS_NOMBRE_NIVEL[croquisNivelPagina(p)] || "Piso" : "Planta " + (i + 1)));
    // Con varias plantas: "Toda la casa" y los pisos de arriba hacia abajo.
    const orden = pisos.length >= 2 ? [...pisos.slice().reverse().map((x) => x.i), ...paginas.map((p, i) => i).filter((i) => !pisos.some((x) => x.i === i))] : paginas.map((p, i) => i);
    pagsEl.innerHTML = (pisos.length >= 2 ? `<button type="button" data-pag="todo" class="${todo ? "on" : ""}">Toda la casa</button>` : "") +
      orden.map((i) => `<button type="button" data-pag="${i}" class="${!todo && i === pag ? "on" : ""}">${nombre(paginas[i], i)}</button>`).join("");
  };
  const pintarLeyenda = () => {
    const todos = paginas.flatMap((p) => filtro(p.elementos));
    const cuenta = {};
    todos.filter((e) => e.t === "simbolo" && CROQUIS_3D_LEYENDA[e.tipo] && !e.prev).forEach((e) => {
      const k = croquis3dNombre(e);
      cuenta[k] = cuenta[k] || { n: 0, color: CROQUIS_3D_LEYENDA[e.tipo][1] };
      cuenta[k].n++;
    });
    const an = visor && visor.analisis;
    const abiertas = an ? an.aberturasSinProteger.length : 0;
    const abierto = ley.open;
    ley.innerHTML = `<summary>${sinAlarma ? "Así está hoy" : "Qué se instala"}</summary>
      ${sinAlarma ? `<p class="v3-cubre">${an && an.porcentaje ? `Hoy los sensores cubren el ${an.porcentaje}%` : "Hoy ningún sensor cubre la casa"}</p>` : todo && cobertura(propuestas[prop]) ? `<p class="v3-cubre">Cubre el ${cobertura(propuestas[prop]).pct}% de la casa</p>` : an && an.porcentaje != null ? `<p class="v3-cubre">Cubre el ${an.porcentaje}% de ${paginas.length > 1 ? "esta planta" : "la casa"}</p>` : ""}
      ${an && an.tapados && an.tapados.length && !sinAlarma ? (verMuebles ? `<p class="v3-tapa">${an.tapados.slice(0, 4).map((t) => `${esc(croquis3dMueble(t.mueble))} le tapa ${String(t.m2).replace(".", ",")} m² ${t.equipo.tipo.startsWith("camara") ? "a la cámara" : "al " + esc(enFrase(t.equipo))}`).join("<br>")}</p>` : `<p class="v3-tapa">${an.tapados.length === 1 ? "Un mueble tapa" : "Hay muebles que tapan"} parte de lo que ven los equipos (Vista ▸ Lo que tapan los muebles)</p>`) : ""}
      ${ed && an && an.avisos && an.avisos.length && !sinAlarma ? `<details class="v3-avisos"><summary>⚠ ${an.avisos.length === 1 ? "1 aviso" : an.avisos.length + " avisos"} para el técnico</summary><ul>${an.avisos.map((a, i) => `<li><span>${a.equipo ? `<b>${esc(croquis3dNombre(a.equipo))}${zonaDe(a.equipo)}:</b> ` : ""}${esc(a.texto)}${ARREGLOS[a.tipo] && (a.equipo || a.tipo === "norte") && !todo ? ` <button type="button" class="v3-arreglar" data-arreglo="${i}">Arreglar</button>` : ""}</span></li>`).join("")}</ul></details>` : ""}
      ${abiertas ? `<p class="v3-mal">${abiertas === 1 ? "1 abertura que da afuera no tiene sensor" : abiertas + " aberturas que dan afuera no tienen sensor"}</p>` : ""}
      <ul>${Object.entries(cuenta).map(([k, v]) => `<li><i style="background:${v.color}"></i>${v.n} × ${esc(k)}</li>`).join("")}
      <li><i style="background:rgba(224,0,0,.35)"></i>Zona que cubre cada sensor</li>
      ${todos.some((e) => e.t === "simbolo" && /^camara/.test(e.tipo)) ? `<li><i style="background:linear-gradient(90deg,#1E8449 0 25%,#27AE60 25% 50%,#E6B800 50% 75%,#8FC3EE 75%)"></i>Cámara: identifica una cara · reconoce · ve · detecta</li>` : ""}
      ${verMuebles && an && an.tapados && an.tapados.length ? `<li><i class="v3-rayado v3-rayado-violeta"></i>Tapado por un mueble</li>` : ""}
      ${an && an.porcentaje != null && an.porcentaje < 100 ? `<li><i class="v3-rayado"></i>Sin cubrir (con «Puntos débiles»)</li>` : ""}</ul>
      ${todos.some((e) => e.inst) ? `<p class="v3-nota">Con aro naranja: lo que se agrega.</p>` : ""}${todos.some((e) => e.prev) ? `<p class="v3-nota">Atenuado: lo que ya está instalado.</p>` : ""}
      <p class="v3-nota">Arrastrá para girar · dos dedos para acercar · tocá una cámara para ver lo que ve.</p>`;
    ley.open = abierto;
  };
  const pintarBarra = () => {
    const v = visor ? visor.vista : {};
    if (visor && visor.enCamara) {
      const m = visor.momentoActual;
      barra.innerHTML = [["manana", "Mañana"], ["mediodia", "Mediodía"], ["tarde", "Tarde"], ["noche", "Noche"]].map(([k, t]) => `<button type="button" data-momento="${k}" class="${m === k ? "on" : ""}">${t}</button>`).join("") + `<button type="button" data-a="salircam" class="v3-fuerte">Salir de la cámara</button>`;
      return;
    }
    barra.innerHTML = editando
      ? `<button type="button" data-a="deshacer" ${pila.length ? "" : "disabled"}>Deshacer</button><button type="button" data-a="lista">Lista</button><button type="button" data-a="completar" class="v3-fuerte">Completar la protección</button><button type="button" data-a="debiles" class="${debiles ? "on" : ""}">Puntos débiles</button><button type="button" data-a="vistaed">${vistaEd === "planta" ? "Ver en 3D" : "Ver de arriba"}</button><button type="button" data-a="listo" class="on">Listo</button>`
      : `<button type="button" data-a="antes" class="${sinAlarma ? "on" : ""}">${sinAlarma ? "Ver con SAT" : "Ver sin alarma"}</button><button type="button" data-a="simular">${visor && visor.simulando ? "Parar" : "Simular intruso"}</button><button type="button" data-a="vista">Vista ▾</button>${ed ? `<button type="button" data-a="editar">Editar</button>` : ""}${o.llamar ? `<button type="button" data-a="llamar" class="v3-fuerte">Quiero que me llamen</button>` : ""}${(o.extras || []).map((x, i) => `<button type="button" data-extra="${i}">${esc(x.texto)}</button>`).join("")}${o.botonCerrar ? `<button type="button" data-a="cerrar">Cerrar</button>` : ""}`;
  };
  const decir = (t, alarma, segundos) => {
    clearTimeout(avisoTimer);
    aviso.textContent = t || ""; aviso.classList.toggle("hidden", !t); aviso.classList.toggle("v3-alarma", !!alarma);
    if (t && segundos) avisoTimer = setTimeout(() => decir(editando ? textoEdicion() : ""), segundos * 1000);
  };
  const textoEdicion = () => (moviendo ? "Tocá dónde va " + nombreDe(moviendo.tipo).toLowerCase() + "." : sello ? "Tocá en la casa donde va cada " + nombreDe(sello).replace(/\s*\(.*?\)/g, "").toLowerCase() + ". Tocá el ícono de nuevo para terminar." : "Arrastrá un equipo de abajo hasta la casa, o tocá un equipo para moverlo o girarlo.");
  const armar = (mantenerCamara) => {
    const v = visor ? visor.vista : {};
    const cam = mantenerCamara && visor && !visor.enCamara ? visor.estadoCamara() : null;
    if (visor) visor.destruir();
    visor = Croquis3D.crear(lienzo, filtro(paginas[pag].elementos), { paraCaptura: o.paraCaptura, paredesBajas: v.paredesBajas, cobertura: v.cobertura, debiles: debiles || (sinAlarma && !presentando), muebles: verMuebles && !sinAlarma, alarma: capaAlarma, camaras: capaCamaras, camaraInicial: cam, alTocar: tocar, editable: () => editando, alArrastrar: arrastre, ...opcionesPisos() });
    if (sel) visor.marcar(sel.id);
  };
  const cerrarHoja = () => { hoja.classList.add("hidden"); hoja.innerHTML = ""; hoja.onclick = null; sel = null; if (visor) visor.marcar(null); };
  const repintar = () => { armar(true); pintarLeyenda(); pintarBarra(); pintarProps(); };
  const cambiar = (fn) => {
    pila.push({ pag, els: JSON.stringify(paginas[pag].elementos) });
    if (pila.length > 60) pila.shift();
    const antes = visor && visor.analisis ? visor.analisis.porcentaje : null, abiertasAntes = visor && visor.analisis ? visor.analisis.aberturasSinProteger.length : 0;
    fn(paginas[pag].elementos);
    repintar();
    ed.alCambiar(paginas[pag].idx, JSON.parse(JSON.stringify(paginas[pag].elementos)));
    // Qué cambió en la protección.
    const an = visor.analisis;
    if (an && antes != null && an.porcentaje != null && (an.porcentaje !== antes || an.aberturasSinProteger.length !== abiertasAntes)) {
      const ab = an.aberturasSinProteger.length;
      decir(`Cobertura: ${antes}% → ${an.porcentaje}%${ab !== abiertasAntes ? ` · ${ab === 0 ? "todas las aberturas protegidas" : ab + " abertura" + (ab > 1 ? "s" : "") + " sin sensor"}` : ""}`, false, 3);
    }
  };
  const nuevoEquipo = (preset) => {
    croquisUsoSumar(preset);
    const { tipo, ...marcas } = croquis3dDePreset(preset);
    const el = { id: idNuevo(), t: "simbolo", tipo, x: 0, y: 0, rot: 0, esc: 1, ...marcas };
    if (CROQUIS_3D_CON_ZONA.includes(tipo)) el.etq = siguienteZona();
    if (ed && ed.marcarInst) el.inst = true;
    return el;
  };
  // Mover arrastrando y girar con la manija (los gestos los detecta la escena).
  function arrastre(ev) {
    if (!editando) return;
    if (ev.fase === "inicio") { cerrarHoja(); limpiarPropuesta(); }
    if (ev.fase === "mueve") { const t = { ...ev.equipo }; Croquis3D.ubicar(t, ev.punto, paginas[pag].elementos); visor.previa(t); }
    if (ev.fase === "suelta") { const id = ev.equipo.id; cambiar((els) => { const x = els.find((y) => y.id === id); if (x) Croquis3D.ubicar(x, ev.punto, els); }); hojaEquipo({ id }); }
    if (ev.fase === "girado") { const id = ev.equipo.id; cambiar((els) => { const x = els.find((y) => y.id === id); if (x) { x.rot = ev.rot; delete x.esp; } }); hojaEquipo({ id }); }
  }
  // Tira de equipos: arrastrar uno hasta la casa lo pone ahí; tocarlo deja
  // el "sello" puesto (cada toque en la casa pone otro igual).
  const CORTO = { infrarrojo: "Movimiento", magnetico: "Apertura", humo: "Humo", sirena_int: "Sirena int.", sirena_ext: "Sirena ext.", teclado: "Teclado", central: "Central", camara_ip: "Cámara" };
  // La tira de abajo: los 8 más usados (de entrada, los de siempre).
  const TIRA_BASE = ["infrarrojo", "magnetico", "humo", "sirena_int", "sirena_ext", "teclado", "central", "camara_ip"];
  const paletaOrdenada = () => croquisOrdenarPorUso([...TIRA_BASE, ...CROQUIS_3D_PALETA.filter((t) => !TIRA_BASE.includes(t))]).filter((t) => CROQUIS_SIMBOLOS[t.split("|")[0]]);
  let TIRA = paletaOrdenada().slice(0, 8);
  const pintarTira = () => {
    tira.classList.toggle("hidden", !editando);
    if (!sello) TIRA = paletaOrdenada().slice(0, 8);
    const base = (t) => t.split("|")[0], marcas = (t) => croquis3dDePreset(t);
    tira.innerHTML = TIRA.filter((t) => CROQUIS_SIMBOLOS[base(t)]).map((t) => `<button type="button" data-tipo="${t}" class="${sello === t ? "on" : ""}" title="${esc(nombreDe(t))}"><svg viewBox="${CROQUIS_SIMBOLOS[base(t)].vb || (() => { const r = Math.max(28, CROQUIS_SIMBOLOS[base(t)].r + 4); return `${-r} ${-r} ${r * 2} ${r * 2}`; })()}">${typeof croquisSimboloSvg === "function" ? croquisSimboloSvg(base(t), undefined, { ...marcas(t), t: "simbolo" }) : ""}</svg><span>${esc(CORTO[t] || nombreDe(t).replace(/^Sensor de movimiento/, "Movimiento").replace(/^Sensor de /, ""))}</span></button>`).join("") + `<button type="button" data-tipo="__mas"><b>+</b><span>Más</span></button>`;
  };
  tira.addEventListener("pointerdown", (ev) => {
    const b = ev.target.closest("[data-tipo]"); if (!b || !editando) return;
    const tipo = b.dataset.tipo;
    if (tipo === "__mas") return;
    ev.preventDefault();
    const x0 = ev.clientX, y0 = ev.clientY;
    let arrastrando = false, temp = null;
    try { b.setPointerCapture(ev.pointerId); } catch (e) { /* nada */ }
    const sobreBotones = (x, y) => { const el = document.elementFromPoint(x, y); return !!(el && pie.contains(el)); };
    const mover = (e2) => {
      if (!arrastrando && Math.hypot(e2.clientX - x0, e2.clientY - y0) < 12) return;
      if (!arrastrando) { arrastrando = true; cerrarHoja(); limpiarPropuesta(); }
      const p = sobreBotones(e2.clientX, e2.clientY) ? null : visor.pisoEn(e2.clientX, e2.clientY);
      if (!p) { visor.previa(null); temp = null; return; }
      temp = temp || nuevoEquipo(tipo);
      Croquis3D.ubicar(temp, p, paginas[pag].elementos);
      visor.previa(temp);
    };
    const fin = (e2) => {
      b.removeEventListener("pointermove", mover); b.removeEventListener("pointerup", fin); b.removeEventListener("pointercancel", fin);
      visor.previa(null);
      if (!arrastrando) { sello = sello === tipo ? null : tipo; pintarTira(); decir(textoEdicion()); return; }
      if (temp && e2.type === "pointerup") { const el = temp; cambiar((els) => els.push(el)); hojaEquipo(el); }
    };
    b.addEventListener("pointermove", mover); b.addEventListener("pointerup", fin); b.addEventListener("pointercancel", fin);
  });
  tira.addEventListener("click", (ev) => {
    const b = ev.target.closest('[data-tipo="__mas"]'); if (!b) return;
    // Lista completa para elegir el sello.
    hoja.innerHTML = `<b>¿Qué querés poner?</b><div class="v3-paleta">${paletaOrdenada().map((t) => `<button type="button" data-tipo="${t}"><i style="background:${colorDe(t)}"></i>${esc(nombreDe(t))}</button>`).join("")}</div><p class="v3-nota" style="margin-top:8px">Después tocá en la casa donde va cada uno.</p><button type="button" class="v3-link" data-h="cancelar">Cancelar</button>`;
    hoja.classList.remove("hidden");
    hoja.onclick = (e2) => { const x = e2.target.closest("button"); if (!x) return; if (x.dataset.tipo) { sello = x.dataset.tipo; pintarTira(); decir(textoEdicion()); } cerrarHoja(); };
  });
  // ---- Completar la protección ----
  function limpiarPropuesta() { if (propuesta) { propuesta = null; if (visor) visor.mostrarPropuestas(null); } }
  function completar() {
    cerrarHoja(); sello = null; pintarTira();
    decir("Buscando dónde hacen falta sensores…");
    setTimeout(() => {
      const r = visor.analisis ? visor.analisis.sugerir() : null;
      if (!r) { decir("Para sugerir hacen falta las paredes de la casa.", false, 3); return; }
      if (!r.elementos.length) { decir(r.antes >= 99 ? "Ya está todo cubierto y las aberturas protegidas." : "No encontré dónde agregar sensores que sumen algo.", false, 4); return; }
      propuesta = { lista: r.elementos.map((e) => ({ ...e, id: idNuevo() })), antes: r.antes, despues: r.despues };
      visor.mostrarPropuestas(propuesta.lista);
      hojaPropuesta();
      decir("");
    }, 30);
  }
  function hojaPropuesta() {
    if (!propuesta) return;
    const l = propuesta.lista;
    if (!l.length) { limpiarPropuesta(); cerrarHoja(); return; }
    const nIR = l.filter((e) => e.tipo === "infrarrojo").length, nMag = l.filter((e) => e.tipo === "magnetico").length;
    const despues = Math.min(100, propuesta.antes + l.reduce((n, e) => n + (e.ganancia || 0), 0));
    const partes = [nIR ? `${nIR} ${nIR === 1 ? "sensor" : "sensores"} de movimiento` : "", nMag ? `${nMag} de apertura` : ""].filter(Boolean).join(" y ");
    hoja.innerHTML = `<b>Te propongo ${partes}</b><p>La cobertura pasaría de <strong>${propuesta.antes}%</strong> a <strong>${nIR ? "~" + despues : propuesta.antes}%</strong>${nMag ? " y quedarían protegidas las aberturas que dan afuera" : ""}.</p><p class="v3-nota">Están en amarillo con lo que suma cada uno. Tocá uno para sacarlo de la propuesta.</p>
      <div class="v3-acciones"><button type="button" data-h="todos" class="v3-primario">Agregar ${l.length === 1 ? "este" : "los " + l.length}</button></div><button type="button" class="v3-link" data-h="cancelar">Cancelar</button>`;
    hoja.classList.remove("hidden");
    hoja.onclick = (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.h === "cancelar") { limpiarPropuesta(); cerrarHoja(); return; }
      if (b.dataset.h === "todos") {
        const lista = propuesta.lista;
        limpiarPropuesta(); cerrarHoja();
        // De a uno, así cada uno toma la zona siguiente.
        cambiar((els) => lista.forEach((e) => { const x = nuevoEquipo(e.tipo); x.x = e.x; x.y = e.y; x.rot = e.rot; els.push(x); }));
      }
    };
  }
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
    hoja.innerHTML = `<b>¿Qué agregás acá?</b><div class="v3-paleta">${paletaOrdenada().map((t) => `<button type="button" data-tipo="${t}"><i style="background:${colorDe(t)}"></i>${esc(nombreDe(t))}</button>`).join("")}</div><button type="button" class="v3-link" data-h="cancelar">Cancelar</button>`;
    hoja.classList.remove("hidden");
    hoja.onclick = (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.h === "cancelar") { cerrarHoja(); return; }
      const tipo = b.dataset.tipo; if (!tipo) return;
      const el = nuevoEquipo(tipo);
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
    hoja.innerHTML = `<b>${esc(croquis3dNombre(sel))}${sel.etq ? " · zona " + esc(sel.etq) : ""}</b>${sel.prev ? `<p class="v3-nota">Ya estaba instalado.</p>` : ""}
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
  function tocar({ equipo, punto, propuesta: iProp }) {
    if (visor.enCamara) return;
    if (iProp != null && propuesta) { propuesta.lista.splice(iProp, 1); visor.mostrarPropuestas(propuesta.lista); hojaPropuesta(); return; }
    if (!editando) {
      if (!equipo || presentando) return;
      hojaQueHace(equipo);
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
    if (punto && sello) {
      const el = nuevoEquipo(sello);
      cambiar((els) => { Croquis3D.ubicar(el, punto, els); els.push(el); });
      return;
    }
    if (punto) hojaPaleta(punto);
  }
  // ---- Simulación ----
  // El que diseña elige por dónde entra (o el peor caso); el cliente ve el recorrido de siempre.
  function hojaEntrada() {
    const ops = visor.analisis ? visor.analisis.opciones() : [];
    hoja.innerHTML = `<b>¿Por dónde entra el intruso?</b><div class="v3-acciones"><button type="button" data-ent="peor" class="v3-primario">El peor caso</button>${ops.map((x, i) => `<button type="button" data-ent="${i}">${esc(x.texto)}</button>`).join("")}</div><button type="button" class="v3-link" data-h="cerrar">Cancelar</button>`;
    hoja.classList.remove("hidden");
    hoja.onclick = (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.h === "cerrar") { cerrarHoja(); return; }
      if (b.dataset.ent === "peor") {
        const p = visor.analisis.peorCaso();
        if (!p) { cerrarHoja(); simular(null); return; }
        simular({ r: p.r }, `El peor caso: ${p.texto.toLowerCase()}${p.distancia == null ? " — así nadie lo detecta" : ` — llega ${String(Math.round(p.distancia * 10) / 10).replace(".", ",")} m sin que lo detecten`}.`);
        return;
      }
      const x = ops[Number(b.dataset.ent)];
      if (x) simular(x.op, x.texto);
    };
  }
  function simular(op, titulo) {
    if (op === undefined && ed && !visor.simulando && visor.analisis && visor.analisis.opciones().length > 1) { hojaEntrada(); return; }
    cerrarHoja();
    if (visor.simulando) { visor.pararSimulacion(); decir(""); pintarBarra(); return; }
    let primera = null;
    const ok = visor.simular((ev) => {
      if (ev.tipo === "entra" && titulo) { decir(titulo); return; }
      if (ev.tipo === "entra") {
        const por = ev.entrada ? (ev.entrada.tipo === "ventana" ? "una ventana" : ev.entrada.tipo.startsWith("porton") ? "el portón" : ev.entrada.tipo === "paso" ? "una abertura" : "una puerta") : "afuera";
        if (ev.porton) decir("Un intruso entra al terreno por " + (ev.porton.tipo.startsWith("porton") ? "el portón" : "la puerta del frente") + " y va hacia la casa…");
        else decir("Un intruso entra por " + por + (ev.protegida === false ? " que no tiene sensor…" : "…"));
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
    }, op || undefined);
    if (!ok) { decir("Para simular hacen falta las paredes de la casa.", false, 3); return; }
    pintarBarra();
  }
  // ---- Vista ▾ ----
  function hojaVista() {
    const v = visor.vista;
    hoja.innerHTML = `<b>Vista</b><div class="v3-acciones"><button type="button" data-h="cobertura" class="${v.cobertura === false ? "" : "on"}">Coberturas</button><button type="button" data-h="debiles" class="${debiles ? "on" : ""}">Puntos débiles</button><button type="button" data-h="paredes" class="${v.paredesBajas ? "on" : ""}">Ver adentro</button><button type="button" data-h="alarma" class="${capaAlarma ? "on" : ""}">Alarma</button><button type="button" data-h="camaras" class="${capaCamaras ? "on" : ""}">Cámaras</button>${visor.analisis && visor.analisis.hayMuebles ? `<button type="button" data-h="muebles" class="${verMuebles ? "on" : ""}">Lo que tapan los muebles</button>` : ""}<button type="button" data-h="arriba">Desde arriba</button><button type="button" data-h="inicio">Vista inicial</button>${o.presentacion ? `<button type="button" data-h="presentacion">Ver la presentación</button>` : ""}</div><button type="button" class="v3-link" data-h="cerrar">Cerrar</button>`;
    hoja.classList.remove("hidden");
    hoja.onclick = (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      const h = b.dataset.h;
      if (h === "debiles") { debiles = !debiles; visor.alternar("debiles"); b.classList.toggle("on", debiles); return; }
      if (h === "cobertura") { b.classList.toggle("on", visor.alternar("cobertura").cobertura); return; }
      if (h === "alarma") { capaAlarma = !capaAlarma; visor.alternar("alarma"); b.classList.toggle("on", capaAlarma); return; }
      if (h === "camaras") { capaCamaras = !capaCamaras; visor.alternar("camaras"); b.classList.toggle("on", capaCamaras); return; }
      if (h === "muebles") { verMuebles = !verMuebles; visor.alternar("muebles"); b.classList.toggle("on", verMuebles); pintarLeyenda(); return; }
      if (h === "presentacion") { cerrarHoja(); presentar(); return; }
      if (h !== "cerrar") visor.alternar(h);
      cerrarHoja();
    };
  }
  // ---- Qué hace cada equipo (al tocarlo) ----
  const dondeEsta = (e) => {
    const els = paginas[pag].elementos;
    const hab = els.find((r) => r.t === "rect" && r.nombre && e.x >= Math.min(r.x, r.x + r.w) && e.x <= Math.max(r.x, r.x + r.w) && e.y >= Math.min(r.y, r.y + r.h) && e.y <= Math.max(r.y, r.y + r.h));
    if (hab) return hab.nombre;
    let mejor = null;
    els.filter((t) => t.t === "texto" && t.texto && !/^\s*\d+\s*$/.test(t.texto) && String(t.texto).length < 30).forEach((t) => { const d = Math.hypot(t.x - e.x, t.y - e.y); if (d < 110 && (!mejor || d < mejor.d)) mejor = { d, t: t.texto }; });
    return mejor ? mejor.t.trim() : "";
  };
  function hojaQueHace(e) {
    const def = CROQUIS_SIMBOLOS[e.tipo] || {};
    let texto = CROQUIS_3D_EXPLICA[e.tipo] || "Forma parte del sistema de seguridad.";
    if (e.tipo === "infrarrojo" && e.video) texto = "Detecta movimiento y en ese momento saca fotos: el monitoreo (y vos, en el celular) ve qué pasó y confirma si es un intruso real.";
    if (e.inal) texto += " Es inalámbrico: funciona a pila y se comunica por radio, sin cables a la central.";
    if (def.ir) { const { ang, doble } = croquisIRParams(e, def); texto += ` Cubre hasta ${ALCANCE_TXT[e.tipo] || "11"} m, en un ángulo de ${doble ? ang * 2 : ang}°.`; }
    if (/^camara/.test(e.tipo)) { const d = croquis3dDori(e); texto += ` Con ${d.mp} MP y lente de ${String(d.lente).replace(".", ",")} mm: identifica una cara hasta ${d.txt.identifica}, reconoce a una persona hasta ${d.txt.reconoce} y la detecta hasta ${d.txt.detecta}.`; }
    const avisosE = ed && visor && visor.analisis && visor.analisis.avisos ? visor.analisis.avisos.filter((a) => a.equipo === e) : [];
    if (avisosE.length) texto += " ⚠ " + avisosE.map((a) => a.texto).join(" ");
    const tapa = visor && visor.analisis ? visor.analisis.tapados.filter((t) => t.equipo === e) : [];
    if (tapa.length) texto += ` Ojo: ${tapa.map((t) => `${croquis3dMueble(t.mueble)} le tapa ${String(t.m2).replace(".", ",")} m²`).join(" y ")} de lo que ve${verMuebles ? "" : " (Vista ▸ Lo que tapan los muebles)"}.`;
    const lugar = dondeEsta(e);
    hoja.innerHTML = `<div class="v3-vitrina"></div><b>${esc(croquis3dNombre(e))}${e.etq ? " · zona " + esc(e.etq) : ""}</b>${lugar ? `<p class="v3-nota">En ${esc(lugar.toLowerCase())}</p>` : ""}<p>${esc(texto)}</p>${e.prev ? `<p class="v3-nota">Ya está instalado.</p>` : e.inst ? `<p class="v3-nota">Se agrega con esta propuesta.</p>` : ""}
      ${esCamara(e) ? `<div class="v3-acciones"><button type="button" data-h="vercam" class="v3-primario">Ver lo que ve</button></div>` : ""}<button type="button" class="v3-link" data-h="cerrar">Cerrar</button>`;
    hoja.classList.remove("hidden");
    // El equipo en 3D, como es de verdad (se libera solo al cerrar la ficha).
    try { Croquis3D.vitrina(hoja.querySelector(".v3-vitrina"), e.tipo, { inal: !!e.inal, video: !!e.video, mascota: !!e.mascota }); } catch (er) { hoja.querySelector(".v3-vitrina").remove(); }
    visor.marcar(e.id);
    hoja.onclick = (ev) => { const b = ev.target.closest("button"); if (!b) return; if (b.dataset.h === "vercam") { verCamara(e); return; } cerrarHoja(); };
  }
  // ---- Antes / después ----
  function ponerSinAlarma(si) {
    if (sinAlarma === si) return;
    sinAlarma = si; visor.pararSimulacion && visor.pararSimulacion();
    cerrarHoja(); armar(true); pintarLeyenda(); pintarBarra();
    if (!presentando) {
      const an = visor.analisis, ab = an ? an.aberturasSinProteger.length : 0;
      decir(si ? (ab ? `Así está hoy: ${ab === 1 ? "1 abertura que da afuera queda" : ab + " aberturas que dan afuera quedan"} sin protección${an && !an.porcentaje ? " y ningún sensor cubre los ambientes" : ""}.` : "Así está hoy, sin el sistema.") : "Con SAT: así queda protegida.", si, 4);
    }
  }
  // ---- Presentación guiada (la ve el cliente al abrir el link) ----
  function presentar() {
    if (editando) return;
    const conteo = () => {
      const c = {};
      paginas.flatMap((p) => p.elementos).filter((e) => e.t === "simbolo" && CROQUIS_SIMBOLOS[e.tipo] && CROQUIS_SIMBOLOS[e.tipo].cat === "equipo" && !e.prev).forEach((e) => { const k = croquis3dNombre(e); c[k] = (c[k] || 0) + 1; });
      return Object.entries(c).map(([k, n]) => `${n} × ${k.toLowerCase()}`);
    };
    const pasos = [
      { t: "Esta es tu casa", p: () => "La armamos a partir del plano. En 4 pasos te mostramos cómo la protege el sistema de SAT.", antes: true, deb: false, vista: "inicio" },
      { t: "Por dónde podrían entrar hoy", p: () => { const ab = visor.analisis ? visor.analisis.aberturasSinProteger.length : 0; return `${ab ? `En rojo, ${ab === 1 ? "la abertura que da afuera y no tiene ningún sensor" : "las " + ab + " aberturas que dan afuera y no tienen ningún sensor"}. ` : ""}En naranja rayado, lo que hoy nadie vigila.`; }, antes: true, deb: true, vista: "inicio" },
      { t: "Lo que instalamos", p: () => { const an = visor.analisis, l = conteo(); return `${l.length ? l.join(", ") + ". " : ""}${an && an.porcentaje != null ? `Los sensores cubren el ${an.porcentaje}% de ${paginas.length > 1 && !todo ? "esta planta" : "la casa"}` : ""}${an && !an.aberturasSinProteger.length ? " y todas las entradas quedan protegidas." : "."}${propuestas.length > 1 ? ` Tenés ${propuestas.length} propuestas para comparar abajo.` : ""}`; }, antes: false, deb: false, vista: "inicio" },
      { t: "Si alguien entra…", p: () => "Mirá qué pasa si alguien entra a la casa.", antes: false, deb: false, vista: "inicio", simular: true },
      { t: "¿Lo charlamos?", p: () => `Podés girar la casa con el dedo, tocar cada equipo para ver qué hace y comparar${propuestas.length > 1 ? " las propuestas" : " cómo está hoy y cómo quedaría"}.`, antes: false, deb: false, final: true },
    ];
    let i = 0;
    presentando = true;
    pie.classList.add("v3-presentando");
    const fin = () => { presentando = null; pie.classList.remove("v3-presentando"); cerrarHoja(); decir(""); ponerSinAlarma(false); pintarBarra(); };
    const mostrar = () => {
      const ps = pasos[i];
      const cambio = ps.antes !== sinAlarma || ps.deb !== debiles;
      sinAlarma = ps.antes; debiles = ps.deb;
      if (cambio) { armar(true); pintarLeyenda(); }
      if (ps.vista) visor.alternar(ps.vista);
      decir("");
      hoja.innerHTML = `<div class="v3-puntos">${pasos.map((x, j) => `<i class="${j === i ? "on" : ""}"></i>`).join("")}</div><b>${ps.t}</b><p class="v3-paso-texto">${ps.p()}</p>
        <div class="v3-acciones">${i > 0 ? `<button type="button" data-h="ant">Anterior</button>` : ""}${ps.final ? (o.llamar ? `<button type="button" data-h="llamar" class="v3-primario">Quiero que me llamen</button>` : "") + (contacto && contacto.nombre ? `<button type="button" data-h="contacto">Hablar con ${esc(contacto.nombre.split(" ")[0])}</button>` : "") + `<button type="button" data-h="fin"${o.llamar ? "" : ' class="v3-primario"'}>Ver la casa por mi cuenta</button>` : `<button type="button" data-h="sig" class="v3-primario">${i === 0 ? "Empezar" : "Siguiente"}</button>`}</div>
        ${ps.final ? "" : `<button type="button" class="v3-link" data-h="fin">Saltar</button>`}`;
      hoja.classList.remove("hidden");
      if (ps.simular) {
        const txt = hoja.querySelector(".v3-paso-texto");
        let primera = null;
        visor.simular((ev) => {
          if (!presentando) return;
          if (ev.tipo === "detecta" && !primera) { primera = ev; croquis3dPitido(660, 0.5); setTimeout(() => croquis3dPitido(880, 0.5), 520); txt.textContent = `¡Lo detectó el ${enFrase(ev.equipo)} a los ${ev.segundos.toFixed(1).replace(".", ",")} segundos y sonó la alarma!`; }
          if (ev.tipo === "fin") txt.textContent = primera ? `Lo detectó el ${enFrase(primera.equipo)} a los ${primera.segundos.toFixed(1).replace(".", ",")} segundos, sonó la alarma y el monitoreo recibe el aviso al instante.` : "Recorrió la casa sin que lo detecten: conviene reforzar algunos puntos.";
        });
      } else visor.pararSimulacion();
      hoja.onclick = (ev) => {
        const b = ev.target.closest("button"); if (!b) return;
        if (b.dataset.h === "sig") { i = Math.min(pasos.length - 1, i + 1); mostrar(); }
        if (b.dataset.h === "ant") { i = Math.max(0, i - 1); mostrar(); }
        if (b.dataset.h === "fin") fin();
        if (b.dataset.h === "llamar") { fin(); hojaLlamar(); }
        if (b.dataset.h === "contacto") { fin(); hojaContacto(); }
      };
    };
    mostrar();
  }
  // ---- Tarjeta de contacto de quien lo asesoró ----
  function hojaContacto() {
    if (!contacto) return;
    const c = contacto, em = c.empresa;
    const ic = {
      wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.1.1.6-.1 1.2Z"/></svg>',
      tel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/></svg>',
      mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
      web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
      ig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
      fb: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v8h4v-8h3l1-4h-4V8.5c0-.3.2-.5.5-.5Z"/></svg>',
      reloj: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    };
    const a = (href, cls, icono, txt) => `<a href="${esc(href)}" target="_blank" rel="noopener" class="${cls}">${icono}${esc(txt)}</a>`;
    const tel = c.telefono || em.telefono;
    const saludo = `Hola${c.nombre ? " " + c.nombre.split(" ")[0] : ""}! Vi la propuesta en 3D de ${titulo}${propuestas.length > 1 ? " (me interesa: " + (propuestas[prop].nombre || "Propuesta " + (prop + 1)) + ")" : ""} y quería consultarte.`;
    hoja.innerHTML = `<div class="v3-tarjeta">
      <div class="v3-tj-cab"><span class="v3-av">${esc(c.iniciales)}</span><div><b>${esc(c.nombre || em.nombre)}</b><small>${esc([c.puesto, c.nombre ? em.nombre : ""].filter(Boolean).join(" · "))}</small></div></div>
      <div class="v3-tj-acc">${c.whatsapp ? a(`https://wa.me/${c.whatsapp}?text=${encodeURIComponent(saludo)}`, "v3-wa", ic.wa, "WhatsApp") : ""}${tel ? a("tel:" + tel.replace(/[^\d+]/g, ""), "", ic.tel, "Llamar") : ""}${c.email ? a("mailto:" + c.email + "?subject=" + encodeURIComponent("Propuesta " + titulo), "", ic.mail, "Mail") : ""}</div>
      ${tel ? `<div class="v3-tj-dato">${ic.tel.replace("<svg ", '<svg width="17" height="17" ')}<span>${esc(tel)}${c.email ? " · " + esc(c.email) : ""}</span></div>` : ""}
      ${em.horarios ? `<div class="v3-tj-dato">${ic.reloj}<span>${esc(em.horarios)}</span></div>` : ""}
      ${em.web || em.instagram || em.facebook ? `<div class="v3-tj-redes">${em.web ? a(em.web, "", ic.web, em.web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")) : ""}${em.instagram ? a(em.instagram, "", ic.ig, "Instagram") : ""}${em.facebook ? a(em.facebook, "", ic.fb, "Facebook") : ""}</div>` : ""}
      <div class="v3-acciones"><button type="button" data-h="guardar" class="v3-primario">Guardar contacto</button>${o.llamar ? `<button type="button" data-h="llamar">Quiero que me llamen</button>` : ""}</div>
      <button type="button" class="v3-link" data-h="cerrar">Cerrar</button></div>`;
    hoja.classList.remove("hidden");
    hoja.onclick = (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.h === "cerrar") cerrarHoja();
      if (b.dataset.h === "llamar") hojaLlamar();
      if (b.dataset.h === "guardar") {
        // vCard: el teléfono la abre y ofrece agendar el contacto.
        const ln = document.createElement("a");
        ln.href = URL.createObjectURL(new Blob([croquis3dVCard(c)], { type: "text/vcard;charset=utf-8" }));
        setTimeout(() => URL.revokeObjectURL(ln.href), 60000);
        ln.download = ((c.nombre || em.nombre || "contacto").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s-]/g, "").trim() || "contacto") + ".vcf";
        document.body.appendChild(ln); ln.click(); ln.remove();
        decir("Abrí el archivo para agendar el contacto.", false, 3);
      }
    };
  }
  // ---- Lista de equipos: se elige uno y queda seleccionado ----
  function hojaLista() {
    const eqs = paginas[pag].elementos.filter((e) => e.t === "simbolo" && CROQUIS_SIMBOLOS[e.tipo] && CROQUIS_SIMBOLOS[e.tipo].cat === "equipo");
    const orden = (e) => parseInt(String(e.etq || "").replace(/\D/g, ""), 10) || 9999;
    const grupo = (titulo, l) => (l.length ? `<b>${titulo}</b><div class="v3-lista">${l.sort((a, b) => orden(a) - orden(b)).map((e) => `<button type="button" data-eq="${esc(e.id)}"><i style="background:${colorDe(e.tipo)}"></i>${esc(croquis3dNombre(e))}${e.etq ? ` <small>zona ${esc(e.etq)}</small>` : ""}${e.inst ? ' <small class="v3-inst">a instalar</small>' : ""}</button>`).join("")}</div>` : "");
    hoja.innerHTML = (grupo("Alarma", eqs.filter((e) => !croquisEsVideo(e.tipo))) + grupo("Cámaras y video", eqs.filter((e) => croquisEsVideo(e.tipo)))) || "<p>No hay equipos en esta planta.</p>";
    hoja.innerHTML += `<button type="button" class="v3-link" data-h="cerrar">Cerrar</button>`;
    hoja.classList.remove("hidden");
    hoja.onclick = (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.h === "cerrar") { cerrarHoja(); return; }
      if (b.dataset.eq) hojaEquipo({ id: b.dataset.eq });
    };
  }
  // ---- Arreglar un aviso con un toque ----
  function hojaArreglo(a) {
    const opts = ARREGLOS[a.tipo] || [];
    const nombres = { girar: "Girarlo", alcance: "Achicar el alcance", repetidor: "Agregar un repetidor", norte: "Poner el Norte" };
    hoja.innerHTML = `<b>${a.equipo ? esc(croquis3dNombre(a.equipo)) + zonaDe(a.equipo) : "Arreglar"}</b><p>${esc(a.texto)}</p><div class="v3-acciones">${opts.map((k) => `<button type="button" data-arr="${k}">${nombres[k]}</button>`).join("")}</div><button type="button" class="v3-link" data-h="cerrar">Cancelar</button>`;
    hoja.classList.remove("hidden");
    hoja.onclick = (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.h === "cerrar") { cerrarHoja(); return; }
      const k = b.dataset.arr, id = a.equipo && a.equipo.id;
      if (k === "girar") {
        decir("Buscando el giro que lo arregla…");
        setTimeout(() => {
          const base = paginas[pag].elementos, el = base.find((x) => x.id === id);
          if (!el) return;
          const quedan = (els) => { const r = Croquis3D.analizar(els); return r ? r.avisos.filter((x) => x.equipo && x.equipo.id === id && x.tipo === a.tipo).length : 0; };
          let giro = null;
          for (const d of [15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90]) {
            const copia = base.map((x) => (x.id === id ? { ...x, rot: (((x.rot || 0) + d) % 360 + 360) % 360 } : x));
            if (!quedan(copia)) { giro = d; break; }
          }
          if (giro == null) { cerrarHoja(); decir("Girándolo no se arregla: probá achicarle el alcance o moverlo.", true, 4); return; }
          cerrarHoja();
          cambiar((els) => { const x = els.find((y) => y.id === id); if (x) x.rot = (((x.rot || 0) + giro) % 360 + 360) % 360; });
          decir(`Listo: lo giré ${Math.abs(giro)}° ${giro > 0 ? "a la derecha" : "a la izquierda"}.`, false, 4);
        }, 30);
        return;
      }
      if (k === "alcance") {
        cerrarHoja();
        const s0 = visor.analisis.sensores.find((x) => x.el.id === id), nuevo = Math.max(3, Math.round((s0 ? s0.alc : 10) * 0.6 * 2) / 2);
        cambiar((els) => { const x = els.find((y) => y.id === id); if (x) x.alcReal = nuevo; });
        decir(`Listo: alcance de ${String(nuevo).replace(".", ",")} m (se regula en el sensor).`, false, 4);
        return;
      }
      if (k === "repetidor") {
        cerrarHoja();
        const de = a.base, eq = a.equipo;
        if (!de || !eq) return;
        const r = nuevoEquipo("repetidor");
        cambiar((els) => {
          r.x = Math.round((de.x + eq.x) / 2); r.y = Math.round((de.y + eq.y) / 2);
          Croquis3D.ubicar(r, [r.x, r.y], els);
          els.push(r);
        });
        decir("Listo: agregué un repetidor entre los dos. Movelo si hace falta.", false, 4);
        return;
      }
      if (k === "norte") {
        cerrarHoja();
        cambiar((els) => { const c = croquisCaja({ elementos: els }); els.push({ id: idNuevo(), t: "simbolo", tipo: "norte", x: Math.round(c.x + c.w + 60), y: Math.round(c.y + 40), rot: 0, esc: 1 }); });
        decir("Puse el Norte apuntando para arriba: en el plano, giralo hasta que apunte al norte real.", false, 5);
      }
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
  // El cliente: la primera vez que abre el link arranca la presentación.
  if (o.presentacion && o.presentacionAuto !== false) {
    let vista = false;
    try { vista = !!localStorage.getItem("v3-presentacion:" + (o.clave || titulo)); localStorage.setItem("v3-presentacion:" + (o.clave || titulo), "1"); } catch (e) { vista = false; }
    if (!vista) setTimeout(() => { if (!editando) presentar(); }, 700);
  }
  pagsEl.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-pag]"); if (!b) return;
    if (b.dataset.pag === "todo") { todo = true; pag = pisosDe()[0].i; } else { todo = false; pag = Number(b.dataset.pag); }
    if (todo && editando) { editando = false; moviendo = null; ley.classList.remove("hidden"); }
    moviendo = null; cerrarHoja(); armar(false); pintarLeyenda(); pintarPags(); pintarBarra();
    decir(editando ? textoEdicion() : "");
  });
  propsEl.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-prop]"); if (!b) return;
    prop = Number(b.dataset.prop); paginas = propuestas[prop].paginas; pag = Math.min(pag, paginas.length - 1);
    if (pisosDe().length >= 2) { todo = true; pag = pisosDe()[0].i; } else todo = false;
    cerrarHoja(); decir(""); armar(true);
    pintarLeyenda(); pintarProps(); pintarPags(); pintarBarra();
  });
  ley.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-arreglo]"); if (!b || !ed || !visor || !visor.analisis) return;
    ev.preventDefault();
    const a = visor.analisis.avisos[Number(b.dataset.arreglo)];
    if (a) hojaArreglo(a);
  });
  const btnAsesor = raiz.querySelector(".v3-asesor");
  if (btnAsesor) btnAsesor.addEventListener("click", () => { if (!editando) { if (visor) visor.pararSimulacion(); hojaContacto(); } });
  barra.addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.extra != null) { const x = o.extras[Number(b.dataset.extra)]; if (x && x.alHacer) x.alHacer(); return; }
    if (b.dataset.momento) {
      const m = visor.momentoActual === b.dataset.momento ? null : b.dataset.momento;
      const r = visor.momento(m) || {};
      pintarBarra();
      const nombre = { manana: "A la mañana", mediodia: "Al mediodía", tarde: "A la tarde" }[m];
      if (!m) decir("Lo que ve la cámara.");
      else if (m === "noche") decir(`De noche: la cámara ve con su infrarrojo, en blanco y negro${r.reflectores ? `, y ${r.reflectores === 1 ? "el reflector ilumina" : "los reflectores iluminan"} el patio` : ". Un reflector con sensor ayudaría a ver mejor"}.`);
      else decir(r.contraluz ? `${nombre} le da el sol de frente: contraluz, la imagen se encandila. Conviene una cámara con WDR o girarla.` : `${nombre}: el sol no le da de frente.`, !!r.contraluz);
      return;
    }
    const a = b.dataset.a;
    if (a === "cerrar") { if (o.alCerrar) o.alCerrar(); return; }
    if (a === "salircam") { salirCamara(); return; }
    if (a === "simular") { simular(); return; }
    if (a === "vista") { hojaVista(); return; }
    if (a === "llamar") { hojaLlamar(); return; }
    if (a === "debiles") { debiles = !debiles; visor.alternar("debiles"); b.classList.toggle("on", debiles); return; }
    if (a === "antes") { ponerSinAlarma(!sinAlarma); return; }
    if (a === "editar" && sinAlarma) { sinAlarma = false; armar(true); pintarLeyenda(); }
    if (a === "editar" && todo) { todo = false; pintarPags(); armar(false); decir("Editás la " + (paginas[pag].nombre || "planta baja").toLowerCase() + ". Para otra planta, elegila a la izquierda.", false, 4); }
    if (a === "editar") { visor.pararSimulacion(); editando = true; ley.classList.add("hidden"); if (!visor.vista.paredesBajas) visor.alternar("paredes"); vistaEd = "planta"; visor.vistaPlanta(); cerrarHoja(); pintarBarra(); pintarProps(); pintarTira(); decir(textoEdicion()); return; }
    if (a === "listo") { editando = false; moviendo = null; sello = null; limpiarPropuesta(); ley.classList.remove("hidden"); cerrarHoja(); decir(""); visor.marcar(null); pintarBarra(); pintarProps(); pintarTira(); return; }
    if (a === "completar") { completar(); return; }
    if (a === "lista") { hojaLista(); return; }
    if (a === "vistaed") { vistaEd = vistaEd === "planta" ? "3d" : "planta"; if (vistaEd === "planta") visor.vistaPlanta(); else visor.vistaInclinada(); pintarBarra(); return; }
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
  return { destruir() { visor.destruir(); raiz.innerHTML = ""; }, captura() { return visor.captura(); }, get visor() { return visor; }, get paginas() { return paginas; }, presentar, contacto: hojaContacto };
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
var op={presentacion:d.presentacion!==false,clave:d.id||d.titulo};
if(d.id&&d.servidor){try{fetch(d.servidor+"/api/datos?publico=vista3d&id="+d.id).catch(function(){});}catch(e){}
op.llamar=function(p){return fetch(d.servidor+"/api/datos?publico=vista3d_llamar",{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify(Object.assign({id:d.id},p))}).then(function(r){return r.json().then(function(x){if(!r.ok)throw new Error(x.error||"No se pudo enviar");return x;});},function(){throw new Error("Sin conexión: escribinos por WhatsApp.");});};}
iniciarVisor3D(d,op);})();<\/script>
</body></html>`;
}
if (typeof window !== "undefined") window.croquis3dHtmlIndependiente = croquis3dHtmlIndependiente;
