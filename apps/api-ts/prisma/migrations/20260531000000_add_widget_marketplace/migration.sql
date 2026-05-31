-- CreateEnum
CREATE TYPE "WidgetStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'ARCHIVED');

-- CreateTable
CREATE TABLE "widgets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "version" VARCHAR(50) NOT NULL,
    "author" VARCHAR(255) NOT NULL,
    "entry_file" VARCHAR(500) NOT NULL,
    "manifest" JSONB NOT NULL,
    "permissions" TEXT[],
    "status" "WidgetStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "storage_key" VARCHAR(500) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "widgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "widget_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" VARCHAR(50) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "manifest" JSONB NOT NULL,
    "changelog" TEXT,
    "widget_id" UUID NOT NULL,

    CONSTRAINT "widget_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "widgets_status_idx" ON "widgets"("status");

-- CreateIndex
CREATE INDEX "widgets_created_by_id_idx" ON "widgets"("created_by_id");

-- CreateIndex
CREATE INDEX "widget_versions_widget_id_idx" ON "widget_versions"("widget_id");

-- AddForeignKey
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "widget_versions" ADD CONSTRAINT "widget_versions_widget_id_fkey" FOREIGN KEY ("widget_id") REFERENCES "widgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
