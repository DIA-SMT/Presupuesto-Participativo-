"use client";

/**
 * El comprobante que el equipo le imprime al vecino cuando carga su idea desde
 * el panel (una asamblea, mesa de entradas).
 *
 * Es el mismo DocumentoIdea que el formulario publico usa como vista previa y
 * como PDF, con su pie de comprobante (numero, codigo y fecha): el papel que se
 * lleva el vecino de la oficina es igual al que se descarga quien la presenta
 * por el sitio. Se reusa tal cual, sin tocarlo.
 *
 * Lo unico que se le suma es como se usa el codigo, que el pie de DocumentoIdea
 * no dice: en la pantalla de "idea recibida" del sitio lo explica la pagina, y
 * aca el papel tiene que explicarse solo. La hoja de impresion de DocumentoIdea
 * deja en el papel SOLO el documento (visibility en todo lo demas), asi que las
 * instrucciones irian a parar afuera. La regla de abajo corre el "solo esto" un
 * nivel mas arriba, a este envoltorio, y deja al documento en su lugar dentro
 * de el. Tiene mas especificidad que la de DocumentoIdea (dos clases contra
 * una), que es lo que decide entre dos `!important`.
 *
 * `canal_detalle` NO va en el papel, aunque sea de la propia persona: el
 * esquema lo marca como dato interno, y el papel no lo necesita.
 */
import DocumentoIdea from "@/components/DocumentoIdea";
import { formatearFecha } from "@/lib/formato";
import type { IdeaCargada } from "./operaciones";

export default function Comprobante({
  idea,
  poligono,
  sitio,
}: {
  idea: IdeaCargada;
  /** Contorno del distrito, para el mapita del documento. */
  poligono: number[][] | null;
  /** El dominio del sitio, sin el protocolo: es lo que se copia de un papel. */
  sitio: string;
}) {
  return (
    <div className="comprobante-vecino">
      <DocumentoIdea
        datos={{
          titulo: idea.titulo,
          categoria: idea.categoria,
          barrio: idea.barrio ?? "",
          distrito: idea.distrito,
          punto: { lat: idea.lat, lon: idea.lon },
          solucion: idea.solucion ?? "",
          problema: idea.problema ?? "",
          beneficios: idea.beneficios ?? "",
        }}
        anio={idea.anio}
        poligono={poligono}
        comprobante={{
          numero: idea.numero,
          codigo: idea.codigo,
          fecha: formatearFecha(idea.fecha),
        }}
      />
      <div className="comprobante-instrucciones">
        <p>
          <strong>Para saber cómo sigue tu idea</strong>, entrá a{" "}
          <strong>{sitio}/ideas/seguimiento</strong> y escribí el número de la idea y el código de
          seguimiento. Vas a ver en qué etapa está y la devolución del equipo técnico.
        </p>
        <p>
          Guardá este papel: el código no se puede recuperar desde el sitio. Si lo perdés,
          preguntá en la oficina del programa con el número y tu nombre.
        </p>
        <p>
          La idea la cargó el equipo del Presupuesto Participativo con lo que presentaste. No se
          publica hasta que el equipo la revisa.
        </p>
      </div>
      <style>{estilos}</style>
    </div>
  );
}

/*
 * Ojo con los backticks: es un template literal y uno adentro de un
 * comentario CSS lo corta.
 */
const estilos = `
.comprobante-instrucciones {
  margin-top: 0.875rem;
  padding: 0.75rem 1rem;
  border: 1px dashed var(--borde);
  border-radius: 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--texto-suave);
}
.comprobante-instrucciones p + p { margin-top: 0.375rem; }
.comprobante-instrucciones strong { color: var(--texto); }

@media print {
  .comprobante-vecino {
    position: absolute !important;
    inset: 0 auto auto 0;
    width: 100%;
  }
  .comprobante-vecino,
  .comprobante-vecino * { visibility: visible !important; }
  .comprobante-vecino .documento-idea { position: static !important; }
  .comprobante-instrucciones {
    border-color: #cbd5e1;
    color: #16202e;
    break-inside: avoid;
  }
}
`;
