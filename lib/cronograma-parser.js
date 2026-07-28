// Lógica compartida para parsear el Excel del cronograma semanal
// (una hoja por día, técnicos en columnas, celdas combinadas = duración).
// La misma lógica existe también en admin.html (para la carga manual);
// esta copia la usa la función serverless que sincroniza desde Drive.

const MESES = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10",
  noviembre: "11", diciembre: "12",
};

function limpiarTexto(v) {
  return (v ?? "").toString().replace(/_x000D_/g, " ").replace(/\r/g, " ").trim();
}

function extraerFechaISO(tituloCelda) {
  const texto = limpiarTexto(tituloCelda).toLowerCase();
  const match = texto.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(\d{4})|(\d{1,2})\s+([a-záéíóú]+)\s+(\d{4})/);
  if (!match) return null;
  const dia = match[1] || match[4];
  const mesTexto = (match[2] || match[5] || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const anio = match[3] || match[6];
  const mes = MESES[mesTexto];
  if (!mes) return null;
  return `${anio}-${mes}-${dia.padStart(2, "0")}`;
}

function parsearHojaCronograma(XLSX, ws, nombreHoja) {
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  if (!filas || filas.length < 4) return { tareas: [], tecnicos: [] };

  const fechaISO = extraerFechaISO(filas[0] && filas[0][1]);
  const encabezado = filas[2] || [];
  const columnasTecnico = [];
  for (let c = 1; c < encabezado.length; c++) {
    const nombre = limpiarTexto(encabezado[c]);
    if (nombre) columnasTecnico.push({ col: c, tecnico: nombre });
  }
  if (columnasTecnico.length === 0) return { tareas: [], tecnicos: [] };

  const franjas = [];
  for (let r = 3; r < filas.length; r++) {
    const label = limpiarTexto(filas[r] && filas[r][0]);
    const partes = label.split("-").map((p) => p.trim());
    franjas[r] = { inicio: partes[0] || "", fin: partes[1] || "" };
  }

  const merges = ws["!merges"] || [];
  const cubiertas = new Set();
  const tareas = [];

  merges.forEach((m) => {
    const { s, e } = m;
    if (s.c < 1 || s.r < 3) return;
    for (let r = s.r; r <= e.r; r++) {
      for (let c = s.c; c <= e.c; c++) cubiertas.add(`${r},${c}`);
    }
    const valor = limpiarTexto(filas[s.r] && filas[s.r][s.c]);
    if (!valor) return;
    const tecnicoCol = columnasTecnico.find((t) => t.col === s.c);
    if (!tecnicoCol) return;
    tareas.push({
      fecha: fechaISO,
      dia_label: nombreHoja,
      tecnico: tecnicoCol.tecnico,
      hora_inicio: (franjas[s.r] || {}).inicio || "",
      hora_fin: (franjas[e.r] || {}).fin || "",
      tarea: valor,
    });
  });

  columnasTecnico.forEach(({ col, tecnico }) => {
    for (let r = 3; r < filas.length; r++) {
      if (cubiertas.has(`${r},${col}`)) continue;
      const valor = limpiarTexto(filas[r] && filas[r][col]);
      if (!valor) continue;
      tareas.push({
        fecha: fechaISO,
        dia_label: nombreHoja,
        tecnico,
        hora_inicio: (franjas[r] || {}).inicio || "",
        hora_fin: (franjas[r] || {}).fin || "",
        tarea: valor,
      });
    }
  });

  return { tareas, tecnicos: columnasTecnico.map((c) => c.tecnico) };
}

function parsearLibroCronograma(XLSX, workbook) {
  let todas = [];
  const tecnicosSet = new Set();
  workbook.SheetNames.forEach((nombre) => {
    const { tareas, tecnicos } = parsearHojaCronograma(XLSX, workbook.Sheets[nombre], nombre);
    todas = todas.concat(tareas);
    tecnicos.forEach((t) => tecnicosSet.add(t));
  });
  return { tareas: todas, tecnicos: [...tecnicosSet] };
}

module.exports = { parsearHojaCronograma, parsearLibroCronograma, limpiarTexto, extraerFechaISO };
