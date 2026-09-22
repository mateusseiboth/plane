/**
 * Portal do cliente — rotas públicas (`/portal`) e a gestão das contas.
 *
 * Duas naturezas no mesmo módulo, separadas pelo crachá:
 *
 *  - `/portal` e `/portal/api/*` falam com o CLIENTE, autenticado pelo token do
 *    portal (`modules/portal/token`). Nenhuma delas usa o `authPlugin` do Plane:
 *    a conta do portal não é usuário do produto e não deve poder virar um.
 *  - `/workspaces/:slug/portal-accounts/*` é a administração dessas contas, e aí
 *    sim vale o crachá do Plane, restrito ao administrador do espaço.
 */

import { Elysia } from "elysia";
import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import {EProjectAction, requireProjectAction, requireWorkspaceAction} from "@utils/permission-checks";
import { publishRealtime } from "@utils/realtime";
import { checkRateLimit } from "@utils/rate-limiter";
import { getWorkspaceOrFail } from "@utils/workspace";
import {
  conferirArquivo,
  contarAnexos,
  guardarAnexo,
  LIMITES_DE_ANEXO,
  primeirosBytes,
  servirAnexoDoCliente,
  TETO_DO_CORPO,
} from "@modules/portal/anexos";
import {
  authenticate,
  contaAtiva,
  espacoPeloSlug,
  isUuid,
  normalizeEmail,
  sistemaLiberado,
  sistemasDaConta,
  type ContaDoPortal,
} from "@modules/portal/conta";
import { serializeAvaliacaoParaEquipe } from "@modules/portal/avaliacao";
import { createConta, deleteConta, listContas, resetSenhaDaConta, updateConta } from "@modules/portal/contas-admin.service";
import { isInteracaoDoChamado } from "@modules/portal/conversa";
import { closeSolicitacao, createInteracao, reopenSolicitacao, saveAvaliacao } from "@modules/portal/interacoes";
import { findVisitasDaConta, readVisitaDaConta } from "@modules/portal/visitas-do-cliente";
import { paginaDoPortal } from "@modules/portal/pagina";
import {
  dispensarResposta,
  estaConcluido,
  jaResolvido,
  pedidoAResponder,
  registrarResposta,
  respostasPendentes,
} from "@modules/portal/resposta";
import {
  abrirSolicitacao,
  chamadoDaConta,
  solicitacaoDaConta,
  solicitacoesDaConta,
} from "@modules/portal/solicitacoes";
import { applyPortalReset, requestPortalReset } from "@modules/portal/senha";
import { signTokenDoPortal, readTokenDoPortal } from "@modules/portal/token";
import { isEmailEnabled } from "@utils/email";

/** Mesma frase para e-mail inexistente e senha errada: a tela não entrega quem existe. */
const CREDENCIAL_INVALIDA = "E-mail ou senha inválidos.";
/** Tentativas de login por IP a cada 5 minutos. */
const TENTATIVAS = { max: 10, janelaMs: 5 * 60_000 };

