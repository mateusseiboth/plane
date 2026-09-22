/**
 * Passo genérico "ação" do fluxo do robô: coleta os campos que o destino pede
 * (pulando o que já se sabe), valida cada resposta, chama o destino e trata o
 * resultado (sucesso, campo recusado pela API, falha). Destinos, envio e
 * gravação de estado são dublês; sem banco e sem servidor.
 */
import { describe, expect, it, mock } from "bun:test";
import { createAcaoRunner, type AcaoDeps } from "@/bot/acao/executar";
import type { Destino, ResultadoDoDestino } from "@/bot/acao/tipos";

const sessao = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  workspaceId: "quality",
  protocol: "20260922-0001",
  clientName: "Maria",
  clientPhone: "5567999990000",
  entityContactId: null,
  ...over,
});

const destinoDeTeste = (run: Destino["run"], over: Partial<Destino> = {}): Destino => ({
  key: "teste",
  label: "Teste",
  params: [],
  campos: [
    { key: "nome", label: "Nome", prompt: "Qual é o seu nome?", kind: "text", prefill: (s) => s.clientName ?? null },
    {
      key: "cnpj",
      label: "CNPJ",
      prompt: "Digite o CNPJ.",
      kind: "text",
      validate: ({ texto }) => (texto.replace(/\D/g, "").length === 14 ? null : "Informe o CNPJ com 14 números."),
    },
    { key: "mensagem", label: "Mensagem", prompt: "Escreva a mensagem.", kind: "text" },
  ],
  run,
  ...over,
});

const makeRunner = (destino: Destino, over: Partial<AcaoDeps> = {}) => {
  const enviadas: string[] = [];
  const estados: Array<Record<string, unknown>> = [];
  const deps: AcaoDeps = {
    destinos: { [destino.key]: destino },
    send: mock(async (_s, texto: string) => {
      enviadas.push(texto);
    }),
    saveEstado: mock(async (_s, _flowId, estado) => {
      estados.push(estado);
    }),
    findArquivo: mock(async () => null),
    ...over,
  };
  return { runner: createAcaoRunner(deps), enviadas, estados, deps };
};

const flow = { id: "f1" };
const step = { type: "action" as const, destino: "teste", params: { tipo: "reclamacao" } };
const ok = (message: string): ResultadoDoDestino => ({ kind: "ok", message });

describe("start", () => {
  it("pula o que já se sabe e pergunta o primeiro campo que falta", async () => {
    const { runner, enviadas, estados } = makeRunner(destinoDeTeste(async () => ok("feito")));
    const r = await runner.start({ session: sessao(), flow, index: 2, state: {}, step });
    expect(r.status).toBe("esperando");
    expect(enviadas).toEqual(["Digite o CNPJ."]);
    expect(estados.at(-1)).toMatchObject({ nome: "Maria", __step: 2, __acao: "cnpj" });
  });

  it("usa a pergunta configurada no passo quando houver", async () => {
    const { runner, enviadas } = makeRunner(destinoDeTeste(async () => ok("feito")));
    await runner.start({
      session: sessao(),
      flow,
      index: 0,
      state: {},
      step: { ...step, prompts: { cnpj: "CNPJ da prefeitura, só números:" } },
    });
    expect(enviadas).toEqual(["CNPJ da prefeitura, só números:"]);
  });

  it("destino que não existe não trava o fluxo", async () => {
    const { runner, enviadas } = makeRunner(destinoDeTeste(async () => ok("x")));
    const r = await runner.start({ session: sessao(), flow, index: 0, state: {}, step: { ...step, destino: "sumiu" } });
    expect(r.status).toBe("concluida");
    expect(enviadas).toEqual([]);
  });

  it("impedimento do destino: avisa e segue sem perguntar nada", async () => {
    const destino = destinoDeTeste(async () => ok("x"), {
      readImpedimento: () => "Você ainda não tem cadastro conosco.",
    });
    const { runner, enviadas } = makeRunner(destino);
    const r = await runner.start({ session: sessao(), flow, index: 0, state: {}, step });
    expect(r.status).toBe("concluida");
    expect(enviadas).toEqual(["Você ainda não tem cadastro conosco."]);
  });
});

