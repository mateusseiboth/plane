/**
 * Destinos do passo "ação": ouvidoria, currículo e troca do e-mail do
 * responsável. O cliente da API interna do api-ts e a leitura do arquivo são
 * dublês; sem banco e sem servidor.
 */
import { describe, expect, it, mock } from "bun:test";
import { createApiTsClient } from "@/bot/acao/api-ts";
import { createDestinos, type DestinosDeps } from "@/bot/acao/destinos";
import type { ContextoDoDestino } from "@/bot/acao/tipos";

const sessao = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "quality",
  protocol: "20260922-0001",
  clientName: "Maria",
  clientPhone: "5567999990000",
  entityContactId: null as string | null,
};

const ctx = (over: Partial<ContextoDoDestino> = {}): ContextoDoDestino => ({
  sessao,
  params: {},
  respostas: {},
  arquivos: {},
  ...over,
});

const makeDestinos = (resposta: { status: number; body: unknown } = { status: 201, body: {} }) => {
  const api = {
    postJson: mock(async () => resposta),
    postForm: mock(async () => resposta),
  };
  const readArquivo = mock(async () => new Blob(["%PDF-1.7"], { type: "application/pdf" }));
  const deps: DestinosDeps = { api, readArquivo };
  return { destinos: createDestinos(deps), api, readArquivo };
};

describe("ouvidoria", () => {
  it("valida o CNPJ ao responder e registra com o tipo do passo", async () => {
    const { destinos, api } = makeDestinos();
    const cnpj = destinos.ouvidoria.campos.find((c) => c.key === "cnpj")!;
    expect(cnpj.validate!({ texto: "123", arquivo: null })).toBe("Informe o CNPJ com 14 números.");
    expect(cnpj.validate!({ texto: "12.345.678/0001-90", arquivo: null })).toBeNull();

    const r = await destinos.ouvidoria.run(
      ctx({ params: { tipo: "reclamacao" }, respostas: { cnpj: "12345678000190", nome: "Maria", mensagem: "Caiu." } })
    );
    expect(r).toEqual({ kind: "ok", message: "Sua reclamação foi registrada. Obrigado pelo contato." });
    expect((api.postJson as any).mock.calls[0]).toEqual([
      "quality",
      "/ouvidoria/",
      {
        kind: "reclamacao",
        cnpj: "12345678000190",
        name: "Maria",
        message: "Caiu.",
        phone: "5567999990000",
        chat_session_id: sessao.id,
        protocol: "20260922-0001",
      },
    ]);
  });

  it("sem tipo no passo, registra como sugestão", async () => {
    const { destinos, api } = makeDestinos();
    await destinos.ouvidoria.run(ctx({ respostas: { cnpj: "1", nome: "a", mensagem: "b" } }));
    expect((api.postJson as any).mock.calls[0][2].kind).toBe("sugestao");
  });

  it("CNPJ recusado pela API volta para o campo cnpj", async () => {
    const { destinos } = makeDestinos({
      status: 400,
      body: { errors: [{ path: "cnpj", message: "CNPJ não encontrado. Confira os números e envie de novo." }] },
    });
    expect(await destinos.ouvidoria.run(ctx({ respostas: { cnpj: "1", nome: "a", mensagem: "b" } }))).toEqual({
      kind: "campo",
      campo: "cnpj",
      message: "CNPJ não encontrado. Confira os números e envie de novo.",
    });
  });

  it("API fora do ar: falha com mensagem curta", async () => {
    const { destinos } = makeDestinos({ status: 0, body: null });
    expect(await destinos.ouvidoria.run(ctx({ respostas: { cnpj: "1", nome: "a", mensagem: "b" } }))).toEqual({
      kind: "falha",
      message: "Não conseguimos registrar agora. Tente de novo mais tarde.",
    });
  });
});

