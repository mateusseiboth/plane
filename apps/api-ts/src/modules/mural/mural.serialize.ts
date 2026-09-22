/** Recado no contrato snake_case que a tela consome (`TMuralRecado` no web). */
import type { MuralPessoa, MuralRecadoRow } from "@modules/mural/mural.dao";

type Anexo = { id: string; size: number; mimeType: string | null; attributes: unknown; asset: string };

export type MuralPessoaDto = {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
};

export const serializePessoa = (p: MuralPessoa): MuralPessoaDto => ({
  id: p.id,
  display_name: p.displayName || `${p.firstName} ${p.lastName}`.trim(),
  first_name: p.firstName,
  last_name: p.lastName,
  avatar_url: p.avatarUrl || p.avatar || null,
});

const nomeDoAnexo = (a: Anexo): string => {
  const original = (a.attributes as { name?: unknown } | null)?.name;
  return typeof original === "string" && original.trim() ? original.trim() : (a.asset.split("/").pop() ?? a.id);
};

const serializeAnexo = (a: Anexo, slug: string) => ({
  id: a.id,
  name: nomeDoAnexo(a),
  size: a.size,
  mime_type: a.mimeType,
  // Mesma rota de download dos anexos do espaço: ela já audita o acesso (LGPD).
  url: `/api/assets/v2/workspaces/${slug}/${a.id}/`,
});

export function serializeRecado(
  r: MuralRecadoRow,
  extra: { slug: string; now: Date; autor?: MuralPessoa; anexo?: Anexo; readAt?: Date }
) {
  return {
    id: r.id,
    title: r.title,
    description_html: r.descriptionHtml,
    description_stripped: r.descriptionStripped,
    author: extra.autor ? serializePessoa(extra.autor) : null,
    published_at: r.publishedAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    expires_at: r.expiresAt?.toISOString() ?? null,
    is_pinned: r.isPinned,
    is_required: r.isRequired,
    is_active: r.isActive,
    is_expired: !!r.expiresAt && r.expiresAt.getTime() <= extra.now.getTime(),
    attachment: extra.anexo ? serializeAnexo(extra.anexo, extra.slug) : null,
    is_read: !!extra.readAt,
    read_at: extra.readAt?.toISOString() ?? null,
  };
}

export type MuralRecadoDto = ReturnType<typeof serializeRecado>;
