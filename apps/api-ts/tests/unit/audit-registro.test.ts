/**
 * Registro citado pela trilha de auditoria: rótulo legível e rota que abre a tela.
 *
 * A coluna "Registro" mostrava só os 8 primeiros caracteres do uuid ("Chamado
 * b9cc59d1"), e ninguém conseguia saber QUAL chamado a pessoa tinha aberto ou
 * alterado. Estas são as regras puras que transformam a linha da trilha em algo
 * que o administrador consegue ler e clicar.
 */

import { describe, expect, test } from "bun:test";
import { describeRegistro, chaveDoRegistro } from "@modules/audit/registro";

const SLUG = "quality";

const linha = (entity: string, entityId: string, extra: Record<string, unknown> = {}) => ({
  entity,
  entityId,
  metadata: {},
  changes: {},
  ...extra,
});

describe("chamado", () => {
  const chamado = {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Erro no relatório de IPTU",
    sequenceId: 12,
    projectId: "22222222-2222-2222-2222-222222222222",
    ticketSequence: 34,
    ticketYear: 2026,
    deletedAt: null,
    project: { identifier: "QLT" },
  };

  test("o rótulo traz o identificador do sistema, o número anual e o título", () => {
    const registro = describeRegistro(linha("issue", chamado.id), chamado, SLUG);
    expect(registro.rotulo).toBe("Chamado QLT-12 (34-2026) Erro no relatório de IPTU");
    expect(registro.tipo).toBe("issue");
    expect(registro.id).toBe(chamado.id);
  });

  test("o caminho abre o chamado na tela de detalhe do sistema", () => {
    const registro = describeRegistro(linha("issue", chamado.id), chamado, SLUG);
    expect(registro.caminho).toBe(`/quality/projects/${chamado.projectId}/issues/${chamado.id}`);
  });

  test("chamado sem número anual mostra só o identificador e o título", () => {
    const semNumero = { ...chamado, ticketSequence: null, ticketYear: null };
    expect(describeRegistro(linha("issue", chamado.id), semNumero, SLUG).rotulo).toBe(
      "Chamado QLT-12 Erro no relatório de IPTU"
    );
  });

  test("título longo é cortado: o rótulo é uma linha de tabela, não o chamado inteiro", () => {
    const comprido = { ...chamado, name: "a".repeat(200) };
    const { rotulo } = describeRegistro(linha("issue", chamado.id), comprido, SLUG);
    expect(rotulo.length).toBeLessThan(100);
    expect(rotulo.endsWith("…")).toBe(true);
  });

  test("chamado excluído continua legível, mas sem link", () => {
    const excluido = { ...chamado, deletedAt: new Date("2026-03-01T10:00:00Z") };
    const registro = describeRegistro(linha("issue", chamado.id), excluido, SLUG);
    expect(registro.rotulo).toBe("Chamado QLT-12 (34-2026) Erro no relatório de IPTU (removido)");
    expect(registro.caminho).toBeNull();
  });
});

describe("registro que sumiu do banco", () => {
  test("aproveita o nome guardado nos metadados e marca como removido", () => {
    const registro = describeRegistro(
      linha("issue", "33333333-3333-3333-3333-333333333333", { metadata: { name: "Chamado do legado" } }),
      null,
      SLUG
    );
    expect(registro.rotulo).toBe("Chamado Chamado do legado (removido)");
    expect(registro.caminho).toBeNull();
  });

  test("aproveita o valor anterior do diff quando o metadado não tem nome", () => {
    const registro = describeRegistro(
      linha("entity", "44444444-4444-4444-4444-444444444444", {
        changes: { name: { de: "Prefeitura de Palmeira", para: "Prefeitura de Palmeira das Missões" } },
      }),
      null,
      SLUG
    );
    expect(registro.rotulo).toBe("Entidade Prefeitura de Palmeira (removido)");
  });

  test("sem nenhum nome guardado, cai para o começo do id em vez de mentir", () => {
    const registro = describeRegistro(linha("issue", "55555555-5555-5555-5555-555555555555"), null, SLUG);
    expect(registro.rotulo).toBe("Chamado 55555555 (removido)");
    expect(registro.caminho).toBeNull();
  });
});

