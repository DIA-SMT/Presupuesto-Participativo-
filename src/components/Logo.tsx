/**
 * Identidad visual.
 *
 * `LogoFlor` es el isotipo municipal (dos petalos anchos y el sol) redibujado
 * como SVG para que escale nitido en el header, el favicon y el pie.
 * `SelloDireccionIA` es el bloque de autoria de la Direccion de IA que cierra
 * todas las paginas del sitio.
 */

/** Trazos de los petalos, compartidos por el logo y el sello. */
const PETALO_IZQUIERDO =
  "M38 5 C 13 17, 1 46, 9 69 C 15 85, 26 93, 41 97 C 33 66, 32 33, 38 5 Z";
const PETALO_DERECHO =
  "M74 18 C 96 33, 102 62, 89 81 C 81 91, 70 95, 58 97 C 58 68, 63 40, 74 18 Z";
const SOL = { cx: 60, cy: 13, r: 11.5 };

export function LogoFlor({
  tamano = 40,
  titulo,
}: {
  tamano?: number;
  titulo?: string;
}) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 100 100"
      role={titulo ? "img" : "presentation"}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      <path d={PETALO_IZQUIERDO} fill="var(--logo-azul, #0a63f0)" />
      <path d={PETALO_DERECHO} fill="var(--logo-celeste, #2fa8fa)" />
      <circle {...SOL} fill="var(--logo-amarillo, #f2d500)" />
    </svg>
  );
}

/**
 * Sello de autoria: se muestra al pie de todas las paginas.
 * La flor en celeste degrade y el texto gris replican el lockup oficial de la
 * Direccion de IA.
 */
export function SelloDireccionIA() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <a
        href="https://smt.gob.ar"
        rel="noreferrer"
        className="flex items-center gap-3.5"
        aria-label="Dirección de Inteligencia Artificial, Municipalidad de San Miguel de Tucumán"
      >
        <svg width="52" height="52" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id="ia-petalo" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#4db4fb" />
              <stop offset="1" stopColor="#1173e8" />
            </linearGradient>
          </defs>
          <path d={PETALO_IZQUIERDO} fill="url(#ia-petalo)" />
          <path d={PETALO_DERECHO} fill="url(#ia-petalo)" opacity="0.88" />
          <circle {...SOL} fill="#f2d500" />
        </svg>
        <span className="text-left leading-none" style={{ color: "#8b9096" }}>
          <span className="block text-sm font-bold uppercase tracking-[0.28em]">
            Dirección
          </span>
          <span className="mt-1 block text-2xl font-extrabold uppercase tracking-[0.12em]">
            de IA
          </span>
        </span>
      </a>
      <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
        Sitio desarrollado por la Dirección de Inteligencia Artificial
        <span className="hidden sm:inline"> · </span>
        <span className="block sm:inline">Municipalidad de San Miguel de Tucumán</span>
      </p>
    </div>
  );
}
