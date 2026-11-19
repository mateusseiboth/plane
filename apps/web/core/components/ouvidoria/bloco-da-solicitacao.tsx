import { useState } from "react";
import Link from "next/link";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { botaoSecundario } from "@/components/ouvidoria/comum";
import { formatDataHora } from "@/components/ouvidoria/helpers";
import { readBlocoDaSolicitacao, type TSolicitacaoDaOuvidoria } from "@/components/ouvidoria/solicitacao-da-ouvidoria";
import { useAtendentes } from "@/hooks/use-ouvidoria";
import { useSistemasParaSolicitacao } from "@/hooks/use-sistemas-para-solicitacao";
import type { TNovaSolicitacaoDaOuvidoria, TOuvidoria } from "@/services/ouvidoria.service";

type RecusaDoServidor = { detail?: string; errors?: { path: string; message: string }[] } | undefined;

type TPropsDoModal = {
  slug: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (dados: TNovaSolicitacaoDaOuvidoria) => Promise<void>;
};

/** Escolhe o sistema e o atendente; o relato e a entidade vêm da ouvidoria. */
function ModalDeCriarSolicitacao({ slug, isOpen, onClose, onSubmit }: TPropsDoModal) {
  const { data: sistemas } = useSistemasParaSolicitacao(slug, isOpen);
  const { data: atendentes } = useAtendentes(slug, isOpen);
  const [projectId, setProjectId] = useState("");
  const [atendenteId, setAtendenteId] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [isEnviando, setIsEnviando] = useState(false);

  const handleSubmit = async () => {
    setIsEnviando(true);
    setErros({});
    try {
      await onSubmit({ project_id: projectId, atendente_id: atendenteId });
    } catch (e) {
      const recusa = e as RecusaDoServidor;
      setErros(Object.fromEntries((recusa?.errors ?? []).map((erro) => [erro.path, erro.message])));
      if (!recusa?.errors?.length)
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Solicitação não criada",
          message: recusa?.detail ?? "Tente de novo.",
        });
    } finally {
      setIsEnviando(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="space-y-3 p-5">
        <h3 className="text-16 font-medium">Criar solicitação</h3>
        <p className="text-13 text-secondary">O relato e a entidade vêm da ouvidoria. O atendente recebe no sino.</p>
        <div>
          <SelectPesquisavel
            label="Sistema"
            value={projectId}
            onChange={setProjectId}
            opcoes={sistemas.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="Selecione o sistema"
          />
          {erros.project_id && <span className="mt-1 block text-11 text-danger-primary">{erros.project_id}</span>}
        </div>
        <div>
          <SelectPesquisavel
            label="Atendente"
            value={atendenteId}
            onChange={setAtendenteId}
            opcoes={atendentes.map((a) => ({ value: a.id, label: a.display_name }))}
            placeholder="Selecione quem vai atender"
          />
          {erros.atendente_id && <span className="mt-1 block text-11 text-danger-primary">{erros.atendente_id}</span>}
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t-[0.5px] border-subtle px-5 py-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          onClick={() => void handleSubmit()}
          loading={isEnviando}
          disabled={isEnviando || !projectId || !atendenteId}
        >
          {isEnviando ? "Criando" : "Criar solicitação"}
        </Button>
      </div>
    </ModalCore>
  );
}

function ProcessoDaSolicitacao({ slug, solicitacao }: { slug: string; solicitacao: TSolicitacaoDaOuvidoria }) {
  return (
    <div className="mt-3 rounded-md border border-subtle bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/${slug}/global-intake/?projectId=${solicitacao.project_id}&inboxIssueId=${solicitacao.issue_id}&currentTab=open`}
          className="text-13 font-medium text-accent-primary hover:underline"
        >
          {solicitacao.numero}
        </Link>
        <span className="text-12 font-medium text-secondary">
          {solicitacao.situacao}
          {solicitacao.etapa ? ` · ${solicitacao.etapa}` : ""}
        </span>
      </div>
      <ol className="mt-2 space-y-1">
        {solicitacao.processo.map((passo, i) => (
          <li key={`${passo.em}-${i}`} className="text-12 text-secondary">
            {formatDataHora(passo.em)} · {passo.evento}
          </li>
        ))}
      </ol>
    </div>
  );
}

type TProps = {
  slug: string;
  item: TOuvidoria;
  canCriar: boolean;
  onCriar: (id: string, dados: TNovaSolicitacaoDaOuvidoria) => Promise<unknown>;
};

/** A solicitação da ouvidoria: o processo, ou o botão de criar para quem pode. */
export function BlocoDaSolicitacao({ slug, item, canCriar, onCriar }: TProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const bloco = readBlocoDaSolicitacao({ solicitacao: item.solicitacao, canCriar });
  if (bloco === "nada") return null;
  if (bloco === "processo" && item.solicitacao)
    return <ProcessoDaSolicitacao slug={slug} solicitacao={item.solicitacao} />;

  return (
    <div className="mt-3">
      <button type="button" className={botaoSecundario} onClick={() => setIsModalOpen(true)}>
        Criar solicitação
      </button>
      <ModalDeCriarSolicitacao
        slug={slug}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={async (dados) => {
          await onCriar(item.id, dados);
          setIsModalOpen(false);
          setToast({ type: TOAST_TYPE.SUCCESS, title: "Solicitação criada", message: "O atendente foi avisado." });
        }}
      />
    </div>
  );
}
