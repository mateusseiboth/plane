"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useParams } from "next/navigation";
import type { EditorRefApi } from "@plane/editor";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
// components
import { ComparacaoDeMelhoria } from "@/components/ia/comparacao-de-melhoria";
// hooks
import { useMelhoriaDeTexto } from "@/hooks/use-melhoria-de-texto";
// services
import type { TAlvoDaMelhoria, TContextoDaMelhoria } from "@/services/ai.service";
import { propostaIdentica, semProposta } from "@/services/ai.service";

/** O contexto que a tela manda junto; o servidor completa pelo banco. */
export type AiContext = TContextoDaMelhoria;

type Props = {
  editorRef: React.RefObject<EditorRefApi>;
  workspaceSlug?: string;
  disabled?: boolean;
  className?: string;
  /** Optional context to send to the AI for better results */
  context?: AiContext;
  /** Onde o botão está: dá ao servidor o contexto do banco e a permissão. */
  alvo?: TAlvoDaMelhoria;
};

/** O que o editor guarda quando não há nada escrito. */
const VAZIOS = new Set(["", "<p></p>"]);

/**
 * "Melhorar com IA" — pede a proposta e **abre a comparação**; não escreve nada.
 *
 * O botão substituía o texto sozinho e avisava "Texto melhorado — o conteúdo foi
 * atualizado pela IA". Em produção fez isso com a proposta idêntica ao original:
 * anunciou sucesso sem ter mudado nada, o que é pior que erro, porque mente.
 *
 * Agora há dois caminhos e os dois são do autor: "Manter o meu" não encosta no
 * editor, "Usar o da IA" é o único que escreve. Quando a IA não produz proposta,
 * o recado diz exatamente isso (Parte 3 do contrato em
 * `.claude/CONTRATO_IA_REQUISITOS.md`).
 */
export function AiImproveButton({ editorRef, workspaceSlug: propSlug, disabled, className, context, alvo }: Props) {
  const [comparando, setComparando] = useState(false);
  const { workspaceSlug: paramSlug } = useParams();
  const slug = propSlug ?? paramSlug?.toString() ?? "";
  const { melhoria, melhorando, pedir, descartar } = useMelhoriaDeTexto({
    workspaceSlug: slug,
    contexto: context,
    alvo,
  });

  const handleImprove = async () => {
    const editor = editorRef.current;
    if (!editor || melhorando || disabled) return;
    const html = editor.getDocument().html ?? "";
    if (VAZIOS.has(html.trim())) {
      setToast({ type: TOAST_TYPE.INFO, title: "Sem texto", message: "Escreva algo antes de melhorar." });
      return;
    }
    descartar();
    try {
      const proposta = await pedir(html);
      // O servidor sabe se a IA calou ou se devolveu o texto igual; quando ele
      // explica, a explicação dele vale mais que a nossa frase de reserva.
      if (!proposta || semProposta(proposta)) {
        setToast({
          type: TOAST_TYPE.INFO,
          title: "Sem proposta",
          message: proposta?.motivo ?? "A IA não conseguiu melhorar este texto. Seu texto continua como está.",
        });
        return;
      }
      if (propostaIdentica(proposta)) {
        setToast({
          type: TOAST_TYPE.INFO,
          title: "Nada mudou",
          message: "A IA devolveu o mesmo texto que você escreveu.",
        });
        return;
      }
      setComparando(true);
    } catch (err: unknown) {
      const detalhe = (err as { detail?: string } | undefined)?.detail;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Erro na IA",
        message:
          detalhe ?? "Não foi possível conectar ao provedor de IA. Configure em Configurações → Provedores de IA.",
      });
    }
  };

  const manterOMeu = () => setComparando(false);

  const usarODaIa = (proposta: string) => {
    editorRef.current?.setEditorValue(proposta, true);
    setComparando(false);
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "Proposta aplicada",
      message: "O texto da IA substituiu o seu no editor.",
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleImprove}
        disabled={melhorando || disabled}
        title="Melhorar com IA (compara o seu texto com a proposta antes de trocar)"
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-2 py-1 text-12 font-medium transition-colors",
          "hover:border-accent-primary border border-subtle text-secondary hover:text-accent-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <Sparkles className={cn("h-3.5 w-3.5", melhorando && "animate-pulse")} />
        {melhorando ? "Melhorando..." : "Melhorar com IA"}
      </button>
      <ComparacaoDeMelhoria aberta={comparando} melhoria={melhoria} aoManter={manterOMeu} aoAplicar={usarODaIa} />
    </>
  );
}
