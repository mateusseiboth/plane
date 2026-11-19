/**
 * O recorte do chamado que o detalhe guarda no store. Ele é montado campo a
 * campo, e a entidade ficava de fora: aberto direto (faixa de urgentes, link da
 * notificação), o chamado mostrava "Adicionar entidade" mesmo tendo uma.
 * Rodar com `bun test core/store/issue/issue-details`.
 */
import { describe, expect, it } from "bun:test";
import type { TIssue } from "@plane/types";
import { buildIssueDoDetalhe } from "@/store/issue/issue-details/issue-do-detalhe";

const chamado = {
  id: "c1",
  sequence_id: 6,
  name: "Teste cliente parado",
  entity_id: "e1",
  entity: { id: "e1", name: "CAMARA MUNICIPAL DE ANGELICA", entity_type: 2 },
} as unknown as TIssue;

describe("buildIssueDoDetalhe", () => {
  it("guarda a entidade do chamado", () => {
    expect(buildIssueDoDetalhe(chamado)).toMatchObject({
      entity_id: "e1",
      entity: { id: "e1", name: "CAMARA MUNICIPAL DE ANGELICA", entity_type: 2 },
    });
  });

  it("quem abre o detalhe acabou de ler o chamado", () => {
    expect(buildIssueDoDetalhe({ ...chamado, is_unread: true }).is_unread).toBe(false);
  });
});
