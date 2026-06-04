-- G1: per-plugin instance configuration
CREATE TABLE "plugin_configs" (
    "id" UUID NOT NULL,
    "plugin_id" UUID NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'workspace',
    "scope_id" TEXT,
    "value" JSONB NOT NULL DEFAULT '{}',
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plugin_configs_plugin_id_scope_scope_id_key"
    ON "plugin_configs"("plugin_id", "scope", "scope_id");
CREATE INDEX "plugin_configs_plugin_id_idx" ON "plugin_configs"("plugin_id");

-- G2: custom permission grants
CREATE TABLE "plugin_permission_grants" (
    "id" UUID NOT NULL,
    "plugin_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_permission_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plugin_permission_grants_unique"
    ON "plugin_permission_grants"("plugin_id", "workspace_id", "subject_type", "subject_id", "permission");
CREATE INDEX "plugin_permission_grants_plugin_id_workspace_id_idx"
    ON "plugin_permission_grants"("plugin_id", "workspace_id");
