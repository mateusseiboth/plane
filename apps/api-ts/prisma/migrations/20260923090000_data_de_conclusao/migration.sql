-- Data de conclusão do chamado (`issues.completed_at`).
--
-- Até aqui só o importador do SAC gravava a data: concluir pela tela deixava
-- `completed_at` nulo, e as médias de resolução dos relatórios só enxergavam
-- chamados migrados. A regra fica NO BANCO, por gatilho, como o número anual:
-- são vários caminhos que mudam a etapa (PATCH do chamado, edição em massa,
-- triagem, solicitação, criação, rascunho, importação) e nenhum precisa lembrar.
--
-- Regra do Plane original (`Issue._sync_completed_at`): entrou numa etapa do
-- grupo `completed`, grava agora; saiu dele, limpa. Cancelado NÃO é conclusão.
-- A data informada na própria gravação é mantida (importador do SAC).
-- `completed_at` é TIMESTAMP sem fuso, gravado em UTC.

CREATE OR REPLACE FUNCTION issue_state_is_completed(p_state UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT "group" = 'completed' FROM states WHERE id = p_state), false)
$$;

CREATE OR REPLACE FUNCTION issues_sync_completed_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.state_id IS NOT DISTINCT FROM OLD.state_id THEN
    RETURN NEW;
  END IF;

  IF NOT issue_state_is_completed(NEW.state_id) THEN
    NEW.completed_at := NULL;
    RETURN NEW;
  END IF;

  -- Data enviada junto na gravação vale (importação); senão, agora.
  IF NEW.completed_at IS NULL OR (TG_OP = 'UPDATE' AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at) THEN
    NEW.completed_at := now() AT TIME ZONE 'UTC';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER issues_sync_completed_at
  BEFORE INSERT OR UPDATE OF state_id ON issues
  FOR EACH ROW EXECUTE FUNCTION issues_sync_completed_at();

-- Backfill idempotente dos chamados gravados antes do gatilho:
--  - concluído sem data: a última entrada na etapa atual pelo histórico de etapa
--    (`issue_activities` guarda o NOME da etapa); sem histórico (a edição em
--    massa não registrava), o `updated_at`;
--  - fora do grupo concluído com data: limpa (reaberto antes do gatilho).
-- Devolve quantos chamados acertou; a segunda execução devolve 0.
-- Uso posterior: scripts/backfill-completed-at.ts.
CREATE OR REPLACE FUNCTION backfill_issue_completed_at() RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  preenchidos INTEGER;
  limpos INTEGER;
BEGIN
  UPDATE issues i
     SET completed_at = COALESCE(
       (SELECT MAX(a.created_at)
          FROM issue_activities a
          JOIN states s ON s.id = i.state_id
         WHERE a.issue_id = i.id
           AND a.field = 'state'
           AND a.deleted_at IS NULL
           AND a.new_value = s.name),
       i.updated_at)
   WHERE i.completed_at IS NULL
     AND issue_state_is_completed(i.state_id);
  GET DIAGNOSTICS preenchidos = ROW_COUNT;

  UPDATE issues i
     SET completed_at = NULL
   WHERE i.completed_at IS NOT NULL
     AND NOT issue_state_is_completed(i.state_id);
  GET DIAGNOSTICS limpos = ROW_COUNT;

  RETURN preenchidos + limpos;
END
$$;

SELECT backfill_issue_completed_at();
