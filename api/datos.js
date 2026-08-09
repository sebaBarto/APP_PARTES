// Función serverless de Vercel — endpoint genérico que reemplaza a
// varios endpoints chicos que hacían básicamente lo mismo (leer/guardar
// un archivo de configuración en el repo privado de datos). Se
// consolidaron acá para no pasarse del límite de funciones serverless
// del plan gratuito de Vercel (12 por proyecto).
//
// Uso: /api/datos?coleccion=<nombre>  (ver COLECCIONES abajo)
//
// Variables de entorno reutilizadas:
//   SERVICIOS_API_TOKEN, GITHUB_DATA_TOKEN, GITHUB_DATA_REPO

const COLECCIONES = {
  config: {
    path: "config.json",
    default: { dias_atencion: 3, dias_urgente: 7, app_version_actual: "3.38.0", felicitacion_semanal_activa: true },
    mergeConDefault: true,
  },
  tecnicos: { path: "tecnicos.json", default: [] },
  clientes: { path: "clientes-config.json", default: [] },
  materiales: { path: "materiales-catalogo.json", default: [] },
  "consultas-categorias": { path: "consultas-categorias.json", default: [] },
  guardias: { path: "guardias-config.json", default: { fecha_inicio_referencia: "", secuencia: [] } },
  credenciales: { path: "credenciales-config.json", default: [] },
  servicios_emergencia: { path: "servicios-emergencia.json", default: [] },
  vehiculos: {
    path: "vehiculos-config.json",
    default: [
      { nombre: "Renault Kangoo Blanca", km_actual: 0, umbrales: [] },
      { nombre: "Renault Kangoo Gris", km_actual: 0, umbrales: [] },
      { nombre: "Moto", km_actual: 0, umbrales: [] },
    ],
  },
  "push-subscripciones": { path: "push-subscripciones.json", default: [] },
  sims: { path: "sims-config.json", default: [] },
  herramientas: { path: "herramientas-config.json", default: [] },
  sims_instaladas: { path: "sims-instaladas.json", default: [] },
};

