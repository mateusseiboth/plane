/**
 * Relatório de satisfação do pós-atendimento: distribuição das notas por sistema,
 * entidade e período, lista por nota e impressão. Exige `report.view`.
 */
import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@plane/utils";
import { PrintButton } from "@/components/print";
import { POS_FILTROS_INICIAIS, formatData, getAlvoLink } from "@/components/pos-atendimento/helpers";
import { PosFiltros } from "@/components/pos-atendimento/pos-filtros";
import { SatisfacaoPrintDocument } from "@/components/pos-atendimento/satisfacao-print-document";
import type { TPosFiltros, TSatisfacao } from "@/components/pos-atendimento/types";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { usePosPermissions, useSatisfacao, useSatisfacaoItens } from "@/hooks/use-pos-atendimento";

/** Nota escolhida para a lista; `none` é o histórico que ficou sem nota. */
const NOTAS_DA_LISTA = [
  { value: "3", label: "Ótimo" },
  { value: "2", label: "Bom" },
  { value: "1", label: "Ruim" },
  { value: "none", label: "Sem nota" },
];

const BARRA_CORES: Record<string, string> = { "3": "bg-green-500", "2": "bg-yellow-500", "1": "bg-red-500" };

const CHIP = "shrink-0 rounded-full px-3 py-1 text-12 font-medium transition-colors";
const chipClass = (ativo: boolean) =>
  cn(CHIP, ativo ? "bg-accent-primary text-white" : "bg-surface-2 text-secondary hover:text-primary");

// Data pura ao meio-dia: meia-noite UTC vira o dia anterior no navegador a oeste.
const formatDataPura = (valor: string, vazio: string) => (valor ? formatData(`${valor}T12:00:00`) : vazio);

const describePeriodo = (filtros: TPosFiltros) => {
  if (!filtros.desde && !filtros.ate) return "Todo o período";
  return `${formatDataPura(filtros.desde, "início")} a ${formatDataPura(filtros.ate, "hoje")}`;
};

