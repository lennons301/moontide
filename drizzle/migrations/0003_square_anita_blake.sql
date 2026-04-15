CREATE TABLE "bundle_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price_in_pence" integer NOT NULL,
	"credits" integer NOT NULL,
	"expiry_days" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bundle_config_name_unique" UNIQUE("name")
);
