// Generador de hash para la contraseña del panel de administración.
//
// CÓMO USARLO (en tu propia PC, para que la contraseña real nunca
// se comparta con nadie más):
//
//   node generar-hash-admin.js "TuContraseñaNuevaAca"
//
// Te va a imprimir un texto largo — copialo completo y pegalo en
// Vercel como la variable de entorno ADMIN_PASSWORD_HASH (reemplazando
// o junto a la vieja ADMIN_PASSWORD, que ya no hace falta después de
// esto).

const crypto = require("crypto");

const password = process.argv[2];
if (!password) {
  console.error("Uso: node generar-hash-admin.js \"TuContraseñaNueva\"");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Elegí una contraseña de al menos 8 caracteres (cuantos más, mejor).");
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
const resultado = salt.toString("hex") + ":" + hash.toString("hex");

console.log("\nCopiá esto completo como ADMIN_PASSWORD_HASH en Vercel:\n");
console.log(resultado);
console.log("");
