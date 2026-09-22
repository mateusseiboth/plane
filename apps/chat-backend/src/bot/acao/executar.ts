/**
 * Execução do passo "ação": pergunta cada campo que falta, valida a
 * resposta, chama o destino e trata o resultado.
 *
 * O estado vive no `flowState` da conversa, junto das respostas dos passos
 * "ask": `__step` é o índice do passo, `__acao` o campo que espera resposta,
 * `__arquivos` a mensagem que trouxe cada arquivo. Nada aqui toca o banco
 * direto; o motor (`engine.ts`) injeta envio, gravação e busca do arquivo.
 */
import type {
  AcaoStep,
  ArquivoDaMensagem,
  CampoDoDestino,
  Destino,
  ResultadoDoDestino,
  SessaoDoRobo,
} from "@/bot/acao/tipos";

type Estado = Record<string, unknown>;

export type AcaoDeps = {
  destinos: Record<string, Destino>;
  send: (sessao: SessaoDoRobo, texto: string) => Promise<void>;
  /** Grava o `flowState` e deixa a conversa esperando a resposta (`in_flow`). */
  saveEstado: (sessao: SessaoDoRobo, flowId: string, estado: Estado) => Promise<void>;
  /** Arquivo da última mensagem do cliente (a que respondeu o campo). */
  findArquivo: (sessionId: string) => Promise<ArquivoDaMensagem | null>;
};

export type ResultadoDoPasso = { status: "esperando" | "concluida"; state: Estado };

type Ctx = { session: SessaoDoRobo; flow: { id: string }; state: Estado; step: AcaoStep };

const CHAVES_DA_ACAO = new Set(["__acao", "__arquivos"]);

const withoutAcao = (estado: Estado): Estado =>
  Object.fromEntries(Object.entries(estado).filter(([chave]) => !CHAVES_DA_ACAO.has(chave)));

const arquivosDe = (estado: Estado) => (estado.__arquivos ?? {}) as Record<string, ArquivoDaMensagem>;

const isRespondido = (campo: CampoDoDestino, estado: Estado) =>
  campo.kind === "file" ? !!arquivosDe(estado)[campo.key] : typeof estado[campo.key] === "string";

const respostasDe = (destino: Destino, estado: Estado) =>
  Object.fromEntries(
    destino.campos.filter((c) => typeof estado[c.key] === "string").map((c) => [c.key, estado[c.key] as string])
  );

export function createAcaoRunner({ destinos, send, saveEstado, findArquivo }: AcaoDeps) {
  const prefill = (destino: Destino, sessao: SessaoDoRobo, estado: Estado): Estado => {
    const conhecidos = destino.campos
      .filter((c) => c.prefill && !isRespondido(c, estado))
      .map((c) => [c.key, c.prefill!(sessao)] as const)
      .filter(([, valor]) => !!valor);
    return { ...estado, ...Object.fromEntries(conhecidos) };
  };

  const ask = async (ctx: Ctx, campo: CampoDoDestino, estado: Estado): Promise<ResultadoDoPasso> => {
    await send(ctx.session, ctx.step.prompts?.[campo.key]?.trim() || campo.prompt);
    const esperando = { ...estado, __acao: campo.key };
    await saveEstado(ctx.session, ctx.flow.id, esperando);
    return { status: "esperando", state: esperando };
  };

  const TRATAMENTO: Record<
    ResultadoDoDestino["kind"],
    (ctx: Ctx, destino: Destino, estado: Estado, r: ResultadoDoDestino) => Promise<ResultadoDoPasso>
  > = {
    ok: async (ctx, _d, estado, r) => {
      await send(ctx.session, r.message);
      return { status: "concluida", state: withoutAcao(estado) };
    },
    falha: async (ctx, _d, estado, r) => {
      await send(ctx.session, r.message);
      return { status: "concluida", state: withoutAcao(estado) };
    },
    campo: async (ctx, destino, estado, r) => {
      await send(ctx.session, r.message);
      const campo = destino.campos.find((c) => c.key === (r as { campo: string }).campo);
      if (!campo) return { status: "concluida", state: withoutAcao(estado) };
      const { [campo.key]: _descartada, ...semResposta } = estado;
      const arquivos = Object.fromEntries(Object.entries(arquivosDe(estado)).filter(([k]) => k !== campo.key));
      return ask(ctx, campo, { ...semResposta, __arquivos: arquivos });
    },
  };

  /** Pergunta o próximo campo que falta; sem nenhum, chama o destino. */
  const advance = async (ctx: Ctx, destino: Destino, estado: Estado): Promise<ResultadoDoPasso> => {
    const faltando = destino.campos.find((c) => !isRespondido(c, estado));
    if (faltando) return ask(ctx, faltando, estado);
    const resultado = await destino.run({
      sessao: ctx.session,
      params: ctx.step.params ?? {},
      respostas: respostasDe(destino, estado),
      arquivos: arquivosDe(estado),
    });
    return TRATAMENTO[resultado.kind](ctx, destino, estado, resultado);
  };

  return {
    async start(ctx: Ctx & { index: number }): Promise<ResultadoDoPasso> {
      const destino = destinos[ctx.step.destino];
      if (!destino) return { status: "concluida", state: ctx.state };
      const impedimento = destino.readImpedimento?.(ctx.session);
      if (impedimento) {
        await send(ctx.session, impedimento);
        return { status: "concluida", state: ctx.state };
      }
      return advance(ctx, destino, prefill(destino, ctx.session, { ...ctx.state, __step: ctx.index }));
    },

    async answer(ctx: Ctx, texto: string): Promise<ResultadoDoPasso> {
      const destino = destinos[ctx.step.destino];
      const campo = destino?.campos.find((c) => c.key === ctx.state.__acao);
      if (!destino || !campo) return { status: "concluida", state: withoutAcao(ctx.state) };

      const arquivo = campo.kind === "file" ? await findArquivo(ctx.session.id) : null;
      const erro = campo.validate?.({ texto: texto.trim(), arquivo }) ?? null;
      if (erro) {
        await send(ctx.session, erro);
        return ask(ctx, campo, ctx.state);
      }
      const respondido =
        campo.kind === "file"
          ? { ...ctx.state, __arquivos: { ...arquivosDe(ctx.state), [campo.key]: arquivo } }
          : { ...ctx.state, [campo.key]: texto.trim() };
      return advance(ctx, destino, respondido);
    },
  };
}

export type AcaoRunner = ReturnType<typeof createAcaoRunner>;
