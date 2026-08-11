/**
 * Recorta a participação em sistemas pelo vínculo do SAC.
 *
 * A importação colocou TODA a equipe em TODOS os sistemas, então um
 * desenvolvedor abre a barra lateral com 112 itens dos quais mexe em dois. O
 * SAC tem esse recorte em `responsavel_sistema` (responsavel_id × sistema_id),
 * e é ele que passa a valer.
 *
 * Recorta apenas as funções de execução (hoje, TI): Gestor de Projeto e
 * Administrador continuam vendo tudo, porque acompanhar o conjunto faz parte do
 * trabalho deles. Qualidade e Atendimento também seguem com tudo — eles triam o
 * que chega de qualquer sistema.
 *
 * Duas armadilhas do legado que este script trata:
 *
 *   1. **a mesma pessoa tem vários `usuarios_id`**, com setores diferentes
 *      (leandro@ é 216 em "TI" e 1261 em "gestão de projetos"). O e-mail é
 *      único no Avião, então os vínculos são somados POR E-MAIL — usar só o id
 *      migrado deixaria gente com zero sistemas;
 *   2. **quem não tem nenhum vínculo fica como está.** Restringir alguém a
 *      lista vazia é pior que o problema: a pessoa abre o sistema e não vê
 *      nada. Esses casos saem no relatório para serem resolvidos no cadastro.
 *
 * Idempotente: pode rodar quantas vezes quiser.
 *
 * Uso:
 *   DATABASE_URL=... bun run scripts/vincular-usuarios-sistemas.ts
 *   DRY_RUN=true ...   → só relata, não grava
 */
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "@prisma/client";
import {Pool as PgPool} from "pg";

/**
 * Credencial vem só do ambiente — o docker-compose já injeta `MYSQL_*` em
 * `sac-migrator`. Repetir a senha aqui seria mais uma cópia dela no repositório
 * sem nenhum ganho.
 */
const exigir = (nome: string): string => {
  const valor = process.env[nome];
  if (!valor) {
    console.error(`[vinculos] ❌  Falta a variável ${nome}. Rode pelo serviço sac-migrator ou informe MYSQL_HOST/USER/PASS/DB.`);
    process.exit(1);
  }
  return valor;
};

const MYSQL_CONFIG = {
  host: exigir("MYSQL_HOST"),
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: exigir("MYSQL_USER"),
  password: exigir("MYSQL_PASS"),
  database: exigir("MYSQL_DB"),
  ssl: false as const,
};

const WORKSPACE_SLUG = process.env.WORKSPACE_SLUG ?? "quality";
const DRY_RUN = process.env.DRY_RUN === "true";

/** Níveis cujo acesso é recortado pelo vínculo. Os demais continuam vendo tudo. */
/**
 * Somar ao vínculo do SAC os sistemas em que a pessoa comprovadamente trabalha.
 *
 * `responsavel_sistema` descreve bem o TI, mas é raso para a Qualidade: bruna@
 * aparece com UM sistema e tem 3.923 chamados atribuídos em 47; fabiane@ não
 * tem vínculo nenhum e trabalhou em 50. Recortar só pela tabela cegaria o setor.
 * Com esta opção o recorte tira o que a pessoa nunca tocou e mantém tudo que ela
 * tocou.
 */
const INCLUIR_HISTORICO = process.env.INCLUIR_HISTORICO === "true";

const NIVEIS_RECORTADOS = (process.env.NIVEIS_RECORTADOS ?? "12")
  .split(",")
  .map((n) => Number(n.trim()))
  .filter(Number.isFinite);

const pool = new PgPool({connectionString: process.env.DATABASE_URL});
const prisma = new PrismaClient({adapter: new PrismaPg(pool)});

const log = (msg: string) => console.log(`[vinculos] ${msg}`);

