import { describe, expect, it } from "bun:test";
import {
  contarPermissoesDaFuncao,
  isMarcadoNaGrade,
  readErrosDeCampo,
  toggleNaGrade,
} from "@/components/plugins/gestao/gestao-rules";

describe("grade função × permissão", () => {
  const grade = { "role-ti": ["backup-manager.view"] };

  it("diz o que está marcado", () => {
    expect(isMarcadoNaGrade(grade, "role-ti", "backup-manager.view")).toBe(true);
    expect(isMarcadoNaGrade(grade, "role-ti", "backup-manager.admin")).toBe(false);
    expect(isMarcadoNaGrade(grade, "role-gestor", "backup-manager.view")).toBe(false);
  });

  it("marca sem mexer na grade recebida", () => {
    const nova = toggleNaGrade(grade, "role-ti", "backup-manager.admin");
    expect(nova["role-ti"]).toEqual(["backup-manager.view", "backup-manager.admin"]);
    expect(grade["role-ti"]).toEqual(["backup-manager.view"]);
  });

  it("desmarca e some com a função que ficou vazia", () => {
    expect(toggleNaGrade(grade, "role-ti", "backup-manager.view")).toEqual({});
  });

  it("marca numa função que ainda não tinha nada", () => {
    expect(toggleNaGrade({}, "role-gestor", "backup-manager.view")).toEqual({
      "role-gestor": ["backup-manager.view"],
    });
  });

  it("conta o que cada função recebeu", () => {
    expect(contarPermissoesDaFuncao(grade, "role-ti")).toBe(1);
    expect(contarPermissoesDaFuncao(grade, "role-gestor")).toBe(0);
  });
});

describe("readErrosDeCampo", () => {
  it("lê os erros que a API devolve, por caminho", () => {
    const erro = { errors: [{ path: "file", message: "Envie uma versão maior." }] };
    expect(readErrosDeCampo(erro)).toEqual({ file: "Envie uma versão maior." });
  });

  it("lê os erros embrulhados na resposta do axios", () => {
    const erro = { response: { data: { errors: [{ path: "grants.role-ti", message: "Permissão desconhecida." }] } } };
    expect(readErrosDeCampo(erro)).toEqual({ "grants.role-ti": "Permissão desconhecida." });
  });

  it("sem lista de erros, o `detail` vira o erro do formulário inteiro", () => {
    expect(readErrosDeCampo({ detail: "Plugin não encontrado." })).toEqual({ "": "Plugin não encontrado." });
  });

  it("erro sem forma conhecida vira uma mensagem única", () => {
    expect(readErrosDeCampo(new Error("falhou"))).toEqual({ "": "Não foi possível concluir. Tente de novo." });
    expect(readErrosDeCampo(null)).toEqual({ "": "Não foi possível concluir. Tente de novo." });
  });
});
