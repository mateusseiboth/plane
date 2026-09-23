/**
 * Pipeline de envio de um bundle de plugin (.zip), compartilhado pelas DUAS
 * portas de entrada: a rota global `POST /plugins/` (chave de API do TI) e a
 * tela de Configurações > Plugins (`POST /workspaces/:slug/plugins/`).
 *
 * Um lugar só porque as duas precisam do mesmo cuidado: resolver a ação ANTES
 * de gravar o pacote (senão uma versão recusada sobrescreveria o bundle em uso)
 * e registrar uma linha por versão no histórico.
 */
import prisma from "@db";
import { pluginStorage } from "@utils/plugin-storage";
import { extractPluginZip } from "@utils/plugin-zip";
import { validatePluginManifest } from "@utils/plugin-manifest";
import { PLUGIN_UPLOAD_ACAO, resolvePluginUploadAcao, type PluginUploadAcao } from "@utils/plugin-upload";
import type { ValidatedPluginManifest } from "@utils/plugin-manifest";
import type { Plugin, Prisma } from "@prisma/client";

interface IPluginUpload {
  manifest: ValidatedPluginManifest;
  rawManifest: unknown;
  entryFilename: string;
  storageKey: string;
  userId: string;
  cadastrado: Plugin | null;
}

const buildPluginData = ({ manifest, rawManifest, entryFilename, storageKey }: IPluginUpload) => ({
  name: manifest.name,
  description: manifest.description || null,
  version: manifest.version,
  author: manifest.author,
  entryFile: entryFilename,
  manifest: rawManifest as any,
  permissions: manifest.permissions,
  contributions: manifest.contributions as any,
  storageKey,
});

// Cadastro novo e reenvio depois de excluir entram ativos (upload por admin/TI não
// passa por aprovação). Atualização de versão mantém o status atual: um plugin
// desativado pelo admin da instância não volta sozinho com o upload do TI.
const SAVE_PLUGIN_POR_ACAO: Record<
  PluginUploadAcao,
  (tx: Prisma.TransactionClient, upload: IPluginUpload) => Promise<Plugin>
> = {
  [PLUGIN_UPLOAD_ACAO.CREATE]: (tx, upload) =>
    tx.plugin.create({
      data: { ...buildPluginData(upload), slug: upload.manifest.slug, status: "ACTIVE", createdById: upload.userId },
    }),
  [PLUGIN_UPLOAD_ACAO.UPGRADE]: (tx, upload) =>
    tx.plugin.update({ where: { id: upload.cadastrado!.id }, data: buildPluginData(upload) }),
  [PLUGIN_UPLOAD_ACAO.REINSTALL]: (tx, upload) =>
    tx.plugin.update({
      where: { id: upload.cadastrado!.id },
      data: { ...buildPluginData(upload), status: "ACTIVE", deletedAt: null },
    }),
};

// `plugin.upload` continua sendo o nome do cadastro novo nos logs já existentes.
const AUDIT_ACTION_POR_ACAO: Record<PluginUploadAcao, string> = {
  [PLUGIN_UPLOAD_ACAO.CREATE]: "plugin.upload",
  [PLUGIN_UPLOAD_ACAO.UPGRADE]: "plugin.upgrade",
  [PLUGIN_UPLOAD_ACAO.REINSTALL]: "plugin.reinstall",
};

const STATUS_HTTP_POR_ACAO: Record<PluginUploadAcao, number> = {
  [PLUGIN_UPLOAD_ACAO.CREATE]: 201,
  [PLUGIN_UPLOAD_ACAO.UPGRADE]: 200,
  [PLUGIN_UPLOAD_ACAO.REINSTALL]: 200,
};

export function auditLog(action: string, userId: string, pluginId?: string, meta?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      source: "plugin-module",
      action,
      user_id: userId,
      plugin_id: pluginId ?? null,
      ...meta,
    })
  );
}

/** Uma linha por versão: o reenvio de uma versão que já passou por aqui atualiza a linha dela. */
async function savePluginVersion(tx: Prisma.TransactionClient, pluginId: string, upload: IPluginUpload) {
  const data = {
    storageKey: upload.storageKey,
    manifest: upload.rawManifest as any,
    contributions: upload.manifest.contributions as any,
  };
  const existente = await tx.pluginVersion.findFirst({ where: { pluginId, version: upload.manifest.version } });
  if (existente) return tx.pluginVersion.update({ where: { id: existente.id }, data });
  return tx.pluginVersion.create({ data: { ...data, pluginId, version: upload.manifest.version } });
}

export interface IPluginBundleSalvo {
  plugin: Plugin;
  /** 201 no cadastro novo, 200 na atualização e no reenvio. */
  status: number;
}

/** Lê o .zip, valida o manifesto, grava os arquivos e cadastra (ou atualiza) o plugin. */
export async function savePluginBundle(zipBuffer: Buffer, userId: string): Promise<IPluginBundleSalvo> {
  const { manifest: rawManifest, entryBuffer, entryFilename, files } = extractPluginZip(zipBuffer);
  const manifest = validatePluginManifest(rawManifest);

  // Slug já cadastrado (mesmo excluído): atualiza ou reativa em vez de criar.
  const cadastrado = await prisma.plugin.findUnique({ where: { slug: manifest.slug } });
  const acao = resolvePluginUploadAcao(cadastrado, manifest.version, manifest.slug);

  const baseDir = `${manifest.slug}/${manifest.version}`;
  const storageKey = `${baseDir}/${entryFilename}`;
  await pluginStorage.put(storageKey, entryBuffer);
  for (const [name, buf] of Object.entries(files)) {
    if (name === entryFilename) continue;
    await pluginStorage.put(`${baseDir}/${name}`, buf);
  }

  const upload: IPluginUpload = { manifest, rawManifest, entryFilename, storageKey, userId, cadastrado };
  const plugin = await prisma.$transaction(async (tx) => {
    const p = await SAVE_PLUGIN_POR_ACAO[acao](tx, upload);
    await savePluginVersion(tx, p.id, upload);
    return p;
  });

  auditLog(AUDIT_ACTION_POR_ACAO[acao], userId, plugin.id, { slug: plugin.slug, version: plugin.version });
  return { plugin, status: STATUS_HTTP_POR_ACAO[acao] };
}
