import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, getProjectOrFail , requireWorkspaceMember} from "@utils/workspace";
import { saveAsset, serveAsset, copyAsset } from "@utils/storage";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit, type AuditActor } from "@utils/audit";

const ENTITY_TYPE_MAP: Record<string, number> = {
  COMMENT_DESCRIPTION: 4, ISSUE_ATTACHMENT: 2, ISSUE_DESCRIPTION: 2,
  DRAFT_ISSUE_DESCRIPTION: 2, PAGE_DESCRIPTION: 3, PROJECT_COVER: 1,
  USER_AVATAR: 0, USER_COVER: 0, WORKSPACE_LOGO: 0,
};

// Files are stored in the configured S3 bucket when one is set up (workspace
// settings → Storage), otherwise on local disk. See utils/storage.ts.
async function saveFile(assetId: string, file: Blob) {
  await saveAsset(assetId, file);
}

function serveFile(assetId: string, mimeType?: string | null) {
  return serveAsset(assetId, mimeType);
}

// Entity types enum: 0=workspace, 1=project, 2=issue, 3=page, 4=comment
const ENTITY_TYPE = { WORKSPACE: 0, PROJECT: 1, ISSUE: 2, PAGE: 3, COMMENT: 4 };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nome de exibição do arquivo: o original do upload, com o caminho como reserva. */
function assetFileName(asset: { asset: string; id: string; attributes: unknown }): string {
  const original = (asset.attributes as any)?.name;
  if (typeof original === "string" && original.trim()) return original.trim();
  return asset.asset.split("/").pop() || asset.id;
}

/**
 * O anexo do chamado como o painel do produto o consome.
 *
 * `asset_url` é o que faz o clique abrir o arquivo, e ele depende da convenção
 * com que o anexo foi gravado: os uploads da API v2 e do portal usam o id do
 * `file_assets` como chave no storage (um UUID), enquanto os registros vindos
 * do SAC guardam o caminho antigo. As duas formas convivem, então a URL sai de
 * qual delas está ali.
 */
function serializeIssueAttachment(a: any, slug: string, projectId: string, workspaceId: string) {
  const asset: string = a.asset ?? "";
  const assetUrl = UUID_RE.test(asset)
    ? `/api/assets/v2/workspaces/${slug}/projects/${projectId}/${asset}/`
    : `/media/${asset}`;
  return {
    id: a.id,
    asset,
    asset_url: assetUrl,
    attributes: a.attributes ?? {},
    issue: a.issueId,
    issue_id: a.issueId,
    workspace: workspaceId,
    project: projectId,
    created_by: a.createdById ?? null,
    updated_by: a.updatedById ?? null,
    created_at: a.createdAt?.toISOString(),
    updated_at: a.updatedAt?.toISOString(),
  };
}

/**
 * Converte a resposta do storage em download ("salvar como") em vez de
 * visualização inline. Reaproveita o corpo e os headers que `serveAsset` já
 * montou (Content-Type e cache) e só acrescenta o Content-Disposition.
 * O `filename*` em RFC 5987 preserva acentos; o `filename` simples é o
 * fallback para clientes antigos, por isso vai sem caracteres não-ASCII.
 */
