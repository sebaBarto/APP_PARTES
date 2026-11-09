const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const raiz = path.join(__dirname, "..");
const leer = (f) => fs.readFileSync(path.join(raiz, f), "utf8");

test("sintaxis de los JS principales", () => {
  const archivos = ["app.js", "sw.js", "sims-utils.js", "stock-utils.js", "tablero-stock.js", "middleware.js", ...fs.readdirSync(path.join(raiz, "api")).filter((f) => f.endsWith(".js")).map((f) => "api/" + f)];
  for (const f of archivos) {
    execFileSync(process.execPath, ["--check", path.join(raiz, f)], { stdio: "pipe" });
  }
});

test("sintaxis del script de admin.html", () => {
  const scripts = [...leer("admin.html").matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0);
  const mayor = scripts.sort((a, b) => b.length - a.length)[0];
  new Function(mayor); // lanza SyntaxError si está roto
});

test("versión de la app y caché del service worker definidos", () => {
  assert.match(leer("app.js"), /const APP_VERSION = "\d+\.\d+\.\d+";/);
  assert.match(leer("sw.js"), /const CACHE_NAME = "[\w.-]+";/);
});

test("sin librerías externas y vendor/ completo", () => {
  for (const f of ["index.html", "admin.html"]) {
    const externos = [...leer(f).matchAll(/<(?:script|link)[^>]+(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    if (f === "index.html") assert.deepStrictEqual(externos, [], `${f} tiene recursos externos`);
  }
  const sw = leer("sw.js");
  const lista = sw.match(/VENDOR_FILES\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(lista, "no se encontró VENDOR_FILES en sw.js");
  for (const m of lista[1].matchAll(/"([^"]+)"/g)) {
    const ruta = m[1].replace(/^\//, "");
    assert.ok(fs.existsSync(path.join(raiz, ruta)), `falta ${ruta}`);
  }
});

test("Ayudas: cada video (GIF) que nombran el panel y la APP existe y no pesa de más", () => {
  const fs = require("fs"), path = require("path"), raiz = path.join(__dirname, "..");
  const nombrados = new Set();
  for (const f of ["admin.html", "app.js", "tablero-stock.js"]) (fs.readFileSync(path.join(raiz, f), "utf8").match(/assets\/ayuda\/[\w-]+\.gif/g) || []).forEach((g) => nombrados.add(g));
  assert.ok(nombrados.size >= 30, `hay ${nombrados.size}`);
  for (const g of nombrados) {
    const p = path.join(raiz, g);
    assert.ok(fs.existsSync(p), "falta " + g);
    assert.ok(fs.statSync(p).size < 600 * 1024, g + " pesa demasiado");
  }
});
