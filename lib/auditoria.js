// Registro de cambios (LOG): quién hizo qué desde el panel de administración.
//
// Desde que al admin se entra con el usuario y la clave de cada persona,
// el pase de sesión lleva su nombre. Cada cambio que alguien hace desde el
// admin (guardar una lista, transferir una SIM, pagar una rendición, etc.)
// queda anotado acá con fecha, persona, sección y un resumen.
//
// Se guarda en el repo privado de datos (auditoria.json), igual que el
// registro de errores: los últimos MAX_ENTRADAS cambios, el más nuevo primero.
const { autorizar } = require("./sesion");

const RUTA = "auditoria.json";
const MAX_ENTRADAS = 5000;

const SECCIONES = {
  tecnicos: "Técnicos", clientes: "Clientes", materiales: "Materiales", "consultas-categorias": "Manuales (categorías)",
  guardias: "Guardias", credenciales: "Credenciales", servicios_emergencia: "Emergencias", vehiculos: "Vehículos",
  sims: "SIMs", herramientas: "Herramientas", sims_instaladas: "SIMs instaladas", notas: "Notas",
  visitas_historicas: "Semáforo visitas", config: "Configuración", datos_equipo: "Manuales (datos del equipo)",
  sim: "SIMs", vehiculo: "Vehículos", herramienta: "Herramientas", rendicion: "Rendiciones",
  seguimiento: "Seguimientos", presencia: "Presencia en obra",
  lista_precios: "Lista de precios", presupuestos_express: "Presupuesto express", croquis: "Croquis",
};
const SECCION_POR_API = {
  servicios: "Servicios pendientes", cronograma: "Cronograma", planos: "Planos", comodato: "Comodatos",
  consultas: "Manuales (IA)", historial: "Historial e instalaciones",
};
const ACCIONES = {
  transferir: "Transfirió", alta_lote: "Cargó SIMs nuevas", editar_stock: "Editó una SIM", dar_de_baja: "Dio de baja",
  cancelar_transferencia: "Canceló una transferencia", editar_instalada: "Editó una SIM instalada", corregir_numero: "Corrigió el número de una SIM",
  marcar_pagado: "Marcó como pagado", pagado_app: "Marcó como pagado con APP", rechazar: "Rechazó",
  marcar_pasado_sistema: "Marcó como pasado al sistema", marcar_pasado_sistema_stock: "Marcó stock como pasado al sistema",
  crear_instalacion: "Creó una instalación", cerrar_instalacion: "Cerró una instalación", borrar_instalacion: "Borró una instalación",
  guardar_items_instalacion: "Guardó ítems de una instalación", subir_foto_instalacion: "Subió una foto de instalación",
  borrar_foto_instalacion: "Borró una foto de instalación", borrar_manual: "Borró un manual", iniciar_subida_manual: "Subió un manual",
  crear: "Creó", editar: "Editó", borrar: "Borró", limpiar: "Vació",
  reemplazar: "Subió la lista de precios", cotizacion: "Cambió la cotización del dólar",
  nuevo: "Emitió un presupuesto express", adjuntar_pdf: "Guardó el PDF del presupuesto",
  guardar: "Guardó", interpretar: "Armó un croquis desde una foto", revision: "Corrigió un presupuesto express", kits: "Guardó los kits de presupuesto", foto: "Cambió la foto de un artículo",
};
// Pedidos que no son cambios hechos por una persona (o que son ruido).
const ACCIONES_IGNORADAS = /^(verificar_|webauthn_)/;
const COLECCIONES_IGNORADAS = ["errores_app", "servicios_vistos", "push-subscripciones", "auditoria"];

const recortar = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);

function describir(api, req, body) {
  const q = req.query || {};
  const clave = q.coleccion || q.recurso || "";
  const seccion = SECCIONES[clave] || SECCION_POR_API[api] || clave || api;
  if (Array.isArray(body)) {
    // El panel puede aclarar qué cambió (ej. "Agregó a mano: 12345 — Panadería Sur").
    if (q.cambio) return { seccion, accion: recortar(q.cambio, 120), detalle: recortar(q.detalle_cambio || "", 300) };
    return { seccion, accion: req.method === "DELETE" ? "Borró la lista" : "Guardó la lista", detalle: `${body.length} ${body.length === 1 ? "elemento" : "elementos"}` };
  }
  const b = body && typeof body === "object" ? body : {};
  const accionCruda = String(b.accion || "");
  const accion = ACCIONES[accionCruda]
    || (accionCruda ? accionCruda.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : (req.method === "DELETE" ? "Borró" : "Guardó"));
  const partes = [];
  const agregar = (etiqueta, valor) => { if (valor !== undefined && valor !== null && valor !== "") partes.push(`${etiqueta}: ${recortar(valor, 80)}`); };
  agregar("N°", b.numero || b.numero_servicio);
  agregar("Nombre", b.nombre);
  agregar("Vehículo", b.vehiculo);
  agregar("Cliente", b.cliente);
  agregar("Técnico", b.tecnico);
  agregar("Para", b.tecnico_nuevo || b.destino);
  agregar("Estado", b.estado_fisico || b.estado);
  agregar("Monto", b.monto);
  agregar("Motivo", b.motivo || b.observaciones_admin);
  if (Array.isArray(b.sims)) agregar("SIMs", b.sims.length);
  if (Array.isArray(b.items)) agregar("Artículos", b.items.length);
  if (b.archivo) agregar("Archivo", b.archivo);
  if (b.valor !== undefined) agregar("Valor", b.valor);
  if (b.total !== undefined) agregar("Total", b.total);
  if (Array.isArray(b.numeros)) agregar("Líneas", b.numeros.length);
  if (!partes.length) agregar("Id", b.id);
  return { seccion, accion, detalle: recortar(partes.join(" · "), 300) };
}

