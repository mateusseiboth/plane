# Visitas técnicas (W08)

Data: 2026-09-22 · Worker W08. Base `preview` em `73034d4ca` (depois de W01 e W02).
Legado de referência: `intranet/sac_visitas*.php`, `sac_chamadoNovoVisita.php`,
`criaRelatorioVisita.php`, `popImprimeVisita.php`, `popImprimeTreinamento.php`,
`includes/funcoesAjax.php` (cases 25 a 29) e `includes/funcoesAjaxVisitas.php`.

## 1. Onde está

### Backend (`apps/api-ts/src/modules/technical-visit/`)

| Arquivo | Papel |
| --- | --- |
| `index.ts` | Rotas finas: exigem a ação da matriz e chamam o service. A rota `/report/` ficou como estava (W14 é o dono dos relatórios agregados). |
| `visit.service.ts` | Regra: criar (inclusive a partir de chamado), editar, trava de encerramento, vínculos, anexos. |
| `visit.dao.ts` | Só Prisma: include da visita, referências, contador N-AAAA, anexos. |
| `visit-serializer.ts` | Contrato JSON (snake_case). |
| `visit-access.ts` | Puro: quem pode mexer em quê (técnico dono × `visit.manage.all`). |
| `visit-closing.ts` | Puro: trava de encerramento e "chamado aberto". |
| `visit-filters.ts` | Puro: filtros da lista e "vencida". |
| `visit-number.ts` | Puro: formato `N-AAAA`, ano no fuso do escritório, maior N já usado. |
| `visit-error.ts` | Erros tipados com status (`VisitError`, `VisitReferenceError`, `VisitClosingError`). |
| `visit-status.ts` | `VISIT_STATUS` (W01). |

`src/index.ts` (`errorHandler`) passou a devolver `errors: [{path, message}]` quando o erro lançado
traz esse campo. Vale para qualquer módulo que lance erro com `status` + `errors`.

### Frontend (`apps/web`)

| Arquivo | Papel |
| --- | --- |
| `core/services/technical-visit.service.ts` | APIService da visita (inclui multipart e download em blob). |
| `core/hooks/use-technical-visits.ts` | SWR: `useTechnicalVisits`, `useTechnicalVisit`, `useVisitPermissions`. |
| `core/components/technical-visits/types.ts` | Tipo único `TTechnicalVisit` (tela, serviço, impressão). |
| `core/components/technical-visits/visit-rules.ts` | Puro e testado: erro por campo, folhas da lista de presença, parâmetros da lista, modo de edição. |
| `core/components/technical-visits/visit-detail.tsx` | Tela de detalhe. |
| `create-visit-modal.tsx`, `create-visit-from-issue-button.tsx` | Nova visita (lista e detalhe do chamado). |
| `visit-linked-issues.tsx`, `visit-attachments.tsx`, `visit-modules-picker.tsx`, `visit-report-editors.tsx` | Blocos do detalhe. |
| `core/components/print/documents/technical-visits-print-document.tsx` | Lista, relatório (com assinatura) e lista de presença. |
| `app/(all)/[workspaceSlug]/(projects)/visits/` | Páginas lista e detalhe. |

## 2. Regras

### Permissões (matriz de ações, sem número de papel)

| Ação | Padrão | O que libera |
| --- | --- | --- |
| `visit.manage` (já existia) | Atendimento, Qualidade, TI, Membro, Gestor, admin | Criar visita (escolhendo técnico), e, **se for o técnico da visita**, preencher o relatório, vincular chamados, anexar. |
| `visit.manage.all` (nova) | Gestor e admin | Trocar técnico e data, cancelar, excluir, editar o relatório de qualquer visita e mexer em visita encerrada. |

- "Técnico dono" é `technician_id`. O 2º técnico não edita (no SAC só `visita_usuarios_id` editava).
- Reenviar o técnico e a data que já estão gravados não conta como troca: a tela manda o
  formulário inteiro.
- Visita Concluída ou Cancelada: 409 para quem não tem `visit.manage.all`.
- Frontend decide o que habilitar por `getVisitEditMode` (`tudo`, `relatorio`, `leitura`); a API
  confere de novo em `visit-access.ts`.

### Número `N-AAAA`

- Gerado no servidor na criação; o `visit_number` que o cliente mandar é ignorado.
- Por espaço de trabalho e por ano (ano no fuso `APP_TIMEZONE`, padrão `America/Campo_Grande`).
- Tabela `technical_visit_counters (workspace_id, year, last_number)`. O incremento é um
  `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` (SQL à mão de propósito: o `upsert` do Prisma
  nem sempre vira ON CONFLICT). O contador nasce do maior N já gravado no ano, então as visitas
  importadas do SAC (`41-2026`) são respeitadas: a próxima é `42-2026`.
- Gerador PRÓPRIO da visita. A numeração de chamados (W03) não é tocada.

### Criação

- `technician_id` padrão = quem cria. Técnico e 2º técnico precisam ser membros ativos do espaço;
  o 2º não pode ser o mesmo. Erro volta com `errors[].path`.
- Cidade vazia = `entities.city` da entidade. Na tela, escolher a entidade preenche a cidade e
  ela continua editável. No PATCH, trocar a entidade sem mandar `city` também puxa a cidade.
