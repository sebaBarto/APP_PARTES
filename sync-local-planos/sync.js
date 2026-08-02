// Vigila una carpeta en tu PC (y sus subcarpetas) y sube automáticamente
// cada plano nuevo o modificado a la app de SAT.
//
// - Los .pdf se suben directamente.
// - Los .vsd/.vsdx (Visio) se convierten a PDF primero, con LibreOffice
//   (gratis) — un celular no puede abrir un archivo de Visio directo.
// - Solo se vuelve a subir un archivo si su CONTENIDO cambió de verdad
//   (no alcanza con "tocarlo" o abrirlo sin modificar nada).
//
// CÓMO USARLO:
//   1. Instalá Node.js (https://nodejs.org) si no lo tenés.
//   2. Instalá LibreOffice (https://www.libreoffice.org/download/download/)
//      si vas a tener archivos de Visio — no hace falta si son todos PDF.
//   3. Completá config.json con la carpeta real y el token de la app.
//   4. Abrí una terminal en esta carpeta y corré:
//        npm install
//        npm start
//   5. Dejalo corriendo en segundo plano — mientras la PC esté prendida
//      y conectada, cualquier plano nuevo o modificado que guardes en la
//      carpeta se sube solo.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const chokidar = require("chokidar");

const RUTA_CONFIG = path.join(__dirname, "config.json");
if (!fs.existsSync(RUTA_CONFIG)) {
  console.error(
    'Falta el archivo "config.json". Copiá "config.example.json", renombralo a "config.json", y completá tus datos reales antes de correr esto.'
  );
  process.exit(1);
}
const CONFIG = JSON.parse(fs.readFileSync(RUTA_CONFIG, "utf-8"));
const ARCHIVO_ESTADO = path.join(__dirname, "estado-subidos.json");

function cargarEstado() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO_ESTADO, "utf-8"));
  } catch (err) {
    return {};
  }
}
function guardarEstado(estado) {
  fs.writeFileSync(ARCHIVO_ESTADO, JSON.stringify(estado, null, 2));
}
let estado = cargarEstado();

function hashDeArchivo(rutaCompleta) {
  const contenido = fs.readFileSync(rutaCompleta);
  return crypto.createHash("sha256").update(contenido).digest("hex");
}

function nombreSinExtension(rutaCompleta) {
  return path.basename(rutaCompleta).replace(/\.(pdf|vsd|vsdx)$/i, "");
}

// Convierte un .vsd/.vsdx a PDF usando LibreOffice, en una carpeta
// temporal. Ojo: LibreOffice no siempre renderiza un Visio idéntico al
// original (sobre todo diagramas con formas poco comunes) — conviene
// revisar los primeros archivos convertidos para confirmar que se vean
// bien, sobre todo al principio.
function convertirVisioAPdf(rutaCompleta) {
  return new Promise((resolve, reject) => {
    const carpetaTemporal = fs.mkdtempSync(path.join(require("os").tmpdir(), "plano-"));
    const comando = CONFIG.comando_libreoffice || "soffice";
    execFile(
      comando,
      ["--headless", "--convert-to", "pdf", "--outdir", carpetaTemporal, rutaCompleta],
      { timeout: 60000 },
      (err) => {
        if (err) {
          reject(new Error(
            `No se pudo convertir con LibreOffice (¿está instalado? ¿está en el PATH?). Detalle: ${err.message}`
          ));
          return;
        }
        const nombrePdf = nombreSinExtension(rutaCompleta) + ".pdf";
        const rutaPdf = path.join(carpetaTemporal, nombrePdf);
        if (!fs.existsSync(rutaPdf)) {
          reject(new Error("LibreOffice no generó el PDF esperado."));
          return;
        }
        resolve(rutaPdf);
      }
    );
  });
}

async function subirPlano(nombre, rutaPdf) {
  const base64 = fs.readFileSync(rutaPdf).toString("base64");
  const res = await fetch(`${CONFIG.url_app}/api/planos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + CONFIG.token },
    body: JSON.stringify({ nombre_archivo: nombre, base64 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
  return data;
}

async function procesarArchivo(rutaCompleta) {
  const nombre = nombreSinExtension(rutaCompleta);
  const extension = path.extname(rutaCompleta).toLowerCase();

  let hashActual;
  try {
    hashActual = hashDeArchivo(rutaCompleta);
  } catch (err) {
    return; // el archivo pudo haberse movido/borrado justo en este instante
  }

  if (estado[rutaCompleta] === hashActual) {
    return; // no cambió nada de verdad desde la última subida
  }

  console.log(`→ Procesando: ${nombre}${extension}`);
  try {
    let rutaPdfFinal = rutaCompleta;
    let carpetaTemporalABorrar = null;

    if (extension === ".vsd" || extension === ".vsdx") {
      rutaPdfFinal = await convertirVisioAPdf(rutaCompleta);
      carpetaTemporalABorrar = path.dirname(rutaPdfFinal);
    }

    await subirPlano(nombre, rutaPdfFinal);
    estado[rutaCompleta] = hashActual;
    guardarEstado(estado);
    console.log(`  ✓ Subido: ${nombre}`);

    if (carpetaTemporalABorrar) {
      fs.rmSync(carpetaTemporalABorrar, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`  ✗ Falló "${nombre}": ${err.message}`);
  }
}

console.log(`Vigilando la carpeta: ${CONFIG.carpeta_planos}`);
console.log("(dejá esta ventana abierta — los archivos nuevos o modificados se suben solos)\n");

const watcher = chokidar.watch(CONFIG.carpeta_planos, {
  ignoreInitial: false, // al arrancar, revisa también lo que ya está en la carpeta
  awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 500 }, // espera a que termine de copiarse/guardarse
});

watcher.on("add", (rutaCompleta) => {
  if (/\.(pdf|vsd|vsdx)$/i.test(rutaCompleta)) procesarArchivo(rutaCompleta);
});
watcher.on("change", (rutaCompleta) => {
  if (/\.(pdf|vsd|vsdx)$/i.test(rutaCompleta)) procesarArchivo(rutaCompleta);
});
watcher.on("error", (err) => console.error("Error del vigilante de archivos:", err));
