/**
 * Banco anexado no texto: o que o bloco mostra, o que fica gravado e a espera
 * da preparação do arquivo no servidor de backups (o link nasce a cada clique).
 * Rodar com `bun test core/components/banco-anexo`.
 */
import { describe, expect, it, mock } from "bun:test";
import { buildAttrsDoBanco, readRotuloDoBanco, waitPreparacao } from "@/components/banco-anexo/banco-anexo";

describe("buildAttrsDoBanco", () => {
  it("guarda o número do backup e o que identifica o arquivo", () => {
    expect(
      buildAttrsDoBanco(
        { id: "123", file_name: "siart.zip", received_at: "2026-11-18T13:00:00Z" },
        { entidade: "CAMARA DE ANGELICA", sistema: "SIART" }
      )
    ).toEqual({
      envio: "123",
      nome: "siart.zip",
      entidade: "CAMARA DE ANGELICA",
      sistema: "SIART",
      recebidoEm: "2026-11-18T13:00:00Z",
    });
  });
});

describe("readRotuloDoBanco", () => {
  it("nome, entidade, sistema e o dia do envio", () => {
    expect(
      readRotuloDoBanco({
        envio: "1",
        nome: "siart.zip",
        entidade: "CAMARA",
        sistema: "SIART",
        recebidoEm: "2026-11-18T13:00:00Z",
      })
    ).toBe("siart.zip · CAMARA · SIART · 18/11/2026");
  });

  it("sem os dados, mostra o que houver", () => {
    expect(readRotuloDoBanco({ envio: "9", nome: null, entidade: null, sistema: null, recebidoEm: null })).toBe(
      "Banco 9"
    );
  });
});

describe("waitPreparacao", () => {
  const semEspera = async () => undefined;

  it("pergunta até ficar pronto e devolve a URL", async () => {
    const respostas = [
      { id: "p1", estado: "preparando", url: null, mensagem: null },
      { id: "p1", estado: "pronto", url: "https://bkp/x.zip", mensagem: null },
    ];
    const ler = mock(async () => respostas.shift()!);
    expect(await waitPreparacao({ id: "p1", estado: "preparando", url: null, mensagem: null }, ler, semEspera)).toBe(
      "https://bkp/x.zip"
    );
    expect(ler).toHaveBeenCalledTimes(2);
  });

  it("erro da preparação vira a mensagem do servidor", async () => {
    const ler = async () => ({ id: "p1", estado: "erro", url: null, mensagem: "O arquivo não está mais no servidor." });
    await expect(
      waitPreparacao({ id: "p1", estado: "preparando", url: null, mensagem: null }, ler, semEspera)
    ).rejects.toThrow("O arquivo não está mais no servidor.");
  });

  it("já pronto na primeira resposta: não pergunta de novo", async () => {
    const ler = mock(async () => ({ id: "p1", estado: "pronto", url: "u", mensagem: null }));
    expect(await waitPreparacao({ id: "p1", estado: "pronto", url: "u", mensagem: null }, ler, semEspera)).toBe("u");
    expect(ler).not.toHaveBeenCalled();
  });
});
