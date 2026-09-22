/**
 * Arquitetura das permissões: nenhuma rota decide acesso pelo NÚMERO do papel.
 *
 * Toda pergunta "esta pessoa pode X?" passa pela matriz de ações
 * (`requireProjectAction`, `requireWorkspaceAction`, `hasWorkspaceAction`…).
 * Comparar `role` com número ignora a função configurada na tela, as exceções
 * por pessoa e os papéis do fork (Atendimento 6, Qualidade 8, TI 12), e foi
 * assim que Gestor ficou sem gerenciar membros e TI sem ciclos.
 *
 * Regra estrutural legítima (admin do espaço participa de todo sistema,
 * contagem de estatística) leva o marcador `permissao-estrutural` na linha ou
 * na linha de cima, com o motivo. Lê os arquivos; não sobe nada.
 */
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const SRC = path.resolve(import.meta.dir, "../../src");

const PADROES_PROIBIDOS = [
  /\brole\s*(<|>|<=|>=)\s*\d+/,
  /\brole\s*===?\s*\d+/,
  /\brole:\s*\{\s*(gte|gt|lt|lte|in)\b/,
  /\brequireWorkspaceWriter\b/,
  /\brequireWorkspaceAdmin\b/,
  /\brequireRoleAdmin\b/,
  /\bNIVEL_ADMIN\b/,
];

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((nome) => {
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) return listFiles(caminho);
    return caminho.endsWith(".ts") ? [caminho] : [];
  });

const findViolations = (): string[] =>
  listFiles(SRC).flatMap((arquivo) => {
    const linhas = readFileSync(arquivo, "utf8").split("\n");
    return linhas.flatMap((linha, i) => {
      if (linha.trim().startsWith("//") || linha.trim().startsWith("*")) return [];
      if (!PADROES_PROIBIDOS.some((p) => p.test(linha))) return [];
      const marcado = `${linhas[i - 1] ?? ""}\n${linha}`.includes("permissao-estrutural");
      return marcado ? [] : [`${path.relative(SRC, arquivo)}:${i + 1}: ${linha.trim()}`];
    });
  });

describe("checagem de acesso", () => {
  it("não compara papel com número fora da matriz de ações", () => {
    expect(findViolations()).toEqual([]);
  });
});
