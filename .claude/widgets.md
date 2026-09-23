# Home em grade de widgets

A página inicial é uma grade de widgets. Cada cartão (Mural, Meus chamados,
Perfil, Tarefas, Chamados por sistema, Atividade, Detalhes) é um **widget
nativo**, e os widgets do marketplace entram na mesma grade como **widgets
instalados**. Os dois têm o mesmo contrato e o mesmo tratamento: mover, ligar,
desligar e redimensionar.

## Onde está cada coisa

| O quê                                                           | Arquivo                                                                      |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Contrato do widget (`TWidgetDaHome`, `TPropsDoWidget`)          | `apps/web/core/components/home/grade/tipos.ts`                               |
| Catálogo dos nativos (a ordem é o layout padrão)                | `apps/web/core/components/home/grade/catalogo.ts`                            |
| Regras puras (junção catálogo x salvo, mover, tamanho, teclado) | `apps/web/core/components/home/grade/grade-rules.ts` (+ `.test.ts`)          |
| Grade, arrastar e soltar, anúncio para leitor de tela           | `grade/grade-de-widgets.tsx`, `grade/item-da-grade.tsx`                      |
| Modal "Gerenciar widgets"                                       | `grade/gerenciar-widgets.tsx` (aberto pelo `useHome().toggleWidgetSettings`) |
| Instalado virando entrada do catálogo                           | `grade/widget-instalado.tsx`                                                 |
| Dados (preferências + instalados, gravação otimista)            | `apps/web/core/hooks/use-grade-da-home.ts`                                   |
| API das preferências                                            | `apps/api-ts/src/modules/home/widgets.{rules,service,dao}.ts`                |

## Contrato

```ts
type TWidgetDaHome = {
  chave: string; // gravada nas preferências de cada pessoa: NÃO renomeie
  titulo: string; // nome no "Gerenciar widgets" e nos rótulos de acessibilidade
  descricao: string; // uma frase curta, sem travessão
  tamanhoPadrao: "1/3" | "1/2" | "2/3" | "1/1";
  origem: "nativo" | "instalado";
  componente: ComponentType<{ workspaceSlug; userId; chave; tamanho }>;
};
```

A altura é livre: o widget ocupa o que o conteúdo pede, e o último cartão do
widget estica até a altura da linha. O componente desenha o próprio cartão
(`CartaoDoPainel` de `home/painel/cartao.tsx`, com esqueleto e vazio próprios).
A barra de controle (alça, tamanho, ocultar) é da grade e fica por cima da borda
de cima do cartão; o widget não precisa reservar espaço para ela.

## Criar um widget nativo

1. Escreva o componente em `apps/web/core/components/home/painel/` (ou numa
   pasta própria), recebendo pelo menos `{ workspaceSlug }`. Use `CartaoDoPainel`
   para herdar o visual aprovado nos temas claro e escuro.
2. Registre uma entrada em `WIDGETS_NATIVOS` (`grade/catalogo.ts`) com chave em
   `snake_case` (a API recusa outro formato).
3. Pronto: quem nunca mexeu na home vê o widget na posição do catálogo; quem já
   organizou a sua vê o widget novo no FIM da grade, ligado e no tamanho padrão.

Remover um widget do catálogo é seguro: a preferência gravada dele é ignorada na
leitura e some no próximo salvamento.

## Widget instalado (marketplace)

Um widget enviado em `/settings/widgets` e ativado aparece para todos com a chave
`widget:<id>`, no fim da grade. O `manifest.json` pode declarar, de forma
opcional:

```json
{ "title": "Fila do suporte", "defaultSize": "1/2" }
```

- `title`: título do cartão (sem ele, vale o `name`).
- `defaultSize`: `1/3`, `1/2`, `2/3` ou `1/1` (sem ele, `1/2`). Valor fora da
  lista recusa o pacote no upload (`validateManifest`).

O componente do pacote recebe a prop `size` com o tamanho atual do cartão
(`WidgetHomeProps` no `@mateusseiboth/widgets-aviao`), para adaptar o conteúdo.
Os tipos `WidgetManifest` e `WidgetSize` também estão no SDK.

## Preferências (API)

`GET /api/workspaces/:slug/home-preferences/` e `PUT` do mesmo caminho, com
`{ widgets: [{ chave, ordem, tamanho, ligado }] }`. A tela manda sempre a lista
inteira. Gravado em `workspace_user_properties.display_filters.home_widgets`
(por pessoa e por espaço); o resto do `display_filters` (ex.: `quick_links`) é
preservado.

- Formato antigo `display_filters.widget_preferences`
  (`{ [key]: { is_enabled, sort_order } }`, maior `sort_order` primeiro) é
  convertido na leitura com `tamanho: null`; o próximo `PUT` apaga o antigo. As chaves antigas
  (`my_work_items`, `recents`...) não existem mais no catálogo, então quem as
  tinha cai no layout padrão.
- Erro de validação volta como `errors: [{ path: "widgets[0].tamanho", message }]`.
- Se a lista de instalados não carregar, a tela preserva no salvamento as
  preferências `widget:*` que não consegue mostrar (`toPreferencias(layout, orfas)`).

## Arrastar e soltar

Usa o `@atlaskit/pragmatic-drag-and-drop` que o repositório já tem (sem lib
nova). Cada item é `draggable` (pela alça) e alvo de soltura com a borda mais
próxima (`closest-edge`); um `monitorForElements` na grade decide o destino.
Teclado: com a alça em foco, setas movem uma casa entre os visíveis e Home/End
levam para as pontas. Cada movimento é anunciado numa região `aria-live`.
