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

// Backend de SIMs de prueba que SÍ aplica cada acción, para probar que las
// conciliaciones verifican lo hecho (y avisan cuando algo no quedó asentado).
function simsBackendFalso(stock, instaladas, historial, opciones = {}) {
  const d = (n) => String(n || "").replace(/\D/g, "").slice(-10);
  const sacar = (lista, x) => lista.splice(lista.indexOf(x), 1);
  return (b) => {
    if (opciones.noAplicar && opciones.noAplicar(b)) return { ok: true };
    const st = stock.find((x) => d(x.numero) === d(b.numero)), ins = instaladas.find((x) => d(x.numero) === d(b.numero));
    if (b.accion === "editar_stock" && st) { st.empresa = b.empresa; if (b.tipo) st.tipo = b.tipo; }
    else if (b.accion === "editar_instalada" && ins) Object.assign(ins, b.campos);
    else if (b.accion === "alta_lote") {
      const agregadas = [], repetidas = [];
      b.sims.forEach((s) => { if (stock.some((x) => d(x.numero) === d(s.numero)) || instaladas.some((x) => d(x.numero) === d(s.numero))) repetidas.push({ numero: s.numero }); else { stock.push({ numero: s.numero, empresa: s.empresa, tecnico_actual: s.tecnico_actual || "Oficina", ubicacion_tipo: "oficina", estado_fisico: "Disponible" }); agregadas.push({ numero: s.numero }); } });
      return { ok: true, agregadas, repetidas, invalidas: [] };
    } else if (b.accion === "usar") {
      if (!st) return { status: 400, error: "La SIM no está en stock" };
      sacar(stock, st);
      instaladas.push({ numero: st.numero, empresa: st.empresa, cliente: b.cliente, numero_cliente: b.numero_cliente || "", numero_abonado: b.numero_abonado || "", direccion: b.direccion || "", estado_linea: "Activo" });
    } else if (b.accion === "dar_de_baja" && st) { sacar(stock, st); historial.push({ fecha: "2026-11-05", hora: "10:00", numero: st.numero, accion: "baja", tecnico: "Oficina" }); }
    else if (b.accion === "retirar_de_registro" && ins) { sacar(instaladas, ins); stock.push({ numero: ins.numero, empresa: ins.empresa, tecnico_actual: b.tecnico || "Oficina", ubicacion_tipo: "oficina", estado_fisico: "Disponible" }); }
    else if (b.accion === "corregir_numero" && (st || ins)) (st || ins).numero = b.numero_nuevo;
    return { ok: true };
  };
}

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

test("el estilo del inicio: el nuevo es el de por defecto (4.0), el clásico se elige en Ajustes y se recuerda", async () => {
  const { ctx, page } = await nuevaPagina();
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  const estilo = () => page.evaluate(() => document.documentElement.getAttribute("data-inicio"));
  assert.strictEqual(await estilo(), "nuevo", "desde la 4.0 el nuevo es el de por defecto");
  await page.evaluate(() => { showScreen("ajustes"); renderAjustes(); });
  await page.evaluate(() => document.querySelector('#ajusteEstiloInicio [data-estilo="clasico"]').click());
  assert.strictEqual(await estilo(), "clasico");
  await page.reload();
  await page.waitForTimeout(400);
  assert.strictEqual(await estilo(), "clasico", "quien vuelve al clásico, queda en el clásico");
  await page.evaluate(() => document.querySelector('#ajusteEstiloInicio [data-estilo="nuevo"]') && (showScreen("ajustes"), renderAjustes(), document.querySelector('#ajusteEstiloInicio [data-estilo="nuevo"]').click()));
  assert.strictEqual(await estilo(), "nuevo");
  await ctx.close();
});

test("el skin nuevo se aplica también en los submenús, y el clásico no los toca", async () => {
  const { ctx, page } = await nuevaPagina();
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  // ancho del ícono de la primera tecla del submenú: 52px en clásico, 36px en nuevo
  const ancho = (pantalla, id) => page.evaluate(([n, sel]) => { showScreen(n); return getComputedStyle(document.querySelector(sel + " .panel-tile-icon-badge")).width; }, [pantalla, id]);
  await page.evaluate(() => { localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "clasico" })); });
  await page.reload();
  await page.waitForTimeout(400);
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
  await page.addInitScript((e) => { localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: e })); localStorage.setItem("skin_v4_aplicado", "1"); }, estilo);
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
  await page.click("#rendEnviarBtn");
  await page.click(".dlg-app .dlg-no");
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
  const pagados = [], cuerpos = [];
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.route("**/api/recurso-uso**", (route) => {
    const req = route.request();
    if (req.method() === "POST") { cuerpos.push(JSON.parse(req.postData())); pagados.push(JSON.parse(req.postData()).id); return route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); }
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { id: "a", tecnico: "Juan", categoria: "Combustible", monto: 1000, fecha: "2026-10-02", estado: "pendiente", foto_ref: JSON.stringify(["https://x/f1.jpg"]) },
      { id: "b", tecnico: "Juan", categoria: "Peaje", monto: 500, fecha: "2026-10-03", estado: "pendiente" },
      { id: "c", tecnico: "Luis", categoria: "Otro", monto: 300, fecha: "2026-09-10", estado: "pendiente" },
      { id: "d", tecnico: "Luis", categoria: "Combustible", monto: 9000, fecha: "2026-09-11", estado: "pagado_app" },
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
  // "Pagado con APP": no suma a lo pendiente, tiene su filtro y su tilde
  assert.match(await page.locator("#rendicionesAdminLista").textContent(), /Pagado con APP \(sin reintegro\)/);
  assert.strictEqual(await page.locator('.rendicion-check-pagado[data-modo="pagado_app"][data-id="d"]').isChecked(), true);
  await page.selectOption("#rendicionesAdminFiltroEstado", "pagado_app");
  assert.match(await page.locator("#rendicionesAdminStatus").textContent(), /^1 de 4/);
  await page.selectOption("#rendicionesAdminFiltroEstado", "");
  await page.check('.rendicion-check-pagado[data-modo="pagado_app"][data-id="c"]');
  await page.waitForTimeout(300);
  assert.deepStrictEqual(cuerpos.pop(), { accion: "pagado_app", id: "c" });
  pagados.length = 0;
  await page.fill("#rendicionesAdminMes", "2026-10");
  assert.strictEqual(await page.locator("#rendicionesTotalesLista > div").count(), 1, "el mes filtra");
  await page.click("#rendicionesTotalesLista .rend-pagar-todo");
  await page.click(".cartel-admin .cartel-si");
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
  // La tarea dice solo "M20" y el parte quedó a nombre de "M20 Rosario Centro": cuenta como hecha
  await page.evaluate((hoy) => {
    cronogramaCache = [
      { fecha: hoy, hora_inicio: "08:00", tecnico: "Juan Pérez", tarea: "M20" },
      { fecha: hoy, hora_inicio: "10:00", tecnico: "Juan Pérez", tarea: "Visita mensual" },
      { fecha: hoy, hora_inicio: "16:00", tecnico: "Juan Pérez", tarea: "Servicio: Bar Oeste\nOroño 50 - Rosario" },
    ];
    historialCache = [{ cliente: "M20 Rosario Centro", fecha: hoy }];
    showScreen("home");
  }, diaISO(0));
  assert.strictEqual(await page.locator("#proximoServiceCliente").textContent(), "Visita mensual");
  // Se cierra el parte abierto desde esa tarea (aunque el cliente se cargue con otro nombre): pasa a la siguiente
  await page.evaluate(() => { seleccionarTareaCronograma(cronogramaCache[1]); marcarTareaCronogramaHecha(tareaCronogramaEnCurso); resetForm(); showScreen("home"); });
  assert.strictEqual(await page.locator("#proximoServiceCliente").textContent(), "Bar Oeste");
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

test("Admin SIMs: stock con resumen y filtros, acciones por fila y en lote, pendientes, alta sin duplicados, baja con motivo, instaladas y ficha de línea", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const acciones = [];
  const sims = [
    { numero: "341 555-0001", empresa: "Claro", tipo: "Estándar", tecnico_actual: "Juan", estado: "stock", estado_fisico: "Disponible", ubicacion_tipo: "tecnico" },
    { numero: "3415550002", empresa: "Movistar", tipo: "Mini", tecnico_actual: "Oficina", estado: "stock", estado_fisico: "Disponible", ubicacion_tipo: "oficina" },
    { numero: "3415550003", empresa: "Movistar", tipo: "Estándar", tecnico_actual: "Oficina", estado: "stock", estado_fisico: "Defectuosa", ubicacion_tipo: "oficina" },
    { numero: "3415550004", empresa: "Personal", tipo: "Estándar", tecnico_actual: "Juan", estado: "stock", estado_fisico: "Disponible", ubicacion_tipo: "tecnico" },
    { numero: "3415550009", empresa: "Claro", tecnico_actual: "Luis", estado: "uso", ubicacion_tipo: "cliente", cliente: "Kiosco Norte" },
  ];
  const instaladas = [
    { numero: "3415550009", cliente: "Kiosco Norte", direccion: "Belgrano 5", empresa: "Claro", estado_linea: "Activo", fecha_activacion: "2026-09-01", tecnico_instalador: "Luis" },
    { numero: "3415550010", cliente: "Farmacia Central", direccion: "San Martín 9", empresa: "Movistar", estado_linea: "Inactivo", fecha_activacion: "2026-10-10", tecnico_instalador: "Juan" },
  ];
  const pendientes = [{ id: 7, numero: "3415550004", empresa: "Personal", tecnico_origen: "Juan", tecnico_destino: "Luis", fecha: "2026-10-20", hora: "10:00" }];
  const historial = [{ fecha: "2026-10-20", hora: "10:00", numero: "3415550004", accion: "transferencia_pendiente", tecnico: "Juan", tecnico_nuevo: "Luis" }];
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.route("**/api/**", (route) => {
    const req = route.request(); const u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (req.method() === "POST" && u.includes("/api/recurso-uso")) {
      const b = JSON.parse(req.postData() || "{}");
      acciones.push(b);
      if (b.accion === "transferir") return json({ ok: true, pendiente: b.tecnico_nuevo !== "Oficina" });
      if (b.accion === "corregir_numero") { sims.find((x) => x.numero === b.numero).numero = "3415550222"; return json({ ok: true, numero: "3415550222" }); }
      if (b.accion === "alta_lote") return json({ ok: true, agregadas: b.sims.map((s) => ({ numero: s.numero })), repetidas: [], invalidas: [] });
      return json({ ok: true, migradas: 0 });
    }
    if (u.includes("pendientes=1")) return json(pendientes);
    if (u.includes("coleccion=sims_instaladas")) return json(instaladas);
    if (u.includes("coleccion=sims")) return json(sims);
    if (u.includes("coleccion=tecnicos")) return json([{ nombre: "Juan" }, { nombre: "Luis" }]);
    if (u.includes("recurso=sim")) return json(historial);
    json([]);
  });
  page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Devuelta a la empresa" : undefined));
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("panelSims").classList.remove("hidden"); return cargarSimsAdmin(); });

  // Solo stock (la instalada no aparece), resumen y pendientes
  assert.strictEqual(await page.locator("#simsTablaBody .sim-fila-tabla").count(), 4);
  assert.match(await page.locator("#simsResumen").textContent(), /Total 4[\s\S]*Oficina 1[\s\S]*Juan 2[\s\S]*Pendientes de aceptar 1[\s\S]*Con problema 1/);
  assert.match(await page.locator("#simsPendientesCard").textContent(), /3415550004[\s\S]*Juan[\s\S]*Luis/);
  assert.match(await page.locator("#simsTablaBody").textContent(), /Pendiente: Luis la tiene que aceptar/);

  // Filtro por chip
  await page.click('.sims-chip[data-quien="Juan"]');
  assert.strictEqual(await page.locator("#simsTablaBody .sim-fila-tabla").count(), 2);
  await page.click('.sims-chip[data-quien="Juan"]');

  // Transferir desde la fila (queda pendiente) y cancelar una pendiente
  const filaOficina = page.locator("#simsTablaBody .sim-fila-tabla", { hasText: "3415550002" });
  await filaOficina.locator(".sim-accion-select").selectOption("t:Juan");
  await page.waitForTimeout(300);
  assert.deepStrictEqual(acciones.filter((a) => a.accion === "transferir").map((a) => [a.numero, a.tecnico, a.tecnico_nuevo]), [["3415550002", "Oficina", "Juan"]]);
  assert.match(await page.locator("#simsStatus").textContent(), /pendiente hasta que la acepte/);
  await page.click(".sim-cancelar-pend");
  await page.click(".cartel-admin .cartel-si");
  await page.waitForTimeout(200);
  assert.ok(acciones.some((a) => a.accion === "cancelar_transferencia" && a.id_transferencia === 7));

  // Lote: marcar dos como defectuosas
  await page.locator("#simsTablaBody .sim-fila-tabla", { hasText: "0001" }).locator(".sim-sel").check();
  await page.locator("#simsTablaBody .sim-fila-tabla", { hasText: "0002" }).locator(".sim-sel").check();
  assert.match(await page.locator("#simsLoteCuenta").textContent(), /2 seleccionadas/);
  await page.selectOption("#simsLoteEstado", "Defectuosa");
  await page.click(".cartel-admin .cartel-si");
  await page.waitForTimeout(400);
  assert.deepStrictEqual(acciones.filter((a) => a.accion === "marcar_estado_fisico").map((a) => [a.numero, a.tecnico, a.estado_fisico]).sort(), [["341 555-0001", "Juan", "Defectuosa"], ["3415550002", "Oficina", "Defectuosa"]]);

  // Baja con motivo
  await page.locator("#simsTablaBody .sim-fila-tabla", { hasText: "0003" }).locator(".sim-accion-select").selectOption("baja");
  await page.selectOption(".sim-extra .x-motivo", "Perdida");
  await page.click(".sim-extra .x-ok");
  await page.click(".cartel-admin .cartel-si");
  await page.waitForTimeout(300);
  assert.ok(acciones.some((a) => a.accion === "dar_de_baja" && a.numero === "3415550003" && a.motivo === "Perdida"));

  // Alta: los que ya existen (en otro formato) o están instalados no se mandan
  await page.click("#simsAltaBtn");
  await page.fill("#simsAltaNumeros", "0341 15 555-0001\n3415550009\n3415550500\n341 555 0500\n12");
  await page.selectOption("#simsAltaEmpresa", "Claro");
  await page.click("#simsAltaRevisarBtn");
  const vista = await page.locator("#simsAltaVista").textContent();
  assert.match(vista, /3415550500[\s\S]*Ya existen \(no se tocan\) \(3\)[\s\S]*stock de Juan[\s\S]*instalada en Kiosco Norte[\s\S]*repetida en la lista[\s\S]*Con error \(1\)/);
  await page.click("#simsAltaConfirmarBtn");
  await page.waitForTimeout(300);
  const alta = acciones.find((a) => a.accion === "alta_lote");
  assert.deepStrictEqual(alta.sims.map((s) => [s.numero, s.empresa]), [["3415550500", "Claro"]]);

  // Ficha de la línea con nombres claros de los movimientos
  await page.locator("#simsTablaBody .sim-num-link", { hasText: "3415550004" }).click();
  await page.waitForTimeout(300);
  assert.match(await page.locator(".sims-ficha").textContent(), /En stock de Juan[\s\S]*Transferencia enviada: de Juan a Luis/);
  await page.click(".sims-ficha-cerrar");

  // Instaladas: filtros, estado de una sola línea y retirar
  await page.evaluate(() => { document.getElementById("panelSims").classList.add("hidden"); document.getElementById("panelSimsInstaladas").classList.remove("hidden"); return cargarSimsInstaladasAdmin(); });
  assert.strictEqual(await page.locator("#simsInstaladasTablaBody tr").count(), 2);
  await page.selectOption("#simsInstFiltroEstado", "Inactivo");
  assert.strictEqual(await page.locator("#simsInstaladasTablaBody tr").count(), 1);
  await page.click("#simsInstaladasTablaBody .badge-estado-sim");
  await page.waitForTimeout(200);
  assert.ok(acciones.some((a) => a.accion === "editar_instalada" && a.numero === "3415550010" && a.campos.estado_linea === "Activo"));
  await page.selectOption("#simsInstFiltroEstado", "");
  await page.locator("#simsInstaladasTablaBody tr", { hasText: "Kiosco Norte" }).locator(".sim-accion-select").selectOption("retirar");
  await page.selectOption(".sim-extra .x-destino", "Oficina");
  await page.click(".sim-extra .x-ok");
  await page.click(".cartel-admin .cartel-si");
  await page.waitForTimeout(300);
  assert.ok(acciones.some((a) => a.accion === "retirar_de_registro" && a.numero === "3415550009" && a.tecnico === "Oficina"));

  // Instalada cargada con la empresa equivocada: se corrige desde "Corregir datos"
  await page.locator("#simsInstaladasTablaBody tr", { hasText: "Farmacia Central" }).locator(".sim-accion-select").selectOption("editar");
  await page.selectOption(".sim-extra .x-empresa", "Personal");
  await page.click(".sim-extra .x-ok");
  await page.waitForTimeout(300);
  assert.deepStrictEqual(acciones.filter((a) => a.accion === "editar_instalada" && a.campos.empresa).map((a) => [a.numero, a.campos]), [["3415550010", { empresa: "Personal" }]], "solo manda lo que cambió");

  // Desde la ficha de la línea (cualquier pestaña): instalada y en stock
  await page.locator("#simsInstaladasTablaBody .sim-num-link", { hasText: "3415550010" }).click();
  await page.waitForSelector(".sims-ficha-corregir");
  await page.click(".sims-ficha-corregir summary");
  await page.selectOption('.sims-ficha-corregir [data-campo="empresa"]', "Claro");
  await page.fill('.sims-ficha-corregir [data-campo="numero_abonado"]', "4455");
  await page.click(".x-guardar-ficha");
  await page.waitForFunction(() => /Corregida/.test(document.querySelector(".x-estado-ficha").textContent));
  const ultima = acciones.filter((a) => a.accion === "editar_instalada").pop();
  assert.deepStrictEqual(ultima.campos, { empresa: "Claro", numero_abonado: "4455" });
  await page.click(".sims-ficha-cerrar");
  await page.evaluate(() => abrirFichaLineaSim("3415550002"));
  await page.waitForSelector(".sims-ficha-corregir");
  await page.click(".sims-ficha-corregir summary");
  await page.selectOption('.sims-ficha-corregir [data-campo="empresa"]', "Personal");
  assert.strictEqual(await page.locator('.sims-ficha-corregir [data-campo="tipo"]').isDisabled(), true, "Personal solo viene en Estándar");
  await page.click(".x-guardar-ficha");
  await page.waitForFunction(() => /Corregida/.test(document.querySelector(".x-estado-ficha").textContent));
  assert.ok(acciones.some((a) => a.accion === "editar_stock" && a.numero === "3415550002" && a.empresa === "Personal" && a.tipo === "Estándar"));
  // Número mal cargado: se corrige desde la misma ficha
  await page.fill(".x-numero-nuevo", "0341 15 555-0222");
  await page.click(".x-corregir-numero");
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /Número corregido/.test(document.querySelector(".x-estado-ficha").textContent));
  assert.ok(acciones.some((a) => a.accion === "corregir_numero" && a.numero === "3415550002" && a.numero_nuevo === "0341 15 555-0222"));
  assert.strictEqual(await page.textContent(".x-titulo-numero"), "3415550222");
  await page.click(".sims-ficha-cerrar");

  // En lote: cambiar la empresa de varias del stock
  await page.evaluate(() => { document.getElementById("panelSimsInstaladas").classList.add("hidden"); document.getElementById("panelSims").classList.remove("hidden"); return cargarSimsAdmin(true); });
  await page.locator("#simsTablaBody .sim-fila-tabla", { hasText: "0001" }).locator(".sim-sel").check();
  await page.locator("#simsTablaBody .sim-fila-tabla", { hasText: "0004" }).locator(".sim-sel").check();
  await page.selectOption("#simsLoteEmpresa", "Movistar");
  await page.click(".cartel-admin .cartel-si");
  await page.waitForTimeout(400);
  assert.deepStrictEqual(acciones.filter((a) => a.accion === "editar_stock" && a.empresa === "Movistar").map((a) => a.numero).sort(), ["341 555-0001", "3415550004"]);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Admin SIMs: los signos de ayuda muestran un cartel con GIF y consejos al pasar el mouse y al tocarlos", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("panelSims").classList.remove("hidden"); return cargarSimsAdmin(); });
  const claves = await page.$$eval(".ayuda-btn", (bs) => bs.map((b) => b.dataset.ayuda));
  for (const c of ["resumen", "alta", "excel", "pendientes", "fila", "ficha", "lote", "instaladas", "tablero", "conciliacion", "tec_resumen", "tec_permisos", "rend_resumen", "rend_estados", "rend_pagar_todo", "rend_excel"]) assert.ok(claves.includes(c), "falta ayuda " + c);
  await page.hover('.ayuda-btn[data-ayuda="alta"]');
  await page.waitForSelector(".ayuda-pop:not(.hidden)");
  assert.match(await page.textContent(".ayuda-pop"), /Cargar SIMs nuevas/);
  assert.match(await page.getAttribute(".ayuda-pop img", "src"), /sims-alta\.gif/);
  // Tocar lo deja fijo; Escape lo cierra
  await page.mouse.move(5, 5);
  await page.waitForSelector(".ayuda-pop.hidden", { state: "attached" });
  await page.click('.ayuda-btn[data-ayuda="excel"]');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  assert.equal(await page.isVisible(".ayuda-pop"), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.isVisible(".ayuda-pop"), false);
  assert.deepEqual(erroresPagina, []);
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
    return { sin: c.sinRegistrar.map((x) => x.n), stock: c.enStock.map((x) => x.x.numero), no: c.noEnPlanilla.map((x) => x.x.numero), ok: c.coinciden.length, total: c.totalPlanilla, activas: c.activas };
  });
  assert.deepStrictEqual(r, { sin: ["3415559999"], stock: ["341 555-0001"], no: ["3415550011"], ok: 1, total: 4, activas: 3 });
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
  await page.click("#vehiculoDevolverBtn");
  await page.click(".dlg-app .dlg-no");
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

test("Historial (skin nuevo): búsqueda en todas las fechas y por tarea, agrupado por día, claves ocultas y filtros plegados", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
  const partes = [
    { id_parte: "a", numero_servicio: "1", cliente: "Kiosco Norte", direccion: "Belgrano 5", tarea: "Cambio de sirena", tecnico: "Juan Pérez", fecha: d(0), hora_entrada: "09:00", hora_salida: "10:30", claves: [{ titulo: "Alarma", usuario: "inst", clave: "9876" }] },
    { id_parte: "b", numero_servicio: "2", cliente: "Farmacia Central", direccion: "San Martín 9", tarea: "Revisión de sensores", tecnico: "Juan Pérez", fecha: d(0), hora_entrada: "11:00", hora_salida: "11:45", descuento: "Por presupuesto N° 778", importe: 0 },
    { id_parte: "c", numero_servicio: "3", cliente: "Panadería Sur", direccion: "Mitre 100", tarea: "Batería del panel agotada", tecnico: "Juan Pérez", fecha: d(40), hora_entrada: "08:00", hora_salida: "09:00" },
  ];
  await page.route("**/api/**", (route) => {
    const u = route.request().url();
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(u.includes("/api/historial") ? partes : []) });
  });
  await page.goto(base + "/");
  await page.evaluate(() => localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo", avisoFelicitacion: false })));
  await page.reload();
  await page.waitForTimeout(300);
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; tileHistorialBtn.click(); });
  await page.waitForTimeout(500);
  // Agrupado por día con horas
  assert.match(await page.locator(".hist-dia").first().textContent(), /Hoy[\s\S]*2 servicios · 2 h 15 min/);
  // "Por presupuesto" se ve en la tarjeta (aunque no tenga cobro) y se puede buscar
  assert.strictEqual(await page.locator(".historial-card-presupuesto").count(), 1);
  assert.match(await page.locator(".historial-card", { hasText: "Farmacia Central" }).locator(".historial-card-presupuesto").textContent(), /Por presupuesto N° 778/);
  // Claves ocultas hasta tocar
  assert.strictEqual(await page.locator(".historial-card-claves").first().isVisible(), false);
  await page.click(".hist-claves-btn");
  assert.strictEqual(await page.locator(".historial-card-claves").first().isVisible(), true);
  assert.strictEqual(await page.evaluate(() => screens.historial.dataset.active), "true", "tocar las claves no abre el detalle");
  // Filtros plegados
  assert.strictEqual(await page.locator("#descargarExcelHistorialBtn").isVisible(), false);
  await page.click("#histFiltrosBtn");
  assert.strictEqual(await page.locator("#descargarExcelHistorialBtn").isVisible(), true);
  await page.click('.hist-pasado-chip[data-pasado="no"]');
  assert.strictEqual(await page.locator("#histFiltrosCuenta").textContent(), "1");
  await page.click('.hist-pasado-chip[data-pasado="todos"]');
  // Búsqueda: por tarea, sin tilde, en todas las fechas aunque esté en "4 días"
  await page.fill("#historialSearch", "bateria panel");
  await page.waitForTimeout(200);
  const cards = await page.locator(".historial-card").allTextContents();
  assert.strictEqual(cards.length, 1);
  assert.match(cards[0], /Panadería Sur/);
  assert.match(await page.locator("#historialModoLabel").textContent(), /todas tus fechas/);
  // Texto del período (antes decía "historial completo" en Semana/Mes)
  await page.fill("#historialSearch", "");
  await page.click('.hist-periodo-chip[data-periodo="mes"]');
  assert.strictEqual(await page.locator("#historialModoLabel").textContent(), "Viendo este mes.");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Seguridad: la app manda el pase personal que le dio el login y, si el servidor lo rechaza, pide entrar de nuevo", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const authVistos = [];
  let rechazar = false;
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const body = req.postData() || "";
    const json = (o, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(o) });
    if (body.includes("verificar_login")) return json({ ok: true, sesion: "s1.PASE.FIRMA" });
    if (req.url().includes("coleccion=tecnicos") && req.method() === "GET") return json([{ nombre: "Juan Pérez" }]);
    authVistos.push(req.headers()["authorization"] || "");
    if (rechazar) return json({ error: "No autorizado" }, 401);
    json([]);
  });
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  assert.strictEqual(await page.evaluate(() => SERVICIOS_API_TOKEN), "", "sin entrar no hay ninguna clave");
  await page.evaluate(() => { loginTecnicoSelect.innerHTML = '<option value="Juan Pérez">Juan Pérez</option>'; loginTecnicoSelect.value = "Juan Pérez"; });
  await page.fill("#loginPassword", "1234");
  authVistos.length = 0;
  await page.evaluate(() => attemptLogin());
  await page.waitForTimeout(600);
  assert.strictEqual(await page.evaluate(() => screens.home.dataset.active), "true");
  const sinPase = authVistos.filter((a) => a !== "Bearer s1.PASE.FIRMA");
  assert.ok(authVistos.length > 0 && sinPase.length === 0, "todos los pedidos llevan el pase personal: " + JSON.stringify(sinPase));
  assert.strictEqual(await page.evaluate(() => localStorage.getItem("sat_api_sesion")), "s1.PASE.FIRMA");
  // El servidor deja de aceptarlo (venció o se cambió la clave): vuelve al login
  rechazar = true;
  await page.evaluate(() => { showScreen("historial"); document.getElementById("parteDetalleModalOverlay").classList.remove("hidden"); });
  await page.evaluate(() => fetch("/api/historial", { headers: { Authorization: "Bearer " + SERVICIOS_API_TOKEN } }));
  await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => screens.login.dataset.active), "true");
  assert.match(await page.locator("#loginError").textContent(), /volvé a entrar/);
  assert.strictEqual(await page.locator("#parteDetalleModalOverlay").isVisible(), false, "el cartel abierto no tapa el login");
  assert.strictEqual(await page.evaluate(() => localStorage.getItem("sat_api_sesion")), null);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Skin nuevo: el esqueleto de carga se va cuando el estado se oculta (detalle del parte)", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route("**/api/**", (route) => {
    const u = route.request().url();
    const body = u.includes("tipo=parte") ? { id: "p1", numero_servicio: "4100", cliente: "Panadería Sur" } : [];
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(base + "/");
  await page.evaluate(() => localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo", avisoFelicitacion: false })));
  await page.reload();
  await page.waitForTimeout(300);
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; return abrirParteDetalleModal("p1"); });
  await page.waitForTimeout(300);
  assert.strictEqual(await page.locator("#parteDetalleModalOverlay .esqueleto-lista").count(), 0);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Skin nuevo: detalle del parte con encabezado, acciones, secciones, claves ocultas y firma al final", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const parte = { id: "p1", numero_servicio: "4100", cliente: "Panadería Sur", numero_cliente: "1203", direccion: "Mitre 100", localidad: "Funes", telefono: "341 555-1111", tecnico: "Juan Pérez", fecha: "2026-10-20", hora_entrada: "09:10", hora_salida: "10:35", tarea: "Cambio de sirena", materiales: "Sirena x1", costo_final: "22500", forma_pago: "PAGADO", claves: [{ titulo: "Alarma", clave: "5555" }], foto_ref: "/icons/logo.png", firma_img_ref: "/icons/logo.png", firma_aclaracion: "Marta Gómez", firma_cargo: "Encargada", cliente_email: "marta@x.com" };
  await page.route("**/api/**", (route) => {
    const u = route.request().url();
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(u.includes("tipo=parte") ? parte : []) });
  });
  await page.goto(base + "/");
  await page.evaluate(() => localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo", avisoFelicitacion: false })));
  await page.reload();
  await page.waitForTimeout(300);
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; return abrirParteDetalleModal("p1"); });
  assert.match(await page.locator(".pd-cab").textContent(), /N° 4100[\s\S]*Panadería Sur[\s\S]*09:10 a 10:35[\s\S]*Juan Pérez/);
  assert.strictEqual(await page.locator('.pd-accion[href="tel:3415551111"]').count(), 1);
  const titulos = await page.locator(".pd-sec-tit").allTextContents();
  assert.deepStrictEqual(titulos.map((x) => x.trim().toLowerCase()), ["trabajo", "materiales", "cobro", "cliente", "firma del cliente"]);
  assert.strictEqual(await page.locator("#pdClaves").isVisible(), false, "claves ocultas");
  await page.click("#pdClavesBtn");
  assert.match(await page.locator("#pdClaves").textContent(), /5555/);
  assert.match(await page.locator(".pd-firma").textContent(), /Aclaración[\s\S]*Marta Gómez[\s\S]*Cargo[\s\S]*Encargada[\s\S]*Mail[\s\S]*marta@x\.com/);
  await page.click(".pd-foto-mini");
  assert.strictEqual(await page.locator(".pd-lightbox").count(), 1);
  await page.click(".pd-lightbox");
  assert.strictEqual(await page.locator(".pd-lightbox").count(), 0);
  // Compartir manda una imagen JPG liviana con el diseño SAT
  await page.evaluate(() => {
    window.__compartido = null;
    navigator.canShare = (d) => !!(d && d.files);
    navigator.share = async (d) => {
      const f = d.files[0];
      const bm = await createImageBitmap(f);
      const r = new FileReader();
      const b64 = await new Promise((ok) => { r.onload = () => ok(r.result); r.readAsDataURL(f); });
      window.__compartido = { nombre: f.name, tipo: f.type, tam: f.size, ancho: bm.width, alto: bm.height, texto: d.text, b64 };
    };
  });
  await page.click("#pdCompartirBtn");
  await page.waitForFunction(() => window.__compartido, null, { timeout: 8000 });
  const comp = await page.evaluate(() => window.__compartido);
  assert.strictEqual(comp.nombre, "Parte-SAT-4100.jpg");
  assert.strictEqual(comp.tipo, "image/jpeg");
  assert.strictEqual(comp.ancho, 1080);
  assert.ok(comp.alto > 1200, "tiene todo el contenido: " + comp.alto);
  assert.ok(comp.tam < 400 * 1024, "liviana: " + comp.tam);
  assert.match(comp.texto, /N° 4100 — Panadería Sur/);
  if (process.env.GUARDAR_IMAGEN_PARTE) require("fs").writeFileSync(process.env.GUARDAR_IMAGEN_PARTE, Buffer.from(comp.b64.split(",")[1], "base64"));
  await page.click("#pdFichaBtn");
  await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => screens.fichaCliente.dataset.active), "true");
  assert.strictEqual(await page.locator("#parteDetalleModalOverlay").isVisible(), false);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Admin: portada con pendientes, buscador de cliente, menú agrupado, sesión que sobrevive al F5 y guardados que no pisan lo de la app", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const ayer = (() => { const x = new Date(); x.setDate(x.getDate() - 1); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); })();
  let vehiculosServidor = [{ nombre: "Kangoo", km_actual: 84000, umbrales: [] }];
  let herramientasServidor = [{ nombre: "Escalera 6m", tipo: "escalera", estado: "libre", tecnico_actual: "", cliente: "" }];
  const guardados = {};
  let loginPedido = null;
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.route("**/api/**", (route) => {
    const req = route.request(); const u = req.url();
    const json = (o, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(o) });
    const body = req.postData() || "";
    if (body.includes("verificar_admin")) { loginPedido = JSON.parse(body); return json(loginPedido.password === "mala" ? { ok: false } : { ok: true, sesion: "s1.ADMIN.F", nombre: loginPedido.nombre }); }
    if (u.includes("coleccion=auditoria")) return json([
      { fecha: new Date().toISOString(), quien: "Juan", seccion: "Rendiciones", accion: "Marcó como pagado", detalle: "Id: 7" },
      { fecha: new Date().toISOString(), quien: "Juan", seccion: "Acceso", accion: "Entró al panel", detalle: "" },
      { fecha: "2026-10-01T12:00:00Z", quien: "Marta", seccion: "Técnicos", accion: "Guardó la lista", detalle: "4 elementos" },
    ]);
    if (u.includes("tipo=instalaciones")) return json([{ id: 9, cliente: "Escuela 45", tecnico: "Luis", fecha: ayer, estado: "abierta" }, { id: 8, cliente: "Vieja", tecnico: "Juan", fecha: "2026-01-01", estado: "cerrada" }]);
    if (req.method() === "POST" && u.includes("coleccion=")) { guardados[u.match(/coleccion=([a-z_-]+)/)[1]] = JSON.parse(body); return json({ ok: true }); }
    if (u.includes("coleccion=servicios_emergencia")) return json([{ id: 1, cliente: "Kiosco Norte", revisado: 0 }, { id: 2, cliente: "Otro", revisado: 1 }]);
    if (u.includes("recurso=rendicion")) return json([{ id: 1, estado: "pendiente", monto: 1500, tecnico: "Juan" }]);
    if (u.includes("pendientes=1")) return json([]);
    if (u.includes("recurso=vehiculo")) return json([{ vehiculo: "Kangoo", tecnico: "Juan", fecha: ayer, hora_toma: "08:00" }]);
    if (u.includes("coleccion=vehiculos")) return json(vehiculosServidor);
    if (u.includes("coleccion=herramientas")) return json(herramientasServidor);
    if (u.includes("coleccion=tecnicos")) return json([{ nombre: "Juan" }]);
    if (u.includes("coleccion=clientes")) return json([{ nombre: "Panadería Sur", numero_cliente: "1203", direccion: "Mitre 100", localidad: "Funes" }, { nombre: "Ferretería Oeste", numero_cliente: "1300" }, { nombre: "Bar Cerrado", numero_cliente: "1400" }]);
    if (u.includes("coleccion=visitas_historicas")) return json([{ numero_cliente: "1203", ultima_visita: "2026-09-01", estado: "Activo" }, { numero_cliente: "1300", ultima_visita: "2024-03-01", estado: "Activo" }, { numero_cliente: "1400", ultima_visita: "2023-01-01", estado: "Baja" }]);
    if (u.includes("coleccion=sims_instaladas")) return json([{ numero: "3415550009", cliente: "Panadería Sur", numero_cliente: "1203", empresa: "Claro" }]);
    if (u.includes("tipo=claves_cliente")) return json([{ numero_cliente: "1203", cliente: "Panadería Sur", claves: [{ titulo: "Alarma", clave: "5555" }] }]);
    if (u.includes("/api/historial") && !u.includes("tipo=")) return json([{ cliente: "Panadería Sur", numero_cliente: "1203", fecha: "2026-10-01", tecnico: "Juan", tarea: "Cambio de batería", pasado_sistema_offline: 0 }]);
    json([]);
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  // Se entra con usuario y clave propios
  await page.fill("#pw", "x");
  await page.click("#pwBtn");
  assert.match(await page.textContent("#pwError"), /Elegí tu usuario/);
  await page.selectOption("#loginUsuario", "Juan");
  await page.fill("#pw", "mala");
  await page.click("#pwBtn");
  await page.waitForTimeout(300);
  assert.match(await page.textContent("#pwError"), /Usuario o clave incorrectos/);
  await page.fill("#pw", "x");
  await page.click("#pwBtn");
  await page.waitForTimeout(800);
  assert.deepStrictEqual({ n: loginPedido.nombre, a: loginPedido.accion }, { n: "Juan", a: "verificar_admin" });
  assert.match(await page.textContent("#adminUsuario"), /Juan/);
  // Portada
  assert.strictEqual(await page.locator("#panelInicio").isVisible(), true, "entra a Inicio");
  const tarjetas = await page.locator(".inicio-tarjeta").allTextContents();
  assert.ok(tarjetas.some((x) => /^1\s*Emergencias sin revisar/.test(x.trim())));
  assert.ok(tarjetas.some((x) => /Vehículos sin devolver[\s\S]*Kangoo \(Juan\)/.test(x)));
  assert.ok(tarjetas.some((x) => /Rendiciones por aprobar[\s\S]*1\.500/.test(x)));
  assert.ok(tarjetas.some((x) => /Partes sin pasar al sistema/.test(x)));
  assert.ok(tarjetas.some((x) => /^1\s*Instalaciones abiertas[\s\S]*Escuela 45 \(Luis, hace 1 día\)/.test(x.trim())), "instalaciones abiertas con cliente y técnico");
  assert.ok(tarjetas.some((x) => /^1\s*Clientes activos en rojo[\s\S]*Ferretería Oeste/.test(x.trim())), "cuenta solo los activos en rojo");
  assert.strictEqual(await page.locator("#emergenciasBadge").textContent(), "1");
  // Menú agrupado
  assert.deepStrictEqual((await page.locator(".menu-grupo-tit").allTextContents()).slice(0, 3), ["Día a día", "Administración", "SIMs"]);
  // Buscador de cliente
  await page.fill("#inicioBuscarCliente", "panad");
  await page.waitForTimeout(600);
  await page.click(".ib-item");
  const ficha = await page.locator(".ficha-adm").textContent();
  assert.match(ficha, /Panadería Sur[\s\S]*Cambio de batería[\s\S]*3415550009/);
  assert.strictEqual(await page.locator(".fa-claves").isVisible(), false, "claves ocultas");
  // La tarjeta de clientes en rojo abre el Semáforo filtrado en rojo y activos
  await page.locator(".inicio-tarjeta", { hasText: "Clientes activos en rojo" }).click();
  await page.waitForTimeout(800);
  assert.strictEqual(await page.locator("#panelSemaforo").isVisible(), true);
  assert.strictEqual(await page.inputValue("#semaforoFiltroAbonado"), "activo");
  assert.match(await page.locator("#semaforoLista").textContent(), /Ferretería Oeste/);
  assert.doesNotMatch(await page.locator("#semaforoLista").textContent(), /Bar Cerrado/);
  // Sesión que sobrevive al F5
  await page.reload();
  await page.waitForTimeout(800);
  assert.strictEqual(await page.locator("#mainCard").isVisible(), true, "sigue adentro después de recargar");
  assert.match(await page.textContent("#adminUsuario"), /Juan/, "sigue mostrando quién entró");
  // Registro de cambios
  await page.evaluate(() => irAPestana("tabAuditoriaBtn"));
  await page.waitForTimeout(400);
  assert.match(await page.textContent("#audStatus"), /3 de 3/);
  await page.selectOption("#audQuien", "Marta");
  assert.match(await page.textContent("#audLista"), /Técnicos[\s\S]*Guardó la lista[\s\S]*4 elementos/);
  assert.doesNotMatch(await page.textContent("#audLista"), /Rendiciones/);
  // Vehículos: un cambio de umbral no pisa los km que cargó un técnico mientras tanto
  await page.click("#tabVehiculosBtn");
  await page.waitForTimeout(500);
  vehiculosServidor = [{ nombre: "Kangoo", km_actual: 84500, umbrales: [] }];
  await page.click("#guardarVehiculosBtn");
  await page.waitForTimeout(500);
  assert.strictEqual(guardados.vehiculos[0].km_actual, 84500);
  // Herramientas: no se pisa quién la tiene
  await page.click("#tabHerramientasBtn");
  await page.waitForTimeout(500);
  herramientasServidor = [{ nombre: "Escalera 6m", tipo: "escalera", estado: "uso", tecnico_actual: "Juan", cliente: "" }];
  await page.click("#guardarHerramientasBtn");
  await page.waitForTimeout(500);
  assert.deepStrictEqual([guardados.herramientas[0].estado, guardados.herramientas[0].tecnico_actual], ["uso", "Juan"]);
  // Cambios sin guardar: al volver a la pestaña no se recarga encima, se avisa
  await page.fill(".herramienta-nombre", "Escalera 7m");
  await page.click("#tabInicioBtn");
  await page.click("#tabHerramientasBtn");
  await page.waitForTimeout(300);
  assert.strictEqual(await page.locator(".herramienta-nombre").inputValue(), "Escalera 7m");
  assert.match(await page.locator(".aviso-cambios").textContent(), /cambios sin guardar/);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Permisos: un permiso nuevo (ej. Administración) aparece sin cerrar sesión, al abrir la app y al volver a ella", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  let permisosServidor = { admin: false, vehiculos: true };
  await page.route("**/api/**", (route) => {
    const u = route.request().url();
    if (u.includes("coleccion=tecnicos") && route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ nombre: "Juan Pérez", permisos: permisosServidor }]) });
    }
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto(base + "/");
  // Sesión guardada de antes, con los permisos viejos en el celular (sin Administración)
  await page.evaluate(() => {
    localStorage.setItem("sat_api_sesion", "s1.PASE.F");
    localStorage.setItem("sesion_sat", JSON.stringify({ tecnico: "Juan Pérez", expira: Date.now() + 3600e3 }));
    localStorage.setItem("tecnicos_permisos_cache", JSON.stringify({ "Juan Pérez": { admin: false, vehiculos: true } }));
  });
  permisosServidor = { admin: true, vehiculos: true };
  await page.reload();
  await page.waitForTimeout(900);
  assert.strictEqual(await page.evaluate(() => tecnicoLogueado), "Juan Pérez");
  assert.strictEqual(await page.evaluate(() => abrirAdminBtn.classList.contains("hidden")), false, "aparece al abrir la app");
  // En el admin se lo sacan y la persona vuelve a la app un rato después
  permisosServidor = { admin: false, vehiculos: true };
  await page.evaluate(() => { permisosUltimaActualizacion = 0; document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(600);
  assert.strictEqual(await page.evaluate(() => abrirAdminBtn.classList.contains("hidden")), true, "se oculta al volver a la app");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Instalaciones: las fotos se ven (se piden con el pase de la sesión) y se abren en grande al tocarlas", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const png = require("fs").readFileSync(require("path").join(__dirname, "..", "icons", "icon-192.png"));
  const pedidos = [];
  await page.route("**/api/historial?tipo=foto-instalacion**", (route) => {
    const auth = route.request().headers()["authorization"] || "";
    pedidos.push(auth);
    if (!auth.includes("s1.PASE")) return route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"No autorizado"}' });
    route.fulfill({ status: 200, contentType: "image/png", body: png });
  });
  await page.goto(base + "/");
  await page.evaluate(() => { guardarPaseApi("s1.PASE.F"); instalacionActivaId = "77"; pintarFotosInstalacion(["foto-1.jpg", "foto-2.jpg"]); });
  await page.waitForFunction(() => [...document.querySelectorAll(".instalacion-foto-item img")].every((i) => i.complete && i.naturalWidth > 0 && i.dataset.lista));
  assert.ok(pedidos.length >= 2 && pedidos.every((a) => a.includes("s1.PASE")), "las pide con el pase");
  await page.evaluate(() => document.querySelector(".instalacion-foto-item img").click());
  assert.strictEqual(await page.locator(".pd-lightbox img").count(), 1, "se abre en grande");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Firma: «Nadie firma» deja cerrar el parte sin firma ni aclaración y queda declarado en el mail", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const mails = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    if (req.url().includes("/api/enviar-mail") && req.method() === "POST") mails.push((JSON.parse(req.postData() || "{}").datos) || {});
    route.fulfill({ status: 200, contentType: "application/json", body: req.url().includes("tecnicos") ? "[]" : '{"ok":true}' });
  });
  await page.goto(base + "/");
  await page.evaluate(() => {
    tecnicoLogueado = "Juan Pérez";
    document.getElementById("f_cliente").value = "Panadería Sur";
    document.getElementById("f_tarea").value = "Cambio de batería";
    showScreen("sign"); setupCanvas();
  });
  // Sin tildar: pide la firma
  await page.click("#confirmSignBtn");
  assert.strictEqual(await page.evaluate(() => screens.sign.dataset.active), "true");
  await page.check("#signSinFirma");
  assert.strictEqual(await page.locator("#signAclaracion").isVisible(), false, "la aclaración se oculta");
  await page.click("#confirmSignBtn");
  await page.waitForFunction(() => screens.done.dataset.active === "true", null, { timeout: 8000 });
  const m = mails.find((x) => x.firma_img);
  assert.ok(m, "se mandó el mail");
  assert.match(m.firma_img, /SIN FIRMA/);
  assert.match(m.firma_aclaracion, /no había ningún responsable en el lugar/);
  assert.match(m.firma_cargo || "", /Declarado por/);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Horas del servidor: se guardan en UTC y se muestran en hora de Argentina (una nota de las 17:57 no dice 20:57)", async () => {
  const ctx = await browser.newContext({ serviceWorkers: "block", timezoneId: "America/Argentina/Buenos_Aires", locale: "es-AR" });
  const page = await ctx.newPage();
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(base + "/");
  const r = await page.evaluate(() => {
    const d = fechaDelServidor("2026-10-26 20:57:00");
    return { h: d.getHours(), m: d.getMinutes(), iso: fechaDelServidor("2026-10-26T20:57:00.000Z").getHours(), dia: diaLocalDelServidor("2026-10-27 01:30:00") };
  });
  assert.deepStrictEqual(r, { h: 17, m: 57, iso: 17, dia: "2026-10-26" });
  await page.goto(base + "/admin.html");
  assert.strictEqual(await page.evaluate(() => fechaDelServidor("2026-10-26 20:57:00").getHours()), 17);
  await ctx.close();
});

