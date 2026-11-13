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
