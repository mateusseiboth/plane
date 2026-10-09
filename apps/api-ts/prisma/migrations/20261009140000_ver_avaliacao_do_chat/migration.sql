-- A nota e o comentário da pesquisa de satisfação ganharam ação própria,
-- `chat.ver_avaliacao` (src/utils/acoes-do-chat.ts). Até aqui saíam para quem
-- tinha `chat.configurar`; esta migração dá a ação nova a quem já via a nota,
-- para nada mudar no deploy:
--   função com chat.configurar           ganha chat.ver_avaliacao
--   concessão por pessoa de configurar   ganha a concessão de chat.ver_avaliacao
--   negação por pessoa de configurar     ganha a negação de chat.ver_avaliacao
-- Depois o admin separa as duas na tela de Funções.
--
-- known_actions não muda: o padrão da ação nova é só o admin, e o boot
-- (mergeNewActions) a soma à função de sistema do admin.
--
-- Idempotente: rodar de novo não muda nada (o teste de contrato roda duas vezes).

UPDATE "workflow_roles" AS r
SET "permissions" = r."permissions" || '["chat.ver_avaliacao"]'::jsonb
WHERE r."deleted_at" IS NULL
  AND jsonb_typeof(r."permissions") = 'array'
  AND r."permissions" ? 'chat.configurar'
  AND NOT r."permissions" ? 'chat.ver_avaliacao';

UPDATE "workspace_members" AS m
SET "granted_actions" = m."granted_actions" || '["chat.ver_avaliacao"]'::jsonb
WHERE jsonb_typeof(m."granted_actions") = 'array'
  AND m."granted_actions" ? 'chat.configurar'
  AND NOT m."granted_actions" ? 'chat.ver_avaliacao';

UPDATE "workspace_members" AS m
SET "revoked_actions" = m."revoked_actions" || '["chat.ver_avaliacao"]'::jsonb
WHERE jsonb_typeof(m."revoked_actions") = 'array'
  AND m."revoked_actions" ? 'chat.configurar'
  AND NOT m."revoked_actions" ? 'chat.ver_avaliacao';
