/**
 * Modal do "Alterar sistema": escolhe o destino, confirma e leva a pessoa ao
 * chamado novo. O erro do servidor no campo do destino volta para baixo do
 * seletor, além do aviso.
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSearchSelect, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { AlterarSistemaService } from "@/services/issue/alterar-sistema.service";
import {
  buildDicaDoChamadoMovido,
  buildLinkDoChamadoMovido,
  listSistemasDeDestino,
} from "@/components/issues/issue-detail/alterar-sistema/alterar-sistema.rules";

const alterarSistemaService = new AlterarSistemaService();

const CAMPO_DO_DESTINO = "project_id_destino";

type TErroDaApi = { detail?: string; errors?: { path: string; message: string }[] } | undefined;

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  isOpen: boolean;
  onClose: () => void;
};

export const AlterarSistemaModal = observer(function AlterarSistemaModal(props: Props) {
  const { workspaceSlug, projectId, issueId, isOpen, onClose } = props;
  const router = useAppRouter();
  const { joinedProjectIds, getProjectById } = useProject();
  const [destinoId, setDestinoId] = useState<string | undefined>();
  const [erroDoDestino, setErroDoDestino] = useState<string | null>(null);
  const [isEnviando, setIsEnviando] = useState(false);

  const sistemas = listSistemasDeDestino(
    joinedProjectIds.map((id) => getProjectById(id)),
    projectId
  );
  const options = sistemas.map((s) => ({
    value: s.id,
    query: `${s.name} ${s.identifier}`,
    content: <span className="truncate">{`${s.name} (${s.identifier})`}</span>,
  }));
  const destino = destinoId ? getProjectById(destinoId) : undefined;

  const handleClose = () => {
    setDestinoId(undefined);
    setErroDoDestino(null);
    onClose();
  };

  const onError = (erro: TErroDaApi) => {
    const doCampo = erro?.errors?.find((e) => e.path === CAMPO_DO_DESTINO);
    setErroDoDestino(doCampo?.message ?? null);
    setToast({
      type: TOAST_TYPE.ERROR,
      title: "Não foi possível alterar o sistema",
      message: erro?.detail ?? "Tente de novo.",
    });
  };

  const onSubmit = async () => {
    if (!destinoId) {
      setErroDoDestino("Escolha o sistema de destino.");
      return;
    }
    setIsEnviando(true);
    try {
      const novo = await alterarSistemaService.alterarSistema(workspaceSlug, projectId, issueId, destinoId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: buildDicaDoChamadoMovido("para", novo) });
      handleClose();
      router.push(buildLinkDoChamadoMovido(workspaceSlug, novo));
    } catch (erro) {
      onError(erro as TErroDaApi);
    } finally {
      setIsEnviando(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="space-y-4 px-5 py-4">
        <h3 className="text-18 font-medium">Alterar sistema</h3>
        <div className="space-y-1">
          <CustomSearchSelect
            value={destinoId}
            label={destino ? `${destino.name} (${destino.identifier})` : "Escolha o sistema de destino"}
            options={options}
            onChange={(valor: string) => {
              setDestinoId(valor);
              setErroDoDestino(null);
            }}
            buttonClassName={cn("w-full border border-subtle-1", { "border-danger-strong": erroDoDestino })}
            className="w-full rounded-md"
            optionsClassName="w-full"
            input
          />
          {erroDoDestino && <p className="text-12 text-danger-primary">{erroDoDestino}</p>}
        </div>
        <p className="text-13 text-secondary">
          Este chamado vai para Cancelados e um novo, com tudo o que ele tem, é aberto no sistema escolhido.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={handleClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="lg" onClick={onSubmit} loading={isEnviando} disabled={isEnviando}>
            Alterar sistema
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
