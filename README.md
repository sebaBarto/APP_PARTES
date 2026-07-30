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

**La sesión queda guardada en el celular por 6 horas**, y se renueva
sola cada vez que se abre la app dentro de ese plazo — así no hace
falta escribir la contraseña cada vez que se cierra la app. Si pasan
6 horas seguidas sin abrirla, vuelve a pedir usuario y contraseña. En
el panel principal hay un botón "Cerrar sesión" para salir a mano
(por ejemplo, si varios comparten un mismo celular). El tiempo de la
sesión es la constante `SESION_DURACION_MS` al principio de la sección
de login en `app.js` — se puede ajustar fácil si 6 horas queda corto
o largo.


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

## Servicios resueltos: desaparecen de pendientes y se marcan en el cronograma

Apenas un técnico envía con éxito el parte de un servicio, ese
servicio **desaparece del listado de "Servicios pendientes"** en su
celular — no hace falta esperar a que se actualice el listado del ERP.
Si esa misma tarea está en el **cronograma semanal**, también queda
marcada ahí con un cartel verde "RESUELTO", para que se note de un
vistazo que ya se hizo.

Es una marca **local, por celular** (no se sincroniza entre técnicos)
y dura hasta que se cargue un listado de servicios nuevo desde el
servidor (tocando "↻ Actualizar", o automáticamente al iniciar
sesión) — en ese momento se recalcula todo según los datos reales del
ERP.

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

