// Parsea el Excel de "servicios pendientes" que genera automáticamente
// el sistema offline de la oficina — reconoce variantes comunes de
// nombres de columna (sin importar mayúsculas/tildes), para no
// depender de que el archivo tenga los encabezados exactos.
//
// Campos: numero_servicio, cliente, direccion, tarea (obligatorios) +
// localidad, telefono, fecha_ingreso, numero_cliente, numero_abonado,
// cobrador (opcionales) — mismo vocabulario que ya usa el mapeo manual
// de admin.html.

const PALABRAS_CONECTORAS = new Set(["de", "del", "la", "el", "los", "las", "a"]);

function normalizar(s) {
  const sinAcentos = (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return sinAcentos
    .split(" ")
    .filter((palabra) => palabra && !PALABRAS_CONECTORAS.has(palabra))
    .join("");
}

// Cada campo acepta varias formas posibles de encabezado — se
// comparan ya normalizadas (sin tildes/espacios/mayúsculas).
const VARIANTES_COLUMNA = {
  numero_servicio: ["numeroservicio", "nroservicio", "numserv", "nservicio", "servicio", "idservicio", "numero"],
  cliente: ["cliente", "nombrecliente", "razonsocial"],
  direccion: ["direccion", "domicilio"],
  tarea: ["tarea", "trabajo", "descripcion", "detalle", "motivo"],
  localidad: ["localidad", "ciudad", "zona"],
  telefono: ["telefono", "tel", "celular", "contacto"],
  fecha_ingreso: ["fechaingreso", "fecha", "fechacarga", "fechaalta"],
  numero_cliente: ["numerocliente", "nrocliente", "codigocliente", "idcliente"],
  numero_abonado: ["numeroabonado", "nroabonado", "abonado"],
  cobrador: ["cobrador", "vendedor", "responsable"],
};

const CAMPOS_OBLIGATORIOS = ["numero_servicio", "cliente", "direccion", "tarea"];

// Orden de prioridad al buscar coincidencias — los campos con
// variantes más específicas van primero, para que la variante
// genérica "numero" (de numero_servicio) no se robe por error una
// columna que en realidad es "Número de Abonado" o "Número de
// Cliente" (que también contienen "numero").
const ORDEN_BUSQUEDA = [
  "numero_cliente", "numero_abonado", "fecha_ingreso", "cobrador",
  "localidad", "telefono", "cliente", "direccion", "tarea", "numero_servicio",
];

// Recibe la matriz de filas (XLSX.utils.sheet_to_json con header:1) y
// devuelve { servicios, columnasNoDetectadas } — nunca tira excepción
// por columnas faltantes, para que un cambio menor en el archivo de
// origen no rompa la sincronización entera; en cambio, reporta qué
// campo obligatorio no pudo mapear.
function parsearServiciosPendientes(filas) {
  if (!filas || filas.length < 2) return { servicios: [], columnasNoDetectadas: CAMPOS_OBLIGATORIOS };

  const encabezados = filas[0].map((c) => normalizar(c));
  const mapaColumnas = {};
  const columnasUsadas = new Set();

  for (const campo of ORDEN_BUSQUEDA) {
    const variantes = [...VARIANTES_COLUMNA[campo]].sort((a, b) => b.length - a.length);
    const indice = encabezados.findIndex(
      (enc, i) => !columnasUsadas.has(i) && variantes.some((v) => enc.includes(v))
    );
    if (indice !== -1) {
      mapaColumnas[campo] = indice;
      columnasUsadas.add(indice);
    }
  }

  const columnasNoDetectadas = CAMPOS_OBLIGATORIOS.filter((campo) => mapaColumnas[campo] === undefined);
  if (columnasNoDetectadas.length > 0) {
    return { servicios: [], columnasNoDetectadas };
  }

  const servicios = [];
  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila || fila.every((c) => c === "" || c == null)) continue; // fila vacía

    const item = {
      numero_servicio: String(fila[mapaColumnas.numero_servicio] ?? "").trim(),
      cliente: String(fila[mapaColumnas.cliente] ?? "").trim(),
      direccion: String(fila[mapaColumnas.direccion] ?? "").trim(),
      tarea: String(fila[mapaColumnas.tarea] ?? "").trim(),
    };
    for (const campo of ["localidad", "telefono", "fecha_ingreso", "numero_cliente", "numero_abonado", "cobrador"]) {
      if (mapaColumnas[campo] !== undefined) {
        item[campo] = String(fila[mapaColumnas[campo]] ?? "").trim();
      }
    }
    if (item.numero_servicio || item.cliente) servicios.push(item);
  }

  return { servicios, columnasNoDetectadas: [] };
}

module.exports = { parsearServiciosPendientes, normalizar };
