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
  const erroresPagina = [];
  page.on("pageerror", (e) => erroresPagina.push(e.message));
  await page.addInitScript((e) => localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: e })), estilo);
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(base + "/");
  await page.waitForTimeout(500);
  return { ctx, page, erroresPagina };
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

test("Parte: la tarea a realizar queda fija y 'Tarea realizada' arranca vacía, en los dos skins", async () => {
  for (const estilo of ["clasico", "nuevo"]) {
    const { ctx, page } = await paginaConEstilo(estilo);
    await page.evaluate(() => {
      seleccionarServicio({ numero_servicio: "123", cliente: "Panadería Sur", direccion: "Mitre 100", localidad: "Rosario", tarea: "Revisar sirena que no suena" });
      showScreen("form");
    });
    await page.waitForTimeout(300);
    assert.strictEqual(await page.locator("#tareaAsignadaTexto").isVisible(), true, estilo);
    assert.strictEqual((await page.locator("#tareaAsignadaTexto").textContent()).trim(), "Revisar sirena que no suena", estilo);
    assert.strictEqual(await page.inputValue("#f_tarea"), "", estilo);
    assert.strictEqual(await page.evaluate(() => getFormData().tarea), "Revisar sirena que no suena", estilo + ": sin escribir, se guarda la asignada");
    await page.fill("#f_tarea", "Cambié la sirena");
    assert.strictEqual(await page.evaluate(() => getFormData().tarea), "Cambié la sirena", estilo);
    await page.evaluate(() => resetForm());
    assert.strictEqual(await page.locator("#tareaAsignadaWrap").isVisible(), false, estilo + ": se oculta al limpiar");
    await ctx.close();
  }
});

const STOCK_PRUEBA = (() => {
  const hoy = new Date().toISOString().slice(0, 10);
  const m = [];
  for (let i = 0; i < 4; i++) m.push({ modelo: "Batería 12V 7Ah", tecnico: "Juan Pérez", fecha: hoy, parte_id: "p" + i, cantidad_instalada: 1, cantidad_retirada: 1 });
  for (let i = 0; i < 3; i++) m.push({ modelo: "Sirena exterior", tecnico: "Juan Pérez", fecha: hoy, parte_id: "q" + i, cantidad_instalada: 1, cantidad_retirada: 0 });
  for (let i = 0; i < 2; i++) m.push({ modelo: "Fuente 12V 2A", tecnico: "Otro Técnico", fecha: hoy, parte_id: "r" + i, cantidad_instalada: 1, cantidad_retirada: 0 });
  return m;
})();
const CATALOGO_PRUEBA = [{ categoria: "Baterías", modelos: ["Batería 12V 7Ah", "Batería 12V 4Ah"] }, { categoria: "Sirenas", modelos: ["Sirena interior", "Sirena exterior"] }];

test("Materiales: fichas 'Más usados', cantidad en la fila, buscador y 'Retiré lo mismo' (ambos skins)", async () => {
  for (const estilo of ["clasico", "nuevo"]) {
    const { ctx, page, erroresPagina } = await nuevaPagina();
    await page.route("**/api/**", (route) => {
      const u = route.request().url();
      const cuerpo = u.includes("tipo=stock") ? STOCK_PRUEBA : u.includes("coleccion=materiales") ? CATALOGO_PRUEBA : {};
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cuerpo) });
    });
    await page.goto(base + "/");
    await page.evaluate((e) => localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: e, avisoFelicitacion: false })), estilo);
    await page.reload();
    await page.waitForTimeout(500);
    await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; seleccionarServicio({ numero_servicio: "1", cliente: "X", direccion: "Y", tarea: "t" }); showScreen("form"); });
    await page.waitForTimeout(700);
    const fichas = await page.locator("#matRapidosUsados .mat-chip").allTextContents();
    assert.match(fichas[0], /Batería 12V 7Ah/, estilo);
    assert.match(fichas[1], /Sirena exterior/, estilo);
    assert.ok(fichas.some((t) => /Fuente 12V 2A/.test(t)), estilo + ": completa con lo del equipo");
    await page.click("#matRapidosUsados .mat-chip >> nth=0");
    await page.click("#matRapidosUsados .mat-chip >> nth=0");
    assert.deepStrictEqual(await page.evaluate(() => materialesAgregados.map((m) => [m.modelo, m.cantidad, m.manual])), [["Batería 12V 7Ah", 2, false]], estilo);
    await page.click("#materialesAgregadosList .mat-menos");
    await page.click("#materialesAgregadosList .mat-mas");
    await page.click("#materialesAgregadosList .mat-mas");
    assert.strictEqual(await page.evaluate(() => materialesAgregados[0].cantidad), 3, estilo + ": stepper de la fila");
    await page.fill("#matBuscarUsados", "sir ext");
    await page.click("#matResultadosUsados .mat-resultado >> nth=0");
    assert.strictEqual(await page.evaluate(() => materialesAgregados.length), 2, estilo + ": buscador agrega del catálogo");
    await page.fill("#matBuscarUsados", "cable utp");
    await page.click("#matResultadosUsados .mat-resultado-nuevo");
    assert.deepStrictEqual(await page.evaluate(() => { const u = materialesAgregados[2]; return [u.modelo, u.manual]; }), ["cable utp", true], estilo + ": material nuevo queda como manual");
    await page.click("#matRetCopiarBtn");
    assert.strictEqual(await page.evaluate(() => materialesRetiradosAgregados.length), 3, estilo + ": copia a retirados");
    assert.match(await page.evaluate(() => getMaterialesUtilizados()), /Batería 12V 7Ah x3, Sirena exterior x1, cable utp x1/, estilo);
    assert.deepStrictEqual(erroresPagina, [], estilo);
    await ctx.close();
  }
});

test("Admin: detecta materiales escritos a mano que se repiten y los agrega al catálogo", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(500);
  const sug = await page.evaluate(({ stock, cat }) => {
    const s = stock.concat([1, 2, 3].map((i) => ({ modelo: "  cable   UTP cat6 ", tecnico: "Ana", fecha: "2026-10-01", parte_id: "u" + i })), [1, 2].map((i) => ({ modelo: "Tornillo", tecnico: "Ana", fecha: "2026-10-01", parte_id: "t" + i })));
    return agruparMaterialesManuales(s, cat).map((g) => [g.nombre.trim(), g.partes]);
  }, { stock: STOCK_PRUEBA, cat: CATALOGO_PRUEBA });
  assert.deepStrictEqual(sug, [["cable   UTP cat6", 3]], "solo lo que no está en el catálogo y se repite 3+ veces");
  await page.evaluate((cat) => {
    document.getElementById("mainCard").classList.remove("hidden");
    document.getElementById("panelMateriales").classList.remove("hidden");
    cat.forEach((c) => renderFilaCategoria(c.categoria, c.modelos));
    renderFilaCategoria("Cables", ["Cable coaxil"]);
    renderSugeridosMateriales([{ clave: "cable utp cat6", nombre: "Cable UTP cat6", partes: 3, tecnicos: ["Ana"], ultima: "2026-10-01" }]);
  }, CATALOGO_PRUEBA);
  assert.strictEqual(await page.locator("#materialesSugeridosCard").isVisible(), true);
  assert.strictEqual(await page.inputValue("#materialesSugeridosLista .sug-categoria"), "Cables", "sugiere la categoría por parecido de nombre");
  await page.click("#materialesSugeridosLista .sug-agregar");
  const modelos = await page.evaluate(() => Array.from(document.querySelectorAll(".categoria-fila")).map((f) => f.querySelector(".categoria-modelos").value));
  assert.ok(modelos.some((v) => v.includes("Cable coaxil") && v.includes("Cable UTP cat6")));
  assert.strictEqual(await page.locator("#materialesSugeridosCard").isVisible(), false);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Cobro: el botón elegido (descuento y forma de pago) se ve marcado en los dos skins y temas", async () => {
  for (const estilo of ["clasico", "nuevo"]) {
    for (const tema of ["night", "day"]) {
      const { ctx, page } = await paginaConEstilo(estilo);
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; showScreen("form"); }, tema);
      await page.waitForTimeout(200);
      const fondo = (sel) => page.locator(sel).evaluate((el) => getComputedStyle(el).backgroundColor);
      const amarillo = estilo === "nuevo" ? "rgb(255, 192, 51)" : "rgb(245, 166, 35)"; // amarillo SAT del logo en el skin nuevo
      const chip = (nombre, valor) => page.locator(`label.discount-chip:has(input[name='${nombre}'][value='${valor}'])`);
      await chip("f_descuento_tipo", "50").scrollIntoViewIfNeeded();
      await chip("f_descuento_tipo", "50").click();
      await page.waitForTimeout(350); // la transición de color dura 0.15 s
      assert.strictEqual(await fondo("label.discount-chip:has(input[value='50'])"), amarillo, `${estilo}/${tema}: 50%`);
      assert.notStrictEqual(await fondo("label.discount-chip:has(input[value='0'])"), amarillo, `${estilo}/${tema}: sin descuento se desmarca`);
      const primeraForma = page.locator("label.discount-chip:has(input[name='f_forma_pago'])").first();
      await primeraForma.scrollIntoViewIfNeeded();
      await primeraForma.click();
      await page.waitForTimeout(350);
      assert.strictEqual(await primeraForma.evaluate((el) => getComputedStyle(el).backgroundColor), amarillo, `${estilo}/${tema}: forma de pago`);
      await ctx.close();
    }
  }
});

function diaISO(n) { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; }
const DIAS_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
function etiquetaDia(n) { const f = diaISO(n); return `${DIAS_ES[new Date(f + "T12:00:00").getDay()]} ${f.slice(8, 10)}/${f.slice(5, 7)}`; }

async function paginaCronograma(estilo, { tareas, servicios, historial }) {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route("**/api/**", (route) => {
    const u = route.request().url();
    let cuerpo = {};
    if (u.includes("/api/cronograma")) cuerpo = { tareas, tecnicos: ["Juan Pérez", "Luis Gómez"] };
    else if (u.includes("/api/servicios")) cuerpo = servicios;
    else if (u.includes("/api/historial")) cuerpo = historial;
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cuerpo) });
  });
  await page.goto(base + "/");
  await page.evaluate((e) => localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: e, avisoFelicitacion: false })), estilo);
  await page.reload();
  await page.waitForTimeout(500);
  await page.evaluate(([s, h]) => { serviciosCache = s; historialCache = h; tecnicoLogueado = "Juan Pérez"; showScreen("cronograma"); cronoDiaActivo = ""; fetchCronograma(); }, [servicios, historial]);
  await page.waitForTimeout(700);
  return { ctx, page, erroresPagina };
}

