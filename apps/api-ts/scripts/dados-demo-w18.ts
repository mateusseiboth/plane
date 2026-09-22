/**
 * Dados de demonstração do W18 (banco plane_w18): entidades em cidades de MS,
 * chamados nas etapas dos painéis, conversas de chat e uma chave de painel.
 * Só para a conferência no navegador — não vai para o repositório.
 */
import prisma from "@db";
const SLUG = "quality";

const CIDADES: { nome: string; cidade: string; legacyId: number | null }[] = [
  { nome: "Prefeitura de Campo Grande", cidade: "Campo Grande", legacyId: null },
  { nome: "Câmara de Campo Grande", cidade: "Campo Grande", legacyId: null },
  { nome: "Prefeitura de Dourados", cidade: "Dourados", legacyId: null },
  { nome: "Prefeitura de Três Lagoas", cidade: "Três Lagoas", legacyId: null },
  { nome: "Prefeitura de Corumbá", cidade: "Corumbá", legacyId: null },
  { nome: "Prefeitura de Ponta Porã", cidade: "Ponta Porã", legacyId: null },
  { nome: "Prefeitura de Naviraí", cidade: "Naviraí", legacyId: null },
  { nome: "Prefeitura de Caracol", cidade: "Caracol", legacyId: 3 },
  { nome: "Prefeitura de Corguinho", cidade: "Corguinho", legacyId: 4 },
  { nome: "Prefeitura de Rio Negro", cidade: "Rio Negro", legacyId: 8 },
  { nome: "Prefeitura de Selvíria", cidade: "Selvíria", legacyId: 137 },
  { nome: "Consórcio Intermunicipal do Pantanal", cidade: "Cuiabá", legacyId: null },
];

const ETAPAS: { nome: string; grupo: string; sequencia: number }[] = [
  { nome: "Triagem", grupo: "triage", sequencia: 1000 },
  { nome: "Pendências", grupo: "backlog", sequencia: 2000 },
  { nome: "A Fazer", grupo: "unstarted", sequencia: 3000 },
  { nome: "Em Análise", grupo: "started", sequencia: 4000 },
  { nome: "Em Desenvolvimento", grupo: "started", sequencia: 5000 },
  { nome: "Em Teste", grupo: "started", sequencia: 6000 },
  { nome: "Concluído", grupo: "completed", sequencia: 7000 },
  { nome: "Cancelado", grupo: "cancelled", sequencia: 8000 },
];

const TITULOS = [
  "Guia de IPTU não emite",
  "Relatório de arrecadação com valor errado",
  "Importação do SIAFIC falhou",
  "Folha de pagamento não fecha",
  "Nota fiscal eletrônica sem retorno",
  "Portal da transparência fora do ar",
  "Empenho não grava a dotação",
  "Integração do almoxarifado parada",
  "Cadastro de servidor duplicado",
  "Balancete não bate com o razão",
  "Certidão negativa sai em branco",
  "Login do contribuinte recusado",
];

const PRIORIDADES = ["urgent", "high", "medium", "low", "none"];

async function main() {
  const ws = await prisma.workspace.findFirstOrThrow({ where: { slug: SLUG } });
  const dono = await prisma.user.findFirstOrThrow({ where: { email: "admin@plane.so" } });

  const projetos = await Promise.all(
    [
      { name: "SIART", identifier: "SIART", emoji: "127963" },
      { name: "ARH", identifier: "ARH", emoji: "128101" },
      { name: "Contabilidade", identifier: "CONTAB", emoji: "128202" },
    ].map(async (dados) => {
      const existente = await prisma.project.findFirst({ where: { workspaceId: ws.id, identifier: dados.identifier } });
      if (existente) return existente;
      const projeto = await prisma.project.create({
        data: {
          workspaceId: ws.id,
          name: dados.name,
          identifier: dados.identifier,
          createdById: dono.id,
          iconProp: { in_use: "emoji", emoji: { value: dados.emoji } },
        },
      });
      await prisma.projectMember.create({
        data: { projectId: projeto.id, workspaceId: ws.id, memberId: dono.id, role: 20, isActive: true },
      });
      await prisma.state.createMany({
        data: ETAPAS.map((etapa) => ({
          projectId: projeto.id,
          workspaceId: ws.id,
          name: etapa.nome,
          group: etapa.grupo,
          sequence: etapa.sequencia,
          color: "#3987e5",
          slug: etapa.nome.toLowerCase().replace(/\s+/g, "-"),
          default: etapa.nome === "Pendências",
        })),
      });
      return projeto;
    })
  );

  const entidades = await Promise.all(
    CIDADES.map(async (dados) => {
      const existente = await prisma.entity.findFirst({ where: { workspaceId: ws.id, name: dados.nome } });
      if (existente) return existente;
      return prisma.entity.create({
        data: {
          workspaceId: ws.id,
          name: dados.nome,
          city: dados.cidade,
          state: dados.cidade === "Cuiabá" ? "MT" : "MS",
          legacyId: dados.legacyId,
          isActive: true,
        },
      });
    })
  );

  const etapasPorProjeto = new Map<string, Map<string, string>>();
  for (const projeto of projetos) {
    const etapas = await prisma.state.findMany({ where: { projectId: projeto.id } });
    etapasPorProjeto.set(projeto.id, new Map(etapas.map((e) => [e.name, e.id])));
  }

  const jaTem = await prisma.issue.count({ where: { workspaceId: ws.id } });
  if (jaTem >= 60) {
    console.log(`[demo] ${jaTem} chamados já existem; nada a criar.`);
    return;
  }

  const distribuicao: { etapa: string; quantos: number }[] = [
    { etapa: "Triagem", quantos: 14 },
    { etapa: "Pendências", quantos: 9 },
    { etapa: "A Fazer", quantos: 11 },
    { etapa: "Em Análise", quantos: 8 },
    { etapa: "Em Desenvolvimento", quantos: 12 },
    { etapa: "Em Teste", quantos: 10 },
    { etapa: "Concluído", quantos: 16 },
  ];

  let indice = 0;
  for (const linha of distribuicao) {
    for (let i = 0; i < linha.quantos; i++) {
      indice += 1;
      const projeto = projetos[indice % projetos.length]!;
      const entidade = entidades[indice % entidades.length]!;
      const prioridade = PRIORIDADES[indice % PRIORIDADES.length]!;
      const criadoEm = new Date(Date.now() - (indice % 40) * 86_400_000);
      const chamado = await prisma.issue.create({
        data: {
          workspaceId: ws.id,
          projectId: projeto.id,
          name: `${TITULOS[indice % TITULOS.length]}`,
          descriptionStripped: "Chamado de demonstração do painel de TV.",
          priority: prioridade,
          stateId: etapasPorProjeto.get(projeto.id)!.get(linha.etapa)!,
          entityId: entidade.id,
          createdById: dono.id,
          createdAt: criadoEm,
          completedAt: linha.etapa === "Concluído" ? new Date(Date.now() - (indice % 5) * 86_400_000) : null,
        },
      });
      // Metade dos chamados de "A Fazer"/"Pendências" com responsável, para o
      // painel do TI ter as duas colunas preenchidas.
      if (indice % 2 === 0) {
        await prisma.issueAssignee.create({
          data: { issueId: chamado.id, assigneeId: dono.id, projectId: projeto.id, workspaceId: ws.id },
        });
      }
    }
  }

  console.log(`[demo] ${indice} chamados criados em ${projetos.length} sistemas e ${entidades.length} entidades.`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
