/**
 * A conferência do arquivo que chega do portal.
 *
 * Upload de gente de fora, sem conta no Plane: o que o navegador diz sobre o
 * arquivo é palpite, não prova. Por isso a extensão, o tipo informado e os
 * primeiros bytes precisam contar a MESMA história — e só as três juntas
 * liberam o arquivo.
 */
import { describe, expect, it } from "bun:test";
import { conferirArquivo, LIMITES_DE_ANEXO, nomeSeguro } from "@modules/portal/anexos";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MP4 = Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]);

const arquivo = (extra: Partial<Parameters<typeof conferirArquivo>[0]>) =>
  conferirArquivo({ nome: "tela.png", tipoInformado: "image/png", tamanho: 1024, inicio: PNG, ...extra });

describe("conferirArquivo", () => {
  it("aceita imagem, vídeo e PDF — o que o cliente realmente manda", () => {
    expect(arquivo({})).toMatchObject({ aceito: true, tipo: "image/png", familia: "imagem" });
    expect(arquivo({ nome: "gravacao.mp4", tipoInformado: "video/mp4", inicio: MP4 })).toMatchObject({
      aceito: true,
      tipo: "video/mp4",
      familia: "video",
    });
    expect(arquivo({ nome: "oficio.pdf", tipoInformado: "application/pdf", inicio: PDF })).toMatchObject({
      aceito: true,
      tipo: "application/pdf",
    });
  });

  it("recusa executável, SVG e HTML", () => {
    expect(arquivo({ nome: "virus.exe", tipoInformado: "application/x-msdownload", inicio: EXE })).toMatchObject({
      aceito: false,
      situacao: 415,
    });
    expect(arquivo({ nome: "desenho.svg", tipoInformado: "image/svg+xml", inicio: PNG })).toMatchObject({
      aceito: false,
      situacao: 415,
    });
    expect(arquivo({ nome: "pagina.html", tipoInformado: "text/html", inicio: PNG })).toMatchObject({
      aceito: false,
      situacao: 415,
    });
  });

  it("recusa quando os bytes desmentem a extensão", () => {
    expect(arquivo({ nome: "disfarcado.png", tipoInformado: "image/png", inicio: EXE })).toMatchObject({
      aceito: false,
      situacao: 415,
    });
  });

  it("ignora o tipo informado quando ele briga com a extensão", () => {
    // O navegador manda `application/octet-stream` sempre que não reconhece o
    // arquivo; a extensão e os bytes decidem, e o tipo guardado é o nosso.
    expect(arquivo({ tipoInformado: "application/octet-stream" })).toMatchObject({ aceito: true, tipo: "image/png" });
    expect(arquivo({ tipoInformado: "text/html" })).toMatchObject({ aceito: false, situacao: 415 });
  });

  it("recusa arquivo vazio", () => {
    expect(arquivo({ tamanho: 0 })).toMatchObject({ aceito: false, situacao: 400 });
  });

  it("cobra o teto de 25 MB para imagem e documento", () => {
    expect(arquivo({ tamanho: LIMITES_DE_ANEXO.tamanho.padrao })).toMatchObject({ aceito: true });
    expect(arquivo({ tamanho: LIMITES_DE_ANEXO.tamanho.padrao + 1 })).toMatchObject({ aceito: false, situacao: 413 });
  });

  it("cobra o teto de 100 MB para vídeo", () => {
    const video = { nome: "gravacao.mp4", tipoInformado: "video/mp4", inicio: MP4 };
    expect(arquivo({ ...video, tamanho: LIMITES_DE_ANEXO.tamanho.video })).toMatchObject({ aceito: true });
    expect(arquivo({ ...video, tamanho: LIMITES_DE_ANEXO.tamanho.video + 1 })).toMatchObject({
      aceito: false,
      situacao: 413,
    });
  });
});

describe("nomeSeguro", () => {
  it("descarta o caminho e fica só com o nome do arquivo", () => {
    expect(nomeSeguro("C:\\Users\\ana\\Desktop\\tela.png")).toBe("tela.png");
    expect(nomeSeguro("../../etc/passwd.txt")).toBe("passwd.txt");
  });

  it("preserva acento, que é o normal em nome de arquivo brasileiro", () => {
    expect(nomeSeguro("ofício nº 12.pdf")).toBe("ofício nº 12.pdf");
  });

  it("tira caractere de controle e quebra de linha", () => {
    expect(nomeSeguro("tela\n\r\u0000.png")).toBe("tela.png");
  });

  it("dá um nome quando não sobra nada", () => {
    expect(nomeSeguro("")).toBe("arquivo");
    expect(nomeSeguro("   ")).toBe("arquivo");
  });
});
