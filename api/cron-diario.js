// Función serverless de Vercel — se ejecuta una vez por día (Vercel
// Cron, ver vercel.json) y manda dos tipos de aviso push a todo el
// equipo:
//   1) Cambio de guardia (los lunes, a quien le toca esa semana).
//   2) Vehículos que se acercan o pasaron algún umbral de
//      mantenimiento (solo cuando el aviso es NUEVO, para no repetir
//      el mismo aviso todos los días).
//
// Seguridad: Vercel agrega automáticamente el header
// "Authorization: Bearer <CRON_SECRET>" a las llamadas que dispara su
// propio cron, si la variable de entorno CRON_SECRET está configurada
// — así nadie más puede disparar este endpoint a mano.
//
// Variables de entorno:
//   CRON_SECRET, GITHUB_DATA_TOKEN, GITHUB_DATA_REPO,
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
//   BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN (para leer partes/encuestas/
//   comodatos/emergencias/stock/vehículos, que ya viven en D1),
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (para el resumen semanal)

const { enviarATodos, enviarASeleccionados } = require("../lib/push-sender");

const TECNICOS_PATH = "tecnicos.json";
const ESTADO_PATH = "notificaciones-estado.json";

// NOTA: vehiculos-config.json, vehiculos-historial.json,
// herramientas-config.json, historial.json, guardias-config.json y
// config.json YA NO SE LEEN DE ACÁ — esas colecciones viven en el
// backend nuevo (D1) desde la migración; leerlas de GitHub devolvía
// datos congelados del día de la migración (confirmado con Seba:
// la secuencia de guardias se editó varias veces después de la
// migración y el push seguía mandando datos viejos). Se corrigió
// para leer todo del backend real (fetchBackendArray/
// fetchBackendObject, más abajo). Lo único que sigue en GitHub es
// TECNICOS_PATH (técnicos/contraseñas/permisos), que todavía no se
// cortó al backend nuevo.

async function leerJSON(ghHeaders, path, valorDefault) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${path}`;
  const r = await fetch(url, { headers: ghHeaders });
  if (r.status === 404) return { data: valorDefault, sha: null };
  if (!r.ok) throw new Error(`No se pudo leer ${path}`);
  const data = await r.json();
  const content = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  return { data: content, sha: data.sha };
}

async function guardarJSON(ghHeaders, path, contenido, sha) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${path}`;
  const contentB64 = Buffer.from(JSON.stringify(contenido, null, 2)).toString("base64");
  await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Actualiza ${path} (${new Date().toISOString()})`,
      content: contentB64,
      sha: sha || undefined,
    }),
  });
}

// Trae una lista desde el backend nuevo (Cloudflare + D1) — partes,
// encuestas, comodatos, etc. ya viven ahí, no en GitHub. Devuelve []
// si falla, para que un problema acá nunca tumbe el resto del cron.
async function fetchBackendArray(ruta, headersBackendNuevo) {
  try {
    const r = await fetch(`${process.env.BACKEND_NUEVO_URL}${ruta}`, { headers: headersBackendNuevo });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

// Igual que fetchBackendArray pero para un solo objeto (guardias,
// config) — devuelve null si falla.
async function fetchBackendObject(ruta, headersBackendNuevo) {
  try {
    const r = await fetch(`${process.env.BACKEND_NUEVO_URL}${ruta}`, { headers: headersBackendNuevo });
    if (!r.ok) return null;
    const data = await r.json();
    return data && typeof data === "object" ? data : null;
  } catch (err) {
    return null;
  }
}

// Fecha/hora actual en Argentina (UTC-3 todo el año, sin horario de verano).
function ahoraArgentina() {
  const ahoraUTC = new Date();
  return new Date(ahoraUTC.getTime() - 3 * 60 * 60 * 1000);
}

function numeroSemanaIso(fecha) {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const diaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${Math.ceil(((d - inicioAno) / 86400000 + 1) / 7)}`;
}

