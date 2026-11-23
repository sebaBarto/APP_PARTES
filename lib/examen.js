// ============================================================
// EXAMEN TÉCNICO (examen.html, pedido.sat365.com.ar/examen?t=…)
//
// La oficina genera desde admin.html → "Examen técnicos" un link de un solo
// uso para un técnico, eligiendo la dificultad de cada temario (alarmas,
// cámaras, redes: 1 básico, 2 medio, 3 avanzado) y el tiempo (30 o 45 min).
// El técnico abre el link (no hace falta la APP ni login), lee las reglas y
// empieza. El servidor elige las preguntas al azar, mezcla las opciones y las
// manda de a una, siempre hacia adelante. Las respuestas correctas nunca
// salen del servidor.
//
// El técnico ve su puntaje y porcentaje; la categoría la ve solo la oficina.
// Si el técnico sale de la página (cambia de app, cierra, recarga) o se le
// termina el tiempo, el examen se cierra y se corrige como está: lo que no
// respondió no suma.
//
// Corrección: multiple choice suma el nivel de la pregunta (1, 2 o 3 puntos);
// las abiertas valen el doble y se corrigen solas por palabras clave. La
// oficina puede ajustar a mano el puntaje de cada abierta. Con el porcentaje
// final se lo ubica en una categoría (por defecto: instalador / junior / senior).
//
// Archivos en el repo privado de datos:
//   examen/config.json    cantidades, tiempos y categorías
//   examen/banco.json     preguntas (si no existe, el banco de lib/examen-banco.js)
//   examen/intentos.json  cada examen: técnico, preguntas, respuestas y puntaje
// ============================================================
const crypto = require("crypto");
const { util } = require("./registro-llaves");
const { modificar, pasaTope, ipDe, cuerpo } = util;
const { BANCO, TEMARIOS } = require("./examen-banco");

const RUTA_CONFIG = "examen/config.json";
const RUTA_BANCO = "examen/banco.json";
const RUTA_INTENTOS = "examen/intentos.json";
const NIVELES = { 1: "Básico", 2: "Medio", 3: "Avanzado" };
const GRACIA_MS = 20 * 1000; // margen para la última respuesta enviada sobre la hora
const CONFIG_DEFECTO = {
  cantidades: { alarmas: { mc: 6, abiertas: 1 }, camaras: { mc: 5, abiertas: 1 }, redes: { mc: 5, abiertas: 1 } },
  minutos_por_nivel: { 1: 30, 2: 30, 3: 45 },
  categorias: [
    { nombre: "Técnico instalador", desde: 0 },
    { nombre: "Técnico junior", desde: 50 },
    { nombre: "Técnico senior", desde: 75 },
  ],
};

