# Parte Técnico — App

PWA (app web instalable) para que el técnico cargue el parte de servicio
directamente en el celular, el cliente firme en pantalla, y se envíen
copias por mail a la oficina y al cliente.

## Cómo funciona

1. El técnico completa el formulario con los datos del servicio.
2. El cliente firma con el dedo en la pantalla, confirmando conformidad.
3. Al confirmar, la app genera un **ID único** para el parte (ej.
   `SAT-20260723-143205-482`) y envía por mail, por SMTP directo desde
   la casilla propia de la empresa:
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



## Envío de mails por SMTP propio (reemplaza a EmailJS)

Hasta la v3.5.3 los mails los mandaba EmailJS — se dejó de usar porque
el plan tiene un límite mensual de envíos, y al mandar **2 mails por
cada parte** (oficina + cliente) se llenaba rápido. Ahora los manda
directo la app, por SMTP, usando una casilla propia de la empresa
(`serviciotecnico@sat365.com.ar`, alojada en DonWeb) — sin límite de
un tercero.

### Configuración (una sola vez)

Cargar estas variables de entorno en Vercel (Project Settings →
Environment Variables), y hacer un **redeploy** después:

| Variable | Valor |
|---|---|
| `SMTP_HOST` | El servidor de correo saliente de tu cuenta (lo ves en DonWeb → tu casilla → "Correo Saliente" → Servidor; para SAT es `ai000077.ferozo.com`) |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | La casilla que manda los mails (`serviciotecnico@sat365.com.ar`) |
| `SMTP_PASS` | La contraseña de esa casilla |
| `OFICINA_EMAIL` | A qué mail fija llega SIEMPRE la copia de "oficina" de cada parte |

No hace falta tocar nada más — `/api/enviar-mail.js` ya tiene las
plantillas de oficina y de cliente incorporadas (mismo diseño que
tenían en EmailJS), y `app.js` ya llama a este endpoint en vez de
EmailJS.

### Bug importante corregido: importar stock ya no borra lo existente (v3.12.1)

La importación de Excel del **stock** (pestaña "SIMs", no la de
"SIMs instaladas") tenía un bug serio: subir una planilla
**reemplazaba toda la tabla**, incluidas las SIMs que los técnicos ya
tenían asignadas — si se guardaba así, se perdían esas asignaciones.
Ahora la importación se **mezcla** con lo que ya está cargado (por
número de línea): si el número ya existía, se actualiza; si es
nuevo, se agrega — nunca borra nada. También se sumó la columna
`EMPRESA` (además de `EMPRESA PROVEEDORA`) al reconocimiento de
encabezados, y se normaliza a Mayúscula inicial (Movistar/Personal/
Claro) para que quede igual que el resto de la app.

### Ficha completa al escribir a mano (v3.13.1)

En "📋 Instalar en cliente" → "Otro (escribir todo a mano)", ahora se
puede cargar, además del nombre del cliente, el **N° de abonado** y
la **dirección** — así la línea queda con la ficha completa en el
registro de instaladas desde el momento en que se carga, igual que
las que vinieron de la planilla original. Elegir un servicio
pendiente de la lista sigue autocompletando cliente y dirección (el
N° de abonado no, porque los servicios no tienen ese dato) — y todo
queda editable por si hace falta ajustar algo antes de confirmar.

### Las claves ahora quedan guardadas aunque se salga de la pantalla (v3.15.2)

