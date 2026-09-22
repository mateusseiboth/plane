/**
 * Relatórios de atendimento e consulta dos registros encerrados. Leitura de
 * gestão: `chat.gerenciar` (a mesma dos relatórios de avaliação e SLA).
 */

import { Elysia } from "elysia";
import { authorizeChat, isNegado } from "@/acesso";
import { CHAT_ACTION } from "@/permissoes";
import { readFusoDoWorkspace } from "@/presence";
import { listRegistros, readRelatorioDeAtendimentos } from "@/relatorios/atendimentos";

type Contexto = {
  params: { slug: string };
  query: Record<string, string | undefined>;
  headers: unknown;
  set: { status?: number | string };
};

const gerencial =
  (ler: (slug: string, query: Record<string, string | undefined>) => Promise<unknown>) =>
  async ({ params: { slug }, query, headers, set }: Contexto) => {
    const acesso = await authorizeChat(slug, headers, CHAT_ACTION.GERENCIAR);
    if (isNegado(acesso)) {
      set.status = acesso.status;
      return acesso.body;
    }
    return ler(slug, query ?? {});
  };

export const relatoriosModule = new Elysia()
  .get(
    "/workspaces/:slug/reports/atendimentos/",
    gerencial(async (slug, query) => readRelatorioDeAtendimentos(slug, query, await readFusoDoWorkspace(slug)))
  )
  .get("/workspaces/:slug/registros/", gerencial(listRegistros));
