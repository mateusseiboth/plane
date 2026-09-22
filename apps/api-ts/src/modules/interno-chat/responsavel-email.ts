/**
 * Troca do e-mail do responsável pelo robô do WhatsApp. O legado gravava o
 * de/para em `responsaveis_emaillog`; aqui o registro é a trilha de auditoria
 * (`entity_contact`, `update`, origem `chat`), sem tabela paralela.
 */
import prisma from "@db";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, type AuditInput } from "@utils/audit";
import { FieldValidationError, NotFoundError } from "@utils/erro-de-dominio";

const EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const responsavelEmailDao = {
  findContato: (workspaceId: string, id: string) =>
    prisma.entityContact.findFirst({ where: { id, workspaceId, deletedAt: null }, select: { id: true, email: true } }),

  saveEmail: async (id: string, email: string) => {
    await prisma.entityContact.update({ where: { id }, data: { email } });
  },
};

export type ResponsavelEmailDeps = {
  dao: typeof responsavelEmailDao;
  audit: (input: AuditInput) => Promise<void>;
};

export function createResponsavelEmailService({ dao, audit }: ResponsavelEmailDeps) {
  return {
    async update(workspaceId: string, body: Record<string, unknown>) {
      const email = String(body.email ?? "")
        .trim()
        .toLowerCase();
      if (!EMAIL.test(email)) {
        throw new FieldValidationError([{ path: "email", message: "E-mail inválido. Confira e envie de novo." }]);
      }
      const id = String(body.contact_id ?? "");
      const contato = UUID.test(id) ? await dao.findContato(workspaceId, id) : null;
      if (!contato) throw new NotFoundError("Responsável não encontrado.");

      await dao.saveEmail(contato.id, email);
      const sessao = String(body.session_id ?? "");
      await audit({
        workspaceId,
        entity: AUDIT_ENTITIES.ENTITY_CONTACT,
        entityId: contato.id,
        action: AUDIT_ACTIONS.UPDATE,
        changes: { email: { de: contato.email, para: email } },
        metadata: { origem: "chat", ...(UUID.test(sessao) ? { chat_session_id: sessao } : {}) },
      });
      return { previous_email: contato.email, email };
    },
  };
}
