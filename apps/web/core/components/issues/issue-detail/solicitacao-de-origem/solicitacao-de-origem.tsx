/**
 * Linha "Solicitação" das propriedades do chamado: só aparece quando o chamado
 * nasceu de uma solicitação. O clique abre logo abaixo os dados de quando ela
 * foi pedida, com o texto original.
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { ChevronDown, ChevronRight, Inbox } from "lucide-react";
import type { TSolicitacaoDoChamado } from "@plane/types";
import { renderFormattedDateTime } from "@plane/utils";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useWorkspace } from "@/hooks/store/use-workspace";
import {
  ROTULO_DA_ORIGEM,
  getAvisoDoTextoOriginal,
  getRotuloDaPrioridade,
} from "@/components/issues/issue-detail/solicitacao-de-origem/solicitacao-de-origem.rules";

type Props = {
  workspaceSlug: string;
  projectId: string;
  solicitacao: TSolicitacaoDoChamado;
};

function DadoDaSolicitacao({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  if (!valor) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-tertiary">{rotulo}</dt>
      <dd className="min-w-0 break-words text-primary">{valor}</dd>
    </div>
  );
}

export const SolicitacaoDeOrigem = observer(function SolicitacaoDeOrigem(props: Props) {
  const { workspaceSlug, projectId, solicitacao } = props;
  const [isAberta, setIsAberta] = useState(false);
  const { currentWorkspace } = useWorkspace();
  const aviso = getAvisoDoTextoOriginal(solicitacao);
  const Seta = isAberta ? ChevronDown : ChevronRight;

  return (
    <div className="space-y-2">
      <SidebarPropertyListItem icon={Inbox} label="Solicitação">
        <button
          type="button"
          className="flex h-7.5 items-center gap-1 rounded-sm px-2 text-body-xs-regular hover:bg-layer-1"
          onClick={() => setIsAberta((aberta) => !aberta)}
          aria-expanded={isAberta}
        >
          <Seta className="size-3.5 shrink-0" />
          {isAberta ? "Ocultar o pedido original" : "Ver o pedido original"}
        </button>
      </SidebarPropertyListItem>

      {isAberta && (
        <div className="space-y-3 rounded-md border border-subtle-1 bg-layer-1 p-3 text-body-xs-regular whitespace-normal">
          <dl className="space-y-1.5">
            <DadoDaSolicitacao rotulo="Aberta por" valor={solicitacao.aberta_por} />
            <DadoDaSolicitacao rotulo="Aberta em" valor={renderFormattedDateTime(solicitacao.aberta_em)} />
            <DadoDaSolicitacao rotulo="Origem" valor={ROTULO_DA_ORIGEM[solicitacao.origem]} />
            <DadoDaSolicitacao rotulo="Entidade" valor={solicitacao.entidade} />
            <DadoDaSolicitacao rotulo="Módulo" valor={solicitacao.modulo} />
            <DadoDaSolicitacao rotulo="Prioridade pedida" valor={getRotuloDaPrioridade(solicitacao.prioridade)} />
          </dl>
          <div className="space-y-1">
            <p className="font-medium text-primary">{solicitacao.titulo}</p>
            {aviso && <p className="text-tertiary">{aviso}</p>}
            <RichTextEditor
              key={`solicitacao-${solicitacao.id}`}
              editable={false}
              containerClassName="p-0 !pl-0 border-none"
              editorClassName="pl-0"
              id={`solicitacao-${solicitacao.id}`}
              initialValue={solicitacao.descricao_html}
              projectId={projectId}
              workspaceId={currentWorkspace?.id ?? ""}
              workspaceSlug={workspaceSlug}
            />
          </div>
        </div>
      )}
    </div>
  );
});
