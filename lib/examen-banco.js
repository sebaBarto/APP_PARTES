// ============================================================
// Banco de preguntas inicial del examen técnico (lib/examen.js).
// Lo usa la primera vez; después la oficina lo edita desde el admin y
// queda guardado en examen/banco.json (repo privado de datos).
//
// Temarios: alarmas (Paradox, DSC, Ajax), camaras (analógicas, IP, Ajax) y redes.
// Nivel: 1 básico, 2 medio, 3 avanzado (para un técnico que trabaja de esto,
// no para un cliente).
// Tipo "mc": opciones con una sola correcta (correcta = índice en opciones).
// Tipo "abierta": se corrige sola por palabras clave: "claves" es una lista de
// grupos; cada grupo es una lista de alternativas (se buscan sin acentos ni
// mayúsculas). El puntaje es la parte de grupos que aparecen en la respuesta.
// La oficina puede ajustar el puntaje de las abiertas después.
// ============================================================
const mc = (id, temario, nivel, marca, texto, opciones, correcta, explicacion = "") => ({ id, temario, nivel, marca, tipo: "mc", texto, opciones, correcta, explicacion, activa: true });
const ab = (id, temario, nivel, marca, texto, claves, guia = "") => ({ id, temario, nivel, marca, tipo: "abierta", texto, claves, guia, activa: true });

const TEMARIOS = { alarmas: "Sistemas de alarma", camaras: "Cámaras", redes: "Redes" };

