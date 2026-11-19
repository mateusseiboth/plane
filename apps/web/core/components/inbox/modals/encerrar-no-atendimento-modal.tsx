import { useState } from "react";
import { Button } from "@plane/propel/button";
import type { TIssue } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { isCommentEmpty } from "@plane/utils";
import { EditorDeResposta } from "@/components/portal/editor-de-resposta";
import { formatNumeroNoSistema } from "@/helpers/numero-no-sistema.helper";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  data: Partial<TIssue>;
  isOpen: boolean;
  onClose: () => void;
  /** Encerra com a resposta (HTML); a recusa do servidor volta como erro e aparece abaixo do editor. */
  onSubmit: (respostaHtml: string) => Promise<void>;
};

type RecusaDoServidor = { detail?: string; errors?: { path: string; message: string }[] } | undefined;

const readErro = (erro: RecusaDoServidor): string =>
  erro?.errors?.find((e) => e.path === "resposta_html")?.message ?? erro?.detail ?? "Não foi possível encerrar.";

/** Encerrar no atendimento: resolveu sem virar chamado. A resposta vai para quem pediu. */
export function EncerrarNoAtendimentoModal(props: Props) {
  const { data, isOpen, onClose, onSubmit } = props;
  const { getProjectById } = useProject();
  const sistema = data.project_id ? getProjectById(data.project_id) : undefined;
  const [html, setHtml] = useState("<p></p>");
  const [erro, setErro] = useState<string>();
  const [isEnviando, setIsEnviando] = useState(false);

  const handleClose = () => {
    setErro(undefined);
    onClose();
  };

  const handleSubmit = async () => {
    setIsEnviando(true);
    setErro(undefined);
    try {
      await onSubmit(html);
    } catch (e) {
      setErro(readErro(e as RecusaDoServidor));
    } finally {
      setIsEnviando(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="space-y-3 p-5">
        <h3 className="text-16 font-medium">Encerrar no atendimento</h3>
        <p className="text-13 text-secondary">
          <span className="font-medium text-primary">{formatNumeroNoSistema(sistema, data.sequence_id)}</span> fica
          resolvida sem virar chamado. Quem pediu recebe a resposta.
        </p>
        <EditorDeResposta id={`encerrar-${data.id ?? ""}`} onChange={setHtml} />
        {erro && <span className="block text-11 text-danger-primary">{erro}</span>}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t-[0.5px] border-subtle px-5 py-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={handleClose}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          onClick={() => void handleSubmit()}
          loading={isEnviando}
          disabled={isEnviando || isCommentEmpty(html)}
        >
          {isEnviando ? "Encerrando" : "Encerrar e responder"}
        </Button>
      </div>
    </ModalCore>
  );
}
