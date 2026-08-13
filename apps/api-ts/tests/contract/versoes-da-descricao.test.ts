/**
 * Rastro das alterações do corpo do chamado.
 *
 * Regra do produto (substitui a de autoria exclusiva, que congelava os 16 mil
 * chamados sem autor gravado e impedia o Qualidade de limpar relato de
 * cliente): QUALQUER UM com permissão reescreve a descrição, e fica gravado o
 * que era antes, para o que virou, por quem e quando.
 *
 * O rastro tem dois lados: uma linha em `issue_versions` com o estado ANTERIOR
 * (é ela que o seletor "Última edição por…" lê e que a restauração devolve) e
 * uma entrada na trilha de atividades (`field: "description"`).
 *
 * O que este arquivo fixa, além do 200:
 *  - a versão guarda o texto ANTIGO e o autor da alteração;
 *  - reenviar o MESMO conteúdo não é alteração e não gera versão;
 *  - autosaves seguidos do mesmo autor são UMA sessão de edição (o editor
 *    grava sozinho a cada ~1,5 s — uma versão por autosave encheria a tabela);
 *  - autor diferente, ou janela vencida, abre versão nova;
 *  - a normalização automática de HTML legado (`skip_activity`) não gera nada;
 *  - os três caminhos de escrita (chamado, triagem e o apelido
 *    /intake-work-items/) se comportam igual.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { JANELA_DE_SESSAO_MS } from "@utils/versoes-da-descricao";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createIssue,
  createMemberWithToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";
import { prismaReal } from "@tests/helpers/prisma-real";

const DESCRICAO_ORIGINAL = "<p>Relato de quem abriu o chamado.</p>";
const DESCRICAO_REESCRITA = "<p>Relato limpo pelo time de qualidade.</p>";

describe("Versões da descrição do chamado", () => {
  let wsSlug: string;
  let wsId: string;
  let projectId: string;
  let etiquetaId: string;
  let estadoUnstartedId: string;

  let autorId: string;
  let outroId: string;
  let admId: string;

  let doAutor: ReturnType<typeof apiClient>;
  let doOutro: ReturnType<typeof apiClient>;
  let doAdm: ReturnType<typeof apiClient>;

  beforeAll(async () => {
    await cleanDb();

    // Administrador do espaço (nível 20) — dono do workspace e do projeto.
    const adm = await createUser({ email: "versoes-adm@plane.test" });
    admId = adm.id;
    const ws = await createWorkspace(adm.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    const project = await createProject(ws.id, adm.id);
    projectId = project.id;
    doAdm = apiClient((await createApiToken(adm.id)).token);

    // Dois membros (nível 15): ambos têm issue.edit.all — o que os separa aqui
    // é só quem abriu o chamado.
    const autor = await createMemberWithToken(ws.id, 15, projectId, 15);
    autorId = autor.user.id;
    doAutor = apiClient(autor.token);

    const outro = await createMemberWithToken(ws.id, 15, projectId, 15);
    outroId = outro.user.id;
    doOutro = apiClient(outro.token);

    await seedWorkflowRoles(prisma, ws.id);

    const etiqueta = await prisma.label.create({
      data: { projectId, workspaceId: ws.id, name: "Correção", color: "#dc2626" },
    });
    etiquetaId = etiqueta.id;

    const todo = await prisma.state.findFirstOrThrow({ where: { projectId, group: "unstarted" } });
    estadoUnstartedId = todo.id;
  });

  afterAll(() => cleanDb());

  const issuesUrl = () => `/workspaces/${wsSlug}/projects/${projectId}/issues/`;
  const inboxUrl = () => `/workspaces/${wsSlug}/projects/${projectId}/inbox-issues/`;
  const intakeUrl = () => `/workspaces/${wsSlug}/projects/${projectId}/intake-work-items/`;
  const workItemsUrl = () => `/workspaces/${wsSlug}/projects/${projectId}/work-items/`;

  /** Chamado aberto pelo autor, com descrição preenchida. */
  async function chamadoDoAutor(nome: string) {
    const res = await doAutor.post(issuesUrl(), { name: nome, description_html: DESCRICAO_ORIGINAL });
    expect(res.status).toBe(201);
    return (await res.json()) as any;
  }

  const descricaoGravada = async (issueId: string) =>
    (await prismaReal().issue.findFirstOrThrow({ where: { id: issueId } })).descriptionHtml;

  const versoes = async (issueId: string) =>
    prismaReal().issueVersion.findMany({ where: { issueId }, orderBy: { lastSavedAt: "asc" } });

  const atividadesDeDescricao = async (issueId: string) =>
    prismaReal().issueActivity.findMany({ where: { issueId, field: "description" } });

  /** Empurra a última versão para fora da janela de agrupamento. */
  const envelhecerUltimaVersao = async (issueId: string) => {
    const ultima = await prismaReal().issueVersion.findFirstOrThrow({
      where: { issueId },
      orderBy: { lastSavedAt: "desc" },
    });
    await prismaReal().issueVersion.update({
      where: { id: ultima.id },
      data: { lastSavedAt: new Date(Date.now() - JANELA_DE_SESSAO_MS - 1000) },
    });
  };

  // ── Liberdade para editar ──────────────────────────────────────────────────

  describe("qualquer um edita a descrição", () => {
    it("o autor edita a própria descrição (200)", async () => {
      const chamado = await chamadoDoAutor("Autor edita o próprio corpo");
      const res = await doAutor.patch(`${issuesUrl()}${chamado.id}/`, {
        description_html: "<p>Complementando o relato.</p>",
      });
      expect(res.status).toBe(200);
      expect(await descricaoGravada(chamado.id)).toBe("<p>Complementando o relato.</p>");
    });

    it("um terceiro reescreve a descrição alheia (200)", async () => {
      const chamado = await chamadoDoAutor("Qualidade limpa o relato do cliente");
      const res = await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { description_html: DESCRICAO_REESCRITA });
      expect(res.status).toBe(200);
      expect(await descricaoGravada(chamado.id)).toBe(DESCRICAO_REESCRITA);
    });

    it("o administrador do espaço também reescreve (200)", async () => {
      const chamado = await chamadoDoAutor("Administrador reescreve o corpo");
      const res = await doAdm.patch(`${issuesUrl()}${chamado.id}/`, { description_html: DESCRICAO_REESCRITA });
      expect(res.status).toBe(200);
      expect(await descricaoGravada(chamado.id)).toBe(DESCRICAO_REESCRITA);
    });

    it("chamado sem autor gravado (importação legada) volta a ser editável (200)", async () => {
      const orfao = await createIssue(projectId, wsId, { name: "Chamado migrado sem criador" });
      const res = await doAdm.patch(`${issuesUrl()}${orfao.id}/`, { description_html: DESCRICAO_REESCRITA });
      expect(res.status).toBe(200);
      expect(await descricaoGravada(orfao.id)).toBe(DESCRICAO_REESCRITA);
    });

    it("o Visualizador (papel 5) continua sem editar (403)", async () => {
      const chamado = await chamadoDoAutor("Visualizador tenta reescrever");
      const visitante = await createMemberWithToken(wsId, 5, projectId, 5);
      const res = await apiClient(visitante.token).patch(`${issuesUrl()}${chamado.id}/`, {
        description_html: DESCRICAO_REESCRITA,
      });
      expect(res.status).toBe(403);
      expect(await descricaoGravada(chamado.id)).toBe(DESCRICAO_ORIGINAL);
    });
  });

  // ── O rastro ───────────────────────────────────────────────────────────────

  describe("a versão anterior fica gravada", () => {
    it("guarda o texto ANTIGO, o título e o autor da alteração", async () => {
      const chamado = await chamadoDoAutor("Chamado com rastro");
      const res = await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { description_html: DESCRICAO_REESCRITA });
      expect(res.status).toBe(200);

      const gravadas = await versoes(chamado.id);
      expect(gravadas).toHaveLength(1);
      // A versão é uma FOTO DO ANTES: o texto novo está no chamado, não aqui.
      expect(gravadas[0].descriptionHtml).toBe(DESCRICAO_ORIGINAL);
      expect(gravadas[0].name).toBe("Chamado com rastro");
      expect(gravadas[0].ownedById).toBe(outroId);
      expect(gravadas[0].lastSavedAt).toBeInstanceOf(Date);
      expect(gravadas[0].workspaceId).toBe(wsId);
      expect(gravadas[0].projectId).toBe(projectId);
    });

    it("a trilha de atividades registra que a descrição mudou, com o autor", async () => {
      const chamado = await chamadoDoAutor("Chamado da trilha");
      await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { description_html: DESCRICAO_REESCRITA });

      const trilha = await atividadesDeDescricao(chamado.id);
      expect(trilha).toHaveLength(1);
      expect(trilha[0].actorId).toBe(outroId);
      expect(trilha[0].verb).toBe("updated");
    });

    it("mudar só o estado não mexe na descrição nem gera versão", async () => {
      const chamado = await chamadoDoAutor("Só troca de estado");
      const res = await doOutro.patch(`${issuesUrl()}${chamado.id}/`, {
        state_id: estadoUnstartedId,
        assignee_ids: [outroId],
        label_ids: [etiquetaId],
      });
      expect(res.status).toBe(200);
      expect(await versoes(chamado.id)).toHaveLength(0);
    });
  });

  // ── Agrupamento (volume) ───────────────────────────────────────────────────

  describe("agrupamento por sessão de edição", () => {
    it("reenviar a MESMA descrição não gera versão", async () => {
      const chamado = await chamadoDoAutor("Reenvio idêntico do corpo");
      const res = await doOutro.patch(`${issuesUrl()}${chamado.id}/`, {
        state_id: estadoUnstartedId,
        description_html: DESCRICAO_ORIGINAL,
      });
      expect(res.status).toBe(200);
      expect(await versoes(chamado.id)).toHaveLength(0);
      expect(await atividadesDeDescricao(chamado.id)).toHaveLength(0);
    });

    it("dois autosaves seguidos do mesmo autor geram UMA versão só", async () => {
      const chamado = await chamadoDoAutor("Autosave em rajada");
      await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { description_html: "<p>Reescrevendo o rel</p>" });
      await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { description_html: "<p>Reescrevendo o relato.</p>" });
      await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { description_html: "<p>Reescrevendo o relato inteiro.</p>" });

      const gravadas = await versoes(chamado.id);
      expect(gravadas).toHaveLength(1);
      // A única versão guarda o texto de antes da SESSÃO, não o do teclado anterior.
      expect(gravadas[0].descriptionHtml).toBe(DESCRICAO_ORIGINAL);
      expect(await atividadesDeDescricao(chamado.id)).toHaveLength(1);
      expect(await descricaoGravada(chamado.id)).toBe("<p>Reescrevendo o relato inteiro.</p>");
    });

    it("autor diferente abre versão nova", async () => {
      const chamado = await chamadoDoAutor("Duas mãos no mesmo corpo");
      await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { description_html: DESCRICAO_REESCRITA });
      await doAdm.patch(`${issuesUrl()}${chamado.id}/`, { description_html: "<p>E o administrador revisou.</p>" });

      const gravadas = await versoes(chamado.id);
      expect(gravadas).toHaveLength(2);
      expect(gravadas.map((v) => v.ownedById)).toEqual([outroId, admId]);
      expect(gravadas.map((v) => v.descriptionHtml)).toEqual([DESCRICAO_ORIGINAL, DESCRICAO_REESCRITA]);
      expect(await atividadesDeDescricao(chamado.id)).toHaveLength(2);
    });

    it("o mesmo autor abre versão nova depois da janela de agrupamento", async () => {
      const chamado = await chamadoDoAutor("Volta no dia seguinte");
      await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { description_html: DESCRICAO_REESCRITA });
      await envelhecerUltimaVersao(chamado.id);
      await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { description_html: "<p>Complemento do dia seguinte.</p>" });

      const gravadas = await versoes(chamado.id);
      expect(gravadas).toHaveLength(2);
      expect(gravadas.map((v) => v.descriptionHtml)).toEqual([DESCRICAO_ORIGINAL, DESCRICAO_REESCRITA]);
    });

    it("a normalização automática de HTML legado (skip_activity) não gera versão nem trilha", async () => {
      const chamado = await chamadoDoAutor("HTML legado normalizado ao abrir");
      const res = await doOutro.patch(`${issuesUrl()}${chamado.id}/`, {
        description_html: '<p data-id="1">Relato de quem abriu o chamado.</p>',
        skip_activity: "true",
      });
      expect(res.status).toBe(200);
      expect(await versoes(chamado.id)).toHaveLength(0);
      expect(await atividadesDeDescricao(chamado.id)).toHaveLength(0);
      // A normalização É gravada; o que ela não faz é virar rastro de edição.
      expect(await descricaoGravada(chamado.id)).toBe('<p data-id="1">Relato de quem abriu o chamado.</p>');
    });
  });

  // ── Leitura e restauração ──────────────────────────────────────────────────

  describe("histórico de versões", () => {
    it("a listagem devolve envelope com as versões, da mais nova para a mais velha", async () => {
      const chamado = await chamadoDoAutor("Chamado do histórico");
      await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { description_html: DESCRICAO_REESCRITA });
      await doAdm.patch(`${issuesUrl()}${chamado.id}/`, { description_html: "<p>Terceira redação.</p>" });

      const res = await doAutor.get(`${issuesUrl()}${chamado.id}/description-versions/`);
      expect(res.status).toBe(200);
      const corpo = (await res.json()) as any;
      expect(corpo.results).toBeInstanceOf(Array);
      expect(corpo.results).toHaveLength(2);
      expect(corpo.total_count).toBe(2);
      expect(corpo.results.map((v: any) => v.description_html)).toEqual([DESCRICAO_REESCRITA, DESCRICAO_ORIGINAL]);
      expect(corpo.results.map((v: any) => v.owned_by)).toEqual([admId, outroId]);
      expect(typeof corpo.results[0].last_saved_at).toBe("string");
    });

    it("os apelidos /work-items/ e /intake-work-items/ devolvem o mesmo envelope", async () => {
      const chamado = await chamadoDoAutor("Chamado visto pelos apelidos");
      await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { description_html: DESCRICAO_REESCRITA });

      for (const url of [workItemsUrl(), intakeUrl()]) {
        const res = await doAutor.get(`${url}${chamado.id}/description-versions/`);
        expect(res.status).toBe(200);
        const corpo = (await res.json()) as any;
        expect(corpo.results).toHaveLength(1);
        expect(corpo.results[0].description_html).toBe(DESCRICAO_ORIGINAL);
      }
    });

    it("a versão avulsa traz o HTML de antes", async () => {
      const chamado = await chamadoDoAutor("Chamado da versão avulsa");
      await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { description_html: DESCRICAO_REESCRITA });

      const lista = (await (await doAutor.get(`${issuesUrl()}${chamado.id}/description-versions/`)).json()) as any;
      const versionId = lista.results[0].id;

      const res = await doAutor.get(`${issuesUrl()}${chamado.id}/description-versions/${versionId}/`);
      expect(res.status).toBe(200);
      const versao = (await res.json()) as any;
      expect(versao.id).toBe(versionId);
      expect(versao.description_html).toBe(DESCRICAO_ORIGINAL);
      expect(versao.owned_by).toBe(outroId);
    });

    it("versão inexistente devolve 404", async () => {
      const chamado = await chamadoDoAutor("Chamado sem a versão pedida");
      const res = await doAutor.get(
        `${issuesUrl()}${chamado.id}/description-versions/00000000-0000-0000-0000-000000000000/`,
      );
      expect(res.status).toBe(404);
    });

    it("restaurar uma versão devolve o texto antigo e deixa rastro de quem restaurou", async () => {
      const chamado = await chamadoDoAutor("Chamado restaurado");
      await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { description_html: DESCRICAO_REESCRITA });

      const lista = (await (await doAutor.get(`${issuesUrl()}${chamado.id}/description-versions/`)).json()) as any;
      const versao = lista.results[0];

      // Restaurar = gravar de volta o HTML da versão, que é o que a tela faz.
      const res = await doAdm.patch(`${issuesUrl()}${chamado.id}/`, { description_html: versao.description_html });
      expect(res.status).toBe(200);
      expect(await descricaoGravada(chamado.id)).toBe(DESCRICAO_ORIGINAL);

      // A restauração também é uma alteração: o texto que ela substituiu fica guardado.
      const gravadas = await versoes(chamado.id);
      expect(gravadas).toHaveLength(2);
      expect(gravadas[1].ownedById).toBe(admId);
      expect(gravadas[1].descriptionHtml).toBe(DESCRICAO_REESCRITA);
    });
  });

  // ── Título (continua editável, com rastro na trilha) ───────────────────────

  describe("título", () => {
    it("um terceiro edita o título (200) e a autoria da edição fica gravada", async () => {
      const chamado = await chamadoDoAutor("Título antigo");
      const res = await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { name: "Título corrigido por terceiro" });
      expect(res.status).toBe(200);

      const corpo = (await res.json()) as any;
      expect(corpo.name).toBe("Título corrigido por terceiro");
      expect(corpo.updated_by).toBe(outroId);

      const gravado = await prismaReal().issue.findFirstOrThrow({ where: { id: chamado.id } });
      expect(gravado.updatedById).toBe(outroId);
      expect(gravado.createdById).toBe(autorId);
      expect(gravado.descriptionHtml).toBe(DESCRICAO_ORIGINAL);
    });

    it("edição de título entra no histórico com autor, valor antigo e novo", async () => {
      const chamado = await chamadoDoAutor("Título para o histórico");
      await doOutro.patch(`${issuesUrl()}${chamado.id}/`, { name: "Título reescrito" });

      const atividades = await prismaReal().issueActivity.findMany({
        where: { issueId: chamado.id, field: "name" },
      });
      expect(atividades).toHaveLength(1);
      expect(atividades[0].actorId).toBe(outroId);
      expect(atividades[0].oldValue).toBe("Título para o histórico");
      expect(atividades[0].newValue).toBe("Título reescrito");
    });
  });

  // ── Triagem (intake) ───────────────────────────────────────────────────────

  describe("triagem", () => {
    /** Solicitação aberta pelo autor na caixa de entrada. */
    async function solicitacaoDoAutor(nome: string) {
      const res = await doAutor.post(inboxUrl(), {
        issue: { name: nome, description_html: DESCRICAO_ORIGINAL },
      });
      expect(res.status).toBe(201);
      return (await res.json()) as any;
    }

    it("um terceiro reescreve a descrição pela triagem (200) e a versão anterior fica gravada", async () => {
      const solicitacao = await solicitacaoDoAutor("Solicitação limpa na triagem");
      const res = await doOutro.patch(`${inboxUrl()}${solicitacao.id}/`, {
        issue: { description_html: DESCRICAO_REESCRITA },
      });
      expect(res.status).toBe(200);
      expect(await descricaoGravada(solicitacao.id)).toBe(DESCRICAO_REESCRITA);

      const gravadas = await versoes(solicitacao.id);
      expect(gravadas).toHaveLength(1);
      expect(gravadas[0].descriptionHtml).toBe(DESCRICAO_ORIGINAL);
      expect(gravadas[0].ownedById).toBe(outroId);
      expect(await atividadesDeDescricao(solicitacao.id)).toHaveLength(1);
    });

    it("triagem: reenviar o mesmo corpo junto da decisão não gera versão", async () => {
      const solicitacao = await solicitacaoDoAutor("Solicitação aceita sem mexer no corpo");
      const res = await doOutro.patch(`${inboxUrl()}${solicitacao.id}/`, {
        status: 1,
        issue: { description_html: DESCRICAO_ORIGINAL },
      });
      expect(res.status).toBe(200);
      expect(await versoes(solicitacao.id)).toHaveLength(0);
    });

    it("triagem: a normalização automática não gera versão", async () => {
      const solicitacao = await solicitacaoDoAutor("Solicitação com HTML legado");
      const res = await doOutro.patch(`${inboxUrl()}${solicitacao.id}/`, {
        issue: { description_html: "<p>Relato normalizado.</p>", skip_activity: "true" },
      });
      expect(res.status).toBe(200);
      expect(await versoes(solicitacao.id)).toHaveLength(0);
    });

    it("apelido /intake-work-items/: um terceiro reescreve e a versão fica gravada (200)", async () => {
      const solicitacao = await solicitacaoDoAutor("Solicitação corrigida pelo apelido");
      const res = await doOutro.patch(`${intakeUrl()}${solicitacao.id}/`, {
        description_html: "<p>Corrigido pelo apelido da rota.</p>",
      });
      expect(res.status).toBe(200);
      expect(await descricaoGravada(solicitacao.id)).toBe("<p>Corrigido pelo apelido da rota.</p>");

      const gravadas = await versoes(solicitacao.id);
      expect(gravadas).toHaveLength(1);
      expect(gravadas[0].descriptionHtml).toBe(DESCRICAO_ORIGINAL);
      expect(gravadas[0].ownedById).toBe(outroId);
      expect(await atividadesDeDescricao(solicitacao.id)).toHaveLength(1);
    });

    it("apelido /intake-work-items/: a normalização automática não gera versão", async () => {
      const solicitacao = await solicitacaoDoAutor("Solicitação normalizada pelo apelido");
      const res = await doOutro.patch(`${intakeUrl()}${solicitacao.id}/`, {
        description_html: "<p>Relato normalizado pelo apelido.</p>",
        skip_activity: "true",
      });
      expect(res.status).toBe(200);
      expect(await versoes(solicitacao.id)).toHaveLength(0);
    });

    it("um terceiro edita o título pela triagem (200) e a autoria fica gravada", async () => {
      const solicitacao = await solicitacaoDoAutor("Título da solicitação");
      const res = await doOutro.patch(`${inboxUrl()}${solicitacao.id}/`, {
        issue: { name: "Título ajustado na triagem" },
      });
      expect(res.status).toBe(200);

      const gravado = await prismaReal().issue.findFirstOrThrow({ where: { id: solicitacao.id } });
      expect(gravado.name).toBe("Título ajustado na triagem");
      expect(gravado.updatedById).toBe(outroId);

      const atividades = await prismaReal().issueActivity.findMany({
        where: { issueId: solicitacao.id, field: "name" },
      });
      expect(atividades).toHaveLength(1);
      expect(atividades[0].actorId).toBe(outroId);
    });
  });

  // ── Comentários (comportamento que já existia) ──────────────────────────────

  describe("comentários", () => {
    let issueId: string;
    let comentarioDoAutorId: string;

    beforeAll(async () => {
      const chamado = await chamadoDoAutor("Chamado dos comentários");
      issueId = chamado.id;
      const res = await doAutor.post(`${issuesUrl()}${issueId}/comments/`, {
        comment_html: "<p>Comentário do autor.</p>",
      });
      expect(res.status).toBe(201);
      comentarioDoAutorId = ((await res.json()) as any).id;
    });

    it("autor do comentário edita o próprio comentário (200)", async () => {
      const res = await doAutor.patch(`${issuesUrl()}${issueId}/comments/${comentarioDoAutorId}/`, {
        comment_html: "<p>Comentário do autor, corrigido.</p>",
      });
      expect(res.status).toBe(200);
      expect(((await res.json()) as any).comment_html).toBe("<p>Comentário do autor, corrigido.</p>");
    });

    it("não-autor NÃO edita comentário alheio (403)", async () => {
      const res = await doOutro.patch(`${issuesUrl()}${issueId}/comments/${comentarioDoAutorId}/`, {
        comment_html: "<p>Reescrito por outra pessoa.</p>",
      });
      expect(res.status).toBe(403);
      expect(((await res.json()) as any).detail).toBe("Somente o autor pode editar o comentário.");
    });

    it("administrador do espaço TAMBÉM NÃO edita comentário alheio (403)", async () => {
      const res = await doAdm.patch(`${issuesUrl()}${issueId}/comments/${comentarioDoAutorId}/`, {
        comment_html: "<p>Reescrito pelo administrador.</p>",
      });
      expect(res.status).toBe(403);
    });
  });
});
