/**
 * Service da lista de e-mails dos responsáveis para disparo. A permissão
 * (`contato.export`) e a auditoria da exportação ficam na rota.
 */
import type { ContatoEmailDao } from "@modules/contato-email/contato-email.dao";
import {
  buildContatoWhere,
  mergeEmails,
  readFiltrosDaLista,
  type EmailDaLista,
  type FiltrosDaLista,
} from "@modules/contato-email/contato-email.rules";

export type ContatoEmailDeps = { dao: ContatoEmailDao };

export function createContatoEmailService({ dao }: ContatoEmailDeps) {
  const findResponsaveis = async (workspaceId: string, filtros: FiltrosDaLista): Promise<EmailDaLista[]> =>
    (await dao.findContatos(buildContatoWhere(workspaceId, filtros))).map((c) => ({
      email: c.email ?? "",
      name: c.name,
      entity_name: c.entity?.name ?? null,
      origem: "responsavel",
    }));

  const findInternos = async (workspaceId: string, filtros: FiltrosDaLista): Promise<EmailDaLista[]> => {
    if (!filtros.isWithMembers) return [];
    return (await dao.findMembros(workspaceId)).map((m) => ({
      email: m.email,
      name: m.displayName,
      entity_name: null,
      origem: "interno",
    }));
  };

  return {
    async build(workspaceId: string, query: Record<string, unknown>) {
      const filtros = readFiltrosDaLista(query);
      const [responsaveis, internos] = await Promise.all([
        findResponsaveis(workspaceId, filtros),
        findInternos(workspaceId, filtros),
      ]);
      const items = mergeEmails([...responsaveis, ...internos]);
      return { filtros, total: items.length, emails: items.map((i) => i.email), items };
    },
  };
}
