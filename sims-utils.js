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
  // Sucursales con el mismo nombre ("Librería Ladder 1", "... 12"): los
  // números del nombre tienen que coincidir. Antes las palabras de menos
  // de 3 letras se ignoraban (incluido el "12"), y la línea de la
  // sucursal 3 aparecía como si fuera de la 12.
  const numerosDe = (t) => (normalizeText(t).match(/\d+/g) || []).map((n) => n.replace(/^0+(?=\d)/, "")).sort().join(",");
  const numerosCliente = numerosDe(nombreCliente);
  const porNombre = candidatas.find((s) => {
    // Si los dos tienen número de cliente y son distintos, es otro cliente seguro.
    if (numeroLimpio && s.numero_cliente && limpiarNumeroClienteParaComparar(s.numero_cliente) !== numeroLimpio) return false;
    if (numerosDe(s.cliente) !== numerosCliente) return false;
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
      // En el panel de la oficina se pregunta con un cartel de la página (el
      // confirm() del navegador se puede bloquear y elegía "dejar las dos" solo).
      const preguntar = typeof window !== "undefined" && typeof window.preguntarSimAsync === "function" ? window.preguntarSimAsync : (m) => confirm(m);
      const reemplazar = await preguntar(
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

// ---------- Código de abonado (cuenta del monitoreo) ----------
// Puede tener letras y números (hexadecimal, ej. 48ED, 0A3F). Excel (y la
// lectura de CSV) toma los que parecen notación científica como número:
// "48E2" pasa a 4800 (o "4,80E+03"), "12E4" a 120000; y a todos les saca los
// ceros de adelante ("0555" → 555). Antes, además, la conciliación les
// borraba las letras ("48ED" → "48"). Acá se arma la forma comparable.

// Forma comparable de un código escrito como texto: mayúsculas, sin espacios
// ni guiones, sin ceros a la izquierda.
function claveAbonado(v) {
  return String(v == null ? "" : v).trim().toUpperCase().replace(/[\s\-_/.]/g, "").replace(/^0+(?=.)/, "");
}
// Un número que puede haber salido de un código como "48E2": las formas
// "<mantisa>E<exponente>" de hasta 6 caracteres que dan ese número.
function formasCientificasAbonado(n) {
  if (!Number.isFinite(n) || n <= 0 || n !== Math.round(n)) return [];
  const formas = [];
  for (let e = 1; e <= 30; e++) {
    const m = n / Math.pow(10, e);
    if (m < 1) break;
    if (m !== Math.round(m)) continue;
    const f = `${m}E${e}`;
    if (f.length <= 6) formas.push(f);
  }
  // La de 4 caracteres primero (el largo habitual de una cuenta), después las más cortas.
  return formas.sort((a, b) => (a.length === 4 ? -1 : 0) - (b.length === 4 ? -1 : 0) || a.length - b.length);
}
// Todas las formas posibles del código de abonado leído de una planilla.
// La primera es la que se muestra.
function clavesAbonado(v) {
  if (v == null || v === "") return [];
  let n = null;
  if (typeof v === "number") n = v;
  else {
    const t = String(v).trim();
    // Texto que muestra Excel para esos números: "4,80E+03", "4.8E+3", "1,2E+05".
    if (/^\d+(?:[.,]\d+)?E\+\d+$/i.test(t) || /^\d+[.,]\d+E\d+$/i.test(t)) n = Number(t.replace(",", ".").replace(/e\+?/i, "e"));
    else { const c = claveAbonado(t); return c ? [c] : []; }
  }
  if (!Number.isFinite(n)) return [];
  const entero = String(Math.round(n));
  const ciencia = formasCientificasAbonado(Math.round(n));
  return [...new Set([...(ciencia.length && typeof v !== "number" ? ciencia : []), entero, ...ciencia].map(claveAbonado))];
}
// ¿El valor de la planilla corresponde a alguno de estos códigos (de la APP)?
function mismoAbonado(valorPlanilla, ...codigosApp) {
  const app = new Set(codigosApp.map(claveAbonado).filter(Boolean));
  return clavesAbonado(valorPlanilla).some((c) => app.has(c));
}
if (typeof module !== "undefined") module.exports = { ...(module.exports || {}), claveAbonado, clavesAbonado, mismoAbonado, formasCientificasAbonado };
