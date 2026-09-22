-- Usuários e cadastros (W09): perfil do usuário, entidade completa com
-- congelamento, vínculo contato x sistema, histórico de congelamento e token
-- de redefinição de senha.
-- AlterTable
ALTER TABLE "entities" ADD COLUMN     "address_number" VARCHAR(20),
ADD COLUMN     "complement" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "fax" VARCHAR(30),
ADD COLUMN     "frozen_at" TIMESTAMP(3),
ADD COLUMN     "frozen_reason" TEXT,
ADD COLUMN     "related_entity_id" UUID,
ADD COLUMN     "representative_id" UUID,
ADD COLUMN     "state_registration" VARCHAR(30),
ADD COLUMN     "street" TEXT,
ADD COLUMN     "uses_third_party_cnpj" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "zip_code" VARCHAR(10);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "frozen_at" TIMESTAMP(3),
ADD COLUMN     "frozen_reason" TEXT,
ADD COLUMN     "mobile_phone" VARCHAR(30),
ADD COLUMN     "nickname" VARCHAR(60),
ADD COLUMN     "phone" VARCHAR(30);

-- CreateTable
CREATE TABLE "entity_contact_projects" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contact_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,

    CONSTRAINT "entity_contact_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freeze_events" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" UUID NOT NULL,
    "subject_kind" VARCHAR(20) NOT NULL,
    "subject_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "reason" TEXT,
    "actor_id" UUID,
    "affected" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "freeze_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" VARCHAR(20) NOT NULL,
    "subject_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "request_ip" TEXT,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entity_contact_projects_workspace_id_project_id_idx" ON "entity_contact_projects"("workspace_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "entity_contact_projects_contact_id_project_id_key" ON "entity_contact_projects"("contact_id", "project_id");

-- CreateIndex
CREATE INDEX "freeze_events_subject_kind_subject_id_created_at_idx" ON "freeze_events"("subject_kind", "subject_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_kind_subject_id_idx" ON "password_reset_tokens"("kind", "subject_id");

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_representative_id_fkey" FOREIGN KEY ("representative_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_related_entity_id_fkey" FOREIGN KEY ("related_entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_contact_projects" ADD CONSTRAINT "entity_contact_projects_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "entity_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_contact_projects" ADD CONSTRAINT "entity_contact_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freeze_events" ADD CONSTRAINT "freeze_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
