/**
 * Filtros da fila e do relatório: origem, sistema, entidade, período e (só na
 * fila) responsável.
 */
import { observer } from "mobx-react";
import { cn } from "@plane/utils";
import { EntityDropdown } from "@/components/dropdowns/entity";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { INPUT_CLASS } from "@/components/technical-visits/visit-display";
import { ORIGEM_OPTIONS, POS_FILTROS_INICIAIS } from "@/components/pos-atendimento/helpers";
import type { TPosFiltros } from "@/components/pos-atendimento/types";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  workspaceSlug: string;
  filtros: TPosFiltros;
  onChange: (parcial: Partial<TPosFiltros>) => void;
  /** O relatório não filtra por responsável. */
  hasResponsavel?: boolean;
};

const CAMPO = cn(INPUT_CLASS, "py-1.5");

export const PosFiltros = observer(function PosFiltros(props: Props) {
  const { workspaceSlug, filtros, onChange, hasResponsavel = true } = props;
  const { joinedProjectIds, getProjectById } = useProject();

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-subtle px-6 py-3">
      <div className="w-44">
        <label htmlFor="pos-origem" className="mb-1 block text-11 text-secondary">
          Origem
        </label>
        <select
          id="pos-origem"
          className={CAMPO}
          value={filtros.origem}
          onChange={(e) => onChange({ origem: e.target.value as TPosFiltros["origem"] })}
        >
          {ORIGEM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="w-48">
        <label htmlFor="pos-sistema" className="mb-1 block text-11 text-secondary">
          Sistema
        </label>
        <select
          id="pos-sistema"
          className={CAMPO}
          value={filtros.project_id ?? ""}
          onChange={(e) => onChange({ project_id: e.target.value || null })}
        >
          <option value="">Todos</option>
          {joinedProjectIds.map((id) => (
            <option key={id} value={id}>
              {getProjectById(id)?.name ?? id}
            </option>
          ))}
        </select>
      </div>
      <div className="w-56">
        <span className="mb-1 block text-11 text-secondary">Entidade</span>
        <EntityDropdown
          workspaceSlug={workspaceSlug}
          value={filtros.entity_id}
          onChange={(id) => onChange({ entity_id: id })}
          placeholder="Todas"
          className="w-full"
        />
      </div>
      {hasResponsavel && (
        <div className="w-48">
          <span className="mb-1 block text-11 text-secondary">Responsável</span>
          <MemberDropdown
            value={filtros.responsavel_id}
            onChange={(id) => onChange({ responsavel_id: id })}
            multiple={false}
            buttonVariant="border-with-text"
            placeholder="Todos"
            className="w-full"
            buttonClassName="w-full"
          />
        </div>
      )}
      <div>
        <label htmlFor="pos-desde" className="mb-1 block text-11 text-secondary">
          De
        </label>
        <input
          id="pos-desde"
          type="date"
          className={CAMPO}
          value={filtros.desde}
          onChange={(e) => onChange({ desde: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor="pos-ate" className="mb-1 block text-11 text-secondary">
          Até
        </label>
        <input
          id="pos-ate"
          type="date"
          className={CAMPO}
          value={filtros.ate}
          onChange={(e) => onChange({ ate: e.target.value })}
        />
      </div>
      <button
        type="button"
        onClick={() => onChange({ ...POS_FILTROS_INICIAIS, situacao: filtros.situacao })}
        className="rounded px-3 py-1.5 text-12 text-secondary hover:text-primary"
      >
        Limpar filtros
      </button>
    </div>
  );
});
