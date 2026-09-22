/**
 * Regras de tela dos painéis de TV: leitura da URL (chave, rotação, som),
 * tempo legível, rotação das abas e faixas de cor por volume e por atraso.
 * Puro. Rodar com `bun test core/components/painel-tv`.
 */
import { describe, expect, it } from "bun:test";
import {
  PAINEIS_DA_TV,
  formatDuracao,
  formatHora,
  isPainelDaTv,
  proximaAba,
  readFaixaDoVolume,
  readOpcoesDaUrl,
  readUrgenciaDaEspera,
} from "./painel-helpers";

describe("opções da URL", () => {
  it("lê a chave, o intervalo da rotação e o som", () => {
    const opcoes = readOpcoesDaUrl("?key=ptv_abc&intervalo=25&som=1&uf=MT");
    expect(opcoes).toEqual({ chave: "ptv_abc", intervaloSeg: 25, somLigado: true, uf: "MT", dias: null });
  });

  it("sem nada na URL, o intervalo é 15 s e o som fica desligado", () => {
    expect(readOpcoesDaUrl("")).toEqual({ chave: null, intervaloSeg: 15, somLigado: false, uf: null, dias: null });
  });

  it("intervalo fora do razoável volta ao padrão", () => {
    expect(readOpcoesDaUrl("?intervalo=0").intervaloSeg).toBe(15);
    expect(readOpcoesDaUrl("?intervalo=abc").intervaloSeg).toBe(15);
    expect(readOpcoesDaUrl("?intervalo=600").intervaloSeg).toBe(300);
  });

  it("dias do painel de backups fica entre 1 e 30", () => {
    expect(readOpcoesDaUrl("?dias=7").dias).toBe(7);
    expect(readOpcoesDaUrl("?dias=99").dias).toBe(30);
    expect(readOpcoesDaUrl("?dias=0").dias).toBeNull();
  });
});

describe("painéis conhecidos", () => {
  it("são os cinco da TV", () => {
    expect(PAINEIS_DA_TV.map((p) => p.chave)).toEqual(["ti", "qualidade", "atendimento", "mapa", "backups"]);
    expect(isPainelDaTv("mapa")).toBe(true);
    expect(isPainelDaTv("financeiro")).toBe(false);
  });
});

describe("tempo", () => {
  it("mostra minutos e segundos até uma hora, depois horas e minutos", () => {
    expect(formatDuracao(45)).toBe("45s");
    expect(formatDuracao(90)).toBe("1min 30s");
    expect(formatDuracao(3_600)).toBe("1h 00min");
    expect(formatDuracao(7_380)).toBe("2h 03min");
    expect(formatDuracao(null)).toBe("—");
  });

  it("a hora do relógio é a local, sem segundos", () => {
    expect(formatHora(new Date("2026-09-22T15:04:00"))).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("rotação das abas", () => {
  it("passa para a próxima e volta ao começo", () => {
    expect(proximaAba(0, 3)).toBe(1);
    expect(proximaAba(2, 3)).toBe(0);
    expect(proximaAba(0, 0)).toBe(0);
  });
});

describe("faixas de cor", () => {
  it("volume de chamados: verde, amarelo, vermelho", () => {
    expect(readFaixaDoVolume(0)).toBe("vazio");
    expect(readFaixaDoVolume(3)).toBe("baixo");
    expect(readFaixaDoVolume(9)).toBe("medio");
    expect(readFaixaDoVolume(25)).toBe("alto");
  });

  it("espera longa acende primeiro amarelo e depois vermelho", () => {
    expect(readUrgenciaDaEspera(60)).toBe("normal");
    expect(readUrgenciaDaEspera(400)).toBe("atencao");
    expect(readUrgenciaDaEspera(1_200)).toBe("critico");
  });
});
