/**
 * Mural de recados: regras puras da tela (consulta do histórico, payload do
 * formulário, erros por campo e o recado do aviso obrigatório).
 * Rodar com `bun test core/components/mural`.
 */
import { describe, expect, it } from "bun:test";
import {
  buildMuralQuery,
  buildRecadoPayload,
  editorInicial,
  getAvisoAtual,
  getFieldErrors,
  isMuralEvent,
  MURAL_FORM_VAZIO,
  toRecadoForm,
} from "./helpers";

describe("buildMuralQuery", () => {
  it("leva só o que foi preenchido", () => {
    expect(buildMuralQuery({ desde: "2026-09-01", ate: "", perPage: 20 })).toBe("?desde=2026-09-01&per_page=20");
  });

  it("inativos e cursor entram quando pedidos", () => {
    expect(buildMuralQuery({ inactive: true, cursor: "20:1:0" })).toBe("?inactive=true&cursor=20%3A1%3A0");
  });

  it("sem filtro não gera interrogação", () => {
    expect(buildMuralQuery({})).toBe("");
  });
});

describe("buildRecadoPayload", () => {
  it("corta espaços do título e manda validade e anexo vazios como nulo", () => {
    const payload = buildRecadoPayload({ ...MURAL_FORM_VAZIO, title: "  Aviso  ", description_html: "<p>x</p>" });
    expect(payload).toEqual({
      title: "Aviso",
      description_html: "<p>x</p>",
      is_pinned: false,
      is_required: false,
      expires_at: null,
      attachment_id: null,
    });
  });
});

describe("toRecadoForm", () => {
  it("abre o recado existente no formato do formulário", () => {
    const form = toRecadoForm({
      title: "T",
      description_html: "<p>x</p>",
      is_pinned: true,
      is_required: false,
      expires_at: "2026-09-30T23:59:59.999Z",
      attachment: { id: "a1", name: "cartaz.pdf", size: 1, mime_type: null, url: "/x" },
    });
    expect(form).toMatchObject({ title: "T", is_pinned: true, attachment_id: "a1", attachment_name: "cartaz.pdf" });
    expect(form.expires_at).toMatch(/^2026-09-30$|^2026-10-01$/);
  });

  it("sem recado devolve o formulário vazio", () => {
    expect(toRecadoForm(null)).toEqual(MURAL_FORM_VAZIO);
  });
});

describe("editorInicial", () => {
  const recado = {
    title: "T",
    description_html: '<p class="editor-paragraph-block">Reunião na sexta.</p>',
    is_pinned: false,
    is_required: false,
    expires_at: null,
    attachment: null,
  };

  it("o editor abre com o texto do recado em edição", () => {
    expect(editorInicial(toRecadoForm(recado))).toBe(recado.description_html);
  });

  it("recado novo abre com parágrafo em branco", () => {
    expect(editorInicial(MURAL_FORM_VAZIO)).toBe("<p></p>");
  });

  // A regressão que isto cobre: o editor montava com o texto de uma abertura
  // anterior enquanto o estado do formulário já estava vazio, e a API recusava
  // "Escreva o recado." com o texto à vista.
  it("o que o editor mostra é o que vai para a API", () => {
    const form = toRecadoForm(recado);
    expect(buildRecadoPayload(form).description_html).toBe(editorInicial(form));
  });
});

describe("getFieldErrors", () => {
  it("transforma a lista da API em mapa por campo", () => {
    const erro = { detail: "Revise", errors: [{ path: "title", message: "Informe o título do recado." }] };
    expect(getFieldErrors(erro)).toEqual({ title: "Informe o título do recado." });
  });

  it("erro sem lista vira mapa vazio", () => {
    expect(getFieldErrors(undefined)).toEqual({});
  });
});

describe("getAvisoAtual", () => {
  it("é o primeiro pendente ainda não confirmado nesta sessão", () => {
    const pendentes = [{ id: "a" }, { id: "b" }];
    expect(getAvisoAtual(pendentes, new Set(["a"]))?.id).toBe("b");
    expect(getAvisoAtual(pendentes, new Set(["a", "b"]))).toBeUndefined();
    expect(getAvisoAtual(undefined, new Set())).toBeUndefined();
  });
});

describe("isMuralEvent", () => {
  it("reage só a evento do mural", () => {
    expect(isMuralEvent({ entity: "mural", action: "create" })).toBe(true);
    expect(isMuralEvent({ entity: "issue", action: "create" })).toBe(false);
  });
});
