/**
 * Los pasos del recorrido guiado del panel, y que rol ve cada uno.
 *
 * Es solo datos: el componente que los muestra es ./recorrido.tsx. Separados
 * para que un texto se corrija sin tocar el componente, y para probarlos sin
 * navegador (scripts/tests/recorrido-panel.test.ts).
 *
 * Cada paso señala un elemento de una pantalla por su atributo
 * `data-recorrido`. Si ninguno de sus `anclas` esta en la pagina (la idea no
 * esta abierta, Migue no tiene consultas, la edicion esta plegada), el paso se
 * muestra igual, centrado y sin resaltar nada: por eso los textos no dicen
 * "aca" ni "este boton", sino el nombre de la cosa. La prueba exige que cada
 * ancla exista en el codigo del panel: si alguien saca o renombra un
 * `data-recorrido`, el recorrido no queda apuntando a la nada sin que nadie se
 * entere.
 *
 * Lo que dice cada rol tiene que coincidir con lo que ese rol puede hacer: el
 * rol minimo de cada accion es el `exigirAdmin` de las acciones del panel (ver
 * la lista de ROLES en equipo/panel.tsx). Un paso que solo tiene texto para
 * algunos roles no se le muestra a los demas.
 *
 * Nada de como funciona Migue por dentro: ni modelo, ni proveedor, ni nombres
 * de herramientas. La prueba lo controla.
 */
import type { RolAdmin } from "@/db/queries";

export type PasoRecorrido = {
  /** Identifica el paso; no se muestra. */
  id: string;
  /** La seccion del panel, para ubicarse ("Propuestas · paso 3 de 18"). */
  seccion: string;
  /**
   * La pantalla donde vive el paso. Si la persona esta en otra, el recorrido
   * navega. Null: el paso vale en cualquier pantalla y no se mueve.
   */
  ruta: string | null;
  /** Lo que se resalta, en orden de preferencia: el primero que este en la pagina. */
  anclas: string[];
  titulo: string;
  /** Un texto para todos los roles, o uno por rol (los que no tienen texto no ven el paso). */
  texto: string | Partial<Record<RolAdmin, string>>;
};

