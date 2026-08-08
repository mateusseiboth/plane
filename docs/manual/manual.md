---
title: "Avião — Manual do Usuário"
subtitle: "Sistema de chamados, atendimento e visitas técnicas"
author: "Quality Sistemas"
lang: pt-BR
---

\newpage

# Sobre este manual

O **Avião** é o sistema de chamados da Quality Sistemas. Ele substitui o antigo
SAC e reúne, num único lugar, tudo o que antes ficava espalhado: abertura e
triagem de chamados, acompanhamento do que está em desenvolvimento, visitas
técnicas, atendimento por WhatsApp, indicadores e a trilha de auditoria exigida
pela LGPD.

Este manual cobre o sistema **tela por tela**. Cada capítulo mostra uma imagem
real da aplicação, explica o que fazer ali e termina com dicas — os atalhos e
detalhes que só se descobre usando.

## Vocabulário

O sistema nasceu de uma base internacional e foi inteiramente traduzido. Alguns
termos merecem atenção porque aparecem o tempo todo:

| Termo no Avião | O que é |
|---|---|
| **Chamado** | A unidade de trabalho. Todo pedido, bug, dúvida ou melhoria vira um chamado. |
| **Sistema** (ou projeto) | Cada produto da Quality — Contabilidade, Siart, Folha de Pagamento… Um chamado sempre pertence a um sistema. |
| **Solicitação** | Um pedido de chamado que ainda **não** foi triado. Entra pela caixa de solicitações e só vira chamado quando alguém aceita. |
| **Entidade** | O cliente atendido (prefeitura, câmara, consórcio, instituto). |
| **Etapa** | A coluna do quadro: Triagem, Em Análise, A Fazer, Em Desenvolvimento, Em Teste, Concluído. |
| **Ciclo** | Uma janela de tempo (sprint) com um conjunto de chamados. |
| **Módulo** | Um agrupamento temático de chamados dentro de um sistema. |

## Como o trabalho flui

```
  Solicitação ─► Triagem ─► Em Análise ─► A Fazer ─► Em Desenvolvimento ─► Em Teste ─► Concluído
   (cliente,     (Qualidade,  (Qualidade,   (fila           (TI)             (Qualidade)
    atendimento,  sem dono)    com dono)     do TI)
    WhatsApp)
```

**Triagem é a fila do que ainda não tem dono.** Um chamado fica em Triagem
enquanto ninguém da Qualidade o assumiu; assim que alguém da equipe entra como
responsável, ele passa para **Em Análise**. É essa a diferença entre as duas
etapas — não é o tipo do chamado nem o cliente, é ter ou não um responsável.