describe("currículo", () => {
  it("só aceita PDF e envia o arquivo com nome e vaga", async () => {
    const { destinos, api, readArquivo } = makeDestinos();
    const arquivo = destinos.curriculo.campos.find((c) => c.kind === "file")!;
    expect(arquivo.validate!({ texto: "", arquivo: null })).toBe(
      "O arquivo enviado não é um PDF. Envie o currículo em PDF."
    );
    expect(
      arquivo.validate!({ texto: "", arquivo: { messageId: "m", mime: "image/png", name: "a.png" } })
    ).not.toBeNull();

    const r = await destinos.curriculo.run(
      ctx({
        respostas: { nome: "Ana", vaga: "Programador" },
        arquivos: { arquivo: { messageId: "m1", mime: "application/pdf", name: "cv.pdf" } },
      })
    );
    expect(r.kind).toBe("ok");
    expect((readArquivo as any).mock.calls[0][0]).toBe("m1");
    const [slug, caminho, form] = (api.postForm as any).mock.calls[0];
    expect([slug, caminho]).toEqual(["quality", "/curriculos/"]);
    expect(form.get("name")).toBe("Ana");
    expect(form.get("position")).toBe("Programador");
    expect(form.get("phone")).toBe("5567999990000");
    expect((form.get("file") as File).name).toBe("cv.pdf");
  });

  it("arquivo que não se consegue baixar: pede de novo", async () => {
    const { destinos, readArquivo } = makeDestinos();
    readArquivo.mockImplementation(async () => null as any);
    const r = await destinos.curriculo.run(
      ctx({
        respostas: { nome: "Ana", vaga: "X" },
        arquivos: { arquivo: { messageId: "m1", mime: "application/pdf", name: "cv.pdf" } },
      })
    );
    expect(r).toEqual({
      kind: "campo",
      campo: "arquivo",
      message: "Não conseguimos abrir o arquivo. Envie o PDF de novo.",
    });
  });
});

describe("e-mail do responsável", () => {
  it("sem responsável identificado: avisa e não pergunta", () => {
    const { destinos } = makeDestinos();
    expect(destinos.responsavel_email.readImpedimento!(sessao)).toBe(
      "Você ainda não tem cadastro conosco. Peça ao atendente para cadastrar seu nome, e-mail e entidade."
    );
    expect(destinos.responsavel_email.readImpedimento!({ ...sessao, entityContactId: "c1" })).toBeNull();
  });

  it("valida o e-mail e grava pelo api-ts", async () => {
    const { destinos, api } = makeDestinos({ status: 200, body: { email: "novo@pref.gov.br" } });
    const email = destinos.responsavel_email.campos[0]!;
    expect(email.validate!({ texto: "fulano@", arquivo: null })).toBe("E-mail inválido. Confira e envie de novo.");
    const r = await destinos.responsavel_email.run(
      ctx({ sessao: { ...sessao, entityContactId: "c1" }, respostas: { email: "Novo@Pref.gov.br" } })
    );
    expect(r).toEqual({ kind: "ok", message: "E-mail atualizado para novo@pref.gov.br." });
    expect((api.postJson as any).mock.calls[0]).toEqual([
      "quality",
      "/responsavel-email/",
      { contact_id: "c1", email: "Novo@Pref.gov.br", session_id: sessao.id },
    ]);
  });
});

describe("createApiTsClient", () => {
  it("manda o token de serviço e devolve status e corpo; rede fora vira status 0", async () => {
    const chamadas: Request[] = [];
    const cliente = createApiTsClient({
      baseUrl: "http://api-ts:8001",
      token: "segredo",
      fetch: (async (url: string, init: RequestInit) => {
        chamadas.push(new Request(url, init));
        return Response.json({ ok: true }, { status: 201 });
      }) as unknown as typeof fetch,
    });
    expect(await cliente.postJson("quality", "/ouvidoria/", { a: 1 })).toEqual({ status: 201, body: { ok: true } });
    expect(chamadas[0]!.url).toBe("http://api-ts:8001/api/internal/chat/workspaces/quality/ouvidoria/");
    expect(chamadas[0]!.headers.get("X-Service-Token")).toBe("segredo");

    const fora = createApiTsClient({
      baseUrl: "http://x",
      token: "t",
      fetch: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    expect(await fora.postJson("quality", "/ouvidoria/", {})).toEqual({ status: 0, body: null });
  });
});
