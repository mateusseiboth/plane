-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "chat_contacts" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "protocol" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" UUID,
    "client_browser_id" TEXT,
    "client_name" TEXT,
    "client_phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'bot',
    "queue_id" UUID,
    "assigned_attendant_id" TEXT,
    "current_flow_id" UUID,
    "flow_state" JSONB NOT NULL DEFAULT '{}',
    "bot_state" TEXT NOT NULL DEFAULT 'new',
    "last_client_message_at" TIMESTAMP(3),
    "last_attendant_message_at" TIMESTAMP(3),
    "idle_prompted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "sender" TEXT NOT NULL,
    "sender_user_id" TEXT,
    "sender_name" TEXT,
    "type" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "media_key" TEXT,
    "media_mime" TEXT,
    "media_name" TEXT,
    "reply_to_id" UUID,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "external_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_read_states" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_read_message_id" TEXT,
    "last_read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_read_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_queues" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_queue_members" (
    "id" UUID NOT NULL,
    "queue_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "chat_queue_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_attendant_schedules" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,

    CONSTRAINT "chat_attendant_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_attendant_breaks" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,

    CONSTRAINT "chat_attendant_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_bot_config" (
    "workspace_id" TEXT NOT NULL,
    "welcome_message" TEXT NOT NULL DEFAULT 'Olá! Bem-vindo ao atendimento.',
    "menu_header" TEXT NOT NULL DEFAULT 'Escolha uma opção:',
    "no_attendants_message" TEXT NOT NULL DEFAULT 'No momento não há atendentes disponíveis. Assim que possível retornaremos.',
    "ask_name_message" TEXT NOT NULL DEFAULT 'Para começarmos, qual é o seu nome?',
    "confirm_contact_message" TEXT NOT NULL DEFAULT 'Você é {name}?',
    "idle_prompt_message" TEXT NOT NULL DEFAULT 'Você ainda precisa de ajuda?',
    "idle_close_message" TEXT NOT NULL DEFAULT 'Atendimento encerrado por inatividade. Protocolo: {protocol}',
    "closed_message" TEXT NOT NULL DEFAULT 'Atendimento encerrado. Protocolo: {protocol}',
    "routing_alpha" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "routing_beta" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_bot_config_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateTable
CREATE TABLE "chat_bot_menu_options" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "queue_id" UUID,
    "flow_id" UUID,
    "message" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_bot_menu_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_bot_flows" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_bot_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_provider_config" (
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'zapi',
    "instance_id" TEXT,
    "token" TEXT,
    "client_token" TEXT,
    "base_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_provider_config_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateTable
CREATE TABLE "chat_protocol_counters" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chat_protocol_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_contacts_workspace_id_idx" ON "chat_contacts"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_contacts_workspace_id_phone_key" ON "chat_contacts"("workspace_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_protocol_key" ON "chat_sessions"("protocol");

-- CreateIndex
CREATE INDEX "chat_sessions_workspace_id_status_idx" ON "chat_sessions"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "chat_sessions_assigned_attendant_id_idx" ON "chat_sessions"("assigned_attendant_id");

-- CreateIndex
CREATE INDEX "chat_sessions_client_browser_id_idx" ON "chat_sessions"("client_browser_id");

-- CreateIndex
CREATE INDEX "chat_sessions_client_phone_idx" ON "chat_sessions"("client_phone");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_created_at_idx" ON "chat_messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_messages_external_id_idx" ON "chat_messages"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_read_states_session_id_user_id_key" ON "chat_read_states"("session_id", "user_id");

-- CreateIndex
CREATE INDEX "chat_queues_workspace_id_idx" ON "chat_queues"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_queue_members_queue_id_user_id_key" ON "chat_queue_members"("queue_id", "user_id");

-- CreateIndex
CREATE INDEX "chat_attendant_schedules_workspace_id_user_id_idx" ON "chat_attendant_schedules"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "chat_attendant_breaks_workspace_id_user_id_idx" ON "chat_attendant_breaks"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "chat_bot_menu_options_workspace_id_idx" ON "chat_bot_menu_options"("workspace_id");

-- CreateIndex
CREATE INDEX "chat_bot_flows_workspace_id_idx" ON "chat_bot_flows"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_protocol_counters_workspace_id_day_key" ON "chat_protocol_counters"("workspace_id", "day");

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "chat_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_queue_members" ADD CONSTRAINT "chat_queue_members_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "chat_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

