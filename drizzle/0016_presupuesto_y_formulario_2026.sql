-- Formulario de propuesta 2026 y presupuesto estimado por el equipo.
--
--   ideas.referencias_ubicacion  "Donde ocurre?": calles, esquina, altura. Publico.
--   ideas.organizacion           en nombre de que organizacion se presenta. No publico.
--   ideas.presupuesto_estimado   lo que estima el equipo al evaluar. No publico.
--   ideas.autor_telefono         contacto opcional, solo para el equipo; se borra
--                                con purgar-contactos al cerrar la edicion.
--   ideas.autor_dni_hash         DNI de una idea en papel, hasheado con DNI_PEPPER
--                                como votantes.dni_hash. Nunca en claro.
--
-- Solo agrega columnas que admiten null: no toca ninguna fila ni reescribe la
-- tabla. Va ANTES del deploy del codigo que las lee.
ALTER TABLE "ideas" ADD COLUMN "referencias_ubicacion" text;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "organizacion" text;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "presupuesto_estimado" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "autor_telefono" varchar(30);--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "autor_dni_hash" varchar(64);