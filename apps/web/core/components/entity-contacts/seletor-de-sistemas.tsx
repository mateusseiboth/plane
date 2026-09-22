/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// hooks
import { useProject } from "@/hooks/store/use-project";

type Props = {
  value: string[];
  onChange: (projectIds: string[]) => void;
  error?: string;
};

/** Sistemas (projetos) de que o contato cuida no cliente. Marca quantos quiser. */
export const SeletorDeSistemas = observer(function SeletorDeSistemas({ value, onChange, error }: Props) {
  const { workspaceProjectIds, getProjectById } = useProject();
  const projects = (workspaceProjectIds ?? [])
    .map((id) => getProjectById(id))
    .filter((project): project is NonNullable<typeof project> => Boolean(project))
    // O lib do TypeScript do web não tem `toSorted`; o array é novo (saiu do map/filter).
    // oxlint-disable-next-line unicorn/no-array-sort
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const toggle = (projectId: string, checked: boolean) =>
    onChange(checked ? [...value, projectId] : value.filter((id) => id !== projectId));

  return (
    <div>
      <div className="max-h-36 overflow-y-auto rounded border border-subtle bg-surface-2 p-2">
        {projects.length === 0 && <p className="text-12 text-secondary">Nenhum sistema cadastrado.</p>}
        {projects.map((project) => (
          <label key={project.id} className="flex items-center gap-2 py-0.5 text-13 text-primary">
            <input
              type="checkbox"
              checked={value.includes(project.id)}
              onChange={(e) => toggle(project.id, e.target.checked)}
              className="accent-accent-primary h-4 w-4 rounded"
            />
            {project.name}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-12 text-danger-primary">{error}</p>}
    </div>
  );
});
