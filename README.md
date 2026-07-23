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

## Antes de publicarla: configurar EmailJS (2 plantillas)

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

## Publicar en Vercel

- Ya no hace falta ninguna variable de entorno (se sacó la dependencia de
  la API de Anthropic — no hay más lectura de fotos).
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
