/**
 * O chat não decide acesso pelo número do papel: pergunta a ação da matriz
 * (`hasChatAction` / `listAtendentes` em src/permissoes.ts). Lê os arquivos.
 */
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const SRC = path.resolve(import.meta.dir, "../src");
const PROIBIDOS = [/\brole\s*(<|>|<=|>=)\s*\$?\{?\s*\w*\s*\d*/, /\bPAPEL\./];

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((nome) => {
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) return listFiles(caminho);
    return caminho.endsWith(".ts") ? [caminho] : [];
  });

describe("permissões do chat", () => {
  it("nenhuma comparação numérica de papel fora da matriz", () => {
    const violacoes = listFiles(SRC).flatMap((arquivo) =>
      readFileSync(arquivo, "utf8")
        .split("\n")
        .flatMap((linha, i) =>
          PROIBIDOS.some((p) => p.test(linha)) ? [`${path.relative(SRC, arquivo)}:${i + 1}: ${linha.trim()}`] : []
        )
    );
    expect(violacoes).toEqual([]);
  });
});
