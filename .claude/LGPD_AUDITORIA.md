# Trilha de auditoria (LGPD)

A LGPD trata **acesso** a dado pessoal como tratamento. Por isso a trilha registra
tanto escrita quanto leitura: quem acessou, o quê, quando e de onde.

## Onde fica

- Tabela `audit_logs` (model `AuditLog` no `apps/api-ts/prisma/schema.prisma`).
- Serviço: `apps/api-ts/src/utils/audit.ts` — `recordAudit`, `recordView`,
  `auditDiff`, `clientIp`, `serializeAuditLog`, além do vocabulário fechado
  `AUDIT_ACTIONS` / `AUDIT_ENTITIES`.
- Rotas: `apps/api-ts/src/modules/audit/index.ts`.
- Chat: `apps/chat-backend/src/audit.ts` grava na MESMA tabela por SQL direto
  (o schema Prisma do chat não conhece o model `AuditLog`, e duplicá-lo faria as
  duas definições divergirem).

## Princípios de implementação

1. **Nunca quebrar a operação do usuário.** `recordAudit` engole os próprios
   erros e não é `await`-ado no caminho da requisição.
2. **Nunca gravar o dado sensível em si.** Guardamos identificadores, o diff de
   campos (`{campo: {de, para}}`) e metadados curtos — valores são truncados em
   500 caracteres. A fonte continua sendo o registro original.
3. **Ator sempre do token.** No endpoint que o navegador usa para registrar
   impressão/exportação, `actor_id`/`actor_email` vêm do usuário autenticado;
   o que o cliente mandar no corpo é ignorado.
4. **IP real atrás do proxy**: primeiro endereço de `x-forwarded-for`, com
   `x-real-ip` como alternativa.

## O que já é registrado

| Ação | Onde |
|---|---|
| Abriu chamado (`create`) | `POST .../issues/` |
| Viu chamado (`view`) | `GET .../issues/:id/` |
| Alterou / mudou estado (`update`, `state_change`) | `PATCH .../issues/:id/` |
| **Encerrou** chamado (`close`) | `PATCH` com estado do grupo concluído/cancelado |
| Excluiu chamado (`delete`) | `DELETE .../issues/:id/` |
| Interagiu (`comment`, `update`, `delete`) | comentários do chamado |
| Abriu/triou/excluiu solicitação | `.../inbox-issues/` (create, view, update, delete) |
| Baixou anexo (`download`) | as três rotas de download de `modules/asset` |
| Alterou permissão (`permission_change`) | `POST .../projects/:id/members/` |
| Entrou / falha de login / saiu | `/auth/sign-in/`, `/auth/sign-out/` |
| Imprimiu / exportou tela (`print`, `export`) | `POST .../audit-logs/` chamado pelo front |
| | O registro sai do próprio `<PrintButton>` (`auditEntity` + `auditEntityId`), para que nenhuma tela esqueça |
| Exportou a própria trilha (`export`) | `GET .../audit-logs/export/` |
| Atendimento: assumiu, viu transcrição, encerrou | `apps/chat-backend` |

## Consulta

| Rota | Quem pode |
|---|---|
| `GET /workspaces/:slug/audit-logs/` | administrador do workspace |
| `GET /workspaces/:slug/audit-logs/me/` | qualquer membro — **direito de acesso do titular** (art. 18) |
| `GET /workspaces/:slug/audit-logs/export/` | administrador; devolve CSV |
| `POST /workspaces/:slug/audit-logs/` | qualquer membro; só `print`/`export`/`download`/`view` |

Filtros aceitos: `entity`, `entity_id`, `actor_id`, `action` (aceita lista separada
por vírgula), `date_from`, `date_to`, `cursor`.

**Tela:** Configurações do espaço de trabalho → **Auditoria (LGPD)**
(`/settings/auditoria`), com filtros, paginação e exportação em CSV.
Front: `apps/web/core/services/audit.service.ts` + `core/hooks/use-audit-logs.ts`.

## Testes

- `apps/api-ts/tests/unit/audit.test.ts` (13) — funções puras: IP atrás de proxy,
  diff, truncamento, serialização, vocabulário.
- `apps/api-ts/tests/contract/audit.test.ts` (21) — o ciclo completo do chamado
  vira registro; regras de acesso; filtros; CSV; isolamento entre workspaces.
- `apps/chat-backend/tests/audit.e2e.test.ts` (4) — assumir/ver transcrição/encerrar
  atendimento, e ausência de registro órfão quando o workspace não existe.

## Pendências conhecidas

- **Retenção**: não há expurgo automático. Definir prazo de guarda e uma rotina
  de anonimização/remoção (a LGPD pede que o dado não seja mantido além do
  necessário).
- **Volume**: `view` em chamado gera uma linha por abertura. Há índice
  `(workspace_id, created_at)` e `(entity, entity_id)`; se o volume crescer,
  considerar particionamento por data.
- O endpoint antigo de leitura que existia em `modules/premium` foi removido em
  favor do módulo dedicado (ele devolvia 200 com `{detail}` em vez de 403).
