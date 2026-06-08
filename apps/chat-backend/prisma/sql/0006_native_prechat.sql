-- Native pre-chat: client picks the "system" (a Plane project) it needs help with
-- and, optionally, a specific attendant to route directly to. Name is collected by
-- the widget (URL-injectable), not by the bot.
ALTER TABLE "chat_sessions"
  ADD COLUMN IF NOT EXISTS "project_id" UUID,
  ADD COLUMN IF NOT EXISTS "project_identifier" TEXT,
  ADD COLUMN IF NOT EXISTS "project_name" TEXT,
  ADD COLUMN IF NOT EXISTS "requested_attendant_id" TEXT;
