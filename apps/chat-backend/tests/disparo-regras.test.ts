/**
 * Disparo em massa: regras puras (telefone, destinatários sem repetição, ritmo,
 * leitura do que chega nas rotas e resumo da execução). Sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  DISPARO_ITEM_STATUS,
  buildDestinatarios,
  getIntervaloMs,
  getTipoDoArquivo,
  isHoraDoProximoEnvio,
  normalizeTelefoneDisparo,
  readArquivo,
  readFiltros,
  readMensagem,
  readRitmo,
  summarizeItens,
} from "@/disparo/regras";

describe("normalizeTelefoneDisparo", () => {
  it("põe o DDI 55 e o nono dígito no celular antigo", () => {
    expect(normalizeTelefoneDisparo("(67) 9999-0000")).toBe("5567999990000");
    expect(normalizeTelefoneDisparo("556799990000")).toBe("5567999990000");
  });

  it("mantém o celular que já tem o nono dígito", () => {
    expect(normalizeTelefoneDisparo("67 99999-0000")).toBe("5567999990000");
    expect(normalizeTelefoneDisparo("+55 67 99999-0000")).toBe("5567999990000");
  });

  it("não inventa nono dígito em telefone fixo", () => {
    expect(normalizeTelefoneDisparo("(67) 3321-0000")).toBe("556733210000");
  });

  it("recusa o que não é telefone brasileiro", () => {
    expect(normalizeTelefoneDisparo("123")).toBeNull();
    expect(normalizeTelefoneDisparo(null)).toBeNull();
    expect(normalizeTelefoneDisparo("sem telefone")).toBeNull();
    expect(normalizeTelefoneDisparo("1 800 555 0000 99")).toBeNull();
  });
});

const contato = (contactId: string, phone: string | null) => ({
  contactId,
  name: `Pessoa ${contactId}`,
  entityName: "Prefeitura",
  phone,
});

describe("buildDestinatarios", () => {
  it("um item por telefone: o mesmo número com e sem nono dígito conta uma vez", () => {
    const r = buildDestinatarios([
      contato("a", "67 9999-0000"),
      contato("b", "5567999990000"),
      contato("c", "67 3321-0000"),
    ]);
    expect(r.destinatarios.map((d) => d.telefone)).toEqual(["5567999990000", "556733210000"]);
    expect(r.destinatarios[0]!.contactId).toBe("a");
    expect(r.repetidos).toBe(1);
    expect(r.withoutTelefone).toBe(0);
  });

  it("conta quem ficou de fora por não ter telefone válido", () => {
    const r = buildDestinatarios([contato("a", null), contato("b", "12"), contato("c", "67999990000")]);
    expect(r.destinatarios).toHaveLength(1);
    expect(r.withoutTelefone).toBe(2);
  });
});

describe("ritmo", () => {
  it("20 por minuto é um envio a cada 3 segundos", () => {
    expect(getIntervaloMs(20)).toBe(3000);
    expect(getIntervaloMs(60)).toBe(1000);
  });

  it("envia o primeiro na hora e espera o intervalo para o próximo", () => {
    const agora = new Date("2026-09-22T12:00:10Z");
    expect(isHoraDoProximoEnvio(null, agora, 20)).toBe(true);
    expect(isHoraDoProximoEnvio(new Date("2026-09-22T12:00:08Z"), agora, 20)).toBe(false);
    expect(isHoraDoProximoEnvio(new Date("2026-09-22T12:00:07Z"), agora, 20)).toBe(true);
  });

  it("aceita de 1 a 60 mensagens por minuto", () => {
    expect(readRitmo({ mensagens_por_minuto: 30 })).toEqual({ ok: true, data: 30 });
    expect(readRitmo({ mensagens_por_minuto: "12" })).toEqual({ ok: true, data: 12 });
    for (const invalido of [0, 61, 2.5, "abc", null]) {
      const r = readRitmo({ mensagens_por_minuto: invalido });
      expect(r.ok).toBe(false);
      expect(r.ok ? [] : r.errors.map((e) => e.path)).toEqual(["mensagens_por_minuto"]);
    }
  });
});

describe("readFiltros", () => {
  const uuid = "0194f0c2-0000-7000-8000-000000000001";

  it("todos os filtros são opcionais", () => {
    expect(readFiltros({})).toEqual({ ok: true, data: { entityType: null, entityId: null, projectId: null } });
  });

  it("lê tipo de entidade, entidade e sistema", () => {
    expect(readFiltros({ entity_type: "3", entity_id: uuid, project_id: uuid })).toEqual({
      ok: true,
      data: { entityType: 3, entityId: uuid, projectId: uuid },
    });
  });

  it("recusa cada campo inválido no próprio caminho", () => {
    const r = readFiltros({ entity_type: -1, entity_id: "x", project_id: 5 });
    expect(r.ok ? [] : r.errors.map((e) => e.path)).toEqual(["entity_type", "entity_id", "project_id"]);
  });
});

describe("readMensagem", () => {
  it("exige título e texto ou arquivo", () => {
    const r = readMensagem({ titulo: " ", texto: "" }, false);
    expect(r.ok ? [] : r.errors).toEqual([
      { path: "titulo", message: "Informe o título." },
      { path: "texto", message: "Escreva o texto ou anexe um arquivo." },
    ]);
  });

  it("com arquivo, o texto vira legenda e pode ficar vazio", () => {
    expect(readMensagem({ titulo: "Aviso", texto: "" }, true)).toEqual({
      ok: true,
      data: { titulo: "Aviso", texto: null },
    });
  });

  it("apara o título e mantém as quebras de linha do texto", () => {
    expect(readMensagem({ titulo: "  Aviso ", texto: "Linha 1\nLinha 2" }, false)).toEqual({
      ok: true,
      data: { titulo: "Aviso", texto: "Linha 1\nLinha 2" },
    });
  });
});

describe("arquivo", () => {
  it("aceita imagem e PDF", () => {
    expect(getTipoDoArquivo("image/png")).toBe("image");
    expect(getTipoDoArquivo("image/jpeg")).toBe("image");
    expect(getTipoDoArquivo("application/pdf")).toBe("document");
    expect(getTipoDoArquivo("application/zip")).toBeNull();
  });

  it("recusa outro formato e o arquivo grande demais", () => {
    expect(readArquivo({ type: "application/zip", size: 10 }).ok).toBe(false);
    expect(readArquivo({ type: "image/png", size: 11 * 1024 * 1024 }).ok).toBe(false);
    expect(readArquivo({ type: "application/pdf", size: 1024 })).toEqual({ ok: true, data: "document" });
  });
});

describe("summarizeItens", () => {
  it("soma por situação e diz se ainda falta enviar", () => {
    const r = summarizeItens([
      { status: DISPARO_ITEM_STATUS.ENVIADO, total: 3 },
      { status: DISPARO_ITEM_STATUS.FALHOU, total: 1 },
      { status: DISPARO_ITEM_STATUS.PENDENTE, total: 2 },
    ]);
    expect(r).toEqual({ total: 6, pendente: 2, processando: 0, enviado: 3, falhou: 1, cancelado: 0, emAberto: 2 });
  });
});
