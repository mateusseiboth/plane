-- O início do chamado conta da abertura da solicitação (pedido de 23/10/2026).
-- Daqui em diante a solicitação já nasce com `start_date` (buildInicioDaSolicitacao
-- em @utils/intake); aqui os chamados existentes que vieram de solicitação e
-- estão sem início recebem o dia em que ela foi aberta.
--
-- `start_date` é data pura gravada como o começo do dia no fuso do escritório
-- (@utils/prazo, America/Campo_Grande): uma solicitação aberta às 22h não pode
-- aparecer como iniciada no dia seguinte. Idempotente: só toca o que está nulo,
-- e a solicitação mais antiga do chamado é a que vale.
UPDATE "issues" AS i
SET "start_date" = (
  date_trunc('day', (origem."created_at" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Campo_Grande')
    AT TIME ZONE 'America/Campo_Grande'
) AT TIME ZONE 'UTC'
FROM (
  SELECT DISTINCT ON ("issue_id") "issue_id", "created_at"
  FROM "intake_issues"
  WHERE "issue_id" IS NOT NULL
  ORDER BY "issue_id", "created_at"
) AS origem
WHERE origem."issue_id" = i."id"
  AND i."start_date" IS NULL;
