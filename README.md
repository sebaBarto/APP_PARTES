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

## Navegación: panel principal y submenús

Después de loguearse, el técnico ve un **panel principal** con botones
grandes:

- **🔧 Servicios Técnicos** → abre un submenú con "Servicios pendientes"
  y "Cronograma semanal".
- **📖 Manuales** → va directo a "Consultas (manuales)" con IA.
- **📊 Dashboards** → abre un submenú con "Dashboard general" y (solo
  para Sebastian Bartolozzi) "Dashboard financiero".
- **🛠 Administración** (solo para Sebastian Bartolozzi) → abre
  `admin.html` directo.

Si en el futuro se agregan más secciones grandes, van como botones
nuevos en este mismo panel principal (`.panel-tile` en `styles.css`,
agregando el botón en `screen-home` de `index.html`).

## Acceso con contraseña (una por técnico) — administrable

Cada técnico tiene su propia contraseña, pero ahora **se administra
desde `admin.html`** (pestaña "Técnicos"), no hace falta tocar código
para agregar, sacar o cambiar la clave de alguien:

1. Entrá a `admin.html`, pestaña "Técnicos".
2. La primera vez que entrás (si nunca se guardó nada) va a aparecer
   precargada con los técnicos actuales — revisala y tocá "Guardar
   cambios" para publicarla.
3. Para agregar uno nuevo: "+ Agregar técnico", completá nombre y
   contraseña, "Guardar cambios".
4. Para sacar uno: tocá la ✕ de su fila, "Guardar cambios".
5. Para cambiar una contraseña: editá el campo, "Guardar cambios".

Los nombres que cargues ahí son los que van a aparecer automáticamente
en el selector "Técnico" del formulario (ya no hace falta editar el
HTML para eso tampoco).

Cuando un técnico entra con su contraseña, la app **autocompleta el
campo "Técnico"** del formulario con su nombre (se puede corregir a
mano si hiciera falta, por ejemplo si alguien usa el celular de otro
técnico).

También existe una contraseña general de respaldo (`APP_PASSWORD_GENERAL`,
en `app.js`, para oficina o pruebas) que entra sin asociarse a ningún
técnico — en ese caso el campo "Técnico" queda para elegir a mano.

Esta lista se guarda en el mismo repo privado de datos
(`tecnicos.json`), reutilizando las variables de entorno que ya
existen — no hace falta configurar nada nuevo.

Es una validación solo del lado del celular (no hay usuarios ni login
con servidor) — sirve para que no cualquiera que tenga la URL cargue
partes y para saber quién entró, pero no es seguridad fuerte (cualquiera
que abra el código de la página puede ver las contraseñas). Si más
adelante se necesita un login real y protegido, hace falta un backend
con usuarios.

## Técnico interviniente

Es un menú desplegable con los técnicos fijos de SAT, más la opción
"Otro..." que habilita un campo de texto libre. Para agregar o quitar
técnicos de la lista, se edita directamente en `index.html`, buscando
el `<select id="f_tecnico">`.

## Alertas de servicios estancados

En `admin.html` hay un campo opcional más al cargar el listado:
**"Fecha de ingreso"** (cuándo se dio de alta el servicio en el ERP).
Si se mapea esa columna, en el listado de la app cada servicio que
lleva varios días sin resolverse se marca solo:

- 🕒 **3 días o más**: borde naranja, con la etiqueta "Hace X días".
- 🔴 **7 días o más**: borde rojo, etiqueta en rojo — para no perderlo
  de vista.

