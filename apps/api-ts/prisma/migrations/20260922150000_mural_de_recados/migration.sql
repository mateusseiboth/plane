-- Mural de recados da home (a antiga intra_mural + mural_lido da intranet).
-- Autor e anexo sem FK de propósito: o recado sobrevive à conta desativada e
-- ao anexo apagado. A leitura some junto com o recado.

-- CreateTable
CREATE TABLE "mural_recados" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description_html" TEXT NOT NULL DEFAULT '<p></p>',
    "description_stripped" TEXT NOT NULL DEFAULT '',
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "attachment_id" UUID,

    CONSTRAINT "mural_recados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mural_leituras" (
    "recado_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mural_leituras_pkey" PRIMARY KEY ("recado_id","user_id")
);

-- CreateIndex
CREATE INDEX "mural_recados_workspace_id_is_active_published_at_idx" ON "mural_recados"("workspace_id", "is_active", "published_at");

-- CreateIndex
CREATE INDEX "mural_leituras_user_id_idx" ON "mural_leituras"("user_id");

-- AddForeignKey
ALTER TABLE "mural_recados" ADD CONSTRAINT "mural_recados_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mural_leituras" ADD CONSTRAINT "mural_leituras_recado_id_fkey" FOREIGN KEY ("recado_id") REFERENCES "mural_recados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
