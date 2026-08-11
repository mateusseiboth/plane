/**
 * Horário de atendimento avaliado no fuso da empresa, não no do servidor.
 *
 * O container roda em UTC. Com o horário cadastrado em hora local (07:30–17:30,
 * intervalo 11:30–13:00), às 08:21 de Campo Grande o servidor via 12:21 e casava
 * com o intervalo de almoço: o robô respondia "estamos fora do horário de
 * atendimento" em plena manhã de trabalho.
 */
import { afterEach, describe, expect, it, mock } from "bun:test";

const HORARIO_COMERCIAL = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_time: "07:30", end_time: "17:30" }));
const ALMOCO = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_time: "11:30", end_time: "13:00" }));

/** Monta o módulo com o relógio parado num instante e um fuso de workspace. */
async function comRelogio(instanteISO: string, fuso: string, config: Record<string, unknown> | null = {}) {
  const Original = Date;
  // @ts-expect-error — substituição controlada do relógio, desfeita no afterEach
  globalThis.Date = class extends Original {
    constructor(...args: any[]) {
      // @ts-expect-error — repasse dinâmico para o Date original
      super(...(args.length ? args : [instanteISO]));
    }
    static now() {
      return new Original(instanteISO).getTime();
    }
  };

  mock.module("@db", () => ({
    default: {
      botConfig: {
        findUnique: async () => (config === null ? null : { businessHours: HORARIO_COMERCIAL, businessBreaks: ALMOCO, ...config }),
      },
      $queryRaw: async () => [{ timezone: fuso }],
    },
  }));
  mock.module("@/ws/hub", () => ({ connectedUserIds: () => new Set<string>() }));

  const { isWithinBusinessHours } = await import("@/presence?" + instanteISO + fuso);
  return { isWithinBusinessHours, restaurar: () => (globalThis.Date = Original) };
}

describe("isWithinBusinessHours", () => {
  const restauradores: Array<() => void> = [];
  afterEach(() => {
    restauradores.splice(0).forEach((r) => r());
    mock.restore();
  });

  const cenario = async (instante: string, fuso = "America/Campo_Grande", config?: Record<string, unknown> | null) => {
    const { isWithinBusinessHours, restaurar } = await comRelogio(instante, fuso, config);
    restauradores.push(restaurar);
    return isWithinBusinessHours("quality");
  };

  it("manhã de terça é horário de atendimento (o caso que estava quebrado)", async () => {
    // 12:21 UTC = 08:21 em Campo Grande. Pela hora do servidor cairia no almoço.
    expect(await cenario("2026-08-11T12:21:00Z")).toBe(true);
  });

  it("o intervalo de almoço fecha, na hora local", async () => {
    // 15:30 UTC = 11:30 em Campo Grande: começo do intervalo.
    expect(await cenario("2026-08-11T15:30:00Z")).toBe(false);
  });

  it("depois do expediente fecha", async () => {
    // 22:00 UTC = 18:00 em Campo Grande, já passou das 17:30.
    expect(await cenario("2026-08-11T22:00:00Z")).toBe(false);
  });

  it("domingo fecha, mesmo em horário comercial", async () => {
    expect(await cenario("2026-08-09T14:00:00Z")).toBe(false);
  });

  it("o fuso do espaço de trabalho é respeitado", async () => {
    // O mesmo instante: 09:21 em São Paulo (aberto) e 08:21 em Campo Grande.
    expect(await cenario("2026-08-11T12:21:00Z", "America/Sao_Paulo")).toBe(true);
    // 14:40 UTC = 11:40 em São Paulo (almoço) mas 10:40 em Campo Grande (aberto).
    expect(await cenario("2026-08-11T14:40:00Z", "America/Sao_Paulo")).toBe(false);
    expect(await cenario("2026-08-11T14:40:00Z", "America/Campo_Grande")).toBe(true);
  });

  it("sem horário cadastrado, atende sempre", async () => {
    expect(await cenario("2026-08-09T03:00:00Z", "America/Campo_Grande", { businessHours: [] })).toBe(true);
  });
});
