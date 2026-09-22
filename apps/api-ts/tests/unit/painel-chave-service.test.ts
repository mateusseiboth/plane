/**
 * Service das chaves de painel: criação (valor só uma vez), revogação,
 * autenticação por hash, escopo, limite de requisições e trilha de auditoria.
 * DAO, auditoria e relógio mockados — sem banco.
 */
import { describe, expect, it, mock } from "bun:test";
import { hashChave } from "@modules/painel-tv/chaves/chave";
import {
  ChaveDePainelInvalidaError,
  ChaveDePainelNaoEncontradaError,
  MuitasRequisicoesDoPainelError,
  PainelNaoLiberadoError,
  ValidacaoDaChaveError,
} from "@modules/painel-tv/chaves/chave.errors";
import { createChaveService } from "@modules/painel-tv/chaves/chave.service";

const AGORA = new Date("2026-09-22T12:00:00.000Z");
const WS = "11111111-1111-4111-8111-111111111111";
const CTX = { workspaceId: WS, slug: "quality", userId: "user-1", headers: {} };

const gravada = (over: Record<string, unknown> = {}) => ({
  id: "chave-1",
  workspaceId: WS,
  name: "TV da recepção",
  keyHash: hashChave("ptv_valida"),
  lastFour: "lida",
  scopes: ["ti", "mapa"],
  isActive: true,
  lastUsedAt: null,
  createdById: "user-1",
  createdAt: AGORA,
  updatedAt: AGORA,
  revokedAt: null,
  revokedById: null,
  ...over,
});

// `any` no DAO de propósito: são mocks do bun:test, e tipá-los como o DAO real
// esconderia `.mock.calls`, que é justamente o que este arquivo confere.
// oxlint-disable-next-line no-explicit-any
const makeService = (overrides: Record<string, any> = {}, rateLimit = () => true) => {
  const dao = {
    findChaves: mock(async () => [gravada()]),
    findChave: mock(async () => gravada()),
    findPorHash: mock(async () => gravada()),
    createChave: mock(async (data: any) => gravada(data)),
    revokeChave: mock(async (_id: string, data: any) => gravada({ isActive: false, ...data })),
    touchChave: mock(async () => undefined),
    ...overrides,
  };
  const audit = mock(() => Promise.resolve());
  const service = createChaveService({ dao: dao as any, audit, now: () => AGORA, rateLimit });
  return { service, dao, audit };
};

describe("criação", () => {
  it("devolve o valor da chave UMA vez e guarda só o hash e os quatro últimos", async () => {
    const { service, dao } = makeService();
    const criada = await service.create(CTX, { name: "TV do TI", scopes: ["ti"] });
    expect(criada.key).toMatch(/^ptv_/);
    const gravadaNoBanco = (dao.createChave.mock.calls[0] as any[])[0];
    expect(gravadaNoBanco.keyHash).toBe(hashChave(criada.key));
    expect(gravadaNoBanco.lastFour).toBe(criada.key.slice(-4));
    expect(JSON.stringify(gravadaNoBanco)).not.toContain(criada.key);
  });

  it("a listagem nunca traz o valor nem o hash", async () => {
    const { service } = makeService();
    const [primeira] = (await service.list(CTX)).results;
    expect(primeira).toMatchObject({ id: "chave-1", name: "TV da recepção", scopes: ["ti", "mapa"], is_active: true });
    expect(JSON.stringify(primeira)).not.toContain("keyHash");
    expect((primeira as Record<string, unknown>).key).toBeUndefined();
  });

  it("recusa o formulário inválido com o erro no campo", async () => {
    const { service } = makeService();
    const erro = await service.create(CTX, { name: "", scopes: [] }).catch((e) => e);
    expect(erro).toBeInstanceOf(ValidacaoDaChaveError);
    expect(erro.errors).toEqual([
      { path: "name", message: "Informe o nome da chave." },
      { path: "scopes", message: "Escolha ao menos um painel." },
    ]);
  });

  it("criar e revogar entram na trilha de auditoria", async () => {
    const { service, audit } = makeService();
    await service.create(CTX, { name: "TV do TI", scopes: ["ti"] });
    await service.revoke(CTX, "chave-1");
    expect(audit).toHaveBeenCalledTimes(2);
    expect((audit.mock.calls[0] as any[])[0]).toMatchObject({ entity: "panel_key", action: "create" });
    expect((audit.mock.calls[1] as any[])[0]).toMatchObject({ entity: "panel_key", action: "delete" });
  });
});

describe("revogação", () => {
  it("marca a chave como revogada, com quem revogou e quando", async () => {
    const { service, dao } = makeService();
    const revogada = await service.revoke(CTX, "chave-1");
    expect(revogada.is_active).toBe(false);
    expect((dao.revokeChave.mock.calls[0] as any[])[1]).toEqual({
      isActive: false,
      revokedAt: AGORA,
      revokedById: "user-1",
    });
  });

  it("chave de outro espaço não existe para quem pergunta", async () => {
    const { service } = makeService({ findChave: mock(async () => null) as any });
    expect(service.revoke(CTX, "chave-1")).rejects.toBeInstanceOf(ChaveDePainelNaoEncontradaError);
  });
});

describe("autenticação", () => {
  const pedido = (over: Record<string, unknown> = {}) => ({
    valor: "ptv_valida",
    painel: "ti" as const,
    workspaceId: WS,
    ip: "10.0.0.1",
    ...over,
  });

  it("aceita a chave certa, no espaço certo e no painel do escopo", async () => {
    const { service, dao } = makeService();
    const chave = await service.authenticate(pedido());
    expect(chave).toMatchObject({ id: "chave-1", workspaceId: WS, name: "TV da recepção" });
    expect((dao.findPorHash.mock.calls[0] as any[])[0]).toBe(hashChave("ptv_valida"));
  });

  it("marca o último uso sem esperar a resposta ficar pronta", async () => {
    const { service, dao } = makeService();
    await service.authenticate(pedido());
    expect(dao.touchChave).toHaveBeenCalledWith("chave-1", AGORA);
  });

  it("recusa chave ausente, desconhecida, revogada ou de outro espaço", async () => {
    const { service } = makeService();
    expect(service.authenticate(pedido({ valor: "" }))).rejects.toBeInstanceOf(ChaveDePainelInvalidaError);
    expect(service.authenticate(pedido({ workspaceId: "outro" }))).rejects.toBeInstanceOf(ChaveDePainelInvalidaError);

    const semChave = makeService({ findPorHash: mock(async () => null) as any });
    expect(semChave.service.authenticate(pedido())).rejects.toBeInstanceOf(ChaveDePainelInvalidaError);

    const revogada = makeService({ findPorHash: mock(async () => gravada({ isActive: false })) as any });
    expect(revogada.service.authenticate(pedido())).rejects.toBeInstanceOf(ChaveDePainelInvalidaError);
  });

  it("recusa painel fora do escopo da chave", async () => {
    const { service } = makeService();
    expect(service.authenticate(pedido({ painel: "qualidade" }))).rejects.toBeInstanceOf(PainelNaoLiberadoError);
  });

  it("recusa quando o limite de requisições da chave estoura", async () => {
    const { service } = makeService({}, () => false);
    expect(service.authenticate(pedido())).rejects.toBeInstanceOf(MuitasRequisicoesDoPainelError);
  });
});
