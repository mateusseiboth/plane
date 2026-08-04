/**
 * Cursor pagination — formato "limit:page:is_prev" herdado do OffsetPaginator do
 * Django. O frontend navega enviando de volta o `next_cursor`/`prev_cursor`, então
 * qualquer desvio aqui quebra a navegação de todas as listagens paginadas.
 */
import {describe, expect, it} from "bun:test";
import {buildCursor, paginate} from "@utils/pagination";

const ITEMS = Array.from({length: 25}, (_, i) => ({id: i}));

function source(items = ITEMS) {
  return {
    query: async (skip: number, take: number) => items.slice(skip, skip + take),
    count: async () => items.length,
  };
}

describe("buildCursor", () => {
  it("serializa limite, página e flag de retrocesso", () => {
    expect(buildCursor(20, 3, false)).toBe("20:3:0");
    expect(buildCursor(20, 3, true)).toBe("20:3:1");
  });
});

describe("paginate", () => {
  it("usa perPage e reporta a existência de próxima página", async () => {
    const page = await paginate({...source(), perPage: 10});
    expect(page.results).toHaveLength(10);
    expect(page.total_count).toBe(25);
    expect(page.total_results).toBe(25);
    expect(page.next_cursor).toBe("10:1:0");
    expect(page.prev_cursor).toBe("10:0:1");
    expect(page.next_page_results).toBe(true);
    expect(page.prev_page_results).toBe(false);
  });

  it("navega para a página seguinte usando o cursor devolvido", async () => {
    const first = await paginate({...source(), perPage: 10});
    const second = await paginate({...source(), cursor: first.next_cursor});
    expect((second.results as {id: number}[])[0].id).toBe(10);
    expect(second.prev_page_results).toBe(true);
    expect(second.next_page_results).toBe(true);

    const third = await paginate({...source(), cursor: second.next_cursor});
    expect(third.results).toHaveLength(5);
    expect(third.next_page_results).toBe(false);
    expect(third.prev_page_results).toBe(true);
  });

  it("limita perPage a 1000", async () => {
    const page = await paginate({...source(), perPage: 99999});
    expect(page.next_cursor).toBe("1000:1:0");
  });

  it("assume 100 por página quando perPage não é informado", async () => {
    const page = await paginate(source());
    expect(page.results).toHaveLength(25);
    expect(page.next_cursor).toBe("100:1:0");
  });

  it("ignora cursor malformado e cai no padrão", async () => {
    const page = await paginate({...source(), cursor: "lixo", perPage: 5});
    expect(page.next_cursor).toBe("100:1:0");
    expect(page.results).toHaveLength(100 > 25 ? 25 : 100);
  });

  it("tolera limite não numérico dentro do cursor", async () => {
    const page = await paginate({...source(), cursor: "abc:2:0"});
    expect(page.next_cursor).toBe("100:3:0");
    expect(page.results).toHaveLength(0);
  });

  it("aplica transform aos resultados sem alterar os contadores", async () => {
    const page = await paginate({
      ...source(),
      perPage: 3,
      transform: (items) => (items as {id: number}[]).map((i) => i.id),
    });
    expect(page.results).toEqual([0, 1, 2]);
    expect(page.total_count).toBe(25);
  });

  it("devolve lista vazia quando não há registros", async () => {
    const page = await paginate(source([]));
    expect(page.results).toEqual([]);
    expect(page.total_count).toBe(0);
    expect(page.next_page_results).toBe(false);
  });

  it("marca prev_page_results na primeira página de um cursor de retrocesso", async () => {
    const page = await paginate({...source(), cursor: "5:1:1"});
    expect(page.prev_page_results).toBe(true);
    expect(page.prev_cursor).toBe("5:0:1");
  });
});
