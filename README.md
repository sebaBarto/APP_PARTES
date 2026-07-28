# Parte Técnico — App

PWA (app web instalable) para que el técnico cargue el parte de servicio
directamente en el celular, el cliente firme en pantalla, y se envíen
copias por mail a la oficina y al cliente.

## Cómo funciona

1. El técnico completa el formulario con los datos del servicio.
2. El cliente firma con el dedo en la pantalla, confirmando conformidad.
3. Al confirmar, la app genera un **ID único** para el parte (ej.
   `SAT-20260723-143205-482`) y envía por mail, usando EmailJS:
   - Una copia a la **casilla fija de la oficina**.
   - Si el técnico cargó el mail del cliente, otra copia a **esa
     dirección**. Si no lo cargó, sigue igual y solo manda la de oficina.

No usa cámara ni lectura automática de fotos — todo se carga a mano.

## Acceso con contraseña

Antes de ver el formulario, la app pide una contraseña simple. Está
definida en `app.js`:
```js
const APP_PASSWORD = "Marcos@2018";
```
Es una validación solo del lado del celular (no hay usuarios ni login
con servidor) — sirve para que no cualquiera que tenga la URL cargue
partes, pero no es seguridad fuerte (cualquiera que abra el código de
la página puede verla). Si más adelante querés un login real por
técnico, hace falta un backend con usuarios.

## Técnico interviniente

Es un menú desplegable con los técnicos fijos de SAT, más la opción
"Otro..." que habilita un campo de texto libre. Para agregar o quitar
técnicos de la lista, se edita directamente en `index.html`, buscando
el `<select id="f_tecnico">`.

## Listado de servicios pendientes (precarga de datos)

La app tiene una pantalla de "Servicios pendientes" después del login, que
descarga un listado desde un endpoint propio (`/api/servicios.js`, función
serverless de Vercel) y precarga cliente/dirección/localidad/tarea en el
formulario cuando el técnico toca un servicio.

Los datos **nunca quedan en un archivo público** — se guardan en un repo
privado de GitHub aparte, y solo se sirven si se manda la clave secreta
correcta. La carga se hace a mano desde `admin.html`, subiendo el CSV o
Excel que exporta el ERP (2 veces por día alcanza). Si el archivo tiene
título o filtros arriba del encabezado real (común en reportes de ERP),
`admin.html` intenta adivinar en qué fila está el encabezado, pero se
puede corregir a mano.

En la app, la pantalla de servicios pendientes tiene un buscador arriba
para filtrar por cliente, dirección, N° de servicio o tarea.

### Pasos de configuración (una sola vez)

1. **Crear un repo privado nuevo** en GitHub, solo para los datos (ej.
   `sat-servicios-data`). Que quede **Private**. Puede estar vacío.

2. **Crear un Personal Access Token (fine-grained)** en GitHub, distinto
   del que se usa para el repo de la app:
   - Repository access: solo ese repo nuevo (`sat-servicios-data`)
   - Permissions → Contents: **Read and write**
   - Guardalo, lo vas a necesitar en el paso 4.

3. **Elegir una clave secreta larga** (por ejemplo, generada con un
   gestor de contraseñas) y pegarla en dos lugares:
   - `app.js` → constante `SERVICIOS_API_TOKEN`
   - `admin.html` → constante `SERVICIOS_API_TOKEN` (¡la misma!)
   - También poné una contraseña propia en `admin.html` → `ADMIN_PASSWORD`

4. **Cargar las variables de entorno en Vercel** (Project Settings →
   Environment Variables):
   - `SERVICIOS_API_TOKEN` = la misma clave del paso 3
   - `GITHUB_DATA_TOKEN` = el token del paso 2
   - `GITHUB_DATA_REPO` = `tu-usuario/sat-servicios-data`
   - `GITHUB_DATA_PATH` = `servicios.json`
   - Después de cargarlas, hacer un **redeploy** del proyecto para que
     tomen efecto.

5. Entrar a `tu-app.vercel.app/admin.html`, subir el CSV del ERP, y
   asignar qué columna corresponde a cada dato (se recuerda para la
   próxima vez). Al confirmar, ya queda disponible en la app de los
   técnicos.



Se necesitan **dos plantillas** en tu cuenta de EmailJS, porque una manda
siempre al mismo lugar (oficina) y la otra manda a un mail que cambia en
cada parte (cliente).

### 1. Plantilla de OFICINA (ya la tenés armada)
- "To email" = tu casilla fija.
- Variables disponibles: `id_parte`, `cliente`, `direccion`, `localidad`,
  `tarea`, `materiales`, `importe`, `tecnico`, `fecha`, `hora_entrada`,
  `hora_salida`, `firma_img` (esta última es un `<img>` con la firma
  incrustada — la plantilla tiene que estar en modo **HTML** para que se
  vea como imagen y no como texto).

