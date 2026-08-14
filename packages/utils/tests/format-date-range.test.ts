/**
 * Pílula "início - prazo" dos cartões. Ela ganhou hora porque algumas demandas
 * vencem em horas, não em dias — mas o mesmo rótulo é usado por ciclos e
 * módulos, que nunca têm hora.
 *
 * O que quebra em silêncio aqui é a regressão de aparência: qualquer mudança na
 * saída SEM hora repinta ciclos, módulos e todos os chamados legados de uma vez.
 * Por isso os casos sem hora são travados caractere a caractere.
 */
import { describe, expect, it } from "bun:test";
import { formatDateRange } from "../src/datetime";

/** Dia local, sem passar por string, para o teste não depender do fuso da máquina. */
const dia = (year: number, month: number, day: number, hours = 0, minutes = 0) =>
  new Date(year, month - 1, day, hours, minutes);

describe("formatDateRange sem hora", () => {
  it("condensa dia, mês e ano repetidos", () => {
    expect(formatDateRange(dia(2025, 1, 24), dia(2025, 1, 28))).toBe("24 - 28 jan 2025");
    expect(formatDateRange(dia(2025, 1, 24), dia(2025, 2, 6))).toBe("24 jan - 06 fev 2025");
    expect(formatDateRange(dia(2024, 12, 28), dia(2025, 1, 4))).toBe("28 dez 2024 - 04 jan 2025");
  });

  it("aceita intervalo pela metade", () => {
    expect(formatDateRange(dia(2025, 1, 24), null)).toBe("24 jan 2025");
    expect(formatDateRange(null, dia(2025, 1, 28))).toBe("28 jan 2025");
    expect(formatDateRange(null, null)).toBe("");
  });

  it("trata meia-noite e 23:59 como 'o dia inteiro', sem mostrar hora", () => {
    // São os horários que ciclos, módulos e chamados antigos carregam.
    expect(formatDateRange(dia(2025, 1, 24), dia(2025, 1, 28, 0, 0))).toBe("24 - 28 jan 2025");
    expect(formatDateRange(dia(2025, 1, 24), dia(2025, 1, 28, 23, 59))).toBe("24 - 28 jan 2025");
  });
});

describe("formatDateRange com hora no prazo", () => {
  it("acrescenta a hora como sufixo do intervalo inteiro", () => {
    expect(formatDateRange(dia(2025, 1, 24), dia(2025, 1, 28, 14, 0))).toBe("24 - 28 jan 2025 · 14:00");
    expect(formatDateRange(dia(2025, 1, 24), dia(2025, 2, 6, 9, 30))).toBe("24 jan - 06 fev 2025 · 09:30");
    expect(formatDateRange(dia(2024, 12, 28), dia(2025, 1, 4, 18, 45))).toBe("28 dez 2024 - 04 jan 2025 · 18:45");
  });

  it("mostra a hora também quando só existe o prazo", () => {
    expect(formatDateRange(null, dia(2025, 1, 28, 14, 0))).toBe("28 jan 2025 · 14:00");
  });

  it("ignora a hora do início — só o prazo é um instante", () => {
    expect(formatDateRange(dia(2025, 1, 24, 10, 0), dia(2025, 1, 28))).toBe("24 - 28 jan 2025");
  });
});
