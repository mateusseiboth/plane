/**
 * Gera `referencia.json`: a referência completa do SDK, lida do código com o
 * compilador TypeScript. Descrições, parâmetros, retornos e exemplos saem do
 * JSDoc; permissões, limites, ciclo de vida, eventos e erros saem de
 * `src/contrato.ts`. Roda no build do pacote (`node scripts/gerar-referencia.ts`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as contrato from "../src/contrato.ts";
import type {
  TApiDaReferencia,
  TCampoDaReferencia,
  TConstanteDaReferencia,
  TFuncaoDaReferencia,
  TParametroDaReferencia,
  TReferencia,
  TTipoDaReferencia,
} from "./referencia-tipos.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(RAIZ, "src/index.ts");
const SAIDA = path.join(RAIZ, "referencia.json");
const FLAGS_DE_TIPO = ts.TypeFormatFlags.NoTruncation;

/** O JSDoc quebra linha para caber no editor; na página, parágrafo é só linha em branco. */
const joinLinhas = (texto: string) => texto.replace(/([^\n])\n(?!\n)/g, "$1 ").trim();

function createChecker() {
  const { config } = ts.readConfigFile(path.join(RAIZ, "tsconfig.json"), ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, RAIZ);
  const program = ts.createProgram([INDEX], { ...options, noEmit: true });
  const checker = program.getTypeChecker();
  const modulo = checker.getSymbolAtLocation(program.getSourceFile(INDEX)!)!;
  return { checker, exports: checker.getExportsOfModule(modulo) };
}

const readTextoDoComentario = (comentario: ts.JSDoc["comment"] | ts.JSDocTag["comment"]) =>
  (ts.getTextOfJSDocComment(comentario) ?? "").trim();

const readTextoDaTag = (comentario: ts.JSDocTag["comment"]) => joinLinhas(readTextoDoComentario(comentario));

const readTags = (declaracao: ts.Node | undefined, nome: string) =>
  declaracao ? ts.getJSDocTags(declaracao).filter((tag) => tag.tagName.text === nome) : [];

const readTag = (declaracao: ts.Node | undefined, nome: string) =>
  readTags(declaracao, nome).map((tag) => readTextoDaTag(tag.comment))[0] ?? "";

