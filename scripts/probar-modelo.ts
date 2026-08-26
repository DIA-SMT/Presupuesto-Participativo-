/**
 * Prueba de humo del acceso al modelo (src/lib/modelo.ts).
 *
 * Con OPENROUTER_API_KEY configurada hace una consulta real y muestra la
 * respuesta y el consumo. Sin clave, o con una invalida, verifica que el error
 * se traduzca a un mensaje presentable en vez de reventar.
 *
 * Correr con:  npx tsx scripts/probar-modelo.ts
 */
import "./cargar-env";
import {
  CONSUMO_VACIO,
  crearCliente,
  hayClave,
  mensajeDeError,
  modeloPara,
  sumarConsumo,
} from "../src/lib/modelo";

async function main() {
  const modelo = modeloPara("chat");
  console.log(`modelo configurado: ${modelo}`);

  if (!hayClave()) {
    console.log(
      "\nSin OPENROUTER_API_KEY: el chat responde con el buscador determinístico" +
        "\ny las funciones de IA quedan desactivadas. Nada rompe.",
    );
    return;
  }

  const cliente = crearCliente();
  try {
    const respuesta = await cliente.chat.completions.create({
      model: modelo,
      max_tokens: 64,
      messages: [
        {
          role: "user",
          content: "Respondé solamente con la palabra: listo",
        },
      ],
    });

    const consumo = sumarConsumo(CONSUMO_VACIO, respuesta.usage);
    console.log(`\nrespuesta: ${respuesta.choices[0]?.message?.content?.trim()}`);
    console.log(
      `consumo: ${consumo.tokensEntrada} tokens de entrada, ` +
        `${consumo.tokensSalida} de salida, ${consumo.cacheLectura} desde cache`,
    );
    console.log("\nCONEXION OK");
  } catch (causa) {
    console.error(
      `\nFALLO. Mensaje que veria una persona: "${mensajeDeError(causa, "Hubo un problema.")}"`,
    );
    console.error("Detalle tecnico:", causa instanceof Error ? causa.message : causa);
    // exitCode y no process.exit(): deja que el proceso cierre sus conexiones.
    process.exitCode = 1;
  }
}

main();
