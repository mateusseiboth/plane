/**
 * Barra de filtros dos relatórios. Cada filtro do catálogo tem o seu controle
 * (strategy map); o relatório só mostra os que declara.
 */
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { EntityDropdown } from "@/components/dropdowns/entity";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ProjectDropdownBase } from "@/components/dropdowns/project/base";
import {
  OPCOES_DE_GRANULARIDADE,
  OPCOES_DE_PERFIL,
  OPCOES_DE_SITUACAO,
  type TEstadoDosFiltros,
  type TFiltroDoRelatorio,
} from "@/components/reports/filtros-do-relatorio";
import { useProject } from "@/hooks/store/use-project";

type TControleProps = {
  estado: TEstadoDosFiltros;
  onChange: (patch: Partial<TEstadoDosFiltros>) => void;
  workspaceSlug: string;
  /** Opções que o próprio relatório devolve (etapas, funções). */
  opcoes: { etapas?: string[]; funcoes?: { key: string; nome: string }[] };
};

const INPUT_CLASS =
  "rounded border border-subtle bg-surface-2 px-2 py-1.5 text-12 outline-none focus:border-accent-primary";

function Campo({ rotulo, htmlFor, children }: { rotulo: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-11 text-secondary">
        {rotulo}
      </label>
      {children}
    </div>
  );
}

function PeriodoControle({ estado, onChange }: TControleProps) {
  return (
    <>
      <Campo rotulo="De" htmlFor="relatorio-de">
        <input
          id="relatorio-de"
          type="date"
          value={estado.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })}
          className={INPUT_CLASS}
        />
      </Campo>
      <Campo rotulo="Até" htmlFor="relatorio-ate">
        <input
          id="relatorio-ate"
          type="date"
          value={estado.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })}
          className={INPUT_CLASS}
        />
      </Campo>
    </>
  );
}

const SistemasControle = observer(function SistemasControle({ estado, onChange }: TControleProps) {
  const { workspaceProjectIds, getProjectById } = useProject();
  return (
    <Campo rotulo="Sistemas">
      <ProjectDropdownBase
        multiple
        value={estado.projectIds}
        onChange={(ids: string[]) => onChange({ projectIds: ids })}
        projectIds={workspaceProjectIds ?? []}
        getProjectById={getProjectById}
        buttonVariant="border-with-text"
        placeholder="Todos os sistemas"
        className="min-w-[180px]"
        buttonClassName="h-8 text-12"
      />
    </Campo>
  );
});

function EntidadeControle({ estado, onChange, workspaceSlug }: TControleProps) {
  return (
    <Campo rotulo="Entidade">
      <EntityDropdown
        workspaceSlug={workspaceSlug}
        value={estado.entityId}
        onChange={(id) => onChange({ entityId: id })}
        placeholder="Todas as entidades"
        className="min-w-[180px]"
      />
    </Campo>
  );
}

function PessoaControle({ estado, onChange }: TControleProps) {
  return (
    <Campo rotulo="Pessoa">
      <MemberDropdown
        multiple={false}
        value={estado.userId}
        onChange={(id) => onChange({ userId: id })}
        buttonVariant="border-with-text"
        placeholder="Todas as pessoas"
        className="min-w-[180px]"
        buttonClassName="h-8 text-12"
      />
    </Campo>
  );
}

function LocalControle({ estado, onChange }: TControleProps) {
  return (
    <>
      <Campo rotulo="UF" htmlFor="relatorio-uf">
        <input
          id="relatorio-uf"
          value={estado.uf}
          maxLength={2}
          placeholder="MS"
          onChange={(e) => onChange({ uf: e.target.value.toUpperCase() })}
          className={`${INPUT_CLASS} w-16`}
        />
      </Campo>
      <Campo rotulo="Cidade" htmlFor="relatorio-cidade">
        <input
          id="relatorio-cidade"
          value={estado.city}
          placeholder="Todas"
          onChange={(e) => onChange({ city: e.target.value })}
          className={`${INPUT_CLASS} w-44`}
        />
      </Campo>
    </>
  );
}

const selectDeLista =
  (rotulo: string, campo: "perfil" | "situacao" | "granularidade", opcoes: { value: string; label: string }[]) =>
  ({ estado, onChange }: TControleProps) => (
    <Campo rotulo={rotulo}>
      <SelectPesquisavel
        value={estado[campo]}
        onChange={(valor: string) => onChange({ [campo]: valor })}
        opcoes={opcoes}
        className="min-w-[160px]"
        buttonClassName="h-8 text-12"
      />
    </Campo>
  );

function EtapaControle({ estado, onChange, opcoes }: TControleProps) {
  return (
    <Campo rotulo="Etapa atual">
      <SelectPesquisavel
        value={estado.etapa}
        onChange={(valor: string) => onChange({ etapa: valor })}
        opcoes={(opcoes.etapas ?? []).map((etapa) => ({ value: etapa, label: etapa }))}
        opcaoVazia={{ value: "", label: "Todas as etapas" }}
        className="min-w-[160px]"
        buttonClassName="h-8 text-12"
      />
    </Campo>
  );
}

function FuncaoControle({ estado, onChange, opcoes }: TControleProps) {
  return (
    <Campo rotulo="Função">
      <SelectPesquisavel
        value={estado.funcao}
        onChange={(valor: string) => onChange({ funcao: valor })}
        opcoes={(opcoes.funcoes ?? []).map((f) => ({ value: f.key, label: f.nome }))}
        opcaoVazia={{ value: "", label: "Todas as funções" }}
        className="min-w-[160px]"
        buttonClassName="h-8 text-12"
      />
    </Campo>
  );
}

const CONTROLES: Record<TFiltroDoRelatorio, (props: TControleProps) => ReactNode> = {
  period: PeriodoControle,
  project: (props) => <SistemasControle {...props} />,
  entity: EntidadeControle,
  user: PessoaControle,
  location: LocalControle,
  perfil: selectDeLista("Visão", "perfil", OPCOES_DE_PERFIL),
  situacao: selectDeLista("Situação", "situacao", OPCOES_DE_SITUACAO),
  granularidade: selectDeLista("Agrupar por", "granularidade", OPCOES_DE_GRANULARIDADE),
  etapa: EtapaControle,
  funcao: FuncaoControle,
};

export function ReportFiltersBar({ filtros, ...props }: TControleProps & { filtros: TFiltroDoRelatorio[] }) {
  return (
    <>
      {filtros.map((filtro) => {
        const Controle = CONTROLES[filtro];
        return <Controle key={filtro} {...props} />;
      })}
    </>
  );
}
