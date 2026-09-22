/**
 * Foto de perfil do WhatsApp gravada no responsável (`entity_contacts.photo`).
 * Legado: `zapi/gravarFotoZap.php`, que copiava a foto para o disco e só a
 * trocava depois de 30 dias.
 *
 * O link que a Z-API manda é do CDN do WhatsApp e expira em poucos dias, por
 * isso a foto é COPIADA para o storage do chat (`responsaveis/<id>.jpg`). A data
 * da cópia vai no próprio endereço (`?v=`): é ela que diz quando atualizar, sem
 * coluna nova numa tabela que é do api-ts, e ainda fura o cache do navegador.
 */

export const VALIDADE_DA_FOTO_MS = 30 * 24 * 60 * 60 * 1000;

const PASTA = "responsaveis";
const MIME = "image/jpeg";

export const buildChaveDaFoto = (entityContactId: string): string => `${PASTA}/${entityContactId}.jpg`;

export const buildUrlDaFoto = (base: string, entityContactId: string, copiadaEm: Date): string =>
  `${base.replace(/\/$/, "")}/media/${buildChaveDaFoto(entityContactId)}?mime=${encodeURIComponent(MIME)}&v=${copiadaEm.getTime()}`;

const COPIA_DO_CHAT = new RegExp(`/media/${PASTA}/[^?]+\\?.*\\bv=(\\d+)`);

/** Sem foto, foto que não é cópia do chat (caminho do SAC) ou cópia com mais de 30 dias. */
export function isFotoVencida(photo: string | null | undefined, agora: Date): boolean {
  const copiadaEm = Number(photo?.match(COPIA_DO_CHAT)?.[1] ?? Number.NaN);
  if (!Number.isFinite(copiadaEm)) return true;
  return agora.getTime() - copiadaEm > VALIDADE_DA_FOTO_MS;
}
