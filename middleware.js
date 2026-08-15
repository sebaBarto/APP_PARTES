// Middleware de Vercel — se ejecuta ANTES de que se sirva cualquier
// archivo estático, así que es la forma confiable de redirigir según
// el dominio (los "rewrites" comunes de vercel.json no pisan bien el
// index.html propio del proyecto en este caso puntual).
//
// Qué hace: si entran por pedido.sat365.com.ar, siempre muestran el
// formulario público — nunca la app de técnicos ni el panel de
// administración, sin importar qué ruta escriban.

export const config = {
  matcher: "/:path*",
};

export default function middleware(request) {
  const host = request.headers.get("host") || "";
  if (host !== "pedido.sat365.com.ar") return;

  const url = new URL(request.url);
  const path = url.pathname;

  // Solo se redirige lo que sea "una página" — la raíz, o cualquier
  // .html que no sea el formulario en sí. Todo lo demás (imágenes,
  // CSS, el propio app.js/sw.js, y las llamadas a /api/...) tiene que
  // pasar sin tocarlo — si no, hasta el logo del formulario se
  // redirige a sí mismo en vez de cargar la imagen real.
  const esPagina = path === "/" || path.endsWith(".html");
  if (!esPagina || path === "/solicitar-servicio.html") return;

  url.pathname = "/solicitar-servicio.html";
  return Response.redirect(url, 302);
}
