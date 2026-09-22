-- W15: ouvidoria (robô do WhatsApp), denúncia interna anônima e currículos.
-- `denuncias` não tem created_at nem hora de propósito: denúncia anônima não
-- pode ser correlacionada com quem estava logado naquele instante.

-- CreateTable
CREATE TABLE "ouvidorias" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "entity_id" UUID,
    "cnpj" VARCHAR(20),
    "name" TEXT NOT NULL,
    "phone" VARCHAR(30),
    "message" TEXT NOT NULL,
    "chat_session_id" UUID,
    "protocol" VARCHAR(30),
    "read_at" TIMESTAMP(3),
    "read_by_id" UUID,

    CONSTRAINT "ouvidorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "denuncias" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "is_anonymous" BOOLEAN NOT NULL,
    "author_id" UUID,
    "reported_on" DATE NOT NULL,

    CONSTRAINT "denuncias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculos" (
    "id" UUID NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" VARCHAR(30),
    "position" VARCHAR(120) NOT NULL,
    "message" TEXT,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "chat_session_id" UUID,
    "read_at" TIMESTAMP(3),
    "read_by_id" UUID,
    "interviewed_at" TIMESTAMP(3),
    "interviewed_by_id" UUID,

    CONSTRAINT "curriculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculo_config" (
    "workspace_id" UUID NOT NULL,
    "retention_days" INTEGER NOT NULL DEFAULT 365,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculo_config_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateIndex
CREATE INDEX "ouvidorias_workspace_id_read_at_idx" ON "ouvidorias"("workspace_id", "read_at");

-- CreateIndex
CREATE INDEX "ouvidorias_workspace_id_created_at_idx" ON "ouvidorias"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "denuncias_workspace_id_reported_on_idx" ON "denuncias"("workspace_id", "reported_on");

-- CreateIndex
CREATE INDEX "curriculos_workspace_id_received_at_idx" ON "curriculos"("workspace_id", "received_at");

-- AddForeignKey
ALTER TABLE "ouvidorias" ADD CONSTRAINT "ouvidorias_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ouvidorias" ADD CONSTRAINT "ouvidorias_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculos" ADD CONSTRAINT "curriculos_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculo_config" ADD CONSTRAINT "curriculo_config_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
