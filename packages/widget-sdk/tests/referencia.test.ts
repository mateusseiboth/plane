/**
 * A referência da página de desenvolvedores é gerada do código. Estes testes
 * falham quando um export público fica de fora, quando falta JSDoc e quando o
 * `referencia.json` versionado ficou velho (rode `bun run referencia`).
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as sdk from "../src/index";
import { WIDGET_PERMISSIONS } from "../src/contrato";
import { buildReferencia } from "../scripts/gerar-referencia";

const RAIZ = path.resolve(import.meta.dir, "..");
const referencia = buildReferencia();

/** `export type { A, B }` do index, lidos da árvore sintática (independente do gerador). */
function readExportsDeTipo(): string[] {
  const arquivo = path.join(RAIZ, "src/index.ts");
  const fonte = ts.createSourceFile(arquivo, readFileSync(arquivo, "utf8"), ts.ScriptTarget.Latest);
  return fonte.statements
    .filter((s): s is ts.ExportDeclaration => ts.isExportDeclaration(s) && s.isTypeOnly)
    .flatMap((s) => (s.exportClause && ts.isNamedExports(s.exportClause) ? s.exportClause.elements : []))
    .map((e) => e.name.text);
}

const nomesDocumentados = () => [
  ...referencia.funcoes.map((f) => f.nome),
  ...referencia.hooks.map((h) => h.nome),
  ...referencia.apis.map((a) => a.nome),
  ...referencia.tipos.map((t) => t.nome),
  ...referencia.constantes.map((c) => c.nome),
];

describe("cobertura dos exports", () => {
  it("todo export de valor do pacote está na referência", () => {
    const faltando = Object.keys(sdk).filter((nome) => !nomesDocumentados().includes(nome));
    expect(faltando).toEqual([]);
  });

  it("todo export de tipo do pacote está na referência", () => {
    const faltando = readExportsDeTipo().filter((nome) => !nomesDocumentados().includes(nome));
    expect(faltando).toEqual([]);
  });

  it("a lista de exports da referência é exatamente a do pacote", () => {
    const esperado = [...Object.keys(sdk), ...readExportsDeTipo()].toSorted();
    expect(referencia.exports).toEqual(esperado);
  });
});

describe("descrições vindas do JSDoc", () => {
  it("nenhum export fica sem descrição", () => {
    const todos = [
      ...referencia.funcoes,
      ...referencia.hooks,
      ...referencia.apis,
      ...referencia.tipos,
      ...referencia.constantes,
    ];
    expect(todos.filter((item) => !item.descricao).map((item) => item.nome)).toEqual([]);
  });

  it("todo hook e todo método de API tem exemplo, retorno e parâmetros descritos", () => {
    const funcoes = [...referencia.funcoes, ...referencia.hooks, ...referencia.apis.flatMap((a) => a.metodos)];
    const incompletas = funcoes.filter(
      (f) => !f.descricao || !f.exemplo || !f.retorno.tipo || f.parametros.some((p) => !p.descricao)
    );
    expect(incompletas.map((f) => f.nome)).toEqual([]);
  });

  it("todo campo de tipo exportado tem descrição", () => {
    const semDescricao = referencia.tipos.flatMap((t) =>
      t.campos.filter((c) => !c.descricao).map((c) => `${t.nome}.${c.nome}`)
    );
    expect(semDescricao).toEqual([]);
  });

  it("o hook traz a permissão que exige", () => {
    const useWorkerItems = referencia.hooks.find((h) => h.nome === "useWorkerItems");
    expect(useWorkerItems?.permissao).toBe("worker-items.read");
    expect(useWorkerItems?.assinatura).toContain("WorkerItemFilters");
  });
});

describe("manifesto, permissões e contrato", () => {
  it("o manifesto lista os campos de WidgetManifest com o obrigatório certo", () => {
    const campos = Object.fromEntries(referencia.manifesto.campos.map((c) => [c.nome, c.obrigatorio]));
    expect(campos).toEqual({
      name: true,
      version: true,
      author: true,
      entry: true,
      description: false,
      permissions: false,
      title: false,
      defaultSize: false,
    });
  });

  it("cada permissão diz o que libera e quais APIs e hooks a usam", () => {
    expect(referencia.permissoes.map((p) => p.chave)).toEqual(Object.keys(WIDGET_PERMISSIONS));
    const workerItems = referencia.permissoes.find((p) => p.chave === "worker-items.read");
    expect(workerItems?.usadaPor).toEqual(expect.arrayContaining(["workerItemsApi", "useWorkerItems"]));
  });

  it("ciclo de vida, eventos, erros e limites saem do contrato", () => {
    expect(referencia.cicloDeVida.map((e) => e.etapa)).toEqual([
      "envio",
      "carregar",
      "montar",
      "atualizar",
      "desmontar",
    ]);
    expect(referencia.eventos.map((e) => e.nome)).toEqual(["widget:notification", "widget:ui"]);
    expect(referencia.erros.map((e) => e.status)).toContain(403);
    expect(referencia.limites.find((l) => l.nome === "zipMaxBytes")?.valor).toBe(10 * 1024 * 1024);
  });
});

describe("referencia.json versionado", () => {
  it("está igual ao que o gerador produz agora", () => {
    const versionado = JSON.parse(readFileSync(path.join(RAIZ, "referencia.json"), "utf8"));
    expect(versionado).toEqual(referencia);
  });
});