const txt = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b-\u001f<>]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, n);
const norm = (s) => " " + String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ*+\-/., ]/g, " ").replace(/\s+/g, " ") + " ";
const ent = (v, min, max, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
const redondear = (n) => Math.round(n * 2) / 2;
async function leerJson(gh, ruta, defecto) { const { data } = await gh.leer(ruta, defecto); return data == null ? defecto : data; }

function limpiarConfig(c) {
  c = c && typeof c === "object" ? c : {};
  const cant = {};
  for (const t of Object.keys(TEMARIOS)) {
    const x = (c.cantidades && c.cantidades[t]) || CONFIG_DEFECTO.cantidades[t];
    cant[t] = { mc: ent(x.mc, 0, 30, CONFIG_DEFECTO.cantidades[t].mc), abiertas: ent(x.abiertas, 0, 5, CONFIG_DEFECTO.cantidades[t].abiertas) };
  }
  const min = {};
  for (const n of [1, 2, 3]) min[n] = ent(c.minutos_por_nivel && c.minutos_por_nivel[n], 5, 180, CONFIG_DEFECTO.minutos_por_nivel[n]);
  let cats = Array.isArray(c.categorias) ? c.categorias : CONFIG_DEFECTO.categorias;
  cats = cats.slice(0, 6).map((k) => ({ nombre: txt(k && k.nombre, 40) || "Categoría", desde: ent(k && k.desde, 0, 100, 0) })).sort((a, b) => a.desde - b.desde);
  if (!cats.length || cats[0].desde !== 0) cats.unshift({ nombre: CONFIG_DEFECTO.categorias[0].nombre, desde: 0 });
  return { cantidades: cant, minutos_por_nivel: min, categorias: cats };
}

function limpiarPregunta(p, i) {
  p = p && typeof p === "object" ? p : {};
  const tipo = p.tipo === "abierta" ? "abierta" : "mc";
  const out = {
    id: txt(p.id, 20).replace(/[^a-zA-Z0-9_-]/g, "") || "p" + Date.now().toString(36) + i,
    temario: TEMARIOS[p.temario] ? p.temario : "alarmas",
    nivel: ent(p.nivel, 1, 3, 1), marca: txt(p.marca, 30), tipo, texto: txt(p.texto, 600), activa: p.activa !== false,
  };
  if (!out.texto) return null;
  if (tipo === "mc") {
    out.opciones = (Array.isArray(p.opciones) ? p.opciones : []).map((o) => txt(o, 300)).filter(Boolean).slice(0, 6);
    if (out.opciones.length < 2) return null;
    out.correcta = ent(p.correcta, 0, out.opciones.length - 1, 0);
    out.explicacion = txt(p.explicacion, 400);
  } else {
    out.claves = (Array.isArray(p.claves) ? p.claves : []).map((g) => (Array.isArray(g) ? g : String(g || "").split("|")).map((a) => txt(a, 40).toLowerCase()).filter(Boolean).slice(0, 12)).filter((g) => g.length).slice(0, 10);
    out.guia = txt(p.guia, 600);
  }
  return out;
}
async function leerBanco(gh) {
  const b = await leerJson(gh, RUTA_BANCO, null);
  if (!Array.isArray(b) || !b.length) return BANCO;
  // Las preguntas nuevas que se agregan al banco de fábrica aparecen aunque la oficina ya haya guardado el suyo.
  const ids = new Set(b.map((p) => p.id));
  return b.concat(BANCO.filter((p) => !ids.has(p.id)));
}

// ---------- Armado y corrección ----------
function mezclar(lista) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Del nivel pedido primero; si no alcanzan, se completa con los niveles de abajo (y después los de arriba).
function elegir(banco, temario, tipo, nivel, cuantas) {
  if (!cuantas) return [];
  const de = (n) => mezclar(banco.filter((p) => p.activa !== false && p.temario === temario && p.tipo === tipo && p.nivel === n));
  const orden = [nivel, ...[1, 2, 3].filter((n) => n < nivel).reverse(), ...[1, 2, 3].filter((n) => n > nivel)];
  const out = [];
  for (const n of orden) { for (const p of de(n)) { if (out.length < cuantas) out.push(p); } }
  return out;
}
function armarPreguntas(banco, config, niveles) {
  const out = [];
  for (const t of Object.keys(TEMARIOS)) {
    const nivel = niveles[t];
    if (!nivel) continue;
    const c = config.cantidades[t];
    for (const p of [...elegir(banco, t, "mc", nivel, c.mc), ...elegir(banco, t, "abierta", nivel, c.abiertas)]) {
      const q = { id: p.id, temario: t, tipo: p.tipo, nivel: p.nivel, marca: p.marca || "", texto: p.texto, puntos_max: p.tipo === "mc" ? p.nivel : p.nivel * 2, respuesta: null, puntos: 0 };
      if (p.tipo === "mc") {
        const orden = mezclar(p.opciones.map((_, i) => i));
        q.opciones = orden.map((i) => p.opciones[i]);
        q.correcta = orden.indexOf(p.correcta);
        q.explicacion = p.explicacion || "";
      } else {
        q.claves = p.claves || [];
        q.guia = p.guia || "";
      }
      out.push(q);
    }
  }
  return out;
}
function corregirAbierta(q, texto) {
  const t = norm(texto);
  if (t.trim().length < 3 || !q.claves.length) return { puntos: 0, encontradas: [] };
  const encontradas = q.claves.map((g) => g.some((alt) => t.includes(" " + norm(alt).trim()))).map((ok, i) => ok ? i : -1).filter((i) => i >= 0);
  // Cada alternativa se busca al principio de una palabra ("demor" encuentra "demorada").
  // Con ~70 % de las ideas ya suma todo: no hace falta escribir un manual.
  const necesarias = Math.max(1, Math.ceil(q.claves.length * 0.7));
  return { puntos: redondear(q.puntos_max * Math.min(1, encontradas.length / necesarias)), encontradas };
}
function categoriaDe(config, porcentaje) {
  let cat = config.categorias[0].nombre;
  for (const k of config.categorias) if (porcentaje >= k.desde) cat = k.nombre;
  return cat;
}
function totalizar(x, config) {
  x.maximo = x.preguntas.reduce((s, q) => s + q.puntos_max, 0);
  x.puntaje = redondear(x.preguntas.reduce((s, q) => s + (Number(q.puntos) || 0), 0));
  x.porcentaje = x.maximo ? Math.round((x.puntaje / x.maximo) * 1000) / 10 : 0;
  x.categoria = categoriaDe(config, x.porcentaje);
  const por = {};
  for (const q of x.preguntas) {
    const p = por[q.temario] || (por[q.temario] = { puntaje: 0, maximo: 0, respondidas: 0, total: 0 });
    p.puntaje += Number(q.puntos) || 0; p.maximo += q.puntos_max; p.total++;
    if (q.respuesta != null && q.respuesta !== "") p.respondidas++;
  }
  for (const p of Object.values(por)) { p.puntaje = redondear(p.puntaje); p.porcentaje = p.maximo ? Math.round((p.puntaje / p.maximo) * 100) : 0; }
  x.por_temario = por;
  return x;
}
function cerrar(x, motivo, config, ahora) {
  if (x.estado === "terminado" || x.estado === "anulado") return x;
  x.estado = "terminado";
  x.motivo_fin = motivo;
  x.terminado_en = new Date(ahora).toISOString();
  return totalizar(x, config);
}

// ---------- Lo que ve el técnico ----------
function vistaTecnico(x) {
  const base = { estado: x.estado, tecnico: x.tecnico, minutos: x.minutos, total: x.preguntas.length,
    niveles: Object.fromEntries(Object.entries(x.niveles || {}).map(([t, n]) => [TEMARIOS[t], NIVELES[n]])) };
  if (x.estado === "pendiente") {
    const cuenta = {};
    for (const q of x.preguntas) cuenta[TEMARIOS[q.temario]] = (cuenta[TEMARIOS[q.temario]] || 0) + 1;
    return { ...base, por_temario: cuenta };
  }
  if (x.estado === "en_curso") {
    const q = x.preguntas[x.actual];
    return { ...base, actual: x.actual, restante_ms: Math.max(0, Date.parse(x.vence_en) - Date.now()),
      pregunta: q ? { temario: TEMARIOS[q.temario], tipo: q.tipo, texto: q.texto, opciones: q.opciones || null, nivel: q.nivel } : null };
  }
  if (x.estado === "terminado") {
    return { ...base, motivo_fin: x.motivo_fin, puntaje: x.puntaje, maximo: x.maximo, porcentaje: x.porcentaje,
      respondidas: x.preguntas.filter((q) => q.respuesta != null && q.respuesta !== "").length,
      por_temario: Object.fromEntries(Object.entries(x.por_temario || {}).map(([t, p]) => [TEMARIOS[t], { porcentaje: p.porcentaje, respondidas: p.respondidas, total: p.total }])) };
  }
  return { estado: "anulado" };
}

const TOKEN_VALIDO = /^[A-Za-z0-9_-]{20,40}$/;

async function manejarPublico(req, res, gh) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.GITHUB_DATA_TOKEN || !process.env.GITHUB_DATA_REPO) { res.status(500).json({ error: "Falta configuración del servidor" }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
  const b = cuerpo(req);
  const ip = ipDe(req);
  const token = String(b.t || "");
  if (!TOKEN_VALIDO.test(token)) { res.status(404).json({ error: "El link del examen no es válido" }); return; }
  if (!pasaTope("ex|" + ip, { n: 120, ms: 10 * 60 * 1000 })) { res.status(429).json({ error: "Demasiados pedidos, esperá un momento" }); return; }
  try {
    const config = limpiarConfig(await leerJson(gh, RUTA_CONFIG, CONFIG_DEFECTO));
    const accion = String(b.accion || "estado");
    let vista = null, error = null, codigo = 200;
    const ahora = Date.now();
    const cambiar = (lista) => {
      const x = lista.find((i) => i.token === token);
      if (!x || x.estado === "anulado") { error = "Este link ya no está disponible. Pedile uno nuevo a la oficina"; codigo = 404; return null; }
      let tocado = false;
      // Se terminó el tiempo mientras no estaba.
      if (x.estado === "en_curso" && ahora > Date.parse(x.vence_en) + GRACIA_MS) { cerrar(x, "tiempo", config, ahora); tocado = true; }
      if (accion === "estado") {
        // Volver a abrir un examen empezado (recargó o cerró la página) cuenta como salir.
        if (x.estado === "en_curso" && b.reabre) { cerrar(x, "salio", config, ahora); tocado = true; }
      } else if (accion === "empezar") {
        if (x.estado === "pendiente") {
          x.estado = "en_curso"; x.actual = 0;
          x.iniciado_en = new Date(ahora).toISOString();
          x.vence_en = new Date(ahora + x.minutos * 60 * 1000).toISOString();
          x.ip_huella = crypto.createHash("sha256").update("ex|" + ip).digest("hex").slice(0, 12);
          tocado = true;
        }
      } else if (accion === "responder") {
        if (x.estado !== "en_curso") { error = "El examen ya terminó"; codigo = 409; }
        else if (ent(b.i, 0, 999, -1) !== x.actual) { error = "Esa pregunta ya se respondió"; codigo = 409; }
        else {
          const q = x.preguntas[x.actual];
          if (q.tipo === "mc") {
            const r = b.r === null || b.r === "" || b.r === undefined ? null : ent(b.r, 0, (q.opciones || []).length - 1, null);
            q.respuesta = r;
            q.puntos = r != null && r === q.correcta ? q.puntos_max : 0;
          } else {
            const r = txt(b.r, 2000);
            q.respuesta = r || null;
            const c = corregirAbierta(q, r);
            q.puntos = c.puntos; q.puntos_auto = c.puntos; q.claves_ok = c.encontradas;
          }
          q.respondida_en = new Date(ahora).toISOString();
          x.actual++;
          if (x.actual >= x.preguntas.length) cerrar(x, "completo", config, ahora);
          tocado = true;
        }
      } else if (accion === "fin_tiempo") {
        if (x.estado === "en_curso" && ahora >= Date.parse(x.vence_en) - 3000) { cerrar(x, "tiempo", config, ahora); tocado = true; }
      } else if (accion === "salir") {
        if (x.estado === "en_curso") { cerrar(x, "salio", config, ahora); x.salida_detalle = txt(b.motivo, 40); tocado = true; }
      } else { error = "Acción desconocida"; codigo = 400; }
      vista = vistaTecnico(x);
      return tocado ? lista : null;
    };
    // Primero se lee; solo se escribe si cambió algo (la mayoría de los "estado" no escriben).
    const lista = await leerJson(gh, RUTA_INTENTOS, []);
    if (cambiar(JSON.parse(JSON.stringify(Array.isArray(lista) ? lista : [])))) {
      vista = null; error = null; codigo = 200;
      await modificar(gh, RUTA_INTENTOS, [], cambiar, "Examen técnico: " + accion);
    }
    if (error && !vista) { res.status(codigo).json({ error }); return; }
    if (error) { res.status(codigo).json({ error, ...vista }); return; }
    res.status(200).json(vista);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}

// ---------- Panel de la oficina ----------
function resumenAdmin(x) {
  const { token, preguntas, ...resto } = x;
  return { ...resto, total: (preguntas || []).length, respondidas: (preguntas || []).filter((q) => q.respuesta != null && q.respuesta !== "").length, link_token: x.estado === "pendiente" ? token : null };
}
async function manejarAdmin(req, res, autorizacion, gh) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (!autorizacion || autorizacion.rol !== "admin") { res.status(403).json({ error: "Solo desde el panel de administración" }); return; }
  if (!process.env.GITHUB_DATA_TOKEN || !process.env.GITHUB_DATA_REPO) { res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" }); return; }
  const quien = autorizacion.nombre || "admin";
  try {
    const config = limpiarConfig(await leerJson(gh, RUTA_CONFIG, CONFIG_DEFECTO));
    if (req.method === "GET") {
      if (req.query.banco) { res.status(200).json({ banco: await leerBanco(gh), temarios: TEMARIOS, niveles: NIVELES }); return; }
      if (req.query.intento) {
        const x = (await leerJson(gh, RUTA_INTENTOS, [])).find((i) => i.id === req.query.intento);
        if (!x) { res.status(404).json({ error: "No existe ese examen" }); return; }
        const { token, ...resto } = x;
        res.status(200).json({ ...resto, link_token: x.estado === "pendiente" ? token : null });
        return;
      }
      const intentos = (await leerJson(gh, RUTA_INTENTOS, [])).map(resumenAdmin).sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)));
      res.status(200).json({ config, intentos, temarios: TEMARIOS, niveles: NIVELES });
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    const b = cuerpo(req);
    if (b.accion === "crear_link") {
      const tecnico = txt(b.tecnico, 60);
      if (!tecnico) { res.status(400).json({ error: "Elegí o escribí el técnico" }); return; }
      const niveles = {};
      for (const t of Object.keys(TEMARIOS)) { const n = ent(b.niveles && b.niveles[t], 0, 3, 0); if (n) niveles[t] = n; }
      if (!Object.keys(niveles).length) { res.status(400).json({ error: "Elegí al menos un temario" }); return; }
      const maxNivel = Math.max(...Object.values(niveles));
      const minutos = ent(b.minutos, 5, 180, config.minutos_por_nivel[maxNivel]);
      const preguntas = armarPreguntas(await leerBanco(gh), config, niveles);
      if (!preguntas.length) { res.status(400).json({ error: "No hay preguntas cargadas para esos temarios" }); return; }
      const x = { id: "ex" + crypto.randomBytes(5).toString("hex"), token: crypto.randomBytes(18).toString("base64url"), tecnico, niveles, minutos,
        estado: "pendiente", creado_en: new Date().toISOString(), creado_por: quien, actual: 0, preguntas };
      totalizar(x, config);
      await modificar(gh, RUTA_INTENTOS, [], (lista) => { lista.push(x); return lista; }, "Examen técnico: link para " + tecnico);
      res.status(200).json({ ok: true, id: x.id, token: x.token, total: preguntas.length, minutos });
      return;
    }
    if (b.accion === "anular" || b.accion === "ajustar" || b.accion === "cerrar") {
      let out = null, err = null;
      await modificar(gh, RUTA_INTENTOS, [], (lista) => {
        const x = lista.find((i) => i.id === b.id);
        if (!x) { err = "No existe ese examen"; return null; }
        if (b.accion === "anular") {
          if (x.estado === "terminado") { err = "Un examen terminado no se anula; queda en el historial"; return null; }
          x.estado = "anulado"; x.anulado_por = quien; x.anulado_en = new Date().toISOString();
        } else if (b.accion === "cerrar") {
          if (x.estado !== "en_curso") { err = "Ese examen no está en curso"; return null; }
          cerrar(x, "cerrado_oficina", config, Date.now());
        } else {
          const q = x.preguntas[ent(b.indice, 0, 999, -1)];
          if (!q) { err = "No existe esa pregunta"; return null; }
          if (x.estado !== "terminado") { err = "Se ajusta cuando el examen terminó"; return null; }
          const p = Number(b.puntos);
          if (!Number.isFinite(p) || p < 0 || p > q.puntos_max) { err = "Puntaje entre 0 y " + q.puntos_max; return null; }
          q.puntos = redondear(p); q.ajustado_por = quien;
          totalizar(x, config);
        }
        out = resumenAdmin(x);
        return lista;
      }, "Examen técnico: " + b.accion);
      if (err) { res.status(400).json({ error: err }); return; }
      res.status(200).json({ ok: true, intento: out });
      return;
    }
    if (b.accion === "guardar_config") {
      const c = limpiarConfig(b.config);
      await modificar(gh, RUTA_CONFIG, CONFIG_DEFECTO, () => c, "Examen técnico: configuración");
      res.status(200).json({ ok: true, config: c });
      return;
    }
    if (b.accion === "guardar_banco") {
      const lista = (Array.isArray(b.banco) ? b.banco : []).slice(0, 600).map(limpiarPregunta).filter(Boolean);
      const ids = new Set();
      for (const p of lista) { while (ids.has(p.id)) p.id += "x"; ids.add(p.id); }
      if (!lista.length) { res.status(400).json({ error: "El banco no puede quedar vacío" }); return; }
      await modificar(gh, RUTA_BANCO, [], () => lista, "Examen técnico: banco de preguntas (" + quien + ")");
      res.status(200).json({ ok: true, total: lista.length });
      return;
    }
    res.status(400).json({ error: "Acción desconocida" });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}

module.exports = { manejarPublico, manejarAdmin, _prueba: { armarPreguntas, corregirAbierta, limpiarConfig, totalizar, categoriaDe, limpiarPregunta, CONFIG_DEFECTO } };
