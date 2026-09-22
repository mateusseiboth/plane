-- Ferramentas do atendente e da gestão do chat (W05): frases prontas, envio sem
-- o nome do atendente, pausa do alerta de cliente sem resposta, dados técnicos
-- do cliente, feriados e o índice do gerenciador de conversas.

CREATE TABLE IF NOT EXISTS "chat_frases_prontas" (
  "id" UUID NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chat_frases_prontas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "chat_frases_prontas_workspace_id_ordem_idx" ON "chat_frases_prontas" ("workspace_id", "ordem");

ALTER TABLE "chat_sessions"
  ADD COLUMN IF NOT EXISTS "sla_alert_paused_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "client_info" JSONB NOT NULL DEFAULT '{}';

-- Gerenciador: histórico inteiro do espaço, filtrado e ordenado pela abertura.
CREATE INDEX IF NOT EXISTS "chat_sessions_workspace_id_created_at_idx" ON "chat_sessions" ("workspace_id", "created_at");

ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "without_sender_name" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "chat_bot_config"
  ADD COLUMN IF NOT EXISTS "holidays" JSONB NOT NULL DEFAULT '[]';
