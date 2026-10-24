const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const raiz = path.join(__dirname, "..");
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

let server, base, browser;

test.before(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const f = path.join(raiz, p);
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  base = "http://localhost:" + server.address().port;
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
test.after(async () => { await browser?.close(); server?.close(); });

async function nuevaPagina() {
  // serviceWorkers bloqueados: si no, el SW saltea los mocks de la API
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const erroresPagina = [];
  const posts = [];
  page.on("pageerror", (e) => erroresPagina.push(e.message));
  await page.route("**/api/**", (route) => {
    const req = route.request();
    if (req.url().includes("errores_app") && req.method() === "POST") posts.push(JSON.parse(req.postData() || "{}"));
    route.fulfill({ status: 200, contentType: "application/json", body: req.url().includes("tecnicos") ? "[]" : "{}" });
  });
  return { ctx, page, erroresPagina, posts };
}

test("la app abre sin errores de JavaScript", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.goto(base + "/");
  await page.waitForTimeout(800);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("el tema elegido se guarda y se aplica al reabrir", async () => {
  const { ctx, page } = await nuevaPagina();
  await page.goto(base + "/");
  await page.evaluate(() => localStorage.setItem("ajustes_app", JSON.stringify({ tema: "day", tamano: "grande" })));
  await page.reload();
  await page.waitForTimeout(500);
  assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), "day");
  await ctx.close();
});

test("un error de JavaScript se reporta a errores_app y respeta el tope", async () => {
  const { ctx, page, posts } = await nuevaPagina();
  await page.goto(base + "/");
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    for (let i = 0; i < 10; i++) setTimeout(() => { throw new Error("falla de prueba " + i); }, 0);
    setTimeout(() => { throw new Error("falla de prueba 0"); }, 5);
  });
  await page.waitForTimeout(800);
  assert.ok(posts.length >= 1, "no se reportó ningún error");
  assert.ok(posts.length <= 5, "se superó el tope por sesión: " + posts.length);
  assert.match(posts[0].mensaje, /falla de prueba/);
  assert.ok(posts[0].version);
  await ctx.close();
});

test("con un index.html viejo (sin ajustesBtn) se recarga una sola vez, sin bucle", async () => {
  const { ctx, page } = await nuevaPagina();
  let pedidos = 0;
  await page.route("**/index.html", async (route) => {
    pedidos++;
    const resp = await route.fetch();
    const html = (await resp.text()).replace('id="ajustesBtn"', 'id="viejo"');
    route.fulfill({ response: resp, body: html });
  });
  await page.goto(base + "/index.html");
  await page.waitForTimeout(1500);
  assert.strictEqual(pedidos, 2, "debía pedir el HTML exactamente 2 veces, pidió " + pedidos);
  await ctx.close();
});

test("cada opción de Forma de pago se puede elegir con un toque", async () => {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(base + "/");
  await page.waitForTimeout(500);
  await page.evaluate(() => showScreen("form"));
  for (const valor of ["PAGADO", "TRANSFIERE", "PAGA CON ABONO", "DEBITO", "PAGA EN OF"]) {
    const chip = page.locator(`label.discount-chip:has(input[value="${valor}"])`);
    await chip.scrollIntoViewIfNeeded();
    const box = await chip.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(() => getFormaPago()), valor);
  }
  await ctx.close();
});

test("el estilo del inicio (Nuevo/Clásico) se elige en Ajustes y se recuerda", async () => {
  const { ctx, page } = await nuevaPagina();
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  const estilo = () => page.evaluate(() => document.documentElement.getAttribute("data-inicio"));
  assert.strictEqual(await estilo(), "clasico", "por defecto debe ser el clásico");
  await page.evaluate(() => { showScreen("ajustes"); renderAjustes(); });
  await page.evaluate(() => document.querySelector('#ajusteEstiloInicio [data-estilo="nuevo"]').click());
  assert.strictEqual(await estilo(), "nuevo");
  await page.reload();
  await page.waitForTimeout(400);
  assert.strictEqual(await estilo(), "nuevo");
  await ctx.close();
});

