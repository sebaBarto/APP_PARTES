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

  const prompt = `Esta imagen es un parte técnico de servicio firmado por un cliente,
de una empresa de seguridad electrónica. Extraé exactamente estos campos y
devolvé SOLO un objeto JSON válido, sin texto adicional, sin markdown y sin
comillas triples, con esta forma exacta:

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
}

Si un campo no se puede leer con claridad, dejalo como cadena vacía "".
La fecha debe ir en formato AAAA-MM-DD y las horas en formato 24hs HH:MM
para que puedan cargarse en campos de tipo fecha/hora de un formulario web.`;

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
