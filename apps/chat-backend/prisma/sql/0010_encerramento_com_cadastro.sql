-- Encerramento com classificação e cadastro do cliente.
--
-- No SAC antigo, ao encerrar o atendimento o atendente escolhia para qual
-- sistema era o suporte e, se o contato não tivesse cadastro, cadastrava ali
-- mesmo. Sem isso o atendimento fecha sem dizer sobre o que era, e o relatório
-- por sistema fica cego.
--
-- `entity_id` liga o contato do chat à entidade (o cliente) do Avião; não há
-- FK porque a tabela de entidades é gerida pela API principal e o chat trata
-- este banco como compartilhado, não como dono.
ALTER TABLE "chat_contacts"
  ADD COLUMN IF NOT EXISTS "entity_id" UUID;

CREATE INDEX IF NOT EXISTS "chat_contacts_entity_id_idx" ON "chat_contacts" ("entity_id");
