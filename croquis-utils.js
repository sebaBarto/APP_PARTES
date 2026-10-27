// Croquis: dibujo y exportación (SVG, PNG y PDF) compartidos por la app
// (editor) y el panel de administración (lista y descargas).
//
// Un croquis es { v: 1, elementos: [...] } en coordenadas de "mundo"
// (la grilla es de 20 unidades). Tipos de elemento:
//   rect    { x, y, w, h, nombre }       habitación
//   linea   { x1, y1, x2, y2, trazo?, color? }   pared / tabique
//   cable   { pts: [[x,y], ...], color?, trazo?, nombre? }  cableado (curva suave)
//   texto   { x, y, texto, tam }              (puede tener varias líneas)
//   tabla   { x, y, celdas: [[..]], tam, enc, color? }  cuadro de texto o tabla
//   rect.forma: rect | elipse | triangulo | triangulo_rect (ori 0-3); color?, trazo?
//   bloq: true en cualquier elemento = bloqueado en el editor
//   simbolo { tipo, x, y, rot, esc, color?, esp? }  equipos y objetos de obra

const CROQUIS_GRILLA = 20;

// Cada símbolo se dibuja centrado en 0,0 con dib(color). "cat" separa los
// equipos (van en la leyenda y se pueden pintar de otro color) de los
// objetos de obra (puertas, ventanas, piscina...). "r": radio aproximado.
const CROQUIS_FUENTE = 'font-family="Arial, Helvetica, sans-serif" font-weight="700"';
const CROQUIS_SIMBOLOS = {
  central: {
    nombre: "Central", cat: "equipo", color: "#F2C94C", r: 30,
    dib: (c) => `<rect x="-24" y="-15" width="48" height="30" fill="${c}" stroke="#1C1E21" stroke-width="2.6"/><line x1="-24" y1="-15" x2="24" y2="15" stroke="#1C1E21" stroke-width="2"/>`,
  },
  hub: {
    nombre: "Hub (Ajax)", cat: "equipo", color: "#D9D9D9", r: 22,
    dib: (c) => `<rect x="-16" y="-16" width="32" height="32" rx="8" fill="${c}" stroke="#1C1E21" stroke-width="2.6"/>`,
  },
  repetidor: {
    nombre: "Repetidor ReX", cat: "equipo", color: "#D9D9D9", r: 22,
    dib: (c) => `<rect x="-16" y="-16" width="32" height="32" rx="8" fill="${c}" stroke="#1C1E21" stroke-width="2.6"/><text x="0" y="4.5" text-anchor="middle" ${CROQUIS_FUENTE} font-size="12" fill="#1C1E21">ReX</text>`,
  },
  teclado: {
    nombre: "Teclado", cat: "equipo", color: "#D9D9D9", r: 22,
    dib: (c) => `<rect x="-18" y="-6" width="36" height="12" fill="${c}" stroke="#1C1E21" stroke-width="2.4"/>`,
  },
  sirena_ext: {
    nombre: "Sirena exterior", cat: "equipo", color: "#D9D9D9", r: 26,
    dib: (c) => croquisSirena(c, 1),
  },
  sirena_int: {
    nombre: "Sirena interior", cat: "equipo", color: "#D9D9D9", r: 17,
    dib: (c) => croquisSirena(c, 0.62),
  },
  magnetico: {
    nombre: "Magnético", cat: "equipo", color: "#2E9E4F", r: 12,
    dib: (c) => `<circle cx="0" cy="0" r="8" fill="${c}" stroke="#FFFFFF" stroke-width="2"/><circle cx="0" cy="0" r="9.5" fill="none" stroke="${c}" stroke-width="1.2"/>`,
  },
  // Infrarrojos: cuadrado con la captación saliendo de un vértice. Se
  // puede cambiar alcance (alc), ángulo (ang), doble lente y video.
  infrarrojo: {
    nombre: "Infrarrojo", cat: "equipo", color: "#E00000", ir: true, alc: 70, ang: 90, vb: "-84 -84 110 110",
    dib: (c, el) => croquisIR(c, el, CROQUIS_SIMBOLOS.infrarrojo),
  },
  infrarrojo_ext: {
    nombre: "Infrarrojo exterior", cat: "equipo", color: "#7B4B94", ir: true, alc: 70, ang: 90, vb: "-84 -84 110 110",
    dib: (c, el) => croquisIR(c, el, CROQUIS_SIMBOLOS.infrarrojo_ext),
  },
  infrarrojo_cortina: {
    nombre: "Infrarrojo cortina", cat: "equipo", color: "#7B4B94", ir: true, alc: 150, ang: 25, vb: "-120 -120 146 146",
    dib: (c, el) => croquisIR(c, el, CROQUIS_SIMBOLOS.infrarrojo_cortina),
  },
  humo: {
    nombre: "Detector de humo", cat: "equipo", color: "#1C1E21", r: 16,
    dib: (c) => `<circle cx="0" cy="0" r="12" fill="#FFFFFF" fill-opacity="0.001" stroke="${c}" stroke-width="2.6"/>`,
  },
  gas: {
    nombre: "Detector de gas", cat: "equipo", color: "#1C1E21", r: 16,
    dib: (c) => `<circle cx="0" cy="0" r="12" fill="#FFFFFF" fill-opacity="0.001" stroke="${c}" stroke-width="2.6"/><text x="0" y="3.2" text-anchor="middle" ${CROQUIS_FUENTE} font-size="8.5" fill="${c}">Gas</text>`,
  },
  pulsador_incendio: {
    nombre: "Pulsador de incendio", cat: "equipo", color: "#E00000", r: 16,
    dib: (c) => `<rect x="-11" y="-11" width="22" height="22" rx="2" fill="${c}" stroke="#1C1E21" stroke-width="2"/><circle cx="0" cy="0" r="5.5" fill="#FFFFFF" stroke="#1C1E21" stroke-width="1"/>`,
  },
  pulsador_asalto: {
    nombre: "Pulsador de asalto", cat: "equipo", color: "#1B5FA8", r: 16,
    dib: (c) => `<rect x="-11" y="-11" width="22" height="22" rx="2" fill="${c}" stroke="#1C1E21" stroke-width="2"/><circle cx="0" cy="-3" r="4.5" fill="#FFFFFF" stroke="#1C1E21" stroke-width="1"/><text x="0" y="8.5" text-anchor="middle" ${CROQUIS_FUENTE} font-size="5.5" fill="#FFFFFF">SOS</text>`,
  },
  dvr: {
    nombre: "DVR / NVR", cat: "equipo", color: "#1C1E21", r: 28,
    dib: (c) => `<rect x="-24" y="-12" width="48" height="24" rx="3" fill="#FFFFFF" stroke="${c}" stroke-width="2.6"/><text x="-4" y="5" text-anchor="middle" ${CROQUIS_FUENTE} font-size="12" fill="${c}">DVR</text><circle cx="15" cy="-3" r="2" fill="#2E9E4F"/><circle cx="15" cy="4" r="2" fill="${c}" opacity="0.5"/>`,
  },
  camara_ip: {
    nombre: "Cámara IP", cat: "equipo", color: "#17809B", r: 32,
    dib: (c) => `<path d="M0 2 L-20 -26 L20 -26 Z" fill="${c}" fill-opacity="0.16" stroke="${c}" stroke-width="1.2" stroke-dasharray="3 2"/><rect x="-7" y="-4" width="14" height="20" rx="3" fill="#FFFFFF" stroke="${c}" stroke-width="2.4"/><circle cx="0" cy="-4" r="4.5" fill="${c}"/><text x="0" y="12" text-anchor="middle" ${CROQUIS_FUENTE} font-size="7.5" fill="${c}">IP</text>`,
  },
  camara_analoga: {
    nombre: "Cámara analógica", cat: "equipo", color: "#8A5A00", r: 32,
    dib: (c) => `<path d="M0 0 L-20 -26 L20 -26 Z" fill="${c}" fill-opacity="0.16" stroke="${c}" stroke-width="1.2" stroke-dasharray="3 2"/><path d="M-12 8 A 12 12 0 0 1 12 8 Z" fill="#FFFFFF" stroke="${c}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="0" cy="2" r="3.8" fill="${c}"/><text x="0" y="19" text-anchor="middle" ${CROQUIS_FUENTE} font-size="7.5" fill="${c}">AN</text>`,
  },
  monitor: {
    nombre: "Monitor", cat: "equipo", color: "#1C1E21", r: 22,
    dib: (c) => `<rect x="-17" y="-13" width="34" height="22" rx="2" fill="#D6E4F0" stroke="${c}" stroke-width="2.4"/><path d="M-3 9 L-5 15 M3 9 L5 15 M-9 15.5 L9 15.5" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`,
  },
  // ---- Objetos de obra (centrados sobre la pared cuando son aberturas) ----
  puerta: {
    nombre: "Puerta", cat: "obra", color: "#1C1E21", r: 40, espejable: true,
    dib: (c) => `<rect x="-20" y="-4.5" width="40" height="9" fill="#FFFFFF"/><line x1="-20" y1="-6" x2="-20" y2="6" stroke="${c}" stroke-width="2.5"/><line x1="20" y1="-6" x2="20" y2="6" stroke="${c}" stroke-width="2.5"/><path d="M-20 0 L-20 -40" stroke="${c}" stroke-width="2.6"/><path d="M-20 -40 A 40 40 0 0 1 20 0" fill="none" stroke="${c}" stroke-width="1.2" stroke-dasharray="4 3"/>`,
  },
  ventana: {
    nombre: "Ventana", cat: "obra", color: "#1C1E21", r: 26,
    dib: (c) => `<rect x="-22" y="-4.5" width="44" height="9" fill="#FFFFFF" stroke="${c}" stroke-width="1.6"/><line x1="-22" y1="0" x2="22" y2="0" stroke="${c}" stroke-width="1.2"/><line x1="0" y1="-4.5" x2="0" y2="4.5" stroke="${c}" stroke-width="1"/>`,
  },
  corrediza: {
    nombre: "Abertura corrediza", cat: "obra", color: "#1C1E21", r: 34, espejable: true,
    dib: (c) => `<rect x="-30" y="-5" width="60" height="10" fill="#FFFFFF"/><line x1="-30" y1="-6" x2="-30" y2="6" stroke="${c}" stroke-width="2.5"/><line x1="30" y1="-6" x2="30" y2="6" stroke="${c}" stroke-width="2.5"/><line x1="-30" y1="-2" x2="4" y2="-2" stroke="${c}" stroke-width="2.4"/><line x1="-4" y1="2.5" x2="30" y2="2.5" stroke="${c}" stroke-width="2.4"/><path d="M-12 -9 L0 -9 M-4 -12 L0 -9 L-4 -6" fill="none" stroke="${c}" stroke-width="1.2"/>`,
  },
  columna: {
    nombre: "Columna", cat: "obra", color: "#1C1E21", r: 12,
    dib: (c) => `<rect x="-8" y="-8" width="16" height="16" fill="${c}"/><path d="M-8 -8 L8 8 M8 -8 L-8 8" stroke="#FFFFFF" stroke-width="1" opacity="0.6"/>`,
  },
  columna_redonda: {
    nombre: "Columna redonda", cat: "obra", color: "#1C1E21", r: 12,
    dib: (c) => `<circle cx="0" cy="0" r="8.5" fill="${c}"/><circle cx="0" cy="0" r="4" fill="none" stroke="#FFFFFF" stroke-width="1" opacity="0.6"/>`,
  },
  porton_batiente: {
    nombre: "Portón de 2 hojas", cat: "obra", color: "#1C1E21", r: 56,
    dib: (c) => `<rect x="-50" y="-4.5" width="100" height="9" fill="#FFFFFF"/><rect x="-54" y="-5" width="6" height="10" fill="${c}"/><rect x="48" y="-5" width="6" height="10" fill="${c}"/><line x1="-48" y1="0" x2="-48" y2="-48" stroke="${c}" stroke-width="3"/><line x1="48" y1="0" x2="48" y2="-48" stroke="${c}" stroke-width="3"/><path d="M-48 -48 A 48 48 0 0 1 0 0 A 48 48 0 0 1 48 -48" fill="none" stroke="${c}" stroke-width="1.2" stroke-dasharray="4 3"/>`,
  },
  porton_corredizo: {
    nombre: "Portón corredizo", cat: "obra", color: "#1C1E21", r: 100, espejable: true, vb: "-60 -60 215 120",
    dib: (c) => `<rect x="-50" y="-4.5" width="100" height="9" fill="#FFFFFF"/><rect x="-54" y="-5" width="6" height="10" fill="${c}"/><rect x="48" y="-5" width="6" height="10" fill="${c}"/><rect x="-48" y="-11" width="96" height="6" fill="#FFFFFF" stroke="${c}" stroke-width="2"/>` +
      [-36, -20, -4, 12, 28].map((x) => `<line x1="${x}" y1="-11" x2="${x + 8}" y2="-5" stroke="${c}" stroke-width="1"/>`).join("") +
      `<line x1="54" y1="-8" x2="148" y2="-8" stroke="${c}" stroke-width="1.4" stroke-dasharray="5 4"/><path d="M60 -17 L84 -17 M78 -21 L84 -17 L78 -13" fill="none" stroke="${c}" stroke-width="1.4"/>`,
  },
  escalera_recta: {
    nombre: "Escalera recta", cat: "obra", color: "#1C1E21", r: 72, espejable: true,
    dib: (c, el) => `<rect x="-20" y="-60" width="40" height="120" fill="#FFFFFF" stroke="${c}" stroke-width="2"/>` + croquisEscalones(c, "h", -20, 20, -50, 50) + croquisFlecha(c, [[0, 54], [0, -54]], false, !!(el && el.esp)),
  },
  escalera_l_izq: {
    nombre: "Escalera con descanso (izq.)", cat: "obra", color: "#1C1E21", r: 96, espejable: true,
    dib: (c, el) => croquisEscaleraL(c, -1, !!(el && el.esp)),
  },
  escalera_l_der: {
    nombre: "Escalera con descanso (der.)", cat: "obra", color: "#1C1E21", r: 96, espejable: true,
    dib: (c, el) => croquisEscaleraL(c, 1, !!(el && el.esp)),
  },
  escalera_u: {
    nombre: "Escalera en U", cat: "obra", color: "#1C1E21", r: 86, espejable: true,
    dib: (c, el) => `<g transform="translate(0 -10)"><rect x="-46" y="-60" width="92" height="40" fill="#FFFFFF" stroke="${c}" stroke-width="2"/><rect x="-46" y="-20" width="40" height="100" fill="#FFFFFF" stroke="${c}" stroke-width="2"/><rect x="6" y="-20" width="40" height="100" fill="#FFFFFF" stroke="${c}" stroke-width="2"/>` +
      croquisEscalones(c, "h", -46, -6, -10, 70) + croquisEscalones(c, "h", 6, 46, -10, 70) + croquisFlecha(c, [[-26, 74], [-26, -40], [26, -40], [26, 72]], false, !!(el && el.esp)) + `</g>`,
  },
  escalera_caracol: {
    nombre: "Escalera caracol", cat: "obra", color: "#1C1E21", r: 48, espejable: true,
    dib: (c, el) => {
      let out = `<circle cx="0" cy="0" r="42" fill="#FFFFFF" stroke="${c}" stroke-width="2"/>`;
      for (let i = 0; i < 12; i++) { const a = (i * 30 + 90) * Math.PI / 180; out += `<line x1="${(Math.cos(a) * 6).toFixed(1)}" y1="${(Math.sin(a) * 6).toFixed(1)}" x2="${(Math.cos(a) * 42).toFixed(1)}" y2="${(Math.sin(a) * 42).toFixed(1)}" stroke="${c}" stroke-width="1"/>`; }
      out += `<circle cx="0" cy="0" r="6" fill="${c}"/>`;
      // Flecha en arco: sube girando en sentido horario desde abajo
      const pts = [];
      for (let g = 90; g >= -200; g -= 10) { const a = g * Math.PI / 180; pts.push([+(Math.cos(a) * 26).toFixed(1), +(Math.sin(a) * 26).toFixed(1)]); }
      return out + croquisFlecha(c, pts, true, !!(el && el.esp));
    },
  },
  piscina: {
    nombre: "Piscina", cat: "obra", color: "#2E86DE", r: 50,
    dib: (c) => `<rect x="-45" y="-26" width="90" height="52" rx="10" fill="#D6ECFA" stroke="${c}" stroke-width="2.4"/><rect x="-38" y="-19" width="76" height="38" rx="6" fill="none" stroke="${c}" stroke-width="0.8" opacity="0.6"/>` +
      [-8, 6].map((y) => `<path d="M-24 ${y} q6 -5 12 0 t12 0 t12 0 t12 0" fill="none" stroke="${c}" stroke-width="1.3" opacity="0.8"/>`).join(""),
  },
  planta: {
    nombre: "Planta", cat: "obra", color: "#2E9E4F", r: 18,
    dib: (c) => [0, 60, 120, 180, 240, 300].map((a) => { const r = a * Math.PI / 180; return `<circle cx="${(Math.cos(r) * 8).toFixed(1)}" cy="${(Math.sin(r) * 8).toFixed(1)}" r="7" fill="${c}" fill-opacity="0.35" stroke="${c}" stroke-width="1.2"/>`; }).join("") + `<circle cx="0" cy="0" r="4" fill="${c}"/>`,
  },
  // ---- Muebles (de referencia) ----
  sillon: { nombre: "Sillón", cat: "mueble", color: "#5B5F66", r: 44, dib: (c) => croquisSillon(c, 80) },
  sillon_1: { nombre: "Sillón individual", cat: "mueble", color: "#5B5F66", r: 22, dib: (c) => croquisSillon(c, 34) },
  silla: { nombre: "Silla", cat: "mueble", color: "#5B5F66", r: 12, dib: (c) => croquisSilla(c, 0, 0, 0) },
  mesa_rect: {
    nombre: "Mesa con sillas", cat: "mueble", color: "#5B5F66", r: 46,
    dib: (c) => [[-14, -27, 0], [14, -27, 0], [-14, 27, 180], [14, 27, 180], [-39, 0, 270], [39, 0, 90]].map(([x, y, g]) => croquisSilla(c, x, y, g)).join("") + `<rect x="-30" y="-18" width="60" height="36" rx="2" fill="#FFFFFF" stroke="${c}" stroke-width="1.8"/>`,
  },
  mesa_redonda: {
    nombre: "Mesa redonda", cat: "mueble", color: "#5B5F66", r: 40,
    dib: (c) => [0, 90, 180, 270].map((g) => { const a = (g - 90) * Math.PI / 180; return croquisSilla(c, +(Math.cos(a) * 31).toFixed(1), +(Math.sin(a) * 31).toFixed(1), g); }).join("") + `<circle cx="0" cy="0" r="22" fill="#FFFFFF" stroke="${c}" stroke-width="1.8"/>`,
  },
  cama_doble: { nombre: "Cama doble", cat: "mueble", color: "#5B5F66", r: 46, dib: (c) => croquisCama(c, 64) },
  cama_simple: { nombre: "Cama simple", cat: "mueble", color: "#5B5F66", r: 42, dib: (c) => croquisCama(c, 36) },
  ropero: {
    nombre: "Placard", cat: "mueble", color: "#5B5F66", r: 32,
    dib: (c) => `<rect x="-30" y="-11" width="60" height="22" fill="#FFFFFF" stroke="${c}" stroke-width="1.8"/><line x1="0" y1="-11" x2="0" y2="11" stroke="${c}" stroke-width="1"/><path d="M-30 11 L-15 -11 L0 11 L15 -11 L30 11" fill="none" stroke="${c}" stroke-width="0.8"/>`,
  },
  escritorio: {
    nombre: "Escritorio", cat: "mueble", color: "#5B5F66", r: 32,
    dib: (c) => croquisSilla(c, 0, 22, 180) + `<rect x="-28" y="-14" width="56" height="28" fill="#FFFFFF" stroke="${c}" stroke-width="1.8"/>`,
  },
  tv: { nombre: "TV", cat: "mueble", color: "#5B5F66", r: 24, dib: (c) => `<rect x="-22" y="-3" width="44" height="6" rx="1" fill="${c}"/><line x1="-14" y1="6" x2="14" y2="6" stroke="${c}" stroke-width="1.2" stroke-dasharray="2 2"/>` },
  ducha: {
    nombre: "Ducha", cat: "mueble", color: "#5B5F66", r: 26,
    dib: (c) => `<rect x="-18" y="-18" width="36" height="36" fill="#FFFFFF" stroke="${c}" stroke-width="1.8"/><path d="M-18 -18 L18 18 M18 -18 L-18 18" stroke="${c}" stroke-width="0.8"/><circle cx="0" cy="0" r="3.5" fill="#FFFFFF" stroke="${c}" stroke-width="1.2"/>`,
  },
  banera: {
    nombre: "Bañera", cat: "mueble", color: "#5B5F66", r: 38,
    dib: (c) => `<rect x="-35" y="-16" width="70" height="32" rx="3" fill="#FFFFFF" stroke="${c}" stroke-width="1.8"/><rect x="-30" y="-11" width="60" height="22" rx="10" fill="none" stroke="${c}" stroke-width="1.2"/><circle cx="22" cy="0" r="2.5" fill="none" stroke="${c}" stroke-width="1"/>`,
  },
  inodoro: {
    nombre: "Inodoro", cat: "mueble", color: "#5B5F66", r: 18,
    dib: (c) => `<rect x="-11" y="-17" width="22" height="8" rx="1.5" fill="#FFFFFF" stroke="${c}" stroke-width="1.6"/><ellipse cx="0" cy="3" rx="9" ry="12" fill="#FFFFFF" stroke="${c}" stroke-width="1.6"/><ellipse cx="0" cy="4" rx="5" ry="7" fill="none" stroke="${c}" stroke-width="0.8"/>`,
  },
  lavatorio: {
    nombre: "Lavatorio", cat: "mueble", color: "#5B5F66", r: 16,
    dib: (c) => `<rect x="-13" y="-10" width="26" height="20" rx="2" fill="#FFFFFF" stroke="${c}" stroke-width="1.6"/><ellipse cx="0" cy="1.5" rx="9" ry="6" fill="none" stroke="${c}" stroke-width="1.2"/><circle cx="0" cy="-7" r="1.3" fill="${c}"/>`,
  },
  mesada: {
    nombre: "Mesada con bacha", cat: "mueble", color: "#5B5F66", r: 42,
    dib: (c) => `<rect x="-40" y="-12" width="80" height="24" fill="#FFFFFF" stroke="${c}" stroke-width="1.8"/><rect x="-6" y="-8" width="14" height="16" rx="2" fill="none" stroke="${c}" stroke-width="1.2"/><rect x="10" y="-8" width="14" height="16" rx="2" fill="none" stroke="${c}" stroke-width="1.2"/><circle cx="9" cy="-10" r="1.3" fill="${c}"/>`,
  },
  anafe: {
    nombre: "Cocina / anafe", cat: "mueble", color: "#5B5F66", r: 20,
    dib: (c) => `<rect x="-14" y="-14" width="28" height="28" rx="2" fill="#FFFFFF" stroke="${c}" stroke-width="1.8"/>` + [[-6, -6], [6, -6], [-6, 6], [6, 6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.2" fill="none" stroke="${c}" stroke-width="1.2"/>`).join(""),
  },
  heladera: {
    nombre: "Heladera", cat: "mueble", color: "#5B5F66", r: 20,
    dib: (c) => `<rect x="-14" y="-15" width="28" height="30" rx="2" fill="#FFFFFF" stroke="${c}" stroke-width="1.8"/><text x="0" y="5" text-anchor="middle" ${CROQUIS_FUENTE} font-size="13" fill="${c}">H</text>`,
  },
  lavarropas: {
    nombre: "Lavarropas", cat: "mueble", color: "#5B5F66", r: 20,
    dib: (c) => `<rect x="-14" y="-14" width="28" height="28" rx="2" fill="#FFFFFF" stroke="${c}" stroke-width="1.8"/><circle cx="0" cy="1" r="8" fill="none" stroke="${c}" stroke-width="1.4"/>`,
  },
};
// Escalones: líneas cada 10 unidades. "h": líneas horizontales entre x0-x1,
// de y0 a y1; "v": verticales entre y0-y1, de x0 a x1.
function croquisEscalones(c, dir, a0, a1, b0, b1) {
  let out = "";
  const desde = Math.min(b0, b1), hasta = Math.max(b0, b1);
  for (let b = desde; b <= hasta + 0.01; b += 10) {
    out += dir === "h" ? `<line x1="${a0}" y1="${b}" x2="${a1}" y2="${b}" stroke="${c}" stroke-width="1"/>` : `<line x1="${b}" y1="${a0}" x2="${b}" y2="${a1}" stroke="${c}" stroke-width="1"/>`;
  }
  return out;
}
// Flecha de subida: arranca con un puntito y "SUBE", termina en punta.
function croquisFlecha(c, pts, curva, espejado) {
  const d = curva ? croquisPathSuave(pts) : "M" + pts.map((p) => p.join(" ")).join(" L");
  const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 7;
  const p1 = [b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45)], p2 = [b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45)];
  const ini = pts[0];
  return `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.4"/><path d="M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${b[0]} ${b[1]} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}" fill="none" stroke="${c}" stroke-width="1.4" stroke-linejoin="round"/><circle cx="${ini[0]}" cy="${ini[1]}" r="2.4" fill="${c}"/><text ${espejado ? `transform="translate(${ini[0]} 0) scale(-1 1) translate(${-ini[0]} 0)" ` : ""}x="${ini[0] + 5}" y="${ini[1] + 3}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="7" fill="${c}">SUBE</text>`;
}
// Escalera con descanso y giro (lado: -1 izquierda, 1 derecha), centrada.
function croquisEscaleraL(c, lado, espejado) {
  const xs = (x) => x * lado;
  const r = (x, y, w, h) => `<rect x="${Math.min(xs(x), xs(x + w))}" y="${y}" width="${w}" height="${h}" fill="#FFFFFF" stroke="${c}" stroke-width="2"/>`;
  let out = r(-20, -20, 40, 100) + r(-20, -60, 40, 40) + r(20, -60, 80, 40);
  out += croquisEscalones(c, "h", -20, 20, -10, 70);
  for (let x = 30; x <= 90; x += 10) out += `<line x1="${xs(x)}" y1="-60" x2="${xs(x)}" y2="-20" stroke="${c}" stroke-width="1"/>`;
  out += croquisFlecha(c, [[0, 74], [0, -40], [xs(94), -40]], false, espejado);
  return `<g transform="translate(${-40 * lado} -10)">${out}</g>`;
}
// ---- Dibujos auxiliares de equipos y muebles ----
function croquisSirena(c, k) {
  const g = (v) => +(v * k).toFixed(2);
  return `<rect x="${g(-20)}" y="${g(-20)}" width="${g(40)}" height="${g(18)}" rx="${g(1.5)}" fill="${c}" stroke="#1C1E21" stroke-width="${2.6 * Math.max(0.75, k)}"/><path d="M0 ${g(-2)} L${g(21)} ${g(20)} L${g(-21)} ${g(20)} Z" fill="${c}" stroke="#1C1E21" stroke-width="${2.6 * Math.max(0.75, k)}" stroke-linejoin="round"/>`;
}
// Infrarrojo: el vértice de captación es el punto 0,0 (el que se apoya en
// la esquina); el cuadrado queda abajo a la derecha y la captación sale
// hacia arriba a la izquierda (bisectriz a -135°).
const CROQUIS_IR_BIS = -135;
function croquisIRParams(el, def) {
  return { alc: Math.max(20, Number(el && el.alc) || def.alc), ang: Math.max(5, Number(el && el.ang) || def.ang), doble: !!(el && el.doble), video: !!(el && el.video) };
}
function croquisIR(c, el, def) {
  const { alc, ang, doble, video } = croquisIRParams(el, def);
  const total = Math.min(359, doble ? ang * 2 : ang);
  const pt = (g) => { const a = g * Math.PI / 180; return `${(Math.cos(a) * alc).toFixed(1)} ${(Math.sin(a) * alc).toFixed(1)}`; };
  let out = `<path d="M0 0 L${pt(CROQUIS_IR_BIS - total / 2)} A${alc} ${alc} 0 ${total > 180 ? 1 : 0} 1 ${pt(CROQUIS_IR_BIS + total / 2)} Z" fill="#8E949A" fill-opacity="0.13" stroke="#1C1E21" stroke-width="1.6" stroke-dasharray="4 3" stroke-linejoin="round"/>`;
  if (doble) out += `<line x1="0" y1="0" x2="${pt(CROQUIS_IR_BIS).split(" ")[0]}" y2="${pt(CROQUIS_IR_BIS).split(" ")[1]}" stroke="#1C1E21" stroke-width="1" stroke-dasharray="3 3"/>`;
  out += `<rect x="0" y="0" width="18" height="18" fill="${c}" stroke="#1C1E21" stroke-width="2.2"/>`;
  if (video) out += `<path d="M2.2 9 Q9 2.6 15.8 9 Q9 15.4 2.2 9 Z" fill="#FFFFFF" stroke="#1C1E21" stroke-width="1"/><circle cx="9" cy="9" r="2.4" fill="#1C1E21"/>`;
  return out;
}
function croquisSilla(c, x, y, g) {
  return `<g transform="translate(${x} ${y}) rotate(${g})"><rect x="-7" y="-6" width="14" height="13" rx="2" fill="#FFFFFF" stroke="${c}" stroke-width="1.4"/><rect x="-7" y="-6" width="14" height="3.5" rx="1" fill="${c}" fill-opacity="0.45"/></g>`;
}
function croquisSillon(c, w) {
  const x = -w / 2, n = w > 50 ? 3 : 1, ap = 8;
  let out = `<rect x="${x}" y="-17" width="${w}" height="34" rx="4" fill="#FFFFFF" stroke="${c}" stroke-width="1.8"/><rect x="${x}" y="-17" width="${w}" height="9" rx="3" fill="${c}" fill-opacity="0.18" stroke="${c}" stroke-width="1.2"/><rect x="${x}" y="-8" width="${ap}" height="25" rx="2" fill="${c}" fill-opacity="0.18" stroke="${c}" stroke-width="1.2"/><rect x="${-x - ap}" y="-8" width="${ap}" height="25" rx="2" fill="${c}" fill-opacity="0.18" stroke="${c}" stroke-width="1.2"/>`;
  const ancho = (w - 2 * ap) / n;
  for (let i = 1; i < n; i++) out += `<line x1="${(x + ap + ancho * i).toFixed(1)}" y1="-8" x2="${(x + ap + ancho * i).toFixed(1)}" y2="17" stroke="${c}" stroke-width="1"/>`;
  return out;
}
function croquisCama(c, w) {
  const x = -w / 2, almohadas = w > 50 ? 2 : 1, aw = (w - 6 - (almohadas - 1) * 4) / almohadas;
  let out = `<rect x="${x}" y="-40" width="${w}" height="80" rx="2" fill="#FFFFFF" stroke="${c}" stroke-width="1.8"/>`;
  for (let i = 0; i < almohadas; i++) out += `<rect x="${(x + 3 + i * (aw + 4)).toFixed(1)}" y="-36" width="${aw.toFixed(1)}" height="12" rx="3" fill="none" stroke="${c}" stroke-width="1.2"/>`;
  out += `<path d="M${x} -18 L${-x} -18 M${x} -18 L${x + 14} -8" fill="none" stroke="${c}" stroke-width="1.2"/>`;
  return out;
}
// Radio aproximado de un símbolo puesto (para la caja de selección).
function croquisRadio(el) {
  const def = CROQUIS_SIMBOLOS[el.tipo] || {};
  if (def.ir) return croquisIRParams(el, def).alc + 20;
  return def.r || 34;
}
// Punto local del símbolo -> coordenadas del plano.
function croquisLocalAMundo(el, lx, ly) {
  const esc = el.esc || 1, a = (el.rot || 0) * Math.PI / 180, x = (el.esp ? -lx : lx) * esc, y = ly * esc;
  return [el.x + x * Math.cos(a) - y * Math.sin(a), el.y + x * Math.sin(a) + y * Math.cos(a)];
}
// Formas de las habitaciones.
const CROQUIS_FORMAS = {
  rect: { nombre: "Rectángulo", icono: '<rect x="4" y="6" width="24" height="18" fill="none" stroke="currentColor" stroke-width="2.6"/>' },
  elipse: { nombre: "Círculo / óvalo", icono: '<ellipse cx="16" cy="15" rx="12" ry="10" fill="none" stroke="currentColor" stroke-width="2.6"/>' },
  triangulo: { nombre: "Triángulo", icono: '<path d="M16 4 L28 26 L4 26 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>' },
  triangulo_rect: { nombre: "Triángulo rectángulo", icono: '<path d="M5 4 L5 26 L28 26 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>' },
};
// Vértices de un triángulo dentro de su caja, según hacia dónde apunte (ori 0-3).
function croquisTriangulo(forma, x, y, w, h, ori) {
  const o = ((ori || 0) % 4 + 4) % 4;
  if (forma === "triangulo") return [
    [[x + w / 2, y], [x + w, y + h], [x, y + h]],
    [[x + w, y + h / 2], [x, y + h], [x, y]],
    [[x + w / 2, y + h], [x, y], [x + w, y]],
    [[x, y + h / 2], [x + w, y], [x + w, y + h]],
  ][o];
  return [
    [[x, y], [x, y + h], [x + w, y + h]],
    [[x, y], [x + w, y], [x, y + h]],
    [[x, y], [x + w, y], [x + w, y + h]],
    [[x + w, y], [x + w, y + h], [x, y + h]],
  ][o];
}
// Medidas de una tabla / cuadro de texto (se ajusta solo al contenido).
function croquisTablaMedidas(el) {
  const tam = el.tam || 14, celdas = el.celdas && el.celdas.length ? el.celdas : [[""]];
  const nc = Math.max(...celdas.map((f) => f.length));
  const lineas = (v) => String(v == null ? "" : v).split("\n");
  const cols = [], filas = [];
  for (let j = 0; j < nc; j++) cols.push(Math.max(30, ...celdas.map((f) => Math.max(...lineas(f[j]).map((l) => l.length)) * tam * 0.56 + 14)));
  celdas.forEach((f) => filas.push(Math.max(...f.map((v) => lineas(v).length), 1) * tam * 1.25 + 10));
  return { cols, filas, W: cols.reduce((a, b) => a + b, 0), H: filas.reduce((a, b) => a + b, 0), nc, celdas, tam };
}
function croquisTspans(texto, x, y, tam) {
  return String(texto == null ? "" : texto).split("\n").map((l, i) => `<tspan x="${x}" y="${(y + i * tam * 1.25).toFixed(1)}">${croquisEsc(l)}</tspan>`).join("");
}
// Compatibilidad: CROQUIS_SIMBOLOS[k].svg da el dibujo con su color de siempre.
Object.values(CROQUIS_SIMBOLOS).forEach((s) => Object.defineProperty(s, "svg", { get() { return s.dib(s.color); } }));
const CROQUIS_COLOR_CABLE = "#D6336C";
// Colores para cables y equipos.
const CROQUIS_COLORES = ["#E00000", "#D6336C", "#C0392B", "#E8741E", "#F2C94C", "#D4A017", "#2E9E4F", "#17809B", "#2E86DE", "#1B5FA8", "#7B4B94", "#8A5A00", "#D9D9D9", "#5B5F66", "#1C1E21"];
// Tipos de trazo para cables y paredes.
const CROQUIS_TRAZOS = {
  continuo: { nombre: "Continuo", dash: "" },
  guiones: { nombre: "Guiones", dash: "9 5" },
  puntos: { nombre: "Puntos", dash: "0.1 6" },
  guion_punto: { nombre: "Guión y punto", dash: "12 5 0.1 5" },
};
function croquisDash(trazo, porDefecto) {
  const t = CROQUIS_TRAZOS[trazo || porDefecto];
  return t && t.dash ? ` stroke-dasharray="${t.dash}"` : "";
}
function croquisSimboloSvg(tipo, color, el) {
  const s = CROQUIS_SIMBOLOS[tipo];
  return s ? s.dib(color || s.color, el) : "";
}

function croquisEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// Curva suave que pasa por todos los puntos (Catmull-Rom -> Bézier).
function croquisPathSuave(pts) {
  if (!pts || !pts.length) return "";
  if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]}`;
  if (pts.length === 2) return `M${pts[0][0]} ${pts[0][1]} L${pts[1][0]} ${pts[1][1]}`;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
// Reduce los puntos de un trazo a mano alzada (Ramer-Douglas-Peucker).
function croquisSimplificar(pts, tol) {
  if (pts.length < 3) return pts;
  const dist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = dist(pts[i], pts[0], pts[pts.length - 1]); if (d > maxD) { maxD = d; idx = i; } }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return croquisSimplificar(pts.slice(0, idx + 1), tol).slice(0, -1).concat(croquisSimplificar(pts.slice(idx), tol));
}

// SVG de un elemento (sin interacción). attrs: atributos extra (data-id, etc.).
function croquisSvgElemento(el, attrs) {
  const a = attrs || "";
  if (el.t === "rect") {
    const x = Math.min(el.x, el.x + el.w), y = Math.min(el.y, el.y + el.h), w = Math.abs(el.w), h = Math.abs(el.h);
    const forma = el.forma || "rect";
    let cx = x + w / 2, cy = y + h / 2, figura;
    const t = el.trazo && el.trazo !== "continuo";
    const estilo = `fill="#FFFFFF" fill-opacity="0.001" stroke="${el.color || "#1C1E21"}" stroke-width="${t ? 3.5 : 5}"${croquisDash(el.trazo, "continuo")} stroke-linejoin="miter"${el.trazo === "puntos" ? ' stroke-linecap="round"' : ""}`;
    if (forma === "elipse") figura = `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" ${estilo}/>`;
    else if (forma === "triangulo" || forma === "triangulo_rect") {
      const p = croquisTriangulo(forma, x, y, w, h, el.ori);
      cx = (p[0][0] + p[1][0] + p[2][0]) / 3; cy = (p[0][1] + p[1][1] + p[2][1]) / 3;
      figura = `<path d="M${p.map((q) => q.join(" ")).join(" L")} Z" ${estilo}/>`;
    } else figura = `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${estilo}/>`;
    const etiqueta = el.nombre ? `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#5B5F66" letter-spacing="0.5">${croquisEsc(el.nombre)}</text>` : "";
    return `<g ${a}>${figura}${etiqueta}</g>`;
  }
  if (el.t === "linea") {
    const t = el.trazo && el.trazo !== "continuo";
    return `<g ${a}><line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="${el.color || "#1C1E21"}" stroke-width="${t ? 3.5 : 5}"${croquisDash(el.trazo, "continuo")} stroke-linecap="${el.trazo === "puntos" ? "round" : (t ? "butt" : "square")}"/></g>`;
  }
  if (el.t === "cable") {
    // Trazo invisible más ancho para que sea fácil tocarlo con el dedo.
    const d = croquisPathSuave(el.pts);
    return `<g ${a}>${a ? `<path d="${d}" fill="none" stroke="#000" stroke-opacity="0" stroke-width="14"/>` : ""}<path d="${d}" fill="none" stroke="${el.color || CROQUIS_COLOR_CABLE}" stroke-width="${el.trazo === "puntos" ? 3.4 : 2.6}"${croquisDash(el.trazo, "guiones")} stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  if (el.t === "texto") return `<g ${a}><text x="${el.x}" y="${el.y}" font-family="Arial, Helvetica, sans-serif" font-size="${el.tam || 16}" font-weight="700" fill="${el.color || "#1C1E21"}">${croquisTspans(el.texto, el.x, el.y, el.tam || 16)}</text></g>`;
  if (el.t === "tabla") {
    // Cuadro de texto (1 celda) o tabla de filas x columnas.
    const m = croquisTablaMedidas(el), col = el.color || "#1C1E21";
    let out = `<rect x="${el.x}" y="${el.y}" width="${m.W}" height="${m.H}" fill="#FFFFFF" stroke="${col}" stroke-width="1.6"/>`;
    if (el.enc && m.celdas.length > 1) out += `<rect x="${el.x}" y="${el.y}" width="${m.W}" height="${m.filas[0]}" fill="${col}" fill-opacity="0.12"/>`;
    let yy = el.y;
    m.celdas.forEach((f, i) => {
      let xx = el.x;
      for (let j = 0; j < m.nc; j++) {
        const v = f[j];
        if (v) out += `<text font-family="Arial, Helvetica, sans-serif" font-size="${m.tam}" font-weight="${el.enc && i === 0 && m.celdas.length > 1 ? 700 : 400}" fill="#1C1E21">${croquisTspans(v, xx + 7, yy + 5 + m.tam, m.tam)}</text>`;
        if (j > 0) out += `<line x1="${xx}" y1="${el.y}" x2="${xx}" y2="${el.y + m.H}" stroke="${col}" stroke-width="1"/>`.repeat(i === 0 ? 1 : 0);
        xx += m.cols[j];
      }
      if (i > 0) out += `<line x1="${el.x}" y1="${yy}" x2="${el.x + m.W}" y2="${yy}" stroke="${col}" stroke-width="1"/>`;
      yy += m.filas[i];
    });
    return `<g ${a}>${out}</g>`;
  }
  if (el.t === "simbolo") {
    const s = CROQUIS_SIMBOLOS[el.tipo];
    if (!s) return "";
    const esc = el.esc || 1;
    const cuerpo = `<g transform="translate(${el.x} ${el.y}) rotate(${el.rot || 0}) scale(${el.esp ? -esc : esc} ${esc})">${s.dib(el.color || s.color, el)}</g>`;
    let extra = "";
    // Número de zona / dispositivo: en el infrarrojo va dentro de la
    // captación; en el resto, abajo del equipo. Siempre se lee derecho.
    const etq = String(el.etq || "").trim();
    if (etq) {
      let p;
      if (s.ir) { const { alc } = croquisIRParams(el, s), b = CROQUIS_IR_BIS * Math.PI / 180, d = Math.min(alc * 0.58, alc - 14); p = croquisLocalAMundo(el, Math.cos(b) * d, Math.sin(b) * d); }
      else p = [el.x, el.y + (s.r || 20) * 0.75 * esc + 12];
      extra += `<text x="${p[0].toFixed(1)}" y="${(p[1] + 5).toFixed(1)}" text-anchor="middle" ${CROQUIS_FUENTE} font-size="${(s.ir ? 15 : 12) * Math.min(1.4, Math.max(0.8, esc))}" fill="#1C1E21" stroke="#FFFFFF" stroke-width="3" paint-order="stroke">${croquisEsc(etq)}</text>`;
    }
    if (el.inst) {
      // A instalar: aro naranja punteado alrededor del equipo.
      const c = s.ir ? croquisLocalAMundo(el, 9, 9) : [el.x, el.y], rr = (s.ir ? 15 : (s.r || 20) * 0.8 + 5) * esc;
      extra = `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${rr.toFixed(1)}" fill="#E8741E" fill-opacity="0.1" stroke="#E8741E" stroke-width="2.2" stroke-dasharray="5 3"/>` + extra;
    }
    if (el.inal) {
      // Inalámbrico: ondas arriba a la derecha.
      const p = s.ir ? croquisLocalAMundo(el, 24, -2) : [el.x + (s.r || 20) * 0.8 * esc, el.y - (s.r || 20) * 0.75 * esc];
      extra += `<g transform="translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})" fill="none" stroke="#1B5FA8" stroke-width="1.6" stroke-linecap="round"><circle cx="0" cy="4" r="1.4" fill="#1B5FA8" stroke="none"/><path d="M-3.5 0.5 A5 5 0 0 1 3.5 0.5"/><path d="M-6.5 -2.5 A9 9 0 0 1 6.5 -2.5"/></g>`;
    }
    return `<g ${a}>${cuerpo}${extra}</g>`;
  }
  return "";
}

