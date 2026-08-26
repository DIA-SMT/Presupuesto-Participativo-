ALTER TYPE "public"."accion_revision" ADD VALUE 'informe';--> statement-breakpoint
CREATE TABLE "informes_impacto" (
	"id" serial PRIMARY KEY NOT NULL,
	"idea_id" integer NOT NULL,
	"resumen" text NOT NULL,
	"impacto_positivo" jsonb NOT NULL,
	"riesgos" jsonb NOT NULL,
	"preguntas" jsonb NOT NULL,
	"encuadre" text,
	"borrador_devolucion" text,
	"modelo" varchar(80) NOT NULL,
	"tokens_entrada" integer,
	"tokens_salida" integer,
	"ms" integer,
	"pedido_por_id" integer,
	"pedido_por_nombre" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "informes_impacto_idea_id_unique" UNIQUE("idea_id")
);
--> statement-breakpoint
ALTER TABLE "informes_impacto" ADD CONSTRAINT "informes_impacto_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "informes_impacto" ADD CONSTRAINT "informes_impacto_pedido_por_id_admins_id_fk" FOREIGN KEY ("pedido_por_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;