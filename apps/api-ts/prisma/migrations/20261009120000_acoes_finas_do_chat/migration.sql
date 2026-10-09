-- O chat passou a registrar ações finas na matriz (src/utils/acoes-do-chat.ts):
-- atender, pausar, encerrar, abrir chamado, transferir, ver todas, ver a fila,
-- relatórios, disparo, configurar e frases do espaço. As ações grossas de antes
-- saem e o que estava gravado é convertido, sem mudar o que cada um fazia:
--   chat.atender     continua e ganha pausar, encerrar e abrir chamado (vinham juntos)
--   chat.gerenciar   vira transferir, relatórios e ver todas
--   chat.administrar vira todas as ações do chat
-- Vale para as funções de sistema e as criadas na tela, e para as exceções por
-- pessoa (a negação de uma legada nega o que só ela dava).
--
-- known_actions recebe as chaves novas: sem isso o boot (mergeNewActions) as
-- devolveria às funções de sistema de onde o admin tirou a ação antiga. Função
-- sem known_actions era tratada como BASELINE_KNOWN_ACTIONS (permissions.ts).
--
-- Idempotente: rodar de novo não muda nada (o teste de contrato roda duas vezes).

UPDATE "workflow_roles" AS r
SET "permissions" = (r."permissions" || (
      SELECT COALESCE(jsonb_agg(DISTINCT nova), '[]'::jsonb)
      FROM (VALUES
        ('chat.atender', '["chat.pausar","chat.encerrar","chat.abrir_chamado"]'::jsonb),
        ('chat.gerenciar', '["chat.transferir","chat.relatorios","chat.ver_todas"]'::jsonb),
        ('chat.administrar', '["chat.atender","chat.pausar","chat.encerrar","chat.abrir_chamado","chat.transferir","chat.ver_todas","chat.ver_fila","chat.relatorios","chat.disparo","chat.configurar","chat.frases_do_espaco"]'::jsonb)
      ) AS conversao(legada, novas)
      CROSS JOIN LATERAL jsonb_array_elements_text(conversao.novas) AS nova
      WHERE r."permissions" ? conversao.legada AND NOT r."permissions" ? nova
    )) - 'chat.gerenciar' - 'chat.administrar',
    "known_actions" = (
      CASE WHEN jsonb_typeof(r."known_actions") = 'array' THEN r."known_actions"
      ELSE '["issue.view","comment.read","attachment.view","issue.create","issue.edit.own","issue.edit.all","issue.delete.own","issue.delete.all","issue.assign.self","issue.assign.others","state.unrestricted","comment.create","comment.edit.own","comment.delete.own","comment.delete.all","attachment.upload","attachment.delete.own","attachment.delete.all","intake.create","intake.review","cycle.manage","module.manage","label.manage","view.create","page.create","member.manage"]'::jsonb
      END
    ) || (
      SELECT COALESCE(jsonb_agg(nova), '[]'::jsonb)
      FROM jsonb_array_elements_text('["chat.atender","chat.pausar","chat.encerrar","chat.abrir_chamado","chat.transferir","chat.ver_todas","chat.ver_fila","chat.relatorios","chat.disparo","chat.configurar","chat.frases_do_espaco"]'::jsonb) AS nova
      WHERE jsonb_typeof(r."known_actions") IS DISTINCT FROM 'array' OR NOT r."known_actions" ? nova
    )
WHERE r."deleted_at" IS NULL
  AND jsonb_typeof(r."permissions") = 'array';

UPDATE "workspace_members" AS m
SET "granted_actions" = (m."granted_actions" || (
      SELECT COALESCE(jsonb_agg(DISTINCT nova), '[]'::jsonb)
      FROM (VALUES
        ('chat.atender', '["chat.pausar","chat.encerrar","chat.abrir_chamado"]'::jsonb),
        ('chat.gerenciar', '["chat.transferir","chat.relatorios","chat.ver_todas"]'::jsonb),
        ('chat.administrar', '["chat.atender","chat.pausar","chat.encerrar","chat.abrir_chamado","chat.transferir","chat.ver_todas","chat.ver_fila","chat.relatorios","chat.disparo","chat.configurar","chat.frases_do_espaco"]'::jsonb)
      ) AS conversao(legada, novas)
      CROSS JOIN LATERAL jsonb_array_elements_text(conversao.novas) AS nova
      WHERE m."granted_actions" ? conversao.legada AND NOT m."granted_actions" ? nova
    )) - 'chat.gerenciar' - 'chat.administrar',
    "revoked_actions" = (m."revoked_actions" || (
      SELECT COALESCE(jsonb_agg(DISTINCT nova), '[]'::jsonb)
      FROM (VALUES
        ('chat.atender', '["chat.pausar","chat.encerrar","chat.abrir_chamado"]'::jsonb),
        ('chat.gerenciar', '["chat.transferir","chat.relatorios","chat.ver_todas"]'::jsonb),
        ('chat.administrar', '["chat.ver_fila","chat.configurar","chat.frases_do_espaco"]'::jsonb)
      ) AS conversao(legada, novas)
      CROSS JOIN LATERAL jsonb_array_elements_text(conversao.novas) AS nova
      WHERE m."revoked_actions" ? conversao.legada AND NOT m."revoked_actions" ? nova
    )) - 'chat.gerenciar' - 'chat.administrar'
WHERE jsonb_typeof(m."granted_actions") = 'array'
  AND jsonb_typeof(m."revoked_actions") = 'array'
  AND (m."granted_actions" ?| ARRAY['chat.atender', 'chat.gerenciar', 'chat.administrar']
       OR m."revoked_actions" ?| ARRAY['chat.atender', 'chat.gerenciar', 'chat.administrar']);
