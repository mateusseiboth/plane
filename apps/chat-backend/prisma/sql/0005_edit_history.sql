-- AlterTable: keep prior versions of edited messages (staff-only edit history)
ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "edit_history" JSONB NOT NULL DEFAULT '[]';
