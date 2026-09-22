-- Pós-atendimento de chamados e de visitas (a antiga `posatendimento` do SAC).
-- Um registro por chamado OU por visita: o CHECK garante que exatamente um dos dois
-- está preenchido. Quem registrou e quem verificou ficam sem FK (o registro sobrevive
-- à conta desativada). O espaço vem pelo chamado ou pela visita, que já cascateiam.

-- CreateTable
CREATE TABLE "pos_atendimentos" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "issue_id" UUID,
    "visit_id" UUID,
    "expectativa" INTEGER,
    "classificacao" INTEGER,
    "problema_resolvido" VARCHAR(10),
    "meio_contato" INTEGER,
    "observacao" TEXT NOT NULL DEFAULT '',
    "recorded_by_id" UUID,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMP(3),
    "verification_comment" TEXT,
    "legacy_id" INTEGER,

    CONSTRAINT "pos_atendimentos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_atendimentos_um_alvo" CHECK (("issue_id" IS NULL) <> ("visit_id" IS NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_atendimentos_issue_id_key" ON "pos_atendimentos"("issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_atendimentos_visit_id_key" ON "pos_atendimentos"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_atendimentos_legacy_id_key" ON "pos_atendimentos"("legacy_id");

-- CreateIndex
CREATE INDEX "pos_atendimentos_workspace_id_verified_at_idx" ON "pos_atendimentos"("workspace_id", "verified_at");

-- CreateIndex
CREATE INDEX "pos_atendimentos_workspace_id_recorded_at_idx" ON "pos_atendimentos"("workspace_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "pos_atendimentos" ADD CONSTRAINT "pos_atendimentos_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_atendimentos" ADD CONSTRAINT "pos_atendimentos_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "technical_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