test("Cronograma: una tarea ya hecha sigue 'Resuelta' aunque el servicio haya salido de la lista de pendientes", async () => {
  const tareas = [
    { tecnico: "Juan Pérez", fecha: diaISO(0), dia_label: etiquetaDia(0), hora_inicio: "09:00", hora_fin: "10:00", tarea: "Servicio: Panadería Sur\nMitre 100  -  Rosario\nSirena" },
    { tecnico: "Juan Pérez", fecha: diaISO(0), dia_label: etiquetaDia(0), hora_inicio: "11:00", hora_fin: "12:00", tarea: "Servicio: Kiosco Norte\nBelgrano 55  -  Rosario\nSensor" },
    { tecnico: "Juan Pérez", fecha: diaISO(0), dia_label: etiquetaDia(0), hora_inicio: "13:00", hora_fin: "14:00", tarea: "Servicio: Farmacia Central\nCórdoba 1  -  Rosario\nPanel" },
  ];
  // Panadería Sur ya NO está en la lista de pendientes (se retiró al hacerse), pero tiene su parte hoy.
  // Kiosco Norte sigue pendiente. Farmacia Central tiene un parte VIEJO (otro servicio) que no debe contar.
  const servicios = [{ numero_servicio: "901", cliente: "Kiosco Norte", direccion: "Belgrano 55", localidad: "Rosario", tarea: "Sensor" }];
  const historial = [
    { numero_servicio: "900", cliente: "Panadería Sur", fecha: diaISO(0), tecnico: "Juan Pérez" },
    { numero_servicio: "700", cliente: "Farmacia Central", fecha: diaISO(-40), tecnico: "Luis Gómez" },
  ];
  for (const estilo of ["clasico", "nuevo"]) {
    const { ctx, page, erroresPagina } = await paginaCronograma(estilo, { tareas, servicios, historial });
    const estados = await page.locator("#cronoTareasList .crono-tarea-card").evaluateAll((els) => els.map((e) => e.dataset.estado));
    assert.deepStrictEqual(estados, ["resuelto", "pendiente", "sin-vincular"], estilo);
    assert.strictEqual(await page.evaluate(() => infoTarea(cronogramaCache[0]).resuelto), true, estilo);
    assert.deepStrictEqual(erroresPagina, [], estilo);
    await ctx.close();
  }
});

test("Cronograma (skin nuevo): tarjetas con cliente destacado, días con cantidad y agenda propia primero; el clásico no cambia", async () => {
  const tareas = [
    { tecnico: "Juan Pérez", fecha: diaISO(0), dia_label: etiquetaDia(0), hora_inicio: "09:00", hora_fin: "10:00", tarea: "Servicio: Panadería Sur\nMitre 100  -  Rosario\nRevisar sirena" },
    { tecnico: "Luis Gómez", fecha: diaISO(0), dia_label: etiquetaDia(0), hora_inicio: "10:00", hora_fin: "11:00", tarea: "Servicio: Marta De Simone\nSan Martín 2450  -  Funes\nBatería" },
    { tecnico: "Luis Gómez", fecha: diaISO(1), dia_label: etiquetaDia(1), hora_inicio: "09:00", hora_fin: "10:00", tarea: "Servicio: Taller\nRuta 9  -  Roldán\nPanel" },
  ];
  let r = await paginaCronograma("nuevo", { tareas, servicios: [], historial: [] });
  assert.strictEqual(await r.page.inputValue("#cronoTecnicoFiltro"), "Juan Pérez", "arranca con la agenda del técnico logueado");
  assert.strictEqual(await r.page.locator("#cronoTareasList .crono-tarea-card").count(), 1);
  assert.strictEqual((await r.page.locator(".crono-n-cliente").first().textContent()).trim(), "Panadería Sur");
  assert.strictEqual(await r.page.locator(".crono-n:visible").count(), 1);
  assert.strictEqual(await r.page.locator(".crono-c:visible").count(), 0);
  assert.match(await r.page.locator(".crono-dia-chip.active .crono-dia-extra").textContent(), /Hoy · 1 tarea/);
  await r.page.selectOption("#cronoTecnicoFiltro", "");
  assert.match(await r.page.locator(".crono-dia-chip.active .crono-dia-extra").textContent(), /Hoy · 2 tareas/);
  await r.ctx.close();
  r = await paginaCronograma("clasico", { tareas, servicios: [], historial: [] });
  assert.strictEqual(await r.page.inputValue("#cronoTecnicoFiltro"), "", "el clásico sigue mostrando todos");
  assert.strictEqual(await r.page.locator(".crono-n:visible").count(), 0);
  assert.strictEqual(await r.page.locator(".crono-c:visible").count(), 2);
  await r.ctx.close();
});

test("Servicios pendientes: si un servicio ya hecho vuelve a aparecer en la lista, se avisa que ya tiene parte", async () => {
  const { ctx, page } = await paginaConEstilo("clasico");
  await page.evaluate((f) => {
    historialCache = [{ numero_servicio: "900", cliente: "Panadería Sur", fecha: f, tecnico: "Juan Pérez" }];
    showScreen("list");
    renderServiciosList([{ numero_servicio: "900", cliente: "Panadería Sur", direccion: "Mitre 100", tarea: "Sirena" }, { numero_servicio: "901", cliente: "Kiosco Norte", direccion: "Belgrano 55", tarea: "PIR" }]);
  }, diaISO(0));
  const badges = await page.locator("#serviciosList .servicio-card-parte-badge:visible").allTextContents();
  assert.strictEqual(badges.length, 1);
  assert.match(badges[0], /Ya tiene parte del/);
  await ctx.close();
});

test("Servicios pendientes (skin nuevo): semáforo de antigüedad con conteo y filtro; el clásico no cambia", async () => {
  const servicios = [
    { numero_servicio: "1", cliente: "Muy viejo", direccion: "A 1", tarea: "t", fecha_ingreso: diaISO(-12) },
    { numero_servicio: "2", cliente: "Viejo", direccion: "B 2", tarea: "t", fecha_ingreso: diaISO(-4) },
    { numero_servicio: "3", cliente: "Nuevo", direccion: "C 3", tarea: "t", fecha_ingreso: diaISO(0) },
    { numero_servicio: "4", cliente: "Sin fecha", direccion: "D 4", tarea: "t" },
  ];
  // La antigüedad es el tiempo dentro de la app (primera vez visto), NO fecha_ingreso:
  // acá "Nuevo" (ingresó hoy en el ERP) lleva 12 días en la lista, y "Muy viejo" recién entró.
  const vistos = { 1: { primera: new Date().toISOString() }, 2: { primera: diaISO(-4) + "T12:00:00" }, 3: { primera: diaISO(-12) + "T12:00:00" } };
  let { ctx, page, erroresPagina } = await paginaConEstilo("nuevo");
  await page.evaluate(([s, v]) => { serviciosVistos = v; serviciosCache = s; showScreen("list"); renderServiciosList(filtrarServicios()); }, [servicios, vistos]);
  assert.deepStrictEqual(await page.locator("#semaforoResumen b").allTextContents(), ["1", "1", "2"]);
  assert.deepStrictEqual(await page.locator("#serviciosList .servicio-card").evaluateAll((e) => e.map((x) => x.dataset.estado)), ["ok", "atencion", "urgente", "ok"]);
  assert.strictEqual(await page.locator("#serviciosList .sv-n:visible").count(), 4);
  assert.strictEqual(await page.locator("#serviciosList .sv-c:visible").count(), 0);
  assert.match(await page.locator("#serviciosList .sv-n-edad").first().textContent(), /Entró hoy/);
  assert.match(await page.locator("#serviciosList .sv-n-edad").nth(2).textContent(), /Hace 12 días en la lista/);
  await page.click('#semaforoResumen [data-f="urgente"]');
  assert.strictEqual(await page.locator("#serviciosList .servicio-card").count(), 1);
  assert.match(await page.locator("#serviciosList .sv-n-cliente").first().textContent(), /Nuevo/);
  await page.click('#semaforoResumen [data-f="urgente"]');
  assert.strictEqual(await page.locator("#serviciosList .servicio-card").count(), 4, "tocar de nuevo saca el filtro");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
  ({ ctx, page } = await paginaConEstilo("clasico"));
  await page.evaluate((s) => { serviciosCache = s; showScreen("list"); renderServiciosList(filtrarServicios()); }, servicios);
  assert.strictEqual(await page.locator("#semaforoResumen").isVisible(), false);
  assert.strictEqual(await page.locator("#serviciosList .sv-n:visible").count(), 0);
  assert.strictEqual(await page.locator("#serviciosList .sv-c:visible").count(), 4);
  await ctx.close();
});