test("el skin nuevo se aplica también en los submenús, y el clásico no los toca", async () => {
  const { ctx, page } = await nuevaPagina();
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  // ancho del ícono de la primera tecla del submenú: 52px en clásico, 36px en nuevo
  const ancho = (pantalla, id) => page.evaluate(([n, sel]) => { showScreen(n); return getComputedStyle(document.querySelector(sel + " .panel-tile-icon-badge")).width; }, [pantalla, id]);
  assert.strictEqual(await ancho("dashboardsMenu", "#screen-dashboards-menu"), "52px");
  await page.evaluate(() => { localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo" })); });
  await page.reload();
  await page.waitForTimeout(400);
  assert.strictEqual(await ancho("dashboardsMenu", "#screen-dashboards-menu"), "36px");
  assert.strictEqual(await ancho("serviciosMenu", "#screen-servicios-menu .tile-cronograma"), "36px");
  await ctx.close();
});

test("Próximo service: muestra la próxima tarea pendiente del técnico, salteando lo viejo, lo resuelto y lo ajeno", async () => {
  const hoy = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const man = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.route("**/api/**", (r) => {
    const u = r.request().url();
    let body = "[]";
    if (u.includes("/api/cronograma")) body = JSON.stringify({ tecnicos: [], tareas: [
      { tecnico: "Marcos Manuel Pellegrini", fecha: iso(ayer), hora_inicio: "09:00", tarea: "Servicio: Viejo\nCalle 1  -  Rosario" },
      { tecnico: "Marcos Manuel Pellegrini", fecha: iso(hoy), hora_inicio: "09:00", tarea: "Servicio: Ferretería López\nSan Martín 1234  -  Rosario" },
      { tecnico: "Otro Técnico", fecha: iso(hoy), hora_inicio: "08:00", tarea: "Servicio: Ajeno\nX 1  -  Y" },
      { tecnico: "Marcos Manuel Pellegrini", fecha: iso(man), hora_inicio: "11:30", tarea: "Servicio: Panadería Sur\nMitre 55  -  Funes" },
    ] });
    else if (u.includes("/api/historial")) body = JSON.stringify([{ numero_servicio: "123" }]);
    else if (u.includes("/api/servicios")) body = JSON.stringify([
      { numero_servicio: "123", cliente: "Ferretería López", direccion: "San Martín 1234", localidad: "Rosario" },
      { numero_servicio: "456", cliente: "Panadería Sur", telefono: "341 555-1234", direccion: "Mitre 55", localidad: "Funes" },
    ]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  await page.evaluate(() => entrarComoTecnico("Marcos Pellegrini"));
  await page.waitForTimeout(1200);
  assert.strictEqual(await page.locator("#proximoServiceCliente").textContent(), "Panadería Sur");
  assert.match(await page.locator("#proximoServiceCuando").textContent(), /Mañana · 11:30/);
  assert.strictEqual(await page.locator("#proximoLlamarBtn").getAttribute("href"), "tel:3415551234");
  assert.match(await page.locator("#proximoCaminoBtn").getAttribute("href"), /^https:\/\/wa\.me\/549341555123/);
  assert.match(await page.locator("#proximoComoLlegarBtn").getAttribute("href"), /google\.com\/maps\/dir.*Mitre%2055/);
  // resumen del día: 1 servicio pendiente con parte hecho hoy no cuenta como pendiente (123 está resuelto)
  assert.match(await page.locator("#tileServiciosResumen").textContent(), /1 pendiente/);
  await ctx.close();
});

async function paginaConEstilo(estilo) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript((e) => localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: e })), estilo);
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(base + "/");
  await page.waitForTimeout(500);
  return { ctx, page };
}

test("Parte: con el skin nuevo hay 4 secciones y un aviso de qué falta; con el clásico no se ven", async () => {
  let { ctx, page } = await paginaConEstilo("nuevo");
  await page.evaluate(() => { showScreen("form"); });
  await page.waitForTimeout(300);
  assert.strictEqual(await page.locator("#screen-form .parte-seccion-titulo:visible").count(), 4);
  assert.match(await page.locator("#parteFaltantes").textContent(), /Falta completar: Cliente, Técnico, Fecha/);
  await page.fill("#f_cliente", "Panadería Sur");
  await page.waitForTimeout(900);
  assert.match(await page.locator("#parteFaltantes").textContent(), /Técnico, Fecha/);
  await ctx.close();
  ({ ctx, page } = await paginaConEstilo("clasico"));
  await page.evaluate(() => { showScreen("form"); });
  assert.strictEqual(await page.locator("#screen-form .parte-seccion-titulo:visible").count(), 0);
  assert.strictEqual(await page.locator("#parteFaltantes").isVisible(), false);
  await ctx.close();
});

test("Login: con el skin nuevo hay saludo y los campos tienen el mismo ancho; con el clásico no cambia", async () => {
  let { ctx, page } = await paginaConEstilo("nuevo");
  assert.strictEqual(await page.locator(".login-saludo").isVisible(), true);
  const anchos = await page.evaluate(() => [document.getElementById("loginTecnicoSelect").getBoundingClientRect().width, document.getElementById("loginPassword").getBoundingClientRect().width]);
  assert.ok(Math.abs(anchos[0] - anchos[1]) < 1, "select y contraseña deben medir lo mismo: " + anchos);
  await ctx.close();
  ({ ctx, page } = await paginaConEstilo("clasico"));
  assert.strictEqual(await page.locator(".login-saludo").isVisible(), false);
  await ctx.close();
});

test("Carga: el esqueleto aparece con 'Cargando...' solo en el skin nuevo y se va al terminar", async () => {
  let { ctx, page } = await paginaConEstilo("nuevo");
  await page.evaluate(() => { showScreen("vehiculos"); vehiculosListaStatus.textContent = "Cargando..."; });
  await page.waitForTimeout(150);
  assert.strictEqual(await page.locator("#screen-vehiculos .esqueleto-card:visible").count(), 3);
  await page.evaluate(() => { vehiculosListaStatus.textContent = ""; });
  await page.waitForTimeout(150);
  assert.strictEqual(await page.locator("#screen-vehiculos .esqueleto-card").count(), 0);
  await ctx.close();
  ({ ctx, page } = await paginaConEstilo("clasico"));
  await page.evaluate(() => { showScreen("vehiculos"); vehiculosListaStatus.textContent = "Cargando..."; });
  await page.waitForTimeout(150);
  assert.strictEqual(await page.locator("#screen-vehiculos .esqueleto-card").count(), 0);
  await ctx.close();
});
