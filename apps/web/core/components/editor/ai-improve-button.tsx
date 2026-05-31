"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { EditorRefApi } from "@plane/editor";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import { AIService } from "@/services/ai.service";
import { useParams } from "next/navigation";

const aiService = new AIService();

export type AiContext = {
  /** Work item / issue title */
  issue_title?: string;
  /** Project / system name */
  project_name?: string;
  /**
   * Previous comments on the work item, stripped of HTML, most recent first.
   * The backend limits these to stay within the token budget.
   */
  previous_comments?: string[];
};

type Props = {
  editorRef: React.RefObject<EditorRefApi>;
  workspaceSlug?: string;
  disabled?: boolean;
  className?: string;
  /** Optional context to send to the AI for better results */
  context?: AiContext;
};

/**
 * "Melhorar com IA" button — sends current editor content plus rich context
 * (issue title, project name, previous comments) to the AI provider.
 * The backend limits token usage to ~4 k.
 */
export function AiImproveButton({ editorRef, workspaceSlug: propSlug, disabled, className, context }: Props) {
  const [loading, setLoading] = useState(false);
  const { workspaceSlug: paramSlug } = useParams();
  const slug = propSlug ?? paramSlug?.toString() ?? "";

  const handleImprove = async () => {
    if (!editorRef.current || loading || disabled) return;
    const html = editorRef.current.getDocument().html;
    if (!html || html === "<p></p>") {
      setToast({ type: TOAST_TYPE.INFO, title: "Sem texto", message: "Escreva algo antes de melhorar." });
      return;
    }
    setLoading(true);
    try {
      const { response } = await aiService.improveText(slug, html, context);
      editorRef.current.setEditorValue(response, true);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Texto melhorado", message: "O conteúdo foi atualizado pela IA." });
    } catch (err: any) {
      const msg = err?.detail ?? "Não foi possível conectar ao provedor de IA. Configure em Configurações → Provedores de IA.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro na IA", message: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleImprove}
      disabled={loading || disabled}
      title="Melhorar com IA (usa título, projeto e comentários como contexto)"
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-1 text-12 font-medium transition-colors",
        "border border-subtle text-secondary hover:border-accent-primary hover:text-accent-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      <Sparkles className={cn("h-3.5 w-3.5", loading && "animate-pulse")} />
      {loading ? "Melhorando..." : "Melhorar com IA"}
    </button>
  );
}