async function chequearGuardia(headersBackendNuevo, estado, ahora) {
  if (ahora.getDay() !== 1) return null; // solo lunes

  const semanaActual = numeroSemanaIso(ahora);
  if (estado.ultima_semana_guardia_notificada === semanaActual) return null;

  // OJO: esto ANTES leía "guardias-config.json" de GitHub — pero
  // admin.html guarda la configuración de guardias DIRECTO en el
  // backend nuevo (D1) desde la migración, sin tocar GitHub para
  // nada. Confirmado con Seba que la secuencia se editó varias veces
  // después de la migración, así que ese archivo venía mandando el
  // push con el técnico incorrecto. El mail a Security24 (que sí lee
  // D1, ver nota más abajo) no se vio afectado por este bug.
  const guardias = await fetchBackendObject("/api/guardias", headersBackendNuevo) || { fecha_inicio_referencia: "", secuencia: [] };
  let secuencia = guardias.secuencia || [];
  if (typeof secuencia === "string") {
    try { secuencia = JSON.parse(secuencia); } catch (err) { secuencia = []; }
  }
  if (!guardias.fecha_inicio_referencia || secuencia.length === 0) return null;

  const [y, m, d] = guardias.fecha_inicio_referencia.split("-").map(Number);
  const inicioRef = new Date(y, m - 1, d, 9, 0, 0, 0);
  const diffMs = ahora.getTime() - inicioRef.getTime();
  if (diffMs < 0) return null;
  const semanas = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  const indice = ((semanas % secuencia.length) + secuencia.length) % secuencia.length;
  const tecnico = secuencia[indice];

  const resultadoPush = await enviarATodos({
    titulo: "🚨 Cambio de guardia",
    cuerpo: `Esta semana la guardia técnica la toma ${tecnico.nombre}.`,
    url: "/",
  });
  if (!resultadoPush || resultadoPush.enviados === 0) {
    console.error("[cron-diario] El push de cambio de guardia se mandó a 0 suscripciones:", JSON.stringify(resultadoPush));
  }
  // El mail a Security24 ya NO se manda desde acá — lo maneja el cron
  // de Cloudflare (sat-backend-d1/src/cron.js), que lee la config de
  // guardias desde la base D1 (la fuente de verdad actual, la que
  // edita admin.html). Antes los DOS sistemas lo mandaban en
  // paralelo, el mismo lunes a la misma hora — quedaba duplicado (o,
  // peor, ambos podían fallar en silencio sin que el otro lo cubriera).

  estado.ultima_semana_guardia_notificada = semanaActual;
  return tecnico.nombre;
}

function calcularAlertasVehiculo(vehiculoConfig, hoy) {
  const alertas = [];
  (vehiculoConfig.umbrales || []).forEach((u) => {
    if (!u.nombre || !u.valor) return;
    let nivel = null;
    let mensaje = "";
    if (u.tipo === "fecha") {
      const [y, m, d] = u.valor.split("-").map(Number);
      const fechaLimite = new Date(y, m - 1, d);
      const diasRestantes = Math.round((fechaLimite - hoy) / 86400000);
      const avisoAntes = Number(u.aviso_antes) || 0;
      if (diasRestantes <= 0) {
        nivel = "urgente";
        mensaje = `${u.nombre}: venció`;
      } else if (diasRestantes <= avisoAntes) {
        nivel = "atencion";
        mensaje = `${u.nombre}: faltan ${diasRestantes} día(s)`;
      }
    } else {
      const kmActual = Number(vehiculoConfig.km_actual) || 0;
      const valor = Number(u.valor) || 0;
      const restante = valor - kmActual;
      const avisoAntes = Number(u.aviso_antes) || 0;
      if (restante <= 0) {
        nivel = "urgente";
        mensaje = `${u.nombre}: ya se pasó por ${Math.abs(restante)} km`;
      } else if (restante <= avisoAntes) {
        nivel = "atencion";
        mensaje = `${u.nombre}: faltan ${restante} km`;
      }
    }
    if (nivel) alertas.push({ nombre: u.nombre, nivel, mensaje });
  });
  return alertas;
}

