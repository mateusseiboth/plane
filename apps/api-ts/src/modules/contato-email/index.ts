/**
 * Lista de e-mails dos responsáveis para disparo (tela "Lista de e-mails").
 * Exige `contato.export`. Gerar a lista já expõe os endereços, então tanto a
 * lista quanto o CSV entram na trilha de auditoria como exportação.
 */
import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import { contatoEmailDao } from "@modules/contato-email/contato-email.dao";
import { buildEmailsCsv } from "@modules/contato-email/contato-email.rules";
import { createContatoEmailService } from "@modules/contato-email/contato-email.service";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import type { AuthUser } from "@middleware/auth";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { getWorkspaceOrFail } from "@utils/workspace";

const service = createContatoEmailService({ dao: contatoEmailDao });

type Exportacao = {
  slug: string;
  user: AuthUser;
  query: Record<string, unknown>;
  headers: Record<string, string | undefined>;
};

async function buildAuditada({ slug, user, query, headers }: Exportacao, formato: "lista" | "csv") {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceAction(ws.id, user.id, EProjectAction.CONTATO_EXPORT);
  const lista = await service.build(ws.id, query);
  void recordAudit({
    workspaceId: ws.id,
    entity: AUDIT_ENTITIES.ENTITY_CONTACT,
    entityId: "lista-de-emails",
    action: AUDIT_ACTIONS.EXPORT,
    actor: user,
    metadata: { formato, total: lista.total, filtros: JSON.stringify(lista.filtros) },
    headers,
  });
  return lista;
}

export const contatoEmailModule = new Elysia({ prefix: "/workspaces/:slug/contact-emails" })
  .use(authPlugin)

  .get("/", async ({ params: { slug }, user, query, headers }) => {
    const { total, emails, items } = await buildAuditada({ slug, user, query, headers }, "lista");
    return { total, emails, items };
  })

  .get("/export/", async ({ params: { slug }, user, query, headers, set }) => {
    const { items } = await buildAuditada({ slug, user, query, headers }, "csv");
    set.headers["Content-Type"] = "text/csv; charset=utf-8";
    set.headers["Content-Disposition"] = `attachment; filename="emails-responsaveis-${slug}.csv"`;
    set.headers["Cache-Control"] = "private, no-store";
    return buildEmailsCsv(items);
  });
