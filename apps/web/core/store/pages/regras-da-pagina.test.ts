/**
 * Quem edita, trava, arquiva e exclui uma página de sistema. Puro: o store
 * resolve as ações da matriz e passa os booleanos. Rodar com `bun test core/store/pages`.
 */
import { describe, expect, it } from "bun:test";
import {
  ACAO_DE_ESCREVER_PAGINA,
  ACAO_DE_GERIR_PAGINA_DE_OUTRO,
  isPageContentEditable,
  isPageEditAllowed,
  isPageManageAllowed,
} from "./regras-da-pagina";

describe("ações da matriz", () => {
  it("usa as chaves que o api-ts confere", () => {
    expect(ACAO_DE_ESCREVER_PAGINA).toBe("page.create");
    expect(ACAO_DE_GERIR_PAGINA_DE_OUTRO).toBe("page.manage.all");
  });
});

describe("isPageEditAllowed", () => {
  it("página pública: edita quem escreve páginas no sistema, dono ou não", () => {
    expect(isPageEditAllowed({ isOwner: false, isPublic: true, canWrite: true })).toBe(true);
    expect(isPageEditAllowed({ isOwner: true, isPublic: true, canWrite: true })).toBe(true);
  });

  it("página pública: nega a quem não escreve páginas", () => {
    expect(isPageEditAllowed({ isOwner: false, isPublic: true, canWrite: false })).toBe(false);
    expect(isPageEditAllowed({ isOwner: true, isPublic: true, canWrite: false })).toBe(false);
  });

  it("página privada: só o dono edita", () => {
    expect(isPageEditAllowed({ isOwner: true, isPublic: false, canWrite: false })).toBe(true);
    expect(isPageEditAllowed({ isOwner: false, isPublic: false, canWrite: true })).toBe(false);
  });
});

describe("isPageManageAllowed", () => {
  it("o dono sempre trava, arquiva e exclui a própria página", () => {
    expect(isPageManageAllowed({ isOwner: true, canManageAll: false })).toBe(true);
  });

  it("página de outro só com page.manage.all", () => {
    expect(isPageManageAllowed({ isOwner: false, canManageAll: true })).toBe(true);
    expect(isPageManageAllowed({ isOwner: false, canManageAll: false })).toBe(false);
  });
});

describe("isPageContentEditable", () => {
  const livre = { isArchived: false, isLocked: false, isOwner: false, isPublic: true, canWrite: true };

  it("pública e livre: edita quem escreve páginas", () => {
    expect(isPageContentEditable(livre)).toBe(true);
    expect(isPageContentEditable({ ...livre, canWrite: false })).toBe(false);
  });

  it("o dono edita o conteúdo mesmo sem escrever páginas", () => {
    expect(isPageContentEditable({ ...livre, isOwner: true, isPublic: false, canWrite: false })).toBe(true);
  });

  it("privada de outro não é editável", () => {
    expect(isPageContentEditable({ ...livre, isPublic: false })).toBe(false);
  });

  it("arquivada ou travada não é editável por ninguém", () => {
    expect(isPageContentEditable({ ...livre, isOwner: true, isArchived: true })).toBe(false);
    expect(isPageContentEditable({ ...livre, isOwner: true, isLocked: true })).toBe(false);
  });
});
