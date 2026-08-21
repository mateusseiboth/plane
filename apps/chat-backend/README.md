# chat-backend

Atendimento em tempo real do Avião: WhatsApp (Z-API) e widget nativo no mesmo
lugar, com bot de triagem, filas, roteamento por carga, transferência, pesquisa
de satisfação e trilha de auditoria (LGPD).

Bun + Elysia + Prisma. Sobe em `CHAT_PORT` (padrão `8002`).

```bash
bun run dev          # com hot reload
bun run start        # produção
bun run db:generate  # client Prisma (saída em ./generated/prisma)
bun run db:migrate   # aplica prisma/sql/*.sql (idempotente)
```

## Banco

O serviço **compartilha o Postgres do Plane** (`DATABASE_URL`); todas as tabelas
dele são prefixadas `chat_*`. `CHAT_DATABASE_URL` aponta para um banco próprio,
se algum dia for preciso separar.

Por compartilhar o banco, `prisma migrate` está **fora de uso**: ele trataria o
schema do chat como o banco inteiro e derrubaria as tabelas do Plane. As
mudanças de schema vão em `prisma/sql/000N_nome.sql` e são aplicadas uma única
vez por `scripts/migrate.ts`, com controle em `chat_migrations`.

### Tabelas que não são nossas

`projects`, `users`, `workspaces`, `workspace_members`, `entities` e
`entity_contacts` pertencem à API principal (`apps/api-ts`). O chat lê e escreve
nelas por **SQL puro** (`$queryRaw` / `$executeRaw`), nunca declarando o model no
schema daqui: uma segunda definição da mesma tabela apodrece na primeira
migração do api-ts e quebra em execução sem nada aqui ter sido tocado.

Atenção ao identificador: o `workspaceId` do chat é o **slug** do workspace; as
tabelas do Plane guardam o **UUID**. A tradução está em `workspaceIdDoSlug`
(`src/responsaveis.ts`).

## Contatos do cliente (`entity_contacts`)

As pessoas de carne e osso dentro do cliente — na interface do Avião elas se
chamam **Contatos**; no schema e no contrato, `EntityContact` / Responsáveis
(`.claude/CONTRATO_RESPONSAVEIS.md`). É o mesmo cadastro que a entidade e a
visita técnica usam, e é dele que o chat tira o nome de quem está do outro lado.

### Identificação pelo telefone

Na primeira mensagem de um número, `src/bot/engine.ts` procura o contato por
`phone_digits` antes de perguntar qualquer coisa:

1. achou → o bot confirma pelo nome do cadastro
   (`BotConfig.confirmContactMessage`, "Você é {name}?") e a sessão guarda
   `chat_sessions.entity_contact_id`;
2. não achou → cai no nome do `Contact` do chat (o perfil que o WhatsApp
   mandou);
3. nada disso → o bot pergunta o nome, como antes.

O nome do cadastro vence o nome de perfil do WhatsApp: "Maria Responsável" em
vez de "Zé Celular".

A busca cobre as variações do **nono dígito** (`variantesDeTelefone`): o WhatsApp
entrega `55 DD 9XXXXXXXX` e o cadastro herdado do SAC muitas vezes guardou
`55 DD XXXXXXXX`. Sem isso, cliente antigo não seria reconhecido.

Se a pessoa responder que **não** é quem perguntamos, o vínculo é desfeito — quem
refaz é o encerramento.

### Cadastro no encerramento

`agent.close` aceita, além de `session_id`:

```jsonc
{
  "type": "agent.close",
  "session_id": "uuid",
  "project_id": "uuid", // sistema atendido (classificação)
  "contact": {
    "contact_id": "uuid", // contato já existente escolhido na busca
    "name": "Fulano de Tal",
    "email": "fulano@x.gov.br",
    "phone": "(67) 99999-0000", // ausente → usa o telefone do atendimento
    "entity_id": "uuid",
    "type_id": "uuid",
  },
}
```

`src/encerramento.ts` grava **antes** de fechar (a mensagem de encerramento sai
logo em seguida e o dado precisa já existir) e `src/responsaveis.ts` decide o
que fazer, nesta ordem: atualiza o `contact_id` informado → atualiza o contato já
vinculado à sessão → atualiza o do mesmo telefone → só então **cria**. É o que
cumpre "se o cliente não tem cadastro, ele vai para esse cadastro" sem encher
`entity_contacts` de gêmeos a cada atendimento do mesmo número.

O que nasce aqui fica marcado com `external_source = 'chat'`.

O `Contact` do chat (`chat_contacts`) **continua existindo**: ele é o histórico da
conversa por telefone, não o cadastro do cliente. Ao encerrar, ele acompanha o
nome, o e-mail e a entidade do contato gravado.

## Quem atende, quem escolhe e quem lê a avaliação

**O cliente não escolhe atendente.** O pré-chat do widget pergunta nome e sistema;
a conversa entra na fila e a distribuição por peso decide. Escolher deixava a
conversa parada na caixa de quem estava ocupado (ou fora do horário) com o resto
da equipe livre.

**Quem aparece como atendente** sai de `papeis.ts`, e são três perguntas
diferentes que antes usavam o mesmo número (`role >= 15`):

| Pergunta        | Papel mínimo    | Onde vale                                                   |
| --------------- | --------------- | ----------------------------------------------------------- |
| `ehAtendente`   | Atendimento (6) | listas de atendentes, alvo de transferência, membro de fila |
| `podeGerenciar` | Membro (15)     | transferir atendimento, relatórios                          |
| `ehAdmin`       | Admin (20)      | fila e robô na lista, avaliação do cliente                  |

Os valores espelham `EUserPermissions` (`packages/constants/src/user.ts`) — este
fork tem papéis ABAIXO de membro (TI 12, Qualidade 8, Atendimento 6), e o papel
_Atendimento_ é justamente quem atende. Com o corte antigo ele não aparecia em
lista nenhuma, mesmo conectado.

**A avaliação é leitura de gestão.** Nota e comentário do cliente só vão para o
administrador do espaço: o servidor não os envia a quem não é admin (lista de
conversas, histórico e transcrição), e a tela do atendente também não os mostra.

**Pesquisa só quando houve atendimento.** Conversa encerrada sem ninguém ter
assumido não abre pesquisa de satisfação — não há atendimento a avaliar. Quem
decide é o servidor (`rating.request`); a página do cliente nunca abre o
formulário por conta própria.

## Testes

Os testes e2e batem numa instância **em execução** (`CHAT_URL`) ligada ao **mesmo
banco** que a suíte, e a identificação por telefone exige as tabelas do Plane
(`workspaces`, `entities`, `entity_contacts`) no mesmo lugar que as `chat_*`.
Um banco só para isso evita brigar com quem estiver rodando os testes do api-ts:

```bash
createdb plane_chat_test   # ou: psql -c 'CREATE DATABASE plane_chat_test'
export DATABASE_URL=postgresql://plane:plane@localhost:5442/plane_chat_test

cd ../api-ts && bunx prisma migrate deploy && bun run scripts/seed.ts
cd ../chat-backend && bun run scripts/migrate.ts

CHAT_PORT=8012 JWT_SECRET=plane-jwt-secret bun run start &
CHAT_URL=http://localhost:8012 JWT_SECRET=plane-jwt-secret bun test
```

`JWT_SECRET` precisa ser o **mesmo** nos dois: o servidor e a suíte têm padrões
diferentes, e sem alinhar o ticket do WebSocket volta 401.

Cada teste usa um workspace de slug aleatório e limpa o que criou
(`tests/helpers/harness.ts`), inclusive o workspace do Plane quando o cria.
