/**
 * Regras puras da inscrição pública de currículo (`/trabalhe-conosco`):
 * campos obrigatórios, e-mail, aceite da LGPD, origem gravada e o campo
 * isca contra robô. Sem banco e sem storage.
 */
import { describe, expect, it } from "bun:test";
import { CURRICULO_ORIGEM, isRoboNaIsca, validateInscricaoDoSite } from "@modules/curriculo/curriculo.rules";

const AGORA = new Date("2026-09-22T12:00:00.000Z");

const completo = {
  name: "  Ana Souza ",
  email: " ANA@exemplo.com ",
  phone: "(67) 99999-1234",
  position: "Programadora",
  city: "Campo Grande",
  message: "Tenho experiência com suporte.",
  aceite_lgpd: "true",
};

const campos = (body: Record<string, unknown>) => validateInscricaoDoSite(body, AGORA);

describe("validateInscricaoDoSite", () => {
  it("aceita a inscrição completa, limpa os espaços e guarda a origem site", () => {
    const { data, errors } = campos(completo);
    expect(errors).toEqual([]);
    expect(data).toMatchObject({
      name: "Ana Souza",
      email: "ana@exemplo.com",
      phone: "(67) 99999-1234",
      position: "Programadora",
      city: "Campo Grande",
      message: "Tenho experiência com suporte.",
      source: CURRICULO_ORIGEM.SITE,
      chatSessionId: null,
    });
    expect(data.consentAt).toEqual(AGORA);
  });

  it("a mensagem é opcional", () => {
    const { data, errors } = campos({ ...completo, message: "  " });
    expect(errors).toEqual([]);
    expect(data.message).toBeNull();
  });

  it("cobra cada campo obrigatório no próprio campo", () => {
    const { errors } = campos({ aceite_lgpd: "true" });
    expect(errors.map((e) => e.path)).toEqual(["name", "email", "phone", "position", "city"]);
    expect(errors[0]).toEqual({ path: "name", message: "Informe seu nome." });
  });

  it("recusa e-mail sem formato de e-mail", () => {
    expect(campos({ ...completo, email: "ana.exemplo.com" }).errors).toEqual([
      { path: "email", message: "Informe um e-mail válido." },
    ]);
  });

  it("recusa telefone com menos de 10 dígitos", () => {
    expect(campos({ ...completo, phone: "3321-0000" }).errors).toEqual([
      { path: "phone", message: "Informe o telefone com DDD." },
    ]);
  });

  it("sem o aceite da LGPD não grava nada", () => {
    expect(campos({ ...completo, aceite_lgpd: "false" }).errors).toEqual([
      { path: "aceite_lgpd", message: "É preciso aceitar a guarda dos seus dados." },
    ]);
  });

  it("o aceite vale marcado no formulário ou como verdadeiro", () => {
    expect(campos({ ...completo, aceite_lgpd: "on" }).errors).toEqual([]);
    expect(campos({ ...completo, aceite_lgpd: true }).errors).toEqual([]);
  });
});

describe("isRoboNaIsca", () => {
  it("campo isca preenchido é robô", () => {
    expect(isRoboNaIsca({ sobrenome: "http://spam" })).toBe(true);
  });

  it("gente deixa a isca em branco", () => {
    expect(isRoboNaIsca({ sobrenome: "  " })).toBe(false);
    expect(isRoboNaIsca({})).toBe(false);
  });
});
