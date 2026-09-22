// Setor do SAC legado → função do modelo novo de permissões.
//
// O importador (`scripts/migrate-sac.ts`, fora do git por ser da implantação)
// usa estas regras; `scripts/fix-papeis-legado.ts` corrige bases já migradas.
// Mantidas aqui, versionadas e testadas, para que a regra exista num lugar só.
//
// Sem `@db`: recebe o client, como `seedWorkflowRoles`, para rodar em script.
import { DEFAULT_ROLES, type SystemRoleKey } from "@utils/permissions";

/**
 * O importador antigo gravava 10 como "membro" para financeiro, comercial e os
 * vínculos usuário-sistema. Não existe função de nível 10: a pessoa caía na
 * Qualidade (8) pelo arredondamento de `defaultRoleForLevel`.
 */
export const NIVEL_INVALIDO_LEGADO = 10;

const levelOf = (key: SystemRoleKey): number => DEFAULT_ROLES.find((r) => r.key === key)!.level;

const normalize = (setor: string | null | undefined): string =>
  (setor ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/**
 * Setor de campo: representante, consultor e técnico. No legado viam chamados,
 * chat e (técnico) visitas, mas ficavam fora da lista de setores internos e
 * entravam INATIVOS. "Suporte Técnico" não é campo: são os contatos técnicos das
 * prefeituras (205 contas de gmail, hotmail, terra, bol).
 */
export function isSetorDeCampo(setor: string | null | undefined): boolean {
  const s = normalize(setor);
  if (s.includes("suporte")) return false;
  return ["representante", "consultor", "tecnico"].some((campo) => s.includes(campo));
}

const SETORES_INTERNOS = [
  "ti",
  "tecnologia",
  "t.i",
  "gestao de qualidade",
  "qualidade",
  "atendimento",
  "gestao de projetos",
  "projetos",
  "diretoria",
  "administracao",
  "financeiro",
  "comercial",
  "suporte",
];

/**
 * Quem da migração entra ATIVO. Equipe interna precisa do e-mail corporativo (o
 * rótulo de setor sozinho deixava entrar os contatos das prefeituras). Setor de
 * campo entra com o e-mail que tiver: representante e consultor costumam ter
 * e-mail próprio, e recebem a função mais restrita (ver `resolveNivelDoSetor`).
 */
export function isContaDaCasa(
  setor: string | null | undefined,
  email: string | null | undefined,
  dominio: string
): boolean {
  if (isSetorDeCampo(setor)) return true;
  const dominioOk = (email ?? "").toLowerCase().trim().endsWith(dominio.toLowerCase());
  const s = normalize(setor);
  return dominioOk && SETORES_INTERNOS.some((i) => s.includes(i));
}

type RegraDeSetor = { match: (s: string) => boolean; papel: SystemRoleKey };

const has =
  (...termos: string[]) =>
  (s: string) =>
    termos.some((t) => s.includes(t));

// A ordem importa: campo antes de TI ("tecnico" não é TI), gestão antes de
// qualidade ("gestao de qualidade" é Qualidade, "gestao de projetos" é Gestor).
const REGRAS: RegraDeSetor[] = [
  // Técnico faz visita: Atendimento é a função mais restrita que registra
  // visita, abre pedido e atende o chat.
  { match: (s) => isSetorDeCampo(s) && s.includes("tecnico"), papel: "atendimento" },
  // Representante e consultor só acompanham os chamados. PENDENTE: restringir
  // às entidades de cada um (o legado filtrava por carteira).
  { match: isSetorDeCampo, papel: "guest" },
  { match: has("gestao de proj", "projetos", "gestor"), papel: "gestor_projeto" },
  { match: has("qualidade", "quality"), papel: "qualidade" },
  { match: (s) => s === "ti" || has("tecnologia", "t.i", "informacao")(s) || /\bti\b/.test(s), papel: "ti" },
  { match: has("atendimento", "suporte", "support", "service"), papel: "atendimento" },
  { match: has("diretoria", "administra", "gerencia"), papel: "gestor_projeto" },
];

/**
 * Nível (função) de uma conta pelo setor do SAC. Setor sem regra (financeiro,
 * comercial, RH…) vira Atendimento: abre pedido, comenta e atende, sem criar
 * nem mover chamado. Era 10, que não existe.
 */
export function resolveNivelDoSetor(setor: string | null | undefined): number {
  const s = normalize(setor);
  const regra = REGRAS.find((r) => r.match(s));
  return levelOf(regra?.papel ?? "atendimento");
}

type Db = {
  workflowRole: { findFirst: (args: any) => Promise<any> };
  workspaceMember: { findMany: (args: any) => Promise<any[]>; update: (args: any) => Promise<any> };
  projectMember: { findMany: (args: any) => Promise<any[]>; update: (args: any) => Promise<any> };
};

/**
 * Corrige associações gravadas com o nível 10 (inexistente) numa base já migrada.
 *
 * Espaço: 10 vira Atendimento (era o "membro" do financeiro/comercial).
 * Sistema: o vínculo 10 foi criado pelo passo "usuário x sistema" do importador
 * para QUALQUER setor, então a pessoa recebe o maior nível válido que já tem nos
 * outros sistemas (é assim que um Gestor, limitado a 15 no espaço, recupera o 18);
 * sem nenhum, o nível do espaço. A função (`workflowRoleId`) acompanha o nível.
 * Idempotente: só toca o que ainda está em 10.
 */
export async function fixNiveisLegado(
  db: Db,
  workspaceId: string
): Promise<{ workspaceMembers: number; projectMembers: number }> {
  const funcaoDoNivel = async (level: number) =>
    (await db.workflowRole.findFirst({ where: { workspaceId, level, deletedAt: null } }))?.id ?? null;

  const espaco = await db.workspaceMember.findMany({
    where: { workspaceId, role: NIVEL_INVALIDO_LEGADO, deletedAt: null },
  });
  const nivelAtendimento = levelOf("atendimento");
  for (const m of espaco) {
    await db.workspaceMember.update({
      where: { id: m.id },
      data: { role: nivelAtendimento, workflowRoleId: await funcaoDoNivel(nivelAtendimento) },
    });
  }

  const sistemas = await db.projectMember.findMany({
    where: { workspaceId, role: NIVEL_INVALIDO_LEGADO, deletedAt: null },
  });
  for (const pm of sistemas) {
    const nivel = await resolveNivelDoVinculo(db, workspaceId, pm.memberId);
    await db.projectMember.update({
      where: { id: pm.id },
      data: { role: nivel, workflowRoleId: await funcaoDoNivel(nivel) },
    });
  }
  return { workspaceMembers: espaco.length, projectMembers: sistemas.length };
}

async function resolveNivelDoVinculo(db: Db, workspaceId: string, memberId: string): Promise<number> {
  const outros = await db.projectMember.findMany({
    where: { workspaceId, memberId, deletedAt: null, role: { not: NIVEL_INVALIDO_LEGADO } },
    select: { role: true },
  });
  const maior = Math.max(0, ...outros.map((o) => o.role));
  if (maior > 0) return maior;
  const [doEspaco] = await db.workspaceMember.findMany({
    where: { workspaceId, memberId, deletedAt: null },
    select: { role: true },
  });
  return doEspaco?.role ?? levelOf("atendimento");
}
