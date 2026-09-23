/**
 * Coluna "Registro" da trilha de auditoria.
 * Rodar com `bun test core/components/audit`.
 */
import { describe, expect, it } from "bun:test";
import { caminhoDoRegistro, rotuloDoRegistro } from "@/components/audit/registro";
import type { TAuditLog } from "@/services/audit.service";

const log = (registro: TAuditLog["registro"]): TAuditLog =>
  ({
    id: "log-1",
    entity: "issue",
    entity_id: "b9cc59d1-0000-0000-0000-000000000000",
    action: "view",
    registro,
  }) as TAuditLog;

describe("rotuloDoRegistro", () => {
  it("usa o rótulo que o backend resolveu", () => {
    expect(
      rotuloDoRegistro(log({ tipo: "issue", id: "x", rotulo: "Chamado QLT-12 Erro no IPTU", caminho: null }), "Chamado")
    ).toBe("Chamado QLT-12 Erro no IPTU");
  });

  it("sem o campo resolvido, cai para o tipo e o começo do id", () => {
    expect(rotuloDoRegistro(log(null), "Chamado")).toBe("Chamado b9cc59d1");
  });

  it("rótulo em branco também cai para o texto de segurança", () => {
    expect(rotuloDoRegistro(log({ tipo: "issue", id: "x", rotulo: "   ", caminho: null }), "Chamado")).toBe(
      "Chamado b9cc59d1"
    );
  });
});

describe("caminhoDoRegistro", () => {
  it("devolve a rota quando o registro pode ser aberto", () => {
    expect(
      caminhoDoRegistro(log({ tipo: "issue", id: "x", rotulo: "Chamado", caminho: "/quality/projects/p/issues/i" }))
    ).toBe("/quality/projects/p/issues/i");
  });

  it("registro sem tela (ou removido) não vira link", () => {
    expect(caminhoDoRegistro(log({ tipo: "attachment", id: "x", rotulo: "Anexo nota.pdf", caminho: null }))).toBeNull();
    expect(caminhoDoRegistro(log(null))).toBeNull();
  });
});