export const PASOS: PasoRecorrido[] = [
  {
    id: "bienvenida",
    seccion: "Bienvenida",
    ruta: null,
    anclas: [],
    titulo: "Te damos la bienvenida al panel",
    texto: {
      lector:
        "Tu cuenta es de lector: podés consultar todo el panel, pero no guardar cambios. Te mostramos cada pantalla en un par de minutos.",
      moderador:
        "Tu cuenta es de moderador: evaluás y publicás las propuestas de los vecinos. Te mostramos cada pantalla en un par de minutos.",
      admin:
        "Tu cuenta es de administrador: además de evaluar, manejás la etapa del proceso, el contenido del sitio y el equipo. Te mostramos cada pantalla en un par de minutos.",
    },
  },

  // --- Propuestas (/admin es la bandeja) ------------------------------------
  {
    id: "bandeja-estados",
    seccion: "Propuestas",
    ruta: "/admin",
    anclas: ["bandeja-estados"],
    titulo: "Las ideas por estado",
    texto:
      "Cada tarjeta es un estado de la evaluación: pendientes, factibles, no factibles, integradas y ganadoras. Tocá una para ver solo esas ideas, y tocala de nuevo para sacar el filtro.",
  },
  {
    id: "bandeja-graficos",
    seccion: "Propuestas",
    ruta: "/admin",
    anclas: ["bandeja-graficos", "bandeja-estados"],
    titulo: "Distritos, categorías y trabajo pendiente",
    texto:
      "Las ideas por distrito y por categoría, y el seguimiento del trabajo: a cuántas les falta la devolución y cuántas están sin publicar. Las columnas y las tarjetas también filtran. Si molestan, se ocultan con “Ocultar gráficos”.",
  },
  {
    id: "bandeja-buscador",
    seccion: "Propuestas",
    ruta: "/admin",
    anclas: ["bandeja-buscador"],
    titulo: "Buscar una propuesta",
    texto:
      "Elegí un distrito, o buscá por nombre, por barrio o por el código del papel (D05-P012): el listado se actualiza solo. Los filtros que tengas puestos aparecen al lado, y cada uno se saca tocándolo.",
  },
  {
    id: "bandeja-listado",
    seccion: "Propuestas",
    ruta: "/admin",
    anclas: ["bandeja-listado"],
    titulo: "Las propuestas",
    texto:
      "Cada tarjeta es una propuesta, con su código, su estado, los votos y el presupuesto que estimó el equipo. Arriba elegís el orden: para trabajar, más recientes, más votadas o de mayor a menor presupuesto. Tocá una tarjeta para abrir su ficha.",
  },
  {
    id: "bandeja-ficha",
    seccion: "Propuestas",
    ruta: "/admin",
    anclas: ["bandeja-ficha"],
    titulo: "La ficha de la idea",
    texto: {
      lector:
        "Al abrir una idea, su ficha muestra los datos, dónde queda en el mapa, el informe de impacto si lo hay y el historial de revisiones. Vos la ves en solo lectura.",
      moderador:
        "Al abrir una idea, desde su ficha estimás su presupuesto, la evaluás (el estado y la devolución al vecino), la publicás o la despublicás, la corregís (ahí se le asigna la categoría), la descartás o pedís el informe de impacto. Lo que la etapa no permite aparece deshabilitado, con el motivo. Todo queda en el historial con tu nombre.",
      admin:
        "Al abrir una idea, desde su ficha estimás su presupuesto, la evaluás, la publicás, la corregís (ahí se le asigna la categoría), la descartás o pedís el informe de impacto. Cuando cierra la votación, desde la misma ficha proclamás el proyecto ganador del distrito. Todo queda en el historial con tu nombre.",
    },
  },
  {
    id: "bandeja-cargar",
    seccion: "Propuestas",
    ruta: "/admin",
    anclas: ["bandeja-cargar"],
    titulo: "Cargar una propuesta en papel",
    texto: {
      moderador:
        "Los formularios de papel se cargan con “Cargar una propuesta”: la pantalla sigue la hoja renglón por renglón y, al guardar, te da el código (D05-P012) para escribir en el papel.",
      admin:
        "Los formularios de papel se cargan con “Cargar una propuesta”: la pantalla sigue la hoja renglón por renglón y, al guardar, te da el código (D05-P012) para escribir en el papel.",
    },
  },

  // --- Tablero ----------------------------------------------------------------
  {
    id: "tablero-resumen",
    seccion: "Propuestas · Estadísticas",
    ruta: "/admin/tablero",
    anclas: ["tablero-resumen"],
    titulo: "Los números de la edición",
    texto:
      "Ideas presentadas, pendientes de evaluación, proyectos ganadores, presupuesto, votos y vecinos empadronados. Más abajo: la composición por estado, las estadísticas por distrito y la actividad día por día. Con el selector de arriba mirás otra edición.",
  },
  {
    id: "tablero-ejecucion",
    seccion: "Propuestas · Estadísticas",
    ruta: "/admin/tablero",
    anclas: ["tablero-ejecucion", "tablero-resumen"],
    titulo: "Ejecución presupuestaria",
    texto:
      "Cuánto del presupuesto de la edición está asignado a los proyectos ganadores, y en qué etapa está cada obra. Si la edición no tiene el presupuesto total cargado, lo avisa.",
  },

  // --- Migue --------------------------------------------------------------------
  {
    id: "migue",
    seccion: "Proceso · Migue",
    ruta: "/admin/migue",
    anclas: ["migue-sin-resolver", "migue-encabezado"],
    titulo: "Lo que preguntan los vecinos",
    texto: {
      lector:
        "Lo que la gente le pregunta al asistente del sitio. Primero aparece lo que no pudo contestar: ahí se ve qué información le falta al sitio. Después, los temas más pedidos, cuánto se usa y las últimas consultas.",
      moderador:
        "Lo que la gente le pregunta al asistente del sitio. Primero aparece lo que no pudo contestar: ahí se ve qué información le falta al sitio. Después, los temas más pedidos, cuánto se usa y las últimas consultas.",
      admin:
        "Lo que la gente le pregunta al asistente del sitio. Primero aparece lo que no pudo contestar: si es un dato que el sitio debería tener, se carga en Contenido y el asistente lo empieza a usar.",
    },
  },

  // --- Etapa del proceso (/admin/ediciones) ---------------------------------------
  {
    id: "ediciones-etapa",
    seccion: "Proceso · Etapa",
    ruta: "/admin/ediciones",
    anclas: ["ediciones-etapa"],
    titulo: "La etapa del proceso",
    texto: {
      lector:
        "En qué etapa está la edición activa: presentación de ideas, evaluación técnica, votación, seguimiento de obras o cerrada.",
      moderador:
        "En qué etapa está la edición activa. La etapa define qué pueden hacer los vecinos en el sitio, y la cambia un administrador.",
      admin:
        "En esta pantalla cambiás la etapa de la edición activa, que define qué ve el sitio y cuándo se abre o se cierra la votación. Antes de confirmar, el panel te dice qué abre y qué cierra el cambio.",
    },
  },
  {
    id: "ediciones-fechas",
    seccion: "Proceso · Etapa",
    ruta: "/admin/ediciones",
    anclas: ["ediciones-fechas"],
    titulo: "Fechas y presupuesto",
    texto: {
      lector: "Las fechas de la edición y su presupuesto total. Los carga un administrador.",
      moderador: "Las fechas de la edición y su presupuesto total. Los carga un administrador.",
      admin:
        "Las fechas de la edición y su presupuesto total. Es el monto contra el que el Tablero mide la ejecución presupuestaria.",
    },
  },
  {
    id: "ediciones-cronograma",
    seccion: "Proceso · Etapa",
    ruta: "/admin/ediciones",
    anclas: ["ediciones-cronograma"],
    titulo: "El cronograma público",
    texto: {
      lector: "Los hitos del cronograma que ven los vecinos en el sitio.",
      moderador:
        "Los hitos del cronograma que ven los vecinos en el sitio. Los agregás, los corregís o los borrás en esta pantalla.",
      admin:
        "Los hitos del cronograma que ven los vecinos en el sitio. Los agregás, los corregís o los borrás en esta pantalla.",
    },
  },
  {
    id: "ediciones-nueva",
    seccion: "Proceso · Etapa",
    ruta: "/admin/ediciones",
    anclas: ["ediciones-nueva"],
    titulo: "Una edición nueva",
    texto: {
      admin:
        "Para el año siguiente: creás la edición con su año, le cargás las fechas y el presupuesto, y cuando llegue el momento la activás. Mientras no esté activa, el sitio sigue mostrando la actual.",
    },
  },

  // --- Contenido y Equipo: solo administradores --------------------------------------
  {
    id: "contenido",
    seccion: "Proceso · Contenido",
    ruta: "/admin/contenido",
    anclas: ["contenido-secciones"],
    titulo: "El contenido del sitio",
    texto: {
      admin:
        "Los textos del sitio, el reglamento, las preguntas frecuentes, las novedades y el aviso urgente. Cada cambio se ve en el sitio al instante, el asistente responde con lo mismo que dicen las páginas, y queda registrado con tu nombre.",
    },
  },
  {
    id: "equipo-alta",
    seccion: "Equipo",
    ruta: "/admin/equipo",
    anclas: ["equipo-alta"],
    titulo: "Dar de alta a alguien",
    texto: {
      admin:
        "Con el correo institucional de la persona y su rol. El sistema genera una contraseña provisoria que se muestra una sola vez: entregala en mano. Al entrar, el panel le pide que elija la suya.",
    },
  },
  {
    id: "equipo-cuentas",
    seccion: "Equipo",
    ruta: "/admin/equipo",
    anclas: ["equipo-cuentas"],
    titulo: "Las cuentas del equipo",
    texto: {
      admin:
        "En cada cuenta cambiás el rol, la desactivás, le restablecés la contraseña y, si ya está desactivada, la eliminás. Más abajo, la bitácora guarda cada uno de esos movimientos.",
    },
  },

  // --- Cierre, en la pantalla en que haya quedado -------------------------------------
  {
    id: "cuenta",
    seccion: "Tu cuenta",
    ruta: null,
    anclas: ["cuenta"],
    titulo: "Tu cuenta",
    texto:
      "Desde “Mi contraseña” la cambiás cuando quieras, y con “Salir” cerrás la sesión. Este recorrido lo volvés a ver desde “Recorrido”.",
  },
];

/** El texto de un paso para un rol, o null si ese rol no lo ve. */
export function textoPara(paso: PasoRecorrido, rol: RolAdmin): string | null {
  if (typeof paso.texto === "string") return paso.texto;
  return paso.texto[rol] ?? null;
}

/** Los pasos que ve un rol, en orden, con su texto ya elegido. */
export function pasosPara(rol: RolAdmin): (PasoRecorrido & { textoDelRol: string })[] {
  return PASOS.flatMap((paso) => {
    const texto = textoPara(paso, rol);
    return texto === null ? [] : [{ ...paso, textoDelRol: texto }];
  });
}
