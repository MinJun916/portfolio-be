-- Existing deployments may already have the original six-table schema.
-- Adopt only the known completed migration; partial/unknown schemas fail safely.
DO $baseline$
DECLARE legacy boolean := false;
BEGIN
  IF to_regclass('public.migrations') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.migrations
      WHERE name = 'InitialSchema1780857600000' AND timestamp = 1780857600000
    ) INTO legacy;
  END IF;
  IF legacy THEN
    IF EXISTS (
      SELECT 1 FROM unnest(ARRAY['site_content', 'admin_accounts', 'admin_sessions',
        'experiences', 'tech_groups', 'projects']) AS t(name)
      WHERE to_regclass('public.' || t.name) IS NULL
    ) THEN
      RAISE EXCEPTION 'Legacy migration exists but required tables are missing';
    END IF;
  ELSE
    CREATE TABLE "admin_accounts" (
    	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    	"email" text NOT NULL,
    	"passwordHash" text NOT NULL,
    	"isActive" boolean DEFAULT true NOT NULL,
    	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    	CONSTRAINT "admin_accounts_email_key" UNIQUE("email")
    );
    
    CREATE TABLE "admin_sessions" (
    	"tokenHash" text PRIMARY KEY NOT NULL,
    	"adminId" uuid NOT NULL,
    	"expiresAt" timestamp with time zone NOT NULL
    );
    
    CREATE TABLE "experiences" (
    	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    	"isPublished" boolean DEFAULT false NOT NULL,
    	"sortOrder" integer DEFAULT 0 NOT NULL,
    	"version" integer DEFAULT 1 NOT NULL,
    	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    	"title" text NOT NULL,
    	"organization" text NOT NULL,
    	"period" text NOT NULL,
    	"iconKey" text NOT NULL,
    	"responsibilities" text[] DEFAULT '{}' NOT NULL,
    	"skills" text[] DEFAULT '{}' NOT NULL,
    	CONSTRAINT "CHK_experiences_order" CHECK ("experiences"."sortOrder" BETWEEN 0 AND 100000),
    	CONSTRAINT "CHK_experiences_version" CHECK ("experiences"."version" > 0)
    );
    
    CREATE TABLE "projects" (
    	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    	"isPublished" boolean DEFAULT false NOT NULL,
    	"sortOrder" integer DEFAULT 0 NOT NULL,
    	"version" integer DEFAULT 1 NOT NULL,
    	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    	"slug" text NOT NULL,
    	"title" text NOT NULL,
    	"category" text NOT NULL,
    	"template" text NOT NULL,
    	"subtitle" text,
    	"description" text,
    	"imageSrc" text,
    	"logoSrc" text,
    	"role" text,
    	"period" text,
    	"repository" text,
    	"links" jsonb DEFAULT '[]' NOT NULL,
    	"keywords" text[] DEFAULT '{}' NOT NULL,
    	"techStack" text[] DEFAULT '{}' NOT NULL,
    	"content" jsonb DEFAULT '{}' NOT NULL,
    	"seo" jsonb DEFAULT '{}' NOT NULL,
    	"showOnHome" boolean DEFAULT false NOT NULL,
    	CONSTRAINT "projects_slug_key" UNIQUE("slug"),
    	CONSTRAINT "CHK_projects_category" CHECK ("projects"."category" IN ('major', 'side', 'etc')),
    	CONSTRAINT "CHK_projects_template" CHECK ("projects"."template" IN ('case-study', 'changelog', 'none')),
    	CONSTRAINT "CHK_projects_order" CHECK ("projects"."sortOrder" BETWEEN 0 AND 100000),
    	CONSTRAINT "CHK_projects_version" CHECK ("projects"."version" > 0)
    );
    
    CREATE TABLE "site_content" (
    	"id" integer PRIMARY KEY NOT NULL,
    	"data" jsonb NOT NULL,
    	"version" integer DEFAULT 1 NOT NULL,
    	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    	CONSTRAINT "CHK_site_singleton" CHECK ("site_content"."id" = 1),
    	CONSTRAINT "CHK_site_version" CHECK ("site_content"."version" > 0)
    );
    
    CREATE TABLE "tech_groups" (
    	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    	"isPublished" boolean DEFAULT false NOT NULL,
    	"sortOrder" integer DEFAULT 0 NOT NULL,
    	"version" integer DEFAULT 1 NOT NULL,
    	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    	"title" text NOT NULL,
    	"items" jsonb DEFAULT '[]' NOT NULL,
    	CONSTRAINT "CHK_tech_groups_order" CHECK ("tech_groups"."sortOrder" BETWEEN 0 AND 100000),
    	CONSTRAINT "CHK_tech_groups_version" CHECK ("tech_groups"."version" > 0)
    );
    
    ALTER TABLE "admin_sessions" ADD CONSTRAINT "FK_admin_sessions_admin" FOREIGN KEY ("adminId") REFERENCES "public"."admin_accounts"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "IDX_admin_sessions_expires" ON "admin_sessions" USING btree ("expiresAt");
    CREATE INDEX "IDX_experiences_public_order" ON "experiences" USING btree ("isPublished","sortOrder","id");
    CREATE INDEX "IDX_projects_public_order" ON "projects" USING btree ("isPublished","sortOrder","id");
    CREATE INDEX "IDX_tech_groups_public_order" ON "tech_groups" USING btree ("isPublished","sortOrder","id");
  END IF;
END $baseline$;
