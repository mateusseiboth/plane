/**
 * Catálogo dos endereços que a equipe passa para cliente, candidato e TV.
 *
 * Só CAMINHO relativo, nunca endereço completo: a tela monta o link com a
 * origem de onde ela está aberta. Guardar o endereço aqui faria a equipe copiar
 * "localhost" e mandar para o cliente um link que não abre.
 *
 * Um assunto = uma strategy. Assunto novo é uma entrada a mais em `GRUPOS`.
 * Puro: quem descobre a configuração é `links-uteis.service.ts`.
 */
import { PAINEIS_DA_CHAVE, TITULO_DO_PAINEL } from "@modules/painel-tv/chaves/chave";

/** Trecho que a pessoa preenche (ou escolhe) antes de copiar o link. */
export type TCampoDoLink = {
  rotulo: string;
  exemplo: string;
  /** O link é `prefixo + valor + sufixo`; a tela cuida de escapar o valor. */
  prefixo: string;
  sufixo: string;
  /** Vazio = campo livre. */
  opcoes: { valor: string; rotulo: string }[];
};

export type TCartaoDeLink = {
  chave: string;
  titulo: string;
  /** Para que serve, em uma linha. */
  descricao: string;
  /** Quem pode usar o endereço. */
  quemUsa: string;
  /** Link pronto. Vazio quando o cartão pede um campo ou traz aviso. */
  caminho: string;
  campo: TCampoDoLink | null;
  /** Configuração que falta. Com aviso não há link, para ninguém copiar algo morto. */
  aviso: string | null;
};

export type TGrupoDeLinks = { chave: string; titulo: string; cartoes: TCartaoDeLink[] };

export type TContextoDosLinks = {
  slug: string;
  isInscricaoAberta: boolean;
  isChatLigado: boolean;
  podeAdministrarChat: boolean;
  isAdminDaInstancia: boolean;
  sistemas: { identifier: string; name: string }[];
};

type Contexto = TContextoDosLinks;

type GrupoStrategy = {
  chave: string;
  titulo: string;
  isVisivel: (contexto: Contexto) => boolean;
  buildCartoes: (contexto: Contexto) => TCartaoDeLink[];
};

const TODOS = () => true;

/** Cartão pronto, com link. */
const cartaoComLink = (base: Omit<TCartaoDeLink, "caminho" | "campo" | "aviso">, caminho: string): TCartaoDeLink => ({
  ...base,
  caminho,
  campo: null,
  aviso: null,
});

/** Cartão que só vira link depois que a pessoa escolhe um valor. */
const cartaoComCampo = (
  base: Omit<TCartaoDeLink, "caminho" | "campo" | "aviso">,
  campo: TCampoDoLink
): TCartaoDeLink => ({ ...base, caminho: "", campo, aviso: null });

/** Cartão sem link: falta configuração, e dizer isso vale mais que um link morto. */
const cartaoComAviso = (base: Omit<TCartaoDeLink, "caminho" | "campo" | "aviso">, aviso: string): TCartaoDeLink => ({
  ...base,
  caminho: "",
  campo: null,
  aviso,
});

// ── Para o cliente ──────────────────────────────────────────────────────────

const PORTAL = {
  chave: "portal",
  titulo: "Portal do cliente",
  descricao: "Onde o cliente abre a solicitação e acompanha as que já abriu.",
  quemUsa: "Cliente com conta do portal.",
};

const buildPortal = (contexto: Contexto) => cartaoComLink(PORTAL, `/portal?workspace=${contexto.slug}`);

const CHAT_DO_CLIENTE = {
  chave: "chat-do-cliente",
  titulo: "Chat do cliente",
  descricao: "Janela de atendimento para abrir no navegador ou embutir no sistema do cliente.",
  quemUsa: "Qualquer pessoa do cliente, sem senha.",
};

/** O primeiro impedimento encontrado vira o aviso do cartão do chat. */
const IMPEDIMENTOS_DO_CHAT: { when: (contexto: Contexto) => boolean; aviso: string }[] = [
  {
    when: (contexto) => !contexto.isChatLigado,
    aviso: "O atendimento por chat está desligado. Ligue em Configurações, Atendimento (Chat).",
  },
  {
    when: (contexto) => contexto.sistemas.length === 0,
    aviso: "Cadastre um sistema no espaço para gerar o link do chat.",
  },
];

const readImpedimentoDoChat = (contexto: Contexto) =>
  IMPEDIMENTOS_DO_CHAT.find((impedimento) => impedimento.when(contexto))?.aviso ?? null;

function buildChatDoCliente(contexto: Contexto): TCartaoDeLink {
  const aviso = readImpedimentoDoChat(contexto);
  if (aviso) return cartaoComAviso(CHAT_DO_CLIENTE, aviso);
  return cartaoComCampo(CHAT_DO_CLIENTE, {
    rotulo: "Sistema",
    exemplo: contexto.sistemas[0]!.identifier,
    prefixo: `/chat-api/client?workspace=${contexto.slug}&system=`,
    sufixo: "",
    opcoes: contexto.sistemas.map((s) => ({ valor: s.identifier, rotulo: s.name })),
  });
}

