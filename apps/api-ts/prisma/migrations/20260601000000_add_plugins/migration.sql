-- CreateEnum
CREATE TYPE "PluginStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'ARCHIVED');

-- CreateTable
CREATE TABLE "plugins" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "version" VARCHAR(50) NOT NULL,
    "author" VARCHAR(255) NOT NULL,
    "entry_file" VARCHAR(500) NOT NULL,
    "manifest" JSONB NOT NULL,
    "permissions" TEXT[],
    "contributions" JSONB NOT NULL DEFAULT '{}',
    "status" "PluginStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "storage_key" VARCHAR(500) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "plugins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_versions" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" VARCHAR(50) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "manifest" JSONB NOT NULL,
    "contributions" JSONB NOT NULL DEFAULT '{}',
    "changelog" TEXT,
    "plugin_id" UUID NOT NULL,

    CONSTRAINT "plugin_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plugins_slug_key" ON "plugins"("slug");

-- CreateIndex
CREATE INDEX "plugins_status_idx" ON "plugins"("status");

-- CreateIndex
CREATE INDEX "plugins_created_by_id_idx" ON "plugins"("created_by_id");

-- CreateIndex
CREATE INDEX "plugin_versions_plugin_id_idx" ON "plugin_versions"("plugin_id");

-- AddForeignKey
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_versions" ADD CONSTRAINT "plugin_versions_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