async function main() {
  log(`Recortando os níveis: ${NIVEIS_RECORTADOS.join(", ")}${DRY_RUN ? " (DRY RUN)" : ""}`);

  const workspace = await prisma.workspace.findFirst({where: {slug: WORKSPACE_SLUG, deletedAt: null}});
  if (!workspace) {
    log(`❌  Espaço de trabalho '${WORKSPACE_SLUG}' não encontrado.`);
    process.exit(1);
  }

  const mysql2 = await import("mysql2/promise");
  const conn = await mysql2.createConnection({...MYSQL_CONFIG});

  // Vínculos somados por e-mail (ver armadilha 1 no cabeçalho).
  const [linhas] = await conn.query<any[]>(`
    SELECT lower(trim(u.usuarios_email)) AS email, rs.sistema_id
    FROM responsavel_sistema rs
    JOIN usuarios u ON u.usuarios_id = rs.responsavel_id
    WHERE rs.ativo = 1 AND u.usuarios_email IS NOT NULL AND u.usuarios_email <> ''
  `);
  await conn.end();

  const sistemasPorEmail = new Map<string, Set<string>>();
  for (const {email, sistema_id} of linhas) {
    if (!sistemasPorEmail.has(email)) sistemasPorEmail.set(email, new Set());
    sistemasPorEmail.get(email)!.add(String(sistema_id));
  }
  log(`✅  ${linhas.length} vínculos no SAC, para ${sistemasPorEmail.size} e-mails`);

  const projetos = await prisma.project.findMany({
    where: {workspaceId: workspace.id, externalSource: "sac_migration", deletedAt: null},
    select: {id: true, externalId: true, name: true},
  });
  const projetoPorSistema = new Map(projetos.map((p) => [p.externalId ?? "", p.id]));
  log(`✅  ${projetos.length} sistemas no Avião`);

  const membros = await prisma.workspaceMember.findMany({
    where: {workspaceId: workspace.id, isActive: true, role: {in: NIVEIS_RECORTADOS}},
    include: {member: {select: {id: true, email: true, displayName: true}}},
  });
  log(`✅  ${membros.length} pessoa(s) nos níveis recortados`);

  // Projetos com rastro de trabalho: chamado atribuído ou aberto pela pessoa.
  const historicoPorPessoa = new Map<string, Set<string>>();
  if (INCLUIR_HISTORICO) {
    const linhas = await prisma.$queryRaw<Array<{member_id: string; project_id: string}>>`
      SELECT ia.assignee_id AS member_id, i.project_id
      FROM issue_assignees ia JOIN issues i ON i.id = ia.issue_id
      WHERE ia.deleted_at IS NULL AND i.deleted_at IS NULL
      UNION
      SELECT i.created_by_id AS member_id, i.project_id
      FROM issues i WHERE i.created_by_id IS NOT NULL AND i.deleted_at IS NULL
    `;
    for (const {member_id, project_id} of linhas) {
      if (!historicoPorPessoa.has(member_id)) historicoPorPessoa.set(member_id, new Set());
      historicoPorPessoa.get(member_id)!.add(project_id);
    }
    log(`✅  Histórico de trabalho carregado para ${historicoPorPessoa.size} pessoa(s)`);
  }

  const semVinculo: string[] = [];
  const recortados: Array<{email: string; fica: number; sai: number}> = [];

  for (const wm of membros) {
    const email = (wm.member.email ?? "").toLowerCase();
    const sistemas = sistemasPorEmail.get(email);
    const permitidos = [
      ...new Set([
        ...[...(sistemas ?? [])].map((s) => projetoPorSistema.get(s)).filter((id): id is string => !!id),
        ...(historicoPorPessoa.get(wm.memberId) ?? []),
      ]),
    ];

    if (permitidos.length === 0) {
      semVinculo.push(email);
      continue;
    }

    const atuais = await prisma.projectMember.findMany({
      where: {workspaceId: workspace.id, memberId: wm.memberId, deletedAt: null},
      select: {projectId: true},
    });
    const remover = atuais.map((a) => a.projectId).filter((id) => !permitidos.includes(id));
    if (remover.length === 0) continue;

    if (!DRY_RUN) {
      await prisma.projectMember.deleteMany({
        where: {workspaceId: workspace.id, memberId: wm.memberId, projectId: {in: remover}},
      });
    }
    recortados.push({email, fica: permitidos.length, sai: remover.length});
  }

  log("");
  log("═══════════════════════════════════════════════════");
  for (const r of recortados) log(`  ${r.email}: fica com ${r.fica} sistema(s), saiu de ${r.sai}`);
  if (semVinculo.length) {
    log("");
    log(`  ⚠️  ${semVinculo.length} pessoa(s) SEM vínculo no SAC continuam vendo todos os sistemas:`);
    for (const e of semVinculo) log(`      ${e}`);
    log("      Cadastre o vínculo no SAC ou ajuste em Configurações → Sistemas → Membros.");
  }
  log("═══════════════════════════════════════════════════");
  log(DRY_RUN ? "DRY RUN: nada foi gravado." : "Concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
