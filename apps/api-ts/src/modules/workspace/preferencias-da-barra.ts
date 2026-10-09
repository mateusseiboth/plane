import prisma from "@db";

/**
 * Preferências da barra lateral, por pessoa e por espaço: quais itens ficam
 * fixados e em que ordem. Qualquer chave do catálogo do web é aceita; a regra de
 * qual item aparece mora no web, aqui só se guarda a escolha.
 */
export type PreferenciaDaBarra = { key: string; is_pinned?: boolean; sort_order?: number };
export type PreferenciasDaBarra = Record<string, PreferenciaDaBarra>;
export type PreferenciaRecebida = { key: string; is_pinned?: unknown; sort_order?: unknown };

const buildChaveDoAjuste = (userId: string) => `sidebar_prefs:${userId}`;

/** Campo que não veio (ou veio com tipo errado) mantém o que já estava gravado. */
export const mergePreferenciaDaBarra = (
  atual: PreferenciaDaBarra | undefined,
  recebida: PreferenciaRecebida
): PreferenciaDaBarra => ({
  ...atual,
  key: recebida.key,
  ...(typeof recebida.is_pinned === "boolean" ? { is_pinned: recebida.is_pinned } : {}),
  ...(typeof recebida.sort_order === "number" ? { sort_order: recebida.sort_order } : {}),
});

export const isPreferenciaRecebida = (valor: unknown): valor is PreferenciaRecebida =>
  typeof (valor as PreferenciaRecebida | null)?.key === "string" && (valor as PreferenciaRecebida).key !== "";

export const readPreferenciasDaBarra = async (workspaceId: string, userId: string): Promise<PreferenciasDaBarra> => {
  const ajuste = await prisma.workspaceSetting.findFirst({ where: { workspaceId, key: buildChaveDoAjuste(userId) } });
  return (ajuste?.value as PreferenciasDaBarra | null) ?? {};
};

/** Grava as preferências recebidas por cima das gravadas e devolve o mapa inteiro. */
export const applyPreferenciasDaBarra = async (
  workspaceId: string,
  userId: string,
  recebidas: PreferenciaRecebida[]
): Promise<PreferenciasDaBarra> => {
  const atuais = await readPreferenciasDaBarra(workspaceId, userId);
  const mapa: PreferenciasDaBarra = { ...atuais };
  for (const recebida of recebidas) mapa[recebida.key] = mergePreferenciaDaBarra(mapa[recebida.key], recebida);
  const key = buildChaveDoAjuste(userId);
  await prisma.workspaceSetting.upsert({
    where: { workspaceId_key: { workspaceId, key } },
    create: { workspaceId, key, value: mapa },
    update: { value: mapa },
  });
  return mapa;
};
