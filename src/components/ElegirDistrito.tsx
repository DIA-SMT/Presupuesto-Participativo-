"use client";

/**
 * Donde la persona dice en que distrito vive, antes de votar.
 *
 * CIDITUC no informa el domicilio: el distrito lo declara la persona. Para que
 * no tenga que saber su numero de distrito (casi nadie lo sabe), lo encuentra
 * por su barrio o marcando su casa en el mapa, y despues tilda "Declaro que
 * vivo en el distrito N". Lo puede cambiar hasta votar.
 *
 * Todo lo que usa para encontrarlo se queda en su navegador:
 *  - el buscador compara contra un indice de los barrios de la capa oficial que
 *    llega con la pagina (indiceDeBarrios): lo que escribe no viaja;
 *  - el punto del mapa (o el del GPS) se convierte en distrito aca mismo, con la
 *    geometria publica de /geo/distritos.geojson. Pedirselo a /api/distrito
 *    dejaba la ubicacion de la casa de alguien en la URL, y con ella en los
 *    registros del hosting.
 * Al servidor llega solo el numero de distrito y la declaracion
 * (POST /api/votos/distrito).
 */
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { BarrioDelIndice } from "@/lib/barrios";
import { distritoDelPunto, type ColeccionDistritos, type Punto } from "@/lib/geo";
import { claveDeBarrio } from "@/lib/texto";
import Mapa from "./Mapa";

type Props = {
  /** El distrito que ya tiene declarado, si esta cambiandolo. */
  actual: number | null;
  /** El que sale del barrio de su cuenta de CIDITUC, si queda en uno solo. */
  sugerido: { distrito: number; barrio: string } | null;
  barrios: BarrioDelIndice[];
  /** Solo al cambiarlo: volver a la boleta sin tocar nada. */
  onCancelar?: () => void;
};

/** De donde salio el distrito elegido, para decirselo a la persona. */
type Eleccion = { distrito: number; como: string };

const DISTRITOS_DEL_MAPA = Array.from({ length: 20 }, (_, i) => ({
  numero: i + 1,
  nombre: `Distrito ${i + 1}`,
  ideas: 0,
  color: null,
  etiquetaGanador: null,
}));

/** "5", "5 y 6", "5, 6 y 8". */
function enumerar(numeros: number[]): string {
  if (numeros.length < 2) return numeros.join("");
  return `${numeros.slice(0, -1).join(", ")} y ${numeros.at(-1)}`;
}

