-- Avaliação do atendimento feita pelo cliente no portal (paridade com o
-- Service Desk do suporte antigo). Uma por conclusão: reabrir marca a vigente
-- como substituída em superseded_at.

-- CreateTable
CREATE TABLE "portal_evaluations" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "service_rating" INTEGER NOT NULL,
    "expectation" INTEGER NOT NULL,
    "comment" TEXT,
    "superseded_at" TIMESTAMP(3),

    CONSTRAINT "portal_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portal_evaluations_issue_id_idx" ON "portal_evaluations"("issue_id");

-- CreateIndex
CREATE INDEX "portal_evaluations_workspace_id_created_at_idx" ON "portal_evaluations"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "portal_evaluations" ADD CONSTRAINT "portal_evaluations_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_evaluations" ADD CONSTRAINT "portal_evaluations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