// Consulta si una fecha es feriado nacional en Argentina, usando una
// API pública gratuita (Nager.Date) — así no hay que mantener a mano
// una lista de feriados móviles/puentes que cambian cada año. Si la
// consulta falla por lo que sea, se prefiere NO bloquear el aviso
// (mejor un recordatorio de más un feriado raro, que quedarse sin
// avisar meses por un problema de red).
async function esFeriadoArgentina(fecha) {
  const anio = fecha.getFullYear();
  const yyyyMMdd = `${anio}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
  try {
    const r = await fetch(`https://date.nager.at/api/v3/publicholidays/${anio}/AR`);
    if (!r.ok) return false;
    const feriados = await r.json();
    return Array.isArray(feriados) && feriados.some((f) => f.date === yyyyMMdd);
  } catch (err) {
    return false;
  }
}

// Recordatorio de tomar vehículo/herramientas — lunes a viernes, a la
// mañana, solo a los técnicos marcados "En la calle" en admin.html,
// salvo feriado. Solo se manda una vez por día (se guarda la fecha en
// el estado para no repetirlo si el cron se invoca más de una vez).
// Felicitación semanal — los viernes entre las 17 y las 18hs (según
// cuándo dispare el cron en esa franja), se le manda a TODO el equipo
// un aviso público felicitando al técnico que más servicios resolvió
// esa semana (lunes a hoy). Se puede apagar desde admin.html.
async function chequearFelicitacionSemanal(ghHeaders, headersBackendNuevo, estado, ahora) {
  if (ahora.getDay() !== 5) return null; // solo viernes
  // Los viernes disparan DOS invocaciones del mismo cron (la de la
  // mañana de todos los días, y la de la tarde solo de los viernes) —
  // sin este chequeo de hora, la felicitación salía con la de la
  // mañana en vez de esperar a la tarde.
  if (ahora.getHours() < 15) return null;

  const semanaActual = numeroSemanaIso(ahora);
  if (estado.ultima_semana_felicitacion === semanaActual) return null; // ya se mandó esta semana

  // OJO: esto ANTES leía "config.json" de GitHub — admin.html guarda
  // esta configuración directo en el backend nuevo (D1) desde la
  // migración, así que el toggle de acá podía no reflejar lo que se
  // ve/edita en admin.html.
  const config = await fetchBackendObject("/api/config", headersBackendNuevo);
  if (config && config.felicitacion_semanal_activa === false) return null;

  // Lunes de esta semana, a las 00:00
  const lunes = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const diaSemana = lunes.getDay() || 7; // 1=lunes...7=domingo
  lunes.setDate(lunes.getDate() - (diaSemana - 1));
  const lunesStr = `${lunes.getFullYear()}-${String(lunes.getMonth() + 1).padStart(2, "0")}-${String(lunes.getDate()).padStart(2, "0")}`;
  const hoyStr = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;

  // OJO: esto ANTES leía "historial.json" de GitHub — pero desde que
  // los partes se guardan en el backend nuevo (D1), nadie escribe más
  // ese archivo, así que quedó congelado en lo que tenía el día de la
  // migración (v3.53). Se corrigió para leer directo del backend.
  const historial = await fetchBackendArray("/api/partes", headersBackendNuevo);
  const conteos = {};
  (historial || []).forEach((h) => {
    if (!h.fecha || !h.tecnico) return;
    if (h.fecha < lunesStr || h.fecha > hoyStr) return;
    conteos[h.tecnico] = (conteos[h.tecnico] || 0) + 1;
  });

  const nombres = Object.keys(conteos);
  if (nombres.length === 0) {
    estado.ultima_semana_felicitacion = semanaActual;
    return null; // nadie resolvió nada esta semana, no hay a quién felicitar
  }

  const maxCantidad = Math.max(...nombres.map((n) => conteos[n]));
  const ganadores = nombres.filter((n) => conteos[n] === maxCantidad);

  const cuerpo = ganadores.length === 1
    ? `${ganadores[0]} resolvió más servicios esta semana (${maxCantidad}). ¡Felicitaciones! 🎉`
    : `¡Empate esta semana entre ${ganadores.join(" y ")}, con ${maxCantidad} servicios cada uno! 🎉`;

  await enviarATodos({ titulo: "🏆 Mejor desempeño de la semana", cuerpo, url: "/" });

  estado.ultima_semana_felicitacion = semanaActual;
  return ganadores;
}

