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
    default: { dias_atencion: 3, dias_urgente: 7, app_version_actual: "3.5.9" },
    mergeConDefault: true,
  },
  tecnicos: { path: "tecnicos.json", default: [] },
  materiales: { path: "materiales-catalogo.json", default: [] },
  "consultas-categorias": { path: "consultas-categorias.json", default: [] },
  guardias: { path: "guardias-config.json", default: { fecha_inicio_referencia: "", secuencia: [] } },
  credenciales: { path: "credenciales-config.json", default: [] },
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
};

module.exports = async (req, res) => {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!process.env.SERVICIOS_API_TOKEN || token !== process.env.SERVICIOS_API_TOKEN) {
    res.status(401).json({ error: "No autorizado" });
    return;
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
      res.status(200).json(coleccion.mergeConDefault ? { ...coleccion.default, ...content } : content);
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
      // borra las suscripciones de los demás.
      let contenidoAGuardar = body;
      if (nombreColeccion === "push-subscripciones") {
        const lista = Array.isArray(contenidoExistente) ? contenidoExistente : [];
        const yaExiste = lista.some((s) => s.endpoint === body.endpoint);
        contenidoAGuardar = yaExiste ? lista : [...lista, body];
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

      res.status(200).json({ ok: true, count: Array.isArray(body) ? body.length : undefined });
    } catch (err) {
      res.status(500).json({ error: `Error interno al guardar ${nombreColeccion}` });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
};
