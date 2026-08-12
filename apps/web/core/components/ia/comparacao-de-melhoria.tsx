/**
 * A comparação lado a lado do "Melhorar com IA" — Parte 3 do contrato em
 * `.claude/CONTRATO_IA_REQUISITOS.md`.
 *
 * O botão substituía o texto sozinho e anunciava "conteúdo atualizado". Em
 * produção ele anunciou isso com a proposta byte a byte igual ao original:
 * mentiu. Agora **a IA propõe e o autor decide** — nada entra no editor sem o
 * clique em "Usar o da IA".
 *
 * A ordem da janela é a de quem vai escolher: a nota antes/depois como
 * referência rápida, os dois textos lado a lado com as diferenças realçadas, e
 * no rodapé — colados nos botões — os avisos sobre o que a IA pode ter perdido
 * ou inventado, que é a informação que faz a escolha valer alguma coisa.
 */
import { useMemo } from "react";
import { Sparkles, X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// components
import { AceitacaoAntesEDepois } from "@/components/ia/aceitacao-antes-e-depois";
import { AvisosDaMelhoria } from "@/components/ia/avisos-da-melhoria";
import { TextoComDiferencas } from "@/components/ia/texto-com-diferencas";
// helpers
import { diferencaEntreHtml, temDiferenca } from "@/helpers/diferenca-de-texto.helper";
// services
import type { TMelhoriaDeTexto } from "@/services/ai.service";

type TComparacaoDeMelhoriaProps = {
  aberta: boolean;
  melhoria: TMelhoriaDeTexto | null;
  /** "Manter o meu": fecha e não encosta no editor. */
  aoManter: () => void;
  /** "Usar o da IA": o único caminho que escreve no editor. */
  aoAplicar: (proposta: string) => void;
};

type TColunaProps = {
  titulo: string;
  legenda: string;
  children: React.ReactNode;
};

const Coluna = ({ titulo, legenda, children }: TColunaProps) => (
  <section className="flex min-w-0 flex-col rounded-md border border-subtle">
    <header className="flex items-baseline justify-between gap-2 border-b border-subtle px-3 py-2">
      <h4 className="text-12 font-medium text-primary">{titulo}</h4>
      <span className="shrink-0 text-11 text-tertiary">{legenda}</span>
    </header>
    <div className="max-h-[45vh] overflow-y-auto px-3 py-2.5">{children}</div>
  </section>
);

export const ComparacaoDeMelhoria = (props: TComparacaoDeMelhoriaProps) => {
  const { aberta, melhoria, aoManter, aoAplicar } = props;

  const trechos = useMemo(() => (melhoria ? diferencaEntreHtml(melhoria.original, melhoria.proposta) : []), [melhoria]);

  if (!melhoria) return null;

  // As palavras são as mesmas: a IA mexeu só na marcação (listas, negrito).
  // Vale aplicar, mas quem lê precisa saber por que as duas colunas parecem iguais.
  const soFormatacao = !temDiferenca(trechos);

  return (
    <ModalCore isOpen={aberta} handleClose={aoManter} position={EModalPosition.CENTER} width={EModalWidth.VXL}>
      {/*
        O evento do React sobe pela árvore de componentes, não pela do DOM: mesmo
        saindo num portal, um `Enter` daqui chegaria ao formulário que abrigou o
        botão — e a caixa de comentário envia o comentário no `Enter`. Escolher a
        proposta pelo teclado não pode publicar nada.
      */}
      <div role="presentation" className="flex flex-col gap-4 p-5" onKeyDown={(evento) => evento.stopPropagation()}>
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-primary" />
            <div className="min-w-0">
              <h3 className="text-base font-medium text-primary">Comparar com a proposta da IA</h3>
              <p className="text-12 text-tertiary">Nada foi alterado. Leia os dois textos e escolha qual fica.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoManter}
            aria-label="Fechar sem alterar o texto"
            className="shrink-0 rounded-sm p-1 text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
          >
            <X className="size-4" />
          </button>
        </header>

        <AceitacaoAntesEDepois aceitacao={melhoria.aceitacao} />

        <div className="grid gap-3 md:grid-cols-2">
          <Coluna titulo="O seu texto" legenda="riscado = sai">
            <TextoComDiferencas trechos={trechos} lado="saiu" />
          </Coluna>
          <Coluna titulo="Proposta da IA" legenda="verde = entra">
            <TextoComDiferencas trechos={trechos} lado="entrou" />
          </Coluna>
        </div>

        {soFormatacao && (
          <p className="text-12 text-tertiary">
            As palavras são as mesmas nos dois lados: a IA mexeu apenas na formatação.
          </p>
        )}

        <footer className="flex flex-col gap-3 border-t border-subtle pt-3 sm:flex-row sm:items-center sm:justify-between">
          <AvisosDaMelhoria avisos={melhoria.avisos} className="min-w-0 sm:max-w-xl" />
          <div className="flex shrink-0 items-center justify-end gap-2 sm:ml-auto">
            <Button variant="secondary" size="sm" onClick={aoManter}>
              Manter o meu
            </Button>
            <Button variant="primary" size="sm" onClick={() => aoAplicar(melhoria.proposta)}>
              Usar o da IA
            </Button>
          </div>
        </footer>
      </div>
    </ModalCore>
  );
};
