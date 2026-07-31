// Genera el PDF del contrato de comodato, con el texto legal completo
// (idéntico al original en Word) y los datos de cada comodato
// insertados en su lugar — usando pdf-lib, una librería liviana en
// JS puro, sin depender de LibreOffice ni de ningún servicio externo
// (Vercel no puede correr LibreOffice, así que esta es la forma
// confiable de garantizar un PDF real siempre).

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

const RUTA_ENCABEZADO = path.join(__dirname, "..", "assets", "comodato-encabezado.png");
const RUTA_FIRMA_THIESING = path.join(__dirname, "..", "assets", "comodato-firma-thiesing.png");

const MARGEN = 56; // ~0.78in
const ANCHO_PAGINA = 595.28; // A4 en puntos
const ALTO_PAGINA = 841.89;
const ANCHO_TEXTO = ANCHO_PAGINA - MARGEN * 2;

function partirEnLineas(texto, font, tamanoFuente, anchoMax) {
  const palabras = texto.split(/\s+/);
  const lineas = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    const ancho = font.widthOfTextAtSize(prueba, tamanoFuente);
    if (ancho > anchoMax && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function armarClausulas(d) {
  return [
    { tipo: "titulo", texto: "CONTRATO DE COMODATO" },
    { tipo: "parrafo", texto: `Entre Thiesing Alfredo Gustavo en adelante el comodante, con domicilio en calle Bv. Avellaneda 404 de la ciudad de Rosario, y ${d.comodatario} en adelante el comodatario, con domicilio en la calle ${d.direccion_comodatario} de la Ciudad de ${d.ciudad_comodatario}, representado en este acto por ${d.representado_por}. Se conviene de común acuerdo celebrar el siguiente contrato de comodato, de acuerdo a las cláusulas especiales que aquí se convienen:` },
    { tipo: "encabezado", texto: "PRIMERA: OBJETO DEL CONTRATO." },
    { tipo: "parrafo", texto: "Thiesing Alfredo G. en su carácter de comodante, da en comodato al comodatario los siguientes bienes de su propiedad:" },
    { tipo: "parrafo-negrita", texto: d.bienes },
    { tipo: "parrafo-negrita", texto: `Abono mensual: $ ${d.abono_mensual} x mes` },
    { tipo: "parrafo-chico", texto: "* Dicho equipo está conectado según croquis adjunto y monitoreado." },
    { tipo: "parrafo-chico", texto: "** Se deja constancia que los precios indicados se basan en los costos actuales del equipo y materiales utilizados en la prestación del servicio, salarios, y gastos de seguridad social, en consecuencia, si tales costos y gastos fueran modificados en el futuro por razones ajenas a nuestra voluntad, nos reservamos el derecho de ajustar en forma proporcional el costo del servicio. En este caso notificaremos por escrito al comodatario respecto del aumento con 30 días de antelación a la fecha que dicho aumento se haga efectivo. Si el comodatario no objeta el aumento en un plazo de 15 días posteriores a la notificación por escrito, esto constituirá su consentimiento a dicho aumento. Si el comodatario no está de acuerdo con el aumento propuesto, de mutuo acuerdo se podrá dar por terminado este contrato." },
    { tipo: "encabezado", texto: "SEGUNDA: DESTINO DE LOS BIENES." },
    { tipo: "parrafo", texto: "El comodatario se compromete expresamente a darle a los bienes detallados en el punto anterior el destino que se acuerda en la presente, SEGURIDAD ELECTRONICA. Se prohíbe expresamente destinarlo a otro fin." },
    { tipo: "encabezado", texto: "TERCERA. OBLIGACIONES DEL COMODATARIO." },
    { tipo: "parrafo", texto: "El comodatario recibe los bienes en perfecto estado de funcionamiento con todos sus accesorios, y se obliga a restituirlos en el mismo buen estado en que hoy los recibe (INCLUYENDO TODOS LOS CABLES DE LA INSTALACIÓN); todos los elementos que sufran rotura o desgaste que lo inutilice, el comodatario deberá responder por los daños y perjuicios." },
    { tipo: "parrafo", texto: "Asimismo el comodatario se obliga a exhibir los mismos al comodante cada vez que éste lo requiera para observar el estado del mismo y/o controlar su funcionamiento." },
    { tipo: "encabezado", texto: "CUARTA. UTILIZACION PERSONAL." },
    { tipo: "parrafo", texto: "La utilización de los bienes cedidos deberá ser efectuada por el comodatario en forma personal, estando prohibida la subcontratación total o parcial de los mismos a terceros." },
    { tipo: "encabezado", texto: "QUINTA. LUGAR DE USO DEL ESPACIO CEDIDO." },
    { tipo: "parrafo", texto: "Los elementos cedidos solamente podrán ser utilizados en el local comercial del comodatario, no pudiendo ser trasladados del mismo por ninguna causa ni motivo." },
    { tipo: "encabezado", texto: "SEXTA. VIGENCIA DEL CONTRATO." },
    { tipo: "parrafo", texto: 'El plazo de vigencia del presente comodato se fija de mutuo acuerdo de 36 meses (treinta y seis meses), pudiendo las partes a partir de los 3 meses, con un previo aviso de 30 días, dar por finalizado el mismo sin causa ni responsabilidad indemnizatoria alguna. Este contrato se renovará automáticamente por períodos sucesivos de UN AÑO (la "renovación") a menos que el suscriptor o Alfredo Gustavo Thiesing, con acción escrita, den por cancelado este contrato con al menos treinta (30) días de anticipación a la fecha de vencimiento de la vigencia Anual o de la renovación vigente.' },
    { tipo: "encabezado", texto: "SEPTIMA. INCUMPLIMIENTO." },
    { tipo: "parrafo", texto: "En caso de incumplimiento por parte del comodatario de alguna de sus obligaciones, el comodante podrá demandar: a) El cumplimiento del contrato; o b) Accionar judicialmente por daños y perjuicios." },
    { tipo: "encabezado", texto: "OCTAVA. JURISDICCION COMPETENTE." },
    { tipo: "parrafo", texto: "Las partes constituyen domicilios legales y especiales en los ut supra indicados, donde serán válidas cualquier clase de citaciones o notificaciones que se cursen, extrajudiciales o judiciales, sometiéndose para la interpretación de las cláusulas de este contrato a la jurisdicción ordinaria de los Tribunales Civiles y Comerciales de la ciudad de Rosario." },
    { tipo: "parrafo", texto: `En prueba de conformidad con todo lo que antecede, se firman dos ejemplares de un mismo tenor y a un solo efecto en la ciudad de Rosario, el ${d.dia} de ${d.mes} del ${d.anio}.-` },
  ];
}

async function generarComodatoPDF(datos, firmaBase64) {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let pagina = pdfDoc.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
  let y = ALTO_PAGINA - MARGEN;

  function nuevaPaginaSiHaceFalta(alturaNecesaria) {
    if (y - alturaNecesaria < MARGEN) {
      pagina = pdfDoc.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
      y = ALTO_PAGINA - MARGEN;
    }
  }

  function dibujarParrafo(texto, { fuente = fontRegular, tamano = 11, interlineado = 15, centrado = false, subrayado = false } = {}) {
    const lineas = partirEnLineas(texto, fuente, tamano, ANCHO_TEXTO);
    for (const linea of lineas) {
      nuevaPaginaSiHaceFalta(interlineado);
      const anchoLinea = fuente.widthOfTextAtSize(linea, tamano);
      const x = centrado ? (ANCHO_PAGINA - anchoLinea) / 2 : MARGEN;
      pagina.drawText(linea, { x, y, size: tamano, font: fuente, color: rgb(0.06, 0.09, 0.13) });
      if (subrayado) {
        pagina.drawLine({ start: { x, y: y - 2 }, end: { x: x + anchoLinea, y: y - 2 }, thickness: 0.7, color: rgb(0.06, 0.09, 0.13) });
      }
      y -= interlineado;
    }
  }

  // Encabezado: logo/banner real de la empresa (extraído del Word original)
  const bytesEncabezado = fs.readFileSync(RUTA_ENCABEZADO);
  const imgEncabezado = await pdfDoc.embedPng(bytesEncabezado);
  const anchoEncabezado = ANCHO_TEXTO;
  const altoEncabezado = anchoEncabezado * (imgEncabezado.height / imgEncabezado.width);
  pagina.drawImage(imgEncabezado, { x: MARGEN, y: y - altoEncabezado, width: anchoEncabezado, height: altoEncabezado });
  y -= altoEncabezado + 16;

  const clausulas = armarClausulas(datos);
  for (const c of clausulas) {
    if (c.tipo === "titulo") {
      y -= 4;
      dibujarParrafo(c.texto, { fuente: fontBold, tamano: 15, centrado: true, subrayado: true, interlineado: 20 });
      y -= 10;
    } else if (c.tipo === "encabezado") {
      y -= 6;
      dibujarParrafo(c.texto, { fuente: fontBold, tamano: 11.5, subrayado: true, interlineado: 16 });
      y -= 4;
    } else if (c.tipo === "parrafo-negrita") {
      dibujarParrafo(c.texto, { fuente: fontBold, tamano: 11 });
      y -= 6;
    } else if (c.tipo === "parrafo-chico") {
      dibujarParrafo(c.texto, { tamano: 9, interlineado: 12.5 });
      y -= 4;
    } else {
      dibujarParrafo(c.texto);
      y -= 8;
    }
  }

  // Bloque de firmas: dos columnas (comodante fijo / comodatario dinámico)
  nuevaPaginaSiHaceFalta(140);
  y -= 20;
  const colIzqX = MARGEN;
  const colDerX = MARGEN + ANCHO_TEXTO / 2 + 10;
  const yFirmas = y;

  pagina.drawText("Firma: ______________________", { x: colIzqX, y: yFirmas, size: 10, font: fontRegular });
  try {
    const bytesFirmaThiesing = fs.readFileSync(RUTA_FIRMA_THIESING);
    const imgFirmaThiesing = await pdfDoc.embedPng(bytesFirmaThiesing);
    const anchoFirmaTh = 90;
    const altoFirmaTh = anchoFirmaTh * (imgFirmaThiesing.height / imgFirmaThiesing.width);
    pagina.drawImage(imgFirmaThiesing, { x: colIzqX + 20, y: yFirmas + 4, width: anchoFirmaTh, height: altoFirmaTh });
  } catch (err) {
    // si por algún motivo no está el archivo de la firma, se sigue
    // igual con la línea en blanco de arriba
  }
  pagina.drawText("Aclaración: Thiesing Alfredo", { x: colIzqX, y: yFirmas - 34, size: 10, font: fontRegular });
  pagina.drawText("Cargo: TITULAR", { x: colIzqX, y: yFirmas - 50, size: 10, font: fontRegular });
  pagina.drawText("DNI: 13488458", { x: colIzqX, y: yFirmas - 66, size: 10, font: fontRegular });

  if (firmaBase64) {
    try {
      const firmaPng = await pdfDoc.embedPng(Buffer.from(firmaBase64, "base64"));
      const escala = 110 / firmaPng.width;
      pagina.drawImage(firmaPng, { x: colDerX, y: yFirmas + 2, width: 110, height: firmaPng.height * escala });
    } catch (err) {
      // si la firma no se pudo insertar, se sigue igual sin cortar el PDF
    }
  }
  pagina.drawText("Firma: ______________________", { x: colDerX, y: yFirmas, size: 10, font: fontRegular });
  pagina.drawText(`Aclaración: ${datos.aclaracion_comodatario}`, { x: colDerX, y: yFirmas - 34, size: 10, font: fontRegular });
  pagina.drawText(`Cargo: ${datos.cargo_comodatario}`, { x: colDerX, y: yFirmas - 50, size: 10, font: fontRegular });
  pagina.drawText(`DNI: ${datos.dni_comodatario}`, { x: colDerX, y: yFirmas - 66, size: 10, font: fontRegular });

  return pdfDoc.save();
}

module.exports = { generarComodatoPDF };
