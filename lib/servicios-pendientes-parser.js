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
  let texto = (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  // "Nº" / "N°" es la abreviatura habitual de "Número" en estos
  // listados — sin este paso, el símbolo se perdía al limpiar y
  // quedaba una sola letra "n" suelta, que no matchea con nada.
  texto = texto.replace(/n[°ºª]/g, "numero ");
  const sinAcentos = texto.replace(/[^a-z0-9]+/g, " ").trim();
  return sinAcentos
    .split(" ")
    .filter((palabra) => palabra && !PALABRAS_CONECTORAS.has(palabra))
    .join("");
}

// Cada campo acepta varias formas posibles de encabezado — se
// comparan ya normalizadas (sin tildes/espacios/mayúsculas).
const VARIANTES_COLUMNA = {
  numero_servicio: ["numeroservicio", "nroservicio", "numserv", "nservicio", "servicio", "idservicio", "numero"],
  cliente: ["cliente", "nombrecliente", "razonsocial", "nombrefantasia", "fantasia"],
  direccion: ["direccion", "domicilio"],
  tarea: ["tarea", "trabajo", "descripcion", "detalle", "motivo"],
  localidad: ["localidad", "ciudad", "zona"],
  telefono: ["telefono", "tel", "celular", "contacto"],
  fecha_ingreso: ["fechaingreso", "fecha", "fechacarga", "fechaalta"],
  numero_cliente: ["numerocliente", "nrocliente", "codigocliente", "idcliente"],
  numero_abonado: ["numeroabonado", "nroabonado", "abonado"],
  cobrador: ["cobrador", "vendedor", "responsable"],
  tecnico_asignado: ["tecnicoasignado", "tecnicoasig", "asignado"],
};

const CAMPOS_OBLIGATORIOS = ["numero_servicio", "cliente", "direccion", "tarea"];

// Orden de prioridad al buscar coincidencias — los campos con
// variantes más específicas van primero, para que la variante
// genérica "numero" (de numero_servicio) no se robe por error una
// columna que en realidad es "Número de Abonado" o "Número de
// Cliente" (que también contienen "numero").
const ORDEN_BUSQUEDA = [
  "numero_cliente", "numero_abonado", "fecha_ingreso", "cobrador", "tecnico_asignado",
  "localidad", "telefono", "cliente", "direccion", "tarea", "numero_servicio",
];

function mapearEncabezados(filaEncabezados) {
  const encabezados = filaEncabezados.map((c) => normalizar(c));
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
  return mapaColumnas;
}

// Recibe la matriz de filas (XLSX.utils.sheet_to_json con header:1) y
// devuelve { servicios, columnasNoDetectadas } — nunca tira excepción
// por columnas faltantes, para que un cambio menor en el archivo de
// origen no rompa la sincronización entera; en cambio, reporta qué
// campo obligatorio no pudo mapear.
//
// El archivo real suele tener varias filas de título/filtros ANTES
// de la fila con los encabezados de columna en sí (ver el ejemplo
// real que mandó SAT: "Listado:", "Filtros:", "Orden:" antes de la
// fila con "Nº", "Cliente", etc.) — por eso se prueban las primeras
// filas una por una, y se usa la que mejor matchea, en vez de asumir
// que los encabezados están siempre en la fila 1.
function parsearServiciosPendientes(filas) {
  if (!filas || filas.length < 2) return { servicios: [], columnasNoDetectadas: CAMPOS_OBLIGATORIOS };

  const LIMITE_BUSQUEDA_ENCABEZADO = Math.min(filas.length - 1, 25);
  let mejorFilaIndice = 0;
  let mejorMapa = {};
  let mejorCantidad = -1;

  for (let i = 0; i < LIMITE_BUSQUEDA_ENCABEZADO; i++) {
    const mapa = mapearEncabezados(filas[i] || []);
    const cantidad = CAMPOS_OBLIGATORIOS.filter((campo) => mapa[campo] !== undefined).length;
    if (cantidad > mejorCantidad) {
      mejorCantidad = cantidad;
      mejorMapa = mapa;
      mejorFilaIndice = i;
    }
    if (cantidad === CAMPOS_OBLIGATORIOS.length) break; // ya encontró todos, no hace falta seguir
  }

  const mapaColumnas = mejorMapa;
  const columnasNoDetectadas = CAMPOS_OBLIGATORIOS.filter((campo) => mapaColumnas[campo] === undefined);
  if (columnasNoDetectadas.length > 0) {
    return { servicios: [], columnasNoDetectadas };
  }

  const servicios = [];
  for (let i = mejorFilaIndice + 1; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila || fila.every((c) => c === "" || c == null)) continue; // fila vacía

    const item = {
      numero_servicio: String(fila[mapaColumnas.numero_servicio] ?? "").trim(),
      cliente: String(fila[mapaColumnas.cliente] ?? "").trim(),
      direccion: String(fila[mapaColumnas.direccion] ?? "").trim(),
      tarea: String(fila[mapaColumnas.tarea] ?? "").trim(),
    };
    for (const campo of ["localidad", "telefono", "fecha_ingreso", "numero_cliente", "numero_abonado", "cobrador", "tecnico_asignado"]) {
      if (mapaColumnas[campo] !== undefined) {
        item[campo] = String(fila[mapaColumnas[campo]] ?? "").trim();
      }
    }
    if (item.numero_servicio || item.cliente) servicios.push(item);
  }

  return { servicios, columnasNoDetectadas: [] };
}

module.exports = { parsearServiciosPendientes, normalizar };
