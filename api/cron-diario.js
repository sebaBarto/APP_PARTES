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
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

const { enviarATodos, enviarASeleccionados } = require("../lib/push-sender");

const GUARDIAS_PATH = "guardias-config.json";
const VEHICULOS_PATH = "vehiculos-config.json";
const TECNICOS_PATH = "tecnicos.json";
const ESTADO_PATH = "notificaciones-estado.json";

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

async function chequearGuardia(ghHeaders, estado, ahora) {
  if (ahora.getDay() !== 1) return null; // solo lunes

  const semanaActual = numeroSemanaIso(ahora);
  if (estado.ultima_semana_guardia_notificada === semanaActual) return null;

  const { data: guardias } = await leerJSON(ghHeaders, GUARDIAS_PATH, { fecha_inicio_referencia: "", secuencia: [] });
  const secuencia = guardias.secuencia || [];
  if (!guardias.fecha_inicio_referencia || secuencia.length === 0) return null;

  const [y, m, d] = guardias.fecha_inicio_referencia.split("-").map(Number);
  const inicioRef = new Date(y, m - 1, d, 9, 0, 0, 0);
  const diffMs = ahora.getTime() - inicioRef.getTime();
  if (diffMs < 0) return null;
  const semanas = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  const indice = ((semanas % secuencia.length) + secuencia.length) % secuencia.length;
  const tecnico = secuencia[indice];

  await enviarATodos({
    titulo: "🚨 Cambio de guardia",
    cuerpo: `Esta semana la guardia técnica la toma ${tecnico.nombre}.`,
    url: "/",
  });

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
async function chequearRecordatorioTecnicosEnCalle(ghHeaders, estado, ahora) {
  const diaSemana = ahora.getDay(); // 0 = domingo ... 6 = sábado
  if (diaSemana === 0 || diaSemana === 6) return null;

  const hoyStr = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
  if (estado.ultimo_dia_recordatorio_tecnicos === hoyStr) return null;

  if (await esFeriadoArgentina(ahora)) return null;

  const { data: tecnicos } = await leerJSON(ghHeaders, TECNICOS_PATH, []);
  const enCalle = (tecnicos || []).filter((t) => t.en_calle).map((t) => t.nombre);
  if (enCalle.length === 0) return null;

  await enviarASeleccionados(enCalle, {
    titulo: "🚐 Recordatorio",
    cuerpo: "No te olvides de tomar el vehículo y las herramientas que necesites para hoy.",
    url: "/",
  });

  estado.ultimo_dia_recordatorio_tecnicos = hoyStr;
  return enCalle;
}

async function chequearVehiculos(ghHeaders, estado, hoy) {
  const { data: vehiculos } = await leerJSON(ghHeaders, VEHICULOS_PATH, []);
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
    const { data: estado, sha: shaEstado } = await leerJSON(ghHeaders, ESTADO_PATH, {});
    const ahora = ahoraArgentina();

    const tecnicoDeGuardia = await chequearGuardia(ghHeaders, estado, ahora);
    await chequearVehiculos(ghHeaders, estado, ahora);
    const tecnicosRecordados = await chequearRecordatorioTecnicosEnCalle(ghHeaders, estado, ahora);

    await guardarJSON(ghHeaders, ESTADO_PATH, estado, shaEstado);

    res.status(200).json({ ok: true, guardia_notificada: tecnicoDeGuardia || null, recordatorio_en_calle: tecnicosRecordados || null });
  } catch (err) {
    res.status(500).json({ error: "Error interno en el cron diario", detail: String(err.message || err) });
  }
};
