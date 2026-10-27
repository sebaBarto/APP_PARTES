// Función serverless de Vercel — endpoint genérico que reemplaza a
// varios endpoints chicos que hacían básicamente lo mismo (leer/guardar
// un archivo de configuración en el repo privado de datos). Se
// consolidaron acá para no pasarse del límite de funciones serverless
// del plan gratuito de Vercel (12 por proyecto).
//
// Uso: /api/datos?coleccion=<nombre>  (ver COLECCIONES abajo)
//
// Variables de entorno reutilizadas:
//   SERVICIOS_API_TOKEN, GITHUB_DATA_TOKEN, GITHUB_DATA_REPO

const crypto = require("crypto");

// Verifica la contraseña del panel de administración contra un HASH
// guardado en la variable de entorno (ADMIN_PASSWORD_HASH), nunca
// contra la contraseña en texto plano — así, ni siquiera alguien con
// acceso a la configuración de Vercel puede leer la contraseña real,
// solo confirmar si un intento coincide o no. El hash se guarda como
// "salt:hash" (ambos en hexadecimal), generado con scrypt (incluido
// en Node, sin depender de ningún paquete externo).
//
// Nota de compatibilidad: si todavía no se migró a
// ADMIN_PASSWORD_HASH, sigue aceptando la variable vieja
// (ADMIN_PASSWORD, texto plano) como respaldo — para no dejar el
// panel sin acceso hasta que se genere el hash nuevo.
async function verificarPasswordAdmin(intento) {
  if (typeof intento !== "string" || !intento) return false;

  const hashGuardado = process.env.ADMIN_PASSWORD_HASH;
  if (hashGuardado) {
    const [saltHex, hashHex] = hashGuardado.split(":");
    if (!saltHex || !hashHex) return false;
    const hashIntento = await new Promise((resolve, reject) => {
      crypto.scrypt(intento, Buffer.from(saltHex, "hex"), 64, (err, derivedKey) => {
        if (err) reject(err); else resolve(derivedKey);
      });
    });
    const bufferGuardado = Buffer.from(hashHex, "hex");
    // Comparación de tiempo constante — evita que alguien pueda medir
    // cuánto tarda la respuesta para deducir la contraseña de a poco.
    return hashIntento.length === bufferGuardado.length && crypto.timingSafeEqual(hashIntento, bufferGuardado);
  }

  // Respaldo temporal mientras no se configuró el hash todavía.
  return !!process.env.ADMIN_PASSWORD && intento === process.env.ADMIN_PASSWORD;
}

// Lista de técnicos tal como está guardada (con claves y permisos). Solo
// para usar del lado del servidor: nunca se devuelve así al navegador.
async function leerTecnicosGuardados() {
  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) throw new Error("Faltan variables de entorno");
  const url = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/tecnicos.json`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${GITHUB_DATA_TOKEN}`, Accept: "application/vnd.github+json" } });
  if (!r.ok) return [];
  const data = await r.json();
  const lista = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  return Array.isArray(lista) ? lista : [];
}

// ¿La clave es la de ese técnico? (la misma verificación que el login de la app)
async function verificarClaveTecnico(nombre, password) {
  if (typeof nombre !== "string" || !nombre || typeof password !== "string" || !password) return false;
  const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
  // 1) Primero contra el backend nuevo (hash real, PBKDF2) — es lo que pasa
  // siempre después de la primera vez que cada técnico entra.
  if (BACKEND_NUEVO_URL && BACKEND_NUEVO_TOKEN) {
    try {
      const rNuevo = await fetch(`${BACKEND_NUEVO_URL}/api/tecnicos/verificar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, password }),
      });
      if (rNuevo.status === 200) {
        const dataNuevo = await rNuevo.json();
        if (dataNuevo.ok) return true;
      }
      // 401 (no coincide o todavía no está ahí) -> sigue al paso 2.
    } catch (errNuevo) { /* si el backend nuevo no responde, se sigue con el respaldo */ }
  }
  // 2) Respaldo: la lista guardada (texto plano) — cubre a quien cambió la
  // clave después de la migración o es nuevo y no tiene hash todavía.
  const tecnicos = await leerTecnicosGuardados();
  const encontrado = tecnicos.find((t) => t.nombre === nombre);
  const ok = !!encontrado && encontrado.password === password;
  // 3) Si coincidió acá, de paso se guarda el hash en el backend nuevo.
  if (ok && BACKEND_NUEVO_URL && BACKEND_NUEVO_TOKEN) {
    fetch(`${BACKEND_NUEVO_URL}/api/tecnicos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ nombre, password, permisos: encontrado.permisos || {} }]),
    }).catch(() => {});
  }
  return ok;
}

// ¿Tiene tildado el permiso "Panel de Administración"?
async function tienePermisoAdmin(nombre) {
  const t = (await leerTecnicosGuardados()).find((x) => x.nombre === nombre);
  return !!(t && t.permisos && t.permisos.admin);
}

