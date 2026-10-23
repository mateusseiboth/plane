-- O número do menu Solicitação/Triagem conta as solicitações resolvidas que
-- quem abriu ainda não viu. Abrir a solicitação resolvida grava o instante; ela
-- voltar a abrir zera (ver acompanharSolicitacao em @utils/atendimento-da-solicitacao).
ALTER TABLE "intake_issues" ADD COLUMN IF NOT EXISTS "visto_pelo_solicitante_em" TIMESTAMP(3);

-- O que já estava resolvido antes desta coluna conta como visto: sem isto, o
-- número de cada atendente nasceria com meses de solicitações antigas. Só as
-- conclusões daqui em diante contam. Idempotente: só toca o que está nulo.
UPDATE "intake_issues" AS ii
SET "visto_pelo_solicitante_em" = CURRENT_TIMESTAMP
FROM "issues" AS i
LEFT JOIN "states" AS s ON s."id" = i."state_id"
WHERE ii."issue_id" = i."id"
  AND ii."visto_pelo_solicitante_em" IS NULL
  AND (ii."status" = 3 OR (ii."status" = 1 AND s."group" = 'completed'));
