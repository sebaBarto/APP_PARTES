# Parte Técnico — App

PWA (app web instalable) para que el técnico saque una foto del parte de
servicio firmado, la app extraiga los datos automáticamente y los envíe
por mail a una casilla fija.

## Cómo funciona

1. El técnico toca el botón y saca la foto.
2. La foto se envía a `/api/extract`, una función que corre en Vercel y
   usa la API de Claude (con visión) para leer los datos del parte.
3. Los datos extraídos aparecen en un formulario editable — el técnico
   revisa y corrige lo que haga falta.
4. Al tocar "Enviar por mail", los datos (no la foto) se mandan por mail
   usando EmailJS, a la casilla que vos configures.

## Antes de publicarla: 3 cosas para configurar

### 1. API Key de Anthropic (para la lectura automática de la foto)
- Consola de Anthropic → crear una API key.
- En Vercel: Project Settings → Environment Variables → agregar
  `ANTHROPIC_API_KEY` con esa key. **No va en el código ni en el
  frontend.**

### 2. EmailJS (para el envío del mail, sin backend propio)
- Creá una cuenta gratis en https://www.emailjs.com
- Agregá un "Email Service" (podés conectar un Gmail, por ejemplo).
- Creá una "Template" con estos campos disponibles (van a llegar como
  variables desde la app): `cliente`, `direccion`, `localidad`, `tarea`,
  `materiales`, `importe`, `tecnico`, `fecha`, `hora_entrada`,
  `hora_salida`.
- **Importante**: en la plantilla, poné como "To email" la casilla fija
  a la que siempre querés que lleguen los partes.
- Copiá tu Public Key, Service ID y Template ID y pegalos en
  `app.js`, arriba de todo, en estas líneas:
  ```js
  const EMAILJS_PUBLIC_KEY = "TU_PUBLIC_KEY";
  const EMAILJS_SERVICE_ID = "TU_SERVICE_ID";
  const EMAILJS_TEMPLATE_ID = "TU_TEMPLATE_ID";
  ```

### 3. Publicar en Vercel
- Subí esta carpeta a un repo de GitHub.
- En https://vercel.com → "New Project" → importá el repo → Deploy.
- Vercel detecta sola la carpeta `api/` como función serverless; no hace
  falta ningún framework ni build.

## Instalar la app en el celular Android

1. Abrí la URL de Vercel en Chrome del celular.
2. Chrome va a mostrar (o el menú ⋮ va a tener) la opción
   "Agregar a pantalla de inicio" / "Instalar app".
3. Queda como un ícono más, se abre en pantalla completa, sin barra de
   navegador.

## Estructura del proyecto

```
index.html      → pantallas (cámara / procesando / formulario / listo)
styles.css      → diseño visual
app.js          → lógica: cámara, llamada a la API, envío por mail
manifest.json   → metadata de instalación como PWA
sw.js           → cachea la app para que abra rápido / offline
api/extract.js  → función serverless: llama a Claude Vision
icons/          → ícono de la app
```

## Notas y límites de esta primera versión

- La foto **no se guarda en ningún lado** — se lee, se procesa y se
  descarta. Si más adelante querés guardar un historial de partes
  (por ejemplo para buscar por cliente o fecha), se puede sumar una
  base de datos.
- La extracción automática puede fallar con fotos borrosas o letra muy
  poco clara — por eso el paso 3 siempre deja los campos editables
  antes de enviar.
- El envío es solo de los **datos** por mail, no un PDF ni la foto
  adjunta. Si necesitás que llegue la foto o un PDF armado del parte,
  avisame y lo sumamos (EmailJS con plan pago permite adjuntos, o se
  puede armar un PDF en el propio servidor de Vercel).
