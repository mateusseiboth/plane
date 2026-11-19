-- Solicitação criada a partir da ouvidoria (testes da nova intranet 3): uma
-- ouvidoria tem no máximo uma solicitação, e a ouvidoria mostra o processo dela.
ALTER TABLE "ouvidorias" ADD COLUMN "solicitacao_issue_id" UUID;

CREATE UNIQUE INDEX "ouvidorias_solicitacao_issue_id_key" ON "ouvidorias"("solicitacao_issue_id");

ALTER TABLE "ouvidorias"
  ADD CONSTRAINT "ouvidorias_solicitacao_issue_id_fkey"
  FOREIGN KEY ("solicitacao_issue_id") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
