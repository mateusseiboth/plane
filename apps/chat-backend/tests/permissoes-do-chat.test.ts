/**
 * Quem atende, gerencia e administra o chat, pela MESMA matriz de ações do Plane.
 *
 * O chat decidia pelo número do papel (`role >= 6`, `>= 15`, `>= 20`) e ignorava
 * a função configurada na tela de Funções e as exceções por pessoa. Agora lê a
 * função gravada (`workflow_roles.permissions`) e aplica `granted_actions` /
 * `revoked_actions` da associação. Sem função gravada, nega.
 *
 * As regras puras rodam sem banco; o último bloco confere que as chaves e a
 * regra de exceção batem com o catálogo do api-ts (fonte única).
 */
import { describe, expect, it } from "bun:test";
import { CHAT_ACTION, applyChatOverrides, resolveChatActions } from "@/permissoes";
import { ALL_ACTIONS, applyMemberOverrides } from "@api-ts/utils/permissions";

describe("resolveChatActions", () => {
  it("usa as permissões da função gravada", () => {
    expect(resolveChatActions({ permissions: ["chat.atender", "issue.view"], granted: [], revoked: [] })).toEqual([
      "chat.atender",
    ]);
  });

  it("sem função gravada, nega tudo", () => {
    expect(resolveChatActions({ permissions: null, granted: ["chat.atender"], revoked: [] })).toEqual([]);
  });

  it("concessão por pessoa soma, negação vence", () => {
    expect(
      resolveChatActions({ permissions: ["chat.atender"], granted: ["chat.gerenciar"], revoked: ["chat.atender"] })
    ).toEqual(["chat.gerenciar"]);
  });

  it("aceita o JSON cru do banco (texto)", () => {
    expect(resolveChatActions({ permissions: '["chat.administrar"]', granted: "[]", revoked: null })).toEqual([
      "chat.administrar",
    ]);
  });
});

describe("fonte única com o api-ts", () => {
  it("as ações do chat existem no catálogo do Plane", () => {
    for (const acao of Object.values(CHAT_ACTION)) expect(ALL_ACTIONS).toContain(acao);
  });

  it("a regra de exceção por pessoa é a mesma", () => {
    const casos = [
      { base: ["chat.atender"], granted: ["chat.gerenciar"], revoked: [] },
      { base: ["chat.atender", "chat.gerenciar"], granted: [], revoked: ["chat.gerenciar"] },
      { base: [], granted: ["chat.administrar"], revoked: ["chat.administrar"] },
    ];
    for (const c of casos) {
      const doChat = applyChatOverrides(c.base, { granted: c.granted, revoked: c.revoked });
      const doPlane = applyMemberOverrides(c.base, { granted: c.granted, revoked: c.revoked });
      expect(doChat).toEqual(doPlane);
    }
  });
});
