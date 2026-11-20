// ============================================================
// ENTREGA DE LLAVES (cierra el ciclo de un pedido de consorcio)
//
// Un pedido de nuevo tag / reemplazo / titularidad con llaves nuevas, una vez
// marcado "Hecha" por SAT (llaves programadas), queda "pendiente de entrega".
// La entrega la registra la gente de la oficina: desde admin.html (PC) o desde
// la APP quien tenga el permiso "entrega_llaves" (se tilda en admin → Técnicos).
// Si un técnico tiene que llevar una llave puntual, la oficina le habilita ESA
// entrega (g.entrega_habilitada) y solo esa le aparece en la APP.
// Se registra quién la recibe, su firma en pantalla y de dónde sale el tag.
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
const { normPiso, normDepto, pisoGrado } = require("./unidad");
const { txtPublico, soloUsuario, codigoValido, modificar, leerEdificios, rutaEdificio, cuerpo } = util;

const RUTA_CONFIG = "registro-llaves/config.json";
const rutaGestiones = (codigo) => `registro-llaves/${codigo}.gestiones.json`;

// ¿Este pedido termina con llaves en mano del vecino?
const necesitaEntrega = (g) => g.tipo === "nuevo" || g.tipo === "reemplazo" || (g.tipo === "titularidad" && g.llaves_titularidad === "reemplazar");
const pendienteDeEntrega = (g) => g.estado === "hecha" && necesitaEntrega(g) && !g.entrega;
const unidadTxt = (g) => [g.piso || g.unidad ? `${g.piso ? pisoGrado(g.piso) : ""} ${g.unidad || ""}`.trim() : "", g.cochera ? "Cochera " + g.cochera : ""].filter(Boolean).join(" · ");

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
    ...(g.entrega_habilitada ? { habilitada_a: g.entrega_habilitada.tecnico } : {}),
    ...(g.entrega ? { entrega: g.entrega } : {}),
  };
}

async function leerConfig(gh) {
  const { data } = await gh.leer(RUTA_CONFIG, {});
  return data && typeof data === "object" ? data : {};
}

// ¿Puede entregar cualquier llave? La oficina (admin.html / clave general) y los
// técnicos con el permiso "entrega_llaves". El resto, solo las que le habiliten.
async function esDeOficina(autorizacion, deps) {
  if (autorizacion.rol === "admin") return true;
  if (!autorizacion.nombre || typeof deps.leerTecnicos !== "function") return false;
  const lista = await deps.leerTecnicos().catch(() => []);
  const t = (Array.isArray(lista) ? lista : []).find((x) => x && x.nombre === autorizacion.nombre);
  return !!(t && t.permisos && t.permisos.entrega_llaves);
}
const habilitadaA = (g, nombre) => !!(nombre && g.entrega_habilitada && g.entrega_habilitada.tecnico === nombre);

