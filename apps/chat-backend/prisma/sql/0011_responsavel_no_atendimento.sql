-- O atendimento passa a apontar para o Responsável (`entity_contacts`): a
-- pessoa de carne e osso dentro do cliente, cadastro compartilhado com a
-- entidade e com a visita técnica.
--
-- O vínculo é preenchido em dois momentos: quando o bot identifica o número do
-- WhatsApp num responsável já cadastrado, e quando o atendente cadastra a
-- pessoa ao encerrar.
--
-- Não há FK: `entity_contacts` é gerida pela API principal e o chat trata este
-- banco como compartilhado, não como dono — mesma decisão de
-- 0010_encerramento_com_cadastro.sql para `chat_contacts.entity_id`.
ALTER TABLE "chat_sessions"
  ADD COLUMN IF NOT EXISTS "entity_contact_id" UUID;

CREATE INDEX IF NOT EXISTS "chat_sessions_entity_contact_id_idx"
  ON "chat_sessions" ("entity_contact_id");
