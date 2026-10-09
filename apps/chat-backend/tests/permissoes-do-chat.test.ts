/**
 * Quem atende, transfere, encerra, vê a fila etc. no chat, pela MESMA matriz de ações do Plane.
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
import { ACOES_DO_CHAT } from "@api-ts/utils/acoes-do-chat";
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
      resolveChatActions({ permissions: ["chat.atender"], granted: ["chat.transferir"], revoked: ["chat.atender"] })
    ).toEqual(["chat.transferir"]);
  });

  it("aceita o JSON cru do banco (texto)", () => {
    expect(resolveChatActions({ permissions: '["chat.configurar"]', granted: "[]", revoked: null })).toEqual([
      "chat.configurar",
    ]);
  });
});

describe("fonte única com o api-ts", () => {
  it("as ações do chat existem no catálogo do Plane", () => {
    for (const acao of Object.values(CHAT_ACTION)) expect(ALL_ACTIONS).toContain(acao);
  });

  it("a lista do chat é a mesma que o módulo do chat registra no api-ts", () => {
    const doApiTs = Object.values(ACOES_DO_CHAT).map((a) => a.key);
    expect([...Object.values(CHAT_ACTION)].sort()).toEqual([...doApiTs].sort());
  });

  it("as ações grossas de antes não existem mais", () => {
    const chaves: string[] = Object.values(CHAT_ACTION);
    expect(chaves).not.toContain("chat.gerenciar");
    expect(chaves).not.toContain("chat.administrar");
    expect(
      resolveChatActions({ permissions: ["chat.gerenciar", "chat.administrar"], granted: [], revoked: [] })
    ).toEqual([]);
  });

  it("o disparo em massa é uma ação do chat, com a mesma chave do catálogo", () => {
    expect(CHAT_ACTION.DISPARO).toBe("chat.disparo");
    expect(resolveChatActions({ permissions: ["chat.disparo"], granted: [], revoked: [] })).toEqual(["chat.disparo"]);
  });

  it("ver a avaliação do cliente é uma ação do chat, separada de configurar", () => {
    expect(CHAT_ACTION.VER_AVALIACAO).toBe("chat.ver_avaliacao");
    expect(resolveChatActions({ permissions: ["chat.configurar"], granted: [], revoked: [] })).not.toContain(
      "chat.ver_avaliacao"
    );
  });

  it("a regra de exceção por pessoa é a mesma", () => {
    const casos = [
      { base: ["chat.atender"], granted: ["chat.transferir"], revoked: [] },
      { base: ["chat.atender", "chat.ver_todas"], granted: [], revoked: ["chat.ver_todas"] },
      { base: [], granted: ["chat.configurar"], revoked: ["chat.configurar"] },
    ];
    for (const c of casos) {
      const doChat = applyChatOverrides(c.base, { granted: c.granted, revoked: c.revoked });
      const doPlane = applyMemberOverrides(c.base, { granted: c.granted, revoked: c.revoked });
      expect(doChat).toEqual(doPlane);
    }
  });
});
