// Utilidades compartidas para relacionar una SIM con un cliente —
// usadas TANTO por app.js (la app del técnico) COMO por admin.html.
// Antes cada archivo tenía su propia copia de esta lógica, y se
// desincronizaron sin que nadie lo notara hasta que un caso real lo
// dejó en evidencia. Con un solo archivo, un arreglo futuro vale
// para los dos lugares a la vez.

function normalizeText(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// El número de cliente es único e irrepetible en la base (verificado:
// sin duplicados). Se limpia antes de comparar (sin ceros a la
// izquierda, sin espacios/guiones) porque el mismo cliente puede
// aparecer con distinto formato según de dónde venga el dato (un
// servicio pendiente del Excel sincronizado vs. lo guardado al
// instalar una SIM).
function limpiarNumeroClienteParaComparar(n) {
  return String(n || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

// Devuelve un objeto con "tipo":
//  - "confirmada": se encontró por número de cliente — dato único e
//    irrepetible, así que acá sí se puede ofrecer un reemplazo
//    automático con confianza.
//  - "sin_certeza": no se pudo confirmar por número (falta de un
//    lado o del otro) pero el nombre escrito se parece al de una SIM
//    ya instalada — se debe avisar y mostrar cuál, pero la decisión
//    de reemplazar queda en manos de la persona, nunca automática.
//  - "ninguna": no hay ningún indicio de que el cliente ya tenga
//    otra línea.
//
// Antes, sin número de cliente, se ofrecía igual un reemplazo
// automático si el nombre coincidía lo suficiente — y esto una vez
// hizo que se ofreciera reemplazar la línea de un cliente
// completamente distinto que solo compartía el apellido con el que
// realmente se buscaba. Ahora, sin número, nunca se decide solo.
//
// IMPORTANTE: si el cliente actual SÍ tiene número pero la SIM
// instalada existente NO lo tiene guardado (registros viejos, de
// antes de garantizar ese campo, o corregidos a mano sin ese dato),
// buscar solo por número corta la búsqueda ahí y nunca encuentra
// nada — un caso real así hizo que el sistema dijera "no hay otra
// línea" cuando sí la había. Por eso, si la búsqueda por número no
// encuentra nada, se sigue igual al respaldo por nombre, en vez de
// cortar de una.
function buscarSimExistenteEnCliente(nombreCliente, numeroCliente, simsCache, numeroSimAExcluir) {
  const candidatas = (simsCache || []).filter((s) => s.estado === "uso" && s.numero !== numeroSimAExcluir && s.cliente);

  const numeroLimpio = limpiarNumeroClienteParaComparar(numeroCliente);
  if (numeroLimpio) {
    const porNumero = candidatas.find((s) => s.numero_cliente && limpiarNumeroClienteParaComparar(s.numero_cliente) === numeroLimpio);
    if (porNumero) return { tipo: "confirmada", sim: porNumero };
  }

  const normCliente = normalizeText(nombreCliente);
  if (!normCliente) return { tipo: "ninguna" };
  const porNombre = candidatas.find((s) => {
    const palabrasBase = normalizeText(s.cliente).split(/\s+/).filter((p) => p.length > 2);
    const palabrasTecnico = normCliente.split(/\s+/).filter((p) => p.length > 2);
    if (palabrasBase.length === 0 || palabrasTecnico.length === 0) return false;
    const masCorto = palabrasBase.length <= palabrasTecnico.length ? palabrasBase : palabrasTecnico;
    const masLargo = palabrasBase.length <= palabrasTecnico.length ? palabrasTecnico : palabrasBase;
    return masCorto.every((p) => masLargo.includes(p));
  });
  return porNombre ? { tipo: "sin_certeza", sim: porNombre } : { tipo: "ninguna" };
}
