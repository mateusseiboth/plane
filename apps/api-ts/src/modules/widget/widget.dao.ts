/**
 * Acesso a dados do registro de widgets. Só consulta e grava: quem pode o quê
 * fica no service, e o escopo (global ou da pessoa) em `widget.rules.ts`.
 */
import prisma from "@db";

/** O dono vem junto: a aba "De usuários" mostra quem enviou. */
const WITH_DONO = {
  ownerUser: { select: { id: true, displayName: true, email: true, firstName: true, lastName: true } },
} as const;

export type TNovoWidget = {
  name: string;
  description: string | null;
  version: string;
  author: string;
  entryFile: string;
  manifest: Record<string, unknown>;
  permissions: string[];
  storageKey: string;
  createdById: string;
  ownerUserId: string | null;
};

export const widgetDao = {
  findVivo(id: string) {
    return prisma.widget.findFirst({ where: { id, deletedAt: null }, include: WITH_DONO });
  },

  /** Mesmo nome e versão no mesmo escopo (global, ou a mesma pessoa). */
  findMesmaVersao(alvo: { name: string; version: string; ownerUserId: string | null }) {
    return prisma.widget.findFirst({ where: { ...alvo, deletedAt: null }, select: { id: true } });
  },

  /** O widget e a primeira linha do histórico de versões, juntos. */
  createWithVersao(novo: TNovoWidget) {
    return prisma.$transaction(async (tx) => {
      const widget = await tx.widget.create({
        // Envio já entra ativo: não há fila de aprovação.
        data: { ...novo, manifest: novo.manifest as any, status: "ACTIVE" },
        include: WITH_DONO,
      });
      await tx.widgetVersion.create({
        data: {
          widgetId: widget.id,
          version: novo.version,
          storageKey: novo.storageKey,
          manifest: novo.manifest as any,
        },
      });
      return widget;
    });
  },

  findPagina(where: Record<string, unknown>, skip: number, take: number) {
    return prisma.widget.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: WITH_DONO });
  },

  count(where: Record<string, unknown>) {
    return prisma.widget.count({ where });
  },

  setDono(id: string, ownerUserId: string | null) {
    return prisma.widget.update({ where: { id }, data: { ownerUserId }, include: WITH_DONO });
  },

  update(id: string, data: Record<string, unknown>) {
    return prisma.widget.update({ where: { id }, data, include: WITH_DONO });
  },

  findVersoes(widgetId: string) {
    return prisma.widgetVersion.findMany({ where: { widgetId }, orderBy: { createdAt: "desc" } });
  },

  softDelete(id: string) {
    return prisma.widget.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
  },

  /** Membro ativo de algum espaço ativo: é quem pode ter widgets próprios. */
  async isMembroAtivo(userId: string) {
    const membro = await prisma.workspaceMember.findFirst({
      where: { memberId: userId, isActive: true, deletedAt: null, workspace: { deletedAt: null } },
      select: { id: true },
    });
    return membro !== null;
  },
};

export type WidgetDao = typeof widgetDao;