const BANCO = [
  // ---------------- ALARMAS · nivel 1 ----------------
  mc("al01", "alarmas", 1, "DSC", "En una DSC PowerSeries (PC1616 / PC1832 / PC1864), ¿cómo se entra a la programación de instalador?",
    ["*8 + código de instalador", "*6 + código maestro", "*5 + código maestro", "*9 + código de instalador"], 0, "*6 son funciones de usuario, *5 códigos de usuario y *9 arma sin demora de entrada."),
  mc("al02", "alarmas", 1, "DSC", "¿Cuál es el código de instalador de fábrica de una DSC PowerSeries?",
    ["1234", "5555", "0000", "4321"], 1, "5555 es el de instalador; 1234 es el código maestro de fábrica."),
  mc("al03", "alarmas", 1, "General", "Una zona programada como 24 horas (por ejemplo, un tamper o un pulsador de pánico):",
    ["Dispara aunque el sistema esté desarmado", "Solo dispara con el sistema armado total", "Solo dispara en armado parcial (presente)", "Se anula sola cada vez que se desarma"], 0),
  mc("al04", "alarmas", 1, "General", "¿Qué tipo de zona corresponde a la puerta por donde el cliente entra y sale para desarmar?",
    ["Instantánea", "Demorada (entrada/salida)", "24 horas", "Seguidora"], 1),
  mc("al05", "alarmas", 1, "General", "El armado «presente» (Stay) en una casa normalmente:",
    ["Arma todas las zonas, incluidas las interiores", "Arma solo las zonas interiores", "Arma el perímetro y deja anuladas las zonas interiores programadas como presente", "Arma solo las zonas 24 horas"], 2),
  mc("al06", "alarmas", 1, "General", "¿Qué batería de respaldo lleva normalmente una central cableada tipo Paradox SP o DSC PC1832?",
    ["12 V 7 Ah", "6 V 4,5 Ah", "24 V 7 Ah", "12 V 1,2 Ah"], 0),
  mc("al07", "alarmas", 1, "Ajax", "¿Cómo se suma un detector nuevo a un Hub de Ajax?",
    ["Desde la app, escaneando el código QR del dispositivo (o cargando su ID) y encendiéndolo", "Desde el teclado, entrando a programación con el código de instalador", "Con un cable USB entre el detector y el Hub", "Desde la web de Ajax, sin pasar por la app"], 0),
  mc("al08", "alarmas", 1, "Ajax", "¿Cuál de estos dispositivos Ajax es un detector magnético de apertura?",
    ["MotionProtect", "DoorProtect", "GlassProtect", "StreetSiren"], 1, "MotionProtect es PIR, GlassProtect detecta rotura de vidrio y StreetSiren es la sirena exterior."),
  mc("al09", "alarmas", 1, "General", "¿Para qué sirve la resistencia de fin de línea (EOL) en una zona cableada?",
    ["Para bajar el consumo del detector", "Para que la central pueda distinguir zona normal, abierta y en corto (sabotaje del cable)", "Para aumentar el alcance del cable", "Para que la zona funcione sin batería"], 1),
  ab("al10", "alarmas", 1, "General", "Explicá la diferencia entre una zona demorada, una instantánea y una 24 horas, y dá un ejemplo de dónde usarías cada una.",
    [["demor", "retardo", "tiempo de entrada", "tiempo de salida"], ["instant", "inmediat", "al toque", "sin demora"], ["24", "siempre", "desarmad", "aunque no este armad"], ["puerta", "entrada principal", "ingreso"], ["ventana", "interior", "movimiento", "pir", "panico", "tamper", "incendio", "humo"]],
    "Demorada: da tiempo para entrar y desarmar (puerta principal). Instantánea: dispara apenas se abre (ventanas, perímetro). 24 h: dispara siempre (pánico, tamper, incendio)."),

  // ---------------- ALARMAS · nivel 2 ----------------
  mc("al11", "alarmas", 2, "DSC", "En una DSC PowerSeries cableada con EOL simple, ¿qué resistencia lleva cada zona?",
    ["1 kΩ", "2,2 kΩ", "5,6 kΩ", "10 kΩ"], 2, "DSC usa 5,6 kΩ; Paradox usa 1 kΩ."),
  mc("al12", "alarmas", 2, "DSC", "En una DSC PowerSeries (PC1616/1832/1864), ¿en qué sección se programan las definiciones de zona de la 1 a la 16?",
    ["[001]", "[005]", "[015]", "[101]"], 0, "[005] son los tiempos del sistema (entrada, salida, corte de sirena)."),
  mc("al13", "alarmas", 2, "DSC", "Para sumar detectores inalámbricos de 433 MHz a una PC1832 sin cambiar el teclado, se agrega:",
    ["Un receptor RF5132-433 en el bus", "Un expansor PC5108", "Un módulo PC5400", "Un comunicador 3G4010"], 0, "El PC5108 es expansor de 8 zonas cableadas."),
  mc("al14", "alarmas", 2, "Paradox", "¿Qué diferencia principal hay entre una Paradox MG5050 y una SP5500?",
    ["La MG5050 tiene receptor inalámbrico incorporado; la SP5500 necesita un módulo receptor (por ejemplo RTX3)", "La SP5500 tiene receptor inalámbrico y la MG5050 no", "La MG5050 es solo inalámbrica y no acepta zonas cableadas", "No hay diferencia, cambia solo el gabinete"], 0),
  mc("al15", "alarmas", 2, "Paradox", "Para conectar una Paradox SP/MG a internet y usarla con la app (Insite Gold / BlueEye) se agrega el módulo:",
    ["PCS265", "IP150", "ZX8", "RTX3"], 1, "PCS265 es comunicador celular, ZX8 expansor de 8 zonas y RTX3 receptor inalámbrico."),
  mc("al16", "alarmas", 2, "Ajax", "Un detector Ajax queda lejos del Hub y la señal es mala. ¿Qué dispositivo de Ajax se agrega para mejorarla?",
    ["ReX (repetidor de señal)", "Relay", "WallSwitch", "Socket"], 0),
  mc("al17", "alarmas", 2, "Ajax", "¿Cómo se llama el protocolo de radio con el que los detectores Ajax se comunican con el Hub?",
    ["Wings", "Fibra", "Jeweller", "Zigbee"], 2, "Wings es el canal para enviar fotos de los MotionCam y Fibra es la línea cableada."),
  mc("al18", "alarmas", 2, "Ajax", "¿Qué diferencia hay entre la app Ajax PRO y la app Ajax común?",
    ["Ajax PRO es para instaladores: varios clientes, configuración y monitoreo; la común es para el usuario final", "Ajax PRO es la versión paga para usuarios con más de un Hub", "Son iguales, PRO solo agrega cámaras", "Ajax PRO funciona sin internet y la común no"], 0),
  ab("al19", "alarmas", 2, "DSC", "Un cliente con una DSC dice que la alarma no arma y el teclado marca «problema». ¿Qué revisás y en qué orden?",
    [["problema", "trouble", "*2", "falla"], ["bateria"], ["220", "corriente", "alimentacion", "luz"], ["zona abierta", "zona", "sensor", "puerta", "ventana", "listo"], ["tamper", "sabotaje"], ["linea", "comunicador", "telefon", "reloj", "hora"]],
    "Ver con *2 qué problema marca; revisar zonas abiertas (la luz de listo), batería, alimentación de 220, tampers, línea/comunicador y fecha y hora."),
  ab("al20", "alarmas", 2, "General", "¿Por qué no conviene dejarle al cliente (o a un familiar) el código de instalador? ¿Qué podría pasar?",
    [["programac", "configurac", "cambiar"], ["borrar", "anular", "desprogram", "modific"], ["zona", "sensor"], ["monitoreo", "central", "reporte", "comunicador"], ["seguridad", "responsab", "garantia"]],
    "Puede cambiar o borrar la programación, anular zonas o cortar los reportes al monitoreo; después SAT responde por algo que no programó."),

  // ---------------- ALARMAS · nivel 3 ----------------
  mc("al21", "alarmas", 3, "Paradox", "En una Paradox SP con duplicación de zonas (ATZ), ¿qué valores de resistencia se usan para separar las dos zonas de un mismo borne?",
    ["1 kΩ y 2,2 kΩ", "5,6 kΩ y 5,6 kΩ", "2,2 kΩ y 4,7 kΩ", "1 kΩ y 1 kΩ"], 0),
  mc("al22", "alarmas", 3, "DSC", "¿Qué permite una zona DSC con doble resistencia (DEOL) que no permite una con EOL simple?",
    ["Distinguir alarma de sabotaje (tamper) del detector con un solo par de cables", "Conectar dos detectores en la misma zona sin perder la identificación", "Alimentar el detector por el mismo par de la zona", "Usar cable de alarma de más de 300 m"], 0),
  mc("al23", "alarmas", 3, "General", "En el formato Contact ID, ¿qué significa el evento 301?",
    ["Batería baja del sistema", "Pérdida de alimentación de 220 (CA)", "Falla de comunicación", "Tamper de gabinete"], 1, "302 es batería baja del sistema."),
  mc("al24", "alarmas", 3, "General", "Una central consume 350 mA en reposo (con detectores y teclados) y tiene una batería de 12 V 7 Ah. Sin luz, ¿cuánto dura aproximadamente?",
    ["Unas 2 horas", "Unas 7 horas", "Unas 20 horas", "Unas 35 horas"], 2, "7 Ah ÷ 0,35 A ≈ 20 h (en la práctica algo menos)."),
  mc("al25", "alarmas", 3, "Ajax", "¿Qué Hub de Ajax admite dispositivos cableados de la línea Fibra?",
    ["Hub Mini", "Hub 2", "Hub Hybrid", "Hub Plus"], 2),
  mc("al26", "alarmas", 3, "Paradox", "En una EVO192 de fábrica, ¿cuál es el código de instalador, comparado con el de las SP/MG?",
    ["EVO192: 000000; SP/MG: 0000", "EVO192: 0000; SP/MG: 000000", "Ambas: 1234", "EVO192: 5555; SP/MG: 0000"], 0),
  ab("al27", "alarmas", 3, "General", "Una central manda «batería baja» varias veces por semana y no hubo cortes de luz. ¿Qué puede estar pasando y cómo lo diagnosticás en el lugar?",
    [["bateria vieja", "bateria agotad", "sulfat", "vida util", "bateria gastada", "bateria danad", "reemplaz", "cambiar la bateria"], ["medir", "tester", "multimetro", "tension", "voltaje", "voltimetro"], ["13", "carga", "cargador"], ["fuente", "transformador", "alimentacion", "fusible"], ["consumo", "sirena", "detectores", "modulos", "corriente"], ["prueba", "sin 220", "desconect", "cortar"]],
    "Batería agotada o sulfatada, o falla de carga (fuente/transformador, fusible). Medir tensión con y sin 220 (~13,8 V de carga), probar la batería con carga, revisar consumo de lo conectado y reemplazar."),
  ab("al28", "alarmas", 3, "Ajax", "¿Qué ventajas y qué limitaciones tiene un sistema Ajax inalámbrico frente a uno cableado tradicional en una casa grande?",
    [["instal", "obra", "cable", "rapid"], ["bateria", "pila"], ["alcance", "senal", "rex", "repetidor", "distancia"], ["interferencia", "inhib", "jamming"], ["supervis", "ping", "estado"], ["app", "nube", "remot", "foto", "verificac"]],
    "Ventajas: instalación rápida sin obra, supervisión de cada dispositivo, app y verificación con foto. Limitaciones: baterías, alcance (ReX), paredes e interferencias/inhibidores, costo."),

  // ---------------- CÁMARAS · nivel 1 ----------------
  mc("ca01", "camaras", 1, "Analógicas", "¿Cuál de estas NO es una tecnología de video por cable coaxial?",
    ["HD-TVI", "AHD", "HD-CVI", "ONVIF"], 3, "ONVIF es un protocolo para cámaras IP."),
  mc("ca02", "camaras", 1, "General", "Un DVR graba cámaras ______ y un NVR graba cámaras ______.",
    ["IP / analógicas", "analógicas / IP", "Wi-Fi / cableadas", "con audio / sin audio"], 1),
  mc("ca03", "camaras", 1, "Analógicas", "¿Para qué sirve un balun en una instalación de cámaras analógicas?",
    ["Para llevar el video por cable UTP en lugar de coaxial", "Para alimentar la cámara por el coaxial", "Para convertir una cámara analógica en IP", "Para amplificar el infrarrojo"], 0),
  mc("ca04", "camaras", 1, "IP", "¿Qué significa que una cámara IP sea PoE?",
    ["Que se alimenta y transmite datos por el mismo cable de red", "Que tiene Wi-Fi incorporado", "Que graba en tarjeta de memoria", "Que tiene audio de dos vías"], 0),
  mc("ca05", "camaras", 1, "IP", "Una cámara Hikvision nueva viene sin activar. ¿Con qué herramienta la buscás en la red y la activás?",
    ["ConfigTool", "SADP", "Ajax PRO", "BabyWare"], 1, "ConfigTool es la herramienta de Dahua."),
  mc("ca06", "camaras", 1, "Ajax", "¿Qué hace un detector MotionCam de Ajax?",
    ["Graba video continuo en el Hub", "Detecta movimiento y saca una serie de fotos para verificar la alarma", "Es una cámara IP con NVR propio", "Detecta apertura de puertas con cámara"], 1),
  mc("ca07", "camaras", 1, "Analógicas", "¿Con qué tensión se alimenta normalmente una cámara analógica (HD-TVI / AHD)?",
    ["5 V DC", "12 V DC", "24 V AC", "48 V DC"], 1),
  mc("ca08", "camaras", 1, "General", "Una lente de 2,8 mm comparada con una de 6 mm:",
    ["Ve más ángulo y menos detalle a distancia", "Ve menos ángulo y más detalle a distancia", "Ve lo mismo pero con mejor visión nocturna", "Solo cambia la resolución"], 0),
  ab("ca09", "camaras", 1, "Analógicas", "Una cámara analógica se ve en negro (sin video) en el DVR. ¿Qué revisás?",
    [["alimentacion", "fuente", "12", "tension"], ["ficha", "conector", "bnc", "balun"], ["cable", "coaxial", "utp"], ["canal", "configur", "tvi", "ahd", "cvi", "tecnolog"], ["probar", "otra entrada", "otro canal", "cambiar", "otra camara"], ["infrarrojo", "ir", "led"]],
    "Alimentación (12 V en la cámara), fichas BNC/balun, cable, que el canal del DVR esté en la tecnología correcta (TVI/AHD/CVI) y probar en otra entrada o con otra cámara."),

  // ---------------- CÁMARAS · nivel 2 ----------------
  mc("ca10", "camaras", 2, "IP", "¿Cuál es el puerto de servicio (SDK) por defecto de los equipos Hikvision?",
    ["8000", "37777", "554", "34567"], 0, "37777 es el de Dahua y 554 es RTSP."),
  mc("ca11", "camaras", 2, "IP", "¿Cuál es el puerto TCP por defecto de los equipos Dahua?",
    ["8000", "554", "37777", "8080"], 2),
  mc("ca12", "camaras", 2, "IP", "Para agregar a un NVR Hikvision una cámara IP de otra marca, normalmente se usa:",
    ["El protocolo ONVIF, con un usuario ONVIF habilitado en la cámara", "SADP", "Hik-Connect", "El puerto 37777"], 0),
  mc("ca13", "camaras", 2, "IP", "¿Para qué se usa el «substream» (tercer o segundo flujo) de una cámara?",
    ["Para grabar con más calidad", "Para ver en el celular o en vista múltiple usando menos ancho de banda", "Para el audio", "Para el infrarrojo"], 1),
  mc("ca14", "camaras", 2, "IP", "A igual calidad de imagen, H.265 comparado con H.264:",
    ["Ocupa más o menos la mitad de ancho de banda y disco", "Ocupa el doble", "Ocupa lo mismo pero mejora la noche", "No es compatible con NVR"], 0),
  mc("ca15", "camaras", 2, "IP", "¿Cuál es la distancia máxima recomendada de un tramo de cable UTP para Ethernet y PoE?",
    ["30 m", "100 m", "300 m", "500 m"], 1),
  mc("ca16", "camaras", 2, "General", "Una cámara con infrarrojo instalada detrás de un vidrio se ve blanca de noche. ¿Por qué?",
    ["El IR rebota en el vidrio; hay que sacarla afuera o usar iluminación externa", "La lente está desenfocada", "Falta alimentación", "El DVR está en otra tecnología"], 0),
  mc("ca17", "camaras", 2, "Ajax", "¿Por qué canal envía las fotos un MotionCam al Hub?",
    ["Jeweller, igual que las alarmas", "Wings, un canal aparte para las fotos", "Wi-Fi de la casa", "Fibra"], 1),
  mc("ca18", "camaras", 2, "IP", "¿Cuál es la app de Dahua para el usuario final?",
    ["DMSS", "Hik-Connect", "iVMS-4500", "Ajax"], 0),
  ab("ca19", "camaras", 2, "IP", "¿Cómo dejarías un NVR Hikvision para que el cliente lo vea desde el celular? Contá los pasos.",
    [["hik-connect", "hikconnect", "p2p", "nube", "plataforma"], ["habilit", "activ"], ["codigo", "verificacion", "qr", "serie"], ["contrasena", "clave", "usuario"], ["internet", "router", "dhcp", "gateway", "puerta de enlace", "dns", "red"], ["app", "celular", "agregar"]],
    "Que el NVR tenga red e internet (IP, gateway, DNS), habilitar Hik-Connect con código de verificación, y agregarlo en la app escaneando el QR o el número de serie, con usuario propio del cliente."),

  // ---------------- CÁMARAS · nivel 3 ----------------
  mc("ca20", "camaras", 3, "General", "4 cámaras grabando continuo a 2 Mbps cada una. ¿Cuánto disco ocupan por día aproximadamente?",
    ["8,6 GB", "21 GB", "86 GB", "345 GB"], 2, "8 Mbps = 1 MB/s × 86.400 s ≈ 86 GB."),
  mc("ca21", "camaras", 3, "IP", "Un switch PoE tiene 65 W de presupuesto. Si cada cámara consume como máximo 7 W, ¿cuántas cámaras podés alimentar como máximo (sin contar las bocas)?",
    ["6", "8", "9", "10"], 2, "65 ÷ 7 = 9,2 → 9."),
  mc("ca22", "camaras", 3, "IP", "¿Qué diferencia hay entre Hik-Connect y Hik-Partner Pro?",
    ["Hik-Connect es para el usuario; Hik-Partner Pro es para que el instalador gestione equipos de muchos clientes", "Hik-Partner Pro es la versión paga de Hik-Connect para usuarios", "Hik-Connect es para cámaras y Hik-Partner Pro solo para alarmas", "Son lo mismo con otro nombre"], 0),
  mc("ca23", "camaras", 3, "Ajax", "¿Qué Hub de Ajax hace falta para usar detectores MotionCam con fotos?",
    ["Cualquier Hub, incluido el primero", "Hub 2, Hub 2 Plus o Hub Hybrid (los que tienen Wings)", "Solo Hub Mini", "No necesita Hub: se conecta al Wi-Fi"], 1),
  mc("ca24", "camaras", 3, "IP", "Una cámara IP con IP fija 192.168.0.64 no aparece en un NVR que está en 192.168.1.10/24. ¿Qué pasa?",
    ["Están en distintas subredes: hay que poner la cámara en el rango 192.168.1.x", "Falta el puerto 554", "La cámara no es ONVIF", "El NVR necesita Hik-Connect"], 0),
  ab("ca25", "camaras", 3, "Ajax", "¿Qué diferencia hay entre verificar alarmas con MotionCam de Ajax y tener cámaras de video (con NVR)? ¿Cuándo recomendarías cada una?",
    [["foto", "imagen", "serie de fotos"], ["video", "grab", "nvr", "continu"], ["alarma", "evento", "disparo", "verificac"], ["bateria", "inalambr", "sin cable"], ["cable", "poe", "red", "ethernet", "internet"], ["privacidad", "monitoreo", "central"]],
    "MotionCam: fotos solo cuando hay alarma (o a pedido), a batería y sin cable, sirve para verificar. Cámaras: video continuo y grabación en NVR, necesitan cable/red. Se pueden combinar."),

  // ---------------- REDES · nivel 1 ----------------
  mc("re01", "redes", 1, "Redes", "¿Qué hace el DHCP en una red?",
    ["Asigna automáticamente una IP a cada equipo que se conecta", "Traduce nombres de páginas a IP", "Cifra el Wi-Fi", "Abre puertos hacia internet"], 0, "Traducir nombres es lo que hace el DNS."),
  mc("re02", "redes", 1, "Redes", "En una red hogareña, la puerta de enlace (gateway) de los equipos suele ser:",
    ["La IP del router", "La IP pública del cliente", "255.255.255.0", "La IP del DVR"], 0),
  mc("re03", "redes", 1, "Redes", "¿Para qué sirve hacer «ping» a un equipo?",
    ["Para ver si responde en la red", "Para cambiarle la IP", "Para reiniciarlo", "Para abrir un puerto"], 0),
  mc("re04", "redes", 1, "Redes", "¿Por qué se le pone IP fija a un DVR/NVR?",
    ["Para que no cambie de dirección y sigan funcionando los accesos y puertos", "Para que vaya más rápido", "Porque sin IP fija no graba", "Para que no use internet"], 0),
  mc("re05", "redes", 1, "Redes", "¿Cuál es el orden de colores de la norma T568B?",
    ["Blanco-naranja, naranja, blanco-verde, azul, blanco-azul, verde, blanco-marrón, marrón", "Blanco-verde, verde, blanco-naranja, azul, blanco-azul, naranja, blanco-marrón, marrón", "Naranja, blanco-naranja, verde, blanco-verde, azul, blanco-azul, marrón, blanco-marrón", "Blanco-azul, azul, blanco-naranja, naranja, blanco-verde, verde, blanco-marrón, marrón"], 0, "La segunda opción es la T568A."),
  mc("re06", "redes", 1, "Redes", "Si dos equipos de la misma red tienen la misma IP:",
    ["Hay conflicto de IP y alguno se desconecta o anda de a ratos", "Funcionan los dos sin problema", "El router les asigna otra automáticamente siempre", "Se suman las velocidades"], 0),
  mc("re07", "redes", 1, "Redes", "¿Qué hace el DNS?",
    ["Traduce nombres (como hik-connect.com) a direcciones IP", "Asigna IP a los equipos", "Protege la red de virus", "Une dos redes Wi-Fi"], 0),
  ab("re08", "redes", 1, "Redes", "¿Qué diferencia hay entre una IP fija y una IP por DHCP? ¿Cuándo conviene cada una?",
    [["automatic", "dhcp", "router asigna", "la da el router", "asigna"], ["fija", "estatica", "manual"], ["no cambia", "siempre la misma", "cambia"], ["camara", "nvr", "dvr", "alarma", "equipo", "impresora"], ["rango", "fuera", "conflicto", "reserva"]],
    "DHCP: la asigna el router y puede cambiar (celulares, PCs). Fija: se pone a mano y no cambia; conviene en DVR/NVR, cámaras y módulos de alarma, fuera del rango del DHCP (o con reserva)."),

  // ---------------- REDES · nivel 2 ----------------
  mc("re09", "redes", 2, "Redes", "¿Cuál de estas es una IP pública?",
    ["192.168.0.10", "10.0.0.5", "172.16.4.2", "200.45.12.8"], 3),
  mc("re10", "redes", 2, "Redes", "Con máscara 255.255.255.0 (/24), ¿cuántos equipos se pueden conectar en esa red?",
    ["254", "256", "255", "128"], 0),
  mc("re11", "redes", 2, "Redes", "¿Qué es abrir un puerto (port forwarding)?",
    ["Redirigir un puerto de la IP pública del router a un equipo de la red interna", "Habilitar el Wi-Fi para invitados", "Cambiar la IP del router", "Conectar un switch al router"], 0),
  mc("re12", "redes", 2, "Redes", "Al poner una IP fija a una cámara, conviene elegirla:",
    ["Dentro del rango del DHCP para que el router la reconozca", "Fuera del rango que reparte el DHCP, en la misma subred", "En otra subred para que no moleste", "Igual a la del router"], 1),
  mc("re13", "redes", 2, "Redes", "Muchas cámaras y equipos Wi-Fi hogareños no aparecen al configurarlos. Una causa común es que:",
    ["Solo funcionan en 2,4 GHz y el celular está en la red de 5 GHz", "Necesitan IP pública", "No tienen DHCP", "Solo andan con cable cruzado"], 0),
  mc("re14", "redes", 2, "Redes", "Para ver cámaras desde afuera, ¿qué velocidad del internet del cliente importa más?",
    ["La de bajada", "La de subida", "La del Wi-Fi", "Ninguna, usa la nube"], 1),
  ab("re15", "redes", 2, "Redes", "El cliente cambió de proveedor de internet (y de router) y desde afuera no ve más las cámaras. ¿Qué revisás?",
    [["router", "modem"], ["rango", "subred", "ip", "gateway", "puerta de enlace"], ["dhcp", "fija", "estatica"], ["p2p", "nube", "hik-connect", "online", "offline"], ["puerto", "forward", "ddns", "cgnat", "ip publica"], ["dns"]],
    "El router nuevo puede usar otro rango: el NVR con IP fija vieja queda en otra subred o con gateway/DNS mal. Corregir la IP, gateway y DNS, ver que P2P quede online y, si se usaban puertos, volver a abrirlos (o ver CGNAT)."),

  // ---------------- REDES · nivel 3 ----------------
  mc("re16", "redes", 3, "Redes", "Red 192.168.1.0/25. ¿Cuál de estas IP NO pertenece a esa red?",
    ["192.168.1.10", "192.168.1.100", "192.168.1.126", "192.168.1.130"], 3, "/25 va de .0 a .127."),
  mc("re17", "redes", 3, "Redes", "Una cámara con IP fija se ve bien dentro de la casa pero no conecta a la nube (P2P). La causa más probable es:",
    ["Gateway o DNS mal configurados en la cámara", "La máscara está en 255.255.255.0", "Le falta el puerto 554", "Está conectada a un switch"], 0),
  mc("re18", "redes", 3, "Redes", "Para que el router siempre le dé la misma IP a un NVR, sin ponerla fija en el equipo, se usa:",
    ["Una reserva de DHCP por dirección MAC", "Un DNS dinámico", "Abrir un puerto", "Cambiar la máscara"], 0),
  mc("re19", "redes", 3, "Redes", "El proveedor da internet con CGNAT. ¿Qué pasa si abrís puertos en el router del cliente para ver el DVR?",
    ["No funciona desde afuera: el cliente no tiene una IP pública propia; hay que usar P2P/nube o pedir IP pública", "Funciona igual que siempre", "Funciona solo con DDNS", "Funciona solo por Wi-Fi"], 0),
  mc("re20", "redes", 3, "Redes", "Hay un router del proveedor y detrás otro router del cliente (doble NAT). Para abrir un puerto hacia el NVR:",
    ["Basta con abrirlo en el router del cliente", "Hay que abrirlo en los dos routers (o poner el del proveedor en modo puente)", "Basta con abrirlo en el del proveedor", "No se puede de ninguna forma"], 1),
  ab("re21", "redes", 3, "Redes", "Explicá qué es CGNAT y cómo afecta el acceso remoto a un DVR/NVR o a una alarma.",
    [["ip publica", "compart", "varios clientes", "misma ip"], ["puerto", "abrir", "forward"], ["p2p", "nube", "servidor", "cloud", "hik-connect"], ["proveedor", "isp", "pedir", "solicitar"], ["vpn", "ddns", "modo puente"]],
    "El proveedor comparte una IP pública entre muchos clientes: el cliente no tiene IP pública propia y abrir puertos no sirve. Se resuelve con P2P/nube, pidiendo IP pública al proveedor o con una VPN."),
];

module.exports = { BANCO, TEMARIOS };