describe("solicitação (triagem)", () => {
  const solicitacao = {
    id: "66666666-6666-6666-6666-666666666666",
    name: "Instalar o módulo de protocolo",
    projectId: "77777777-7777-7777-7777-777777777777",
    deletedAt: null,
    entity: { name: "Prefeitura de Palmeira" },
    intakeIssues: [{ status: -2 }],
  };

  test("o rótulo junta o título e a entidade que pediu", () => {
    const { rotulo } = describeRegistro(linha("intake", solicitacao.id), solicitacao, SLUG);
    expect(rotulo).toBe("Solicitação Instalar o módulo de protocolo (Prefeitura de Palmeira)");
  });

  test("pendente abre a triagem na aba de abertas, já com o item selecionado", () => {
    const { caminho } = describeRegistro(linha("intake", solicitacao.id), solicitacao, SLUG);
    expect(caminho).toBe(
      `/quality/projects/${solicitacao.projectId}/intake?currentTab=open&inboxIssueId=${solicitacao.id}`
    );
  });

  test("já triada abre a aba de fechadas, senão o item não aparece na lista", () => {
    const aceita = { ...solicitacao, intakeIssues: [{ status: 1 }] };
    const { caminho } = describeRegistro(linha("intake", solicitacao.id), aceita, SLUG);
    expect(caminho).toContain("currentTab=closed");
  });
});

