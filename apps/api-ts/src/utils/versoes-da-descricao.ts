/**
 * Rastro das alterações do corpo do chamado.
 *
 * Regra do produto: qualquer um com permissão reescreve a descrição — o que
 * fica gravado é o rastro. Antes de a nova descrição entrar, o estado ANTERIOR
 * (`description_html`, `description_json`, `name`) vira uma linha em
 * `issue_versions` com quem alterou e quando. É essa tabela que alimenta o
 * seletor "Última edição por…" e a restauração de versões.
 *
 * A conferência é por CONTEÚDO, não pela presença do campo: reenviar a MESMA
 * descrição junto de uma troca de estado não é alteração e não gera versão.
 * Sem isso, qualquer cliente que devolvesse o chamado inteiro no PATCH
 * encheria o histórico de versões idênticas.
 *
 * VOLUME. O editor salva sozinho a cada ~1,5 s de digitação: uma versão por
 * autosave encheria a tabela (são 51 mil chamados em produção). Gravações
 * seguidas do MESMO autor dentro de uma janela de 10 minutos contam como uma
 * única sessão de edição — a primeira versão da sessão já guarda o "antes", as
 * seguintes não acrescentam nada. Autor diferente sempre abre sessão nova, que
 * é justamente o caso que o dono do produto quer enxergar. É o mesmo
 * agrupamento do Django legado (`track_page_version`: 600 s por usuário, com
 * poda do histórico).
 */
import prisma from "@db";

/** Duas gravações do mesmo autor dentro desta janela são a mesma edição. */
export const JANELA_DE_SESSAO_MS = 600_000;

/** Quantas versões cada chamado guarda; as mais antigas são podadas. */
export const VERSOES_MANTIDAS = 20;

/** O que o rastro precisa saber do chamado já gravado. */
export type ChamadoAntesDoPatch = {
  id: string;
  workspaceId: string;
  projectId: string;
  name?: string | null;
  descriptionHtml?: string | null;
  descriptionStripped?: string | null;
  descriptionJson?: unknown;
  priority?: string | null;
  stateId?: string | null;
  startDate?: Date | null;
  targetDate?: Date | null;
  isDraft?: boolean | null;
  completedAt?: Date | null;
  archivedAt?: Date | null;
};

type Corpo = Record<string, unknown> | null | undefined;

const texto = (valor: unknown): string => (valor === null || valor === undefined ? "" : String(valor));

const json = (valor: unknown): string => (valor === null || valor === undefined ? "" : JSON.stringify(valor));

/**
 * Campos de PATCH que escrevem o corpo do chamado, e como comparar cada um com
 * o que está gravado. `description` é o nome legado do JSON — a criação aceita
 * os dois nomes, então a comparação também.
 */
const CAMPOS_DO_CORPO: Record<string, (antes: ChamadoAntesDoPatch, enviado: unknown) => boolean> = {
  description_html: (antes, enviado) => texto(enviado) !== texto(antes.descriptionHtml),
  description_stripped: (antes, enviado) => texto(enviado) !== texto(antes.descriptionStripped),
  description_json: (antes, enviado) => json(enviado) !== json(antes.descriptionJson),
  description: (antes, enviado) => json(enviado) !== json(antes.descriptionJson),
};

/** `true` quando o pedido MUDA de fato a descrição gravada. */
export function descricaoMudou(antes: ChamadoAntesDoPatch | null | undefined, corpo: Corpo): boolean {
  if (!antes || !corpo) return false;
  return Object.entries(CAMPOS_DO_CORPO).some(
    ([campo, mudou]) => corpo[campo] !== undefined && mudou(antes, corpo[campo]),
  );
}

/**
 * Gravação automática do editor, não edição de gente.
 *
 * Ao abrir um chamado com HTML legado, o editor normaliza o conteúdo e dispara
 * um PATCH sozinho, marcado com `skip_activity`. Esse PATCH não é alteração de
 * ninguém: não gera versão nem entra na trilha.
 */
