-- La idea queda atada a la persona que la presento. Desde esta version, para
-- presentar una idea desde el sitio hay que ingresar con CIDITUC: el nombre del
-- autor sale de la cuenta y la idea guarda el votante del padron que la cargo.
--
--   ideas.votante_id   la fila de `votantes` (DNI solo hasheado). Null en lo
--                      cargado por el equipo, lo migrado, lo anterior a esta
--                      migracion y el modo prueba; pasa a null si se borra la
--                      fila del padron.
--
-- Solo agrega: una columna que admite null, su clave foranea y un indice. No
-- toca ninguna fila. Va ANTES del deploy del codigo que la escribe.
ALTER TABLE "ideas" ADD COLUMN "votante_id" integer;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_votante_id_votantes_id_fk" FOREIGN KEY ("votante_id") REFERENCES "public"."votantes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ideas_votante_idx" ON "ideas" USING btree ("votante_id");