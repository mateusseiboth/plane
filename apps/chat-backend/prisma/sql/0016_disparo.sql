-- Disparo em massa (src/disparo/). Só quem tem a ação `chat.disparo`.
--
-- chat_disparo_mensagens  o cadastro: título, texto e arquivo opcional (imagem ou PDF).
-- chat_disparo_execucoes  cada envio, com a cópia do texto e do arquivo daquele
--                         momento (editar a mensagem não muda o que já saiu) e
--                         os filtros escolhidos.
-- chat_disparo_itens      um por telefone (único por execução): é a fila que o
--                         worker processa no ritmo configurado e o log por número.
-- chat_disparo_config     mensagens por minuto do espaço (1 a 60, padrão 20).
CREATE TABLE IF NOT EXISTS "chat_disparo_mensagens" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT,
    "media_key" TEXT,
    "media_mime" TEXT,
    "media_name" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "chat_disparo_mensagens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "chat_disparo_mensagens_workspace_id_deleted_at_idx"
    ON "chat_disparo_mensagens"("workspace_id", "deleted_at");

CREATE TABLE IF NOT EXISTS "chat_disparo_execucoes" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "mensagem_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT,
    "media_key" TEXT,
    "media_mime" TEXT,
    "media_name" TEXT,
    "filtros" JSONB NOT NULL DEFAULT '{}',
    "total" INTEGER NOT NULL DEFAULT 0,
    "sem_telefone" INTEGER NOT NULL DEFAULT 0,
    "repetidos" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'em_andamento',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    CONSTRAINT "chat_disparo_execucoes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_disparo_execucoes_mensagem_id_fkey" FOREIGN KEY ("mensagem_id")
      REFERENCES "chat_disparo_mensagens"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "chat_disparo_execucoes_workspace_id_created_at_idx"
    ON "chat_disparo_execucoes"("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "chat_disparo_execucoes_status_idx" ON "chat_disparo_execucoes"("status");

CREATE TABLE IF NOT EXISTS "chat_disparo_itens" (
    "id" UUID NOT NULL,
    "execucao_id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "contact_id" TEXT,
    "contact_name" TEXT,
    "entity_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "erro" TEXT,
    "external_id" TEXT,
    "tentado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_disparo_itens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_disparo_itens_execucao_id_fkey" FOREIGN KEY ("execucao_id")
      REFERENCES "chat_disparo_execucoes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_disparo_itens_execucao_id_telefone_key"
    ON "chat_disparo_itens"("execucao_id", "telefone");
CREATE INDEX IF NOT EXISTS "chat_disparo_itens_workspace_id_status_idx"
    ON "chat_disparo_itens"("workspace_id", "status");
CREATE INDEX IF NOT EXISTS "chat_disparo_itens_workspace_id_tentado_em_idx"
    ON "chat_disparo_itens"("workspace_id", "tentado_em");

CREATE TABLE IF NOT EXISTS "chat_disparo_config" (
    "workspace_id" TEXT NOT NULL,
    "mensagens_por_minuto" INTEGER NOT NULL DEFAULT 20,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_disparo_config_pkey" PRIMARY KEY ("workspace_id")
);