// ============================================================
// PRESUPUESTO EXPRESS
//  - lista_precios: la base de artículos con precio (Excel que sube la
//    oficina) + la cotización del dólar. Puede ser grande, así que se
//    guarda compacta y se lee "cruda" (la API de GitHub no devuelve el
//    contenido en base64 de archivos de más de 1 MB).
//  - presupuestos_express: la numeración E-0001, E-0002... (se reserva
//    el número en el servidor, así dos personas nunca sacan el mismo) y
//    un registro de los que se emitieron.
// ============================================================
const RUTA_LISTA_PRECIOS = "lista-precios.json";
const RUTA_PRESUPUESTOS_EXPRESS = "presupuestos-express.json";
function headersGithubDatos(extra) {
  return { Authorization: `Bearer ${process.env.GITHUB_DATA_TOKEN}`, Accept: "application/vnd.github+json", ...(extra || {}) };
}
function urlGithubDatos(ruta) {
  return `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${ruta}`;
}
async function leerArchivoDatos(ruta, porDefecto) {
  // sha (sirve aunque el archivo pese más de 1 MB) + contenido crudo
  const rMeta = await fetch(urlGithubDatos(ruta), { headers: headersGithubDatos() });
  if (rMeta.status === 404) return { data: porDefecto, sha: undefined };
  if (!rMeta.ok) throw new Error("No se pudo leer " + ruta);
  const meta = await rMeta.json();
  let texto;
  if (meta.content && meta.encoding === "base64") texto = Buffer.from(meta.content, "base64").toString("utf-8");
  else {
    const rRaw = await fetch(urlGithubDatos(ruta), { headers: headersGithubDatos({ Accept: "application/vnd.github.raw" }) });
    if (!rRaw.ok) throw new Error("No se pudo leer " + ruta);
    texto = await rRaw.text();
  }
  let data = porDefecto;
  try { data = JSON.parse(texto); } catch (e) { data = porDefecto; }
  return { data, sha: meta.sha };
}
async function escribirArchivoDatos(ruta, data, sha, mensaje) {
  const r = await fetch(urlGithubDatos(ruta), {
    method: "PUT",
    headers: headersGithubDatos({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message: mensaje, content: Buffer.from(JSON.stringify(data)).toString("base64"), sha }),
  });
  return r;
}
function numeroArgentino(v) {
  if (typeof v === "number") return isFinite(v) ? v : NaN;
  let t = String(v == null ? "" : v).replace(/[^\d.,-]/g, "");
  if (!t) return NaN;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = t.replace(",", ".");
  else if ((t.match(/\./g) || []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(t)) t = t.replace(/\./g, ""); // "1.450" = mil cuatrocientos cincuenta
  return Number(t);
}
async function manejarPresupuestoExpress(req, res, autorizacion, body) {
  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) { res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" }); return; }
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const esAdmin = autorizacion.rol === "admin";
  const coleccion = req.query.coleccion;
  try {
    if (coleccion === "lista_precios") {
      const vacia = { actualizado: "", archivo: "", cotizacion_usd: null, items: [] };
      if (req.method === "GET") {
        const { data } = await leerArchivoDatos(RUTA_LISTA_PRECIOS, vacia);
        res.status(200).json({ ...vacia, ...(data || {}) });
        return;
      }
      if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
      if (!esAdmin) { res.status(403).json({ error: "La lista de precios solo la carga la oficina" }); return; }
      const b = body && typeof body === "object" ? body : {};
      for (let intento = 0; intento < 3; intento++) {
        const { data, sha } = await leerArchivoDatos(RUTA_LISTA_PRECIOS, vacia);
        const actual = { ...vacia, ...(data || {}) };
        if (b.accion === "cotizacion") {
          const v = numeroArgentino(b.valor);
          if (!(v > 0)) { res.status(400).json({ error: "Poné una cotización válida (mayor a 0)" }); return; }
          actual.cotizacion_usd = v;
          actual.cotizacion_actualizada = new Date().toISOString();
          actual.cotizacion_por = autorizacion.nombre || "";
        } else if (b.accion === "reemplazar") {
          if (!Array.isArray(b.items) || b.items.length === 0) { res.status(400).json({ error: "La lista está vacía" }); return; }
          if (b.items.length > 30000) { res.status(400).json({ error: "La lista tiene demasiados artículos (máximo 30.000)" }); return; }
          const items = [];
          for (const it of b.items) {
            const d = String((it && it.d) || "").replace(/\s+/g, " ").trim().slice(0, 400);
            const p = numeroArgentino(it && it.p);
            if (!d || !(p >= 0)) continue;
            items.push({ c: String((it && it.c) || "").trim().slice(0, 60), d, p: Math.round(p * 100) / 100, m: it && it.m === "USD" ? "USD" : "ARS" });
          }
          if (!items.length) { res.status(400).json({ error: "Ningún artículo tenía descripción y precio válidos" }); return; }
          actual.items = items;
          actual.archivo = String(b.archivo || "").slice(0, 200);
          actual.actualizado = new Date().toISOString();
          actual.actualizado_por = autorizacion.nombre || "";
          if (b.cotizacion_usd !== undefined && numeroArgentino(b.cotizacion_usd) > 0) actual.cotizacion_usd = numeroArgentino(b.cotizacion_usd);
        } else if (b.accion === "kits") {
          // Kits armados (ej. "Kit alarma básica"): nombre + artículos de la lista con su cantidad.
          if (!Array.isArray(b.kits)) { res.status(400).json({ error: "Formato inválido" }); return; }
          actual.kits = b.kits.slice(0, 100).map((k) => ({
            nombre: String((k && k.nombre) || "").replace(/\s+/g, " ").trim().slice(0, 80),
            items: (Array.isArray(k && k.items) ? k.items : []).slice(0, 60).map((it) => ({
              c: String((it && it.c) || "").trim().slice(0, 60), d: String((it && it.d) || "").replace(/\s+/g, " ").trim().slice(0, 400),
              cant: Math.max(1, Math.min(999, Math.round(Number(it && it.cant) || 1))),
            })).filter((it) => it.d),
          })).filter((k) => k.nombre && k.items.length);
        } else if (b.accion === "foto") {
          // Foto de un artículo (para el PDF). Clave: código si tiene, si no la descripción.
          const clave = String(b.clave || "").trim().slice(0, 400);
          if (!clave) { res.status(400).json({ error: "Falta el artículo" }); return; }
          actual.fotos = actual.fotos && typeof actual.fotos === "object" ? actual.fotos : {};
          if (b.id) actual.fotos[clave] = String(b.id).replace(/[^\w-]/g, "").slice(0, 60);
          else delete actual.fotos[clave];
        } else { res.status(400).json({ error: "Acción inválida" }); return; }
        const r = await escribirArchivoDatos(RUTA_LISTA_PRECIOS, actual, sha, `Lista de precios (${b.accion}) — ${autorizacion.nombre || "admin"}`);
        if (r.ok) { res.status(200).json({ ok: true, cantidad: actual.items.length, cotizacion_usd: actual.cotizacion_usd, kits: (actual.kits || []).length, fotos: Object.keys(actual.fotos || {}).length }); return; }
        if (r.status !== 409 && r.status !== 422) { res.status(502).json({ error: "No se pudo guardar la lista de precios" }); return; }
      }
      res.status(409).json({ error: "Otra persona estaba guardando al mismo tiempo. Probá de nuevo." });
      return;
    }

    // presupuestos_express
    const vacio = { ultimo: 0, presupuestos: [] };
    if (req.method === "GET") {
      if (!esAdmin) { res.status(403).json({ error: "Solo la oficina ve el registro de presupuestos" }); return; }
      const { data } = await leerArchivoDatos(RUTA_PRESUPUESTOS_EXPRESS, vacio);
      res.status(200).json({ ...vacio, ...(data || {}) });
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    const b = body && typeof body === "object" ? body : {};
    if (!esAdmin) {
      const t = (await leerTecnicosGuardados()).find((x) => x.nombre === autorizacion.nombre);
      if (!(t && t.permisos && t.permisos.presupuesto_express)) { res.status(403).json({ error: "No tenés habilitado el Presupuesto express" }); return; }
    }
    const txt = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
    for (let intento = 0; intento < 4; intento++) {
      const { data, sha } = await leerArchivoDatos(RUTA_PRESUPUESTOS_EXPRESS, vacio);
      const reg = { ...vacio, ...(data || {}) };
      if (!Array.isArray(reg.presupuestos)) reg.presupuestos = [];
      let respuesta;
      if (b.accion === "nuevo") {
        reg.ultimo = (Number(reg.ultimo) || 0) + 1;
        const numero = "E-" + String(reg.ultimo).padStart(4, "0");
        reg.presupuestos.unshift({
          numero, fecha: new Date().toISOString(), emitido_por: autorizacion.nombre || "Oficina",
          cliente: txt(b.cliente, 150), numero_cliente: txt(b.numero_cliente, 30), titulo: txt(b.titulo, 150),
          total_materiales: numeroArgentino(b.total_materiales) || 0, mano_obra: numeroArgentino(b.mano_obra) || 0,
          total: numeroArgentino(b.total) || 0, forma_pago: txt(b.forma_pago, 80), cotizacion_usd: numeroArgentino(b.cotizacion_usd) || null,
          tipo: ["ampliacion", "monitoreado", "automonitoreo"].includes(b.tipo) ? b.tipo : "", abono: numeroArgentino(b.abono) || null,
          mo_iva: b.mo_iva === true, abono_iva: b.abono_iva === true, ajuste: Number(b.ajuste) || 0,
          articulos: Math.max(0, Math.min(1000, Number(b.articulos) || 0)),
        });
        reg.presupuestos = reg.presupuestos.slice(0, 3000);
        respuesta = { ok: true, numero };
      } else if (b.accion === "revision") {
        // Corrección de un presupuesto ya enviado: mismo número con -R1, -R2...
        const base = txt(b.base, 20).replace(/-R\d+$/, "");
        if (!/^E-\d{4,}$/.test(base)) { res.status(400).json({ error: "Número de presupuesto inválido" }); return; }
        const previas = reg.presupuestos.filter((x) => x.numero === base || String(x.numero).startsWith(base + "-R"));
        const n = previas.reduce((m, x) => Math.max(m, Number((String(x.numero).match(/-R(\d+)$/) || [0, 0])[1])), 0) + 1;
        const numero = `${base}-R${n}`;
        reg.presupuestos.unshift({
          numero, revision_de: base, fecha: new Date().toISOString(), emitido_por: autorizacion.nombre || "Oficina",
          cliente: txt(b.cliente, 150), numero_cliente: txt(b.numero_cliente, 30), titulo: txt(b.titulo, 150),
          total_materiales: numeroArgentino(b.total_materiales) || 0, mano_obra: numeroArgentino(b.mano_obra) || 0,
          total: numeroArgentino(b.total) || 0, forma_pago: txt(b.forma_pago, 80), cotizacion_usd: numeroArgentino(b.cotizacion_usd) || null,
          tipo: ["ampliacion", "monitoreado", "automonitoreo"].includes(b.tipo) ? b.tipo : "", abono: numeroArgentino(b.abono) || null,
          mo_iva: b.mo_iva === true, abono_iva: b.abono_iva === true, ajuste: Number(b.ajuste) || 0,
          articulos: Math.max(0, Math.min(1000, Number(b.articulos) || 0)),
        });
        reg.presupuestos = reg.presupuestos.slice(0, 3000);
        respuesta = { ok: true, numero };
      } else if (b.accion === "adjuntar_pdf") {
        const e = reg.presupuestos.find((x) => x.numero === b.numero);
        if (!e) { res.status(404).json({ error: "No existe ese presupuesto" }); return; }
        e.pdf_id = txt(b.pdf_id, 80);
        respuesta = { ok: true };
      } else { res.status(400).json({ error: "Acción inválida" }); return; }
      const r = await escribirArchivoDatos(RUTA_PRESUPUESTOS_EXPRESS, reg, sha, `Presupuesto express ${b.accion} — ${autorizacion.nombre || "admin"}`);
      if (r.ok) { res.status(200).json(respuesta); return; }
      if (r.status !== 409 && r.status !== 422) { res.status(502).json({ error: "No se pudo guardar el presupuesto" }); return; }
    }
    res.status(409).json({ error: "Muchos presupuestos al mismo tiempo. Probá de nuevo." });
  } catch (err) {
    res.status(500).json({ error: "Error interno: " + String(err.message || err) });
  }
}

// ============================================================
// CROQUIS: bocetos de planos hechos desde el celular. Un archivo por
// croquis (croquis/<id>.json, con los trazos para seguir editándolo) y un
// índice chico (croquis-index.json) para listarlos sin bajar todo.
// ============================================================
const RUTA_CROQUIS_INDICE = "croquis-index.json";
// ---------- Croquis desde la foto de un boceto en papel ----------
// La IA (Gemini, la misma clave que usa Manuales) mira la foto y devuelve
// lo que entiende en un JSON simple; la app lo convierte en un croquis
// editable (croquisDesdeIA en croquis-utils.js).
const PROMPT_BOCETO_CROQUIS = `Sos un asistente de una empresa argentina de alarmas (SAT). Te paso la foto de un boceto hecho a mano alzada por un técnico: es la planta de un domicilio o local, con los equipos de alarma marcados.
Interpretá el dibujo y devolvé SOLO un JSON con esta forma:
{
  "rotacion": 0,
  "habitaciones": [{"x1":0,"y1":0,"x2":0,"y2":0,"nombre":""}],
  "paredes": [{"x1":0,"y1":0,"x2":0,"y2":0}],
  "aberturas": [{"tipo":"puerta","x1":0,"y1":0,"x2":0,"y2":0}],
  "equipos": [{"tipo":"central","x":0,"y":0,"numero":"","apunta":"","agregar":false}],
  "textos": [{"x":0,"y":0,"texto":""}],
  "notas": ""
}
Coordenadas: x de 0 a 1000 a lo ancho de la foto (0 = borde izquierdo) e y de 0 a 1000 a lo alto (0 = borde de arriba), tal como se ve la foto, sin rotarla.
"rotacion": cuántos grados hay que girar la foto en sentido horario para que los textos del dibujo se lean derechos (0, 90, 180 o 270). Si la hoja está de costado, no es 0.
Reglas:
- "habitaciones": cada ambiente rectangular (esquinas opuestas). El contorno exterior de la casa también es una habitación. Si tiene nombre escrito adentro (Cocina, Oficina, etc.) ponelo en "nombre" y no lo repitas en textos.
- "paredes": líneas sueltas que dividen ambientes y no forman un rectángulo cerrado.
- "aberturas": van sobre una pared, x1,y1-x2,y2 es el tramo que ocupan. tipo: "puerta" (rectángulo angosto o arco sobre la pared), "ventana" (rectángulo doble angosto y corto), "corrediza" (rectángulo doble largo), "porton_corredizo", "porton_batiente".
- "equipos" (tipo exacto de esta lista): "central" (cuadrado con "CA" o "C" o "Central"), "teclado" (cuadrado con "T"), "hub", "repetidor" ("ReX"), "sirena_ext" / "sirena_int" (rectángulo con un triángulo abajo, o "S"), "magnetico" (cuadradito relleno o "M" junto a una puerta o ventana), "infrarrojo" (triángulo con rayitas "ııı" o "!!!" que indican hacia dónde capta; "infrarrojo_ext" si dice exterior), "humo" (círculo con "DH" o "humo"), "gas" ("DG" o "gas"), "pulsador_incendio", "pulsador_asalto", "camara_ip", "camara_analoga", "dvr", "monitor".
  "numero": el número de zona o dispositivo escrito al lado (ej. "3"); vacío si no hay.
  "agregar": true si el equipo está marcado como a agregar o a instalar (dice "AGREGAR", "nuevo", "a instalar", "presupuestar" o tiene una flecha con eso). En ese caso no pongas ese "AGREGAR" en "textos".
  "apunta" (solo infrarrojos y cámaras): hacia dónde mira, según la foto sin rotar: "arriba", "abajo", "izquierda", "derecha", "arriba-izquierda", "arriba-derecha", "abajo-izquierda" o "abajo-derecha". Las rayitas del infrarrojo están del lado hacia donde capta.
  "x","y": el centro del símbolo.
- "textos": anotaciones cortas dentro del plano que no sean nombres de ambientes ni números de zona (ej. "AGREGAR", un modelo de equipo, "gabinete apertura puerta").
- "notas": todo lo escrito fuera del plano (listas, "presupuestar", observaciones), en líneas separadas con \\n.
No inventes cosas que no estén dibujadas. Si dudás qué equipo es, usá el más parecido y agregá un texto al lado con lo que dice.`;
async function interpretarBocetoCroquis(b, res) {
  const { GEMINI_API_KEY } = process.env;
  if (!GEMINI_API_KEY) { res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel" }); return; }
  const imagen = String(b.imagen || "").replace(/^data:[^,]*,/, "");
  const mime = /^image\/(jpeg|png|webp)$/.test(b.mime) ? b.mime : "image/jpeg";
  if (imagen.length < 1000) { res.status(400).json({ error: "Falta la foto del boceto" }); return; }
  if (imagen.length > 4000000) { res.status(400).json({ error: "La foto es demasiado grande" }); return; }
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: imagen } }, { text: PROMPT_BOCETO_CROQUIS }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 429) { res.status(429).json({ error: "Se alcanzó el límite de consultas a la IA por ahora. Probá de nuevo en unos minutos." }); return; }
    res.status(502).json({ error: "No se pudo consultar la IA", detail: d.error || d });
    return;
  }
  const texto = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []).map((p) => p.text || "").join("");
  let resultado = null;
  try { resultado = JSON.parse(texto.replace(/^```(json)?/i, "").replace(/```\s*$/, "").trim()); } catch (e) { resultado = null; }
  if (!resultado || typeof resultado !== "object") { res.status(502).json({ error: "La IA no pudo interpretar el boceto. Probá con una foto más de frente y con buena luz." }); return; }
  res.status(200).json({ ok: true, resultado });
}
async function manejarCroquis(req, res, autorizacion, body) {
  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) { res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" }); return; }
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const esAdmin = autorizacion.rol === "admin";
  let puede = esAdmin;
  if (!puede) {
    const t = (await leerTecnicosGuardados()).find((x) => x.nombre === autorizacion.nombre);
    puede = !!(t && t.permisos && t.permisos.croquis);
  }
  if (!puede) { res.status(403).json({ error: "No tenés habilitados los croquis" }); return; }
  const txt = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
  const idValido = (id) => /^[a-z0-9]{6,32}$/.test(String(id || ""));
  try {
    if (req.method === "GET") {
      if (req.query.id) {
        if (!idValido(req.query.id)) { res.status(400).json({ error: "Id inválido" }); return; }
        const { data } = await leerArchivoDatos(`croquis/${req.query.id}.json`, null);
        if (!data) { res.status(404).json({ error: "Ese croquis ya no existe" }); return; }
        res.status(200).json(data);
        return;
      }
      const { data } = await leerArchivoDatos(RUTA_CROQUIS_INDICE, []);
      res.status(200).json(Array.isArray(data) ? data : []);
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    const b = body && typeof body === "object" ? body : {};
    if (b.accion === "interpretar") { await interpretarBocetoCroquis(b, res); return; }
    if (b.accion === "guardar") {
      const id = b.id && idValido(b.id) ? b.id : (Date.now().toString(36) + require("crypto").randomBytes(4).toString("hex"));
      const dibujo = b.dibujo && typeof b.dibujo === "object" ? b.dibujo : null;
      if (!dibujo || !Array.isArray(dibujo.elementos)) { res.status(400).json({ error: "El croquis está vacío" }); return; }
      if (JSON.stringify(dibujo).length > 900000) { res.status(400).json({ error: "El croquis es demasiado grande" }); return; }
      const ruta = `croquis/${id}.json`;
      const previo = await leerArchivoDatos(ruta, null);
      // Lo puede seguir editando cualquiera habilitado; queda registrado quién lo creó y quién lo cambió.
      const ahora = new Date().toISOString();
      const registro = {
        id, titulo: txt(b.titulo, 120) || "Croquis", cliente: txt(b.cliente, 150), numero_cliente: txt(b.numero_cliente, 30), direccion: txt(b.direccion, 200),
        autor: (previo.data && previo.data.autor) || autorizacion.nombre || "Oficina", creado: (previo.data && previo.data.creado) || ahora,
        actualizado: ahora, actualizado_por: autorizacion.nombre || "Oficina", dibujo,
      };
      const r1 = await escribirArchivoDatos(ruta, registro, previo.sha, `Croquis ${registro.titulo} — ${autorizacion.nombre || "admin"}`);
      if (!r1.ok) { res.status(502).json({ error: "No se pudo guardar el croquis" }); return; }
      const paginas = Array.isArray(dibujo.paginas) ? dibujo.paginas : null;
      const resumen = { ...registro, elementos: paginas ? paginas.reduce((n, p) => n + ((p && Array.isArray(p.elementos)) ? p.elementos.length : 0), 0) : dibujo.elementos.length, paginas: paginas ? paginas.length : 1 };
      delete resumen.dibujo;
      for (let intento = 0; intento < 4; intento++) {
        const { data, sha } = await leerArchivoDatos(RUTA_CROQUIS_INDICE, []);
        const lista = (Array.isArray(data) ? data : []).filter((x) => x.id !== id);
        lista.unshift(resumen);
        const r2 = await escribirArchivoDatos(RUTA_CROQUIS_INDICE, lista.slice(0, 5000), sha, `Índice de croquis — ${registro.titulo}`);
        if (r2.ok) { res.status(200).json({ ok: true, id, actualizado: ahora }); return; }
        if (r2.status !== 409 && r2.status !== 422) break;
      }
      res.status(200).json({ ok: true, id, actualizado: ahora, aviso: "Se guardó, pero puede tardar en aparecer en la lista" });
      return;
    }
    if (b.accion === "borrar") {
      if (!idValido(b.id)) { res.status(400).json({ error: "Id inválido" }); return; }
      const ruta = `croquis/${b.id}.json`;
      const previo = await leerArchivoDatos(ruta, null);
      if (previo.data && !esAdmin && previo.data.autor !== autorizacion.nombre) { res.status(403).json({ error: "Solo lo puede borrar quien lo hizo, o la oficina" }); return; }
      if (previo.sha) {
        await fetch(urlGithubDatos(ruta), { method: "DELETE", headers: headersGithubDatos({ "Content-Type": "application/json" }), body: JSON.stringify({ message: `Borra croquis ${b.id}`, sha: previo.sha }) });
      }
      for (let intento = 0; intento < 4; intento++) {
        const { data, sha } = await leerArchivoDatos(RUTA_CROQUIS_INDICE, []);
        const lista = (Array.isArray(data) ? data : []).filter((x) => x.id !== b.id);
        const r2 = await escribirArchivoDatos(RUTA_CROQUIS_INDICE, lista, sha, `Índice de croquis — borra ${b.id}`);
        if (r2.ok) { res.status(200).json({ ok: true }); return; }
        if (r2.status !== 409 && r2.status !== 422) break;
      }
      res.status(502).json({ error: "No se pudo actualizar la lista de croquis" });
      return;
    }
    res.status(400).json({ error: "Acción inválida" });
  } catch (err) {
    res.status(500).json({ error: "Error interno: " + String(err.message || err) });
  }
}

const COLECCIONES = {
  config: {
    path: "config.json",
    default: { dias_atencion: 3, dias_urgente: 7, app_version_actual: "3.38.0", felicitacion_semanal_activa: true },
    mergeConDefault: true,
  },
  tecnicos: { path: "tecnicos.json", default: [] },
  clientes: { path: "clientes-config.json", default: [] },
  materiales: { path: "materiales-catalogo.json", default: [] },
  "consultas-categorias": { path: "consultas-categorias.json", default: [] },
  guardias: { path: "guardias-config.json", default: { fecha_inicio_referencia: "", secuencia: [] } },
  credenciales: { path: "credenciales-config.json", default: [] },
  servicios_emergencia: { path: "servicios-emergencia.json", default: [] },
  vehiculos: {
    path: "vehiculos-config.json",
    default: [
      { nombre: "Renault Kangoo Blanca", km_actual: 0, umbrales: [] },
      { nombre: "Renault Kangoo Gris", km_actual: 0, umbrales: [] },
      { nombre: "Moto", km_actual: 0, umbrales: [] },
    ],
  },
  "push-subscripciones": { path: "push-subscripciones.json", default: [] },
  sims: { path: "sims-config.json", default: [] },
  herramientas: { path: "herramientas-config.json", default: [] },
  sims_instaladas: { path: "sims-instaladas.json", default: [] },
  errores_app: { path: "errores-app.json", default: [] },
  // { "<numero_servicio>": { primera: ISO, ultima: ISO } } — cuándo apareció
  // por primera vez cada servicio en el listado de pendientes.
  servicios_vistos: { path: "servicios-vistos.json", default: {} },
  // Sección cooperativa de Manuales: datos que aportan los técnicos
  // (APNs, códigos, trucos), con quién lo cargó, cuándo y quién lo editó.
  datos_equipo: { path: "datos-equipo.json", default: [] },
  // Registro de cambios del panel de administración (lo escribe lib/auditoria.js).
  auditoria: { path: "auditoria.json", default: [] },
};

// Traduce cada colección que ya se cortó al backend nuevo — algunas
// tienen exactamente la misma forma de datos en los dos lados (esas
// son un simple reenvío), y otras dos (materiales y categorías de
// consultas) tienen una forma distinta, así que hay que armar/
// desarmar la estructura de un lado al otro.
// credenciales, materiales y categorías de manuales no tienen una clave
// propia (solo un id que pone la base): el POST del backend AGREGA filas,
// no reemplaza. Mandar la lista completa en cada "Guardar" duplicaba todo.
// Ahora se reemplaza: se vacía la tabla (DELETE, que ya existía para las
// migraciones) y se carga la lista nueva. Si la carga fallara, se vuelve a
// poner lo que había antes, para no dejar la tabla vacía.
async function reemplazarColeccionSinClave(ruta, filasNuevas, backendUrl, headers) {
  const rPrevio = await fetch(`${backendUrl}${ruta}`, { headers });
  if (!rPrevio.ok) throw new Error("No se pudo leer lo que había guardado");
  const previas = await rPrevio.json();
  const rBorrar = await fetch(`${backendUrl}${ruta}`, { method: "DELETE", headers });
  if (!rBorrar.ok) throw new Error("No se pudo reemplazar la lista (el servidor no permitió vaciarla)");
  const sinId = (lista) => (Array.isArray(lista) ? lista : []).map(({ id, ...resto }) => resto);
  const r = await fetch(`${backendUrl}${ruta}`, { method: "POST", headers, body: JSON.stringify(sinId(filasNuevas)) });
  if (!r.ok) {
    if (sinId(previas).length) await fetch(`${backendUrl}${ruta}`, { method: "POST", headers, body: JSON.stringify(sinId(previas)) }).catch(() => {});
    let detalle = ""; try { detalle = (await r.json()).error || ""; } catch (e) { /* nada */ }
    return { status: r.status, data: { error: "No se pudo guardar" + (detalle ? ": " + detalle : "") + " — quedó lo que había antes." } };
  }
  const data = await r.json();
  return { status: 200, data: { ok: data.ok !== false, count: data.count ?? filasNuevas.length } };
}

async function manejarColeccionCortada(nombreColeccion, metodo, body, backendUrl, headers) {
  if (nombreColeccion === "clientes") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/clientes`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      // admin.html manda POST con lista vacía para "borrar todos"
      // (así funcionaba con el sistema viejo) — se traduce a DELETE.
      if (Array.isArray(body) && body.length === 0) {
        const r = await fetch(`${backendUrl}/api/clientes`, { method: "DELETE", headers });
        return { status: r.status, data: await r.json() };
      }
      const r = await fetch(`${backendUrl}/api/clientes`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: r.status, data: await r.json() };
    }
  }

  if (nombreColeccion === "materiales") {
    // GitHub: [{categoria, modelos: [...]}]  <->  backend nuevo: [{id, categoria, nombre, precio}]
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/materiales`, { headers });
      const filas = await r.json();
      const porCategoria = {};
      (Array.isArray(filas) ? filas : []).forEach((f) => {
        if (!porCategoria[f.categoria]) porCategoria[f.categoria] = [];
        porCategoria[f.categoria].push(f.nombre);
      });
      const agrupado = Object.keys(porCategoria).map((categoria) => ({ categoria, modelos: porCategoria[categoria] }));
      return { status: r.status, data: agrupado };
    }
    if (metodo === "POST") {
      const filas = [];
      (Array.isArray(body) ? body : []).forEach((cat) => {
        (cat.modelos || []).forEach((modelo) => filas.push({ categoria: cat.categoria, nombre: modelo, precio: null }));
      });
      return await reemplazarColeccionSinClave("/api/materiales", filas, backendUrl, headers);
    }
  }

  if (nombreColeccion === "consultas-categorias") {
    // GitHub: [{categoria, carpeta_drive_id}]  <->  backend nuevo: [{id, nombre, manual_ref}]
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/consultas-categorias`, { headers });
      const filas = await r.json();
      const traducido = (Array.isArray(filas) ? filas : []).map((f) => ({ categoria: f.nombre, carpeta_drive_id: f.manual_ref }));
      return { status: r.status, data: traducido };
    }
    if (metodo === "POST") {
      const filas = (Array.isArray(body) ? body : []).map((c) => ({ nombre: c.categoria, manual_ref: c.carpeta_drive_id }));
      return await reemplazarColeccionSinClave("/api/consultas-categorias", filas, backendUrl, headers);
    }
  }

  if (nombreColeccion === "credenciales") {
    // Misma forma en los dos lados — reenvío directo.
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/credenciales`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      return await reemplazarColeccionSinClave("/api/credenciales", Array.isArray(body) ? body : [], backendUrl, headers);
    }
  }

  if (nombreColeccion === "config") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/config`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/config`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: r.status, data: await r.json() };
    }
  }

  if (nombreColeccion === "guardias") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/guardias`, { headers });
      const data = await r.json();
      // ultima_semana_notificada es un dato interno del backend
      // nuevo (para no mandar el mail dos veces la misma semana) —
      // la app no lo necesita, se lo saca antes de devolverlo.
      if (data && typeof data === "object") delete data.ultima_semana_notificada;
      // "secuencia" se guarda como texto (JSON) en la base nueva —
      // hay que convertirlo de vuelta a lista antes de devolverlo,
      // si no la app recibe un texto plano en vez de un array.
      if (data && typeof data.secuencia === "string") {
        try { data.secuencia = JSON.parse(data.secuencia); } catch (err) { data.secuencia = []; }
      }
      // Mismo caso que "secuencia" — "excepciones" también se guarda
      // como texto (JSON) en la base nueva.
      if (data && typeof data.excepciones === "string") {
        try { data.excepciones = JSON.parse(data.excepciones); } catch (err) { data.excepciones = {}; }
      }
      return { status: r.status, data };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/guardias`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: r.status, data: await r.json() };
    }
  }

  if (nombreColeccion === "push-subscripciones") {
    // La app manda UN objeto (no una lista) — se agrega o actualiza
    // por endpoint, nunca se reemplaza la lista entera (así un
    // celular nuevo no borra las suscripciones de los demás).
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/push-subscripciones`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/push-subscripciones`, { method: "POST", headers, body: JSON.stringify([body]) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok } };
    }
  }

  if (nombreColeccion === "servicios_emergencia") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/emergencias`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      // La app manda la lista completa (viejas + nuevas) — como acá
      // no hay una clave natural para "actualizar por id", se vacía
      // y se vuelve a cargar todo entero, para no duplicar. Antes de
      // vaciar, se compara con lo que ya había (por cliente + fecha
      // de carga, ya que el id viejo no es el mismo que genera la
      // base nueva) para avisarle a todo el equipo de las que son
      // realmente nuevas — igual que hacía el sistema viejo.
      const rExistentes = await fetch(`${backendUrl}/api/emergencias`, { headers });
      const existentes = await rExistentes.json();
      const clavesExistentes = new Set((Array.isArray(existentes) ? existentes : []).map((e) => `${e.cliente}|${e.fecha_carga}`));
      const nuevas = (Array.isArray(body) ? body : []).filter((e) => !clavesExistentes.has(`${e.cliente}|${e.fecha_carga}`));

      await fetch(`${backendUrl}/api/emergencias`, { method: "DELETE", headers });
      const r = await fetch(`${backendUrl}/api/emergencias`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();

      if (nuevas.length > 0) {
        try {
          const { enviarATodos } = require("../lib/push-sender");
          for (const entrada of nuevas) {
            await enviarATodos({
              titulo: "🚨 Servicio de emergencia agendado",
              cuerpo: `${entrada.cargado_por || "Alguien"} cargó un servicio para ${entrada.cliente || "un cliente"}${entrada.fecha_deseada ? " el " + entrada.fecha_deseada : ""} — revisalo en Cronograma.`,
              url: "/",
            });
          }
        } catch (errPush) {
          // si falla el envío del aviso, no se rompe el guardado en sí
        }
      }
      return { status: r.status, data: { ok: data.ok, count: Array.isArray(body) ? body.length : undefined } };
    }
  }

  if (nombreColeccion === "notas") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/notas`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/notas`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();

      // Si se acaba de crear una nota (no una marca de "leída"), se
      // avisa por push a cada destinatario — el mensaje completo
      // queda en la app, acá solo va un adelanto.
      const accion = body && body.accion ? body.accion : "crear";
      if (accion === "crear" && r.ok && Array.isArray(body.destinatarios) && body.destinatarios.length > 0) {
        try {
          const { enviarASeleccionados } = require("../lib/push-sender");
          const adelanto = (body.mensaje || "").slice(0, 100);
          await enviarASeleccionados(body.destinatarios, {
            titulo: body.urgente ? "🔴 Nota urgente" : "📝 Nueva nota",
            cuerpo: `${body.de || "Alguien"}: ${adelanto}`,
            url: "/",
            importante: !!body.urgente,
          });
        } catch (errPush) {
          // si falla el envío del aviso, no se rompe el guardado en sí
        }
      }
      return { status: r.status, data };
    }
  }

  // Historial de visitas importado del sistema de oficina (una fila por
  // cliente con la fecha de su última visita) — alimenta el semáforo
  // de visitas de admin.html.
  if (nombreColeccion === "visitas_historicas") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/visitas-historicas`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const destino = body && body.accion === "ignorar" ? "ignorar" : "importar";
      const r = await fetch(`${backendUrl}/api/visitas-historicas/${destino}`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: r.status, data: await r.json() };
    }
  }

  if (nombreColeccion === "vehiculos") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/vehiculos`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/vehiculos`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  if (nombreColeccion === "herramientas") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/herramientas`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/herramientas`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  if (nombreColeccion === "sims") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/sims`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/sims`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  if (nombreColeccion === "sims_instaladas") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/sims/instaladas`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/sims/instaladas`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  return { status: 405, data: { error: "Método no permitido" } };
}

