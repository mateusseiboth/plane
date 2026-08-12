/**
 * IA de levantamento de requisitos — o "texto fantasma" do editor de chamados e
 * a análise do chamado no momento de salvar.
 *
 * `POST /api/v1/workspaces/:slug/ia/sugestao-de-requisito/`  (enquanto digita)
 * `POST /api/v1/workspaces/:slug/ia/analise-de-chamado/`     (ao salvar)
 * `GET|PATCH /api/v1/workspaces/:slug/ia/configuracao/`      (o que cada espaço decide)
 *
 * As duas primeiras recebem o que está sendo escrito, montam o contexto do
 * chamado (título, descrição, comentários recentes, tipo, projeto, entidade e o
 * texto extraído dos anexos), consultam o provedor de IA configurado e devolvem
 * o resultado.
 *
 * Quatro coisas que as rotas garantem, nesta ordem de importância:
 *
 *  1. **A credencial da IA nunca vai para o navegador.** Ela é lida da
 *     configuração do processo (`config.ts`) e só aparece no cabeçalho da
 *     chamada de saída. O frontend fala apenas com o Plane.
 *  2. **A IA nunca impede de trabalhar.** Serviço desligado, formato inválido,
 *     fora do ar, com erro ou lento demais → 200 com resposta vazia. Nenhum 500
 *     chega a quem está escrevendo. Vale inclusive para o modo `exigir`: quem
 *     bloqueia é a tela, com base na nota que CHEGOU — sem nota, não bloqueia.
 *  3. **Trilha LGPD.** O texto do chamado é conteúdo do cliente e está saindo
 *     para um serviço fora da aplicação: fica registrado que saiu, para onde e
 *     quanto — sem repetir o conteúdo dentro do log.
 *  4. **O provedor é trocável.** Quem escolhe a implementação é a fábrica em
 *     `provedores/`, pelo nome vindo da configuração. As rotas não conhecem
 *     nenhum protocolo de IA.
 */

import prisma from "@db";
import {authPlugin} from "@middleware/auth";
import {configIaRequisitos, type ConfigIaRequisitos} from "@modules/ia-requisitos/config";
import {
  CHAVE_CONFIG_IA,
  mesclarConfigIa,
  sanitizarConfigIa,
  type ConfigIaDoEspaco,
} from "@modules/ia-requisitos/configuracao";
import {montarContexto, projetoDoChamado, type ContextoInformado} from "@modules/ia-requisitos/contexto";
import {criarProvedor} from "@modules/ia-requisitos/provedores";
import {
  ANALISE_VAZIA,
  normalizarCampo,
  normalizarCampoDeAnalise,
  RESPOSTA_VAZIA,
  type CampoAnalise,
  type CampoIa,
  type ContextoIa,
  type ProvedorDeIa,
  type RespostaAnalise,
  type RespostaIa,
} from "@modules/ia-requisitos/tipos";
import {AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit} from "@utils/audit";
import {EProjectAction, requireProjectAnyAction} from "@utils/permission-checks";
import {getWorkspaceOrFail, requireWorkspaceMember} from "@utils/workspace";
import Elysia from "elysia";

/** Quem pode abrir chamado no projeto — nada além disso é exigido. */
const PODE_ABRIR_CHAMADO = [EProjectAction.ISSUE_CREATE, EProjectAction.INTAKE_CREATE];

/** Nível de administrador do espaço de trabalho, como no resto das configurações. */
const NIVEL_ADMIN = 20;

/**
 * Tetos do texto que sai da aplicação. Generosos — a análise precisa do chamado
 * inteiro — mas existem: o corpo vem do navegador e ninguém garante o tamanho.
 */
const LIMITE = {titulo: 500, descricao: 20000, comentario: 10000} as const;

/**
 * A forma que o frontend consome. Os nomes canônicos são os do contrato
 * (`sugestao`/`faltando`/`confianca`); `suggestion`/`missing` acompanham como
 * apelidos porque o pedido da tarefa nomeia os dois primeiros em inglês.
 * Quando um dos nomes cair em desuso, é só apagar as duas linhas.
 */
function corpoDaResposta(resposta: RespostaIa) {
  return {...resposta, suggestion: resposta.sugestao, missing: resposta.faltando};
}

/**
 * `analisado` diz por extenso o que `aceitacao: null` já diz: não houve nota.
 * A tela usa isso para decidir se bloqueia — sem nota, nunca bloqueia.
 */
function corpoDaAnalise(analise: RespostaAnalise) {
  return {...analise, analisado: analise.aceitacao !== null};
}

type CorpoDoPedido = {
  campo?: unknown;
  texto_atual?: unknown;
  cursor?: unknown;
  project_id?: unknown;
  issue_id?: unknown;
  tipo?: unknown;
  entity_id?: unknown;
  /** O que a tela já tem em mãos; serve de reserva ao que o banco não sabe. */
  contexto?: unknown;
};

type CorpoDaAnalise = CorpoDoPedido & {
  titulo?: unknown;
  descricao?: unknown;
  comentario?: unknown;
};

function comoTexto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function comoId(valor: unknown): string | null {
  const texto = comoTexto(valor).trim();
  return texto || null;
}

