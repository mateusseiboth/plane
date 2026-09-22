/**
 * Situação do servidor de cada entidade no painel do mapa (marcador vermelho
 * quando o servidor está fora).
 *
 * Quem sabe disso é o gateway dos bservers (`~/dev/js/qsSocket`), o mesmo que o
 * socketMonitor mostra na aba "Conexões". Aqui só existe o CONTRATO e a regra
 * pura; a conversa com o gateway fica em `status.gateway.ts`.
 *
 * Entidade que o gateway NÃO conhece fica sem informação (`null`), nunca
 * "offline": marcador vermelho é acusação, e acusar por falta de dado é pior
 * que não dizer nada.
 */

import type { EntidadeParaBackup } from "@modules/painel-tv/backups/fonte";

export type StatusDoServidor = {
  /** Id da entidade NO PLANE. */
  entityId: string;
  online: boolean;
  conexoes: number;
};

export interface FonteDeStatusDeServidor {
  findStatus(entidades: EntidadeParaBackup[], agora: Date): Promise<StatusDoServidor[]>;
}

/** Sem gateway configurado: nenhuma entidade recebe cor de status. */
export const FONTE_DE_STATUS_VAZIA: FonteDeStatusDeServidor = {
  findStatus: async () => [],
};

/**
 * Uma conexão como o gateway a descreve. A administração (`clients.list`) diz
 * `connected`; a lista do monitor (`getAll`) diz `status` ("healthy"/"down").
 * Aceitar os dois deixa a fonte livre para trocar de porta sem mexer na regra.
 */
export type ConexaoDoGateway = {
  entCodigo: unknown;
  connected?: boolean;
  status?: string;
  isMonitor?: boolean;
};

const STATUS_ONLINE = new Set(["healthy", "online", "up", "connected"]);

export const isConexaoAberta = (conexao: ConexaoDoGateway): boolean =>
  typeof conexao.connected === "boolean"
    ? conexao.connected
    : STATUS_ONLINE.has(String(conexao.status ?? "").toLowerCase());

type EntradaDoStatus = {
  conexoes: ConexaoDoGateway[];
  entidades: EntidadeParaBackup[];
  /** Id legado da entidade no Plane → código dela no SAC (o `entCodigo` do gateway). */
  sacPorLegado: Map<number, number>;
};

const codigoDaConexao = (conexao: ConexaoDoGateway): string => String(conexao.entCodigo ?? "").trim();

/**
 * Online = o gateway tem ao menos uma conexão ABERTA daquela entidade. O
 * monitor (a tela de operação) também é uma conexão e não conta: ele não é o
 * servidor do cliente.
 */
export function buildStatusDasEntidades({ conexoes, entidades, sacPorLegado }: EntradaDoStatus): StatusDoServidor[] {
  const porCodigo = new Map<string, ConexaoDoGateway[]>();
  for (const conexao of conexoes) {
    if (conexao.isMonitor) continue;
    const codigo = codigoDaConexao(conexao);
    if (!codigo) continue;
    porCodigo.set(codigo, [...(porCodigo.get(codigo) ?? []), conexao]);
  }

  return entidades.flatMap((entidade) => {
    const sac = entidade.legacyId === null ? undefined : sacPorLegado.get(entidade.legacyId);
    const daEntidade = sac === undefined ? undefined : porCodigo.get(String(sac));
    if (!daEntidade) return [];
    const abertas = daEntidade.filter(isConexaoAberta);
    return [{ entityId: entidade.id, online: abertas.length > 0, conexoes: abertas.length }];
  });
}
