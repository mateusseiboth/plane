/**
 * Catálogo de "Links úteis": quais cartões cada pessoa vê, o caminho de cada um
 * e o aviso que substitui o link quando falta configuração. Puro, sem banco.
 */
import { describe, expect, it } from "bun:test";
import { buildLinksUteis, type TContextoDosLinks } from "@modules/links-uteis/links-uteis";
import { SETORES_DO_PAINEL } from "@modules/reports/painel-tv/painel-tv";

const CONTEXTO: TContextoDosLinks = {
  slug: "quality",
  isInscricaoAberta: true,
  isChatLigado: true,
  podeAdministrarChat: false,
  isAdminDaInstancia: false,
  sistemas: [
    { identifier: "SIART", name: "SIART" },
    { identifier: "ALMOXA", name: "Almoxarifado" },
  ],
};

const contextoCom = (mudancas: Partial<TContextoDosLinks>) => ({ ...CONTEXTO, ...mudancas });

const grupos = (contexto: TContextoDosLinks) => buildLinksUteis(contexto);

const grupo = (contexto: TContextoDosLinks, chave: string) => grupos(contexto).find((g) => g.chave === chave);

const cartao = (contexto: TContextoDosLinks, chaveDoGrupo: string, chaveDoCartao: string) =>
  grupo(contexto, chaveDoGrupo)?.cartoes.find((c) => c.chave === chaveDoCartao);

describe("buildLinksUteis: os caminhos", () => {
  it("o portal do cliente leva o espaço na query", () => {
    expect(cartao(CONTEXTO, "cliente", "portal")).toMatchObject({
      titulo: "Portal do cliente",
      caminho: "/portal?workspace=quality",
      aviso: null,
    });
  });

  it("o chat do cliente pede o sistema e oferece os sistemas do espaço", () => {
    const chat = cartao(CONTEXTO, "cliente", "chat-do-cliente");
    expect(chat?.aviso).toBeNull();
    expect(chat?.campo).toEqual({
      rotulo: "Sistema",
      exemplo: "SIART",
      prefixo: "/chat-api/client?workspace=quality&system=",
      sufixo: "",
      opcoes: [
        { valor: "SIART", rotulo: "SIART" },
        { valor: "ALMOXA", rotulo: "Almoxarifado" },
      ],
    });
  });

  it("trabalhe conosco leva o espaço na query", () => {
    expect(cartao(CONTEXTO, "candidato", "trabalhe-conosco")).toMatchObject({
      caminho: "/trabalhe-conosco?workspace=quality",
      aviso: null,
    });
  });

  it("a transcrição é montada pelo protocolo", () => {
    expect(cartao(CONTEXTO, "internos", "transcricao")?.campo).toMatchObject({
      rotulo: "Protocolo",
      prefixo: "/quality/chat-view/",
      sufixo: "",
      opcoes: [],
    });
  });

  it("todo cartão diz para que serve e quem pode usar", () => {
    const cartoes = grupos(contextoCom({ podeAdministrarChat: true, isAdminDaInstancia: true })).flatMap(
      (g) => g.cartoes
    );
    expect(cartoes.length).toBeGreaterThan(0);
    for (const c of cartoes) {
      expect(c.descricao.length).toBeGreaterThan(0);
      expect(c.quemUsa.length).toBeGreaterThan(0);
    }
  });

  it("nenhum texto de tela leva travessão", () => {
    const visiveis = grupos(contextoCom({ isChatLigado: false, isInscricaoAberta: false, sistemas: [] }));
    const textos = visiveis
      .map((g) => g.titulo)
      .concat(visiveis.flatMap((g) => g.cartoes).flatMap((c) => [c.titulo, c.descricao, c.quemUsa, c.aviso ?? ""]));
    expect(textos.filter((t) => t.includes("—"))).toEqual([]);
  });

  it("nenhum caminho carrega origem: o link é montado na tela", () => {
    const caminhos = grupos(contextoCom({ podeAdministrarChat: true, isAdminDaInstancia: true })).flatMap((g) =>
      g.cartoes.flatMap((c) => [c.caminho, c.campo?.prefixo ?? ""])
    );
    expect(caminhos.filter((c) => c.includes("http") || c.includes("localhost"))).toEqual([]);
  });
});

describe("buildLinksUteis: configuração ausente vira aviso, nunca link quebrado", () => {
  it("inscrição desligada troca o link do trabalhe conosco por um aviso", () => {
    const vaga = cartao(contextoCom({ isInscricaoAberta: false }), "candidato", "trabalhe-conosco");
    expect(vaga?.caminho).toBe("");
    expect(vaga?.aviso).toBe("As inscrições estão desligadas. Para receber currículos, ligue na tela de Currículos.");
  });

  it("chat desligado troca o link do chat do cliente por um aviso", () => {
    const chat = cartao(contextoCom({ isChatLigado: false }), "cliente", "chat-do-cliente");
    expect(chat?.campo).toBeNull();
    expect(chat?.aviso).toBe("O atendimento por chat está desligado. Ligue em Configurações, Atendimento (Chat).");
  });

  it("espaço sem sistema cadastrado não gera link de chat", () => {
    const chat = cartao(contextoCom({ sistemas: [] }), "cliente", "chat-do-cliente");
    expect(chat?.campo).toBeNull();
    expect(chat?.aviso).toBe("Cadastre um sistema no espaço para gerar o link do chat.");
  });

  it("o portal continua valendo mesmo com o chat desligado", () => {
    expect(cartao(contextoCom({ isChatLigado: false }), "cliente", "portal")?.aviso).toBeNull();
  });
});

describe("buildLinksUteis: quem vê o quê", () => {
  it("membro comum não vê integrações nem god mode", () => {
    expect(grupo(CONTEXTO, "integracoes")).toBeUndefined();
    expect(cartao(CONTEXTO, "internos", "god-mode")).toBeUndefined();
  });

  it("quem administra o chat vê o webhook da Z-API e a rota do FreePBX", () => {
    const comChat = contextoCom({ podeAdministrarChat: true });
    expect(cartao(comChat, "integracoes", "zapi-webhook")?.caminho).toBe("/chat-api/providers/zapi/webhook/quality/");
    expect(cartao(comChat, "integracoes", "freepbx-ligacoes")?.caminho).toBe(
      "/chat-api/workspaces/quality/telefonia/ligacoes/"
    );
  });

  it("god mode só para o administrador da instância", () => {
    expect(cartao(contextoCom({ isAdminDaInstancia: true }), "internos", "god-mode")?.caminho).toBe("/god-mode/");
  });
});

describe("buildLinksUteis: painéis de TV", () => {
  it("um cartão por painel que EXISTE, lido do catálogo do painel", () => {
    expect(grupo(CONTEXTO, "paineis")?.cartoes.map((c) => c.caminho)).toEqual(
      SETORES_DO_PAINEL.map((setor) => `/quality/painel/${setor}`)
    );
  });

  it("os painéis de hoje são o do TI e o da Qualidade, com o título do próprio painel", () => {
    expect(grupo(CONTEXTO, "paineis")?.cartoes.map((c) => [c.chave, c.titulo])).toEqual([
      ["painel-ti", "Painel do TI"],
      ["painel-qualidade", "Painel da Qualidade"],
    ]);
  });
});
