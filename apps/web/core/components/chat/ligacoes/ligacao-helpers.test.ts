/**
 * Regras de tela das ligações: duração legível, rótulo do status, filtro por
 * canal e o chamado montado a partir da ligação. Puro.
 * Rodar com `bun test core/components/chat/ligacoes`.
 */
import { describe, expect, it } from "bun:test";
import {
  CANAL_FILTROS,
  buildChamadoDaLigacao,
  formatDuracao,
  groupErrosPorCampo,
  isLigacao,
  statusDaLigacaoLabel,
} from "@/components/chat/ligacoes/ligacao-helpers";

describe("formatDuracao", () => {
  it("mostra segundos, minutos e horas de forma curta", () => {
    expect(formatDuracao(null)).toBe("");
    expect(formatDuracao(0)).toBe("0s");
    expect(formatDuracao(45)).toBe("45s");
    expect(formatDuracao(300)).toBe("5min");
    expect(formatDuracao(303)).toBe("5min 03s");
    expect(formatDuracao(3725)).toBe("1h 02min");
  });
});

describe("statusDaLigacaoLabel", () => {
  it("traduz o status do PBX", () => {
    expect(statusDaLigacaoLabel("answered")).toBe("Atendida");
    expect(statusDaLigacaoLabel("missed")).toBe("Não atendida");
    expect(statusDaLigacaoLabel("outro")).toBe("outro");
  });
});

describe("filtro por canal", () => {
  it("oferece todos, conversas e ligações", () => {
    expect(CANAL_FILTROS.map((f) => f.value)).toEqual(["", "whatsapp,native", "phone"]);
  });

  it("reconhece a ligação pelo canal", () => {
    expect(isLigacao({ channel: "phone" })).toBe(true);
    expect(isLigacao({ channel: "whatsapp" })).toBe(false);
  });
});

describe("groupErrosPorCampo", () => {
  it("põe a mensagem do servidor no campo que ela aponta", () => {
    expect(
      groupErrosPorCampo({
        detail: "Confira os campos destacados.",
        errors: [
          { path: "descricao", message: "Descreva o que o cliente pediu." },
          { path: "ramais[1].extension", message: "Ramal repetido." },
        ],
      })
    ).toEqual({ descricao: "Descreva o que o cliente pediu.", "ramais[1].extension": "Ramal repetido." });
  });

  it("erro sem campos não marca nada", () => {
    expect(groupErrosPorCampo({ detail: "x" })).toEqual({});
    expect(groupErrosPorCampo(undefined)).toEqual({});
  });
});

describe("buildChamadoDaLigacao", () => {
  const base = {
    protocol: "20260922-0001",
    clientName: "Maria",
    clientPhone: "5567999990000",
    descricao: "Erro <b>na</b> guia",
    entityId: "ent-1",
    chatUrl: "http://app/quality/chat-view/20260922-0001",
  };

  it("leva o cliente, a descrição e a entidade", () => {
    const chamado = buildChamadoDaLigacao(base);
    expect(chamado.name).toBe("Ligação 20260922-0001: Maria");
    expect(chamado.entity_id).toBe("ent-1");
    expect(chamado.description_html).toContain("Erro &lt;b&gt;na&lt;/b&gt; guia");
    expect(chamado.description_html).toContain('href="http://app/quality/chat-view/20260922-0001"');
    expect(chamado.description_html).not.toContain("—");
  });

  it("sem nome usa o telefone e sem entidade não manda o campo", () => {
    const chamado = buildChamadoDaLigacao({ ...base, clientName: null, entityId: null, descricao: null });
    expect(chamado.name).toBe("Ligação 20260922-0001: 5567999990000");
    expect("entity_id" in chamado).toBe(false);
  });
});