function recortado(valor: unknown, limite: number): string {
  return comoTexto(valor).trim().slice(0, limite);
}

/** A configuração gravada para o espaço, já com os padrões do contrato aplicados. */
async function configDoEspaco(workspaceId: string): Promise<ConfigIaDoEspaco> {
  const gravado = await prisma.workspaceSetting.findFirst({where: {workspaceId, key: CHAVE_CONFIG_IA}});
  return sanitizarConfigIa(gravado?.value);
}

/**
 * O campo em edição, do ponto de vista da montagem do contexto.
 *
 * Na análise do chamado, título e descrição viajam no corpo do pedido: mandá-los
 * de novo dentro do contexto só duplicaria o texto. No comentário é o oposto —
 * o chamado salvo é justamente o contexto que falta.
 */
const CAMPO_DE_CONTEXTO: Record<CampoAnalise, CampoIa> = {chamado: "titulo", comentario: "comentario"};

/** O que sai da aplicação, contado — não copiado — para a trilha LGPD. */
function trilhaDeSaida(opcoes: {
  provedor: ProvedorDeIa;
  cfg: ConfigIaRequisitos;
  contexto: ContextoIa;
  caracteres: number;
  campo: string;
  projectId: string;
  issueId: string | null;
  operacao: "sugestao" | "analise";
}) {
  return {
    servico: "ia-requisitos",
    operacao: opcoes.operacao,
    formato: opcoes.provedor.formato,
    destino: opcoes.cfg.destino,
    campo: opcoes.campo,
    projeto_id: opcoes.projectId,
    chamado_id: opcoes.issueId,
    caracteres_enviados: opcoes.caracteres,
    comentarios_enviados: opcoes.contexto.comentarios.length,
    anexos_enviados: opcoes.contexto.anexos.length,
    anexos_com_texto: opcoes.contexto.anexos.filter((a) => a.texto_extraido).length,
  };
}

