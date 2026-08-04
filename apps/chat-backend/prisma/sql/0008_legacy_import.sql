-- Importação do histórico do chat antigo (SAC/MySQL): guarda o id de origem
-- (`chat.chat_id` / `chat_mensagens.chat_mensagens_id`) para que a migração seja
-- idempotente — reexecutar não duplica sessões nem mensagens.
ALTER TABLE "chat_sessions"
  ADD COLUMN IF NOT EXISTS "legacy_id" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "chat_sessions_legacy_id_key"
  ON "chat_sessions" ("legacy_id");

ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "legacy_id" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_legacy_id_key"
  ON "chat_messages" ("legacy_id");
