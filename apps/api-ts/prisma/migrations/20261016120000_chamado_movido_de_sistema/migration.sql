-- "Alterar sistema" do chamado: o antigo vai para Cancelados e aponta para o
-- novo, aberto no sistema de destino. O apontamento direto deixa o selo do
-- número (e o "veio de" do novo) sem depender de varrer as relações.
-- Um chamado é movido uma vez só, então o destino é único.
ALTER TABLE "issues" ADD COLUMN "moved_to_issue_id" UUID;

CREATE UNIQUE INDEX "issues_moved_to_issue_id_key" ON "issues"("moved_to_issue_id");

ALTER TABLE "issues" ADD CONSTRAINT "issues_moved_to_issue_id_fkey" FOREIGN KEY ("moved_to_issue_id") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
