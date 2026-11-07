// Prueba de estrés del stock: miles de operaciones al azar (entregas, recepciones con diferencia,
// rechazos, devoluciones, partes, retiros, garantías, ajustes, bajas, inventarios, movimientos que
// tardan en pasar al historial) y, después de CADA una, el cuadre completo tiene que dar bien:
// el saldo guardado es igual al que dan los movimientos, nada negativo, cada equipo en un solo
// lugar, lo «en camino» igual a los envíos abiertos. También se comprueba que el cuadre detecta
// cuando algo se rompe a propósito.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const S = require(path.join(__dirname, "..", "stock-utils.js"));

function azar(semilla) {
  let a = semilla >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const CATALOGO = { articulos: {
  "23940": { c: "23940", d: "INFRARROJO AJAX", tipo: "unidad" },
  "20825": { c: "20825", d: "TECLADO PARADOX", tipo: "unidad" },
  "20208": { c: "20208", d: "SIRENA", tipo: "cantidad" },
  "40001": { c: "40001", d: "BATERIA 12V", tipo: "cantidad" },
  "50001": { c: "50001", d: "CABLE 4 HILOS", tipo: "cantidad", medida: "metros" },
  "90001": { c: "90001", d: "SIM PERSONAL", tipo: "sim" },
} };
const UNIDAD = ["23940", "20825"], TODOS = ["23940", "20825", "20208", "40001", "50001"];
const TECNICOS = ["Juan", "Luis"], CLIENTES = ["cli:Kiosco", "cli:Panaderia", "com:Club"];

function simular(semilla, pasos) {
  const r = azar(semilla), elegir = (l) => l[Math.floor(r() * l.length)], ent = (a, b) => a + Math.floor(r() * (b - a + 1));
  let s = { ubic: {}, unidades: {}, pedidos: {}, envios: [] };
  const historial = [], registro = [];
  let reloj = Date.UTC(2026, 10, 1, 12), nSerie = 0, nId = 0;
  const fecha = () => new Date((reloj += ent(1, 3) * 60000)).toISOString();
  const nuevaSerie = (c) => `${c === "23940" ? "3082BE" : "GH12"}${String(++nSerie).padStart(5, "0")}`;
  const hay = (u, c) => ((s.ubic[u] || {})[c]) || 0;
  // Como el servidor: el saldo y sus movimientos se guardan juntos; a veces el paso al historial
  // del mes falla y los movimientos quedan en «movsPend» hasta la próxima operación.
  const guardar = (res, nombre) => {
    if (res.error) { registro.push(`${nombre}: rechazado (${res.error.slice(0, 60)})`); return false; }
    const movs = res.movs || [];
    let nuevo = S.anotarPresupuestos(res.saldos, movs);
    if (movs.length) nuevo = { ...nuevo, movsPend: [...(nuevo.movsPend || []), ...movs] };
    if (r() < 0.85 && (nuevo.movsPend || []).length) { historial.push(...nuevo.movsPend); nuevo = { ...nuevo, movsPend: [] }; }
    // A veces el mismo movimiento llega dos veces al historial (reintento): no tiene que contar doble.
    if (r() < 0.03 && historial.length) historial.push({ ...historial[historial.length - 1] });
    s = nuevo;
    registro.push(`${nombre}: ok (${movs.length} mov.)`);
    if (process.env.DBG) registro.push("   " + JSON.stringify(movs.map((m) => [m.tipo, m.c, m.cant, m.de, m.a, m.unidades])));
    return true;
  };
  // Lo que sale de un lugar: cantidad y, si hay equipos con N° ahí, cuáles (a veces mal, a propósito).
  const armarSalida = (de, maxArts) => {
    const disponibles = TODOS.filter((c) => hay(de, c) > 0);
    if (!disponibles.length) return null;
    const items = [];
    for (let i = 0; i < Math.min(maxArts, disponibles.length); i++) {
      const c = disponibles[i];
      const n = Math.min(hay(de, c), CATALOGO.articulos[c].medida === "metros" ? ent(1, 60) : ent(1, 3));
      const series = S.seriesEn(s, de, c);
      const it = { c, cant: r() < 0.05 ? n + 5 : n };
      if (series.length) it.unidades = r() < 0.06 ? [] : series.slice(0, Math.min(n, series.length));
      if (UNIDAD.includes(c) && !series.length && r() < 0.3) it.unidades = [nuevaSerie(c)]; // N° que la APP no conocía
      items.push(it);
    }
    return items;
  };
  const ops = {
    ingreso() {
      const c = elegir(TODOS), n = CATALOGO.articulos[c].medida === "metros" ? ent(50, 300) : ent(1, 6);
      const unidades = UNIDAD.includes(c) && r() < 0.7 ? Array.from({ length: n }, () => nuevaSerie(c)) : [];
      return guardar(S.moverStock(s, [{ c, cant: n, unidades, prov: "2842" }], { tipo: "ingreso", de: "proveedor", a: "dep", por: "Melina", fecha: fecha() }, CATALOGO), "ingreso");
    },
    entrega() {
      const items = armarSalida("dep", ent(1, 3)); if (!items) return;
      return guardar(S.moverStock(s, items, { tipo: "entrega", de: "dep", a: `tec:${elegir(TECNICOS)}`, por: "Melina", fecha: fecha(), confirmar: true }, CATALOGO), "entrega");
    },
    aVehiculo() {
      const ida = r() < 0.6, de = ida ? "dep" : "veh:Kangoo", a = ida ? "veh:Kangoo" : "dep";
      const items = armarSalida(de, 2); if (!items) return;
      return guardar(S.moverStock(s, items, { tipo: "movimiento", de, a, por: "Melina", fecha: fecha() }, CATALOGO), "vehículo");
    },
    devolver() {
      const t = elegir(TECNICOS), items = armarSalida(`tec:${t}`, 2); if (!items) return;
      return guardar(S.moverStock(s, items, { tipo: "devolucion", de: `tec:${t}`, a: "dep", por: t, fecha: fecha(), confirmar: true }, CATALOGO), "devolución");
    },
    confirmar() {
      if (!s.envios.length) return;
      const e = elegir(s.envios), modo = r();
      let resp;
      if (modo < 0.6) resp = { accion: "recibi", por: "Juan", fecha: fecha() };
      else if (modo < 0.85) resp = { accion: "recibi", por: "Juan", fecha: fecha(), motivo: "No llegó todo", items: e.items.map((x) => { const cant = ent(0, x.cant); const u = x.unidades || []; return { c: x.c, cant, ...(u.length && r() < 0.8 ? { unidades: u.filter(() => r() < 0.6) } : {}) }; }) };
      else resp = { accion: "rechazar", por: "Juan", fecha: fecha(), motivo: "No es lo que pedí" };
      if (e.a === "dep" && r() < 0.15) resp.destino = "gar";
      return guardar(S.cerrarEnvio(s, e.id, resp), `envío ${resp.accion}`);
    },
    parte() {
      // Como consumo_parte: lo usado sale del técnico de a uno; lo que no se puede queda para aprobar.
      const t = elegir(TECNICOS), destino = elegir(CLIENTES), f = fecha();
      const items = armarSalida(`tec:${t}`, 2) || [];
      let algo = false;
      items.forEach((it) => {
        const m = S.moverStock(s, [it], { tipo: "instalado_parte", de: `tec:${t}`, a: destino, por: t, fecha: f, motivo: "Parte", presupuesto: "4521" }, CATALOGO);
        if (!m.error) { guardar(m, "parte: usado"); algo = true; }
      });
      if (r() < 0.5) {
        const c = elegir(TODOS), unidades = UNIDAD.includes(c) ? (r() < 0.5 ? S.seriesEn(s, destino, c).slice(0, 1) : [nuevaSerie(c)]) : [];
        const m = S.moverStock(s, [{ c, cant: unidades.length || ent(1, 2), unidades }], { tipo: "retirado_parte", de: destino, a: `tec:${t}`, por: t, fecha: f, motivo: "Parte · retiro", deFlexible: true }, CATALOGO);
        guardar(m, "parte: retiro"); algo = true;
      }
      return algo;
    },
    falla() {
      const t = elegir(TECNICOS), c = elegir(UNIDAD), series = S.seriesEn(s, `tec:${t}`, c);
      if (!series.length) return;
      const res = S.moverStock(s, [{ c, cant: 1, unidades: [series[0]] }], { tipo: "devolucion", de: `tec:${t}`, a: "dep", por: t, fecha: fecha(), confirmar: true, fallado: true, falla: "No detecta" }, CATALOGO);
      return guardar(res, "devuelve fallado");
    },
    garantia() {
      const enGar = Object.entries(s.unidades).filter(([, u]) => u.u === "gar");
      if (!enGar.length) return;
      const [t, u] = elegir(enGar), f = fecha(), estado = elegir(["reparado", "reemplazado", "rechazado"]);
      const id = (k) => `g${++nId}-${k}`, movs = [];
      if (estado === "reparado") movs.push({ id: id(1), fecha: f, tipo: "garantia_reparado", c: u.c, cant: 1, de: "gar", a: "dep", unidades: [t] });
      if (estado === "reemplazado") { const nuevo = nuevaSerie(u.c); movs.push({ id: id(1), fecha: f, tipo: "garantia_reemplazo", c: u.c, cant: 1, de: "gar", unidades: [t] }, { id: id(2), fecha: f, tipo: "garantia_reemplazo", c: u.c, cant: 1, a: "dep", unidades: [nuevo] }); }
      if (estado === "rechazado") movs.push({ id: id(1), fecha: f, tipo: "garantia_rechazada", c: u.c, cant: 1, de: "gar", unidades: [t] });
      let s2 = s; movs.forEach((m) => { s2 = S.aplicarMovimiento(s2, m); });
      return guardar({ saldos: s2, movs }, `garantía ${estado}`);
    },
    ajuste() {
      // Como «ajustar» del servidor: deja la cantidad indicada; nunca menos que los equipos con N° ahí.
      const ubic = elegir(["dep", "dep", "veh:Kangoo", `tec:${elegir(TECNICOS)}`]), c = elegir(TODOS);
      const antes = hay(ubic, c), cantidad = Math.max(0, antes + ent(-3, 3)), dif = cantidad - antes;
      if (!dif) return;
      if (cantidad < S.seriesEn(s, ubic, c).length) { registro.push("ajuste: rechazado (N° de serie)"); return; }
      const mov = { id: `aj${++nId}`, fecha: fecha(), tipo: "ajuste", c, cant: Math.abs(dif), ...(dif > 0 ? { a: ubic } : { de: ubic }), motivo: "Conteo" };
      return guardar({ saldos: S.aplicarMovimiento(s, mov), movs: [mov] }, "ajuste");
    },
    baja() {
      // Como «baja_serie»: un equipo identificado que ya no está.
      const lista = Object.entries(s.unidades).filter(([, u]) => u.u && u.u !== "baja" && !/^cam:/.test(u.u));
      if (!lista.length) return;
      const [t, u] = elegir(lista), n = hay(u.u, u.c), conSerie = S.seriesEn(s, u.u, u.c).length;
      const mov = { id: `b${++nId}`, fecha: fecha(), tipo: "baja", c: u.c, cant: n >= conSerie && n > 0 ? 1 : 0, de: u.u, unidades: [t], motivo: "Perdido" };
      return guardar({ saldos: S.aplicarMovimiento(s, mov), movs: [mov] }, "baja de N°");
    },
    inventario() {
      const ubic = elegir(["dep", `tec:${elegir(TECNICOS)}`]), c = elegir(UNIDAD);
      const x = S.registrarUnidades(s, ubic, [{ c, unidades: Array.from({ length: ent(1, 4) }, () => nuevaSerie(c)) }], fecha());
      return guardar({ saldos: x.saldos, movs: x.registradas ? [{ id: `inv${++nId}`, fecha: fecha(), tipo: "inventario_series", c: "", cant: x.registradas, a: ubic }] : [] }, "inventario de N°");
    },
    aCliente() {
      // Sale directo del depósito a un cliente con N° de presupuesto…
      const items = armarSalida("dep", 2); if (!items) return;
      return guardar(S.moverStock(s, items, { tipo: "a_cliente", de: "dep", a: elegir(CLIENTES), por: "Melina", fecha: fecha(), presupuesto: String(ent(4500, 4510)) }, CATALOGO), "a cliente");
    },
    noUsado() {
      // …y vuelve lo que el cliente no quiso instalar.
      const nums = Object.keys(s.presupuestos || {}); if (!nums.length) return;
      const n = elegir(nums), p = S.pendienteDePresupuesto(s, n); if (!p || !p.items.length) return;
      const x = elegir(p.items), cant = ent(1, x.cant);
      return guardar(S.moverStock(s, [{ c: x.c, cant, unidades: x.series.slice(0, cant) }], { tipo: "devuelto_sin_usar", de: p.cliente, a: "dep", por: "Melina", fecha: fecha(), presupuesto: n, deFlexible: true }, CATALOGO), "vuelve sin usar");
    },
    noPermitido() {
      // Lo que nunca se puede: mover un SIM, mover más de lo que hay, un N° de otro artículo.
      const malos = [
        () => S.moverStock(s, [{ c: "90001", cant: 1 }], { tipo: "entrega", de: "dep", a: "tec:Juan" }, CATALOGO),
        () => S.moverStock(s, [{ c: "20208", cant: hay("dep", "20208") + 1 }], { tipo: "entrega", de: "dep", a: "tec:Juan" }, CATALOGO),
        () => { const t = Object.keys(s.unidades).find((k) => s.unidades[k].c === "23940"); return t ? S.moverStock(s, [{ c: "20825", cant: 1, unidades: [t] }], { tipo: "movimiento", de: "dep", a: "veh:Kangoo" }, CATALOGO) : { error: "sin datos" }; },
        () => S.moverStock(s, [{ c: "20208", cant: 1 }], { tipo: "movimiento", de: "dep", a: "dep" }, CATALOGO),
        () => S.cerrarEnvio(s, "no-existe", { accion: "recibi" }),
      ];
      const antes = JSON.stringify(s), res = elegir(malos)();
      assert.ok(res.error, "una operación prohibida tiene que rechazarse");
      assert.strictEqual(JSON.stringify(s), antes, "una operación rechazada no puede cambiar nada");
    },
  };
  const pesos = [["ingreso", 10], ["entrega", 14], ["aVehiculo", 5], ["devolver", 8], ["confirmar", 16], ["parte", 12], ["falla", 4], ["garantia", 4], ["ajuste", 6], ["baja", 2], ["inventario", 5], ["aCliente", 5], ["noUsado", 5], ["noPermitido", 4]];
  const total = pesos.reduce((a, [, p]) => a + p, 0);
  // Saldo inicial: depósito y comodato sin asignar, como el listado de Oficina.
  const fi = fecha(), inicial = [];
  TODOS.forEach((c, i) => { inicial.push({ id: `ini-${i}`, fecha: fi, tipo: "inicial", c, cant: CATALOGO.articulos[c].medida === "metros" ? 500 : ent(3, 12), a: "dep" }); });
  inicial.push({ id: "ini-com", fecha: fi, tipo: "inicial", c: "20208", cant: 3, a: "com:Sin asignar" });
  let s0 = s; inicial.forEach((m) => { s0 = S.aplicarMovimiento(s0, m); });
  guardar({ saldos: { ...s0, inicializado: fi }, movs: inicial }, "saldo inicial");
  for (let paso = 0; paso < pasos; paso++) {
    let x = r() * total, op = pesos[0][0];
    for (const [k, p] of pesos) { if (x < p) { op = k; break; } x -= p; }
    const antes = JSON.stringify(s);
    ops[op]();
    const cuadre = S.auditarStock(s, historial, CATALOGO, { ahora: new Date(reloj) });
    if (!cuadre.ok) {
      assert.fail(`Semilla ${semilla}, paso ${paso} (${op}): el stock no cuadra.\n` + cuadre.errores.map((e) => "  - " + e.texto).join("\n")
        + "\nÚltimas operaciones:\n" + registro.slice(-6).map((t) => "  " + t).join("\n") + "\nAntes: " + antes.slice(0, 400));
    }
  }
  return { s, historial, registro };
}

test("Estrés del stock: 40 historias de 400 operaciones al azar, y el cuadre da bien después de cada una", () => {
  let operaciones = 0, movimientos = 0;
  const hechas = {};
  for (let semilla = 1; semilla <= 40; semilla++) {
    const { historial, registro } = simular(semilla, 400);
    operaciones += registro.length; movimientos += historial.length;
    registro.forEach((t) => { const m = /^([^:]+(?:: \w+)?): ok/.exec(t); if (m) hechas[m[1]] = (hechas[m[1]] || 0) + 1; });
  }
  assert.ok(operaciones > 12000 && movimientos > 15000, `se probaron ${operaciones} operaciones y ${movimientos} movimientos`);
  // Cada tipo de operación se probó de verdad muchas veces (no solo los rechazos).
  ["ingreso", "entrega", "vehículo", "devolución", "envío recibi", "envío rechazar", "parte: usado", "parte: retiro", "devuelve fallado", "garantía reparado", "garantía reemplazado", "garantía rechazado", "ajuste", "baja de N°", "inventario de N°", "a cliente", "vuelve sin usar"]
    .forEach((k) => assert.ok((hechas[k] || 0) >= 10, `${k}: solo ${hechas[k] || 0} veces`));
});

test("El cuadre detecta cuando algo se rompe: cantidad tocada a mano, equipo cambiado de lugar, movimiento perdido, envío inconsistente", () => {
  const { s, historial } = simular(7, 300);
  const ok = S.auditarStock(s, historial, CATALOGO);
  assert.ok(ok.ok);
  assert.ok(ok.revisados.movimientos > 100 && ok.revisados.series > 5);
  const romper = (f) => { const x = JSON.parse(JSON.stringify(s)); const h = JSON.parse(JSON.stringify(historial)); f(x, h); return S.auditarStock(x, h, CATALOGO); };
  // 1) Alguien cambia una cantidad sin movimiento.
  let r = romper((x) => { x.ubic.dep = x.ubic.dep || {}; x.ubic.dep["40001"] = (x.ubic.dep["40001"] || 0) + 2; });
  assert.ok(r.errores.some((e) => e.k === "cantidad" && e.c === "40001" && e.ubic === "dep"), "cantidad tocada a mano");
  // 2) Un equipo aparece en otro lugar sin movimiento.
  const t = Object.keys(s.unidades).find((k) => s.unidades[k].u === "dep" || /^tec:/.test(s.unidades[k].u));
  r = romper((x) => { x.unidades[t].u = x.unidades[t].u === "dep" ? "veh:Kangoo" : "dep"; });
  assert.ok(r.errores.some((e) => (e.k === "serieLugar" && e.serie === t)), "equipo movido sin movimiento");
  // 3) Se pierde un movimiento del historial.
  const i = historial.findIndex((m) => m.tipo === "entrega" || m.tipo === "ingreso");
  r = romper((x, h) => { h.splice(i, 1); assert.ok(!S.auditarStock(x, h, CATALOGO).ok, "movimiento perdido"); });
  // Regularizar (aceptar lo guardado) deja el historial cuadrando, sin tocar el saldo.
  [(x) => { x.ubic.dep = x.ubic.dep || {}; x.ubic.dep["40001"] = (x.ubic.dep["40001"] || 0) + 2; }, (x) => { x.unidades[t].u = x.unidades[t].u === "dep" ? "veh:Kangoo" : "dep"; }, (x) => { x.ubic["veh:Kangoo"] = { ...(x.ubic["veh:Kangoo"] || {}) }; delete x.ubic["veh:Kangoo"]["50001"]; }].forEach((f) => {
    const x = JSON.parse(JSON.stringify(s)); f(x);
    const antes = JSON.stringify(x), movs = S.movimientosDeRegularizacion(x, historial, CATALOGO, { por: "Seba" });
    assert.ok(movs.length && movs.every((m) => m.tipo === "regularizacion"));
    const r2 = S.auditarStock(x, [...historial, ...movs], CATALOGO);
    assert.ok(r2.errores.every((e) => e.k === "seriesDeMas" || e.k === "camino"), r2.errores.map((e) => e.texto).join("\n"));
    assert.strictEqual(JSON.stringify(x), antes);
  });
  // 4) Cantidad negativa.
  r = romper((x) => { x.ubic["tec:Juan"] = { ...(x.ubic["tec:Juan"] || {}), "20208": -1 }; });
  assert.ok(r.errores.some((e) => e.k === "negativo"));
  // 5) Material «en camino» que no está en ningún envío.
  r = romper((x) => { x.ubic["cam:Luis"] = { ...(x.ubic["cam:Luis"] || {}), "40001": ((x.ubic["cam:Luis"] || {})["40001"] || 0) + 1 }; });
  assert.ok(r.errores.some((e) => e.k === "camino"));
  // 6) Un equipo de más en un lugar (más N° de serie que cantidad).
  r = romper((x) => { x.unidades.EXTRA00001 = { c: "23940", u: "dep" }; x.ubic.dep = { ...(x.ubic.dep || {}), "23940": 0 }; delete x.ubic.dep["23940"]; Object.keys(x.unidades).forEach((k) => { if (x.unidades[k].c === "23940" && x.unidades[k].u === "dep" && k !== "EXTRA00001") x.unidades[k].u = "dep"; }); });
  assert.ok(r.errores.some((e) => e.k === "seriesDeMas" || e.k === "cantidad"));
});

test("Cuadre: un saldo inicial nuevo (forzado) vuelve a empezar el depósito; el inventario de N° no mueve cantidades; movimientos repetidos cuentan una vez", () => {
  const m = (id, fecha, tipo, c, cant, de, a, unidades) => ({ id, fecha, tipo, c, cant, ...(de ? { de } : {}), ...(a ? { a } : {}), ...(unidades ? { unidades } : {}) });
  const hist = [
    m("1", "2026-10-01T10:00:00Z", "inicial", "20208", 10, null, "dep"),
    m("2", "2026-10-02T10:00:00Z", "entrega", "20208", 3, "dep", "tec:Juan"),
    m("3", "2026-10-05T10:00:00Z", "inicial", "20208", 4, null, "dep"),
    m("4", "2026-10-06T10:00:00Z", "inventario_series", "", 2, null, "dep"),
    m("5", "2026-10-07T10:00:00Z", "ingreso", "23940", 1, null, "dep", ["3082BE00001"]),
  ];
  const saldos = { ubic: { dep: { "20208": 4, "23940": 1 }, "tec:Juan": { "20208": 3 } }, unidades: { "3082BE00001": { c: "23940", u: "dep" } }, envios: [] };
  const r = S.auditarStock(saldos, [...hist, { ...hist[1] }], CATALOGO);
  assert.ok(r.ok, r.errores.map((e) => e.texto).join("\n"));
  assert.ok(r.avisos.some((a) => a.k === "duplicados"));
  // Los movimientos que todavía están en «movsPend» también cuentan.
  const r2 = S.auditarStock({ ...saldos, movsPend: [hist[4]] }, hist.slice(0, 4), CATALOGO);
  assert.ok(r2.ok, r2.errores.map((e) => e.texto).join("\n"));
});