describe("answer", () => {
  const esperandoCnpj = { nome: "Maria", __step: 2, __acao: "cnpj" };

  it("resposta inválida: explica e pergunta de novo", async () => {
    const { runner, enviadas } = makeRunner(destinoDeTeste(async () => ok("x")));
    const r = await runner.answer({ session: sessao(), flow, state: esperandoCnpj, step }, "123");
    expect(r.status).toBe("esperando");
    expect(enviadas).toEqual(["Informe o CNPJ com 14 números.", "Digite o CNPJ."]);
  });

  it("com tudo respondido chama o destino com as respostas e os parâmetros do passo", async () => {
    const run = mock(async () => ok("Sua reclamação foi registrada."));
    const { runner, enviadas, estados } = makeRunner(destinoDeTeste(run));
    await runner.answer({ session: sessao(), flow, state: esperandoCnpj, step }, "12.345.678/0001-90");
    const r = await runner.answer({ session: sessao(), flow, state: estados.at(-1)!, step }, "O sistema caiu.");
    expect(r.status).toBe("concluida");
    expect((run as any).mock.calls[0][0]).toMatchObject({
      params: { tipo: "reclamacao" },
      respostas: { nome: "Maria", cnpj: "12.345.678/0001-90", mensagem: "O sistema caiu." },
    });
    expect(enviadas.at(-1)).toBe("Sua reclamação foi registrada.");
    expect(r.state.__acao).toBeUndefined();
  });

  it("campo recusado pelo destino: apaga a resposta e pergunta de novo", async () => {
    const run = mock(
      async (): Promise<ResultadoDoDestino> => ({
        kind: "campo",
        campo: "cnpj",
        message: "CNPJ não encontrado. Confira os números e envie de novo.",
      })
    );
    const { runner, enviadas } = makeRunner(destinoDeTeste(run));
    const r = await runner.answer(
      {
        session: sessao(),
        flow,
        state: { nome: "Maria", cnpj: "12345678000190", __step: 2, __acao: "mensagem" },
        step,
      },
      "Texto"
    );
    expect(r.status).toBe("esperando");
    expect(r.state.cnpj).toBeUndefined();
    expect(r.state.__acao).toBe("cnpj");
    expect(enviadas).toEqual(["CNPJ não encontrado. Confira os números e envie de novo.", "Digite o CNPJ."]);
  });

  it("falha do destino (API fora): avisa e segue o fluxo", async () => {
    const { runner, enviadas } = makeRunner(
      destinoDeTeste(async () => ({
        kind: "falha",
        message: "Não conseguimos registrar agora. Tente de novo mais tarde.",
      }))
    );
    const r = await runner.answer(
      {
        session: sessao(),
        flow,
        state: { nome: "Maria", cnpj: "12345678000190", __step: 2, __acao: "mensagem" },
        step,
      },
      "Texto"
    );
    expect(r.status).toBe("concluida");
    expect(enviadas).toEqual(["Não conseguimos registrar agora. Tente de novo mais tarde."]);
  });

  it("campo de arquivo guarda a mensagem com o arquivo; sem arquivo, explica", async () => {
    const destino = destinoDeTeste(async () => ok("Currículo recebido."), {
      campos: [
        {
          key: "arquivo",
          label: "Currículo",
          prompt: "Envie o currículo em PDF.",
          kind: "file",
          validate: ({ arquivo }) =>
            arquivo?.mime === "application/pdf" ? null : "O arquivo enviado não é um PDF. Envie o currículo em PDF.",
        },
      ],
    });
    const semArquivo = makeRunner(destino);
    const r1 = await semArquivo.runner.answer(
      { session: sessao(), flow, state: { __step: 0, __acao: "arquivo" }, step },
      ""
    );
    expect(r1.status).toBe("esperando");
    expect(semArquivo.enviadas[0]).toBe("O arquivo enviado não é um PDF. Envie o currículo em PDF.");

    const run = mock(async () => ok("Currículo recebido."));
    const comArquivo = makeRunner(
      { ...destino, run },
      { findArquivo: mock(async () => ({ messageId: "m9", mime: "application/pdf", name: "cv.pdf" })) }
    );
    const r2 = await comArquivo.runner.answer(
      { session: sessao(), flow, state: { __step: 0, __acao: "arquivo" }, step },
      ""
    );
    expect(r2.status).toBe("concluida");
    expect((run as any).mock.calls[0][0].arquivos).toEqual({
      arquivo: { messageId: "m9", mime: "application/pdf", name: "cv.pdf" },
    });
  });
});
