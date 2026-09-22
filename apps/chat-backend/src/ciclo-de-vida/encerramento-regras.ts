/**
 * Regras puras do encerramento feito pelo atendente (`popChatAt_fimchatmot.php`
 * do SAC): entidade obrigatória e tipo do motivo vindo do catálogo configurável.
 */

export type MotivoDoCatalogo = { key: string; label: string };

const toChave = (rotulo: string): string =>
  rotulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Lê o catálogo gravado em `BotConfig.closeReasons`, tolerando lixo. */
export function parseCatalogoDeMotivos(valor: unknown): MotivoDoCatalogo[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((item) => {
    const rotulo = typeof item?.label === "string" ? item.label.trim() : "";
    if (!rotulo) return [];
    const chave = typeof item.key === "string" && item.key.trim() ? item.key.trim() : toChave(rotulo);
    return [{ key: chave, label: rotulo }];
  });
}

export type EntradaDoEncerramento = {
  entityId: string | null;
  motivo: string | null;
  catalogo: MotivoDoCatalogo[];
};

/** Nulo quando pode encerrar; senão, a mensagem para o atendente. */
export function validateEncerramento({ entityId, motivo, catalogo }: EntradaDoEncerramento): string | null {
  if (!entityId) return "Informe a entidade para encerrar.";
  if (motivo && !catalogo.some((m) => m.label === motivo)) return "Escolha um motivo da lista.";
  return null;
}
