/**
 * Mural de recados: regras puras (validação do recado, vigência, período do
 * histórico e ordem da home). Sem banco; as rotas estão em tests/contract/mural.
 */
import { describe, expect, it } from "bun:test";
import {
  buildPeriodoDoMural,
  isRecadoVigente,
  selectRecadosDaHome,
  validateRecadoInput,
} from "@modules/mural/mural.rules";
import { fimDoDia, inicioDoDia } from "@utils/prazo";

const AGORA = new Date("2026-09-22T15:00:00.000Z");

const recado = (over: Partial<{ id: string; isPinned: boolean; isRead: boolean; publishedAt: Date }> = {}) => ({
  id: over.id ?? "r",
  isPinned: over.isPinned ?? false,
  isRead: over.isRead ?? false,
  publishedAt: over.publishedAt ?? AGORA,
});

describe("validateRecadoInput na criação", () => {
  const valido = { title: "Feriado", description_html: "<p>Sem expediente na sexta.</p>" };

  it("aceita título e texto e devolve os dados normalizados", () => {
    const r = validateRecadoInput(valido, { partial: false, now: AGORA });
    expect(r.errors).toEqual([]);
    expect(r.data).toMatchObject({
      title: "Feriado",
      descriptionHtml: "<p>Sem expediente na sexta.</p>",
      descriptionStripped: "Sem expediente na sexta.",
    });
  });

  it("exige título, com a mensagem no campo", () => {
    const r = validateRecadoInput({ ...valido, title: "   " }, { partial: false, now: AGORA });
    expect(r.errors).toEqual([{ path: "title", message: "Informe o título do recado." }]);
  });

  it("recusa título acima de 200 caracteres", () => {
    const r = validateRecadoInput({ ...valido, title: "x".repeat(201) }, { partial: false, now: AGORA });
    expect(r.errors.map((e) => e.path)).toEqual(["title"]);
  });

  it("exige texto; parágrafo vazio do editor não conta", () => {
    const r = validateRecadoInput({ ...valido, description_html: "<p></p>" }, { partial: false, now: AGORA });
    expect(r.errors).toEqual([{ path: "description_html", message: "Escreva o recado." }]);
  });

  it("aceita recado só com imagem", () => {
    const html = '<image-component src="abc"></image-component>';
    const r = validateRecadoInput({ ...valido, description_html: html }, { partial: false, now: AGORA });
    expect(r.errors).toEqual([]);
  });

  it("validade em data pura vale até o fim do dia", () => {
    const r = validateRecadoInput({ ...valido, expires_at: "2026-09-30" }, { partial: false, now: AGORA });
    expect(r.data.expiresAt).toEqual(fimDoDia(2026, 9, 30));
  });

  it("recusa validade que já passou e validade ilegível", () => {
    const passada = validateRecadoInput({ ...valido, expires_at: "2026-09-01" }, { partial: false, now: AGORA });
    expect(passada.errors).toEqual([{ path: "expires_at", message: "A validade precisa ser uma data futura." }]);
    const lixo = validateRecadoInput({ ...valido, expires_at: "amanhã" }, { partial: false, now: AGORA });
    expect(lixo.errors).toEqual([{ path: "expires_at", message: "Data de validade inválida." }]);
  });

  it("validade nula ou vazia fica sem validade", () => {
    const r = validateRecadoInput({ ...valido, expires_at: "" }, { partial: false, now: AGORA });
    expect(r.errors).toEqual([]);
    expect(r.data.expiresAt).toBeNull();
  });

  it("lê fixado, obrigatório e anexo", () => {
    const anexo = "0198f7a4-1b2c-7d3e-8f40-123456789abc";
    const r = validateRecadoInput(
      { ...valido, is_pinned: true, is_required: true, attachment_id: anexo },
      { partial: false, now: AGORA }
    );
    expect(r.data).toMatchObject({ isPinned: true, isRequired: true, attachmentId: anexo });
  });

  it("recusa anexo que não é identificador", () => {
    const r = validateRecadoInput({ ...valido, attachment_id: "x" }, { partial: false, now: AGORA });
    expect(r.errors).toEqual([{ path: "attachment_id", message: "Anexo inválido." }]);
  });
});

