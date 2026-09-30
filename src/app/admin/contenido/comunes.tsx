"use client";

/**
 * Piezas que comparten las solapas de /admin/contenido: el estilo de los
 * campos, el mensaje de resultado de una accion, el contador de caracteres y
 * los avisos de formato. Sin hooks: son dibujos.
 */
import type { Resultado } from "../comun";
import { formatearNumero } from "@/lib/formato";

export const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};

export const claseBotonPrincipal =
  "rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";

export const estiloBotonPrincipal: React.CSSProperties = { background: "var(--color-marca-700)" };

export const claseBotonSecundario = "rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50";

export const estiloBotonSecundario: React.CSSProperties = {
  background: "var(--fondo-tarjeta)",
  border: "1px solid var(--borde-control)",
  color: "var(--texto)",
};

/**
 * El verde de "salio bien" como TEXTO. `--color-cat-ambiental` solo, que es lo
 * que usan los otros mensajes del panel, da 3,4:1 sobre blanco (y menos sobre
 * una pastilla teñida), abajo del 4,5:1 que pide WCAG 1.4.3 para letra chica.
 * Mezclado con `--texto` se oscurece en el tema claro (5,4:1 sobre blanco) y se
 * aclara en el oscuro, porque `--texto` cambia con el tema: un solo valor sirve
 * para los dos.
 */
export const colorExito = "color-mix(in srgb, var(--color-cat-ambiental) 70%, var(--texto))";

/**
 * Lo que contesto la accion. El contenedor con role="status" esta SIEMPRE
 * montado, vacio hasta que hay resultado: una region viva que aparece junto
 * con su texto no la anuncian todos los lectores de pantalla, y este mensaje
 * es la unica confirmacion de que el cambio se guardo.
 */
export function MensajeAccion({
  resultado,
  exito,
}: {
  resultado: Resultado | null;
  exito: string;
}) {
  return (
    <span
      role="status"
      className="text-sm"
      style={{ color: resultado && !resultado.ok ? "var(--acento-texto)" : colorExito }}
    >
      {resultado ? (resultado.ok ? (resultado.mensaje ?? exito) : resultado.error) : null}
    </span>
  );
}

/**
 * Cuantos caracteres van y cuantos entran. No se usa `maxLength` en los campos
 * a proposito: el navegador corta en silencio lo que se pega de mas, y en el
 * reglamento eso es perder el final de un texto legal sin enterarse. Aca se ve
 * cuanto sobra y la accion lo rechaza con el numero.
 */
export function Contador({ id, largo, maximo }: { id?: string; largo: number; maximo: number }) {
  const sobran = largo - maximo;
  return (
    <span
      id={id}
      className="text-xs tabular-nums"
      style={{ color: sobran > 0 ? "var(--acento-texto)" : "var(--texto-suave)" }}
    >
      {formatearNumero(largo)} de {formatearNumero(maximo)} caracteres
      {sobran > 0 && ` · sobran ${formatearNumero(sobran)}: así no se puede guardar`}
    </span>
  );
}

/**
 * Los avisos de `avisosDeFormato`. No es una region viva: cambian mientras se
 * escribe y anunciarlos en cada tecla seria ruido. El campo los referencia con
 * aria-describedby, asi que el lector los lee al entrar al campo.
 */
export function AvisosFormato({ id, avisos }: { id?: string; avisos: string[] }) {
  if (avisos.length === 0) return null;
  return (
    <ul id={id} className="mt-2 space-y-1 text-xs" style={{ color: "var(--acento-texto)" }}>
      {avisos.map((aviso) => (
        <li key={aviso}>{aviso}</li>
      ))}
    </ul>
  );
}

/** Pastilla chica para un estado ("Sin publicar", "Vacío", "En la portada"). */
export function Marca({
  children,
  tono = "neutro",
}: {
  children: React.ReactNode;
  tono?: "neutro" | "atencion" | "bien";
}) {
  // El fondo es el mismo color al 12%: sobre la tarjeta, las tres dan 4,5:1 o
  // mas en los dos temas (la verde gracias a `colorExito`).
  const color =
    tono === "atencion" ? "var(--acento-texto)" : tono === "bien" ? colorExito : "var(--texto-suave)";
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}
