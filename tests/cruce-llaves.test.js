// Cruce padrón ↔ estación (cruce-llaves.js): el caso de un edificio donde el
// Excel de la estación no trae N° de tag y los vecinos no saben su N° de usuario.
const test = require("node:test");
const assert = require("node:assert");
const C = require("../cruce-llaves");

const estacion = [
  { usuario: "001", nombre: "Desactivacion Apertura De Ascensor", obs: "Código de función (no es una persona)" },
  { usuario: "004", nombre: "Técnico Uno", telefono: "155550999", obs: "Empresa SAT" },
  { usuario: "030", nombre: "Full Service", telefono: "155550888", obs: "Limpieza" },
  { usuario: "037", nombre: "Inés Barreiro", telefono: "0349215550202", piso: "6", depto: "1" },
  { usuario: "049", nombre: "Ferraro Julieta", telefono: "155550101", piso: "1", depto: "1" },
  { usuario: "088", nombre: "Sol Ybarra", telefono: "0347115550303", piso: "8", depto: "3" },
  { usuario: "105", nombre: "Sol Ibarra", telefono: "0347115550303", piso: "8", depto: "3" },
  { usuario: "127", nombre: "Julieta Ferraro", telefono: "155550101", piso: "8", depto: "1" },
  { usuario: "128", nombre: "Hugo Alberto Ferraro", telefono: "155550101", piso: "1", depto: "1" },
  { usuario: "200", nombre: "Persona Desconocida", telefono: "155550404", piso: "3", depto: "3" },
  { usuario: "201", tag: "069:02561", nombre: "OTRO NOMBRE" },
];
const reg = (nombre, piso, unidad, telefono, llaves) => ({ nombre, piso, unidad, telefono, llaves });
const padron = [
  reg("Julieta Ferraro", "1", "1", "3415550101", [{ tipo: "tag", tag: "010:10001" }]),
  reg("Sol Ibarra", "8", "3", "3471550303", [{ tipo: "tag", tag: "010:10002" }]),
  reg("María Inés Barrero", "6", "1", "", [{ tipo: "tag", tag: "" }]),
  reg("Ana Pérez", "4", "B", "", [{ tipo: "tag", tag: "69:2561" }]),
  reg("Paula Quiroga", "4", "B", "3415550505", [{ tipo: "tag", tag: "010:10003" }]),
];
const disp = [];
padron.forEach((r) => r.llaves.forEach((l, i) => disp.push({ r, l, i, perdida: false })));
const { estacion: res, faltan } = C.cruzar(disp, estacion);
const de = (u) => res[estacion.findIndex((f) => f.usuario === u)];

test("encuentra por nombre aunque esté al revés y sin N° de usuario (Julieta Ferraro, 049)", () => {
  const r = de("049");
  assert.strictEqual(r.res, "encontrada");
  assert.strictEqual(r.por, "nombre");
  assert.strictEqual(r.d.r.nombre, "Julieta Ferraro");
  assert.match(r.nota, /Falta el N° de usuario en el padrón \(en la estación es 049\)/);
});

test("tolera tildes, «Ma.» y un error de tipeo por palabra", () => {
  assert.strictEqual(C.enComun("Ma. Inés Barreiro", "María Inés Barrero"), 3);
  assert.strictEqual(C.enComun("Sol Ybarra", "Sol Ibarra"), 2);
  assert.strictEqual(de("037").res, "encontrada");
});

test("un familiar con el mismo apellido, unidad y teléfono NO se confunde (Hugo Alberto Ferraro)", () => {
  assert.notStrictEqual(de("128").res, "encontrada");
  assert.strictEqual(de("128").res, "no_registrada");
});

test("más usuarios en la estación que llaves declaradas: «otra_llave», no se propone la baja", () => {
  assert.strictEqual(de("127").res, "otra_llave");
  assert.strictEqual(de("127").d.r.nombre, "Julieta Ferraro");
  const lola = ["088", "105"].map((u) => de(u).res).sort();
  assert.deepStrictEqual(lola, ["encontrada", "otra_llave"]);
});

test("SAT, funciones y proveedores no son vecinos", () => {
  ["001", "004", "030"].forEach((u) => assert.strictEqual(de(u).res, "no_vecino", u));
});

test("el N° de tag sigue mandando y lo que no está en la estación queda «falta»", () => {
  assert.strictEqual(de("201").res, "encontrada");
  assert.strictEqual(de("201").por, "tag");
  assert.strictEqual(de("200").res, "no_registrada");
  assert.deepStrictEqual(faltan.map((d) => d.r.nombre), ["Paula Quiroga"]);
});

test("persona registrada sin ninguna llave cargada: su llave de la estación no se propone para baja", () => {
  const sinLlave = { nombre: "Rosa Benítez", piso: "7", unidad: "1", llaves: [] };
  const r = C.cruzar([], [{ usuario: "035", nombre: "Rosa Benitez", piso: "7", depto: "1" }], [sinLlave]).estacion[0];
  assert.strictEqual(r.res, "otra_llave");
  assert.strictEqual(r.d.r, sinLlave);
});