async function leerLog() {
  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  const url = `https://api.github.com/repos/${GITHUB_DATA_REPO}/contents/${RUTA}`;
  const headers = { Authorization: `Bearer ${GITHUB_DATA_TOKEN}`, Accept: "application/vnd.github+json" };
  const r = await fetch(url, { headers });
  if (r.status === 404) return { lista: [], sha: undefined, url, headers };
  if (!r.ok) throw new Error("No se pudo leer el registro");
  const d = await r.json();
  return { lista: JSON.parse(Buffer.from(d.content, "base64").toString("utf-8")), sha: d.sha, url, headers };
}

// Agrega una o varias entradas. Si dos cambios llegan juntos (conflicto de
// versión en GitHub), se vuelve a leer y se reintenta.
async function registrar(entradas) {
  const { GITHUB_DATA_TOKEN, GITHUB_DATA_REPO } = process.env;
  if (!GITHUB_DATA_TOKEN || !GITHUB_DATA_REPO) return false;
  const nuevas = (Array.isArray(entradas) ? entradas : [entradas]).filter(Boolean);
  if (!nuevas.length) return true;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const { lista, sha, url, headers } = await leerLog();
      const contenido = [...nuevas, ...(Array.isArray(lista) ? lista : [])].slice(0, MAX_ENTRADAS);
      const r = await fetch(url, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Registro de cambios: ${nuevas[0].quien} — ${nuevas[0].accion}`,
          content: Buffer.from(JSON.stringify(contenido)).toString("base64"),
          sha,
        }),
      });
      if (r.ok) return true;
      if (r.status !== 409 && r.status !== 422) return false;
    } catch (e) {
      if (intento === 2) return false;
    }
  }
  return false;
}

function entradaBase(req, quien) {
  const ip = (req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"]) || "").toString().split(",")[0].trim();
  return { fecha: new Date().toISOString(), quien: quien || "Admin", ip: ip.slice(0, 60) };
}

// Envuelve un endpoint: si el pedido es un cambio hecho con un pase de
// administración y salió bien, se anota en el registro ANTES de responder
// (en Vercel, lo que se hace después de responder puede no llegar a correr).
function conAuditoria(api, handler) {
  return async (req, res) => {
    if (!req || req.method === "GET" || req.method === "OPTIONS" || req.method === "HEAD") return handler(req, res);
    const quien = autorizar(req);
    if (!quien || quien.tipo !== "sesion" || quien.rol !== "admin") return handler(req, res);
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
    const accion = body && !Array.isArray(body) ? String(body.accion || "") : "";
    const coleccion = (req.query && req.query.coleccion) || "";
    if (ACCIONES_IGNORADAS.test(accion) || COLECCIONES_IGNORADAS.includes(coleccion)) return handler(req, res);
    // En Manuales (IA) preguntar no es un cambio; solo se anota subir o borrar un manual.
    if (api === "consultas" && !["borrar_manual", "iniciar_subida_manual"].includes(accion)) return handler(req, res);

    // Se retiene la respuesta hasta anotar el cambio.
    const jsonOriginal = res.json.bind(res);
    let pendiente = null;
    res.json = (data) => { pendiente = data; return res; };
    try {
      await handler(req, res);
    } finally {
      res.json = jsonOriginal;
      const status = res.statusCode || 200;
      const salioBien = status < 400 && !(pendiente && typeof pendiente === "object" && (pendiente.ok === false || pendiente.error));
      if (pendiente !== null && salioBien) {
        try {
          await Promise.race([
            registrar({ ...entradaBase(req, quien.nombre), ...describir(api, req, body) }),
            new Promise((ok) => setTimeout(ok, 4000)),
          ]);
        } catch (e) { /* si no se pudo anotar, el cambio igual se hizo */ }
      }
      if (pendiente !== null) jsonOriginal(pendiente);
    }
  };
}

module.exports = { conAuditoria, registrar, describir, entradaBase, leerLog, RUTA };