test("Skin nuevo en historial, notas, stock, SIMs y dashboards: filtros en ámbar, tarjetas con franja y gráficos legibles; el clásico no cambia", async () => {
  const historial = [
    { id_parte: "p1", numero_servicio: "4000", cliente: "Panadería Sur", direccion: "Mitre 100", fecha: diaISO(0), hora_entrada: "09:00", hora_salida: "10:00", tecnico: "Juan Pérez", costo_final: "12000", forma_pago: "PAGADO", es_instalacion: true, pasado_sistema_offline: 0 },
    { id_parte: "p2", numero_servicio: "4001", cliente: "Kiosco Norte", direccion: "Belgrano 5", fecha: diaISO(-1), hora_entrada: "11:00", hora_salida: "12:00", tecnico: "Juan Pérez", costo_final: "0", es_instalacion: false, pasado_sistema_offline: 1 },
  ];
  const abrir = async (estilo, tema) => {
    const { ctx, page, erroresPagina } = await nuevaPagina();
    await page.route("**/api/**", (route) => {
      const u = route.request().url();
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(u.includes("tipo=stock") ? [] : u.includes("/api/historial") ? historial : []) });
    });
    await page.goto(base + "/");
    await page.evaluate(([e, t]) => localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: e, tema: t, avisoFelicitacion: false })), [estilo, tema]);
    await page.reload();
    await page.waitForTimeout(500);
    return { ctx, page, erroresPagina };
  };
  const css = (page, sel, prop) => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p], prop);

  let { ctx, page, erroresPagina } = await abrir("nuevo", "night");
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; showScreen("historial"); fetchHistorialReciente(); });
  await page.waitForTimeout(700);
  assert.strictEqual(await css(page, ".hist-periodo-chip.active", "backgroundColor"), "rgb(255, 192, 51)", "filtro activo en amarillo SAT");
  assert.strictEqual(await css(page, "#screen-historial .review-eyebrow", "fontSize"), "30px", "título grande");
  const franjas = await page.locator("#historialList .historial-card").evaluateAll((els) => els.map((e) => getComputedStyle(e).borderLeftWidth));
  assert.deepStrictEqual(franjas, ["5px", "5px"], "franja de estado en cada tarjeta");
  await page.evaluate(() => { showScreen("dashboard"); fetchDashboard(); });
  await page.waitForTimeout(900);
  // El skin nuevo reemplaza las tarjetas por cifra principal + mosaicos
  assert.strictEqual(await css(page, "#screen-dashboard .dash-cards-row", "display"), "none");
  assert.strictEqual(await css(page, "#dashTiles", "display"), "grid");
  const delMes = historial.filter((h) => h.fecha.slice(0, 7) === diaISO(0).slice(0, 7)).length;
  assert.strictEqual(await page.locator("#dashHero .dash-hero-num").textContent(), String(delMes), "cifra principal: resueltos del mes");
  assert.strictEqual(await page.evaluate(() => Chart.getChart("dashChartTecnico").options.indexAxis), "y", "técnicos en barras horizontales");
  assert.strictEqual(await page.evaluate(() => Chart.getChart("dashChartTecnico").data.datasets[0].maxBarThickness), 24, "barras finas");
  const colorTitulo = await page.evaluate(() => { const c = Chart.getChart("dashChartTecnico"); return c && c.options.plugins.title.color; });
  assert.strictEqual(colorTitulo, "#E8ECEF", "el título del gráfico se lee sobre fondo oscuro");
  assert.strictEqual(await page.locator("#screen-dashboard .dash-chart-wrap:not(.con-grafico)").first().isVisible().catch(() => false), false, "sin marco vacío cuando no hay gráfico");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();

  ({ ctx, page, erroresPagina } = await abrir("nuevo", "day"));
  await page.evaluate(() => { showScreen("dashboard"); fetchDashboard(); });
  await page.waitForTimeout(900);
  assert.strictEqual(await page.evaluate(() => Chart.getChart("dashChartTecnico").options.plugins.title.color), "#101820");
  await ctx.close();

  ({ ctx, page } = await abrir("clasico", "night"));
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; showScreen("historial"); fetchHistorialReciente(); });
  await page.waitForTimeout(500);
  assert.ok(!["26px", "30px"].includes(await css(page, "#screen-historial .review-eyebrow", "fontSize")));
  assert.strictEqual(await css(page, ".dash-cards-row", "display"), "flex", "el clásico mantiene sus tarjetas");
  await page.evaluate(() => { showScreen("dashboard"); fetchDashboard(); });
  await page.waitForTimeout(900);
  assert.strictEqual(await page.evaluate(() => Chart.getChart("dashChartTecnico").options.plugins.title.color), "#E8ECEF", "clásico de noche: títulos de gráficos legibles");
  await ctx.close();
});

test("Skin nuevo en guardias, rendición, presencia, credencial y comodatos: títulos grandes, estados con color y turno vigente; el clásico no cambia", async () => {
  const rends = [
    { tecnico: "Juan Pérez", categoria: "Combustible", monto: 100, fecha: diaISO(0), estado: "pagado", creado_en: new Date().toISOString() },
    { tecnico: "Juan Pérez", categoria: "Otros", monto: 50, fecha: diaISO(-1), estado: "rechazado", observaciones_admin: "Falta la foto del ticket", creado_en: new Date(Date.now() - 1000).toISOString() },
  ];
  const abrir = async (estilo) => {
    const { ctx, page, erroresPagina } = await nuevaPagina();
    await page.route("**/api/**", (route) => {
      const u = route.request().url();
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(u.includes("recurso=rendicion") ? rends : []) });
    });
    await page.goto(base + "/");
    await page.evaluate((e) => localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: e, tema: "night", avisoFelicitacion: false })), estilo);
    await page.reload();
    await page.waitForTimeout(400);
    return { ctx, page, erroresPagina };
  };
  const css = (page, sel, prop) => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p], prop);
  let { ctx, page, erroresPagina } = await abrir("nuevo");
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; showScreen("rendicion"); cargarMisRendiciones(); });
  await page.waitForTimeout(600);
  assert.strictEqual(await css(page, "#screen-rendicion .review-eyebrow", "fontSize"), "30px");
  const franjas = await page.locator("#rendMisLista .rend-card").evaluateAll((els) => els.map((e) => getComputedStyle(e).borderLeftColor));
  assert.notStrictEqual(franjas[0], franjas[1], "pagado y rechazado se distinguen por color");
  assert.match(await page.locator("#rendMisLista .rend-motivo").textContent(), /Falta la foto del ticket/, "el técnico ve por qué se rechazó");
  assert.strictEqual(await page.evaluate(() => fechaLocalISO(new Date(2026, 9, 24, 23, 30))), "2026-10-24", "de noche no salta al día siguiente");
  for (const pant of ["guardias", "consultas", "presencia", "credencial", "comodatoForm", "comodatoFirma", "ajustes", "planos", "emergencia", "instalacion", "claves", "vehiculoDetalle", "herramientaDetalle"]) {
    await page.evaluate((n) => showScreen(n), pant);
    const sel = { guardias: "guardias", consultas: "consultas", presencia: "presencia", credencial: "credencial", comodatoForm: "comodato-form", comodatoFirma: "comodato-firma", ajustes: "ajustes", planos: "planos", emergencia: "emergencia", instalacion: "instalacion", claves: "claves", vehiculoDetalle: "vehiculo-detalle", herramientaDetalle: "herramienta-detalle" }[pant];
    assert.strictEqual(await css(page, `#screen-${sel} .review-eyebrow`, "fontSize"), "30px", pant + ": título grande");
  }
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
  ({ ctx, page } = await abrir("clasico"));
  await page.evaluate(() => { showScreen("guardias"); });
  assert.ok(!["26px", "30px"].includes(await css(page, "#screen-guardias .review-eyebrow", "fontSize")), "el clásico conserva su título");
  await ctx.close();
});

test("Skin clásico en modo noche: los títulos y ejes de los gráficos se leen (claros); de día no cambian", async () => {
  const historial = [
    { id_parte: "p1", numero_servicio: "1", cliente: "A", fecha: diaISO(0), hora_entrada: "09:00", hora_salida: "10:00", tecnico: "Juan Pérez", costo_final: "0", es_instalacion: false },
  ];
  for (const [tema, esperado] of [["night", "#E8ECEF"], ["day", undefined]]) {
    const { ctx, page, erroresPagina } = await nuevaPagina();
    await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(route.request().url().includes("/api/historial") ? historial : []) }));
    await page.goto(base + "/");
    await page.evaluate((t) => localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "clasico", tema: t, avisoFelicitacion: false })), tema);
    await page.reload();
    await page.waitForTimeout(400);
    await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; showScreen("dashboard"); fetchDashboard(); });
    await page.waitForTimeout(900);
    const color = await page.evaluate(() => Chart.getChart("dashChartTecnico").config.options.plugins.title.color);
    if (esperado) assert.strictEqual(color, esperado, "título claro de noche");
    else assert.notStrictEqual(color, "#E8ECEF", "de día el clásico queda como estaba");
    assert.strictEqual(await page.locator("#screen-dashboard .dash-chart-wrap:not(.con-grafico)").evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== "none").length), 0, "sin recuadros vacíos en el clásico");
    assert.deepStrictEqual(erroresPagina, []);
    await ctx.close();
  }
});

test("Rendición: foto obligatoria (salvo estacionamiento o 'sin ticket'), monto argentino, aviso de repetida, cola sin señal y 'te deben'", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const enviados = [];
  let conSenal = true;
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const u = req.url();
    if (u.includes("recurso=rendicion") && req.method() === "POST") {
      if (!conSenal) return route.abort("internetdisconnected");
      enviados.push(JSON.parse(req.postData()));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id: "x" }) });
    }
    if (u.includes("recurso=rendicion")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ tecnico: "Juan Pérez", categoria: "Combustible", monto: 12000, fecha: "2026-10-20", estado: "pendiente" }, { tecnico: "Juan Pérez", categoria: "Otros", monto: 500, fecha: "2026-10-19", estado: "pendiente" }]) });
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; tileRendicionBtn.click(); });
  await page.waitForTimeout(500);
  assert.match(await page.locator("#rendResumen").textContent(), /Te deben \$12\.500 · 2 pendientes/);
  assert.strictEqual(await page.evaluate(() => parseMontoRendicion("18.500,50")), 18500.5);

  await page.fill("#rendDetalle", "Nafta");
  await page.fill("#rendMonto", "18.500");
  await page.locator("#rendMonto").blur();
  await page.click("#rendEnviarBtn");
  assert.strictEqual(enviados.length, 0, "sin foto no se manda");
  await page.check("#rendSinTicket");
  await page.fill("#rendFecha", "2026-10-20");
  await page.fill("#rendMonto", "12000");
  page.once("dialog", (d) => d.dismiss());
  await page.click("#rendEnviarBtn");
  await page.waitForTimeout(200);
  assert.strictEqual(enviados.length, 0, "repetida: si dice que no, no se manda");
  await page.fill("#rendMonto", "18.500");
  await page.click("#rendEnviarBtn");
  await page.waitForTimeout(300);
  assert.strictEqual(enviados.length, 1);
  assert.strictEqual(enviados[0].monto, "18500");
  assert.match(enviados[0].detalle, /sin ticket/);

  await page.selectOption("#rendCategoria", "Estacionamiento");
  assert.strictEqual(await page.locator("#rendSinTicketWrap").isVisible(), false, "estacionamiento no pide ticket");
  await page.fill("#rendDetalle", "Estacionamiento centro");
  await page.fill("#rendMonto", "1500");
  conSenal = false;
  await page.click("#rendEnviarBtn");
  await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => obtenerColaEnvios().filter((i) => i.tipo === "rendicion").length), 1, "sin señal queda en la cola");
  conSenal = true;
  await page.evaluate(() => procesarColaEnvios());
  await page.waitForTimeout(400);
  assert.strictEqual(enviados.length, 2, "al volver la señal se manda sola");
  assert.strictEqual(enviados[1].categoria, "Estacionamiento");
  assert.strictEqual(await page.evaluate(() => obtenerColaEnvios().length), 0);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Admin rendiciones: totales pendientes por técnico, pagar todo, miniaturas y filtro por mes", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const pagados = [];
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.route("**/api/recurso-uso**", (route) => {
    const req = route.request();
    if (req.method() === "POST") { pagados.push(JSON.parse(req.postData()).id); return route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); }
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { id: "a", tecnico: "Juan", categoria: "Combustible", monto: 1000, fecha: "2026-10-02", estado: "pendiente", foto_ref: JSON.stringify(["https://x/f1.jpg"]) },
      { id: "b", tecnico: "Juan", categoria: "Peaje", monto: 500, fecha: "2026-10-03", estado: "pendiente" },
      { id: "c", tecnico: "Luis", categoria: "Otro", monto: 300, fecha: "2026-09-10", estado: "pendiente" },
    ]) });
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("panelRendiciones").classList.remove("hidden"); return cargarRendicionesAdmin(); });
  await page.waitForTimeout(300);
  const filas = await page.locator("#rendicionesTotalesLista > div").allTextContents();
  assert.match(filas[0], /Juan[\s\S]*\$1\.500/);
  assert.match(filas[1], /Luis[\s\S]*\$300/);
  assert.strictEqual(await page.locator("#rendicionesAdminLista img").count(), 1, "miniatura de la foto");
  await page.fill("#rendicionesAdminMes", "2026-10");
  assert.strictEqual(await page.locator("#rendicionesTotalesLista > div").count(), 1, "el mes filtra");
  page.once("dialog", (d) => d.accept());
  await page.click("#rendicionesTotalesLista .rend-pagar-todo");
  await page.waitForTimeout(500);
  assert.deepStrictEqual(pagados.sort(), ["a", "b"]);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Identidad SAT (skin nuevo): amarillo del logo, Barlow, logo en la barra y botón principal hexagonal; el clásico conserva su letra", async () => {
  let { ctx, page, erroresPagina } = await paginaConEstilo("nuevo");
  await page.evaluate(() => showScreen("form"));
  const est = (sel, p) => page.locator(sel).first().evaluate((el, q) => getComputedStyle(el)[q], p);
  assert.match(await est("#screen-form .field-input", "fontFamily"), /Barlow/);
  assert.match(await est("#screen-form .review-eyebrow", "fontFamily"), /Barlow Semi Condensed/);
  assert.strictEqual(await est("#screen-form .review-eyebrow", "fontStyle"), "italic");
  assert.strictEqual(await est("#screen-form .field-label", "textTransform"), "none", "rótulos sin mayúsculas");
  assert.strictEqual(await est("#screen-form .btn-primary", "backgroundColor"), "rgb(255, 192, 51)");
  assert.match(await est("#screen-form .btn-primary", "clipPath"), /polygon/);
  assert.strictEqual(await page.locator(".topbar-logo").isVisible(), true);
  for (const tema of ["night", "day", "contraste"]) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; showScreen("serviciosMenu"); }, tema);
    const tecla = page.locator("#tileServiciosPendientesBtn");
    assert.strictEqual(await tecla.evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(255, 192, 51)", tema + ": Servicios pendientes en amarillo");
    assert.strictEqual(await tecla.locator(".panel-tile-label").evaluate((el) => getComputedStyle(el).color), "rgb(13, 12, 13)", tema + ": letra negra legible");
  }
  assert.ok(await page.evaluate(() => document.fonts.check("700 italic 20px 'Barlow Semi Condensed'")), "la fuente está disponible");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
  ({ ctx, page } = await paginaConEstilo("clasico"));
  await page.evaluate(() => showScreen("form"));
  assert.doesNotMatch(await page.locator("#screen-form .field-input").first().evaluate((el) => getComputedStyle(el).fontFamily), /Barlow/);
  assert.strictEqual(await page.locator(".topbar-logo").isVisible(), false);
  await ctx.close();
});