function Distribuicao({ titulo, faixas }: { titulo: string; faixas: TSatisfacao["classificacao"] }) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-1 p-4">
      <h3 className="mb-3 text-13 font-semibold">{titulo}</h3>
      <div className="space-y-2">
        {faixas.map((f) => (
          <div key={f.label}>
            <div className="flex justify-between text-12">
              <span>{f.label}</span>
              <span className="text-secondary">
                {f.total} ({f.percentual}%)
              </span>
            </div>
            <div className="mt-1 h-2 rounded bg-surface-2">
              <div
                className={cn("h-2 rounded", BARRA_CORES[String(f.codigo)] ?? "bg-accent-primary")}
                style={{ width: `${f.percentual}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Grupos({ titulo, grupos }: { titulo: string; grupos: TSatisfacao["por_sistema"] }) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-1 p-4">
      <h3 className="mb-3 text-13 font-semibold">{titulo}</h3>
      <table className="w-full text-12">
        <thead className="text-left text-secondary">
          <tr>
            <th className="py-1 font-medium">Nome</th>
            <th className="py-1 font-medium">Ótimo</th>
            <th className="py-1 font-medium">Bom</th>
            <th className="py-1 font-medium">Ruim</th>
            <th className="py-1 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={g.id ?? g.name} className="border-t border-subtle">
              <td className="py-1">{g.name}</td>
              <td className="py-1">{g.notas["3"] ?? 0}</td>
              <td className="py-1">{g.notas["2"] ?? 0}</td>
              <td className="py-1">{g.notas["1"] ?? 0}</td>
              <td className="py-1">{g.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const SatisfacaoRelatorio = observer(function SatisfacaoRelatorio({ workspaceSlug }: { workspaceSlug: string }) {
  const { currentWorkspace } = useWorkspace();
  const { canReport, isLoading: carregandoPermissoes } = usePosPermissions(workspaceSlug);
  const [filtros, setFiltros] = useState<TPosFiltros>(POS_FILTROS_INICIAIS);
  const [nota, setNota] = useState("1");
  const { data, isLoading } = useSatisfacao(workspaceSlug, filtros, canReport);
  const { data: itens } = useSatisfacaoItens(workspaceSlug, filtros, nota, canReport);

  if (!carregandoPermissoes && !canReport)
    return <p className="p-6 text-13 text-secondary">Sua função não permite ver relatórios.</p>;

  const notaLabel = NOTAS_DA_LISTA.find((n) => n.value === nota)?.label ?? "";
  const lista = itens?.results ?? [];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
        <div className="flex items-start gap-3">
          <Link
            href={`/${workspaceSlug}/pos-atendimento`}
            className="mt-0.5 rounded border border-subtle p-2 text-secondary hover:text-primary"
            aria-label="Voltar ao pós-atendimento"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Relatório de satisfação</h1>
            <p className="text-13 text-secondary">
              {data?.total ?? 0} pós-atendimento(s), {describePeriodo(filtros)}
            </p>
          </div>
        </div>
        <PrintButton
          documentTitle="Relatório de satisfação"
          auditEntity="pos_atendimento"
          auditEntityId={currentWorkspace?.id ?? ""}
          auditMetadata={{ escopo: "relatorio_satisfacao" }}
          appearance="label"
        />
      </div>

      <PosFiltros
        workspaceSlug={workspaceSlug}
        filtros={filtros}
        onChange={(p) => setFiltros((f) => ({ ...f, ...p }))}
        hasResponsavel={false}
      />

      {data && (
        <SatisfacaoPrintDocument
          satisfacao={data}
          itens={lista}
          subtitle={currentWorkspace?.name}
          periodo={describePeriodo(filtros)}
          notaLabel={notaLabel}
        />
      )}

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {isLoading && <p className="text-13 text-secondary">Carregando...</p>}
        {data && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Distribuicao titulo="Classificação do atendimento" faixas={data.classificacao} />
              <Distribuicao titulo="Atendeu a expectativa" faixas={data.expectativa} />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <Grupos titulo="Por sistema" grupos={data.por_sistema} />
              <Grupos titulo="Por entidade" grupos={data.por_entidade} />
            </div>
          </>
        )}

        <div className="rounded-lg border border-subtle bg-surface-1 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="mr-2 text-13 font-semibold">Lista por nota</h3>
            {NOTAS_DA_LISTA.map((n) => (
              <button
                key={n.value}
                type="button"
                onClick={() => setNota(n.value)}
                className={chipClass(nota === n.value)}
              >
                {n.label}
              </button>
            ))}
          </div>
          {lista.length === 0 && <p className="text-13 text-secondary">Nenhum pós-atendimento com esta nota.</p>}
          {lista.length > 0 && (
            <table className="w-full text-12">
              <thead className="text-left text-secondary">
                <tr>
                  <th className="py-1 font-medium">Número</th>
                  <th className="py-1 font-medium">Entidade</th>
                  <th className="py-1 font-medium">Título</th>
                  <th className="py-1 font-medium">Contato</th>
                  <th className="py-1 font-medium">Observação</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((i) => (
                  <tr key={`${i.origem}-${i.id}`} className="border-t border-subtle align-top">
                    <td className="py-1 pr-2 whitespace-nowrap">
                      <Link href={getAlvoLink(workspaceSlug, i)} className="hover:underline">
                        {i.code}
                      </Link>
                    </td>
                    <td className="py-1 pr-2">{i.entity?.name ?? ""}</td>
                    <td className="py-1 pr-2">{i.title}</td>
                    <td className="py-1 pr-2 whitespace-nowrap">{formatData(i.pos?.recorded_at)}</td>
                    <td className="py-1 whitespace-pre-wrap">{i.pos?.observacao ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!!itens && itens.total_count > lista.length && (
            <p className="mt-2 text-12 text-secondary">
              Mostrando {lista.length} de {itens.total_count}. Use os filtros para reduzir a lista.
            </p>
          )}
        </div>
      </div>
    </div>
  );
});
