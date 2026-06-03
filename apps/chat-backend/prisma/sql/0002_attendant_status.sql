-- CreateTable
CREATE TABLE "chat_attendant_status" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_invisible" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_attendant_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_attendant_status_workspace_id_user_id_key" ON "chat_attendant_status"("workspace_id", "user_id");
