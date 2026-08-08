# Manual do usuário

- **`manual.md`** — a fonte. Edite aqui.
- **`manual-aviao.pdf`** — o entregável, gerado a partir do `.md`.
- **`estilo.css`** — tipografia e quebras de página do PDF.
- **`gerar-pdf.sh`** — pipeline `pandoc → HTML → Chrome headless → PDF`.
- **`img/`** — capturas de tela (80), tiradas do ambiente 10.1.2.12: o app, as
  configurações do espaço de trabalho e o god-mode.
- **`capturas.json`** — inventário das capturas + o que a varredura encontrou
  (erros de JS, rotas 404 e frases em inglês na interface).
- **`demo-dados.mjs`** — cria (e depois apaga) os dados de demonstração usados
  em algumas capturas.

## Regerar o PDF

```bash
cd docs/manual && ./gerar-pdf.sh
```

Requer `pandoc` e `google-chrome`/`chromium`. O `\newpage` do Markdown vira uma
quebra de página no PDF.

## Regerar as capturas

`capturar.mjs` percorre as telas e `capturar-layouts.mjs` troca de layout
(kanban, calendário, planilha, linha do tempo). Juntos eles:

1. entra no sistema,
2. percorre todas as rotas,
3. tira a captura de cada tela,
4. **varre todo o texto visível procurando inglês** — o critério é a presença de
   palavra funcional inglesa (the, your, add, settings…) numa frase sem acento,
   não uma lista fixa de termos, que era o que deixava passar coisas como
   "All work items",
5. registra erros de JavaScript, respostas HTTP 5xx e rotas que caem no 404.

O resultado da varredura vai para `capturas.json`. Ruído esperado: nomes de
entidades migradas do SAC ("CAMARA MUNICIPAL DE … DO SUL") casam com a palavra
"do".

Para rodá-lo (o Playwright não é dependência do monorepo):

```bash
mkdir -p /tmp/pw && cd /tmp/pw && npm i playwright && npx playwright install chromium
cp <repo>/docs/manual/capturar*.mjs .          # ESM não respeita NODE_PATH:
                                               # o script tem de estar ao lado
                                               # do node_modules do Playwright
BASE=http://10.1.2.12 OUT=<repo>/docs/manual/img node capturar.mjs
node capturar-layouts.mjs
```

Login das capturas: `EMAIL`/`SENHA` (padrão `mateus@qualitysistemas.com.br`).

## Dados de demonstração

Algumas telas só existem com dado dentro: as conversas do atendimento, o banner
de chamado urgente e as filas/menu do bot. O `demo-dados.mjs` cria esse conteúdo,
com as conversas seguindo o fluxo real do bot (problema → confirmação →
número do menu), e depois o remove por lista exata de identificadores.

```bash
cd docs/manual
DATABASE_URL="postgresql://plane:plane@10.1.2.12:5432/plane" bun demo-dados.mjs criar
# … capturar as telas …
DATABASE_URL="postgresql://plane:plane@10.1.2.12:5432/plane" bun demo-dados.mjs apagar
```

> Os telefones fictícios usam DDD 99 (`5599900…`) porque o prefixo `5567999`
> colide com centenas de contatos reais migrados do SAC — e a remoção é por lista
> de ids, nunca por prefixo.

## Ao mexer em `packages/*`

O build do `web` consome o **`dist/` dos pacotes `@plane/*`**, não o `src/`.
Alterou `packages/constants` e a tela continua igual? Falta
`pnpm --filter @plane/constants build` antes do `pnpm --filter web build`.

## Ao alterar a interface

Se uma tela mudar de layout, refaça a captura correspondente e atualize o
trecho do `manual.md` que a descreve — o manual é escrito em cima do que a
imagem mostra.