Los umbrales (3 y 7 días por defecto) se editan desde `admin.html` →
pestaña "Servicios pendientes" → arriba de todo ("Umbrales de servicio
estancado") — no hace falta tocar código. Se guardan en el mismo repo
privado de datos (`config.json`), reutilizando las variables de
entorno que ya existen. Si no se carga la fecha de ingreso de un
servicio, simplemente no aparece ninguna alerta para ese caso (no es
obligatorio).

## Listado de servicios pendientes (precarga de datos)

La app tiene una pantalla de "Servicios pendientes" después del login, que
descarga un listado desde un endpoint propio (`/api/servicios.js`, función
serverless de Vercel) y precarga cliente/dirección/localidad/teléfono/tarea
en el formulario cuando el técnico toca un servicio. Si el servicio tiene
teléfono cargado, aparece un botón de llamada (📞) al lado del campo
Cliente en el formulario.

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

Al tocar una tarea del cronograma, la app intenta encontrar el servicio
pendiente correspondiente (comparando el nombre de cliente mencionado en
la tarea contra el listado de servicios) y abre el formulario ya
precargado con esos datos, igual que si se hubiera elegido directamente
del listado. Si no encuentra una coincidencia, igual abre el formulario
extrayendo cliente/dirección/localidad del texto de la tarea como mejor
esfuerzo (formato esperado: "Servicio: Nombre" en la primera línea,
"Dirección  -  Localidad" en la segunda).

Cuando un parte vinculado a un servicio pendiente se completa y el mail
a la oficina se envía con éxito, ese servicio queda marcado en verde en
el listado (sin desaparecer) hasta que se cargue un listado nuevo desde
`admin.html` o se sincronice de nuevo — así se puede verificar de un
vistazo cuáles ya se resolvieron en el día.

**Se sincroniza solo desde un archivo de Google Drive** cada vez que un
técnico abre esa pantalla — no hace falta subir nada a mano. El formato
esperado es el de siempre: una hoja por día, técnicos en columnas (fila
3), franjas horarias de 30 minutos en filas, y celdas combinadas cuando
una tarea dura más de una franja (se respetan para calcular la duración
real). Funciona tanto si el archivo en Drive es un Excel subido tal cual
como si es una Hoja de cálculo de Google nativa.

Como respaldo por si falla la conexión con Drive en el momento, cada
sincronización exitosa guarda una copia en el repo privado de datos
(`cronograma.json`). También queda disponible la carga manual desde
`admin.html` (pestaña "Cronograma semanal") como alternativa si hiciera
falta.

### Variables de entorno

Reutiliza las que ya existen de la función de fotos
(`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`) y
de servicios pendientes (`SERVICIOS_API_TOKEN`, `GITHUB_DATA_TOKEN`,
`GITHUB_DATA_REPO`). Solo hace falta agregar una nueva:

- `CRONOGRAMA_DRIVE_FOLDER_ID` = el ID de la **carpeta** de Drive donde
  se sube el archivo (la parte de la URL después de `/folders/`, por
  ejemplo en `https://drive.google.com/drive/folders/XYZ456...` el ID
  es `XYZ456...`).

Se usa la carpeta y no un archivo puntual porque el archivo cambia de ID
cada vez que se actualiza (se sube uno nuevo en vez de editarse el
mismo) — la función siempre busca el archivo modificado más reciente
dentro de esa carpeta, así no importa que el ID cambie.

La carpeta (no un archivo individual) tiene que estar compartida con el
email de la cuenta de servicio
(`sat-fotos-uploader@partes-503719.iam.gserviceaccount.com`) con permiso
de **Lector** — no hace falta Editor, solo lectura. Compartiendo la
carpeta entera, cualquier archivo nuevo que se suba ahí queda accesible
automáticamente, sin tener que compartir cada uno.

(Como alternativa, si en algún momento se necesitara apuntar a un
archivo fijo puntual en vez de una carpeta, sigue existiendo la
variable `CRONOGRAMA_DRIVE_FILE_ID` como respaldo — pero no es lo
recomendado dado que el ID cambia con cada actualización.)

## Sugerencia de servicios cercanos al terminar la agenda

Cuando un técnico envía un parte con éxito, la app revisa si ya
completó **todas** las tareas que tenía agendadas para **hoy** en el
cronograma (comparando cada tarea contra el listado de servicios
pendientes, igual que al tocar una tarea del cronograma). Si no le
queda nada agendado para hoy, en la pantalla de "enviado" aparece una
lista con los servicios pendientes más cercanos al que acaba de
terminar — tocando uno, abre el formulario directo con esos datos.

Límites a tener en cuenta:

- Depende de la misma comparación por nombre de cliente que ya usa el
  cronograma — si no encuentra coincidencia para alguna tarea agendada,
  la cuenta puede no cerrar bien (por las dudas, en ese caso prefiere
  no mostrar nada antes que sugerir de más).
- Si el técnico nunca abrió la pantalla del cronograma en la sesión,
  igual funciona — el cronograma se precarga solo al loguearse, en
  segundo plano.
- Usa el mismo geocodificador y caché que el mapa (`/api/geocode.js`),
  así que la primera vez que se prueba con direcciones nuevas puede
  tardar unos segundos.
- Si algo falla (sin conexión, geocodificación, etc.) simplemente no
  aparece ninguna sugerencia — nunca interrumpe el envío del parte.

## Mapa del servicio y servicios cercanos

Desde el formulario hay un botón "📍 Ver en mapa" que muestra la
ubicación de la dirección cargada (Leaflet + OpenStreetMap, sin costo ni
API key), y marca en naranja cualquier otro servicio pendiente a menos
de 500 metros — útil para agrupar visitas cercanas.

Las direcciones se convierten a coordenadas con Nominatim (el
geocodificador gratuito de OpenStreetMap) a través de `/api/geocode.js`,
que guarda cada dirección ya buscada en el repo privado de datos
(`geocode-cache.json`) para no tener que volver a buscarla — así se
respeta el límite de uso gratuito (1 pedido por segundo) y las
consultas repetidas son instantáneas. No hace falta ninguna variable de
entorno nueva: reutiliza `SERVICIOS_API_TOKEN`, `GITHUB_DATA_TOKEN` y
`GITHUB_DATA_REPO` que ya existen.

Si hay muchas direcciones nuevas sin geocodificar todavía (la primera
vez que se cargan muchos servicios de golpe), puede tardar unos segundos
o requerir tocar "Ver en mapa" más de una vez, ya que cada pedido
procesa como máximo 6 direcciones nuevas por vez (para no exceder el
tiempo máximo de ejecución de la función serverless).

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

## Dashboard (para todos los técnicos)

Desde el listado de servicios hay un botón **"📊 Ver dashboard"** con:

- **Pendientes ahora**: servicios cargados que todavía no tienen un
  parte completado asociado (según el historial).
- **Resueltos en el período**: cantidad de partes completados, con
  pestañas para ver por Día / Semana / Mes.
- **Dos gráficos** (Chart.js): resueltos por técnico, y resueltos por
  día a lo largo del período elegido — para una lectura rápida sin
  tener que leer los números uno por uno.
- **Por técnico**: cantidad resuelta, tiempo promedio por servicio, y
  distancia aproximada recorrida en el período. El técnico con más
  servicios resueltos **hoy** (siempre hoy, sin importar la pestaña de
  período elegida) aparece con 🥇, el segundo con 🥈, el tercero con 🥉.
- **Clientes con más de una visita en el mes**: técnicos que volvieron
  al mismo cliente más de una vez en el mes actual, con las fechas
  exactas de cada visita para poder revisar el caso puntual (esto
  siempre se calcula sobre el mes en curso, sin importar qué pestaña de
  período esté elegida arriba).

### Cómo funciona (y sus límites)

- Cada vez que se completa un parte y el mail a la oficina se manda con
  éxito, queda un registro en `/api/historial.js` (guardado en el mismo
  repo privado de datos, archivo `historial.json`). **El historial
  arranca a contar desde que se activó esta función** — no hay datos de
  partes anteriores a esto.
- La **distancia recorrida es una aproximación**: se geocodifican las
  direcciones de los servicios de cada técnico por día, ordenados por
  hora de entrada, y se suma la distancia en línea recta entre paradas
  consecutivas (usando el mismo geocodificador de `/api/geocode.js`,
  con su misma caché). No es una ruta real calculada por calles, así
  que va a ser menor a la distancia que efectivamente se recorre
  manejando.
- El tiempo promedio se calcula a partir de los campos "Hora entrada" y
  "Hora salida" que carga el técnico en cada parte — si algún parte
  quedó con esos campos vacíos o mal cargados, no se cuenta en el
  promedio de ese técnico.
- Cuando un servicio se completa entre dos técnicos (el check de
  "Fueron dos técnicos"), el servicio cuenta completo para **ambos** en
  el dashboard — cada uno suma +1 a su cantidad resuelta, con el mismo
  tiempo y la misma parada para el cálculo de distancia (no se reparte
  a la mitad).

## Dashboard financiero (solo para Sebastian Bartolozzi)

Hay un segundo dashboard, con acceso restringido: el botón "💰 Ver
dashboard financiero" solo aparece si el técnico logueado es
**Sebastian Bartolozzi** (según la contraseña usada para entrar). Como
con el resto de la app, esto es una restricción del lado del celular —
no un permiso real de servidor — pero alcanza para que no lo vea
cualquiera que use la app.

Muestra, con las mismas pestañas Día / Semana / Mes que el otro
dashboard:

- **Servicios pagos** vs. **servicios bonificados** en el período. Un
  servicio se considera "bonificado" cuando su costo final quedó en
  $0 (por el 100% de descuento, o porque el técnico cargó $0 a mano) —
  cualquier costo final mayor a $0 cuenta como pago.
- **Monto total generado** en el período (suma de los costos finales
  de los servicios pagos).
- **Promedio de dinero por servicio pago** (monto total dividido por
  la cantidad de servicios pagos — los bonificados no entran en esta
  cuenta).
- Un gráfico de barras con el monto generado día por día dentro del
  período elegido.

Usa el mismo historial que el otro dashboard (`historial.json`), al que
ahora también se le suman el importe, descuento, costo final y forma de
pago de cada parte completado — por eso, igual que con el otro
dashboard, **solo va a tener datos a partir de que se activó esta
función**, no de partes anteriores.

## Instalación vs. servicio técnico común

Arriba del formulario hay un check **"Es una INSTALACIÓN"**. Si se
tilda:

- Aparece un cartelito "Instalación" (en vez de "Servicio técnico") en
  el encabezado de los dos mails (oficina y cliente).
- En el dashboard general se cuenta por separado: dos tarjetas nuevas
  ("Instalaciones" / "Servicios técnicos") y un gráfico de torta con la
  proporción entre ambos, para el período elegido (Día/Semana/Mes).

## Envío offline con reintento automático

Si al enviar un parte no hay conexión (o el envío falla), la app **no
lo pierde**: lo guarda en el celular y avisa "el parte quedó guardado
y se va a reintentar solo cuando vuelva la conexión". El reintento pasa
solo, sin que el técnico tenga que hacer nada, en estos momentos:

- Apenas el celular recupera la conexión a internet.
- Cada vez que se inicia sesión en la app.
- Con el botón "Reintentar ahora" que aparece en el listado de
  servicios pendientes mientras haya partes en espera.

Los partes pendientes se guardan en el propio celular (`localStorage`)
— si se desinstala la app o se borra el caché del navegador antes de
que se puedan enviar, se pierden. Por eso, si un técnico ve el aviso de
"pendiente de enviar" durante mucho tiempo, conviene asegurarse de que
tenga conexión antes de cerrar la app.

## Catálogo de materiales por categoría (administrable)

En "Materiales utilizados" el técnico elige una **categoría** (ej.
"Sensores infrarrojos"), después un **modelo** dentro de esa categoría,
carga la **cantidad**, y toca "+ Agregar" — se puede agregar varios
materiales distintos a un mismo parte. Debajo sigue habiendo un campo
de texto libre para cualquier otro material que no esté en el
catálogo. Al enviar, se combina todo en un solo campo de texto.

Las categorías y modelos se administran desde `admin.html` → pestaña
"Materiales":

1. La primera vez que entrás ahí (si nunca se guardó nada) aparece
   precargada con categorías de ejemplo — revisala, ajustala a lo que
   realmente usan, y guardá para publicarla.
2. Cada categoría tiene un nombre y una lista de modelos (uno por
   línea en el mismo cuadro de texto).
3. "+ Agregar categoría" para sumar una nueva, la ✕ de cada tarjeta
   para sacar una entera.

Se guarda en el mismo repo privado de datos (`materiales-catalogo.json`),
reutilizando las variables de entorno que ya existen — no hace falta
configurar nada nuevo.

## Aviso "estoy en camino" por WhatsApp

Al lado del botón de llamar (📞) hay un botón verde de WhatsApp (📲),
que también aparece solo si el servicio tiene teléfono cargado. Al
tocarlo, abre WhatsApp con un mensaje ya escrito ("Hola! Soy \<técnico\>,
técnico de SAT... estoy en camino...") — el técnico solo tiene que
tocar "Enviar".

No es un envío 100% automático (usamos un link `wa.me`, no la API de
WhatsApp Business, que tiene costo por mensaje y requiere verificación
de Meta) — pero no tiene ningún costo ni trámite, y solo requiere ese
toque extra.

**Importante sobre el formato del teléfono**: el link arma el número
asumiendo Argentina (agrega `549` adelante si el teléfono no viene ya
con código de país). Si los teléfonos que carga el ERP tienen otro
formato, puede que el link no abra el chat correcto la primera vez —
conviene probarlo con un número real y, si hace falta, ajustar la
función `limpiarTelefonoWhatsapp` en `app.js`.

## Actualizar la app sin desinstalar

En la pantalla de login hay un botón "↻ Actualizar app a la última
versión". Borra toda la caché del navegador y el service worker de la
app, y recarga la página — así siempre se puede forzar a traer la
última versión publicada sin tener que desinstalar y reinstalar el
acceso directo del celular. Después de usarlo, puede tardar un
instante en volver a aparecer la pantalla de login (está bajando todo
de nuevo).

**Aviso de versión nueva disponible**: la app compara su propia versión
(`APP_VERSION` en `app.js`) contra `app_version_actual` en
`/api/config.js` cada vez que se abre el login. Si el servidor tiene un
número mayor, aparece un cartel arriba recomendando actualizar. Esto
funciona incluso si el celular tiene una versión vieja cacheada,
porque la comprobación en sí es un pedido de red que no se cachea.

Para que esto funcione bien, **cada vez que se sube una versión nueva
hay que actualizar los dos lugares**: `APP_VERSION` en `app.js` y
`app_version_actual` (dentro de `CONFIG_DEFAULT`) en `api/config.js` —
tienen que quedar iguales entre sí en cada publicación.

## Acceso directo al panel de administración (solo Sebastian Bartolozzi)

Al loguearse con la contraseña de Sebastian Bartolozzi, en el listado
de servicios aparece un botón "🛠 Panel de administración" que abre
`admin.html` directo (en una pestaña nueva) — sin tener que escribir la
URL a mano. Ese panel sigue teniendo su propia contraseña (la de
`ADMIN_PASSWORD` en `admin.html`), este botón es solo un atajo, no la
reemplaza.

## Consultas a manuales con IA (gratis, con Gemini)

Desde el listado hay un botón "🤖 Consultas (manuales)": el técnico
elige una categoría (ej. "Alarmas"), escribe una pregunta en lenguaje
natural, y la app busca los manuales en PDF de esa categoría (en
Drive) y le pide a una IA (Google Gemini, plan gratuito) que responda
basándose **solo** en el contenido de esos manuales.

### Configuración (una sola vez)

1. **Categorías y carpetas**: en `admin.html` → pestaña "Consultas
   (IA)", cargá cada categoría con el link (o ID) de la carpeta de
   Drive donde están los manuales PDF de esa categoría. Compartí cada
   carpeta con `sat-fotos-uploader@partes-503719.iam.gserviceaccount.com`
   (permiso **Lector**) — la misma cuenta de servicio que ya se usa
   para el cronograma.
2. **Clave de Gemini** (gratis, sin tarjeta): entrá a
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey),
   generá una clave, y cargala en Vercel como variable de entorno
   `GEMINI_API_KEY`.
3. Redeploy del proyecto.

### Cómo funciona y sus límites

- Reutiliza la cuenta de servicio de Google ya configurada — no hace
  falta nada nuevo de ese lado.
- El plan gratis de Gemini permite ~1.500 consultas por día, de sobra
  para un equipo chico de técnicos.
- **Letra chica del plan gratuito de Google**: las consultas pueden
  usarse para entrenar sus modelos (a diferencia de los planes pagos).
  Para manuales técnicos de fabricantes esto normalmente no es un
  problema, pero tenelo en cuenta si algún manual tuviera información
  confidencial.
- Por cada consulta se manda el/los manual(es) PDF completos de esa
  categoría a la IA (hasta un tope de ~12 MB en total por consulta) —
  si una categoría tiene manuales muy pesados o muchos a la vez, puede
  hacer falta separarlos en categorías más específicas.
- La respuesta la genera una IA — **puede equivocarse**, así que se
  aclara en la pantalla que conviene verificar lo importante antes de
  actuar según la respuesta.

## Credencial digital del técnico

Botón "🪪 Credencial" en el panel principal — **solo aparece si el
técnico logueado tiene una credencial cargada** (los que no tienen
todavía, o el login general de oficina, no lo ven). Muestra un carnet
con foto, nombre, cargo, DNI, teléfono de contacto y fecha de vigencia,
para que el técnico lo presente ante el cliente como método extra de
identificación al ingresar a su domicilio.

Se administra desde `admin.html` → pestaña "Credenciales":

1. Por cada técnico: nombre (tiene que coincidir exacto con el usuario
   de la pestaña "Técnicos"), DNI, cargo, teléfono de contacto, fecha
   de vigencia, y una foto — se sube el archivo directo y se comprime
   sola a un tamaño chico (no hace falta subirla ya editada).
2. Guardar cambios.

Cada técnico ve **solo la suya**, nunca las de sus compañeros — se
filtra según con qué usuario entró a la app. No hace falta ninguna
variable de entorno nueva, se guarda en el mismo repo privado de datos
(`credenciales-config.json`).

**Pantalla completa al tocarla**: tocando la credencial, se agranda,
gira 90° (queda apaisada, como un carnet real) y ocupa toda la
pantalla, con los datos en letra más grande — ideal para mostrársela al
cliente. Se intenta también activar el modo pantalla completa real del
navegador (oculta la barra de direcciones) donde el dispositivo lo
permita; en iOS puede que no oculte la barra por completo, pero el giro
y el agrandado funcionan igual. Se vuelve a tocar (la credencial o
afuera, en el fondo oscuro) para salir de ese modo.

## Historial (últimos 4 días)

Botón "📜 Historial" en el panel principal. Muestra, en una lista, los
servicios completados en los últimos 4 días (hoy + los 3 días
anteriores). **Cada técnico ve solo los suyos** (o los que hizo junto a
otro, si participó como segundo técnico) — solo **Sebastian Bartolozzi**
(y el login general de oficina) ven el listado completo de todo el
equipo. Un texto arriba de la lista aclara qué vista está activa. Cada
tarjeta muestra N° de servicio, cliente, dirección, localidad, fecha y
horario de entrada/salida. Usa el mismo historial que ya alimenta los
dashboards (`/api/historial.js`), así que no hace falta ninguna
variable de entorno nueva.

## Guardia técnica rotativa

Botón "🚨 Guardias" en el panel principal. Muestra quién está de
guardia en ese momento (con botón de llamada y de WhatsApp para
contactarlo directo), y los próximos turnos.

La guardia rota **semanalmente, de lunes 9:00 a lunes 9:00**. Se
administra desde `admin.html` → pestaña "Guardias":

1. Cargá el **lunes de arranque de la secuencia** (una fecha real,
   pasada o futura — la app calcula la rotación hacia adelante y hacia
   atrás desde ahí).
2. Agregá los técnicos que hacen guardia, **en el orden en que rotan**
   (con botones ↑/↓ para reordenar), cada uno con su teléfono.
3. Guardá los cambios.

No hace falta ninguna variable de entorno nueva — se guarda en el
mismo repo privado de datos (`guardias-config.json`).

## Foto: cámara o galería, y contraseñas con "ojito"

- El campo de foto del formulario ahora deja elegir entre sacar una
  foto nueva con la cámara o subir una ya existente de la galería —
  antes iba directo a la cámara sin dar la opción.
- Todos los campos de contraseña (login de la app y de `admin.html`)
  tienen un botón de "ojito" (👁) al lado — al tocarlo, muestra la
  contraseña en texto plano para revisar que esté bien escrita; vuelve
  a ocultarse tocándolo de nuevo. Por defecto siempre arranca oculta.

## Límite de funciones serverless (plan Hobby de Vercel)

El plan gratuito de Vercel permite **como máximo 12 funciones
serverless** por proyecto (cada archivo dentro de `/api` cuenta como
una). Ya llegamos a ese límite una vez — por eso varios endpoints
chicos que hacían básicamente lo mismo (leer/guardar un archivo de
configuración) se unificaron en uno solo:

**`/api/datos.js`** — reemplaza a los antiguos `config.js`,
`tecnicos.js`, `materiales-catalogo.js`, `consultas-categorias.js`,
`guardias-config.js` y `credenciales.js`. Se usa con un parámetro
`?coleccion=<nombre>` (`config`, `tecnicos`, `materiales`,
`consultas-categorias`, `guardias`, `credenciales`).

Quedan **8 funciones en total** (`servicios`, `cronograma`, `geocode`,
`historial`, `upload-foto`, `foto`, `consultas`, `datos`) — hay margen
para agregar hasta 4 más antes de volver a toparnos con el límite. Si
hiciera falta una función completamente nueva que no encaje como una
colección más dentro de `datos.js`, revisar primero si conviene sumarla
ahí (agregando una entrada a `COLECCIONES`) en vez de crear un archivo
nuevo en `/api`.

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
- El **historial** para el dashboard (`historial.json`) va a ir
  creciendo con el tiempo — para un uso de varios años podría convenir
  archivarlo o rotarlo periódicamente, aunque para el volumen actual de
  la empresa no debería ser un problema en el corto/mediano plazo.