Quem move o chamado de uma etapa para outra depende do **papel** da pessoa —
veja o capítulo [Funções e permissões](#funções-e-permissões).

\newpage

# Entrar no sistema

A entrada é em dois passos: primeiro o e-mail, depois a senha.

![Tela de entrada](img/01-login.png)

Digite o e-mail corporativo e pressione **Enter** (não é preciso clicar no
botão). O sistema identifica a conta e mostra o campo de senha.

![Informe a senha](img/02-login-senha.png)

> **Esqueceu a senha?** Use o link *Esqueci minha senha* na segunda tela. Se o
> e-mail não chegar, um administrador pode redefinir a senha diretamente em
> **Configurações → Membros**.

\newpage

# Página inicial

![Página inicial](img/03-inicio.png)

A tela de abertura responde três perguntas em um relance:

- **Solicitações abertas** — o que chegou e ainda não foi triado.
- **Meus chamados** — o que está atribuído a você.
- **Prazos próximos** — o que vence nos próximos 7 dias.

Abaixo dos cartões ficam os **Links rápidos**: guarde ali referências que você
abre todo dia (uma planilha, um painel, a documentação de um cliente).

**Dicas**

- O botão **Gerenciar widgets**, no canto superior direito, liga e desliga cada
  bloco. Se você não usa ciclos, esconda o bloco e ganhe espaço.
- A barra lateral tem duas seções: **Espaço de trabalho** (visões que cruzam
  todos os sistemas) e **Projetos** (a lista de sistemas). O item **Mais**
  revela o restante do menu quando a lista fica longa.

\newpage

# Sistemas (projetos)

![Lista de sistemas](img/04-projetos.png)

Cada produto da Quality é um sistema. A lista mostra todos, com os que você
acompanha marcados. Clique em um nome para entrar; clique na estrela para
fixá-lo nos favoritos da barra lateral.

**Dicas**

- Um sistema só aparece na sua barra lateral se você for membro dele. Peça
  acesso a um administrador em **Configurações → Membros**.
- Sistemas descontinuados continuam no ar apenas para consulta (ex.: *DMS
  (descontinuado)*, *Saúde 2.0 (descontinuado)*). O histórico do SAC foi
  migrado inteiro, então chamados antigos continuam pesquisáveis.

\newpage

# Chamados de um sistema

Esta é a tela onde o dia passa. Ela tem **cinco layouts** para os mesmos dados —
escolha o que responde à sua pergunta.

## Lista

![Chamados em lista](img/20-chamados-lista.png)

A lista é o layout mais denso: uma linha por chamado, com estado, prazo,
responsáveis, entidade e etiqueta editáveis **direto na linha** — não é preciso
abrir o chamado para mudar a prioridade ou o responsável.

Cada chamado tem dois identificadores:

- **CONTAB-102** — o código do Avião (sigla do sistema + número sequencial).
- **#871-2026** — o número do chamado no **SAC antigo**, preservado na migração.
  Use-o para localizar um chamado que o cliente cita pelo número velho.

## Quadro (kanban)

![Quadro kanban](img/24-kanban.png)

Uma coluna por etapa, com a contagem ao lado do nome. Arraste o cartão para
mover o chamado de etapa — se o seu papel não permitir aquela transição, o
sistema recusa e explica o porquê.

> **Todo mundo vê tudo.** Antes, cada setor só enxergava as etapas que lhe
> diziam respeito (o TI não via a Triagem, por exemplo). Isso acabou: quem
> participa do sistema vê todas as etapas. Para trabalhar só no que interessa,
> use os **modelos de filtro** — é a próxima seção.

## Calendário

![Calendário](img/28-calendario.png)

Distribui os chamados pela data de entrega. Útil para enxergar acúmulo de prazo
numa semana e redistribuir antes de estourar.

## Planilha

![Planilha](img/29-planilha.png)

Uma coluna por propriedade, como uma tabela. É o layout certo para conferir
muitos campos ao mesmo tempo e para exportar.

## Linha do tempo

![Linha do tempo](img/24b-gantt.png)

Mostra a duração de cada chamado entre a data de início e a de entrega.

**Dicas**

- O layout escolhido **fica salvo por sistema**: se você prefere kanban na
  Contabilidade e lista no Siart, o Avião lembra.
- O botão **Exibir** controla agrupamento, ordenação e quais propriedades
  aparecem em cada cartão.
- O ícone de impressora imprime exatamente o que está na tela, com o filtro
  aplicado — veja [Impressão](#impressão).

\newpage

# Filtros e modelos por setor

## A barra de filtros

![Barra de filtros](img/21-filtros.png)

Clique no funil para montar um filtro. Você escolhe o **campo** (Estado, Grupo
de estado, Responsáveis, Prioridade, Menções, Etiqueta, Entidade, Ciclo,
Módulo, Data de início, Data alvo, Criado em), depois o **operador** e o
**valor**.

Os operadores são:

| Operador | Significado |
|---|---|
| **é** | Casa exatamente com o valor. |
| **é um de** | Casa com qualquer valor da lista. |
| **entre** | Para datas: dentro do intervalo, inclusive as bordas. |

## Só os meus chamados

![Botão "Meus chamados"](img/21b-meus-chamados.png)

O botão **Meus chamados**, o primeiro da barra, é um interruptor: liga e mostra
apenas o que está atribuído a você; desliga e volta a mostrar tudo. Ele existe
em **todas as telas de listagem** — chamados do sistema, ciclo, módulo,
visualizações salvas, visões globais e arquivados — e em qualquer layout.

> **Meu chamado é o que eu tenho de resolver.** O responsável é quem está com o
> chamado agora: se você é do TI e puxou o cartão para Em Desenvolvimento, ele é
> seu. Ter comentado num chamado não faz dele seu — para acompanhar sem ser o
> responsável, use a inscrição (o sino no detalhe do chamado).

A diferença para o modelo de mesmo nome no menu **Modelos** é importante:

- o **modelo** substitui o filtro inteiro;
- o **botão** apenas acrescenta você ao filtro de responsável, preservando o
  resto.

Ou seja: aplique o modelo do seu setor e depois ligue **Meus chamados** para
ficar só com a sua parte daquele recorte. Desligar devolve o filtro do setor
intacto.

## Modelos prontos

![Modelos de filtro](img/22-filtros-modelos.png)

O botão **Modelos** aplica, num clique, o recorte típico de cada setor:

| Modelo | Mostra |
|---|---|
| **Triagem** | Chamados da Qualidade ainda sem responsável |
| **TI** | A Fazer, Em Desenvolvimento e Em Teste |
| **Qualidade** | Triagem, Em Análise e Em Teste |
| **Atendimento** | Triagem e os chamados que o setor acompanha |

![Modelo aplicado](img/23-filtro-aplicado.png)

Com o modelo aplicado, a contagem no topo muda e a barra mostra o filtro ativo.
Você pode **ajustar em cima do modelo** — acrescentar uma entidade, restringir a
um responsável — sem perder o resto.

**Dicas**

- O modelo é um ponto de partida, não uma trava: remova qualquer condição
  clicando no × ao lado dela.
- Filtro de data com intervalo (`entre`) funciona nos dois extremos. Se você
  informar só uma borda, o sistema entende como "a partir de" ou "até".
- Para voltar à visão completa, limpe os filtros — a contagem do cabeçalho
  volta ao total do sistema.

\newpage

# Detalhe do chamado

![Detalhe do chamado](img/34-chamado-detalhe.png)

A tela do chamado tem três áreas:

1. **Centro** — título, descrição e a linha do tempo de atividade (comentários e
   mudanças).
2. **Direita (Propriedades)** — Estado, Responsáveis, Prioridade, Data de
   início, Data de vencimento, Módulos, Ciclo, chamado Pai, Etiquetas, Entidade
   e Log de tempo.
3. **Barra de ações** — Adicionar subchamado, Adicionar relação, Adicionar link,
   Anexar.

**Dicas**

- **Subchamado** divide um trabalho grande; **relação** liga chamados
  independentes (duplicado, bloqueia, relacionado a).
- Comentários aceitam formatação, listas, código e imagens. Use **@** para
  mencionar alguém — a pessoa recebe notificação.
- Comentários podem ser **editados e apagados**; quando editados, aparece
  *(editado)* com o histórico de versões.
- Todo o histórico do SAC foi migrado: comentários antigos aparecem aqui, com a
  data original (por isso é comum ver "comentou há cerca de 18 anos").
- O **Log de tempo** registra horas trabalhadas no chamado.

\newpage

# Solicitações (pedidos de chamado)

## Visão global

![Solicitações globais](img/06-solicitacoes.png)

Tudo o que chega de fora — cliente, atendimento, WhatsApp — entra como
**solicitação** e espera triagem. As abas separam por situação: **Pendente**,
**Recusado**, **Adiado**, **Aceito**, **Duplicado**.

A coluna da esquerda filtra por sistema; **Todos os projetos** mostra a fila
inteira.

## Solicitações de um sistema

![Solicitações do sistema](img/27-triagem-projeto.png)

O mesmo, restrito ao sistema aberto.

**Dicas**

- **Aceitar** transforma a solicitação em chamado e o coloca na Triagem.
  **Recusar** e **Duplicado** encerram sem criar chamado — sempre justifique no
  comentário, porque o solicitante recebe a resposta.
- Uma solicitação atendida diretamente (sem virar chamado) pode ser marcada como
  **atendida**.

\newpage

# Visitas técnicas

![Visitas técnicas](img/07-visitas.png)

Registro das visitas presenciais: entidade, período, técnico responsável,
contatos e os sistemas envolvidos. O histórico completo de visitas do SAC foi
migrado.

**Dicas**

- Uma visita pode ser **vinculada a chamados** — assim o relatório da visita e o
  histórico do chamado ficam conectados.
- A tela imprime, o que resolve o relatório de visita para o cliente.

\newpage

# Ciclos e módulos

## Ciclos

![Ciclos](img/25-ciclos.png)

Um ciclo é uma janela de tempo com início e fim. Serve para responder "o que
entra nesta semana/quinzena" e para medir o que efetivamente saiu.

## Módulos

![Módulos](img/26-modulos.png)

Um módulo agrupa chamados por tema, sem prazo. Ex.: "Fechamento anual",
"e-Sfinge", "Migração de anexos".

> Ciclo é **quando**; módulo é **sobre o quê**. Um chamado pode estar em um
> ciclo e em vários módulos ao mesmo tempo.

\newpage

# Visões globais

![Visões globais](img/05-visoes-globais.png)

Cruzam **todos os sistemas** de uma vez: "todos os chamados atribuídos a mim",
"tudo que vence esta semana", "tudo de uma entidade". Salve a combinação de
filtros como uma visão e ela fica disponível para consulta futura.

\newpage

# Análises

## Visão geral

![Análises — visão geral](img/08-analytics.png)

Os cartões do topo somam o espaço de trabalho inteiro: usuários,
administradores, membros, convidados, sistemas, chamados, ciclos e
solicitações.

O radar **Insights do projeto** compara os **10 sistemas com mais chamados** —
com mais de uma centena de sistemas, o gráfico completo ficaria ilegível. A
lista ao lado traz os números exatos. À direita, **Projetos ativos** mostra o
percentual de conclusão de cada sistema.

## Aba de chamados

![Análises — chamados](img/08b-analytics-chamados.png)

- **Contadores por grupo de etapa**: total, iniciados, no backlog, não iniciados
  e concluídos.
- **Criado vs Resolvido**: a série histórica. Onde a linha de criados sobe acima
  da de resolvidos, a fila cresceu.
- **Insights personalizados**: você escolhe o que vai no eixo (Etapa, Grupo de
  etapa, Prioridade, Etiqueta, Responsável, Ciclo, Módulo, datas) e a métrica.

**Dicas**

- O seletor **Todos os sistemas**, no topo, restringe tudo a um subconjunto.
- O ícone de impressora gera o relatório com os gráficos como estão na tela.

\newpage

# Relatórios

![Relatórios](img/13-relatorios.png)

Relatórios gerenciais montados sobre os mesmos dados, prontos para impressão e
envio.

\newpage

# Atendimento (chat / WhatsApp)

![Atendimento](img/12-atendimento.png)

O módulo de atendimento conecta o WhatsApp (via Z-API) e um widget de chat para
o site. As conversas viram protocolos, entram em filas e podem ser convertidas
em chamados.

A coluna da esquerda separa os atendimentos em **Ativas**, **Na fila**, **Bot** e
**Encerrados**. O módulo já vem ligado; a conexão com o WhatsApp e as filas são
configuradas em **Configurações → Atendimento (Chat)**.

![Configuração do atendimento](img/46-config-chat.png)

**Dicas**

- Mensagens podem ser **editadas e apagadas** pelos dois lados; a alteração é
  propagada para o WhatsApp do cliente.
- O histórico de conversas do sistema antigo foi migrado, inclusive os anexos.

\newpage

# Notificações, rascunhos e notas

## Notificações

![Notificações](img/09-notificacoes.png)

Menções, atribuições e mudanças nos chamados que você acompanha. O sistema
atualiza em tempo real — não é preciso recarregar a página.

## Rascunhos

![Rascunhos](img/10-rascunhos.png)

Chamados começados e não publicados ficam aqui, só para você.

## Notas rápidas

![Notas rápidas](img/11-notas.png)

Um mural pessoal para lembretes. Não são compartilhadas.

\newpage

# Páginas

![Páginas](img/30-paginas.png)

Documentação viva dentro do sistema: procedimentos, roteiros de teste, decisões
técnicas. Ficam dentro do sistema a que pertencem.

\newpage

# Configurações do sistema (projeto)

![Configurações do sistema](img/31-config-projeto.png)

Nome, identificador (a sigla que prefixa os chamados), descrição, capa e
funcionalidades ligadas (ciclos, módulos, páginas, solicitações).

## Etapas

![Etapas do fluxo](img/32-config-etapas.png)

As colunas do quadro. Cada etapa pertence a um **grupo** (triagem, não
iniciado, em andamento, concluído, cancelado) — é o grupo que o sistema usa
para calcular indicadores e permissões de movimentação.

## Membros do sistema

![Membros do sistema](img/33-config-membros-projeto.png)

Quem participa e com qual papel. O papel definido aqui vale **dentro deste
sistema**.

\newpage

# Configurações do espaço de trabalho

![Configurações gerais](img/40-config-geral.png)

## Membros

![Membros](img/41-config-membros.png)

Todos os usuários e seus papéis. É aqui que se convida gente nova e se redefine
senha.

## Funções e permissões

![Funções e permissões](img/42-config-funcoes.png)

O coração do controle de acesso. A coluna da esquerda lista as funções em ordem
de hierarquia — o número no quadradinho é o **nível**, e abaixo do nome aparece
quantas permissões a função tem hoje.

À direita, as **permissões saem agrupadas por assunto**: Chamados, Responsáveis
e etapas, Comentários, Anexos, Solicitações, Organização do trabalho e
Administração do sistema. Cada bloco mostra o contador (`3/6`) e um atalho
**Marcar todas** / **Desmarcar todas**.

Abaixo vêm as **transições de etapa permitidas**: de onde para onde essa função
pode mover um chamado. Sem nenhuma linha, a função não move nada por tabela —
quem precisa de acesso total recebe a permissão *Mover para qualquer etapa*.

As funções de sistema são:

| Função | Nível | Papel |
|---|---|---|
| **Visualizador** | 5 | Só lê |
| **Atendimento** | 6 | Abre solicitação e comenta; não cria nem edita chamado |
| **Qualidade** | 8 | Tira da Triagem, analisa e testa |
| **TI** | 12 | Desenvolve: A Fazer → Em Desenvolvimento → Em Teste |
| **Membro** | 15 | Participação geral |
| **Gestor de Projeto** | 18 | Move livremente entre etapas |
| **Administrador** | 20 | Tudo |

> **Visibilidade ≠ movimentação.** Todo participante do sistema **vê** todos os
> chamados em qualquer etapa. O que a função controla é o que ele pode
> **mover**. Para trabalhar só no que interessa, use os modelos de filtro.

## Entidades

![Entidades](img/43-config-entidades.png)

O cadastro de clientes (269 entidades migradas do SAC). A entidade aparece em
cada chamado e é um dos filtros mais usados: "tudo que a Prefeitura de X abriu".

## SLA / Prazos

![SLA e prazos](img/47-config-sla.png)

O prazo é calculado em duas partes:

1. **Prazo por etiqueta** — cada etiqueta define um prazo-base em horas
   corridas. No exemplo: *Correção* = 16 h, *Melhoria* = 96 h (4 dias),
   *Projeto* = sem prazo.
2. **Ajuste por prioridade** — soma ou subtrai horas do prazo-base. No exemplo:
   Urgente −8 h, Alta −4 h, Baixa +8 h.

Ao aplicar uma etiqueta com prazo, a data de vencimento é preenchida
automaticamente **se ainda não houver uma**. Uma data informada à mão nunca é
sobrescrita.

## Impressão

![Configuração de impressão](img/45-config-impressao.png)

Define o logo, o texto do cabeçalho, o texto do rodapé e se a data/hora de
geração aparece. Vale para **tudo** que o sistema imprime: chamados, listagens,
solicitações, ciclos, módulos, visitas técnicas e relatórios. A prévia mostra o
resultado antes de salvar.

> Envie o logo em PNG ou SVG com fundo transparente, altura mínima de 96 px.

## Auditoria (LGPD)

![Trilha de auditoria](img/44-config-auditoria.png)

Registro de quem acessou, alterou, imprimiu ou exportou dados. Cada linha traz
data e hora, usuário, **IP de origem**, ação e o registro afetado; alterações
guardam o antes e o depois.

Filtre por ação, tipo de registro, e-mail e período, e exporte em **CSV** — a
própria exportação também é registrada.

> **Direito do titular (art. 18 da LGPD).** Qualquer usuário pode consultar os
> **próprios** acessos, mesmo sem ser administrador. A trilha de terceiros é
> restrita a administradores.

## Armazenamento

![Armazenamento](img/48-config-armazenamento.png)

Onde os anexos ficam guardados (S3 ou compatível). O sistema já traz 65 mil
anexos catalogados da migração.

## Exportações

![Exportações](img/49-config-exportacoes.png)

Exportação em massa dos chamados, por sistema.

## Webhooks

![Webhooks](img/50-config-webhooks.png)

Dispara chamadas HTTP para sistemas externos quando algo acontece (chamado
criado, comentário, mudança de etapa).

\newpage

# Plugins e widgets

![Loja de plugins](img/14-plugins.png)

O Avião aceita extensões: integrações, temas de quadro, importadores, chamados
recorrentes. Os plugins são instalados por administradores e podem contribuir
com telas próprias na barra lateral.

\newpage

# Perfil e preferências

![Perfil](img/51-perfil.png)

Nome de exibição, avatar, fuso horário, tema (claro/escuro), preferências de
notificação e tokens de API.

**Dicas**

- O **fuso horário** afeta como as datas aparecem para você — importante para
  quem atende clientes em outros estados.
- Tokens de API servem para integrar o Avião a outros sistemas. Defina prazo de
  validade sempre que possível.

\newpage

# Atalhos e macetes

## Busca global

A caixa **Buscar comandos…** no topo (ou `Ctrl/⌘ + K`) procura em tudo:

- Digite parte do **título** de um chamado.
- Digite o **código do Avião** (`CONTAB-102`).
- Digite o **número do SAC antigo** no formato `#1234-2026` — o sistema encontra
  o chamado migrado.
- Encontra também solicitações e navega direto para telas.

## Teclado

| Atalho | Ação |
|---|---|
| `Ctrl/⌘ + K` | Busca global e paleta de comandos |
| `Enter` | Avança na tela de entrada |
| `Esc` | Fecha menus, filtros e modais |

O menu **?** → *Atalhos de teclado* lista o conjunto completo.

## No dia a dia

- **Edite pela lista.** Estado, prioridade, responsável, prazo e entidade são
  editáveis direto na linha da listagem ou no cartão do kanban.
- **Modelos de filtro em vez de decorar filtro.** Um clique em *Modelos* devolve
  o recorte do seu setor.
- **Combine o modelo com "Meus chamados".** O modelo põe o setor na tela; o
  botão tira dela o trabalho dos outros. Os dois juntos deixam só a sua fila.
- **O número velho continua valendo.** O chamado do SAC aparece ao lado do código
  novo; use-o para falar com quem ainda pensa pelo número antigo.
- **Imprima com filtro aplicado.** A impressão respeita exatamente o que está na
  tela.
- **Tempo real.** Chamados, comentários e solicitações atualizam sozinhos.
- **Você é auditado — e isso protege você.** Visualização, edição, impressão e
  exportação ficam registradas com IP. Em caso de dúvida sobre quem fez o quê, a
  trilha responde.

\newpage

# Perguntas frequentes

**Não vejo um sistema na barra lateral.**
Você não é membro dele. Peça acesso a um administrador
(*Configurações → Membros*).

**Não consigo arrastar o chamado para outra coluna.**
A movimentação depende da sua função. Confira em *Configurações → Funções* quais
transições o seu papel permite — ou peça a quem tem o papel certo.

**A listagem está vazia.**
Quase sempre é filtro ativo. Comece conferindo se o botão **Meus chamados** está
ligado (fica destacado em azul); depois verifique a barra de filtros e limpe as
condições. A contagem no cabeçalho volta ao total.

**Um chamado está em Triagem mas alguém já está cuidando dele.**
Triagem significa "sem responsável da Qualidade". Basta entrar como responsável
que ele sai da fila de triagem — e vice-versa: tirar o responsável devolve o
chamado para a Triagem.

**Um chamado antigo não tem responsável.**
O SAC nem sempre registrava quem estava com o chamado — só cerca de metade do
histórico traz essa informação, e quem saiu da empresa não foi migrado. Chamados
que estavam com o cliente ou com o representante também chegaram sem
responsável, porque lá não havia ninguém da equipe designado.

**Onde estão os chamados antigos do SAC?**
Todos migraram: 50.966 chamados, 242.801 comentários, 861 visitas e 65.721
anexos. Procure pelo número antigo (`#1234-2026`) na busca global.

**Por que um comentário diz "há cerca de 18 anos"?**
Porque é a data original do SAC. A migração preservou as datas em vez de
carimbar tudo com a data da importação.

**Preciso comprovar quem acessou o dado de um cliente.**
*Configurações → Auditoria (LGPD)*. Filtre por período e registro e exporte o
CSV.

**Como coloco a logo da empresa nas impressões?**
*Configurações → Impressão*. O logo, o cabeçalho e o rodapé valem para todos os
documentos do sistema.
