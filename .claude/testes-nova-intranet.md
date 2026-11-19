# Correções dos "Testes nova intranet" (16/11/2026)

Documento de testes do atendimento/qualidade com 10 itens e uma dúvida. O que
mudou e onde.

| Item | O que era | O que ficou |
|---|---|---|
| 1 | Faixa de URGENTES mostrava chamados de outros setores sem dizer onde estavam | Continua com todos os urgentes; cada um mostra `etapa · setor` (`modules/urgentes`) |
| 2 | Sugestão da wiki abria a página na wiki | Abre o documento no informe: `INFORME_DA_QUALITY_URL/document/<id>` |
| 3 | Imagem colada não entrava; Qualidade não era alertada do cliente parado; triagem sem entidade | Upload exigia vínculo com o sistema (resolvido pelo item 4); notificação "Cliente parado: nova solicitação" vira alerta na tela (`use-aviso-de-chamado`); triagem mostra e corrige a entidade |
| 4 | "Parece que você não tem acesso a este sistema" | **Erro de importação**: todo membro ativo participa de todo sistema (`participacao-em-todo-sistema.service.ts` + migration de backfill) |
| 5 e 7 | Recusa sem motivo e sem aviso | Motivo obrigatório (mín. 10), vira comentário e vai para o sino de quem abriu; decidir a triagem exige `intake.review` no servidor |
| 6 | "Adicionar chamado" na triagem do sistema abria o formulário antigo | "Nova solicitação" com o modal compartilhado; formulário antigo removido |
| 8 | Abertura sem número e sem entidade/descrição | Entidade obrigatória (e descrição na avulsa); confirmação com o número anual e botão Copiar |
| 9 | Lista de solicitações sem número | Número anual, `PROJ-N`, entidade, etapa e setor |
| 10 | Sem orientação do código de ética | `ORIENTACAO_DA_ABERTURA` no topo do modal de solicitação e do de chamado |
| Dúvida | Para que serve "Módulo" | É o antigo "caminho do menu": o campo diz "Módulo (menu do sistema onde acontece)" |

## Setor do chamado (itens 1 e 9)

`modules/urgentes/setor-do-chamado.rules.ts`, tudo pela matriz de Funções:

- triagem: a função de menor nível com `intake.review` (hoje Qualidade);
- outras etapas: o setor do responsável quando ele é dono da etapa (pode sair
  dela); sem isso, os donos da etapa. O atendente que abriu segue como
  responsável e não pode fazer o chamado parecer estar no Atendimento.

## Erro de importação (item 4)

`migrate-sac.ts` (etapa 7b) gravava vínculo pessoa×sistema só para quem tinha
mensagem ou responsabilidade no sistema. Em homologação faltavam 144 pares para
20 das 34 pessoas internas; o desenvolvedor principal do ARH (1.965 comentários
no RECURS) só tinha vínculo com COMPRA. No legado ninguém ficava preso a um
sistema. Agora `syncParticipacaoEmTodoSistema` roda ao criar sistema, ao entrar
membro e na rota `sync-members`; vínculo desativado não é recriado.

# Testes nova intranet 3 (18/11/2026)

| Item | O que era | O que ficou |
|---|---|---|
| Sistemas repetidos | Dois "Licitação", dois "Recursos Humanos"... (desktop e web) iguais no seletor; inativos apareciam | Web (`categoria = 3` no legado) leva "Web" no nome ("Licitação Web", "GED Web (descontinuado)"); os 10 da lista fixa que a intranet esconde ficam arquivados (`modules/project/sistema-do-legado.rules.ts`) |
| Aviso de cliente parado | "Cliente parado: a Qualidade foi avisada…" | "Cliente parado. O Setor de Qualidade foi comunicado sobre a situação, com prioridade urgente." |
| Entidade some no chamado | Aberto pela faixa de urgentes ou por link mostrava "Adicionar entidade" | O recorte do detalhe no store (`buildIssueDoDetalhe`) não levava `entity_id`/`entity` |
| Só a sigla do sistema | "No sistema: RECUR1-7" | "Recursos Humanos · RECUR1-7" (`formatNumeroNoSistema` em `apps/web/helpers`): confirmação, faixa de urgentes, lista de solicitações, notificações, busca global, chamados da visita. A abertura devolve `project_name`; notificação `data.issue.project_name`; paleta `project__name` |
| Aceitar sem responsável | Em Análise só com o atendente | Quem aceita entra nos responsáveis (o atendente fica). `addResponsavel` em `@utils/vinculos-do-chamado` é a regra "quem move de etapa vira responsável", agora também no aceite; a resposta traz `assignee_ids` |
| Como mandar para o desenvolvimento | Só arrastando aparecia "comente antes de mover" | "Comentar e movimentar" ao lado de Comentário (`components/comments/movimentacao`): grava o comentário e só então muda a etapa. Fora da triagem |
| Selects da visita técnica | Abriam atrás da modal (div z-50, portal z-30) | `ModalCore` do `@plane/ui` |
| Etapa longe do comentário | Primeira propriedade | Última, logo acima da atividade (detalhe e peek) |
| IA demora e perde o texto | Fechar o peek no meio perdia o comentário; erro também apagava | Registro `comentariosEmProcessamento` (MobX): a caixa mostra "Processando o comentário…", o peek pergunta antes de fechar, o navegador avisa ao sair; o texto só sai do editor quando gravou |
| Card urgente | Faixa com `border-red-300`, classe que não existe (o tema zera a paleta: `--color-*: initial`) | Tokens `danger-*`, borda de 2px; card do quadro com `border-priority-urgent` (`isPrioridadeUrgente`) |
| Triagem | Abria em Concluído para todos | Quem tem `intake.review` abre em Pendente (`readAbaPadraoDaTriagemGlobal`) |

## Sistemas do legado em homologação

Já importados: `LEGACY_INTRANET_DB_URL=mysql://... DRY_RUN=1 bun run scripts/ajustar-sistemas-do-legado.ts`
mostra o plano; sem `DRY_RUN` aplica. Só renomeia quem ainda tem o nome da importação (o
legado tem espaço no fim, "Licitação ", e a importação antiga não tirava) e nunca desarquiva.
Importação nova: aplicar `.claude/patches/testes3-migrate-sac.patch` no `migrate-sac.ts`
(gitignored). No legado de produção (192.168.100.250, `quality_site`) os 118 sistemas estão
com `status = 1`: não há coluna de ativo; o critério é a lista fixa de
`funcoesAjaxTickets.php`.

**Armadilha de cor:** classes da paleta padrão do Tailwind (`red-300`, `gray-500`,
`yellow-100`) não existem neste tema. Use os tokens (`danger-*`, `priority-urgent`,
`text-secondary`…) de `packages/tailwind-config/variables.css`.
