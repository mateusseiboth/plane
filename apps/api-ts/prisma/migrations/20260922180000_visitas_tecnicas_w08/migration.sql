-- Visitas técnicas (W08): funcionalidades atendidas e contador do número N-AAAA.
ALTER TABLE "technical_visits" ADD COLUMN "module_ids" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "technical_visit_counters" (
    "workspace_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technical_visit_counters_pkey" PRIMARY KEY ("workspace_id","year")
);

ALTER TABLE "technical_visit_counters" ADD CONSTRAINT "technical_visit_counters_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
