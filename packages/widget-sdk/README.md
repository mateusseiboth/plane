# @mateusseiboth/widgets-aviao

SDK dos widgets da página inicial: hooks React (`useWorkerItems`, `useIntakes`,
`useStats`, `useUsers`, `useEntities`...), APIs de dados, armazenamento local,
avisos, interface e o contrato com a plataforma (permissões, limites, ciclo de
vida, eventos e erros). Cada chamada de dados exige a permissão declarada no
`manifest.json` do widget.

## Instalar

O pacote **não está no npm**. Cada instância serve o SDK e um projeto de exemplo:

```bash
npm install https://<sua-instância>/sdk/widgets-aviao.tgz          # a última versão
npm install https://<sua-instância>/sdk/widgets-aviao-1.0.0.tgz    # versão fixa
```

- `https://<sua-instância>/sdk/widget-exemplo.zip`: projeto Vite mínimo que compila
  e vira um widget instalável (com o SDK em `vendor/`).
- A referência completa fica em `/<espaço>/developers/widgets`, com os comandos já
  montados para a instância aberta.

Pelo repositório: o npm não instala uma subpasta de monorepo direto do git
(`npm install git+ssh://…` instalaria a raiz). Clone, rode `npm install && npm run build`
nesta pasta e instale `dist/publico/widgets-aviao.tgz`.

## Build

```bash
pnpm --filter @mateusseiboth/widgets-aviao build
```

1. `vite build`: `dist/index.mjs` e `dist/index.cjs` (React fica de fora).
2. `tsc --emitDeclarationOnly`: os `.d.ts` em `dist/`.
3. `scripts/gerar-referencia.ts`: `referencia.json`, a referência lida do código
   pelo compilador TypeScript. Descrições, parâmetros, retornos, exemplos (`@example`)
   e permissões (`@permission`) saem do JSDoc; manifesto, permissões, ciclo de vida,
   eventos, erros e limites, de `src/contrato.ts`.
4. `scripts/empacotar.ts`: `dist/publico/widgets-aviao-<versão>.tgz`,
   `dist/publico/widgets-aviao.tgz` (formato do `npm pack`, com o `publishConfig`
   aplicado) e `dist/publico/widget-exemplo.zip` (a pasta `exemplo/` com o tarball).

O build do web (`apps/web/vite.config.ts`) copia `dist/publico/` para `public/sdk/`,
que vira `build/client/sdk/`. Sem o SDK empacotado, o build do web falha.

## Regras para mexer no SDK

- Todo export público precisa de JSDoc, e todo hook e método de API de `@param`,
  `@returns` e `@example`. O teste `tests/referencia.test.ts` reprova export fora da
  referência, item sem descrição e `referencia.json` velho: rode `pnpm run referencia`
  (ou o build) e versione o JSON.
- Permissões e limites de `src/contrato.ts` espelham a validação do api-ts; o teste
  `apps/api-ts/tests/unit/widget-contrato-do-sdk.test.ts` confere os dois lados.
- O widget recebe `react`, `react/jsx-runtime` e este SDK da plataforma
  (`apps/web/core/lib/plugin-module-runtime.ts`): o bundle do widget deve deixá-los
  como `external`.

```bash
bun test                  # referência, empacotador, workspace_slug
./node_modules/.bin/tsc --noEmit
```
