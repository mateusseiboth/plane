-- AlterTable
ALTER TABLE "labels" ADD COLUMN     "sla_hours" INTEGER;

-- AlterTable
ALTER TABLE "project_members" ADD COLUMN     "workflow_role_id" UUID;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "language" SET DEFAULT 'pt-BR';

-- AlterTable
ALTER TABLE "workspace_members" ADD COLUMN     "workflow_role_id" UUID;

-- CreateTable
CREATE TABLE "workflow_roles" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 10,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "workflow_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_state_visibility" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group" TEXT NOT NULL,
    "state_name" TEXT,
    "can_view" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "role_state_visibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_state_transitions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "from_group" TEXT NOT NULL,
    "from_state_name" TEXT,
    "to_group" TEXT NOT NULL,
    "to_state_name" TEXT,
    "allowed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "role_state_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_roles_workspace_id_key_deleted_at_key" ON "workflow_roles"("workspace_id", "key", "deleted_at");

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workflow_role_id_fkey" FOREIGN KEY ("workflow_role_id") REFERENCES "workflow_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_workflow_role_id_fkey" FOREIGN KEY ("workflow_role_id") REFERENCES "workflow_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_roles" ADD CONSTRAINT "workflow_roles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_state_visibility" ADD CONSTRAINT "role_state_visibility_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "workflow_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_state_transitions" ADD CONSTRAINT "role_state_transitions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "workflow_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
