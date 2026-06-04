-- AlterTable: post-service satisfaction survey on chat sessions (1..5 + comment)
ALTER TABLE "chat_sessions"
  ADD COLUMN IF NOT EXISTS "rating_score" INTEGER,
  ADD COLUMN IF NOT EXISTS "rating_comment" TEXT,
  ADD COLUMN IF NOT EXISTS "rating_state" TEXT,
  ADD COLUMN IF NOT EXISTS "rating_requested_at" TIMESTAMP(3);
