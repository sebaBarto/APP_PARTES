// Versión del caché: subir este número cada vez que se publican cambios
// importantes fuerza a los celulares a descartar la copia vieja.
const CACHE_NAME = "parte-tecnico-v84";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon.svg",
];

// Librerías de terceros guardadas dentro de la app (carpeta /vendor):
// gráficos, mapa, Excel, QR, huella y tipografías. Antes se bajaban de
// internet cada vez y sin señal fallaban. Van en un caché APARTE que no
// se borra al publicar versiones nuevas (así no se vuelven a descargar
// 1,5 MB en cada actualización). Si se cambia alguna librería, subir
// VENDOR_CACHE (vendor-v2, ...).
const VENDOR_CACHE = "vendor-v1";
const VENDOR_FILES = [
  "./vendor/fonts.css",
  "./vendor/fonts/space-grotesk-latin-500-normal.woff2",
  "./vendor/fonts/space-grotesk-latin-600-normal.woff2",
  "./vendor/fonts/space-grotesk-latin-700-normal.woff2",
  "./vendor/fonts/ibm-plex-mono-latin-400-normal.woff2",
  "./vendor/fonts/ibm-plex-mono-latin-500-normal.woff2",
  "./vendor/fonts/ibm-plex-mono-latin-600-normal.woff2",
  "./vendor/fonts/inter-latin-400-normal.woff2",
  "./vendor/fonts/inter-latin-500-normal.woff2",
  "./vendor/fonts/inter-latin-600-normal.woff2",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/images/marker-icon.png",
  "./vendor/leaflet/images/marker-icon-2x.png",
  "./vendor/leaflet/images/marker-shadow.png",
  "./vendor/leaflet/images/layers.png",
  "./vendor/leaflet/images/layers-2x.png",
  "./vendor/xlsx.full.min.js",
  "./vendor/qrcode.js",
  "./vendor/simplewebauthn-browser.umd.min.js",
  "./vendor/chart.umd.min.js",
  "./vendor/chartjs-plugin-datalabels.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
    // Cada archivo por separado: si alguno falla, no se cae toda la instalación
    caches.open(VENDOR_CACHE).then(async (cache) => {
      for (const f of VENDOR_FILES) {
        try { if (!(await cache.match(f))) await cache.add(f); } catch (err) { /* se reintenta al usarlo */ }
      }
    }),
  ]));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== VENDOR_CACHE).map((k) => caches.delete(k)))
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

  // Librerías de /vendor: primero el caché (no cambian entre versiones),
  // y si no está todavía, se baja y se guarda.
  if (url.pathname.includes("/vendor/")) {
    event.respondWith(
      caches.open(VENDOR_CACHE).then((cache) =>
        cache.match(event.request).then((hit) => hit || fetch(event.request).then((resp) => {
          if (resp && resp.ok) cache.put(event.request, resp.clone());
          return resp;
        }))
      )
    );
    return;
  }

  // Para los archivos propios de la app: red primero (así siempre se ve
  // la última versión publicada), y si no hay conexión, se usa la copia
  // guardada como respaldo. cache:"no-store" es clave acá -- sin esto,
  // el fetch de la red igual puede resolverse con la copia que el
  // navegador (no el service worker, la caché HTTP del navegador en
  // sí) tenga guardada, dejando a alguien viendo una versión vieja
  // aunque tenga conexión.
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
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
