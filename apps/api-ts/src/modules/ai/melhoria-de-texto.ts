/**
 * "Melhorar com IA" — quem melhora o texto, e como.
 *
 * O botão existe na caixa de comentário e na descrição do chamado. Ele tinha um
 * caminho só: o provedor cadastrado pelo espaço de trabalho (`AiProvider`). Quem
 * nunca cadastrou nenhum via a mensagem "Nenhum provedor de IA configurado" e o
 * botão não servia para nada — embora o Avião já falasse com uma IA que entende
 * de levantamento de requisitos.
 *
 * Agora são dois caminhos, escolhidos **nesta ordem**:
 *
 *  1. **`AiProvider` do espaço** — quem cadastrou um modelo grande continua com
 *     ele, com o mesmo prompt de sempre. Nada muda para quem já usava.
 *  2. **IA de requisitos** (`@modules/ia-requisitos`) — o provedor trocável do
 *     contrato. Aqui a metodologia da Aula 18-3 não vai no prompt: quem sabe
 *     melhorar como requisito é o próprio serviço, então saem daqui apenas o
 *     texto e o contexto do chamado.
 *  3. Nenhum dos dois: a rota volta a dizer que não há provedor configurado.
 *
 * Cada caminho é uma estratégia na lista `ESTRATEGIAS`; a primeira que aceitar o
 * pedido leva. Acrescentar uma terceira fonte é uma função e uma linha na lista
 * — a rota não conhece nenhuma delas.
 */

import prisma from "@db";
import {chatComplete, hostDoProvedor, type ChatMsg} from "@modules/ai/cliente-de-chat";
import {configIaRequisitos} from "@modules/ia-requisitos/config";
import {configDoEspaco} from "@modules/ia-requisitos/configuracao-do-espaco";
import {montarContexto, type ContextoInformado} from "@modules/ia-requisitos/contexto";
import {criarProvedor} from "@modules/ia-requisitos/provedores";
import type {CampoMelhoria, ContextoIa} from "@modules/ia-requisitos/tipos";

/** O que a tela manda em `context` — tudo opcional, nada garantido. */
export type ContextoDaTela = {
  issue_title?: unknown;
  project_name?: unknown;
  status?: unknown;
  priority?: unknown;
  assignees?: unknown;
  previous_comments?: unknown;
};

export type PedidoDeMelhoria = {
  workspaceId: string;
  campo: CampoMelhoria;
  /** O HTML que veio do editor, como veio. */
  html: string;
  daTela: ContextoDaTela;
  /** Só quando a tela souber — hoje o botão manda apenas o texto. */
  projectId: string | null;
  issueId: string | null;
};

/**
 * Quem vai melhorar o texto, já escolhido.
 *
 * `melhorar()` devolve o HTML pronto para o editor, ou `""` quando o serviço não
 * entregou nada de útil. Exceção de rede continua subindo: quem clicou está
 * esperando e merece saber que a IA falhou, em vez de ver o texto intacto e um
 * aviso de sucesso.
 */
export type Melhorador = {
  /** O que vai para a trilha LGPD: de onde saiu, para onde foi e quanto. */
  trilha: Record<string, unknown>;
  melhorar: () => Promise<string>;
};

type EstrategiaDeMelhoria = (pedido: PedidoDeMelhoria) => Promise<Melhorador | null>;

// ── O texto que sai e o texto que volta ──────────────────────────────────────

function comoTexto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function listaDeTexto(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((i): i is string => typeof i === "string" && Boolean(i.trim()));
}

function semHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O editor só entende HTML. Modelo que respondeu texto puro vira parágrafos —
 * é a mesma conversão que a rota fazia antes de existir mais de um caminho.
 */
