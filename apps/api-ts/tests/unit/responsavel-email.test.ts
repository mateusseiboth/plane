/**
 * Troca do e-mail do responsável pelo robô do WhatsApp (legado
 * `menuAtualizarEmail.php`, que gravava `responsaveis_emaillog`): valida,
 * grava em `entity_contacts` e deixa o de/para na auditoria. Sem banco.
 */
import { describe, expect, it, mock } from "bun:test";
import { createResponsavelEmailService, type ResponsavelEmailDeps } from "@modules/interno-chat/responsavel-email";
import { FieldValidationError, NotFoundError } from "@utils/erro-de-dominio";

const WS = "11111111-1111-4111-8111-111111111111";
const CONTATO = "22222222-2222-4222-8222-222222222222";
const SESSAO = "33333333-3333-4333-8333-333333333333";

const makeService = (over: Record<string, unknown> = {}) => {
  const dao = {
    findContato: mock(async () => ({ id: CONTATO, email: "velho@pref.gov.br" })),
    saveEmail: mock(async () => undefined),
    ...over,
  } as unknown as ResponsavelEmailDeps["dao"];
  const audit = mock(async () => undefined);
  return { service: createResponsavelEmailService({ dao, audit }), dao, audit };
};

describe("ResponsavelEmailService.update", () => {
  it("grava minúsculo e registra de/para com a origem chat", async () => {
    const { service, dao, audit } = makeService();
    const r = await service.update(WS, { contact_id: CONTATO, email: " Novo@Pref.gov.br ", session_id: SESSAO });
    expect(r).toEqual({ previous_email: "velho@pref.gov.br", email: "novo@pref.gov.br" });
    expect((dao.saveEmail as any).mock.calls[0]).toEqual([CONTATO, "novo@pref.gov.br"]);
    expect((audit as any).mock.calls[0][0]).toMatchObject({
      workspaceId: WS,
      entity: "entity_contact",
      entityId: CONTATO,
      action: "update",
      changes: { email: { de: "velho@pref.gov.br", para: "novo@pref.gov.br" } },
      metadata: { origem: "chat", chat_session_id: SESSAO },
    });
  });

  it("e-mail inválido volta no campo email", async () => {
    const { service, dao } = makeService();
    const erro = await service.update(WS, { contact_id: CONTATO, email: "fulano@" }).catch((e) => e);
    expect(erro).toBeInstanceOf(FieldValidationError);
    expect(erro.errors).toEqual([{ path: "email", message: "E-mail inválido. Confira e envie de novo." }]);
    expect(dao.saveEmail).not.toHaveBeenCalled();
  });

  it("responsável de outro espaço ou apagado: não encontrado", async () => {
    const { service } = makeService({ findContato: mock(async () => null) });
    expect(service.update(WS, { contact_id: CONTATO, email: "a@b.com" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
