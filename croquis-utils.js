// Croquis: dibujo y exportación (SVG, PNG y PDF) compartidos por la app
// (editor) y el panel de administración (lista y descargas).
//
// Un croquis es { v: 1, elementos: [...] } en coordenadas de "mundo"
// (la grilla es de 20 unidades). Tipos de elemento:
//   rect    { x, y, w, h, nombre }       habitación
//   linea   { x1, y1, x2, y2 }           pared / tabique
//   cable   { pts: [[x,y], ...] }        cableado (curva suave)
//   texto   { x, y, texto, tam }
//   simbolo { tipo, x, y, rot, esc }     central, teclado, magnético, IR...

const CROQUIS_GRILLA = 20;

const CROQUIS_SIMBOLOS = {
  central: {
    nombre: "Central", color: "#C0392B",
    svg: '<rect x="-21" y="-15" width="42" height="30" rx="3" fill="#FFFFFF" stroke="#C0392B" stroke-width="2.6"/><rect x="-16" y="-10" width="32" height="20" rx="1.5" fill="none" stroke="#C0392B" stroke-width="1"/><text x="0" y="6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="16" fill="#C0392B">C</text>',
  },
  teclado: {
    nombre: "Teclado", color: "#2E86DE",
    svg: '<rect x="-17" y="-13" width="34" height="26" rx="3" fill="#FFFFFF" stroke="#2E86DE" stroke-width="2.6"/><rect x="-12" y="-9" width="24" height="6" rx="1" fill="#2E86DE" opacity="0.35"/>' +
      [-8, 0, 8].map((x) => [1, 7].map((y) => `<rect x="${x - 2.5}" y="${y - 2}" width="5" height="4" rx="0.8" fill="#2E86DE"/>`).join("")).join(""),
  },
  magnetico: {
    nombre: "Magnético", color: "#4E8A0E",
    svg: '<rect x="-15" y="-6" width="13" height="12" rx="1.5" fill="#FFFFFF" stroke="#4E8A0E" stroke-width="2.4"/><rect x="2" y="-6" width="13" height="12" rx="1.5" fill="#4E8A0E" stroke="#4E8A0E" stroke-width="2.4"/><text x="0" y="-10" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="9" fill="#4E8A0E">M</text>',
  },
  infrarrojo: {
    nombre: "Infrarrojo", color: "#E8741E",
    svg: '<path d="M0 10 L-19 -12 A 29 29 0 0 1 19 -12 Z" fill="#E8741E" fill-opacity="0.22" stroke="#E8741E" stroke-width="2" stroke-linejoin="round"/><path d="M-11 -3 A 17 17 0 0 1 11 -3" fill="none" stroke="#E8741E" stroke-width="1.4"/><circle cx="0" cy="10" r="5.5" fill="#FFFFFF" stroke="#E8741E" stroke-width="2.4"/><text x="0" y="24" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="8.5" fill="#E8741E">IR</text>',
  },
  infrarrojo_ext: {
    nombre: "Infrarrojo exterior", color: "#7B4B94",
    svg: '<path d="M0 10 L-22 -14 A 33 33 0 0 1 22 -14 Z" fill="#7B4B94" fill-opacity="0.2" stroke="#7B4B94" stroke-width="2" stroke-linejoin="round"/><path d="M-14 -5 A 21 21 0 0 1 14 -5" fill="none" stroke="#7B4B94" stroke-width="1.4"/><path d="M-7 3 A 11 11 0 0 1 7 3" fill="none" stroke="#7B4B94" stroke-width="1.4"/><rect x="-6" y="5" width="12" height="11" rx="2" fill="#FFFFFF" stroke="#7B4B94" stroke-width="2.4"/><text x="0" y="26" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="8.5" fill="#7B4B94">EXT</text>',
  },
};
const CROQUIS_COLOR_CABLE = "#D6336C";

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
    const etiqueta = el.nombre ? `<text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#5B5F66" letter-spacing="0.5">${croquisEsc(el.nombre)}</text>` : "";
    return `<g ${a}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#FFFFFF" fill-opacity="0.001" stroke="#1C1E21" stroke-width="5" stroke-linejoin="miter"/>${etiqueta}</g>`;
  }
  if (el.t === "linea") return `<g ${a}><line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="#1C1E21" stroke-width="5" stroke-linecap="square"/></g>`;
  if (el.t === "cable") return `<g ${a}><path d="${croquisPathSuave(el.pts)}" fill="none" stroke="${CROQUIS_COLOR_CABLE}" stroke-width="2.6" stroke-dasharray="9 5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  if (el.t === "texto") return `<g ${a}><text x="${el.x}" y="${el.y}" font-family="Arial, Helvetica, sans-serif" font-size="${el.tam || 16}" font-weight="700" fill="#1C1E21">${croquisEsc(el.texto)}</text></g>`;
  if (el.t === "simbolo") {
    const s = CROQUIS_SIMBOLOS[el.tipo];
    if (!s) return "";
    return `<g ${a} transform="translate(${el.x} ${el.y}) rotate(${el.rot || 0}) scale(${el.esc || 1})">${s.svg}</g>`;
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
    else if (el.t === "texto") { const w = String(el.texto || "").length * (el.tam || 16) * 0.6; sumar(el.x, el.y - (el.tam || 16)); sumar(el.x + w, el.y + 4); }
    else if (el.t === "simbolo") { const r = 34 * (el.esc || 1); sumar(el.x - r, el.y - r); sumar(el.x + r, el.y + r); }
  });
  if (!isFinite(x0)) return { x: 0, y: 0, w: 400, h: 300 };
  return { x: x0, y: y0, w: Math.max(40, x1 - x0), h: Math.max(40, y1 - y0) };
}
function croquisTiposUsados(dibujo) {
  const t = new Set((dibujo.elementos || []).filter((e) => e.t === "simbolo").map((e) => e.tipo));
  const out = Object.keys(CROQUIS_SIMBOLOS).filter((k) => t.has(k));
  if ((dibujo.elementos || []).some((e) => e.t === "cable")) out.push("cable");
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
  const COL = 150, FILA = 30;
  const anchoMin = Math.max(c.w + m * 2, Math.min(usados.length, 2) * COL + 40);
  const porFila = Math.max(1, Math.floor((anchoMin - 40) / COL));
  const filas = Math.ceil(usados.length / porFila);
  const altoLey = usados.length ? 18 + filas * FILA : 0;
  const W = anchoMin, H = c.h + m * 2 + altoLey;
  const x0 = c.x - m - (W - (c.w + m * 2)) / 2;
  const ley = usados.map((k, i) => {
    const x = x0 + 30 + (i % porFila) * COL, y = c.y + c.h + m + 22 + Math.floor(i / porFila) * FILA;
    const icono = k === "cable"
      ? `<path d="M${x - 14} ${y} q7 -8 14 0 t14 0" fill="none" stroke="${CROQUIS_COLOR_CABLE}" stroke-width="2.4" stroke-dasharray="6 4"/>`
      : `<g transform="translate(${x} ${y}) scale(0.7)">${CROQUIS_SIMBOLOS[k].svg}</g>`;
    return `${icono}<text x="${x + 24}" y="${y + 5}" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#1C1E21">${k === "cable" ? "Cableado" : CROQUIS_SIMBOLOS[k].nombre}</text>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${c.y - m} ${W} ${H}" width="${Math.round(W)}" height="${Math.round(H)}">
<rect x="${x0}" y="${c.y - m}" width="${W}" height="${H}" fill="#FFFFFF"/>
${(dibujo.elementos || []).filter((e) => e.t === "rect").map((e) => croquisSvgElemento(e)).join("\n")}
${(dibujo.elementos || []).filter((e) => e.t === "linea").map((e) => croquisSvgElemento(e)).join("\n")}
${(dibujo.elementos || []).filter((e) => e.t === "cable").map((e) => croquisSvgElemento(e)).join("\n")}
${(dibujo.elementos || []).filter((e) => e.t === "simbolo" || e.t === "texto").map((e) => croquisSvgElemento(e)).join("\n")}
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