export function emHtml(texto: string): string {
  const limpo = texto.trim();
  if (limpo.startsWith("<")) return limpo;
  return (
    limpo
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, "<br>").trim()}</p>`)
      .filter((p) => p !== "<p></p>")
      .join("") || "<p></p>"
  );
}

// ── Caminho 1: o provedor cadastrado pelo espaço ─────────────────────────────

// ~4 chars/token for pt-BR; keep the whole request within ~4k tokens.
const CHARS_PER_TOKEN = 4;
const TOKEN_BUDGET = 3800;

/**
 * O prompt do provedor cadastrado, palavra por palavra como estava na rota.
 * Ele foi escrito com cuidado para um modelo genérico e continua valendo para
 * ele — o caminho da IA de requisitos não usa nada disto.
 */
function mensagensDoProvedor(inputHtml: string, ctx: ContextoDaTela) {
  const plainText = semHtml(inputHtml);

  const sysLines: string[] = [
    "Você é um revisor de texto especializado em comunicação técnica da empresa Quality Sistemas.",
    "Seu trabalho é reescrever o texto do usuário de forma mais clara, profissional, bem estruturada e compreensível.",
    "REGRAS OBRIGATÓRIAS:",
    "1. REESCREVA o texto mantendo TODAS as informações técnicas originais (nomes de telas, caminhos, versões, erros, passos).",
    "2. NUNCA remova informações técnicas do texto original.",
    "3. Corrija erros de português (ortografia, concordância, acentuação).",
    "4. Organize o texto em parágrafos claros. Use listas quando houver passos ou itens.",
    "5. Use linguagem profissional, porém acessível (não use palavras rebuscadas desnecessariamente).",
    "6. Se o texto original menciona código, caminhos de arquivos ou comandos, mantenha-os EXATAMENTE como estão.",
    "7. Quando o texto usar termos técnicos (ex: banco de dados, API, servidor, cache, deploy, backup), adicione uma breve explicação entre parênteses para leigos.",
    "8. Você PODE e DEVE adicionar informações complementares e explicações relevantes ao contexto; sinalize essas adições naturalmente.",
    "9. Se o texto for vago ou incompleto, tente detalhar com base no contexto e histórico do chamado.",
    "10. Responda EXCLUSIVAMENTE com o texto reescrito. Sem prefácios, explicações, cumprimentos ou comentários.",
    "11. NÃO comece com 'Aqui está', 'Segue', 'Claro' ou qualquer introdução; comece direto com o texto melhorado.",
    "12. Se o texto for muito curto (1-2 frases), corrija e melhore a clareza; você pode expandir com explicações úteis se fizer sentido.",
    "13. Use HTML para formatação (negrito <strong>, listas <ul>/<ol>, parágrafos <p>); NÃO use Markdown.",
    "14. Você pode adicionar contexto adicional, referências a comentários anteriores e informações complementares relevantes; sempre sinalize claramente quando fizer essas adições.",
    "CONTEXTO (use apenas para entender o assunto, NÃO inclua no resultado):",
    "- Este texto é uma mensagem de um chamado (ticket de suporte) da empresa.",
  ];
  if (ctx.project_name) sysLines.push(`Sistema/Projeto: ${ctx.project_name}`);
  if (ctx.issue_title) sysLines.push(`Título: ${ctx.issue_title}`);
  if (ctx.status) sysLines.push(`Status: ${ctx.status}`);
  if (ctx.priority) sysLines.push(`Prioridade: ${ctx.priority}`);
  if (Array.isArray(ctx.assignees) && ctx.assignees.length) sysLines.push(`Responsáveis: ${ctx.assignees.join(", ")}`);
  let system = sysLines.join("\n");

  const prevComments = listaDeTexto(ctx.previous_comments);
  const picked: string[] = [];
  if (prevComments.length) {
    const budgetForComments = Math.floor((TOKEN_BUDGET * CHARS_PER_TOKEN - system.length) * 0.35);
    let used = 0;
    for (const c of prevComments) {
      const line = `- ${c}`;
      if (used + line.length > budgetForComments) break;
      picked.push(line);
      used += line.length;
    }
    if (picked.length) system += `\nComentários/interações anteriores (mais recente primeiro):\n${picked.join("\n")}`;
  }

  const remaining = TOKEN_BUDGET * CHARS_PER_TOKEN - system.length - 300;
  const truncatedText = plainText.slice(0, Math.max(200, remaining));
  const userMessage =
    `Melhore o seguinte texto: corrija erros ortográficos/gramaticais e melhore a clareza e o profissionalismo, ` +
    `mantendo o mesmo significado e idioma. Adapte o resultado como um comentário apropriado para adicionar ao chamado. ` +
    `Considere que o conteúdo do usuário pode incluir contexto adicional e referências a comentários anteriores; use-os para ajustar tom e detalhes e você PODE adicionar referências/contexto sinalizados quando relevante. ` +
    `Retorne APENAS o texto melhorado em HTML, sem explicações:\n\n${truncatedText}`;

  const mensagens: ChatMsg[] = [
    {role: "system", content: system},
    {role: "user", content: userMessage},
  ];
  return {mensagens, comentariosEnviados: picked.length, caracteresEnviados: truncatedText.length};
}

const comProvedorCadastrado: EstrategiaDeMelhoria = async (pedido) => {
  const provider = await prisma.aiProvider.findFirst({
    where: {workspaceId: pedido.workspaceId, isDefault: true, isActive: true, deletedAt: null},
  });
  if (!provider) return null;

  const {mensagens, comentariosEnviados, caracteresEnviados} = mensagensDoProvedor(pedido.html, pedido.daTela);
  return {
    trilha: trilhaDaMelhoria({
      pedido,
      servico: "ai-provider",
      formato: provider.providerType,
      destino: hostDoProvedor(provider),
      caracteresEnviados,
      comentariosEnviados,
    }),
    // Sem rede de proteção de propósito: é exatamente o que a rota fazia antes,
    // inclusive o "<p></p>" de um modelo que respondeu vazio.
    melhorar: async () => emHtml(await chatComplete(provider, mensagens, {temperature: 0.7, maxTokens: 2048})),
  };
};

// ── Caminho 2: a IA de levantamento de requisitos ────────────────────────────

/**
 * O que a tela sabe, no vocabulário do contexto do contrato.
 *
 * Os comentários chegam do mais recente para o mais antigo (é como a tela os
 * lista) e o contexto os quer em ordem cronológica — daí o `reverse`, sem o
 * qual o corte pelos "últimos" guardaria justamente os mais velhos.
 */
function comoContextoInformado(daTela: ContextoDaTela): ContextoInformado {
  return {
    titulo: daTela.issue_title,
    projeto: daTela.project_name,
    comentarios: listaDeTexto(daTela.previous_comments).reverse(),
  };
}

const comIaDeRequisitos: EstrategiaDeMelhoria = async (pedido) => {
  // Recurso desligado no servidor, ou formato de provedor inexistente.
  const cfg = configIaRequisitos();
  const provedor = cfg.ligada ? criarProvedor(cfg) : null;
  if (!provedor) return null;

  // O espaço de trabalho pode ter desligado só isto.
  const doEspaco = await configDoEspaco(pedido.workspaceId);
  if (!doEspaco.melhoria_ativa) return null;

  const contexto = await montarContexto({
    workspaceId: pedido.workspaceId,
    projectId: pedido.projectId,
    issueId: pedido.issueId,
    informado: comoContextoInformado(pedido.daTela),
    campo: pedido.campo,
    cfg,
  });

  return {
    trilha: trilhaDaMelhoria({
      pedido,
      servico: "ia-requisitos",
      formato: provedor.formato,
      destino: cfg.destino,
      caracteresEnviados: pedido.html.length,
      contexto,
    }),
    melhorar: async () => {
      // O provedor não lança: serviço fora do ar, tempo estourado ou resposta
      // imprestável viram texto vazio, e quem chamou decide o que dizer.
      const melhoria = await provedor.melhorar({texto: pedido.html, campo: pedido.campo, contexto});
      return melhoria.texto ? emHtml(melhoria.texto) : "";
    },
  };
};

// ── A escolha ────────────────────────────────────────────────────────────────

const ESTRATEGIAS: EstrategiaDeMelhoria[] = [comProvedorCadastrado, comIaDeRequisitos];

/** A primeira estratégia que aceitar o pedido leva; `null` é "não há provedor". */
export async function escolherMelhorador(pedido: PedidoDeMelhoria): Promise<Melhorador | null> {
  for (const estrategia of ESTRATEGIAS) {
    const melhorador = await estrategia(pedido);
    if (melhorador) return melhorador;
  }
  return null;
}

// ── Trilha LGPD ──────────────────────────────────────────────────────────────

/** O que saiu da aplicação, contado — nunca copiado — para a trilha. */
function trilhaDaMelhoria(opcoes: {
  pedido: PedidoDeMelhoria;
  servico: string;
  formato: string;
  destino: string;
  caracteresEnviados: number;
  comentariosEnviados?: number;
  contexto?: ContextoIa;
}): Record<string, unknown> {
  const anexos = opcoes.contexto?.anexos ?? [];
  return {
    servico: opcoes.servico,
    operacao: "melhoria",
    formato: opcoes.formato,
    destino: opcoes.destino,
    campo: opcoes.pedido.campo,
    projeto_id: opcoes.pedido.projectId,
    chamado_id: opcoes.pedido.issueId,
    caracteres_enviados: opcoes.caracteresEnviados,
    comentarios_enviados: opcoes.comentariosEnviados ?? opcoes.contexto?.comentarios.length ?? 0,
    anexos_enviados: anexos.length,
    anexos_com_texto: anexos.filter((a) => a.texto_extraido).length,
  };
}
