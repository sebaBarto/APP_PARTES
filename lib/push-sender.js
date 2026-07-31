// Módulo compartido — envía notificaciones push (Web Push) a todos los
// celulares suscriptos. Lo usan tanto el endpoint de vehículos (evento
// al devolver) como el cron diario (guardia y mantenimiento).
//
// Variables de entorno necesarias:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ej: "mailto:algo@sat365.com.ar")
//   GITHUB_DATA_TOKEN, GITHUB_DATA_REPO (ya existentes)

const webpush = require("web-push");

const SUBS_PATH = "push-subscripciones.json";

function configurarVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:soporte@sat365.com.ar",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function leerSuscripciones(ghHeaders) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${SUBS_PATH}`;
  const r = await fetch(url, { headers: ghHeaders });
  if (r.status === 404) return { data: [], sha: null };
  if (!r.ok) throw new Error("No se pudo leer las suscripciones push");
  const data = await r.json();
  const content = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  return { data: content, sha: data.sha };
}

async function guardarSuscripciones(ghHeaders, lista, sha) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${SUBS_PATH}`;
  const contentB64 = Buffer.from(JSON.stringify(lista, null, 2)).toString("base64");
  await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Actualiza suscripciones push (${new Date().toISOString()})`,
      content: contentB64,
      sha: sha || undefined,
    }),
  });
}

// Manda la notificación a todas las suscripciones guardadas. Si alguna
// ya no es válida (el celular la desinstaló, etc.), la saca de la
// lista para no seguir intentando en vano.
async function enviarATodos({ titulo, cuerpo, url }) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error("Faltan las claves VAPID — no se puede enviar push");
    return { enviados: 0, error: "Faltan claves VAPID" };
  }
  configurarVapid();

  const ghHeaders = {
    Authorization: `Bearer ${process.env.GITHUB_DATA_TOKEN}`,
    Accept: "application/vnd.github+json",
  };
  const { data: suscripciones, sha } = await leerSuscripciones(ghHeaders);
  if (suscripciones.length === 0) return { enviados: 0 };

  const payload = JSON.stringify({ titulo, cuerpo, url: url || "/" });
  let enviados = 0;
  const validas = [];

  for (const sub of suscripciones) {
    try {
      await webpush.sendNotification(sub, payload);
      validas.push(sub);
      enviados++;
    } catch (err) {
      // 404/410 = la suscripción ya no existe (se desinstaló la app,
      // etc.) — se descarta. Otros errores se ignoran por esta vez
      // pero se conserva la suscripción para reintentar después.
      if (err.statusCode === 404 || err.statusCode === 410) {
        continue;
      }
      validas.push(sub);
    }
  }

  if (validas.length !== suscripciones.length) {
    await guardarSuscripciones(ghHeaders, validas, sha);
  }

  return { enviados };
}

// Manda la notificación solo a los técnicos indicados (por nombre) —
// se usa para avisos que no le corresponden a todo el equipo, como el
// recordatorio de tomar vehículo/herramientas para quien está en la
// calle ese día.
async function enviarASeleccionados(nombresTecnicos, { titulo, cuerpo, url }) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error("Faltan las claves VAPID — no se puede enviar push");
    return { enviados: 0, error: "Faltan claves VAPID" };
  }
  configurarVapid();

  const ghHeaders = {
    Authorization: `Bearer ${process.env.GITHUB_DATA_TOKEN}`,
    Accept: "application/vnd.github+json",
  };
  const { data: suscripciones, sha } = await leerSuscripciones(ghHeaders);
  if (suscripciones.length === 0) return { enviados: 0 };

  const nombresSet = new Set(nombresTecnicos);
  const payload = JSON.stringify({ titulo, cuerpo, url: url || "/" });
  let enviados = 0;
  const validas = [];

  for (const sub of suscripciones) {
    if (!nombresSet.has(sub.tecnico)) {
      validas.push(sub); // no es para este aviso, pero se conserva igual
      continue;
    }
    try {
      await webpush.sendNotification(sub, payload);
      validas.push(sub);
      enviados++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        continue;
      }
      validas.push(sub);
    }
  }

  if (validas.length !== suscripciones.length) {
    await guardarSuscripciones(ghHeaders, validas, sha);
  }

  return { enviados };
}

module.exports = { enviarATodos, enviarASeleccionados, leerSuscripciones, guardarSuscripciones };
