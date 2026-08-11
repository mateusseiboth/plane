-- Responsáveis (contatos das entidades), pontos de estimativa no chamado,
-- filtros ricos nas preferências e o documento binário das páginas.

-- AlterTable
ALTER TABLE "cycle_user_properties" ADD COLUMN     "rich_filters" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "estimate_point_id" UUID;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "description_binary" BYTEA;

-- AlterTable
ALTER TABLE "project_user_properties" ADD COLUMN     "rich_filters" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "workspace_user_properties" ADD COLUMN     "rich_filters" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "entity_contact_types" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system_user" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "legacy_id" INTEGER,

    CONSTRAINT "entity_contact_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_contacts" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "entity_id" UUID,
    "type_id" UUID,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" VARCHAR(30),
    "phone_digits" VARCHAR(20),
    "photo" TEXT,
    "birth_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "receive_messages" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "legacy_id" INTEGER,
    "external_source" TEXT,
    "external_id" TEXT,

    CONSTRAINT "entity_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_visit_contacts" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visit_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,

    CONSTRAINT "technical_visit_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entity_contact_types_workspace_id_name_key" ON "entity_contact_types"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "entity_contacts_workspace_id_entity_id_idx" ON "entity_contacts"("workspace_id", "entity_id");

-- CreateIndex
CREATE INDEX "entity_contacts_workspace_id_phone_digits_idx" ON "entity_contacts"("workspace_id", "phone_digits");

-- CreateIndex
CREATE UNIQUE INDEX "entity_contacts_workspace_id_legacy_id_key" ON "entity_contacts"("workspace_id", "legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "technical_visit_contacts_visit_id_contact_id_key" ON "technical_visit_contacts"("visit_id", "contact_id");

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_estimate_point_id_fkey" FOREIGN KEY ("estimate_point_id") REFERENCES "estimate_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_contact_types" ADD CONSTRAINT "entity_contact_types_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_contacts" ADD CONSTRAINT "entity_contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_contacts" ADD CONSTRAINT "entity_contacts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_contacts" ADD CONSTRAINT "entity_contacts_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "entity_contact_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_contacts" ADD CONSTRAINT "entity_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_visit_contacts" ADD CONSTRAINT "technical_visit_contacts_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "technical_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_visit_contacts" ADD CONSTRAINT "technical_visit_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "entity_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
