/** Regras puras da grade função × permissão do plugin (sem banco). */
import { describe, expect, it } from "bun:test";
import {
  buildGradeDasLinhas,
  buildLinhasDaGrade,
  diffLinhasDeGrant,
  parseGradeDeGrants,
} from "@modules/plugin-registry/grants";

const FUNCOES = [
  { id: "role-ti", key: "ti", name: "TI", level: 12 },
  { id: "role-gestor", key: "gestor_projeto", name: "Gestor de Projeto", level: 18 },
];

const PERMISSOES = [
  { key: "backup-manager.view", label: "Visualizar" },
  { key: "backup-manager.admin", label: "Administrar" },
];

describe("parseGradeDeGrants", () => {
  it("aceita a grade com as permissões declaradas e tira as repetidas", () => {
    const { grade, errors } = parseGradeDeGrants(
      { "role-ti": ["backup-manager.view", "backup-manager.view"] },
      FUNCOES,
      PERMISSOES
    );
    expect(errors).toEqual([]);
    expect(grade).toEqual({ "role-ti": ["backup-manager.view"] });
  });

  it("função sem nenhuma permissão marcada sai da grade", () => {
    const { grade, errors } = parseGradeDeGrants({ "role-ti": [] }, FUNCOES, PERMISSOES);
    expect(errors).toEqual([]);
    expect(grade).toEqual({});
  });

  it("recusa permissão fora do manifesto, com o caminho da linha", () => {
    const { errors } = parseGradeDeGrants({ "role-ti": ["outro.admin"] }, FUNCOES, PERMISSOES);
    expect(errors).toEqual([{ path: "grants.role-ti", message: "Permissão desconhecida: outro.admin." }]);
  });

  it("recusa função desconhecida", () => {
    const { errors } = parseGradeDeGrants({ "role-x": [] }, FUNCOES, PERMISSOES);
    expect(errors).toEqual([{ path: "grants.role-x", message: "Função não encontrada neste espaço." }]);
  });

  it("recusa corpo que não é objeto", () => {
    expect(parseGradeDeGrants(null, FUNCOES, PERMISSOES).errors).toEqual([
      { path: "grants", message: "Envie a grade de permissões por função." },
    ]);
    expect(parseGradeDeGrants([], FUNCOES, PERMISSOES).errors).toHaveLength(1);
  });

  it("um erro em qualquer linha não deixa NADA ser gravado", () => {
    const { grade, errors } = parseGradeDeGrants(
      { "role-ti": ["backup-manager.view"], "role-x": [] },
      FUNCOES,
      PERMISSOES
    );
    expect(errors).toHaveLength(1);
    expect(grade).toEqual({});
  });
});

describe("ida e volta entre a grade da tela e as linhas gravadas", () => {
  it("a linha guarda o NÍVEL da função, que é o que a associação carrega", () => {
    expect(buildLinhasDaGrade({ "role-gestor": ["backup-manager.admin"] }, FUNCOES)).toEqual([
      { subjectId: "18", permission: "backup-manager.admin" },
    ]);
  });

  it("a grade volta pelo id da função e ignora nível sem função viva", () => {
    const grade = buildGradeDasLinhas(
      [
        { subjectId: "12", permission: "backup-manager.view" },
        { subjectId: "12", permission: "backup-manager.admin" },
        { subjectId: "99", permission: "backup-manager.view" },
      ],
      FUNCOES
    );
    expect(grade).toEqual({ "role-ti": ["backup-manager.admin", "backup-manager.view"] });
  });

  it("permissão que saiu do manifesto (versão nova) não volta na grade nem trava a tela", () => {
    const grade = buildGradeDasLinhas(
      [
        { subjectId: "18", permission: "backup-manager.view" },
        { subjectId: "18", permission: "backup-manager.delete" },
      ],
      FUNCOES,
      [{ key: "backup-manager.view", label: "Ver" }]
    );
    expect(grade).toEqual({ "role-gestor": ["backup-manager.view"] });
  });
});

describe("diffLinhasDeGrant", () => {
  it("gravar a mesma grade de novo não mexe em nada", () => {
    const linhas = [{ subjectId: "12", permission: "backup-manager.view" }];
    expect(diffLinhasDeGrant(linhas, linhas)).toEqual({ toAdd: [], toRemove: [] });
  });

  it("separa o que entra do que sai", () => {
    const { toAdd, toRemove } = diffLinhasDeGrant(
      [{ subjectId: "12", permission: "backup-manager.view" }],
      [{ subjectId: "18", permission: "backup-manager.admin" }]
    );
    expect(toAdd).toEqual([{ subjectId: "18", permission: "backup-manager.admin" }]);
    expect(toRemove).toEqual([{ subjectId: "12", permission: "backup-manager.view" }]);
  });
});