// Traduce cada colección que ya se cortó al backend nuevo — algunas
// tienen exactamente la misma forma de datos en los dos lados (esas
// son un simple reenvío), y otras dos (materiales y categorías de
// consultas) tienen una forma distinta, así que hay que armar/
// desarmar la estructura de un lado al otro.
async function manejarColeccionCortada(nombreColeccion, metodo, body, backendUrl, headers) {
  if (nombreColeccion === "clientes") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/clientes`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      // admin.html manda POST con lista vacía para "borrar todos"
      // (así funcionaba con el sistema viejo) — se traduce a DELETE.
      if (Array.isArray(body) && body.length === 0) {
        const r = await fetch(`${backendUrl}/api/clientes`, { method: "DELETE", headers });
        return { status: r.status, data: await r.json() };
      }
      const r = await fetch(`${backendUrl}/api/clientes`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: r.status, data: await r.json() };
    }
  }

  if (nombreColeccion === "materiales") {
    // GitHub: [{categoria, modelos: [...]}]  <->  backend nuevo: [{id, categoria, nombre, precio}]
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/materiales`, { headers });
      const filas = await r.json();
      const porCategoria = {};
      (Array.isArray(filas) ? filas : []).forEach((f) => {
        if (!porCategoria[f.categoria]) porCategoria[f.categoria] = [];
        porCategoria[f.categoria].push(f.nombre);
      });
      const agrupado = Object.keys(porCategoria).map((categoria) => ({ categoria, modelos: porCategoria[categoria] }));
      return { status: r.status, data: agrupado };
    }
    if (metodo === "POST") {
      const filas = [];
      (Array.isArray(body) ? body : []).forEach((cat) => {
        (cat.modelos || []).forEach((modelo) => filas.push({ categoria: cat.categoria, nombre: modelo, precio: null }));
      });
      const r = await fetch(`${backendUrl}/api/materiales`, { method: "POST", headers, body: JSON.stringify(filas) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  if (nombreColeccion === "consultas-categorias") {
    // GitHub: [{categoria, carpeta_drive_id}]  <->  backend nuevo: [{id, nombre, manual_ref}]
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/consultas-categorias`, { headers });
      const filas = await r.json();
      const traducido = (Array.isArray(filas) ? filas : []).map((f) => ({ categoria: f.nombre, carpeta_drive_id: f.manual_ref }));
      return { status: r.status, data: traducido };
    }
    if (metodo === "POST") {
      const filas = (Array.isArray(body) ? body : []).map((c) => ({ nombre: c.categoria, manual_ref: c.carpeta_drive_id }));
      const r = await fetch(`${backendUrl}/api/consultas-categorias`, { method: "POST", headers, body: JSON.stringify(filas) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  if (nombreColeccion === "credenciales") {
    // Misma forma en los dos lados — reenvío directo.
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/credenciales`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/credenciales`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  if (nombreColeccion === "config") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/config`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/config`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: r.status, data: await r.json() };
    }
  }

  if (nombreColeccion === "guardias") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/guardias`, { headers });
      const data = await r.json();
      // ultima_semana_notificada es un dato interno del backend
      // nuevo (para no mandar el mail dos veces la misma semana) —
      // la app no lo necesita, se lo saca antes de devolverlo.
      if (data && typeof data === "object") delete data.ultima_semana_notificada;
      // "secuencia" se guarda como texto (JSON) en la base nueva —
      // hay que convertirlo de vuelta a lista antes de devolverlo,
      // si no la app recibe un texto plano en vez de un array.
      if (data && typeof data.secuencia === "string") {
        try { data.secuencia = JSON.parse(data.secuencia); } catch (err) { data.secuencia = []; }
      }
      return { status: r.status, data };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/guardias`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: r.status, data: await r.json() };
    }
  }

  if (nombreColeccion === "push-subscripciones") {
    // La app manda UN objeto (no una lista) — se agrega o actualiza
    // por endpoint, nunca se reemplaza la lista entera (así un
    // celular nuevo no borra las suscripciones de los demás).
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/push-subscripciones`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/push-subscripciones`, { method: "POST", headers, body: JSON.stringify([body]) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok } };
    }
  }

  if (nombreColeccion === "servicios_emergencia") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/emergencias`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      // La app manda la lista completa (viejas + nuevas) — como acá
      // no hay una clave natural para "actualizar por id", se vacía
      // y se vuelve a cargar todo entero, para no duplicar. Antes de
      // vaciar, se compara con lo que ya había (por cliente + fecha
      // de carga, ya que el id viejo no es el mismo que genera la
      // base nueva) para avisarle a todo el equipo de las que son
      // realmente nuevas — igual que hacía el sistema viejo.
      const rExistentes = await fetch(`${backendUrl}/api/emergencias`, { headers });
      const existentes = await rExistentes.json();
      const clavesExistentes = new Set((Array.isArray(existentes) ? existentes : []).map((e) => `${e.cliente}|${e.fecha_carga}`));
      const nuevas = (Array.isArray(body) ? body : []).filter((e) => !clavesExistentes.has(`${e.cliente}|${e.fecha_carga}`));

      await fetch(`${backendUrl}/api/emergencias`, { method: "DELETE", headers });
      const r = await fetch(`${backendUrl}/api/emergencias`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();

      if (nuevas.length > 0) {
        try {
          const { enviarATodos } = require("../lib/push-sender");
          for (const entrada of nuevas) {
            await enviarATodos({
              titulo: "🚨 Servicio de emergencia agendado",
              cuerpo: `${entrada.cargado_por || "Alguien"} cargó un servicio para ${entrada.cliente || "un cliente"}${entrada.fecha_deseada ? " el " + entrada.fecha_deseada : ""} — revisalo en Cronograma.`,
              url: "/",
            });
          }
        } catch (errPush) {
          // si falla el envío del aviso, no se rompe el guardado en sí
        }
      }
      return { status: r.status, data: { ok: data.ok, count: Array.isArray(body) ? body.length : undefined } };
    }
  }

  if (nombreColeccion === "vehiculos") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/vehiculos`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/vehiculos`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  if (nombreColeccion === "herramientas") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/herramientas`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/herramientas`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  if (nombreColeccion === "sims") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/sims`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/sims`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  if (nombreColeccion === "sims_instaladas") {
    if (metodo === "GET") {
      const r = await fetch(`${backendUrl}/api/sims/instaladas`, { headers });
      return { status: r.status, data: await r.json() };
    }
    if (metodo === "POST") {
      const r = await fetch(`${backendUrl}/api/sims/instaladas`, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await r.json();
      return { status: r.status, data: { ok: data.ok, count: data.count } };
    }
  }

  return { status: 405, data: { error: "Método no permitido" } };
}

module.exports = async (req, res) => {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!process.env.SERVICIOS_API_TOKEN || token !== process.env.SERVICIOS_API_TOKEN) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  // Verificación de contraseñas — se hace acá adentro, del lado del
  // servidor, y nunca se le devuelve ninguna contraseña al que
  // pregunta (ni siquiera la propia): solo si coincide o no. Antes,
  // el celular bajaba la lista completa de técnicos CON sus
  // contraseñas y comparaba él mismo — cualquiera con el token de la
  // app (visible en el código) podía leer la lista completa.
  if (req.method === "POST") {
    let bodyAccion = req.body;
    if (typeof bodyAccion === "string") {
      try { bodyAccion = JSON.parse(bodyAccion); } catch (err) { bodyAccion = null; }
    }
    if (bodyAccion && bodyAccion.accion === "verificar_admin") {
      const ok = !!process.env.ADMIN_PASSWORD && bodyAccion.password === process.env.ADMIN_PASSWORD;
      res.status(200).json({ ok });
      return;
    }
    if (bodyAccion && bodyAccion.accion === "verificar_login") {
      const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN, GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
      const nombre = bodyAccion.nombre;
      const password = bodyAccion.password;

      // 1) Primero se intenta contra el backend nuevo (hash real,
      // PBKDF2) — es lo que va a pasar siempre después de la primera
      // vez que cada técnico entre tras este cambio.
      if (BACKEND_NUEVO_URL && BACKEND_NUEVO_TOKEN) {
        try {
          const rNuevo = await fetch(`${BACKEND_NUEVO_URL}/api/tecnicos/verificar`, {
            method: "POST",
            headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ nombre, password }),
          });
          if (rNuevo.status === 200) {
            const dataNuevo = await rNuevo.json();
            if (dataNuevo.ok) {
              res.status(200).json({ ok: true });
              return;
            }
          }
          // rNuevo.status === 401 (no coincide, o el técnico no
          // existe ahí todavía) -> sigue de largo al paso 2, no se
          // corta acá.
        } catch (errNuevo) {
          // si el backend nuevo no responde, no se bloquea el login
          // — se sigue con el sistema viejo como respaldo.
        }
      }

      // 2) Si no coincidió con el backend nuevo, se prueba contra el
      // sistema viejo (texto plano) — cubre a cualquiera que haya
      // cambiado su contraseña después de la migración original, o
      // que sea nuevo y todavía no tenga hash guardado allá.
      if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
        res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" });
        return;
      }
      try {
        const url = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${COLECCIONES.tecnicos.path}`;
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${GITHUB_DATA_TOKEN}`, Accept: "application/vnd.github+json" },
        });
        let tecnicos = [];
        if (r.ok) {
          const data = await r.json();
          tecnicos = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
        }
        const encontrado = (Array.isArray(tecnicos) ? tecnicos : []).find((t) => t.nombre === nombre);
        const ok = !!encontrado && encontrado.password === password;

        // 3) Si coincidió acá, de paso se guarda el hash correcto en
        // el backend nuevo — así la próxima vez ya entra directo por
        // el paso 1, sin pasar más por acá. Si esto falla, no importa
        // — el login ya funcionó, se reintenta la próxima vez.
        if (ok && BACKEND_NUEVO_URL && BACKEND_NUEVO_TOKEN) {
          fetch(`${BACKEND_NUEVO_URL}/api/tecnicos`, {
            method: "POST",
            headers: { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify([{ nombre, password, permisos: encontrado.permisos || {} }]),
          }).catch(() => {});
        }

        res.status(200).json({ ok });
      } catch (err) {
        res.status(500).json({ error: "Error interno al verificar" });
      }
      return;
    }

    // ---------- Huella digital / Face ID (WebAuthn) — simples reenvíos al backend nuevo ----------
    const ACCIONES_WEBAUTHN = {
      webauthn_tiene_credencial: "GET:/api/tecnicos/webauthn/tiene-credencial?nombre=",
      webauthn_registro_opciones: "POST:/api/tecnicos/webauthn/registro/opciones",
      webauthn_registro_verificar: "POST:/api/tecnicos/webauthn/registro/verificar",
      webauthn_login_opciones: "POST:/api/tecnicos/webauthn/login/opciones",
      webauthn_login_verificar: "POST:/api/tecnicos/webauthn/login/verificar",
    };
    if (bodyAccion && ACCIONES_WEBAUTHN[bodyAccion.accion]) {
      const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
      if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
        res.status(500).json({ error: "Faltan variables de entorno del backend nuevo por configurar en Vercel" });
        return;
      }
      const headersBackendNuevo = { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" };
      const [metodo, ruta] = ACCIONES_WEBAUTHN[bodyAccion.accion].split(":");
      try {
        const url = metodo === "GET"
          ? `${BACKEND_NUEVO_URL}${ruta}${encodeURIComponent(bodyAccion.nombre || "")}`
          : `${BACKEND_NUEVO_URL}${ruta}`;
        const r = await fetch(url, {
          method: metodo,
          headers: headersBackendNuevo,
          body: metodo === "GET" ? undefined : JSON.stringify(bodyAccion),
        });
        const data = await r.json();
        res.status(r.status).json(data);
      } catch (err) {
        res.status(500).json({ error: "Error interno al hablar con el backend nuevo" });
      }
      return;
    }
  }

  const nombreColeccion = req.query.coleccion;

  // --- CORTE EN CURSO: estas colecciones ya viven en el backend nuevo (Cloudflare) ---
  // El resto sigue en GitHub por ahora; se van cortando de a una,
  // probando cada una antes de seguir con la próxima. La app en el
  // celular no cambia en nada — sigue pidiendo lo mismo de siempre.
  const COLECCIONES_YA_CORTADAS = ["clientes", "materiales", "credenciales", "consultas-categorias", "config", "guardias", "push-subscripciones", "servicios_emergencia", "vehiculos", "herramientas", "sims", "sims_instaladas"];
  if (COLECCIONES_YA_CORTADAS.includes(nombreColeccion)) {
    const { BACKEND_NUEVO_URL, BACKEND_NUEVO_TOKEN } = process.env;
    if (!BACKEND_NUEVO_URL || !BACKEND_NUEVO_TOKEN) {
      res.status(500).json({ error: "Faltan variables de entorno del backend nuevo por configurar en Vercel" });
      return;
    }
    const headersBackendNuevo = { Authorization: `Bearer ${BACKEND_NUEVO_TOKEN}`, "Content-Type": "application/json" };

    try {
      let body = null;
      if (req.method === "POST") {
        body = req.body;
        if (typeof body === "string") body = JSON.parse(body);
      }
      const resultado = await manejarColeccionCortada(nombreColeccion, req.method, body, BACKEND_NUEVO_URL, headersBackendNuevo);
      if (req.method === "GET") res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.status(resultado.status).json(resultado.data);
    } catch (err) {
      res.status(500).json({ error: "Error interno al hablar con el backend nuevo", detalle: String(err.message || err) });
    }
    return;
  }
  // --- fin del corte ---

  const coleccion = COLECCIONES[nombreColeccion];
  if (!coleccion) {
    res.status(400).json({ error: "Colección desconocida", validas: Object.keys(COLECCIONES) });
    return;
  }

  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
    res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" });
    return;
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${coleccion.path}`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_DATA_TOKEN}`,
    Accept: "application/vnd.github+json",
  };

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    try {
      const r = await fetch(apiUrl, { headers: ghHeaders });
      if (r.status === 404) {
        res.status(200).json(coleccion.default);
        return;
      }
      if (!r.ok) {
        res.status(502).json({ error: `No se pudo leer ${nombreColeccion}` });
        return;
      }
      const data = await r.json();
      const content = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
      let resultado = coleccion.mergeConDefault ? { ...coleccion.default, ...content } : content;
      if (nombreColeccion === "tecnicos" && Array.isArray(resultado)) {
        resultado = resultado.map((t) => {
          const { password, ...resto } = t;
          return resto;
        });
      }
      res.status(200).json(resultado);
    } catch (err) {
      res.status(500).json({ error: `Error interno al leer ${nombreColeccion}` });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      if (body === undefined || body === null) {
        res.status(400).json({ error: "Falta el contenido a guardar" });
        return;
      }

      let sha;
      const existing = await fetch(apiUrl, { headers: ghHeaders });
      let contenidoExistente = coleccion.default;
      if (existing.ok) {
        const existingData = await existing.json();
        sha = existingData.sha;
        contenidoExistente = JSON.parse(Buffer.from(existingData.content, "base64").toString("utf-8"));
      }

      // Las suscripciones push se agregan (sin duplicar por endpoint),
      // nunca se reemplaza la lista entera — así un celular nuevo no
      // borra las suscripciones de los demás. Si el mismo celular ya
      // estaba suscripto pero ahora lo usa otro técnico (cambió de
      // mano), se actualiza a quién pertenece en vez de dejarlo
      // desactualizado.
      let contenidoAGuardar = body;
      let entradasEmergenciaNuevas = [];
      if (nombreColeccion === "servicios_emergencia" && Array.isArray(body)) {
        const existentes = Array.isArray(contenidoExistente) ? contenidoExistente : [];
        const idsExistentes = new Set(existentes.map((e) => e.id));
        entradasEmergenciaNuevas = body.filter((e) => !idsExistentes.has(e.id));
      }
      if (nombreColeccion === "tecnicos" && Array.isArray(body)) {
        const existentes = Array.isArray(contenidoExistente) ? contenidoExistente : [];
        contenidoAGuardar = body.map((t) => {
          if (t.password) return t; // se escribió una clave nueva -> se usa esa
          const previo = existentes.find((x) => x.nombre === t.nombre);
          return { ...t, password: previo ? previo.password : "" };
        });
      }
      if (nombreColeccion === "push-subscripciones") {
        const lista = Array.isArray(contenidoExistente) ? contenidoExistente : [];
        const idx = lista.findIndex((s) => s.endpoint === body.endpoint);
        if (idx === -1) {
          contenidoAGuardar = [...lista, body];
        } else {
          const copia = [...lista];
          copia[idx] = { ...copia[idx], tecnico: body.tecnico };
          contenidoAGuardar = copia;
        }
      }

      const contentB64 = Buffer.from(JSON.stringify(contenidoAGuardar, null, 2)).toString("base64");
      const putRes = await fetch(apiUrl, {
        method: "PUT",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Actualiza ${nombreColeccion} (${new Date().toISOString()})`,
          content: contentB64,
          sha,
        }),
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        res.status(502).json({ error: `No se pudo guardar ${nombreColeccion}`, detail: errText });
        return;
      }

      // Si se acaba de cargar un servicio de emergencia nuevo, se
      // avisa a todo el equipo — puede ser relevante para cualquiera
      // que esté revisando la agenda, no solo para quien lo cargó.
      if (entradasEmergenciaNuevas.length > 0) {
        try {
          const { enviarATodos } = require("../lib/push-sender");
          for (const entrada of entradasEmergenciaNuevas) {
            await enviarATodos({
              titulo: "🚨 Servicio de emergencia agendado",
              cuerpo: `${entrada.cargado_por || "Alguien"} cargó un servicio para ${entrada.cliente || "un cliente"}${entrada.fecha_deseada ? " el " + entrada.fecha_deseada : ""} — revisalo en Cronograma.`,
              url: "/",
            });
          }
        } catch (errPush) {
          // si falla el envío del aviso, no se rompe el guardado en sí
        }
      }

      res.status(200).json({ ok: true, count: Array.isArray(body) ? body.length : undefined });
    } catch (err) {
      res.status(500).json({ error: `Error interno al guardar ${nombreColeccion}` });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
};
