# Sincronizador de planos (para correr en tu PC)

Este programa vigila una carpeta en tu computadora y sube automáticamente cada plano nuevo o
modificado a la app — sin que tengas que entrar a `admin.html` y subirlos a mano uno por uno.

- Los `.pdf` se suben directamente.
- Los `.vsd` / `.vsdx` (Visio) se convierten a PDF antes de subirse (un celular no puede abrir
  un archivo de Visio directo). La conversión usa **LibreOffice**, que es gratis.
- Solo se sube un archivo si su contenido cambió de verdad — abrirlo sin modificar nada, o
  simplemente "tocarlo", no dispara una subida de nuevo.

## Instalación (una sola vez)

1. **Instalá Node.js** si no lo tenés: https://nodejs.org (bajate la versión "LTS").
2. **Instalá LibreOffice** si vas a tener archivos de Visio entre los planos:
   https://www.libreoffice.org/download/download/ — no hace falta si todos tus archivos ya son
   PDF.
3. Copiá el archivo `config.example.json`, renombrá la copia a **`config.json`**, y completá:
   - `carpeta_planos`: la ruta completa de la carpeta en tu PC donde guardás los planos (podés
     tener subcarpetas adentro, también las vigila).
   - `url_app`: la dirección web de tu app (la misma que usás para entrar desde el navegador).
   - `token`: el mismo valor que la constante `SERVICIOS_API_TOKEN` en `app.js` del proyecto
     principal.
   - `comando_libreoffice`: normalmente `soffice` alcanza si LibreOffice quedó en el PATH del
     sistema. Si en Windows no lo encuentra, poné la ruta completa, por ejemplo:
     `C:\\Program Files\\LibreOffice\\program\\soffice.exe`
4. Abrí una terminal (línea de comandos) en esta carpeta y corré:
   ```
   npm install
   ```

## Uso

Cada vez que quieras que el sincronizador esté activo:
```
npm start
```
Dejá esa ventana abierta — mientras esté corriendo y tu PC tenga internet, cualquier plano
nuevo o modificado que guardes en la carpeta configurada se sube solo. Si cerrás la ventana, se
deja de vigilar (podés volver a correr `npm start` cuando quieras).

## Cosas para tener en cuenta

- **Revisá los primeros archivos de Visio convertidos.** LibreOffice hace un buen trabajo en la
  mayoría de los casos, pero no siempre queda idéntico al original — sobre todo con formas o
  estilos poco comunes. Conviene abrir un par de los primeros PDF generados para confirmar que
  se vean bien antes de confiarse del todo.
- El archivo `config.json` tiene tu token de acceso — **nunca lo compartas ni lo subas a
  ningún lado** (ya está en la lista de archivos que Git ignora, así que no se sube al
  repositorio aunque hagas cambios).
- El archivo `estado-subidos.json` es la "memoria" del programa, para saber qué ya subió. No
  hace falta tocarlo, pero si alguna vez querés forzar que vuelva a subir todo desde cero,
  podés borrarlo (la próxima vez que corras `npm start` va a revisar toda la carpeta otra vez).
