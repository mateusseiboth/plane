/**
 * A regra de sessão revogada do chat é a MESMA do api-ts.
 *
 * O container do chat não leva o código do api-ts, então a regra (duas linhas)
 * está repetida em `src/sessao.ts`. Este teste roda as duas sobre os mesmos
 * casos e quebra se uma mudar sem a outra.
 */
import { describe, expect, it } from "bun:test";
import { isSessionRevoked, readSessionVersion } from "@/sessao";
import * as apiTs from "@api-ts/utils/session-rules";

const MARCO = new Date("2026-09-22T12:00:00.123Z");

const CASOS: Array<[string, unknown, Date | null | undefined]> = [
  ["usuário nunca revogado, token sem versão", undefined, null],
  ["usuário nunca revogado, token com versão 0", 0, null],
  ["usuário revogado, token sem versão", undefined, MARCO],
  ["versão atual", MARCO.getTime(), MARCO],
  ["versão anterior", MARCO.getTime() - 1, MARCO],
  ["versão que não é número", "abc", MARCO],
  ["marco indefinido", 123, undefined],
];

describe("isSessionRevoked do chat", () => {
  for (const [nome, versao, marco] of CASOS) {
    it(`responde como o api-ts: ${nome}`, () => {
      expect(isSessionRevoked(versao, marco)).toBe(apiTs.isSessionRevoked(versao, marco));
    });
  }

  it("lê a versão do mesmo claim do api-ts", () => {
    const payload = { sub: "u1", tv: 42 };
    expect(readSessionVersion(payload)).toBe(apiTs.readSessionVersion(payload));
  });
});
