-- WhatsApp-style read receipts: timestamp up to which the native client has read
-- the conversation. Attendant messages with created_at <= this are shown as "read"
-- (blue double-check).
ALTER TABLE "chat_sessions"
  ADD COLUMN IF NOT EXISTS "client_last_read_at" TIMESTAMP(3);
