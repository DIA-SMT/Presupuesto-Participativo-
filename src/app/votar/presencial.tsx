/**
 * /votar cuando la votacion es presencial (VOTACION_ONLINE_HABILITADA en
 * src/lib/votacion-presencial.ts): no hay boleta ni ingreso, solo cuando,
 * donde y con que se vota, y el enlace a los proyectos de cada distrito.
 */
import Link from "next/link";
import { Aviso, Cartel } from "@/components/ui";
import { PASOS_PARA_VOTAR } from "@/lib/contenido-del-programa";
import type { EtapaEdicion } from "@/db/queries";
import { votacionTerminada } from "@/lib/ediciones";
import { formatearRango } from "@/lib/formato";
import {
  REQUISITOS_PARA_VOTAR,
  SEDES_DE_VOTACION,
  TURNOS_DE_VOTACION,
  diaDelTurno,
} from "@/lib/votacion-presencial";

type Props = {
  etapa: EtapaEdicion;
  votacionDesde: string | null;
  votacionHasta: string | null;
  titulo: string;
};

export default function VotacionPresencial({ etapa, votacionDesde, votacionHasta, titulo }: Props) {
  const sedes = Object.entries(SEDES_DE_VOTACION)
    .map(([distrito, sede]) => ({ distrito: Number(distrito), ...sede }))
    .sort((a, b) => a.distrito - b.distrito);
  const terminada = votacionTerminada(etapa);

  return (
    <div className="contenedor py-10 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">{titulo}</h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          La votación es presencial, en urnas, en sedes de cada distrito. No se vota por internet.
        </p>
      </header>

      <div className="mt-6 max-w-3xl space-y-6">
        {terminada ? (
          <Aviso tono="info">
            <strong>La votación ya terminó.</strong>{" "}
            {votacionDesde && <>Fue {formatearRango(votacionDesde, votacionHasta)}. </>}
            Los resultados se publican en{" "}
            <Link href="/transparencia" className="font-semibold underline">
              Transparencia
            </Link>
            .
          </Aviso>
        ) : etapa === "votacion" ? (
          <Aviso tono="info">
            <strong>La votación está en curso.</strong> Acercate a la sede de tu distrito el día que
            le toca, con tu DNI.
          </Aviso>
        ) : null}

        <Cartel tono="destacado" icono="voto" titulo="Qué día vota cada distrito">
          <ul className="mt-3 space-y-2">
            {TURNOS_DE_VOTACION.map((turno) => (
              <li key={turno.fecha} className="text-sm leading-relaxed">
                <strong>
                  Distritos {turno.desde} a {turno.hasta}:
                </strong>{" "}
                <span className="first-letter:uppercase">{diaDelTurno(turno.fecha)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm" style={{ color: "var(--texto-suave)" }}>
            ¿No sabés cuál es tu distrito?{" "}
            <Link href="/distritos" className="font-semibold underline">
              Buscalo por tu barrio
            </Link>
            .
          </p>
        </Cartel>

        <Cartel tono="info" icono="info" titulo="Dónde se vota">
          {sedes.length ? (
            <ul className="mt-3 space-y-2">
              {sedes.map((sede) => (
                <li key={sede.distrito} className="text-sm leading-relaxed">
                  <strong>Distrito {sede.distrito}:</strong> {sede.lugar}, {sede.direccion}
                  {sede.horario ? ` · ${sede.horario}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
              En sedes distribuidas por distrito. Las direcciones están a confirmar: las vamos a
              publicar acá apenas estén definidas.
            </p>
          )}
        </Cartel>

        <Cartel tono="consejo" icono="documento" titulo="Qué necesitás para votar">
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            {REQUISITOS_PARA_VOTAR.map((requisito) => (
              <li key={requisito}>{requisito}</li>
            ))}
          </ul>
        </Cartel>

        {/* Los mismos pasos que dicen Como participar y Migue. */}
        <Cartel tono="info" icono="consejo" titulo="Cómo se vota">
          <ol className="mt-3 space-y-3">
            {PASOS_PARA_VOTAR.map((paso, indice) => (
              <li key={paso.titulo} className="flex gap-3">
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                  style={{ background: "var(--color-marca-700)" }}
                  aria-hidden="true"
                >
                  {indice + 1}
                </span>
                <p className="text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
                  <strong style={{ color: "var(--texto)" }}>{paso.titulo}.</strong> {paso.texto}
                </p>
              </li>
            ))}
          </ol>
        </Cartel>

        <p className="text-sm">
          <Link href="/distritos" className="font-semibold underline">
            Ver los proyectos de cada distrito
          </Link>
        </p>
      </div>
    </div>
  );
}