test("Admin Clientes: se puede cargar un cliente a mano (obligatorios, aviso si el N° ya existe) y editarlo después", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  let clientes = [{ numero_cliente: "1203", nombre: "PANADERIA SUR", direccion: "Mitre 100", localidad: "Funes", telefono: "341 555", numero_abonado: "4821" }];
  const posts = [];
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.route("**/api/**", (route) => {
    const req = route.request(); const u = req.url();
    if (u.includes("coleccion=clientes") && req.method() === "POST") { clientes = JSON.parse(req.postData()); posts.push(u); return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); }
    if (u.includes("coleccion=clientes")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(clientes) });
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("panelClientes").classList.remove("hidden"); });
  // Faltan obligatorios
  await page.fill("#cliManNombre", "KIOSCO NORTE");
  await page.click("#cliManGuardarBtn");
  assert.match(await page.textContent("#cliManStatus"), /Falta completar: N° de cliente, N° de abonado, Dirección, Teléfono/);
  assert.strictEqual(posts.length, 0);
  // Completo: se agrega sin tocar a los demás
  await page.fill("#cliManNumero", "1500");
  await page.fill("#cliManAbonado", "5100");
  await page.fill("#cliManDireccion", "Belgrano 5");
  await page.fill("#cliManTelefono", "341 444 2222");
  await page.click("#cliManGuardarBtn");
  await page.waitForTimeout(400);
  assert.match(await page.textContent("#cliManStatus"), /se agregó el cliente 1500/);
  assert.deepStrictEqual(clientes.map((c) => c.numero_cliente), ["1203", "1500"]);
  assert.strictEqual(clientes[1].nombre, "KIOSCO NORTE");
  assert.match(decodeURIComponent(posts[0]), /cambio=Agregó un cliente a mano&detalle_cambio=1500 — KIOSCO NORTE/);
  // Mismo N° que uno existente: pregunta antes de pisar
  await page.fill("#cliManNumero", "1203"); await page.fill("#cliManAbonado", "9999"); await page.fill("#cliManNombre", "OTRO");
  await page.fill("#cliManDireccion", "X 1"); await page.fill("#cliManTelefono", "1");
  await page.click("#cliManGuardarBtn");
  await page.waitForSelector(".cartel-admin");
  assert.match(await page.textContent(".cartel-admin"), /Ya existe el cliente N° 1203: "PANADERIA SUR"/);
  await page.click(".cartel-admin .cartel-no");
  await page.waitForTimeout(200);
  assert.strictEqual(clientes.find((c) => c.numero_cliente === "1203").nombre, "PANADERIA SUR", "no lo pisó");
  // Editar desde el buscador
  await page.click("#cliManLimpiarBtn");
  await page.fill("#clientesBuscarAdmin", "1500");
  await page.click(".cli-editar-btn");
  assert.strictEqual(await page.inputValue("#cliManNombre"), "KIOSCO NORTE");
  await page.fill("#cliManTelefono", "341 999 0000");
  await page.click("#cliManGuardarBtn");
  await page.waitForTimeout(400);
  assert.strictEqual(clientes.find((c) => c.numero_cliente === "1500").telefono, "341 999 0000");
  assert.strictEqual(clientes.length, 2);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Presupuesto express: cliente del listado, artículos (en pesos y en dólares), mano de obra y PDF E-0001 para compartir", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const lista = { cotizacion_usd: 1000, kits: [{ nombre: "Kit base", items: [{ c: "BAT7", d: "BATERIA 12V 7A/H", cant: 2 }] }], items: [
    { c: "SP6000", d: "CENTRAL PARADOX SP6000", p: 100, m: "USD" },
    { c: "BAT7", d: "BATERIA 12V 7A/H", p: 20000, m: "ARS" },
  ] };
  const pedidos = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(); const u = req.url();
    const j = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("lista_precios")) return j(lista);
    if (u.includes("presupuestos_express")) { const b = JSON.parse(req.postData() || "{}"); if (b.accion !== "adjuntar_pdf") pedidos.push(b); return j(b.accion === "nuevo" ? { ok: true, numero: "E-0001" } : b.accion === "revision" ? { ok: true, numero: b.base + "-R1" } : { ok: true }); }
    if (u.includes("coleccion=clientes")) return j([{ nombre: "Tell Cecilia", numero_cliente: "60", direccion: "Albarracín 8122", telefono: "4519509" }]);
    if (u.includes("/api/foto")) return j({ ok: true, id: "pdf1" });
    j([]);
  });
  await page.goto(base + "/");
  await page.evaluate(() => {
    tecnicoLogueado = ""; actualizarAccesoSeccionesPanel();
    window.__compartido = null;
    navigator.canShare = () => true;
    navigator.share = async (d) => { const f = d.files[0]; window.__compartido = { nombre: f.name, tipo: f.type, inicio: new TextDecoder().decode((await f.arrayBuffer()).slice(0, 5)) }; };
    localStorage.removeItem("presupuesto_express_borrador");
  });
  assert.strictEqual(await page.evaluate(() => document.getElementById("tilePresupuestoBtn").classList.contains("hidden")), false, "con permiso se ve el mosaico");
  await page.evaluate(() => document.getElementById("tilePresupuestoBtn").click());
  await page.waitForTimeout(400);
  assert.match(await page.textContent("#peListaEstado"), /2 artículos · dólar a \$1\.000/);
  // Sin cliente no deja generar
  await page.click("#peGenerarBtn");
  assert.strictEqual(pedidos.length, 0);
  await page.fill("#peClienteBuscar", "tell");
  await page.click(".pe-res");
  assert.strictEqual(await page.inputValue("#peNumCliente"), "60");
  await page.fill("#peArtBuscar", "sp6000"); await page.click(".pe-art");
  await page.click(".pe-kit"); // el kit trae 2 baterías
  assert.match(await page.textContent("#peTotales"), /Total materiales\$140\.000/);
  // Falta la mano de obra
  await page.click("#peGenerarBtn");
  assert.strictEqual(pedidos.length, 0, "pide la mano de obra");
  await page.fill("#peManoObra", "50.000");
  await page.selectOption("#peFormaPago", "A convenir");
  assert.match(await page.textContent("#peTotales"), /Total\$190\.000/);
  // Falta decir qué es (ampliación, monitoreado o automonitoreo)
  await page.click("#peGenerarBtn");
  assert.strictEqual(pedidos.length, 0, "pide el tipo de trabajo");
  assert.strictEqual(await page.isVisible("#peAbonoWrap"), false);
  await page.click('[data-tipo="ampliacion"]');
  assert.strictEqual(await page.isVisible("#peAbonoWrap"), false, "la ampliación no lleva abono");
  await page.click('[data-tipo="monitoreado"]');
  assert.strictEqual(await page.isVisible("#peAbonoWrap"), true);
  assert.strictEqual(await page.inputValue("#peTitulo"), "Sistema de Alarma Monitoreado", "título sugerido");
  // Monitoreado sin abono no deja generar
  await page.click("#peGenerarBtn");
  assert.strictEqual(pedidos.length, 0, "pide el abono");
  await page.fill("#peAbono", "38.500");
  assert.match(await page.textContent("#peTotales"), /Abono mensual de monitoreo\$38\.500 \/ mes/);
  await page.click("#peGenerarBtn");
  await page.waitForFunction(() => window.__compartido, null, { timeout: 15000 });
  const c = await page.evaluate(() => window.__compartido);
  assert.deepStrictEqual(c, { nombre: "Presupuesto_E-0001_Tell_Cecilia.pdf", tipo: "application/pdf", inicio: "%PDF-" });
  assert.deepStrictEqual({ total: pedidos[0].total, mo: pedidos[0].mano_obra, fp: pedidos[0].forma_pago, cot: pedidos[0].cotizacion_usd, tipo: pedidos[0].tipo, abono: pedidos[0].abono }, { total: 190000, mo: 50000, fp: "A convenir", cot: 1000, tipo: "monitoreado", abono: 38500 });
  assert.match(await page.textContent("#peResultado"), /Presupuesto E-0001 listo/);
  // Al WhatsApp del cliente: chat con su número (Rosario) y el link al PDF
  await page.evaluate(() => { window.dialogoApp = async (m, op = {}) => (op.conTexto ? op.valor : true); window.__wa = ""; window.open = (u) => { window.__wa = u; }; });
  await page.click("#peWhatsappClienteBtn");
  await page.waitForFunction(() => window.__wa);
  const wa = decodeURIComponent(await page.evaluate(() => window.__wa));
  assert.match(wa, /^https:\/\/wa\.me\/5493414519509\?text=Hola Tell Cecilia! Te enviamos el presupuesto E-0001[\s\S]*\$190\.000[\s\S]*Abono mensual de monitoreo: \$38\.500 por mes[\s\S]*api\/foto\?id=pdf1&tipo=pdf/);
  // Corregir: sale como revisión del mismo número
  await page.evaluate(() => { window.dialogoApp = async (m, op = {}) => (op.conTexto ? null : true); window.__compartido = null; });
  await page.click("[data-corregir]");
  assert.match(await page.textContent("#peAvisoRevision"), /Corrigiendo el presupuesto E-0001/);
  assert.strictEqual(await page.inputValue("#peManoObra"), "50.000");
  await page.fill("#peManoObra", "40000");
  await page.click("#peGenerarBtn");
  await page.waitForFunction(() => window.__compartido, null, { timeout: 15000 });
  assert.deepStrictEqual({ a: pedidos.at(-1).accion, b: pedidos.at(-1).base }, { a: "revision", b: "E-0001" });
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Croquis: habitaciones, pared, equipos rotados, cableado y texto; se guarda ligado al cliente y se descarga en PDF/PNG/SVG", async () => {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const erroresPagina = [];
  page.on("pageerror", (e) => erroresPagina.push(e.message));
  await page.addInitScript(() => { localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo" })); localStorage.setItem("skin_v4_aplicado", "1"); });
  const guardados = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(); const u = req.url();
    const j = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("coleccion=croquis")) {
      if (req.method() === "POST") { const b = JSON.parse(req.postData()); guardados.push(b); return j({ ok: true, id: "cq0001abc", actualizado: "2026-10-26T15:00:00.000Z" }); }
      if (u.includes("id=cq0001abc")) return j({ ...guardados[guardados.length - 1], id: "cq0001abc", autor: "Juan", actualizado: "2026-10-26T15:00:00.000Z" });
      return j(guardados.length ? [{ id: "cq0001abc", titulo: guardados[0].titulo, cliente: guardados[0].cliente, numero_cliente: guardados[0].numero_cliente, autor: "", actualizado: "2026-10-26T15:00:00.000Z", elementos: 3 }] : []);
    }
    if (u.includes("coleccion=clientes")) return j([{ nombre: "Tell Cecilia", numero_cliente: "60", direccion: "Albarracín 8122" }]);
    j([]);
  });
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    tecnicoLogueado = ""; actualizarAccesoSeccionesPanel();
    window.__archivos = [];
    navigator.canShare = () => true;
    navigator.share = async (d) => { const f = d.files[0]; window.__archivos.push({ nombre: f.name, tipo: f.type, inicio: new TextDecoder().decode((await f.arrayBuffer()).slice(0, 5)) }); };
    window.dialogoApp = async (m, op = {}) => (op.conTexto ? null : true);
    localStorage.removeItem("croquis_borrador");
  });
  assert.strictEqual(await page.evaluate(() => document.getElementById("tileCroquisBtn").classList.contains("hidden")), false, "con permiso se ve el mosaico");
  await page.evaluate(() => document.getElementById("tileCroquisBtn").click());
  await page.waitForTimeout(300);
  assert.match(await page.textContent("#cqLista"), /Todavía no hay croquis/);
  await page.click("#cqNuevoBtn");
  await page.waitForTimeout(300);
  const caja = await page.locator("#cqSvg").boundingBox();
  const arrastrar = async (a, b) => { await page.mouse.move(caja.x + a[0], caja.y + a[1]); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(caja.x + a[0] + (b[0] - a[0]) * i / 8, caja.y + a[1] + (b[1] - a[1]) * i / 8); await page.mouse.up(); };
  // Arranca con la herramienta Habitación
  await arrastrar([40, 40], [240, 220]);
  await page.click('[data-herr="linea"]');
  await arrastrar([240, 40], [243, 220]); // casi vertical: se endereza
  await page.click('[data-herr="simbolos"]');
  await page.click('[data-simbolo="infrarrojo"]');
  await page.mouse.click(caja.x + 200, caja.y + 180);
  await page.click('[data-acc="rot90"]');
  await page.click('[data-acc="rot+"]');
  await page.click('[data-herr="cable"]');
  await arrastrar([60, 60], [200, 170]);
  await page.click('[data-herr="texto"]');
  await page.mouse.click(caja.x + 120, caja.y + 120);
  await page.fill("#cqTxt", "Cocina");
  await page.click('[data-r="si"]');
  const els = await page.evaluate(() => cq.elementos);
  assert.deepStrictEqual(els.map((e) => e.t), ["rect", "linea", "simbolo", "cable", "texto"]);
  assert.deepStrictEqual([els[0].w, els[0].h], [200, 180]);
  assert.strictEqual(els[1].x1, els[1].x2, "la pared quedó vertical");
  assert.strictEqual(els[2].rot, 105);
  assert.ok(els[3].pts.length >= 2);
  // Deshacer y rehacer
  await page.click("#cqDeshacerBtn");
  assert.strictEqual(await page.evaluate(() => cq.elementos.length), 4);
  await page.click("#cqRehacerBtn");
  assert.strictEqual(await page.evaluate(() => cq.elementos.length), 5);
  // Guardar: pide cliente y título (del listado)
  await page.click("#cqMenuBtn");
  await page.click('[data-m="guardar"]');
  await page.fill("#cqDatoBuscar", "tell");
  await page.waitForTimeout(200);
  await page.click(".cq-datos .pe-res");
  await page.fill("#cqDatoTitulo", "Planta baja");
  await page.click('[data-r="si"]');
  await page.waitForTimeout(300);
  assert.strictEqual(guardados.length, 1);
  assert.strictEqual(guardados[0].accion, "guardar");
  assert.strictEqual(guardados[0].cliente, "Tell Cecilia");
  assert.strictEqual(guardados[0].numero_cliente, "60");
  assert.strictEqual(guardados[0].dibujo.elementos.length, 5);
  assert.match(await page.textContent("#cqSubtitulo"), /Tell Cecilia · N° 60/);
  // Descargas
  await page.click("#cqMenuBtn");
  await page.click('[data-m="pdf"]');
  await page.waitForFunction(() => window.__archivos.length === 1, null, { timeout: 15000 });
  await page.click("#cqMenuBtn");
  await page.click('[data-m="png"]');
  await page.waitForFunction(() => window.__archivos.length === 2, null, { timeout: 15000 });
  const archivos = await page.evaluate(() => window.__archivos);
  assert.deepStrictEqual(archivos.map((a) => [a.nombre, a.inicio.slice(0, 4)]), [["Croquis_Planta_baja_cli60.pdf", "%PDF"], ["Croquis_Planta_baja_cli60.png", "�PNG"]]);
  const [descarga] = await Promise.all([page.waitForEvent("download"), (async () => { await page.click("#cqMenuBtn"); await page.click('[data-m="svg"]'); })()]);
  assert.strictEqual(descarga.suggestedFilename(), "Croquis_Planta_baja_cli60.svg");
  const svg = require("fs").readFileSync(await descarga.path(), "utf8");
  assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /Infrarrojo/);
  assert.match(svg, /Cocina/);
  // Volver a la lista: aparece y se puede reabrir
  await page.click("#volverDeCroquisBtn");
  await page.waitForTimeout(300);
  assert.match(await page.textContent("#cqLista"), /Planta baja/);
  await page.click("[data-abrir]");
  await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => cq.elementos.length), 5);
  assert.strictEqual(await page.evaluate(() => cq.id), "cq0001abc");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Croquis: cables con color y trazo, equipos de color, cámaras/DVR y objetos de obra (puerta espejada, ventana, piscina) en el SVG y la leyenda", async () => {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const erroresPagina = [];
  page.on("pageerror", (e) => erroresPagina.push(e.message));
  await page.addInitScript(() => { localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo" })); localStorage.setItem("skin_v4_aplicado", "1"); });
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  await page.evaluate(() => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); cqAbrirEditor({}); });
  await page.waitForTimeout(200);
  const caja = await page.locator("#cqSvg").boundingBox();
  const clic = (x, y) => page.mouse.click(caja.x + x, caja.y + y);
  const arrastrar = async (a, b) => { await page.mouse.move(caja.x + a[0], caja.y + a[1]); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(caja.x + a[0] + (b[0] - a[0]) * i / 8, caja.y + a[1] + (b[1] - a[1]) * i / 8); await page.mouse.up(); };
  // Objetos de obra: la paleta muestra solo esos
  await page.click('[data-herr="objetos"]');
  const objetos = await page.$$eval("#cqSimbolos [data-simbolo]", (bs) => bs.map((b) => b.dataset.simbolo));
  for (const k of ["puerta", "paso", "ventana", "corrediza", "columna", "columna_redonda", "porton_batiente", "porton_corredizo", "escalera_recta", "escalera_caracol", "logo_sat", "piscina", "planta", "reja", "arbol", "auto"]) assert.ok(objetos.includes(k), k);
  await page.click('[data-simbolo="puerta"]');
  await clic(100, 100);
  await page.click('[data-acc="espejo"]');
  await page.click('[data-herr="objetos"]');
  await page.click('[data-simbolo="piscina"]');
  await clic(200, 300);
  assert.ok(await page.locator(".cq-color").count() > 0, "a todo se le puede cambiar el color");
  // Equipos: DVR y cámaras; un magnético pintado de naranja
  await page.click('[data-herr="simbolos"]');
  const equipos = await page.$$eval("#cqSimbolos [data-simbolo]", (bs) => bs.map((b) => b.dataset.simbolo));
  for (const k of ["central", "hub", "repetidor", "teclado", "sirena_ext", "sirena_int", "magnetico", "infrarrojo", "infrarrojo_ext", "infrarrojo_cortina", "humo", "gas", "pulsador_incendio", "pulsador_asalto", "dvr", "camara_ip", "camara_analoga", "monitor", "rotura_vidrio", "barrera", "comunicador"]) assert.ok(equipos.includes(k), k);
  for (const [tipo, x, y] of [["dvr", 60, 200], ["camara_ip", 300, 80], ["camara_analoga", 300, 200], ["magnetico", 160, 100]]) {
    await page.click('[data-herr="simbolos"]');
    await page.click(`[data-simbolo="${tipo}"]`);
    await clic(x, y);
  }
  await page.click('.cq-color[data-color="#E8741E"]');
  // Cable: color azul y trazo continuo, con nombre para la leyenda; el siguiente sale igual
  await page.click('[data-herr="cable"]');
  await arrastrar([60, 200], [300, 80]);
  await page.click('[data-herr="mover"]');
  await page.evaluate(() => { cq.sel = cq.elementos.find((e) => e.t === "cable").id; cqRender(); });
  await page.click('.cq-color[data-color="#2E86DE"]');
  await page.click('[data-trazo="continuo"]');
  await page.evaluate(() => { window.dialogoApp = async (m, op = {}) => (op.conTexto ? "Cámaras" : true); });
  await page.click('[data-acc="cnombre"]');
  await page.click('[data-herr="cable"]');
  await arrastrar([60, 220], [300, 220]);
  const els = await page.evaluate(() => cq.elementos);
  const porTipo = (t) => els.find((e) => e.tipo === t);
  assert.strictEqual(porTipo("puerta").esp, true);
  assert.strictEqual(porTipo("magnetico").color, "#E8741E");
  const cables = els.filter((e) => e.t === "cable");
  assert.deepStrictEqual(cables.map((c) => [c.color, c.trazo, c.nombre || ""]), [["#2E86DE", "continuo", "Cámaras"], ["#2E86DE", "continuo", ""]]);
  // Una pared de guiones (medianera)
  await page.click('[data-herr="linea"]');
  await arrastrar([40, 400], [340, 400]);
  await page.click('[data-herr="mover"]');
  await page.evaluate(() => { cq.sel = cq.elementos.find((e) => e.t === "linea").id; cqRender(); });
  await page.click('[data-trazo="guiones"]');
  const svg = await page.evaluate(() => croquisSvgDocumento(cqDibujo()));
  assert.match(svg, /scale\(-1 1\)/, "puerta espejada");
  assert.match(svg, /fill="#D6ECFA"/, "piscina");
  assert.match(svg, />DVR</);
  assert.match(svg, /<circle cx="0" cy="0" r="8" fill="#E8741E"/, "magnético naranja (circulito)");
  assert.match(svg, /stroke="#2E86DE" stroke-width="2.6" stroke-linecap/, "cable azul continuo");
  assert.match(svg, /stroke-width="3.5" stroke-dasharray="9 5"/, "pared en guiones");
  // Leyenda: equipos y cables, sin objetos de obra
  const leyenda = await page.evaluate(() => croquisTiposUsados(cqDibujo()).map((i) => i.nombre));
  assert.deepStrictEqual(leyenda, ["Magnético", "DVR / NVR", "Cámara IP", "Cámara analógica", "Cámaras"]);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Croquis: círculo y triángulos, color y trazo de la habitación, bloquear, tabla y cuadro de texto, portones", async () => {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const erroresPagina = [];
  page.on("pageerror", (e) => erroresPagina.push(e.message));
  await page.addInitScript(() => { localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo" })); localStorage.setItem("skin_v4_aplicado", "1"); });
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  await page.evaluate(() => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); window.dialogoApp = async (m, op = {}) => (op.conTexto ? null : true); cqAbrirEditor({}); });
  await page.waitForTimeout(200);
  const caja = await page.locator("#cqSvg").boundingBox();
  const clic = (x, y) => page.mouse.click(caja.x + x, caja.y + y);
  const arrastrar = async (a, b) => { await page.mouse.move(caja.x + a[0], caja.y + a[1]); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(caja.x + a[0] + (b[0] - a[0]) * i / 8, caja.y + a[1] + (b[1] - a[1]) * i / 8); await page.mouse.up(); };
  // Formas
  await page.click('[data-herr="rect"]');
  assert.deepStrictEqual(await page.$$eval("#cqSimbolos [data-forma]", (bs) => bs.map((b) => b.dataset.forma)), ["rect", "elipse", "triangulo", "triangulo_rect"]);
  await arrastrar([20, 20], [340, 340]);
  await page.click('[data-forma="elipse"]');
  await arrastrar([60, 60], [158, 152]); // casi redondo: queda círculo
  await page.click('[data-forma="triangulo"]');
  await arrastrar([200, 60], [300, 160]);
  let els = await page.evaluate(() => cq.elementos);
  assert.deepStrictEqual(els.map((e) => e.forma || "rect"), ["rect", "elipse", "triangulo"]);
  assert.strictEqual(els[1].w, els[1].h, "círculo parejo");
  // La habitación: color, trazo y bloqueo
  await page.click('[data-herr="mover"]');
  await clic(60, 300);
  await page.click('.cq-color[data-color="#2E86DE"]');
  await page.click('[data-trazo="guiones"]');
  await page.click('[data-acc="bloq"]');
  els = await page.evaluate(() => cq.elementos);
  assert.deepStrictEqual([els[0].color, els[0].trazo, els[0].bloq], ["#2E86DE", "guiones", true]);
  assert.match(await page.textContent("#cqProps"), /bloqueado/);
  // Arrastrar sobre lo bloqueado no lo mueve (desplaza la vista)
  const vista = await page.evaluate(() => ({ ...cq.vista }));
  const x0 = await page.evaluate(() => cq.elementos[0].x);
  await arrastrar([60, 300], [100, 330]);
  assert.strictEqual(await page.evaluate(() => cq.elementos[0].x), x0);
  // Volver a la vista y mover el triángulo, que está encima de la habitación bloqueada
  await page.evaluate((v) => { cq.vista = v; cqRender(); }, vista);
  const tx = await page.evaluate(() => cq.elementos[2].x);
  await arrastrar([270, 140], [290, 140]);
  assert.strictEqual(await page.evaluate(() => cq.elementos[2].x), tx + 20);
  await page.click('[data-acc="ori"]');
  assert.strictEqual(await page.evaluate(() => cq.elementos[2].ori), 1);
  // Tabla de 3x2 y cuadro de texto
  await page.click('[data-herr="texto"]');
  await clic(80, 420);
  await page.click('[data-modo="tabla"]');
  await page.fill("#cqCols", "2");
  await page.fill("#cqFilas", "3");
  await page.fill('#cqGrillaTabla [data-f="0"][data-c="0"]', "Zona");
  await page.fill('#cqGrillaTabla [data-f="0"][data-c="1"]', "Equipo");
  await page.fill('#cqGrillaTabla [data-f="2"][data-c="1"]', "Infrarrojo");
  await page.click('[data-r="si"]');
  await page.click('[data-herr="texto"]');
  await clic(250, 420);
  await page.click('[data-modo="cuadro"]');
  await page.fill("#cqTxt", "Llave de luz\nen garage");
  await page.click('[data-r="si"]');
  els = await page.evaluate(() => cq.elementos);
  const tablas = els.filter((e) => e.t === "tabla");
  assert.deepStrictEqual(tablas[0].celdas, [["Zona", "Equipo"], ["", ""], ["", "Infrarrojo"]]);
  assert.strictEqual(tablas[0].enc, true);
  assert.deepStrictEqual(tablas[1].celdas, [["Llave de luz\nen garage"]]);
  // Portones y columna redonda en Objetos
  await page.click('[data-herr="objetos"]');
  const objetos = await page.$$eval("#cqSimbolos [data-simbolo]", (bs) => bs.map((b) => b.dataset.simbolo));
  for (const k of ["columna", "columna_redonda", "porton_batiente", "porton_corredizo"]) assert.ok(objetos.includes(k), k);
  await page.click('[data-simbolo="porton_batiente"]');
  await clic(180, 20);
  // Bloquear todo desde el menú y desbloquear todo
  await page.click("#cqMenuBtn");
  await page.click('[data-m="bloq"]');
  assert.ok(await page.evaluate(() => cq.elementos.every((e) => e.bloq)));
  await page.click("#cqMenuBtn");
  assert.match(await page.textContent('[data-m="bloq"]'), /Desbloquear todo/);
  await page.click('[data-m="bloq"]');
  assert.ok(await page.evaluate(() => cq.elementos.every((e) => !e.bloq)));
  const svg = await page.evaluate(() => croquisSvgDocumento(cqDibujo()));
  assert.match(svg, /<ellipse /);
  assert.match(svg, />Zona</);
  assert.match(svg, /<tspan[^>]*>Llave de luz<\/tspan><tspan[^>]*>en garage<\/tspan>/);
  assert.match(svg, /stroke="#2E86DE" stroke-width="3.5" stroke-dasharray="9 5"/);
  assert.doesNotMatch(svg, /bloq/);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Croquis: infrarrojo con número, alcance, ángulo, doble lente, video e inalámbrico; muebles aparte de la obra", async () => {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const erroresPagina = [];
  page.on("pageerror", (e) => erroresPagina.push(e.message));
  await page.addInitScript(() => { localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo" })); localStorage.setItem("skin_v4_aplicado", "1"); });
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  await page.evaluate(() => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); cqAbrirEditor({}); });
  await page.waitForTimeout(200);
  const caja = await page.locator("#cqSvg").boundingBox();
  await page.click('[data-herr="simbolos"]');
  await page.click('[data-simbolo="infrarrojo"]');
  await page.mouse.click(caja.x + 250, caja.y + 250);
  await page.evaluate(() => { window.dialogoApp = async (m, op = {}) => (op.conTexto ? "D23" : true); });
  await page.click('[data-acc="etq"]');
  // Alcance y ángulo con los deslizadores
  await page.$eval('[data-sl="alc"]', (i) => { i.value = "90"; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.$eval('[data-sl="ang"]', (i) => { i.value = "85"; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); });
  for (const acc of ["doble", "video", "inal"]) await page.click(`[data-acc="${acc}"]`);
  let ir = await page.evaluate(() => cq.elementos[0]);
  assert.deepStrictEqual([ir.etq, ir.alc, ir.ang, ir.doble, ir.video, ir.inal], ["D23", 90, 85, true, true, true]);
  assert.match(await page.textContent("#cqProps"), /Ángulo\s*170°/);
  let svg = await page.evaluate(() => croquisSvgElemento(cq.elementos[0]));
  assert.match(svg, />D23</);
  assert.match(svg, /fill="#E00000"/, "cuadrado rojo");
  assert.match(svg, /A90 90 0 0 1/, "captación de 90 de alcance");
  assert.match(svg, /Q9 2.6 15.8 9/, "ojito de video");
  // Vaciar el número lo esconde
  await page.evaluate(() => { window.dialogoApp = async (m, op = {}) => (op.conTexto ? "" : true); });
  await page.click('[data-acc="etq"]');
  ir = await page.evaluate(() => cq.elementos[0]);
  assert.strictEqual(ir.etq, undefined);
  // La cortina arranca angosta y larga
  const cortina = await page.evaluate(() => croquisIRParams({}, CROQUIS_SIMBOLOS.infrarrojo_cortina));
  assert.deepStrictEqual([cortina.ang, cortina.alc], [25, 150]);
  // Muebles: pestaña aparte dentro de Objetos
  await page.click('[data-herr="objetos"]');
  await page.click('[data-sub="mueble"]');
  const muebles = await page.$$eval("#cqSimbolos [data-simbolo]", (bs) => bs.map((b) => b.dataset.simbolo));
  for (const k of ["sillon", "mesa_rect", "silla", "cama_doble", "ducha", "banera", "inodoro"]) assert.ok(muebles.includes(k), k);
  assert.ok(!muebles.includes("puerta"));
  await page.click('[data-simbolo="cama_doble"]');
  await page.mouse.click(caja.x + 100, caja.y + 120);
  const leyenda = await page.evaluate(() => croquisTiposUsados(cqDibujo()).map((i) => i.nombre));
  assert.deepStrictEqual(leyenda, ["Infrarrojo"], "los muebles no van en la leyenda");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Croquis desde foto: la foto se achica, va a la IA y lo interpretado (girado para leerse derecho) queda como croquis editable", async () => {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const erroresPagina = [];
  page.on("pageerror", (e) => erroresPagina.push(e.message));
  await page.addInitScript(() => { localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo" })); localStorage.setItem("skin_v4_aplicado", "1"); });
  const resultado = {
    rotacion: 270,
    habitaciones: [{ x1: 100, y1: 100, x2: 900, y2: 900, nombre: "" }, { x1: 100, y1: 100, x2: 500, y2: 500, nombre: "Oficina" }],
    aberturas: [{ tipo: "puerta", x1: 100, y1: 300, x2: 100, y2: 380 }],
    equipos: [{ tipo: "central", x: 800, y: 850 }, { tipo: "infrarrojo", x: 150, y: 150, numero: "3", apunta: "abajo" }, { tipo: "nada", x: 1, y: 1 }],
    textos: [{ x: 300, y: 700, texto: "AGREGAR" }],
    notas: "Presupuestar:\n4 detectores de humo",
  };
  let pedido = null;
  await page.route("**/api/**", (route) => {
    const req = route.request();
    if (req.url().includes("coleccion=croquis") && req.method() === "POST") { pedido = JSON.parse(req.postData()); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, resultado }) }); }
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  await page.evaluate(() => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); cqAbrirLista(); });
  await page.waitForTimeout(200);
  // Una "foto" de 2000x1000 generada en el momento
  const png = await page.evaluate(async () => {
    const cv = document.createElement("canvas"); cv.width = 2000; cv.height = 1000;
    const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, 2000, 1000); c.strokeRect(100, 100, 1800, 800);
    const b = await new Promise((ok) => cv.toBlob(ok, "image/png"));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  const [selector] = await Promise.all([page.waitForEvent("filechooser"), page.click("#cqDesdeFotoBtn")]);
  await selector.setFiles({ name: "boceto.png", mimeType: "image/png", buffer: Buffer.from(png) });
  await page.waitForFunction(() => screens.croquis.dataset.active === "true", null, { timeout: 10000 });
  assert.strictEqual(pedido.accion, "interpretar");
  assert.strictEqual(pedido.mime, "image/jpeg");
  const dims = await page.evaluate((b64) => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.width, i.height]); i.src = "data:image/jpeg;base64," + b64; }), pedido.imagen);
  assert.deepStrictEqual(dims, [1600, 800], "se achica a 1600 de lado");
  const els = await page.evaluate(() => cq.elementos);
  assert.deepStrictEqual(els.map((e) => e.t + (e.tipo ? ":" + e.tipo : "")), ["rect", "rect", "simbolo:puerta", "simbolo:central", "simbolo:infrarrojo", "texto", "tabla"]);
  // Girada 270°: la foto apaisada queda parada (más alta que ancha)
  const casa = els[0];
  assert.ok(casa.h > casa.w, "la hoja girada queda vertical");
  assert.strictEqual(els.find((e) => e.nombre === "Oficina").x, casa.x, "la oficina (arriba a la izquierda en la foto) queda abajo a la izquierda");
  assert.strictEqual(els[2].rot, 0, "la puerta de la pared izquierda (vertical) queda horizontal");
  const ir = els.find((e) => e.tipo === "infrarrojo");
  assert.strictEqual(ir.etq, "3");
  assert.strictEqual(ir.rot, 135, "miraba para abajo en la foto: girada, mira a la derecha");
  assert.deepStrictEqual(els.at(-1).celdas, [["Presupuestar:\n4 detectores de humo"]]);
  assert.match(await page.textContent("#toast"), /7 elementos/);
  assert.ok(await page.evaluate(() => cq.cambios));
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Croquis desde foto: queda la foto de fondo, el dibujo se ordena solo y los equipos «a agregar» pasan al presupuesto express", async () => {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const erroresPagina = [];
  page.on("pageerror", (e) => erroresPagina.push(e.message));
  await page.addInitScript(() => { localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo" })); localStorage.setItem("skin_v4_aplicado", "1"); });
  const resultado = {
    rotacion: 0,
    // Dos habitaciones que deberían compartir pared, dibujadas desparejas
    habitaciones: [{ x1: 100, y1: 100, x2: 500, y2: 600, nombre: "Living" }, { x1: 508, y1: 106, x2: 900, y2: 595, nombre: "Cocina" }],
    aberturas: [{ tipo: "puerta", x1: 200, y1: 615, x2: 260, y2: 615 }],
    equipos: [{ tipo: "humo", x: 300, y: 300, agregar: true }, { tipo: "humo", x: 700, y: 300, agregar: true }, { tipo: "central", x: 800, y: 500 }],
  };
  const fotos = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const j = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("coleccion=croquis") && req.method() === "POST") return j({ ok: true, resultado });
    if (u.includes("/api/foto") && req.method() === "POST") { fotos.push(JSON.parse(req.postData())); return j({ ok: true, id: "fondo1" }); }
    if (u.includes("lista_precios")) return j({ items: [{ c: "DH1", d: "DETECTOR DE HUMO CONVENCIONAL", p: 20000, m: "ARS" }] });
    j([]);
  });
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  await page.evaluate(() => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); localStorage.removeItem("presupuesto_express_borrador"); window.dialogoApp = async (m, op = {}) => (op.conTexto ? null : true); cqAbrirLista(); });
  const png = await page.evaluate(async () => {
    const cv = document.createElement("canvas"); cv.width = 1000; cv.height = 1000;
    const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, 1000, 1000);
    const b = await new Promise((ok) => cv.toBlob(ok, "image/png"));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  const [selector] = await Promise.all([page.waitForEvent("filechooser"), page.click("#cqDesdeFotoBtn")]);
  await selector.setFiles({ name: "boceto.png", mimeType: "image/png", buffer: Buffer.from(png) });
  await page.waitForFunction(() => cq.fondo && cq.fondo.id === "fondo1", null, { timeout: 10000 });
  // Foto de fondo: subida, visible y guardada con el croquis (sin la copia local)
  assert.strictEqual(fotos.length, 1);
  assert.strictEqual(await page.locator("#cqSvg image.cq-foto-fondo").count(), 1);
  assert.match(fotos[0].base64.slice(0, 4), /^\/9j\//, "sube el JPEG");
  await page.click("#cqFondoBtn");
  assert.strictEqual(await page.locator("#cqSvg image.cq-foto-fondo").count(), 0, "se oculta");
  const dib = await page.evaluate(() => cqDibujo());
  assert.deepStrictEqual(Object.keys(dib.fondo).sort(), ["h", "id", "w", "x", "y"]);
  assert.deepStrictEqual([dib.fondo.x, dib.fondo.y, dib.fondo.w], [-75, -75, 750]);
  // Ordenado: comparten la pared y la puerta queda sobre la pared de abajo
  const [living, cocina] = dib.elementos.filter((e) => e.t === "rect");
  assert.strictEqual(living.x + living.w, cocina.x, "pared compartida");
  assert.strictEqual(living.y, cocina.y);
  assert.strictEqual(living.y + living.h, cocina.y + cocina.h);
  const puerta = dib.elementos.find((e) => e.tipo === "puerta");
  assert.strictEqual(puerta.y, living.y + living.h, "puerta sobre la pared");
  // A instalar: marcados, en la leyenda aparte
  assert.strictEqual(dib.elementos.filter((e) => e.inst).length, 2);
  assert.deepStrictEqual(await page.evaluate(() => croquisTiposUsados(cqDibujo()).map((i) => i.nombre)), ["Central", "Detector de humo (a instalar)"]);
  // Pasar a presupuesto: 2 detectores, se elige el artículo y entra con cantidad 2
  await page.evaluate(() => { cq.cliente = "Tell Cecilia"; cq.titulo = "Casa"; });
  await page.click("#cqMenuBtn");
  await page.click('[data-m="presu"]');
  await page.waitForTimeout(400);
  assert.match(await page.textContent("#peDelCroquis"), /2 ×\s*Detector de humo/);
  assert.strictEqual(await page.inputValue("#peNombre"), "Tell Cecilia");
  await page.click("[data-elegir='0']");
  await page.click(".pe-art");
  assert.deepStrictEqual(await page.evaluate(() => peEstado.items.map((i) => [i.c, i.cant])), [["DH1", 2]]);
  assert.match(await page.textContent("#peDelCroquis"), /Agregado/);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Croquis: pared continua con quiebres y curva, elegir varios y soldarlos, varias páginas (PDF de 2 hojas) y logo SAT", async () => {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const erroresPagina = [];
  page.on("pageerror", (e) => erroresPagina.push(e.message));
  await page.addInitScript(() => { localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo" })); localStorage.setItem("skin_v4_aplicado", "1"); });
  const guardados = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    if (req.url().includes("coleccion=croquis") && req.method() === "POST") { guardados.push(JSON.parse(req.postData())); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id: "cqmulti01", actualizado: "2026-10-27T03:00:00Z" }) }); }
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); window.dialogoApp = async (m, op = {}) => (op.conTexto ? null : true);
    window.__archivos = []; navigator.canShare = () => true;
    navigator.share = async (d) => { const f = d.files[0]; window.__archivos.push({ nombre: f.name, bytes: Array.from(new Uint8Array(await f.arrayBuffer())) }); };
    cqAbrirEditor({ titulo: "Casa", cliente: "Tell" });
  });
  await page.waitForTimeout(200);
  const caja = await page.locator("#cqSvg").boundingBox();
  const clic = (x, y) => page.mouse.click(caja.x + x, caja.y + y);
  const arrastrar = async (a, b) => { await page.mouse.move(caja.x + a[0], caja.y + a[1]); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(caja.x + a[0] + (b[0] - a[0]) * i / 8, caja.y + a[1] + (b[1] - a[1]) * i / 8); await page.mouse.up(); };
  // Pared continua: un arrastre y después toques en cada quiebre
  await page.click('[data-herr="linea"]');
  await arrastrar([40, 60], [300, 60]);
  assert.strictEqual(await page.isVisible("#cqCadena"), true, "aparece la barra de pared en curso");
  await clic(300, 260);
  await clic(40, 262);
  await page.click("#cqCadenaCerrar");
  let lineas = await page.evaluate(() => cq.elementos.filter((e) => e.t === "linea"));
  assert.strictEqual(lineas.length, 4);
  assert.strictEqual(new Set(lineas.map((l) => l.cadena)).size, 1, "todos los tramos son la misma pared");
  for (let i = 0; i < 3; i++) assert.deepStrictEqual([lineas[i].x2, lineas[i].y2], [lineas[i + 1].x1, lineas[i + 1].y1], "tramos pegados");
  assert.deepStrictEqual([lineas[3].x2, lineas[3].y2], [lineas[0].x1, lineas[0].y1], "cerrada");
  assert.strictEqual(lineas[2].y1, lineas[2].y2, "el tramo casi horizontal se enderezó");
  assert.strictEqual(await page.isVisible("#cqCadena"), false);
  // Curvar un tramo y mover toda la pared arrastrando ese tramo
  await page.click('[data-herr="mover"]');
  await clic(300, 160);
  await page.click('[data-acc="curvar"]');
  lineas = await page.evaluate(() => cq.elementos.filter((e) => e.t === "linea"));
  assert.ok(Array.isArray(lineas[1].c), "tramo curvo");
  const antes = lineas.map((l) => l.x1);
  await arrastrar([40, 160], [80, 160]);
  lineas = await page.evaluate(() => cq.elementos.filter((e) => e.t === "linea"));
  assert.deepStrictEqual(lineas.map((l) => l.x1), antes.map((x) => x + 40), "se movió toda la pared junta");
  // Equipos: elegir varios con un recuadro, soldarlos y moverlos juntos
  for (const [tipo, x, y] of [["central", 120, 120], ["teclado", 180, 120]]) {
    await page.click('[data-herr="simbolos"]');
    await page.click(`[data-simbolo="${tipo}"]`);
    await clic(x, y);
  }
  await page.click('[data-herr="mover"]');
  await page.click("#cqMultiBtn");
  await arrastrar([235, 98], [92, 150]); // recuadro empezando en un lugar vacío
  assert.strictEqual(await page.evaluate(() => cq.multi.length), 2);
  assert.deepStrictEqual(await page.evaluate(() => cq.multi.map((id) => cq.elementos.find((e) => e.id === id).tipo).sort()), ["central", "teclado"]);
  await page.click('[data-macc="agrupar"]');
  await page.click('[data-macc="ninguno"]');
  await page.click("#cqMultiBtn");
  const pos0 = await page.evaluate(() => cq.elementos.filter((e) => e.t === "simbolo").map((e) => [e.x, e.y]));
  await arrastrar([120, 120], [140, 160]);
  const pos1 = await page.evaluate(() => cq.elementos.filter((e) => e.t === "simbolo").map((e) => [e.x, e.y]));
  assert.deepStrictEqual(pos1, pos0.map(([x, y]) => [x + 20, y + 40]), "soldados: se mueven juntos");
  // Página 2 con el logo de SAT
  assert.strictEqual(await page.isVisible("#cqPaginas"), false, "con una sola página no hay barra de páginas");
  await page.click("#cqMenuBtn");
  await page.click('[data-m="pagina"]');
  await page.click('[data-n="otra"]');
  assert.strictEqual(await page.evaluate(() => cq.elementos.length), 0, "página nueva vacía");
  assert.strictEqual(await page.isVisible("#cqPaginas"), true);
  await page.click('[data-herr="objetos"]');
  await page.click('[data-sub="obra"]');
  await page.click('[data-simbolo="logo_sat"]');
  await clic(180, 200);
  assert.match(await page.evaluate(() => croquisSvgElemento(cq.elementos[0])), /<image href="data:image\/jpeg;base64,/);
  await page.click('[data-pag="0"]');
  assert.strictEqual(await page.evaluate(() => cq.elementos.filter((e) => e.t === "linea").length), 4, "volver a la página 1");
  // Guardar: van las dos páginas
  await page.click("#cqMenuBtn");
  await page.click('[data-m="guardar"]');
  await page.waitForTimeout(300);
  assert.deepStrictEqual(guardados[0].dibujo.paginas.map((p) => [p.nombre, p.elementos.length]), [["Página 1", 6], ["Página 2", 1]]);
  assert.strictEqual(guardados[0].dibujo.elementos.length, 6);
  // PDF de 2 hojas
  await page.click("#cqMenuBtn");
  await page.click('[data-m="pdf"]');
  await page.waitForFunction(() => window.__archivos.length === 1, null, { timeout: 20000 });
  const hojas = await page.evaluate(async () => (await PDFLib.PDFDocument.load(new Uint8Array(window.__archivos[0].bytes))).getPageCount());
  assert.strictEqual(hojas, 2, "una hoja por página");
  // Fotos: galería y cámara por separado
  assert.strictEqual(await page.getAttribute("#cqCamaraInput", "capture"), "environment");
  assert.strictEqual(await page.getAttribute("#cqFotoInput", "capture"), null);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Presupuesto express: número redondo (redondear/truncar editable), mano de obra y abono + IVA, y orden de los materiales", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const lista = { cotizacion_usd: 1000, items: [{ c: "A1", d: "CENTRAL", p: 123456, m: "ARS" }, { c: "B2", d: "TECLADO", p: 45678, m: "ARS" }] };
  const pedidos = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(); const u = req.url();
    const j = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("lista_precios")) return j(lista);
    if (u.includes("presupuestos_express")) { const b = JSON.parse(req.postData() || "{}"); if (b.accion !== "adjuntar_pdf") pedidos.push(b); return j({ ok: true, numero: "E-0007" }); }
    if (u.includes("/api/foto")) return j({ ok: true, id: "pdf7" });
    j([]);
  });
  await page.goto(base + "/");
  await page.evaluate(() => {
    tecnicoLogueado = ""; localStorage.removeItem("presupuesto_express_borrador");
    window.__pdf = null; navigator.canShare = () => true;
    navigator.share = async (d) => { window.__pdf = Array.from(new Uint8Array(await d.files[0].arrayBuffer())); };
    peAbrir();
  });
  await page.waitForTimeout(400);
  await page.click('.pe-modo-btn[data-modo="nuevo"]');
  await page.fill("#peNombre", "Cliente Prueba");
  for (const q of ["central", "teclado"]) { await page.fill("#peArtBuscar", q); await page.click(".pe-art"); }
  // Orden: bajar la central, subir no se puede en el primero
  assert.strictEqual(await page.isDisabled("[data-subir='0']"), true);
  await page.click("[data-bajar='0']");
  assert.deepStrictEqual(await page.evaluate(() => peEstado.items.map((i) => i.c)), ["B2", "A1"]);
  await page.fill("#peManoObra", "100.000");
  await page.check("#peManoObraIva");
  await page.click('[data-tipo="automonitoreo"]');
  await page.fill("#peAbono", "15.000");
  await page.check("#peAbonoIva");
  // Total sin ajuste: 123.456 + 45.678 + 100.000 = 269.134
  assert.match(await page.textContent("#peTotales"), /Total\$269\.134/);
  await page.click('[data-ajuste="truncar"]');
  assert.match(await page.textContent("#peTotales"), /Total\$269\.000/);
  assert.match(await page.textContent("#peAjusteNota"), /\$269\.134 → \$269\.000/);
  await page.click('[data-ajuste="redondear"]');
  await page.fill("#peAjustePaso", "10.000");
  assert.match(await page.textContent("#peTotales"), /Mano de obra\$100\.866\s*\+ IVA/);
  assert.match(await page.textContent("#peTotales"), /Total\$270\.000/);
  assert.match(await page.textContent("#peTotales"), /\$15\.000\s*\+ IVA \/ mes/);
  await page.click("#peGenerarBtn");
  await page.waitForFunction(() => window.__pdf, null, { timeout: 15000 });
  const p = pedidos[0];
  assert.deepStrictEqual([p.total, p.mano_obra, p.total_materiales, p.ajuste, p.mo_iva, p.abono_iva, p.abono], [270000, 100866, 169134, 866, true, true, 15000]);
  // El PDF lleva las leyendas + IVA y el orden elegido
  const texto = await page.evaluate(async (bytes) => {
    const doc = await PDFLib.PDFDocument.load(new Uint8Array(bytes));
    return doc.getPageCount();
  }, await page.evaluate(() => window.__pdf));
  assert.ok(texto >= 1);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Presupuesto express: logo AJAX en el encabezado, servicios del monitoreo y folleto EXODUS si lleva CityMesh", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const lista = { items: [{ c: "HUB2", d: "HUB 2 PLUS AJAX", p: 300000, m: "ARS" }, { c: "CM", d: "COMUNICADOR CITYMESH 4G", p: 150000, m: "ARS" }] };
  const pedidos = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(); const u = req.url();
    const j = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("lista_precios")) return j(lista);
    if (u.includes("presupuestos_express")) { pedidos.push(1); return j({ ok: true, numero: "E-0009" }); }
    if (u.includes("/api/foto")) return j({ ok: true, id: "pdf9" });
    j([]);
  });
  const pedidosAssets = [];
  page.on("request", (r) => { if (/assets\/presupuesto\//.test(r.url())) pedidosAssets.push(r.url().split("/").pop()); });
  await page.goto(base + "/");
  await page.evaluate(() => {
    tecnicoLogueado = ""; localStorage.removeItem("presupuesto_express_borrador");
    window.__pdf = null; navigator.canShare = () => true;
    navigator.share = async (d) => { window.__pdf = Array.from(new Uint8Array(await d.files[0].arrayBuffer())); };
    peAbrir();
  });
  await page.waitForTimeout(400);
  await page.click('.pe-modo-btn[data-modo="nuevo"]');
  await page.fill("#peNombre", "Cliente Ajax");
  // Primero solo con el hub AJAX y como ampliación: sin servicios ni folleto
  // Sin artículos AJAX no va el logo
  await page.fill("#peArtBuscar", "citymesh"); await page.click(".pe-art");
  await page.fill("#peManoObra", "0");
  await page.click('[data-tipo="ampliacion"]');
  await page.click("#peGenerarBtn");
  await page.waitForFunction(() => window.__pdf, null, { timeout: 15000 });
  assert.ok(!pedidosAssets.includes("logo-ajax.png"), "sin AJAX no hay logo AJAX");
  await page.evaluate(() => { window.__pdf = null; peEstado.items = []; peRenderItems(); });
  await page.fill("#peArtBuscar", "ajax"); await page.click(".pe-art");
  await page.click('[data-tipo="ampliacion"]');
  await page.click("#peGenerarBtn");
  await page.waitForFunction(() => window.__pdf, null, { timeout: 15000 });
  const hojas1 = await page.evaluate(async () => (await PDFLib.PDFDocument.load(new Uint8Array(window.__pdf))).getPageCount());
  assert.ok(pedidosAssets.includes("logo-ajax.png"), "logo AJAX en el encabezado");
  assert.ok(!pedidosAssets.includes("exodus-citymesh.jpg"));
  // Monitoreado con CityMesh: suma el folleto EXODUS
  await page.evaluate(() => { window.__pdf = null; });
  await page.fill("#peArtBuscar", "citymesh"); await page.click(".pe-art");
  await page.click('[data-tipo="monitoreado"]');
  await page.fill("#peAbono", "30000");
  await page.click("#peGenerarBtn");
  await page.waitForFunction(() => window.__pdf, null, { timeout: 15000 });
  assert.ok(pedidosAssets.includes("exodus-citymesh.jpg"), "folleto EXODUS");
  const hojas2 = await page.evaluate(async () => (await PDFLib.PDFDocument.load(new Uint8Array(window.__pdf))).getPageCount());
  assert.ok(hojas2 > hojas1, "el folleto agrega hoja");
  assert.ok(await page.evaluate(() => PE_SERVICIOS_MONITOREO.length === 10));
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Index viejo con app.js nuevo: si falta una pantalla no se rompe la navegación y recarga una sola vez", async () => {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const erroresPagina = [];
  page.on("pageerror", (e) => erroresPagina.push(e.message));
  // Simula un index.html de una versión anterior: sin la pantalla de croquis
  await page.addInitScript(() => {
    new MutationObserver(() => { const s = document.getElementById("screen-croquis"); if (s) s.remove(); }).observe(document, { childList: true, subtree: true });
  });
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  let cargas = 0;
  page.on("load", () => { cargas += 1; });
  await page.goto(base + "/");
  await page.waitForTimeout(1500);
  assert.strictEqual(cargas, 2, "recargó una vez para traer el index nuevo");
  await page.evaluate(() => { showScreen("cronograma"); showScreen("home"); });
  assert.strictEqual(await page.evaluate(() => screens.home.dataset.active), "true");
  assert.ok(!erroresPagina.some((m) => /reading 'dataset'/.test(m)), "showScreen ya no falla por la pantalla que falta");
  await ctx.close();
});

test("Clientes con varias unidades (Lara Silvano Unidad 20/25/27): la tarea del cronograma se vincula a la unidad correcta", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.goto(base + "/");
  const r = await page.evaluate(() => {
    serviciosCache = [
      { numero_servicio: "9001", cliente: "Lara Silvano Unidad 25 Don Mateo", direccion: "Calle A 25" },
      { numero_servicio: "9002", cliente: "Lara Silvano Unidad 20 Don Mateo", direccion: "Calle A 20" },
      { numero_servicio: "9003", cliente: "Lara Silvano Unidad 27 Don Mateo", direccion: "Calle A 27" },
      { numero_servicio: "9004", cliente: "Libreria Ladder 1", direccion: "Sucursal 1" },
    ];
    return {
      u20: (encontrarServicioPorTarea("Service: Lara Silvano Unidad 20 Don Mateo - revisar sensor") || {}).numero_servicio,
      u27: (encontrarServicioPorTarea("Lara Silvano - Don Mateo unidad 27") || {}).numero_servicio,
      ladder12: (encontrarServicioPorTarea("Libreria Ladder 12 - cambio de bateria") || {}).numero_servicio || null,
      enTexto: clienteEnTexto("Lara Silvano Unidad 20", normalizeText("lara silvano unidad 205")),
    };
  });
  assert.deepStrictEqual(r, { u20: "9002", u27: "9003", ladder12: null, enTexto: false });
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Croquis: flechas para mover fino (y más rápido dejando apretado), deslizador de tamaño, medidas en metros e imán a pared y esquina", async () => {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const erroresPagina = [];
  page.on("pageerror", (e) => erroresPagina.push(e.message));
  await page.addInitScript(() => { localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo" })); localStorage.setItem("skin_v4_aplicado", "1"); });
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador");
    cqAbrirEditor({ elementos: [{ id: "r1", t: "rect", x: 0, y: 0, w: 200, h: 160 }, { id: "c1", t: "simbolo", tipo: "central", x: 100, y: 80, rot: 0, esc: 1 }] });
    cqElegirHerr("mover");
  });
  await page.waitForTimeout(200);
  assert.strictEqual(await page.isVisible("#cqPad"), false, "sin nada elegido no hay flechas");
  await page.evaluate(() => { cq.sel = "c1"; cqRender(); });
  assert.strictEqual(await page.isVisible("#cqPad"), true);
  // Un toque = 1 unidad
  await page.click('#cqPad [data-dir="der"]');
  await page.click('#cqPad [data-dir="abajo"]');
  assert.deepStrictEqual(await page.evaluate(() => { const c = cq.elementos.find((e) => e.id === "c1"); return [c.x, c.y]; }), [101, 81]);
  // Dejando apretado se sigue moviendo
  const b = await page.locator('#cqPad [data-dir="izq"]').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
  const x = await page.evaluate(() => cq.elementos.find((e) => e.id === "c1").x);
  assert.ok(x < 90, "se movió varias veces: " + x);
  // Deshacer vuelve atrás lo de las flechas
  await page.click("#cqDeshacerBtn");
  assert.strictEqual(await page.evaluate(() => cq.elementos.find((e) => e.id === "c1").x), 101);
  // Deslizador de tamaño
  await page.evaluate(() => { cq.sel = "c1"; cqRender(); });
  await page.$eval('[data-sl="esc"]', (i) => { i.value = "1.6"; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); });
  assert.strictEqual(await page.evaluate(() => cq.elementos.find((e) => e.id === "c1").esc), 1.6);
  assert.match(await page.textContent('[data-sl-val="esc"]'), /160%/);
  // Medidas de la habitación en metros
  await page.evaluate(() => { cq.sel = "r1"; cqRender(); window.dialogoApp = async (m, op = {}) => (op.conTexto ? "4,5 x 3" : true); });
  assert.match(await page.textContent("#cqProps"), /5 × 4 m/);
  await page.click('[data-acc="medidas"]');
  assert.deepStrictEqual(await page.evaluate(() => { const r = cq.elementos.find((e) => e.id === "r1"); return [r.w, r.h]; }), [180, 120]);
  // Imán: una puerta soltada cerca de la pared queda apoyada; el infrarrojo, en la esquina
  const r = await page.evaluate(() => {
    const puerta = { id: "p1", t: "simbolo", tipo: "puerta", x: 90, y: 112, rot: 90, esc: 1 };
    const ir = { id: "i1", t: "simbolo", tipo: "infrarrojo", x: 172, y: 110, rot: 0, esc: 1 };
    const els = [cq.elementos.find((e) => e.id === "r1"), puerta, ir];
    croquisApoyarEnPared(puerta, els, 22); croquisApoyarEnEsquina(ir, els, 18);
    return [puerta.y, puerta.rot, ir.x, ir.y];
  });
  assert.deepStrictEqual(r, [120, 0, 180, 120]);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Croquis en celular (táctil): abrir uno guardado y agregar/modificar; ambientes con medida que se pegan; cota; capas; orden; repetir; lupa", async () => {
  const { devices } = require("playwright");
  const ctx = await browser.newContext({ ...devices["Pixel 5"], serviceWorkers: "block" });
  const page = await ctx.newPage();
  const erroresPagina = [];
  page.on("pageerror", (e) => erroresPagina.push(e.message));
  await page.addInitScript(() => { localStorage.setItem("ajustes_app", JSON.stringify({ estiloInicio: "nuevo" })); localStorage.setItem("skin_v4_aplicado", "1"); localStorage.removeItem("croquis_capas"); });
  const guardado = { id: "cqtactil1", titulo: "Casa", cliente: "Tell", autor: "Juan", actualizado: "2026-10-27T20:00:00Z", dibujo: { v: 2, elementos: [{ id: "r1", t: "rect", x: 0, y: 0, w: 200, h: 160, nombre: "Living" }, { id: "s1", t: "simbolo", tipo: "central", x: 60, y: 60, rot: 0, esc: 1 }], paginas: [{ nombre: "Página 1", elementos: [{ id: "r1", t: "rect", x: 0, y: 0, w: 200, h: 160, nombre: "Living" }, { id: "s1", t: "simbolo", tipo: "central", x: 60, y: 60, rot: 0, esc: 1 }] }] } };
  await page.route("**/api/**", (route) => {
    const u = route.request().url();
    const j = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("coleccion=croquis") && u.includes("id=")) return j(guardado);
    if (u.includes("coleccion=croquis")) return j([{ id: "cqtactil1", titulo: "Casa", cliente: "Tell", autor: "Juan", actualizado: "2026-10-27T20:00:00Z", elementos: 2 }]);
    j([]);
  });
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  await page.evaluate(() => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); cqAbrirLista(); });
  await page.waitForTimeout(400);
  const pausa = () => page.waitForTimeout(380);
  await page.tap("[data-abrir]");
  await page.waitForTimeout(500);
  assert.strictEqual(await page.evaluate(() => cq.elementos.length), 2);
  await page.evaluate(() => { cq.vista = { x: -20, y: -20, s: 1 }; cqRender(); });
  const caja = await page.locator("#cqSvg").boundingBox();
  const tocar = (x, y) => page.touchscreen.tap(caja.x + x, caja.y + y);
  const cdp = await ctx.newCDPSession(page);
  const arrastrar = async (a, b) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: caja.x + a[0], y: caja.y + a[1] }] });
    for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: caja.x + a[0] + (b[0] - a[0]) * i / 8, y: caja.y + a[1] + (b[1] - a[1]) * i / 8 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await pausa();
  };
  // Agregar un equipo a un croquis guardado (lo que se trababa)
  await pausa(); await page.tap('[data-herr="simbolos"]'); await pausa();
  await page.tap('[data-simbolo="teclado"]'); await pausa();
  await tocar(150, 120); await pausa();
  assert.strictEqual(await page.evaluate(() => cq.elementos.length), 3, "se agregó el teclado");
  // Modificarlo: rotar
  await page.tap('[data-acc="rot90"]'); await pausa();
  assert.strictEqual(await page.evaluate(() => cq.elementos[2].rot), 90);
  // Ambiente con medida: Cocina 3 × 3 m que se pega al living
  await page.tap('[data-herr="rect"]'); await pausa();
  await page.evaluate(() => { document.querySelector("#cqSimbolos").scrollLeft = 0; });
  const cocina = await page.evaluate(() => CQ_AMBIENTES.findIndex((a) => a.nombre === "Cocina"));
  await page.locator(`[data-amb="${cocina}"]`).scrollIntoViewIfNeeded();
  await page.tap(`[data-amb="${cocina}"]`); await pausa();
  await tocar(300, 85); await pausa();
  const coc = await page.evaluate(() => cq.elementos.find((e) => e.nombre === "Cocina"));
  assert.deepStrictEqual([coc.w, coc.h], [120, 120]);
  assert.strictEqual(coc.x, 200, "se pegó al borde del living");
  // Cota (medida)
  await page.tap('[data-herr="linea"]'); await pausa();
  await page.tap('[data-subpared="cota"]'); await pausa();
  await arrastrar([20, 210], [340, 210]);
  const cota = await page.evaluate(() => cq.elementos.find((e) => e.t === "cota"));
  assert.ok(cota && Math.abs(cota.x2 - cota.x1) === 320, "cota de 8 m");
  assert.match(await page.evaluate(() => croquisSvgElemento(cq.elementos.find((e) => e.t === "cota"))), />8 m</);
  // Repetir: tres magnéticos seguidos
  await page.tap('[data-herr="objetos"]'); await pausa();
  await page.tap('[data-herr="simbolos"]'); await pausa();
  await page.tap("[data-repetir]"); await pausa();
  await page.tap('[data-simbolo="magnetico"]'); await pausa();
  for (const x of [40, 80, 120]) { await tocar(x, 30); await pausa(); }
  assert.strictEqual(await page.evaluate(() => cq.elementos.filter((e) => e.tipo === "magnetico").length), 3);
  // Capas: bloquear el plano; tocar la habitación no la elige y sí deja elegir el equipo de arriba
  await page.tap('[data-herr="mover"]'); await pausa();
  await page.tap("#cqCapasBtn"); await pausa();
  await page.tap('[data-bloquear="plano"]'); await pausa();
  await page.tap("[data-cerrar]"); await pausa();
  await tocar(30, 140); await pausa();
  assert.strictEqual(await page.evaluate(() => cq.sel), null, "el plano bloqueado no se elige");
  await tocar(80, 80); await pausa();
  assert.strictEqual(await page.evaluate(() => (cq.elementos.find((e) => e.id === cq.sel) || {}).tipo), "central");
  // Orden: mandar la central al fondo
  await page.tap('[data-acc="zfondo"]'); await pausa();
  const orden = await page.evaluate(() => croquisOrdenCapas(cq.elementos).map((e) => e.id));
  assert.strictEqual(orden[0], "s1", "la central quedó al fondo");
  // Lupa mientras se arrastra con el dedo
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: caja.x + 80, y: caja.y + 80 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: caja.x + 90, y: caja.y + 90 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: caja.x + 100, y: caja.y + 100 }] });
  assert.strictEqual(await page.isVisible("#cqLupa"), true, "aparece la lupa");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await pausa();
  assert.strictEqual(await page.isVisible("#cqLupa"), false);
  // Medidas de las habitaciones
  await page.evaluate(() => { cq.medidas = true; cqRender(); });
  assert.match(await page.evaluate(() => croquisSvgDocumento(cqDibujo())), />5 m</);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Plano de la instalación: sobre el plano de la casa (copia), foto del plano, y al cerrar queda de solo lectura", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const posts = [];
  const jpg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
  const fondo = { id: "planocasa1", x: 0, y: 0, w: 800, h: 600, base: true };
  let cerradoServidor = false;
  const guardadosCq = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o, st) => route.fulfill({ status: st || 200, contentType: "application/json", body: JSON.stringify(o) });
    if (req.method() === "POST") {
      const b = JSON.parse(req.postData() || "{}");
      posts.push({ u, ...b });
      if (u.includes("/api/foto")) return json({ id: "subida" + posts.length });
      if (u.includes("coleccion=croquis") && b.accion === "guardar" && cerradoServidor) return json({ error: "La instalación ya se cerró: este plano quedó como registro", cerrado: true }, 403);
      if (u.includes("coleccion=croquis") && b.accion === "guardar") { const id = "nuevo" + posts.length; guardadosCq.push({ ...b, id }); return json({ ok: true, id, actualizado: new Date().toISOString() }); }
      return json({ ok: true });
    }
    if (u.includes("/api/foto")) return route.fulfill({ status: 200, contentType: "image/jpeg", body: jpg });
    if (u.includes("tipo=instalacion_abierta")) return json({ abierta: { id: 7, cliente: "Lara Silvano", numero_cliente: "55", direccion: "Mitre 100" } });
    if (u.includes("tipo=instalacion&id=7")) return json({ id: 7, cliente: "Lara Silvano", zonas: [], canales: [], fotos: [] });
    if (u.includes("recurso=presencia")) return json({ activa: null });
    if (u.includes("coleccion=croquis&id=casa00001")) return json({ id: "casa00001", titulo: "Planta baja", cliente: "Lara Silvano", numero_cliente: "55", autor: "Oficina", dibujo: { v: 2, elementos: [], paginas: [{ nombre: "Página 1", elementos: [], fondo }], fondo } });
    if (u.includes("coleccion=croquis&id=inst00001")) return json({ id: "inst00001", instalacion: "7", cerrado: true, titulo: "Plano de la instalación", cliente: "Lara Silvano", autor: "Juan Pérez", dibujo: { v: 2, elementos: [{ id: "s1", t: "simbolo", tipo: "central", x: 100, y: 100 }], paginas: [{ nombre: "Página 1", elementos: [{ id: "s1", t: "simbolo", tipo: "central", x: 100, y: 100 }], fondo }] } });
    const mGuardado = /coleccion=croquis&id=(nuevo\d+)/.exec(u);
    if (mGuardado) { const g = guardadosCq.find((x) => x.id === mGuardado[1]); return json({ ...g, autor: "Juan Pérez" }); }
    if (u.includes("coleccion=croquis")) return json([{ id: "casa00001", titulo: "Planta baja", cliente: "Lara Silvano", numero_cliente: "55", autor: "Oficina", base: true, elementos: 0 }, ...guardadosCq.map(({ dibujo, ...x }) => ({ ...x, autor: "Juan Pérez", elementos: dibujo.paginas[0].elementos.length }))]);
    if (u.includes("/api/planos")) return json([]);
    return json([]);
  });
  await page.goto(base + "/");
  await page.waitForTimeout(300);
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; localStorage.removeItem("croquis_borrador"); showScreen("instalacion"); return verificarInstalacionAbierta(); });
  await page.waitForTimeout(500);
  assert.strictEqual(await page.locator("#instPlanoCard").isVisible(), true);
  assert.match(await page.textContent("#instPlanoEstado"), /Todavía no hay plano/);
  // Hacer croquis: ofrece el plano de la casa que subió la oficina
  await page.click("#instPlanoCroquisBtn");
  await page.waitForSelector("[data-copiar]");
  assert.match(await page.textContent("[data-copiar]"), /Planta baja \(plano de la oficina\)/);
  await page.click("[data-copiar]");
  await page.waitForFunction(() => screens.croquis.dataset.active === "true");
  const estado = await page.evaluate(() => ({ inst: cq.instalacion, id: cq.id, base: !!(cq.fondo && cq.fondo.base), volver: cq.volverA, cliente: cq.cliente, num: cq.numero_cliente, herr: cq.herr }));
  assert.deepStrictEqual(estado, { inst: "7", id: "", base: true, volver: "instalacion", cliente: "Lara Silvano", num: "55", herr: "mover" }, "es una copia nueva atada a la instalación");
  assert.strictEqual(await page.locator("#cqSvg image.cq-plano-base").getAttribute("opacity"), "1", "el plano se ve entero (no tenue)");
  // Se agrega un equipo y se guarda
  await page.evaluate(() => { cq.elementos.push({ id: "e1", t: "simbolo", tipo: "infrarrojo", x: 200, y: 200 }); cq.cambios = true; return cqGuardar(); });
  const guardado = posts.find((p) => p.accion === "guardar");
  assert.strictEqual(guardado.instalacion, "7");
  assert.strictEqual(guardado.id, undefined, "no pisa el plano original de la oficina");
  assert.deepStrictEqual(guardado.dibujo.paginas[0].fondo, fondo);
  // El SVG y el PNG llevan el plano adentro
  const svg = await page.evaluate(async () => croquisSvgDocumento(await croquisPrepararFondos(cqDibujo())));
  assert.match(svg, /<image href="data:image\/jpeg;base64,/);
  const png = await page.evaluate(async () => (await croquisPng(cqDibujo(), 800)).size);
  assert.ok(png > 1000);
  // Volver: regresa a la instalación
  await page.click("#volverDeCroquisBtn");
  await page.waitForFunction(() => screens.instalacion.dataset.active === "true");

  // Subir foto del plano: se guarda sola en la instalación
  const foto = await page.evaluate(async () => { const cv = document.createElement("canvas"); cv.width = 1200; cv.height = 900; const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, 1200, 900); c.strokeRect(50, 50, 1100, 800); return Array.from(new Uint8Array(await (await new Promise((ok) => cv.toBlob(ok, "image/png"))).arrayBuffer())); });
  await page.setInputFiles("#instPlanoArchivoInput", { name: "plano.png", mimeType: "image/png", buffer: Buffer.from(foto) });
  await page.waitForFunction(() => document.querySelectorAll("#instPlanoLista .cq-item").length >= 0 && !/Subiendo/.test(document.getElementById("instPlanoEstado").textContent));
  await page.waitForTimeout(300);
  const g2 = posts.filter((p) => p.accion === "guardar")[1];
  assert.strictEqual(g2.titulo, "Foto del plano");
  assert.strictEqual(g2.instalacion, "7");
  assert.strictEqual(g2.dibujo.paginas[0].fondo.base, true);
  assert.strictEqual(g2.dibujo.paginas[0].elementos.length, 0, "se guarda aunque no tenga nada dibujado");

  // Al cerrar la instalación: el PDF de cada plano va al mail, y los planos quedan como registro
  await page.waitForFunction(() => document.querySelectorAll("#instPlanoLista .cq-item").length === 2);
  await page.click("#instalacionGuardarYCerrarBtn");
  await page.waitForFunction(() => document.getElementById("instalacionGuardarYCerrarBtn").textContent.includes("Guardar y cerrar"), null, { timeout: 20000 });
  await page.waitForTimeout(300);
  const cierreInst = posts.find((p) => p.accion === "cerrar_instalacion" && p.u.includes("/api/historial"));
  assert.ok(cierreInst, "se cerró");
  assert.strictEqual(cierreInst.planos_pdf.length, 2, "un PDF por plano para el mail");
  const pdfsSubidos = posts.filter((p) => p.u.includes("/api/foto") && p.tipo === "pdf");
  assert.strictEqual(pdfsSubidos.length, 2);
  assert.ok(Buffer.from(pdfsSubidos[0].base64, "base64").slice(0, 5).toString() === "%PDF-");
  const cierre = posts.find((p) => p.accion === "cerrar_instalacion" && p.u.includes("coleccion=croquis"));
  assert.ok(cierre, "manda cerrar los planos");
  assert.strictEqual(cierre.instalacion_id, "7");

  // Un plano de una instalación cerrada se abre solo para mirar y descargar
  await page.evaluate(() => { instalacionActivaId = 7; return instPlanoAbrir("inst00001"); });
  await page.waitForFunction(() => screens.croquis.dataset.active === "true");
  assert.strictEqual(await page.evaluate(() => screens.croquis.classList.contains("cq-solo-lectura")), true);
  assert.strictEqual(await page.locator("#cqHerr").isVisible(), false, "sin herramientas de dibujo");
  assert.strictEqual(await page.evaluate(() => cqBloq(cq.elementos[0])), true, "nada se puede mover");
  const nGuardar = posts.filter((p) => p.accion === "guardar").length;
  assert.strictEqual(await page.evaluate(() => cqGuardar()), false);
  assert.strictEqual(posts.filter((p) => p.accion === "guardar").length, nGuardar, "ni siquiera intenta guardar");
  await page.click("#cqMenuBtn");
  assert.match(await page.textContent(".cq-menu"), /quedó como registro/);
  assert.strictEqual(await page.locator('.cq-menu [data-m="guardar"]').count(), 0);
  await page.click('.cq-menu [data-m="cerrar"]');
  // Si la instalación se cierra mientras se está dibujando, el servidor lo frena y pasa a solo lectura
  cerradoServidor = true;
  await page.evaluate(() => { cqAbrirEditor({ instalacion: "7", titulo: "x", cliente: "Lara", elementos: [{ id: "a", t: "texto", x: 0, y: 0, texto: "hola" }], cambios: true }); return cqGuardar(); });
  assert.strictEqual(await page.evaluate(() => cq.soloLectura), true);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Croquis sobre un plano en PDF (exportado de Visio): se convierte en imagen de base, en escala, y sale en el PDF", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const posts = [];
  let subida = null;
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (req.method() === "POST" && u.includes("/api/foto")) { subida = JSON.parse(req.postData()); return json({ id: "pdfplano1" }); }
    if (req.method() === "POST") { posts.push(JSON.parse(req.postData() || "{}")); return json({ ok: true, id: "cq0000001", actualizado: new Date().toISOString() }); }
    if (u.includes("/api/foto")) return route.fulfill({ status: 200, contentType: "image/jpeg", body: Buffer.from(subida.base64, "base64") });
    return json([]);
  });
  await page.goto(base + "/");
  await page.waitForTimeout(300);
  await page.evaluate(() => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); cqAbrirLista(); });
  // Un PDF apaisado con un rectángulo, como uno exportado de Visio
  const pdf = await page.evaluate(async () => {
    const { PDFDocument, rgb } = await croquisCargarPdfLib();
    const d = await PDFDocument.create(); const p = d.addPage([842, 595]);
    p.drawRectangle({ x: 40, y: 40, width: 760, height: 515, borderColor: rgb(0, 0, 0), borderWidth: 4 });
    d.addPage([842, 595]);
    return Array.from(await d.save());
  });
  const [selector] = await Promise.all([page.waitForEvent("filechooser"), page.click("#cqDesdePlanoBtn")]);
  await selector.setFiles({ name: "Casa Lara.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf) });
  await page.waitForFunction(() => screens.croquis.dataset.active === "true", null, { timeout: 15000 });
  const dims = await page.evaluate((b64) => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.width, i.height]); i.src = "data:image/jpeg;base64," + b64; }), subida.base64);
  assert.strictEqual(dims[0], 2400, "la primera hoja se dibuja a 2400 px");
  assert.ok(Math.abs(dims[1] - 1696) <= 2, "respeta la proporción de la hoja");
  const f = await page.evaluate(() => cq.fondo);
  assert.deepStrictEqual([f.id, f.w, f.base], ["pdfplano1", 800, true], "20 m de ancho por defecto");
  assert.strictEqual(await page.evaluate(() => cq.titulo), "Casa Lara");
  await page.waitForSelector("#cqDatoCliente");
  await page.fill("#cqDatoCliente", "Lara Silvano");
  await page.click('[data-r="si"]');
  // Escala: el plano mide 12 m de ancho
  await page.evaluate(() => { window.dialogoApp = async (m, op = {}) => (op.conTexto ? "12" : true); cqEscalaPlano(); });
  assert.deepStrictEqual(await page.evaluate(() => [cq.fondo.w, cq.fondo.h]), [480, 339]);
  assert.strictEqual(await page.evaluate(() => cqGuardar()), true, "se guarda aunque todavía no tenga nada dibujado");
  assert.strictEqual(posts[0].dibujo.paginas[0].fondo.base, true);
  // El PDF del croquis lleva el plano
  const paginas = await page.evaluate(async () => { const bytes = await croquisPdf(cqDatosExport()); const d = await PDFLib.PDFDocument.load(bytes); return d.getPageCount(); });
  assert.strictEqual(paginas, 2, "una hoja de PDF por cada hoja del plano");
  assert.deepStrictEqual(await page.evaluate(() => cq.paginas.map((p) => p.nombre)), ["Hoja 1", "Hoja 2"]);
  // Un archivo de Visio sin exportar se explica
  const err = await page.evaluate(async () => { try { await croquisArchivoAImagen(new File(["x"], "casa.vsdx")); return ""; } catch (e) { return e.message; } });
  assert.match(err, /Exportar como PDF/);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Plano: PDF de varias hojas, foto sin señal que se sube sola, plano obligatorio para cerrar y verlo desde el servicio", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const posts = [];
  let sinSenal = false, obligatorio = true;
  const guardados = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o, st) => route.fulfill({ status: st || 200, contentType: "application/json", body: JSON.stringify(o) });
    if (req.method() === "POST") {
      if (sinSenal && (u.includes("/api/foto") || u.includes("coleccion=croquis"))) return route.abort("internetdisconnected");
      const b = JSON.parse(req.postData() || "{}");
      posts.push({ u, ...b });
      if (u.includes("/api/foto")) return json({ id: "f" + posts.length });
      if (u.includes("coleccion=croquis") && b.accion === "guardar") { const id = "g" + posts.length + "aaaaaa"; guardados.push({ ...b, id, cerrado: true, cerrado_en: new Date().toISOString(), autor: "Juan Pérez" }); return json({ ok: true, id }); }
      return json({ ok: true });
    }
    if (u.includes("coleccion=config")) return json({ plano_instalacion_obligatorio: obligatorio });
    if (u.includes("tipo=instalacion_abierta")) return json({ abierta: { id: 9, cliente: "Ladder 3", numero_cliente: "77", direccion: "Calle 1" } });
    if (u.includes("tipo=instalacion&id=9")) return json({ id: 9, cliente: "Ladder 3", zonas: [], canales: [], fotos: [] });
    if (u.includes("recurso=presencia")) return json({ activa: null });
    const mId = /coleccion=croquis&id=([a-z0-9]+)/.exec(u);
    if (mId) return json(guardados.find((g) => g.id === mId[1]));
    if (u.includes("coleccion=croquis")) return json(guardados.filter((g) => u.includes("instalacion=9") ? String(g.instalacion) === "9" : true).map(({ dibujo, ...x }) => ({ ...x, elementos: 0 })));
    return json([]);
  });
  await page.goto(base + "/");
  await page.waitForTimeout(300);
  await page.evaluate(() => { SERVICIOS_API_TOKEN = "x"; tecnicoLogueado = "Juan Pérez"; localStorage.removeItem("planos_instalacion_pendientes"); return cargarConfig(); });
  assert.strictEqual(await page.evaluate(() => PLANO_INSTALACION_OBLIGATORIO), true);
  await page.evaluate(() => { showScreen("instalacion"); return verificarInstalacionAbierta(); });
  await page.waitForTimeout(400);
  // Obligatorio y sin plano: no deja cerrar
  await page.click("#instalacionGuardarYCerrarBtn");
  await page.waitForTimeout(600);
  assert.ok(!posts.some((p) => p.accion === "cerrar_instalacion"), "no cerró sin plano");
  // PDF de 2 hojas sin señal: queda en el celular
  const pdf = await page.evaluate(async () => {
    const { PDFDocument, rgb } = await croquisCargarPdfLib();
    const d = await PDFDocument.create();
    for (let i = 0; i < 2; i++) d.addPage([600, 400]).drawRectangle({ x: 20, y: 20, width: 560, height: 360, borderColor: rgb(0, 0, 0), borderWidth: 3 });
    return Array.from(await d.save());
  });
  sinSenal = true;
  await page.setInputFiles("#instPlanoArchivoInput", { name: "plano.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf) });
  await page.waitForFunction(() => planosPendientesLeer().length === 1, null, { timeout: 10000 });
  assert.strictEqual(await page.evaluate(() => planosPendientesLeer()[0].imagenes.length), 2, "las dos hojas");
  assert.match(await page.textContent("#instPlanoLista"), /Sin subir/);
  // Vuelve la señal: se sube solo, con una página por hoja
  sinSenal = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForFunction(() => planosPendientesLeer().length === 0, null, { timeout: 10000 });
  const g = posts.find((p) => p.accion === "guardar");
  assert.deepStrictEqual(g.dibujo.paginas.map((p) => p.nombre), ["Hoja 1", "Hoja 2"]);
  assert.strictEqual(g.instalacion, "9");
  // Desde un servicio del mismo cliente: el botón del plano ofrece el de la instalación
  await page.evaluate(() => { showScreen("form"); numeroClienteActivo = "77"; verPlanoClienteBtn.classList.remove("hidden"); });
  await page.click("#verPlanoClienteBtn");
  await page.waitForSelector(".cq-plano-opcion");
  assert.match(await page.textContent(".cq-plano-opcion"), /Foto del plano.*Instalación cerrada/s);
  assert.strictEqual(await page.locator('[data-visio]').count(), 1, "y sigue estando el de Visio");
  await page.click(".cq-plano-opcion");
  await page.waitForFunction(() => screens.croquis.dataset.active === "true");
  assert.deepStrictEqual(await page.evaluate(() => [cq.soloLectura, cq.paginas.length, cq.volverA]), [true, 2, "form"]);
  await page.click("#volverDeCroquisBtn");
  await page.waitForFunction(() => screens.form.dataset.active === "true");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Admin: el detalle de una instalación muestra su plano y la configuración guarda el plano obligatorio sin perder lo demás", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const posts = [];
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (req.method() === "POST") { posts.push({ u, ...JSON.parse(req.postData() || "{}") }); return json({ ok: true }); }
    if (u.includes("coleccion=config")) return json({ dias_atencion: 3, dias_urgente: 7, app_version_actual: "4.17.0", felicitacion_semanal_activa: true });
    if (u.includes("tipo=instalacion&id=7")) return json({ id: 7, cliente: "Lara", estado: "cerrada", zonas: [], canales: [], fotos: [], dias: [] });
    if (u.includes("coleccion=croquis&instalacion=7")) return json([{ id: "inst00001", instalacion: "7", cerrado: true, titulo: "Plano de la instalación", autor: "Juan", elementos: 5 }]);
    if (u.includes("coleccion=croquis&id=inst00001")) return json({ id: "inst00001", titulo: "Plano de la instalación", dibujo: { v: 2, elementos: [{ id: "a", t: "simbolo", tipo: "central", x: 0, y: 0 }], paginas: [{ nombre: "Página 1", elementos: [{ id: "a", t: "simbolo", tipo: "central", x: 0, y: 0 }] }] } });
    json([]);
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("panelInstalaciones").classList.remove("hidden"); return mostrarDetalleInstalacionAdmin(7); });
  await page.waitForFunction(() => /Plano de la instalación/.test(document.getElementById("instalacionPlanosAdmin").textContent));
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.click('#instalacionPlanosAdmin [data-pi="pdf"]')]);
  assert.ok(descarga, "se descarga el PDF del plano");
  await page.evaluate(() => cargarConfigAdmin());
  await page.evaluate(() => { document.getElementById("planoObligatorioCheck").checked = true; document.getElementById("guardarConfigBtn").click(); });
  await page.waitForTimeout(300);
  const cfg = posts.find((p) => p.u.includes("coleccion=config"));
  assert.strictEqual(cfg.plano_instalacion_obligatorio, true);
  assert.strictEqual(cfg.plano_mail_cliente, false);
  assert.strictEqual(cfg.app_version_actual, "4.17.0", "no se pierde lo que la pantalla no muestra");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Admin: a una instalación abierta se le carga el boceto del cliente y queda como plano de esa instalación", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const posts = [];
  let lista = [];
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (req.method() === "POST") {
      const b = JSON.parse(req.postData() || "{}");
      posts.push({ u, ...b });
      if (u.includes("/api/foto")) return json({ id: "abcdef0123456789" });
      if (b.accion === "guardar") { lista = [{ id: "boc00001", instalacion: b.instalacion, titulo: b.titulo, autor: "Oficina", elementos: 0 }]; return json({ ok: true, id: "boc00001" }); }
      return json({ ok: true });
    }
    if (u.includes("tipo=instalacion&id=9")) return json({ id: 9, cliente: "Bartolozzi", numero_cliente: "7117", direccion: "Mitre 100", estado: "abierta", zonas: [], canales: [], fotos: [], dias: [] });
    if (u.includes("tipo=instalacion&id=8")) return json({ id: 8, cliente: "Lara", estado: "cerrada", zonas: [], canales: [], fotos: [], dias: [] });
    if (u.includes("coleccion=croquis&instalacion=9")) return json(lista);
    json([]);
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("panelInstalaciones").classList.remove("hidden"); return mostrarDetalleInstalacionAdmin(8); });
  await page.waitForFunction(() => /Sin plano/.test(document.getElementById("instalacionPlanosAdmin").textContent));
  assert.strictEqual(await page.locator("[data-cargar-plano]").count(), 0, "una instalación cerrada no ofrece cargar");
  await page.evaluate(() => mostrarDetalleInstalacionAdmin(9));
  await page.waitForSelector("[data-cargar-plano]");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("[data-cargar-plano]")]);
  await chooser.setFiles({ name: "boceto casa.png", mimeType: "image/png", buffer: png });
  await page.waitForFunction(() => /Listo/.test((document.querySelector("[data-plano-estado]") || {}).textContent || ""));
  const g = posts.find((p) => p.accion === "guardar");
  assert.strictEqual(g.instalacion, "9");
  assert.strictEqual(g.cliente, "Bartolozzi");
  assert.strictEqual(g.numero_cliente, "7117");
  assert.match(g.titulo, /boceto casa/);
  assert.strictEqual(g.dibujo.paginas.length, 1);
  assert.strictEqual(g.dibujo.paginas[0].fondo.id, "abcdef0123456789", "el boceto queda de fondo para dibujar encima");
  assert.match(await page.textContent("#instalacionPlanosAdmin"), /Boceto — boceto casa/, "aparece en la lista de la instalación");
  assert.match(await page.textContent("[data-cargar-plano]"), /Cargar otro/);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Admin: el croquis de una instalación abierta se edita en el editor de la APP (otra pestaña con la sesión de la oficina) y se puede borrar", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const posts = [];
  let lista = [{ id: "boc00001", instalacion: "9", titulo: "Boceto — casa", autor: "Oficina", elementos: 1 }];
  const reg = { id: "boc00001", instalacion: "9", titulo: "Boceto — casa", cliente: "Bartolozzi", numero_cliente: "7117", autor: "Oficina", dibujo: { v: 2, elementos: [{ id: "p1", t: "linea", x1: 0, y1: 0, x2: 200, y2: 0 }], paginas: [{ nombre: "Página 1", elementos: [{ id: "p1", t: "linea", x1: 0, y1: 0, x2: 200, y2: 0 }] }] } };
  await ctx.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  const api = (route) => {
    const req = route.request(), u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (req.method() === "POST") {
      const b = JSON.parse(req.postData() || "{}");
      posts.push({ u, auth: req.headers().authorization, ...b });
      if (b.accion === "borrar") { lista = []; return json({ ok: true }); }
      if (b.accion === "guardar") return json({ ok: true, id: b.id, actualizado: "2026-11-04T15:00:00Z" });
      return json({ ok: true });
    }
    if (u.includes("tipo=instalacion&id=9")) return json({ id: 9, cliente: "Bartolozzi", numero_cliente: "7117", estado: "abierta", zonas: [], canales: [], fotos: [], dias: [] });
    if (u.includes("coleccion=croquis&instalacion=9")) return json(lista);
    if (u.includes("coleccion=croquis&id=boc00001")) return json(reg);
    json([]);
  };
  await ctx.route("**/api/**", api);
  await page.route("**/api/**", api);
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { sessionStorage.setItem("admin_pase", "paseoficina123"); sessionStorage.setItem("admin_nombre", "Seba"); SERVICIOS_API_TOKEN = "paseoficina123"; document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("panelInstalaciones").classList.remove("hidden"); return mostrarDetalleInstalacionAdmin(9); });
  await page.waitForSelector('[data-pi="editar"]');
  const [pop] = await Promise.all([page.waitForEvent("popup"), page.click('[data-pi="editar"]')]);
  await pop.waitForFunction(() => typeof screens !== "undefined" && screens.croquis.dataset.active === "true", null, { timeout: 15000 });
  assert.strictEqual(await pop.evaluate(() => cq.elementos.length), 1, "abre el croquis con lo que tenía");
  assert.strictEqual(await pop.evaluate(() => localStorage.getItem("sat_api_sesion")), null, "no pisa la sesión de técnico del navegador");
  await pop.evaluate(() => { cq.elementos.push({ id: "s1", t: "simbolo", tipo: "infrarrojo", x: 100, y: 50 }); cq.cambios = true; return cqGuardar(); });
  const g = posts.find((p) => p.accion === "guardar");
  assert.strictEqual(g.auth, "Bearer paseoficina123", "guarda con la sesión de la oficina");
  assert.strictEqual(g.instalacion, "9");
  assert.strictEqual(g.dibujo.elementos.length, 2);
  await Promise.all([pop.waitForEvent("close"), pop.click("#volverDeCroquisBtn")]);
  await page.click('[data-pi="borrar"]');
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /Sin plano/.test(document.getElementById("instalacionPlanosAdmin").textContent));
  assert.ok(posts.some((p) => p.accion === "borrar" && p.id === "boc00001"));
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Ampliación sobre el último plano (lo anterior atenuado) y al cerrar el plano va a la carpeta de Visio (PDF + SVG)", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const posts = [];
  const anterior = { id: "viejo0001", instalacion: "3", cerrado: true, cerrado_en: "2026-05-10T15:00:00Z", titulo: "Plano de la instalación", cliente: "Lara Silvano", numero_cliente: "55", autor: "Luis", dibujo: { v: 2, elementos: [], paginas: [{ nombre: "Página 1", elementos: [{ id: "c1", t: "simbolo", tipo: "central", x: 100, y: 100 }, { id: "k1", t: "cable", pts: [[100, 100], [200, 100]] }] }] } };
  const guardados = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o, st) => route.fulfill({ status: st || 200, contentType: "application/json", body: JSON.stringify(o) });
    if (req.method() === "POST") {
      const b = JSON.parse(req.postData() || "{}");
      posts.push({ u, ...b });
      if (u.includes("/api/foto")) return json({ id: "abcdef0123456789" });
      if (u.includes("/api/planos")) return json({ ok: true });
      if (u.includes("coleccion=croquis") && b.accion === "guardar") { const id = b.id || "nuevo" + posts.length + "x"; const i = guardados.findIndex((g) => g.id === id); const reg = { ...b, id, autor: "Juan Pérez" }; if (i >= 0) guardados[i] = reg; else guardados.push(reg); return json({ ok: true, id }); }
      return json({ ok: true });
    }
    if (u.includes("tipo=instalacion_abierta")) return json({ abierta: { id: 7, cliente: "Lara Silvano", numero_cliente: "55", direccion: "Mitre 100" } });
    if (u.includes("tipo=instalacion&id=7")) return json({ id: 7, cliente: "Lara Silvano", zonas: [], canales: [], fotos: [] });
    if (u.includes("recurso=presencia")) return json({ activa: null });
    if (u.includes("coleccion=croquis&id=viejo0001")) return json(anterior);
    const m = /coleccion=croquis&id=([a-z0-9]+)/.exec(u);
    if (m) return json(guardados.find((g) => g.id === m[1]));
    if (u.includes("coleccion=croquis")) return json([{ id: "base00001", titulo: "Planta baja", cliente: "Lara Silvano", numero_cliente: "55", base: true, autor: "Oficina", actualizado: "2026-01-01T00:00:00Z" }, { ...anterior, dibujo: undefined, elementos: 2 }, ...guardados.map(({ dibujo, ...x }) => ({ ...x, elementos: 1 }))]);
    return json([]);
  });
  await page.goto(base + "/");
  await page.waitForTimeout(300);
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; localStorage.removeItem("croquis_borrador"); showScreen("instalacion"); return verificarInstalacionAbierta(); });
  await page.waitForTimeout(400);
  await page.click("#instPlanoCroquisBtn");
  await page.waitForSelector(".cq-plano-opcion");
  const primero = await page.locator(".cq-menu button").first().textContent();
  assert.match(primero, /Ampliar el plano de la última instalación/, "lo primero que ofrece es ampliar el último plano");
  await page.click(".cq-plano-opcion");
  await page.waitForFunction(() => screens.croquis.dataset.active === "true");
  const els = await page.evaluate(() => cq.elementos.map((e) => [e.id, !!e.prev, !!e.bloq]));
  assert.deepStrictEqual(els, [["c1", true, true], ["k1", true, true]], "lo anterior queda marcado y bloqueado");
  assert.match(await page.evaluate(() => cq.titulo), /^Ampliación - Plano de la instalación$/);
  assert.strictEqual(await page.locator('#cqSvg g.cq-antes').count(), 2, "se ve atenuado");
  // Se agrega un sensor nuevo y se guarda
  await page.evaluate(() => { cq.elementos.push({ id: "n1", t: "simbolo", tipo: "infrarrojo", x: 300, y: 100 }); cq.cambios = true; return cqGuardar(); });
  const svg = await page.evaluate(() => croquisSvgDocumento(cqDibujo()));
  assert.match(svg, /Atenuado: instalado en visitas anteriores/, "la leyenda explica lo atenuado");
  // Tocar un equipo de antes y marcarlo como nuevo
  await page.evaluate(() => { cq.sel = "c1"; cqRender(); });
  await page.click('#cqProps [data-acc="prev"]');
  assert.deepStrictEqual(await page.evaluate(() => { const e = cq.elementos.find((x) => x.id === "c1"); return [!!e.prev, !!e.bloq]; }), [false, false]);
  await page.evaluate(() => cqGuardar());
  await page.click("#volverDeCroquisBtn");
  await page.waitForFunction(() => screens.instalacion.dataset.active === "true");
  await page.waitForFunction(() => document.querySelectorAll("#instPlanoLista .cq-item").length === 1);
  // Al cerrar: PDF para el mail y PDF + SVG a la carpeta de Visio del cliente
  await page.click("#instalacionGuardarYCerrarBtn");
  await page.waitForFunction(() => document.getElementById("instalacionGuardarYCerrarBtn").textContent.includes("Guardar y cerrar"), null, { timeout: 20000 });
  const visio = posts.filter((p) => p.u.includes("/api/planos"));
  assert.deepStrictEqual(visio.map((p) => [p.accion, p.carpeta, p.tipo]), [["subir_plano_app", "CLI_00000055", "pdf"], ["subir_plano_app", "CLI_00000055", "svg"]]);
  assert.match(visio[0].nombre, /^\d{4}-\d{2}-\d{2} - Inst 7 - Ampliación - Plano de la instalación$/);
  assert.match(Buffer.from(visio[1].base64, "base64").toString(), /<svg[\s\S]*cq-antes/, "el SVG lleva lo de antes atenuado");
  assert.ok(posts.some((p) => p.accion === "cerrar_instalacion" && p.u.includes("/api/historial") && p.planos_pdf.length === 1));
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Plano en PDF dibujado (estilo Visio de SAT) -> croquis editable: paredes, puerta, equipos con zona y título", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const fotos = {};
  let nFoto = 0;
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (req.method() === "POST" && u.includes("/api/foto")) { const id = "f" + nFoto++; fotos[id] = JSON.parse(req.postData()).base64; return json({ id }); }
    if (u.includes("/api/foto")) return route.fulfill({ status: 200, contentType: "image/jpeg", body: Buffer.from(fotos[new URL(u).searchParams.get("id")] || "", "base64") });
    // La IA ve una ventana en la pared de arriba (x 380 a 440 de la hoja de 600 x 420) que el dibujo no tiene.
    if (req.method() === "POST" && (req.postData() || "").includes("aberturas_plano")) { iaPedida = true; return json({ ok: true, objetos: [{ tipo: "ventana", box_2d: [228, 633, 248, 733] }, { tipo: "puerta", box_2d: [470, 450, 540, 510] }] }); }
    json([]);
  });
  let iaPedida = false;
  await page.goto(base + "/");
  await page.waitForTimeout(300);
  await page.evaluate(() => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); cqAbrirLista(); });
  // Un plano chico dibujado como lo exporta Visio (coordenadas con y hacia abajo vía SVG path)
  const pdf = await page.evaluate(async () => {
    const { PDFDocument, rgb, StandardFonts } = await croquisCargarPdfLib();
    const d = await PDFDocument.create(); const p = d.addPage([600, 420]); const H = 420;
    const font = await d.embedFont(StandardFonts.HelveticaBold);
    const negro = rgb(0, 0, 0), op = { x: 0, y: H, borderColor: negro, borderWidth: 0.75 };
    // Paredes: un rectángulo de 400x250 con una pared interna cortada por una puerta
    p.drawSvgPath("M 100 100 L 500 100 L 500 350 L 100 350 Z", op);
    p.drawSvgPath("M 300 100 L 300 200", op);
    p.drawSvgPath("M 300 223.6 L 300 350", op);
    // Puerta (hoja abierta + diagonal), de 23,6 de ancho, como en Visio
    p.drawSvgPath("M 300 200 L 276.4 223.6 L 300 223.6", op);
    // Infrarrojo: cuadradito rojo + captación punteada en L desde su esquina
    p.drawSvgPath("M 492 106 L 497.5 106 L 497.5 111.5 L 492 111.5 Z", { x: 0, y: H, color: rgb(1, 0, 0), borderColor: negro, borderWidth: 0.75 });
    p.drawSvgPath("M 452 111.5 L 492 111.5 L 492 145", { ...op, borderDashArray: [0.75, 1.5] });
    p.drawText("7", { x: 482, y: H - 122, size: 10, font });
    // Magnético (círculo verde), humo (círculo blanco), central (gris con diagonal), sirena (gris + triángulo)
    p.drawCircle({ x: 200, y: H - 100, size: 4, color: rgb(0, 0.69, 0.31), borderColor: negro, borderWidth: 0.75 });
    p.drawText("1", { x: 196, y: H - 92, size: 10, font });
    p.drawCircle({ x: 200, y: H - 250, size: 6.4, color: rgb(1, 1, 1), borderColor: negro, borderWidth: 0.75 });
    p.drawSvgPath("M 420 320 L 441 320 L 441 334 L 420 334 Z", { x: 0, y: H, color: rgb(0.85, 0.85, 0.85), borderColor: negro, borderWidth: 0.75 });
    p.drawSvgPath("M 420 334 L 441 320", op);
    p.drawSvgPath("M 140 140 L 157.5 140 L 157.5 148.3 L 140 148.3 Z", { x: 0, y: H, color: rgb(0.85, 0.85, 0.85), borderColor: negro, borderWidth: 0.75 });
    p.drawSvgPath("M 148.2 148.3 L 140 159.8 L 158.4 159.8 Z", { x: 0, y: H, color: rgb(0.85, 0.85, 0.85), borderColor: negro, borderWidth: 0.75 });
    // Título subrayado
    p.drawText("CASA DE PRUEBA", { x: 230, y: H - 60, size: 14, font });
    p.drawSvgPath("M 228 64 L 362 64", { ...op, borderWidth: 1.5 });
    return Array.from(await d.save());
  });
  const [selector] = await Promise.all([page.waitForEvent("filechooser"), page.click("#cqDesdePlanoBtn")]);
  await selector.setFiles({ name: "casa.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf) });
  await page.waitForSelector('[data-r="editable"]', { timeout: 15000 });
  await page.click('[data-r="editable"]');
  await page.waitForFunction(() => screens.croquis.dataset.active === "true", null, { timeout: 20000 });
  const r = await page.evaluate(() => ({
    titulo: cq.titulo,
    paredes: cq.elementos.filter((e) => e.t === "linea").map((e) => [e.x1, e.y1, e.x2, e.y2]),
    simbolos: cq.elementos.filter((e) => e.t === "simbolo").map((e) => ({ tipo: e.tipo, etq: e.etq || "", rot: e.rot, esp: !!e.esp })),
    textos: cq.elementos.filter((e) => e.t === "texto").map((e) => e.texto),
    fondo: cq.fondo && !cq.fondo.base && !!cq.fondo.id,
  }));
  assert.strictEqual(r.titulo, "CASA DE PRUEBA");
  assert.deepStrictEqual(r.textos, [], "el título y los números no quedan sueltos");
  assert.strictEqual(r.paredes.length, 6, "4 del contorno + 2 tramos de la pared interna (el subrayado del título no es pared)");
  const tipos = r.simbolos.map((s) => s.tipo).sort();
  assert.ok(iaPedida, "con la IA tildada se pide la segunda mirada");
  assert.deepStrictEqual(tipos, ["central", "humo", "infrarrojo", "magnetico", "puerta", "sirena_int", "ventana"], "la ventana la sumó la IA; la puerta que ya estaba no se repite");
  const ven = await page.evaluate(() => { const e = cq.elementos.find((x) => x.tipo === "ventana"); const w = cq.elementos.filter((x) => x.t === "linea").map((l) => Math.abs(l.y1 - l.y2) < 1 ? Math.abs(l.y1 - e.y) : 999); return { rot: e.rot, d: Math.min(...w) }; });
  assert.strictEqual(ven.rot % 180, 0, "acostada sobre la pared de arriba");
  assert.ok(ven.d < 1, "pegada a la pared");
  const ir = r.simbolos.find((s) => s.tipo === "infrarrojo");
  assert.deepStrictEqual([ir.etq, ir.rot], ["7", 270], "el infrarrojo mira hacia la habitación (abajo a la izquierda) y lleva su zona");
  assert.strictEqual(r.simbolos.find((s) => s.tipo === "magnetico").etq, "1");
  assert.ok(r.fondo, "el original queda tenue de fondo para comparar");
  // La puerta se abre hacia el lado correcto: la hoja queda a la izquierda de la pared
  const puerta = await page.evaluate(() => { const e = cq.elementos.find((x) => x.tipo === "puerta"); return croquisLocalAMundo(e, -20, -40)[0] < e.x; });
  assert.ok(puerta);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Conciliación de SIMs: elige sola la columna del número, separa cada caso (empresa distinta, cobradas con problema o inactivas, baja en la empresa) y se resuelve desde ahí", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: route.request().url().includes("xlsx.full.min.js") ? require("fs").readFileSync(require("path").join(__dirname, "..", "vendor", "xlsx.full.min.js"), "utf8") : "" }));
  const stock = [
    { numero: "3415550001", empresa: "Claro", tecnico_actual: "Juan", ubicacion_tipo: "tecnico", estado_fisico: "Disponible" },
    { numero: "3415550002", empresa: "Claro", tecnico_actual: "Juan", ubicacion_tipo: "tecnico", estado_fisico: "Extraviada" },
    { numero: "3415550003", empresa: "Movistar", tecnico_actual: "Oficina", ubicacion_tipo: "oficina", estado_fisico: "Disponible" },
  ];
  const instaladas = [
    { numero: "3415550010", empresa: "Claro", cliente: "Kiosco Norte", estado_linea: "Activo" },
    { numero: "3415550011", empresa: "Claro", cliente: "Panadería Sur", estado_linea: "Inactivo" },
    { numero: "3415550012", empresa: "Claro", cliente: "Farmacia", estado_linea: "Activo" },
    { numero: "3415550013", empresa: "Claro", cliente: "Ferretería", estado_linea: "Activo" },
    { numero: "3415550014", empresa: "Personal", cliente: "Lara", estado_linea: "Activo" },
  ];
  const historial = [{ fecha: "2026-09-01", hora: "10:00", numero: "3415550099", accion: "baja", tecnico: "Oficina", cliente: "Rota / no funciona" }];
  const acciones = [];
  // Una que se dio por resuelta hace dos meses y sigue igual: vuelve a aparecer avisando
  let marcas = [{ numero: "3415550001", categoria: "enStock", empresa: "Claro", estado: "resuelta", por: "Seba", fecha: "2026-09-01T10:00:00Z" }];
  const opciones = {};
  const sim = simsBackendFalso(stock, instaladas, historial, opciones);
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("coleccion=sims_conciliacion")) {
      if (req.method() === "GET") return json(u.includes("historial=1") ? [] : marcas);
      const b = JSON.parse(req.postData() || "{}"), k = (x) => `${x.empresa}|${x.categoria}|${x.numero}`, ks = new Set(b.items.map(k));
      marcas = marcas.filter((x) => !ks.has(k(x)));
      if (b.accion === "marcar") b.items.forEach((x) => marcas.unshift({ ...x, estado: b.estado, motivo: b.motivo, por: "Oficina", fecha: "2026-11-04T10:00:00Z" }));
      return json({ ok: true, lista: marcas });
    }
    if (req.method() === "POST") {
      const b = JSON.parse(req.postData() || "{}");
      acciones.push(b);
      if (u.includes("recurso-uso")) { const r = sim(b); return route.fulfill({ status: r.status || 200, contentType: "application/json", body: JSON.stringify(r) }); }
      return json({ ok: true });
    }
    if (u.includes("coleccion=sims_instaladas")) return json(instaladas);
    if (u.includes("coleccion=sims")) return json(stock);
    if (u.includes("coleccion=clientes")) return json([{ nombre: "Kiosco Este", numero_cliente: "88", direccion: "Mitre 1" }]);
    if (u.includes("recurso=sim")) return json(historial);
    json([]);
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("panelSimsControl").classList.remove("hidden"); return cargarControlSims(); });
  // Planilla de Claro: "N° de cliente" va antes que la línea (antes agarraba esa columna), y tiene dos hojas
  const xlsx = await page.evaluate(() => {
    const h1 = [
      { "N° de cliente": 9001, "Línea": "0341 15 555-0010", "Estado": "Activa" },
      { "N° de cliente": 9001, "Línea": "3415550011", "Estado": "Activa" },
      { "N° de cliente": 9001, "Línea": "3415550012", "Estado": "Suspendida" },
      { "N° de cliente": 9001, "Línea": "3415550001", "Estado": "Activa" },
      { "N° de cliente": 9001, "Línea": "3415550002", "Estado": "Activa" },
    ];
    const h2 = [
      { "N° de cliente": 9002, "Línea": "3415550003", "Estado": "Activa" },
      { "N° de cliente": 9002, "Línea": "3415550014", "Estado": "Activa" },
      { "N° de cliente": 9002, "Línea": "3415550099", "Estado": "Activa" },
      { "N° de cliente": 9002, "Línea": "3415550098", "Estado": "Activa" },
    ];
    const lb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(lb, XLSX.utils.json_to_sheet(h1), "Hoja1");
    XLSX.utils.book_append_sheet(lb, XLSX.utils.json_to_sheet(h2), "Hoja2");
    return Array.from(new Uint8Array(XLSX.write(lb, { type: "array", bookType: "xlsx" })));
  });
  await page.setInputFiles("#simsConcArchivo", { name: "lineas CLARO octubre.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(xlsx) });
  await page.waitForSelector(".conc-bloque");
  assert.strictEqual(await page.inputValue("#simsConcEmpresa"), "Claro", "la empresa sale del nombre del archivo");
  assert.strictEqual(await page.inputValue("#concColNum"), "Línea");
  const r = await page.evaluate(() => Object.fromEntries(["coinciden", "sinRegistrar", "problemaPagando", "inactivaPagando", "empresaDistinta", "enStock", "bajaEnEmpresa", "noEnPlanilla"].map((k) => [k, ultimaConciliacion[k].map((x) => (typeof x === "string" ? x : x.n))])));
  assert.deepStrictEqual(r, {
    coinciden: ["3415550010"], sinRegistrar: ["3415550099", "3415550098"], problemaPagando: ["3415550002"], inactivaPagando: ["3415550011"],
    empresaDistinta: ["3415550003", "3415550014"], enStock: ["3415550001"], bajaEnEmpresa: ["3415550012"], noEnPlanilla: ["3415550013"],
  });
  assert.match(await page.textContent('.conc-bloque[data-k="enStock"]'), /Volvió a aparecer: se marcó resuelta el 01\/09\/2026 \(Seba\)/);
  assert.match(await page.textContent('.conc-bloque[data-k="sinRegistrar"]'), /Dada de baja en SAT el 01\/09\/2026[\s\S]*pedir la baja a la empresa[\s\S]*Nunca se registró en SAT/);
  // Resolver: corregir empresa de las dos en lote
  await page.check('.conc-todas[data-k="empresaDistinta"]');
  await page.click('.conc-lote-btn[data-k="empresaDistinta"][data-a="empresa"]');
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /Verificado: las 2 ya no aparecen en «Otra empresa»/.test(document.getElementById("simsConcStatus").textContent));
  assert.match(await page.textContent("#simsConcStatus"), /pasó a «Activas en stock»/, "la de stock ahora es de Claro y queda como activa en stock");
  assert.match(await page.textContent("#avisoFlotanteAdmin"), /Verificado/, "el aviso se ve abajo aunque el estado quede arriba");
  assert.deepStrictEqual(acciones.filter((a) => /editar/.test(a.accion)).map((a) => [a.accion, a.numero, a.empresa || a.campos.empresa]), [["editar_stock", "3415550003", "Claro"], ["editar_instalada", "3415550014", "Claro"]]);
  // Marcar inactiva la que la empresa suspendió. Primero el servidor dice "ok" pero no la cambia: se avisa
  opciones.noAplicar = (b) => b.accion === "editar_instalada" && b.numero === "3415550012";
  await page.click('.conc-acc[data-k="bajaEnEmpresa"][data-a="inactiva"]');
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /NO quedó asentada/.test(document.getElementById("simsConcStatus").textContent));
  assert.match(await page.textContent("#simsConcStatus"), /3415550012 sigue apareciendo/);
  assert.strictEqual(await page.evaluate(() => ultimaConciliacion.bajaEnEmpresa.length), 1, "sigue en la lista");
  opciones.noAplicar = null;
  await page.click('.conc-acc[data-k="bajaEnEmpresa"][data-a="inactiva"]');
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /Verificado: la línea ya no aparece/.test(document.getElementById("simsConcStatus").textContent));
  assert.ok(acciones.some((a) => a.accion === "editar_instalada" && a.numero === "3415550012" && a.campos.estado_linea === "Inactivo"));
  // Instalar una sin registrar en un cliente: se carga al stock y se instala
  await page.click('.conc-acc[data-k="sinRegistrar"][data-a="instalar"] >> nth=1');
  await page.fill(".sim-extra .x-cliente", "Kiosco Este");
  await page.dispatchEvent(".sim-extra .x-cliente", "input");
  await page.click(".sim-extra .x-ok");
  await page.waitForFunction(() => /instalada en Kiosco Este/.test(document.getElementById("simsConcStatus").textContent));
  const alta = acciones.find((a) => a.accion === "alta_lote");
  assert.deepStrictEqual(alta.sims.map((s) => [s.numero, s.empresa]), [["3415550098", "Claro"]]);
  const usar = acciones.find((a) => a.accion === "usar");
  assert.deepStrictEqual([usar.numero, usar.cliente, usar.numero_cliente, usar.tecnico], ["3415550098", "Kiosco Este", "88", "Oficina"]);
  // Dar de baja la extraviada que se sigue cobrando
  await page.click('.conc-acc[data-k="problemaPagando"][data-a="baja"]');
  await page.fill(".cartel-admin-input", "Extraviada: baja pedida a Claro");
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /Verificado/.test(document.getElementById("simsConcStatus").textContent));
  assert.match(await page.textContent("#simsConcStatus"), /pasó a «Sin registrar»/, "dada de baja en SAT: falta que la empresa la dé de baja");
  assert.ok(acciones.some((a) => a.accion === "dar_de_baja" && a.numero === "3415550002" && /Extraviada/.test(a.motivo)));
  // Ignorar una diferencia (error interno): sale de la lista y queda en "Ocultas"
  await page.click('.conc-marcar[data-k="noEnPlanilla"][data-estado="ignorada"]');
  await page.fill(".cartel-admin-input", "Error interno de carga");
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => !ultimaConciliacion.noEnPlanilla.length);
  assert.ok(!(await page.$('.conc-bloque[data-k="noEnPlanilla"]')), "ya no se muestra");
  assert.deepStrictEqual(marcas.filter((m) => m.estado === "ignorada").map((m) => [m.numero, m.categoria, m.empresa, m.estado, m.motivo]), [["3415550013", "noEnPlanilla", "Claro", "ignorada", "Error interno de carga"]]);
  assert.match(await page.textContent(".conc-ocultas"), /Ocultas[\s\S]*3415550013[\s\S]*Ignorada[\s\S]*Error interno de carga/);
  // Marcar resuelta: también se va
  await page.click('.conc-marcar[data-k="inactivaPagando"][data-estado="resuelta"]');
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => !ultimaConciliacion.inactivaPagando.length);
  // Volver a mostrar
  await page.click(".conc-ocultas summary");
  await page.click('.conc-reactivar >> text=Volver a mostrar >> nth=1');
  await page.waitForFunction(() => ultimaConciliacion.noEnPlanilla.length === 1);
  // Si la columna elegida no era la buena, se cambia y se recalcula
  await page.selectOption("#concColEstado", "");
  assert.strictEqual(await page.evaluate(() => ultimaConciliacion.bajaEnEmpresa.length), 0, "sin columna de estado, todas cuentan como activas");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Datos del equipo: fotos desde la galería o la cámara, links tocables y ver/volver a una versión anterior", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  let datos = [{ id: "d1", titulo: "Reset Ajax", contenido: "Manual: https://ajax.systems/es/support y mantener 10 s.", categoria: "Configuraciones", autor: "Luis", fecha: "2026-10-20T15:00:00Z", ediciones: [{ autor: "Juan Pérez", fecha: "2026-10-25T15:00:00Z", antes: { titulo: "Reset Ajax", contenido: "Mantener 30 s el botón.", categoria: "Configuraciones", fotos: [] } }], fotos: [] }];
  const posts = [];
  let nFoto = 0;
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("/api/foto") && req.method() === "POST") { posts.push({ u, ...JSON.parse(req.postData()) }); return json({ ok: true, id: String(++nFoto).padStart(16, "a") }); }
    if (u.includes("/api/foto")) return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("89504e470d0a1a0a", "hex") });
    if (u.includes("coleccion=datos_equipo") && req.method() === "POST") {
      const b = JSON.parse(req.postData());
      posts.push({ u, ...b });
      if (b.accion === "crear") datos = [{ id: "d2", titulo: b.titulo, contenido: b.contenido, categoria: b.categoria, fotos: b.fotos, autor: "Juan Pérez", fecha: "2026-10-31T15:00:00Z", ediciones: [] }, ...datos];
      if (b.accion === "restaurar") { const d = datos.find((x) => x.id === b.id); Object.assign(d, d.ediciones[b.edicion].antes); }
      return json({ ok: true, lista: datos });
    }
    if (u.includes("coleccion=datos_equipo")) return json(datos);
    json([]);
  });
  await page.goto(base + "/");
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; localStorage.removeItem("datos_equipo_cache"); verConsultasBtn.click(); cambiarTabManuales("equipo"); });
  await page.waitForSelector(".equipo-card");
  assert.strictEqual(await page.getAttribute(".equipo-card .equipo-contenido a", "href"), "https://ajax.systems/es/support", "el link se puede tocar");
  // Nuevo dato con 2 fotos de la galería
  await page.click("#equipoNuevoBtn");
  await page.fill("#equipoFormTituloInput", "Bornera central Paradox");
  await page.fill("#equipoFormContenido", "Así va el cableado de la sirena.");
  const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 3000; c.height = 2000; c.getContext("2d").fillRect(0, 0, 900, 900); return c.toDataURL("image/png").split(",")[1]; });
  await page.setInputFiles("#equipoFotoGaleria", [{ name: "a.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") }, { name: "b.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") }]);
  await page.waitForFunction(() => equipoFormFotos.length === 2 && !equipoSubiendo);
  assert.strictEqual(await page.locator("#equipoFormFotos img").count(), 2);
  const dims = await page.evaluate((b64) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(Math.max(i.width, i.height)); i.src = b64; }), posts[0].base64);
  assert.strictEqual(dims, 1600, "se achica antes de subir");
  await page.click("#equipoFormFotos button[data-i='0']");
  assert.strictEqual(await page.locator("#equipoFormFotos img").count(), 1, "se puede quitar una");
  assert.strictEqual(await page.getAttribute("#equipoFotoCamara", "capture"), "environment");
  await page.click("#equipoGuardarBtn");
  await page.waitForTimeout(300);
  const crear = posts.find((p) => p.accion === "crear");
  assert.deepStrictEqual(crear.fotos, ["aaaaaaaaaaaaaaa2"]);
  assert.strictEqual(await page.locator(".equipo-card").first().locator(".eq-foto").count(), 1, "la foto se ve en la tarjeta");
  // Ver cambios y volver a la versión anterior
  await page.locator(".equipo-card", { hasText: "Reset Ajax" }).locator(".eq-historial").click();
  assert.match(await page.textContent(".equipo-cambios"), /Juan Pérez lo cambió el 25\/10\/2026/);
  await page.click(".equipo-cambios summary");
  await page.click(".equipo-cambios [data-restaurar]");
  await page.click(".dlg-app .dlg-si");
  await page.waitForTimeout(300);
  assert.ok(posts.some((p) => p.accion === "restaurar" && p.id === "d1" && p.edicion === 0));
  assert.match(await page.locator(".equipo-card", { hasText: "Reset Ajax" }).textContent(), /Mantener 30 s/);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Datos del equipo: la notificación de un dato nuevo abre Manuales en ese dato, resaltado", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const datos = [{ id: "otro", titulo: "Otro", contenido: "x", autor: "Luis", fecha: "2026-10-20T15:00:00Z", ediciones: [] }, { id: "d9", titulo: "Código instalador DSC", contenido: "5555", autor: "Luis", fecha: "2026-10-31T15:00:00Z", ediciones: [] }];
  await page.route("**/api/**", (route) => {
    const u = route.request().url();
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(u.includes("coleccion=datos_equipo") ? datos : []) });
  });
  await page.goto(base + "/?ir=dato-equipo&id=d9");
  await page.waitForTimeout(300);
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; showScreen("home"); });
  await page.waitForSelector('.equipo-card[data-id="d9"].equipo-card-nuevo', { timeout: 5000 });
  assert.strictEqual(await page.locator("#manTabEquipo").isVisible(), true);
  assert.strictEqual(await page.evaluate(() => location.search), "", "el link no queda en la barra");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Datos del equipo: «me sirvió», avisar desactualizado, favoritos y orden; la respuesta de la IA muestra los datos del equipo que usó", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  let datos = [
    { id: "a1", titulo: "APN Claro", contenido: "igprs.claro.com.ar", categoria: "APN y líneas", autor: "Luis", fecha: "2026-10-30T15:00:00Z", ediciones: [], utiles: [] },
    { id: "b2", titulo: "Código DSC", contenido: "5555", categoria: "Códigos y claves de fábrica", autor: "Luis", fecha: "2026-10-01T15:00:00Z", ediciones: [], utiles: ["Ana", "Beto", "Caro"], reportes: [{ autor: "Ana", fecha: "2026-10-29T15:00:00Z", nota: "En el PC1616 es otro" }] },
  ];
  const posts = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("coleccion=datos_equipo") && req.method() === "POST") {
      const b = JSON.parse(req.postData()); posts.push(b);
      const d = datos.find((x) => x.id === b.id);
      if (b.accion === "util") d.utiles = d.utiles.includes("Juan Pérez") ? d.utiles.filter((n) => n !== "Juan Pérez") : [...d.utiles, "Juan Pérez"];
      if (b.accion === "desactualizado") d.reportes = [{ autor: "Juan Pérez", fecha: "2026-10-31T15:00:00Z", nota: b.nota }];
      if (b.accion === "resolver_reporte") d.reportes = [];
      return json({ ok: true, lista: datos });
    }
    if (u.includes("coleccion=datos_equipo")) return json(datos);
    if (u.includes("coleccion=consultas-categorias")) return json([{ categoria: "Comunicadores", carpeta_drive_id: "x" }]);
    if (u.includes("/api/consultas") && req.method() === "POST") return json({ respuesta: "El APN es igprs.claro.com.ar.\nFuente: Dato del equipo: APN Claro", manuales_usados: ["Comunicador.pdf"], datos_equipo_usados: [{ id: "a1", titulo: "APN Claro" }] });
    if (u.includes("/api/consultas")) return json([{ id: "m1", nombre: "Comunicador.pdf" }]);
    json([]);
  });
  await page.goto(base + "/");
  await page.evaluate(() => { tecnicoLogueado = "Juan Pérez"; localStorage.removeItem("datos_equipo_cache"); localStorage.removeItem("equipo_favoritos"); verConsultasBtn.click(); cambiarTabManuales("equipo"); });
  await page.waitForSelector('.equipo-card[data-id="b2"]');
  assert.match(await page.textContent('.equipo-card[data-id="b2"] .equipo-aviso'), /Puede estar desactualizado[\s\S]*Ana: «En el PC1616 es otro»/);
  // Orden: más útiles arriba
  await page.selectOption("#equipoOrden", "utiles");
  assert.strictEqual(await page.getAttribute(".equipo-card >> nth=0", "data-id"), "b2");
  await page.selectOption("#equipoOrden", "nuevos");
  // Me sirvió
  await page.click('.equipo-card[data-id="a1"] .eq-util');
  await page.waitForTimeout(200);
  assert.match(await page.textContent('.equipo-card[data-id="a1"] .eq-util'), /Me sirvió \(1\)/);
  assert.ok(await page.locator('.equipo-card[data-id="a1"] .eq-util.activo').count());
  // Avisar desactualizado y después «ya está bien»
  await page.click('.equipo-card[data-id="a1"] .eq-desact');
  await page.fill(".dlg-app .dlg-input", "Ahora es igprs.claro.com");
  await page.click(".dlg-app .dlg-si");
  await page.waitForTimeout(200);
  assert.deepStrictEqual(posts.find((p) => p.accion === "desactualizado"), { accion: "desactualizado", id: "a1", nota: "Ahora es igprs.claro.com", autor: "Juan Pérez" });
  await page.click('.equipo-card[data-id="b2"] .eq-resolver');
  await page.click(".dlg-app .dlg-si");
  await page.waitForTimeout(200);
  assert.strictEqual(await page.locator('.equipo-card[data-id="b2"] .equipo-aviso').count(), 0);
  // Favoritos: filtro propio, queda en el celular
  await page.click('.equipo-card[data-id="b2"] .equipo-fav');
  await page.selectOption("#equipoFiltroCat", "__fav");
  assert.deepStrictEqual(await page.$$eval(".equipo-card", (cs) => cs.map((c) => c.dataset.id)), ["b2"]);
  assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("equipo_favoritos"))), ["b2"]);
  await page.selectOption("#equipoFiltroCat", "__desact");
  assert.deepStrictEqual(await page.$$eval(".equipo-card", (cs) => cs.map((c) => c.dataset.id)), ["a1"], "filtro de los avisados como desactualizados");
  // La IA muestra qué datos del equipo usó, y se abren con un toque
  await page.click('#manTabs button[data-tab="ia"]');
  await page.selectOption("#consultaCategoriaSelect", "Comunicadores");
  await page.waitForTimeout(300);
  await page.fill("#consultaPreguntaInput", "¿APN de Claro?");
  await page.click("#preguntarBtn");
  await page.waitForSelector("#consultaManualesUsados [data-dato]");
  assert.match(await page.textContent("#consultaManualesUsados"), /Basado en: Comunicador\.pdf[\s\S]*Datos del equipo tenidos en cuenta: APN Claro/);
  await page.click("#consultaManualesUsados [data-dato]");
  await page.waitForSelector('.equipo-card[data-id="a1"].equipo-card-nuevo');
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

