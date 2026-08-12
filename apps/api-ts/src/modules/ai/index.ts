import prisma from "@db";
import {authPlugin} from "@middleware/auth";
import {chatComplete} from "@modules/ai/cliente-de-chat";
import {escolherMelhorador, type PropostaDeMelhoria} from "@modules/ai/melhoria-de-texto";
import {projetoDoChamado} from "@modules/ia-requisitos/contexto";
import {normalizarCampoDeMelhoria} from "@modules/ia-requisitos/tipos";
import {AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit} from "@utils/audit";
import {paginate} from "@utils/pagination";
import {EProjectAction, requireProjectAnyAction} from "@utils/permission-checks";
import {getWorkspaceOrFail, requireWorkspaceMember, requireWorkspaceWriter} from "@utils/workspace";
import Elysia from "elysia";

/** Quem pode abrir chamado no projeto — a mesma régua das rotas de IA irmãs. */
const PODE_ABRIR_CHAMADO = [EProjectAction.ISSUE_CREATE, EProjectAction.INTAKE_CREATE];

function comoId(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/** O que a rota diz quando o serviço respondeu, mas sem proposta nenhuma. */
const SEM_PROPOSTA = "A IA não propôs alteração para este texto.";

/**
 * A resposta do "Melhorar com IA", na forma que a tela do diff consome.
 *
 * `response` e `original` continuam onde sempre estiveram — o texto da IA e o
 * do autor, lado a lado. O que entra é o que permite ESCOLHER entre os dois:
 *
 *  - `mudou` — houve proposta. `false` é o caso honesto de o serviço não ter
 *    produzido nada, e vem com `detail` dizendo isso por extenso, porque
 *    devolver o texto intacto sob um aviso de sucesso é mentir para quem clicou.
 *  - `avisos` — as suspeitas da guarda (`perdidos`, `inventados`). Informam a
 *    decisão; **não** vetam a proposta, e por isso não mudam nada aqui.
 *  - `aceitacao` — a nota antes → depois, ou `null` quando não houve nota. É
 *    referência ao lado do diff, nunca veredito: a rota não compara a nota com
 *    mínimo nenhum, não decide "já está bom" e não descarta proposta.
 *
 * Nenhum julgamento mora no servidor: ele entrega a proposta e os dados, e quem
 * escreveu o texto decide.
 */
function corpoDaMelhoria(proposta: PropostaDeMelhoria, original: string) {
  return {
    response: proposta.html,
    original,
    mudou: proposta.mudou,
    avisos: proposta.avisos,
    aceitacao: proposta.aceitacao,
    ...(proposta.mudou ? {} : {detail: SEM_PROPOSTA}),
  };
}

/**
 * Onde pendurar a trilha LGPD: o chamado quando ele existe, o projeto quando só
 * ele é conhecido, e o espaço de trabalho quando a tela mandou apenas o texto —
 * que é o caso do botão hoje.
 */
function alvoDaTrilha(workspaceId: string, projectId: string | null, issueId: string | null) {
  if (issueId) return {entity: AUDIT_ENTITIES.ISSUE, entityId: issueId};
  if (projectId) return {entity: AUDIT_ENTITIES.PROJECT, entityId: projectId};
  return {entity: AUDIT_ENTITIES.WORKSPACE, entityId: workspaceId};
}

// Serialize a provider to the snake_case shape the frontend (and our POST/PATCH
// bodies) use. The api key is NEVER returned — only a boolean flag — so the edit
// form starts with an empty key field and an unchanged key is preserved.
function serializeProvider(p: any) {
  return {
    id: p.id,
    name: p.name,
    provider_type: p.providerType,
    base_url: p.baseUrl ?? null,
    default_model: p.defaultModel ?? null,
    timeout_secs: p.timeoutSecs ?? 30,
    is_active: p.isActive,
    is_default: p.isDefault,
    has_api_key: !!p.apiKey,
    // For "custom" providers: how to parse the response (openai | ollama | anthropic | text).
    response_format: (p.metadata as any)?.response_format ?? "openai",
    created_at: p.createdAt ?? null,
  };
}

export const aiModule = new Elysia({prefix: "/workspaces/:slug"})
  .use(authPlugin)

  // ── AI Provider Management ─────────────────────────────────────────────────

  .get("/ai-providers/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const where = {workspaceId: ws.id, deletedAt: null};
    return paginate({
      query: async (skip, take) =>
        (
          await prisma.aiProvider.findMany({
            where,
            skip,
            take,
            select: {
              id: true,
              name: true,
              providerType: true,
              baseUrl: true,
              defaultModel: true,
              timeoutSecs: true,
              isActive: true,
              isDefault: true,
              apiKey: true,
              metadata: true,
              createdAt: true,
            },
            orderBy: {name: "asc"},
          })
        ).map(serializeProvider),
      count: () => prisma.aiProvider.count({where}),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/ai-providers/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.name || !b.provider_type) {
      set.status = 400;
      return {detail: "name e provider_type são obrigatórios."};
    }

    // If setting as default, unset others
    if (b.is_default) {
      await prisma.aiProvider.updateMany({where: {workspaceId: ws.id, deletedAt: null}, data: {isDefault: false}});
    }

    try {
      const provider = await prisma.aiProvider.create({
        data: {
          workspaceId: ws.id,
          name: b.name,
          providerType: b.provider_type,
          baseUrl: b.base_url ?? null,
          apiKey: b.api_key ?? null,
          defaultModel: b.default_model ?? null,
          timeoutSecs: b.timeout_secs ?? 30,
          isActive: b.is_active ?? true,
          isDefault: b.is_default ?? false,
          metadata: {...(b.metadata ?? {}), ...(b.response_format ? {response_format: b.response_format} : {})},
          createdById: user.id,
        },
      });
      set.status = 201;
      return serializeProvider(provider);
    } catch (e: any) {
      if (e?.code === "P2002") {
        set.status = 409;
        return {detail: "Já existe um provedor de IA com este nome."};
      }
      throw e;
    }
  })

  .get("/ai-providers/:provider_id/", async ({params: {slug, provider_id}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const p = await prisma.aiProvider.findFirstOrThrow({where: {id: provider_id, workspaceId: ws.id, deletedAt: null}});
    return serializeProvider(p);
  })

  .patch("/ai-providers/:provider_id/", async ({params: {slug, provider_id}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (b.is_default) {
      await prisma.aiProvider.updateMany({where: {workspaceId: ws.id, deletedAt: null}, data: {isDefault: false}});
    }
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.base_url !== undefined) data.baseUrl = b.base_url;
    // Only overwrite the key when a non-empty value is sent (the edit form leaves
    // it blank to keep the existing key — never send "" or it would be wiped).
    if (typeof b.api_key === "string" && b.api_key.trim() !== "") data.apiKey = b.api_key;
    if (b.default_model !== undefined) data.defaultModel = b.default_model;
    if (b.timeout_secs !== undefined) data.timeoutSecs = b.timeout_secs;
    if (b.is_active !== undefined) data.isActive = b.is_active;
    if (b.is_default !== undefined) data.isDefault = b.is_default;
    if (b.response_format !== undefined) {
      const current = await prisma.aiProvider.findUnique({where: {id: provider_id}, select: {metadata: true}});
      data.metadata = {...((current?.metadata as any) ?? {}), response_format: b.response_format};
    }
    const p = await prisma.aiProvider.update({where: {id: provider_id}, data});
    return serializeProvider(p);
  })

  .delete("/ai-providers/:provider_id/", async ({params: {slug, provider_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    await prisma.aiProvider.update({where: {id: provider_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // ── AI Features (issue assistant) ─────────────────────────────────────────

  .post("/ai-assistant/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const provider = await prisma.aiProvider.findFirst({
      where: {workspaceId: ws.id, isDefault: true, isActive: true, deletedAt: null},
    });
    if (!provider) {
      set.status = 400;
      return {detail: "Nenhum provedor de IA ativo configurado."};
    }

    const b = body as any;
    const task = b.task ?? "summarize"; // summarize | suggest_description | suggest_label | suggest_assignee
    const content = b.content ?? b.issue_description ?? "";

    try {
      const response = await callAiProvider(provider, task, content);
      return {response, task, model: provider.defaultModel};
    } catch (e: any) {
      set.status = 502;
      return {detail: `Erro no provedor de IA: ${e.message}`};
    }
  })

  // ── Melhorar com IA ────────────────────────────────────────────────────────
  // A rota só orquestra: quem melhora o texto — o provedor cadastrado pelo
  // espaço ou a IA de requisitos — é escolhido em `melhoria-de-texto.ts`.
  //
  // Ela também não JULGA a proposta (Parte 3 do contrato): entrega o texto da
  // IA, o do autor, os avisos da guarda e a nota antes → depois, e quem decide
  // se aplica é quem escreveu.

  .post("/ai-assistant/improve-text/", async ({params: {slug}, body, user, headers, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const b = (body ?? {}) as any;
    const inputHtml: string = typeof b.content === "string" ? b.content : "";
    if (!inputHtml || inputHtml === "<p></p>") {
      set.status = 400;
      return {detail: "Nenhum texto para melhorar."};
    }

    // A tela ainda manda só o texto; quando mandar o chamado, o contexto vem do
    // banco — e aí a permissão do projeto passa a valer, como nas rotas irmãs.
    const issueId = comoId(b.issue_id);
    const projectId = comoId(b.project_id) ?? (issueId ? await projetoDoChamado(ws.id, issueId) : null);
    if (projectId) await requireProjectAnyAction(ws.id, projectId, user.id, PODE_ABRIR_CHAMADO);

    const melhorador = await escolherMelhorador({
      workspaceId: ws.id,
      campo: normalizarCampoDeMelhoria(b.campo),
      html: inputHtml,
      daTela: b.context ?? {},
      projectId,
      issueId,
    });
    if (!melhorador) {
      set.status = 400;
      return {detail: "Nenhum provedor de IA configurado. Acesse Configurações → Provedores de IA."};
    }

    // LGPD: o texto do chamado está saindo da aplicação. Fica registrado que
    // saiu, para onde e quanto — nunca o que saiu.
    const alvo = alvoDaTrilha(ws.id, projectId, issueId);
    recordAudit({
      workspaceId: ws.id,
      ...alvo,
      action: AUDIT_ACTIONS.EXPORT,
      actor: user,
      headers,
      metadata: melhorador.trilha,
    });

    try {
      const proposta = await melhorador.melhorar();
      // Nada chegou: o serviço falhou ou respondeu vazio. Quem clicou está
      // esperando, então a falha aparece — não vira um "melhorei" silencioso.
      if (!proposta.html) {
        set.status = 502;
        return {detail: "A IA não devolveu um texto melhorado. Tente novamente em instantes."};
      }
      return corpoDaMelhoria(proposta, inputHtml);
    } catch (e: any) {
      set.status = 502;
      return {detail: `Erro no provedor de IA: ${e.message}`};
    }
  })

  .post("/projects/:project_id/ai-assistant/", async ({params: {slug, project_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const provider = await prisma.aiProvider.findFirst({
      where: {workspaceId: ws.id, isDefault: true, isActive: true, deletedAt: null},
    });
    if (!provider || !provider.apiKey) {
      set.status = 400;
      return {detail: "Nenhum provedor de IA ativo configurado."};
    }

    const b = body as any;
    const task = b.task ?? "summarize";
    const content = b.content ?? "";

    try {
      const response = await callAiProvider(provider, task, content);
      return {response, task, model: provider.defaultModel};
    } catch (e: any) {
      set.status = 502;
      return {detail: `Erro no provedor de IA: ${e.message}`};
    }
  });

// Single-prompt helper used by the simpler assistant endpoints.
async function callAiProvider(provider: any, task: string, content: string): Promise<string> {
  const prompts: Record<string, string> = {
    summarize: `Summarize this issue/task in 2-3 sentences:\n\n${content}`,
    suggest_description: `Write a clear, detailed description for this task:\n\n${content}`,
    generate_documentation: `Generate technical documentation for this:\n\n${content}`,
    suggest_response: `Suggest a helpful response to this support ticket:\n\n${content}`,
    improve_text: `Você é um assistente de escrita profissional em português. Melhore o texto abaixo: corrija erros ortográficos e gramaticais, melhore a clareza e o profissionalismo, mantendo o mesmo significado e idioma (português). Retorne APENAS o texto melhorado, sem explicações adicionais.\n\n${content}`,
    // For improve_text_with_context the caller builds the full prompt and passes it as content
    improve_text_with_context: content,
  };
  const prompt = prompts[task] ?? `${task}:\n\n${content}`;
  return chatComplete(provider, [{role: "user", content: prompt}]);
}
