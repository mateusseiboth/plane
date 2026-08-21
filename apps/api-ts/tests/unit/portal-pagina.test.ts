/**
 * A página do portal do cliente.
 *
 * O contrato aqui é de produto, não de estilo: o cliente entra para escolher o
 * sistema, abrir a solicitação e ver as que abriu. Nada do Plane vai junto —
 * nem barra lateral, nem quadro, nem o bundle do web.
 */
import { describe, expect, it } from "bun:test";
import { paginaDoPortal } from "@modules/portal/pagina";

const html = paginaDoPortal();
const contem = (trecho: string) => html.includes(trecho);

describe("página do portal", () => {
  it("tem as três telas do cliente", () => {
    expect(contem('id="tela-entrada"')).toBe(true);
    expect(contem('id="tela-lista"')).toBe(true);
    expect(contem('id="tela-nova"')).toBe(true);
  });

  it("pede e-mail e senha para entrar", () => {
    expect(contem('id="email"')).toBe(true);
    expect(contem('id="senha"')).toBe(true);
  });

  it("abre a solicitação escolhendo o sistema", () => {
    expect(contem('id="sistema"')).toBe(true);
    expect(contem('id="titulo"')).toBe(true);
    expect(contem('id="descricao"')).toBe(true);
  });

  it("é autocontida: nenhum script ou folha de estilo de fora", () => {
    expect(/<script[^>]+src=/i.test(html)).toBe(false);
    expect(/<link[^>]+stylesheet/i.test(html)).toBe(false);
  });

  it("fala com a API do próprio portal, nunca com a do produto", () => {
    expect(contem("/api/v1/")).toBe(false);
  });
});