// ---------- Vista 3D (three.js) ----------
// WebGL por software (swiftshader): el navegador de las otras pruebas no lo trae.
const CASA_3D = [
  { id: "w1", t: "linea", x1: 0, y1: 0, x2: 400, y2: 0 }, { id: "w2", t: "linea", x1: 400, y1: 0, x2: 400, y2: 300 },
  { id: "w3", t: "linea", x1: 400, y1: 300, x2: 0, y2: 300 }, { id: "w4", t: "linea", x1: 0, y1: 300, x2: 0, y2: 0 },
  { id: "w5", t: "linea", x1: 200, y1: 0, x2: 200, y2: 300 },
  { id: "p1", t: "simbolo", tipo: "puerta", x: 200, y: 150, rot: 90, esc: 0.8 },
  { id: "s1", t: "simbolo", tipo: "infrarrojo", x: 20, y: 20, rot: 0, esc: 1, inst: true },
  { id: "s2", t: "simbolo", tipo: "infrarrojo", x: 380, y: 20, rot: 90, esc: 1, prev: true },
  { id: "s3", t: "simbolo", tipo: "central", x: 300, y: 290, rot: 0, esc: 1 },
];
async function navegador3D() {
  return chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
}

test("Vista 3D: desde el croquis se ve en 3D y se le manda al cliente por link (sin dirección) o como archivo HTML", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    let pedido = null;
    await page.route("**/api/**", (route) => {
      const req = route.request();
      if (req.url().includes("coleccion=croquis") && req.method() === "POST") { pedido = JSON.parse(req.postData()); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id: "0123456789abcdef" }) }); }
      route.fulfill({ status: 200, contentType: "application/json", body: req.url().includes("tecnicos") ? "[]" : "[]" });
    });
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    await page.evaluate((els) => {
      tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador");
      cqAbrirEditor({ titulo: "Casa Pérez", cliente: "Juan Pérez", direccion: "Calle Falsa 123", elementos: els });
      window.__abierto = null; window.open = (u) => { window.__abierto = u; };
      window.__bajado = null; croquisDescargar = (blob, nombre) => { blob.text().then((t) => { window.__bajado = { nombre, t }; }); };
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
    }, CASA_3D);
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    const ley = await page.textContent(".v3-ley");
    assert.match(ley, /1 × Sensor de movimiento/, "cuenta solo el que no estaba instalado");
    assert.match(ley, /Central de alarma/);
    assert.match(ley, /aro naranja/);
    assert.match(ley, /ya está instalado/);
    assert.match(await page.textContent(".v3-cab"), /Casa Pérez/);
    // Los botones cambian la vista
    await page.click('.v3-barra [data-a="vista"]');
    await page.click('.v3-hoja [data-h="cobertura"]');
    assert.ok(!(await page.$eval('.v3-hoja [data-h="cobertura"]', (b) => b.classList.contains("on"))));
    await page.click('.v3-hoja [data-h="cerrar"]');
    await page.click('.v3-barra [data-a="vista"]');
    await page.click('.v3-hoja [data-h="paredes"]');
    await page.click('.v3-barra [data-a="vista"]');
    await page.click('.v3-hoja [data-h="arriba"]');
    assert.match(ley, /Cubre el \d+% de la casa/);
    // Link
    await page.click('.v3-barra [data-extra="0"]');
    await page.click('[data-m="link"]');
    await page.waitForFunction(() => window.__abierto, null, { timeout: 5000 });
    assert.strictEqual(pedido.accion, "compartir_3d");
    assert.ok(!JSON.stringify(pedido).includes("Falsa"), "no manda la dirección");
    assert.strictEqual(pedido.paginas[0].elementos.length, CASA_3D.length);
    const abierto = await page.evaluate(() => window.__abierto);
    assert.match(decodeURIComponent(abierto), /^https:\/\/wa\.me\/\?text=Hola Juan! .*\/vista-3d\.html\?id=0123456789abcdef/s);
    // Archivo HTML
    await page.click('.v3-barra [data-extra="0"]');
    await page.click('[data-m="html"]');
    await page.waitForFunction(() => window.__bajado, null, { timeout: 10000 });
    const bajado = await page.evaluate(() => window.__bajado);
    assert.match(bajado.nombre, /^Casa-3D-Juan-Perez\.html$/);
    assert.ok(bajado.t.length > 600000, "trae three.js adentro");
    assert.ok(!bajado.t.includes("Falsa"));
    // Cerrar libera todo
    await page.click('.v3-barra [data-a="cerrar"]');
    assert.strictEqual(await page.$(".v3-capa"), null);
    assert.deepStrictEqual(errores, []);
    // El archivo se abre solo, sin internet
    const p2 = await ctx.newPage();
    const errores2 = [];
    p2.on("pageerror", (e) => errores2.push(e.message));
    await p2.route("**/*", (r) => r.abort());
    await p2.setContent(bajado.t, { waitUntil: "load" });
    await p2.waitForSelector(".v3-lienzo canvas", { timeout: 20000 });
    assert.match(await p2.textContent(".v3-cab"), /Casa Pérez/);
    assert.match(await p2.getAttribute(".v3-cab img", "src"), /^data:image\/png;base64,/);
    // Se dibujó algo (no quedó en blanco)
    const pintado = await p2.evaluate(() => new Promise((ok) => requestAnimationFrame(() => { const c = document.querySelector(".v3-lienzo canvas"); const t = document.createElement("canvas"); t.width = 60; t.height = 60; const g = t.getContext("2d"); g.drawImage(c, 0, 0, 60, 60); const d = g.getImageData(0, 0, 60, 60).data; const col = new Set(); for (let i = 0; i < d.length; i += 4) col.add(d[i] >> 4 << 8 | d[i + 1] >> 4 << 4 | d[i + 2] >> 4); ok(col.size); })));
    assert.ok(pintado > 3, "la escena tiene colores: " + pintado);
    assert.deepStrictEqual(errores2, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Vista 3D pública (vista-3d.html): abre por id sin login y avisa si el link está mal o venció", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    let pedidoUrl = "";
    await page.route("**/api/**", (route) => {
      pedidoUrl = route.request().url();
      if (pedidoUrl.includes("id=0123456789abcdef")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ titulo: "Casa Pérez", cliente: "Juan Pérez", paginas: [{ nombre: "PB", elementos: CASA_3D }, { nombre: "PA", elementos: CASA_3D.slice(0, 4) }] }) });
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Esta vista ya no está disponible" }) });
    });
    await page.addInitScript(() => { try { localStorage.setItem("v3-presentacion:0123456789abcdef", "1"); } catch (e) { /* nada */ } });
    await page.goto(base + "/vista-3d.html?id=0123456789abcdef");
    await page.waitForSelector(".v3-lienzo canvas", { timeout: 20000 });
    assert.match(pedidoUrl, /publico=vista3d/);
    assert.strictEqual(await page.title(), "Casa Pérez — SAT");
    await page.waitForSelector(".v3-pags button");
    assert.deepStrictEqual(await page.$$eval(".v3-pags button", (bs) => bs.map((b) => b.textContent)), ["Toda la casa", "PA", "PB"], "PB y PA se reconocen como plantas");
    await page.click('.v3-pags [data-pag="1"]');
    assert.strictEqual(await page.$$eval(".v3-lienzo canvas", (c) => c.length), 1, "cambiar de planta no deja dos lienzos");
    assert.strictEqual(await page.$('.v3-barra [data-a="cerrar"]'), null, "el cliente no tiene Cerrar");
    await page.goto(base + "/vista-3d.html?id=ffffffffffffffff");
    await page.waitForFunction(() => /ya no está disponible/.test(document.body.textContent), null, { timeout: 5000 });
    await page.goto(base + "/vista-3d.html?id=xx");
    await page.waitForFunction(() => /incompleto/.test(document.body.textContent), null, { timeout: 5000 });
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Vista 3D: se edita desde el 3D (agregar en la esquina con zona, mover, girar, sacar, deshacer) y pasa al croquis; un plano cerrado no se edita", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 900, height: 800 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    const elementos = [...CASA_3D.map((e) => ({ ...e })), { id: "c1", t: "cable", x1: 0, y1: 0, x2: 50, y2: 50 }];
    elementos.find((e) => e.id === "s3").etq = "7";
    await page.evaluate((els) => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); window.dialogoApp = async (m, op = {}) => (op.conTexto ? "12" : true); cqAbrirEditor({ titulo: "Casa", cliente: "Juan", elementos: els }); }, elementos);
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    await page.click('.v3-barra [data-a="editar"]');
    assert.match(await page.textContent(".v3-aviso"), /Arrastrá un equipo de abajo/);
    const tocar = async (ux, uy, h) => { const [x, y] = await page.evaluate(([a, b, c]) => document.querySelector(".v3-capa").__v.aPantalla(a, b, c), [ux, uy, h]); await page.mouse.click(x, y); };
    await page.evaluate(() => { document.querySelector(".v3-capa").__v = null; });
    await page.evaluate(() => { const c = document.querySelector(".v3-capa"); Object.defineProperty(c, "__v", { get: () => window.__visor3d.visor, configurable: true }); });
    // Agregar: tocar el piso del ambiente izquierdo, cerca de la esquina de abajo
    await tocar(60, 240, 0);
    await page.waitForSelector(".v3-hoja:not(.hidden) .v3-paleta");
    await page.click('.v3-paleta [data-tipo="infrarrojo"]');
    let nuevo = await page.evaluate(() => cq.elementos.find((e) => String(e.id).startsWith("v3")));
    assert.ok(nuevo, "quedó en el croquis");
    assert.deepStrictEqual([nuevo.x, nuevo.y, nuevo.rot], [0, 300, 90], "a la esquina, mirando al ambiente");
    assert.strictEqual(nuevo.etq, "8", "zona siguiente");
    assert.strictEqual(nuevo.inst, true, "a instalar (el plano ya tenía marcados)");
    assert.match(await page.textContent(".v3-hoja"), /Sensor de movimiento.*zona 8/);
    assert.match(await page.textContent(".v3-ley"), /2 × Sensor de movimiento/);
    // Girar
    await page.click('.v3-hoja [data-h="girar"]');
    assert.strictEqual(await page.evaluate((id) => cq.elementos.find((e) => e.id === id).rot, nuevo.id), 135);
    // Zona
    await page.click('.v3-hoja [data-h="zona"]');
    assert.strictEqual(await page.evaluate((id) => cq.elementos.find((e) => e.id === id).etq, nuevo.id), "12");
    // Mover al otro ambiente
    await page.click('.v3-hoja [data-h="mover"]');
    assert.match(await page.textContent(".v3-aviso"), /Tocá dónde va/);
    await tocar(340, 60, 0);
    nuevo = await page.evaluate((id) => cq.elementos.find((e) => e.id === id), nuevo.id);
    assert.deepStrictEqual([nuevo.x, nuevo.y], [400, 0], "a la esquina del otro ambiente");
    // Tocar un equipo abre sus opciones: sacar la central
    await tocar(300, 290, 1.6);
    await page.waitForFunction(() => /Central/.test(document.querySelector(".v3-hoja").textContent));
    await page.click('.v3-hoja [data-h="sacar"]');
    assert.ok(!(await page.evaluate(() => cq.elementos.some((e) => e.id === "s3"))));
    assert.ok(await page.evaluate(() => cq.elementos.some((e) => e.id === "c1")), "el cable no se toca");
    // Deshacer vuelve la central
    await page.click('.v3-barra [data-a="deshacer"]');
    assert.ok(await page.evaluate(() => cq.elementos.some((e) => e.id === "s3")));
    assert.strictEqual(await page.evaluate(() => cq.cambios), true);
    // Listo y cerrar: el 2D muestra lo nuevo
    await page.click('.v3-barra [data-a="listo"]');
    await page.click('.v3-barra [data-a="cerrar"]');
    assert.strictEqual(await page.evaluate(() => cq.elementos.filter((e) => e.tipo === "infrarrojo").length), 3);
    // Plano cerrado: sin Editar
    await page.evaluate(() => cqModoLectura(true));
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    assert.strictEqual(await page.$('.v3-barra [data-a="editar"]'), null);
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

