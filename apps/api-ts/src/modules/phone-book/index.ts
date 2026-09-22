// Agenda "Telefones" (legado intra_telefones.php): quem está ativo no espaço, de
// A a Z, com apelido, telefone e celular. Congelado no espaço ou conta
// desativada não aparece.

import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";

type PhoneBookRow = {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  email: string;
  phone: string | null;
  mobilePhone: string | null;
  avatarUrl: string | null;
};

function phoneBookDto(u: PhoneBookRow) {
  return {
    id: u.id,
    display_name: u.displayName,
    first_name: u.firstName,
    last_name: u.lastName,
    nickname: u.nickname,
    email: u.email,
    phone: u.phone,
    mobile_phone: u.mobilePhone,
    avatar_url: u.avatarUrl,
  };
}

async function listPhoneBook(workspaceId: string) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, isActive: true, deletedAt: null, member: { isActive: true, deletedAt: null } },
    select: {
      member: {
        select: {
          id: true,
          displayName: true,
          firstName: true,
          lastName: true,
          nickname: true,
          email: true,
          phone: true,
          mobilePhone: true,
          avatarUrl: true,
        },
      },
    },
  });
  return members
    .map((m) => phoneBookDto(m.member))
    .toSorted((a, b) => a.display_name.localeCompare(b.display_name, "pt-BR", { sensitivity: "base" }));
}

export const phoneBookModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  .get("/phone-book/", async ({ params: { slug }, user, headers }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const agenda = await listPhoneBook(ws.id);
    // LGPD: telefone é dado pessoal, e ler a lista também é tratamento.
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.MEMBER,
      entityId: ws.id,
      action: AUDIT_ACTIONS.LIST,
      actor: user,
      headers,
      metadata: { total: agenda.length, tela: "telefones" },
    });
    return agenda;
  });
