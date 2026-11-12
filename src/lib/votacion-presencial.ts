/**
 * La votacion es presencial, en urnas: lo decidio la Direccion de Centros
 * Vecinales en noviembre de 2026, conforme al Decreto 0981/S.Gral./2024 ("las
 * votaciones se realizaran en urnas que seran instaladas, organizadas y
 * controladas por la Direccion de Centros Vecinales"). El voto por el sitio
 * con CIDITUC queda apagado.
 *
 * Apagado:
 *  - /votar no arma boleta ni pide ingresar: dice cuando y donde se vota;
 *  - /ingresar?para=votar no ofrece el boton (ver `etapaDejaIngresar`);
 *  - POST /api/votos y /api/votos/distrito responden 410 aunque les llegue un
 *    pedido (una pestaña vieja, un script).
 * La etapa "votacion" del panel sigue existiendo: dice que la votacion esta en
 * curso y deja fija la nomina de proyectos. El codigo del voto en linea
 * (boleta, padron, registrarVoto) queda intacto y vuelve a funcionar con
 * `true`.
 *
 * Es una constante del codigo y no una variable de entorno por lo mismo que
 * AVISO_POR_MAIL_HABILITADO: abrir una via de votacion tiene que pasar por una
 * revision del codigo. Vive en un archivo sin dependencias porque la leen el
 * servidor y paginas que pueden correr en el navegador.
 */
export const VOTACION_ONLINE_HABILITADA: boolean = false;

/**
 * Que dia vota cada distrito. Lo informo la Direccion de Centros Vecinales el
 * 12/11/2026. Las fechas de la base (`votacion_desde`, `votacion_hasta`) dicen
 * el tramo entero; esto dice el dia de cada distrito, que la base no guarda.
 * Cuando el programa fije otra votacion, se cambia aca.
 */
export const TURNOS_DE_VOTACION: ReadonlyArray<{
  fecha: string;
  desde: number;
  hasta: number;
}> = [
  { fecha: "2026-12-17", desde: 1, hasta: 10 },
  { fecha: "2026-12-18", desde: 11, hasta: 20 },
];

/** El turno de un distrito, o null si no tiene (un numero fuera de 1 a 20). */
export function turnoDelDistrito(distrito: number) {
  return TURNOS_DE_VOTACION.find((t) => distrito >= t.desde && distrito <= t.hasta) ?? null;
}

/**
 * Las sedes de votacion de cada distrito. Vacio mientras el programa no las
 * confirme: el sitio dice "a confirmar" y no inventa direcciones.
 */
export const SEDES_DE_VOTACION: Readonly<
  Record<number, { lugar: string; direccion: string; horario?: string }>
> = {};

/** Lo que se lleva y lo que se acredita para votar (Ordenanza 5.027/19, art. 7). */
export const REQUISITOS_PARA_VOTAR = [
  "Ser mayor de 16 años.",
  "Llevar tu DNI: con él acreditás que vivís dentro del distrito donde votás.",
  "Las personas extranjeras sin ciudadanía pueden votar si acreditan al menos 2 años de residencia efectiva en la ciudad.",
  "No hace falta estar registrado en CIDITUC.",
] as const;

/** "jueves 17 de diciembre de 2026": el dia de un turno, dicho entero. */
export function diaDelTurno(fecha: string): string {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).replace(",", "");
}

/**
 * "los distritos 1 a 10 el jueves 17 de diciembre de 2026 y los distritos 11 a
 * 20 el viernes 18 de diciembre de 2026": los turnos en una frase, para las
 * reglas, los pasos y el chat.
 */
export function turnosEnTexto(): string {
  const partes = TURNOS_DE_VOTACION.map(
    (t) => `los distritos ${t.desde} a ${t.hasta} el ${diaDelTurno(t.fecha)}`,
  );
  return partes.length > 1
    ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`
    : (partes[0] ?? "");
}