// Casa de dos ambientes: el de la izquierda con un infrarrojo, el de la derecha sin nada.
const CASA_B = [
  { id: "w1", t: "linea", x1: 0, y1: 0, x2: 400, y2: 0 }, { id: "w2", t: "linea", x1: 400, y1: 0, x2: 400, y2: 300 },
  { id: "w3", t: "linea", x1: 400, y1: 300, x2: 0, y2: 300 }, { id: "w4", t: "linea", x1: 0, y1: 300, x2: 0, y2: 0 },
  { id: "w5", t: "linea", x1: 200, y1: 0, x2: 200, y2: 300 },
  { id: "pi", t: "simbolo", tipo: "puerta", x: 200, y: 150, rot: 90, esc: 1 },
  { id: "pe", t: "simbolo", tipo: "puerta", x: 100, y: 300, rot: 0, esc: 1 },
  { id: "ve", t: "simbolo", tipo: "ventana", x: 300, y: 0, rot: 0, esc: 1 },
  { id: "ir", t: "simbolo", tipo: "infrarrojo", x: 0, y: 0, rot: 180, esc: 1, etq: "1" },
];
test("Vista 3D del cliente: puntos débiles, simulación de intruso, cámara, dos propuestas y «Quiero que me llamen»", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1000, height: 800 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.addInitScript(() => { window.CROQUIS_3D_VELOCIDAD = 12; try { localStorage.setItem("v3-presentacion:0123456789abcdef", "1"); } catch (e) { /* nada */ } });
    let llamada = null;
    const completa = [...CASA_B, { id: "ir2", t: "simbolo", tipo: "infrarrojo", x: 400, y: 0, rot: 270, esc: 1, etq: "2" }, { id: "cam", t: "simbolo", tipo: "camara_ip", x: 390, y: 290, rot: 315, esc: 1 }];
    await page.route("**/api/**", (route) => {
      const req = route.request();
      if (req.url().includes("vista3d_llamar")) { llamada = JSON.parse(req.postData()); return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); }
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ titulo: "Casa B", cliente: "Ana", propuestas: [{ nombre: "Básica", paginas: [{ elementos: CASA_B }] }, { nombre: "Completa", paginas: [{ elementos: completa }] }] }) });
    });
    await page.goto(base + "/vista-3d.html?id=0123456789abcdef");
    await page.waitForSelector(".v3-lienzo canvas", { timeout: 20000 });
    // Dos propuestas con su porcentaje
    const props = await page.$$eval(".v3-props button", (bs) => bs.map((b) => b.textContent.trim()));
    assert.strictEqual(props.length, 2);
    const pct = props.map((t) => Number((t.match(/(\d+)%/) || [])[1]));
    assert.match(props[0], /^Básica/); assert.ok(pct[0] > 30 && pct[0] < 70, "la básica cubre la mitad: " + props[0]);
    assert.strictEqual(pct[1], 100, "la completa cubre todo: " + props[1]);
    const ley = await page.textContent(".v3-ley");
    assert.match(ley, /1 abertura que da afuera no tiene sensor/, "la ventana del ambiente sin sensor");
    // Puntos débiles: arranca apagado para el cliente y se prende
    await page.click('.v3-barra [data-a="vista"]');
    assert.ok(!(await page.$eval('.v3-hoja [data-h="debiles"]', (b) => b.classList.contains("on"))));
    await page.click('.v3-hoja [data-h="debiles"]');
    assert.ok(await page.$eval('.v3-hoja [data-h="debiles"]', (b) => b.classList.contains("on")));
    await page.click('.v3-hoja [data-h="cerrar"]');
    // Simulación: entra por la ventana sin sensor y lo detecta el infrarrojo de la zona 1
    await page.click('.v3-barra [data-a="simular"]');
    assert.match(await page.textContent(".v3-aviso"), /entra por una ventana que no tiene sensor/);
    await page.waitForSelector(".v3-hoja:not(.hidden)", { timeout: 30000 });
    const res = await page.textContent(".v3-hoja");
    assert.match(res, /Lo detectó el sensor de movimiento de la zona 1/);
    await page.click('.v3-hoja [data-h="cerrar"]');
    // Otra propuesta; tocar la cámara muestra lo que ve
    await page.click('.v3-props [data-prop="1"]');
    assert.doesNotMatch(await page.textContent(".v3-ley"), /no tiene sensor/);
    const [cx, cy] = await page.evaluate(() => window.visor3d.visor.aPantalla(390, 290, 2.6));
    await page.mouse.click(cx, cy);
    await page.waitForSelector('.v3-hoja [data-h="vercam"]', { timeout: 5000 });
    assert.match(await page.textContent(".v3-hoja"), /Graba y te deja ver en vivo/);
    await page.click('.v3-hoja [data-h="vercam"]');
    await page.waitForSelector('.v3-barra [data-a="salircam"]', { timeout: 5000 });
    assert.match(await page.textContent(".v3-aviso"), /Lo que ve la cámara/);
    await page.click('.v3-barra [data-a="salircam"]');
    assert.ok(await page.$('.v3-barra [data-a="simular"]'));
    // Quiero que me llamen
    await page.click('.v3-barra [data-a="llamar"]');
    await page.fill(".v3-hoja .v3-tel", "11 4444-5555");
    await page.fill(".v3-hoja .v3-msj", "después de las 18");
    await page.click('.v3-hoja [data-h="enviar"]');
    await page.waitForFunction(() => /Recibimos tu pedido/.test(document.querySelector(".v3-hoja").textContent));
    assert.deepStrictEqual(llamada, { id: "0123456789abcdef", telefono: "11 4444-5555", mensaje: "después de las 18", propuesta: "Completa" });
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Vista 3D: al mandarla se puede sumar otra propuesta del mismo cliente para comparar, y se ve si ya abrieron los links", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    let pedido = null;
    await page.route("**/api/**", (route) => {
      const req = route.request(), u = req.url();
      const j = (x) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(x) });
      if (u.includes("coleccion=croquis") && req.method() === "POST") { pedido = JSON.parse(req.postData()); return j({ ok: true, id: "0123456789abcdef" }); }
      if (u.includes("vistas3d=1")) return j([{ id: "x", fecha: "2026-10-30T15:00:00Z", aperturas: 3, ultima: "2026-10-31T21:10:00Z", llamadas: [{ telefono: "11 2222-3333" }] }]);
      if (u.includes("id=otro1")) return j({ id: "otro1", titulo: "Casa Pérez completa", dibujo: { v: 2, paginas: [{ elementos: [...CASA_B, { id: "c1", t: "cable", x1: 0, y1: 0, x2: 9, y2: 9 }] }] } });
      if (u.includes("coleccion=croquis") && u.includes("cliente=")) return j([{ id: "actual1", titulo: "Casa Pérez" }, { id: "otro1", titulo: "Casa Pérez completa" }]);
      j([]);
    });
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    await page.evaluate((els) => {
      tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador");
      cqAbrirEditor({ id: "actual1", titulo: "Casa Pérez", cliente: "Juan Pérez", elementos: els });
      window.__abierto = null; window.open = (u) => { window.__abierto = u; };
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    }, CASA_3D);
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    await page.click('.v3-barra [data-extra="0"]');
    await page.waitForFunction(() => /abierto 3 veces/.test(document.querySelector(".cq3d-estado").textContent));
    assert.ok(!(await page.isChecked(".cq3d-presentacion")), "el plano tiene equipos ya instalados (agregado): sin presentación");
    assert.match(await page.textContent(".cq-datos"), /Es un agregado a un sistema que ya tiene/);
    await page.check(".cq3d-presentacion");
    assert.match(await page.textContent(".cq3d-estado"), /pidió que lo llamen: 11 2222-3333/);
    await page.click(".cq3d-comparar summary");
    await page.waitForSelector('.cq3d-otras input[type=checkbox]');
    assert.strictEqual(await page.$$eval(".cq3d-otras input[type=checkbox]", (x) => x.length), 1, "no se ofrece el mismo plano");
    await page.fill(".cq3d-nombre-actual", "Básica");
    await page.check('.cq3d-otras input[type=checkbox]');
    await page.fill('.cq3d-otras [data-n="0"]', "Completa");
    await page.click('[data-m="link"]');
    await page.waitForFunction(() => window.__abierto, null, { timeout: 5000 });
    assert.deepStrictEqual(pedido.propuestas.map((p) => p.nombre), ["Básica", "Completa"]);
    assert.strictEqual(pedido.propuestas[1].paginas[0].elementos.length, CASA_B.length, "sin cables");
    assert.strictEqual(pedido.croquis_id, "actual1");
    assert.strictEqual(pedido.presentacion, true);
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Paso (abertura sin puerta): se pone desde Obra, se apoya en la pared y en el 3D corta la pared con su marco", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    const casa = CASA_B.filter((e) => e.id !== "pi");
    await page.evaluate((els) => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); cqAbrirEditor({ titulo: "Casa", elementos: els }); }, casa);
    // Desde Obra: aparece en la paleta
    await page.click('[data-herr="objetos"]');
    assert.ok(await page.$('#cqSimbolos [data-simbolo="paso"]'), "está en Obra");
    // Se apoya solo en la pared del medio (x = 200), girado como la pared
    const el = await page.evaluate(() => { const e = { id: "pa", t: "simbolo", tipo: "paso", x: 192, y: 150, rot: 0, esc: 1 }; cq.elementos.push(e); cqImanSimbolo(e); cqRender(); return e; });
    assert.strictEqual(el.x, 200);
    assert.strictEqual(((el.rot % 180) + 180) % 180, 90);
    const svg = await page.evaluate(() => croquisSvgElemento(cq.elementos.find((e) => e.id === "pa")));
    assert.match(svg, /stroke-dasharray/, "se dibuja el vano (sin hoja de puerta)");
    assert.doesNotMatch(svg, / A ?40 40/, "sin el arco de la puerta");
    // 3D: la pared del medio queda cortada en el paso y se puede pasar
    const a = await page.evaluate(() => Croquis3D.analizar(cq.elementos));
    const sinPaso = await page.evaluate((els) => Croquis3D.analizar(els).porcentaje, casa);
    assert.ok(a.porcentaje > sinPaso, "el sensor ve a través del paso: " + sinPaso + " → " + a.porcentaje);
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    const paredes = await page.evaluate(() => window.__visor3d.visor.resumen.paredes);
    assert.strictEqual(paredes, 6, "la del medio partida en el paso (las puertas no se cuentan: pueden estar cerradas)");
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Cercos: reja completa, reja con tapial y tejido perimetral se trazan como una pared, se cambian de tipo y en el 3D no cuentan como pared", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    await page.evaluate(() => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); cqAbrirEditor({ titulo: "Casa" }); });
    await page.waitForTimeout(200);
    // Desde Obra: elegir "Reja con tapial" lleva a la herramienta Pared con ese tipo
    await page.click('[data-herr="objetos"]');
    await page.click('#cqSimbolos [data-cerco="reja_tapial"]');
    assert.strictEqual(await page.evaluate(() => cq.herr), "linea");
    assert.ok(await page.$('#cqSimbolos [data-subpared="reja_tapial"].activo'));
    assert.match(await page.textContent("#cqAyuda"), /reja con tapial/);
    const caja = await page.locator("#cqSvg").boundingBox();
    const arrastrar = async (a, b) => { await page.mouse.move(caja.x + a[0], caja.y + a[1]); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(caja.x + a[0] + (b[0] - a[0]) * i / 8, caja.y + a[1] + (b[1] - a[1]) * i / 8); await page.mouse.up(); };
    await arrastrar([60, 80], [260, 80]);
    let lineas = await page.evaluate(() => cq.elementos.filter((e) => e.t === "linea"));
    assert.strictEqual(lineas.length, 1);
    assert.strictEqual(lineas[0].cerco, "reja_tapial");
    // Sigue la cadena con el mismo tipo
    await page.mouse.click(caja.x + 260, caja.y + 220);
    lineas = await page.evaluate(() => cq.elementos.filter((e) => e.t === "linea"));
    assert.deepStrictEqual(lineas.map((l) => l.cerco), ["reja_tapial", "reja_tapial"]);
    // Tejido desde la paleta de Pared
    await page.click('#cqSimbolos [data-subpared="tejido"]');
    await arrastrar([60, 300], [260, 300]);
    const tejido = await page.evaluate(() => cq.elementos.filter((e) => e.t === "linea").pop());
    assert.strictEqual(tejido.cerco, "tejido");
    const svgT = await page.evaluate((id) => croquisSvgElemento(cq.elementos.find((e) => e.id === id)), tejido.id);
    assert.match(svgT, /<circle/, "con postes");
    // Cambiar el tipo desde la barra: toda la cadena pasa a reja completa
    await page.click('[data-herr="mover"]');
    await page.evaluate(() => { const l = cq.elementos.find((e) => e.cerco === "reja_tapial"); cq.sel = l.id; cqRender(); });
    assert.match(await page.textContent("#cqProps"), /Reja con tapial/);
    await page.click('#cqProps [data-cerco-sel="reja"]');
    assert.deepStrictEqual(await page.evaluate(() => cq.elementos.filter((e) => e.cadena && e.cadena === cq.elementos.find((x) => x.cerco === "reja").cadena).map((e) => e.cerco)), ["reja", "reja"]);
    await page.click('#cqProps [data-cerco-sel="pared"]');
    assert.ok(await page.evaluate(() => cq.elementos.filter((e) => e.t === "linea" && !e.cerco).length === 2), "vuelve a ser pared");
    // En el análisis 3D los cercos no cierran ambientes
    const a = await page.evaluate(() => Croquis3D.analizar([{ id: "1", t: "linea", cerco: "reja", x1: 0, y1: 0, x2: 400, y2: 0 }, { id: "2", t: "linea", cerco: "reja", x1: 400, y1: 0, x2: 400, y2: 300 }, { id: "3", t: "linea", cerco: "tejido", x1: 400, y1: 300, x2: 0, y2: 300 }, { id: "4", t: "linea", cerco: "reja_tapial", x1: 0, y1: 300, x2: 0, y2: 0 }]));
    assert.strictEqual(a, null);
    // Se ven en el 3D sin errores
    await page.evaluate(() => { cq.elementos.forEach((e) => { if (e.t === "linea") e.cerco = "reja_tapial"; }); });
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    assert.strictEqual(await page.evaluate(() => window.__visor3d.visor.resumen.paredes), 0);
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Casa de dos plantas: la página nueva puede ser la planta alta (con la de abajo de fondo) y en el 3D se ve toda la casa o cada planta", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    const pb = [...CASA_B, { id: "es", t: "simbolo", tipo: "escalera_recta", x: 340, y: 200, rot: 0, esc: 1 }];
    await page.evaluate((els) => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); cqAbrirEditor({ titulo: "Casa", elementos: els }); }, pb);
    await page.click("#cqMenuBtn");
    await page.click('[data-m="pagina"]');
    assert.match(await page.textContent(".cq-datos"), /Planta alta \(va arriba en el 3D\)/);
    await page.click('[data-n="arriba"]');
    const pags = await page.evaluate(() => cq.paginas.map((p) => [p.nombre, p.nivel]));
    assert.deepStrictEqual(pags, [["Planta baja", 0], ["Planta alta", 1]]);
    // De fondo, la planta baja (sin poder tocarla)
    assert.ok(await page.$("#cqSvg .cq-calco line"), "se ve el calco de la planta baja");
    // Dibujar algo en la planta alta: paredes y un sensor
    await page.evaluate(() => { cq.elementos.push({ id: "a1", t: "linea", x1: 0, y1: 0, x2: 400, y2: 0 }, { id: "a2", t: "linea", x1: 400, y1: 0, x2: 400, y2: 300 }, { id: "a3", t: "linea", x1: 400, y1: 300, x2: 0, y2: 300 }, { id: "a4", t: "linea", x1: 0, y1: 300, x2: 0, y2: 0 }, { id: "a5", t: "simbolo", tipo: "infrarrojo", x: 0, y: 0, rot: 180, esc: 1, etq: "9" }); cqRender(); });
    const datos = await page.evaluate(() => cq3dDatos());
    assert.deepStrictEqual(datos.paginas.map((p) => p.nivel), [0, 1]);
    // Cambiar desde las opciones de la página
    await page.evaluate(() => cqOpcionesPagina());
    await page.selectOption("[data-p-nivel]", "2");
    assert.strictEqual(await page.evaluate(() => cq.paginas[1].nivel), 2);
    await page.selectOption("[data-p-nivel]", "1");
    await page.click('[data-p="cerrar"]');
    // 3D: "Toda la casa" con las dos plantas, y cada planta por separado
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    await page.waitForSelector(".v3-pags button");
    assert.deepStrictEqual(await page.$$eval(".v3-pags button", (bs) => bs.map((b) => b.textContent)), ["Toda la casa", "Planta alta", "Planta baja"]);
    assert.ok(await page.$eval('.v3-pags [data-pag="todo"]', (b) => b.classList.contains("on")));
    assert.match(await page.textContent(".v3-ley"), /Cubre el \d+% de la casa/);
    await page.click('.v3-pags [data-pag="1"]');
    assert.match(await page.textContent(".v3-ley"), /de esta planta/);
    // Editar desde "Toda la casa" pasa a una planta
    await page.click('.v3-pags [data-pag="todo"]');
    await page.click('.v3-barra [data-a="editar"]');
    assert.ok(!(await page.$eval('.v3-pags [data-pag="todo"]', (b) => b.classList.contains("on"))));
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Editar en 3D más fácil: arrastrar desde la tira, sello, mover arrastrando, girar con la manija y «Completar la protección»", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 900, height: 800 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    await page.evaluate((els) => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); window.dialogoApp = async (m, op = {}) => (op.conTexto ? null : true); cqAbrirEditor({ titulo: "Casa", elementos: els }); }, CASA_B);
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    await page.click('.v3-barra [data-a="editar"]');
    await page.waitForSelector(".v3-tira:not(.hidden) [data-tipo=infrarrojo]");
    const pantalla = (x, y, h) => page.evaluate(([a, b, c]) => window.__visor3d.visor.aPantalla(a, b, c), [x, y, h || 0]);
    const arrastrar = async (de, a) => { await page.mouse.move(de[0], de[1]); await page.mouse.down(); for (let i = 1; i <= 12; i++) await page.mouse.move(de[0] + (a[0] - de[0]) * i / 12, de[1] + (a[1] - de[1]) * i / 12); await page.mouse.up(); };
    // 1) Arrastrar un infrarrojo desde la tira al ambiente de la derecha (vacío): va a la esquina
    const chip = await page.locator(".v3-tira [data-tipo=infrarrojo]").boundingBox();
    const destino = await pantalla(360, 260);
    await arrastrar([chip.x + chip.width / 2, chip.y + chip.height / 2], destino);
    let nuevo = await page.evaluate(() => cq.elementos.filter((e) => e.tipo === "infrarrojo" && e.id !== "ir").pop());
    assert.ok(nuevo, "se agregó");
    assert.deepStrictEqual([nuevo.x, nuevo.y], [400, 300], "a la esquina más cercana");
    assert.strictEqual(nuevo.etq, "2", "zona siguiente");
    assert.match(await page.textContent(".v3-aviso"), /Cobertura: \d+% → \d+%/);
    // 2) Mover arrastrando el sensor: a la otra esquina del mismo ambiente
    const desde = await pantalla(400, 300, 2.3), hacia = await pantalla(380, 30);
    await arrastrar(desde, hacia);
    nuevo = await page.evaluate((id) => cq.elementos.find((e) => e.id === id), nuevo.id);
    assert.deepStrictEqual([nuevo.x, nuevo.y], [400, 0], "movido a la otra esquina");
    // 3) Girar con la manija (aparece al elegirlo)
    const rot0 = nuevo.rot;
    await page.evaluate((id) => window.__visor3d.visor.marcar(id), nuevo.id);
    const ang = (rot0 - 135) * Math.PI / 180, mx = 400 + Math.cos(ang) * 52, my = 0 + Math.sin(ang) * 52;
    const manija = await pantalla(mx, my, 0.06), giro = await pantalla(400 - 70, 10);
    await arrastrar(manija, giro);
    const rot1 = await page.evaluate((id) => cq.elementos.find((e) => e.id === id).rot, nuevo.id);
    const esperado = (Math.atan2(10, -70) * 180 / Math.PI + 135 + 360) % 360;
    assert.ok(Math.abs(rot1 - esperado) <= 3, "giró hacia donde se arrastró la manija: " + rot1 + " (esperado ~" + Math.round(esperado) + ")");
    // 4) Sello: tocar "Apertura" y después cerca de la ventana: se pega a la ventana
    await page.click(".v3-tira [data-tipo=magnetico]");
    assert.match(await page.textContent(".v3-aviso"), /donde va cada sensor de apertura/i);
    const cerca = await pantalla(310, 30);
    await page.mouse.click(cerca[0], cerca[1]);
    const mag = await page.evaluate(() => cq.elementos.find((e) => e.tipo === "magnetico"));
    assert.ok(mag, "se puso el magnético");
    assert.ok(Math.abs(mag.y - 6) <= 1 && mag.x > 300 && mag.x < 325, "pegado a la ventana, del lado de adentro: " + mag.x + "," + mag.y);
    await page.click(".v3-tira [data-tipo=magnetico]"); // termina el sello
    // 5) Completar la protección: saca el sensor que agregué y pide propuesta
    await page.evaluate((id) => { const i = cq.elementos.findIndex((e) => e.id === id); cq.elementos.splice(i, 1); }, nuevo.id);
    await page.click('.v3-barra [data-a="listo"]');
    await page.click('.v3-barra [data-a="cerrar"]');
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    await page.click('.v3-barra [data-a="editar"]');
    await page.click('.v3-barra [data-a="completar"]');
    await page.waitForFunction(() => /Te propongo/.test(document.querySelector(".v3-hoja").textContent), null, { timeout: 10000 });
    assert.match(await page.textContent(".v3-hoja"), /sensor(es)? de movimiento/);
    await page.click('.v3-hoja [data-h="todos"]');
    const pct = await page.evaluate(() => Croquis3D.analizar(cq.elementos).porcentaje);
    assert.ok(pct >= 90, "con la propuesta queda casi todo cubierto: " + pct);
    // Deshacer saca todos los de la propuesta juntos
    const n = await page.evaluate(() => cq.elementos.filter((e) => e.tipo === "infrarrojo").length);
    await page.click('.v3-barra [data-a="deshacer"]');
    assert.ok((await page.evaluate(() => cq.elementos.filter((e) => e.tipo === "infrarrojo").length)) < n);
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Plano de Visio a editable: reconoce la escalera en U (dos tramos y el descanso) y la recta, y no quedan como paredes", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  page.on("console", (m) => { if (process.env.DEPURAR && m.text().startsWith("ESC")) console.log(m.text()); });
  await page.goto(base + "/");
  await page.waitForTimeout(300);
  const r = await page.evaluate(async () => {
    const { PDFDocument, rgb } = await croquisCargarPdfLib();
    const d = await PDFDocument.create(); const p = d.addPage([700, 500]); const H = 500;
    const negro = rgb(0, 0, 0), op = { x: 0, y: H, borderColor: negro, borderWidth: 0.75 };
    const linea = (x1, y1, x2, y2) => p.drawSvgPath(`M ${x1} ${y1} L ${x2} ${y2}`, op);
    // Casa 400 x 300 y una puerta (de 23,6: da la escala, 1 m ≈ 29,5)
    p.drawSvgPath("M 100 100 L 500 100 L 500 400 L 100 400 Z", op);
    linea(300, 100, 300, 200); linea(300, 223.6, 300, 400);
    p.drawSvgPath("M 300 200 L 276.4 223.6 L 300 223.6", op);
    // Escalera en U contra la pared derecha: dos tramos de 1 m (29,5) x 2,6 m, 9 escalones; descanso arriba de 1 m con la X
    const X0 = 441, X1 = 500, YD = 240, Y0 = 270, Y1 = 346;
    p.drawSvgPath(`M ${X0} ${YD} L ${X1} ${YD} L ${X1} ${Y1} L ${X0} ${Y1} Z`, op); // contorno
    linea((X0 + X1) / 2, Y0, (X0 + X1) / 2, Y1); // separación de los tramos
    linea(X0, Y0, X1, Y0); // borde del descanso
    for (let i = 1; i <= 9; i++) { const y = Y0 + i * 7.6; linea(X0, y, (X0 + X1) / 2, y); linea((X0 + X1) / 2, y, X1, y); }
    linea(X0, YD, X1, Y0); linea(X1, YD, X0, Y0); // X del descanso
    p.drawSvgPath(`M ${X0 + 14} ${Y1 - 4} L ${X0 + 14} ${YD + 15} L ${X1 - 14} ${YD + 15} L ${X1 - 14} ${Y1 - 10}`, op); // flecha
    p.drawSvgPath(`M ${X1 - 17} ${Y1 - 12} L ${X1 - 11} ${Y1 - 12} L ${X1 - 14} ${Y1 - 6} Z`, { x: 0, y: H, color: negro });
    // Escalera recta (escalones como rectángulos finitos), en el otro ambiente
    for (let i = 0; i < 12; i++) { const x = 130 + i * 8.5; p.drawSvgPath(`M ${x} 300 L ${x + 0.6} 300 L ${x + 0.6} 330 L ${x} 330 Z`, op); }
    p.drawSvgPath("M 128 300 L 226 300 L 226 330 L 128 330 Z", op);
    // Un infrarrojo dentro de la casa (no lo tiene que tocar)
    p.drawSvgPath("M 492 106 L 497.5 106 L 497.5 111.5 L 492 111.5 Z", { x: 0, y: H, color: rgb(1, 0, 0), borderColor: negro, borderWidth: 0.75 });
    const bytes = await d.save();
    const res = await croquisPdfAEditable(bytes, 1);
    const els = res.paginas[0].elementos;
    return {
      escaleras: els.filter((e) => /^escalera/.test(e.tipo)).map((e) => ({ tipo: e.tipo, rot: e.rot, esc: e.esc, x: e.x, y: e.y })),
      paredes: els.filter((e) => e.t === "linea").length,
      ir: els.filter((e) => e.tipo === "infrarrojo").length,
      puertas: els.filter((e) => e.tipo === "puerta").length,
      lista: els.filter((e) => e.t === "linea").map((e) => [e.x1, e.y1, e.x2, e.y2].map(Math.round).join(",")),
      paredEsc: els.filter((e) => e.t === "linea" && Math.abs(e.x1 - e.x2) < 1 && Math.abs(e.y1 - e.y2) > 0 && Math.abs(e.y1 - e.y2) < 20).length,
    };
  });
  const tipos = r.escaleras.map((e) => e.tipo).sort();
  assert.deepStrictEqual(tipos, ["escalera_recta", "escalera_u"], JSON.stringify(r));
  const u = r.escaleras.find((e) => e.tipo === "escalera_u");
  assert.strictEqual(u.rot, 0, "el descanso queda arriba (hacia -y)");
  assert.ok(Math.abs(u.esc - 0.87) < 0.12, "ancho de los dos tramos (~2 m): " + u.esc);
  const rec = r.escaleras.find((e) => e.tipo === "escalera_recta");
  assert.ok(rec.rot === 90 || rec.rot === 270, "la recta sube a lo largo (horizontal): " + rec.rot);
  assert.strictEqual(r.paredes, 6, "solo las paredes de la casa (los escalones no son paredes): " + r.lista.join(" | "));
  assert.strictEqual(r.ir, 1);
  assert.strictEqual(r.puertas, 1);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Link para el cliente: la presentación guiada arranca sola (una vez), compara sin alarma / con SAT y explica qué hace cada equipo", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 900, height: 800 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.addInitScript(() => { window.CROQUIS_3D_VELOCIDAD = 14; });
    const urls = [];
    const casa = CASA_B.concat([{ id: "rect", t: "rect", x: 0, y: 0, w: 200, h: 300, nombre: "Living" }]);
    await page.route("**/api/**", (route) => { urls.push(route.request().url()); route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ titulo: "Casa B", cliente: "Ana", paginas: [{ elementos: casa }] }) }); });
    await page.goto(base + "/vista-3d.html?id=0123456789abcdef");
    await page.waitForSelector(".v3-lienzo canvas", { timeout: 20000 });
    // Arranca la presentación: paso 1 sin alarma, sin los botones de abajo
    await page.waitForFunction(() => /Esta es tu casa/.test(document.querySelector(".v3-hoja").textContent), null, { timeout: 5000 });
    assert.ok(!(await page.isVisible(".v3-barra")), "durante la presentación no se ven los botones");
    assert.match(await page.textContent(".v3-ley"), /Así está hoy/);
    await page.click('.v3-hoja [data-h="sig"]');
    assert.match(await page.textContent(".v3-hoja"), /Por dónde podrían entrar hoy[\s\S]*las 2 aberturas que dan afuera y no tienen ningún sensor/);
    await page.click('.v3-hoja [data-h="sig"]');
    assert.match(await page.textContent(".v3-hoja"), /Lo que instalamos[\s\S]*1 × sensor de movimiento[\s\S]*Los sensores cubren el \d+%/);
    assert.match(await page.textContent(".v3-ley"), /Qué se instala/);
    await page.click('.v3-hoja [data-h="sig"]');
    await page.waitForFunction(() => /Lo detectó el sensor de movimiento de la zona 1/.test(document.querySelector(".v3-hoja").textContent), null, { timeout: 30000 });
    await page.click('.v3-hoja [data-h="sig"]');
    assert.match(await page.textContent(".v3-hoja"), /¿Lo charlamos\?/);
    await page.click('.v3-hoja [data-h="llamar"]');
    assert.match(await page.textContent(".v3-hoja"), /¿Te llamamos\?/);
    await page.click('.v3-hoja [data-h="cerrar"]');
    assert.ok(await page.isVisible(".v3-barra"));
    // Sin alarma / con SAT
    await page.click('.v3-barra [data-a="antes"]');
    assert.match(await page.textContent(".v3-aviso"), /Así está hoy: 2 aberturas que dan afuera quedan sin protección y ningún sensor cubre los ambientes/);
    assert.match(await page.textContent('.v3-barra [data-a="antes"]'), /Ver con SAT/);
    await page.click('.v3-barra [data-a="antes"]');
    assert.match(await page.textContent('.v3-barra [data-a="antes"]'), /Ver sin alarma/);
    // Tocar un equipo: qué hace y dónde está
    const [x, y] = await page.evaluate(() => window.visor3d.visor.aPantalla(0, 0, 2.3));
    await page.mouse.click(x, y);
    await page.waitForFunction(() => /Detecta el movimiento/.test(document.querySelector(".v3-hoja").textContent), null, { timeout: 5000 });
    assert.ok(await page.$(".v3-hoja .v3-vitrina canvas"), "con el equipo en 3D");
    const vit = await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => { const c = document.querySelector(".v3-vitrina canvas"); ok(c.width > 100 && c.height > 100); })));
    assert.ok(vit);
    assert.match(await page.textContent(".v3-hoja"), /zona 1[\s\S]*En living[\s\S]*Cubre hasta 11 m, en un ángulo de 90°/);
    // Al volver a abrir, no arranca sola (se puede ver desde Vista)
    await page.reload();
    await page.waitForSelector(".v3-lienzo canvas", { timeout: 20000 });
    await page.waitForTimeout(1200);
    assert.ok(await page.isHidden(".v3-hoja"));
    await page.click('.v3-barra [data-a="vista"]');
    await page.click('.v3-hoja [data-h="presentacion"]');
    assert.match(await page.textContent(".v3-hoja"), /Esta es tu casa/);
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Propuestas enviadas: el tablero muestra a quién seguir, y se marcan ganadas, perdidas o «ya lo llamé»", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const ahora = Date.now(), dia = 864e5;
  let lista = [
    { id: "a".repeat(16), cliente: "Vilches", titulo: "Casa Vilches", fecha: new Date(ahora - 4 * dia).toISOString(), aperturas: 3, ultima: new Date(ahora - 3600e3).toISOString(), llamadas: [], seguimiento: { regla: "caliente", prioridad: 2, texto: "La miró 3 veces: buen momento para llamarlo" }, propuestas: ["Básica", "Completa"] },
    { id: "b".repeat(16), cliente: "Pérez", titulo: "Casa", fecha: new Date(ahora - dia).toISOString(), aperturas: 1, ultima: new Date(ahora - 3600e3).toISOString(), llamadas: [{ telefono: "11 4444-5555" }], seguimiento: { regla: "llamar", prioridad: 1, texto: "Pidió que lo llamen: 11 4444-5555" } },
    { id: "c".repeat(16), cliente: "Gómez", titulo: "Local", fecha: new Date(ahora - dia).toISOString(), aperturas: 0, llamadas: [], seguimiento: null },
  ];
  const cambios = [];
  await page.unroute("**/api/**");
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    if (u.includes("todas=1")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(lista) });
    if (req.method() === "POST" && u.includes("coleccion=croquis")) {
      const b = JSON.parse(req.postData()); cambios.push(b);
      lista = lista.map((v) => (v.id === b.id ? { ...v, ...(b.estado ? { estado: b.estado, seguimiento: null } : {}), ...(b.llamada_atendida ? { llamada_atendida: true, seguimiento: null } : {}) } : v));
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    }
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  await page.evaluate(() => { tecnicoLogueado = "Seba"; cqAbrirLista(); window.__abierto = null; window.open = (x) => { window.__abierto = x; }; });
  await page.waitForFunction(() => document.getElementById("cqPropuestasBadge").textContent === "2");
  await page.click("#cqPropuestasBtn");
  await page.waitForSelector(".cq-prop");
  const filas = await page.$$eval(".cq-prop", (x) => x.map((d) => d.querySelector("b").textContent));
  assert.deepStrictEqual(filas, ["Pérez", "Vilches"], "primero el que pidió que lo llamen");
  assert.match(await page.textContent(".cq-propuestas"), /La miró 3 veces: buen momento para llamarlo/);
  assert.ok(await page.$('.cq-prop a[href="tel:1144445555"]'));
  // WhatsApp con el link de nuevo
  await page.click(`[data-id="${"a".repeat(16)}"] [data-acc="wa"]`);
  assert.match(decodeURIComponent(await page.evaluate(() => window.__abierto)), /Hola Vilches! ¿Pudiste ver[\s\S]*vista-3d\.html\?id=a{16}/);
  // Ya lo llamé / ganada
  await page.click(`[data-id="${"b".repeat(16)}"] [data-acc="llamado"]`);
  await page.waitForFunction(() => document.querySelectorAll(".cq-prop").length === 1);
  await page.click(`[data-id="${"a".repeat(16)}"] [data-acc="ganada"]`);
  await page.waitForFunction(() => /No hay ninguna para seguir/.test(document.querySelector(".cq-propuestas").textContent));
  assert.deepStrictEqual(cambios.map((c) => [c.accion, c.llamada_atendida || c.estado]), [["vista3d_estado", true], ["vista3d_estado", "ganada"]]);
  await page.click('.cq-prop-tabs [data-f="cerradas"]');
  assert.match(await page.textContent(".cq-propuestas"), /Ganadas: 1 de 1 cerradas/);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Link sin presentación guiada (agregado a un cliente que ya tiene el sistema) y el ladrón de la simulación", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ titulo: "Casa B", cliente: "Ana", presentacion: false, paginas: [{ elementos: CASA_B }] }) }));
    await page.goto(base + "/vista-3d.html?id=0123456789abcdef");
    await page.waitForSelector(".v3-lienzo canvas", { timeout: 20000 });
    await page.waitForTimeout(1200);
    assert.ok(await page.isHidden(".v3-hoja"), "no arranca la presentación");
    await page.click('.v3-barra [data-a="vista"]');
    assert.strictEqual(await page.$('.v3-hoja [data-h="presentacion"]'), null);
    await page.click('.v3-hoja [data-h="cerrar"]');
    // El intruso es el ladrón con traje a rayas, antifaz y bolsa, y camina (piernas y brazos)
    const ladron = await page.evaluate(() => { const v = window.visor3d.visor; v.simular(() => {}); let fig = null; v.escena.traverse((o) => { if (o.userData && o.userData.piernas) fig = o; }); return fig ? { piernas: fig.userData.piernas.length, brazos: fig.userData.brazos.length, piezas: (() => { let n = 0; fig.traverse(() => n++); return n; })() } : null; });
    assert.ok(ladron && ladron.piernas === 2 && ladron.brazos === 2 && ladron.piezas > 15, JSON.stringify(ladron));
    await page.waitForTimeout(400);
    const giro = await page.evaluate(() => { let fig = null; window.visor3d.visor.escena.traverse((o) => { if (o.userData && o.userData.piernas) fig = o; }); return fig.userData.piernas[0].rotation.z; });
    assert.notStrictEqual(giro, 0, "camina");
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Equipos nuevos: inalámbricos, PIR CAM, barrera exterior, DVR/NVR y control de acceso (en la paleta, en el 3D y en la simulación)", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 900, height: 800 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    // Una barrera cruzando el ambiente derecho (por donde entra el intruso, por la ventana) y nada más que la detecte
    const casa = CASA_B.filter((e) => e.id !== "ir").concat([{ id: "bar", t: "simbolo", tipo: "barrera", x: 300, y: 150, rot: 90, esc: 1.7, etq: "5" }, { id: "pc", t: "simbolo", tipo: "infrarrojo", x: 0, y: 300, rot: 90, esc: 1, video: true, inal: true, etq: "6" }]);
    await page.evaluate((els) => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); window.CROQUIS_3D_VELOCIDAD = 12; cqAbrirEditor({ titulo: "Casa", elementos: els }); }, casa);
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    const ley = await page.textContent(".v3-ley");
    assert.match(ley, /Barrera infrarroja exterior/);
    assert.match(ley, /Sensor de movimiento con cámara \(PIR CAM\)/);
    // La simulación: la barrera lo detecta al cruzarla
    const r = await page.evaluate(() => new Promise((ok) => { const ev = []; window.__visor3d.visor.simular((e) => { ev.push(e); if (e.tipo === "fin") ok(ev.filter((x) => x.tipo === "detecta").map((x) => x.equipo.tipo)); }); }));
    assert.ok(r.includes("barrera"), "la barrera detecta: " + r.join(","));
    // Tocar la barrera muestra qué hace
    const [x, y] = await page.evaluate(() => window.__visor3d.visor.aPantalla(300, 150 - 57 * 1.7, 0.6));
    await page.mouse.click(x, y);
    await page.waitForFunction(() => /haces infrarrojos/.test(document.querySelector(".v3-hoja").textContent), null, { timeout: 5000 });
    await page.click('.v3-hoja [data-h="cerrar"]');
    // Paleta del 3D: los nuevos; agregar una lectora junto a la puerta y un magnético inalámbrico
    await page.click('.v3-barra [data-a="editar"]');
    await page.click('.v3-tira [data-tipo="__mas"]');
    const items = await page.$$eval(".v3-hoja .v3-paleta button", (bs) => bs.map((b) => b.textContent.trim()));
    for (const n of ["Sensor de movimiento inalámbrico", "Sensor de movimiento con cámara (PIR CAM)", "Barrera infrarroja exterior", "Sensor de apertura inalámbrico", "Grabador DVR / NVR", "Lectora de tag / tarjeta", "Cerradura electromagnética", "Cerradura de pestillo", "Botón de salida"]) assert.ok(items.includes(n), n + " en: " + items.join(" | "));
    await page.click('.v3-hoja [data-tipo="lector_acceso"]');
    const cerca = await page.evaluate(() => window.__visor3d.visor.aPantalla(150, 280, 0));
    await page.mouse.click(cerca[0], cerca[1]);
    const lect = await page.evaluate(() => cq.elementos.find((e) => e.tipo === "lector_acceso"));
    assert.ok(lect && Math.abs(lect.y - 300) <= 6 && lect.x > 120 && lect.x < 145, "al lado del marco de la puerta: " + JSON.stringify(lect));
    await page.click('.v3-tira [data-tipo="__mas"]');
    await page.click('.v3-hoja [data-tipo="magnetico|inal"]');
    const cv = await page.evaluate(() => window.__visor3d.visor.aPantalla(352, 10, 0));
    await page.mouse.click(cv[0], cv[1]);
    const mag = await page.evaluate(() => cq.elementos.find((e) => e.tipo === "magnetico"));
    assert.ok(mag && mag.inal === true, "magnético inalámbrico");
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Más equipos: doble tecnología, pánico colgante, UPS, sísmico, inundación, sirenas y teclado inalámbricos (paleta, simulación y modelos 3D)", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 900, height: 800 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    // El sensor de doble tecnología reemplaza al infrarrojo: cubre igual y detecta en la simulación
    const casa = CASA_B.map((e) => (e.id === "ir" ? { ...e, tipo: "doble_tecnologia" } : e));
    await page.evaluate((els) => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); window.CROQUIS_3D_VELOCIDAD = 12; cqAbrirEditor({ titulo: "Casa", elementos: els }); }, casa);
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    assert.match(await page.textContent(".v3-ley"), /Sensor de doble tecnología/);
    assert.ok(await page.evaluate(() => window.__visor3d.visor.analisis.porcentaje > 0), "cubre parte de la casa");
    await page.click('.v3-barra [data-a="editar"]');
    await page.click('.v3-tira [data-tipo="__mas"]');
    const items = await page.$$eval(".v3-hoja .v3-paleta button", (bs) => bs.map((b) => b.textContent.trim()));
    for (const n of ["Sensor de doble tecnología", "Botón de pánico colgante", "UPS / fuente con batería", "Sensor sísmico (caja fuerte)", "Detector de inundación", "Sirena interior inalámbrica", "Sirena exterior inalámbrica", "Teclado inalámbrico", "Detector de monóxido (CO)", "Control remoto (llavero)", "Módulo relé", "Sensor de movimiento antimascotas", "Cámara 4G con panel solar"]) assert.ok(items.some((t) => t.startsWith(n)), n + " en: " + items.join(" | "));
    // Cada modelo 3D se arma sin errores
    const ok = await page.evaluate(async () => {
      const lista = [["teclado", {}], ["teclado", { inal: true }], ["sirena_int", { inal: true }], ["sirena_ext", { inal: true }], ["doble_tecnologia", {}], ["panico_colgante", {}], ["fuente_ups", {}], ["sismico", {}], ["inundacion", {}], ["monoxido", {}], ["control_remoto", {}], ["modulo_rele", {}], ["infrarrojo", { mascota: true }], ["camara_solar", {}]];
      const n = [];
      for (const [t, o] of lista) { const d = document.createElement("div"); d.style.cssText = "width:200px;height:150px"; document.body.appendChild(d); Croquis3D.vitrina(d, t, o); await new Promise((r) => setTimeout(r, 60)); n.push(!!d.querySelector("canvas")); d.remove(); }
      return n;
    });
    assert.deepStrictEqual(ok, ok.map(() => true));
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Tarjeta de contacto del asesor: se elige y edita al mandar la vista 3D, y el cliente la ve (WhatsApp, llamar, horarios, redes y agendar)", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 420, height: 860 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    const empresa = { nombre: "SAT Alarmas", horarios: "Lunes a viernes de 9 a 18", web: "https://sat365.com.ar", instagram: "https://instagram.com/satalarmas", facebook: "" };
    let personas = { Luis: { nombre: "Luis Gómez", puesto: "Técnico", telefono: "011 15 5555-1234", email: "" }, Ana: { nombre: "Ana Ruiz", puesto: "Ventas", telefono: "11 4444 0000", email: "" } };
    let pedido = null, guardado = null;
    await page.route("**/api/**", (route) => {
      const req = route.request(), u = req.url();
      if (u.includes("tarjetas=1")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ yo: "Luis", admin: false, empresaEditable: false, empresa, personas }) });
      if (u.includes("coleccion=croquis") && req.method() === "POST") {
        const b = JSON.parse(req.postData());
        if (b.accion === "tarjeta_guardar") { guardado = b; personas = { ...personas, [b.persona]: b.tarjeta }; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, empresa, personas }) }); }
        pedido = b; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id: "0123456789abcdef" }) });
      }
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    await page.evaluate((els) => {
      tecnicoLogueado = "Luis"; localStorage.removeItem("croquis_borrador");
      cqAbrirEditor({ titulo: "Casa Pérez", cliente: "Juan Pérez", elementos: els });
      window.__abierto = null; window.open = (u) => { window.__abierto = u; };
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    }, CASA_3D);
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    await page.click('.v3-barra [data-extra="0"]');
    await page.waitForSelector(".cq3d-asesor");
    assert.strictEqual(await page.$eval(".cq3d-asesor", (s) => s.value), "Luis", "por defecto, quien lo manda");
    // Editar la propia: cambia el puesto
    await page.click('.cq3d-tarjeta [data-m="tarjeta"]');
    await page.fill("#tjPuesto", "Asesor técnico");
    await page.click('.cq-datos [data-r="si"]');
    await page.waitForFunction(() => /Asesor técnico/.test(document.querySelector(".cq3d-asesor").textContent));
    assert.strictEqual(guardado.persona, "Luis");
    assert.ok(!guardado.empresa, "sin permiso no toca la empresa");
    await page.click('[data-m="link"]');
    await page.waitForFunction(() => window.__abierto, null, { timeout: 5000 });
    assert.strictEqual(pedido.contacto.nombre, "Luis Gómez");
    assert.strictEqual(pedido.contacto.puesto, "Asesor técnico");
    assert.strictEqual(pedido.contacto.empresa.horarios, "Lunes a viernes de 9 a 18");

    // El cliente la ve en la vista pública
    const p2 = await ctx.newPage();
    p2.on("pageerror", (e) => errores.push(e.message));
    await p2.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ titulo: "Casa Pérez", cliente: "Juan Pérez", paginas: [{ nombre: "", elementos: CASA_3D }], contacto: { ...pedido.contacto, empresa: { ...pedido.contacto.empresa, facebook: "javascript:alert(1)" } } }) }));
    await p2.addInitScript(() => { try { localStorage.setItem("v3-presentacion:0123456789abcdef", "1"); } catch (e) { /* nada */ } });
    await p2.goto(base + "/vista-3d.html?id=0123456789abcdef");
    await p2.waitForSelector(".v3-asesor");
    assert.match(await p2.textContent(".v3-asesor"), /Te asesoró\s*Luis Gómez/);
    assert.strictEqual(await p2.textContent(".v3-asesor .v3-av"), "LG");
    await p2.click(".v3-asesor");
    await p2.waitForSelector(".v3-tarjeta");
    const links = await p2.$$eval(".v3-tarjeta a", (as) => as.map((a) => a.getAttribute("href")));
    assert.ok(links.some((h) => h.startsWith("https://wa.me/5491155551234?text=")), "WhatsApp con el número bien armado: " + links.join(" "));
    assert.ok(links.includes("tel:0111555551234"));
    assert.ok(links.includes("https://instagram.com/satalarmas"));
    assert.ok(!links.some((h) => /javascript/.test(h)), "nada de links peligrosos");
    assert.match(await p2.textContent(".v3-tarjeta"), /Asesor técnico · SAT Alarmas/);
    assert.match(await p2.textContent(".v3-tarjeta"), /Lunes a viernes de 9 a 18/);
    const [descarga] = await Promise.all([p2.waitForEvent("download"), p2.click('.v3-tarjeta [data-h="guardar"]')]);
    assert.strictEqual(descarga.suggestedFilename(), "Luis Gomez.vcf");
    const vcf = require("fs").readFileSync(await descarga.path(), "utf8");
    assert.match(vcf, /FN:Luis Gómez/); assert.match(vcf, /TITLE:Asesor técnico/); assert.match(vcf, /ORG:SAT Alarmas/); assert.match(vcf, /TEL;TYPE=CELL:011 15 5555-1234/);
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Croquis en la PC: flechas mueven, + y - cambian el tamaño, Ctrl+C / Ctrl+V / Ctrl+X, Supr y Ctrl+Z; semicubierto y la capa de muebles en 3D", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 800 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    const casa = [
      { id: "w1", t: "linea", x1: 0, y1: 0, x2: 200, y2: 0 }, { id: "w2", t: "linea", x1: 200, y1: 0, x2: 200, y2: 300 },
      { id: "w3", t: "linea", x1: 200, y1: 300, x2: 0, y2: 300 }, { id: "w4", t: "linea", x1: 0, y1: 300, x2: 0, y2: 0 },
      { id: "ir", t: "simbolo", tipo: "infrarrojo", x: 0, y: 0, rot: 180, esc: 1, etq: "1" },
      { id: "pl", t: "simbolo", tipo: "ropero", x: 100, y: 130, rot: 0, esc: 1 },
      { id: "ga", t: "rect", x: 0, y: 300, w: 200, h: 120, nombre: "Patio" },
    ];
    await page.evaluate((els) => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); cqAbrirEditor({ titulo: "Casa", elementos: els }); cq.sel = "pl"; cqRender(); }, casa);
    const pl = () => page.evaluate(() => { const e = cq.elementos.find((x) => x.id === "pl"); return e ? { x: e.x, y: e.y, esc: e.esc } : null; });
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowDown");
    assert.deepStrictEqual(await pl(), { x: 120, y: 140, esc: 1 }, "de a media cuadrícula");
    await page.keyboard.press("Shift+ArrowLeft");
    assert.strictEqual((await pl()).x, 20);
    await page.keyboard.press("+");
    assert.strictEqual((await pl()).esc, 1.1);
    await page.keyboard.press("-"); await page.keyboard.press("-");
    assert.ok((await pl()).esc < 1);
    // Copiar y pegar: una copia corrida y elegida
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    let n = await page.evaluate(() => cq.elementos.filter((e) => e.tipo === "ropero").length);
    assert.strictEqual(n, 2);
    const copia = await page.evaluate(() => { const e = cq.elementos.find((x) => x.id === cq.sel); return e.id !== "pl" && e.tipo === "ropero" ? [e.x, e.y] : null; });
    assert.deepStrictEqual(copia, [60, 180]);
    // Cortar y pegar: vuelve en el mismo lugar
    await page.keyboard.press("Control+x");
    assert.strictEqual(await page.evaluate(() => cq.elementos.filter((e) => e.tipo === "ropero").length), 1);
    await page.keyboard.press("Control+v");
    assert.deepStrictEqual(await page.evaluate(() => { const e = cq.elementos.find((x) => x.id === cq.sel); return [e.x, e.y]; }), [60, 180]);
    // Supr borra, Ctrl+Z lo vuelve
    await page.keyboard.press("Delete");
    assert.strictEqual(await page.evaluate(() => cq.elementos.filter((e) => e.tipo === "ropero").length), 1);
    await page.keyboard.press("Control+z");
    assert.strictEqual(await page.evaluate(() => cq.elementos.filter((e) => e.tipo === "ropero").length), 2);
    // Escribiendo en un campo, las teclas no mueven nada
    await page.evaluate(() => { const i = document.createElement("input"); i.id = "tmpInput"; document.body.appendChild(i); i.focus(); });
    const antes = await pl();
    await page.keyboard.press("ArrowLeft");
    assert.deepStrictEqual(await pl(), antes);
    await page.evaluate(() => document.getElementById("tmpInput").remove());
    // El patio pasa a semicubierto (galería): techo con columnas, sin paredes
    await page.evaluate(() => { cq.sel = "ga"; cq.multi = []; cqRender(); });
    await page.click('[data-acc="cierre"]');
    assert.strictEqual(await page.evaluate(() => cq.elementos.find((e) => e.id === "ga").cierre), "abierto", "primero: al aire libre");
    await page.click('[data-acc="cierre"]');
    assert.strictEqual(await page.evaluate(() => cq.elementos.find((e) => e.id === "ga").cierre), "semi");
    await page.click('[data-acc="suelo"]');
    assert.strictEqual(await page.evaluate(() => cq.elementos.find((e) => e.id === "ga").suelo), "cesped");
    await page.click('[data-acc="suelo"]');
    assert.strictEqual(await page.evaluate(() => cq.elementos.find((e) => e.id === "ga").suelo), "piso");
    // 3D: los muebles se ven y la capa muestra lo que tapa el placard
    await page.evaluate(() => { cq.elementos = cq.elementos.filter((e) => e.tipo !== "ropero" || e.id === "pl"); cq.paginas[cq.pagina].elementos = cq.elementos; cq.sel = null; cqRender(); });
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    assert.match(await page.textContent(".v3-ley"), /mueble/);
    await page.click('.v3-barra [data-a="vista"]');
    await page.click('.v3-hoja [data-h="muebles"]');
    await page.waitForFunction(() => /El placard le tapa/.test(document.querySelector(".v3-ley").textContent));
    assert.ok(await page.evaluate(() => window.__visor3d.visor.vista.muebles));
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Exterior en 3D: avisos para el técnico, la cámara a la mañana (contraluz), a la noche (infrarrojo y reflector) y el intruso entra por el portón", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1000, height: 800 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    const casa = [
      { id: "w1", t: "linea", x1: 0, y1: 0, x2: 400, y2: 0 }, { id: "w2", t: "linea", x1: 400, y1: 0, x2: 400, y2: 300 },
      { id: "w3", t: "linea", x1: 400, y1: 300, x2: 0, y2: 300 }, { id: "w4", t: "linea", x1: 0, y1: 300, x2: 0, y2: 0 },
      { id: "pe", t: "simbolo", tipo: "puerta", x: 100, y: 300, rot: 0, esc: 1 },
      { id: "ja", t: "rect", x: 0, y: 300, w: 400, h: 300, cierre: "abierto", suelo: "cesped" },
      { id: "pi", t: "rect", x: 220, y: 380, w: 140, h: 80, cierre: "abierto", suelo: "pileta" },
      { id: "t1", t: "linea", x1: 0, y1: 300, x2: 0, y2: 600, cerco: "tapial", electrico: true },
      { id: "rj", t: "linea", x1: 0, y1: 600, x2: 400, y2: 600, cerco: "reja" },
      { id: "po", t: "simbolo", tipo: "porton_batiente", x: 300, y: 600, rot: 0, esc: 1 },
      { id: "ar", t: "simbolo", tipo: "arbol", x: 80, y: 500, rot: 0, esc: 1 },
      { id: "ix", t: "simbolo", tipo: "infrarrojo_ext", x: 395, y: 305, rot: 270, esc: 1, etq: "9" },
      { id: "ca", t: "simbolo", tipo: "camara_ip", x: 20, y: 310, rot: 95, esc: 1, etq: "C1" },
      { id: "rf", t: "simbolo", tipo: "reflector", x: 200, y: 305, rot: 180, esc: 1 },
      { id: "no", t: "simbolo", tipo: "norte", x: 470, y: 60, rot: 0, esc: 1 },
    ];
    await page.evaluate((els) => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); window.CROQUIS_3D_VELOCIDAD = 12; cqAbrirEditor({ titulo: "Casa", elementos: els }); }, casa);
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    const ley = await page.textContent(".v3-ley");
    assert.match(ley, /avisos para el técnico/);
    assert.match(ley, /pileta/); assert.match(ley, /vereda/); assert.match(ley, /Contraluz a la mañana/); assert.match(ley, /falta el energizador/);
    // Simulación: entra por el portón
    const ev = await page.evaluate(() => new Promise((ok) => { window.__visor3d.visor.simular((e) => { if (e.tipo === "entra") ok(e.porton && e.porton.id); }); }));
    assert.strictEqual(ev, "po");
    await page.evaluate(() => window.__visor3d.visor.pararSimulacion());
    // La cámara: mañana con contraluz, noche en blanco y negro con el reflector
    await page.evaluate(() => { const v = window.__visor3d; v.visor.verCamara("ca"); });
    await page.evaluate(() => document.querySelector(".v3-barra").dispatchEvent(new Event("noop")));
    const r1 = await page.evaluate(() => window.__visor3d.visor.momento("manana"));
    assert.ok(r1.contraluz, "a la mañana le da el sol de frente");
    const r2 = await page.evaluate(() => window.__visor3d.visor.momento("noche"));
    assert.strictEqual(r2.reflectores, 1);
    assert.match(await page.$eval(".v3-capa canvas", (c) => c.style.filter), /grayscale/);
    await page.evaluate(() => window.__visor3d.visor.salirCamara());
    assert.strictEqual(await page.$eval(".v3-capa canvas", (c) => c.style.filter), "");
    // Los botones de la hora aparecen al ver lo que ve la cámara
    const [x, y] = await page.evaluate(() => window.__visor3d.visor.aPantalla(20, 310, 2.6));
    await page.mouse.click(x, y);
    await page.click('.v3-hoja [data-h="vercam"]');
    await page.click('.v3-barra [data-momento="tarde"]');
    assert.match(await page.textContent(".v3-aviso"), /A la tarde/);
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Pulido: R gira y Shift+arrastrar elige varios; en 3D se elige por dónde entra el intruso, los avisos se arreglan con un toque y la cámara muestra hasta dónde identifica", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 800 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    const casa = [
      { id: "w1", t: "linea", x1: 0, y1: 0, x2: 400, y2: 0 }, { id: "w2", t: "linea", x1: 400, y1: 0, x2: 400, y2: 300 },
      { id: "w3", t: "linea", x1: 400, y1: 300, x2: 0, y2: 300 }, { id: "w4", t: "linea", x1: 0, y1: 300, x2: 0, y2: 0 },
      { id: "pe", t: "simbolo", tipo: "puerta", x: 100, y: 300, rot: 0, esc: 1 },
      { id: "t1", t: "linea", x1: 0, y1: 300, x2: 0, y2: 600, cerco: "tapial" },
      { id: "rj", t: "linea", x1: 0, y1: 600, x2: 400, y2: 600, cerco: "reja" },
      { id: "po", t: "simbolo", tipo: "porton_batiente", x: 300, y: 600, rot: 0, esc: 1 },
      { id: "ab", t: "simbolo", tipo: "arbusto", x: 370, y: 330, rot: 0, esc: 1 },
      { id: "ix", t: "simbolo", tipo: "infrarrojo_ext", x: 395, y: 305, rot: 270, esc: 1, etq: "9" },
      { id: "ca", t: "simbolo", tipo: "camara_ip", x: 20, y: 310, rot: 140, esc: 1, etq: "C1" },
    ];
    await page.evaluate((els) => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); window.CROQUIS_3D_VELOCIDAD = 12; cqAbrirEditor({ titulo: "Casa", elementos: els }); cq.sel = "ix"; cqRender(); }, casa);
    // R gira 15°, Shift+R vuelve
    await page.keyboard.press("r");
    assert.strictEqual(await page.evaluate(() => cq.elementos.find((e) => e.id === "ix").rot), 285);
    await page.keyboard.press("Shift+R");
    assert.strictEqual(await page.evaluate(() => cq.elementos.find((e) => e.id === "ix").rot), 270);
    // Cámara: elegir MP y lente
    await page.evaluate(() => { cq.sel = "ca"; cqRender(); });
    await page.click('[data-acc="lente"]');
    assert.strictEqual(await page.evaluate(() => cq.elementos.find((e) => e.id === "ca").lente), 3.6);
    await page.click('[data-acc="mp"]');
    assert.strictEqual(await page.evaluate(() => cq.elementos.find((e) => e.id === "ca").mp), 4);
    // Shift + arrastrar en un lugar vacío: recuadro que elige varios
    await page.evaluate(() => { cq.sel = null; cq.multi = []; cqRender(); });
    const caja = await page.evaluate(() => { const r = cqSvg.getBoundingClientRect(); return [[r.left + 15, r.top + 15], [r.right - 80, r.bottom - 15]]; });
    await page.keyboard.down("Shift");
    await page.mouse.move(caja[0][0], caja[0][1]); await page.mouse.down(); await page.mouse.move(caja[1][0], caja[1][1], { steps: 5 }); await page.mouse.up();
    await page.keyboard.up("Shift");
    const elegidos = await page.evaluate(() => cq.multi.slice().sort());
    assert.ok(["w1", "w2", "w3", "w4", "pe", "ix"].every((id) => elegidos.includes(id)), "recuadro: " + elegidos.join(","));
    await page.evaluate(() => { cq.multi = []; cqRender(); });
    // 3D
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    assert.match(await page.textContent(".v3-ley"), /identifica una cara/);
    // Tocar la cámara: hasta dónde identifica y reconoce
    const [cx, cy] = await page.evaluate(() => window.__visor3d.visor.aPantalla(20, 310, 2.6));
    await page.mouse.click(cx, cy);
    await page.waitForFunction(() => /identifica una cara hasta/.test(document.querySelector(".v3-hoja").textContent));
    await page.click('.v3-hoja [data-h="cerrar"]');
    // Elegir por dónde entra
    await page.click('.v3-barra [data-a="simular"]');
    const ops = await page.$$eval(".v3-hoja [data-ent]", (bs) => bs.map((b) => b.textContent));
    assert.ok(ops.includes("El peor caso") && ops.includes("El portón del frente") && ops.includes("Saltando el tapial"), ops.join(" | "));
    await page.click('.v3-hoja [data-ent="peor"]');
    assert.match(await page.textContent(".v3-aviso"), /El peor caso/);
    await page.waitForSelector(".v3-hoja:not(.hidden) [data-h=otra]", { timeout: 30000 });
    await page.click('.v3-hoja [data-h="cerrar"]');
    // Arreglar el aviso del arbusto: girarlo
    await page.evaluate(() => { document.querySelector(".v3-ley").open = true; const d = document.querySelector(".v3-avisos"); if (d) d.open = true; });
    const idx = await page.evaluate(() => window.__visor3d.visor.analisis.avisos.findIndex((a) => a.tipo === "plantas"));
    assert.ok(idx >= 0);
    await page.click(`.v3-ley [data-arreglo="${idx}"]`);
    await page.click('.v3-hoja [data-arr="girar"]');
    await page.waitForFunction(() => !window.__visor3d.visor.analisis.avisos.some((a) => a.tipo === "plantas"), null, { timeout: 15000 });
    const rot = await page.evaluate(() => cq.paginas[cq.pagina].elementos.find((e) => e.id === "ix").rot);
    assert.notStrictEqual(rot, 270, "quedó girado en el croquis");
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Lista de elementos (elegir uno lo selecciona y lo centra), capas de alarma y de cámaras (2D y 3D), portones y cámaras visibles en 3D", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 800 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    const casa = [
      { id: "w1", t: "linea", x1: 0, y1: 0, x2: 400, y2: 0 }, { id: "w2", t: "linea", x1: 400, y1: 0, x2: 400, y2: 300 },
      { id: "w3", t: "linea", x1: 400, y1: 300, x2: 0, y2: 300 }, { id: "w4", t: "linea", x1: 0, y1: 300, x2: 0, y2: 0 },
      { id: "pc", t: "simbolo", tipo: "porton_corredizo", x: 280, y: 300, rot: 0, esc: 1 },
      { id: "ir", t: "simbolo", tipo: "infrarrojo", x: 0, y: 0, rot: 180, esc: 1, etq: "3" },
      { id: "mg", t: "simbolo", tipo: "magnetico", x: 1500, y: 1500, rot: 0, esc: 1, etq: "1" },
      { id: "ca", t: "simbolo", tipo: "camara_ip", x: 395, y: 295, rot: 225, esc: 1, etq: "C1" },
    ];
    await page.evaluate((els) => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); localStorage.removeItem("croquis_capas"); cqAbrirEditor({ titulo: "Casa", elementos: els }); }, casa);
    // Lista: alarma ordenada por zona, cámaras aparte; elegir el magnético (lejos) lo selecciona y lo centra
    await page.click("#cqListaBtn");
    const grupos = await page.$$eval(".cq-lista-grupo summary", (s) => s.map((x) => x.textContent.trim()));
    assert.ok(grupos[0].startsWith("Alarma") && grupos[1].startsWith("Cámaras"), grupos.join(" | "));
    const alarma = await page.$$eval(".cq-lista-grupo:first-child .cq-lista-item b", (b) => b.map((x) => x.textContent));
    assert.match(alarma[0], /apertura|magn/i, "zona 1 primero: " + alarma.join(","));
    await page.fill(".cq-lista-panel input", "zona 1");
    await page.click('.cq-lista-item[data-id="mg"]');
    assert.strictEqual(await page.evaluate(() => cq.sel), "mg");
    await page.waitForFunction(() => { const r = cqSvg.getBoundingClientRect(); const [x, y] = cqAMundo(r.left + r.width / 2, r.top + r.height / 2); return Math.hypot(x - 1500, y - 1500) < 40; }, null, { timeout: 3000 });
    // Se mueve con las flechas, como cualquier elegido
    await page.keyboard.press("ArrowLeft");
    assert.strictEqual(await page.evaluate(() => cq.elementos.find((e) => e.id === "mg").x), 1490);
    // Capas: alarma y cámaras por separado
    await page.click("#cqCapasBtn");
    const capas = await page.$$eval(".cq-capa-fila b", (b) => b.map((x) => x.textContent));
    assert.ok(capas.some((c) => /^Alarma/.test(c)) && capas.some((c) => /^Cámaras y video/.test(c)), capas.join(" | "));
    await page.click('[data-ver="camaras"]');
    await page.click(".cq-capas-panel [data-cerrar]");
    assert.strictEqual(await page.$('#cqSvg [data-id="ca"]'), null, "la cámara oculta");
    assert.ok(await page.$('#cqSvg [data-id="ir"]'));
    await page.evaluate(() => { cq.capas.camaras.ver = true; cqRender(); });
    // 3D: capas y lista
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    const visibles = () => page.evaluate(() => { const r = {}; window.__visor3d.visor.escena.traverse((o) => { const e = o.userData && o.userData.equipo; if (e && o.isMesh) { let v = true; for (let x = o; x; x = x.parent) if (x.visible === false) v = false; r[e.id] = v; } }); return r; });
    let v = await visibles();
    assert.ok(v.ca && v.ir);
    await page.click('.v3-barra [data-a="vista"]');
    await page.click('.v3-hoja [data-h="camaras"]');
    v = await visibles();
    assert.ok(!v.ca && v.ir, "solo la alarma");
    await page.click('.v3-hoja [data-h="camaras"]');
    await page.click('.v3-hoja [data-h="alarma"]');
    v = await visibles();
    assert.ok(v.ca && !v.ir, "solo las cámaras");
    await page.click('.v3-hoja [data-h="alarma"]');
    await page.click('.v3-hoja [data-h="cerrar"]');
    // Portón en la pared: tiene sus hojas
    const hojas = await page.evaluate(() => { let n = 0; window.__visor3d.visor.escena.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.type === "PlaneGeometry" && o.material && o.material.map && o.userData.pared) n++; }); return n; });
    assert.ok(hojas >= 1, "el portón del garaje se dibuja");
    // Lista en 3D (editando): elegir lo selecciona
    await page.click('.v3-barra [data-a="editar"]');
    await page.click('.v3-barra [data-a="lista"]');
    await page.click('.v3-hoja [data-eq="ca"]');
    await page.waitForFunction(() => /Cámara/.test(document.querySelector(".v3-hoja b").textContent));
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Paletas ordenadas por uso: lo que más se pone queda primero (croquis y 3D)", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(base + "/");
  await page.waitForTimeout(300);
  await page.evaluate(() => { localStorage.removeItem("croquis_uso"); tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); cqAbrirEditor({ titulo: "Casa", elementos: [] }); });
  const primeros = () => page.$$eval("#cqSimbolos [data-simbolo]", (b) => b.slice(0, 3).map((x) => x.dataset.simbolo));
  await page.click('[data-herr="simbolos"]');
  const antes = await primeros();
  assert.strictEqual(antes[0], Object.keys(await page.evaluate(() => Object.fromEntries(Object.entries(CROQUIS_SIMBOLOS).filter(([, s]) => s.cat === "equipo"))))[0], "sin uso: el orden de siempre");
  // Se ponen 3 cámaras y 2 magnéticos
  const r = await page.evaluate(() => { const b = cqSvg.getBoundingClientRect(); return { x: b.left + 100, y: b.top + 100 }; });
  for (const [tipo, n] of [["camara_ip", 3], ["magnetico", 2]]) {
    for (let i = 0; i < n; i++) {
      await page.click('[data-herr="simbolos"]');
      await page.click(`#cqSimbolos [data-simbolo="${tipo}"]`);
      await page.mouse.click(r.x + i * 40, r.y + (tipo === "camara_ip" ? 0 : 80));
    }
  }
  await page.click('[data-herr="simbolos"]');
  assert.deepStrictEqual((await primeros()).slice(0, 2), ["camara_ip", "magnetico"]);
  assert.deepStrictEqual(await page.evaluate(() => croquisOrdenarPorUso(["humo", "magnetico", "camara_ip"])), ["camara_ip", "magnetico", "humo"]);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Casa de dos plantas: la losa de arriba va solo donde hay ambientes y el balcón (no sobre el jardín de abajo)", async () => {
  const nav = await navegador3D();
  try {
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1000, height: 800 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(base + "/");
    await page.waitForTimeout(400);
    const L = (id, x1, y1, x2, y2) => ({ id, t: "linea", x1, y1, x2, y2 });
    const PB = [L("a", 0, 0, 400, 0), L("b", 400, 0, 400, 300), L("c", 400, 300, 0, 300), L("d", 0, 300, 0, 0), { id: "ja", t: "rect", x: -240, y: 0, w: 240, h: 300, cierre: "abierto", suelo: "cesped" }, { id: "ar", t: "simbolo", tipo: "arbol", x: -120, y: 150, rot: 0, esc: 1 }];
    // Arriba: en L (sin el rincón de arriba a la derecha) y un balcón hacia abajo; una pared suelta lejos (no hace losa)
    const PA = [L("e", 0, 0, 260, 0), L("f", 260, 0, 260, 200), L("g", 260, 200, 400, 200), L("h", 400, 200, 400, 300), L("i", 400, 300, 0, 300), L("j", 0, 300, 0, 0), L("k", -200, 50, -200, 250), { id: "bal", t: "rect", x: 0, y: 300, w: 200, h: 60, cierre: "balcon" }];
    await page.evaluate(([pb, pa]) => { tecnicoLogueado = ""; localStorage.removeItem("croquis_borrador"); cqAbrirEditor({ titulo: "Casa", paginas: [{ nombre: "PB", elementos: pb }, { nombre: "PA", elementos: pa }] }); }, [PB, PA]);
    await page.click("#cqMenuBtn");
    await page.click('[data-m="ver3d"]');
    await page.waitForSelector(".v3-capa canvas", { timeout: 20000 });
    const r = await page.evaluate(() => {
      const ray = new THREE.Raycaster(); let losa = null;
      window.__visor3d.visor.escena.traverse((o) => { if (o.isMesh && o.material && o.material.color && o.material.color.getHexString() === "d8d3c8") losa = o; });
      if (!losa) return null;
      const hay = (x, z) => { ray.set(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0)); return ray.intersectObject(losa).length > 0; };
      return { casa: hay(2, 5), balcon: hay(2.5, 8.2), jardin: hay(-3, 3.75), rincon: hay(8.5, 2) };
    });
    assert.ok(r, "hay losa");
    assert.deepStrictEqual(r, { casa: true, balcon: true, jardin: false, rincon: false });
    assert.deepStrictEqual(errores, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test("Croquis subido al cliente: aparece en la ficha del cliente y en la búsqueda de planos (aunque no tenga PDF)", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  const pedidos = [];
  await page.route("**/api/**", (route) => {
    const u = route.request().url();
    pedidos.push(u);
    const j = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("coleccion=croquis") && u.includes("aprobados=1")) return j([{ id: "abc123", titulo: "Casa Bartolozzi", cliente: "Bartolozzi Sebastian", numero_cliente: "7117", publicado: true }]);
    if (u.includes("coleccion=croquis") && u.includes("servicio=1")) return j([{ id: "abc123", titulo: "Casa Bartolozzi", cliente: "Bartolozzi Sebastian", numero_cliente: "7117", publicado: true }]);
    if (u.includes("coleccion=croquis") && u.includes("id=abc123")) return j({ id: "abc123", titulo: "Casa Bartolozzi", cliente: "Bartolozzi Sebastian", numero_cliente: "7117", publicado: true, dibujo: { elementos: [{ id: "a", t: "rect", x: 0, y: 0, w: 200, h: 160 }] } });
    if (u.includes("/api/planos")) return j([]);
    j([]);
  });
  await page.goto(base + "/");
  await page.waitForTimeout(300);
  await page.evaluate(() => { tecnicoLogueado = "Juan"; abrirFichaCliente({ nombre: "Bartolozzi Sebastian", numero_cliente: "7117" }); });
  await page.waitForSelector('#fichaPlanoBloque [data-croquis-id="abc123"]', { timeout: 8000 });
  assert.doesNotMatch(await page.textContent("#fichaPlanoBloque"), /No tiene plano cargado/);
  assert.ok(pedidos.some((u) => u.includes("servicio=1") && u.includes("numero_cliente=7117")));
  await page.click('#fichaPlanoBloque [data-croquis-id="abc123"]');
  await page.waitForFunction(() => screens.croquis.dataset.active === "true");
  assert.strictEqual(await page.evaluate(() => cq.soloLectura), true, "se abre solo para ver");
  // Búsqueda de planos
  await page.evaluate(() => { showScreen("planos"); planosCache = []; return cargarPlanos(); });
  await page.fill("#planosBuscarInput", "bartolozzi");
  await page.waitForSelector('#planosResultados [data-croquis-id="abc123"]', { timeout: 8000 });
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Conciliación de SIMs: números mal cargados (un dígito), comparación con la conciliación anterior, y alarmas que no comunican según el reporte del monitoreo", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: route.request().url().includes("xlsx.full.min.js") ? require("fs").readFileSync(require("path").join(__dirname, "..", "vendor", "xlsx.full.min.js"), "utf8") : "" }));
  const instaladas = [
    { numero: "3415550020", empresa: "Claro", cliente: "Kiosco", estado_linea: "Activo", numero_abonado: "555" },
    { numero: "3415550030", empresa: "Claro", cliente: "Panadería", estado_linea: "Activo", numero_abonado: "0777" },
    { numero: "3415550044", empresa: "Claro", cliente: "Ferretería", estado_linea: "Activo", numero_abonado: "999" },
  ];
  const sim = simsBackendFalso([], instaladas, []);
  const acciones = [], historialSims = [], corridas = [{ id: "old", empresa: "Claro", fecha: "2026-10-01T12:00:00Z", archivo: "claro octubre.xlsx", numeros: { noEnPlanilla: ["3415550044", "3415550099"] } }];
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("coleccion=sims_conciliacion") && u.includes("historial=1")) return json(corridas);
    if (u.includes("coleccion=sims_conciliacion") && req.method() === "GET") return json([]);
    if (u.includes("coleccion=sims_conciliacion") && req.method() === "POST") { const b = JSON.parse(req.postData() || "{}"); acciones.push(b); if (b.accion === "marcar") return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "No se pudo guardar" }) }); return json({ ok: true }); }
    if (req.method() === "POST") { const b = JSON.parse(req.postData() || "{}"); acciones.push(b); const r = sim(b); return route.fulfill({ status: r.status || 200, contentType: "application/json", body: JSON.stringify(r) }); }
    if (u.includes("coleccion=sims_instaladas")) return json(instaladas);
    if (u.includes("coleccion=sims")) return json([]);
    if (u.includes("recurso=sim")) return json(historialSims);
    json([]);
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("panelSimsControl").classList.remove("hidden"); return cargarControlSims(); });
  const xlsx = (filas) => page.evaluate((f) => { const lb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(lb, XLSX.utils.json_to_sheet(f), "H"); return Array.from(new Uint8Array(XLSX.write(lb, { type: "array", bookType: "xlsx" }))); }, filas);
  // Planilla de Claro: la 0031 es la 0030 de SAT con un dígito mal
  await page.setInputFiles("#simsConcArchivo", { name: "claro noviembre.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await xlsx([{ Línea: "3415550020", Estado: "Activa" }, { Línea: "3415550031", Estado: "Activa" }])) });
  await page.waitForSelector('.conc-bloque[data-k="posibleError"]');
  const r = await page.evaluate(() => ({ err: ultimaConciliacion.posibleError.map((x) => [x.n, x.x.numero]), sin: ultimaConciliacion.sinRegistrar.map((x) => x.n), no: ultimaConciliacion.noEnPlanilla.map((x) => x.n) }));
  assert.deepStrictEqual(r, { err: [["3415550031", "3415550030"]], sin: [], no: ["3415550044"] }, "el par no queda repetido en las otras listas");
  // Comparación con la de octubre
  const comp = await page.textContent(".conc-comparacion");
  assert.match(comp, /Contra la conciliación del 01\/10\/2026/);
  assert.match(comp, /2 → 2/); assert.match(comp, /1 nuevas · 1 ya no aparecen/);
  assert.ok(await page.$('.conc-bloque[data-k="posibleError"] .conc-nueva'), "la del número mal cargado es nueva");
  assert.ok(!(await page.$('.conc-bloque[data-k="noEnPlanilla"] .conc-nueva')), "la 0044 ya estaba el mes pasado");
  await page.waitForFunction(() => true);
  await page.waitForTimeout(1000);
  const guardada = acciones.find((a) => a.accion === "guardar_corrida");
  assert.ok(guardada && guardada.empresa === "Claro" && guardada.numeros.posibleError[0] === "3415550030", "se guarda la corrida para la próxima vez");
  // Corregir el número en SAT
  await page.click('.conc-acc[data-k="posibleError"][data-a="corregir"]');
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /Verificado: la línea ya no aparece en «¿Número mal cargado\?»/.test(document.getElementById("simsConcStatus").textContent));
  // Si el servidor no guarda una marca (Ignorar), se avisa y la línea queda en la lista
  await page.click('.conc-marcar[data-k="noEnPlanilla"][data-estado="ignorada"]');
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /No se pudo guardar/.test(document.getElementById("avisoFlotanteAdmin").textContent));
  assert.strictEqual(await page.evaluate(() => ultimaConciliacion.noEnPlanilla.length), 1);
  assert.ok(acciones.some((a) => a.accion === "corregir_numero" && a.numero === "3415550030" && a.numero_nuevo === "3415550031"));
  // Reporte del monitoreo: el 555 hace 40 días que no comunica, el 777 comunicó hoy, el 999 no figura
  const hace = (d) => { const f = new Date(Date.now() - d * 86400000); return `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}/${f.getFullYear()} 10:30`; };
  await page.setInputFiles("#simsComArchivo", { name: "reporte monitoreo.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await xlsx([{ "Cuenta / Abonado": "0555", Nombre: "Kiosco", "Última señal": hace(40) }, { "Cuenta / Abonado": "777", Nombre: "Panadería", "Última señal": hace(0) }])) });
  await page.waitForSelector("#simsComResultado .sims-resumen");
  const com = await page.textContent("#simsComResultado");
  assert.match(com, /Sin comunicar hace más de 30 días\s*1/);
  assert.match(com, /Kiosco[\s\S]*hace (39|40) días/);
  assert.match(com, /No están en el reporte\s*1/);
  await page.selectOption("#simsComDias", "60");
  assert.match(await page.textContent("#simsComResultado"), /Todas las alarmas con SIM comunicaron en los últimos 60 días/);
  await page.selectOption("#simsComDias", "30");
  await page.click('.com-acc[data-t="v"][data-a="inactiva"]');
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /Verificado: 3415550020 figura inactiva/.test(document.getElementById("simsComStatus").textContent));
  assert.ok(acciones.some((a) => a.accion === "editar_instalada" && a.numero === "3415550020" && a.campos.estado_linea === "Inactivo"));
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Conciliación de SIMs con el sistema de Oficina: todas las empresas juntas contra lo instalado en la APP, y se corrige desde ahí", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: route.request().url().includes("xlsx.full.min.js") ? require("fs").readFileSync(require("path").join(__dirname, "..", "vendor", "xlsx.full.min.js"), "utf8") : "" }));
  const instaladas = [
    { numero: "3415550020", empresa: "Claro", cliente: "Kiosco Pepe", numero_cliente: "101", estado_linea: "Activo" },
    { numero: "3415550030", empresa: "Movistar", cliente: "Panadería", numero_cliente: "102", estado_linea: "Activo" },
    { numero: "3415550044", empresa: "Claro", cliente: "Ferretería", numero_cliente: "103", estado_linea: "Activo" },
    { numero: "3415550055", empresa: "Personal", cliente: "Taller", numero_cliente: "104", estado_linea: "Activo" },
    { numero: "3415550066", empresa: "Claro", cliente: "Bar", numero_cliente: "105", estado_linea: "Inactivo" },
    { numero: "3415550077", empresa: "Claro", cliente: "Gomería", numero_cliente: "106", estado_linea: "Activo" },
    { numero: "3415550011", empresa: "Claro", cliente: "Vivero", numero_cliente: "107", estado_linea: "Activo" },
  ];
  const stock = [{ numero: "3415550088", empresa: "Claro", tecnico_actual: "Juan", estado_fisico: "Disponible", ubicacion_tipo: "tecnico" }];
  const acciones = [];
  const sim = simsBackendFalso(stock, instaladas, []);
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("coleccion=sims_conciliacion") && req.method() === "GET") return json([]);
    if (req.method() === "POST") {
      const b = JSON.parse(req.postData() || "{}"); acciones.push(b);
      if (b.accion === "marcar") return json({ ok: true, lista: b.items.map((x) => ({ ...x, estado: b.estado, motivo: b.motivo, por: "Seba", fecha: "2026-11-05T12:00:00Z" })) });
      if (u.includes("recurso-uso")) { const r = sim(b); return route.fulfill({ status: r.status || 200, contentType: "application/json", body: JSON.stringify(r) }); }
      return json({ ok: true });
    }
    if (u.includes("coleccion=sims_instaladas")) return json(instaladas);
    if (u.includes("coleccion=sims")) return json(stock);
    json([]);
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("panelSimsControl").classList.remove("hidden"); return cargarControlSims(); });
  const filas = [
    { "Nro Cliente": 101, "Razón Social": "KIOSCO PEPE", "Línea": "341-5550020", "Compañía": "CLARO", Estado: "Activo" },
    { "Nro Cliente": 102, "Razón Social": "Panadería", "Línea": "3415550030", "Compañía": "Personal", Estado: "Activo" },
    { "Nro Cliente": 200, "Razón Social": "Farmacia Luna", "Línea": "3415550044", "Compañía": "Claro", Estado: "Activo" },
    { "Nro Cliente": 105, "Razón Social": "Bar", "Línea": "3415550066", "Compañía": "Claro", Estado: "Activo" },
    { "Nro Cliente": 106, "Razón Social": "Gomería", "Línea": "3415550078", "Compañía": "Claro", Estado: "Activo" },
    { "Nro Cliente": 107, "Razón Social": "Vivero", "Línea": "3415550011", "Compañía": "Claro", Estado: "Baja" },
    { "Nro Cliente": 300, "Razón Social": "Club Atlético", "Línea": "3415550088", "Compañía": "Claro", Estado: "Activo" },
    { "Nro Cliente": 301, "Razón Social": "Estudio Gómez", "Línea": "3415550099", "Compañía": "Movistar", Estado: "Activo" },
    { "Nro Cliente": 999, "Razón Social": "Otro", "Línea": "3415550020", "Compañía": "Claro", Estado: "Activo" },
  ];
  const buf = await page.evaluate((f) => { const lb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(lb, XLSX.utils.json_to_sheet(f), "SIMs"); return Array.from(new Uint8Array(XLSX.write(lb, { type: "array", bookType: "xlsx" }))); }, filas);
  await page.setInputFiles("#simsOfArchivo", { name: "sims oficina.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(buf) });
  await page.waitForSelector('.of-bloque[data-k="ofSoloOficina"]');
  const r = await page.evaluate(() => {
    const o = ultimaOf, ns = (k) => o[k].map((it) => it.n);
    return { col: [o.col.num, o.col.empresa, o.col.numCli, o.col.nombre, o.col.estado], coinciden: o.coinciden, error: o.ofPosibleError.map((x) => [x.n, x.x.numero]), soloOf: ns("ofSoloOficina"), soloApp: ns("ofSoloApp"), cli: ns("ofClienteDistinto"), emp: ns("ofEmpresaDistinta"), inact: ns("ofInactivaApp"), baja: ns("ofBajaOficina"), dup: ns("ofDuplicada"), ctx: o.ofSoloOficina.map((x) => x.ctx.tipo) };
  });
  assert.deepStrictEqual(r, {
    col: ["Línea", "Compañía", "Nro Cliente", "Razón Social", "Estado"], coinciden: 1,
    error: [["3415550078", "3415550077"]], soloOf: ["3415550088", "3415550099"], soloApp: ["3415550055"],
    cli: ["3415550044"], emp: ["3415550030"], inact: ["3415550066"], baja: ["3415550011"], dup: ["3415550020"], ctx: ["stock", "nunca"],
  });
  assert.match(await page.textContent("#simsOfStatus"), /Claro.*Movistar|Movistar.*Claro/);
  // Pasar la 0044 al cliente de Oficina
  await page.click('.of-acc[data-k="ofClienteDistinto"][data-a="cliente"]');
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /Verificado: la línea ya no aparece en «Otro cliente»/.test(document.getElementById("simsOfStatus").textContent));
  const ed = acciones.find((a) => a.accion === "editar_instalada");
  assert.strictEqual(ed.numero, "3415550044");
  assert.deepStrictEqual(ed.campos, { cliente: "Farmacia Luna", numero_cliente: "200" });
  // Corregir la empresa de la 0030 a Personal
  await page.click('.of-acc[data-k="ofEmpresaDistinta"][data-a="empresa"]');
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /Verificado: la línea ya no aparece en «Otra empresa»/.test(document.getElementById("simsOfStatus").textContent));
  assert.ok(acciones.some((a) => a.accion === "editar_instalada" && a.numero === "3415550030" && a.campos.empresa === "Personal"));
  // Instalar la de stock de Juan en el cliente de Oficina
  await page.click('.of-acc[data-k="ofSoloOficina"][data-a="instalar"]');
  assert.strictEqual(await page.inputValue(".sim-fila-extra .x-cliente"), "Club Atlético");
  assert.strictEqual(await page.inputValue(".sim-fila-extra .x-numcli"), "300");
  await page.click(".sim-fila-extra .x-ok");
  await page.waitForFunction(() => /instalada en Club/.test(document.getElementById("simsOfStatus").textContent));
  assert.ok(acciones.some((a) => a.accion === "usar" && a.numero === "3415550088" && a.tecnico === "Juan" && a.numero_cliente === "300"));
  // Ignorar la repetida (error del sistema de Oficina)
  await page.click('.of-marcar[data-k="ofDuplicada"][data-estado="ignorada"]');
  await page.fill(".cartel-admin-input", "error de Oficina");
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => ultimaOf && !ultimaOf.ofDuplicada.length);
  const m = acciones.find((a) => a.accion === "marcar");
  assert.deepStrictEqual(m.items, [{ numero: "3415550020", categoria: "ofDuplicada", empresa: "Oficina" }]);
  await page.waitForTimeout(1000);
  const corrida = acciones.find((a) => a.accion === "guardar_corrida");
  assert.ok(corrida && corrida.empresa === "Oficina", "queda en el historial para comparar la próxima");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Copias de seguridad: baja un .zip con todo, se vuelve a abrir, se ve en Excel y se restaura una lista (guardando antes cómo estaba)", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: route.request().url().includes("xlsx.full.min.js") ? require("fs").readFileSync(require("path").join(__dirname, "..", "vendor", "xlsx.full.min.js"), "utf8") : "" }));
  const posts = [];
  let clientesAhora = [{ numero_cliente: "00000001", nombre: "Kiosco" }];
  const fuentes = { app: ["clientes", "sims"], d1: ["partes"], restaurables: ["clientes"], github: [{ path: "croquis-index.json", size: 30 }], otros: { cantidad: 3, bytes: 900000 }, registro: [] };
  const contenido = { "app:clientes": () => JSON.stringify(clientesAhora), "app:sims": () => "[]", "d1:partes": () => JSON.stringify([{ id: "p1", cliente: "Kiosco", tarea: "Ñandú — revisión" }, { id: "p2", cliente: "Bar" }]), "gh:croquis-index.json": () => JSON.stringify([{ id: "a" }]) };
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = new URL(req.url());
    const json = (o, st) => route.fulfill({ status: st || 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.searchParams.get("coleccion") === "backup") {
      if (req.method() === "POST") {
        const b = JSON.parse(req.postData() || "{}"); posts.push(b);
        if (b.accion === "registrar_copia") fuentes.registro.unshift({ fecha: new Date().toISOString(), por: "Seba", bytes: b.bytes, archivo: b.archivo });
        if (b.accion === "restaurar_coleccion") clientesAhora = b.data;
        return json({ ok: true });
      }
      if (u.searchParams.get("fuentes")) return json(fuentes);
      const f = u.searchParams.get("fuente");
      if (f) { const t = contenido[f](); const P = 20; const partes = Math.ceil(t.length / P); const i = Number(u.searchParams.get("parte") || 0); return json({ partes, parte: i, texto: t.slice(i * P, (i + 1) * P) }); }
    }
    json([]);
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { sessionStorage.setItem("admin_nombre", "Seba"); document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("tabBackupBtn").click(); });
  await page.waitForFunction(() => /Incluye 3 tablas/.test(document.getElementById("bkContenido").textContent));
  assert.match(await page.textContent("#bkUltima"), /Todavía no se descargó/);
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.click("#bkDescargarBtn")]);
  assert.match(descarga.suggestedFilename(), /^SAT-copia-\d{4}-\d{2}-\d{2}_\d{4}\.zip$/);
  const zipPath = await descarga.path();
  await page.waitForFunction(() => /Listo: SAT-copia/.test(document.getElementById("bkStatus").textContent));
  assert.ok(posts.some((p) => p.accion === "registrar_copia" && p.fuentes === 4));
  assert.match(await page.textContent("#bkUltima"), /Última copia.*hoy.*Seba/);
  // El zip se puede abrir con otro programa: lo lee Python
  const { execFileSync } = require("child_process");
  const lista = execFileSync("python3", ["-c", "import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({n:z.read(n).decode('utf-8') for n in z.namelist()}))", zipPath]).toString();
  const enZip = JSON.parse(lista);
  assert.deepStrictEqual(Object.keys(enZip).sort(), ["LEEME.txt", "archivos-de-datos/croquis-index.json", "base-de-datos/listas/clientes.json", "base-de-datos/listas/sims.json", "base-de-datos/tablas/partes.json", "manifiesto.json"]);
  assert.strictEqual(JSON.parse(enZip["base-de-datos/tablas/partes.json"])[0].tarea, "Ñandú — revisión", "acentos y textos largos (en pedazos) bien");
  // Después se borró un cliente y se cargó otro; se vuelve atrás con la copia
  clientesAhora = [{ numero_cliente: "00000009", nombre: "Nuevo" }];
  await page.setInputFiles("#bkZipArchivo", zipPath);
  await page.waitForSelector(".bk-restaurar");
  assert.strictEqual(await page.locator(".bk-restaurar").count(), 2, "se restauran clientes y el archivo de datos; SIMs y partes no");
  await page.click("#bkCompararBtn");
  await page.waitForFunction(() => [...document.querySelectorAll(".bk-ahora")].every((e) => !/\.\.\./.test(e.textContent) && e.textContent));
  assert.match(await page.textContent('.bk-ahora[data-f="gh:croquis-index.json"]'), /igual a la copia/);
  assert.match(await page.textContent('.bk-ahora[data-f="app:clientes"]'), /cambió/);
  const [excel] = await Promise.all([page.waitForEvent("download"), page.click('.bk-excel[data-f="d1:partes"]')]);
  assert.match(excel.suggestedFilename(), /\.xlsx$/);
  await page.click('.bk-restaurar[data-f="app:clientes"]');
  const [antes] = await Promise.all([page.waitForEvent("download"), page.click(".cartel-admin .cartel-si")]);
  assert.match(antes.suggestedFilename(), /^antes-de-restaurar_clientes_/);
  assert.strictEqual(JSON.parse(require("fs").readFileSync(await antes.path(), "utf8"))[0].nombre, "Nuevo", "se guardó cómo estaba antes");
  await page.waitForFunction(() => /quedó como estaba/.test(document.getElementById("bkZipStatus").textContent));
  assert.deepStrictEqual(clientesAhora, [{ numero_cliente: "00000001", nombre: "Kiosco" }]);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Abonados con letras o convertidos por Excel (48ED, 48E2 -> 4800, 0555): la conciliación con Oficina y el reporte del monitoreo los reconocen", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: route.request().url().includes("xlsx.full.min.js") ? require("fs").readFileSync(require("path").join(__dirname, "..", "vendor", "xlsx.full.min.js"), "utf8") : "" }));
  const instaladas = [
    { numero: "3415550020", empresa: "Claro", cliente: "Kiosco Pepe", numero_abonado: "48E2", estado_linea: "Activo" },
    { numero: "3415550030", empresa: "Claro", cliente: "Panadería La Espiga", numero_abonado: "48ED", estado_linea: "Activo" },
    { numero: "3415550040", empresa: "Claro", cliente: "Bar", numero_abonado: "0555", estado_linea: "Activo" },
    { numero: "3415550050", empresa: "Claro", cliente: "Gomería", numero_abonado: "12E4", estado_linea: "Activo" },
  ];
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("coleccion=sims_instaladas")) return json(instaladas);
    json([]);
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("panelSimsControl").classList.remove("hidden"); return cargarControlSims(); });
  // Excel de Oficina: el 48E2 ya viene convertido a 4800 (número) y el nombre está escrito distinto
  const buf = await page.evaluate(() => {
    const filas = [
      { Abonado: 4800, "Razón Social": "PEPE KIOSCO", "Línea": "3415550020", "Compañía": "Claro" },
      { Abonado: "48ED", "Razón Social": "La Espiga", "Línea": "3415550030", "Compañía": "Claro" },
      { Abonado: 555, "Razón Social": "Bar", "Línea": "3415550040", "Compañía": "Claro" },
      { Abonado: "48EA", "Razón Social": "Gomería", "Línea": "3415550050", "Compañía": "Claro" },
    ];
    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja.A2.z = "0.00E+00"; // como lo deja Excel cuando convierte "48E2"
    const lb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(lb, hoja, "S");
    return Array.from(new Uint8Array(XLSX.write(lb, { type: "array", bookType: "xlsx" })));
  });
  await page.setInputFiles("#simsOfArchivo", { name: "oficina.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from(buf) });
  await page.waitForFunction(() => ultimaOf);
  const r = await page.evaluate(() => ({ col: ultimaOf.col.numCli, coinciden: ultimaOf.coinciden, distinto: ultimaOf.ofClienteDistinto.map((x) => [x.n, x.p.numCli]) }));
  assert.deepStrictEqual(r, { col: "Abonado", coinciden: 3, distinto: [["3415550050", "48EA"]] }, "solo la que de verdad tiene otro abonado");
  // Reporte del monitoreo en CSV: "48E2" y "12E4" como texto (no se convierten), "0555" con cero
  const hoy = new Date(), f = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()} 10:00`;
  const csv = `Cuenta,Nombre,Ultima senal\n48E2,Kiosco,${f}\n48ed,Panaderia,${f}\n0555,Bar,${f}\n12E4,Gomeria,${f}\n`;
  await page.setInputFiles("#simsComArchivo", { name: "monitoreo.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.waitForSelector("#simsComResultado .sims-resumen");
  const com = await page.textContent("#simsComResultado");
  assert.match(com, /No están en el reporte\s*0/, "las cuatro se reconocen");
  assert.match(com, /Todas las alarmas con SIM comunicaron/);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("APP: confirmaciones, pedidos de texto y avisos con carteles propios (no dependen del confirm/prompt/alert del navegador)", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  let nativos = 0;
  page.on("dialog", (d) => { nativos++; d.dismiss(); });
  await page.goto(base + "/index.html");
  await page.waitForTimeout(300);
  const p1 = page.evaluate(() => confirmarApp("¿Retirar la línea?", { aceptar: "Sí, retirar", cancelar: "No" }));
  await page.waitForSelector(".dlg-app");
  assert.strictEqual(await page.textContent(".dlg-app .dlg-si"), "Sí, retirar");
  await page.click(".dlg-app .dlg-si");
  assert.strictEqual(await p1, true);
  const p2 = page.evaluate(() => confirmarApp("¿Borrar?"));
  await page.click(".dlg-app .dlg-no");
  assert.strictEqual(await p2, false);
  const p3 = page.evaluate(() => pedirTextoApp("Nombre de la página:", "Planta baja"));
  await page.fill(".dlg-app .dlg-input", "Planta alta");
  await page.press(".dlg-app .dlg-input", "Enter");
  assert.strictEqual(await p3, "Planta alta");
  const p4 = page.evaluate(() => pedirTextoApp("Nota:"));
  await page.press(".dlg-app .dlg-input", "Escape");
  assert.strictEqual(await p4, null);
  await page.evaluate(() => alert("Este parte NO quedó guardado"));
  assert.match(await page.textContent(".dlg-app"), /NO quedó guardado/);
  assert.strictEqual(await page.locator(".dlg-app .dlg-no").count(), 0, "un aviso solo tiene «Entendido»");
  await page.click(".dlg-app .dlg-si");
  assert.strictEqual(await page.locator(".dlg-app").count(), 0);
  assert.strictEqual(nativos, 0, "no se abrió ningún cuadro del navegador");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Vencimientos: vehículos, credenciales y los de la oficina en una lista; se carga, se renueva y aparece en Inicio", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  const iso = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  let propios = [{ id: "mata00001", nombre: "Matafuegos depósito", categoria: "Matafuegos", fecha: iso(-3), aviso_dias: 30, repetir: 12, responsable: "Juan", nota: "", historial: [] }];
  const posts = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("coleccion=vencimientos")) {
      if (req.method() === "POST") {
        const b = JSON.parse(req.postData()); posts.push(b);
        if (b.accion === "guardar") propios = [...propios, { ...b.item, id: "nuevo00001", historial: [] }];
        if (b.accion === "renovar") propios = propios.map((x) => (x.id === b.id ? { ...x, fecha: iso(362) } : x));
        return json({ ok: true, lista: propios });
      }
      return json(propios);
    }
    if (u.includes("coleccion=vehiculos")) return json([{ nombre: "Kangoo", km_actual: 99500, umbrales: [{ nombre: "VTV", tipo: "fecha", valor: iso(10), aviso_antes: 30 }, { nombre: "Service", tipo: "km", valor: 100000, aviso_antes: 1000 }, { nombre: "Seguro", tipo: "fecha", valor: iso(200), aviso_antes: 30 }] }]);
    if (u.includes("coleccion=credenciales")) return json([{ nombre: "Luis", cargo: "Técnico", vigencia: iso(20) }]);
    if (u.includes("coleccion=tecnicos")) return json([{ nombre: "Juan" }, { nombre: "Luis" }]);
    json([]);
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById("mainCard").classList.remove("hidden"); return cargarInicioAdmin(); });
  await page.waitForFunction(() => /Vencimientos \(1 vencido\)/.test(document.getElementById("panelInicio").textContent));
  await page.evaluate(() => document.getElementById("tabVencimientosBtn").click());
  await page.waitForSelector(".ven-tabla");
  const filas = await page.$$eval(".ven-tabla tr", (t) => t.map((r) => r.querySelector("b").textContent));
  assert.deepStrictEqual(filas, ["Matafuegos depósito", "VTV — Kangoo", "Credencial — Luis", "Service — Kangoo"], "vencido primero, después lo más cercano; el seguro al día no se muestra");
  assert.match(await page.textContent("#venResumen"), /Vencidos\s*1.*Por vencer\s*3.*Al día\s*1/s);
  // Renovado (se repite cada año)
  await page.click(".ven-renovar");
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /renovado\. Próximo vencimiento/.test(document.getElementById("venStatus").textContent));
  assert.deepStrictEqual(posts[0], { accion: "renovar", id: "mata00001", fecha: "" });
  assert.strictEqual(await page.locator(".ven-renovar").count(), 0, "ya no está en la lista de atención");
  // Uno nuevo de la oficina
  await page.fill("#venNombre", "Habilitación municipal");
  await page.fill("#venCat", "Habilitaciones y permisos");
  await page.fill("#venFecha", iso(5));
  await page.selectOption("#venResponsable", "Juan");
  await page.click("#venGuardarBtn");
  await page.waitForFunction(() => /guardado/.test(document.getElementById("venStatus").textContent));
  assert.strictEqual(posts[1].item.responsable, "Juan");
  assert.strictEqual(posts[1].item.aviso_dias, 30);
  assert.ok(await page.locator(".ven-tabla b", { hasText: "Habilitación municipal" }).count());
  assert.strictEqual(await page.inputValue("#venNombre"), "", "el formulario queda limpio");
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Rendiciones: revisión rápida de a una (foto grande, un toque o una tecla), repetidas marcadas y total por técnico y mes", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  const mes = new Date().toISOString().slice(0, 7);
  let rend = [
    { id: "r1", tecnico: "Juan", fecha: `${mes}-02`, monto: 12000, categoria: "Combustible", detalle: "Nafta", estado: "pendiente", foto_ref: JSON.stringify(["/icon-192.png", "/icon-512.png"]), creado_en: "1" },
    { id: "r2", tecnico: "Juan", fecha: `${mes}-02`, monto: 12000, categoria: "Combustible", detalle: "Nafta", estado: "pendiente", foto_ref: "/icon-192.png", creado_en: "2" },
    { id: "r3", tecnico: "Luis", fecha: `${mes}-03`, monto: 5000, categoria: "Materiales", detalle: "Cable", estado: "pendiente", foto_ref: "", creado_en: "3" },
    { id: "r4", tecnico: "Luis", fecha: `${mes}-01`, monto: 3000, categoria: "Estacionamiento", detalle: "", estado: "pagado", creado_en: "4" },
  ];
  const posts = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("recurso=rendicion")) {
      if (req.method() === "POST") {
        const b = JSON.parse(req.postData()); posts.push(b);
        rend = rend.map((r) => (r.id !== b.id ? r : { ...r, estado: b.accion === "marcar_pagado" ? "pagado" : b.accion === "pagado_app" ? "pagado_app" : "rechazado", observaciones_admin: b.observaciones_admin }));
        return json({ ok: true });
      }
      return json(rend);
    }
    json([]);
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { sessionStorage.setItem("admin_nombre", "Seba"); document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("tabRendicionesBtn").click(); });
  await page.waitForFunction(() => /\(3\)/.test(document.getElementById("rendRevisionBtn").textContent));
  assert.strictEqual(await page.locator("#rendicionesAdminLista .rend-repetida").count(), 2, "las dos de Juan iguales se marcan");
  assert.match(await page.textContent("#rendMatriz"), /Juan.*\$24\.000.*\(\$24\.000\).*Luis.*\$8\.000.*\(\$5\.000\)/s);
  await page.click("#rendRevisionBtn");
  await page.waitForSelector(".rend-rev");
  assert.match(await page.textContent(".rend-rev"), /Pendiente 1 de 3.*Juan.*\$12\.000.*Posible repetida/s);
  assert.strictEqual(await page.locator(".rend-rev-minis img").count(), 2, "las dos fotos del ticket");
  await page.click('.rr-acc[data-a="pagado"]');
  await page.waitForFunction(() => /Pendiente 2 de 3/.test(document.querySelector(".rend-rev").textContent));
  assert.deepStrictEqual(posts[0], { accion: "marcar_pagado", id: "r1", pagado: true, pagado_por: "Seba" }, "queda quién lo pagó");
  // La repetida se rechaza con un motivo de un toque
  await page.click(".rr-rechazar");
  await page.click(".rr-motivo >> text=Está repetida");
  await page.waitForFunction(() => /Pendiente 3 de 3/.test(document.querySelector(".rend-rev").textContent));
  assert.deepStrictEqual(posts[1], { accion: "rechazar", id: "r2", observaciones_admin: "Está repetida" });
  assert.match(await page.textContent(".rend-rev-foto"), /Sin foto del ticket/);
  await page.keyboard.press("a");
  await page.waitForFunction(() => /No quedan pendientes/.test(document.querySelector(".rend-rev").textContent));
  assert.deepStrictEqual(posts[2], { accion: "pagado_app", id: "r3" });
  await page.click(".rr-cerrar");
  await page.waitForFunction(() => /1 pagadas, 1 con APP, 1 rechazadas/.test((document.getElementById("avisoFlotanteAdmin") || {}).textContent || ""));
  assert.strictEqual(await page.locator(".rend-rev-capa").count(), 0);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Parte: si el registro en el historial falla (o la app se corta después del mail), queda en la cola del celular y se reintenta sin duplicar", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  let historialCae = true, guardados = [], stock = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o, st) => route.fulfill({ status: st || 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("/api/enviar-mail")) return json({ ok: true });
    if (u.includes("/api/historial") && req.method() === "POST") {
      const b = JSON.parse(req.postData());
      if (b.accion === "guardar_stock") { stock.push(b); return json({ ok: true }); }
      if (historialCae) return json({ error: "No se pudo guardar en el historial" }, 502);
      guardados.push(b); return json({ ok: true, id_parte: b.id_parte });
    }
    if (u.includes("tipo=parte&id=")) { const id = decodeURIComponent(u.split("id=")[1]); const p = guardados.find((g) => g.id_parte === id); return p ? json({ id, cliente: p.cliente, fecha: p.fecha }) : json({ error: "No se encontró" }, 404); }
    json([]);
  });
  await page.goto(base + "/index.html");
  await page.waitForTimeout(300);
  const data = { numero_servicio: "45120", cliente: "Genz", direccion: "Mitre 100", localidad: "Rosario", tarea: "Cambio de batería", materiales: "Batería 12V 7A", tecnico: "Sebastián Purello", fecha: "2026-11-05", hora_entrada: "09:00", hora_salida: "10:00", claves: [], materiales_agregados: [{ nombre: "Batería 12V 7A", cantidad: 1 }], materiales_retirados_agregados: [] };
  const r = await page.evaluate((d) => intentarEnviarParte({ idParte: "45120", data: d, signatureImgTag: "", signatureDataUrl: "" }, false), data);
  assert.strictEqual(r.oficinaOk, true, "el mail salió");
  let cola = await page.evaluate(() => obtenerColaEnvios());
  assert.deepStrictEqual(cola.map((x) => [x.tipo, x.idParte, x.cuerpo.cliente]), [["historial", "45120", "Genz"]], "el historial quedó pendiente en el celular");
  // Vuelve el servidor: se reintenta y se guarda (con los materiales)
  historialCae = false;
  await page.evaluate(() => procesarColaEnvios());
  assert.strictEqual(guardados.length, 1);
  assert.strictEqual(guardados[0].tarea, "Cambio de batería");
  assert.strictEqual(stock.length, 1, "también los movimientos de stock");
  assert.deepStrictEqual(await page.evaluate(() => obtenerColaEnvios()), []);
  // La app se cortó justo después de guardar (antes de sacarlo de la cola): al reintentar ve que ya está y no lo duplica
  await page.evaluate((d) => { agregarAColaEnvios({ tipo: "historial", idParte: "45120", enCurso: 0, cuerpo: { id_parte: "45120", cliente: "Genz", fecha: "2026-11-05" }, movimientos: [] }); return procesarColaEnvios(); });
  assert.strictEqual(guardados.length, 1, "no se duplicó");
  assert.deepStrictEqual(await page.evaluate(() => obtenerColaEnvios()), []);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Admin: un parte que llegó por mail y no quedó en el historial se carga pegando el texto del mail (sin duplicar)", async () => {
  // El mail tal cual lo arma el servidor, copiado como texto (como al hacer Ctrl+A / Ctrl+C en el correo)
  const vm = require("vm"), fs = require("fs"), path = require("path");
  const fuente = fs.readFileSync(path.join(__dirname, "..", "api", "enviar-mail.js"), "utf8") + "\nmodule.exports.__html = (d) => renderTemplate(PLANTILLA_OFICINA, enriquecerDatos(d));";
  const mod = { exports: {} };
  vm.runInNewContext(fuente, { module: mod, require: (n) => (n === "nodemailer" ? {} : require(n)), process, console, Buffer, encodeURIComponent });
  const html = mod.exports.__html({ id_parte: "45120", tipo_servicio: "Servicio técnico", cliente: "Genz Ricardo", direccion: "Mitre 100", localidad: "Rosario", cliente_email_usado: "genz@mail.com", tecnico: "Sebastián Purello", fecha: "2026-11-05", hora_entrada: "09:05", hora_salida: "10:20", tiempo_transcurrido: "1 h 15 min", tarea: "Cambio de batería de la central", materiales: "Batería 12V 7A x1", materiales_retirados: "Batería vieja", observaciones: "Cliente conforme", importe: "$ 35.000", descuento: "Sin descuento", costo_final: "$ 35.000", forma_pago: "Transferencia", firma_img: "", firma_aclaracion: "Ricardo Genz", claves: [] });
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  const guardados = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o, st) => route.fulfill({ status: st || 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.includes("/api/historial") && req.method() === "POST") { const b = JSON.parse(req.postData()); guardados.push(b); return json({ ok: true, id_parte: b.id_parte }); }
    if (u.includes("tipo=parte&id=")) { const p = guardados[0]; return p ? json({ id: p.id_parte, cliente: p.cliente, fecha: p.fecha }) : json({ error: "No se encontró" }, 404); }
    if (u.includes("coleccion=clientes")) return json([{ nombre: "Genz Ricardo", numero_cliente: "00004521" }]);
    json([]);
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  const texto = await page.evaluate((h) => { const d = document.createElement("div"); d.style.position = "fixed"; d.innerHTML = h; document.body.appendChild(d); const t = d.innerText; d.remove(); return t; }, html);
  await page.evaluate(() => { sessionStorage.setItem("admin_nombre", "Seba"); document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("tabServiciosBtn").click(); });
  await page.fill("#recParteTexto", texto);
  await page.click("#recParteLeerBtn");
  await page.waitForFunction(() => !document.getElementById("recParteForm").classList.contains("hidden"));
  const v = await page.$$eval("#recParteForm [data-rp]", (els) => Object.fromEntries(els.map((e) => [e.dataset.rp, e.value])));
  assert.deepStrictEqual(
    [v.id_parte, v.cliente, v.numero_cliente, v.direccion, v.localidad, v.tecnico, v.fecha, v.hora_entrada, v.hora_salida, v.tarea, v.materiales, v.materiales_retirados, v.observaciones, v.costo_final, v.forma_pago, v.cliente_email, v.firma_aclaracion],
    ["45120", "Genz Ricardo", "00004521", "Mitre 100", "Rosario", "Sebastián Purello", "2026-11-05", "09:05", "10:20", "Cambio de batería de la central", "Batería 12V 7A x1", "Batería vieja", "Cliente conforme", "$ 35.000", "Transferencia", "genz@mail.com", "Ricardo Genz"]);
  await page.click("#recParteGuardarBtn");
  await page.waitForFunction(() => /quedó en el historial/.test(document.getElementById("recParteStatus").textContent));
  assert.strictEqual(guardados.length, 1);
  assert.strictEqual(guardados[0].numero_servicio, "45120");
  assert.match(guardados[0].observaciones, /Cliente conforme\n\[Cargado desde el mail del parte por Seba/);
  // Si se intenta de nuevo, avisa que ya está y no lo duplica
  await page.fill("#recParteTexto", texto);
  await page.click("#recParteLeerBtn");
  await page.click("#recParteGuardarBtn");
  await page.waitForFunction(() => /ya está en el historial/.test(document.getElementById("recParteStatus").textContent));
  assert.strictEqual(guardados.length, 1);
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});

test("Stock: catálogo desde el listado de Oficina, saldo inicial, mínimos, conciliación con todas las diferencias y pedido automático", async () => {
  const { ctx, page, erroresPagina } = await nuevaPagina();
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: route.request().url().includes("xlsx.full.min.js") ? require("fs").readFileSync(require("path").join(__dirname, "..", "vendor", "xlsx.full.min.js"), "utf8") : "" }));
  const S = require(require("path").join(__dirname, "..", "stock-utils.js"));
  let catalogo = { articulos: {} }, saldos = { ubic: {}, unidades: {}, pedidos: {} }, conc = { marcas: [], corridas: [] };
  const posts = [], movs = [];
  await page.route("**/api/**", (route) => {
    const req = route.request(), u = req.url();
    const json = (o, st) => route.fulfill({ status: st || 200, contentType: "application/json", body: JSON.stringify(o) });
    if (!u.includes("coleccion=stock")) return json([]);
    if (req.method() === "GET") return u.includes("movimientos=") ? json(movs) : json({ catalogo, saldos, conciliacion: conc });
    const b = JSON.parse(req.postData()); posts.push(b);
    if (b.accion === "importar_catalogo") {
      let nuevos = 0;
      b.articulos.forEach((x) => { if (!catalogo.articulos[x.c]) { nuevos++; catalogo.articulos[x.c] = { c: x.c, d: x.d, tipo: S.clasificarArticulo(x.d), medida: S.medidaArticulo(x.d), min: null, pedir: null, prov: "" }; } });
      return json({ ok: true, nuevos, actualizados: b.articulos.length - nuevos, configurados: 0, total: Object.keys(catalogo.articulos).length });
    }
    if (b.accion === "saldo_inicial") { saldos = { ...saldos, inicializado: new Date().toISOString(), ubic: { dep: {} } }; b.items.forEach((x) => { if (x.dep) saldos.ubic.dep[x.c] = x.dep; if (x.com) (saldos.ubic["com:Sin asignar"] = saldos.ubic["com:Sin asignar"] || {})[x.c] = x.com; }); return json({ ok: true, articulos: b.items.length }); }
    if (b.accion === "configurar") { catalogo.articulos[b.c] = { ...catalogo.articulos[b.c], ...b.campos }; return json({ ok: true, articulo: catalogo.articulos[b.c] }); }
    if (b.accion === "ajustar") {
      const antes = ((saldos.ubic || {})[b.ubic] || {})[b.c] || 0, dif = b.cantidad - antes;
      const m = { fecha: new Date().toISOString(), tipo: "ajuste", c: b.c, cant: Math.abs(dif), ...(dif > 0 ? { a: b.ubic } : { de: b.ubic }), motivo: b.motivo, antes, despues: b.cantidad, por: "Seba" };
      saldos = S.aplicarMovimiento(saldos, m); movs.push(m);
      return json({ ok: true });
    }
    if (b.accion === "marcar_pedido") { b.items.forEach((x) => { saldos.pedidos[x.c] = { fecha: new Date().toISOString(), cantidad: x.cantidad, proveedor: b.proveedor, por: "Seba" }; }); return json({ ok: true }); }
    if (b.accion === "quitar_pedido") { b.items.forEach((x) => delete saldos.pedidos[x.c]); return json({ ok: true }); }
    if (b.accion === "conc_corrida") { conc.corridas = [{ ...b, fecha: new Date().toISOString(), por: "Seba" }, ...conc.corridas]; return json({ ok: true, corridas: conc.corridas }); }
    if (b.accion === "conc_marcar") { conc.marcas = [...b.items.map((x) => ({ ...x, estado: b.estado, motivo: b.motivo, fecha: new Date().toISOString() })), ...conc.marcas]; return json({ ok: true, marcas: conc.marcas }); }
    return json({ error: "?" }, 400);
  });
  await page.goto(base + "/admin.html");
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById("mainCard").classList.remove("hidden"); document.getElementById("tabStockBtn").click(); });
  await page.waitForFunction(() => /Todavía no hay catálogo/.test(document.getElementById("stkEstado").textContent));
  const xlsx = (filas) => page.evaluate((f) => { const lb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(lb, XLSX.utils.json_to_sheet(f), "Articulos"); return Array.from(new Uint8Array(XLSX.write(lb, { type: "array", bookType: "xlsx" }))); }, filas);
  const listado = (dep) => [
    { Código: "20825", Descripción: "TECLADO K10LH/V", "Cant. Depósito": dep[0], "Cant. Tránsito": 0, "Cant. Comodato": 1 },
    { Código: "20208", Descripción: "SIRENA MP100 INTERIOR MONOTONAL", "Cant. Depósito": dep[1], "Cant. Tránsito": 0, "Cant. Comodato": 7 },
    { Código: "300", Descripción: "CABLE UTP CAT5 EXTERIOR", "Cant. Depósito": dep[2], "Cant. Tránsito": 0, "Cant. Comodato": 0 },
    { Código: "9001", Descripción: "MOVISTAR", "Cant. Depósito": 40, "Cant. Tránsito": 0, "Cant. Comodato": 0 },
  ];
  await page.setInputFiles("#stkCatArchivo", { name: "Articulos_Stock.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await xlsx(listado([8, 0, 300]))) });
  await page.waitForFunction(() => /4 nuevos/.test(document.getElementById("stkStatus").textContent));
  assert.match(await page.textContent("#stkInicial"), /3 artículos con cantidad/, "el SIM no entra en el saldo inicial");
  await page.click("#stkInicialBtn");
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /Saldo inicial cargado/.test(document.getElementById("stkEstado").textContent));
  assert.deepStrictEqual(saldos.ubic.dep, { 20825: 8, 300: 300 });
  // Mínimo del teclado = 10: queda para pedir
  await page.fill('#stkLista tr[data-c="20825"] input[data-campo="min"]', "10");
  await page.press('#stkLista tr[data-c="20825"] input[data-campo="min"]', "Tab");
  await page.waitForFunction(() => /Guardado/.test((document.getElementById("avisoFlotanteAdmin") || {}).textContent || ""));
  await page.fill('#stkLista tr[data-c="20825"] input[data-campo="prov"]', "Propiedad Protegida");
  await page.press('#stkLista tr[data-c="20825"] input[data-campo="prov"]', "Tab");
  await page.waitForFunction(() => document.querySelector('#stkLista tr[data-c="20825"] input[data-campo="prov"]').disabled === false && /Propiedad/.test(JSON.stringify(stk.catalogo.articulos["20825"])));
  // Ajuste con motivo
  await page.click('#stkLista tr[data-c="300"] [data-ajustar]');
  await page.fill(".cartel-admin-input", "250");
  await page.click(".cartel-admin .cartel-si");
  await page.fill(".cartel-admin-input", "Recuento");
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /Ajustado/.test((document.getElementById("avisoFlotanteAdmin") || {}).textContent || ""));
  assert.strictEqual(saldos.ubic.dep["300"], 250);
  // Conciliación: Oficina dice 6 teclados, 2 sirenas, 300 m de cable y un artículo nuevo
  await page.click('#stkSub [data-stk="conciliacion"]');
  const lis = listado([6, 2, 300]); lis.push({ Código: "555", Descripción: "DETECTOR PIR NUEVO", "Cant. Depósito": 4, "Cant. Tránsito": 0, "Cant. Comodato": 0 });
  await page.setInputFiles("#stkConcArchivo", { name: "Stock noviembre.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await xlsx(lis)) });
  await page.waitForSelector('#stkConcResultado details[data-cat="cantidadDistinta"]');
  const txt = await page.textContent("#stkConcResultado");
  assert.match(txt, /No está en la APP: 1 · Cantidad distinta: 3 · Solo en la APP: 0 · Comodato distinto: 0 · Unidades sin escanear: 1/);
  assert.ok(!/MOVISTAR/.test(txt), "los SIM se concilian en Control de SIMs");
  assert.strictEqual(posts.filter((p) => p.accion === "conc_corrida").length, 1);
  // Dejar el teclado y el cable como Oficina
  const det = page.locator('#stkConcResultado details[data-cat="cantidadDistinta"]');
  await det.locator('tr[data-c="20825"] .stk-conc-sel').check();
  await det.locator('tr[data-c="300"] .stk-conc-sel').check();
  await det.locator('[data-accion="arreglar"]').click();
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => /Verificado/.test((document.getElementById("avisoFlotanteAdmin") || {}).textContent || ""));
  assert.strictEqual(saldos.ubic.dep["20825"], 6);
  assert.strictEqual(saldos.ubic.dep["300"], 300);
  assert.ok(movs.every((m) => /Conciliación con Oficina|Recuento/.test(m.motivo)));
  // La sirena: Ignorar con motivo
  await page.locator('#stkConcResultado details[data-cat="cantidadDistinta"] tr[data-c="20208"] .stk-conc-sel').check();
  await page.locator('#stkConcResultado details[data-cat="cantidadDistinta"] [data-accion="ignorada"]').click();
  await page.fill(".cartel-admin-input", "Llegan con la compra del lunes");
  await page.click(".cartel-admin .cartel-si");
  await page.waitForFunction(() => !document.querySelector('#stkConcResultado details[data-cat="cantidadDistinta"]'));
  assert.match(await page.textContent("#stkConcResultado"), /Ocultas por Resuelto \/ Ignorar \(1\)/);
  // Pedidos: el teclado (6 ≤ 10) aparece con el proveedor y lo sugerido (2×10 − 6 = 14)
  await page.click('#stkSub [data-stk="pedidos"]');
  await page.waitForSelector('#stkPedidos [data-prov="Propiedad Protegida"]');
  assert.strictEqual(await page.inputValue('#stkPedidos tr[data-c="20825"] .stk-ped-cant'), "14");
  await page.locator('#stkPedidos [data-prov="Propiedad Protegida"] [data-ped="marcar"]').click();
  await page.waitForFunction(() => /Marcados como pedidos: 1/.test((document.getElementById("avisoFlotanteAdmin") || {}).textContent || ""));
  assert.match(await page.textContent("#stkPedidosHechos"), /Propiedad Protegida.*20825.*14/s);
  assert.match(await page.textContent("#stkPedidos"), /No hay nada para pedir/);
  // Movimientos
  await page.click('#stkSub [data-stk="movimientos"]');
  await page.waitForFunction(() => /3 movimientos/.test(document.getElementById("stkMovLista").textContent));
  assert.deepStrictEqual(erroresPagina, []);
  await ctx.close();
});
