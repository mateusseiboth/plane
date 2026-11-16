/**
 * O modal de solicitação (o mesmo pela conversa do chat e pelo botão "Nova
 * solicitação"): o que ele manda para a API e o que falta para enviar.
 */
import { describe, expect, it } from "bun:test";
import {
  buildPedidoDaSolicitacao,
  findPendenciaDaSolicitacao,
  readErroDoCampoDaSolicitacao,
  type FormularioDaSolicitacao,
} from "@/components/solicitacao/formulario-da-solicitacao";

const FORMULARIO: FormularioDaSolicitacao = {
  projectId: "p1",
  titulo: "  Guia não emite  ",
  moduloId: "",
  entidadeId: "",
  complementoHtml: "<p></p>",
  clienteParado: false,
  assetIds: [],
};

describe("buildPedidoDaSolicitacao", () => {
  it("manda título limpo, prioridade nenhuma e sem entidade quando nada foi escolhido", () => {
    expect(buildPedidoDaSolicitacao(FORMULARIO)).toEqual({
      projectId: "p1",
      dados: { name: "Guia não emite", priority: "none", entity_id: null },
      assetIds: [],
    });
  });

  it("as imagens coladas no complemento vão como arquivos para vincular ao chamado", () => {
    const pedido = buildPedidoDaSolicitacao({ ...FORMULARIO, assetIds: ["a1", "a2"] });
    expect(pedido.assetIds).toEqual(["a1", "a2"]);
  });

  it("cliente parado vira prioridade urgente", () => {
    expect(buildPedidoDaSolicitacao({ ...FORMULARIO, clienteParado: true }).dados.priority).toBe("urgent");
  });

  it("leva módulo, entidade e o complemento rico quando preenchidos", () => {
    const pedido = buildPedidoDaSolicitacao({
      ...FORMULARIO,
      moduloId: "m1",
      entidadeId: "e1",
      complementoHtml: "<p>Versão <strong>3</strong></p>",
    });
    expect(pedido.dados).toEqual({
      name: "Guia não emite",
      priority: "none",
      module_id: "m1",
      entity_id: "e1",
      description_html: "<p>Versão <strong>3</strong></p>",
    });
  });

  it("complemento só com espaços não vai", () => {
    expect(buildPedidoDaSolicitacao({ ...FORMULARIO, complementoHtml: "<p> </p>" }).dados).not.toHaveProperty(
      "description_html"
    );
  });
});

describe("findPendenciaDaSolicitacao", () => {
  const COMPLETO = { ...FORMULARIO, entidadeId: "e1", complementoHtml: "<p>Erro ao emitir.</p>" };
  const AVULSA = { isDescricaoObrigatoria: true };
  const PELO_CHAT = { isDescricaoObrigatoria: false };

  it("sem sistema pede o sistema", () => {
    expect(findPendenciaDaSolicitacao({ ...COMPLETO, projectId: "" }, AVULSA)).toBe("Escolha o sistema.");
  });

  it("sem título pede o título", () => {
    expect(findPendenciaDaSolicitacao({ ...COMPLETO, titulo: "  " }, AVULSA)).toBe("Informe o título.");
  });

  it("sem entidade pede a entidade, pela conversa também", () => {
    expect(findPendenciaDaSolicitacao({ ...COMPLETO, entidadeId: "" }, AVULSA)).toBe("Escolha a entidade.");
    expect(findPendenciaDaSolicitacao({ ...COMPLETO, entidadeId: "" }, PELO_CHAT)).toBe("Escolha a entidade.");
  });

  it("na avulsa, descrição vazia pede o problema do cliente", () => {
    for (const vazia of ["<p></p>", "<p> </p><p><br></p>", "<p>&nbsp;</p>"]) {
      expect(findPendenciaDaSolicitacao({ ...COMPLETO, complementoHtml: vazia }, AVULSA)).toBe(
        "Descreva o problema do cliente."
      );
    }
  });

  it("imagem colada conta como descrição", () => {
    const comImagem = { ...COMPLETO, complementoHtml: '<image-component src="a1"></image-component>' };
    expect(findPendenciaDaSolicitacao(comImagem, AVULSA)).toBeUndefined();
  });

  it("pela conversa a descrição é a transcrição: não é exigida", () => {
    expect(findPendenciaDaSolicitacao({ ...COMPLETO, complementoHtml: "<p></p>" }, PELO_CHAT)).toBeUndefined();
  });

  it("com tudo preenchido, nada falta", () => {
    expect(findPendenciaDaSolicitacao(COMPLETO, AVULSA)).toBeUndefined();
  });
});

describe("readErroDoCampoDaSolicitacao", () => {
  it("devolve a mensagem do campo recusado pela API", () => {
    const erros = [{ path: "entity_id", message: "A entidade não foi encontrada neste espaço." }];
    expect(readErroDoCampoDaSolicitacao(erros, "entity_id")).toBe("A entidade não foi encontrada neste espaço.");
    expect(readErroDoCampoDaSolicitacao(erros, "module_id")).toBeUndefined();
  });
});
