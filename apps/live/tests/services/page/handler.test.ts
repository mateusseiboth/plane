/**
 * Qual serviço de página o `live` usa para cada tipo de documento. A página de
 * sistema fala pela árvore do sistema; a página da wiki, pela árvore do espaço
 * (sem projeto no caminho). Sem banco nem rede: só a URL base montada.
 */
import { describe, expect, it } from "vitest";
import { getDocumentTypeForProject, getPageService } from "@/services/page/handler";
import type { HocusPocusServerContext } from "@/types";

const contexto = (extra: Partial<HocusPocusServerContext>): HocusPocusServerContext => ({
  projectId: null,
  cookie: "sessao=1",
  documentType: "project_page",
  workspaceSlug: "quality",
  userId: "u1",
  ...extra,
});

const basePathDe = (servico: unknown) => (servico as { basePath: string }).basePath;

describe("getPageService", () => {
  it("página de sistema usa a árvore do sistema", () => {
    const servico = getPageService("project_page", contexto({ projectId: "p1" }));
    expect(basePathDe(servico)).toBe("/api/workspaces/quality/projects/p1");
  });

  it("página da wiki usa a árvore do espaço, sem projeto", () => {
    const servico = getPageService("workspace_page", contexto({ documentType: "workspace_page" }));
    expect(basePathDe(servico)).toBe("/api/workspaces/quality");
  });

  it("página da wiki sem espaço é recusada", () => {
    expect(() => getPageService("workspace_page", contexto({ workspaceSlug: null }))).toThrow();
  });

  it("tipo desconhecido é recusado", () => {
    expect(() => getPageService("team_page" as never, contexto({}))).toThrow();
  });
});

describe("getDocumentTypeForProject", () => {
  it("com sistema é página de sistema; sem sistema é página da wiki", () => {
    expect(getDocumentTypeForProject("p1")).toBe("project_page");
    expect(getDocumentTypeForProject(undefined)).toBe("workspace_page");
    expect(getDocumentTypeForProject("")).toBe("workspace_page");
  });
});
