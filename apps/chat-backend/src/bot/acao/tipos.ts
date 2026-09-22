/**
 * Contrato do passo "ação" do fluxo do robô e dos destinos que ele chama.
 *
 * Um destino declara os campos que precisa; o passo coleta cada um com o
 * cliente (pulando o que já se sabe), valida e chama `run`. Destino novo =
 * um objeto novo no mapa de `destinos.ts`; o motor do robô não muda.
 */

/** O que o motor sabe da conversa (subconjunto de `chat_sessions`). */
export type SessaoDoRobo = {
  id: string;
  workspaceId: string;
  protocol: string;
  clientName: string | null;
  clientPhone: string | null;
  entityContactId: string | null;
};

/** Arquivo que o cliente mandou na mensagem que respondeu o campo. */
export type ArquivoDaMensagem = { messageId: string; mime: string | null; name: string | null };

export type RespostaDoCliente = { texto: string; arquivo: ArquivoDaMensagem | null };

export type CampoDoDestino = {
  key: string;
  label: string;
  /** Pergunta padrão; o passo pode trocar em `prompts[key]`. */
  prompt: string;
  kind: "text" | "file";
  /** Mensagem de erro para o cliente, ou null quando a resposta serve. */
  validate?: (resposta: RespostaDoCliente) => string | null;
  /** Valor que já se conhece da conversa (o nome, por exemplo): não pergunta. */
  prefill?: (sessao: SessaoDoRobo) => string | null;
};

export type ParamDoDestino = { key: string; label: string; options: Array<{ value: string; label: string }> };

export type ContextoDoDestino = {
  sessao: SessaoDoRobo;
  params: Record<string, string>;
  respostas: Record<string, string>;
  arquivos: Record<string, ArquivoDaMensagem>;
};

export type ResultadoDoDestino =
  | { kind: "ok"; message: string }
  | { kind: "campo"; campo: string; message: string }
  | { kind: "falha"; message: string };

export type Destino = {
  key: string;
  label: string;
  params: ParamDoDestino[];
  campos: CampoDoDestino[];
  /** Quando o destino não se aplica a esta conversa, a mensagem para o cliente. */
  readImpedimento?: (sessao: SessaoDoRobo) => string | null;
  run: (ctx: ContextoDoDestino) => Promise<ResultadoDoDestino>;
};

/** O passo gravado em `chat_bot_flows.steps`. */
export type AcaoStep = {
  type: "action";
  destino: string;
  params?: Record<string, string>;
  prompts?: Record<string, string>;
};