Las claves cargadas vivían solo en la memoria de la página — si el técnico las cargaba, salía
de la pantalla, y la app se cerraba o el celular la mataba en segundo plano (algo común en
Android), se perdían. Ahora se guardan en el mismo borrador que ya usa el resto del parte: se
puede abrir "Claves" en cualquier momento del servicio, cargar algo, salir, y va a seguir ahí
hasta que se envíe el parte — se probó cargando **solo** una clave (sin tocar ningún otro campo
del formulario) y confirmando que igual se guarda y se restaura completa al reabrir el mismo
servicio. De paso se corrigió el mismo hueco para el número de presupuesto (opción "Por
presupuesto"), que tenía el mismo problema.

### Tres regresiones corregidas tras el cambio a SVG (v3.19.1)

Encontradas revisando la app con más cuidado (dos eran mías, del cambio anterior; una ya
estaba desde antes):

- **El "golpe de vista" del listado de servicios se había perdido**: el punto rojo/reloj
  que reemplazó al emoji quedó demasiado chico y sutil para escanear la lista rápido. Se
  agrandaron los íconos, y el caso urgente ahora tiene **fondo rojo sólido** en vez de
  blanco con texto rojo — mucho más notorio, como el emoji original.
- **Las medallas del ranking semanal perdieron su distinción de color** — la numeración
  1°/2°/3° que las reemplazó usaba el mismo color ámbar para las tres. Ahora cada una
  tiene su propio color (oro/plata/bronce).
- **Botones como "Retirar" (SIMs instaladas) y "Ver" (Planos) casi no se veían** — esto no
  era del cambio de emojis, sino un bug de fondo: usaban un estilo de botón pensado para
  fondo oscuro (texto casi blanco) dentro de una tarjeta blanca, quedando el texto casi
  invisible. Se armó una variante para ese caso y se aplicó en los 4 botones que tenían el
  mismo problema.

## Colores por sección en admin.html, coherentes con la app del técnico (v3.28.0)

Las 12 pestañas de `admin.html` tenían todos los íconos del mismo gris uniforme —
funcional, pero hacía que el panel se sintiera un producto aparte de la app del técnico
(que sí usa un color distinto por sección desde el panel principal). Ahora cada pestaña
usa el mismo color que su tile equivalente allá (Guardias=el mismo azul acero nuevo,
SIMs=azul, Vehículos=verde, Planos=navy, Emergencias=rojo, etc.), más dos colores nuevos
para las dos secciones sin equivalente directo (Técnicos, Clientes). Ayuda a ubicarse más
rápido por color, y las dos pantallas se sienten parte del mismo producto.

De paso, mientras revisaba el dashboard general, encontré un detalle de robustez (no
visual): si el gráfico de la parte de abajo falla por cualquier motivo, el mensaje de
error que se muestra dice "no se pudo cargar el historial" — aunque el historial sí se
haya cargado bien y el problema sea solo del gráfico. Queda anotado para una próxima
pasada, no es algo urgente.

## Auditoría visual puntual (v3.27.0)

Pedido de revisar el frontend con criterio de diseño y mejorar lo que valiera la pena,
sin rehacer nada de raíz (la identidad de la app — navy + ámbar, etiquetas tipo
"eyebrow" — ya es distintiva, no había que cambiarla). Encontré y corregí 4 cosas
puntuales, mostrando capturas antes de tocar nada:

1. **Guardias y Emergencia compartían el mismo rojo** en el panel principal — se podían
   confundir a simple vista siendo funciones bien distintas. Guardias pasó a un azul
   acero nuevo, dejando el rojo exclusivo para lo urgente.
2. **La línea de "Cobrador" en el formulario se veía como un campo bloqueado** (misma
   caja gris que un input deshabilitado) — ahora es una nota en cursiva, sin caja, que
   se lee claramente como información y no como algo editable.
3. **"Sin cobrador asignado" se repetía en cada tarjeta que no tenía uno** — ahora esa
   línea directamente no aparece cuando no hay cobrador cargado, reduciendo el ruido.
4. **"Continuar a la firma" y "Volver" se veían con un peso visual muy parecido** — no
   hacía falta un relleno sólido (ningún botón de la app lo usa, hubiera roto la
   consistencia); en cambio, se le bajó el protagonismo a los botones secundarios en
   general (borde y texto más discretos), así el primario resalta más por comparación.

## Permiso "Ver y operar todas las SIMs" (v3.26.0)

Nuevo permiso configurable por técnico, independiente de ser administrador: quien lo
tenga ve, dentro de la app (no solo desde `admin.html`), el listado completo de SIMs de
todo el equipo — agrupado por técnico dueño — y puede operar cualquiera (transferir,
instalar, retirar) igual que si fuera propia. Sin este permiso, todo sigue exactamente
igual que antes (cada uno ve solo lo suyo).

La verificación real vive del lado del servidor (consultando la base de técnicos, nunca
confiando en lo que mande el celular). De paso, encontré y corregí un bug real: al
transferir una SIM ajena, el dato de "de quién era antes" (que usa el botón de revertir
por error) se guardaba mal — quedaba el nombre de quien hacía la transferencia en vez del
dueño real anterior.

Probado a fondo en los tres niveles: listado (con y sin permiso), detalle de una SIM
ajena (queda operable, no de solo lectura), y el servidor (rechaza sin permiso, acepta
con permiso, y guarda bien el dueño anterior).

## Diseño adaptativo: compu vs. celular (v3.25.0)

Las dos pantallas (la app del técnico y `admin.html`) estaban fijadas a un ancho angosto
pensado para simular un celular incluso en una computadora — por eso se veían con mucho
espacio vacío a los costados en un monitor grande. Se agregaron reglas de CSS que solo se
activan a partir de cierto ancho de pantalla (celular no se ve afectado en absoluto):

- **App del técnico**: en compu, queda enmarcada con más ancho, esquinas redondeadas y
  sombra — se ve como una app de verdad centrada en la pantalla, no estirada al 100%
  (un formulario angosto estirado a un monitor de 27" se vuelve difícil de leer).
- **`admin.html`**: en compu, se ensancha bastante más (hasta 1100px) — tiene sentido
  dado que hay tablas con varias columnas que se benefician del espacio extra.

De paso, se corrigió un detalle cosmético menor que se notó al agregar el marco: el aviso
tipo "toast" (mensajes flotantes) se ocultaba solo moviéndolo fuera de la pantalla, y en
ciertos casos dejaba asomar un borde — ahora también se oculta por opacidad, así queda
invisible de verdad sin importar su tamaño exacto.

Confirmado con capturas en celular (412px) y compu (1440px): el celular quedó
pixel-por-pixel igual que antes, y la compu ahora aprovecha el espacio sin verse roto ni
estirado de forma rara.

## Último servicio del cliente: ícono + ventana emergente (v3.24.0)

Encontré que la lógica y el dato ya existían (`mostrarVisitaAnterior()`), solo se
mostraban como un texto fijo, siempre visible en la pantalla principal. Se cambió la
presentación nada más: ahora es un ícono ⓘ chico junto al campo "Cliente" — gris y
deshabilitado si el cliente no tiene servicios anteriores, o habilitado si sí — que al
tocarlo abre una ventana chica con los 3 datos pedidos: qué se hizo, fecha, y qué técnico
lo hizo (siempre el más reciente, si hay varios). Ya no ocupa espacio permanente en la
pantalla.

## Cobrador asignado, visible en el servicio (v3.23.0)

El nombre del cobrador ahora viaja como una columna más (opcional) del Excel de servicios
pendientes — no hace falta ninguna tabla nueva, se carga junto con el resto igual que
número de cliente o de abonado. Se ve en dos lugares, como se pidió:
- En la tarjeta del servicio, antes de tomarlo.
- En la pantalla de trabajo, una vez cargado.

Si no hay cobrador cargado para ese servicio, se muestra "Sin cobrador asignado" en vez de
dejarlo vacío. Probado en los cuatro casos: con cobrador, sin cobrador, servicio cargado
desde la lista, y reporte manual (sin servicio de por medio).

## Caché vieja del celular + 16 íconos invisibles (v3.22.1)

Dos problemas reales encontrados después de un aviso tuyo de que no veías cambios
recientes:

1. **El Service Worker (la parte de la app que la hace funcionar sin internet) tenía un
   número de versión de caché que nunca subí** a lo largo de toda esta sesión, a pesar de
   muchísimos cambios — tu celular seguía mostrando una copia guardada de antes. Ya está
   subido; puede hacer falta cerrar y volver a abrir la app (o borrar los datos de sitio
   del navegador) una vez para que se note el cambio.
2. **16 íconos quedaban invisibles de verdad** (no era solo el caché) — al reemplazar los
   emojis por SVG, a la mayoría les faltó definir el color del trazo, y sin eso un ícono
   de "solo línea" no se ve. Se agregó una regla general que le pone color a cualquier
   ícono de este estilo que no lo tenga definido puntualmente — soluciona los 16 actuales
   y previene que vuelva a pasar con íconos futuros.

**Sobre los colores de "servicio estancado"**: si después de una recarga a fondo seguís
sin verlos, revisá que al importar el Excel de servicios pendientes se haya mapeado la
columna de fecha de ingreso — hoy ese campo es opcional en el mapeo, así que si no se
elige ninguna columna para él, ningún servicio va a tener colores (van a quedar todos
iguales, que es justo lo que describiste).

## Mail automático a Security 24 por cambio de guardia (v3.22.0)

Cuando corresponde un cambio de guardia semanal (los lunes, calculado automáticamente
desde la secuencia configurada en `admin.html`), además del aviso push que ya existía,
ahora también se manda un mail a `actualizaciondedatos@security24.com.ar` con el nombre
del técnico de guardia y el rango exacto (desde/hasta, siempre lunes 9:00 a lunes 9:00).

Un bug real que encontré y corregí en el camino: el cálculo de "9:00" mostraba "6:00" al
principio — la función que calcula la hora argentina ya hace un ajuste interno de -3
horas, y mi código lo volvía a aplicar una segunda vez sin darme cuenta. Quedó probado de
punta a punta (forzando que el sistema piense que es lunes) que ahora muestra la hora
correcta tanto en el "desde" como en el "hasta".

Si el mail falla por algún motivo, no frena el aviso push — son dos avisos
independientes.

## Estado de SIMs instaladas: activa/inactiva, editable desde el listado (v3.21.0)

En el listado de "SIMs instaladas" de `admin.html`, el estado (que ya existía como dato,
cargado desde el Excel) pasó de ser texto fijo a un botón — verde "Activa" / rojo
"Inactiva" — que al tocarlo cambia el estado, lo guarda, y actualiza la lista al instante,
sin salir de la pantalla ni recargar nada. No hizo falta agregar ningún campo nuevo a la
base de datos, el dato ya estaba, solo no se podía editar.

## Número de cliente: conecta servicios, planos y SIMs (v3.20.0)

Nueva forma de identificar cada dirección de servicio de manera confiable — un número de
cliente identifica un **sitio puntual** (una empresa con varias sucursales tiene un número
distinto por cada una), en vez de depender de buscar por nombre (que puede tener errores
de tipeo, mayúsculas distintas, etc.).

- **Nueva pestaña "Clientes" en `admin.html`**: importar/actualizar por Excel (número de
  cliente, nombre, dirección, localidad, teléfono, número de abonado), y buscador.
- **El Excel de servicios pendientes** ahora puede traer, de forma opcional, las columnas
  de número de cliente y número de abonado (mapeables como el resto de las columnas).
- **En la pantalla de trabajo del técnico**: si el servicio abierto trae un número de
  cliente, aparece un botón junto a "Llamar"/"WhatsApp" para **ver el plano de ese cliente
  directo**, sin tener que buscarlo a mano — el número de cliente coincide exactamente con
  el nombre del archivo (`CLI_XXXXXX.pdf`).

Probado de punta a punta: la importación de clientes arma bien cada fila, la búsqueda
filtra correcto, el botón de plano queda oculto cuando el servicio no trae número de
cliente y aparece cuando sí, y al tocarlo pide exactamente el archivo correcto.

## Emojis reemplazados por íconos SVG (v3.19.0)

Revisión completa de los tres archivos principales (`index.html`, `app.js`, `admin.html`)
para reemplazar los emojis usados como íconos por SVG propios — más consistentes entre
celulares (los emojis se ven distinto en cada marca/sistema operativo).

- **`admin.html`** no había recibido esta pasada todavía — los 12 íconos de pestañas ahora
  son SVG (reusando, donde coincidían, los mismos íconos que ya tenía la app del técnico,
  para que ambas pantallas se vean coherentes entre sí), más el botón de mostrar/ocultar
  contraseña.
- **`index.html`**: búsqueda, notificaciones, llamar/WhatsApp, ver en mapa, foto,
  galería, y varios botones más.
- **Botones que cambian de texto dinámicamente** (Claves, Notificaciones, Emergencia) —
  estos necesitaron un cambio más de fondo (de `textContent` a `innerHTML`) para poder
  mostrar un ícono real en vez de un emoji.
- Las medallas 🥇🥈🥉 del ranking semanal se reemplazaron por una numeración (1°/2°/3°) en
  una etiqueta, más consistente con el estilo monocromático del resto de los íconos que
  forzar un emoji de medalla que no pega con ese estilo.
- Los emojis que vivían **adentro de mensajes de texto plano** (avisos tipo toast) se
  sacaron directamente — técnicamente no pueden mostrar un ícono real ahí (esos mensajes
  son texto, no HTML), así que la única opción real era dejar el texto solo.
- Quedan afuera de este cambio símbolos simples como ✕ (quitar) y ✓ (confirmado), que ya
  se ven igual en cualquier lado — no son el tipo de emoji colorido que generaba
  inconsistencia entre celulares.

## Agenda de servicios de emergencia, fuera de horario (v3.18.0)

Nuevo permiso configurable por técnico: **"Agendar servicios de emergencia"** (arranca apagado
para todos — hay que activarlo puntualmente desde `admin.html` → Técnicos para quien
corresponda). Con ese permiso activo, aparece un nuevo tile **"🚨 Emergencia"** en el panel
principal, pensado para cargar un servicio cuando no se puede acceder al sistema real de
oficina (fin de semana, fuera de horario): cliente, dirección, teléfono, motivo, fecha y hora
deseada.

Al cargar uno, **se le avisa por notificación push a todo el equipo** — se probó que esto pase
solo cuando es una entrada genuinamente nueva (no se reenvía el aviso al simplemente marcar una
como resuelta).

**Dónde se revisan después** (para pasarlos al sistema real):
- Dentro de la pantalla de Cronograma de la app, para que cualquiera que consulte la semana
  también vea lo que se cargó así.
- En `admin.html`, nueva pestaña "🚨 Emergencias" — lista completa, con botón para marcar cada
  uno como "ya pasado" (o volver a marcarlo como pendiente si hizo falta), y para borrarlo si
  ya no corresponde.

Se probó a fondo: el permiso oculta/muestra el tile correctamente, el formulario rechaza
guardar si falta algún dato clave, marcar como revisado no vuelve a disparar el aviso push, y
las acciones de marcar/reabrir/borrar desde `admin.html` actualizan bien la lista.

## Planos de cableado, con almacenamiento en Cloudflare R2 (v3.17.0)

Nueva sección **"📐 Planos"** en la app del técnico: buscá por nombre de cliente y abrí el PDF
del plano/croquis de cableado directo desde el celular (se abre en una pestaña nueva, para
poder hacer zoom con los gestos normales).

### Dónde se guardan, y por qué

Con ~1000 archivos livianos (~450 MB en total) y creciendo, un repositorio de Git **no** es un
buen lugar para guardarlos — cada vez que se reemplaza un plano, Git guarda la versión vieja
Y la nueva para siempre, así que el repositorio solo crecería sin parar. En cambio, se
guardan en **Cloudflare R2** (almacenamiento de objetos, gratis hasta 10 GB, sin cobrar nunca
por las descargas — de sobra para esto y para crecer bastante más).

A diferencia de las fotos de servicios (que no piden contraseña porque van embebidas en
mails), los planos **siempre exigen el token de acceso de la app** — son datos más sensibles
(muestran cómo está armada la seguridad de un cliente) y nunca se necesitan fuera de la app.

**Variables de entorno nuevas a cargar en Vercel**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.

### Carga masiva desde `admin.html`

Nueva pestaña "📐 Planos" — se pueden subir varios PDF a la vez (se suben de a uno por detrás
de escena, con una barra de progreso, para no toparse con los límites de tamaño de Vercel al
mandar cientos de archivos juntos). Cada archivo se nombra con el nombre del cliente antes de
subirlo — ese nombre es lo que después se busca desde la app. Si ya existe un plano con el
mismo nombre, se reemplaza.

### Sincronizador automático para la PC (`sync-local-planos/`)

Como carga inicial de ~1000 archivos sería muy lento uno por uno, se armó un programa aparte
que corre en la PC de oficina: vigila una carpeta y sube solo lo nuevo o modificado, sin
intervención manual. Como los archivos originales son una mezcla de PDF y Visio (`.vsd`/
`.vsdx`), el programa convierte los Visio a PDF automáticamente antes de subirlos (con
LibreOffice, gratis) — un celular no puede abrir un Visio directo. Instrucciones completas de
instalación en `sync-local-planos/README.md`.

Se probó a fondo: sube PDF y Visio correctamente, no vuelve a subir un archivo si no cambió de
verdad, sube de nuevo solo lo que se modificó, y si falla la conversión de un archivo puntual,
el resto sigue procesándose sin problema.

## Auditoría de seguridad integral (v3.16.0)

Revisión de seguridad de toda la app: manejo de datos, accesos y permisos, comunicación con
servicios externos, y almacenamiento de información sensible.

### Lo más grave, encontrado y corregido: contraseñas reales en el código público

Las contraseñas de **todos los técnicos**, y la contraseña de oficina/administración, estaban
escritas en texto plano directo en el código — visibles para cualquiera que abriera el
repositorio (que es público), sin necesidad de hackear nada. Esto venía desde hace mucho:
**toda esa historia queda en el registro de cambios de Git para siempre**, así que aunque ya se
sacaron del código actual, las contraseñas viejas deben tratarse como conocidas por cualquiera
y cambiarse todas.

**Se corrigió de raíz**: ahora ninguna contraseña vive en el código ni se le entrega nunca a
quien pregunta — se verifican del lado del servidor (usuario/clave del técnico, y la del
panel), comparando contra lo guardado en el repositorio privado de datos o una variable de
entorno en Vercel. El técnico y quien entra al panel siguen usando la app exactamente igual que
antes (mismo formulario, mismos pasos) — el cambio es invisible para ellos, pero cierra el
agujero. Se probó a fondo: login correcto/incorrecto de técnico, login correcto/incorrecto de
administración, que la lista de técnicos ya no incluya contraseñas al consultarla, que dejar la
contraseña en blanco al editar un técnico existente no se la borre, y que no se pueda crear un
técnico nuevo sin ponerle contraseña.

### Otros problemas encontrados y corregidos

- **Texto libre mostrado sin filtrar en pantalla (en ~14 lugares)**: el nombre de un cliente, una
  dirección, una nota escrita por un técnico, etc. se insertaban directo en la pantalla — si
  alguien escribía código malicioso en un campo de texto, se podía llegar a ejecutar en la
  pantalla de otro técnico que viera esa información después. Se corrigió neutralizando
  cualquier código antes de mostrar texto que alguien haya escrito.
- **Mails sin validar el formato del destinatario**: el mail del cliente se usaba para enviar sin
  chequear que tuviera forma de mail real, lo que en teoría permitía intentar desviar copias o
  inyectar destinatarios extra. Ahora se valida el formato antes de mandar cualquier cosa.
- Se confirmó que todos los endpoints del servidor controlan el acceso correctamente, y que no
  hay dependencias con vulnerabilidades conocidas.

### Recomendaciones para el futuro

- **Cambiar ya todas las contraseñas** (las de los técnicos y la de oficina/admin) — las que
  estaban en el código deben considerarse conocidas por cualquiera, para siempre.
- El token compartido que usa toda la app para hablar con el servidor (`SERVICIOS_API_TOKEN`)
  sigue siendo un único valor fijo, visible en el código — cualquiera que lo tenga puede usar la
  API directamente. Esto es aceptable para un equipo chico e interno, pero si la empresa crece
  o el riesgo percibido aumenta, lo correcto a futuro es una sesión por persona (en vez de una
  clave compartida por todos), algo que requiere una revisión más de fondo del inicio de sesión.
- Revisar cada tanto que no se vuelvan a colar datos sensibles hardcodeados en el código (es fácil
  que pase sin querer al ir agregando funciones con el tiempo).

### Varias claves con título, y descuento "Por presupuesto" (v3.15.1)

**Claves y códigos** ahora admite cargar varias, cada una con su propio **título** (para saber
de qué es — ej: "WiFi del cliente", "Panel de alarma") — ya no son 3 campos fijos, sino una
lista: se completa título (obligatorio) + usuario/clave/código (todos opcionales) y se agrega;
el botón muestra cuántas hay cargadas. Sigue yendo solo al mail de oficina — se probó de nuevo
con varias claves juntas y el cliente sigue sin recibir nada de esto.

**Descuento**: nueva opción **"Por presupuesto"** junto a Sin descuento/50%/100%/Otro. Al
elegirla, aparece un campo opcional para el número de presupuesto — si se completa, queda
como "Por presupuesto N° [número]"; si no, simplemente "Por presupuesto". No aplica ningún
descuento automático al costo final (el precio ya viene definido por el presupuesto en sí).

## Botón "LISTO" ahora hace algo, y sección de Claves solo para oficina (v3.15.0)

### El "LISTO" de arriba ahora es útil

Era un `<span>` sin ningún manejador de clic — de ahí que "no hacía nada". Ahora es un botón
real: al tocarlo, muestra el estado de sincronización (conectado o no, y si hay envíos
pendientes por una falta de conexión anterior) — reutilizando la información que la app ya
llevaba internamente, sin agregar nada nuevo que rastrear.

### Nueva sección "🔑 Claves" al final del parte

Al final del formulario (antes de pasar a la firma), nuevo botón **"🔑 Claves"** que abre una
mini-pantalla para cargar usuario, clave, y código de verificación de producto (por ejemplo, de
la central de alarma o el router instalado). El botón muestra un ✓ una vez que se cargó algo,
para saber de un vistazo si ya se completó.

**Esta información solo le llega a la oficina por mail — nunca al cliente.** Se probó
explícitamente: con los mismos datos, la plantilla de oficina muestra la sección completa
(usuario, clave, código), y la plantilla de cliente no la incluye en absoluto — ni siquiera
como sección vacía. Si no se carga nada en "Claves", la sección ni aparece en el mail de
oficina.

### Foco de teclado, hover, y verificación responsive en dashboards (v3.14.1)

Siguiendo pidiendo específicamente por los dashboards: se encontró que **ni los botones ni los
selectores de período (Día/Semana/Mes) tenían ningún estilo de foco propio** — dependían del
outline por defecto del navegador, inconsistente con la marca. Se agregó un anillo ámbar de
foco (visible solo al navegar con teclado, no con mouse/touch, usando `:focus-visible`) a
botones, tiles, y selectores de período en todos los dashboards — verificado que realmente se
renderiza tabulando con el teclado de verdad (no solo enfocando por código), esperando a que
termine la transición antes de medir.

También se agregó estado `:hover` a los selectores de período (no lo tenían), y se verificó que
los dashboards no generen scroll horizontal en ningún ancho de pantalla probado, desde 320px
(el más angosto habitual) hasta 768px.

## Auditoría de diseño: contraste, tamaño táctil, y paleta de gráficos (v3.14.0)

Se hizo una revisión rigurosa del diseño, basada en **medición objetiva** (no en apreciación
visual, ya que este entorno no permite juzgar estética a simple vista) — contraste real
calculado según la fórmula de WCAG, tamaños de elementos, y distancia perceptual entre colores.
Se investigaron también tendencias actuales de diseño de dashboards y apps de campo para
técnicos antes de decidir qué tocar.

**Encontrado y corregido:**
- El texto "LISTO" de la barra superior tenía 3.92:1 de contraste (necesita 4.5:1) — corregido a 5.50:1.
- El texto "= sin cambios" en las tarjetas de dashboard tenía 3.27:1 — corregido a 5.21:1.
- Los encabezados de la tabla de SIMs en `admin.html` tenían 4.23:1 — corregido a 5.33:1.
- Dos botones secundarios (Activar notificaciones, Cerrar sesión) medían 33px de alto — se
  llevaron a 44px, el mínimo recomendado para uso táctil de un solo dedo (importante para
  técnicos que muchas veces usan el celular con una sola mano en la calle).
- La paleta de colores para distinguir técnicos en los gráficos tenía pares casi
  indistinguibles entre sí (dos grises muy parecidos, un ámbar y un marrón casi iguales) — se
  reemplazó por una con mejor separación (la distancia mínima entre cualquier par de colores
  pasó de 41 a 67, verificado numéricamente) y sin rojo y verde uno al lado del otro (para
  daltonismo rojo-verde).
- Se formalizó la escala de espaciado para que coincida con los valores que ya se venían usando
  en la práctica, en vez de una escala que nunca se aplicaba realmente.

**Se revisó pero NO se tocó** (para no arriesgar romper algo sin poder verlo): un caso que
parecía tener mal contraste (el estado "En stock" de las SIMs) resultó ser un falso positivo al
medir con una muestra de píxel real en vez de la fórmula ingenua — el contraste real es 5.13:1,
está bien. Tampoco se hizo un reemplazo masivo de los ~140 valores de espaciado que no seguían
la escala original, porque sin poder verificar visualmente el resultado, el riesgo de romper
alineaciones sutiles no compensaba el beneficio.

## "Instalar en cliente" desde admin.html, y bug del botón "Transferir" (v3.13.0)

### Bug encontrado: "Transferir" en la tabla de stock estaba roto

El botón "Transferir" de cada fila apuntaba a `/api/sim-uso` — un
endpoint que ya no existe desde que se fusionó en `/api/recurso-uso`
(hace varias versiones). Es decir, **transferir una SIM a otro
técnico u Oficina desde `admin.html` venía fallando en silencio**
desde esa fusión. Ya está corregido.

### Nueva opción: "📋 Instalar en cliente"

En el selector "Transferir a" de cada fila de SIM, ahora hay una
opción extra además de los técnicos y "Oficina": **"📋 Instalar en
cliente"**. Al elegirla, aparece:

- Un desplegable con los **servicios pendientes** actuales — al
  elegir uno, completa solo el nombre del cliente y la dirección.
- O la opción "Otro (escribir cliente)", para cargar el nombre a mano
  si no está entre los servicios pendientes.

Al confirmar, pasa por la misma acción real que usa la app del
técnico ("usar") — así la SIM se migra correctamente al registro de
instaladas y desaparece del stock al toque, en vez de quedar a mitad
de camino como pasaba editando los campos "En uso" + "Cliente" a mano.

### La migración a instaladas ahora corre al guardar, no solo al abrir la pestaña (v3.12.6)

Si en `admin.html` se editaba una SIM directo en la tabla de stock
(poniéndola "en uso" + un cliente a mano, en vez de hacer el traspaso
desde la app) y se guardaba, quedaba "a mitad de camino": guardada,
pero sin pasar todavía al registro de instaladas — recién se migraba
la próxima vez que se abría esa pestaña. Ahora "Guardar cambios"
dispara la migración automática al toque, así el resultado se ve
correcto enseguida, sin tener que recargar nada.

### Bug crítico corregido: guardar con un filtro activo borraba SIMs (v3.12.5)

En la pestaña "SIMs" de `admin.html`, "Guardar cambios" leía
literalmente las filas que estaban **dibujadas en pantalla** — si
había un filtro/búsqueda activo mostrando solo una parte de la
tabla, guardar en ese estado mandaba al servidor **solo esas filas
visibles**, reemplazando toda la lista y borrando todo lo que no
coincidía con el filtro. Ahora, si el buscador tiene algo escrito,
"Guardar cambios" se bloquea con un aviso explícito pidiendo borrar
la búsqueda antes de guardar — así nunca se puede guardar una versión
parcial sin querer.

### Migración automática de SIMs "viejas" en uso (v3.12.4)

Cualquier SIM que haya quedado marcada **"en uso" con un cliente**
dentro del stock (de antes de que existiera el registro de instaladas
separado) ahora se migra sola al registro apenas se abre la pestaña
**"SIMs"** en `admin.html` — no hace falta tocar nada a mano. Esas
líneas desaparecen del stock y pasan a figurar en "SIMs instaladas",
con el cliente y el técnico que las tenía asignadas (la fecha de
instalación real no se conserva para estos casos viejos, porque no
estaba guardada en ningún lado — queda con la fecha del día en que se
migran). Es seguro que corra cada vez que se entra a esa pestaña: si
no encuentra nada para migrar, no hace nada.

### Se suma "Estado de línea" a la búsqueda (v3.12.3)

En "📇 Buscar SIM instalada / Retirar" (app del técnico), cada
resultado de búsqueda ya mostraba compañía, número y cliente, pero no
mostraba el **Estado de línea** (Activo/Inactiva) aunque el dato ya
estaba guardado desde la importación. Ahora se muestra también —
la búsqueda deja ver los cuatro datos: compañía, número de línea,
cliente y estado de línea, tal como estaba en la planilla original.

### Privacidad entre técnicos en SIMs (v3.12.2)

Un técnico ahora **solo ve sus propias SIMs** en la app — nunca las
de otro técnico, ni las que están sin asignar en "Oficina". Antes
había dos formas en las que esto se filtraba:

- El **buscador de arriba** de la lista de SIMs buscaba entre las de
  todo el equipo (para ver qué línea tenía un cliente) — se sacó
  directamente, porque ya no hace falta: para eso está la búsqueda en
  el registro de instaladas (ver más arriba).
- El permiso de **Administración** (el que da acceso al panel
  `admin.html`) de paso también mostraba todas las SIMs de todos
  dentro de la app — se separó: ese permiso ahora solo controla el
  acceso al panel, la visibilidad de SIMs adentro de la app queda
  siempre acotada a lo propio, para cualquier técnico.

**Tomar una SIM de "Oficina" (sin asignar) sigue siendo una acción
exclusiva de quien tenga el panel de administración** — un técnico no
la puede ver ni tomar por sí mismo desde la app; se la asigna un
admin desde `admin.html` (columna "Transferir a" en la tabla de
stock). Desde su propio menú, un técnico puede: transferir una SIM
suya a otro técnico, instalarla en un cliente (lo que la mueve al
registro definitivo), y retirar una ya instalada si el cliente se dio
de baja.

## Registro de SIMs instaladas, para manejar la escala real (v3.12.0)

Con ~900 SIMs ya instaladas en clientes (y solo 30-60 en stock activo
entre todos los técnicos), el sistema de SIMs de antes — pensado para
manejar todo junto en un solo archivo, con una tabla editable
mostrando todo de una — dejaba de ser práctico. Se separó en **dos
categorías con lógica distinta**:

- **Stock activo** (`sims-config.json`, sin cambios): las 3-4 SIMs por
  técnico que se mueven todo el tiempo — tomar, transferir, usar.
  Sigue funcionando exactamente igual que antes.
- **Registro de instaladas** (`sims-instaladas.json`, nuevo): las
  ~900 líneas ya funcionando en un cliente, que casi no se mueven.
  Es un registro de **consulta**, no una tabla editable — se busca,
  no se lista todo de una.

### El movimiento entre las dos categorías

- **Instalar una SIM del stock en un cliente** ("usar"/"reemplazar"):
  automáticamente sale del stock del técnico y pasa a figurar en el
  registro definitivo, con cliente, dirección, fecha de instalación y
  quién la instaló.
- **Retirar una SIM de un cliente** (por ejemplo, se dio de baja del
  servicio): nueva opción **"📇 Buscar SIM instalada / Retirar"** en la
  pantalla de SIMs de la app — el técnico busca por cliente, número o
  dirección, y la retira con un toque. Sale del registro y vuelve a
  su stock personal, lista para reinstalar en otro cliente.

### Importar desde Excel (`admin.html` → pestaña "SIMs instaladas")

Se puede cargar (o actualizar) el registro completo subiendo una
planilla con las columnas N° DE ABONADO, ESTADO DE LINEA, NOMBRE
ABONADO, DIRECCION, FECHA DE ACTIVACION, NUMERO DE LINEA, EMPRESA. La
importación es **inteligente**: si un N° de abonado ya existe en el
registro, se actualiza con los datos nuevos; si es nuevo, se agrega
— nunca duplica ni borra lo que ya estaba cargado (ya sea a mano o
por una SIM instalada desde la app). Se probó la lectura y el mapeo
de columnas contra un archivo real de 908 líneas, sin errores.

## Recordatorio de vehículo movido a las 17-18hs (v3.11.1)

Se corrió el horario del recordatorio de devolver el vehículo, de
18-19hs a **17-18hs**, tal como se pidió. Como ahora coincide con la
franja de la felicitación semanal de los viernes, se aprovechó para
unificar en un solo horario de cron de tarde (de lunes a viernes) en
vez de tener dos por separado — los viernes a esa hora pueden salir
los dos avisos (recordatorio de vehículo + felicitación, si
corresponde), cualquier otro día de la semana sale solo el
recordatorio de vehículo si aplica.

## Recordatorio de devolver el vehículo al final del día, y bug de la felicitación (v3.11.0)

### Bug corregido: la felicitación llegaba a la mañana

La felicitación semanal solo chequeaba "¿hoy es viernes?" — pero el
cron de la mañana (que corre TODOS los días) también es viernes los
viernes, así que se disparaba ahí en vez de esperar a la tarde. Ahora
también chequea la hora (además del día), para que solo se dispare
con la invocación de la tarde.

### Recordatorio de devolver el vehículo al final del día

De lunes a viernes (no fines de semana ni feriados), entre las 18 y
las 19hs aproximadamente, a los técnicos "en la calle" que **todavía
tienen un vehículo tomado** a esa altura del día les llega un aviso
para que se acuerden de devolverlo. Se agregó un tercer horario de
cron para esto (ya usábamos dos: el de la mañana y el de los
viernes).

**Sobre la idea de usar geolocalización en vez de un horario fijo**:
lo evalué, pero no es viable de forma confiable con esta app tal como
está armada hoy. Una PWA (como esta) no puede rastrear la ubicación
del celular en segundo plano cuando la app está cerrada — eso
requiere permisos y capacidades que solo tienen las apps nativas
instaladas desde una tienda de aplicaciones, especialmente en iPhone,
donde Safari es todavía más restrictivo con esto. Si en algún momento
se quisiera geolocalización real (detectar "llegó a la oficina"), hay
que evaluar convertir la app a una app nativa — es un cambio de fondo,
no un ajuste. Por ahora, el aviso por horario fijo es la opción
confiable.

### El recordatorio se salta si ya tiene todo tomado (v3.10.1)

Si un técnico "en la calle" ya tomó el vehículo **y** ya tiene al
menos una herramienta en uso antes de que dispare el recordatorio de
la mañana, no le llega el aviso — ya no hace falta. Si le falta
cualquiera de las dos cosas (por ejemplo, tomó el vehículo pero
todavía no tomó ninguna herramienta), el recordatorio le sigue
llegando igual.

## Sonido garantizado en avisos importantes, y felicitación semanal (v3.10.0)

### Sonido en las notificaciones

Las notificaciones push del celular ya sonaban con el sonido del
sistema por defecto (nunca se mandaban en silencio) — se dejó
explícito en el código para que quede garantizado. Además, el
recordatorio a técnicos "en la calle" (ver v3.9.0) ahora se manda
marcado como **"importante"**: queda fijo en la pantalla hasta que lo
toquen (no desaparece solo a los pocos segundos) y vibra más fuerte —
para que sea difícil pasarlo por alto. Una aclaración honesta: el
sonido en sí depende del sistema operativo del celular (si el
técnico tiene el teléfono en silencio o modo "No molestar", ninguna
app puede saltarse eso).

### Felicitación al mejor desempeño de la semana

Los viernes, en algún momento entre las 17:00 y las 18:00hs (la app
usa el mismo cron de un solo disparo diario que ya usábamos, pero con
un segundo horario agregado solo para los viernes — Vercel gratis no
garantiza el minuto exacto, pero sí que caiga dentro de esa hora),
se manda un aviso a **todo el equipo** felicitando al técnico que más
servicios resolvió esa semana (lunes a viernes). Si hay empate, se
felicita a todos los que empataron. Si nadie resolvió nada esa
semana, no se manda nada.

**Se puede desactivar** desde `admin.html` → pestaña Servicios
pendientes → hay un check "🏆 Mandar cada viernes..." — viene
**activado por defecto**, tal como pediste.

## Contraste en servicios muy atrasados (v3.9.1)

En la lista de "Servicios pendientes", cuando un servicio pasa el
umbral de "urgente" (por defecto, 10+ días sin resolver), la tarjeta
se marcaba en rojo pero con un fondo muy tenue (6% de opacidad) — el
nombre del cliente, en texto oscuro, quedaba con muy poco contraste
contra ese fondo casi blanco. Ahora esa tarjeta tiene un **fondo rojo
sólido**, con el nombre del cliente y el resto del texto en **blanco**
— contraste verificado en 5.44:1, por encima del mínimo de
accesibilidad (4.5:1). De paso, la etiqueta "🔴 Hace X días" se invirtió
(fondo blanco, texto rojo) para que siga destacando como una etiqueta
propia sobre el nuevo fondo rojo, en vez de mezclarse con él.

## Recordatorio para técnicos "en la calle" (v3.9.0)

Desde `admin.html` → Técnicos, cada técnico tiene un check **"🚐 Está
en la calle"**. Los que lo tengan tildado reciben una notificación
push de lunes a viernes (no fines de semana ni feriados nacionales)
recordándoles tomar el vehículo y las herramientas que necesiten.

### Aclaración importante sobre el horario

Pediste que sea a las 9:30 en punto — en el plan gratuito de Vercel,
el horario de un cron job **no se garantiza al minuto exacto**, solo
"en algún momento dentro de la hora indicada". Como ya usábamos el
cron de las 9 en punto (hora Argentina) para el aviso de cambio de
guardia, el recordatorio de vehículo/herramientas se agregó a ESE
MISMO disparador (en vez de un cron nuevo) — así que en la práctica
va a llegar **en algún momento entre las 9:00 y las 10:00 AM**, no
exactamente a las 9:30. Si más adelante hace falta más precisión, hay
que pasar a un plan pago de Vercel (o un programador externo), pero
para un recordatorio matutino esta ventana debería alcanzar.

### Cómo se determinan los feriados

En vez de mantener a mano una lista de feriados argentinos (que
cambian todos los años, con puentes y feriados trasladables por
decreto), se consulta una API pública y gratuita
([Nager.Date](https://date.nager.at)) que ya tiene el calendario
completo de Argentina. Si por algún motivo esa consulta falla, se
prefiere mandar el recordatorio igual antes que arriesgarse a no
avisar por semanas por un problema de red pasajero.

### Un cambio de fondo: las suscripciones push ahora saben de quién son

Hasta ahora, cuando un técnico tocaba "Activar notificaciones", se
guardaba el dato de su celular pero **no a qué técnico pertenecía**
— por eso no había forma de mandarle un aviso a "solo estos
técnicos". Ahora cada suscripción guarda también el nombre del
técnico, y si el mismo celular pasa a otro técnico (cambia de mano),
se actualiza solo. Esto habilita, a futuro, más avisos dirigidos a
técnicos puntuales (no solo a todo el equipo).

## Borrador del comodato en curso (v3.8.1)

Mismo mecanismo que ya existía para los partes de servicio: si el
técnico carga datos en el formulario de Comodato y toca "Cancelar" (o
cierra la app) antes de firmar y enviar, lo que ya había cargado
**no se pierde** — queda guardado en el celular y se restaura solo la
próxima vez que abra Comodato, con un aviso de "Se restauró un
comodato que tenías sin terminar." A diferencia de los partes (que se
guardan por número de servicio), acá alcanza con **una sola clave
fija**, porque en la práctica hay como mucho un comodato en curso a
la vez.

- Se guarda al tocar "Cancelar", y también si la app pasa a segundo
  plano mientras está en el formulario o en la pantalla de firma.
- Se vacía recién cuando el envío a oficina se confirma con éxito —
  igual que en partes, si falla o no hay conexión, el comodato ya
  quedó capturado en la cola de reintento (ver más arriba), así que
  no hace falta borrar el borrador todavía en ese caso.
- El alcance es el mismo que en partes: guarda los datos del
  formulario (cliente, dirección, artículos, abono, etc.), no lo que
  se carga en la pantalla de firma (aclaración/cargo/DNI) — eso
  siempre hay que volver a cargarlo si se interrumpe justo ahí.

## Permisos por técnico, configurables desde el panel de administración (v3.8.0)

Antes, varias secciones estaban restringidas a nombres fijos en el
código (Dashboard financiero solo para Sebastián; Administración solo
para Sebastián y Brenda; ver el historial/las SIMs de todo el equipo,
también). Ahora todo eso se administra con **casillas por técnico**
desde `admin.html` → pestaña **Técnicos** — cada técnico tiene, debajo
de su nombre y contraseña, una grilla de 10 casillas:

- Dashboard general
- Dashboard financiero
- Dashboard de vehículos
- Dashboard de SIMs
- Ver historial de todo el equipo (si no, cada uno ve solo lo propio)
- Sección Vehículos
- Sección SIMs
- Sección Herramientas
- Sección Comodato
- Panel de Administración

Si un técnico no tiene ninguna tildada, no ve ese botón en el panel
principal — un **técnico nuevo arranca con todo apagado**, y vos
tildás lo que le corresponda antes de guardar.

**Importante para la primera vez que uses esto**: los técnicos que ya
existían antes de esta actualización (Sebastián, Brenda, y el resto)
todavía **no tienen casillas guardadas explícitamente** — mientras
eso sea así, la app les mantiene el acceso que ya tenían (por nombre,
como antes) para que nadie se quede afuera de golpe. Pero en cuanto
entres a la pestaña Técnicos y guardes los cambios (aunque sea para
agregar o editar a un solo técnico), **se guardan casillas explícitas
para todos los que aparezcan en esa lista** — así que la primera vez,
antes de guardar, repasá que Sebastián tenga todo tildado y que Brenda
tenga al menos "Panel de Administración", para no sacarles acceso sin
querer.

### Ajustes de uso real (v3.7.1)

- **Bug de la pantalla de firma**: al crear la firma del comodato me
  olvidé de darle estilo propio al canvas nuevo, así que se mostraba a
  su tamaño real en píxeles (enorme) en vez de ajustarse al recuadro —
  tapaba los campos de aclaración y DNI. Ya está corregido, con una
  altura fija prolija para el recuadro de firma en esta pantalla.
- **"¿Lo representa otra persona?"**: nuevo check arriba del campo
  "representado en este acto por". Si no está tildado (el caso más
  común: el titular firma por sí mismo), ese campo se completa solo
  con el nombre que ya escribiste arriba. Si lo tildás, se habilita
  para escribir el nombre de quien realmente representa al titular.
- **Abono mensual con formato de moneda**: ahora se escribe el número
  y al salir del campo se formatea solo como "15.000,00"; al lado
  siempre dice "+ IVA" fijo, y ese aumento también se refleja en el
  texto del contrato.
- **Cantidad de artículos como selector**: en vez de tipear la
  cantidad de cada artículo en comodato, ahora se elige de una lista
  (1 a 10) — evita errores de tipeo del técnico.

## Contrato de comodato (v3.7.0)

Nueva sección **"📄 Comodato"** en el panel principal, para cuando se
le deja a un cliente equipos en préstamo (centrales, GPS, sensores,
etc.). El técnico completa un formulario (cliente, dirección,
representante, artículos — de un catálogo + opción "otro" —, abono
mensual), firma con el mismo sistema de firma digital que ya usa la
app (más aclaración, cargo y DNI, obligatorios para este contrato), y
al confirmar se genera el PDF del contrato ya completo y firmado, que
se manda por mail a la oficina y al cliente.

### Cómo se genera el PDF (sin depender de Word ni de LibreOffice)

Vercel no puede convertir un Word a PDF (no tiene LibreOffice
disponible), así que en vez de rellenar el `.docx` original y
convertirlo, el PDF se **genera directamente en código** con la
librería `pdf-lib` (liviana, JS puro, sin dependencias externas) — el
texto legal es el mismo exacto que el contrato original en Word
(se migró cláusula por cláusula), con salto de línea y paginado
automáticos según el largo de cada campo. Esto es más confiable que
depender de un servicio externo de conversión.

- `lib/pdf-comodato.js`: arma el PDF completo, con el encabezado real
  de SAT (logo extraído del Word original, convertido de CMYK a RGB
  porque si no se ve mal en el PDF) y la firma real de Alfredo
  Thiesing (comodante) ya incrustada — la del cliente (comodatario) se
  agrega dinámicamente en cada comodato.
- Los dos archivos de imagen (`assets/comodato-encabezado.png` y
  `assets/comodato-firma-thiesing.png`) están sacados directamente del
  Word original — si en algún momento cambia el logo o la firma de
  Alfredo, hay que reemplazar esos dos archivos.
- El diseño del PDF es prolijo pero **no un clon pixel a pixel** del
  Word original (tipografía y espaciado propios) — lo que sí es
  idéntico es el texto legal completo.

### `/api/comodato.js`

Nueva función (van **11 de 12** — queda 1 libre). Recibe los datos del
formulario + la firma, arma el PDF, y manda dos mails (oficina y
cliente, si se cargó su mail). El envío a oficina es el que importa:
si por algún motivo no se puede confirmar que llegó, el comodato
**no se da por enviado** — queda guardado en el celular y se reintenta
solo (ver más abajo), igual que ya pasa con los partes de servicio.

### No se pierde el comodato hasta confirmar que llegó a oficina

La cola de reintento sin conexión que ya existía para los partes de
servicio (por si el técnico se queda sin señal) ahora también guarda
comodatos — cada elemento de la cola tiene un campo `tipo`
(`"parte"` o `"comodato"`) para saber cómo reintentarlo. Si el mail a
oficina falla o no se puede confirmar, el comodato queda guardado en
el celular del técnico y se reintenta solo apenas vuelva la conexión
— nunca se descarta sin que oficina lo haya recibido.

### Ícono según el tipo de herramienta (v3.6.2)

Al cargar una herramienta en `admin.html`, ahora se elige también un
**tipo** (Escalera, Computadora/Notebook, Herramienta eléctrica, u
Otro) — solo define qué ícono se le muestra en la app, para
reconocerla más rápido de un vistazo en la lista. El color de la
insignia sigue reflejando el estado (libre/en uso/en un cliente) como
antes; lo único que cambia con el tipo es el dibujo del ícono.

## Herramientas especiales, y fusión de vehículos/SIMs/herramientas en un solo endpoint (v3.6.1)

**Nueva sección "🧰 Herramientas"** en el panel principal, para llevar
registro de elementos puntuales que se llevan un técnico a la vez —
escaleras especiales, la computadora de diagnóstico, un taladro en
particular, etc. (a diferencia de los vehículos, no se usan todos los
días). Funciona igual que vehículos y SIMs:

- Un técnico la **toma** cuando la necesita, y la **devuelve** cuando
  termina.
- Se la puede **transferir** directo a otro técnico.
- Si la **deja en lo de un cliente** (en vez de devolverla), queda
  registrado con qué cliente, y sale un **aviso por notificación
  push** a todo el equipo — para que quede claro dónde está. Cualquier
  técnico (no necesariamente quien la dejó) puede marcar después que
  la retiró, y vuelve a estar en uso normal.
- **Todos los técnicos ven** quién tiene cada herramienta en este
  momento, igual que con las SIMs.
- Se administra desde `admin.html` → pestaña "Herramientas" — se
  carga el nombre de cada una (el estado y quién la tiene lo va
  actualizando la app sola).

**De regalo, se liberó otra función**: en vez de crear un tercer
endpoint para herramientas (que nos hubiera dejado otra vez al
límite), se aprovechó para fusionar `vehiculo-uso.js` + `sim-uso.js` +
la lógica nueva de herramientas en **un solo archivo**
(`recurso-uso.js`) — las tres comparten el mismo patrón de "tomar /
devolver / transferir + historial", así que tenía sentido unificarlas.
Resultado: **10 funciones en total**, con **2 de margen** (antes
había 1). Se probó a fondo con pruebas automatizadas que vehículos y
SIMs siguen funcionando exactamente igual que antes a través del
endpoint nuevo, sin ningún cambio de comportamiento para el usuario.

### Borrador del parte en curso (v3.6.0)

Si un técnico abre un servicio, carga algunos datos, y toca **"Volver"**
(o cierra la app / cambia de pantalla) antes de firmar y enviar, lo que
ya había cargado **no se pierde** — queda guardado en el celular
(`localStorage`) y se restaura solo la próxima vez que abra **ese
mismo servicio**, con un aviso de "Se restauró lo que ya tenías
cargado en este servicio."

- Se guarda automáticamente al tocar "Volver", y también si la app
  pasa a segundo plano (por si cierran sin tocar ese botón).
- El borrador se borra solo una vez que el parte se envía con éxito —
  no queda dando vueltas después de terminado.
- Solo aplica a servicios reales de la lista (con número de servicio)
  — los partes cargados con "Cargar parte sin servicio" no tienen una
  clave estable para guardar un borrador, así que esos no se guardan.
- Es **por celular** — si el técnico cambia de teléfono a mitad de un
  servicio, no se lleva el borrador con él (queda en el celular
  original).

### Copia al cliente, SIM instalada, y aviso de material sin agregar (v3.5.9)

- **Se descubrió la causa de que a veces no llegaban los materiales**:
  hay que elegir categoría, modelo y cantidad, y después tocar
  **"+ Agregar"** para que quede sumado a la lista — si un técnico se
  olvidaba de tocar ese botón, la selección se perdía en silencio, sin
  ningún aviso. Ahora, si intenta continuar a la firma con una
  categoría/modelo elegidos pero sin agregar, la app le avisa y no lo
  deja avanzar hasta que agregue el material o lo borre.
- **El mail de oficina ahora muestra si se le mandó copia al cliente**
  y a qué dirección — o "No se cargó mail del cliente" si no
  corresponde.
- **La SIM instalada (si se cargó) ahora tiene su propia sección** en
  el mail de oficina ("📶 SIM instalada"), separada de los materiales
  generales, en vez de ir mezclada dentro del mismo texto — así se ve
  de un vistazo sin tener que leer entre los demás materiales.

### Aclaración y cargo de quien firma (v3.5.7)

Al firmar, además del dibujo de la firma, el cliente (o quien firme)
completa **aclaración** (nombre y apellido, tipeado — obligatorio, no
deja avanzar sin cargarlo) y **cargo** (opcional, ej. "Encargado",
"Propietario"). Los dos se agregan justo debajo de la firma en los dos
mails, con una línea separadora, como una firma en papel de toda la
vida. Si no se carga cargo, esa línea directamente no aparece.

### Plantillas mejoradas (v3.5.6): más información, más prolijas, firma corregida

- **La firma llegaba grande o estirada** en algunos clientes de mail
  — la causa era que el tamaño real (en píxeles) del dibujo cambiaba
  según el celular desde el que se firmaba, así que la proporción
  nunca era la misma dos veces. Ahora se redibuja siempre sobre un
  lienzo de tamaño fijo (320×110), centrada y con fondo blanco, antes
  de mandarla — así se ve igual de bien sin importar desde qué celular
  se firmó.
- **Forma de pago con color**: en vez de texto plano, aparece como una
  etiqueta de color (verde si pagó, celeste si transfirió, ámbar si
  quedó a cuenta o a pagar en oficina) — se entiende de un vistazo.
- **Dirección como link a Google Maps**: tocás la dirección y abre la
  ubicación directo — útil sobre todo para quien recibe la copia de
  oficina.
- **Miniatura de la foto** (mail de oficina): si el técnico cargó una
  foto, ahora se ve como imagen chica directo en el mail (tocándola
  se abre en tamaño completo), en vez de solo un link de texto.
- **Ícono por sección** (👤 🔧 📝 📦 💰 ⚠️ ✍️) para ubicarse más rápido
  al leer.
- **Mejor en celular**: el ancho ya no es fijo a 600px — se adapta a
  pantallas chicas, y el mail incluye la meta etiqueta de viewport
  para que los clientes de correo en el celular lo escalen bien.
- **Pie de contacto** en el mail al cliente, con el sitio de la
  empresa (`www.sat365.com.ar`) — si querés que también aparezca un
  teléfono o WhatsApp, decime el número y lo agrego.

### Cómo funciona por dentro

- Usa la librería `nodemailer` (gratis, sin límites propios — el único
  límite real es el que tenga tu plan de hosting de correo en DonWeb,
  normalmente mucho más generoso que un plan gratuito de EmailJS).
- Las plantillas HTML están **incrustadas directamente en el código**
  de `/api/enviar-mail.js` (no se leen de archivo aparte), con el
  mismo formato `{{variable}}` que ya usaban en EmailJS — incluye los
  bloques opcionales (`{{#tecnico2}}...{{/tecnico2}}`, etc.) para
  "2° técnico", "imprevisto" y "foto", que solo se muestran si esos
  datos vinieron cargados.
- Los archivos `email-templates/template_oficina.html` y
  `template_cliente.html` quedan como referencia de diseño, ya no se
  usan para nada — si en algún momento hay que cambiarles el diseño,
  hay que editar las plantillas incrustadas en `enviar-mail.js`
  directamente (y opcionalmente, actualizar esos dos archivos también
  para que seas conserva la referencia al día).

## Foto opcional en el parte (solo para la oficina)

El técnico puede sacar o elegir una foto al completar el parte. Es
opcional — si no carga nada, no pasa nada. La foto **no se manda como
adjunto de mail** (los adjuntos pesados complican el envío y no todos
los clientes de correo los muestran bien), sino que se sube al mismo
repo privado de GitHub que ya se usa para el listado de servicios
(carpeta `fotos/`), y el mail de la oficina recibe un link que la
muestra. El mail al cliente nunca incluye la foto ni el link.

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

## Identidad visual renovada y dashboards con más información (v3.4.9)

Se elevó la identidad visual de toda la app manteniendo la marca de
SAT (navy + ámbar) — no se reemplazó por colores genéricos, se
refinó la ejecución:

- **Sistema de tokens real** en `styles.css` (`:root`): colores,
  radios, sombras y tiempos de transición como variables, en vez de
  valores sueltos repetidos por todo el archivo.
- **Tarjetas con sombra y elevación** (antes solo tenían borde plano):
  paneles, servicios, historial, SIMs, credencial, dashboards — con
  radios más grandes (16px) y una sombra con tinte cálido en vez de
  gris genérico.
- **Botones**: forma de píldora, brillo ámbar sutil en el primario, y
  feedback táctil (se "achican" un poco al tocarlos) en todos los
  botones y tarjetas tocables — antes los cambios de estado eran
  instantáneos sin ninguna transición.
- **Encabezados de pantalla**: un tick ámbar antes del título, para
  anclar visualmente cada sección.
- **Gráficos (Chart.js)**: se agregó el plugin `chartjs-plugin-datalabels`
  para mostrar el **% directo en las tortas y donas** (antes solo se
  veía al tocar) — el color del texto se adapta solo al fondo de cada
  porción para que siempre se lea bien. Tipografía y colores de
  tooltips/leyendas unificados en un solo lugar (antes cada gráfico
  definía los suyos).
- **Pestañas de período**: las 4 versiones duplicadas (general,
  financiero, vehículos, SIMs) se unificaron en una sola regla, con
  una sombra ámbar sutil en la pestaña activa.

**Dashboards — más información, no solo más lindo:**

- **Dashboard general**: dos tarjetas nuevas — "Pendientes hace 3+
  días" (cuántos servicios ya están en zona de alerta, ahora mismo) y
  "Tiempo promedio por servicio" (duración media entrada→salida en el
  período elegido) — antes solo se veía la cantidad resuelta, sin
  ninguna noción de carga de trabajo pendiente ni de cuánto tarda cada
  visita en promedio.
- **Dashboard de vehículos**: dos tarjetas nuevas — gasto total en
  combustible y gasto total en gomería/mecánico/lavadero, sumando los
  montos cargados en "Registrar un evento sin devolver el vehículo" —
  antes esa plata solo se podía ver revisando cada registro uno por
  uno en la lista.
- **Dashboard de SIMs**: dos tarjetas nuevas —"En stock ahora" y "En
  uso ahora" (una foto del estado actual de la flota de SIMs, sin
  depender del período de movimientos elegido).

## Mismo rediseño llevado al resto de pantallas, y bug reparado (v3.5.3)

- **Submenú de Servicios Técnicos** y **submenú de Dashboards**: misma
  grilla de 2 columnas e íconos SVG con insignia de color que el panel
  principal (antes solo lo tenía la pantalla de inicio).
- **Listado de vehículos**: mismo tratamiento, pero con una variante
  con sentido — en vez de un color fijo por sección, la insignia de
  cada vehículo refleja su **estado real**: verde si está libre,
  coral si está en uso en ese momento.
- La grilla y los íconos ahora son una clase reutilizable
  (`.panel-tiles-grid` / `.panel-tile-grid`) en vez de estar atados
  solo a la pantalla principal — para poder aplicarla a futuras
  pantallas sin repetir código.

**Bug reparado**: si el CDN de Leaflet (la librería del mapa) no
llegaba a cargar por cualquier motivo — sin conexión, bloqueado por
algún firewall corporativo, caída puntual del CDN — una línea de
configuración del mapa que corría directo al abrir la app explotaba y
cortaba en seco la ejecución de **todo el resto del script**, dejando
funciones sin relación alguna con el mapa (como el reintento de envíos
sin conexión) rotas silenciosamente. Ahora esa configuración está
protegida: si Leaflet no cargó, el resto de la app sigue funcionando
normal — sólo el mapa en sí queda no disponible hasta que haya
conexión, con un aviso claro en vez de romperse.

## Panel principal rediseñado a fondo (v3.5.2)

Rediseño completo, con más foco que la vuelta anterior — específicamente
lo que pediste: tamaño de botones, tipografía, colores e íconos.

- **Íconos propios en SVG**, no más emoji: cada botón del panel
  principal (Servicios Técnicos, Manuales, Dashboards, Guardias,
  Historial, Credencial, Vehículos, SIMs, Administración) tiene un
  ícono de línea dibujado a medida, consistente en trazo y estilo —
  el emoji quedaba genérico y dependía de cómo lo dibuje cada celular;
  un ícono propio se ve igual en todos lados y da un aire mucho más
  profesional.
- **Insignia de color por sección**: cada ícono va dentro de un
  cuadrado redondeado de color — ámbar (Servicios), índigo (Manuales),
  turquesa (Dashboards), coral (Guardias), gris azulado (Historial),
  dorado (Credencial), verde (Vehículos), azul (SIMs), y navy con
  ícono ámbar para Administración (para que se note que es distinto,
  al ser una sección restringida). Los colores no son al azar — cada
  uno tiene una asociación pensada con la sección.
- **Grilla de 2 columnas** ("bento grid") en vez de la lista vertical
  de antes — se ven más botones de un vistazo, con una forma más
  cuadrada y moderna, en vez de filas largas y angostas.
- Este cambio de grilla e íconos **es solo del panel principal** — los
  submenús (Servicios Técnicos, Dashboards) y la lista de vehículos
  siguen con la lista vertical de siempre, ya que no fue lo que
  pediste tocar y cambiar todo de golpe hubiese sido más riesgoso.

## Panel de administración rediseñado (v3.5.1)

`admin.html` tenía un estilo bastante plano (tarjetas blancas sin
sombra, botones cuadrados, pestañas de solo texto) que había quedado
afuera de la vuelta de diseño anterior. Ahora tiene:

- **Encabezado propio** con el logo de SAT y "Panel de administración"
  arriba de todo, para que se sienta como una sección real de la app
  y no una página suelta.
- **Ícono en cada una de las 9 pestañas** (📋 Servicios pendientes, 🗓️
  Cronograma, 👤 Técnicos, 📦 Materiales, 🤖 Consultas IA, 🚨
  Guardias, 🪪 Credenciales, 🚗 Vehículos, 📶 SIMs) — los mismos que ya
  usa la app en sus botones equivalentes, para que sea consistente.
- **Tarjetas con sombra y borde superior ámbar** en la de acceso, en
  vez de solo un borde plano.
- **Botones tipo píldora** con el mismo brillo ámbar y feedback táctil
  que ya tiene la app.
- **Tabla de SIMs** con fila resaltada al pasar el mouse y bordes más
  prolijos.
- Mensajes de estado (ok/error) con un ✓ o ⚠ delante, en vez de solo
  texto de color.

Sigue con fondo claro a propósito (a diferencia de la app, que es
oscura) — es una herramienta de oficina, no algo que se use todo el
día como la app del técnico, así que no hacía falta convertirla a
tema oscuro para lograr el efecto "más profesional" pedido.

## Colores por compañía en SIMs, y comparación vs. período anterior (v3.5.0)

**Colores por compañía**: cada SIM (en la app y en la tabla de
`admin.html`) muestra una franja de color a la izquierda y un
puntito junto al nombre de la compañía — Movistar verde, Personal
celeste, Claro rojo (colores reales de cada marca, sin usar sus
logos, para no reproducir marcas registradas de terceros dentro de la
app). Se ve de un vistazo qué proveedor es cada línea sin tener que
leer el texto. Los mismos colores se usan en los gráficos de torta del
Dashboard de SIMs, para que todo sea consistente.

**Comparación contra el período anterior**: en el Dashboard general
("Resueltos", "Instalaciones", "Servicios técnicos") y en el
financiero ("Monto total generado"), debajo del número aparece un
indicador tipo "▲ 12% vs. anterior" o "▼ 8% vs. anterior" —
compara el período elegido (día/semana/mes) contra el tramo
equivalente inmediatamente anterior. La opción "Todo" no tiene
comparación posible, así que ahí no aparece nada.

**Valores directo en las barras**: el gráfico "Resueltos por técnico"
ahora muestra el número arriba de cada barra, sin tener que tocarla.
El gráfico de monto por día (financiero) se dejó sin esto a propósito
— tiene muchos puntos (uno por día del período) y saturaría la
lectura; ahí conviene seguir usando el tooltip al tocar.

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
`historial`, `foto`, `consultas`, `datos`, `recurso-uso`,
`cron-diario`, `enviar-mail`, `comodato`) — con **1 función libre**
antes de volver a tocar el límite del plan gratuito de Vercel.
`recurso-uso.js` reemplaza a los antiguos `vehiculo-uso.js` y
`sim-uso.js` (fusionados), y además maneja la lógica de herramientas
— las tres comparten el mismo patrón de "tomar / devolver /
transferir + historial" (ver `?recurso=vehiculo|sim|herramienta`).
Antes de eso, ya se había liberado una función fusionando `foto.js`
(mostrar una foto) y `upload-foto.js` (subir una foto) en un solo
archivo. La próxima vez que haga falta un endpoint nuevo, sumarlo como
colección dentro de `datos.js` si es posible — o si hace falta liberar
otra función, `vehiculo-uso`/`sim-uso` ya viven fusionados así que el
próximo candidato natural sería revisar si `historial.js` puede
sumarse a `datos.js` como una colección con lógica especial.

## Revisión y depuración (v3.5.8)

Se hizo una pasada de revisión general de toda la app: sintaxis de
los 12 archivos de `/api`, de `app.js`, `index.html`, `admin.html` y
`styles.css`; búsqueda de variables/funciones declaradas más de una
vez; cruce de todos los `getElementById` contra los `id` reales del
HTML (274 referencias, ninguna rota); y una recorrida automatizada
por las pantallas principales (login, servicios, cronograma,
manuales, dashboards, guardias, historial, vehículos, SIMs) y por el
flujo completo de cargar un parte y firmarlo (incluida la validación
nueva de aclaración obligatoria) — **sin encontrar errores nuevos**.
De paso, se aprovechó para fusionar `foto.js` + `upload-foto.js` y
liberar una función (ver más abajo).

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
