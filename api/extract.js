// Función serverless (Vercel) — recibe una imagen en base64 y devuelve
// los campos del parte técnico extraídos con la API de Claude.
//
// Requiere la variable de entorno ANTHROPIC_API_KEY configurada en Vercel
// (Project Settings → Environment Variables). NUNCA exponer esta key en
// el frontend.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { image } = req.body || {};
  if (!image || typeof image !== "string") {
    res.status(400).json({ error: "Falta la imagen" });
    return;
  }

  const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: "Formato de imagen inválido" });
    return;
  }
  const mediaType = match[1];
  const base64Data = match[2];

  const prompt = `Esta imagen es siempre el mismo formulario impreso de "Comprobante de
Servicio Técnico" de SAT (empresa de seguridad electrónica), completado a
mano. Como el formulario es siempre igual, usá este mapa exacto de dónde
está cada dato para leerlo con precisión, en vez de adivinar la estructura:

- El renglón impreso dice "Abonado:.... Nombre:...." — lo escrito a mano
  justo después de "Nombre:" en ese mismo renglón es el CLIENTE.
- El renglón impreso dice "Domicilio:...." — lo escrito a mano después es
  la DIRECCIÓN (calle y número).
- El renglón impreso dice "Localidad:...." — lo escrito a mano después
  (antes de "C.U.I.T.") es la LOCALIDAD.
- Debajo del título subrayado "Tarea Realizada:" hay 1 a 4 renglones
  punteados con texto manuscrito, a veces en cursiva y en MAYÚSCULA
  irregular — transcribí TODO ese bloque tal cual está escrito, uniendo
  los renglones en un solo texto (respetando paréntesis si los hay).
- Hay una tabla con columnas "Elemento Retirado", "Elemento Instalado" y
  "Provisto por" — combiná el contenido de esas tres celdas en un solo
  texto para el campo de MATERIALES, con el formato:
  "<retirado> → <instalado> (provisto por <provisto>)". Si alguna celda
  está vacía, omitila.
- Cerca de "En garantía: SI / NO" hay un campo "Importe: $" y más abajo un
  recuadro "Importe Final $" — el IMPORTE es el número escrito a mano en
  cualquiera de esos dos lugares (preferí "Importe Final" si ambos están
  completos). Muchas veces estos campos quedan EN BLANCO o solo tienen un
  garabato/trazo sin número real — en ese caso, dejá el campo vacío, no
  inventes un número.
- Hay una tabla final con columnas "Técnico interviniente", "Fecha del
  Servicio", "Hora Llegada" y "Hora Salida" — cada una es exactamente lo
  que su nombre indica.

Reglas generales de lectura:
- La letra puede combinar imprenta y cursiva en la misma palabra. Leé
  letra por letra si hace falta, apoyándote en el contexto (ej. nombres
  de localidades o marcas de equipos de seguridad conocidas) para resolver
  trazos ambiguos, pero NUNCA inventes un dato que no esté escrito.
- Si un campo realmente no se puede leer ni inferir con confianza, dejalo
  como cadena vacía "" — es preferible un campo vacío a un dato inventado.
- La fecha puede estar escrita como DD/MM/AA — convertila a AAAA-MM-DD
  (un año de 2 dígitos "25" es "2025", asumiendo siempre el 2000+).
- Las horas deben ir en formato 24hs HH:MM.

Devolvé SOLO un objeto JSON válido, sin texto adicional, sin markdown y
sin comillas triples, con esta forma exacta:

{
  "cliente": "",
  "direccion": "",
  "localidad": "",
  "tarea": "",
  "materiales": "",
  "importe": "",
  "tecnico": "",
  "fecha": "AAAA-MM-DD",
  "hora_entrada": "HH:MM",
  "hora_salida": "HH:MM"
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64Data },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      res.status(502).json({ error: "Error al contactar la API de extracción" });
      return;
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    const raw = textBlock ? textBlock.text : "{}";
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let fields;
    try {
      fields = JSON.parse(cleaned);
    } catch (e) {
      console.error("No se pudo parsear la respuesta:", raw);
      res.status(200).json({ fields: {}, warning: "No se pudo interpretar la respuesta" });
      return;
    }

    res.status(200).json({ fields });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error interno al extraer los datos" });
  }
}
