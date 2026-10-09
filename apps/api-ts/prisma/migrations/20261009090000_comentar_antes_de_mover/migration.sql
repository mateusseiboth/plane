-- "Precisa comentar antes de mudar a etapa" virou ação da matriz
-- (issue.require_comment_to_move). Toda função já gravada, de sistema ou criada
-- na tela, recebe a ação marcada: a regra valia para todo mundo e continua
-- valendo até alguém desmarcar. As funções de sistema também a receberiam no
-- boot (mergeNewActions); as criadas na tela, não.
UPDATE "workflow_roles"
SET "permissions" = "permissions" || '["issue.require_comment_to_move"]'::jsonb
WHERE "deleted_at" IS NULL
  AND jsonb_typeof("permissions") = 'array'
  AND NOT ("permissions" ? 'issue.require_comment_to_move');