describe("validateRecadoInput na edição", () => {
  it("só valida e devolve o que veio", () => {
    const r = validateRecadoInput({ is_active: false }, { partial: true, now: AGORA });
    expect(r.errors).toEqual([]);
    expect(r.data).toEqual({ isActive: false });
  });

  it("título enviado vazio continua proibido", () => {
    const r = validateRecadoInput({ title: "" }, { partial: true, now: AGORA });
    expect(r.errors.map((e) => e.path)).toEqual(["title"]);
  });

  it("null limpa validade e anexo", () => {
    const r = validateRecadoInput({ expires_at: null, attachment_id: null }, { partial: true, now: AGORA });
    expect(r.data).toEqual({ expiresAt: null, attachmentId: null });
  });
});

describe("isRecadoVigente", () => {
  it("ativo e sem validade está vigente", () => {
    expect(isRecadoVigente({ isActive: true, expiresAt: null }, AGORA)).toBe(true);
  });

  it("inativo ou vencido não está", () => {
    expect(isRecadoVigente({ isActive: false, expiresAt: null }, AGORA)).toBe(false);
    expect(isRecadoVigente({ isActive: true, expiresAt: new Date("2026-09-22T14:59:59Z") }, AGORA)).toBe(false);
  });
});

describe("buildPeriodoDoMural", () => {
  it("de e até em data pura cobrem os dias inteiros", () => {
    expect(buildPeriodoDoMural({ desde: "2026-09-01", ate: "2026-09-30" })).toEqual({
      gte: inicioDoDia(2026, 9, 1),
      lte: fimDoDia(2026, 9, 30),
    });
  });

  it("sem período ou com lixo não filtra", () => {
    expect(buildPeriodoDoMural({})).toBeUndefined();
    expect(buildPeriodoDoMural({ desde: "ontem" })).toBeUndefined();
  });

  it("aceita só uma das pontas", () => {
    expect(buildPeriodoDoMural({ ate: "2026-09-30" })).toEqual({ lte: fimDoDia(2026, 9, 30) });
  });
});

const hora = (h: number) => new Date(Date.UTC(2026, 8, 22, h));

describe("selectRecadosDaHome", () => {
  it("não lidos primeiro, depois fixados, depois os mais novos", () => {
    const lista = [
      recado({ id: "lido-novo", isRead: true, publishedAt: hora(12) }),
      recado({ id: "fixado-lido", isRead: true, isPinned: true, publishedAt: hora(1) }),
      recado({ id: "nao-lido-velho", publishedAt: hora(2) }),
      recado({ id: "nao-lido-novo", publishedAt: hora(10) }),
    ];
    expect(selectRecadosDaHome(lista, 3).map((r) => r.id)).toEqual([
      "nao-lido-novo",
      "nao-lido-velho",
      "fixado-lido",
      "lido-novo",
    ]);
  });

  it("fixados e não lidos sempre aparecem; lidos comuns respeitam o limite", () => {
    const lidos = Array.from({ length: 6 }, (_, i) => recado({ id: `lido-${i}`, isRead: true, publishedAt: hora(i) }));
    const fixados = Array.from({ length: 4 }, (_, i) =>
      recado({ id: `fixado-${i}`, isRead: true, isPinned: true, publishedAt: hora(i) })
    );
    const escolhidos = selectRecadosDaHome([...lidos, ...fixados], 2).map((r) => r.id);
    expect(escolhidos.filter((id) => id.startsWith("fixado"))).toHaveLength(4);
    expect(escolhidos.filter((id) => id.startsWith("lido"))).toEqual(["lido-5", "lido-4"]);
  });
});
