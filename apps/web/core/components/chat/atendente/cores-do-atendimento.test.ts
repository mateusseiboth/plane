/**
 * Cor da bolha da mensagem. O design system desliga a paleta padrão do
 * Tailwind (`--color-*: initial` em `@plane/tailwind-config/variables.css`):
 * `bg-indigo-600` não gera CSS e a bolha do atendente ficava transparente com
 * texto branco, ilegível no tema claro. Toda classe de cor da bolha precisa
 * existir no tema. Rodar com `bun test core/components/chat/atendente/cores-do-atendimento`.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  BOLHA_DA_MENSAGEM,
  COR_DE_LIDA,
  CORES_DO_AVATAR,
  COR_DO_STATUS,
  ETIQUETA_DO_CABECALHO,
  TOM_DO_BOTAO,
  findClasseDaBolha,
  findCorDoAvatar,
  findCorDoStatus,
  findRotuloDoStatus,
} from "@/components/chat/atendente/cores-do-atendimento";

// O pacote só exporta o index.css; o tema mora ao lado dele.
const TEMA = readFileSync(join(dirname(require.resolve("@plane/tailwind-config/index.css")), "variables.css"), "utf8");

const PREFIXO_DE_COR: Record<string, string[]> = {
  bg: ["--background-color-", "--color-"],
  text: ["--text-color-", "--color-"],
  border: ["--border-color-", "--color-"],
};

const WITHOUT_COR = new Set(["border", "border-dashed", "border-solid"]);

const isCorDoTema = (classe: string) => {
  const [utilidade = "", ...resto] = classe.split("-");
  const nome = resto.join("-");
  return (PREFIXO_DE_COR[utilidade] ?? []).some((prefixo) => TEMA.includes(`${prefixo}${nome}:`));
};

const findCoresInexistentes = (classes: string) =>
  classes
    .split(/\s+/)
    .map((classe) => classe.split(":").at(-1) ?? "")
    .filter((classe) => !WITHOUT_COR.has(classe))
    .filter((classe) => /^(bg|text|border)-/.test(classe))
    .filter((classe) => !isCorDoTema(classe));

describe("bolha da mensagem", () => {
  it("o tema desliga a paleta padrão: indigo não existe", () => {
    expect(findCoresInexistentes("bg-indigo-600 text-white")).toEqual(["bg-indigo-600"]);
  });

  it("toda classe de cor das bolhas, do visto de lida e do avatar existe no tema", () => {
    expect(Object.values(BOLHA_DA_MENSAGEM).flatMap(findCoresInexistentes)).toEqual([]);
    expect(findCoresInexistentes(COR_DE_LIDA)).toEqual([]);
    expect(CORES_DO_AVATAR.flatMap(findCoresInexistentes)).toEqual([]);
  });

  it("a bolha do atendente tem fundo de destaque e texto sobre cor", () => {
    expect(findClasseDaBolha("attendant")).toContain("bg-accent-primary");
    expect(findClasseDaBolha("attendant")).toContain("text-on-color");
  });

  it("a bolha do cliente segue a superfície com texto primário", () => {
    expect(findClasseDaBolha("client")).toContain("bg-surface-1");
    expect(findClasseDaBolha("client")).toContain("text-primary");
  });
});

describe("cabeçalho e lista de atendimentos", () => {
  it("toda classe de cor de status, etiqueta e botão existe no tema", () => {
    expect(Object.values(COR_DO_STATUS).flatMap(findCoresInexistentes)).toEqual([]);
    expect(Object.values(ETIQUETA_DO_CABECALHO).flatMap(findCoresInexistentes)).toEqual([]);
    expect(Object.values(TOM_DO_BOTAO).flatMap(findCoresInexistentes)).toEqual([]);
  });

  it("status conhecido tem rótulo em português; desconhecido volta como veio", () => {
    expect(findRotuloDoStatus("paused")).toBe("Em pausa");
    expect(findRotuloDoStatus("queued")).toBe("Na fila");
    expect(findRotuloDoStatus("novo")).toBe("novo");
  });

  it("status desconhecido usa a camada neutra", () => {
    expect(findCorDoStatus("novo")).toBe("bg-layer-2 text-secondary");
  });

  it("o avatar escolhe sempre a mesma cor para o mesmo nome", () => {
    expect(findCorDoAvatar("Maria")).toBe(findCorDoAvatar("Maria"));
    expect(CORES_DO_AVATAR).toContain(findCorDoAvatar("Maria") as (typeof CORES_DO_AVATAR)[number]);
  });
});
