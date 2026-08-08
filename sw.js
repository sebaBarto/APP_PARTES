// Versión del caché: subir este número cada vez que se publican cambios
// importantes fuerza a los celulares a descartar la copia vieja.
const CACHE_NAME = "parte-tecnico-v33";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Los pedidos a nuestras funciones (/api/*) y a servicios externos
  // (EmailJS, etc.) nunca se cachean — siempre van directo a la red.
  if (url.pathname.startsWith("/api/") || url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Para los archivos propios de la app: red primero (así siempre se ve
  // la última versión publicada), y si no hay conexión, se usa la copia
  // guardada como respaldo.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ---------- Notificaciones push ----------
self.addEventListener("push", (event) => {
  let datos = { titulo: "Servicio Técnico SAT", cuerpo: "Tenés una notificación nueva." };
  try {
    if (event.data) datos = event.data.json();
  } catch (err) {
    // si no viene en JSON, se usa el mensaje genérico de arriba
  }
  event.waitUntil(
    self.registration.showNotification(datos.titulo || "Servicio Técnico SAT", {
      body: datos.cuerpo || "",
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      data: { url: datos.url || "./" },
      // "silent: false" asegura que suene con el sonido del sistema
      // (nunca se manda en silencio) — para el recordatorio a
      // técnicos "en la calle", además queda fija en pantalla hasta
      // que la toquen, y vibra más fuerte, para que no pase
      // desapercibida.
      silent: false,
      requireInteraction: !!datos.importante,
      vibrate: datos.importante ? [300, 100, 300, 100, 300] : [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
