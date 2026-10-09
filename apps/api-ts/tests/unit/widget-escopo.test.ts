/**
 * Regras puras do escopo de um widget: global (owner_user_id nulo) ou da
 * pessoa que enviou. Decidem o que cada listagem devolve e quem enxerga o quê.
 */
import { describe, expect, it } from "bun:test";
import {
  buildStorageKey,
  buildWhereDoEscopo,
  isEscopoSoDeAdmin,
  isWidgetVisivel,
  readEscopoDaListagem,
  serializeWidget,
} from "@modules/widget/widget.rules";

const EU = "u-1";

describe("readEscopoDaListagem", () => {
  it("sem scope a listagem é a da home", () => {
    expect(readEscopoDaListagem(undefined)).toBe("home");
  });

  it("aceita global e users", () => {
    expect(readEscopoDaListagem("global")).toBe("global");
    expect(readEscopoDaListagem("users")).toBe("users");
  });

  it("valor desconhecido cai na listagem da home", () => {
    expect(readEscopoDaListagem("tudo")).toBe("home");
  });
});

describe("buildWhereDoEscopo", () => {
  it("home: os globais mais os meus", () => {
    expect(buildWhereDoEscopo("home", EU)).toEqual({ OR: [{ ownerUserId: null }, { ownerUserId: EU }] });
  });

  it("global: só os sem dono", () => {
    expect(buildWhereDoEscopo("global", EU)).toEqual({ ownerUserId: null });
  });

  it("users: todos os que têm dono", () => {
    expect(buildWhereDoEscopo("users", EU)).toEqual({ ownerUserId: { not: null } });
  });

  it("mine: só os meus", () => {
    expect(buildWhereDoEscopo("mine", EU)).toEqual({ ownerUserId: EU });
  });
});

describe("isEscopoSoDeAdmin", () => {
  it("só a aba De usuários exige administrar", () => {
    expect(isEscopoSoDeAdmin("users")).toBe(true);
    expect(isEscopoSoDeAdmin("home")).toBe(false);
    expect(isEscopoSoDeAdmin("global")).toBe(false);
    expect(isEscopoSoDeAdmin("mine")).toBe(false);
  });
});

describe("isWidgetVisivel", () => {
  it("global é visível para qualquer pessoa", () => {
    expect(isWidgetVisivel({ ownerUserId: null }, EU, false)).toBe(true);
  });

  it("o privado é visível para quem enviou", () => {
    expect(isWidgetVisivel({ ownerUserId: EU }, EU, false)).toBe(true);
  });

  it("o privado de outra pessoa só para quem administra", () => {
    expect(isWidgetVisivel({ ownerUserId: "u-2" }, EU, false)).toBe(false);
    expect(isWidgetVisivel({ ownerUserId: "u-2" }, EU, true)).toBe(true);
  });
});

describe("buildStorageKey", () => {
  it("global fica na raiz, pelo nome e versão", () => {
    expect(buildStorageKey({ name: "Fila do Suporte", version: "1.2.0" }, "widget.js", null)).toBe(
      "fila-do-suporte/1.2.0/widget.js"
    );
  });

  it("o de usuário fica na pasta da pessoa: dois usuários podem ter o mesmo nome e versão", () => {
    expect(buildStorageKey({ name: "Fila do Suporte", version: "1.2.0" }, "widget.js", EU)).toBe(
      "usuarios/u-1/fila-do-suporte/1.2.0/widget.js"
    );
  });
});

describe("serializeWidget", () => {
  const base = {
    id: "w-1",
    name: "Fila",
    description: null,
    version: "1.0.0",
    author: "Ana",
    entryFile: "widget.js",
    manifest: {},
    permissions: [],
    status: "ACTIVE",
    storageKey: "fila/1.0.0/widget.js",
    createdById: EU,
    createdAt: new Date("2026-10-09T10:00:00Z"),
    updatedAt: new Date("2026-10-09T10:00:00Z"),
  };

  it("global sai com scope global e sem dono", () => {
    expect(serializeWidget({ ...base, ownerUserId: null })).toMatchObject({
      scope: "global",
      owner_user_id: null,
      owner: null,
    });
  });

  it("o de usuário sai com o dono legível", () => {
    const ownerUser = { id: EU, displayName: "ana", email: "ana@x", firstName: "Ana", lastName: "Silva" };
    expect(serializeWidget({ ...base, ownerUserId: EU, ownerUser })).toMatchObject({
      scope: "user",
      owner_user_id: EU,
      owner: { id: EU, display_name: "ana", email: "ana@x", first_name: "Ana", last_name: "Silva" },
    });
  });
});
