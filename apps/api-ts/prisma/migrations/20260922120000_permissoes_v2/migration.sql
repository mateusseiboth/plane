-- Permissões v2: ações conhecidas por função e exceções por pessoa.
ALTER TABLE "workflow_roles" ADD COLUMN "known_actions" JSONB;
ALTER TABLE "workspace_members" ADD COLUMN "granted_actions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "workspace_members" ADD COLUMN "revoked_actions" JSONB NOT NULL DEFAULT '[]';
