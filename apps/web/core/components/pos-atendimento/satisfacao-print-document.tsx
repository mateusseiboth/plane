/**
 * Impressão do relatório de satisfação: distribuição das notas, por sistema e por
 * entidade, e a lista da nota escolhida.
 */
import { PrintDocument, PrintSection } from "@/components/print";
import { formatData } from "@/components/pos-atendimento/helpers";
import type { TPosFilaItem, TSatisfacao } from "@/components/pos-atendimento/types";

const CELL = "border border-neutral-300 px-2 py-1 align-top";

type Props = {
  satisfacao: TSatisfacao;
  itens: TPosFilaItem[];
  subtitle?: string | null;
  periodo: string;
  notaLabel: string;
};

const NOTAS = ["3", "2", "1", "0"] as const;
const NOTA_LABEL: Record<(typeof NOTAS)[number], string> = { "3": "Ótimo", "2": "Bom", "1": "Ruim", "0": "Sem nota" };

function TabelaDeGrupos({ titulo, grupos }: { titulo: string; grupos: TSatisfacao["por_sistema"] }) {
  return (
    <PrintSection title={titulo}>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className={CELL}>Nome</th>
            {NOTAS.map((n) => (
              <th key={n} className={CELL}>
                {NOTA_LABEL[n]}
              </th>
            ))}
            <th className={CELL}>Total</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={g.id ?? g.name}>
              <td className={CELL}>{g.name}</td>
              {NOTAS.map((n) => (
                <td key={n} className={CELL}>
                  {g.notas[n] ?? 0}
                </td>
              ))}
              <td className={CELL}>{g.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintSection>
  );
}

export function SatisfacaoPrintDocument({ satisfacao, itens, subtitle, periodo, notaLabel }: Props) {
  return (
    <PrintDocument
      title="Relatório de satisfação"
      subtitle={subtitle}
      meta={[
        { label: "Período", value: periodo },
        { label: "Total", value: `${satisfacao.total} pós-atendimento(s)` },
      ]}
    >
      <PrintSection title="Classificação">
        <table className="w-full border-collapse text-[10px]">
          <tbody>
            {satisfacao.classificacao.map((f) => (
              <tr key={f.label}>
                <td className={CELL}>{f.label}</td>
                <td className={CELL}>{f.total}</td>
                <td className={CELL}>{f.percentual}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintSection>
      <PrintSection title="Atendeu a expectativa">
        <table className="w-full border-collapse text-[10px]">
          <tbody>
            {satisfacao.expectativa.map((f) => (
              <tr key={f.label}>
                <td className={CELL}>{f.label}</td>
                <td className={CELL}>{f.total}</td>
                <td className={CELL}>{f.percentual}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintSection>
      <TabelaDeGrupos titulo="Por sistema" grupos={satisfacao.por_sistema} />
      <TabelaDeGrupos titulo="Por entidade" grupos={satisfacao.por_entidade} />
      <PrintSection title={`Lista: ${notaLabel}`}>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <th className={CELL}>Número</th>
              <th className={CELL}>Entidade</th>
              <th className={CELL}>Título</th>
              <th className={CELL}>Nota</th>
              <th className={CELL}>Contato</th>
              <th className={CELL}>Observação</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={`${i.origem}-${i.id}`}>
                <td className={CELL}>{i.code}</td>
                <td className={CELL}>{i.entity?.name ?? ""}</td>
                <td className={CELL}>{i.title}</td>
                <td className={CELL}>{i.pos?.classificacao_label ?? ""}</td>
                <td className={CELL}>{formatData(i.pos?.recorded_at)}</td>
                <td className={CELL}>{i.pos?.observacao ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintSection>
    </PrintDocument>
  );
}
