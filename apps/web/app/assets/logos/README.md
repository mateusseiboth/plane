# Marca — Avião

Três arquivos, cada um para um contexto. Todos usam o mesmo gradiente
(`#12315F` → `#2BA6E0`) e a mesma geometria de aeronave, então trocar de um para
outro não muda a identidade.

| Arquivo | Onde usar |
|---|---|
| `aviao-mark.svg` | Marca completa: aeronave + rota de voo (ponto de partida e arco). Telas de carregamento, login, tela de instância indisponível. |
| `aviao-icon.svg` | Só a silhueta, enquadramento justo. Favicon, sidebar, avatares — **abaixo de ~48px use esta**: os traços finos da rota viram ruído em tamanho pequeno. |
| `aviao-horizontal.svg` | Marca + assinatura "Avião". Cabeçalhos e documentos impressos. O texto usa `currentColor`, então acompanha o tema claro/escuro sem precisar de duas versões. |

## Favicons

Gerados a partir de `aviao-icon.svg` (`apps/web/app/assets/favicon/`). Para
regerar depois de alterar a marca:

```bash
for s in 16 32 180; do inkscape aviao-icon.svg -o fav-$s.png -w $s -h $s; done
inkscape aviao-icon.svg -o fav-48.png -w 48 -h 48
convert fav-16.png fav-32.png fav-48.png favicon.ico
```

> Os favicons anteriores eram cópias de 1,2 MB do PNG do logo antigo — em cada um
> dos quatro tamanhos. Os atuais vão de 645 B a 15 KB.

## Animação de carregamento

`core/components/common/plane-flight-loader.tsx` faz o avião cruzar a tela de
ponta a ponta, com rastro e rota tracejada. É usado no `HydrateFallback` do
`app/root.tsx` — a tela que aparece antes de a aplicação hidratar. As keyframes
ficam em `styles/plane-loader.css` (CSS puro, para animar já no primeiro paint) e
respeitam `prefers-reduced-motion`.

Para carregamentos embutidos (painéis, modais) continue usando `LogoSpinner`, que
mostra a marca com uma flutuação leve.