function asAttachment(response: Response, fileName: string): Response {
  const headers = new Headers(response.headers);
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  headers.set(
    "Content-Disposition",
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
  );
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Fluxo comum das duas rotas de download (workspace e projeto): confere o
 * registro, audita o acesso e devolve o binário como anexo.
 * `null` significa "não achei" — quem chama responde 404.
 */
async function downloadWorkspaceAsset(opts: {
  workspaceId: string;
  assetId: string;
  actor: AuditActor;
  headers: Record<string, string | undefined>;
  metadata?: Record<string, unknown>;
}): Promise<Response | null> {
  const asset = await prisma.fileAsset.findFirst({
    where: { id: opts.assetId, workspaceId: opts.workspaceId, isDeleted: false },
  });
  if (!asset) return null;
  // LGPD: baixar um anexo é acesso a dado — registra quem, o quê e de onde.
  recordAudit({
    workspaceId: opts.workspaceId,
    entity: AUDIT_ENTITIES.ATTACHMENT,
    entityId: asset.id,
    action: AUDIT_ACTIONS.DOWNLOAD,
    actor: opts.actor,
    headers: opts.headers,
    metadata: { nome: assetFileName(asset), tipo: asset.mimeType, ...opts.metadata },
  });
  // A chave no storage é o id do asset (ver saveFile/serveFile acima).
  const fileResponse = await serveFile(asset.id, asset.mimeType);
  if (!fileResponse) return null;
  return asAttachment(fileResponse, assetFileName(asset));
}

/**
 * As rotas legadas identificam o arquivo pelo último trecho da URL antiga
 * (ex.: "<uuid>-foto.png"), que corresponde ao fim do campo `asset`. Alguns
 * registros mais novos trazem o próprio id nessa posição, então aceitamos as
 * duas formas — o id só entra no filtro quando é um UUID válido, porque a
 * coluna é do tipo uuid e o Prisma recusaria qualquer outro texto.
 */
function legacyAssetMatch(assetKey: string) {
  const alternativas: any[] = [{ asset: { endsWith: assetKey } }];
  if (UUID_RE.test(assetKey)) alternativas.push({ id: assetKey });
  return alternativas;
}

// Rotas de asset com escopo de workspace, resolvidas pelo slug.
const workspaceAssetRoutes = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  // ── Workspace-level file assets ───────────────────────────────────────────

  .post("/assets/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    if (!b.asset) { set.status = 400; return { detail: "asset (caminho/chave do arquivo) é obrigatório." }; }

    const asset = await prisma.fileAsset.create({
      data: {
        workspaceId: ws.id,
        entityType: b.entity_type ?? ENTITY_TYPE.WORKSPACE,
        entityId: b.entity_id || null,
        asset: b.asset,
        size: b.size ?? 0,
        mimeType: b.mime_type ?? null,
        attributes: b.attributes ?? {},
        isUploaded: b.is_uploaded ?? false,
      },
    });
    set.status = 201;
    return asset;
  })

  .get("/assets/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where: any = { workspaceId: ws.id, isDeleted: false };
    if (query.entity_type !== undefined) where.entityType = Number(query.entity_type);
    if (query.entity_id) where.entityId = query.entity_id;
    return paginate({
      query: (skip, take) => prisma.fileAsset.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.fileAsset.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .get("/assets/:asset_id/", async ({ params: { slug, asset_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return prisma.fileAsset.findFirstOrThrow({ where: { id: asset_id, workspaceId: ws.id, isDeleted: false } });
  })

  .patch("/assets/:asset_id/", async ({ params: { slug, asset_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.is_uploaded !== undefined) data.isUploaded = b.is_uploaded;
    if (b.attributes !== undefined) data.attributes = b.attributes;
    await prisma.fileAsset.findFirstOrThrow({ where: { id: asset_id, workspaceId: ws.id } });
    return prisma.fileAsset.update({ where: { id: asset_id }, data });
  })

  .delete("/assets/:asset_id/", async ({ params: { slug, asset_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.fileAsset.findFirstOrThrow({ where: { id: asset_id, workspaceId: ws.id } });
    await prisma.fileAsset.update({ where: { id: asset_id }, data: { isDeleted: true, deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Issue attachments (IssueAttachment model) ────────────────────────────

  .get(
    "/projects/:project_id/issues/:issue_id/attachments/",
    async ({ params: { slug, project_id, issue_id }, user, query }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      const where = { issueId: issue_id, deletedAt: null };
      return paginate({
        query: (skip, take) => prisma.issueAttachment.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
        count: () => prisma.issueAttachment.count({ where }),
        cursor: query.cursor as string | undefined,
      });
    }
  )

  .post(
    "/projects/:project_id/issues/:issue_id/attachments/",
    async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      const b = body as any;
      if (!b.asset) { set.status = 400; return { detail: "asset é obrigatório." }; }

      const attachment = await prisma.issueAttachment.create({
        data: {
          issueId: issue_id,
          workspaceId: ws.id,
          projectId: project_id,
          asset: b.asset,
          attributes: b.attributes ?? {},
          externalSource: b.external_source ?? null,
          externalId: b.external_id ?? null,
        },
      });
      set.status = 201;
      return attachment;
    }
  )

  .delete(
    "/projects/:project_id/issues/:issue_id/attachments/:attachment_id/",
    async ({ params: { slug, project_id, issue_id, attachment_id }, user, set }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      await prisma.issueAttachment.update({ where: { id: attachment_id }, data: { deletedAt: new Date() } });
      set.status = 204;
      return null;
    }
  );

// ── Rotas legadas de file-assets ──────────────────────────────────────────────
// Ficam fora do prefixo "/workspaces/:slug" porque nos caminhos antigos a
// palavra "file-assets" ocupa a posição do slug:
//   /workspaces/file-assets/:workspace_id/:asset_key/
// O editor ainda usa esses caminhos para imagens enviadas antes da API v2
// (as que aparecem no documento como URL absoluta).
const legacyFileAssetRoutes = new Elysia()
  .use(authPlugin)

  .delete("/workspaces/file-assets/:workspace_id/:asset_key/", async ({ params: { workspace_id, asset_key }, user, set }) => {
    if (!UUID_RE.test(workspace_id)) { set.status = 400; return { detail: "Workspace inválido." }; }
    await requireWorkspaceMember(workspace_id, user.id);
    // Exclusão lógica, igual às demais rotas de asset: o editor permite desfazer.
    await prisma.fileAsset.updateMany({
      where: { workspaceId: workspace_id, OR: legacyAssetMatch(asset_key) },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    set.status = 204;
    return null;
  })

  .post("/workspaces/file-assets/:workspace_id/:asset_key/restore/", async ({ params: { workspace_id, asset_key }, user, set }) => {
    if (!UUID_RE.test(workspace_id)) { set.status = 400; return { detail: "Workspace inválido." }; }
    await requireWorkspaceMember(workspace_id, user.id);
    await prisma.fileAsset.updateMany({
      where: { workspaceId: workspace_id, OR: legacyAssetMatch(asset_key) },
      data: { isDeleted: false, deletedAt: null },
    });
    return { status: "restored" };
  })

  // Avatar/capa do próprio usuário: sem workspace no caminho, o dono é o
  // vínculo em entityId — por isso ele entra no filtro (ninguém apaga o do outro).
  .delete("/users/file-assets/:asset_key/", async ({ params: { asset_key }, user, set }) => {
    await prisma.fileAsset.updateMany({
      where: { entityId: user.id, OR: legacyAssetMatch(asset_key) },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    set.status = 204;
    return null;
  });

// Reúne os dois conjuntos sob o mesmo export já registrado em src/index.ts.
export const assetModule = new Elysia()
  .use(workspaceAssetRoutes)
  .use(legacyFileAssetRoutes);

// ── assets/v2 — new attachment API (frontend calls /api/assets/v2/workspaces/...) ──────
export const assetV2Module = new Elysia({ prefix: "/assets/v2/workspaces/:slug" })
  .use(authPlugin)

  // ── Workspace-level asset upload ─────────────────────────────────────────────
  .post("/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const b = body as any;
    const entityTypeStr = b.entity_type ?? "WORKSPACE_LOGO";
    const ext = (b.name ?? "file").split(".").pop() ?? "bin";
    const asset = await prisma.fileAsset.create({
      data: {
        workspaceId: ws.id, entityType: ENTITY_TYPE_MAP[entityTypeStr] ?? 0,
        entityId: b.entity_identifier || null, asset: `ws/${ws.id}/${Date.now()}.${ext}`,
        size: b.size ?? 0, mimeType: b.type ?? null,
        attributes: {name: b.name, type: b.type, size: b.size, entity_type: entityTypeStr},
        isUploaded: false,
      },
    });
    set.status = 200;
    return {
      asset_id: asset.id,
      asset_url: `/api/assets/v2/workspaces/${slug}/${asset.id}/`,
      upload_data: {url: `/api/assets/v2/workspaces/${slug}/${asset.id}/upload/`, fields: {}},
    };
  })

  .patch("/:asset_id/", async ({params: {slug, asset_id}}) => {
    const ws = await getWorkspaceOrFail(slug);
    await prisma.fileAsset.updateMany({where: {id: asset_id, workspaceId: ws.id}, data: {isUploaded: true}}).catch(() => {});
    return {status: "uploaded"};
  })

  .post("/:asset_id/upload/", async ({params: {slug, asset_id}, body}) => {
    const ws = await getWorkspaceOrFail(slug);
    const file: Blob | null = (body as any).file ?? null;
    if (file) await saveFile(asset_id, file).catch(() => {});
    await prisma.fileAsset.updateMany({where: {id: asset_id, workspaceId: ws.id}, data: {isUploaded: true}}).catch(() => {});
    return {status: "uploaded", asset_id};
  })

  .get("/:asset_id/", async ({params: {slug, asset_id}, set, user, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    const asset = await prisma.fileAsset.findFirst({where: {id: asset_id, workspaceId: ws.id, isDeleted: false}});
    if (!asset) { set.status = 404; return {detail: "Arquivo não encontrado."}; }
    // LGPD: baixar um anexo é acesso a dado — registra quem, o quê e de onde.
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ATTACHMENT,
      entityId: asset.id,
      action: AUDIT_ACTIONS.DOWNLOAD,
      actor: user,
      headers,
      metadata: {nome: (asset.attributes as any)?.name ?? null, tipo: asset.mimeType},
    });
    const fileResponse = await serveFile(asset_id, asset.mimeType);
    if (fileResponse) return fileResponse;
    return {id: asset.id, asset_url: `/media/${asset.asset}`, asset: asset.asset};
  })

  // Download do anexo de workspace (botão "baixar" do editor).
  .get("/download/:asset_id/", async ({params: {slug, asset_id}, set, user, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    const response = await downloadWorkspaceAsset({workspaceId: ws.id, assetId: asset_id, actor: user, headers});
    if (!response) { set.status = 404; return {detail: "Arquivo não encontrado."}; }
    return response;
  })

  .delete("/:asset_id/", async ({params: {slug, asset_id}, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await prisma.fileAsset.updateMany({where: {id: asset_id, workspaceId: ws.id}, data: {isDeleted: true, deletedAt: new Date()}}).catch(() => {});
    set.status = 204;
    return null;
  })

  .post("/:asset_id/bulk/", async ({params: {slug}, body}) => {
    const ws = await getWorkspaceOrFail(slug);
    const ids: string[] = (body as any).asset_ids ?? [];
    if (ids.length) await prisma.fileAsset.updateMany({where: {id: {in: ids}, workspaceId: ws.id}, data: {isUploaded: true}}).catch(() => {});
    return {updated: ids.length};
  })

  .get("/check/:asset_id/", async ({params: {slug, asset_id}, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const asset = await prisma.fileAsset.findFirst({where: {id: asset_id, workspaceId: ws.id}});
    return {exists: !!asset, is_uploaded: asset?.isUploaded ?? false};
  })

  .post("/restore/:asset_id/", async ({params: {slug, asset_id}}) => {
    const ws = await getWorkspaceOrFail(slug);
    await prisma.fileAsset.updateMany({where: {id: asset_id, workspaceId: ws.id}, data: {isDeleted: false, deletedAt: null}}).catch(() => {});
    return {status: "restored"};
  })

  .post("/duplicate-assets/:asset_id/", async ({params: {slug, asset_id}, body, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const b = body as any;
    const original = await prisma.fileAsset.findFirst({where: {id: asset_id, workspaceId: ws.id}});
    if (!original) { set.status = 404; return {detail: "Arquivo não encontrado."}; }
    const dup = await prisma.fileAsset.create({
      data: {
        workspaceId: ws.id, projectId: b.project_id || original.projectId,
        entityType: original.entityType, entityId: b.entity_id || original.entityId,
        asset: original.asset, size: original.size, mimeType: original.mimeType,
        attributes: original.attributes as any, isUploaded: original.isUploaded,
      },
    });
    // Copy the underlying file (S3 or local) to the new asset id.
    await copyAsset(asset_id, dup.id).catch(() => {});
    return {[asset_id]: dup.id};
  })

  // ── User assets ──────────────────────────────────────────────────────────────
  .post("/user-assets/", async ({body, user, set}) => {
    const b = body as any;
    const entityTypeStr = b.entity_type ?? "USER_AVATAR";
    const ext = (b.name ?? "file").split(".").pop() ?? "bin";
    const asset = await prisma.fileAsset.create({
      data: {
        entityType: ENTITY_TYPE_MAP[entityTypeStr] ?? 0, entityId: user.id,
        asset: `user/${user.id}/${Date.now()}.${ext}`,
        size: b.size ?? 0, mimeType: b.type ?? null,
        attributes: {name: b.name, type: b.type, size: b.size, entity_type: entityTypeStr},
        isUploaded: false,
      },
    });
    set.status = 200;
    return {
      asset_id: asset.id,
      asset_url: `/api/assets/v2/user-assets/${asset.id}/`,
      upload_data: {url: `/api/assets/v2/user-assets/${asset.id}/upload/`, fields: {}},
    };
  })

  // ── Project-level assets ─────────────────────────────────────────────────────
  .post("/projects/:project_id/", async ({params: {slug, project_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    const entityTypeStr = b.entity_type ?? "PROJECT_COVER";
    const ext = (b.name ?? "file").split(".").pop() ?? "bin";
    const asset = await prisma.fileAsset.create({
      data: {
        workspaceId: ws.id, projectId: project_id,
        entityType: ENTITY_TYPE_MAP[entityTypeStr] ?? 1,
        entityId: b.entity_identifier || null,
        asset: `proj/${project_id}/${Date.now()}.${ext}`,
        size: b.size ?? 0, mimeType: b.type ?? null,
        attributes: {name: b.name, type: b.type, size: b.size, entity_type: entityTypeStr},
        isUploaded: false,
      },
    });
    set.status = 200;
    return {
      asset_id: asset.id,
      asset_url: `/api/assets/v2/workspaces/${slug}/projects/${project_id}/${asset.id}/`,
      upload_data: {url: `/api/assets/v2/workspaces/${slug}/projects/${project_id}/${asset.id}/upload/`, fields: {}},
    };
  })

  .patch("/projects/:project_id/:asset_id/", async ({params: {slug, project_id, asset_id}}) => {
    const ws = await getWorkspaceOrFail(slug);
    await prisma.fileAsset.updateMany({where: {id: asset_id, workspaceId: ws.id}, data: {isUploaded: true}}).catch(() => {});
    return {status: "uploaded"};
  })

  .post("/projects/:project_id/:asset_id/upload/", async ({params: {slug, project_id, asset_id}, body}) => {
    const ws = await getWorkspaceOrFail(slug);
    const file: Blob | null = (body as any).file ?? null;
    if (file) await saveFile(asset_id, file).catch(() => {});
    await prisma.fileAsset.updateMany({where: {id: asset_id, workspaceId: ws.id}, data: {isUploaded: true}}).catch(() => {});
    return {status: "uploaded", asset_id};
  })

  .get("/projects/:project_id/:asset_id/", async ({params: {slug, project_id, asset_id}, set, user, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    const asset = await prisma.fileAsset.findFirst({where: {id: asset_id, workspaceId: ws.id, isDeleted: false}});
    if (!asset) { set.status = 404; return {detail: "Arquivo não encontrado."}; }
    // LGPD: baixar um anexo é acesso a dado — registra quem, o quê e de onde.
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ATTACHMENT,
      entityId: asset.id,
      action: AUDIT_ACTIONS.DOWNLOAD,
      actor: user,
      headers,
      metadata: {nome: (asset.attributes as any)?.name ?? null, tipo: asset.mimeType},
    });
    const fileResponse = await serveFile(asset_id, asset.mimeType);
    if (fileResponse) return fileResponse;
    return {id: asset.id, asset_url: `/media/${asset.asset}`, asset: asset.asset};
  })

  // Download do anexo de projeto (botão "baixar" do editor).
  .get("/projects/:project_id/download/:asset_id/", async ({params: {slug, project_id, asset_id}, set, user, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    const response = await downloadWorkspaceAsset({
      workspaceId: ws.id, assetId: asset_id, actor: user, headers, metadata: {projeto: project_id},
    });
    if (!response) { set.status = 404; return {detail: "Arquivo não encontrado."}; }
    return response;
  })

  // Exclusão lógica do anexo de projeto (o editor apaga a imagem removida do texto).
  .delete("/projects/:project_id/:asset_id/", async ({params: {slug, asset_id}, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await prisma.fileAsset.updateMany({where: {id: asset_id, workspaceId: ws.id}, data: {isDeleted: true, deletedAt: new Date()}}).catch(() => {});
    set.status = 204;
    return null;
  })

  .post("/projects/:project_id/:asset_id/bulk/", async ({params: {slug}, body}) => {
    const ws = await getWorkspaceOrFail(slug);
    const ids: string[] = (body as any).asset_ids ?? [];
    if (ids.length) await prisma.fileAsset.updateMany({where: {id: {in: ids}, workspaceId: ws.id}, data: {isUploaded: true}}).catch(() => {});
    return {updated: ids.length};
  })

  // Lista CRUA, sem envelope de paginação: é o contrato que o painel do chamado
  // consome (`TIssueAttachment[]` em issue_attachment.service.ts). Envelopada, a
  // lista chegava como objeto no `addAttachments` do store e o painel ficava
  // vazio mesmo com anexo no banco. A rota /api/v1 equivalente segue paginada —
  // é ela que o app móvel usa.
  .get("/projects/:project_id/issues/:issue_id/attachments/", async ({params: {slug, project_id, issue_id}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const anexos = await prisma.issueAttachment.findMany({
      where: {issueId: issue_id, deletedAt: null},
      orderBy: {createdAt: "desc"},
      take: 200,
    });
    return anexos.map((a) => serializeIssueAttachment(a, slug, project_id, ws.id));
  })

  .post("/projects/:project_id/issues/:issue_id/attachments/", async ({params: {slug, project_id, issue_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    const attachment = await prisma.issueAttachment.create({
      data: {issueId: issue_id, workspaceId: ws.id, projectId: project_id, asset: b.asset ?? "", attributes: b.attributes ?? {}},
    });
    set.status = 201;
    return {id: attachment.id, issue: issue_id, workspace: ws.id, project: project_id, asset: attachment.asset, attributes: attachment.attributes ?? {}, created_at: attachment.createdAt?.toISOString()};
  })

  .delete("/projects/:project_id/issues/:issue_id/attachments/:attachment_id/", async ({params: {slug, project_id, issue_id, attachment_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.issueAttachment.update({where: {id: attachment_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  .post("/projects/:project_id/issues/:issue_id/attachments/generate-upload-url/", async ({params: {slug, project_id, issue_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    const asset = await prisma.fileAsset.create({
      data: {
        workspaceId: ws.id, projectId: project_id,
        entityType: ENTITY_TYPE_MAP["ISSUE_ATTACHMENT"] ?? 2, entityId: issue_id,
        asset: `issues/${issue_id}/${Date.now()}-${b.name ?? "file"}`,
        size: b.size ?? 0, mimeType: b.type ?? null, attributes: {name: b.name},
        isUploaded: false,
      },
    });
    set.status = 200;
    return {
      asset_id: asset.id,
      asset_url: `/api/assets/v2/workspaces/${slug}/projects/${project_id}/${asset.id}/`,
      upload_data: {url: `/api/assets/v2/workspaces/${slug}/projects/${project_id}/${asset.id}/upload/`, fields: {}},
    };
  });

// ── User assets module (separate prefix) ─────────────────────────────────────
export const userAssetV2Module = new Elysia({ prefix: "/assets/v2/user-assets" })
  .use(authPlugin)

  .post("/", async ({body, user, set}) => {
    const b = body as any;
    const entityTypeStr = b.entity_type ?? "USER_AVATAR";
    const ext = (b.name ?? "file").split(".").pop() ?? "bin";
    const asset = await prisma.fileAsset.create({
      data: {
        entityType: ENTITY_TYPE_MAP[entityTypeStr] ?? 0, entityId: user.id,
        asset: `user/${user.id}/${Date.now()}.${ext}`,
        size: b.size ?? 0, mimeType: b.type ?? null,
        attributes: {name: b.name, type: b.type, size: b.size, entity_type: entityTypeStr},
        isUploaded: false,
      },
    });
    set.status = 200;
    return {
      asset_id: asset.id,
      asset_url: `/api/assets/v2/user-assets/${asset.id}/`,
      upload_data: {url: `/api/assets/v2/user-assets/${asset.id}/upload/`, fields: {}},
    };
  })

  .patch("/:asset_id/", async ({params: {asset_id}, user}) => {
    await prisma.fileAsset.updateMany({where: {id: asset_id, entityId: user.id}, data: {isUploaded: true}}).catch(() => {});
    return {status: "uploaded"};
  })

  .post("/:asset_id/upload/", async ({params: {asset_id}, body, user}) => {
    const file: Blob | null = (body as any).file ?? null;
    if (file) await saveFile(asset_id, file).catch(() => {});
    await prisma.fileAsset.updateMany({where: {id: asset_id}, data: {isUploaded: true}}).catch(() => {});
    return {status: "uploaded", asset_id};
  })

  .get("/:asset_id/", async ({params: {asset_id}, set, user, headers}) => {
    const asset = await prisma.fileAsset.findFirst({where: {id: asset_id, isDeleted: false}});
    if (!asset) { set.status = 404; return {detail: "Arquivo não encontrado."}; }
    // LGPD: baixar um anexo é acesso a dado — registra quem, o quê e de onde.
    // Esta rota não tem workspace no caminho; usa o do próprio arquivo.
    if (asset.workspaceId) recordAudit({
      workspaceId: asset.workspaceId,
      entity: AUDIT_ENTITIES.ATTACHMENT,
      entityId: asset.id,
      action: AUDIT_ACTIONS.DOWNLOAD,
      actor: user,
      headers,
      metadata: {nome: (asset.attributes as any)?.name ?? null, tipo: asset.mimeType},
    });
    const fileResponse = await serveFile(asset_id, asset.mimeType);
    if (fileResponse) return fileResponse;
    return {id: asset.id, asset_url: `/media/${asset.asset}`};
  })

  .delete("/:asset_id/", async ({params: {asset_id}, user, set}) => {
    await prisma.fileAsset.updateMany({where: {id: asset_id, entityId: user.id}, data: {isDeleted: true, deletedAt: new Date()}}).catch(() => {});
    set.status = 204;
    return null;
  });
