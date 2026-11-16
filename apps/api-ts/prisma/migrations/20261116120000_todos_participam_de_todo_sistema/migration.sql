-- Todo membro ativo do espaço participa de todos os sistemas, como no legado
-- (ver modules/project/participacao-em-todo-sistema.service.ts). A importação
-- gravou vínculo só para quem tinha mensagem ou responsabilidade no sistema e
-- deixou 144 pares pessoa×sistema de fora em homologação.
--
-- Mesma regra do serviço: nível e função do espaço, só membro e conta ativos,
-- só o que falta. Vínculo desativado fica como está. Idempotente.
INSERT INTO "project_members" ("id", "created_at", "updated_at", "project_id", "workspace_id", "member_id", "role", "is_active", "workflow_role_id")
SELECT gen_random_uuid(), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, p."id", p."workspace_id", wm."member_id", wm."role", true, wm."workflow_role_id"
FROM "projects" AS p
JOIN "workspace_members" AS wm
  ON wm."workspace_id" = p."workspace_id" AND wm."is_active" AND wm."deleted_at" IS NULL
JOIN "users" AS u
  ON u."id" = wm."member_id" AND u."is_active" AND u."deleted_at" IS NULL AND NOT u."is_bot_user"
WHERE p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "project_members" AS pm
    WHERE pm."project_id" = p."id" AND pm."member_id" = wm."member_id" AND pm."deleted_at" IS NULL
  );
