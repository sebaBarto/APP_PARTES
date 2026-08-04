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
    default: { dias_atencion: 3, dias_urgente: 7, app_version_actual: "3.21.0", felicitacion_semanal_activa: true },
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
      const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
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
        const encontrado = (Array.isArray(tecnicos) ? tecnicos : []).find((t) => t.nombre === bodyAccion.nombre);
        const ok = !!encontrado && encontrado.password === bodyAccion.password;
        res.status(200).json({ ok });
      } catch (err) {
        res.status(500).json({ error: "Error interno al verificar" });
      }
      return;
    }
  }

  const nombreColeccion = req.query.coleccion;
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