describe("demais tipos", () => {
  test("comentário aponta para o chamado comentado", () => {
    const comentario = {
      id: "88888888-8888-8888-8888-888888888888",
      deletedAt: null,
      issueId: "11111111-1111-1111-1111-111111111111",
      projectId: "22222222-2222-2222-2222-222222222222",
      issue: { name: "Erro no relatório", sequenceId: 12, project: { identifier: "QLT" } },
    };
    const registro = describeRegistro(linha("comment", comentario.id), comentario, SLUG);
    expect(registro.rotulo).toBe("Comentário em QLT-12 Erro no relatório");
    expect(registro.caminho).toBe(`/quality/projects/${comentario.projectId}/issues/${comentario.issueId}`);
  });

  test("anexo mostra o nome do arquivo e não tem tela própria para abrir", () => {
    const anexo = { id: "99999999-9999-9999-9999-999999999999", deletedAt: null, attributes: { name: "contrato.pdf" } };
    const registro = describeRegistro(linha("attachment", anexo.id), anexo, SLUG);
    expect(registro.rotulo).toBe("Anexo contrato.pdf");
    expect(registro.caminho).toBeNull();
  });

  test("entidade leva para o cadastro de entidades", () => {
    const entidade = { id: "aaaaaaaa-0000-0000-0000-000000000000", deletedAt: null, name: "Prefeitura de Palmeira" };
    const registro = describeRegistro(linha("entity", entidade.id), entidade, SLUG);
    expect(registro.rotulo).toBe("Entidade Prefeitura de Palmeira");
    expect(registro.caminho).toBe("/quality/settings/entities");
  });

  test("usuário e membro mostram nome e e-mail e levam para os membros do espaço", () => {
    const pessoa = {
      id: "bbbbbbbb-0000-0000-0000-000000000000",
      deletedAt: null,
      displayName: "Mateus",
      firstName: "Mateus",
      lastName: "Seiboth",
      email: "mateus@quality.com.br",
    };
    for (const tipo of ["user", "member"]) {
      const registro = describeRegistro(linha(tipo, pessoa.id), pessoa, SLUG);
      expect(registro.rotulo).toContain("Mateus Seiboth");
      expect(registro.rotulo).toContain("mateus@quality.com.br");
      expect(registro.caminho).toBe("/quality/settings/members");
    }
  });

  test("visita técnica abre a própria visita, com número e entidade no rótulo", () => {
    const visita = {
      id: "cccccccc-0000-0000-0000-000000000000",
      deletedAt: null,
      visitNumber: "45-2026",
      entity: { name: "Prefeitura de Palmeira" },
    };
    const registro = describeRegistro(linha("technical_visit", visita.id), visita, SLUG);
    expect(registro.rotulo).toBe("Visita técnica 45-2026 (Prefeitura de Palmeira)");
    expect(registro.caminho).toBe(`/quality/visits/${visita.id}`);
  });

  test("página do sistema abre dentro do sistema; página do espaço abre na wiki", () => {
    const id = "dddddddd-0000-0000-0000-000000000000";
    const doSistema = {
      id,
      deletedAt: null,
      name: "Manual do IPTU",
      isGlobal: false,
      projects: [{ projectId: "22222222-2222-2222-2222-222222222222" }],
    };
    expect(describeRegistro(linha("page", id), doSistema, SLUG).caminho).toBe(
      `/quality/projects/22222222-2222-2222-2222-222222222222/pages/${id}`
    );

    const doEspaco = { id, deletedAt: null, name: "Manual do IPTU", isGlobal: true, projects: [] };
    const registro = describeRegistro(linha("page", id), doEspaco, SLUG);
    expect(registro.rotulo).toBe("Página Manual do IPTU");
    expect(registro.caminho).toBe(`/quality/wiki/${id}`);
  });

  test("currículo mostra o candidato e a vaga", () => {
    const curriculo = { id: "eeeeeeee-0000-0000-0000-000000000000", name: "Ana Souza", position: "Suporte" };
    const registro = describeRegistro(linha("curriculo", curriculo.id), curriculo, SLUG);
    expect(registro.rotulo).toBe("Currículo Ana Souza (Suporte)");
    expect(registro.caminho).toBe("/quality/curriculos");
  });

  test("ouvidoria mostra o tipo de manifestação e quem mandou", () => {
    const manifestacao = { id: "ffffffff-0000-0000-0000-000000000000", kind: "reclamacao", name: "João" };
    const registro = describeRegistro(linha("ouvidoria", manifestacao.id), manifestacao, SLUG);
    expect(registro.rotulo).toBe("Ouvidoria Reclamação de João");
    expect(registro.caminho).toBe("/quality/ouvidoria");
  });

  test("atendimento usa o protocolo guardado no registro para abrir a conversa", () => {
    const id = "01010101-0000-0000-0000-000000000000";
    const comProtocolo = describeRegistro(
      linha("chat_session", id, { metadata: { protocolo: "2026-000123", canal: "whatsapp" } }),
      {},
      SLUG
    );
    expect(comProtocolo.rotulo).toBe("Atendimento 2026-000123");
    expect(comProtocolo.caminho).toBe("/quality/chat-view/2026-000123");

    const semProtocolo = describeRegistro(linha("chat_session", id), {}, SLUG);
    expect(semProtocolo.caminho).toBeNull();
  });

  test("a própria trilha leva para a tela de auditoria", () => {
    const registro = describeRegistro(linha("audit_log", "02020202-0000-0000-0000-000000000000"), {}, SLUG);
    expect(registro.caminho).toBe("/quality/settings/auditoria");
  });

  test("tipo que a trilha ainda não conhece continua legível, mas sem link", () => {
    const registro = describeRegistro(linha("planilha_secreta", "03030303-0000-0000-0000-000000000000"), {}, SLUG);
    expect(registro.rotulo).toBe("planilha_secreta 03030303");
    expect(registro.caminho).toBeNull();
  });
});

describe("regras de texto e de chave", () => {
  test("nenhum rótulo usa travessão: é texto que o usuário lê na tela", () => {
    const amostras = [
      describeRegistro(linha("issue", "11111111-1111-1111-1111-111111111111"), null, SLUG),
      describeRegistro(linha("attachment", "99999999-9999-9999-9999-999999999999"), null, SLUG),
      describeRegistro(linha("audit_log", "02020202-0000-0000-0000-000000000000"), {}, SLUG),
    ];
    for (const { rotulo } of amostras) expect(rotulo).not.toContain("—");
  });

  test("a chave do registro separa tipo e id, para agrupar a carga em lote", () => {
    expect(chaveDoRegistro({ entity: "issue", entityId: "abc" })).toBe("issue:abc");
    expect(chaveDoRegistro({ entity: "intake", entityId: "abc" })).not.toBe(
      chaveDoRegistro({ entity: "issue", entityId: "abc" })
    );
  });
});