### 2. Plantilla de CLIENTE (nueva, falta crear)
- En EmailJS: **Email Templates → Create New Template**.
- En el campo **"To email"**, en vez de escribir una dirección fija,
  escribí la variable **`{{cliente_email}}`** — así cada mail va a la
  dirección que cargue el técnico en el formulario.
- Mismas variables disponibles que arriba, más `cliente_email`.
- Modo HTML también, para que se vea la firma.
- Copiá el **Template ID** que te da y pegalo en `app.js`:
  ```js
  const EMAILJS_TEMPLATE_CLIENTE = "TU_TEMPLATE_ID_CLIENTE";
  ```

## Foto opcional en el parte (solo para la oficina)

El técnico puede sacar o elegir una foto al completar el parte. Es
opcional — si no carga nada, no pasa nada. La foto **no se manda como
adjunto de mail** (EmailJS free tiene un límite de 50 KB por mail, muy
poco para una foto), sino que se sube al mismo repo privado de GitHub
que ya se usa para el listado de servicios (carpeta `fotos/`), y el mail
de la oficina recibe un link que la muestra. El mail al cliente nunca
incluye la foto ni el link.

(Antes probamos con Google Drive usando una cuenta de servicio, pero
Google no permite que las cuentas de servicio suban archivos a carpetas
de Drive personales — piden Google Workspace con Shared Drives. Por eso
se pasó a guardar las fotos en GitHub, reutilizando la infraestructura
que ya estaba armada para los servicios pendientes.)

El link no es un link directo al repo (que es privado) — pasa por un
endpoint propio (`/api/foto.js`). No lleva ningún token ni clave
visible: cada foto recibe un identificador aleatorio de 16 caracteres al
subirse, y ese identificador funciona como la clave — sin conocerlo
exacto no hay forma de ver ni listar las fotos. El link queda corto y
simple, por ejemplo `tu-app.vercel.app/api/foto?id=9f3ac21b7e4d5210`.

### Pasos de configuración (una sola vez)

No hace falta nada nuevo — reutiliza las variables `GITHUB_DATA_TOKEN`
y `GITHUB_DATA_REPO` que ya configuraste para el listado de servicios.

## Cronograma semanal (lectura para todos los técnicos)

Los técnicos pueden ver, desde el listado de servicios, un botón "Ver
cronograma semanal" con el cronograma completo del equipo — todos ven
las tareas de todos, con un filtro opcional por técnico y pestañas por
día.

Se carga desde `admin.html` (pestaña "Cronograma semanal"), subiendo el
Excel con el formato de siempre: una hoja por día, técnicos en columnas
(fila 3), franjas horarias de 30 minutos en filas, y celdas combinadas
cuando una tarea dura más de una franja — `admin.html` respeta esas
celdas combinadas para calcular la duración real de cada tarea. No hace
falta mapear columnas a mano como con los servicios: el formato ya se
reconoce automáticamente.

Los datos se guardan en el mismo repo privado de datos, en el archivo
`cronograma.json`, reutilizando las mismas variables de entorno que ya
existen (`SERVICIOS_API_TOKEN`, `GITHUB_DATA_TOKEN`, `GITHUB_DATA_REPO`)
— no hace falta configurar nada nuevo.

## Publicar en Vercel

- Confirmá que estén cargadas todas las variables de entorno mencionadas
  arriba: `SERVICIOS_API_TOKEN`, `GITHUB_DATA_TOKEN`, `GITHUB_DATA_REPO`,
  `GITHUB_DATA_PATH`.
- Subí los cambios al repo de GitHub y Vercel redespliega solo.

## Instalar la app en el celular Android

1. Abrí la URL de Vercel en Chrome del celular.
2. Menú ⋮ → "Agregar a pantalla de inicio" / "Instalar app".
3. Queda como un ícono más, en pantalla completa.

## Estructura del proyecto

```
index.html      → pantallas (formulario / firma / enviando / listo)
styles.css      → diseño visual
app.js          → lógica: formulario, firma en canvas, ID único, envío doble por mail
manifest.json   → metadata de instalación como PWA
sw.js           → cachea la app para que abra rápido / offline
icons/          → ícono de la app
```

## Notas y límites de esta versión

- El **ID de parte** se genera por fecha/hora + un número al azar — no es
  correlativo (parte 1, 2, 3...). Si más adelante necesitás numeración
  correlativa real, hace falta guardar un contador en algún lado
  persistente (por ejemplo, una base de datos), porque hoy la app no
  guarda nada entre usos.
- La **firma** se manda incrustada como imagen dentro del cuerpo del
  mail (no como archivo adjunto) — funciona bien en la mayoría de los
  clientes de mail, pero algunos podrían no mostrarla si bloquean
  imágenes incrustadas.
- No queda ningún registro histórico de los partes enviados dentro de la
  app — quedan solo en las casillas de mail que los reciben. Si más
  adelante querés un historial buscable (por cliente, fecha, etc.),
  se puede sumar una base de datos.
