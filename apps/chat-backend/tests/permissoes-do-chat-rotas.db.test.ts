/**
 * Cada rota do chat obedece à SUA ação da matriz: sem ela, 403 com `detail` em
 * português; com ela (e só ela), passa da guarda. A mesma pessoa troca de
 * ações entre um caso e outro (`setAcoesDaFuncao`), no próprio processo
 * (`module.handle`), contra o banco.
 *
 * As rotas que moram no `src/index.ts` (transferir, lista de atendimentos,
 * encerrar pelo WS) estão em `permissoes-do-chat.e2e.test.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { destinosModule } from "@/bot/acao/rotas";
import { cicloDeVidaModule } from "@/ciclo-de-vida/rotas";
import { atendenteModule } from "@/atendente/rotas";
import { configModule } from "@/config-routes";
import { disparoModule } from "@/disparo/routes";
import { ligacoesModule } from "@/ligacoes/routes";
import { CHAT_ACTION, type ChatAction } from "@/permissoes";
import { relatoriosModule } from "@/relatorios/rotas";
import {
  createPessoaComAcoes,
  criarWorkspacePlane,
  limparWorkspacePlane,
  setAcoesDaFuncao,
  uniqueWorkspace,
  type PessoaDeTeste,
} from "@tests/helpers/harness";

const slug = uniqueWorkspace("wsacoes");
const TODAS = Object.values(CHAT_ACTION);
const ID = crypto.randomUUID();
let pessoa: PessoaDeTeste;

type Modulo = { handle: (r: Request) => Promise<Response> };
type Caso = { modulo: Modulo; metodo: string; caminho: string; acao: ChatAction; corpo?: unknown };

const { ATENDER, PAUSAR, ENCERRAR, ABRIR_CHAMADO, VER_TODAS, RELATORIOS, DISPARO, CONFIGURAR, FRASES_DO_ESPACO } =
  CHAT_ACTION;

const CASOS: Caso[] = [
  // Ciclo de vida da conversa
  { modulo: cicloDeVidaModule, metodo: "POST", caminho: `/sessions/${ID}/close/`, acao: ENCERRAR },
  { modulo: cicloDeVidaModule, metodo: "GET", caminho: "/close-reasons/", acao: ATENDER },
  { modulo: cicloDeVidaModule, metodo: "POST", caminho: `/sessions/${ID}/pause/`, acao: PAUSAR },
  { modulo: cicloDeVidaModule, metodo: "POST", caminho: `/sessions/${ID}/resume/`, acao: PAUSAR },
  { modulo: cicloDeVidaModule, metodo: "POST", caminho: `/sessions/${ID}/chamado/`, acao: ABRIR_CHAMADO },
  { modulo: cicloDeVidaModule, metodo: "POST", caminho: `/messages/${ID}/resend/`, acao: ATENDER },
  // Ferramentas do atendente e gestão
  { modulo: atendenteModule, metodo: "POST", caminho: `/sessions/${ID}/sla-alert/pause/`, acao: PAUSAR },
  { modulo: atendenteModule, metodo: "POST", caminho: `/sessions/${ID}/sla-alert/resume/`, acao: PAUSAR },
  { modulo: atendenteModule, metodo: "GET", caminho: "/config/frases/", acao: FRASES_DO_ESPACO },
  { modulo: atendenteModule, metodo: "POST", caminho: "/config/frases/", acao: FRASES_DO_ESPACO, corpo: {} },
  { modulo: atendenteModule, metodo: "PUT", caminho: "/config/feriados/", acao: CONFIGURAR, corpo: {} },
  { modulo: atendenteModule, metodo: "GET", caminho: "/gerenciador/", acao: VER_TODAS },
  { modulo: atendenteModule, metodo: "GET", caminho: "/monitor/", acao: RELATORIOS },
  // Relatórios
  { modulo: relatoriosModule, metodo: "GET", caminho: "/reports/atendimentos/", acao: RELATORIOS },
  { modulo: relatoriosModule, metodo: "GET", caminho: "/registros/", acao: RELATORIOS },
  { modulo: relatoriosModule, metodo: "GET", caminho: "/reports/ratings/", acao: RELATORIOS },
  { modulo: relatoriosModule, metodo: "GET", caminho: "/reports/sla/", acao: RELATORIOS },
  { modulo: relatoriosModule, metodo: "GET", caminho: "/dashboard/", acao: RELATORIOS },
  { modulo: ligacoesModule, metodo: "GET", caminho: "/reports/ligacoes/", acao: RELATORIOS },
  // Configuração
  { modulo: configModule, metodo: "PATCH", caminho: "/config/bot/", acao: CONFIGURAR, corpo: {} },
  { modulo: destinosModule, metodo: "GET", caminho: "/config/bot/destinos/", acao: CONFIGURAR },
  { modulo: ligacoesModule, metodo: "GET", caminho: "/config/telefonia/", acao: CONFIGURAR },
  // Disparo
  { modulo: disparoModule, metodo: "GET", caminho: "/disparo/mensagens/", acao: DISPARO },
];

async function call({ modulo, metodo, caminho, corpo }: Caso) {
  const res = await modulo.handle(
    new Request(`http://chat.local/workspaces/${slug}${caminho}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${pessoa.token}` },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as { detail?: string } | null };
}

beforeAll(async () => {
  await criarWorkspacePlane(slug);
  pessoa = await createPessoaComAcoes(slug, []);
});

afterAll(async () => {
  await limparWorkspacePlane(slug);
  await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%-${slug}@teste.local`}`;
});

describe("cada rota exige a sua ação", () => {
  for (const caso of CASOS) {
    const nome = `${caso.metodo} ${caso.caminho.replace(ID, ":id")}`;

    it(`${nome}: sem ${caso.acao}, 403 em português`, async () => {
      await setAcoesDaFuncao(
        pessoa.funcaoId,
        TODAS.filter((a) => a !== caso.acao)
      );
      const res = await call(caso);
      expect(res.status).toBe(403);
      expect(res.body?.detail).toMatch(/permissão|permite/);
    });

    it(`${nome}: só com ${caso.acao}, passa da guarda`, async () => {
      await setAcoesDaFuncao(pessoa.funcaoId, [caso.acao]);
      const res = await call(caso);
      expect([401, 403]).not.toContain(res.status);
    });
  }
});
