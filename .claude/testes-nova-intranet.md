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
