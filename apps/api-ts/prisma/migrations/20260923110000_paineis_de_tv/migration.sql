-- Painéis de TV sem login (W18): chaves de API de painel e o mapeamento das
-- colunas por painel. Sem FK para o espaço de trabalho de propósito, como o
-- mural: o espaço é apagado de forma lógica e a chave revogada fica como histórico.

-- CreateTable
CREATE TABLE "panel_keys" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "last_four" VARCHAR(4) NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" UUID,

    CONSTRAINT "panel_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panel_settings" (
    "workspace_id" UUID NOT NULL,
    "panel" VARCHAR(20) NOT NULL,
    "columns" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "panel_settings_pkey" PRIMARY KEY ("workspace_id","panel")
);

-- CreateIndex
CREATE UNIQUE INDEX "panel_keys_key_hash_key" ON "panel_keys"("key_hash");

-- CreateIndex
CREATE INDEX "panel_keys_workspace_id_idx" ON "panel_keys"("workspace_id");
