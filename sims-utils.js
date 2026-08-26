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

// Envía una acción de SIM (usar/reemplazar) y maneja sola la
// respuesta 409 "cliente_ya_tiene_linea" que puede devolver el
// servidor — esa es la verificación de respaldo que hace el backend
// por su cuenta (ver sims.js), independiente de lo que el frontend ya
// haya chequeado antes. Así, aunque el chequeo previo del frontend
// falle por el motivo que sea (caché vacío, red, un bug futuro), esta
// función siempre termina mostrando el mismo aviso de "reemplazar o
// dejar las dos" antes de que la SIM quede instalada en silencio.
async function enviarAccionSimConRespaldo(payload, token) {
  const intentar = async (cuerpo) => {
    const res = await fetch("/api/recurso-uso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(cuerpo),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  };

  const primero = await intentar(payload);
  if (primero.ok) return primero.data;

  if (primero.status === 409 && primero.data.error === "cliente_ya_tiene_linea") {
    const existente = primero.data.linea_existente;
    let siguienteCuerpo;
    if (primero.data.certeza === "confirmada") {
      const reemplazar = confirm(
        `Este cliente ya tiene la línea N° ${existente.numero} de ${existente.empresa}` +
        `${existente.tipo ? " " + existente.tipo : ""}, a nombre de "${existente.cliente}".\n\n` +
        `Aceptar = reemplazarla (vuelve a tu stock).\nCancelar = dejar las dos líneas instaladas.`
      );
      siguienteCuerpo = reemplazar
        ? { ...payload, accion: "reemplazar", numero_sim_a_retirar: existente.numero }
        : { ...payload, confirmar_dejar_ambas: true };
    } else {
      alert(
        `No pude confirmar con certeza si este cliente ya tiene otra línea (no tengo su número de cliente).\n\n` +
        `Encontré algo parecido: línea N° ${existente.numero} de ${existente.empresa}, a nombre de "${existente.cliente}".\n\n` +
        `Si es el mismo cliente, retirala vos mismo desde "SIM instaladas" antes de continuar. Si no es el mismo, seguí tranquilo.`
      );
      siguienteCuerpo = { ...payload, confirmar_dejar_ambas: true };
    }

    const segundo = await intentar(siguienteCuerpo);
    if (!segundo.ok) throw new Error(segundo.data.error || "Error desconocido");
    return segundo.data;
  }

  throw new Error(primero.data.error || "Error desconocido");
}
