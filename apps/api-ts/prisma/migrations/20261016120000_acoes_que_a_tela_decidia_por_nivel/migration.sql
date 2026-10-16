-- W44: o web deixou de decidir por nível de papel. Dois cortes que a tela fazia
-- por número não tinham ação no catálogo e ganharam uma (src/utils/permissions.ts):
--   issue.export      exportar chamados        (a tela liberava o nível 15, Membro, e o admin)
--   extension.upload  enviar plugins e widgets (o servidor liberava o nível 12, TI)
--
-- As funções de sistema recebem a ação no boot pelo padrão do catálogo
-- (mergeNewActions: Membro e TI). As funções criadas na tela não são alcançadas
-- por ele; esta migração dá a ação a quem tem o mesmo nível de antes, para nada
-- mudar no deploy. O admin recebe toda ação sem precisar estar na lista.
--
-- Idempotente: rodar de novo não muda nada (o teste de contrato roda duas vezes).

UPDATE "workflow_roles" AS r
SET "permissions" = r."permissions" || '["issue.export"]'::jsonb
WHERE r."deleted_at" IS NULL
  AND r."is_system" = false
  AND r."level" = 15
  AND jsonb_typeof(r."permissions") = 'array'
  AND NOT r."permissions" ? 'issue.export';

UPDATE "workflow_roles" AS r
SET "permissions" = r."permissions" || '["extension.upload"]'::jsonb
WHERE r."deleted_at" IS NULL
  AND r."is_system" = false
  AND r."level" = 12
  AND jsonb_typeof(r."permissions") = 'array'
  AND NOT r."permissions" ? 'extension.upload';
