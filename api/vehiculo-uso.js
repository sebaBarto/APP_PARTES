// Función serverless de Vercel — registra cuándo un técnico toma y
// devuelve un vehículo de la empresa (horarios, km de devolución,
// eventos particulares), y mantiene actualizado el kilometraje actual
// de cada vehículo en vehiculos-config.json (usado para las alertas de
// mantenimiento).
//
// Variables de entorno reutilizadas:
//   SERVICIOS_API_TOKEN, GITHUB_DATA_TOKEN, GITHUB_DATA_REPO

const HISTORIAL_PATH = "vehiculos-historial.json";
const CONFIG_PATH = "vehiculos-config.json";
const CONFIG_DEFAULT = [
  { nombre: "Renault Kangoo Blanca", km_actual: 0, umbrales: [] },
  { nombre: "Renault Kangoo Gris", km_actual: 0, umbrales: [] },
  { nombre: "Moto", km_actual: 0, umbrales: [] },
];

async function leerJSON(ghHeaders, path, valorDefault) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${path}`;
  const r = await fetch(url, { headers: ghHeaders });
  if (r.status === 404) return { data: valorDefault, sha: null };
  if (!r.ok) throw new Error(`No se pudo leer ${path}`);
  const data = await r.json();
  const content = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  return { data: content, sha: data.sha };
}

async function guardarJSON(ghHeaders, path, contenido, sha) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}/contents/${path}`;
  const contentB64 = Buffer.from(JSON.stringify(contenido, null, 2)).toString("base64");
  const r = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Actualiza ${path} (${new Date().toISOString()})`,
      content: contentB64,
      sha: sha || undefined,
    }),
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`No se pudo guardar ${path}: ${errText}`);
  }
}

module.exports = async (req, res) => {
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
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_DATA_TOKEN}`,
    Accept: "application/vnd.github+json",
  };

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    try {
      const { data } = await leerJSON(ghHeaders, HISTORIAL_PATH, []);
      res.status(200).json(data);
    } catch (err) {
      res.status(500).json({ error: "Error interno al leer el historial de vehículos" });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      const { accion, vehiculo, tecnico } = body || {};
      if (!accion || !vehiculo || !tecnico) {
        res.status(400).json({ error: "Faltan datos (acción, vehículo o técnico)" });
        return;
      }

      const { data: historial, sha: shaHistorial } = await leerJSON(ghHeaders, HISTORIAL_PATH, []);

      if (accion === "tomar") {
        const yaTomado = historial.find((h) => h.vehiculo === vehiculo && !h.hora_devolucion);
        if (yaTomado) {
          res.status(409).json({ error: `Ese vehículo ya lo tiene ${yaTomado.tecnico} desde las ${yaTomado.hora_toma}` });
          return;
        }
        historial.push({
          vehiculo,
          tecnico,
          fecha: body.fecha || "",
          hora_toma: body.hora_toma || "",
          hora_devolucion: "",
          km_devolucion: "",
          evento: "",
        });
        await guardarJSON(ghHeaders, HISTORIAL_PATH, historial, shaHistorial);
        res.status(200).json({ ok: true });
        return;
      }

      if (accion === "devolver") {
        const abierto = [...historial].reverse().find((h) => h.vehiculo === vehiculo && h.tecnico === tecnico && !h.hora_devolucion);
        if (!abierto) {
          res.status(404).json({ error: "No se encontró un registro abierto de ese vehículo para vos" });
          return;
        }
        abierto.hora_devolucion = body.hora_devolucion || "";
        abierto.km_devolucion = body.km_devolucion || "";
        abierto.evento = body.evento || "";
        await guardarJSON(ghHeaders, HISTORIAL_PATH, historial, shaHistorial);

        // Actualiza el km actual del vehículo en la configuración, si
        // se cargó un kilometraje de devolución.
        if (body.km_devolucion) {
          const { data: vehiculosConfig, sha: shaConfig } = await leerJSON(ghHeaders, CONFIG_PATH, CONFIG_DEFAULT);
          const v = vehiculosConfig.find((x) => x.nombre === vehiculo);
          if (v) {
            v.km_actual = Number(body.km_devolucion) || v.km_actual;
            await guardarJSON(ghHeaders, CONFIG_PATH, vehiculosConfig, shaConfig);
          }
        }
        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ error: "Acción desconocida (usar 'tomar' o 'devolver')" });
    } catch (err) {
      res.status(500).json({ error: "Error interno al registrar el uso del vehículo", detail: String(err.message || err) });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
};