// ── Para candidato ──────────────────────────────────────────────────────────

const TRABALHE_CONOSCO = {
  chave: "trabalhe-conosco",
  titulo: "Trabalhe conosco",
  descricao: "Página pública onde o candidato envia o currículo.",
  quemUsa: "Candidato, sem cadastro.",
};

const AVISO_INSCRICAO_FECHADA = "As inscrições estão desligadas. Para receber currículos, ligue na tela de Currículos.";

const buildTrabalheConosco = (contexto: Contexto): TCartaoDeLink =>
  contexto.isInscricaoAberta
    ? cartaoComLink(TRABALHE_CONOSCO, `/trabalhe-conosco?workspace=${contexto.slug}`)
    : cartaoComAviso(TRABALHE_CONOSCO, AVISO_INSCRICAO_FECHADA);

// ── Painéis de TV ───────────────────────────────────────────────────────────

/**
 * Um cartão por setor que o painel realmente atende. A lista vem do catálogo do
 * painel, então setor novo aparece aqui sozinho e setor que não existe nunca
 * vira link.
 */
const buildPaineis = (contexto: Contexto): TCartaoDeLink[] =>
  PAINEIS_DA_CHAVE.map((painel) =>
    cartaoComLink(
      {
        chave: `painel-${painel}`,
        titulo: TITULO_DO_PAINEL[painel],
        descricao: "Para deixar aberto na TV da sala. Abre com a sua conta, ou com a chave de painel.",
        quemUsa: "Qualquer pessoa do espaço, com login, ou a TV com a chave de painel.",
      },
      `/${contexto.slug}/painel/${painel}`
    )
  );

// ── Integrações ─────────────────────────────────────────────────────────────

const buildZapiWebhook = (contexto: Contexto) =>
  cartaoComLink(
    {
      chave: "zapi-webhook",
      titulo: "Webhook da Z-API",
      descricao: "Endereço que a Z-API chama a cada mensagem do WhatsApp.",
      quemUsa: "Quem administra o chat. Cole no painel da Z-API, junto com o token do provedor.",
    },
    `/chat-api/providers/zapi/webhook/${contexto.slug}/`
  );

const buildFreePbxLigacoes = (contexto: Contexto) =>
  cartaoComLink(
    {
      chave: "freepbx-ligacoes",
      titulo: "Ligações do FreePBX",
      descricao: "Endereço que o FreePBX chama a cada ligação recebida.",
      quemUsa: "Quem administra o chat. Cole na central, junto com o token de serviço.",
    },
    `/chat-api/workspaces/${contexto.slug}/telefonia/ligacoes/`
  );

// ── Internos úteis ──────────────────────────────────────────────────────────

const buildTranscricao = (contexto: Contexto) =>
  cartaoComCampo(
    {
      chave: "transcricao",
      titulo: "Transcrição de um atendimento",
      descricao: "Conversa inteira de um atendimento, pelo número do protocolo.",
      quemUsa: "Equipe do espaço, com login.",
    },
    {
      rotulo: "Protocolo",
      exemplo: "20260922-0007",
      prefixo: `/${contexto.slug}/chat-view/`,
      sufixo: "",
      opcoes: [],
    }
  );

const buildGodMode = () =>
  cartaoComLink(
    {
      chave: "god-mode",
      titulo: "God mode",
      descricao: "Administração da instância, fora do espaço de trabalho.",
      quemUsa: "Administrador da instância.",
    },
    "/god-mode/"
  );

// ── O catálogo ──────────────────────────────────────────────────────────────

const GRUPOS: GrupoStrategy[] = [
  {
    chave: "cliente",
    titulo: "Para o cliente",
    isVisivel: TODOS,
    buildCartoes: (contexto) => [buildPortal(contexto), buildChatDoCliente(contexto)],
  },
  {
    chave: "candidato",
    titulo: "Para candidato",
    isVisivel: TODOS,
    buildCartoes: (contexto) => [buildTrabalheConosco(contexto)],
  },
  {
    chave: "paineis",
    titulo: "Painéis de TV",
    isVisivel: TODOS,
    buildCartoes: buildPaineis,
  },
  {
    chave: "integracoes",
    titulo: "Integrações",
    isVisivel: (contexto) => contexto.podeAdministrarChat,
    buildCartoes: (contexto) => [buildZapiWebhook(contexto), buildFreePbxLigacoes(contexto)],
  },
  {
    chave: "internos",
    titulo: "Internos úteis",
    isVisivel: TODOS,
    buildCartoes: (contexto) => [buildTranscricao(contexto), ...(contexto.isAdminDaInstancia ? [buildGodMode()] : [])],
  },
];

/** Grupos que esta pessoa vê, já com os cartões montados. Grupo vazio não volta. */
export function buildLinksUteis(contexto: TContextoDosLinks): TGrupoDeLinks[] {
  return GRUPOS.filter((grupo) => grupo.isVisivel(contexto))
    .map((grupo) => ({ chave: grupo.chave, titulo: grupo.titulo, cartoes: grupo.buildCartoes(contexto) }))
    .filter((grupo) => grupo.cartoes.length > 0);
}