export function ehGravacaoAutomatica(corpo: Corpo): boolean {
  const marca = corpo?.skip_activity;
  return marca === true || marca === "true";
}

/** A última versão do chamado ainda é da sessão de edição deste autor? */
const mesmaSessao = (versao: {ownedById: string | null; lastSavedAt: Date} | null, autorId: string): boolean => {
  if (!versao || versao.ownedById !== autorId) return false;
  return Date.now() - versao.lastSavedAt.getTime() <= JANELA_DE_SESSAO_MS;
};

/** Mantém só as `VERSOES_MANTIDAS` mais recentes, como o Django legado. */
async function podarHistorico(issueId: string): Promise<void> {
  const excedentes = await prisma.issueVersion.findMany({
    where: {issueId},
    orderBy: {lastSavedAt: "desc"},
    skip: VERSOES_MANTIDAS,
    select: {id: true},
  });
  if (!excedentes.length) return;
  await prisma.issueVersion.deleteMany({where: {id: {in: excedentes.map((v) => v.id)}}});
}

/**
 * Guarda o estado anterior do chamado antes de a descrição ser reescrita.
 *
 * Devolve `true` quando abriu uma versão nova — é o sinal de que a alteração
 * também deve entrar na trilha de atividades. `false` quando não havia nada a
 * registrar (descrição igual, gravação automática, ou a sessão do mesmo autor
 * que já tem sua versão).
 */
export async function registrarVersaoDaDescricao(params: {
  antes: ChamadoAntesDoPatch | null | undefined;
  corpo: Corpo;
  autorId: string;
}): Promise<boolean> {
  const {antes, corpo, autorId} = params;
  if (!antes) return false;
  if (ehGravacaoAutomatica(corpo)) return false;
  if (!descricaoMudou(antes, corpo)) return false;

  const ultima = await prisma.issueVersion.findFirst({
    where: {issueId: antes.id},
    orderBy: {lastSavedAt: "desc"},
    select: {ownedById: true, lastSavedAt: true},
  });
  if (mesmaSessao(ultima, autorId)) return false;

  await prisma.issueVersion.create({
    data: {
      issueId: antes.id,
      workspaceId: antes.workspaceId,
      projectId: antes.projectId,
      ownedById: autorId,
      lastSavedAt: new Date(),
      name: antes.name ?? null,
      descriptionHtml: antes.descriptionHtml ?? null,
      descriptionJson: (antes.descriptionJson ?? undefined) as any,
      priority: antes.priority ?? null,
      stateId: antes.stateId ?? null,
      startDate: antes.startDate ?? null,
      targetDate: antes.targetDate ?? null,
      isDraft: antes.isDraft ?? null,
      completedAt: antes.completedAt ?? null,
      archivedAt: antes.archivedAt ?? null,
    },
  });

  await podarHistorico(antes.id);
  return true;
}

/**
 * Serialização das versões para o frontend (`TDescriptionVersion`).
 *
 * As três rotas de leitura — chamado, apelido work-items e triagem — devolvem
 * exatamente a mesma forma; sem um lugar só, cada uma inventava campos que o
 * modelo não tem (`updatedAt`, `descriptionStripped`).
 */
export function serializarVersao(versao: any, escopo: {issueId: string; workspaceId: string; projectId: string}) {
  const gravadaEm = versao.lastSavedAt ?? versao.createdAt;
  return {
    id: versao.id,
    issue: escopo.issueId,
    workspace: escopo.workspaceId,
    project: escopo.projectId,
    description: versao.descriptionJson ?? null,
    description_html: versao.descriptionHtml ?? "<p></p>",
    description_stripped: "",
    description_binary: null,
    name: versao.name ?? null,
    owned_by: versao.ownedById ?? null,
    created_by: versao.ownedById ?? null,
    updated_by: versao.ownedById ?? null,
    created_at: versao.createdAt?.toISOString() ?? null,
    updated_at: gravadaEm?.toISOString() ?? null,
    last_saved_at: gravadaEm?.toISOString() ?? null,
  };
}
