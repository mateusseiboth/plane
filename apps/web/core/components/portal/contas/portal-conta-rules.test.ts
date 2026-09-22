/**
 * Regras de tela das contas do portal: formulário, payload, filtro da lista e
 * o texto do último acesso. Puro.
 * Rodar com `bun test core/components/portal`.
 */
import { describe, expect, it } from "bun:test";
import {
  buildContaForm,
  buildContaPayload,
  filterContas,
  readUltimoAcesso,
  type TPortalConta,
} from "./portal-conta-rules";

const conta = (sobrescrever: Partial<TPortalConta> = {}): TPortalConta => ({
  id: "c1",
  name: "Prefeitura de Exemplo",
  email: "contato@prefeitura.test",
  entity_id: "e1",
  entity: { id: "e1", name: "Prefeitura de Exemplo" },
  is_active: true,
  last_login_at: null,
  project_ids: ["p1"],
  created_at: "2026-09-01T12:00:00.000Z",
  ...sobrescrever,
});

describe("buildContaForm", () => {
  it("conta nova começa vazia e ativa", () => {
    expect(buildContaForm()).toEqual({
      name: "",
      email: "",
      password: "",
      entity_id: null,
      project_ids: [],
      is_active: true,
    });
  });

  it("edição traz os dados, nunca a senha", () => {
    expect(buildContaForm(conta())).toEqual({
      name: "Prefeitura de Exemplo",
      email: "contato@prefeitura.test",
      password: "",
      entity_id: "e1",
      project_ids: ["p1"],
      is_active: true,
    });
  });
});

describe("buildContaPayload", () => {
  it("criando: manda a senha", () => {
    const payload = buildContaPayload({ ...buildContaForm(), name: " A ", email: "a@b.c", password: "12345678" }, true);
    expect(payload).toMatchObject({ name: "A", email: "a@b.c", password: "12345678", project_ids: [] });
  });

  it("editando: senha em branco não vai", () => {
    const payload = buildContaPayload(buildContaForm(conta()), false);
    expect("password" in payload).toBe(false);
    expect(payload.entity_id).toBe("e1");
  });
});

describe("filterContas", () => {
  const lista = [
    conta(),
    conta({ id: "c2", name: "Câmara", email: "camara@teste.test", is_active: false, entity: null, entity_id: null }),
  ];

  it("busca por nome, e-mail ou entidade, sem acento e sem caixa", () => {
    expect(filterContas(lista, "camara", "todas").map((c) => c.id)).toEqual(["c2"]);
    expect(filterContas(lista, "PREFEITURA", "todas").map((c) => c.id)).toEqual(["c1"]);
  });

  it("filtra por situação", () => {
    expect(filterContas(lista, "", "ativas").map((c) => c.id)).toEqual(["c1"]);
    expect(filterContas(lista, "", "inativas").map((c) => c.id)).toEqual(["c2"]);
    expect(filterContas(lista, "", "todas")).toHaveLength(2);
  });
});

describe("readUltimoAcesso", () => {
  it("nunca entrou", () => {
    expect(readUltimoAcesso(null)).toBe("Nunca entrou");
  });

  it("data do último acesso", () => {
    expect(readUltimoAcesso("2026-09-10T15:00:00.000Z")).toMatch(/2026/);
  });
});
