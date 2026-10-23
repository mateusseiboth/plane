/**
 * O que cada linha da atividade do chamado mostra além do texto da ação
 * (pedido do cliente, 23/10/2026): quem fez, pelo nome; a data e hora
 * absolutas, no fuso do navegador; e, na mudança de etapa (o setor do fluxo),
 * de qual etapa para qual.
 */

const withZero = (valor: number) => String(valor).padStart(2, "0");

/** `dd/mm/aaaa hh:mm` no fuso do navegador; vazio quando não há data válida. */
export const formatDataHoraDaAtividade = (iso: string | undefined | null): string => {
  const data = iso ? new Date(iso) : null;
  if (!data || Number.isNaN(data.getTime())) return "";
  const dia = `${withZero(data.getDate())}/${withZero(data.getMonth() + 1)}/${data.getFullYear()}`;
  return `${dia} ${withZero(data.getHours())}:${withZero(data.getMinutes())}`;
};

type TMudanca = { old_value?: string | null; new_value?: string | null };

/** "Triagem → Em Análise"; sem a etapa de origem gravada, só o destino. */
export const buildMudancaDeEtapa = ({ old_value, new_value }: TMudanca): string =>
  [old_value, new_value].filter((etapa): etapa is string => !!etapa).join(" → ");

type TAutor = { first_name?: string | null; last_name?: string | null; display_name?: string | null };

/** Nome completo de quem fez; sem nome cadastrado, o nome de exibição. */
export const readNomeDoAutor = (autor: TAutor | undefined | null): string => {
  const completo = [autor?.first_name, autor?.last_name].filter(Boolean).join(" ").trim();
  return completo || autor?.display_name || "";
};