function ipDaRequisicao(headers: Record<string, string | undefined>): string {
  return (headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() || headers["x-real-ip"] || "desconhecido";
}

function contaDto(conta: ContaDoPortal) {
  return { id: conta.id, nome: conta.name, email: conta.email };
}

/** O crachá do portal já resolvido em conta ativa; `null` manda a página pedir login de novo. */
async function contaDoPedido(headers: Record<string, string | undefined>): Promise<ContaDoPortal | null> {
  const bruto = headers["authorization"]?.startsWith("Bearer ") ? headers["authorization"].slice(7) : null;
  const cracha = await readTokenDoPortal(bruto);
  if (!cracha) return null;
  return contaAtiva(cracha.contaId, cracha.workspaceId, cracha.versao);
}

const naoAutenticado = (set: any) => {
  set.status = 401;
  return { detail: "Entre novamente para continuar." };
};

export const portalModule = new Elysia({ prefix: "/portal" })
  /**
   * Corta o upload gigante ANTES de a API ler o corpo.
   *
   * Sem isto o servidor bufferiza os 500 MB inteiros só para depois descobrir
   * que não cabiam — e num endereço público isso é o ataque mais barato que
   * existe. O teto aqui é o do maior arquivo aceito mais a folga do multipart;
   * quem decide de verdade, por tipo de arquivo, é `conferirArquivo`.
   */
  .onRequest(({ request, set }) => {
    if (!request.url.includes("/anexos")) return;
    const tamanho = Number(request.headers.get("content-length") ?? 0);
    if (!Number.isFinite(tamanho) || tamanho <= TETO_DO_CORPO) return;
    set.status = 413;
    return { detail: "O arquivo passa do limite aceito pelo portal." };
  })

  // ── A página ────────────────────────────────────────────────────────────────
  .get("/", ({ set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8";
    return paginaDoPortal();
  })

  // ── Nome do espaço, para o cabeçalho da página ─────────────────────────────
  .get("/api/espaco", async ({ query }) => {
    const espaco = await espacoPeloSlug(String((query as any).workspace ?? ""));
    return { nome: espaco?.name ?? "Central de Solicitações" };
  })

  // ── Entrar ────────────────────────────────────────────────────────────────
  .post("/api/entrar", async ({ body, headers, set }) => {
    const b = (body ?? {}) as any;
    if (!checkRateLimit(`portal-login:${ipDaRequisicao(headers as any)}`, TENTATIVAS.max, TENTATIVAS.janelaMs)) {
      set.status = 429;
      return { detail: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
    }
    const espaco = await espacoPeloSlug(String(b.workspace ?? ""));
    if (!espaco) {
      set.status = 403;
      return { detail: CREDENCIAL_INVALIDA };
    }
    const conta = await authenticate(espaco.id, b.email, b.senha);
    if (!conta) {
      recordAudit({
        workspaceId: espaco.id,
        entity: AUDIT_ENTITIES.USER,
        entityId: normalizeEmail(b.email) || "desconhecido",
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        actor: { email: normalizeEmail(b.email) },
        headers: headers as any,
        metadata: { origem: "portal" },
      });
      set.status = 403;
      return { detail: CREDENCIAL_INVALIDA };
    }
    recordAudit({
      workspaceId: espaco.id,
      entity: AUDIT_ENTITIES.USER,
      entityId: conta.id,
      action: AUDIT_ACTIONS.LOGIN,
      actor: { id: conta.id, email: conta.email },
      headers: headers as any,
      metadata: { origem: "portal" },
    });
    return { token: await signTokenDoPortal(conta.id, conta.workspaceId, conta.tokenUpdatedAt), conta: contaDto(conta) };
  })

  // ── Esqueci minha senha ───────────────────────────────────────────────────
  // A resposta é a mesma para e-mail cadastrado ou não: dizer qual existe
  // entregaria a lista de clientes a quem tentasse adivinhar.
  .post("/api/esqueci-senha", async ({ body, headers, set }) => {
    const b = (body ?? {}) as any;
    const ip = ipDaRequisicao(headers as any);
    const email = normalizeEmail(b.email);
    if (!checkRateLimit(`portal-esqueci:${ip}`, 10) || !checkRateLimit(`portal-esqueci:${email}`, 5)) {
      set.status = 429;
      return { detail: "Muitos pedidos seguidos. Aguarde um minuto e tente de novo." };
    }
    if (!(await isEmailEnabled())) {
      set.status = 400;
      return { detail: "A recuperação de senha por e-mail não está disponível. Fale com o suporte." };
    }
    try {
      await requestPortalReset(String(b.workspace ?? ""), email, ip);
    } catch (e) {
      // Falha de envio não muda a resposta: ela diria que o e-mail existe.
      console.error("[portal] falha ao enviar o link de nova senha:", e);
    }
    return { detail: "Se o e-mail estiver cadastrado, você vai receber o link para criar uma nova senha." };
  })

  .post("/api/redefinir-senha", async ({ body, headers }) => {
    const conta = await applyPortalReset((body ?? {}) as any);
    recordAudit({
      workspaceId: conta.workspaceId,
      entity: AUDIT_ENTITIES.USER,
      entityId: conta.id,
      action: AUDIT_ACTIONS.PASSWORD_CHANGE,
      actor: { id: conta.id, email: conta.email },
      headers: headers as any,
      metadata: { origem: "portal", por_email: true },
    });
    return { detail: "Senha alterada. Entre com a senha nova." };
  })

  // ── Quem sou eu (retomada de sessão) ──────────────────────────────────────
  .get("/api/eu", async ({ headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    return { conta: contaDto(conta) };
  })

  // ── Sistemas liberados para a conta ───────────────────────────────────────
  .get("/api/sistemas", async ({ headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    return { results: await sistemasDaConta(conta) };
  })

  // ── Minhas solicitações ───────────────────────────────────────────────────
  .get("/api/solicitacoes", async ({ headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    return { results: await solicitacoesDaConta(conta) };
  })

  .get("/api/solicitacoes/:id", async ({ params: { id }, headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    const solicitacao = await solicitacaoDaConta(conta, id);
    if (!solicitacao) {
      set.status = 404;
      return { detail: "Solicitação não encontrada." };
    }
    return solicitacao;
  })

  // ── O cliente age sobre a solicitação ─────────────────────────────────────
  // Responder, encerrar, reabrir e avaliar. Quem pode o quê está em
  // `modules/portal/regras-do-cliente`; o erro sai pelo tratador global, com
  // `errors[].path` quando é de campo.
  .post("/api/solicitacoes/:id/interacoes", async ({ params: { id }, body, headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    set.status = 201;
    return createInteracao(conta, id, (body ?? {}) as any, headers as any);
  })

  .post("/api/solicitacoes/:id/encerrar", async ({ params: { id }, body, headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    return closeSolicitacao(conta, id, (body ?? {}) as any, headers as any);
  })

  .post("/api/solicitacoes/:id/reabrir", async ({ params: { id }, body, headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    return reopenSolicitacao(conta, id, (body ?? {}) as any, headers as any);
  })

  .post("/api/solicitacoes/:id/avaliacao", async ({ params: { id }, body, headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    set.status = 201;
    return saveAvaliacao(conta, id, (body ?? {}) as any, headers as any);
  })

  // ── Visitas técnicas da entidade do cliente (só leitura) ──────────────────
  .get("/api/visitas", async ({ query, headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    return { results: await findVisitasDaConta(conta, (query as any).situacao) };
  })

  .get("/api/visitas/:id", async ({ params: { id }, headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    const visita = await readVisitaDaConta(conta, id);
    if (!visita) {
      set.status = 404;
      return { detail: "Visita não encontrada." };
    }
    return visita;
  })

  // ── Abrir solicitação ─────────────────────────────────────────────────────
  .post("/api/solicitacoes", async ({ body, headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    const b = (body ?? {}) as any;
    if (!String(b.titulo ?? "").trim()) {
      set.status = 400;
      return { detail: "Escreva um resumo em uma linha." };
    }
    const sistema = await sistemaLiberado(conta, String(b.sistema_id ?? ""));
    if (!sistema) {
      set.status = 403;
      return { detail: "Escolha um dos sistemas liberados para você." };
    }
    set.status = 201;
    return abrirSolicitacao(conta, sistema, b, headers as any);
  })

  // ── Anexar arquivo à solicitação ──────────────────────────────────────────
  // Upload de gente de fora: tudo que dá para recusar é recusado antes de o
  // arquivo virar registro. Ver `modules/portal/anexos` para os tetos e a
  // lista de tipos.
  .post("/api/solicitacoes/:id/anexos", async ({ params: { id }, body, headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);

    if (!checkRateLimit(`portal-anexo:${conta.id}`, LIMITES_DE_ANEXO.envios.max, LIMITES_DE_ANEXO.envios.janelaMs)) {
      set.status = 429;
      return { detail: "Muitos envios seguidos. Aguarde alguns minutos e tente de novo." };
    }

    const chamado = await chamadoDaConta(conta, id);
    if (!chamado) {
      set.status = 404;
      return { detail: "Solicitação não encontrada." };
    }

    const arquivo = (body as any)?.arquivo as Blob | undefined;
    if (!arquivo || typeof arquivo.arrayBuffer !== "function") {
      set.status = 400;
      return { detail: "Escolha um arquivo para anexar." };
    }

    // O anexo pode vir junto de uma resposta do cliente: aí conta no limite
    // daquela resposta, e não no da abertura.
    const interacao = String((body as any)?.interacao ?? "") || null;
    if (interacao && !(isUuid(interacao) && (await isInteracaoDoChamado(chamado.issueId, interacao)))) {
      set.status = 404;
      return { detail: "Resposta não encontrada." };
    }

    if ((await contarAnexos(chamado.issueId, interacao)) >= LIMITES_DE_ANEXO.porSolicitacao) {
      set.status = 400;
      return { detail: `Cada envio aceita até ${LIMITES_DE_ANEXO.porSolicitacao} arquivos.` };
    }

    const conferencia = conferirArquivo({
      nome: (arquivo as File).name ?? "arquivo",
      tipoInformado: arquivo.type ?? "",
      tamanho: arquivo.size,
      inicio: await primeirosBytes(arquivo),
    });
    if (!conferencia.aceito) {
      set.status = conferencia.situacao;
      return { detail: conferencia.detalhe };
    }

    // Falha de storage não é culpa de quem está do outro lado: a mensagem diz o
    // que fazer, e o motivo técnico fica no log do servidor.
    const anexo = await guardarAnexo({
      ...chamado,
      arquivo,
      nome: conferencia.nome,
      tipo: conferencia.tipo,
      tamanho: arquivo.size,
      interacao,
    }).catch((erro) => {
      console.error("[portal] falha ao guardar anexo:", erro);
      return null;
    });
    if (!anexo) {
      set.status = 502;
      return { detail: "Não foi possível guardar o arquivo agora. Tente de novo em instantes." };
    }

    // A equipe pode estar com o chamado aberto: o anexo chega sem F5.
    publishRealtime(chamado.workspaceId, {
      entity: "issue",
      action: "update",
      project_id: chamado.projectId,
      id: chamado.issueId,
    });
    recordAudit({
      workspaceId: chamado.workspaceId,
      entity: AUDIT_ENTITIES.ATTACHMENT,
      entityId: anexo.id,
      action: AUDIT_ACTIONS.CREATE,
      actor: { id: conta.id, email: conta.email },
      headers: headers as any,
      metadata: { origem: "portal", issue_id: chamado.issueId, nome: anexo.nome, tipo: anexo.tipo },
    });

    set.status = 201;
    return anexo;
  })

  // ── Baixar o anexo que o próprio cliente enviou ───────────────────────────
  .get("/api/solicitacoes/:id/anexos/:anexoId", async ({ params: { id, anexoId }, headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    const chamado = await chamadoDaConta(conta, id);
    if (!chamado) {
      set.status = 404;
      return { detail: "Solicitação não encontrada." };
    }
    const arquivo = await servirAnexoDoCliente(chamado.issueId, anexoId);
    if (!arquivo) {
      set.status = 404;
      return { detail: "Anexo não encontrado." };
    }
    return arquivo;
  });

// ── Administração das contas (crachá do Plane, ação `portal.manage`) ─────────
//
// Rotas finas: a regra (campos, referências, senha provisória) mora em
// `modules/portal/contas-admin*`.

/** O espaço já conferido contra a ação `portal.manage`. */
async function readEspacoAdministrado(slug: string, userId: string) {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceAction(ws.id, userId, EProjectAction.PORTAL_MANAGE);
  return ws;
}

export const portalAdminModule = new Elysia({ prefix: "/workspaces/:slug/portal-accounts" })
  .use(authPlugin)

  .get("/", async ({ params: { slug }, user }: any) => {
    const ws = await readEspacoAdministrado(slug, user.id);
    // `email_enabled` diz à tela se o "redefinir senha" pode mandar link.
    return { results: await listContas(ws.id), email_enabled: await isEmailEnabled() };
  })

  .post("/", async ({ params: { slug }, body, user, set, headers }: any) => {
    const espaco = await readEspacoAdministrado(slug, user.id);
    set.status = 201;
    return createConta({ espaco, autor: user, headers }, body ?? {});
  })

  .patch("/:id", async ({ params: { slug, id }, body, user, headers }: any) => {
    const espaco = await readEspacoAdministrado(slug, user.id);
    return updateConta({ espaco, autor: user, headers }, id, body ?? {});
  })

  .delete("/:id", async ({ params: { slug, id }, user, set, headers }: any) => {
    const espaco = await readEspacoAdministrado(slug, user.id);
    await deleteConta({ espaco, autor: user, headers }, id);
    set.status = 204;
    return null;
  })

  // Link por e-mail quando há SMTP; senha provisória quando não há ou quando
  // o corpo pede `{ modo: "provisoria" }`.
  .post("/:id/reset-password/", async ({ params: { slug, id }, body, user, headers }: any) => {
    const espaco = await readEspacoAdministrado(slug, user.id);
    return resetSenhaDaConta({ espaco, autor: user, headers }, id, body ?? {}, ipDaRequisicao(headers));
  });

// ── O que o portal trouxe para dentro do chamado (crachá do Plane) ───────────
//
// A conta que abriu e as avaliações do cliente, lidas no detalhe do chamado por
// quem pode ver o chamado.

export const portalChamadoModule = new Elysia({ prefix: "/workspaces/:slug/portal-requests" })
  .use(authPlugin)

  .get("/:issue_id/", async ({ params: { slug, issue_id }, user, set }: any) => {
    const ws = await getWorkspaceOrFail(slug);
    const pedido = isUuid(issue_id)
      ? await prisma.portalRequest.findFirst({
          where: { issueId: issue_id, issue: { workspaceId: ws.id, deletedAt: null } },
          include: {
            account: { select: { id: true, name: true, email: true } },
            issue: { select: { projectId: true } },
          },
        })
      : null;
    if (!pedido) {
      set.status = 404;
      return { detail: "Este chamado não veio do portal do cliente." };
    }
    await requireProjectAction(ws.id, pedido.issue.projectId, user.id, EProjectAction.ISSUE_VIEW);
    const avaliacoes = await prisma.portalEvaluation.findMany({
      where: { issueId: issue_id },
      orderBy: { createdAt: "desc" },
    });
    return { account: pedido.account, evaluations: avaliacoes.map(serializeAvaliacaoParaEquipe) };
  });

// ── Resposta ao cliente (crachá do Plane, quem trabalha no chamado) ──────────
//
// A resposta é OPCIONAL, e de propósito. Recusar a conclusão sem resposta
// significaria o cartão voltar sozinho para a coluna anterior no quadro,
// derrubar conclusão em massa e travar automação — para punir a equipe por algo
// que já aconteceu. Aqui a conclusão sempre passa, e o pedido de resposta vem
// logo atrás: quem não vai responder tem de dizer isso em um clique, e o
// "dispensada" fica gravado com nome e hora. Enquanto ninguém fizer nem uma
// coisa nem outra, o chamado continua na fila de pendências (ver
// `respostasPendentes`) — a cobrança substitui o bloqueio.

export const portalRespostaModule = new Elysia({ prefix: "/workspaces/:slug/portal-answers" })
  .use(authPlugin)

  // O que este usuário precisa responder ao cliente.
  .get("/pending/", async ({ params: { slug }, user }: any) => {
    const ws = await getWorkspaceOrFail(slug);
    return { results: await respostasPendentes(ws.id, user.id) };
  })

  // Responder (ou dispensar a resposta) de um chamado nascido no portal.
  .post("/:issue_id/", async ({ params: { slug, issue_id }, body, user, set, headers }: any) => {
    const ws = await getWorkspaceOrFail(slug);
    const pedido = await pedidoAResponder(ws.id, issue_id);
    // Chamado que não veio do portal não tem a quem responder.
    if (!pedido) {
      set.status = 404;
      return { detail: "Este chamado não veio do portal do cliente." };
    }
    await requireProjectAction(ws.id, pedido.issue.projectId, user.id, EProjectAction.COMMENT_CREATE);

    if (!estaConcluido(pedido)) {
      set.status = 400;
      return { detail: "Responda ao cliente quando o chamado estiver concluído." };
    }
    if (await jaResolvido(issue_id)) {
      set.status = 409;
      return { detail: "Este chamado já foi respondido." };
    }

    const b = (body ?? {}) as any;
    const ctx = { pedido, autor: user, headers };
    if (b.pular) {
      set.status = 201;
      return dispensarResposta({ ...ctx, motivo: b.motivo });
    }

    const texto = String(b.resposta ?? "").trim();
    if (!texto) {
      set.status = 400;
      return { detail: "Escreva a resposta ao cliente ou marque que vai concluir sem responder." };
    }
    set.status = 201;
    return { resposta: await registrarResposta({ ...ctx, texto }) };
  });
