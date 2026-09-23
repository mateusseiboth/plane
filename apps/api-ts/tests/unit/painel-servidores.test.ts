/**
 * Status do servidor das entidades no painel do mapa: a regra pura (quem está
 * online pelas conexões do gateway) e o provedor que fala com o gateway, com o
 * `fetch` injetado — sem rede.
 */
import { describe, expect, it, mock } from "bun:test";
import { buildStatusDasEntidades } from "@modules/painel-tv/servidores/status";
import {
  GATEWAY_PADRAO,
  createFonteDeStatusDeServidor,
  createFonteGatewayDeStatus,
} from "@modules/painel-tv/servidores/status.gateway";

const AGORA = new Date("2026-09-22T12:00:00.000Z");

const entidades = [
  { id: "uuid-a", nome: "Prefeitura A", legacyId: 3, sacCode: 3 },
  { id: "uuid-b", nome: "Prefeitura B", legacyId: 4, sacCode: 4 },
  { id: "uuid-c", nome: "Entidade nova", legacyId: null, sacCode: null },
];
const sacPorLegado = new Map([
  [3, 3],
  [4, 104],
]);

describe("regra do status", () => {
  it("online quando há conexão aberta da entidade; offline quando todas caíram", () => {
    const status = buildStatusDasEntidades({
      conexoes: [
        { entCodigo: 3, connected: true },
        { entCodigo: 104, connected: false },
      ],
      entidades,
      sacPorLegado,
    });
    expect(status).toEqual([
      { entityId: "uuid-a", online: true, conexoes: 1 },
      { entityId: "uuid-b", online: false, conexoes: 0 },
    ]);
  });

  it("entidade que o gateway não conhece fica de fora (sem informação, nunca vermelha)", () => {
    const status = buildStatusDasEntidades({ conexoes: [{ entCodigo: 3, connected: true }], entidades, sacPorLegado });
    expect(status.map((s) => s.entityId)).toEqual(["uuid-a"]);
  });

  it("entende também o `status` da lista do monitor (healthy/down)", () => {
    const status = buildStatusDasEntidades({
      conexoes: [
        { entCodigo: 3, status: "healthy" },
        { entCodigo: 104, status: "down" },
      ],
      entidades,
      sacPorLegado,
    });
    expect(status.map((s) => s.online)).toEqual([true, false]);
  });

  it("a tela de monitoração não conta como servidor do cliente", () => {
    const status = buildStatusDasEntidades({
      conexoes: [{ entCodigo: 3, connected: true, isMonitor: true }],
      entidades,
      sacPorLegado,
    });
    expect(status).toEqual([]);
  });
});

const resposta = (clients: unknown[]) =>
  new Response(JSON.stringify({ ok: true, data: { clients } }), { headers: { "content-type": "application/json" } });

describe("provedor do gateway", () => {
  it("consulta `clients.list` com o token administrativo no cabeçalho", async () => {
    const buscar = mock(async () => resposta([{ entCodigo: 3, connected: true }]));
    const fonte = createFonteGatewayDeStatus({
      url: "https://gw.exemplo/",
      token: "token-de-teste",
      buscar: buscar as unknown as typeof fetch,
      agora: () => AGORA,
    });
    await fonte.findStatus([{ id: "uuid", nome: "Prefeitura", legacyId: 3, sacCode: 3 }], AGORA);
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gw.exemplo/admin/clients.list?limit=5000");
    expect((init.headers as Record<string, string>)["x-admin-token"]).toBe("token-de-teste");
  });

  it("uma consulta ao gateway serve as chamadas seguidas do painel", async () => {
    const buscar = mock(async () => resposta([]));
    const fonte = createFonteGatewayDeStatus({
      url: "https://gw.exemplo",
      token: "t",
      buscar: buscar as unknown as typeof fetch,
      agora: () => AGORA,
    });
    await fonte.findStatus([], AGORA);
    await fonte.findStatus([], AGORA);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("sem o token do gateway, a fonte é a vazia", async () => {
    expect(await createFonteDeStatusDeServidor({}).findStatus(entidades, AGORA)).toEqual([]);
    expect(
      await createFonteDeStatusDeServidor({ GATEWAY_ADMIN_URL: "https://gw" }).findStatus(entidades, AGORA)
    ).toEqual([]);
  });

  it("o endereço padrão é o gateway de produção, onde os bservers realmente estão", () => {
    expect(GATEWAY_PADRAO).toBe("https://gwsocket.qualitysistemas.inf.br");
  });

  it("gateway fora do ar não derruba o mapa: devolve lista vazia", async () => {
    const fonte = createFonteDeStatusDeServidor({
      GATEWAY_ADMIN_URL: "https://127.0.0.1:1/",
      GATEWAY_ADMIN_TOKEN: "t",
    });
    expect(await fonte.findStatus(entidades, AGORA)).toEqual([]);
  });
});