test("Skin nuevo: inicio con 'Tu próximo servicio' (pasa al siguiente al terminar), barra de pasos del parte, volver arriba y contraste de día", async () => {
  let { ctx, page, erroresPagina } = await paginaConEstilo("nuevo");
  // Próximo servicio: el primero ya tiene parte -> muestra el segundo, con la tarea y cuántos quedan
  await page.evaluate((hoy) => {
    tecnicoLogueado = "Juan Pérez"; cronogramaCargadoOk = true;
    cronogramaCache = [
      { fecha: hoy, hora_inicio: "09:00", tecnico: "Juan Pérez", tarea: "Servicio: Kiosco Norte\nBelgrano 5 - Rosario" },
      { fecha: hoy, hora_inicio: "11:30", tecnico: "Juan Pérez", tarea: "Servicio: Panadería Sur\nMitre 100 - Funes\nRevisar sirena" },
      { fecha: hoy, hora_inicio: "15:00", tecnico: "Juan Pérez", tarea: "Servicio: Farmacia Central\nSan Martín 900 - Rosario" },
    ];
    historialCache = [{ cliente: "Kiosco Norte", fecha: hoy }];
    showScreen("home");
  }, diaISO(0));
  assert.strictEqual(await page.locator("#proximoServiceCliente").textContent(), "Panadería Sur");
  assert.match(await page.locator("#proximoServiceTarea").textContent(), /Revisar sirena/);
  assert.match(await page.locator("#proximoServiceCard .proximo-service-titulo").textContent(), /quedan 2 hoy/);
  assert.strictEqual(await page.locator("#proximoEmpezarBtn").isVisible(), true);
  await page.evaluate((hoy) => { historialCache.unshift({ cliente: "Panadería Sur", fecha: hoy }); showScreen("home"); }, diaISO(0));
  assert.strictEqual(await page.locator("#proximoServiceCliente").textContent(), "Farmacia Central", "al terminar uno pasa al que sigue");
  await page.evaluate(() => { cronogramaCache = []; showScreen("home"); });
  assert.strictEqual(await page.locator("#proximoVacio").isVisible(), true, "sin agenda lo dice y ofrece ver pendientes");

  // Volver arriba: aparece fuera del inicio, reemplaza al de abajo y vuelve atrás
  assert.strictEqual(await page.locator("#topbarVolverBtn").isVisible(), false, "en el inicio no hay volver");
  await page.evaluate(() => showScreen("serviciosMenu"));
  await page.evaluate(() => showScreen("list"));
  assert.strictEqual(await page.locator("#topbarVolverBtn").isVisible(), true);
  assert.strictEqual(await page.locator("#topbarSeccion").textContent(), "Servicios pendientes", "la barra dice dónde estás");
  assert.strictEqual(await page.locator("#volverDeServiciosBtn").isVisible(), false, "el Volver de abajo se oculta");
  await page.click("#topbarVolverBtn");
  assert.strictEqual(await page.evaluate(() => screens.serviciosMenu.dataset.active), "true");

  // Barra de pasos del parte
  await page.evaluate(() => showScreen("form"));
  assert.strictEqual(await page.locator("#partePasos button").count(), 4);
  assert.strictEqual(await page.locator("#partePasos button.hecho").count(), 0);
  await page.fill("#f_cliente", "Panadería Sur");
  await page.fill("#f_tarea", "Cambio de sirena");
  await page.evaluate(() => actualizarPasosParte());
  assert.deepStrictEqual(await page.locator("#partePasos button").evaluateAll((bs) => bs.map((b) => b.classList.contains("hecho"))), [true, true, false, false]);
  await page.click('#partePasos button[data-paso="2"]');
  await page.waitForTimeout(600);
  assert.strictEqual(await page.locator("#partePasos button.actual").getAttribute("data-paso"), "2", "lleva a Cobro");
  assert.strictEqual(await page.locator("#partePasos").evaluate((el) => getComputedStyle(el).position), "sticky");

  // Contraste de día
  await page.evaluate(() => { document.documentElement.dataset.theme = "day"; showScreen("historial"); });
  assert.strictEqual(await page.locator("#screen-historial .list-sync-label").evaluate((el) => getComputedStyle(el).color), "rgb(70, 67, 60)");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();

  // Clásico: nada de esto aparece y el Volver de abajo sigue
  ({ ctx, page } = await paginaConEstilo("clasico"));
  await page.evaluate(() => showScreen("list"));
  assert.strictEqual(await page.locator("#topbarVolverBtn").isVisible(), false);
  assert.strictEqual(await page.locator("#volverDeServiciosBtn").isVisible(), true);
  await page.evaluate(() => showScreen("form"));
  assert.strictEqual(await page.locator("#partePasos").isVisible(), false);
  await ctx.close();
});

test("Credencial (skin nuevo): vertical con estado de vigencia, reloj en vivo y pantalla completa sin girar; el clásico no cambia", async () => {
  const abrir = async (estilo, vigencia) => {
    const { ctx, page, erroresPagina } = await nuevaPagina();
    await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(route.request().url().includes("coleccion=credenciales") ? [{ nombre: "Juan Pérez", cargo: "Técnico", dni: "30123456", telefono_contacto: "341", vigencia }] : []) }));
    await page.goto(base + "/");
    await page.evaluate((e) => localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: e, avisoFelicitacion: false })), estilo);
    await page.reload();
    await page.waitForTimeout(300);
    await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; showScreen("credencial"); return fetchYRenderCredencial(); });
    return { ctx, page, erroresPagina };
  };
  let { ctx, page, erroresPagina } = await abrir("nuevo", "2099-12-31");
  assert.match(await page.locator("#credencialEstado").textContent(), /Vigente hasta 31\/12\/2099/);
  const r1 = await page.locator("#credencialReloj").textContent();
  await page.waitForTimeout(1100);
  assert.notStrictEqual(await page.locator("#credencialReloj").textContent(), r1, "el reloj corre");
  await page.click("#credencialCardWrap");
  assert.match(await page.locator("#credencialCardWrap").evaluate((el) => getComputedStyle(el).transform), /^matrix\(1, 0, 0, 1,/, "pantalla completa sin rotar");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
  ({ ctx, page } = await abrir("nuevo", "2020-01-01"));
  assert.match(await page.locator("#credencialEstado").textContent(), /Vencida el 01\/01\/2020/);
  await ctx.close();
  ({ ctx, page } = await abrir("clasico", "2099-12-31"));
  assert.strictEqual(await page.locator("#credencialEstado").isVisible(), false);
  assert.strictEqual(await page.locator("#credencialReloj").isVisible(), false);
  await ctx.close();
});

