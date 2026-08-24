import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getEdiciones, getSeguimientoIdea, getTextos } from "@/db/queries";
import { codigoValido } from "@/lib/avisos";
import { consumir, hashearIp, ipDeCabeceras } from "@/lib/rate-limit";
import FormularioSeguimiento, { type ResultadoSeguimiento } from "./formulario";

export const metadata: Metadata = {
  title: "Seguí tu idea",
  description:
    "Consultá cómo sigue la idea que presentaste al Presupuesto Participativo de San Miguel de Tucumán con su número y su código de seguimiento.",
};

/**
 * Un solo mensaje para los dos casos: "no existe una idea con ese numero" y
 * "el codigo no corresponde a esa idea". Si el texto fuera distinto, probar
 * numeros con un codigo cualquiera diria cuales existen.
 */
const SIN_COINCIDENCIA =
  "No encontramos ninguna idea con ese número y ese código. Revisá los dos datos: el código tiene 8 caracteres y te lo dimos cuando enviaste la idea.";

/** Tope de intentos por IP: el codigo es corto, no puede probarse a ciegas. */
const INTENTOS = 10;
const VENTANA_SEGUNDOS = 600;

async function consultarSeguimiento(
  _previo: ResultadoSeguimiento | null,
  formulario: FormData,
): Promise<ResultadoSeguimiento> {
  "use server";

  const numero = Number(String(formulario.get("numero") ?? "").replace(/\D/g, ""));
  const codigo = String(formulario.get("codigo") ?? "").trim();

  if (!Number.isInteger(numero) || numero <= 0 || !codigo) {
    return {
      ok: false,
      error: "Completá el número de tu idea y el código de seguimiento.",
    };
  }

  const limite = await consumir(
    `seguimiento:${hashearIp(ipDeCabeceras(await headers()))}`,
    INTENTOS,
    VENTANA_SEGUNDOS,
  );
  if (!limite.permitido) {
    const minutos = Math.max(1, Math.ceil(limite.reiniciaEn / 60));
    return {
      ok: false,
      error: `Probaste demasiadas veces seguidas. Esperá ${minutos} ${
        minutos === 1 ? "minuto" : "minutos"
      } y volvé a intentar.`,
    };
  }

  // El numero es correlativo DENTRO de cada edicion, asi que el mismo numero
  // puede existir en varias. Se prueban de la mas nueva a la mas vieja: el
  // codigo se deriva del id, que es unico en todo el sitio, y por eso solo
  // puede validar contra una de ellas.
  const ediciones = await getEdiciones();
  for (const edicion of ediciones) {
    const idea = await getSeguimientoIdea(edicion.id, numero);
    if (!idea) continue;
    if (!codigoValido(idea.id, codigo)) continue;

    return {
      ok: true,
      idea: {
        anio: edicion.anio,
        numero: idea.numero ?? numero,
        titulo: idea.titulo,
        estado: idea.estado,
        devolucion: idea.motivoEstado,
        distrito: idea.distrito,
        fecha: idea.fecha,
        publicada: idea.publicada,
        // Sin publicar no hay ficha publica: el enlace llevaria a un 404.
        slug: idea.publicada ? idea.slug : null,
      },
    };
  }

  return { ok: false, error: SIN_COINCIDENCIA };
}

export default async function Seguimiento() {
  const textos = await getTextos().catch(() => ({}) as Record<string, string>);

  return (
    <div className="contenedor py-10 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Seguí tu idea</h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          Con el número de tu idea y el código de seguimiento podés ver en qué etapa está y leer la
          devolución del equipo técnico. No hace falta dejar tu correo ni esperar que te escribamos.
        </p>
      </header>

      <FormularioSeguimiento accion={consultarSeguimiento} />

      <section className="mt-14 grid max-w-4xl gap-5 sm:grid-cols-2">
        <div className="superficie rounded-2xl p-6">
          <h2 className="text-base font-semibold">¿Dónde están el número y el código?</h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
            Los dos aparecen en la pantalla de confirmación, justo después de enviar la idea. El
            código se muestra una sola vez, por eso pedimos anotarlo o sacarle una foto.
          </p>
          <p className="mt-3 text-sm">
            <Link href="/ideas/nueva" className="font-semibold underline">
              Presentá una idea nueva
            </Link>
          </p>
        </div>

        <div className="superficie rounded-2xl p-6">
          <h2 className="text-base font-semibold">Si perdiste el código</h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
            No se puede recuperar desde el sitio. Preguntá por tu idea en la oficina del programa, con
            el número y tu nombre.
          </p>
          {(textos["contacto-direccion"] || textos["contacto-telefono"]) && (
            <p className="mt-3 text-sm">
              {textos["contacto-direccion"]}
              {textos["contacto-direccion"] && textos["contacto-telefono"] && " · "}
              {textos["contacto-telefono"]}
            </p>
          )}
          <p className="mt-3 text-sm">
            Si tu idea ya está publicada, también la encontrás en el{" "}
            <Link href="/proyectos" className="font-semibold underline">
              listado de proyectos
            </Link>
            .
          </p>
        </div>
      </section>

      <p className="mt-8 max-w-3xl text-xs leading-relaxed" style={{ color: "var(--texto-suave)" }}>
        Esta consulta no muestra datos de contacto de ninguna persona. Limitamos la cantidad de
        intentos por conexión para que nadie pueda probar códigos al azar. Cómo tratamos tus datos
        está explicado en la{" "}
        <Link href="/privacidad" className="underline">
          política de privacidad
        </Link>
        .
      </p>
    </div>
  );
}
