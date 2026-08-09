# Documentación técnica completa — SAT APP_PARTES

Este documento existe para poder diagnosticar y reparar el sistema en el futuro, sin
depender de tener toda esta conversación a mano. Cubre la arquitectura completa, el
modelo de datos real, cada pieza del código, y las trampas ya conocidas.

Última actualización: v3.50.0 (agosto 2026).

---

## 1. Arquitectura general — las tres capas

```
[Celular del técnico / admin.html]
         │  (fetch a /api/...)
         ▼
[Vercel — funciones serverless]  ← "capa intermedia", habla los dos idiomas
         │  (fetch a BACKEND_NUEVO_URL)
         ▼
[Cloudflare Worker + D1 + R2]    ← donde vive el dato de verdad
```

**Por qué está armado así:** originalmente todo vivía en archivos JSON dentro de un
repositorio privado de GitHub, leído/escrito por las funciones de Vercel. Se migró todo
a una base de datos real (D1, en Cloudflare) para tener más velocidad, confiabilidad, y
sacarse de encima los límites de la API de GitHub. Para no tener que reescribir la app
del celular de una sola vez (alto riesgo), se hizo que **Vercel siga recibiendo los
mismos pedidos de siempre**, y por dentro reenvíe al backend nuevo — la app nunca se
enteró del cambio. Sacar a Vercel del medio del todo (para que el celular le hable
directo a Cloudflare) quedó **pendiente, a propósito** — es un paso de mayor riesgo que
no se justificaba hacer todavía (ver sección 9).