// deps: { gh, descontarStock({ items, de, cliente, motivo, quien, parte }), leerTecnicos() }
async function manejar(req, res, autorizacion, deps) {
  const { gh } = deps;
  res.setHeader("Cache-Control", "no-store");
  if (!autorizacion) { res.status(401).json({ error: "No autorizado", sesion_vencida: true }); return; }
  if (!process.env.GITHUB_DATA_TOKEN || !process.env.GITHUB_DATA_REPO) { res.status(500).json({ error: "Faltan variables de entorno por configurar en Vercel" }); return; }
  const esAdmin = autorizacion.rol === "admin";
  const quien = autorizacion.nombre || "Oficina";
  try {
    const oficina = await esDeOficina(autorizacion, deps);
    const { lista: edificios } = await leerEdificios(gh);
    if (req.method === "GET") {
      const q = req.query || {};
      if (q.firma) { if (!oficina) { res.status(403).json({ error: "Solo la oficina" }); return; } await fotos.enviarFoto(res, String(q.edificio || ""), String(q.firma)); return; }
      if (q.config) { if (!esAdmin) { res.status(403).json({ error: "Solo desde el panel" }); return; } res.status(200).json(await leerConfig(gh)); return; }
      // Pendientes de entrega de todos los edificios (y las ya entregadas, si se piden).
      // Un técnico que no es de la oficina ve solo las que le habilitaron a él.
      const todas = (await Promise.all(edificios.map(async (ed) => {
        const { data } = await gh.leer(rutaGestiones(ed.codigo), []);
        return (Array.isArray(data) ? data : [])
          .filter((g) => oficina || habilitadaA(g, autorizacion.nombre))
          .filter((g) => pendienteDeEntrega(g) || (oficina && q.entregadas && g.entrega)).map((g) => paraLista(g, ed));
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

    // Habilitar (o quitar) una entrega puntual a un técnico: solo la oficina.
    if (b.accion === "habilitar") {
      if (!oficina) { res.status(403).json({ error: "Solo la oficina puede habilitar entregas" }); return; }
      const codigoH = String(b.edificio || "");
      if (!codigoValido(codigoH) || !edificios.some((e) => e.codigo === codigoH)) { res.status(400).json({ error: "Edificio inválido" }); return; }
      const tecnico = String(b.tecnico == null ? "" : b.tecnico).trim().slice(0, 80);
      if (tecnico) {
        const lista = typeof deps.leerTecnicos === "function" ? await deps.leerTecnicos().catch(() => []) : [];
        if (!(Array.isArray(lista) ? lista : []).some((t) => t && t.nombre === tecnico)) { res.status(400).json({ error: "Ese técnico no está en la lista de técnicos" }); return; }
      }
      let resultado = null;
      await modificar(gh, rutaGestiones(codigoH), [], (lista) => {
        const x = lista.find((y) => y.id === b.id);
        if (!x) { resultado = 404; return null; }
        if (x.entrega || !pendienteDeEntrega(x)) { resultado = 409; return null; }
        const fecha = new Date().toISOString();
        if (tecnico) x.entrega_habilitada = { tecnico, por: quien, fecha };
        else delete x.entrega_habilitada;
        x.historial = (x.historial || []).concat({ fecha, estado: x.estado, por: quien, nota: tecnico ? `Entrega habilitada a ${tecnico}` : "Se quitó la habilitación de entrega" });
        resultado = 200;
        return lista;
      }, `Entrega de llaves: ${tecnico ? "habilitada a " + tecnico : "sin habilitación"} (${quien})`);
      if (resultado === 404) { res.status(404).json({ error: "No se encontró el pedido" }); return; }
      if (resultado === 409) { res.status(409).json({ error: "Este pedido no está pendiente de entrega" }); return; }
      res.status(200).json({ ok: true, habilitada_a: tecnico || null });
      return;
    }

    if (b.accion !== "entregar") { res.status(400).json({ error: "Acción inválida" }); return; }
    // Una persona puede retirar varias llaves y controles de una vez (varios pedidos,
    // del mismo depto o de distintos): firma una sola vez por todo. Se manda
    // b.pedidos = [{ edificio, id, llaves }]; un solo pedido sigue llegando como antes.
    const solicitados = (Array.isArray(b.pedidos) && b.pedidos.length ? b.pedidos : [{ edificio: b.edificio, id: b.id, llaves: b.llaves }])
      .filter((x) => x && typeof x === "object");
    if (!solicitados.length) { res.status(400).json({ error: "No elegiste ninguna llave para entregar" }); return; }
    if (solicitados.length > 30) { res.status(400).json({ error: "Son demasiados pedidos juntos (máximo 30)" }); return; }
    const vistos = new Set();
    for (const x of solicitados) {
      const cod = String(x.edificio || "");
      if (!codigoValido(cod) || !edificios.some((e) => e.codigo === cod)) { res.status(400).json({ error: "Edificio inválido" }); return; }
      const clave = cod + "|" + String(x.id || "");
      if (vistos.has(clave)) { res.status(400).json({ error: "Hay un pedido repetido" }); return; }
      vistos.add(clave);
    }
    const recibio = txtPublico(b.recibio, 80);
    if (!recibio) { res.status(400).json({ error: "Falta quién recibe la llave" }); return; }
    const firma = fotos.decodificarFoto(b.firma);
    if (!firma) { res.status(400).json({ error: "Falta la firma de quien recibe (o no se pudo leer)" }); return; }
    // De dónde sale el tag: desde el panel se elige; la gente de la oficina en la
    // APP elige depósito o su propio stock; el técnico habilitado, de su stock.
    let de = `tec:${quien}`;
    if (esAdmin) {
      const pedido = String(b.de || "dep");
      de = pedido === "dep" ? "dep" : /^(tec|veh):[^:]{1,60}$/.test(pedido) ? pedido : "dep";
    } else if (oficina) {
      de = b.de === `tec:${quien}` ? `tec:${quien}` : "dep";
    }

    // Se revisan TODOS antes de tocar nada: si uno no se puede, no se entrega ninguno.
    const porEdificio = new Map();
    for (const x of solicitados) {
      const cod = String(x.edificio);
      if (!porEdificio.has(cod)) {
        const { data } = await gh.leer(rutaGestiones(cod), []);
        porEdificio.set(cod, Array.isArray(data) ? data : []);
      }
    }
    const items = [];
    for (const x of solicitados) {
      const ed = edificios.find((e) => e.codigo === String(x.edificio));
      const g = porEdificio.get(ed.codigo).find((y) => y.id === x.id);
      const ref = solicitados.length > 1 ? ` (pedido N° ${g ? g.numero || "" : "?"})` : "";
      if (!g) { res.status(404).json({ error: "No se encontró el pedido" + (solicitados.length > 1 ? ` (${ed.nombre})` : "") }); return; }
      if (!oficina && !habilitadaA(g, autorizacion.nombre)) { res.status(403).json({ error: `Las entregas de llaves las hace la oficina. Si tenés que llevar esta, pedí que te la habiliten.${ref}` }); return; }
      if (g.entrega) { res.status(409).json({ error: `Este pedido ya se entregó (a ${g.entrega.recibio})${ref}` }); return; }
      if (!pendienteDeEntrega(g)) { res.status(409).json({ error: `Este pedido todavía no está listo para entregar (SAT tiene que marcarlo Hecha)${ref}` }); return; }
      // Números que se completan en el momento de la entrega (si SAT no los cargó antes).
      let llaves = llavesAEntregar(g);
      if (Array.isArray(x.llaves)) {
        llaves = llaves.map((l, i) => {
          const n = x.llaves[i] || {};
          return { ...l, tag: l.tag || (l.tipo === "tag" ? normalizarTag(n.tag) : txtPublico(n.tag, 40)), usuario: l.usuario || soloUsuario(n.usuario) };
        });
      }
      items.push({ ed, g, llaves });
    }

    // Una sola firma: se guarda una vez por edificio (las firmas viven con cada edificio).
    const firmaPorEdificio = {};
    for (const cod of porEdificio.keys()) firmaPorEdificio[cod] = await fotos.guardarFoto(cod, firma);
    const fecha = new Date().toISOString();
    const grupo = items.length > 1 ? { id: require("crypto").randomBytes(6).toString("hex"), pedidos: items.map(({ ed, g, llaves }) => ({ edificio: ed.codigo, id: g.id, numero: g.numero || null, unidad: unidadTxt(g), llaves: llaves.length })) } : null;

    // Stock: un descuento por unidad (depto/cochera), con un renglón por tipo de dispositivo.
    const config = await leerConfig(gh);
    const porDestino = new Map();
    items.forEach((it) => {
      const cliente = `${it.ed.nombre}${unidadTxt(it.g) ? " " + unidadTxt(it.g) : ""}`;
      if (!porDestino.has(cliente)) porDestino.set(cliente, []);
      porDestino.get(cliente).push(it);
    });
    for (const [cliente, grupoItems] of porDestino) {
      const numeros = grupoItems.map((it) => it.g.numero || "").filter(Boolean);
      const nros = numeros.length > 1 ? `pedidos N° ${numeros.join(", ")}` : `pedido N° ${numeros[0] || ""}`;
      const lineas = ["tag", "control"].map((t) => {
        const cant = grupoItems.reduce((n, it) => n + it.llaves.filter((l) => l.tipo === t).length, 0);
        return cant ? { c: t === "tag" ? config.articulo_tag || "" : config.articulo_control || "", cant, texto: `${t === "tag" ? "Tag de acceso" : "Control remoto de cochera"} — ${nros} ${cliente}` } : null;
      }).filter(Boolean);
      let stock;
      try {
        stock = await deps.descontarStock({ items: lineas, de, cliente, motivo: `Entrega de llaves · ${nros} (${grupoItems[0].ed.nombre})`, quien, parte: `LLAVES-${numeros.join("-")}` });
      } catch (e) { stock = { ok: false, error: String(e.message || e) }; }
      const resumen = stock && stock.ok ? { ok: true, descontados: stock.descontados || [], para_aprobar: stock.paraAprobar || 0 } : { ok: false, error: (stock && stock.error) || "No se pudo descontar" };
      // Con varios pedidos de la misma unidad, el descuento queda anotado en el primero y los demás lo referencian.
      grupoItems.forEach((it, i) => { it.stock = i === 0 ? resumen : { ...resumen, descontados: [], para_aprobar: 0, junto_con: grupoItems[0].g.numero || grupoItems[0].g.id }; });
    }

    // Se guarda la entrega en cada pedido (una escritura por edificio).
    const hechos = [], errores = [];
    for (const [cod] of porEdificio) {
      const delEdificio = items.filter((it) => it.ed.codigo === cod);
      const listos = new Set();
      try {
        await modificar(gh, rutaGestiones(cod), [], (lista) => {
          listos.clear();
          let algo = false;
          delEdificio.forEach((it) => {
            const x = lista.find((y) => y.id === it.g.id);
            if (!x || x.entrega || (!oficina && !habilitadaA(x, autorizacion.nombre))) return;
            it.entrega = {
              fecha, por: quien, recibio, dni: txtPublico(b.dni, 20), firma: firmaPorEdificio[cod],
              de, llaves: it.llaves, observaciones: txtPublico(b.observaciones, 300), stock: it.stock,
              ...(grupo ? { grupo } : {}),
            };
            x.entrega = it.entrega;
            x.historial = (x.historial || []).concat({ fecha, estado: "entregada", por: quien, ...(grupo ? { nota: `Retiró junto con ${grupo.pedidos.length - 1} pedido(s) más, una sola firma` } : {}) });
            listos.add(it.g.id);
            algo = true;
          });
          return algo ? lista : null;
        }, `Entrega de llaves: ${delEdificio.length > 1 ? "pedidos N° " + delEdificio.map((it) => it.g.numero || "").join(", ") : "pedido N° " + (delEdificio[0].g.numero || "")} (${quien})`);
      } catch (e) { delEdificio.forEach((it) => errores.push({ id: it.g.id, numero: it.g.numero || null, error: String(e.message || e) })); continue; }
      delEdificio.forEach((it) => (listos.has(it.g.id) ? hechos.push(it) : errores.push({ id: it.g.id, numero: it.g.numero || null, error: "Ya se había entregado" })));

      // Padrón: quién recibió cada llave (una escritura por edificio).
      const delPadron = delEdificio.filter((it) => listos.has(it.g.id));
      if (!delPadron.length) continue;
      try {
        const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
        await modificar(gh, rutaEdificio(cod), [], (regs) => {
          let tocado = false;
          delPadron.forEach(({ g, llaves }) => {
            const tags = new Set(llaves.map((l) => l.tag && normalizarTag(l.tag)).filter(Boolean));
            const persona = g.tipo === "titularidad" ? g.nuevo_titular : g.titular;
            regs.forEach((r) => {
              let suyo = false;
              (r.llaves || []).forEach((l) => { if (l.estado !== "dada_de_baja" && l.tag && tags.has(normalizarTag(l.tag))) { l.entregada = { fecha, recibio, pedido: g.numero || null }; suyo = true; } });
              const misma = norm(r.nombre) === norm(persona) && normPiso(r.piso) === normPiso(g.piso) && normDepto(r.unidad) === normDepto(g.unidad);
              if (suyo || (!tags.size && misma)) {
                r.historial = (r.historial || []).concat({ fecha, que: `Recibió ${llaves.length === 1 ? "la llave" : llaves.length + " llaves"}${tags.size ? " " + [...tags].join(", ") : ""} — firmó ${recibio}`, por: quien, pedido: g.numero || null });
                tocado = true;
              }
            });
          });
          return tocado ? regs : null;
        }, `Padrón de llaves: entrega ${delPadron.length > 1 ? "pedidos N° " + delPadron.map((it) => it.g.numero || "").join(", ") : "pedido N° " + (delPadron[0].g.numero || "")}`);
      } catch (e) { console.error("No se pudo anotar la entrega en el padrón:", e); }
    }
    if (!hechos.length) { res.status(409).json({ error: items.length > 1 ? "No se pudo registrar ninguna: ya estaban entregadas o el servidor está ocupado" : "Este pedido ya se entregó" }); return; }

    // Aviso al administrador de consorcio (uno por pedido, como cada pedido que hizo).
    await Promise.all(hechos.map(({ ed, g, entrega }) => require("./consorcio").avisarEntrega(gh, ed.codigo, { ...g, entrega }).catch(() => {})));
    res.status(200).json({
      ok: true, entrega: hechos[0].entrega,
      entregas: hechos.map(({ ed, g, entrega }) => ({ edificio: ed.codigo, id: g.id, numero: g.numero || null, entrega })),
      errores,
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}

module.exports = { manejar, pendienteDeEntrega, necesitaEntrega };
