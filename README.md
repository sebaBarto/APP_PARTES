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

## Acceso con contraseña (una por técnico)

Cada técnico tiene su propia contraseña, definida en `app.js`:
```js
const TECNICOS_PASSWORDS = {
  "Marcos Torres": "CAMBIAR_CLAVE_MARCOS_TORRES",
  "Cristian Rossetti": "CAMBIAR_CLAVE_CRISTIAN_ROSSETTI",
  "Rodrigo Bertorello": "CAMBIAR_CLAVE_RODRIGO_BERTORELLO",
  "Guillermo Bertorello": "CAMBIAR_CLAVE_GUILLERMO_BERTORELLO",
  "Marcos Pellegrini": "CAMBIAR_CLAVE_MARCOS_PELLEGRINI",
  "Sebastian Bartolozzi": "CAMBIAR_CLAVE_SEBASTIAN_BARTOLOZZI",
  "Alfredo Thiesing": "CAMBIAR_CLAVE_ALFREDO_THIESING",
};
```
Hay que reemplazar cada `CAMBIAR_CLAVE_...` por una contraseña real antes
de publicar. Los nombres tienen que coincidir exacto con las opciones
del selector "Técnico" en `index.html` — si cambiás un nombre en un
lado, cambialo también en el otro.

Cuando un técnico entra con su contraseña, la app **autocompleta el
campo "Técnico"** del formulario con su nombre (se puede corregir a
mano si hiciera falta, por ejemplo si alguien usa el celular de otro
técnico).

También existe una contraseña general de respaldo (`APP_PASSWORD_GENERAL`,
para oficina o pruebas) que entra sin asociarse a ningún técnico — en
ese caso el campo "Técnico" queda para elegir a mano, como antes.

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
