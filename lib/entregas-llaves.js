// ============================================================
// ENTREGA DE LLAVES (cierra el ciclo de un pedido de consorcio)
//
// Un pedido de nuevo tag / reemplazo / titularidad con llaves nuevas, una vez
// marcado "Hecha" por SAT (llaves programadas), queda "pendiente de entrega".
// El técnico (desde la APP) o la oficina (desde admin.html) registra la
// entrega: quién la recibe, su firma en pantalla y de dónde sale el tag.
// Al registrarla:
//   - se descuenta del stock (del técnico; si no lo tiene, de una camioneta;
//     si no aparece, queda "para aprobar" para el responsable de stock, igual
//     que el material de un parte);
//   - queda la constancia (firma privada, como las fotos de las llaves);
//   - el padrón del edificio anota quién recibió cada llave;
//   - al administrador de consorcio le llega un mail.
//
// Datos: en la misma gestión (registro-llaves/<codigo>.gestiones.json → g.entrega)
// y la configuración de qué artículo de stock es el tag y cuál el control en
// registro-llaves/config.json.
// ============================================================
const { util, normalizarTag, fotos } = require("./registro-llaves");
const { txtPublico, soloUsuario, codigoValido, modificar, leerEdificios, rutaEdificio, cuerpo } = util;

const RUTA_CONFIG = "registro-llaves/config.json";
const rutaGestiones = (codigo) => `registro-llaves/${codigo}.gestiones.json`;

// ¿Este pedido termina con llaves en mano del vecino?
const necesitaEntrega = (g) => g.tipo === "nuevo" || g.tipo === "reemplazo" || (g.tipo === "titularidad" && g.llaves_titularidad === "reemplazar");
const pendienteDeEntrega = (g) => g.estado === "hecha" && necesitaEntrega(g) && !g.entrega;
const unidadTxt = (g) => [g.piso || g.unidad ? `${g.piso ? g.piso + "°" : ""} ${g.unidad || ""}`.trim() : "", g.cochera ? "Cochera " + g.cochera : ""].filter(Boolean).join(" · ");

// Qué se entrega: lo que SAT cargó al marcarla hecha; si no cargó números, la cantidad pedida.
function llavesAEntregar(g) {
  const cargadas = Array.isArray(g.llaves_entregadas) ? g.llaves_entregadas : [];
  if (cargadas.length) return cargadas.map((l) => ({ tipo: l.tipo === "control" ? "control" : "tag", tag: l.tag || "", usuario: l.usuario || "" }));
  const n = g.tipo === "nuevo" ? Math.max(1, Number(g.cantidad) || 1) : 1;
  return Array.from({ length: n }, () => ({ tipo: g.dispositivo === "control" ? "control" : "tag", tag: "", usuario: "" }));
}

function paraLista(g, ed) {
  return {
    id: g.id, numero: g.numero, edificio: ed.codigo, edificio_nombre: ed.nombre, direccion: ed.direccion || "",
    tipo: g.tipo, unidad: unidadTxt(g), titular: g.titular, telefono: g.telefono || "",
    recibe: g.tipo === "titularidad" ? g.nuevo_titular : g.titular,
    recibe_telefono: g.tipo === "titularidad" ? g.nuevo_telefono : g.telefono || "",
    llaves: llavesAEntregar(g), hecha_en: g.actualizado_en || g.fecha, nota_sat: g.nota_sat || "",
    ...(g.entrega ? { entrega: g.entrega } : {}),
  };
}

async function leerConfig(gh) {
  const { data } = await gh.leer(RUTA_CONFIG, {});
  return data && typeof data === "object" ? data : {};
}

