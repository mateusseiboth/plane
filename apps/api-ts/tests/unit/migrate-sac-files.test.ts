/**
 * Funções puras da migração de arquivos do SAC (scripts/migrate-sac-files.ts).
 * Elas decidem nome, mime e chave de storage de cada anexo migrado — errar aqui
 * significa arquivo servido com o tipo errado ou sobrescrito por outro.
 */

import { describe, expect, test } from "bun:test";
import { assetKeyFor, fileNameFor, mimeFor } from "../../scripts/migrate-sac-files";

describe("fileNameFor", () => {
  test("extrai o nome do arquivo do caminho legado", () => {
    expect(fileNameFor("arquivos_usuarios/2026/05/458325/Relatorio_(4).pdf")).toBe("Relatorio_(4).pdf");
    expect(fileNameFor("arquivos_disco/2025/12/LGPD.pdf")).toBe("LGPD.pdf");
  });

  test("tolera barras extras e caminho vazio", () => {
    expect(fileNameFor("/pasta//sub/foto.png")).toBe("foto.png");
    expect(fileNameFor("")).toBe("arquivo");
  });
});

describe("mimeFor", () => {
  test("resolve os tipos comuns do acervo legado", () => {
    expect(mimeFor("captura.png")).toBe("image/png");
    expect(mimeFor("planilha.xlsx")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(mimeFor("relatorio.PDF")).toBe("application/pdf");
    expect(mimeFor("gravacao.mkv")).toBe("video/x-matroska");
  });

  test("cai no tipo genérico quando a extensão é desconhecida ou ausente", () => {
    expect(mimeFor("dump.bkp")).toBe("application/octet-stream");
    expect(mimeFor("arquivo_sem_extensao")).toBe("application/octet-stream");
  });
});

describe("assetKeyFor", () => {
  test("gera chave determinística por escopo, dono e id legado", () => {
    const key = assetKeyFor("issues", "11111111-1111-1111-1111-111111111111", 458325, "arquivos_usuarios/2026/05/x/nota.pdf");
    expect(key).toBe("issues/11111111-1111-1111-1111-111111111111/legacy/458325-nota.pdf");
    // Reprocessar produz a mesma chave (não duplica objeto no storage).
    expect(assetKeyFor("issues", "11111111-1111-1111-1111-111111111111", 458325, "arquivos_usuarios/2026/05/x/nota.pdf")).toBe(key);
  });

  test("neutraliza caracteres problemáticos no nome do arquivo", () => {
    const key = assetKeyFor("disco", "ws-1", 7, "arquivos_disco/2025/Política de Privacidade (LGPD).pdf");
    expect(key).toBe("disco/ws-1/legacy/7-Pol_tica_de_Privacidade__LGPD_.pdf");
    expect(key).not.toContain(" ");
  });

  test("mesma origem em escopos diferentes não colide", () => {
    expect(assetKeyFor("issues", "a", 1, "x/y.pdf")).not.toBe(assetKeyFor("visits", "a", 1, "x/y.pdf"));
  });
});
