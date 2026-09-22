/**
 * Regras de tela dos painéis de TV. Puro: nada de React, nada de rede.
 *
 * A TV só sabe abrir uma URL, então tudo que o operador escolhe vive nela: a
 * chave (`?key=`), o intervalo da rotação das abas (`?intervalo=`), o som
 * (`?som=1`), a UF (`?uf=`) e a janela de dias do painel de backups (`?dias=`).
 */

export const PAINEIS_DA_TV = [
  { chave: "ti", titulo: "Painel do TI" },
  { chave: "qualidade", titulo: "Painel da Qualidade" },
  { chave: "atendimento", titulo: "Painel do Atendimento" },
  { chave: "mapa", titulo: "Mapa de chamados" },
  { chave: "backups", titulo: "Painel de Backups" },
] as const;

export type PainelDaTv = (typeof PAINEIS_DA_TV)[number]["chave"];

const CHAVES = new Set<string>(PAINEIS_DA_TV.map((p) => p.chave));

export const isPainelDaTv = (valor: unknown): valor is PainelDaTv => typeof valor === "string" && CHAVES.has(valor);

export const readTituloDoPainel = (painel: PainelDaTv): string => PAINEIS_DA_TV.find((p) => p.chave === painel)!.titulo;

const INTERVALO_PADRAO = 15;
const INTERVALO_MINIMO = 5;
const INTERVALO_MAXIMO = 300;
const DIAS_MAXIMO = 30;

export type OpcoesDoPainel = {
  chave: string | null;
  intervaloSeg: number;
  somLigado: boolean;
  uf: string | null;
  dias: number | null;
};

const readInteiro = (valor: string | null): number | null => {
  const numero = Number(valor);
  return valor !== null && Number.isFinite(numero) ? Math.floor(numero) : null;
};

export function readOpcoesDaUrl(busca: string): OpcoesDoPainel {
  const parametros = new URLSearchParams(busca);
  const intervalo = readInteiro(parametros.get("intervalo"));
  const dias = readInteiro(parametros.get("dias"));
  return {
    chave: parametros.get("key")?.trim() || null,
    intervaloSeg:
      intervalo === null || intervalo < INTERVALO_MINIMO ? INTERVALO_PADRAO : Math.min(intervalo, INTERVALO_MAXIMO),
    somLigado: parametros.get("som") === "1",
    uf: parametros.get("uf")?.trim().toUpperCase() || null,
    dias: dias === null || dias < 1 ? null : Math.min(dias, DIAS_MAXIMO),
  };
}

const MINUTO = 60;
const HORA = 3600;

/** "45s", "1min 30s", "2h 03min" — curto o bastante para caber no cartão. */
export function formatDuracao(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined) return "—";
  if (segundos < MINUTO) return `${Math.max(0, Math.round(segundos))}s`;
  if (segundos < HORA)
    return `${Math.floor(segundos / MINUTO)}min ${String(Math.round(segundos % MINUTO)).padStart(2, "0")}s`;
  return `${Math.floor(segundos / HORA)}h ${String(Math.floor((segundos % HORA) / MINUTO)).padStart(2, "0")}min`;
}

export const formatHora = (data: Date): string =>
  data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const formatDataHora = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? "—"
    : data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export const formatData = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "—" : data.toLocaleDateString("pt-BR");
};

/** Próxima aba da rotação; volta ao começo no fim da lista. */
export const proximaAba = (atual: number, total: number): number => (total <= 0 ? 0 : (atual + 1) % total);

export const FAIXAS_DO_VOLUME = ["vazio", "baixo", "medio", "alto"] as const;
export type FaixaDoVolume = (typeof FAIXAS_DO_VOLUME)[number];

/** Faixa de volume do marcador do mapa (o número de chamados abertos). */
export function readFaixaDoVolume(abertos: number): FaixaDoVolume {
  if (abertos <= 0) return "vazio";
  if (abertos <= 4) return "baixo";
  if (abertos <= 14) return "medio";
  return "alto";
}

export const URGENCIAS = ["normal", "atencao", "critico"] as const;
export type UrgenciaDaEspera = (typeof URGENCIAS)[number];

const ESPERA_DE_ATENCAO_SEG = 5 * 60;
const ESPERA_CRITICA_SEG = 15 * 60;

/** Espera longa na fila do atendimento: 5 min acende, 15 min grita. */
export function readUrgenciaDaEspera(segundos: number): UrgenciaDaEspera {
  if (segundos >= ESPERA_CRITICA_SEG) return "critico";
  if (segundos >= ESPERA_DE_ATENCAO_SEG) return "atencao";
  return "normal";
}
