# Número anual do chamado (N-AAAA) e marca de não lido

## 1. Número anual "12-2026"

Cada chamado tem um número sequencial por ano, como no SAC legado
(`criaChamado.php`: `N-AAAA`, reinicia em 1 na virada do ano). Ele convive com o
`PROJ-123`, que continua igual.

### Onde é gerado: no banco, por gatilho

Migração `apps/api-ts/prisma/migrations/20260922120000_numero_anual_e_nao_lido`.

- Colunas `issues.ticket_sequence` e `issues.ticket_year` (Prisma: `ticketSequence`,
  `ticketYear`) e índice `(workspace_id, ticket_year, ticket_sequence)`.
- Tabela `issue_ticket_counters (workspace_id, year, last_number)`.
- Gatilho `BEFORE INSERT` `issues_assign_ticket_number` preenche o número em TODO
  insert de `issues`, qualquer que seja o caminho: criação direta, solicitação
  (inbox-issues e intakes premium), portal, rascunho, importação do SAC e testes.
  **Não existe helper para chamar**, ao contrário do `nextSequenceId`: foi de propósito,
  porque o `sequence_id` já mostrou o que acontece quando um caminho esquece
  (memória sequence-id-default-zero).
- Concorrência: `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` na linha do contador.
  A linha fica travada até o fim da transação, então duas aberturas simultâneas nunca
  recebem o mesmo número (teste com 25 criações em paralelo).
- O `MAX(ticket_sequence)` de `issues` entra no cálculo como piso: se o contador sumir
  (restauração parcial), a contagem continua de onde os chamados estão.

### Regras (decisões)

- **Contador por espaço de trabalho**, não global como no legado. O legado só tinha
  um espaço; aqui um segundo espaço começaria no número do primeiro.
- **Ano da abertura no horário de Brasília** (`America/Sao_Paulo`). `created_at` é
  gravado em UTC: um chamado das 22h de 31/12 ainda é do ano que termina.
- **Chamado migrado** com `legacy_ticket_number` no formato `N-AAAA` fica com esse
  número, e o contador daquele ano sobe até ele (a contagem nova continua depois).
  Número legado fora do padrão (ex.: `458325`) não é aproveitado: o chamado ganha um
  número novo do ano de abertura.
- **Sem índice único** em `(workspace_id, ticket_year, ticket_sequence)`. O
  `criaChamado.php` fazia SELECT e depois INSERT, sem trava, então o legado pode ter
  números repetidos; um índice único derrubaria a migração. Os números novos são
  únicos pelo contador.
- Rascunho (`is_draft`) e chamado apagado também consomem número. Número não é
  reaproveitado.

### Backfill (idempotente)

- Função SQL `backfill_issue_ticket_numbers()`: primeiro os migrados com legado
  `N-AAAA` (ocupam as suas posições), depois o resto em ordem de `created_at`.
  Só toca chamado com `ticket_sequence IS NULL`; a segunda execução devolve 0.
- A migração roda o backfill uma vez. Para rodar de novo:
  `DATABASE_URL=... bun run scripts/backfill-ticket-number.ts`.
- **Importador do SAC (`scripts/migrate-sac.ts`) não precisou mudar**: ele já grava
  `legacyTicketNumber` e o gatilho faz o resto. Por isso não há
  `.claude/patches/w03-migrate-sac.patch`.

### Leitura e busca

- `@utils/numero-do-chamado`: `formatNumeroDoChamado` (Prisma -> "12-2026"),
  `parseNumeroDoChamado` ("12-2026", "12/2026", "12 2026", "12.2026", "#12-2026",
  "122026"), `backfillNumerosDosChamados`.
- `serializeIssue` devolve `ticket_number`. As listagens montadas à mão em
  `modules/project` (inbox-issues) também.
- Busca: `buscarChamados` (`@utils/search`, fonte única de `/search/` do ⌘K e de
  `/global-search/` do Ctrl+G) ganhou um braço pelo índice
  `(workspace_id, ticket_year, ticket_sequence)` e peso 200 no ranqueamento. As duas
  rotas devolvem `ticket_number`. No ⌘K o `value` do cmdk inclui o número, para o
  filtro do navegador não esconder o resultado (ver memória busca-e-live).

### Tela

- `@plane/utils` `getNumerosDoChamado`: número anual e, só quando for OUTRO número,
  o legado (chamado migrado teria o mesmo número duas vezes).
- Componente `apps/web/core/components/issues/numeros-do-chamado.tsx` substitui os
  selos de legado que estavam copiados em lista, quadro, planilha, ⌘K e Ctrl+G, e
  aparece ao lado do `PROJ-123` no detalhe e na espiada (`IssueTypeSwitcher`).
- Impressão: coluna "Número" na tabela de chamados e "Número"/"Número antigo" no
  cabeçalho do documento do chamado.

## 2. Marca de não lido

O chamado fica em negrito para o RESPONSÁVEL enquanto ele não abrir o detalhe depois
da última alteração relevante feita por OUTRA pessoa.

- Tabela `issue_unreads (issue_id, user_id)`: a linha existe enquanto está não lido.
  Cascata ao apagar o chamado.
- `@utils/chamado-nao-lido`:
  - `markChamadoNaoLido({issueId, actorId})`: cria a marca para todo responsável
    atual menos o ator, e apaga a de quem deixou de ser responsável.
  - `markChamadoLido`, `whereNaoLidoPor`, `withNaoLido` (uma consulta por página).
- Alteração relevante = comentário novo (`POST .../comments/`), mudança de etapa ou
  de responsáveis (`PATCH .../issues/:id`), e a atribuição na criação
  (`POST .../issues/` e `POST .../inbox-issues/`). Título, prazo, prioridade e o resto
  não marcam.
- Abrir o detalhe: `POST /workspaces/:slug/projects/:project_id/issues/:issue_id/read/`
  (204). É chamada explícita da tela (`markAsRead` no store de detalhe, dentro de
  `fetchIssue` e `fetchIssueWithIdentifier`: página, espiada, `/browse/` e modal de
  edição) e NÃO efeito do GET, porque o GET também recarrega chamados que ninguém
  abriu.
- `is_unread` sai no `serializeIssue`, preenchido só nas rotas que sabem quem pergunta:
  listagem do projeto (plana e agrupada), detalhe e listagens de espaço de trabalho
  (`/workspaces/:slug/issues/` e `/issues-detail/`). Nas demais sai `false`.
- Filtro: `?unread=true` nessas mesmas listagens. Na tela é a opção
  "Somente não lidos" no menu Exibição (extra options), nas visões lista, quadro e
  planilha do projeto e em Meus chamados.
- Não reaproveita `notifications`: o sino só é gravado para mudança de etapa, e
  marcar notificação como lida ao abrir o chamado mudaria o comportamento do sino.
- Chamados que já existiam antes da migração começam lidos (nenhuma marca): acender
  50 mil chamados de uma vez tornaria a marca inútil.
- Limitação: comentário novo não publica evento de chamado no SSE, então o negrito
  aparece na próxima recarga da lista, não na hora.

## Fora do escopo (decisão do usuário)

Prioridade, labels, módulos e versão não mudaram: "cliente parado" já é a prioridade
urgente, "menu do sistema" são os módulos, "tipo de correção" são as labels e a versão
vai no texto do chamado.
