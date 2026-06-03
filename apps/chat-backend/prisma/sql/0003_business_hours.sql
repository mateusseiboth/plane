-- AlterTable: company-wide business hours + out-of-hours message
ALTER TABLE "chat_bot_config"
  ADD COLUMN IF NOT EXISTS "outside_hours_message" TEXT NOT NULL DEFAULT 'Estamos fora do horário de atendimento no momento. Retornaremos assim que possível.',
  ADD COLUMN IF NOT EXISTS "business_hours" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "business_breaks" JSONB NOT NULL DEFAULT '[]';