// ---------- Resumen semanal por mail (no push) ----------
// Se manda los lunes con un pantallazo de la semana anterior (lunes a
// domingo): partes completados, facturación, satisfacción, comodatos,
// emergencias, gasto en vehículos, y los pendientes acumulados de
// "pasar a sistema". Reutiliza las credenciales SMTP que ya están
// configuradas en Vercel (las mismas de los mails de partes/comodatos).
let transporterResumenCache = null;
function getTransporterResumen() {
  if (transporterResumenCache) return transporterResumenCache;
  const nodemailer = require("nodemailer");
  const puerto = Number(process.env.SMTP_PORT || 465);
  transporterResumenCache = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    secure: puerto === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
  return transporterResumenCache;
}

// Lunes a domingo de la semana ANTERIOR a "ahora" (que se espera que
// sea un lunes — así el resumen siempre cubre una semana ya cerrada).
function rangoSemanaAnterior(ahora) {
  const diaSemana = ahora.getDay() || 7; // 1=lunes...7=domingo
  const lunesEsta = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - (diaSemana - 1));
  const lunesAnterior = new Date(lunesEsta);
  lunesAnterior.setDate(lunesAnterior.getDate() - 7);
  const domingoAnterior = new Date(lunesEsta);
  domingoAnterior.setDate(domingoAnterior.getDate() - 1);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { desde: fmt(lunesAnterior), hasta: fmt(domingoAnterior) };
}

