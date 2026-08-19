// Módulo compartido — envía notificaciones push (Web Push) a todos los
// celulares suscriptos. Lo usan tanto el endpoint de vehículos (evento
// al devolver) como el cron diario (guardia y mantenimiento).
//
// Variables de entorno necesarias:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ej: "mailto:algo@sat365.com.ar")
//   BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN (corte al backend nuevo — antes leía de GitHub)

const webpush = require("web-push");

function configurarVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:soporte@sat365.com.ar",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// "sha" ya no aplica (era específico de GitHub) — se deja en la forma
// de la función para no tener que tocar quien la llama.
async function leerSuscripciones() {
  const url = `${process.env.BACKEND_NUEVO_URL}/api/push-subscripciones`;
  const headers = { Authorization: `Bearer ${process.env.BACKEND_NUEVO_TOKEN}` };
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error("No se pudo leer las suscripciones push");
  const filas = await r.json();
  const data = (Array.isArray(filas) ? filas : []).map((f) => ({
    ...(typeof f.keys === "string" ? JSON.parse(f.keys) : f.keys),
    endpoint: f.endpoint,
    tecnico: f.tecnico,
  }));
  return { data, sha: null };
}

async function guardarSuscripciones(_ghHeadersSinUsar, lista) {
  const url = `${process.env.BACKEND_NUEVO_URL}/api/push-subscripciones`;
  const headers = { Authorization: `Bearer ${process.env.BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" };
  // Se reemplaza la lista completa por la que quedó (sin las que ya
  // no sirven) — hay que vaciar primero, porque esta tabla no tiene
  // una forma de "borrar por endpoint" todavía, solo agregar/actualizar.
  await fetch(url, { method: "DELETE", headers });
  const filasParaGuardar = lista.map(({ endpoint, keys, ...resto }) => ({
    endpoint,
    keys: keys || { p256dh: resto.p256dh, auth: resto.auth },
    tecnico: resto.tecnico,
  }));
  if (filasParaGuardar.length > 0) {
    await fetch(url, { method: "POST", headers, body: JSON.stringify(filasParaGuardar) });
  }
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

  const { data: suscripciones, sha } = await leerSuscripciones();
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
      // etc.) — se descarta sin registrar nada, es esperable. Otros
      // errores se conservan para reintentar después, pero SÍ quedan
      // registrados (antes se ignoraban en silencio total).
      if (err.statusCode === 404 || err.statusCode === 410) {
        continue;
      }
      console.error("[push-sender] Falló el envío a una suscripción:", err.statusCode || "", err.message || err);
      validas.push(sub);
    }
  }

  if (validas.length !== suscripciones.length) {
    await guardarSuscripciones(null, validas, sha);
  }

  return { enviados };
}

// Manda la notificación solo a los técnicos indicados (por nombre) —
// se usa para avisos que no le corresponden a todo el equipo, como el
// recordatorio de tomar vehículo/herramientas para quien está en la
// calle ese día.
async function enviarASeleccionados(nombresTecnicos, { titulo, cuerpo, url, importante }) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error("Faltan las claves VAPID — no se puede enviar push");
    return { enviados: 0, error: "Faltan claves VAPID" };
  }
  configurarVapid();

  const { data: suscripciones, sha } = await leerSuscripciones();
  if (suscripciones.length === 0) return { enviados: 0 };

  const nombresSet = new Set(nombresTecnicos);
  const payload = JSON.stringify({ titulo, cuerpo, url: url || "/", importante: !!importante });
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
    await guardarSuscripciones(null, validas, sha);
  }

  return { enviados };
}

module.exports = { enviarATodos, enviarASeleccionados, leerSuscripciones, guardarSuscripciones };
