/**
 * Upload de plugin com slug já cadastrado. `Plugin.slug` é único na tabela inteira
 * (inclusive as linhas apagadas), então o upload só sabia criar: versão nova de um
 * plugin existente, ou reenvio depois de excluir, estourava a constraint.
 * Regra pura, sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  compareSemver,
  PLUGIN_UPLOAD_ACAO,
  PluginVersionRejectedError,
  resolvePluginUploadAcao,
} from "@utils/plugin-upload";

describe("compareSemver", () => {
  it("compara número a número, não como texto", () => {
    expect(compareSemver("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareSemver("1.9.0", "1.10.0")).toBeLessThan(0);
    expect(compareSemver("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });
});

describe("resolvePluginUploadAcao", () => {
  it("slug novo é cadastro", () => {
    expect(resolvePluginUploadAcao(null, "1.0.0")).toBe(PLUGIN_UPLOAD_ACAO.CREATE);
  });

  it("versão maior de um plugin ativo é atualização", () => {
    expect(resolvePluginUploadAcao({ version: "1.0.0", deletedAt: null }, "1.1.0")).toBe(PLUGIN_UPLOAD_ACAO.UPGRADE);
  });

  it("versão igual é recusada", () => {
    expect(() => resolvePluginUploadAcao({ version: "1.0.0", deletedAt: null }, "1.0.0")).toThrow(
      PluginVersionRejectedError
    );
  });

  it("versão menor é recusada, com a versão atual na mensagem", () => {
    expect(() => resolvePluginUploadAcao({ version: "2.0.0", deletedAt: null }, "1.9.9")).toThrow("2.0.0");
  });

  it("a recusa responde 409", () => {
    const erro = new PluginVersionRejectedError("demo", "1.0.0", "1.0.0");
    expect(erro.status).toBe(409);
  });

  it("plugin excluído aceita reenvio em qualquer versão", () => {
    const excluido = { version: "2.0.0", deletedAt: new Date() };
    expect(resolvePluginUploadAcao(excluido, "1.0.0")).toBe(PLUGIN_UPLOAD_ACAO.REINSTALL);
    expect(resolvePluginUploadAcao(excluido, "2.0.0")).toBe(PLUGIN_UPLOAD_ACAO.REINSTALL);
  });
});
