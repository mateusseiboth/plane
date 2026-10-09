/**
 * Toda classe de cor do chat precisa existir no tema. O tema desliga a paleta
 * padrão do Tailwind: `bg-amber-50`, `bg-primary` e afins não geram CSS e a tela
 * perde fundo, borda ou texto sem erro nenhum. Rodar com
 * `bun test core/components/chat/classes-do-tema`.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { findClassesForaDoTema } from "@/components/chat/classes-do-tema";

// O pacote só exporta o index.css; o tema mora ao lado dele.
const TEMA = readFileSync(join(dirname(require.resolve("@plane/tailwind-config/index.css")), "variables.css"), "utf8");

const PASTA_DO_CHAT = import.meta.dir;

const listArquivosDoChat = () =>
  [...new Bun.Glob("**/*.{ts,tsx}").scanSync(PASTA_DO_CHAT)].filter((arquivo) => !arquivo.endsWith(".test.ts"));

describe("findClassesForaDoTema", () => {
  it("acusa a paleta padrão e os atalhos que o tema não tem", () => {
    expect(
      findClassesForaDoTema('"bg-amber-50 text-red-600 dark:bg-indigo-900/20 hover:bg-primary/90 border-primary"', TEMA)
    ).toEqual(["bg-amber-50", "text-red-600", "bg-indigo-900", "bg-primary", "border-primary"]);
  });

  it("aceita os tokens do tema, branco e preto", () => {
    expect(
      findClassesForaDoTema(
        '"bg-accent-primary text-on-color border-accent-strong hover:bg-accent-primary-hover ring-danger-strong text-white bg-black/40"',
        TEMA
      )
    ).toEqual([]);
  });

  it("ignora tamanho, alinhamento, largura e estilo de borda", () => {
    expect(
      findClassesForaDoTema(
        '"text-sm text-11 text-left border border-2 border-b border-t-0 border-dashed ring-4 ring-inset bg-transparent fill-current text-[10px]"',
        TEMA
      )
    ).toEqual([]);
  });

  it("aceita cor de borda com lado", () => {
    expect(findClassesForaDoTema('"border-b-subtle border-t-danger-strong"', TEMA)).toEqual([]);
  });

  it("ignora comentários", () => {
    expect(findClassesForaDoTema("// antes era bg-indigo-600\n/* e text-green-600 */", TEMA)).toEqual([]);
  });
});

describe("código do chat", () => {
  it("nenhum arquivo de components/chat usa classe de cor que o tema não gera", () => {
    const foraDoTema = listArquivosDoChat()
      .map((arquivo) => ({
        arquivo,
        classes: findClassesForaDoTema(readFileSync(join(PASTA_DO_CHAT, arquivo), "utf8"), TEMA),
      }))
      .filter(({ classes }) => classes.length > 0);
    expect(foraDoTema).toEqual([]);
  });
});
