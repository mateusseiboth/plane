/**
 * Regras de tela do disparo em massa: rótulos de situação, filtros que vão à
 * API, formulário da mensagem, descrição dos filtros e progresso. Puro.
 * Rodar com `bun test core/components/chat/disparo`.
 */
import { describe, expect, it } from "bun:test";
import {
  ABAS_DO_DISPARO,
  buildFiltrosDoEnvio,
  buildFormDaMensagem,
  describeFiltros,
  getProgresso,
  isImagem,
  statusDoItemLabel,
  statusDoEnvioLabel,
} from "@/components/chat/disparo/disparo-helpers";

describe("abas", () => {
  it("são as cinco da tela, na ordem", () => {
    expect(ABAS_DO_DISPARO.map((a) => a.label)).toEqual([
      "Mensagens",
      "Enviar",
      "Histórico",
      "Fila Z-API",
      "Configuração",
    ]);
  });
});

describe("rótulos", () => {
  it("situação do telefone e do envio em português", () => {
    expect(statusDoItemLabel("enviado")).toBe("Enviado");
    expect(statusDoItemLabel("falhou")).toBe("Falhou");
    expect(statusDoItemLabel("pendente")).toBe("Na fila");
    expect(statusDoItemLabel("xyz")).toBe("xyz");
    expect(statusDoEnvioLabel("em_andamento")).toBe("Enviando");
    expect(statusDoEnvioLabel("concluida")).toBe("Concluído");
    expect(statusDoEnvioLabel("cancelada")).toBe("Cancelado");
  });
});

describe("buildFiltrosDoEnvio", () => {
  it("só manda o filtro escolhido", () => {
    expect(buildFiltrosDoEnvio({ entityType: null, entityId: "", projectId: "" })).toEqual({});
    expect(buildFiltrosDoEnvio({ entityType: 0, entityId: "e1", projectId: "p1" })).toEqual({
      entity_type: 0,
      entity_id: "e1",
      project_id: "p1",
    });
  });
});

describe("buildFormDaMensagem", () => {
  it("leva título, texto e arquivo", () => {
    const arquivo = new File(["x"], "a.png", { type: "image/png" });
    const form = buildFormDaMensagem({ titulo: "Aviso", texto: "Oi", arquivo, removerArquivo: false });
    expect(form.get("titulo")).toBe("Aviso");
    expect(form.get("texto")).toBe("Oi");
    expect((form.get("arquivo") as File).name).toBe("a.png");
    expect(form.get("remover_arquivo")).toBeNull();
  });

  it("pede para remover o arquivo só quando não há outro", () => {
    const form = buildFormDaMensagem({ titulo: "Aviso", texto: "", arquivo: null, removerArquivo: true });
    expect(form.get("remover_arquivo")).toBe("true");
    expect(form.get("arquivo")).toBeNull();
  });
});

describe("describeFiltros", () => {
  const nomes = { tipos: { 1: "Câmara" }, entidades: { e1: "Prefeitura de Campo Grande" }, sistemas: { p1: "SIART" } };

  it("sem filtro, é todo mundo", () => {
    expect(describeFiltros({}, nomes)).toBe("Todos os responsáveis");
  });

  it("junta tipo, entidade e sistema", () => {
    expect(describeFiltros({ entity_type: 1, entity_id: "e1", project_id: "p1" }, nomes)).toBe(
      "Câmara · Prefeitura de Campo Grande · SIART"
    );
  });
});

describe("progresso e arquivo", () => {
  it("percentual do que já foi tentado", () => {
    expect(getProgresso({ total: 4, pendente: 1, processando: 0, enviado: 2, falhou: 1, cancelado: 0 })).toBe(75);
    expect(getProgresso({ total: 0, pendente: 0, processando: 0, enviado: 0, falhou: 0, cancelado: 0 })).toBe(100);
  });

  it("reconhece imagem pelo tipo", () => {
    expect(isImagem("image/png")).toBe(true);
    expect(isImagem("application/pdf")).toBe(false);
    expect(isImagem(null)).toBe(false);
  });
});
