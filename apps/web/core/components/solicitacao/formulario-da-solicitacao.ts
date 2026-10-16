/**
 * Regras do modal de solicitação, sem React: o pedido que vai para a API e o
 * que falta para enviar. O mesmo modal abre a solicitação pela conversa do chat
 * (rota from-chat) e pelo botão "Nova solicitação" (rota padrão da triagem).
 */

export type FormularioDaSolicitacao = {
  projectId: string;
  titulo: string;
  moduloId: string;
  /** Vazio: sem entidade. */
  entidadeId: string;
  /** HTML do editor de texto rico. */
  complementoHtml: string;
  /** Cliente parado: prioridade urgente (como no SAC). */
  clienteParado: boolean;
};

export type DadosDaSolicitacao = {
  name: string;
  priority: "urgent" | "none";
  module_id?: string;
  entity_id: string | null;
  description_html?: string;
};

export type PedidoDeSolicitacao = { projectId: string; dados: DadosDaSolicitacao };

export type ErroDoCampo = { path: string; message: string };

const isComplementoVazio = (html: string) => !html.replace(/<[^>]+>/g, "").trim();

export const buildPedidoDaSolicitacao = (formulario: FormularioDaSolicitacao): PedidoDeSolicitacao => ({
  projectId: formulario.projectId,
  dados: {
    name: formulario.titulo.trim(),
    priority: formulario.clienteParado ? "urgent" : "none",
    ...(formulario.moduloId ? { module_id: formulario.moduloId } : {}),
    entity_id: formulario.entidadeId || null,
    ...(isComplementoVazio(formulario.complementoHtml) ? {} : { description_html: formulario.complementoHtml }),
  },
});

const PENDENCIAS: Array<[(formulario: FormularioDaSolicitacao) => boolean, string]> = [
  [(f) => !f.projectId, "Escolha o sistema."],
  [(f) => !f.titulo.trim(), "Informe o título."],
];

/** A primeira coisa que falta para enviar, ou `undefined` quando nada falta. */
export const findPendenciaDaSolicitacao = (formulario: FormularioDaSolicitacao): string | undefined =>
  PENDENCIAS.find(([isFaltando]) => isFaltando(formulario))?.[1];

/** A mensagem que a API devolveu para um campo (`errors: [{ path, message }]`). */
export const readErroDoCampoDaSolicitacao = (erros: ErroDoCampo[], path: string): string | undefined =>
  erros.find((erro) => erro.path === path)?.message;
