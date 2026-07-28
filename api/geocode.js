// Función serverless de Vercel — convierte direcciones en coordenadas
// (lat/lon) usando Nominatim (el geocodificador gratuito de
// OpenStreetMap), con caché en el repo privado de datos para no volver
// a buscar la misma dirección dos veces y respetar el límite de uso
// gratuito (máximo 1 pedido por segundo a Nominatim).
//
// Variables de entorno reutilizadas:
//   SERVICIOS_API_TOKEN, GITHUB_DATA_TOKEN, GITHUB_DATA_REPO

const CACHE_PATH = "geocode-cache.json";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// Nominatim pide identificar la app en el User-Agent (política de uso).
const USER_AGENT = "SAT-partes-tecnicos-app/1.0 (uso interno, contacto: ventas@sat365.com.ar)";

function normalizarClave(direccion, localidad) {
  return `${(direccion || "").trim().toLowerCase()}|${(localidad || "").trim().toLowerCase()}`;
}

async function leerCache(ghHeaders, apiUrl) {
  const r = await fetch(apiUrl, { headers: ghHeaders });
  if (r.status === 404) return { data: {}, sha: null };
  if (!r.ok) throw new Error("No se pudo leer la caché de geocodificación");
  const data = await r.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { data: JSON.parse(content), sha: data.sha };
}

async function guardarCache(ghHeaders, apiUrl, cache, sha) {
  const contentB64 = Buffer.from(JSON.stringify(cache, null, 2)).toString("base64");
  await fetch(apiUrl, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Actualiza caché de geocodificación (${new Date().toISOString()})`,
      content: contentB64,
      sha: sha || undefined,
    }),
  });
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodificarNominatim(direccion, localidad) {
  const query = `${direccion}, ${localidad || ""}, Argentina`;
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const results = await res.json();
  if (!results || results.length === 0) return null;
  return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!process.env.SERVICIOS_API_TOKEN || token !== process.env.SERVICIOS_API_TOKEN) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) {
    res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") body = JSON.parse(body);
  const items = Array.isArray(body && body.items) ? body.items : [];
  if (items.length === 0) {
    res.status(400).json({ error: "Falta la lista de direcciones a geocodificar" });
    return;
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${CACHE_PATH}`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_DATA_TOKEN}`,
    Accept: "application/vnd.github+json",
  };

  let cache, sha;
  try {
    const leido = await leerCache(ghHeaders, apiUrl);
    cache = leido.data;
    sha = leido.sha;
  } catch (err) {
    cache = {};
    sha = null;
  }

  const results = [];
  let cambios = false;
  // Límite de direcciones NUEVAS por pedido, para no pasarnos del
  // tiempo máximo de ejecución de la función serverless (las que ya
  // están en caché no cuentan para este límite, son instantáneas).
  const MAX_NUEVAS_POR_PEDIDO = 6;
  let nuevasProcesadas = 0;

  for (const item of items) {
    const clave = normalizarClave(item.direccion, item.localidad);
    if (cache[clave]) {
      results.push({ id: item.id, ...cache[clave] });
      continue;
    }
    if (nuevasProcesadas >= MAX_NUEVAS_POR_PEDIDO) {
      results.push({ id: item.id, pendiente: true });
      continue;
    }
    nuevasProcesadas++;
    try {
      const coords = await geocodificarNominatim(item.direccion, item.localidad);
      if (coords) {
        cache[clave] = coords;
        cambios = true;
        results.push({ id: item.id, ...coords });
      } else {
        results.push({ id: item.id, error: "No se encontró la dirección" });
      }
    } catch (err) {
      results.push({ id: item.id, error: "Error al geocodificar" });
    }
    // Respeta el límite de 1 pedido por segundo de Nominatim (solo
    // aplica a direcciones nuevas; las que ya están en caché no esperan).
    await esperar(1100);
  }

  if (cambios) {
    guardarCache(ghHeaders, apiUrl, cache, sha).catch(() => {});
  }

  res.status(200).json({ results });
};
