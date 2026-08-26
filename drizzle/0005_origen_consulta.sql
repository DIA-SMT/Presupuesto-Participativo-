CREATE TYPE "public"."origen_consulta" AS ENUM('chat', 'asistente', 'informe');--> statement-breakpoint
ALTER TABLE "chat_consultas" ADD COLUMN "origen" "origen_consulta" DEFAULT 'chat' NOT NULL;