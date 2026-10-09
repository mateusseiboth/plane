/**
 * A página de desenvolvedores mostra permissões e limites a partir do
 * `referencia.json` do SDK (gerado de packages/widget-sdk/src/contrato.ts).
 * Este teste reprova quando a validação do servidor muda e a documentação não.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ENVIOS_POR_MINUTO } from "@modules/widget/widget.rules";
import { PAGINA_DO_GATEWAY } from "@utils/sdk-gateway-data";
import { validateManifest, VALID_PERMISSIONS } from "@utils/widget-manifest";
import { LIMITES_DO_PACOTE } from "@utils/widget-zip";

const REFERENCIA = path.resolve(import.meta.dir, "../../../../packages/widget-sdk/referencia.json");
const referencia = JSON.parse(readFileSync(REFERENCIA, "utf8")) as {
  permissoes: Array<{ chave: string }>;
  limites: Array<{ nome: string; valor: number | string }>;
};
const limite = (nome: string) => referencia.limites.find((l) => l.nome === nome)?.valor;

describe("contrato do SDK de widgets x validação do servidor", () => {
  it("as permissões documentadas são as aceitas no manifesto", () => {
    expect(referencia.permissoes.map((p) => p.chave).toSorted()).toEqual([...VALID_PERMISSIONS].toSorted());
  });

  it("os tamanhos máximos do zip e do bundle são os do servidor", () => {
    expect(limite("zipMaxBytes")).toBe(LIMITES_DO_PACOTE.zipMaxBytes);
    expect(limite("bundleMaxBytes")).toBe(LIMITES_DO_PACOTE.bundleMaxBytes);
  });

  it("o título é cortado no tamanho documentado", () => {
    const manifesto = validateManifest({
      name: "x",
      version: "1.0.0",
      author: "y",
      entry: "widget.js",
      title: "t".repeat(500),
    });
    expect(manifesto.title?.length).toBe(Number(limite("titleMaxLength")));
  });

  it("o formato de versão documentado é o validado", () => {
    expect(() => validateManifest({ name: "x", version: "1.0", author: "y", entry: "w.js" })).toThrow();
    expect(new RegExp(String(limite("versionPattern"))).test("1.0")).toBe(false);
    expect(new RegExp(String(limite("versionPattern"))).test("10.2.33")).toBe(true);
  });

  it("envios por minuto e paginação do gateway batem com a referência", () => {
    expect(limite("uploadsPerMinute")).toBe(ENVIOS_POR_MINUTO);
    expect(limite("pageSizeDefault")).toBe(PAGINA_DO_GATEWAY.padrao);
    expect(limite("pageSizeMax")).toBe(PAGINA_DO_GATEWAY.maximo);
  });
});
