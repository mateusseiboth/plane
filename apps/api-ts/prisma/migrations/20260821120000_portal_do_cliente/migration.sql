-- Portal do cliente: conta de acesso própria (fora do modelo de usuário do
-- Plane), os sistemas que cada conta enxerga e o vínculo de quem abriu cada
-- solicitação.

-- CreateTable
CREATE TABLE "portal_accounts" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "workspace_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "portal_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_account_projects" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,

    CONSTRAINT "portal_account_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_requests" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,

    CONSTRAINT "portal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_accounts_workspace_id_email_key" ON "portal_accounts"("workspace_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "portal_account_projects_account_id_project_id_key" ON "portal_account_projects"("account_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "portal_requests_issue_id_key" ON "portal_requests"("issue_id");

-- AddForeignKey
ALTER TABLE "portal_accounts" ADD CONSTRAINT "portal_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_accounts" ADD CONSTRAINT "portal_accounts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_account_projects" ADD CONSTRAINT "portal_account_projects_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_account_projects" ADD CONSTRAINT "portal_account_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_requests" ADD CONSTRAINT "portal_requests_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_requests" ADD CONSTRAINT "portal_requests_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