/** O exemplo do JSDoc sem a indentação comum. */
function readExemplo(declaracao: ts.Node | undefined): string {
  const linhas = (readTags(declaracao, "example").map((tag) => readTextoDoComentario(tag.comment))[0] ?? "").split(
    "\n"
  );
  const recuo = Math.min(...linhas.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
  return linhas
    .map((l) => l.slice(Number.isFinite(recuo) ? recuo : 0))
    .join("\n")
    .trim();
}

const readDescricao = (simbolo: ts.Symbol, checker: ts.TypeChecker) =>
  joinLinhas(ts.displayPartsToString(simbolo.getDocumentationComment(checker)));

const readDescricaoDosParametros = (declaracao: ts.Node | undefined): Map<string, string> =>
  new Map(
    (declaracao ? ts.getJSDocTags(declaracao) : [])
      .filter(ts.isJSDocParameterTag)
      .map((tag) => [tag.name.getText(), readTextoDaTag(tag.comment)])
  );

/** O tipo como foi escrito no parâmetro; sem anotação, o que o checker infere. */
function readTipoDoParametro(parametro: ts.Symbol, checker: ts.TypeChecker, local: ts.Node) {
  const declaracao = parametro.valueDeclaration;
  if (declaracao && ts.isParameter(declaracao) && declaracao.type) return declaracao.type.getText();
  return checker.typeToString(checker.getTypeOfSymbolAtLocation(parametro, local), undefined, FLAGS_DE_TIPO);
}

const isOpcional = (parametro: ts.Symbol) => {
  const declaracao = parametro.valueDeclaration;
  return Boolean(declaracao && ts.isParameter(declaracao) && (declaracao.questionToken || declaracao.initializer));
};

/** `<T = unknown>` da função, do método ou da arrow atribuída à propriedade. */
function readParametrosDeTipo(declaracao: ts.Node | undefined): string {
  const funcao = declaracao && ts.isPropertyAssignment(declaracao) ? declaracao.initializer : declaracao;
  const lista = funcao && ts.isFunctionLike(funcao) ? funcao.typeParameters : undefined;
  return lista ? `<${lista.map((p) => p.getText()).join(", ")}>` : "";
}

/** Assinatura como se escreve à mão: `?` no opcional, sem o `| undefined` que o checker acrescenta. */
const buildAssinatura = (
  nome: string,
  declaracao: ts.Node | undefined,
  parametros: TParametroDaReferencia[],
  retorno: string
) =>
  `${nome}${readParametrosDeTipo(declaracao)}(${parametros
    .map((p) => `${p.nome}${p.opcional ? "?" : ""}: ${p.tipo}`)
    .join(", ")}): ${retorno}`;

/** Função, hook ou método: assinatura, parâmetros e retorno pelo checker; textos pelo JSDoc. */
function buildFuncao(
  nome: string,
  simbolo: ts.Symbol,
  checker: ts.TypeChecker,
  permissaoHerdada = ""
): TFuncaoDaReferencia {
  const declaracao = simbolo.valueDeclaration ?? simbolo.declarations?.[0];
  const tipo = checker.getTypeOfSymbolAtLocation(simbolo, declaracao!);
  const [assinatura] = checker.getSignaturesOfType(tipo, ts.SignatureKind.Call);
  const descricoes = readDescricaoDosParametros(declaracao);
  const retorno = checker.typeToString(assinatura.getReturnType(), undefined, FLAGS_DE_TIPO);
  const parametros: TParametroDaReferencia[] = assinatura.getParameters().map((parametro) => ({
    nome: parametro.name,
    tipo: readTipoDoParametro(parametro, checker, declaracao!),
    opcional: isOpcional(parametro),
    descricao: descricoes.get(parametro.name) ?? "",
  }));
  return {
    nome,
    descricao: readDescricao(simbolo, checker),
    assinatura: buildAssinatura(nome, declaracao, parametros, retorno),
    parametros,
    retorno: {
      tipo: retorno,
      descricao: readTag(declaracao, "returns"),
    },
    exemplo: readExemplo(declaracao),
    permissao: readTag(declaracao, "permission") || permissaoHerdada,
  };
}

/** Campo de interface ou de objeto: o tipo como foi escrito na declaração, quando há. */
function buildCampo(propriedade: ts.Symbol, checker: ts.TypeChecker): TCampoDaReferencia {
  const declaracao = propriedade.valueDeclaration ?? propriedade.declarations?.[0];
  const tipoEscrito = declaracao && ts.isPropertySignature(declaracao) ? declaracao.type?.getText() : undefined;
  return {
    nome: propriedade.name,
    tipo: tipoEscrito ?? checker.typeToString(checker.getTypeOfSymbolAtLocation(propriedade, declaracao!)),
    obrigatorio: (propriedade.flags & ts.SymbolFlags.Optional) === 0,
    descricao: readDescricao(propriedade, checker),
  };
}

function buildTipo(nome: string, simbolo: ts.Symbol, checker: ts.TypeChecker): TTipoDaReferencia {
  const declaracao = simbolo.declarations![0];
  const tipo = checker.getDeclaredTypeOfSymbol(simbolo);
  const parametrosDeTipo =
    ts.isInterfaceDeclaration(declaracao) && declaracao.typeParameters
      ? `<${declaracao.typeParameters.map((p) => p.getText()).join(", ")}>`
      : "";
  const definicao = ts.isTypeAliasDeclaration(declaracao)
    ? `type ${nome} = ${declaracao.type.getText()}`
    : `interface ${nome}${parametrosDeTipo}`;
  const valores = tipo.isUnion()
    ? tipo.types.filter((t) => t.isStringLiteral()).map((t) => (t as ts.StringLiteralType).value)
    : [];
  return {
    nome,
    descricao: readDescricao(simbolo, checker),
    definicao,
    campos: ts.isInterfaceDeclaration(declaracao)
      ? checker.getPropertiesOfType(tipo).map((p) => buildCampo(p, checker))
      : [],
    valores,
  };
}

function buildApi(nome: string, simbolo: ts.Symbol, checker: ts.TypeChecker): TApiDaReferencia {
  const declaracao = simbolo.valueDeclaration!;
  const permissao = readTag(declaracao, "permission");
  const tipo = checker.getTypeOfSymbolAtLocation(simbolo, declaracao);
  return {
    nome,
    descricao: readDescricao(simbolo, checker),
    permissao,
    metodos: checker
      .getPropertiesOfType(tipo)
      .map((metodo) => buildFuncao(`${nome}.${metodo.name}`, metodo, checker, permissao)),
  };
}

function buildConstante(nome: string, simbolo: ts.Symbol, checker: ts.TypeChecker): TConstanteDaReferencia {
  const tipo = checker.getTypeOfSymbolAtLocation(simbolo, simbolo.valueDeclaration!);
  return {
    nome,
    descricao: readDescricao(simbolo, checker),
    campos: checker.isArrayLikeType(tipo) ? [] : checker.getPropertiesOfType(tipo).map((p) => buildCampo(p, checker)),
    valor: (contrato as Record<string, unknown>)[nome],
  };
}

type TCategoria = "funcoes" | "hooks" | "apis" | "tipos" | "constantes";

/** Em que seção cada export entra, pela natureza do símbolo e pelo nome. */
const CATEGORIAS: Array<{ categoria: TCategoria; when: (nome: string, simbolo: ts.Symbol) => boolean }> = [
  { categoria: "hooks", when: (nome, s) => (s.flags & ts.SymbolFlags.Function) !== 0 && nome.startsWith("use") },
  { categoria: "funcoes", when: (_, s) => (s.flags & ts.SymbolFlags.Function) !== 0 },
  { categoria: "apis", when: (nome, s) => (s.flags & ts.SymbolFlags.Variable) !== 0 && nome.endsWith("Api") },
  { categoria: "constantes", when: (_, s) => (s.flags & ts.SymbolFlags.Variable) !== 0 },
  { categoria: "tipos", when: (_, s) => (s.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) !== 0 },
];

const BUILDERS = {
  funcoes: buildFuncao,
  hooks: buildFuncao,
  apis: buildApi,
  tipos: buildTipo,
  constantes: buildConstante,
} as const;

function readPacote() {
  const pacote = JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  return { nome: pacote.name as string, versao: pacote.version as string, descricao: pacote.description as string };
}

export function buildReferencia(): TReferencia {
  const { checker, exports } = createChecker();
  const secoes: Pick<TReferencia, TCategoria> = { funcoes: [], hooks: [], apis: [], tipos: [], constantes: [] };

  for (const exportado of exports) {
    const simbolo = exportado.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exportado) : exportado;
    const categoria = CATEGORIAS.find((c) => c.when(exportado.name, simbolo))?.categoria;
    if (!categoria) throw new Error(`Export sem seção na referência: ${exportado.name}`);
    (secoes[categoria] as unknown[]).push(BUILDERS[categoria](exportado.name, simbolo, checker));
  }

  const manifesto = secoes.tipos.find((t) => t.nome === "WidgetManifest")!;
  const manifestoSimbolo = exports.find((e) => e.name === "WidgetManifest")!;
  const limites = secoes.constantes.find((c) => c.nome === "WIDGET_LIMITS")!;
  const chamadas = [...secoes.hooks, ...secoes.apis];

  return {
    pacote: readPacote(),
    exports: exports.map((e) => e.name).toSorted(),
    ...secoes,
    manifesto: {
      descricao: manifesto.descricao,
      campos: manifesto.campos,
      exemplo: readExemplo(checker.getAliasedSymbol(manifestoSimbolo).declarations?.[0]),
    },
    permissoes: Object.entries(contrato.WIDGET_PERMISSIONS).map(([chave, libera]) => ({
      chave,
      libera,
      usadaPor: chamadas.filter((c) => c.permissao === chave).map((c) => c.nome),
    })),
    cicloDeVida: contrato.WIDGET_LIFECYCLE.map((e) => ({ etapa: e.stage, descricao: e.description })),
    eventos: contrato.WIDGET_EVENTS.map((e) => ({
      nome: e.name,
      origem: e.origin,
      payload: e.payload,
      descricao: e.description,
    })),
    erros: contrato.GATEWAY_ERRORS.map((e) => ({ status: e.status, quando: e.when })),
    limites: limites.campos.map((campo) => ({
      nome: campo.nome,
      valor: contrato.WIDGET_LIMITS[campo.nome as keyof typeof contrato.WIDGET_LIMITS],
      descricao: campo.descricao,
    })),
  };
}

export function saveReferencia(destino = SAIDA) {
  writeFileSync(destino, `${JSON.stringify(buildReferencia(), null, 2)}\n`);
  return destino;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`referência gerada em ${saveReferencia()}`);
}