- **A partir de um chamado** (`issue_ids`): nasce vinculada; sem `entity_id`, usa a entidade do
  chamado; sem `project_ids`, usa o sistema dele. Chamado de outro espaço: 400 em `issue_ids`.
  Na tela: botão "Criar visita técnica" (ícone de marcador) no cabeçalho do detalhe do chamado.

### Chamados vinculados

- `issues: [{id, name, code, sequence_id, project_id, project_identifier, state, is_open}]` e
  `issue_ids` em toda resposta da visita (lista inclusive).
- `POST /:visit_id/issues/` agora confere o espaço (antes vinculava qualquer id) e devolve a visita
  inteira. Vincular de novo: 409. `DELETE` sem vínculo: 404.
- A busca da tela usa `/workspaces/:slug/search/` (a mesma da paleta).

### Trava ao encerrar

Vale ao entrar em **Concluída** e em **Aguardando Assinatura** (o relatório que vai para
assinar é o que encerra). Recusa 422 com cada campo:

| `path` | Regra |
| --- | --- |
| `started_at` / `finished_at` | Data e hora de início e fim; fim depois do início. |
| `summary`, `conclusion` | Texto do editor não vazio (`<p></p>` conta como vazio). |
| `motivos` | Ao menos um dos 6 motivos. |
| `issues` | Nenhum chamado vinculado em aberto (etapa fora de `completed`/`cancelled`; sem etapa = aberto). A mensagem cita os códigos. |

- A recusa não grava nada do PATCH.
- **Mudou**: concluir não preenche mais `finished_at` com "agora" (faria a trava passar sempre).
  `started_at` continua sendo preenchido ao entrar em Em Andamento, se estiver vazio.

### Funcionalidades

"Menu do sistema" do SAC = módulos do Plane. Coluna nova `technical_visits.module_ids` (JSONB).
Cada módulo precisa ser do espaço e de um dos `project_ids` da visita (400 em `module_ids`). A
resposta do detalhe traz `projects` e `modules` com nome.

### Lista

- Filtros: `technician_id`, `entity_id`, `date_from`/`date_to` (data pura = começo/fim do dia no
  fuso do escritório), `status`, `overdue=true`. Paginação pelo cursor `limite:página:0`
  (`per_page` também vale). Situação que não é número é ignorada (antes virava 500).
- `is_overdue`: data programada num dia anterior a hoje e visita não encerrada (regra do SAC,
  `visita_dataprogramada < CURDATE()`).

### Anexo do relatório

- `POST /:visit_id/attachments/` (multipart, campo `file`, até 25 MB), `GET .../:id/` (download
  com `Content-Disposition`, registra `download` na auditoria LGPD), `DELETE .../:id/`.
- Gravado em `file_assets` no MESMO formato do importador (`migrate-sac-files.ts`): `entityId` =
  visita, `attributes.category = "visita"`, chave do storage em `asset`. Os arquivos migrados do
  SAC aparecem na tela sem mais nada.
- **Aguardando Assinatura**: anexar conclui a visita. Se a trava recusar (ex.: chamado aberto),
  o arquivo NÃO é gravado.

### Impressão

- "Relatório": relatório de viagem com técnicos, sistemas, funcionalidades, contatos, motivos,
  resumo, conclusão, chamados vinculados e linhas de assinatura (técnico e responsável do setor).
- "Lista de presença": uma folha por sistema da visita (ou uma folha só sem sistema), com as
  funcionalidades daquele sistema, declaração de treinamento e linhas para nome, cargo e
  assinatura, já com os responsáveis da visita.
- Os dois documentos ficam montados; o não escolhido leva `skip` (`data-print-skip` em
  `styles/print.css`). Trocar qual está montado no clique disputaria com o diálogo de impressão.

## 3. Testes

- `apps/api-ts/tests/unit/visita-regras.test.ts`: número, trava, acesso, vencida, filtros.
- `apps/api-ts/tests/unit/catalogo-de-acoes.test.ts`: quem recebe `visit.manage.all`.
- `apps/api-ts/tests/contract/visitas-tecnicas.test.ts`: 29 casos pela API de verdade (técnicos,
  N-AAAA inclusive concorrência, cidade, a partir do chamado, vínculos, trava, permissões com
  concessão por pessoa, módulos, anexos, lista).
- `apps/web/core/components/technical-visits/visit-rules.test.ts` (`bun test core/components/technical-visits`).

## 4. Fora do escopo / pendências

- Pós-atendimento da visita: W12.
- Relatórios agregados de visitas (`/report/`): W14. A rota não foi mexida.
- `migrate-sac.ts`: nenhuma mudança necessária. O contador nasce do maior número importado e
  `module_ids` tem padrão `[]`. O "assunto" do SAC (`visita_assuntos_id`) não é mapeado para
  módulo: não há correspondência assunto × módulo no Plane.
- A lista não recorta por técnico (no SAC o técnico só via as próprias). Mantido: a regra de
  visibilidade do projeto é "quem participa vê tudo". Para "minhas visitas" use o filtro Técnico.
- O 2º técnico não edita o relatório. Se a equipe quiser, é trocar `isVisitOwner` em `visit-access.ts`.
- Reabrir visita encerrada: só quem gerencia, pelo PATCH de `status`; a tela não tem botão.
- Swagger: as rotas aparecem no `/api/v1/schema` gerado pelo Elysia, sem descrição própria (como
  as demais do módulo).
