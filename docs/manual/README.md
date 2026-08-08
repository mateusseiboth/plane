# Manual do usuário

- **`manual.md`** — a fonte. Edite aqui.
- **`manual-aviao.pdf`** — o entregável, gerado a partir do `.md`.
- **`estilo.css`** — tipografia e quebras de página do PDF.
- **`gerar-pdf.sh`** — pipeline `pandoc → HTML → Chrome headless → PDF`.
- **`img/`** — capturas de tela (42), tiradas do ambiente 10.1.2.12.
- **`capturas.json`** — inventário das capturas + o que a varredura encontrou
  (erros de JS, rotas 404 e frases em inglês na interface).

## Regerar o PDF

```bash
cd docs/manual && ./gerar-pdf.sh
```

Requer `pandoc` e `google-chrome`/`chromium`. O `\newpage` do Markdown vira uma
quebra de página no PDF.

## Regerar as capturas

`capturar.mjs` (Playwright) faz o trabalho:

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
BASE=http://10.1.2.12 OUT="$PWD/docs/manual/img" node docs/manual/capturar.mjs
```

## Ao alterar a interface

Se uma tela mudar de layout, refaça a captura correspondente e atualize o
trecho do `manual.md` que a descreve — o manual é escrito em cima do que a
imagem mostra.