export const iaRequisitosModule = new Elysia({prefix: "/workspaces/:slug"})
  .use(authPlugin)

  // ── Texto fantasma, enquanto se escreve ────────────────────────────────────

  .post("/ia/sugestao-de-requisito/", async ({params: {slug}, body, user, headers, set}) => {
    const b = (body ?? {}) as CorpoDoPedido;

    const campo = normalizarCampo(b.campo);
    if (!campo) {
      set.status = 400;
      return {detail: "campo deve ser titulo, descricao ou comentario."};
    }
    const ws = await getWorkspaceOrFail(slug);

    // A caixa de comentário sabe o chamado; o modal de novo chamado sabe o
    // projeto. Um dos dois basta — sem projeto não há permissão a conferir.
    const issueId = comoId(b.issue_id);
    const projectId = comoId(b.project_id) ?? (issueId ? await projetoDoChamado(ws.id, issueId) : null);
    if (!projectId) {
      set.status = 400;
      return {detail: "project_id (ou issue_id de um chamado existente) é obrigatório."};
    }

    // Permissão vale sempre, com ou sem IA configurada: quem não pode abrir
    // chamado no projeto também não recebe ajuda para escrever um.
    await requireProjectAnyAction(ws.id, projectId, user.id, PODE_ABRIR_CHAMADO);

    // Recurso desligado (ou formato inexistente): resposta vazia sem chamar
    // ninguém e sem trilha — nada saiu da aplicação.
    const cfg = configIaRequisitos();
    const provedor = cfg.ligada ? criarProvedor(cfg) : null;
    if (!provedor) return corpoDaResposta(RESPOSTA_VAZIA);

    // O espaço de trabalho pode ter desligado só o texto fantasma.
    const doEspaco = await configDoEspaco(ws.id);
    if (!doEspaco.fantasma_ativo) return corpoDaResposta(RESPOSTA_VAZIA);

    const textoAtual = comoTexto(b.texto_atual);
    const cursorInformado = Number(b.cursor);
    const cursor = Number.isFinite(cursorInformado)
      ? Math.min(Math.max(Math.trunc(cursorInformado), 0), textoAtual.length)
      : textoAtual.length;

    try {
      const contexto = await montarContexto({
        workspaceId: ws.id,
        projectId,
        issueId,
        tipo: comoId(b.tipo),
        entityId: comoId(b.entity_id),
        informado: (b.contexto ?? null) as ContextoInformado | null,
        campo,
        cfg,
      });

      // LGPD: registra a saída do conteúdo, não o conteúdo. `export` é a ação do
      // vocabulário fechado que significa "dado deixou a aplicação" — a tela de
      // Auditoria já a exibe e filtra. O chamado ainda pode não existir; nesse
      // caso o evento fica pendurado no projeto, com `chamado_id` nulo.
      recordAudit({
        workspaceId: ws.id,
        entity: AUDIT_ENTITIES.ISSUE,
        entityId: issueId ?? projectId,
        action: AUDIT_ACTIONS.EXPORT,
        actor: user,
        headers,
        metadata: trilhaDeSaida({
          provedor,
          cfg,
          contexto,
          caracteres: textoAtual.length,
          campo,
          projectId,
          issueId,
          operacao: "sugestao",
        }),
      });

      return corpoDaResposta(await provedor.sugerir({campo, texto_atual: textoAtual, cursor, contexto}));
    } catch (e: any) {
      // Nem uma falha nossa (banco, storage) pode virar 500 para quem digita.
      console.error("[ia-requisitos] sugestão abortada:", e?.message ?? e);
      return corpoDaResposta(RESPOSTA_VAZIA);
    }
  })

  // ── Análise no salvar ──────────────────────────────────────────────────────

  .post("/ia/analise-de-chamado/", async ({params: {slug}, body, user, headers, set}) => {
    const b = (body ?? {}) as CorpoDaAnalise;

    const campo = normalizarCampoDeAnalise(b.campo);
    if (!campo) {
      set.status = 400;
      return {detail: "campo deve ser chamado ou comentario."};
    }
    const ws = await getWorkspaceOrFail(slug);

    const issueId = comoId(b.issue_id);
    const projectId = comoId(b.project_id) ?? (issueId ? await projetoDoChamado(ws.id, issueId) : null);
    if (!projectId) {
      set.status = 400;
      return {detail: "project_id (ou issue_id de um chamado existente) é obrigatório."};
    }

    // A mesma permissão da rota irmã: quem não pode abrir chamado no projeto
    // também não manda o chamado para análise.
    await requireProjectAnyAction(ws.id, projectId, user.id, PODE_ABRIR_CHAMADO);

    const cfg = configIaRequisitos();
    const provedor = cfg.ligada ? criarProvedor(cfg) : null;
    if (!provedor) return corpoDaAnalise(ANALISE_VAZIA);

    const doEspaco = await configDoEspaco(ws.id);
    const ligadaAqui = doEspaco.analise_ativa && (campo !== "comentario" || doEspaco.analise_em_comentarios);
    if (!ligadaAqui) return corpoDaAnalise(ANALISE_VAZIA);

    const titulo = recortado(b.titulo, LIMITE.titulo);
    const descricao = recortado(b.descricao, LIMITE.descricao);
    const comentario = recortado(b.comentario, LIMITE.comentario);

    // Sem texto não há o que analisar, e mandar vazio ao modelo só gastaria o
    // tempo de quem está esperando o botão de salvar voltar.
    const enviado = campo === "comentario" ? comentario : `${titulo}${descricao}`;
    if (!enviado) return corpoDaAnalise(ANALISE_VAZIA);

    try {
      const contexto = await montarContexto({
        workspaceId: ws.id,
        projectId,
        issueId,
        tipo: comoId(b.tipo),
        entityId: comoId(b.entity_id),
        informado: (b.contexto ?? null) as ContextoInformado | null,
        campo: CAMPO_DE_CONTEXTO[campo],
        cfg,
      });

      recordAudit({
        workspaceId: ws.id,
        entity: AUDIT_ENTITIES.ISSUE,
        entityId: issueId ?? projectId,
        action: AUDIT_ACTIONS.EXPORT,
        actor: user,
        headers,
        metadata: trilhaDeSaida({
          provedor,
          cfg,
          contexto,
          caracteres: titulo.length + descricao.length + comentario.length,
          campo,
          projectId,
          issueId,
          operacao: "analise",
        }),
      });

      return corpoDaAnalise(await provedor.analisar({campo, titulo, descricao, comentario, contexto}));
    } catch (e: any) {
      // Salvar chamado não pode falhar porque a análise falhou.
      console.error("[ia-requisitos] análise abortada:", e?.message ?? e);
      return corpoDaAnalise(ANALISE_VAZIA);
    }
  })

  // ── Configuração do espaço de trabalho ─────────────────────────────────────
  // Leitura para qualquer membro: a tela precisa saber se mostra o texto
  // fantasma, se analisa ao salvar e se desenha o medidor. Escrita só para quem
  // administra o espaço, como nas demais configurações.

  .get("/ia/configuracao/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const doEspaco = await configDoEspaco(ws.id);
    // `ia_disponivel` evita que a tela prometa um recurso que nunca vai
    // responder (espaço com tudo ligado e nenhum provedor configurado no
    // servidor). Diz apenas SE há provedor — nunca qual, onde, nem com que chave.
    return {...doEspaco, ia_disponivel: configIaRequisitos().ligada};
  })

  .patch("/ia/configuracao/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const membro = await requireWorkspaceMember(ws.id, user.id);
    if (membro.role < NIVEL_ADMIN) {
      set.status = 403;
      return {detail: "Apenas administradores podem alterar a configuração da IA."};
    }

    const gravado = await prisma.workspaceSetting.findFirst({where: {workspaceId: ws.id, key: CHAVE_CONFIG_IA}});
    const proxima = mesclarConfigIa(gravado?.value, body);
    await prisma.workspaceSetting.upsert({
      where: {workspaceId_key: {workspaceId: ws.id, key: CHAVE_CONFIG_IA}},
      create: {workspaceId: ws.id, key: CHAVE_CONFIG_IA, value: proxima},
      update: {value: proxima},
    });
    return {...proxima, ia_disponivel: configIaRequisitos().ligada};
  });