**Importante**: esta cola es **por celular**, no centralizada — el
aviso solo lo ve la persona en cuyo celular quedó atascado el envío
(no hay forma de verlo desde otro dispositivo). El texto del aviso
muestra de qué técnico y cliente es cada parte pendiente (ej. "1
parte(s) pendiente(s) de enviar — de: Cristian Rossetti (Comercial
Norte SRL)"), para identificarlo de un vistazo si hace falta.

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

## Acceso directo al panel de administración (Sebastian Bartolozzi y Brenda Thiesing)

Al loguearse con la contraseña de Sebastian Bartolozzi o de Brenda
Thiesing, en el panel principal aparece un botón "🛠 Panel de
administración" que abre `admin.html` directo (en una pestaña nueva) —
sin tener que escribir la URL a mano. Ese panel sigue teniendo su
propia contraseña (la de `ADMIN_PASSWORD` en `admin.html`), este botón
es solo un atajo, no la reemplaza. (El dashboard financiero sigue
siendo exclusivo de Sebastian Bartolozzi — este acceso directo al
panel de administración es lo único que también ve Brenda.)

## Consultas a manuales con IA (gratis, con Gemini)

Desde el listado hay un botón "🤖 Consultas (manuales)": el técnico
elige una categoría (ej. "Alarmas"), escribe una pregunta en lenguaje
natural, y la app busca los manuales en PDF de esa categoría (en
Drive) y le pide a una IA (Google Gemini, plan gratuito) que responda
basándose **solo** en el contenido de esos manuales.

**Ver el manual directo**: apenas se elige una categoría, aparece
debajo la lista de manuales en PDF de esa categoría — tocando uno, se
abre en una pestaña nueva del navegador para leerlo completo, sin
pasar por la IA. Reutiliza la misma conexión a Drive (no hace falta
nada nuevo), y el PDF viaja protegido por el mismo token de la app —
no se comparten los archivos públicamente en Drive.

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

**Diseño con más elementos de seguridad visual** (para que no sea tan
fácil de imitar con una captura editada), con una paleta más sobria y
elegante (negro/azul profundo, gris, y un dorado apagado en vez de
naranja vivo):
- Franja superior con efecto "holograma" (degradé animado que combina
  azul profundo, gris y dorado apagado).
- Marca de agua diagonal "SAT" de fondo, apenas visible, detrás de
  todo el contenido.
- Un sello ovalado dorado sobre la foto, y un doble borde (fino dorado
  + grueso negro-azulado) en toda la tarjeta.
- Un "número de serie" arriba a la derecha (tipo `SAT-XXXXXX`), que se
  genera solo a partir del nombre y el DNI — no hace falta cargar
  ningún dato extra en `admin.html`, siempre da el mismo código para la
  misma persona.
- Un **código QR** que al escanearlo lleva a `www.sat365.com.ar`, para
  que el cliente pueda verificar por su cuenta que la empresa existe y
  es la que dice ser. Se genera en el momento con una librería gratuita
  (`qrcodejs`, cargada por CDN en `index.html`), sin ningún servicio
  externo ni costo.

## Nombre de la app, ícono más grande, y saludo personalizado

- La app pasó a llamarse **"Servicio Técnico SAT"** (antes "Parte
  Técnico") — cambiado en el título de la pestaña y en `manifest.json`
  (nombre que se muestra al instalarla en el celular).
- El **ícono de la app** (el que se ve en la pantalla de inicio del
  celular) ahora tiene el logo de SAT bastante más grande — antes
  ocupaba una franja chica en el medio, ahora ocupa la mayor parte del
  ícono, manteniendo el fondo oscuro de siempre.
- En el panel principal, arriba a la derecha, aparece un saludo con el
  nombre de pila del técnico logueado (ej. "Hola, Cristian") — si se
  entró con la clave general de oficina, dice "Hola, Oficina".

## Panel principal con el mismo estilo que el login

Toda la app (no solo el panel principal) usa ahora el mismo fondo azul
oscuro que la pantalla de login, con los botones "Volver"/"Actualizar"
en texto claro para verse bien sobre ese fondo. Las tarjetas que ya
tenían fondo blanco propio (servicios, cronograma, dashboards,
historial, credencial, guardias, etc.) se dejaron igual — se ven como
tarjetas claras flotando sobre el fondo oscuro. El panel principal
además tiene el logo de SAT arriba de todo.

## Notificaciones push (avisos aunque la app esté cerrada)

Hay tres avisos que le llegan a **todo el equipo**, incluso con la app
cerrada (como cualquier notificación de celular):

1. **Cambio de guardia**: todos los lunes, avisa quién toma la guardia
   esa semana.
2. **Evento en un vehículo**: apenas un técnico marca un evento
   (accidente, falla mecánica, anomalía) al devolver un vehículo.
3. **Mantenimiento de vehículos**: cuando alguno se acerca o pasa un
   umbral configurado (cambio de aceite, VTV, etc.) — solo avisa la
   primera vez que entra en ese estado, no todos los días.

### Activarlas (cada técnico, una vez)

En el panel principal hay un botón "🔔 Activar notificaciones" — al
tocarlo, el celular va a pedir permiso una sola vez. Cada uno lo activa
en su propio teléfono.

### Configuración (una sola vez, de tu lado)

Hace falta cargar **tres variables de entorno nuevas en Vercel**:

| Variable | Valor |
|---|---|
| `VAPID_PUBLIC_KEY` | `BHqngzDxmtV7PiUQO0zMKMaysybsccUB1ibD6UK7Kj2G0EICqt6ET-4RFV9mBU4PSxD10I6krHzrIFB2Ndxq_60` |
| `VAPID_PRIVATE_KEY` | `yflpkyfuCwhh_N9nW-GDuehhw4gTZzjX1l-L1mV6srI` |
| `CRON_SECRET` | `8051bd14886db539252c20216e0f9200f6489ce411b20c99` |

(`VAPID_SUBJECT` es opcional — si no se carga, usa
`mailto:soporte@sat365.com.ar` por defecto.)

Después de cargarlas, hacé un **redeploy**. Vercel va a registrar solo
el cron diario (`vercel.json`) que corre una vez por día (plan
gratuito) y agrega automáticamente el header de autorización con
`CRON_SECRET` — no hay que hacer nada más para que ande.

### Cómo funciona por dentro

- Usa el estándar **Web Push** (gratis, sin servicios de terceros) con
  una librería llamada `web-push` del lado del servidor.
- Cada celular que activa las notificaciones queda guardado en
  `push-subscripciones.json` (en el repo privado de datos) — se agrega
  sin borrar las de los demás.
- El aviso de evento de vehículo se manda al toque, apenas se guarda el
  registro de devolución.
- El cron diario (`/api/cron-diario.js`) corre una vez por día, revisa
  si es lunes (avisa la guardia) y si algún vehículo cruzó un umbral
  nuevo (guarda el último estado avisado en
  `notificaciones-estado.json`, para no repetir el mismo aviso todos
  los días).
- **Límite del plan gratuito de Vercel**: el cron corre una vez por
  día, en algún momento dentro de la hora programada (no exacto al
  minuto) — para esto no hace falta precisión exacta, así que no es un
  problema.

## SIMs de los técnicos

**Instalar una SIM desde el propio formulario del parte**: en la
sección de materiales del formulario, si el técnico logueado tiene
alguna SIM en stock, aparece un check "Instalé una SIM de mi stock en
este servicio" — al tildarlo, elige cuál (de las que tiene en stock)
en un desplegable. Al enviarse el parte con éxito, esa SIM sale sola
del stock del técnico y queda asignada al cliente del servicio (igual
que si la hubiera marcado como "usada" desde la pantalla de SIMs) —
queda registrado en `sims-historial.json`, y también se agrega un
renglón en el campo de materiales del parte ("SIM Movistar Estándar
341...").

Si el login de oficina/general carga el parte (sin stock propio), o el
técnico no tiene ninguna SIM en stock, esta opción directamente no
aparece.

Botón "📶 SIMs" en el panel principal. Cada técnico tiene un stock de
chips (Movistar Estándar/Mini, Personal, Claro), identificados por
número de teléfono.

**Visibilidad en la app**: cada técnico ve **solo las suyas** en el
listado principal. Sebastian Bartolozzi, Brenda Thiesing, y el login
general de oficina siguen viendo las de **todo el equipo**, agrupadas
por técnico dueño (las propias primero). El buscador de arriba de la
lista ("qué línea tiene un cliente") es la única excepción — busca
siempre entre las de **todo el equipo**, sin importar quién esté
logueado, para poder coordinar aunque el listado principal esté
restringido.

Tocando una SIM que es tuya:

- Si está en stock, podés **marcarla como usada**: elegís el cliente
  de la lista de servicios pendientes, o escribís uno a mano con
  "Otro (escribir)".
  - **Si ese cliente ya tiene otra línea asociada**, la app avisa
    ("Este cliente ya tiene la línea N° XXXX de [compañía]...") y deja
    elegir: **reemplazarla** (la línea vieja vuelve sola a tu stock, y
    la nueva queda instalada en el cliente) o **agregarla como segunda
    línea** (queda usada junto con la otra, sin tocarla).
- Si está en uso, podés **devolverla a stock**.
- En cualquier estado, podés **transferírsela a otro técnico, o
  devolverla al stock general de oficina** ("Oficina" aparece como una
  opción más en el selector de transferencia) — pasa a quedar en stock,
  sin dueño técnico, hasta que alguien la tome desde `admin.html`.

Las SIMs de otros técnicos (cuando se ven, según lo de arriba) no se
pueden tocar — solo actúa quien la tiene en ese momento.

**Administración — tabla completa**: en `admin.html` → pestaña "SIMs"
hay una sola tabla con **todas** las líneas (de todos los técnicos y
las que están en "Oficina"), con un buscador arriba (número, cliente,
empresa o técnico). Cada fila tiene:

- Los campos editables de siempre (número, empresa, tipo, estado,
  cliente) — los cambios ahí se guardan recién al tocar "Guardar
  cambios", como antes.
- Una columna **"Transferir a"** con un selector (cualquier técnico, o
  "Oficina") y un botón "Transferir" — este botón actúa **al toque**,
  sin esperar a "Guardar cambios", igual que cuando lo hace un técnico
  desde la app. Sirve para pasarle una línea a alguien, o traerla de
  vuelta al stock de oficina, directamente desde la planilla.
  - Si la fila es una que recién se agregó o vino de un Excel sin
    guardar todavía, el botón "Transferir" solo actualiza la fila en
    pantalla (no hay nada que mover en el servidor hasta que se
    guarde) — queda avisado en el mensaje de estado.

Cada movimiento hecho desde la app o desde esta tabla (usar, devolver,
transferir) queda en un historial aparte (`sims-historial.json`),
igual que con los vehículos. No hace falta ninguna variable de entorno
nueva.

**Excel de SIMs**: mismos botones de siempre, con las columnas que
pediste — **"NUMERO DE LINEA"**, **"EMPRESA PROVEEDORA"**, **"ASIGNADO
A"** (nombre de un técnico, o "Oficina" para stock general), más Tipo,
Estado y Cliente si hace falta. Al subir un archivo, reemplaza toda la
tabla (después hay que tocar "Guardar cambios" para publicarlo). Todo
pasa en el navegador, con SheetJS — no hace falta ningún servidor ni
variable de entorno nueva.

**Buscar qué línea tiene un cliente**: en la pantalla "SIMs" de la
app, arriba de la lista hay un buscador — escribiendo el nombre de un
cliente, muestra qué SIM(s) tiene asociadas (número, compañía, y qué
técnico la tiene), sin importar de qué técnico sea ni de las
restricciones de visibilidad de arriba. Si el campo de búsqueda está
vacío, vuelve a la vista normal (agrupada por técnico, o solo la
propia según quién esté logueado).

**Revertir una transferencia por error**: si transferís una SIM y te
equivocaste (o el que la recibe se dio cuenta de que no correspondía),
en el detalle de esa SIM aparece un botón "↩ Revertir a [nombre]" que
la manda directo de vuelta a quien te la dio — la app recuerda quién
fue el último en transferírtela.

**Dashboard de SIMs**: dentro de "📊 Dashboards" hay una cuarta opción,
"Dashboard de SIMs", con todos los movimientos (usar, devolver,
transferir, reemplazar) — arranca mostrando el último mes, con
pestañas de Día/Semana/Mes/Todo igual que los demás dashboards, y su
propio botón de descarga a Excel (mismo criterio de acceso restringido
a Sebastian Bartolozzi y oficina).

**Gráficos de torta por compañía**: arriba de la lista de movimientos
hay un gráfico general (Movistar/Personal/Claro, todo el equipo) y uno
más por cada técnico que tuvo movimientos en el período elegido —
todos se recalculan solos al cambiar de pestaña de período. Solo
cuentan como "uso" las SIMs que se instalaron en un cliente (usar y
reemplazar) — transferir y devolver son movimientos de stock, no se
grafican como uso.

**Blanquear el historial**: botón "🗑 Blanquear historial de
movimientos" — borra **todo** el historial de movimientos (usar,
devolver, transferir, reemplazar) de forma permanente, pidiendo
confirmación antes. No toca qué SIM tiene cada técnico ahora mismo,
solo el historial que alimenta este dashboard. Solo lo ven **Sebastian
Bartolozzi, Brenda Thiesing, y el login general de oficina** — para
que funcione, Brenda tiene que estar cargada en `admin.html` → pestaña
"Técnicos" con el nombre exacto "Brenda Thiesing".

## Recordatorio de vehículo en el primer parte del día

Cuando un técnico envía con éxito el **primer** parte del día (no
tenía ningún otro registrado hoy en el historial), la app revisa si
tiene algún vehículo de la empresa tomado en ese momento. Si no
figura ninguno, en la pantalla de "enviado" aparece un aviso:
"¿No tomaste un vehículo hoy?", con dos opciones:

- **"Sí, es correcto — no uso vehículo"**: lo cierra y sigue normal
  (por ejemplo, porque ese día no le tocó salir con un vehículo de la
  empresa).
- **"Tomar un vehículo ahora"**: lleva directo a la pantalla de
  Vehículos para elegir uno y marcarlo como tomado.

No deja seguir sin elegir una de las dos opciones. Se basa en el
técnico que quedó cargado en el parte (no en quién inició sesión), y
en el registro de "tomar/devolver" vehículos que ya existía — no hace
falta ninguna variable de entorno nueva.

## Vehículos de la empresa

Botón "🚗 Vehículos" en el panel principal, con la flota que se cargue
en `admin.html` (arranca con 3: Renault Kangoo Blanca, Renault Kangoo
Gris, Moto — pero **se pueden agregar, editar o borrar** libremente
desde ahí, no están fijos en el código). Cada uno muestra si está libre
o en uso (por quién y desde qué hora). Al entrar a uno:

- Si está libre, el técnico puede **tomarlo** (carga la hora, se
  autocompleta con la hora actual pero se puede cambiar).
- Si lo tiene tomado el propio técnico, puede **devolverlo**: hora de
  devolución, kilómetros con los que lo entrega, y si hubo algún evento
  particular (accidente, falla mecánica, anomalía, u otro con detalle
  libre). Al devolverlo, el kilometraje actual del vehículo se
  actualiza solo.
- Si lo tiene otro técnico, se avisa quién y desde cuándo, sin dejar
  tomarlo hasta que lo devuelva (para no pisarse).

**Registrar un evento sin devolver el vehículo**: mientras lo tengas
tomado, además de poder devolverlo, aparece una sección aparte
"Registrar un evento sin devolver el vehículo" — sirve para anotar una
carga de combustible, una parada en la gomería, en el mecánico, o en
el lavadero, sin cortar el uso del vehículo. Se carga el tipo de
evento, el kilometraje actual (obligatorio — también actualiza el
kilometraje del vehículo, igual que al devolverlo), el monto del
ticket (opcional), y un detalle opcional. Queda registrado en el mismo
historial que las tomas/devoluciones (`vehiculos-historial.json`), y
se ve tanto en el Dashboard de vehículos como en su descarga a Excel.
Al registrarlo, aparece un aviso confirmando ("Evento registrado:
[tipo].") y vuelve solo a la pantalla de selección de vehículos.

**Administrar la flota**: en `admin.html` → pestaña "Vehículos":
- "+ Agregar vehículo" para sumar uno nuevo (nombre y kilometraje
  inicial).
- El nombre de cada vehículo es un campo editable — se puede renombrar
  ahí mismo.
- La ✕ de cada tarjeta borra ese vehículo entero.
- "Guardar cambios" para publicar.

⚠️ Ojo con renombrar un vehículo que en ese momento esté "tomado" por
un técnico — el historial de uso queda ligado al nombre que tenía en
el momento de tomarlo, así que renombrarlo a mitad de un uso activo
puede generar confusión (mejor esperar a que esté libre).

**Alertas de mantenimiento**: se carga el kilometraje actual de cada
vehículo y se pueden agregar **umbrales configurables** (cualquier
cantidad, no solo los ejemplos de arranque) — cada uno con nombre, tipo
(kilómetros o fecha), el valor límite, y con cuánta anticipación avisar
(km o días antes). Ejemplos: "Cambio de aceite" a los 50.000 km
avisando 1.000 km antes, "VTV" con fecha límite avisando 30 días antes,
etc. Cuando se entra al detalle de un vehículo en la app, si algún
umbral está cerca o vencido, aparece un aviso destacado (naranja si se
acerca, rojo si ya se pasó).

No hace falta ninguna variable de entorno nueva — reutiliza las que ya
existen. Se guarda en `vehiculos-config.json` (configuración y km
actual) y `vehiculos-historial.json` (registro de cada toma/devolución),
en el mismo repo privado de datos.

## Descarga a Excel de los dashboards (restringida)

Los **tres dashboards** (general, financiero y de vehículos) tienen un
botón "⬇ Descargar Excel del período" que arma un `.xlsx` al vuelo del
lado del navegador (con SheetJS) — no hace falta ningún servidor ni
variable de entorno nueva.

- **Respeta el período elegido**: cada dashboard ya tenía (o ahora
  tiene) pestañas de Día/Semana/Mes — el de vehículos sumó esas mismas
  pestañas, más una opción "Todo". El Excel siempre exporta lo mismo
  que se está viendo en pantalla en ese momento, así que para elegir el
  período alcanza con tocar la pestaña correspondiente antes de
  descargar.
- **Acceso restringido**: el botón de descarga **solo lo ven Sebastian
  Bartolozzi y el login general de oficina** — el resto de los
  técnicos puede seguir viendo los dashboards con normalidad, pero no
  descargarlos. (El dashboard financiero entero ya era exclusivo de
  esos dos usuarios; ahora la descarga del general y del de vehículos
  quedó con el mismo criterio.)
- El filtro de vehículo en el dashboard de vehículos ahora se arma
  solo con la lista real cargada en `admin.html` (antes tenía los 3
  nombres fijos de memoria, lo cual se desactualizaba si se
  agregaba/renombraba un vehículo).

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

- El campo de foto del formulario tiene **dos botones separados**:
  "📷 Tomar foto" (abre la cámara directo) y "🖼 Elegir de galería"
  (abre el selector de archivos existentes) — así queda explícito y no
  depende de que el navegador/celular decida mostrar ambas opciones en
  un único selector (que no siempre pasa según el dispositivo).
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
`consultas-categorias`, `guardias`, `credenciales`, `vehiculos`,
`push-subscripciones`, `sims`).

Quedan **11 funciones en total** (`servicios`, `cronograma`, `geocode`,
`historial`, `upload-foto`, `foto`, `consultas`, `datos`,
`vehiculo-uso`, `cron-diario`, `sim-uso`) — con margen para **una sola
función más** antes de llegar al límite. La próxima vez que haga falta
un endpoint nuevo, hay que sumarlo como colección dentro de
`datos.js` si es posible (no como archivo nuevo en `/api`), salvo que
necesite lógica propia como `vehiculo-uso.js` o `sim-uso.js`.

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
