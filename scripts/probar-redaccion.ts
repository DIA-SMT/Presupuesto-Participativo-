/**
 * Corre la ayuda de redaccion contra el modelo real, sin levantar el sitio.
 *
 * Existe porque un prompt es codigo que se comporta distinto segun como este
 * escrito, y la unica forma de saber si mejora un texto es verlo mejorar
 * textos. La primera version del prompt de `formalizar` pasaba el typecheck,
 * respondia 200 y no servia para nada: corregia tildes y devolvia la misma
 * frase. Eso no lo detecta ningun test unitario, lo detecta leer la salida al
 * lado de la entrada.
 *
 * Los casos de prueba estan escritos como escribe la gente: sin tildes, con
 * concordancia rota, con la idea desordenada y con el problema implicito. El
 * primero es textual el que uso Lucas cuando dijo "no mejoro mi texto".
 *
 * Uso:
 *   npx tsx scripts/probar-redaccion.ts            (todos los casos)
 *   npx tsx scripts/probar-redaccion.ts 1 3        (solo esos casos)
 */
import "./cargar-env";
import { crearCliente, hayClave, modeloPara } from "../src/lib/modelo";
import { SISTEMA_BENEFICIOS, sistemaFormalizar } from "../src/lib/redaccion-prompts";

type Caso = {
  nombre: string;
  campo: "problema" | "solucion" | "beneficios";
  texto: string;
  /** Contexto, solo para beneficios. */
  problema?: string;
  solucion?: string;
  barrio?: string;
  /** Datos que NO tienen que aparecer en la salida: no los dijo la persona. */
  prohibido?: string[];
};

const CASOS: Caso[] = [
  {
    nombre: "el caso de Lucas: espacio verde con basura",
    campo: "problema",
    texto:
      "en la zona de atras del parque guillermina hay un gran espacio verde, que algunas veces se ven afectados por la basura y a la gente le gusta hacer deporte por esa zona.",
    prohibido: ["metros", "hectárea", "vecinos aproximadamente", "%", "canasto", "contenedor"],
  },
  {
    nombre: "texto corto y crudo",
    campo: "problema",
    texto: "en mi cuadra ay muchos pozos y cuando llueve se inunda todo",
    prohibido: ["metros", "cuadras", "casas", "familias", "centímetros"],
  },
  {
    nombre: "problema implicito, nunca lo nombra",
    campo: "problema",
    texto:
      "los chicos del barrio juegan a la pelota en la calle porque no hay otro lugar, pasan autos rapido por ahi",
    prohibido: ["accidente", "atropell", "km/h", "cantidad"],
  },
  {
    nombre: "solucion escrita como pedido",
    campo: "solucion",
    texto: "que pongan luces y arreglen los juegos de la placita asi los chicos pueden ir de noche",
    prohibido: ["LED", "luminarias de", "watts", "presupuesto", "$"],
  },
  {
    nombre: "texto largo y desordenado",
    campo: "problema",
    texto:
      "hay un baldio al lado de la escuela que esta lleno de yuyos y basura, se juntan ratas, los chicos pasan por ahi todos los dias para ir a clase y las madres tienen miedo, antes lo limpiaban pero hace mucho que no viene nadie",
    prohibido: ["metros", "cantidad de chicos", "hace dos años", "hace 5"],
  },
  {
    nombre: "beneficios deducidos del contexto",
    campo: "beneficios",
    texto: "",
    problema:
      "hay un baldio al lado de la escuela lleno de yuyos y basura, los chicos pasan por ahi todos los dias",
    solucion: "limpiar el terreno y hacer una plaza con juegos",
    barrio: "San Cayetano",
    prohibido: ["cientos", "%", "300", "metros"],
  },
];

const NARANJA = "[33m";
const VERDE = "[32m";
const ROJO = "[31m";
const GRIS = "[90m";
const FIN = "[0m";

