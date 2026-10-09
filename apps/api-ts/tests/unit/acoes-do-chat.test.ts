/**
 * O módulo do chat registra as próprias ações na matriz de permissões
 * (`@utils/acoes-do-chat`): uma ação por botão que importa, para o admin dizer
 * na tela de Funções quais grupos transferem, encerram, veem a fila etc. O
 * catálogo incorpora a lista; `chat.gerenciar` e `chat.administrar` eram as
 * ações grossas de antes e saíram (a migração converte o que estava gravado).
 */
import { describe, expect, it } from "bun:test";
import { ACOES_DO_CHAT, GRUPO_DO_CHAT } from "@utils/acoes-do-chat";
import { ACTION_CATALOG, ALL_ACTIONS, DEFAULT_ROLES, type EProjectAction, isKnownAction } from "@utils/permissions";

const donosDe = (acao: string): string[] =>
  DEFAULT_ROLES.filter((r) => r.permissions.includes(acao as EProjectAction))
    .map((r) => r.key)
    .sort();

const CHAVES: string[] = Object.values(ACOES_DO_CHAT).map((a) => a.key);

describe("ações do chat", () => {
  it("o módulo registra as ações finas do atendimento", () => {
    expect([...CHAVES].sort()).toEqual(
      [
        "chat.atender",
        "chat.transferir",
        "chat.pausar",
        "chat.encerrar",
        "chat.abrir_chamado",
        "chat.ver_todas",
        "chat.ver_fila",
        "chat.relatorios",
        "chat.disparo",
        "chat.configurar",
        "chat.frases_do_espaco",
        "chat.ver_avaliacao",
      ].sort()
    );
  });

  it("o catálogo incorpora a lista do módulo, uma linha por ação", () => {
    for (const [nome, def] of Object.entries(ACOES_DO_CHAT))
      expect((ACTION_CATALOG as Record<string, unknown>)[nome]).toBe(def);
    for (const chave of CHAVES) expect(ALL_ACTIONS.filter((a) => a === chave)).toHaveLength(1);
  });

  it("todas no grupo do chat, no escopo do espaço, com explicação curta e sem travessão", () => {
    for (const acao of Object.values(ACOES_DO_CHAT)) {
      expect(acao.group).toBe(GRUPO_DO_CHAT);
      expect(acao.scope).toBe("workspace");
      expect(acao.description.length).toBeGreaterThan(0);
      expect(`${acao.label} ${acao.description}`).not.toContain("—");
    }
  });

  it("as ações grossas de antes saíram do catálogo", () => {
    expect(isKnownAction("chat.gerenciar")).toBe(false);
    expect(isKnownAction("chat.administrar")).toBe(false);
  });
});

describe("padrões por função (reproduzem o corte de antes)", () => {
  const OPERAM = ["admin", "atendimento", "gestor_projeto", "member", "qualidade", "ti"];

  it("quem atende também pausa, encerra e abre chamado", () => {
    for (const acao of ["chat.atender", "chat.pausar", "chat.encerrar", "chat.abrir_chamado"])
      expect(donosDe(acao)).toEqual(OPERAM);
  });

  it("transferir, ver as conversas dos outros e os relatórios: de Membro para cima (era chat.gerenciar)", () => {
    for (const acao of ["chat.transferir", "chat.ver_todas", "chat.relatorios"])
      expect(donosDe(acao)).toEqual(["admin", "gestor_projeto", "member"]);
  });

  it("fila e robô, configuração e frases do espaço: só o admin (era chat.administrar)", () => {
    for (const acao of ["chat.ver_fila", "chat.configurar", "chat.frases_do_espaco"])
      expect(donosDe(acao)).toEqual(["admin"]);
  });

  it("ver a avaliação do cliente: só o admin (o atendente avaliado não vê a nota)", () => {
    expect(donosDe("chat.ver_avaliacao")).toEqual(["admin"]);
  });

  it("disparo em massa: Gestor e admin", () => {
    expect(donosDe("chat.disparo")).toEqual(["admin", "gestor_projeto"]);
  });
});
