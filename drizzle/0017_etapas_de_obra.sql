ALTER TYPE "public"."estado_presupuesto" ADD VALUE 'licitacion';--> statement-breakpoint
ALTER TYPE "public"."estado_presupuesto" ADD VALUE 'adjudicada';--> statement-breakpoint
ALTER TABLE "avances" ADD COLUMN "enlace" text;