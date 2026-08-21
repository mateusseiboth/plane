/**
 * Contas do portal do cliente — criar, trocar senha, liberar sistemas e listar.
 *
 * O portal (`/portal?workspace=<slug>`) tem conta própria: o cliente não é
 * usuário do Plane e não ocupa cadeira. Este script é o caminho de bootstrap e
 * de socorro (senha esquecida) direto no servidor; pela API existem as rotas
 * `/api/v1/workspaces/:slug/portal-accounts/`, restritas ao administrador.
 *
 * Uso:
 *   # criar (ou atualizar) uma conta e liberar dois sistemas
 *   WORKSPACE=quality EMAIL=contato@prefeitura.gov.br SENHA=umaSenhaBoa \
 *     NOME="Prefeitura de Exemplo" SISTEMAS=SIART,CONTAB \
 *     DATABASE_URL=postgresql://... bun run scripts/portal-conta.ts
 *
 *   # só listar o que existe
 *   WORKSPACE=quality LISTAR=true DATABASE_URL=postgresql://... bun run scripts/portal-conta.ts
 *
 * `SISTEMAS` aceita o identificador (SIART) ou o id do projeto. Informar
 * `SISTEMAS` substitui a lista inteira; omitir mantém a que já está lá.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const WORKSPACE = process.env.WORKSPACE?.trim();
const EMAIL = process.env.EMAIL?.toLowerCase().trim();
const SENHA = process.env.SENHA;
const NOME = process.env.NOME?.trim();
const SISTEMAS = process.env.SISTEMAS?.trim();
const LISTAR = process.env.LISTAR === "true";

function log(msg: string) {
  console.log(`[portal-conta] ${msg}`);
}

function encerrar(msg: string): never {
  log(msg);
  process.exit(1);
}

/** Projetos pedidos por identificador OU id; o que não existir é avisado, não ignorado. */
async function resolverSistemas(workspaceId: string, lista: string): Promise<string[]> {
  const pedidos = lista
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!pedidos.length) return [];
  const projetos = await prisma.project.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      OR: [
        { identifier: { in: pedidos, mode: "insensitive" } },
        { id: { in: pedidos.filter((p) => p.includes("-")) } },
      ],
    },
    select: { id: true, identifier: true, name: true },
  });
  const achados = new Set(projetos.flatMap((p) => [p.identifier.toUpperCase(), p.id]));
  for (const pedido of pedidos) {
    if (!achados.has(pedido.toUpperCase()) && !achados.has(pedido))
      log(`aviso: sistema "${pedido}" não existe neste espaço.`);
  }
  projetos.forEach((p) => log(`sistema liberado: ${p.name} (${p.identifier})`));
  return projetos.map((p) => p.id);
}

async function listar(workspaceId: string) {
  const contas = await prisma.portalAccount.findMany({
    where: { workspaceId, deletedAt: null },
    include: { projects: { select: { project: { select: { identifier: true } } } } },
    orderBy: { name: "asc" },
  });
  if (!contas.length) return log("nenhuma conta do portal neste espaço.");
  log(`${contas.length} conta(s):`);
  for (const c of contas) {
    const sistemas = c.projects.map((p) => p.project.identifier).join(", ") || "nenhum sistema liberado";
    console.log(`  ${c.isActive ? "✓" : "✗"} ${c.email}  ${c.name}  [${sistemas}]`);
  }
}

async function main() {
  if (!WORKSPACE) encerrar("informe WORKSPACE=<slug do espaço de trabalho>.");

  const espaco = await prisma.workspace.findFirst({
    where: { slug: WORKSPACE, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!espaco) encerrar(`espaço de trabalho "${WORKSPACE}" não encontrado.`);

  if (LISTAR) return listar(espaco.id);
  if (!EMAIL) encerrar("informe EMAIL=<e-mail do cliente> (ou LISTAR=true).");

  const existente = await prisma.portalAccount.findFirst({
    where: { workspaceId: espaco.id, email: EMAIL, deletedAt: null },
  });
  if (!existente && !SENHA) encerrar("conta nova precisa de SENHA=<senha inicial>.");

  const dados: Record<string, unknown> = {};
  if (SENHA) dados.password = await Bun.password.hash(SENHA, { algorithm: "bcrypt", cost: 12 });
  if (NOME) dados.name = NOME;

  const conta = existente
    ? await prisma.portalAccount.update({ where: { id: existente.id }, data: { ...dados, isActive: true } })
    : await prisma.portalAccount.create({
        data: { workspaceId: espaco.id, email: EMAIL, name: NOME ?? EMAIL, password: dados.password as string },
      });
  log(`${existente ? "conta atualizada" : "conta criada"}: ${conta.email} (${conta.name})`);

  // Lista de sistemas informada substitui a anterior; omitida, mantém a que está.
  if (SISTEMAS !== undefined) {
    const projectIds = await resolverSistemas(espaco.id, SISTEMAS);
    await prisma.portalAccountProject.deleteMany({ where: { accountId: conta.id } });
    if (projectIds.length) {
      await prisma.portalAccountProject.createMany({
        data: projectIds.map((projectId) => ({ accountId: conta.id, projectId })),
        skipDuplicates: true,
      });
    }
  }

  log(`pronto — o cliente entra em /portal?workspace=${WORKSPACE}`);
}

main()
  .catch((e) => {
    console.error("[portal-conta] falhou:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
