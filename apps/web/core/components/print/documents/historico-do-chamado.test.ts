/**
 * Histórico e encerramento na impressão do chamado: rótulo de cada atividade,
 * ordem cronológica e de onde sai o encerramento. Puro.
 * Rodar com `bun test core/components/print`.
 */
import { describe, expect, it } from "bun:test";
import { buildHistoricoDoChamado, readEncerramento } from "@/components/print/documents/historico-do-chamado";

const atividade = (over: Record<string, unknown>) =>
  ({
    id: "x",
    verb: "updated",
    field: "state",
    old_value: undefined,
    new_value: undefined,
    created_at: "2026-09-01T12:00:00Z",
    actor_detail: { display_name: "ana" },
    ...over,
  }) as any;

describe("buildHistoricoDoChamado", () => {
  it("rotula em português e ordena do mais antigo ao mais recente", () => {
    const historico = buildHistoricoDoChamado([
      atividade({
        id: "b",
        field: "state",
        old_value: "A Fazer",
        new_value: "Em Teste",
        created_at: "2026-09-03T12:00:00Z",
      }),
      atividade({ id: "a", verb: "created", field: "issue", created_at: "2026-09-01T12:00:00Z" }),
      atividade({ id: "c", field: "campo_novo", created_at: "2026-09-04T12:00:00Z" }),
    ]);
    expect(historico.map((h) => [h.id, h.acao, h.detalhe, h.autor])).toEqual([
      ["a", "Criou o chamado", "", "ana"],
      ["b", "Mudou a etapa", "A Fazer → Em Teste", "ana"],
      ["c", "Alterou campo_novo", "", "ana"],
    ]);
  });
});

describe("readEncerramento", () => {
  const historico = [
    atividade({
      id: "1",
      field: "state",
      new_value: "Concluído",
      created_at: "2026-09-05T12:00:00Z",
      actor_detail: { display_name: "q1" },
    }),
    atividade({ id: "2", field: "state", new_value: "Em Desenvolvimento", created_at: "2026-09-06T12:00:00Z" }),
    atividade({
      id: "3",
      field: "state",
      new_value: "Concluído",
      created_at: "2026-09-08T12:00:00Z",
      actor_detail: { display_name: "q2" },
    }),
  ];

  it("chamado encerrado: a última entrada na etapa atual", () => {
    expect(readEncerramento(historico, { name: "Concluído", group: "completed" }, null)).toEqual({
      em: "2026-09-08T12:00:00Z",
      por: "q2",
      etapa: "Concluído",
    });
  });

  it("chamado em aberto não tem encerramento", () => {
    expect(readEncerramento(historico, { name: "Em Desenvolvimento", group: "started" }, null)).toBeNull();
  });

  it("sem histórico, usa a data de conclusão gravada", () => {
    expect(readEncerramento([], { name: "Concluído", group: "completed" }, "2026-01-02T00:00:00Z")).toEqual({
      em: "2026-01-02T00:00:00Z",
      por: null,
      etapa: "Concluído",
    });
  });
});
