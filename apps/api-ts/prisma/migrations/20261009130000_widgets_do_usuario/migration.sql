-- Widgets por usuário: qualquer membro ativo envia um widget que só aparece na
-- home dele. owner_user_id nulo = global (todos os widgets que já existiam).
-- Apagar a pessoa apaga os widgets privados dela: com SET NULL o pacote viraria
-- global por acidente e apareceria para todo mundo.
ALTER TABLE "widgets" ADD COLUMN "owner_user_id" UUID;

CREATE INDEX "widgets_owner_user_id_idx" ON "widgets"("owner_user_id");

ALTER TABLE "widgets" ADD CONSTRAINT "widgets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
