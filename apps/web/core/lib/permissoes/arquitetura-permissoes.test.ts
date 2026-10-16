/**
 * Trava contra regressão: nenhuma decisão de tela sai de lista fixa de nível de
 * papel. Tudo pela matriz de ações (`useMyWorkspaceActions(slug).can`), a mesma
 * que o api-ts confere. Pedido do dono do produto, repetido várias vezes.
 *
 * Uso legítimo (exibir o nome do nível, valor padrão de um convite) não compara
 * nem filtra; se um dia precisar, a linha (ou a de cima) leva
 * `// permissao-estrutural: <motivo>`.
 *
 * Também confere que toda chave de ação citada no web existe no catálogo do
 * backend (`apps/api-ts/src/utils/permissions.ts` e `acoes-do-chat.ts`): um erro
 * de digitação esconderia o botão de todo mundo em silêncio.
 * Rodar com `bun test core/lib/permissoes`.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEB = join(import.meta.dir, "../../..");
const RAIZ = join(WEB, "../..");
const MARCADOR = "permissao-estrutural:";

const PROIBIDOS: { nome: string; padrao: RegExp }[] = [
  { nome: "lista fixa PROJECT_*_ROLES", padrao: /\bPROJECT_(WORK|CONFIG|VIEW|CREATE)_ROLES\b/ },
  { nome: "canPerform(nível, ação)", padrao: /\bcanPerform\(/ },
  { nome: "ROLE_PERMISSIONS por nível", padrao: /\bROLE_PERMISSIONS(_TO_CREATE_PAGE)?\b/ },
  { nome: "allowPermissions por nível", padrao: /\ballowPermissions\(/ },
  {
    nome: "comparação com nível de papel",
    padrao: /[=!]==\s*E(UserPermissions|UserProjectRoles|UserWorkspaceRoles)\.[A-Z_]+/,
  },
  {
    nome: "comparação com nível de papel",
    padrao: /[<>]=?\s*E(UserPermissions|UserProjectRoles|UserWorkspaceRoles)\.[A-Z_]+/,
  },
  {
    nome: "lista de níveis com includes",
    padrao: /\[\s*E(UserPermissions|UserProjectRoles|UserWorkspaceRoles)\.[A-Z_]+[^\]]*\]\s*\.includes\(/,
  },
  { nome: "nível numérico de papel", padrao: /\b(member_role|role)\)?\s*(===|!==|>=|<=|>|<)\s*\d+\b/ },
  {
    nome: "access por nível em item de menu",
    padrao: /\baccess:\s*\[\s*E(UserPermissions|UserProjectRoles|UserWorkspaceRoles)\./,
  },
  {
    nome: "lista de níveis em várias linhas",
    padrao: /^\s*(\.\.\.)?E(UserPermissions|UserProjectRoles|UserWorkspaceRoles)\.[A-Z_]+,?\s*$/,
  },
];

const listFiles = (pasta: string, padrao: string): string[] =>
  Array.from(new Bun.Glob(padrao).scanSync({ cwd: pasta })).map((arquivo) => join(pasta, arquivo));

const ARQUIVOS = [
  ...listFiles(join(WEB, "core"), "**/*.{ts,tsx}"),
  ...listFiles(join(WEB, "ce"), "**/*.{ts,tsx}"),
  ...listFiles(join(WEB, "app"), "**/*.{ts,tsx}"),
  ...listFiles(join(RAIZ, "packages/constants/src"), "**/*.ts"),
].filter((arquivo) => !arquivo.endsWith(".test.ts") && !arquivo.includes("/node_modules/"));

const isMarcada = (linhas: string[], indice: number): boolean =>
  linhas[indice].includes(MARCADOR) || (linhas[indice - 1] ?? "").includes(MARCADOR);

const findViolacoes = (): string[] =>
  ARQUIVOS.flatMap((arquivo) => {
    const linhas = readFileSync(arquivo, "utf8").split("\n");
    return linhas.flatMap((linha, indice) =>
      PROIBIDOS.filter(({ padrao }) => padrao.test(linha) && !isMarcada(linhas, indice)).map(
        ({ nome }) => `${arquivo.replace(RAIZ + "/", "")}:${indice + 1} ${nome}: ${linha.trim()}`
      )
    );
  });

const readCatalogo = (): Set<string> => {
  const fontes = ["apps/api-ts/src/utils/permissions.ts", "apps/api-ts/src/utils/acoes-do-chat.ts"];
  const texto = fontes.map((fonte) => readFileSync(join(RAIZ, fonte), "utf8")).join("\n");
  return new Set(Array.from(texto.matchAll(/key:\s*"([^"]+)"/g), (m) => m[1]));
};

// Chamadas que recebem uma chave do catálogo: can("x"), canInProject("x", ...),
// canDo("x"), isIssue... não (regras puras citam as chaves nos próprios testes).
const CHAMADAS = /\b(?:can|canInProject|canDo|canDoInProject)\(\s*"([a-z_.]+)"/g;
const ACAO_DE_ITEM = /\baction:\s*("([a-z_.]+)"|\[([^\]]*)\])/g;

const findChavesUsadas = (): { chave: string; onde: string }[] =>
  ARQUIVOS.flatMap((arquivo) => {
    const texto = readFileSync(arquivo, "utf8");
    const onde = arquivo.replace(RAIZ + "/", "");
    const diretas = Array.from(texto.matchAll(CHAMADAS), (m) => ({ chave: m[1], onde }));
    const deItens = Array.from(texto.matchAll(ACAO_DE_ITEM)).flatMap((m) =>
      m[2]
        ? [{ chave: m[2], onde }]
        : Array.from((m[3] ?? "").matchAll(/"([a-z_.]+)"/g), (n) => ({ chave: n[1], onde }))
    );
    return diretas.concat(deItens);
  });

describe("web sem lista fixa de nível de papel", () => {
  it("nenhuma decisão de tela compara ou filtra por nível", () => {
    expect(findViolacoes()).toEqual([]);
  });

  it("toda chave de ação citada no web existe no catálogo do backend", () => {
    const catalogo = readCatalogo();
    expect(catalogo.size).toBeGreaterThan(40);
    const desconhecidas = findChavesUsadas().filter(({ chave }) => chave.includes(".") && !catalogo.has(chave));
    expect(desconhecidas).toEqual([]);
  });
});