test("Instalación: retoma lo guardado, autoguarda zonas sin pisar, fotos achicadas, días agrupados con horas", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const posts = [];
  const hoy = diaISO(0);
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (req.method() === "POST" && u.includes("/api/historial")) { posts.push(JSON.parse(req.postData())); return json({ ok: true }); }
    if (u.includes("tipo=instalacion_abierta")) return json({ abierta: { id: 5, cliente: "Distribuidora Norte", direccion: "Ruta 9" } });
    if (u.includes("tipo=instalacion&id=5")) return json({ id: 5, cliente: "Distribuidora Norte", zonas: [{ numero: "1", descripcion: "PIR living" }], canales: [], fotos: ["a.jpg"] });
    if (u.includes("presencias_de_instalacion=5")) return json([
      { tecnico: "Juan Pérez", fecha_llegada: hoy, hora_llegada: "08:00", hora_salida: "12:30" },
      { tecnico: "Luis Gómez", fecha_llegada: hoy, hora_llegada: "09:00", hora_salida: "12:00" },
    ]);
    if (u.includes("recurso=presencia")) return json({ activa: null });
    if (u.includes("tipo=foto-instalacion")) return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("89504e470d0a1a0a", "hex") });
    return json([]);
  });
  await page.goto(base + "/");
  await page.waitForTimeout(300);
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; showScreen("instalacion"); return verificarInstalacionAbierta(); });
  await page.waitForTimeout(500);
  assert.strictEqual(await page.locator("#instalacionDetalleWrap").isVisible(), true, "se puede cargar durante la obra");
  assert.strictEqual(await page.locator("#instZonasList .material-agregado-item").count(), 1, "retoma la zona guardada");
  assert.strictEqual(await page.locator("#instFotosGrid .instalacion-foto-item").count(), 1, "muestra la foto guardada");
  assert.strictEqual(await page.locator("#instDiasList .historial-card").count(), 1, "dos técnicos el mismo día = un día");
  assert.match(await page.locator("#instDiasResumen").textContent(), /1 día de obra · 7 h 30 min/);

  assert.strictEqual(await page.inputValue("#instZonaNumeroInput"), "2", "el número siguiente ya viene puesto");
  await page.click('#instZonaAtajos button[data-txt="Magnético"]');
  assert.strictEqual(await page.inputValue("#instZonaDescripcionInput"), "Magnético ");
  await page.type("#instZonaDescripcionInput", "puerta");
  await page.press("#instZonaDescripcionInput", "Enter");
  assert.strictEqual(await page.inputValue("#instZonaNumeroInput"), "3", "y pasa al siguiente");
  await page.waitForTimeout(1000);
  const guardado = posts.find((p) => p.accion === "guardar_items_instalacion" && p.tipo === "zona");
  assert.ok(guardado, "se autoguarda");
  assert.deepStrictEqual(guardado.items.map((z) => z.numero), ["1", "2"], "manda la lista completa, sin perder la guardada");

  const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 3000; c.height = 2000; const x = c.getContext("2d"); for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${i},70%,50%)`; x.fillRect(Math.random() * 3000, Math.random() * 2000, 200, 200); } return c.toDataURL("image/png").split(",")[1]; });
  await page.setInputFiles("#instFotoInput", { name: "obra.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await page.waitForTimeout(1500);
  const foto = posts.find((p) => p.accion === "subir_foto_instalacion");
  assert.ok(foto && foto.base64.startsWith("data:image/jpeg"), "la foto se convierte a JPG achicado");
  assert.ok(foto.base64.length < 1500000, "pesa menos de ~1 MB");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Admin instalaciones: horas totales en la lista y por técnico en el detalle", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.route("**/api/historial**", (route) => {
    const u = route.request().url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("tipo=instalaciones")) return json([{ id: 7, cliente: "Distribuidora Norte", tecnico: "Juan", fecha: "2026-10-20", estado: "cerrada" }]);
    if (u.includes("tipo=instalacion&id=7")) return json({ id: 7, cliente: "Distribuidora Norte", tecnico: "Juan", estado: "cerrada", zonas: [], canales: [], fotos: [], dias: [
      { tecnico: "Juan", fecha_llegada: "2026-10-20", hora_llegada: "08:00", hora_salida: "17:00" },
      { tecnico: "Luis", fecha_llegada: "2026-10-20", hora_llegada: "09:00", hora_salida: "13:30" },
      { tecnico: "Juan", fecha_llegada: "2026-10-21", hora_llegada: "08:00", hora_salida: "12:00" },
    ] });
    json([]);
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("panelInstalaciones").classList.remove("hidden"); return cargarInstalacionesAdmin(); });
  await page.waitForTimeout(500);
  assert.match(await page.locator(".inst-horas-lista").textContent(), /17:30 h en 2 días/);
  await page.click(".fila-lista-clickeable");
  await page.waitForTimeout(300);
  const det = await page.locator("#instalacionesAdminDetalleContenido").textContent();
  assert.match(det, /17:30 h/);
  assert.match(det, /Juan\s*2\s*13:00/);
  assert.match(det, /Luis\s*1\s*4:30/);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Manuales: preguntar sobre un manual puntual, respuesta con formato, consultas recientes, filtro y guardado sin señal", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const preguntas = [];
  const manuales = ["DSC PC1616.pdf", "DSC PC1832.pdf", "Garnet A2K4.pdf", "Garnet A2K8.pdf", "Paradox SP4000.pdf", "Paradox SP6000.pdf"].map((n, i) => ({ id: "m" + i, nombre: n }));
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const u = req.url();
    const json = (o, st) => route.fulfill({ status: st || 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("coleccion=consultas-categorias")) return json([{ categoria: "Centrales de alarma", carpeta_drive_id: "x" }]);
    if (u.includes("/api/consultas") && req.method() === "POST") {
      preguntas.push(JSON.parse(req.postData()));
      return json({ respuesta: "Para resetear:\n1. Entrá a **programación** con *8*.\n2. Marcá `999`.\nFuente: Garnet A2K4, pág. 12", manuales_usados: ["Garnet A2K4.pdf"] });
    }
    if (u.includes("/api/consultas") && u.includes("archivo=")) return route.fulfill({ status: 200, contentType: "application/pdf", body: Buffer.from("%PDF-1.4\n%%EOF") });
    if (u.includes("/api/consultas")) return json(manuales);
    json([]);
  });
  await page.goto(base + "/");
  await page.evaluate(() => localStorage.removeItem("consultas_recientes"));
  await page.evaluate(() => verConsultasBtn.click());
  await page.waitForTimeout(400);
  await page.selectOption("#consultaCategoriaSelect", "Centrales de alarma");
  await page.waitForTimeout(400);
  assert.strictEqual(await page.locator("#consultaManualesFiltro").isVisible(), true, "con muchos manuales aparece el buscador");
  await page.fill("#consultaManualesFiltro", "garnet");
  await page.waitForTimeout(200);
  assert.strictEqual(await page.locator("#consultaManualesList .consulta-manual-item").count(), 2);
  await page.selectOption("#consultaManualSelect", "m2");
  await page.fill("#consultaPreguntaInput", "¿Cómo reseteo la central?");
  await page.click("#preguntarBtn");
  await page.waitForTimeout(400);
  assert.strictEqual(preguntas[0].archivo, "m2", "pregunta solo sobre el manual elegido");
  assert.strictEqual(await page.locator("#consultaRespuestaTexto ol li").count(), 2, "pasos como lista numerada");
  assert.strictEqual(await page.locator("#consultaRespuestaTexto b").textContent(), "programación");
  assert.strictEqual(await page.locator("#consultaRecientesList .consulta-reciente").count(), 1, "queda en consultas recientes");
  // abrir un manual lo guarda en el celular
  await page.locator("#consultaManualesList .consulta-manual-item").first().click();
  await page.waitForTimeout(600);
  assert.strictEqual(await page.evaluate(async () => (await (await caches.open("manuales-sat-v1")).keys()).length), 1);
  assert.strictEqual(await page.locator("#consultaManualesList .cm-guardado").count(), 1, "se marca como guardado en el celular");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Manuales: datos del equipo (crear con autor y fecha, editar queda registrado), repreguntar con historial y foto", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  let datos = [];
  const consultas = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("coleccion=datos_equipo") && req.method() === "POST") {
      const b = JSON.parse(req.postData());
      if (b.accion === "crear") datos.unshift({ id: "d1", titulo: b.titulo, contenido: b.contenido, categoria: b.categoria, origen: b.origen === "ia" ? "ia" : "tecnico", autor: b.autor, fecha: "2026-10-20T15:00:00Z", ediciones: [] });
      if (b.accion === "editar") { const d = datos.find((x) => x.id === b.id); Object.assign(d, { titulo: b.titulo, contenido: b.contenido }); d.ediciones.push({ autor: b.autor, fecha: "2026-10-22T15:00:00Z" }); }
      return json({ ok: true, lista: datos });
    }
    if (u.includes("coleccion=datos_equipo")) return json(datos);
    if (u.includes("coleccion=consultas-categorias")) return json([{ categoria: "Comunicadores", carpeta_drive_id: "x" }]);
    if (u.includes("/api/consultas") && req.method() === "POST") {
      const b = JSON.parse(req.postData());
      consultas.push(b);
      return json({ respuesta: b.historial ? "Usá el código maestro 1234." : "Entrá con el código instalador.", manuales_usados: ["Comunicador X.pdf"] });
    }
    if (u.includes("/api/consultas")) return json([{ id: "m1", nombre: "Comunicador X.pdf" }]);
    json([]);
  });
  await page.goto(base + "/");
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; localStorage.removeItem("datos_equipo_cache"); verConsultasBtn.click(); });
  await page.waitForTimeout(400);
  await page.selectOption("#consultaCategoriaSelect", "Comunicadores");
  await page.waitForTimeout(300);
  await page.fill("#consultaPreguntaInput", "¿Cómo programo el APN?");
  const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 800; c.height = 600; c.getContext("2d").fillRect(0, 0, 400, 300); return c.toDataURL("image/png").split(",")[1]; });
  await page.setInputFiles("#consultaFotoInput", { name: "display.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await page.waitForTimeout(300);
  await page.click("#preguntarBtn");
  await page.waitForTimeout(400);
  assert.ok(consultas[0].imagen && consultas[0].imagen.startsWith("data:image/jpeg"), "manda la foto achicada");
  assert.strictEqual(await page.locator("#consultaCamaraInput").getAttribute("capture"), "environment", "hay botón para sacar la foto con la cámara");
  assert.strictEqual(consultas[0].archivo, "m1", "con un solo manual ya viene elegido");
  await page.fill("#consultaRepreguntaInput", "¿Y si no tengo el código instalador?");
  await page.click("#repreguntarBtn");
  await page.waitForTimeout(400);
  assert.deepStrictEqual(consultas[1].historial.map((t) => t.pregunta), ["¿Cómo programo el APN?"], "la repregunta lleva lo anterior");
  assert.ok(!consultas[1].imagen, "la foto se manda una sola vez");
  assert.strictEqual(await page.locator("#consultaHiloList .hilo-turno").count(), 1);
  assert.match(await page.locator("#consultaRespuestaTexto").textContent(), /código maestro/);

  // Compartir con el equipo
  await page.click("#consultaCompartirBtn");
  assert.strictEqual(await page.locator("#manTabEquipo").isVisible(), true);
  assert.strictEqual(await page.inputValue("#equipoFormTituloInput"), "¿Cómo programo el APN?");
  await page.fill("#equipoFormTituloInput", "APN Claro para comunicadores");
  await page.click("#equipoGuardarBtn");
  await page.waitForTimeout(300);
  assert.match(await page.locator(".equipo-card .equipo-meta").textContent(), /Aportó Juan Pérez el 20\/10\/2026/);
  assert.strictEqual(await page.locator(".equipo-card .equipo-ia").count(), 1, "marca que vino de la IA");
  // Otro técnico edita
  await page.evaluate(() => { tecnicoLogueado = "Luis Gómez"; renderDatosEquipo(); });
  assert.strictEqual(await page.locator(".equipo-card .eq-borrar").count(), 0, "no puede borrar lo de otro");
  await page.click(".equipo-card .eq-editar");
  await page.fill("#equipoFormContenido", "APN: igprs.claro.com.ar");
  await page.click("#equipoGuardarBtn");
  await page.waitForTimeout(300);
  assert.match(await page.locator(".equipo-card .equipo-meta").textContent(), /Editado por Luis Gómez el 22\/10\/2026/);
  await page.fill("#equipoBuscar", "igprs");
  assert.strictEqual(await page.locator(".equipo-card").count(), 1);
  await page.fill("#equipoBuscar", "movistar");
  assert.strictEqual(await page.locator(".equipo-card").count(), 0);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Admin SIMs: guardar la tabla no pisa lo que cambió en la app ni re-manda las instaladas como stock", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const base = new Map([
      ["1", { numero: "1", empresa: "Claro", tipo: "Estándar", tecnico_actual: "Juan", estado: "stock", cliente: "", ubicacion_tipo: "tecnico" }],
      ["2", { numero: "2", empresa: "Movistar", tipo: "", tecnico_actual: "Oficina", estado: "stock", cliente: "", ubicacion_tipo: "oficina" }],
      ["3", { numero: "3", empresa: "Personal", tipo: "Estándar", tecnico_actual: "Luis", estado: "stock", cliente: "", ubicacion_tipo: "tecnico" }],
      ["9", { numero: "9", empresa: "Claro", tipo: "Estándar", tecnico_actual: "Juan", estado: "uso", cliente: "Kiosco", ubicacion_tipo: "cliente" }],
    ]);
    // Mientras la pestaña estaba abierta, en la app: la 1 se transfirió a Luis y se marcó defectuosa,
    // la 3 se instaló (ya no está en stock) y apareció la 5 nueva.
    const servidor = [
      { numero: "1", empresa: "Claro", tipo: "Estándar", tecnico_actual: "Luis", tecnico_anterior: "Juan", estado: "stock", estado_fisico: "Defectuosa", cliente: "", ubicacion_tipo: "tecnico" },
      { numero: "2", empresa: "Movistar", tipo: "", tecnico_actual: "Oficina", estado: "stock", cliente: "", ubicacion_tipo: "oficina" },
      { numero: "5", empresa: "Claro", tipo: "Estándar", tecnico_actual: "Oficina", estado: "stock", cliente: "", ubicacion_tipo: "oficina" },
      { numero: "9", empresa: "Claro", tipo: "Estándar", tecnico_actual: "Juan", estado: "uso", cliente: "Kiosco", ubicacion_tipo: "cliente" },
    ];
    // En el admin solo se cambió el tipo de la 2 y se agregó la 7.
    const tabla = [
      { numero: "1", empresa: "Claro", tipo: "Estándar", tecnico_actual: "Juan", estado: "stock", cliente: "" },
      { numero: "2", empresa: "Movistar", tipo: "Mini", tecnico_actual: "Oficina", estado: "stock", cliente: "" },
      { numero: "3", empresa: "Personal", tipo: "Estándar", tecnico_actual: "Luis", estado: "stock", cliente: "" },
      { numero: "9", empresa: "Claro", tipo: "Estándar", tecnico_actual: "Juan", estado: "stock", cliente: "Kiosco" },
      { numero: "7", empresa: "Movistar", tipo: "", tecnico_actual: "Oficina", estado: "stock", cliente: "" },
    ];
    return unirSimsConServidor(tabla, servidor, base);
  });
  const porNum = Object.fromEntries(r.lista.map((x) => [x.numero, x]));
  assert.strictEqual(porNum["1"].tecnico_actual, "Luis", "respeta la transferencia hecha en la app");
  assert.strictEqual(porNum["1"].estado_fisico, "Defectuosa", "no pierde el estado físico");
  assert.strictEqual(porNum["2"].tipo, "Mini", "aplica lo editado en el admin");
  assert.ok(!porNum["3"], "no revive la que se instaló");
  assert.ok(!porNum["9"], "no manda las instaladas como stock");
  assert.ok(porNum["5"], "conserva la que se agregó en la app");
  assert.ok(porNum["7"], "agrega la nueva del admin");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("SIMs: un parte que quedó en la cola sin señal registra igual la SIM instalada al enviarse; sin señal se puede elegir la SIM", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const accionesSim = [];
  let conSenal = true;
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const u = req.url();
    if (!conSenal) return route.abort("internetdisconnected");
    if (u.includes("/api/recurso-uso") && req.method() === "POST") { const b = JSON.parse(req.postData()); if (b.recurso === "sim") accionesSim.push(b); }
    if (u.includes("coleccion=sims")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { numero: "341-1", empresa: "Claro", tipo: "Estándar", tecnico_actual: "Juan Pérez", estado: "stock", ubicacion_tipo: "tecnico" },
      { numero: "341-2", empresa: "Claro", tipo: "Estándar", tecnico_actual: "Juan Pérez", estado: "stock", ubicacion_tipo: "tecnico", estado_fisico: "Defectuosa" },
    ]) });
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id: "x" }) });
  });
  await page.goto(base + "/");
  await page.waitForTimeout(300);
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; return cargarOpcionesSimInstalar(); });
  assert.strictEqual(await page.locator("#simInstalarSelect option[value]:not([value=''])").count(), 1, "la defectuosa no se ofrece para instalar");
  conSenal = false;
  await page.evaluate(() => cargarOpcionesSimInstalar());
  assert.strictEqual(await page.locator("#simInstalarSelect option[value='341-1']").count(), 1, "sin señal usa la lista guardada");
  conSenal = true;
  await page.evaluate(() => {
    localStorage.setItem("cola_envios_pendientes", JSON.stringify([{ tipo: "parte", idParte: "P1", data: { cliente: "Kiosco Norte", tecnico: "Juan Pérez", numero_cliente: "77", direccion: "Belgrano 5" }, signatureImgTag: "", signatureDataUrl: "", sim: { numero: "341-1", numeroSimARetirar: null } }]));
    return procesarColaEnvios();
  });
  await page.waitForTimeout(500);
  assert.strictEqual(accionesSim.length, 1, "se registra la SIM al salir el parte de la cola");
  assert.strictEqual(accionesSim[0].accion, "usar");
  assert.strictEqual(accionesSim[0].numero, "341-1");
  assert.strictEqual(accionesSim[0].cliente, "Kiosco Norte");
  assert.deepStrictEqual(erroresPagina.filter((e) => !/internetdisconnected|Failed to fetch/i.test(e)), []);
  await ctx.close();
});

test("Admin Control de SIMs: tablero con stock bajo, problemas, dormidas, historial de una línea y conciliación", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  const hoy = new Date();
  const hace = (d) => { const x = new Date(hoy); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };
  const stock = [
    { numero: "341 555-0001", empresa: "Claro", tecnico_actual: "Juan", ubicacion_tipo: "tecnico" },
    { numero: "341 555-0002", empresa: "Claro", tecnico_actual: "Juan", ubicacion_tipo: "tecnico", estado_fisico: "Defectuosa" },
    { numero: "341 555-0003", empresa: "Movistar", tecnico_actual: "Juan", ubicacion_tipo: "tecnico" },
    { numero: "341 555-0004", empresa: "Movistar", tecnico_actual: "Juan", ubicacion_tipo: "tecnico" },
    { numero: "341 555-0005", empresa: "Claro", tecnico_actual: "Oficina", ubicacion_tipo: "oficina" },
  ];
  const instaladas = [
    { numero: "3415550010", empresa: "Claro", cliente: "Kiosco Norte", estado_linea: "Activo" },
    { numero: "3415550011", empresa: "Claro", cliente: "Panadería Sur", estado_linea: "Activo" },
  ];
  const historial = [
    { fecha: hace(5), hora: "10:00", numero: "341 555-0001", accion: "transferir", tecnico: "Oficina", tecnico_nuevo: "Juan" },
    { fecha: hace(90), hora: "10:00", numero: "341 555-0003", accion: "transferir", tecnico: "Oficina", tecnico_nuevo: "Juan" },
    { fecha: hace(3), hora: "09:00", numero: "341 555-0002", accion: "marcar_estado_fisico", tecnico: "Juan" },
    { fecha: hace(40), hora: "11:00", numero: "3415550010", accion: "usar", tecnico: "Juan", cliente: "Kiosco Norte" },
  ];
  await page.route("**/api/**", (route) => {
    const u = route.request().url();
    const body = u.includes("coleccion=sims_instaladas") ? instaladas : u.includes("coleccion=sims") ? stock : u.includes("recurso=sim") ? historial : [];
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { localStorage.clear(); document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("panelSimsControl").classList.remove("hidden"); document.getElementById("simsControlMinimo").value = "2"; document.getElementById("simsControlDias").value = "60"; return cargarControlSims(); });
  const filaJuan = await page.locator("#simsControlTablero tbody tr", { hasText: "Juan" }).locator("td").allTextContents();
  assert.deepStrictEqual(filaJuan.map((t) => t.trim()), ["Juan", "1", "2", "0", "3", "1"], "Claro 1 (la defectuosa no cuenta), Movistar 2, Personal 0, 1 con problema");
  const rojos = await page.locator("#simsControlTablero tbody tr", { hasText: "Juan" }).locator("td[style*='B3261E']").count();
  assert.strictEqual(rojos, 2, "Claro y Personal por debajo del mínimo");
  assert.match(await page.locator("#simsControlProblemas").textContent(), /341 555-0002[\s\S]*Defectuosa/);
  const dormidas = await page.locator("#simsControlDormidas tbody tr").allTextContents();
  assert.ok(dormidas.some((t) => t.includes("0003")) && dormidas.some((t) => t.includes("0004")), "90 días y sin movimientos");
  assert.ok(!dormidas.some((t) => t.includes("0005")), "la reserva de Oficina no cuenta como dormida");
  assert.ok(!dormidas.some((t) => t.includes("0001")), "la que se movió hace 5 días no");
  await page.fill("#simsControlLineaInput", "0010");
  assert.match(await page.locator("#simsControlLineaResultado").textContent(), /Instalada en Kiosco Norte[\s\S]*Instalada en cliente/);
  const r = await page.evaluate(() => {
    const c = conciliarSims([{ "Nro Línea": "54 9 341 555-0010", Estado: "Activa" }, { "Nro Línea": "3415559999", Estado: "Activa" }, { "Nro Línea": "3415550001", Estado: "Activa" }, { "Nro Línea": "3415558888", Estado: "Baja" }], "Claro");
    return { sin: c.sinRegistrar, stock: c.enStock.map((x) => x.numero), no: c.noEnPlanilla.map((x) => x.numero), ok: c.coinciden.length, total: c.totalPlanilla };
  });
  assert.deepStrictEqual(r, { sin: ["3415559999"], stock: ["341 555-0001"], no: ["3415550011"], ok: 1, total: 3 });
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Mis SIMs (skin nuevo): resumen por empresa con stock bajo, buscador, historial de la SIM y transferencias mandadas; el clásico no cambia", async () => {
  const sims = [
    { numero: "341 555-0101", empresa: "Claro", tipo: "M2M", tecnico_actual: "Juan Pérez", estado: "stock", ubicacion_tipo: "tecnico" },
    { numero: "341 555-0202", empresa: "Movistar", tecnico_actual: "Juan Pérez", estado: "stock", ubicacion_tipo: "tecnico" },
    { numero: "341 555-0303", empresa: "Movistar", tecnico_actual: "Juan Pérez", estado: "stock", ubicacion_tipo: "tecnico" },
  ];
  const abrir = async (estilo) => {
    const { ctx, page, erroresPagina } = await nuevaPagina();
    await page.route("**/api/**", (route) => {
      const u = route.request().url();
      const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
      if (u.includes("coleccion=sims")) return json(sims);
      if (u.includes("pendientes=1") && u.includes("Luis")) return json([{ id: 4, numero: "341 555-0404", empresa: "Claro", tecnico_origen: "Juan Pérez", tecnico_destino: "Luis Gómez", fecha: "2026-10-20" }]);
      if (u.includes("pendientes=1")) return json([]);
      if (u.includes("recurso=sim")) return json([{ fecha: "2026-10-01", hora: "10:00", numero: "341 555-0101", accion: "transferir", tecnico: "Oficina", tecnico_nuevo: "Juan Pérez" }]);
      json([]);
    });
    await page.goto(base + "/");
    await page.evaluate((e) => localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: e, avisoFelicitacion: false })), estilo);
    await page.reload();
    await page.waitForTimeout(300);
    await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; tecnicosPasswords = { "Juan Pérez": "x", "Luis Gómez": "y" }; tileSimsBtn.click(); });
    await page.waitForTimeout(500);
    return { ctx, page, erroresPagina };
  };
  let { ctx, page, erroresPagina } = await abrir("nuevo");
  assert.deepStrictEqual((await page.locator("#simsResumenChips .sims-chip b").allTextContents()), ["1", "2", "0"]);
  assert.match(await page.locator("#simsStockBajo").textContent(), /Claro \(1\), Personal \(ninguna\)/);
  await page.fill("#simsBuscarInput", "0202");
  assert.strictEqual(await page.locator("#simsGrupos .sim-card").count(), 1);
  await page.fill("#simsBuscarInput", "");
  await page.click('#simsResumenChips .sims-chip[data-emp="Movistar"]');
  assert.strictEqual(await page.locator("#simsGrupos .sim-card").count(), 2, "tocar la empresa filtra");
  assert.strictEqual(await page.locator("#simsMandadasWrap").isVisible(), true);
  assert.match(await page.locator("#simsMandadasList").textContent(), /341 555-0404[\s\S]*Para Luis Gómez/);
  await page.evaluate(() => { simSeleccionada = "341 555-0101"; showScreen("simDetalle"); return renderSimDetalle(); });
  await page.waitForTimeout(400);
  assert.match(await page.locator("#simHistorialLista").textContent(), /Transferida[\s\S]*de Oficina a Juan Pérez/);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
  ({ ctx, page } = await abrir("clasico"));
  assert.strictEqual(await page.locator("#simsResumenWrap").isVisible(), false);
  assert.strictEqual(await page.locator("#simsMandadasWrap").isVisible(), false);
  await ctx.close();
});

test("Dashboard financiero (skin nuevo): cifra principal con variación, mosaicos y cobrado por forma de pago; el clásico no cambia", async () => {
  const hoy = diaISO(0);
  const historial = [
    { id_parte: "a", fecha: hoy, costo_final: "10000", forma_pago: "PAGADO", tecnico: "Juan" },
    { id_parte: "b", fecha: hoy, costo_final: "5000", forma_pago: "TRANSFIERE", tecnico: "Juan" },
    { id_parte: "c", fecha: hoy, costo_final: "0", tecnico: "Juan" },
  ];
  const abrir = async (estilo) => {
    const { ctx, page, erroresPagina } = await nuevaPagina();
    await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(route.request().url().includes("/api/historial") ? historial : []) }));
    await page.goto(base + "/");
    await page.evaluate((e) => localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: e, tema: "night", avisoFelicitacion: false })), estilo);
    await page.reload();
    await page.waitForTimeout(300);
    await page.evaluate(() => { tecnicoLogueado = "Seba Barto"; showScreen("dashboardFinanciero"); return fetchDashboardFinanciero(); });
    await page.waitForTimeout(600);
    return { ctx, page, erroresPagina };
  };
  let { ctx, page, erroresPagina } = await abrir("nuevo");
  assert.strictEqual(await page.locator("#dashFinHero .dash-hero-num").textContent(), "$15.000");
  assert.match(await page.locator("#dashFinTiles").textContent(), /2\s*Servicios cobrados[\s\S]*1\s*Sin cargo\s*33% del total[\s\S]*\$7\.500\s*Ticket promedio/);
  assert.deepStrictEqual(await page.evaluate(() => Chart.getChart("dashChartFinPago").data.labels), ["Pagado", "Transfiere"]);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
  ({ ctx, page } = await abrir("clasico"));
  assert.strictEqual(await page.locator("#dashFinHero").isVisible(), false);
  assert.strictEqual(await page.locator("#screen-dashboard-financiero .dash-cards-row").first().isVisible(), true);
  await ctx.close();
});

test("Dashboards de vehículos, herramientas y SIMs (skin nuevo): cifra principal y mosaicos", async () => {
  const hoy = diaISO(0);
  const { ctx, page, erroresPagina } = await paginaConEstilo("nuevo");
  await page.route("**/api/**", (route) => {
    const u = route.request().url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("coleccion=vehiculos")) return json([{ nombre: "Kangoo", km_actual: 1000 }, { nombre: "Moto", km_actual: 500 }]);
    if (u.includes("recurso=vehiculo")) return json([
      { vehiculo: "Kangoo", accion: "evento", tipo_evento: "Carga de combustible", monto: 30000, fecha: hoy },
      { vehiculo: "Moto", accion: "evento", tipo_evento: "Gomería", monto: 5000, fecha: hoy },
      { vehiculo: "Kangoo", tecnico: "Juan", fecha: hoy, hora_toma: "08:00" },
    ]);
    if (u.includes("coleccion=herramientas")) return json([{ nombre: "Escalera", estado: "libre" }, { nombre: "Taladro", estado: "uso", tecnico_actual: "Juan" }, { nombre: "Amoladora", estado: "cliente", cliente: "Kiosco" }]);
    if (u.includes("recurso=herramienta")) return json([{ herramienta: "Taladro", accion: "tomar", fecha: hoy }, { herramienta: "Taladro", accion: "devolver", fecha: hoy }, { herramienta: "Amoladora", accion: "dejar_en_cliente", fecha: hoy }]);
    if (u.includes("coleccion=sims")) return json([{ numero: "1", estado: "stock" }, { numero: "2", estado: "stock" }, { numero: "3", estado: "uso" }]);
    if (u.includes("recurso=sim")) return json([{ fecha: hoy, accion: "usar", numero: "9" }, { fecha: hoy, accion: "reemplazar", numero: "8" }, { fecha: hoy, accion: "transferir", numero: "7" }]);
    json([]);
  });
  await page.evaluate(() => { tecnicoLogueado = "Seba Barto"; showScreen("dashboardVehiculos"); return fetchDashVehiculos(); });
  await page.waitForTimeout(300);
  assert.strictEqual(await page.locator("#dashVehHero .dash-hero-num").textContent(), "$35.000");
  assert.match(await page.locator("#dashVehTiles").textContent(), /\$30\.000\s*Combustible[\s\S]*\$5\.000[\s\S]*1 de 2\s*En la calle ahora/);
  assert.deepStrictEqual(await page.evaluate(() => Chart.getChart("dashChartVehGasto").data.labels), ["Kangoo", "Moto"]);
  await page.evaluate(() => { showScreen("dashboardHerramientas"); return fetchDashHerramientas(); });
  await page.waitForTimeout(300);
  assert.match(await page.locator("#dashHerrHero .dash-hero-num").textContent(), /^2\s*de 3$/);
  assert.match(await page.locator("#dashHerrTiles").textContent(), /1\s*Libres[\s\S]*1\s*En uso[\s\S]*1\s*⚠ Dejadas en un cliente[\s\S]*2\s*Usos este mes/);
  await page.evaluate(() => { showScreen("dashboardSims"); return fetchDashSims(); });
  await page.waitForTimeout(300);
  assert.strictEqual(await page.locator("#dashSimsHero .dash-hero-num").textContent(), "2", "usar + reemplazar");
  assert.match(await page.locator("#dashSimsTiles").textContent(), /2\s*En stock ahora[\s\S]*1\s*En uso ahora[\s\S]*1\s*Transferencias/);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Skin nuevo: ficha del cliente desde el buscador del inicio, avisos en teclas, estado de conexión, firma con resumen y orden automático", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route("**/api/**", (route) => {
    const u = route.request().url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("pendientes=1")) return json([{ id: 1 }, { id: 2 }]);
    if (u.includes("recurso=rendicion")) return json([{ id: 5, tecnico: "Juan Pérez", estado: "rechazado" }, { id: 6, tecnico: "Juan Pérez", estado: "pendiente" }]);
    if (u.includes("instalacion_abierta")) return json({ abierta: { id: 9 } });
    if (u.includes("coleccion=sims_instaladas")) return json([{ numero: "341 555-0101", empresa: "Claro", cliente: "Panadería Sur", numero_cliente: "1203" }]);
    if (u.includes("/api/planos")) return json([{ nombre: "CLI_1203" }]);
    if (u.includes("coleccion=clientes")) return json([{ nombre: "Panadería Sur", direccion: "Mitre 100", numero_cliente: "1203", telefono: "341" }]);
    if (u.includes("/api/historial")) return json([{ cliente: "Panadería Sur", numero_cliente: "1203", fecha: "2026-10-10", tecnico: "Luis", tarea: "Cambio de batería", claves: [{ titulo: "Alarma", usuario: "inst", clave: "5555" }] }]);
    json([]);
  });
  await page.goto(base + "/");
  await page.evaluate(() => { localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo", avisoFelicitacion: false })); localStorage.removeItem("uso_mosaicos"); });
  await page.reload();
  await page.waitForTimeout(300);
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; serviciosCache = [{ numero_servicio: "4100", cliente: "Panadería Sur", numero_cliente: "1203", tarea: "Sirena" }]; document.getElementById("tileInstaladorBtn").classList.remove("hidden"); showScreen("home"); return actualizarAvisosInicio(true); });
  assert.strictEqual(await page.locator("#simsAvisoBadge").textContent(), "2", "SIMs por aceptar");
  assert.strictEqual(await page.locator("#rendicionAvisoBadge").textContent(), "1", "rendición rechazada sin ver");
  assert.strictEqual(await page.locator("#instalacionAvisoBadge").isVisible(), true);
  // Estado de conexión
  await page.evaluate(() => { localStorage.setItem("cola_envios_pendientes", JSON.stringify([{ tipo: "parte" }])); actualizarPillConexion(); });
  assert.strictEqual(await page.locator("#statusPill").textContent(), "1 por enviar");
  await page.evaluate(() => localStorage.removeItem("cola_envios_pendientes"));
  // Buscador y ficha
  await page.fill("#homeBuscarCliente", "panad");
  await page.waitForTimeout(300);
  await page.click(".home-buscar-item");
  await page.waitForTimeout(800);
  assert.strictEqual(await page.evaluate(() => screens.fichaCliente.dataset.active), "true");
  const ficha = await page.locator("#fichaSecciones").textContent();
  assert.match(ficha, /N° 4100[\s\S]*Cambio de batería[\s\S]*Mostrar 1 clave[\s\S]*341 555-0101[\s\S]*Ver plano/);
  assert.strictEqual(await page.locator("#fichaClaves").isVisible(), false, "las claves se muestran solo si se tocan");
  await page.click("#fichaVerClavesBtn");
  assert.match(await page.locator("#fichaClaves").textContent(), /5555/);
  await page.click("#fichaParteBtn");
  assert.strictEqual(await page.evaluate(() => screens.form.dataset.active), "true", "cargar parte abre el servicio pendiente");
  // Firma con resumen
  await page.evaluate(() => { document.getElementById("f_tarea").value = "Cambio de sirena"; showScreen("sign"); });
  assert.match(await page.locator("#signResumen").textContent(), /Panadería Sur[\s\S]*Cambio de sirena/);
  // Orden automático por uso
  await page.evaluate(() => { localStorage.setItem("uso_mosaicos", JSON.stringify({ tileSimsBtn: 9, tileNotasBtn: 3 })); aplicarMosaicos(); });
  const orden = await page.evaluate(() => ["tileServiciosBtn", "tileSimsBtn", "tileNotasBtn", "verConsultasBtn"].map((id) => Number(document.getElementById(id).style.order)));
  assert.ok(orden[0] < orden[1] && orden[1] < orden[2] && orden[2] < orden[3], "Servicios primero, después lo más usado");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Vehículos: control de km, toma sin devolver de ayer, tarjetas y combustible que se rinde solo", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const posts = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(); const u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (req.method() === "POST") { posts.push({ u, body: JSON.parse(req.postData() || "{}") }); return json({ ok: true, id: "x" }); }
    const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
    if (u.includes("coleccion=vehiculos")) return json([{ nombre: "Kangoo", km_actual: 1000, umbrales: [] }, { nombre: "Fiorino", km_actual: 5000, umbrales: [] }]);
    if (u.includes("recurso=vehiculo")) return json([
      { vehiculo: "Kangoo", tecnico: "Juan Pérez", fecha: d(2), hora_toma: "08:00", hora_devolucion: "17:00", km_devolucion: "84210" },
      { vehiculo: "Fiorino", tecnico: "Juan Pérez", fecha: d(1), hora_toma: "09:15" },
    ]);
    json([]);
  });
  await page.goto(base + "/");
  await page.evaluate(() => localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo", avisoFelicitacion: false })));
  await page.reload();
  await page.waitForTimeout(300);
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; showScreen("vehiculos"); return renderVehiculosPicker(); });
  const tarjetas = await page.locator(".veh-card").allTextContents();
  assert.match(tarjetas[0], /Fiorino[\s\S]*Lo tenés vos desde ayer a las 09:15[\s\S]*sin devolver/, "la que tiene el técnico va primero y marca que es de ayer");
  assert.match(tarjetas[1], /Kangoo[\s\S]*Libre[\s\S]*84\.210 km[\s\S]*Último uso: Juan Pérez/);
  // Ficha de un vehículo propio: tarjeta de estado y dos acciones
  await page.click(".veh-card.mio");
  await page.waitForTimeout(300);
  assert.match(await page.locator("#vehiculoEstadoCard").textContent(), /Sin devolver[\s\S]*Devolver[\s\S]*Cargar evento/);
  assert.strictEqual(await page.locator("#vehiculoKmDevolucion").isVisible(), false, "el formulario aparece al elegir la acción");
  await page.click("[data-ir-modo=mio-devolver]");
  await page.fill("#vehiculoKmDevolucion", "4900");
  assert.match(await page.locator("#vehiculoKmAyuda").textContent(), /menor que el último registrado \(5\.000 km\)/);
  page.once("dialog", (dlg) => dlg.dismiss());
  await page.click("#vehiculoDevolverBtn");
  assert.strictEqual(posts.length, 0, "un km menor sin confirmar no se manda");
  await page.fill("#vehiculoKmDevolucion", "5120");
  assert.match(await page.locator("#vehiculoKmAyuda").textContent(), /Recorriste 120 km/);
  // Cargar combustible: se registra el evento y se crea la rendición
  await page.click("[data-ir-modo=mio-evento]");
  assert.strictEqual(await page.locator("#vehiculoKmDevolucion").isVisible(), false);
  await page.selectOption("#vehiculoTipoEventoSelect", "Carga de combustible");
  await page.fill("#vehiculoEventoKm", "5080");
  await page.fill("#vehiculoEventoMonto", "45000");
  assert.strictEqual(await page.locator("#vehiculoRendirWrap").isVisible(), true);
  await page.click("#vehiculoRegistrarEventoBtn");
  assert.strictEqual(posts.length, 0, "sin foto del ticket no se manda");
  await page.check("#vehiculoSinTicket");
  await page.click("#vehiculoRegistrarEventoBtn");
  await page.waitForTimeout(500);
  const evento = posts.find((p) => p.body.accion === "evento");
  const rend = posts.find((p) => p.u.includes("recurso=rendicion"));
  assert.ok(evento && evento.body.km === "5080" && evento.body.monto === "45000" && /Rendido/.test(evento.body.detalle));
  assert.ok(rend && rend.body.categoria === "Combustible" && rend.body.monto === "45000" && /Fiorino \(5\.080 km\)/.test(rend.body.detalle) && /sin ticket/.test(rend.body.detalle));
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Vehículos sin señal: tomar con revisión queda en la cola, se ve en el inicio y se manda en orden al volver la señal", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const posts = [];
  let sinSenal = true;
  await page.route("**/api/**", (route) => {
    const req = route.request(); const u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (req.method() === "POST") {
      if (sinSenal) return route.abort("internetdisconnected");
      posts.push(JSON.parse(req.postData() || "{}"));
      return json({ ok: true, id: "f1" });
    }
    if (sinSenal && u.includes("vehiculo")) return route.abort("internetdisconnected");
    if (u.includes("coleccion=vehiculos")) return json([{ nombre: "Kangoo", km_actual: 1000, umbrales: [] }]);
    if (u.includes("recurso=vehiculo")) return json([]);
    json([]);
  });
  await page.goto(base + "/");
  await page.evaluate(() => {
    localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo", avisoFelicitacion: false }));
    localStorage.setItem("vehiculos_cache", JSON.stringify({ config: [{ nombre: "Kangoo", km_actual: 1000, umbrales: [] }], historial: [] }));
  });
  await page.reload();
  await page.waitForTimeout(300);
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; vehiculoSeleccionado = "Kangoo"; showScreen("vehiculoDetalle"); return renderVehiculoDetalle(); });
  assert.match(await page.locator("#vehiculoDetalleStatus").textContent(), /sin señal, datos guardados/);
  // Revisión: km + nafta + cubiertas con problema
  await page.fill("#vehiculoKmToma", "1010");
  await page.click('[data-rev=nafta] [data-v="½"]');
  await page.click("[data-rev=cubiertas] [data-v=Problema]");
  await page.click("#vehiculoTomarBtn");
  await page.waitForTimeout(400);
  const cola = await page.evaluate(() => obtenerColaEnvios().map((i) => i.tipo + ":" + i.cuerpo.accion + ":" + (i.cuerpo.tipo_evento || "")));
  assert.deepStrictEqual(cola, ["vehiculo:tomar:", "vehiculo:evento:Revisión al tomar"]);
  // Se ve como tomado aunque no salió todavía, y aparece en el inicio
  assert.match(await page.locator(".veh-card").first().textContent(), /Lo tenés vos/);
  await page.evaluate(() => showScreen("home"));
  await page.waitForTimeout(400);
  assert.strictEqual(await page.locator("#homeVehiculoChip").isVisible(), true);
  assert.match(await page.locator("#homeVehiculoChip").textContent(), /Tenés Kangoo[\s\S]*por enviar/);
  assert.strictEqual(await page.locator("#vehiculosAvisoBadge").textContent(), "En uso");
  // Tocar el aviso lleva directo a devolver
  await page.click("#homeVehiculoChip");
  await page.waitForTimeout(400);
  assert.strictEqual(await page.evaluate(() => screens.vehiculoDetalle.dataset.modo), "mio-devolver");
  // Vuelve la señal: se manda en orden
  sinSenal = false;
  await page.evaluate(() => procesarColaEnvios());
  await page.waitForTimeout(500);
  assert.deepStrictEqual(posts.map((p) => p.accion), ["tomar", "evento"]);
  assert.strictEqual(posts[1].tipo_evento, "Revisión al tomar");
  assert.strictEqual(posts[1].km, "1010");
  assert.match(posts[1].detalle, /Nafta ½ · Cubiertas: PROBLEMA/);
  assert.match(posts[1].detalle, /10 km más que el último registro/);
  assert.strictEqual(await page.evaluate(() => obtenerColaEnvios().length), 0);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("El botón atrás de Android no cierra la app ni cambia de pantalla", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(base + "/");
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__sigueViva = true; showScreen("ajustes"); });
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(5, 300);
    await page.goBack({ timeout: 2000 }).catch(() => null);
    await page.waitForTimeout(150);
  }
  assert.strictEqual(await page.evaluate(() => window.__sigueViva === true), true, "la página no se descargó");
  assert.strictEqual(await page.evaluate(() => screens.ajustes.dataset.active), "true", "no cambia de pantalla");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});
