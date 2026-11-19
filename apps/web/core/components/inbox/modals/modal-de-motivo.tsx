import { useState } from "react";
import { Button } from "@plane/propel/button";
import type { TButtonVariant } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore, TextArea } from "@plane/ui";
import type { RegrasDoMotivo } from "@/components/inbox/modals/regras-do-motivo";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Envia o motivo; a recusa do servidor volta como erro e aparece no campo. */
  onSubmit: (motivo: string) => Promise<void>;
  regras: RegrasDoMotivo;
  titulo: string;
  descricao: React.ReactNode;
  rotulo: string;
  placeholder: string;
  botao: { texto: string; enviando: string; variante: TButtonVariant };
};

/**
 * Decisão sobre a solicitação que exige o motivo (recusar, não atendido): o
 * motivo vira comentário e vai para quem precisa agir.
 */
export function ModalDeMotivo(props: Props) {
  const { isOpen, onClose, onSubmit, regras, titulo, descricao, rotulo, placeholder, botao } = props;
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string>();
  const [isEnviando, setIsEnviando] = useState(false);
  const pendencia = regras.findPendencia(motivo);

  const handleClose = () => {
    setMotivo("");
    setErro(undefined);
    setIsEnviando(false);
    onClose();
  };

  const handleSubmit = async () => {
    setIsEnviando(true);
    setErro(undefined);
    try {
      await onSubmit(motivo.trim());
      setMotivo("");
    } catch (e) {
      setErro(regras.readErro(e as Parameters<RegrasDoMotivo["readErro"]>[0]));
    } finally {
      setIsEnviando(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="space-y-3 p-5">
        <h3 className="text-16 font-medium">{titulo}</h3>
        <p className="text-13 text-secondary">{descricao}</p>
        <label className="block">
          <span className="mb-1 block text-12 font-medium text-secondary">{rotulo}</span>
          <TextArea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={placeholder}
            rows={4}
            hasError={Boolean(erro)}
            className="w-full"
          />
          {erro && <span className="mt-1 block text-11 text-danger-primary">{erro}</span>}
        </label>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t-[0.5px] border-subtle px-5 py-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={handleClose}>
          Cancelar
        </Button>
        <Button
          variant={botao.variante}
          onClick={() => void handleSubmit()}
          loading={isEnviando}
          disabled={Boolean(pendencia) || isEnviando}
          title={pendencia}
        >
          {isEnviando ? botao.enviando : botao.texto}
        </Button>
      </div>
    </ModalCore>
  );
}