**Repositorios / proyectos:**
- `sebaBarto/APP_PARTES` (GitHub) → desplegado en Vercel → `app-partes-sat15.vercel.app`
  — la app en sí (index.html, app.js, admin.html, api/*.js).
- `sat-backend-d1` (proyecto separado, Cloudflare Workers) → Worker `sat-backend`,
  desplegado en `sat-backend.gsigalovsky.workers.dev`.
- Base de datos D1: `sat-servicios-db`.
- Bucket R2: `sat-archivos` (fotos, planos).
- `sync-local-planos-r2` — programa aparte que corre en la PC de la oficina (Programador
  de tareas de Windows, cada 1 hora), convierte los planos de Visio a PDF y los sube a R2.

---

## 2. Modelo de datos — D1 (Cloudflare)

**Importante:** varias tablas fueron creadas en una sesión de trabajo anterior, con
nombres de columna que **no coincidían** con lo que se armó de memoria más adelante. Cada
vez que hubo una duda, se confirmó con `PRAGMA table_info(nombre_tabla)` contra la base
real antes de tocar nada — la lista de abajo ya refleja la estructura REAL confirmada así,
no una suposición.

### Cómo confirmar la estructura real de cualquier tabla
```
npx wrangler d1 execute sat-servicios-db --command="PRAGMA table_info(nombre_tabla);" --remote
```

### Listado completo de tablas

| Tabla | Para qué es | Columnas clave |
|---|---|---|
| `config` | Config general (fila única, id=1) | `dias_atencion`, `dias_urgente`, `app_version_actual`, `felicitacion_semanal_activa` |
| `guardia_config` | Secuencia de guardia semanal (fila única) | `fecha_inicio_referencia`, `secuencia` (JSON), `ultima_semana_notificada` |
| `tecnicos` | Login y permisos | `nombre` (PK), `password_hash` (PBKDF2, ver sección 8), `permisos` (JSON), `en_calle` |
| `clientes` | Base de ~1185 clientes | `numero_cliente` (PK, 8 dígitos con ceros a la izquierda), `nombre`, `direccion`, `localidad`, `telefono`, `numero_abonado` |
| `materiales_catalogo` | Catálogo de materiales | `id`, `categoria`, `nombre` (⚠ no "modelo"), `precio` |
| `consultas_categorias` | Categorías del buscador con IA | `id`, `nombre` (⚠ no "categoria"), `manual_ref` (⚠ no "carpeta_drive_id" — mismo concepto, nombre distinto) |
| `credenciales` | Carnet/ficha de cada técnico (⚠ NO son usuarios/claves de sistemas, a pesar del nombre) | `id`, `nombre`, `dni`, `cargo`, `telefono_contacto`, `vigencia`, `foto_base64` |
| `servicios_emergencia` | Servicios fuera de horario | `id`, `cliente`, `direccion`, `telefono`, `tarea`, `fecha_deseada`, `hora_deseada`, `fecha_carga`, `cargado_por`, `revisado` |
| `push_subscripciones` | Suscripciones a notificaciones push | `endpoint` (PK real), `keys` (JSON string), `tecnico` |
| `vehiculos` (⚠ NO "vehiculos_config") | Config de cada vehículo | `nombre` (PK), `km_actual`, `umbrales` (JSON) |
| `vehiculos_historial` | Historial de uso + eventos | `id`, `vehiculo`, `tecnico`, `accion`, `fecha`, `hora_toma`, `hora_devolucion`, `km_devolucion`, `evento`, `detalle`, `monto`, `tipo_evento`, `km`, `hora` |
| `sims_stock` | SIMs en stock/en uso de un técnico | `numero` (PK), `empresa`, `tipo`, `tecnico_actual`, `tecnico_anterior`, `estado`, `cliente` |
| `sims_instaladas` | SIMs instaladas en un cliente | `numero` (PK), `numero_abonado`, `estado_linea`, `cliente`, `direccion`, `numero_cliente`, `fecha_activacion`, `empresa`, `tecnico_instalador` |
| `sims_historial` | Historial de movimientos de SIMs | `id`, `fecha`, `hora`, `numero`, `empresa`, `tecnico`, `accion`, `tecnico_nuevo`, `cliente`, `numero_servicio`, `cliente_anterior`, `sim_retirada`, `empresa_retirada` |
| `herramientas` (⚠ NO "herramientas_config") | Herramientas especiales (escaleras, notebook, etc.) | `nombre` (PK), `tipo`, `tecnico_actual`, `estado` (`libre`\|`uso`\|`cliente`), `cliente` |
| `herramientas_historial` | Historial de movimientos | `id`, `herramienta`, `tecnico`, `accion`, `fecha`, `hora`, `detalle`, `cliente` |
| `partes` (⚠ NO "partes_historial") | Historial de partes completados — **la tabla más grande y compleja** | `id` (PK, TEXT — antes "id_parte" del lado de la app), `numero_servicio`, `tipo_servicio`, `cliente`, `direccion`, `localidad`, `telefono`, `tarea`, `tecnico`, `tecnico_segundo` (⚠ antes "tecnico2"), `fecha`, `hora_entrada`, `hora_salida`, `es_instalacion`, `materiales`, `materiales_otros`, `sim_instalada_texto`, `observaciones`, `imprevisto`, `claves`, `importe`, `descuento_tipo`, `descuento_pct` (⚠ antes un solo campo "descuento"), `numero_presupuesto`, `costo_final`, `forma_pago`, `firma_aclaracion`, `firma_cargo`, `firma_img_ref`, `foto_ref`, `cliente_email`, `cliente_email_usado`, `estado_envio_oficina`, `intentos_envio_oficina`, `estado_envio_cliente`, `intentos_envio_cliente`, `ultimo_error_envio`, `creado_en`, `actualizado_en`, `pasado_sistema_offline`, `pasado_sistema_por`, `pasado_sistema_en` |
| `stock_movimientos` | Materiales instalados/retirados por servicio (nuevo, v3.47+) | `id`, `parte_id`, `numero_servicio`, `numero_cliente`, `cliente`, `direccion`, `fecha`, `hora`, `tecnico`, `categoria`, `modelo`, `cantidad_instalada`, `cantidad_retirada`, `pasado_sistema_offline`, `pasado_sistema_por`, `pasado_sistema_en` |
| `comodatos` | Contratos de comodato | `id`, `cliente`, `direccion`, `fecha`, `detalle` (JSON), `estado_envio` |
| `tecnico_credenciales_webauthn` | Huellas/Face ID registradas (v3.50+) | `id`, `tecnico`, `credential_id` (único), `public_key`, `counter`, `device_type`, `transports`, `nombre_dispositivo`, `creado_en`, `ultimo_uso_en` |
| `webauthn_desafios` | Challenges temporales de WebAuthn (se auto-limpian) | `tecnico` (PK), `challenge`, `tipo` (`registro`\|`login`), `creado_en` |

### Migraciones aplicadas (en orden)
`migracion_v2.sql` a `migracion_v10.sql`, todas en `/sat-backend-d1/`. `schema.sql` es la
versión "de cero" ya con TODOS los cambios incorporados — sirve como referencia de la
estructura final, pero **no hace falta volver a correrlo** en la base ya existente (usa
`CREATE TABLE IF NOT EXISTS`, no rompe nada, pero tampoco actualiza tablas viejas — para
eso son las migraciones numeradas).

**Planos**: no tienen tabla en D1 — son archivos PDF en el bucket R2 `sat-archivos`, bajo
el prefijo `planos/` (`CLI_XXXXXX.pdf`, `CLI_XXXXXX_2.pdf` si hay más de uno por cliente).
El estado de la última sincronización automática se guarda como
`planos/_estado_sincronizacion.json`.

---

## 3. Backend de Cloudflare — referencia de rutas

Proyecto: `/sat-backend-d1/`. Cada archivo en `src/routes/` es un recurso.

| Archivo | Monta en | Notas |
|---|---|---|
| `generico.js` | (fábrica reutilizada por varias rutas) | Dos variantes: `rutasDeLista` (colecciones tipo lista) y `rutasDeFilaUnica` (config/guardias). El flag `idAutoincremental` es importante — sin él, D1 puede fallar al insertar con `id=NULL` dentro de un `batch()` (ver sección 8). |
| `clientes.js` | `/api/clientes` | Incluye `DELETE /` (borra todo) y `DELETE /:numero_cliente` (borra uno). |
| `tecnicos.js` | `/api/tecnicos` | Login con PBKDF2. `POST /verificar` nunca expone el hash. |
| `webauthn.js` | `/api/tecnicos/webauthn` | Registro y login con huella/Face ID — ver sección 8. |
| `sims.js` | `/api/sims` | El más complejo — 7 acciones (`usar`, `devolver`, `transferir`, `reemplazar`, `retirar_de_registro`, `migrar_legacy_a_registro`, `blanquear_historial`). El permiso `sims_ver_todas` se chequea acá server-side. |
| `vehiculos.js` | `/api/vehiculos` | Acciones `tomar`/`devolver`/`evento`. El "evento" es un registro de historial APARTE (mismo patrón que dejar un vehículo tomado sin devolver, cuidado al filtrar "registro abierto"). |
| `herramientas.js` | `/api/herramientas` | Acciones `tomar`/`devolver`/`transferir`/`dejar_en_cliente`/`retirar_de_cliente`. |
| `partes.js` | `/api/partes` | Guardado con `ON CONFLICT(id) DO NOTHING` — evita duplicar si se reintenta el mismo parte. Incluye `/marcar-pasado-sistema`. |
| `stock.js` | `/api/stock` | `POST /` recibe `{parte_id, movimientos: [...]}` — borra los movimientos viejos de ese parte antes de insertar los nuevos (evita duplicar en reintentos). |
| `planos.js` | `/api/planos` | Lee/lista del bucket R2. `GET /estado-sincronizacion` (¡registrada ANTES de `/:nombre` en el código, si no el nombre "estado-sincronizacion" se interpretaría como un plano!). |
| `comodatos.js` | `/api/comodatos` | Simple, sin acciones especiales. |

**Todas las rutas exigen** `Authorization: Bearer <SERVICIOS_API_TOKEN>` — chequeado en
`src/index.js` con un middleware que corre antes que cualquier ruta.

**Cron Trigger**: `src/cron.js`, programado en `wrangler.toml` (`crons = ["0 12 * * 1"]`
— lunes 12:00 UTC = 9:00 Argentina). Manda el mail de cambio de guardia a Security24. El
cálculo de a quién le toca replica **a propósito** un ajuste de huso horario un poco
particular que ya tenía el sistema viejo — no "corregirlo" sin releer bien esa función,
cambiaría a quién le toca la guardia.

---

## 4. Funciones de Vercel — referencia

Límite duro: **12 funciones** en el plan gratuito. Por eso varias cosas comparten un
mismo archivo por dentro (con un parámetro que decide qué hacer), en vez de tener un
archivo por función.

| Archivo | Qué hace | Comparte con |
|---|---|---|
| `datos.js` | Endpoint genérico `/api/datos?coleccion=X` — algunas colecciones ya redirigen al backend nuevo (ver `COLECCIONES_YA_CORTADAS`), el resto sigue en GitHub. También el login (`verificar_login`, con migración perezosa — sección 8) y las 5 acciones de WebAuthn. | — |
| `recurso-uso.js` | `?recurso=vehiculo\|sim\|herramienta` — tomar/devolver/etc. de los tres. Los tres ya hablan con el backend nuevo. | — |
| `historial.js` | Guarda/lee el historial de partes (traduce nombres de campo, ver sección 8). También `?tipo=stock` para el historial de stock, y las acciones de "marcar pasado a sistema" (para partes y para stock). | Stock |
| `foto.js` | GET/POST de fotos (repo GitHub, carpeta `fotos/`) | Antes eran 2 funciones |
| `comodato.js` | Genera el PDF de comodato y lo manda por mail | — |
| `enviar-mail.js` | Manda los mails de partes (SMTP directo, cuenta propia) | — |
| `cron-diario.js` | Avisos push diarios (vehículos con mantenimiento vencido) — el aviso de guardia se movió al Cron Trigger de Cloudflare | — |
| `cronograma.js` | Sincroniza el cronograma semanal desde Google Drive | — |
| `consultas.js` | Responde preguntas con IA (Gemini) en base a manuales en Drive | — |
| `geocode.js` | Geocodifica direcciones (Nominatim/OpenStreetMap), con caché | — |
| `planos.js` | Ya reenvía todo al backend nuevo (R2) — antes leía de Drive | — |
| `servicios.js` | Servicios pendientes (siguen en GitHub, no migrados) | — |

**`COLECCIONES_YA_CORTADAS`** (en `datos.js`): `clientes`, `materiales`, `credenciales`,
`consultas-categorias`, `config`, `guardias`, `push-subscripciones`,
`servicios_emergencia`, `vehiculos`, `herramientas`, `sims`, `sims_instaladas`. Todo lo
que NO está en esta lista todavía lee/escribe GitHub directamente (ej: `tecnicos` como
colección de lista sigue en GitHub, aunque el LOGIN en sí ya usa el backend nuevo primero
— son dos cosas separadas).

**`lib/`**: `google-auth.js` (token de la cuenta de servicio de Google, reutilizado por
varios), `push-sender.js` (envío de Web Push — lee las suscripciones del backend nuevo,
no de GitHub, desde v3.39), `pdf-comodato.js`, `cronograma-parser.js`.

---

## 5. Frontend — estructura de `app.js` (la app del técnico)

Es un solo archivo de ~6300 líneas, organizado en bloques con comentarios
`// ---------- Nombre de la sección ----------`. Los principales, en orden:

1. **Constantes y helpers generales** (`SERVICIOS_API_TOKEN`, `VAPID_PUBLIC_KEY`,
   `showScreen`, `showToast`, `escapeHtml`, `normalizeText` — quita tildes/mayúsculas
   para comparar texto).
2. **Login** — incluye WebAuthn (huella/Face ID) desde v3.50.
3. **Servicios pendientes / formulario de parte** — el corazón de la app. Acá vive el
   selector de materiales (usados y retirados, ambos estructurados desde v3.47),
   `armarMovimientosDeStock()` (junta usados+retirados en un solo array antes de mandar).
4. **Historial** (pantalla), con filtros por período y el tilde de "pasado a mi sistema".
5. **Historial de Stock** (pantalla nueva, v3.47).
6. **Vehículos** (tomar/devolver/evento) y su **Dashboard**.
7. **Herramientas** (tomar/devolver/etc.) y su **Dashboard** (v3.42).
8. **SIMs** (usar/devolver/transferir/reemplazar) — el buscador de cliente por texto
   (v3.44) reemplazó un desplegable viejo.
9. **Cronograma**.
10. **Emergencias**.
11. **Comodato**.
12. **Consultas (IA)**.
13. **Credencial digital** — incluye la sección "Seguridad de acceso" (activar huella).
14. **Dashboards financiero/general**.
15. **Planos**.

### Variables globales / cachés importantes
- `tecnicoLogueado` — nombre del técnico actual (`""` = login general de oficina).
- `tecnicosPermisos` — mapa `{nombre: {permisos...}}`, cacheado en `localStorage`.
- `clientesGeneralCache` — la base completa de Clientes, **se precarga al iniciar
  sesión** (no solo al entrar a SIMs/Emergencias) desde v3.48.1, para que esté lista en
  cualquier pantalla que la necesite (ej: Stock, para buscar el número de cliente).
- `historialCache` — el historial de partes, para "última visita" y filtros.
- `materialesCatalogo` — categorías + modelos, para los selectores de materiales.
- `materialesAgregados` / `materialesRetiradosAgregados` — arrays temporales del
  formulario de parte en curso.
- `simsRegistroCache`, `simsCompletos` — cachés de SIMs.

### `permisosDelTecnico(nombre)`
Función central que devuelve el objeto de permisos de un técnico. Tiene 3 casos:
1. Login general de oficina (`nombre === ""`) → todos los permisos en `true`.
2. Ya tiene permisos guardados en `tecnicosPermisos` → se usan tal cual (cualquier
   casilla ausente cuenta como `false`).
3. Técnico viejo sin permisos explícitos todavía → un set de valores por defecto
   (algunos restringidos solo a "Sebastian Bartolozzi", como `dash_financiero`,
   `marcar_pasado_sistema`, `dash_stock`).

---

## 6. Sistema de permisos — lista completa

Definidos en `admin.html` (`PERMISOS_TECNICO`), leídos en `app.js` vía
`permisosDelTecnico()`.

| Clave | Qué habilita |
|---|---|
| `dash_general` | Dashboard general |
| `dash_financiero` | Dashboard financiero |
| `dash_vehiculos` | Dashboard de vehículos |
| `dash_herramientas` | Dashboard de herramientas |
| `dash_sims` | Dashboard de SIMs |
| `dash_stock` | Historial de Stock |
| `historial_todos` | Ver el historial de TODO el equipo (si no, solo lo propio) |
| `marcar_pasado_sistema` | Tildar partes/stock como "pasado a mi sistema" (uso de oficina) |
| `vehiculos` | Acceso a la sección Vehículos |
| `sims` | Acceso a la sección SIMs |
| `sims_ver_todas` | Operar SIMs de otros técnicos, no solo las propias (chequeado también server-side) |
| `herramientas` | Acceso a la sección Herramientas |
| `comodato` | Acceso a Comodato |
| `agendar_emergencia` | Cargar servicios de emergencia |
| `admin` | Entrar a `admin.html` |

---

## 7. Variables de entorno

### En Vercel (Project Settings → Environment Variables)
| Variable | Para qué |
|---|---|
| `SERVICIOS_API_TOKEN` | Token que usan la app y `admin.html` para autenticarse contra las funciones de Vercel |
| `BACKEND_NUEVO_URL` | `https://sat-backend.gsigalovsky.workers.dev` |
| `BACKEND_NUEVO_TOKEN` | Token para que Vercel se autentique contra el backend nuevo |
| `ADMIN_PASSWORD` | Contraseña del login general de oficina |
| `GITHUB_DATA_TOKEN`, `GITHUB_DATA_REPO` | Acceso al repo privado de datos (lo que todavía no se cortó, + respaldo de login) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Cuenta de servicio de Google (Cronograma, Consultas IA) |
| `CRONOGRAMA_DRIVE_FILE_ID` | Archivo de Drive del cronograma |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `OFICINA_EMAIL` | Envío de mails (partes, comodato) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notificaciones push |
| `CRON_SECRET` | Protege `cron-diario.js` de Vercel |

### En Cloudflare (Worker `sat-backend`, vía `wrangler secret put`)
| Variable | Para qué |
|---|---|
| `SERVICIOS_API_TOKEN` | Mismo valor que en Vercel — autentica los pedidos entrantes |
| `RESEND_API_KEY`, `EMAIL_FROM` | Mail de cambio de guardia (Cron Trigger) |
| `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN` | Dominio de la app (para validar las credenciales de huella/Face ID) — si la app cambia de dominio, esto hay que actualizarlo |

---

## 8. Lecciones aprendidas / trampas ya conocidas

Esta sección existe específicamente para no repetir los mismos tropiezos.

**Los nombres de tabla/columna reales pueden NO coincidir con lo que parece lógico.**
Varias tablas (`vehiculos`, `herramientas`, `partes`, `materiales_catalogo`,
`credenciales`, `consultas_categorias`) fueron creadas en una sesión anterior con
nombres distintos a los que se armaron de memoria después. **Antes de escribir código
nuevo contra una tabla existente, correr `PRAGMA table_info(tabla)` para confirmar.**

**Insertar con `id=NULL` explícito en un `batch()` de D1 puede fallar.** Para tablas con
`id INTEGER PRIMARY KEY AUTOINCREMENT` sin una clave natural propia, nunca hay que
mencionar la columna `id` en el INSERT — dejar que se asigne sola (ver el flag
`idAutoincremental` en `generico.js`).

**"Acción" y "config" son cosas separadas — cortar una sin la otra deja datos
desactualizados.** Pasó dos veces (vehículos/herramientas primero, con SIMs se corrigió
de entrada): si se corta la ACCIÓN de tomar/devolver algo hacia el backend nuevo pero la
LECTURA del estado actual sigue en GitHub, el estado que ve el usuario queda
congelado/viejo. Siempre cortar las dos cosas juntas.

**Reintentar el mismo script de migración sobre colecciones sin clave natural
duplica.** `materiales`, `credenciales`, `consultas_categorias` no tenían protección
contra esto — se les agregó un endpoint `DELETE /` para vaciar antes de recargar, y el
script de re-sincronización ahora lo usa automáticamente.

**Búsquedas de texto deben ignorar tildes/mayúsculas.** Un cliente guardado como
"Bartolozzi Sebastián" (con tilde) no aparecía al buscar "Bartolozzi Sebastian" (sin
tilde) — la función `normalizeText()` resuelve esto, usarla en cualquier comparación de
nombres.

**Migración perezosa de contraseñas (login).** Las contraseñas del sistema viejo estaban
en texto plano (comparación `===`). El login ahora prueba primero contra el hash real en
D1 (PBKDF2); si no coincide, cae al sistema viejo como respaldo, y si ESE funciona,
aprovecha para guardar el hash correcto en D1 — sin pedirle nada al técnico. Ver
`api/datos.js`, acción `verificar_login`. Esto significa que, con el tiempo, TODOS los
técnicos terminan migrados solos, con solo usar la app normalmente.

**WebAuthn — el dominio (`rpID`/`origin`) tiene que ser el de la APP** (donde corre el
navegador), no el del backend. Si el dominio de Vercel cambia alguna vez, hay que
actualizar `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` en Cloudflare, si no las huellas ya
activadas dejan de funcionar.

**PowerShell: `ConvertTo-Json` con un array de un solo elemento a veces lo "desarma"**
y manda un objeto suelto en vez de una lista de un elemento — al probar cosas a mano
desde PowerShell, mejor armar el JSON como texto directo (`'[{"a":1}]'`) en vez de
confiar en `ConvertTo-Json`.

**Node.js en Windows: si hay más de un `package.json` en carpetas superiores con
`"type": "module"`, un script CommonJS en una subcarpeta sin su propio `package.json`
puede fallar con "require is not defined".** Solución: cada carpeta de scripts
(`resincronizar-todo`, etc.) tiene su propio `package.json` chico, sin `"type": "module"`.

**Tareas programadas de Windows a veces no encuentran `node.exe` por su nombre solo**
(corren en un contexto distinto al de la sesión normal) — usar la ruta completa
(`(Get-Command node.exe).Source`), como se hizo en `sync-local-planos-r2/INSTALAR.md`.

---

## 9. Procedimientos de despliegue

### Backend (Cloudflare) — cuando se tocó código o hace falta una migración nueva
```
cd sat-backend-d1
npm install                                                             # si hay dependencias nuevas
npx wrangler d1 execute sat-servicios-db --file=migracion_vN.sql --remote  # si hay migración nueva
npx wrangler deploy
```

### App (Vercel) — se despliega solo al hacer push a `main` en GitHub
```
git add -A
git commit -m "..."
git push origin main
```

### Después de cualquier cambio de versión
Actualizar `APP_VERSION` en `app.js`, `app_version_actual` en el default de `config` en
`api/datos.js` (documentación, ya no sirve en vivo), `CACHE_NAME` en `sw.js`, **y** el
valor real en la base nueva:
```powershell
Invoke-RestMethod -Uri "https://sat-backend.gsigalovsky.workers.dev/api/config" -Method Post -Headers @{Authorization="Bearer <SERVICIOS_API_TOKEN>"; "Content-Type"="application/json"} -Body '{"dias_atencion":3,"dias_urgente":7,"app_version_actual":"X.Y.Z","felicitacion_semanal_activa":true}'
```

### Pendiente, no urgente
- **Sacar a Vercel del medio del todo** (que el celular hable directo con Cloudflare) —
  evaluado, decidido posponer: significaría reescribir ~100 puntos de la app y varias
  funciones con lógica propia de Node (mails, PDF, geocodificación, IA) que no
  necesariamente funcionan igual en el motor de Cloudflare Workers. El límite de 12
  funciones de Vercel hoy no está frenando nada concreto.
- **Migrar `servicios_emergencia`... ya migrado.** (revisar si queda algo suelto en
  `servicios.js`, que sigue en GitHub — servicios pendientes en sí, no confundir con
  emergencias).

---

## 10. Diagnóstico rápido — por dónde empezar según el síntoma

| Síntoma | Revisar primero |
|---|---|
| "Ese dato no se guardó" | ¿La colección está en `COLECCIONES_YA_CORTADAS`? Si sí, revisar el backend nuevo (`wrangler d1 execute ... --command="SELECT..."`). Si no, sigue en GitHub. |
| "Veo datos viejos después de una acción" | ¿La ACCIÓN se cortó pero la LECTURA de config no? (ver lección en sección 8) |
| "Un cliente/nombre no aparece al buscar" | ¿La búsqueda usa `normalizeText()`? Revisar tildes/mayúsculas. |
| "Alguien no puede entrar" | Revisar `verificar_login` en `api/datos.js` — confirmar que el fallback a GitHub sigue funcionando, y que `BACKEND_NUEVO_URL`/`TOKEN` están bien configurados en Vercel. |
| "La huella dejó de funcionar" | ¿Cambió el dominio de la app? Revisar `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` en Cloudflare. |
| "El mail de guardia no llegó" | Revisar el Cron Trigger en Cloudflare (`wrangler tail` para ver logs en vivo), y `RESEND_API_KEY` configurado. |
| "Los planos no se actualizan" | Revisar `admin.html` → pestaña Planos → estado de sincronización. Si dice "hace más de 3 horas", la PC de la oficina puede estar apagada o sin conexión — revisar la tarea programada de Windows y `sync.log`. |
| "Error 500 al guardar algo" | Casi siempre es un nombre de columna/tabla que no coincide — confirmar con `PRAGMA table_info()` antes de asumir. |