async function pedir(caso: Caso): Promise<string> {
  const cliente = crearCliente();
  const sistema =
    caso.campo === "beneficios" ? SISTEMA_BENEFICIOS : sistemaFormalizar(caso.campo);

  const usuario =
    caso.campo === "beneficios"
      ? [
          "La persona dejó los beneficios vacíos. Deducilos del problema y la solución.",
          "",
          `<barrio>${caso.barrio ?? "no indicado"}</barrio>`,
          `<problema>${caso.problema ?? ""}</problema>`,
          `<solucion>${caso.solucion ?? ""}</solucion>`,
          "<beneficios_escritos_por_la_persona></beneficios_escritos_por_la_persona>",
        ].join("\n")
      : [
          `Formalizá este texto que escribió la persona. Es su ${caso.campo}.`,
          "",
          `<barrio>${caso.barrio ?? "no indicado"}</barrio>`,
          `<${caso.campo}_escrito_por_la_persona>${caso.texto}</${caso.campo}_escrito_por_la_persona>`,
        ].join("\n");

  const respuesta = await cliente.chat.completions.create({
    model: modeloPara("asistente"),
    max_tokens: 900,
    messages: [
      { role: "system", content: sistema },
      { role: "user", content: usuario },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "texto_del_campo",
        strict: true,
        schema: {
          type: "object",
          properties: { texto: { type: "string" } },
          required: ["texto"],
          additionalProperties: false,
        },
      },
    },
  });

  const crudo = respuesta.choices[0]?.message?.content ?? "{}";
  return String(JSON.parse(crudo).texto ?? "").trim();
}

/**
 * Dos senales automaticas, que no reemplazan leer la salida pero avisan rapido:
 * si el texto quedo practicamente igual (no hizo nada) y si aparecio alguna de
 * las palabras prohibidas (invento un dato).
 */
function medir(caso: Caso, salida: string) {
  const normal = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .split(/\s+/)
      .filter(Boolean);

  const antes = new Set(normal(caso.texto));
  const despues = normal(salida);
  const nuevas = despues.filter((p) => !antes.has(p)).length;
  const cambio = despues.length ? Math.round((nuevas / despues.length) * 100) : 0;

  const invento = (caso.prohibido ?? []).filter((p) =>
    salida.toLowerCase().includes(p.toLowerCase()),
  );

  return { cambio, largoAntes: caso.texto.length, largoDespues: salida.length, invento };
}

async function main() {
  if (!hayClave()) {
    console.error("Falta OPENROUTER_API_KEY en .env.local.");
    process.exitCode = 1;
    return;
  }

  const pedidos = process.argv.slice(2).map(Number).filter(Number.isInteger);
  const aCorrer = pedidos.length
    ? pedidos.map((n) => CASOS[n - 1]).filter(Boolean)
    : CASOS;

  console.log(`\nModelo: ${modeloPara("asistente")}   Casos: ${aCorrer.length}\n`);

  for (const [indice, caso] of aCorrer.entries()) {
    console.log(`${NARANJA}${"─".repeat(78)}${FIN}`);
    console.log(`${NARANJA}${indice + 1}. ${caso.nombre}${FIN}  ${GRIS}(${caso.campo})${FIN}\n`);

    if (caso.campo === "beneficios") {
      console.log(`${GRIS}problema:${FIN} ${caso.problema}`);
      console.log(`${GRIS}solucion:${FIN} ${caso.solucion}\n`);
    } else {
      console.log(`${GRIS}ESCRIBIO:${FIN} ${caso.texto}\n`);
    }

    try {
      const salida = await pedir(caso);
      console.log(`${VERDE}DEVOLVIO:${FIN} ${salida}\n`);

      const m = medir(caso, salida);
      const senal =
        caso.campo === "beneficios"
          ? `${m.largoDespues} caracteres`
          : `${m.largoAntes} → ${m.largoDespues} caracteres, ${m.cambio}% de palabras nuevas`;
      console.log(`${GRIS}${senal}${FIN}`);

      if (m.invento.length) {
        console.log(`${ROJO}INVENTO DATOS: ${m.invento.join(", ")}${FIN}`);
      }
      if (caso.campo !== "beneficios" && m.cambio < 15) {
        console.log(`${ROJO}CASI NO LO TOCO: solo ${m.cambio}% de palabras nuevas${FIN}`);
      }
      console.log("");
    } catch (causa) {
      console.log(`${ROJO}FALLO:${FIN} ${causa instanceof Error ? causa.message : causa}\n`);
    }
  }
}

void main();
