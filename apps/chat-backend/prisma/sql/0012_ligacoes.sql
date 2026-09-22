-- Registro de ligações do FreePBX (substitui o módulo "tickets" do legado).
--
-- A ligação é uma `chat_sessions` com channel = 'phone': entra na caixa, no
-- protocolo, no histórico e nos relatórios como qualquer atendimento. Esta
-- tabela guarda só o que é da ligação: os dados que o PBX manda (idempotente
-- por call_id dentro do espaço) e o que o atendente registra ao concluir.
--
-- `ticket_*` aponta para o chamado aberto a partir da ligação (issue ou
-- solicitação do api-ts). Sem FK: `issues` é gerida pela API principal, mesma
-- decisão de 0010/0011.
CREATE TABLE IF NOT EXISTS "chat_ligacoes" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "caller" TEXT,
    "extension" TEXT,
    "status" TEXT NOT NULL DEFAULT 'answered',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_sec" INTEGER,
    "recording_url" TEXT,
    "descricao" TEXT,
    "concluded_by_id" TEXT,
    "concluded_at" TIMESTAMP(3),
    "ticket_kind" TEXT,
    "ticket_id" UUID,
    "ticket_project_id" UUID,
    "ticket_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_ligacoes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_ligacoes_session_id_fkey" FOREIGN KEY ("session_id")
      REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_ligacoes_session_id_key" ON "chat_ligacoes"("session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "chat_ligacoes_workspace_id_call_id_key" ON "chat_ligacoes"("workspace_id", "call_id");
CREATE INDEX IF NOT EXISTS "chat_ligacoes_workspace_id_created_at_idx" ON "chat_ligacoes"("workspace_id", "created_at");

-- Token de serviço do PBX: só o hash (SHA-256) e os 4 últimos caracteres.
CREATE TABLE IF NOT EXISTS "chat_telefonia_config" (
    "workspace_id" TEXT NOT NULL,
    "token_hash" TEXT,
    "token_last4" TEXT,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_telefonia_config_pkey" PRIMARY KEY ("workspace_id")
);

-- Ramal do PBX → atendente.
CREATE TABLE IF NOT EXISTS "chat_ramais" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_ramais_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_ramais_workspace_id_extension_key" ON "chat_ramais"("workspace_id", "extension");

-- Filtro por canal na lista de atendimentos (?channel=phone).
CREATE INDEX IF NOT EXISTS "chat_sessions_workspace_id_channel_idx" ON "chat_sessions"("workspace_id", "channel");