// ---------- Placa Paradox (PDF «User Report» de BabyWare) — datos inventados ----------
// Textos sueltos como los devuelve pdf.js: desordenados dentro del renglón y entre renglones.
function itemsPlaca(usuarios) {
  const it = [{ str: "User Report", x: 18, y: 583, w: 86 }, { str: "Account: EDIFICIO PRUEBA", x: 662, y: 585, w: 110 }];
  let y = 560;
  usuarios.forEach(([num, etiqueta, card, sn, tipo]) => {
    it.push({ str: etiqueta, x: 74, y, w: 40 }, { str: `[${num}]`, x: 20, y, w: 31 });
    it.push({ str: "Remote SN", x: 152, y: y - 13, w: 51 }, { str: "Card #", x: 44, y: y - 13, w: 30 });
    it.push({ str: "Default Remote Profile", x: 230, y: y - 30, w: 103 }, { str: sn, x: 152, y: y - 30, w: 34 }, { str: card, x: 44, y: y - 30, w: 48 });
    it.push({ str: "User Type", x: 44, y: y - 43, w: 40 }, { str: tipo, x: 44, y: y - 69, w: 40 });
    y -= 120;
  });
  return [it];
}
const PLACA = [
  [1001, "SAT", "000:00000", "000000", "FullMaster"],
  [1010, "Lopez N.", "003:20001", "000000", "Regular"],
  [1011, "User 011", "003:20002", "000000", "Regular"],
  [1012, "Quiroga A.", "000:00000", "000000", "Regular"],
  [1013, "Ramos T.", "000:00000", "045123", "Regular"],
  [1050, "Vidal P.", "016:00099", "000000", "Regular"],
];

test("placa: arma los renglones del PDF y lee usuario, etiqueta, tarjeta y control", () => {
  const texto = C.lineasPdf(itemsPlaca(PLACA));
  assert.match(texto.split("\n")[1], /^\[1001\]\s+SAT$/);
  const p = C.leerPlacaParadox(texto);
  assert.strictEqual(p.cuenta, "EDIFICIO PRUEBA");
  assert.deepStrictEqual(p.usuarios.map((u) => [u.usuario, u.etiqueta, u.generica, u.tag, u.control, u.tipo]), [
    ["001", "SAT", false, "", "", "FullMaster"],
    ["010", "Lopez N.", false, "003:20001", "", "Regular"],
    ["011", "User 011", true, "003:20002", "", "Regular"],
    ["012", "Quiroga A.", false, "", "", "Regular"],
    ["013", "Ramos T.", false, "", "045123", "Regular"],
    ["050", "Vidal P.", false, "016:00099", "", "Regular"],
  ]);
  assert.strictEqual(C.leerPlacaParadox("Un PDF cualquiera\n[1] hola"), null);
});

test("placa: se une con la estación por N° de usuario y marca lo que está de un solo lado", () => {
  const p = C.leerPlacaParadox(C.lineasPdf(itemsPlaca(PLACA)));
  const est = [
    { usuario: "10", nombre: "Nadia Lopes", piso: "2", depto: "A" },
    { usuario: "011", nombre: "Bruno Castro" },
    { usuario: "050", tag: "016:00098", nombre: "Pablo Vidal" },
    { usuario: "077", nombre: "Marta Suarez" },
  ];
  const c = C.combinarPlaca(est, p);
  const por = (u) => c.find((f) => C.claveUsuario(f.usuario) === u);
  assert.strictEqual(por("10").tag, "003:20001", "la fila de la estación toma la tarjeta de la placa");
  assert.strictEqual(por("10").fuente, "ambas");
  assert.strictEqual(C.avisoPlaca(por("10")), "", "Lopes ≈ Lopez: no avisa");
  assert.strictEqual(por("11").placa_nombre, "", "etiqueta genérica de fábrica");
  assert.match(C.avisoPlaca(por("50")), /N° de llave distinto: estación 016:00098, placa 016:00099/);
  assert.strictEqual(por("50").tag, "016:00098", "el N° de la estación no se pisa");
  assert.strictEqual(por("77").fuente, "estacion");
  assert.match(C.avisoPlaca(por("77")), /no en la placa/);
  // De la placa entran solo los que tienen tarjeta o control: no SAT (001) ni el 012.
  assert.ok(!por("1") && !por("12"));
  assert.strictEqual(por("13").fuente, "placa");
  assert.strictEqual(por("13").tipo, "control");
  assert.match(C.avisoPlaca(por("13")), /no está en la estación/);
  // Apellido distinto de verdad
  assert.match(C.avisoPlaca({ fuente: "ambas", nombre: "Agustina Herrera", placa_nombre: "Ponce M.", placa_tag: "001:00001", tag: "001:00001" }), /En la placa figura «Ponce M\.»/);
  // Palabras pegadas y errores de tipeo no avisan
  assert.strictEqual(C.avisoPlaca({ fuente: "ambas", nombre: "Carla Benedetti", placa_nombre: "BenedetiC", placa_tag: "001:00001", tag: "001:00001" }), "");
  // Sin placa: vuelve a las filas de la estación tal cual
  assert.deepStrictEqual(C.combinarPlaca(c.filter((f) => f.fuente !== "placa"), null).map((f) => f.fuente), [undefined, undefined, undefined, undefined]);
});
