/**
 * Administração das contas do portal: leitura do formulário (erro volta no
 * campo), senha provisória e a escolha entre link por e-mail e senha
 * provisória. Puro, sem banco.
 */
import { describe, expect, it } from "bun:test";
import { buildSenhaProvisoria, pickModoDeRedefinicao, readContaPayload } from "@modules/portal/contas-admin";

const capturar = (fn: () => unknown): any => {
  try {
    fn();
    return null;
  } catch (erro) {
    return erro;
  }
};

describe("readContaPayload", () => {
  it("criando: exige nome, e-mail válido e senha de 8 caracteres, cada um no seu campo", () => {
    const erro = capturar(() => readContaPayload({ name: " ", email: "sem-arroba", password: "123" }, true));
    expect(erro.status).toBe(400);
    expect(erro.errors.map((e: any) => e.path).toSorted()).toEqual(["email", "name", "password"]);
    expect(erro.errors.every((e: any) => !e.message.includes("—"))).toBe(true);
  });

  it("criando: normaliza e-mail e nome, sistemas só strings", () => {
    expect(
      readContaPayload(
        {
          name: "  Prefeitura  ",
          email: " Contato@Prefeitura.GOV.br ",
          password: "12345678",
          entity_id: "",
          project_ids: ["a", 3, "", "b"],
        },
        true
      )
    ).toEqual({
      name: "Prefeitura",
      email: "contato@prefeitura.gov.br",
      password: "12345678",
      entityId: null,
      projectIds: ["a", "b"],
    });
  });

  it("editando: só o que veio, e senha vazia não conta como troca", () => {
    expect(readContaPayload({ is_active: false, password: "" }, false)).toEqual({ isActive: false });
    expect(readContaPayload({ entity_id: null }, false)).toEqual({ entityId: null });
  });

  it("editando: nome vazio e e-mail inválido também voltam no campo", () => {
    const erro = capturar(() => readContaPayload({ name: "", email: "x" }, false));
    expect(erro.errors.map((e: any) => e.path).toSorted()).toEqual(["email", "name"]);
  });

  it("project_ids que não é lista volta no campo", () => {
    const erro = capturar(() => readContaPayload({ project_ids: "SIART" }, false));
    expect(erro.errors).toEqual([{ path: "project_ids", message: expect.any(String) }]);
  });
});

describe("buildSenhaProvisoria", () => {
  it("12 caracteres, sem os que se confundem ao ditar, e diferente a cada chamada", () => {
    const senhas = Array.from({ length: 50 }, buildSenhaProvisoria);
    for (const senha of senhas) {
      expect(senha).toHaveLength(12);
      expect(senha).not.toMatch(/[0O1lI]/);
    }
    expect(new Set(senhas).size).toBe(50);
  });
});

describe("pickModoDeRedefinicao", () => {
  it("com e-mail ligado, o padrão é o link", () => {
    expect(pickModoDeRedefinicao(undefined, true)).toBe("email");
  });

  it("sem e-mail, o padrão é a senha provisória", () => {
    expect(pickModoDeRedefinicao(undefined, false)).toBe("provisoria");
  });

  it("o administrador pode pedir a provisória mesmo com e-mail", () => {
    expect(pickModoDeRedefinicao("provisoria", true)).toBe("provisoria");
  });

  it("pedir link sem e-mail configurado é recusado no campo", () => {
    const erro = capturar(() => pickModoDeRedefinicao("email", false));
    expect(erro.status).toBe(400);
    expect(erro.errors[0].path).toBe("modo");
  });
});
