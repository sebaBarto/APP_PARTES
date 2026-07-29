// Función serverless de Vercel — registra cuándo un técnico usa una
// SIM en un cliente, la devuelve a stock, o se la transfiere a otro
// técnico. Mantiene actualizado el estado de cada SIM en
// sims-config.json y deja un historial de movimientos en
// sims-historial.json.
//
// Variables de entorno reutilizadas:
//   SERVICIOS_API_TOKEN, GITHUB_DATA_TOKEN, GITHUB_DATA_REPO

const HISTORIAL_PATH = "sims-historial.json";
const CONFIG_PATH = "sims-config.json";

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
      res.status(500).json({ error: "Error interno al leer el historial de SIMs" });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      const { accion, numero, tecnico } = body || {};
      if (!accion || !numero || !tecnico) {
        res.status(400).json({ error: "Faltan datos (acción, número de SIM o técnico)" });
        return;
      }

      const { data: sims, sha: shaSims } = await leerJSON(ghHeaders, CONFIG_PATH, []);
      const sim = sims.find((s) => s.numero === numero);
      if (!sim) {
        res.status(404).json({ error: "No se encontró esa SIM" });
        return;
      }
      if (sim.tecnico_actual !== tecnico) {
        res.status(409).json({ error: `Esa SIM la tiene ${sim.tecnico_actual}, no vos` });
        return;
      }

      const { data: historial, sha: shaHistorial } = await leerJSON(ghHeaders, HISTORIAL_PATH, []);
      const registroBase = {
        fecha: new Date().toISOString().slice(0, 10),
        hora: body.hora || "",
        numero,
        empresa: sim.empresa,
        tecnico,
      };

      if (accion === "usar") {
        if (!body.cliente) {
          res.status(400).json({ error: "Falta el cliente" });
          return;
        }
        sim.estado = "uso";
        sim.cliente = body.cliente;
        historial.push({ ...registroBase, accion: "usar", cliente: body.cliente, numero_servicio: body.numero_servicio || "" });
      } else if (accion === "devolver") {
        sim.estado = "stock";
        sim.cliente = "";
        historial.push({ ...registroBase, accion: "devolver" });
      } else if (accion === "transferir") {
        if (!body.tecnico_nuevo) {
          res.status(400).json({ error: "Falta el técnico al que se transfiere" });
          return;
        }
        historial.push({ ...registroBase, accion: "transferir", tecnico_nuevo: body.tecnico_nuevo });
        // Guarda quién se la dio, para poder revertir si fue por error.
        sim.tecnico_anterior = tecnico;
        sim.tecnico_actual = body.tecnico_nuevo;
        sim.estado = "stock";
        sim.cliente = "";
      } else if (accion === "reemplazar") {
        if (sim.estado !== "stock") {
          res.status(409).json({ error: "Esa SIM no está en stock" });
          return;
        }
        if (!body.cliente || !body.numero_sim_a_retirar) {
          res.status(400).json({ error: "Falta el cliente o la SIM que se retira" });
          return;
        }
        const simVieja = sims.find((s) => s.numero === body.numero_sim_a_retirar);
        if (!simVieja) {
          res.status(404).json({ error: "No se encontró la SIM que se retira" });
          return;
        }
        // La que se retira vuelve al stock del técnico que hace el
        // cambio (la tiene físicamente en la mano en ese momento).
        simVieja.estado = "stock";
        simVieja.cliente = "";
        simVieja.tecnico_actual = tecnico;
        // La nueva queda instalada en el cliente.
        sim.estado = "uso";
        sim.cliente = body.cliente;
        historial.push({
          ...registroBase,
          accion: "reemplazar",
          cliente: body.cliente,
          numero_servicio: body.numero_servicio || "",
          sim_retirada: body.numero_sim_a_retirar,
          empresa_retirada: simVieja.empresa,
        });
      } else {
        res.status(400).json({ error: "Acción desconocida (usar 'usar', 'devolver', 'transferir' o 'reemplazar')" });
        return;
      }

      await guardarJSON(ghHeaders, CONFIG_PATH, sims, shaSims);
      await guardarJSON(ghHeaders, HISTORIAL_PATH, historial, shaHistorial);

      res.status(200).json({ ok: true, sim });
    } catch (err) {
      res.status(500).json({ error: "Error interno al registrar el movimiento de la SIM", detail: String(err.message || err) });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
};
