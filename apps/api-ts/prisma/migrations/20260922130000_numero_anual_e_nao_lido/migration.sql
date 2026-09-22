-- Número anual do chamado ("12-2026") e marca de não lido.
--
-- O número é gerado NO BANCO, por gatilho, e não no código: são cinco caminhos
-- de criação de chamado (direto, solicitação, portal, rascunho, importação do
-- SAC), e o `sequence_id` já mostrou o que acontece quando um deles esquece o
-- helper (todo chamado virava PROJ-0). Com o gatilho, nenhum caminho precisa
-- lembrar de nada.
--
-- O contador é por espaço de trabalho e ano, numa linha própria. O
-- `INSERT ... ON CONFLICT DO UPDATE` trava a linha do contador, então duas
-- aberturas simultâneas nunca recebem o mesmo número.

-- AlterTable
ALTER TABLE "issues" ADD COLUMN "ticket_sequence" INTEGER,
ADD COLUMN "ticket_year" INTEGER;

-- CreateTable
CREATE TABLE "issue_ticket_counters" (
    "workspace_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL,

    CONSTRAINT "issue_ticket_counters_pkey" PRIMARY KEY ("workspace_id","year")
);

-- CreateTable
CREATE TABLE "issue_unreads" (
    "issue_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_unreads_pkey" PRIMARY KEY ("issue_id","user_id")
);

-- CreateIndex
CREATE INDEX "issue_unreads_user_id_idx" ON "issue_unreads"("user_id");

-- CreateIndex
CREATE INDEX "issues_workspace_id_ticket_year_ticket_sequence_idx" ON "issues"("workspace_id", "ticket_year", "ticket_sequence");

-- AddForeignKey
ALTER TABLE "issue_unreads" ADD CONSTRAINT "issue_unreads_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- O ano do chamado é o de Brasília: `created_at` é gravado em UTC sem fuso, e
-- um chamado aberto às 22h de 31/12 ainda é do ano que termina.
CREATE OR REPLACE FUNCTION issue_ticket_year(p_created_at TIMESTAMP) RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT EXTRACT(YEAR FROM (COALESCE(p_created_at, now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::INTEGER
$$;

-- "500-2023" → {500, 2023}. Número legado fora do padrão N-AAAA devolve NULL.
CREATE OR REPLACE FUNCTION issue_parse_legacy_ticket(p_legacy TEXT) RETURNS INTEGER[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[m[1]::INTEGER, m[2]::INTEGER]
    FROM regexp_match(COALESCE(p_legacy, ''), '^\s*(\d{1,9})-(\d{4})\s*$') AS m
   WHERE m IS NOT NULL
$$;

-- Próximo número do ano. O MAX de `issues` só pesa na primeira abertura do ano
-- (ou se o contador sumir): nas demais, o contador já está à frente.
CREATE OR REPLACE FUNCTION issue_next_ticket_sequence(p_workspace UUID, p_year INTEGER) RETURNS INTEGER
LANGUAGE sql VOLATILE AS $$
  INSERT INTO issue_ticket_counters (workspace_id, year, last_number)
  VALUES (
    p_workspace,
    p_year,
    COALESCE((SELECT MAX(ticket_sequence) FROM issues WHERE workspace_id = p_workspace AND ticket_year = p_year), 0) + 1
  )
  ON CONFLICT (workspace_id, year)
  DO UPDATE SET last_number = GREATEST(issue_ticket_counters.last_number + 1, EXCLUDED.last_number)
  RETURNING last_number
$$;

-- Número legado ocupa a sua posição: a contagem nova continua DEPOIS dele.
CREATE OR REPLACE FUNCTION issue_reserve_ticket_sequence(p_workspace UUID, p_year INTEGER, p_sequence INTEGER) RETURNS VOID
LANGUAGE sql VOLATILE AS $$
  INSERT INTO issue_ticket_counters (workspace_id, year, last_number)
  VALUES (p_workspace, p_year, p_sequence)
  ON CONFLICT (workspace_id, year)
  DO UPDATE SET last_number = GREATEST(issue_ticket_counters.last_number, EXCLUDED.last_number)
$$;

CREATE OR REPLACE FUNCTION issues_assign_ticket_number() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  legado INTEGER[];
BEGIN
  IF NEW.ticket_sequence IS NOT NULL THEN
    RETURN NEW;
  END IF;

  legado := issue_parse_legacy_ticket(NEW.legacy_ticket_number);
  IF legado IS NOT NULL THEN
    NEW.ticket_sequence := legado[1];
    NEW.ticket_year := legado[2];
    PERFORM issue_reserve_ticket_sequence(NEW.workspace_id, NEW.ticket_year, NEW.ticket_sequence);
    RETURN NEW;
  END IF;

  NEW.ticket_year := issue_ticket_year(NEW.created_at);
  NEW.ticket_sequence := issue_next_ticket_sequence(NEW.workspace_id, NEW.ticket_year);
  RETURN NEW;
END
$$;

CREATE TRIGGER issues_assign_ticket_number
  BEFORE INSERT ON issues
  FOR EACH ROW EXECUTE FUNCTION issues_assign_ticket_number();

-- Backfill idempotente: só toca chamado ainda sem número. Primeiro os migrados
-- com número legado (eles ocupam as suas posições), depois o resto na ordem de
-- abertura. Pode ser rodado de novo a qualquer momento
-- (scripts/backfill-ticket-number.ts); devolve quantos chamados numerou.
CREATE OR REPLACE FUNCTION backfill_issue_ticket_numbers() RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  numerados INTEGER := 0;
  parcial INTEGER;
  r RECORD;
BEGIN
  UPDATE issues i
     SET ticket_sequence = (issue_parse_legacy_ticket(i.legacy_ticket_number))[1],
         ticket_year = (issue_parse_legacy_ticket(i.legacy_ticket_number))[2]
   WHERE i.ticket_sequence IS NULL
     AND issue_parse_legacy_ticket(i.legacy_ticket_number) IS NOT NULL;
  GET DIAGNOSTICS parcial = ROW_COUNT;
  numerados := numerados + parcial;

  INSERT INTO issue_ticket_counters (workspace_id, year, last_number)
  SELECT workspace_id, ticket_year, MAX(ticket_sequence)
    FROM issues
   WHERE ticket_sequence IS NOT NULL
   GROUP BY workspace_id, ticket_year
  ON CONFLICT (workspace_id, year)
  DO UPDATE SET last_number = GREATEST(issue_ticket_counters.last_number, EXCLUDED.last_number);

  FOR r IN
    SELECT id, workspace_id, created_at
      FROM issues
     WHERE ticket_sequence IS NULL
     ORDER BY created_at, sequence_id, id
  LOOP
    UPDATE issues
       SET ticket_year = issue_ticket_year(r.created_at),
           ticket_sequence = issue_next_ticket_sequence(r.workspace_id, issue_ticket_year(r.created_at))
     WHERE id = r.id;
    numerados := numerados + 1;
  END LOOP;

  RETURN numerados;
END
$$;

SELECT backfill_issue_ticket_numbers();
