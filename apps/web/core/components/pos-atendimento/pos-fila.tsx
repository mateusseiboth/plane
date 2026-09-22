/**
 * Fila do pós-atendimento (a antiga `sac_posAtendimento.php`): chamados e visitas
 * concluídos, nas abas pendente de pós, pendente de verificação e verificado.
 */
import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { BarChart3, ChevronLeft, ChevronRight, PhoneCall } from "lucide-react";
import { cn } from "@plane/utils";
import { POS_FILTROS_INICIAIS, SITUACAO_TABS, formatData, getAlvoLink } from "@/components/pos-atendimento/helpers";
import { PosAtendimentoModal } from "@/components/pos-atendimento/pos-atendimento-modal";
import { PosFiltros } from "@/components/pos-atendimento/pos-filtros";
import type { TPosFiltros, TPosFilaItem } from "@/components/pos-atendimento/types";
import { VerificarPosModal } from "@/components/pos-atendimento/verificar-modal";
import { POS_POR_PAGINA, usePosFila, usePosPermissions } from "@/hooks/use-pos-atendimento";

const CHIP = "shrink-0 rounded-full px-3 py-1 text-12 font-medium transition-colors";
const chipClass = (ativo: boolean) =>
  cn(CHIP, ativo ? "bg-accent-primary text-white" : "bg-surface-2 text-secondary hover:text-primary");

const ACAO =
  "rounded border border-subtle px-2.5 py-1 text-12 text-secondary hover:border-accent-primary hover:text-accent-primary";

const ORIGEM_LABEL: Record<TPosFilaItem["origem"], string> = { issue: "Chamado", visit: "Visita" };

const buildTitulo = (item: TPosFilaItem) => `${ORIGEM_LABEL[item.origem]} ${item.code}: ${item.title}`;

type TModal = { tipo: "registrar" | "ver"; item: TPosFilaItem } | null;

export const PosFila = observer(function PosFila({ workspaceSlug }: { workspaceSlug: string }) {
  const permissoes = usePosPermissions(workspaceSlug);
  const [filtros, setFiltros] = useState<TPosFiltros>(POS_FILTROS_INICIAIS);
  const [pagina, setPagina] = useState(0);
  const [modal, setModal] = useState<TModal>(null);
  const { data, isLoading } = usePosFila(workspaceSlug, filtros, pagina, permissoes.canUseFila);

  const itens = data?.results ?? [];
  const total = data?.total_count ?? 0;
  const totalDePaginas = Math.max(1, Math.ceil(total / POS_POR_PAGINA));

  const applyFiltro = (parcial: Partial<TPosFiltros>) => {
    setFiltros((atual) => ({ ...atual, ...parcial }));
    setPagina(0);
  };

  if (!permissoes.isLoading && !permissoes.canUseFila)
    return <p className="p-6 text-13 text-secondary">Sua função não permite ver o pós-atendimento.</p>;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Pós-atendimento</h1>
          <p className="text-13 text-secondary">{total} registro(s)</p>
        </div>
        {permissoes.canReport && (
          <Link
            href={`/${workspaceSlug}/pos-atendimento/satisfacao`}
            className="inline-flex items-center gap-1.5 rounded border border-subtle px-3 py-2 text-13 text-secondary hover:text-primary"
          >
            <BarChart3 className="h-4 w-4" />
            Relatório de satisfação
          </Link>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-subtle px-6 py-3">
        {SITUACAO_TABS.map((aba) => (
          <button
            key={aba.key}
            type="button"
            onClick={() => applyFiltro({ situacao: aba.key })}
            className={chipClass(filtros.situacao === aba.key)}
          >
            {aba.label}
          </button>
        ))}
      </div>

      <PosFiltros workspaceSlug={workspaceSlug} filtros={filtros} onChange={applyFiltro} />

      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="text-sm p-6 text-secondary">Carregando...</div>}
        {!isLoading && itens.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-secondary">
            <PhoneCall className="h-12 w-12 opacity-50" />
            <p className="text-sm">Nada nesta aba.</p>
          </div>
        )}
        {!isLoading && itens.length > 0 && (
          <table className="w-full text-13">
            <thead className="bg-surface-2 text-left text-12 text-secondary">
              <tr>
                <th className="px-6 py-2 font-medium">Número</th>
                <th className="px-3 py-2 font-medium">Entidade</th>
                <th className="px-3 py-2 font-medium">Título</th>
                <th className="px-3 py-2 font-medium">Responsável</th>
                <th className="px-3 py-2 font-medium">Sistema</th>
                <th className="px-3 py-2 font-medium">Concluído em</th>
                <th className="px-3 py-2 font-medium">Nota</th>
                <th className="px-6 py-2" />
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={`${item.origem}-${item.id}`} className="border-b border-subtle hover:bg-surface-2">
                  <td className="px-6 py-2 whitespace-nowrap">
                    <Link href={getAlvoLink(workspaceSlug, item)} className="font-medium hover:underline">
                      {item.code}
                    </Link>
                    <span className="ml-1 text-11 text-tertiary">{ORIGEM_LABEL[item.origem]}</span>
                    {item.ticket_number && <p className="text-11 text-tertiary">{item.ticket_number}</p>}
                  </td>
                  <td className="px-3 py-2">{item.entity?.name ?? ""}</td>
                  <td className="max-w-xs truncate px-3 py-2" title={item.title}>
                    {item.title}
                  </td>
                  <td className="px-3 py-2">{item.responsaveis.map((r) => r.display_name).join(", ")}</td>
                  <td className="px-3 py-2">{item.sistemas.map((s) => s.name).join(", ")}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatData(item.concluded_at)}</td>
                  <td className="px-3 py-2">{item.pos?.classificacao_label ?? ""}</td>
                  <td className="px-6 py-2 text-right whitespace-nowrap">
                    {!item.pos && permissoes.canRecord && (
                      <button type="button" className={ACAO} onClick={() => setModal({ tipo: "registrar", item })}>
                        Fazer pós-atendimento
                      </button>
                    )}
                    {item.pos && (
                      <button type="button" className={ACAO} onClick={() => setModal({ tipo: "ver", item })}>
                        {item.situacao === "to_verify" && permissoes.canVerify ? "Verificar" : "Ver"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-subtle px-6 py-2 text-12 text-secondary">
        <span>
          Página {pagina + 1} de {totalDePaginas}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={!data?.prev_page_results}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            className="rounded border border-subtle p-1.5 disabled:opacity-40"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!data?.next_page_results}
            onClick={() => setPagina((p) => p + 1)}
            className="rounded border border-subtle p-1.5 disabled:opacity-40"
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {modal?.tipo === "registrar" && (
        <PosAtendimentoModal
          workspaceSlug={workspaceSlug}
          origem={modal.item.origem}
          alvoId={modal.item.id}
          titulo={buildTitulo(modal.item)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === "ver" && modal.item.pos && (
        <VerificarPosModal
          workspaceSlug={workspaceSlug}
          pos={modal.item.pos}
          titulo={buildTitulo(modal.item)}
          canVerify={permissoes.canVerify}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
});