// Caja que contiene todo el dibujo (aproximada para textos y símbolos).
function croquisCaja(dibujo) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const sumar = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  (dibujo.elementos || []).forEach((el) => {
    if (el.t === "rect") { sumar(el.x, el.y); sumar(el.x + el.w, el.y + el.h); }
    else if (el.t === "linea") { sumar(el.x1, el.y1); sumar(el.x2, el.y2); }
    else if (el.t === "cable") (el.pts || []).forEach((p) => sumar(p[0], p[1]));
    else if (el.t === "texto") { const tam = el.tam || 16, ls = String(el.texto || "").split("\n"); const w = Math.max(...ls.map((l) => l.length)) * tam * 0.6; sumar(el.x, el.y - tam); sumar(el.x + w, el.y + 4 + (ls.length - 1) * tam * 1.25); }
    else if (el.t === "tabla") { const m = croquisTablaMedidas(el); sumar(el.x, el.y); sumar(el.x + m.W, el.y + m.H); }
    else if (el.t === "simbolo") { const r = croquisRadio(el) * (el.esc || 1); sumar(el.x - r, el.y - r); sumar(el.x + r, el.y + r + (el.etq ? 14 : 0)); }
  });
  if (!isFinite(x0)) return { x: 0, y: 0, w: 400, h: 300 };
  return { x: x0, y: y0, w: Math.max(40, x1 - x0), h: Math.max(40, y1 - y0) };
}
// Ítems de la leyenda: cada equipo usado (por tipo y color) y cada
// cableado distinto (por color, trazo y nombre). Los objetos de obra no van.
function croquisTiposUsados(dibujo) {
  const els = dibujo.elementos || [];
  const out = [], vistos = new Set();
  Object.keys(CROQUIS_SIMBOLOS).filter((k) => CROQUIS_SIMBOLOS[k].cat === "equipo").forEach((k) => {
    els.filter((e) => e.t === "simbolo" && e.tipo === k).sort((a, b) => !!a.inst - !!b.inst).forEach((e) => {
      const color = e.color || CROQUIS_SIMBOLOS[k].color, clave = k + color + (e.inst ? "+" : "");
      if (vistos.has(clave)) return;
      vistos.add(clave);
      out.push({ tipo: k, color, inst: !!e.inst, nombre: CROQUIS_SIMBOLOS[k].nombre + (e.inst ? " (a instalar)" : "") });
    });
  });
  const cables = [];
  const todos = els.filter((e) => e.t === "cable");
  const conNombre = (color, trazo) => todos.some((e) => (e.nombre || "").trim() && (e.color || CROQUIS_COLOR_CABLE) === color && (e.trazo || "guiones") === trazo);
  todos.forEach((e) => {
    const color = e.color || CROQUIS_COLOR_CABLE, trazo = e.trazo || "guiones", nombre = (e.nombre || "").trim();
    // Un tramo sin nombre igual (color y trazo) a uno con nombre es el mismo cableado.
    if (!nombre && conNombre(color, trazo)) return;
    const clave = color + trazo + nombre;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    cables.push({ tipo: "cable", color, trazo, nombre });
  });
  const sinNombre = cables.filter((c) => !c.nombre);
  sinNombre.forEach((c, i) => { c.nombre = sinNombre.length > 1 ? `Cableado ${i + 1}` : "Cableado"; });
  out.push(...cables);
  return out;
}
// Documento SVG independiente (para descargar / abrir en Visio o Inkscape).
function croquisSvgDocumento(dibujo, opciones) {
  const o = opciones || {};
  const c = croquisCaja(dibujo);
  const m = 30;
  const usados = o.leyenda === false ? [] : croquisTiposUsados(dibujo);
  // Leyenda en filas: entran tantos ítems por fila como permita el ancho
  // del dibujo (mínimo 2 columnas de 150).
  const COL = 170, FILA = 30;
  const anchoMin = Math.max(c.w + m * 2, Math.min(usados.length, 2) * COL + 40);
  const porFila = Math.max(1, Math.floor((anchoMin - 40) / COL));
  const filas = Math.ceil(usados.length / porFila);
  const altoLey = usados.length ? 18 + filas * FILA : 0;
  const W = anchoMin, H = c.h + m * 2 + altoLey;
  const x0 = c.x - m - (W - (c.w + m * 2)) / 2;
  const ley = usados.map((it, i) => {
    const x = x0 + 30 + (i % porFila) * COL, y = c.y + c.h + m + 22 + Math.floor(i / porFila) * FILA;
    const icono = it.tipo === "cable"
      ? `<path d="M${x - 16} ${y} q8 -9 16 0 t16 0" fill="none" stroke="${it.color}" stroke-width="2.6"${croquisDash(it.trazo, "guiones")} stroke-linecap="round"/>`
      : CROQUIS_SIMBOLOS[it.tipo].ir
        ? `<g transform="translate(${x + 2} ${y + 2}) scale(0.62)">${croquisSimboloSvg(it.tipo, it.color, { alc: 24, ang: Math.max(25, CROQUIS_SIMBOLOS[it.tipo].ang) })}</g>`
        : `<g transform="translate(${x} ${y}) scale(${Math.min(0.62, 14 / (CROQUIS_SIMBOLOS[it.tipo].r || 20))})">${croquisSimboloSvg(it.tipo, it.color)}</g>`;
    const aro = it.inst ? `<circle cx="${x}" cy="${y}" r="11" fill="none" stroke="#E8741E" stroke-width="1.8" stroke-dasharray="4 2.5"/>` : "";
    return `${aro}${icono}<text x="${x + 24}" y="${y + 5}" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#1C1E21">${croquisEsc(it.nombre)}</text>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${c.y - m} ${W} ${H}" width="${Math.round(W)}" height="${Math.round(H)}">
<rect x="${x0}" y="${c.y - m}" width="${W}" height="${H}" fill="#FFFFFF"/>
${(dibujo.elementos || []).filter((e) => e.t === "rect").map((e) => croquisSvgElemento(e)).join("\n")}
${(dibujo.elementos || []).filter((e) => e.t === "linea").map((e) => croquisSvgElemento(e)).join("\n")}
${(dibujo.elementos || []).filter((e) => e.t === "cable").map((e) => croquisSvgElemento(e)).join("\n")}
${(dibujo.elementos || []).filter((e) => e.t === "simbolo" || e.t === "texto" || e.t === "tabla").map((e) => croquisSvgElemento(e)).join("\n")}
${usados.length ? `<line x1="${x0 + 10}" y1="${c.y + c.h + m - 2}" x2="${x0 + W - 10}" y2="${c.y + c.h + m - 2}" stroke="#C9CCD1" stroke-width="1"/>` : ""}
${ley}
</svg>`;
}
// PNG (Blob) a partir del SVG. ancho: px del lado más largo.
function croquisPng(dibujo, ancho) {
  return new Promise((ok, mal) => {
    const svg = croquisSvgDocumento(dibujo);
    const img = new Image();
    img.onload = () => {
      const k = (ancho || 2000) / Math.max(img.width, img.height);
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo armar la imagen"))), "image/png");
    };
    img.onerror = () => mal(new Error("No se pudo dibujar el croquis"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
function croquisCargarPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  return new Promise((ok, mal) => {
    const sc = document.createElement("script");
    sc.src = "vendor/pdf-lib.min.js";
    sc.onload = () => (window.PDFLib ? ok(window.PDFLib) : mal(new Error("No cargó el generador de PDF")));
    sc.onerror = () => mal(new Error("No se pudo cargar el generador de PDF (¿sin señal?)"));
    document.head.appendChild(sc);
  });
}
function croquisTextoPdf(s) { return String(s == null ? "" : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, ""); }
// PDF A4 apaisado con rótulo (logo SAT, título, cliente, dirección, fecha, autor).
async function croquisPdf(c) {
  const { PDFDocument, StandardFonts, rgb } = await croquisCargarPdfLib();
  const doc = await PDFDocument.create();
  doc.setTitle(`Croquis - ${c.titulo || ""}`);
  const fN = await doc.embedFont(StandardFonts.Helvetica), fB = await doc.embedFont(StandardFonts.HelveticaBold);
  const pag = doc.addPage([841.89, 595.28]);
  const W = 841.89, H = 595.28, M = 28;
  let logo = null;
  try { logo = await doc.embedJpg(new Uint8Array(await (await fetch("assets/presupuesto/logo-sat.jpg")).arrayBuffer())); } catch (e) { /* sin logo */ }
  const png = await doc.embedPng(new Uint8Array(await (await croquisPng(c.dibujo, 2400)).arrayBuffer()));
  // Marco
  pag.drawRectangle({ x: M, y: M, width: W - 2 * M, height: H - 2 * M, borderColor: rgb(0.11, 0.12, 0.13), borderWidth: 1.2 });
  // Rótulo abajo
  const altoRot = 58;
  pag.drawLine({ start: { x: M, y: M + altoRot }, end: { x: W - M, y: M + altoRot }, thickness: 1.2, color: rgb(0.11, 0.12, 0.13) });
  if (logo) { const h = 44, w = h * logo.width / logo.height; pag.drawImage(logo, { x: M + 8, y: M + 7, width: w, height: h }); }
  const t = (s, x, y, tam, f, col) => pag.drawText(croquisTextoPdf(s), { x, y, size: tam, font: f, color: col || rgb(0.11, 0.12, 0.13) });
  t(`CROQUIS - ${c.titulo || ""}`, M + 70, M + 38, 13, fB);
  t([c.cliente, c.numero_cliente ? `Cliente N° ${c.numero_cliente}` : "", c.direccion].filter(Boolean).join("  ·  "), M + 70, M + 20, 10, fN);
  const fecha = c.actualizado ? new Date(c.actualizado) : new Date();
  const derecha = [`Fecha: ${String(fecha.getDate()).padStart(2, "0")}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${fecha.getFullYear()}`, `Hecho por: ${c.autor || ""}`];
  derecha.forEach((s, i) => { const w = fN.widthOfTextAtSize(croquisTextoPdf(s), 9.5); t(s, W - M - 10 - w, M + 36 - i * 15, 9.5, fN); });
  t("Boceto orientativo, sin escala", W - M - 10 - fN.widthOfTextAtSize("Boceto orientativo, sin escala", 8), M + 6, 8, fN, rgb(0.45, 0.45, 0.45));
  // Dibujo, centrado en el área libre
  const ax = M + 14, ay = M + altoRot + 14, aw = W - 2 * M - 28, ah = H - 2 * M - altoRot - 28;
  const k = Math.min(aw / png.width, ah / png.height);
  pag.drawImage(png, { x: ax + (aw - png.width * k) / 2, y: ay + (ah - png.height * k) / 2, width: png.width * k, height: png.height * k });
  return await doc.save();
}
function croquisNombreArchivo(c, ext) {
  return `Croquis_${String(c.titulo || "sin_titulo").replace(/[^\wÁÉÍÓÚÑáéíóúñ]+/g, "_").slice(0, 40)}${c.numero_cliente ? "_cli" + c.numero_cliente : ""}.${ext}`;
}
function croquisDescargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ---------- Croquis desde la interpretación de la IA ----------
// r: JSON que devolvió la IA (coordenadas 0-1000 sobre la foto sin rotar);
// W, H: tamaño de la foto en píxeles. Devuelve la lista de elementos.
const CROQUIS_DIRECCIONES = { derecha: 0, "abajo-derecha": 45, abajo: 90, "abajo-izquierda": 135, izquierda: 180, "arriba-izquierda": 225, arriba: 270, "arriba-derecha": 315 };
const CROQUIS_ANCHO_ABERTURA = { puerta: 40, ventana: 44, corrediza: 60, porton_corredizo: 100, porton_batiente: 100 };
function croquisDesdeIA(r, W, H) {
  const res = croquisDesdeIACompleto(r, W, H);
  return res.elementos;
}
// Igual, pero devuelve además dónde queda la foto (ya girada) en el plano,
// para mostrarla de fondo y calcar encima: { elementos, rotacion, marco }.
function croquisDesdeIACompleto(r, W, H) {
  r = r && typeof r === "object" ? r : {};
  const rot = [0, 90, 180, 270].includes(Number(r.rotacion)) ? Number(r.rotacion) : 0;
  const num = (v) => { const n = Number(v); return isFinite(n) ? Math.max(-50, Math.min(1050, n)) : 0; };
  // 0-1000 -> píxeles -> girado para que los textos se lean derechos
  const pt = (x, y) => {
    const px = num(x) * W / 1000, py = num(y) * H / 1000;
    if (rot === 90) return [H - py, px];
    if (rot === 180) return [W - px, H - py];
    if (rot === 270) return [py, W - px];
    return [px, py];
  };
  const lista = (k) => (Array.isArray(r[k]) ? r[k] : []).filter((x) => x && typeof x === "object").slice(0, 200);
  const crudo = [];
  lista("habitaciones").forEach((h) => { const a = pt(h.x1, h.y1), b = pt(h.x2, h.y2); crudo.push({ t: "rect", a, b, nombre: String(h.nombre || "").trim().slice(0, 40) }); });
  lista("paredes").forEach((p) => crudo.push({ t: "linea", a: pt(p.x1, p.y1), b: pt(p.x2, p.y2) }));
  lista("aberturas").forEach((p) => { if (CROQUIS_ANCHO_ABERTURA[p.tipo]) crudo.push({ t: "abertura", tipo: p.tipo, a: pt(p.x1, p.y1), b: pt(p.x2, p.y2) }); });
  lista("equipos").forEach((e) => {
    if (!CROQUIS_SIMBOLOS[e.tipo] || CROQUIS_SIMBOLOS[e.tipo].cat !== "equipo") return;
    const dir = CROQUIS_DIRECCIONES[String(e.apunta || "").toLowerCase().trim()];
    crudo.push({ t: "equipo", tipo: e.tipo, a: pt(e.x, e.y), dir: dir === undefined ? null : (dir + rot) % 360, numero: String(e.numero == null ? "" : e.numero).trim().slice(0, 12), agregar: e.agregar === true || e.agregar === "true" });
  });
  lista("textos").forEach((t) => { const s = String(t.texto || "").trim(); if (s) crudo.push({ t: "texto", a: pt(t.x, t.y), texto: s.slice(0, 120) }); });
  if (!crudo.length) return { elementos: [], rotacion: rot, marco: null };
  // Escala: el plano entra en unos 600 de ancho o alto (las habitaciones
  // quedan de ~200, a tono con el tamaño de los símbolos).
  const xs = [], ys = [];
  crudo.forEach((c) => [c.a, c.b].filter(Boolean).forEach((p) => { xs.push(p[0]); ys.push(p[1]); }));
  const x0 = Math.min(...xs), y0 = Math.min(...ys), lado = Math.max(1, Math.max(...xs) - x0, Math.max(...ys) - y0);
  const k = 600 / lado;
  const snap = (v) => Math.round(v / 10) * 10;
  const m = (p) => [snap((p[0] - x0) * k), snap((p[1] - y0) * k)];
  const out = [];
  let n = 0;
  const id = () => "ia" + Date.now().toString(36) + (n++).toString(36);
  crudo.forEach((c) => {
    if (c.t === "rect") {
      const a = m(c.a), b = m(c.b), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
      if (w >= 20 && h >= 20) out.push({ id: id(), t: "rect", x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w, h, nombre: c.nombre });
    } else if (c.t === "linea") {
      let a = m(c.a), b = m(c.b);
      // Enderezar si es casi horizontal o vertical
      if (Math.abs(a[1] - b[1]) < Math.abs(a[0] - b[0]) * 0.15) b = [b[0], a[1]];
      else if (Math.abs(a[0] - b[0]) < Math.abs(a[1] - b[1]) * 0.15) b = [a[0], b[1]];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= 10) out.push({ id: id(), t: "linea", x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
    } else if (c.t === "abertura") {
      const a = m(c.a), b = m(c.b), largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = Math.round(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI / 90) * 90;
      const esc = Math.max(0.5, Math.min(3, Math.round((largo / CROQUIS_ANCHO_ABERTURA[c.tipo]) * 4) / 4 || 1));
      out.push({ id: id(), t: "simbolo", tipo: c.tipo, x: snap((a[0] + b[0]) / 2), y: snap((a[1] + b[1]) / 2), rot: (ang + 360) % 360, esc });
    } else if (c.t === "equipo") {
      const p = m(c.a), def = CROQUIS_SIMBOLOS[c.tipo];
      let rotEq = 0;
      // El infrarrojo mira (bisectriz) a -135°; las cámaras miran para arriba.
      if (c.dir !== null && def.ir) rotEq = c.dir - (360 + CROQUIS_IR_BIS);
      else if (c.dir !== null && /^camara/.test(c.tipo)) rotEq = c.dir - 270;
      const el = { id: id(), t: "simbolo", tipo: c.tipo, x: p[0], y: p[1], rot: ((Math.round(rotEq / 15) * 15) % 360 + 360) % 360, esc: 1 };
      if (c.numero) el.etq = c.numero;
      if (c.agregar) el.inst = true;
      out.push(el);
    } else if (c.t === "texto") {
      const p = m(c.a);
      out.push({ id: id(), t: "texto", x: p[0], y: p[1], texto: c.texto, tam: 14 });
    }
  });
  croquisOrdenar(out);
  const notas = String(r.notas || "").replace(/\r/g, "").trim();
  if (notas) {
    const caja = croquisCaja({ elementos: out });
    // Las notas escritas fuera del plano van en un cuadro de texto debajo.
    out.push({ id: id(), t: "tabla", x: snap(caja.x), y: snap(caja.y + caja.h + 50), celdas: [[notas.slice(0, 600)]], tam: 13 });
  }
  const Wr = rot === 90 || rot === 270 ? H : W, Hr = rot === 90 || rot === 270 ? W : H;
  return { elementos: out, rotacion: rot, marco: { x: Math.round(-x0 * k), y: Math.round(-y0 * k), w: Math.round(Wr * k), h: Math.round(Hr * k) } };
}

// ---------- Ordenar un dibujo a mano alzada ----------
// Junta los bordes casi alineados (habitaciones y paredes que tendrían que
// coincidir) y apoya puertas, ventanas y portones sobre la pared más cercana.
const CROQUIS_ABERTURAS = ["puerta", "ventana", "corrediza", "porton_corredizo", "porton_batiente"];
function croquisOrdenar(elementos, tolerancia) {
  const tol = tolerancia || 16;
  const agrupar = (valores) => {
    const orden = [...new Set(valores)].sort((a, b) => a - b), mapa = new Map();
    let grupo = [];
    const cerrar = () => { if (!grupo.length) return; const m = Math.round(grupo.reduce((a, b) => a + b, 0) / grupo.length / 10) * 10; grupo.forEach((v) => mapa.set(v, m)); grupo = []; };
    orden.forEach((v) => { if (grupo.length && v - grupo[0] > tol) cerrar(); grupo.push(v); });
    cerrar();
    return (v) => (mapa.has(v) ? mapa.get(v) : v);
  };
  const xs = [], ys = [];
  elementos.forEach((e) => {
    if (e.t === "rect" && !e.forma) { xs.push(e.x, e.x + e.w); ys.push(e.y, e.y + e.h); }
    if (e.t === "linea") { if (e.x1 === e.x2) xs.push(e.x1); else if (e.y1 === e.y2) ys.push(e.y1); }
  });
  const fx = agrupar(xs), fy = agrupar(ys);
  elementos.forEach((e) => {
    if (e.t === "rect" && !e.forma) { const a = fx(e.x), b = fx(e.x + e.w), c = fy(e.y), d = fy(e.y + e.h); e.x = a; e.w = Math.max(20, b - a); e.y = c; e.h = Math.max(20, d - c); }
    if (e.t === "linea") {
      if (e.x1 === e.x2) { e.x1 = e.x2 = fx(e.x1); } else if (e.y1 === e.y2) { e.y1 = e.y2 = fy(e.y1); }
    }
  });
  // Tramos de pared (bordes de habitaciones y paredes sueltas)
  const tramos = [];
  elementos.forEach((e) => {
    if (e.t === "rect" && !e.forma) tramos.push([e.x, e.y, e.x + e.w, e.y], [e.x, e.y + e.h, e.x + e.w, e.y + e.h], [e.x, e.y, e.x, e.y + e.h], [e.x + e.w, e.y, e.x + e.w, e.y + e.h]);
    if (e.t === "linea") tramos.push([e.x1, e.y1, e.x2, e.y2]);
  });
  elementos.forEach((e) => {
    if (e.t !== "simbolo" || !CROQUIS_ABERTURAS.includes(e.tipo)) return;
    let mejor = null;
    tramos.forEach(([x1, y1, x2, y2]) => {
      const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
      if (!l2) return;
      const t = Math.max(0, Math.min(1, ((e.x - x1) * dx + (e.y - y1) * dy) / l2));
      const px = x1 + t * dx, py = y1 + t * dy, d = Math.hypot(e.x - px, e.y - py);
      if (!mejor || d < mejor.d) mejor = { d, px, py, horizontal: Math.abs(dx) >= Math.abs(dy) };
    });
    if (!mejor || mejor.d > tol * 2.5) return;
    e.x = Math.round(mejor.px / 10) * 10;
    e.y = Math.round(mejor.py / 10) * 10;
    const quiere = mejor.horizontal ? [0, 180] : [90, 270];
    if (!quiere.includes(((e.rot || 0) % 360 + 360) % 360)) e.rot = quiere[0];
  });
  return elementos;
}
