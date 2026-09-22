/**
 * Funcionalidades atendidas: módulos dos sistemas marcados na visita. O "menu do
 * sistema" do SAC virou módulo do Plane, então não existe cadastro próprio.
 */
import useSWR from "swr";
import type { IModule } from "@plane/types";
import { cn } from "@plane/utils";
import { ModuleService } from "@/services/module.service";

const moduleService = new ModuleService();

/** Módulos de todos os sistemas marcados. A página usa para podar o que saiu. */
export function useVisitModules(workspaceSlug: string, projectIds: string[]) {
  const { data, isLoading } = useSWR<IModule[]>(
    projectIds.length ? ["VISIT_MODULES", workspaceSlug, [...projectIds].sort().join(",")] : null,
    async () => (await Promise.all(projectIds.map((id) => moduleService.getModules(workspaceSlug, id)))).flat(),
    { revalidateOnFocus: false }
  );
  return { modules: data ?? [], isLoading };
}

type Props = {
  modules: IModule[];
  isLoading: boolean;
  hasProjects: boolean;
  value: string[];
  onChange: (moduleIds: string[]) => void;
  disabled?: boolean;
};

export function VisitModulesPicker({ modules, isLoading, hasProjects, value, onChange, disabled }: Props) {
  const selecionados = new Set(value);

  const onToggle = (moduleId: string) =>
    onChange(selecionados.has(moduleId) ? value.filter((id) => id !== moduleId) : [...value, moduleId]);

  if (!hasProjects) return <p className="text-12 text-tertiary">Marque os sistemas atendidos.</p>;
  if (isLoading) return <p className="text-12 text-tertiary">Carregando...</p>;
  if (!modules.length) return <p className="text-12 text-tertiary">Os sistemas marcados não têm módulos.</p>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {modules.map((modulo) => (
        <button
          key={modulo.id}
          type="button"
          disabled={disabled}
          onClick={() => onToggle(modulo.id)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-12 disabled:opacity-60",
            selecionados.has(modulo.id)
              ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
              : "border-subtle text-secondary hover:text-primary"
          )}
        >
          {modulo.name}
        </button>
      ))}
    </div>
  );
}
