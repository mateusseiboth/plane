/**
 * Imagem colada no modal de solicitação. O editor guarda o `uploadFile` da
 * PRIMEIRA renderização (só é recriado quando muda `editable`), quando o
 * sistema ainda está vazio: o upload falhava em silêncio para sempre, mesmo
 * depois de escolher o sistema. As funções leem o sistema na hora do upload.
 * Rodar com `bun test core/components/solicitacao`.
 */
import { describe, expect, it, mock } from "bun:test";
import { buildImagensDaSolicitacao } from "@/components/solicitacao/imagens-da-solicitacao";

const montar = (sistemaInicial: string) => {
  let sistema = sistemaInicial;
  const guardados: string[] = [];
  const upload = mock(async ({ projectId }: { projectId: string }) => ({ asset_id: `img-${projectId}` }));
  const duplicate = mock(async ({ projectId }: { projectId: string }) => ({ asset_id: `dup-${projectId}` }));
  const onSemSistema = mock(() => undefined);
  const imagens = buildImagensDaSolicitacao({
    workspaceSlug: "quality",
    readProjectId: () => sistema,
    upload,
    duplicate,
    keepAsset: (id) => guardados.push(id),
    onSemSistema,
  });
  return { imagens, guardados, upload, onSemSistema, escolher: (novo: string) => (sistema = novo) };
};

describe("buildImagensDaSolicitacao", () => {
  it("usa o sistema escolhido DEPOIS de criadas as funções", async () => {
    const { imagens, guardados, escolher } = montar("");
    escolher("p1");
    expect(await imagens.uploadImagem("bloco", new File(["x"], "a.png"))).toBe("img-p1");
    expect(guardados).toEqual(["img-p1"]);
  });

  it("duplicar também lê o sistema atual", async () => {
    const { imagens, escolher } = montar("");
    escolher("p2");
    expect(await imagens.duplicateImagem("a1")).toBe("dup-p2");
  });

  it("sem sistema, avisa na tela e não sobe nada", async () => {
    const { imagens, upload, onSemSistema } = montar("");
    await expect(imagens.uploadImagem("bloco", new File(["x"], "a.png"))).rejects.toThrow(
      "Escolha o sistema antes de colar a imagem."
    );
    expect(onSemSistema).toHaveBeenCalledWith("Escolha o sistema antes de colar a imagem.");
    expect(upload).not.toHaveBeenCalled();
  });
});