export default function ElegirDistrito({ actual, sugerido, barrios, onCancelar }: Props) {
  const router = useRouter();
  const [eleccion, setEleccion] = useState<Eleccion | null>(
    sugerido
      ? { distrito: sugerido.distrito, como: `tu cuenta de CIDITUC dice que vivís en ${sugerido.barrio}` }
      : null,
  );
  const [consulta, setConsulta] = useState("");
  const [conMapa, setConMapa] = useState(false);
  const [punto, setPunto] = useState<Punto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [declaro, setDeclaro] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const geografia = useRef<ColeccionDistritos | null>(null);

  // Los barrios que coinciden, como los busca el chat: primero el nombre
  // exacto, despues los que empiezan asi y al final los que lo contienen.
  const resultados = useMemo(() => {
    const clave = claveDeBarrio(consulta);
    if (clave.length < 2) return [];
    const exactos: BarrioDelIndice[] = [];
    const empiezan: BarrioDelIndice[] = [];
    const contienen: BarrioDelIndice[] = [];
    for (const barrio of barrios) {
      if (barrio.clave === clave) exactos.push(barrio);
      else if (barrio.clave.startsWith(clave)) empiezan.push(barrio);
      else if (` ${barrio.clave}`.includes(` ${clave}`)) contienen.push(barrio);
    }
    return [...exactos, ...empiezan, ...contienen].slice(0, 6);
  }, [consulta, barrios]);

  function elegir(nueva: Eleccion) {
    setEleccion(nueva);
    // Otro distrito es otra declaracion: se vuelve a tildar.
    setDeclaro(false);
    setError(null);
  }

  async function elegirPunto(nuevo: Punto, como: string) {
    setPunto(nuevo);
    try {
      if (!geografia.current) {
        const respuesta = await fetch("/geo/distritos.geojson");
        geografia.current = (await respuesta.json()) as ColeccionDistritos;
      }
    } catch {
      setAviso("No pudimos cargar el mapa de los distritos. Probá buscando tu barrio.");
      return;
    }
    const distrito = distritoDelPunto(nuevo, geografia.current);
    if (distrito === null) {
      setAviso(
        "Ese punto queda fuera de los 20 distritos de la ciudad. Marcá tu casa dentro de San Miguel de Tucumán.",
      );
      return;
    }
    setAviso(null);
    elegir({ distrito, como });
  }

  function usarMiUbicacion() {
    setConMapa(true);
    if (!("geolocation" in navigator)) {
      setAviso("Tu navegador no deja usar la ubicación: marcá tu casa en el mapa.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicion) =>
        void elegirPunto(
          { lat: posicion.coords.latitude, lon: posicion.coords.longitude },
          "tu ubicación de ahora",
        ),
      () => setAviso("No pudimos usar tu ubicación. Marcá tu casa en el mapa."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function confirmar() {
    if (!eleccion || !declaro || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/votos/distrito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distrito: eleccion.distrito, declaro: true }),
      });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string };
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "No pudimos guardar tu distrito.");
      // La sesion nueva ya lleva el distrito: /votar se vuelve a dibujar con la
      // boleta.
      router.refresh();
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "No pudimos guardar tu distrito.");
      setEnviando(false);
    }
  }

  return (
    <section className="superficie mt-8 max-w-2xl rounded-2xl p-6 sm:p-8" aria-labelledby="titulo-distrito">
      <h2 id="titulo-distrito" className="text-xl font-bold">
        {actual ? "Cambiar tu distrito" : "¿En qué distrito vivís?"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
        Votás un proyecto del distrito donde vivís. Buscá tu barrio o marcá tu casa en el mapa, y el
        distrito sale solo.
      </p>

      {sugerido && (
        <p
          className="mt-4 rounded-xl px-4 py-3 text-sm leading-relaxed"
          style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
        >
          Tu cuenta de CIDITUC dice que vivís en <strong>{sugerido.barrio}</strong>, que queda en el{" "}
          <strong>Distrito {sugerido.distrito}</strong>. Si es así, confirmalo abajo; si no, buscá tu
          barrio.
        </p>
      )}

      {/* --- Por el barrio ---------------------------------------------------- */}
      <label className="mt-6 grid gap-1.5">
        <span className="text-sm font-semibold">Buscá tu barrio</span>
        <input
          type="search"
          value={consulta}
          onChange={(evento) => setConsulta(evento.target.value)}
          placeholder="Por ejemplo: Villa Urquiza"
          autoComplete="off"
          className="rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde-control)", color: "var(--texto)" }}
        />
      </label>
      {claveDeBarrio(consulta).length >= 2 && (
        <ul className="mt-2 grid gap-1.5" aria-label="Barrios que coinciden">
          {resultados.length === 0 && (
            <li className="text-sm" style={{ color: "var(--texto-suave)" }}>
              No encontramos ese barrio. Probá con otro nombre, o marcá tu casa en el mapa.
            </li>
          )}
          {resultados.map((barrio) =>
            barrio.distritos.length === 1 ? (
              <li key={barrio.clave}>
                <button
                  type="button"
                  onClick={() =>
                    elegir({ distrito: barrio.distritos[0], como: `tu barrio, ${barrio.nombre}` })
                  }
                  className="w-full rounded-xl px-3 py-2 text-left text-sm transition hover:brightness-95"
                  style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde)" }}
                >
                  <strong>{barrio.nombre}</strong> · Distrito {barrio.distritos[0]}
                </button>
              </li>
            ) : (
              <li
                key={barrio.clave}
                className="rounded-xl px-3 py-2 text-sm"
                style={{ background: "var(--fondo-suave)", border: "1px dashed var(--borde)" }}
              >
                <strong>{barrio.nombre}</strong> está repartido entre los distritos{" "}
                {enumerar(barrio.distritos)}: para saber en cuál votás,{" "}
                <button type="button" className="font-semibold underline" onClick={() => setConMapa(true)}>
                  marcá tu casa en el mapa
                </button>
                .
              </li>
            ),
          )}
        </ul>
      )}

      {/* --- Por el mapa -------------------------------------------------------- */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {!conMapa && (
          <button
            type="button"
            onClick={() => setConMapa(true)}
            className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:brightness-95"
            style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde-control)", color: "var(--texto)" }}
          >
            Marcar mi casa en el mapa
          </button>
        )}
        <button
          type="button"
          onClick={usarMiUbicacion}
          className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:brightness-95"
          style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde-control)", color: "var(--texto)" }}
        >
          Usar mi ubicación
        </button>
      </div>
      {conMapa && (
        <div className="mt-3">
          <Mapa
            modo="seleccionar"
            onSeleccionar={(p) => void elegirPunto(p, "el punto que marcaste en el mapa")}
            puntoElegido={punto}
            distritoActivo={eleccion?.distrito}
            distritos={DISTRITOS_DEL_MAPA}
            alto="20rem"
          />
          <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
            Tocá el mapa donde está tu casa. El punto no se guarda ni se envía: solo sirve para saber
            en qué distrito cae.
          </p>
        </div>
      )}
      {aviso && (
        <p role="status" className="mt-3 text-sm" style={{ color: "var(--acento-texto)" }}>
          {aviso}
        </p>
      )}

      {/* --- La declaracion ----------------------------------------------------- */}
      {eleccion && (
        <div
          className="mt-6 rounded-2xl p-5"
          style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
        >
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            Según {eleccion.como}, votás en el
          </p>
          <p className="mt-0.5 text-2xl font-bold">Distrito {eleccion.distrito}</p>
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
            <input
              type="checkbox"
              checked={declaro}
              onChange={(evento) => setDeclaro(evento.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              Declaro que vivo en el <strong>Distrito {eleccion.distrito}</strong>.
            </span>
          </label>
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl px-4 py-3 text-sm"
              style={{
                background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
                border: "1px solid var(--color-acento-600)",
              }}
            >
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={confirmar}
              disabled={!declaro || enviando}
              className="rounded-xl px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-40"
              style={{ background: "var(--color-marca-700)" }}
            >
              {enviando ? "Guardando…" : "Confirmar mi distrito"}
            </button>
            {onCancelar && (
              <button type="button" onClick={onCancelar} className="text-sm underline">
                Cancelar
              </button>
            )}
          </div>
          <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--texto-suave)" }}>
            Podés cambiarlo hasta que votes; después de votar queda fijo. Solo guardamos el número de
            distrito: lo que escribiste o marcaste acá no sale de tu dispositivo.
          </p>
        </div>
      )}
    </section>
  );
}