async function chequearResumenSemanal(headersBackendNuevo, estado, ahora) {
  if (ahora.getDay() !== 1) return null; // solo lunes

  const semanaActual = numeroSemanaIso(ahora);
  if (estado.ultima_semana_resumen === semanaActual) return null;

  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!process.env.BACKEND_NUEVO_URL || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null; // faltan variables — no se manda, no rompe el resto del cron
  }

  const { desde, hasta } = rangoSemanaAnterior(ahora);
  const enRango = (fecha) => !!fecha && fecha >= desde && fecha <= hasta;
  const enRangoDesdeDatetime = (fechaHora) => !!fechaHora && fechaHora.slice(0, 10) >= desde && fechaHora.slice(0, 10) <= hasta;

  const [partes, encuestas, comodatos, emergencias, stock, vehiculosHist] = await Promise.all([
    fetchBackendArray("/api/partes", headersBackendNuevo),
    fetchBackendArray("/api/encuestas", headersBackendNuevo),
    fetchBackendArray("/api/comodatos", headersBackendNuevo),
    fetchBackendArray("/api/emergencias", headersBackendNuevo),
    fetchBackendArray("/api/stock", headersBackendNuevo),
    fetchBackendArray("/api/vehiculos/historial", headersBackendNuevo),
  ]);

  const partesSemana = partes.filter((p) => enRango(p.fecha));
  const totalFacturado = partesSemana.reduce((suma, p) => suma + (parseFloat(p.costo_final) || 0), 0);
  const partesSinPasar = partes.filter((p) => !p.pasado_sistema_offline).length;
  const stockSinPasar = stock.filter((m) => !m.pasado_sistema_offline).length;

  const encuestasSemana = encuestas.filter((e) => enRangoDesdeDatetime(e.creado_en));
  const promedioSemana = encuestasSemana.length > 0
    ? encuestasSemana.reduce((suma, e) => suma + e.puntaje, 0) / encuestasSemana.length
    : null;

  const comodatosSemana = comodatos.filter((c) => enRango(c.fecha));
  const emergenciasSemana = emergencias.filter((e) => enRangoDesdeDatetime(e.fecha_carga));

  const conteoPartesPorTecnico = {};
  partesSemana.forEach((p) => {
    if (!p.tecnico) return;
    conteoPartesPorTecnico[p.tecnico] = (conteoPartesPorTecnico[p.tecnico] || 0) + 1;
  });
  const rankingPartes = Object.entries(conteoPartesPorTecnico)
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const satPorTecnico = {};
  encuestasSemana.forEach((e) => {
    const nombre = e.tecnico || "Sin técnico";
    if (!satPorTecnico[nombre]) satPorTecnico[nombre] = { suma: 0, cantidad: 0 };
    satPorTecnico[nombre].suma += e.puntaje;
    satPorTecnico[nombre].cantidad += 1;
  });
  const rankingSatisfaccion = Object.entries(satPorTecnico)
    .map(([nombre, { suma, cantidad }]) => ({ nombre, promedio: suma / cantidad, cantidad }))
    .sort((a, b) => b.promedio - a.promedio);

  const eventosVehiculosSemana = vehiculosHist.filter((h) => h.accion === "evento" && enRango(h.fecha));
  const gastoVehiculos = eventosVehiculosSemana.reduce((suma, h) => suma + (parseFloat(h.monto) || 0), 0);

  const fmtMoneda = (n) => "$" + Math.round(n).toLocaleString("es-AR");
  const fila = (etiqueta, valor) => `<tr><td style="padding:5px 14px 5px 0; color:#101820;">${etiqueta}</td><td style="padding:5px 0; text-align:right; font-weight:700; color:#101820;">${valor}</td></tr>`;
  const tabla = (filas) => `<table style="width:100%; border-collapse:collapse; margin-bottom:20px;">${filas}</table>`;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color:#101820; max-width:560px; margin:0 auto;">
      <h2 style="margin-bottom:2px;">📊 Resumen semanal — Servicio Técnico SAT</h2>
      <p style="color:#6B7680; margin-top:0; margin-bottom:22px;">Semana del ${desde} al ${hasta}</p>

      ${tabla([
        fila("Servicios completados", partesSemana.length),
        fila("Total facturado", fmtMoneda(totalFacturado)),
        fila("Comodatos firmados", comodatosSemana.length),
        fila("Emergencias cargadas", emergenciasSemana.length),
        fila("Promedio de satisfacción", promedioSemana != null ? `${promedioSemana.toFixed(1)} ⭐ (${encuestasSemana.length})` : "Sin calificaciones"),
        fila("Gasto en vehículos (combustible/mecánico/etc.)", fmtMoneda(gastoVehiculos)),
      ].join(""))}

      <h3 style="margin-bottom:6px;">⚠️ Pendientes acumulados</h3>
      ${tabla([
        fila("Partes sin pasar a sistema", partesSinPasar),
        fila("Movimientos de stock sin pasar a sistema", stockSinPasar),
      ].join(""))}

      ${rankingPartes.length > 0 ? `
        <h3 style="margin-bottom:6px;">Servicios completados por técnico</h3>
        ${tabla(rankingPartes.map((t) => fila(t.nombre, t.cantidad)).join(""))}
      ` : ""}

      ${rankingSatisfaccion.length > 0 ? `
        <h3 style="margin-bottom:6px;">Satisfacción por técnico (esta semana)</h3>
        ${tabla(rankingSatisfaccion.map((t) => fila(t.nombre, `${t.promedio.toFixed(1)} ⭐ (${t.cantidad})`)).join(""))}
      ` : ""}
    </div>
  `;

  try {
    const transporter = getTransporterResumen();
    await transporter.sendMail({
      from: `"Servicio Técnico SAT" <${process.env.SMTP_USER}>`,
      to: "tecnica@sat365.com.ar, ventas@sat365.com.ar",
      subject: `Resumen semanal SAT — ${desde} al ${hasta}`,
      html,
    });
  } catch (err) {
    console.error("[cron-diario] No se pudo mandar el resumen semanal:", err);
    return null; // no se marca como enviado, para reintentar en la corrida de la tarde
  }

  estado.ultima_semana_resumen = semanaActual;
  return { desde, hasta, partes: partesSemana.length };
}

// Recordatorio de devolver el vehículo al final del día — lunes a
// viernes (no fin de semana ni feriado), a los técnicos "en la
// calle" que todavía tienen un vehículo tomado a esa altura del día.
async function chequearRecordatorioDevolverVehiculo(ghHeaders, headersBackendNuevo, estado, ahora) {
  const diaSemana = ahora.getDay();
  if (diaSemana === 0 || diaSemana === 6) return null; // solo lunes a viernes
  // Esta franja comparte cron con la de la mañana (todos los días) —
  // sin este chequeo de hora, se dispararía también ahí.
  if (ahora.getHours() < 15) return null;

  const hoyStr = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
  if (estado.ultimo_dia_recordatorio_devolver === hoyStr) return null;

  if (await esFeriadoArgentina(ahora)) return null;

  const { data: tecnicos } = await leerJSON(ghHeaders, TECNICOS_PATH, []);
  const enCalle = new Set((tecnicos || []).filter((t) => t.en_calle).map((t) => t.nombre));
  if (enCalle.size === 0) return null;

  // OJO: esto ANTES leía "vehiculos-historial.json" de GitHub — pero
  // el historial de uso de vehículos se guarda en el backend nuevo
  // (D1) desde la migración, así que ese archivo quedó congelado.
  const historialVehiculos = await fetchBackendArray("/api/vehiculos/historial", headersBackendNuevo);
  const destinatarios = [...new Set(
    (historialVehiculos || [])
      .filter((h) => h.tecnico && enCalle.has(h.tecnico) && !h.hora_devolucion && !h.accion)
      .map((h) => h.tecnico)
  )];
  if (destinatarios.length === 0) {
    estado.ultimo_dia_recordatorio_devolver = hoyStr;
    return null; // nadie en la calle tiene un vehículo tomado a esta altura
  }

  await enviarASeleccionados(destinatarios, {
    titulo: "🚐 No te olvides",
    cuerpo: "Antes de terminar el día, acordate de devolver el vehículo.",
    url: "/",
    importante: true,
  });

  estado.ultimo_dia_recordatorio_devolver = hoyStr;
  return destinatarios;
}

async function chequearRecordatorioTecnicosEnCalle(ghHeaders, headersBackendNuevo, estado, ahora) {
  const diaSemana = ahora.getDay(); // 0 = domingo ... 6 = sábado
  if (diaSemana === 0 || diaSemana === 6) return null;

  const hoyStr = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
  if (estado.ultimo_dia_recordatorio_tecnicos === hoyStr) return null;

  if (await esFeriadoArgentina(ahora)) return null;

  const { data: tecnicos } = await leerJSON(ghHeaders, TECNICOS_PATH, []);
  const enCalle = (tecnicos || []).filter((t) => t.en_calle).map((t) => t.nombre);
  if (enCalle.length === 0) return null;

  // Si un técnico ya tomó vehículo Y ya tomó alguna herramienta, no
  // hace falta recordárselo — se salta del envío.
  //
  // OJO: esto ANTES leía "vehiculos-historial.json" y
  // "herramientas-config.json" de GitHub — ambas colecciones ya
  // viven en el backend nuevo (D1) desde la migración, así que esos
  // dos archivos quedaron congelados con lo que tenían ese día.
  const historialVehiculos = await fetchBackendArray("/api/vehiculos/historial", headersBackendNuevo);
  const tienenVehiculoTomado = new Set(
    (historialVehiculos || [])
      .filter((h) => h.tecnico && !h.hora_devolucion && !h.accion) // registro "tomar" todavía abierto
      .map((h) => h.tecnico)
  );
  const herramientas = await fetchBackendArray("/api/herramientas", headersBackendNuevo);
  const tienenHerramientaTomada = new Set(
    (herramientas || [])
      .filter((h) => h.tecnico_actual && (h.estado === "uso" || h.estado === "cliente"))
      .map((h) => h.tecnico_actual)
  );
  const destinatarios = enCalle.filter(
    (nombre) => !(tienenVehiculoTomado.has(nombre) && tienenHerramientaTomada.has(nombre))
  );
  if (destinatarios.length === 0) {
    estado.ultimo_dia_recordatorio_tecnicos = hoyStr;
    return []; // todos ya tenían vehículo y herramienta — no hacía falta avisarle a nadie
  }

  await enviarASeleccionados(destinatarios, {
    titulo: "🚐 Recordatorio",
    cuerpo: "No te olvides de tomar el vehículo y las herramientas que necesites para hoy.",
    url: "/",
    importante: true,
  });

  estado.ultimo_dia_recordatorio_tecnicos = hoyStr;
  return destinatarios;
}

async function chequearVehiculos(headersBackendNuevo, estado, hoy) {
  // OJO: esto ANTES leía "vehiculos-config.json" de GitHub — la
  // colección "vehiculos" (km_actual, umbrales de mantenimiento) ya
  // vive en el backend nuevo (D1) desde la migración, así que ese
  // archivo quedó congelado con los valores de ese día.
  const vehiculos = await fetchBackendArray("/api/vehiculos", headersBackendNuevo);
  if (!estado.vehiculos) estado.vehiculos = {};

  for (const v of vehiculos) {
    const alertas = calcularAlertasVehiculo(v, hoy);
    const estadoVehiculo = estado.vehiculos[v.nombre] || {};

    for (const alerta of alertas) {
      const nivelAnterior = estadoVehiculo[alerta.nombre];
      if (nivelAnterior === alerta.nivel) continue; // ya se avisó este mismo nivel

      await enviarATodos({
        titulo: `🚐 ${v.nombre}`,
        cuerpo: alerta.mensaje,
        url: "/",
      });
      estadoVehiculo[alerta.nombre] = alerta.nivel;
    }
    estado.vehiculos[v.nombre] = estadoVehiculo;
  }
}

module.exports = async (req, res) => {
  const authHeader = req.headers["authorization"] || "";
  const esperado = `Bearer ${process.env.CRON_SECRET || ""}`;
  if (!process.env.CRON_SECRET || authHeader !== esperado) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  try {
    const ghHeaders = {
      Authorization: `Bearer ${process.env.GITHUB_DATA_TOKEN}`,
      Accept: "application/vnd.github+json",
    };
    const headersBackendNuevo = { Authorization: `Bearer ${process.env.BACKEND_NUEVO_TOKEN || ""}` };
    const { data: estado, sha: shaEstado } = await leerJSON(ghHeaders, ESTADO_PATH, {});
    const ahora = ahoraArgentina();

    const tecnicoDeGuardia = await chequearGuardia(headersBackendNuevo, estado, ahora);
    await chequearVehiculos(headersBackendNuevo, estado, ahora);
    const tecnicosRecordados = await chequearRecordatorioTecnicosEnCalle(ghHeaders, headersBackendNuevo, estado, ahora);
    const ganadoresSemana = await chequearFelicitacionSemanal(ghHeaders, headersBackendNuevo, estado, ahora);
    const recordadosDevolver = await chequearRecordatorioDevolverVehiculo(ghHeaders, headersBackendNuevo, estado, ahora);
    const resumenSemanal = await chequearResumenSemanal(headersBackendNuevo, estado, ahora);

    await guardarJSON(ghHeaders, ESTADO_PATH, estado, shaEstado);

    res.status(200).json({ ok: true, guardia_notificada: tecnicoDeGuardia || null, recordatorio_en_calle: tecnicosRecordados || null, felicitacion_semanal: ganadoresSemana || null, recordatorio_devolver: recordadosDevolver || null, resumen_semanal: resumenSemanal || null });
  } catch (err) {
    res.status(500).json({ error: "Error interno en el cron diario", detail: String(err.message || err) });
  }
};