module.exports = require("../lib/auditoria").conAuditoria("datos", async (req, res) => {
  // Formulario público de "pedir servicio" — pensado para un cliente
  // que escribe fuera de horario y no tiene ni necesita ningún login.
  // Por eso va ANTES del control de token de acá abajo, como única
  // excepción de todo este archivo (mismo patrón que la encuesta de
  // satisfacción). Guarda el pedido, y avisa a todo el equipo por
  // push — así no se pierde como pasaría con un WhatsApp fuera de
  // horario.
  if (req.method === "POST" && req.query && req.query.publico === "solicitud_emergencia") {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const comoTexto = (v) => (typeof v === "string" ? v.trim() : "");
    const cliente = comoTexto(body?.cliente);
    const telefono = comoTexto(body?.telefono);
    if (!cliente || !telefono) {
      res.status(400).json({ error: "Faltan datos (nombre o teléfono)" });
      return;
    }
    const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
    if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
      res.status(500).json({ error: "Falta configuración del servidor" });
      return;
    }
    try {
      const r = await fetch(`${BACKEND_NUEVO_URL}/api/emergencias/solicitud-publica`, {
        method: "POST",
        headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cliente, telefono, direccion: comoTexto(body?.direccion), tarea: comoTexto(body?.tarea) }),
      });
      const data = await r.json();
      if (!r.ok) {
        res.status(r.status).json(data);
        return;
      }
      // El aviso push no debe frenar la respuesta al cliente que
      // completó el formulario — si falla, el pedido ya quedó
      // guardado igual, que es lo que realmente importa.
      try {
        const { enviarATodos } = require("../lib/push-sender");
        await enviarATodos({
          titulo: `📞 Nuevo pedido de servicio: ${cliente}`,
          cuerpo: `${telefono}${body?.direccion ? " — " + body.direccion : ""}${body?.tarea ? " — " + body.tarea.slice(0, 80) : ""}`,
          url: "/",
        });
      } catch (errPush) {
        console.error("No se pudo avisar por push del formulario público:", errPush);
      }
      // Mismo criterio — el mail a oficina es un aviso extra, nunca
      // debe hacer que el cliente vea un error si el pedido ya quedó
      // guardado bien.
      try {
        const enviarMailHandler = require("./enviar-mail");
        const resFalso = { status: () => resFalso, json: () => resFalso, setHeader: () => resFalso };
        await enviarMailHandler(
          { method: "POST", headers: { authorization: `Bearer ${process.env.SERVICIOS_API_TOKEN}` }, body: { tipo: "solicitud_publica", datos: { cliente, telefono, direccion: comoTexto(body?.direccion), tarea: comoTexto(body?.tarea) } } },
          resFalso
        );
      } catch (errMail) {
        console.error("No se pudo avisar por mail del formulario público:", errMail);
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "No se pudo registrar el pedido, intentá de nuevo" });
    }
    return;
  }

  // ---------- Quién pide (sesión personal firmada, ver lib/sesion.js) ----------
  const { autorizar, crearSesion } = require("../lib/sesion");
  const autorizacion = autorizar(req);
  let cuerpoAccion = null;
  if (req.method === "POST") {
    cuerpoAccion = req.body;
    if (typeof cuerpoAccion === "string") {
      try { cuerpoAccion = JSON.parse(cuerpoAccion); } catch (err) { cuerpoAccion = null; }
    }
  }
  const accionPedida = cuerpoAccion && !Array.isArray(cuerpoAccion) ? cuerpoAccion.accion : "";
  // Lo único que se puede pedir SIN estar logueado: entrar (contraseña o
  // huella) y lo mínimo que muestra la pantalla de login.
  const ACCIONES_SIN_LOGIN = ["verificar_login", "verificar_admin", "webauthn_tiene_credencial", "webauthn_login_opciones", "webauthn_login_verificar"];
  const accionSinLogin = ACCIONES_SIN_LOGIN.includes(accionPedida);
  const lecturaSinLogin = req.method === "GET" && ["tecnicos", "config"].includes(req.query && req.query.coleccion);
  if (!autorizacion && !accionSinLogin && !lecturaSinLogin) {
    res.status(401).json({ error: "No autorizado", sesion_vencida: true });
    return;
  }
  const jsonOriginal = res.json.bind(res);
  if (!autorizacion && lecturaSinLogin) {
    // Sin login: de la lista de técnicos solo los nombres (para el
    // desplegable), y de la configuración solo lo que usa el login.
    res.json = (data) => {
      if (Array.isArray(data)) return jsonOriginal(data.filter((t) => t && t.nombre).map((t) => ({ nombre: t.nombre })));
      if (data && typeof data === "object" && !data.error) {
        return jsonOriginal({ app_version_actual: data.app_version_actual, dias_atencion: data.dias_atencion, dias_urgente: data.dias_urgente });
      }
      return jsonOriginal(data);
    };
  }
  // Al entrar bien, la respuesta lleva el pase personal ("sesion").
  if (accionPedida === "verificar_admin" || accionPedida === "verificar_login" || accionPedida === "webauthn_login_verificar") {
    res.json = (data) => {
      if (data && data.ok === true && res.statusCode === 200) {
        const sesion = accionPedida === "verificar_admin"
          ? crearSesion({ nombre: data.nombre || "Clave general", rol: "admin" })
          : crearSesion({ nombre: String(cuerpoAccion.nombre || ""), rol: "tecnico" });
        return jsonOriginal({ ...data, sesion });
      }
      return jsonOriginal(data);
    };
  }
  // El registro de cambios solo lo ve la oficina, y nadie lo escribe a mano.
  // ---------- Presupuesto express: lista de precios y numeración ----------
  if (req.query && req.query.coleccion === "croquis") {
    if (!autorizacion) { res.status(401).json({ error: "No autorizado", sesion_vencida: true }); return; }
    await manejarCroquis(req, res, autorizacion, cuerpoAccion);
    return;
  }
  if (req.query && (req.query.coleccion === "lista_precios" || req.query.coleccion === "presupuestos_express")) {
    if (!autorizacion) { res.status(401).json({ error: "No autorizado", sesion_vencida: true }); return; }
    await manejarPresupuestoExpress(req, res, autorizacion, cuerpoAccion);
    return;
  }
  if (req.query && req.query.coleccion === "auditoria") {
    if (req.method !== "GET" || !autorizacion || autorizacion.rol !== "admin") {
      res.status(403).json({ error: "El registro de cambios solo se puede consultar desde el panel de administración" });
      return;
    }
  }
  // La lista de técnicos (contraseñas y permisos) solo la cambia la oficina.
  if (req.query && req.query.coleccion === "tecnicos" && ["POST", "PUT", "DELETE"].includes(req.method) && !accionPedida && autorizacion.rol !== "admin") {
    res.status(403).json({ error: "Solo la oficina puede modificar los técnicos" });
    return;
  }

  // Estado y disparo manual del aviso de guardia a Security24 — viven
  // en el backend nuevo (Cloudflare + D1), que es quien maneja esto
  // ahora (ver sat-backend-d1/src/cron.js). Se proxea acá para no
  // exponer nunca la URL/token del backend nuevo al navegador, mismo
  // criterio que el resto de este archivo.
  if (req.query && req.query.accion === "guardia_diagnostico" && req.method === "GET") {
    const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
    if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
      res.status(500).json({ error: "Falta configuración del servidor" });
      return;
    }
    try {
      const r = await fetch(`${BACKEND_NUEVO_URL}/api/guardias/diagnostico`, {
        headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}` },
      });
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.status(r.status).json(await r.json());
    } catch (err) {
      res.status(500).json({ error: "No se pudo consultar el estado de guardia" });
    }
    return;
  }
  if (req.query && req.query.accion === "guardia_avisar_ahora" && req.method === "POST") {
    const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
    if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
      res.status(500).json({ error: "Falta configuración del servidor" });
      return;
    }
    try {
      const r = await fetch(`${BACKEND_NUEVO_URL}/api/guardias/avisar-ahora`, {
        method: "POST",
        headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}` },
      });
      res.status(r.status).json(await r.json());
    } catch (err) {
      res.status(500).json({ error: "No se pudo disparar el aviso de guardia" });
    }
    return;
  }

  // Verificación de contraseñas — se hace acá adentro, del lado del
  // servidor, y nunca se le devuelve ninguna contraseña al que
  // pregunta (ni siquiera la propia): solo si coincide o no. Antes,
  // el celular bajaba la lista completa de técnicos CON sus
  // contraseñas y comparaba él mismo — cualquiera con el token de la
  // app (visible en el código) podía leer la lista completa.
  if (req.method === "POST") {
    let bodyAccion = req.body;
    if (typeof bodyAccion === "string") {
      try { bodyAccion = JSON.parse(bodyAccion); } catch (err) { bodyAccion = null; }
    }
    if (bodyAccion && bodyAccion.accion === "verificar_admin") {
      const ip = (req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "desconocida").toString().split(",")[0].trim();
      const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;

      // Si ya está bloqueado por intentos previos, ni se molesta en
      // verificar la contraseña — evita que alguien siga probando
      // mientras dura el bloqueo.
      if (BACKEND_NUEVO_URL && BACKEND_NUEVO_TOKEN) {
        try {
          const rEstado = await fetch(`${BACKEND_NUEVO_URL}/api/admin-login/estado?ip=${encodeURIComponent(ip)}`, {
            headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}` },
          });
          const estado = await rEstado.json();
          if (estado.bloqueado) {
            res.status(200).json({ ok: false, bloqueado: true, minutos_restantes: estado.minutos_restantes });
            return;
          }
        } catch (err) {
          // si falla la consulta de bloqueo, se sigue igual con la
          // verificación normal — mejor no dejar a nadie afuera por
          // un problema de red puntual.
        }
      }

      // Con usuario: la clave de esa persona y que tenga el permiso
      // "Panel de Administración". Sin usuario: la clave general (respaldo).
      const nombreAdmin = typeof bodyAccion.nombre === "string" ? bodyAccion.nombre.trim() : "";
      let ok = false, sinPermiso = false;
      if (nombreAdmin) {
        const claveOk = await verificarClaveTecnico(nombreAdmin, bodyAccion.password, req);
        if (claveOk) {
          sinPermiso = !(await tienePermisoAdmin(nombreAdmin));
          ok = !sinPermiso;
        }
      } else {
        ok = await verificarPasswordAdmin(bodyAccion.password);
      }

      if (BACKEND_NUEVO_URL && BACKEND_NUEVO_TOKEN) {
        try {
          const rRegistro = await fetch(`${BACKEND_NUEVO_URL}/api/admin-login/registrar`, {
            method: "POST",
            headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ip, exito: ok }),
          });
          const registro = await rRegistro.json();
          if (!ok && registro.bloqueado) {
            res.status(200).json({ ok: false, bloqueado: true, minutos_restantes: registro.minutos_restantes });
            return;
          }
        } catch (err) {
          // igual — si falla el registro del intento, no se le niega
          // el acceso a nadie por eso.
        }
      }

      if (ok) {
        // La entrada al panel también queda en el registro de cambios.
        try {
          const { registrar, entradaBase } = require("../lib/auditoria");
          await Promise.race([
            registrar({ ...entradaBase(req, nombreAdmin || "Clave general"), seccion: "Acceso", accion: "Entró al panel", detalle: nombreAdmin ? "" : "Con la clave general" }),
            new Promise((r) => setTimeout(r, 3000)),
          ]);
        } catch (e) { /* no se le niega la entrada por esto */ }
      }
      res.status(200).json(sinPermiso ? { ok: false, sin_permiso: true } : { ok, nombre: ok ? (nombreAdmin || "Clave general") : undefined });
      return;
    }
    if (bodyAccion && bodyAccion.accion === "verificar_login") {
      const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN, GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
      const nombre = bodyAccion.nombre;
      const password = bodyAccion.password;
      // Mismo bloqueo por intentos fallidos que el login de oficina: ahora
      // la contraseña es la única puerta, así que no se puede probar sin límite.
      const ipLogin = (req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "desconocida").toString().split(",")[0].trim();
      const registrarIntento = async (exito) => {
        if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) return null;
        try {
          const r = await fetch(`${BACKEND_NUEVO_URL}/api/admin-login/registrar`, {
            method: "POST",
            headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ip: "tec:" + ipLogin, exito }),
          });
          return await r.json();
        } catch (e) { return null; }
      };
      const responderLogin = async (ok) => {
        const registro = await registrarIntento(ok);
        if (!ok && registro && registro.bloqueado) {
          res.status(200).json({ ok: false, bloqueado: true, minutos_restantes: registro.minutos_restantes });
          return;
        }
        res.status(200).json({ ok });
      };
      if (BACKEND_NUEVO_URL && BACKEND_NUEVO_TOKEN) {
        try {
          const rEstado = await fetch(`${BACKEND_NUEVO_URL}/api/admin-login/estado?ip=${encodeURIComponent("tec:" + ipLogin)}`, {
            headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}` },
          });
          const estado = await rEstado.json();
          if (estado.bloqueado) {
            res.status(200).json({ ok: false, bloqueado: true, minutos_restantes: estado.minutos_restantes });
            return;
          }
        } catch (err) { /* sin el chequeo de bloqueo se sigue igual */ }
      }

      if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
        res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" });
        return;
      }
      try {
        await responderLogin(await verificarClaveTecnico(nombre, password));
      } catch (err) {
        res.status(500).json({ error: "Error interno al verificar" });
      }
      return;
    }

    // ---------- Huella digital / Face ID (WebAuthn) — simples reenvíos al backend nuevo ----------
    const ACCIONES_WEBAUTHN = {
      webauthn_tiene_credencial: "GET:/api/tecnicos/webauthn/tiene-credencial?nombre=",
      webauthn_registro_opciones: "POST:/api/tecnicos/webauthn/registro/opciones",
      webauthn_registro_verificar: "POST:/api/tecnicos/webauthn/registro/verificar",
      webauthn_login_opciones: "POST:/api/tecnicos/webauthn/login/opciones",
      webauthn_login_verificar: "POST:/api/tecnicos/webauthn/login/verificar",
    };
    if (bodyAccion && ACCIONES_WEBAUTHN[bodyAccion.accion]) {
      const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
      if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
        res.status(500).json({ error: "Faltan variables de entorno del backend nuevo por configurar en Vercel" });
        return;
      }
      const headersBackendNuevo = { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" };
      const [metodo, ruta] = ACCIONES_WEBAUTHN[bodyAccion.accion].split(":");
      try {
        const url = metodo === "GET"
          ? `${BACKEND_NUEVO_URL}${ruta}${encodeURIComponent(bodyAccion.nombre || "")}`
          : `${BACKEND_NUEVO_URL}${ruta}`;
        const r = await fetch(url, {
          method: metodo,
          headers: headersBackendNuevo,
          body: metodo === "GET" ? undefined : JSON.stringify(bodyAccion),
        });
        const data = await r.json();
        res.status(r.status).json(data);
      } catch (err) {
        res.status(500).json({ error: "Error interno al hablar con el backend nuevo" });
      }
      return;
    }
  }

  const nombreColeccion = req.query.coleccion;

  // --- CORTE EN CURSO: estas colecciones ya viven en el backend nuevo (Cloudflare) ---
  // El resto sigue en GitHub por ahora; se van cortando de a una,
  // probando cada una antes de seguir con la próxima. La app en el
  // celular no cambia en nada — sigue pidiendo lo mismo de siempre.
  const COLECCIONES_YA_CORTADAS = ["clientes", "materiales", "credenciales", "consultas-categorias", "config", "guardias", "push-subscripciones", "servicios_emergencia", "vehiculos", "herramientas", "sims", "sims_instaladas", "notas", "visitas_historicas"];
  if (COLECCIONES_YA_CORTADAS.includes(nombreColeccion)) {
    const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
    if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
      res.status(500).json({ error: "Faltan variables de entorno del backend nuevo por configurar en Vercel" });
      return;
    }
    const headersBackendNuevo = { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" };

    try {
      let body = null;
      if (req.method === "POST") {
        body = req.body;
        if (typeof body === "string") body = JSON.parse(body);
      }
      const resultado = await manejarColeccionCortada(nombreColeccion, req.method, body, BACKEND_NUEVO_URL, headersBackendNuevo);
      if (req.method === "GET") res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.status(resultado.status).json(resultado.data);
    } catch (err) {
      res.status(500).json({ error: "Error interno al hablar con el backend nuevo", detalle: String(err.message || err) });
    }
    return;
  }
  // --- fin del corte ---

  const coleccion = COLECCIONES[nombreColeccion];
  if (!coleccion) {
    res.status(400).json({ error: "Colección desconocida", validas: Object.keys(COLECCIONES) });
    return;
  }

  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
    res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" });
    return;
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${coleccion.path}`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_DATA_TOKEN}`,
    Accept: "application/vnd.github+json",
  };

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    try {
      const r = await fetch(apiUrl, { headers: ghHeaders });
      if (r.status === 404) {
        res.status(200).json(coleccion.default);
        return;
      }
      if (!r.ok) {
        res.status(502).json({ error: `No se pudo leer ${nombreColeccion}` });
        return;
      }
      const data = await r.json();
      const content = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
      let resultado = coleccion.mergeConDefault ? { ...coleccion.default, ...content } : content;
      if (nombreColeccion === "tecnicos" && Array.isArray(resultado)) {
        resultado = resultado.map((t) => {
          const { password, ...resto } = t;
          return resto;
        });
      }
      res.status(200).json(resultado);
    } catch (err) {
      res.status(500).json({ error: `Error interno al leer ${nombreColeccion}` });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      if (body === undefined || body === null) {
        res.status(400).json({ error: "Falta el contenido a guardar" });
        return;
      }

      let sha;
      const existing = await fetch(apiUrl, { headers: ghHeaders });
      let contenidoExistente = coleccion.default;
      if (existing.ok) {
        const existingData = await existing.json();
        sha = existingData.sha;
        contenidoExistente = JSON.parse(Buffer.from(existingData.content, "base64").toString("utf-8"));
      }

      // Las suscripciones push se agregan (sin duplicar por endpoint),
      // nunca se reemplaza la lista entera — así un celular nuevo no
      // borra las suscripciones de los demás. Si el mismo celular ya
      // estaba suscripto pero ahora lo usa otro técnico (cambió de
      // mano), se actualiza a quién pertenece en vez de dejarlo
      // desactualizado.
      let contenidoAGuardar = body;
      let entradasEmergenciaNuevas = [];
      if (nombreColeccion === "servicios_emergencia" && Array.isArray(body)) {
        const existentes = Array.isArray(contenidoExistente) ? contenidoExistente : [];
        const idsExistentes = new Set(existentes.map((e) => e.id));
        entradasEmergenciaNuevas = body.filter((e) => !idsExistentes.has(e.id));
      }
      if (nombreColeccion === "tecnicos" && Array.isArray(body)) {
        const existentes = Array.isArray(contenidoExistente) ? contenidoExistente : [];
        contenidoAGuardar = body.map((t) => {
          if (t.password) return t; // se escribió una clave nueva -> se usa esa
          const previo = existentes.find((x) => x.nombre === t.nombre);
          return { ...t, password: previo ? previo.password : "" };
        });
      }
      if (nombreColeccion === "push-subscripciones") {
        const lista = Array.isArray(contenidoExistente) ? contenidoExistente : [];
        const idx = lista.findIndex((s) => s.endpoint === body.endpoint);
        if (idx === -1) {
          contenidoAGuardar = [...lista, body];
        } else {
          const copia = [...lista];
          copia[idx] = { ...copia[idx], tecnico: body.tecnico };
          contenidoAGuardar = copia;
        }
      }

      if (nombreColeccion === "servicios_vistos") {
        // { accion: "registrar", numeros: [...] }: anota la primera vez que
        // se vio cada servicio; no pisa las fechas ya registradas. Se
        // olvidan los que hace más de 60 días que no aparecen en el listado.
        const mapa = contenidoExistente && typeof contenidoExistente === "object" && !Array.isArray(contenidoExistente) ? { ...contenidoExistente } : {};
        if (!body || body.accion !== "registrar" || !Array.isArray(body.numeros)) {
          res.status(400).json({ error: "Formato inválido" });
          return;
        }
        const ahora = Date.now();
        const iso = new Date(ahora).toISOString();
        let cambio = false;
        // Solo la primera vez que se usa el registro (vacío) se siembra con la
        // fecha de ingreso de cada servicio (body.desde[numero]); después, todo
        // servicio nuevo cuenta desde que aparece en la app.
        const sembrar = Object.keys(mapa).length === 0 && body.desde && typeof body.desde === "object";
        body.numeros.slice(0, 2000).forEach((n) => {
          const k = String(n || "").trim().slice(0, 40);
          if (!k) return;
          if (!mapa[k]) {
            let primera = iso;
            if (sembrar) {
              const t = Date.parse(body.desde[k]);
              if (t && t <= ahora && ahora - t < 3650 * 86400000) primera = new Date(t).toISOString();
            }
            mapa[k] = { primera, ultima: iso };
            cambio = true;
          } else if (!mapa[k].ultima || ahora - Date.parse(mapa[k].ultima) > 86400000) {
            mapa[k].ultima = iso;
            cambio = true;
          }
        });
        Object.keys(mapa).forEach((k) => {
          const u = Date.parse(mapa[k].ultima || mapa[k].primera);
          if (u && ahora - u > 60 * 86400000) {
            delete mapa[k];
            cambio = true;
          }
        });
        if (!cambio) {
          res.status(200).json({ ok: true, sinCambios: true });
          return;
        }
        contenidoAGuardar = mapa;
      }

      if (nombreColeccion === "datos_equipo") {
        const lista = Array.isArray(contenidoExistente) ? contenidoExistente.slice() : [];
        const txt = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
        const ahoraIso = new Date().toISOString();
        const accion = body && body.accion;
        const autor = txt(body && body.autor, 60) || "Sin nombre";
        if (accion === "crear") {
          const titulo = txt(body.titulo, 150);
          const contenido = txt(body.contenido, 6000);
          if (!titulo || !contenido) { res.status(400).json({ error: "Falta el título o el contenido" }); return; }
          if (lista.length >= 2000) { res.status(400).json({ error: "Se llegó al máximo de datos guardados" }); return; }
          lista.unshift({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            titulo, contenido, categoria: txt(body.categoria, 60) || "General",
            origen: body.origen === "ia" ? "ia" : "tecnico",
            autor, fecha: ahoraIso, ediciones: [],
          });
        } else if (accion === "editar") {
          const i = lista.findIndex((d) => d.id === body.id);
          if (i === -1) { res.status(404).json({ error: "Ese dato ya no existe (puede que alguien lo haya borrado)" }); return; }
          const titulo = txt(body.titulo, 150);
          const contenido = txt(body.contenido, 6000);
          if (!titulo || !contenido) { res.status(400).json({ error: "Falta el título o el contenido" }); return; }
          const previo = lista[i];
          lista[i] = {
            ...previo, titulo, contenido, categoria: txt(body.categoria, 60) || previo.categoria || "General",
            ediciones: [...(previo.ediciones || []), { autor, fecha: ahoraIso }].slice(-30),
          };
        } else if (accion === "borrar") {
          const i = lista.findIndex((d) => d.id === body.id);
          if (i === -1) { res.status(404).json({ error: "Ese dato ya no existe" }); return; }
          // Lo puede borrar quien lo cargó, o la oficina desde el panel admin.
          if (!body.admin && lista[i].autor !== autor) { res.status(403).json({ error: "Solo lo puede borrar quien lo cargó, o la oficina" }); return; }
          lista.splice(i, 1);
        } else {
          res.status(400).json({ error: "Acción inválida" });
          return;
        }
        contenidoAGuardar = lista;
      }

      if (nombreColeccion === "errores_app") {
        // El registro de errores se agrega (máx. 200, los más nuevos primero)
        // y se puede vaciar con { accion: "limpiar" }.
        const lista = Array.isArray(contenidoExistente) ? contenidoExistente : [];
        if (body && body.accion === "limpiar") {
          contenidoAGuardar = [];
        } else if (body && typeof body === "object" && !Array.isArray(body)) {
          const nuevo = {
            fecha: new Date().toISOString(),
            mensaje: String(body.mensaje || "").slice(0, 500),
            origen: String(body.origen || "").slice(0, 200),
            pila: String(body.pila || "").slice(0, 1500),
            version: String(body.version || "").slice(0, 20),
            tecnico: String(body.tecnico || "").slice(0, 60),
            pantalla: String(body.pantalla || "").slice(0, 60),
            dispositivo: String(body.dispositivo || "").slice(0, 200),
            veces: 1,
          };
          const dup = lista.findIndex((e) => e.mensaje === nuevo.mensaje && e.origen === nuevo.origen && e.tecnico === nuevo.tecnico && e.version === nuevo.version);
          if (dup !== -1) {
            const previo = lista[dup];
            const resto = lista.filter((_, i) => i !== dup);
            contenidoAGuardar = [{ ...previo, fecha: nuevo.fecha, veces: (previo.veces || 1) + 1 }, ...resto].slice(0, 200);
          } else {
            contenidoAGuardar = [nuevo, ...lista].slice(0, 200);
          }
        } else {
          res.status(400).json({ error: "Formato inválido" });
          return;
        }
      }

      const contentB64 = Buffer.from(JSON.stringify(contenidoAGuardar, null, 2)).toString("base64");
      const putRes = await fetch(apiUrl, {
        method: "PUT",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Actualiza ${nombreColeccion} (${new Date().toISOString()})`,
          content: contentB64,
          sha,
        }),
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        res.status(502).json({ error: `No se pudo guardar ${nombreColeccion}`, detail: errText });
        return;
      }

      // Si se acaba de cargar un servicio de emergencia nuevo, se
      // avisa a todo el equipo — puede ser relevante para cualquiera
      // que esté revisando la agenda, no solo para quien lo cargó.
      if (entradasEmergenciaNuevas.length > 0) {
        try {
          const { enviarATodos } = require("../lib/push-sender");
          for (const entrada of entradasEmergenciaNuevas) {
            await enviarATodos({
              titulo: "🚨 Servicio de emergencia agendado",
              cuerpo: `${entrada.cargado_por || "Alguien"} cargó un servicio para ${entrada.cliente || "un cliente"}${entrada.fecha_deseada ? " el " + entrada.fecha_deseada : ""} — revisalo en Cronograma.`,
              url: "/",
            });
          }
        } catch (errPush) {
          // si falla el envío del aviso, no se rompe el guardado en sí
        }
      }

      if (nombreColeccion === "datos_equipo") {
        res.status(200).json({ ok: true, lista: contenidoAGuardar });
        return;
      }
      res.status(200).json({ ok: true, count: Array.isArray(body) ? body.length : undefined });
    } catch (err) {
      res.status(500).json({ error: `Error interno al guardar ${nombreColeccion}` });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
});
