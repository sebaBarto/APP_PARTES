# Tests de humo

Chequeos rápidos para correr **antes de subir una versión**. No tocan datos reales: la API se simula.

```
cd tests
npm install
npx playwright install chromium   # solo la primera vez
npm test
```

Si Chromium está en otra ruta, definir `CHROMIUM_PATH`.

Qué verifica:
- Sintaxis de `app.js`, `sw.js`, `api/*.js` y del script de `admin.html`.
- Que `APP_VERSION` y `CACHE_NAME` del service worker estén definidos.
- Que no haya librerías externas (CDN) y que todos los archivos de `vendor/` existan.
- Que la app abra sin errores de JavaScript.
- Que los ajustes (tema, tamaño) se guarden y se apliquen al reabrir.
- Que un error de JavaScript se reporte a `errores_app` (con tope por sesión).