// deps: { gh, descontarStock({ items, de, cliente, motivo, quien, parte }) }
async function manejar(req, res, autorizacion, deps) {
  const { gh } = deps;
  res.setHeader("Cache-Control", "no-store");
  if (!autorizacion) { res.status(401).json({ error: "No autorizado", sesion_vencida: true }); return; }
  if (!process.env.GITHUB_DATA_TOKEN || !process.env.GITHUB_DATA_REPO) { res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" }); return; }
  const esAdmin = autorizacion.rol === "admin";
  const quien = autorizacion.nombre || "Oficina";
  try {
    const { lista: edificios } = await leerEdificios(gh);
    if (req.method === "GET") {
      const q = req.query || {};
      if (q.firma) { await fotos.enviarFoto(res, String(q.edificio || ""), String(q.firma)); return; }
      if (q.config) { if (!esAdmin) { res.status(403).json({ error: "Solo desde el panel" }); return; } res.status(200).json(await leerConfig(gh)); return; }
      // Pendientes de entrega de todos los edificios (y las ya entregadas, si se piden).
      const todas = (await Promise.all(edificios.map(async (ed) => {
        const { data } = await gh.leer(rutaGestiones(ed.codigo), []);
        return (Array.isArray(data) ? data : []).filter((g) => pendienteDeEntrega(g) || (q.entregadas && g.entrega)).map((g) => paraLista(g, ed));
      }))).flat().sort((a, b) => String(a.hecha_en).localeCompare(String(b.hecha_en)));
      res.status(200).json(todas);
      return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }
    const b = cuerpo(req);

    if (b.accion === "config") {
      if (!esAdmin) { res.status(403).json({ error: "Solo desde el panel" }); return; }
      const limpio = (v) => String(v == null ? "" : v).trim().replace(/[^0-9A-Za-z\-_.]/g, "").slice(0, 30);
      const nueva = { articulo_tag: limpio(b.articulo_tag), articulo_control: limpio(b.articulo_control), por: quien, fecha: new Date().toISOString() };
      await modificar(gh, RUTA_CONFIG, null, () => nueva, `Entregas de llaves: artículos de stock (${quien})`);
      res.status(200).json({ ok: true, config: nueva });
      return;
    }

    if (b.accion !== "entregar") { res.status(400).json({ error: "Acción inválida" }); return; }
    const codigo = String(b.edificio || "");
    const ed = edificios.find((e) => e.codigo === codigo);
    if (!codigoValido(codigo) || !ed) { res.status(400).json({ error: "Edificio inválido" }); return; }
    const recibio = txtPublico(b.recibio, 80);
    if (!recibio) { res.status(400).json({ error: "Falta quién recibe la llave" }); return; }
    const firma = fotos.decodificarFoto(b.firma);
    if (!firma) { res.status(400).json({ error: "Falta la firma de quien recibe (o no se pudo leer)" }); return; }
    // De dónde sale el tag: el técnico, de su stock; la oficina elige.
    let de = `tec:${quien}`;
    if (esAdmin) {
      const pedido = String(b.de || "dep");
      de = pedido === "dep" ? "dep" : /^(tec|veh):[^:]{1,60}$/.test(pedido) ? pedido : "dep";
    }

    const { data } = await gh.leer(rutaGestiones(codigo), []);
    const g = (Array.isArray(data) ? data : []).find((x) => x.id === b.id);
    if (!g) { res.status(404).json({ error: "No se encontró el pedido" }); return; }
    if (g.entrega) { res.status(409).json({ error: `Este pedido ya se entregó (a ${g.entrega.recibio})` }); return; }
    if (!pendienteDeEntrega(g)) { res.status(409).json({ error: "Este pedido todavía no está listo para entregar (SAT tiene que marcarlo Hecha)" }); return; }

    // Números que se completan en el momento de la entrega (si SAT no los cargó antes).
    let llaves = llavesAEntregar(g);
    if (Array.isArray(b.llaves)) {
      llaves = llaves.map((l, i) => {
        const n = b.llaves[i] || {};
        return { ...l, tag: l.tag || (l.tipo === "tag" ? normalizarTag(n.tag) : txtPublico(n.tag, 40)), usuario: l.usuario || soloUsuario(n.usuario) };
      });
    }

    const firmaId = await fotos.guardarFoto(codigo, firma);
    // Stock: un renglón por tipo de dispositivo.
    const config = await leerConfig(gh);
    const items = ["tag", "control"].map((t) => {
      const cant = llaves.filter((l) => l.tipo === t).length;
      return cant ? { c: t === "tag" ? config.articulo_tag || "" : config.articulo_control || "", cant, texto: `${t === "tag" ? "Tag de acceso" : "Control remoto de cochera"} — pedido N° ${g.numero || ""} ${ed.nombre} ${unidadTxt(g)}` } : null;
    }).filter(Boolean);
    let stock;
    try {
      stock = await deps.descontarStock({ items, de, cliente: `${ed.nombre}${unidadTxt(g) ? " " + unidadTxt(g) : ""}`, motivo: `Entrega de llaves · pedido N° ${g.numero || ""} (${ed.nombre})`, quien, parte: `LLAVES-${g.numero || ""}` });
    } catch (e) { stock = { ok: false, error: String(e.message || e) }; }

    const entrega = {
      fecha: new Date().toISOString(), por: quien, recibio, dni: txtPublico(b.dni, 20), firma: firmaId,
      de, llaves, observaciones: txtPublico(b.observaciones, 300),
      stock: stock && stock.ok ? { ok: true, descontados: stock.descontados || [], para_aprobar: stock.paraAprobar || 0 } : { ok: false, error: (stock && stock.error) || "No se pudo descontar" },
    };
    let ok = false;
    await modificar(gh, rutaGestiones(codigo), [], (lista) => {
      const x = lista.find((y) => y.id === g.id);
      if (!x || x.entrega) return null;
      x.entrega = entrega;
      x.historial = (x.historial || []).concat({ fecha: entrega.fecha, estado: "entregada", por: quien });
      ok = true;
      return lista;
    }, `Entrega de llaves: pedido N° ${g.numero || ""} (${quien})`);
    if (!ok) { res.status(409).json({ error: "Este pedido ya se entregó" }); return; }

    // Padrón: quién recibió cada llave.
    try {
      const tags = new Set(llaves.map((l) => l.tag && normalizarTag(l.tag)).filter(Boolean));
      const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const persona = g.tipo === "titularidad" ? g.nuevo_titular : g.titular;
      await modificar(gh, rutaEdificio(codigo), [], (regs) => {
        let tocado = false;
        regs.forEach((r) => {
          let suyo = false;
          (r.llaves || []).forEach((l) => { if (l.estado !== "dada_de_baja" && l.tag && tags.has(normalizarTag(l.tag))) { l.entregada = { fecha: entrega.fecha, recibio, pedido: g.numero || null }; suyo = true; } });
          const misma = norm(r.nombre) === norm(persona) && norm(r.piso) === norm(g.piso) && norm(r.unidad) === norm(g.unidad);
          if (suyo || (!tags.size && misma)) {
            r.historial = (r.historial || []).concat({ fecha: entrega.fecha, que: `Recibió ${llaves.length === 1 ? "la llave" : llaves.length + " llaves"}${tags.size ? " " + [...tags].join(", ") : ""} — firmó ${recibio}`, por: quien, pedido: g.numero || null });
            tocado = true;
          }
        });
        return tocado ? regs : null;
      }, `Padrón de llaves: entrega pedido N° ${g.numero || ""}`);
    } catch (e) { console.error("No se pudo anotar la entrega en el padrón:", e); }

    // Aviso al administrador de consorcio.
    try { await require("./consorcio").avisarEntrega(gh, codigo, { ...g, entrega }); } catch (e) { /* el aviso es opcional */ }
    res.status(200).json({ ok: true, entrega });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}

module.exports = { manejar, pendienteDeEntrega, necesitaEntrega };
