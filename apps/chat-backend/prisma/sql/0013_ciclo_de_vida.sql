-- Ciclo de vida do atendimento: encerramento classificado, abandono, pausa,
-- fim do dia, chamado vinculado e falha de envio.
--
-- Antes, a classificação do encerramento só existia nas conversas migradas do
-- SAC, dentro de `flow_state.legacy`. Os relatórios (por sistema, por motivo,
-- finalizados x abandonados) precisam dela em coluna, para qualquer conversa.
--
-- Sem FK para `entities`, `issues` e `modules`: são tabelas da API principal e o
-- chat trata este banco como compartilhado, não como dono (mesma decisão de
-- 0010 e 0011).

ALTER TABLE "chat_sessions"
  ADD COLUMN IF NOT EXISTS "entity_id" UUID,
  ADD COLUMN IF NOT EXISTS "close_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "close_module_id" UUID,
  ADD COLUMN IF NOT EXISTS "close_module_name" TEXT,
  ADD COLUMN IF NOT EXISTS "close_note" TEXT,
  ADD COLUMN IF NOT EXISTS "end_kind" TEXT,
  ADD COLUMN IF NOT EXISTS "abandon_type" SMALLINT,
  ADD COLUMN IF NOT EXISTS "paused_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "issue_id" UUID,
  ADD COLUMN IF NOT EXISTS "issue_project_id" UUID,
  ADD COLUMN IF NOT EXISTS "issue_label" TEXT;

CREATE INDEX IF NOT EXISTS "chat_sessions_workspace_id_closed_at_idx" ON "chat_sessions" ("workspace_id", "closed_at");
CREATE INDEX IF NOT EXISTS "chat_sessions_entity_id_idx" ON "chat_sessions" ("entity_id");
CREATE INDEX IF NOT EXISTS "chat_sessions_issue_id_idx" ON "chat_sessions" ("issue_id");

ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "send_error" TEXT;

ALTER TABLE "chat_bot_config"
  ADD COLUMN IF NOT EXISTS "close_reasons" JSONB NOT NULL DEFAULT '[{"key":"acesso","label":"Acesso"},{"key":"duvida","label":"Dúvida"},{"key":"correcao","label":"Correção"},{"key":"melhoria","label":"Melhoria"},{"key":"senha","label":"Senha"}]',
  ADD COLUMN IF NOT EXISTS "active_idle_prompt_message" TEXT NOT NULL DEFAULT 'Você não responde há mais de 10 minutos. Digite *1* para continuar o atendimento ou *99* para encerrar.',
  ADD COLUMN IF NOT EXISTS "end_of_day_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "end_of_day_time" TEXT,
  ADD COLUMN IF NOT EXISTS "end_of_day_message" TEXT NOT NULL DEFAULT 'Agradecemos seu contato. O atendimento foi encerrado e estamos à disposição sempre que precisar.';

ALTER TABLE "chat_provider_config"
  ADD COLUMN IF NOT EXISTS "webhook_token" TEXT;

-- Histórico do SAC: o que a migração guardou em flow_state.legacy vira coluna.
-- `serviceType` é o `chat_tipo_atendimento` (1 Acesso, 2 Dúvida, 3 Correção,
-- 4 Melhoria, 5 Senha). Só preenche o que ainda está vazio: rodar de novo não
-- sobrescreve classificação feita depois.
UPDATE "chat_sessions" SET "close_reason" = CASE ("flow_state" -> 'legacy' ->> 'serviceType')
    WHEN '1' THEN 'Acesso' WHEN '2' THEN 'Dúvida' WHEN '3' THEN 'Correção'
    WHEN '4' THEN 'Melhoria' WHEN '5' THEN 'Senha' END
  WHERE "close_reason" IS NULL AND "flow_state" -> 'legacy' ->> 'serviceType' IN ('1', '2', '3', '4', '5');

UPDATE "chat_sessions" SET "close_note" = "flow_state" -> 'legacy' ->> 'closeNote'
  WHERE "close_note" IS NULL AND COALESCE("flow_state" -> 'legacy' ->> 'closeNote', '') <> '';

UPDATE "chat_sessions" SET "end_kind" = CASE ("flow_state" -> 'legacy' ->> 'closedReason')
    WHEN 'finished' THEN 'atendente' WHEN 'abandoned' THEN 'abandono' END
  WHERE "end_kind" IS NULL AND "flow_state" -> 'legacy' ->> 'closedReason' IN ('finished', 'abandoned');
