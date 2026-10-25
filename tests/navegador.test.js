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
  assert.strictEqual(await css(page, ".dash-cards-row", "display"), "grid");
  await page.evaluate(() => { showScreen("dashboard"); fetchDashboard(); });
  await page.waitForTimeout(900);
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
  assert.ok(await page.evaluate(() => document.fonts.check("700 italic 20px 'Barlow Semi Condensed'")), "la fuente está disponible");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
  ({ ctx, page } = await paginaConEstilo("clasico"));
  await page.evaluate(() => showScreen("form"));
  assert.doesNotMatch(await page.locator("#screen-form .field-input").first().evaluate((el) => getComputedStyle(el).fontFamily), /Barlow/);
  assert.strictEqual(await page.locator(".topbar-logo").isVisible(), false);
  await ctx.close();
});
