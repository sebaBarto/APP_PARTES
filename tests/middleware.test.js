// Middleware de pedido.sat365.com.ar: qué páginas públicas se pueden abrir y cuáles van al formulario.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const correr = async (url, host = "pedido.sat365.com.ar") => {
  const { default: mw } = await import(path.join(__dirname, "..", "middleware.js"));
  const r = mw({ url, headers: { get: (k) => (k === "host" ? host : null) } });
  return r ? { status: r.status, destino: r.headers.get("location") } : null;
};

test("middleware: las páginas públicas se abren y /robo lleva a la denuncia de llave robada", async () => {
  for (const p of ["/registro-llaves.html?e=x", "/robo-llave.html?e=x&k=y", "/consorcio.html", "/solicitar-servicio.html", "/api/datos?publico=robo_llave", "/icons/logo.png"]) {
    assert.strictEqual(await correr("https://pedido.sat365.com.ar" + p), null, p + " tiene que pasar sin tocarla");
  }
  const robo = await correr("https://pedido.sat365.com.ar/robo");
  assert.strictEqual(robo.status, 302);
  assert.strictEqual(robo.destino, "https://pedido.sat365.com.ar/robo-llave.html");
  assert.strictEqual((await correr("https://pedido.sat365.com.ar/robo?e=muelle11-k7p3")).destino, "https://pedido.sat365.com.ar/robo-llave.html?e=muelle11-k7p3");
  // Lo demás (la app de técnicos, el panel) va al formulario de pedir servicio.
  assert.match((await correr("https://pedido.sat365.com.ar/admin.html")).destino, /solicitar-servicio\.html$/);
  assert.match((await correr("https://pedido.sat365.com.ar/")).destino, /solicitar-servicio\.html$/);
  // En otros dominios no hace nada.
  assert.strictEqual(await correr("https://app.sat365.com.ar/admin.html", "app.sat365.com.ar"), null);
});
