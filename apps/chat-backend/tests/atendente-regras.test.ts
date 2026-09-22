/**
 * Regras puras do W05 (ferramentas do atendente e da gestão do chat): frases
 * prontas, chave de acesso, envio sem nome, pausa do alerta de cliente sem
 * resposta, dados técnicos do cliente, feriados, foto do responsável, filtros e
 * paginação do gerenciador e os tempos do monitor. Sem banco e sem servidor.
 */
import { describe, expect, it } from "bun:test";
import { PAUSA_DO_ALERTA_MS, readAlertaPausadoAte, shouldAlertSla } from "@/atendente/alerta";
import { parseChave } from "@/atendente/chave";
import { mergeClientInfo, parseClientInfo } from "@/atendente/client-info";
import { parseCadastro } from "@/atendente/cadastro-regras";
import { isFeriado, parseFeriados } from "@/atendente/feriados";
import { readDataLocal, readInicioDoDia } from "@/atendente/fuso";
import { buildUrlDaFoto, isFotoVencida } from "@/atendente/foto";
import { FRASES_PADRAO, parseFrase } from "@/atendente/frases";
import { buildFiltroDoGerenciador, readPaginacao } from "@/atendente/gerenciador-regras";
import { computeTempos, summarize } from "@/atendente/monitor-regras";
import { formatTextoDoWhatsapp } from "@/atendente/whatsapp-texto";
import { serializeMessage } from "@/messages";
import { ZapiProvider } from "@/providers/zapi";

const MIN = 60_000;
const agora = new Date("2026-09-22T15:00:00.000Z");
const antes = (ms: number) => new Date(agora.getTime() - ms);

describe("frases prontas", () => {
  it("aceita o texto aparado e a ordem", () => {
    expect(parseFrase({ texto: "  Aguarde um momento, por favor. ", ordem: 3 })).toEqual({
      ok: true,
      data: { texto: "Aguarde um momento, por favor.", ordem: 3 },
    });
  });

  it("texto vazio volta no campo", () => {
    expect(parseFrase({ texto: "  " })).toEqual({
      ok: false,
      errors: [{ path: "texto", message: "Informe o texto da frase." }],
    });
  });

  it("texto longo demais é recusado", () => {
    const r = parseFrase({ texto: "a".repeat(1001) });
    expect(r.ok).toBe(false);
  });

  it("as frases padrão vêm do SAC, sem as perguntas da pesquisa antiga", () => {
    expect(FRASES_PADRAO).toContain("Aguarde um momento, por favor.");
    expect(FRASES_PADRAO.some((f) => f.includes("R: 1 - Regular"))).toBe(false);
  });
});

describe("chave de acesso remoto", () => {
  it("apara e aceita", () => {
    expect(parseChave({ chave: " 123 456 789 " })).toEqual({ ok: true, data: "123 456 789" });
  });

  it("sem chave, erro no campo", () => {
    expect(parseChave({})).toEqual({ ok: false, errors: [{ path: "chave", message: "Informe a chave de acesso." }] });
  });
});

describe("texto que vai ao WhatsApp", () => {
  it("mensagem do atendente leva o nome em negrito", () => {
    expect(formatTextoDoWhatsapp({ type: "text", text: "Oi", nome: "Ana" })).toBe("*Ana*:\nOi");
  });

  it("sem o nome, vai só o texto", () => {
    expect(formatTextoDoWhatsapp({ type: "text", text: "Oi", nome: null })).toBe("Oi");
  });

  it("a chave vai em negrito, com o rótulo", () => {
    expect(formatTextoDoWhatsapp({ type: "chave", text: "123 456", nome: null })).toBe(
      "Chave de acesso remoto: *123 456*"
    );
    expect(formatTextoDoWhatsapp({ type: "chave", text: "123", nome: "Ana" })).toBe(
      "*Ana*:\nChave de acesso remoto: *123*"
    );
  });

  it("sem texto, nada", () => {
    expect(formatTextoDoWhatsapp({ type: "text", text: null, nome: "Ana" })).toBeNull();
  });
});

describe("mensagem sem o nome do atendente", () => {
  const base = {
    id: "m1",
    sessionId: "s1",
    sender: "attendant",
    senderName: "Ana",
    type: "text",
    text: "Oi",
    status: "sent",
    createdAt: agora,
  };

  it("o cliente não recebe o nome; a equipe continua vendo quem mandou", () => {
    const m = { ...base, withoutSenderName: true };
    expect(serializeMessage(m).sender_name).toBeNull();
    expect(serializeMessage(m, { full: true }).sender_name).toBe("Ana");
    expect(serializeMessage(m, { full: true }).without_sender_name).toBe(true);
  });

  it("padrão: o nome vai", () => {
    expect(serializeMessage(base).sender_name).toBe("Ana");
  });
});

describe("alerta de cliente sem resposta", () => {
  const esperando = { lastClientMessageAt: antes(15 * MIN), lastAttendantMessageAt: antes(20 * MIN) };

  it("cliente esperando há mais de 10 minutos: alerta", () => {
    expect(shouldAlertSla({ ...esperando, slaAlertPausedAt: null }, agora)).toBe(true);
  });

  it("atendente respondeu por último: sem alerta", () => {
    expect(
      shouldAlertSla(
        { lastClientMessageAt: antes(15 * MIN), lastAttendantMessageAt: antes(14 * MIN), slaAlertPausedAt: null },
        agora
      )
    ).toBe(false);
  });

  it("menos de 10 minutos: sem alerta", () => {
    expect(
      shouldAlertSla(
        { lastClientMessageAt: antes(5 * MIN), lastAttendantMessageAt: null, slaAlertPausedAt: null },
        agora
      )
    ).toBe(false);
  });

  it("pausado há pouco: sem alerta", () => {
    expect(shouldAlertSla({ ...esperando, slaAlertPausedAt: antes(5 * MIN) }, agora)).toBe(false);
  });

  it("a pausa vence sozinha depois de 40 minutos", () => {
    expect(PAUSA_DO_ALERTA_MS).toBe(40 * MIN);
    expect(shouldAlertSla({ ...esperando, slaAlertPausedAt: antes(41 * MIN) }, agora)).toBe(true);
  });

  it("até quando está pausado", () => {
    expect(readAlertaPausadoAte(antes(10 * MIN), agora)?.toISOString()).toBe(
      new Date(agora.getTime() + 30 * MIN).toISOString()
    );
    expect(readAlertaPausadoAte(antes(50 * MIN), agora)).toBeNull();
    expect(readAlertaPausadoAte(null, agora)).toBeNull();
  });
});

describe("dados técnicos do cliente", () => {
  it("aceita os nomes em português e em inglês e descarta o resto", () => {
    expect(
      parseClientInfo({
        versao: "3.2.1",
        computer: "PC-FINANCEIRO",
        browser: "Firefox 130",
        os: "Windows 11",
        resolucao: "1920x1080",
        reason: "Erro ao emitir guia",
        senha: "nunca",
      })
    ).toEqual({
      versao: "3.2.1",
      computador: "PC-FINANCEIRO",
      navegador: "Firefox 130",
      so: "Windows 11",
      resolucao: "1920x1080",
      motivo: "Erro ao emitir guia",
    });
  });

  it("aceita JSON em texto (query string)", () => {
    expect(parseClientInfo('{"versao":"1.0","so":"Linux"}')).toEqual({ versao: "1.0", so: "Linux" });
  });

  it("lixo vira objeto vazio; valor longo é cortado", () => {
    expect(parseClientInfo("não é json")).toEqual({});
    expect(parseClientInfo(null)).toEqual({});
    expect(parseClientInfo([1, 2])).toEqual({});
    expect(parseClientInfo({ motivo: "x".repeat(900) }).motivo).toHaveLength(500);
  });

  it("valores vazios não entram", () => {
    expect(parseClientInfo({ versao: "  ", so: 11 })).toEqual({ so: "11" });
  });

  it("na conversa retomada, o novo completa o que já havia", () => {
    expect(mergeClientInfo({ versao: "1", so: "Linux" }, { versao: "2" })).toEqual({ versao: "2", so: "Linux" });
    expect(mergeClientInfo(null, {})).toEqual({});
  });
});

describe("cadastro durante o atendimento", () => {
  const ENT = "11111111-1111-4111-8111-111111111111";
  it("só o que veio muda; vazio limpa", () => {
    expect(parseCadastro({ entity_id: ENT })).toEqual({ ok: true, data: { entityId: ENT } });
    expect(parseCadastro({ project_id: "", entity_contact_id: null })).toEqual({
      ok: true,
      data: { projectId: null, entityContactId: null },
    });
  });

  it("id inválido volta no campo", () => {
    expect(parseCadastro({ entity_id: "abc" })).toEqual({
      ok: false,
      errors: [{ path: "entity_id", message: "Entidade inválida." }],
    });
  });
});

describe("feriados", () => {
  it("valida data e descrição e ordena", () => {
    expect(
      parseFeriados({
        feriados: [
          { date: "2026-12-25", label: "Natal", recorrente: true },
          { date: "2026-11-20", label: " Consciência Negra " },
        ],
      })
    ).toEqual({
      ok: true,
      data: [
        { date: "2026-11-20", label: "Consciência Negra", recorrente: false },
        { date: "2026-12-25", label: "Natal", recorrente: true },
      ],
    });
  });

  it("data inválida e descrição vazia voltam no campo da linha", () => {
    expect(parseFeriados({ feriados: [{ date: "2026-02-30", label: "" }] })).toEqual({
      ok: false,
      errors: [
        { path: "feriados[0].date", message: "Informe uma data válida." },
        { path: "feriados[0].label", message: "Informe a descrição do feriado." },
      ],
    });
  });

  it("data repetida é recusada", () => {
    const r = parseFeriados({
      feriados: [
        { date: "2026-04-21", label: "Tiradentes" },
        { date: "2026-04-21", label: "De novo" },
      ],
    });
    expect(r).toEqual({ ok: false, errors: [{ path: "feriados[1].date", message: "Esta data já está na lista." }] });
  });

  it("feriado do dia e recorrente (mesmo dia e mês em qualquer ano)", () => {
    const lista = [
      { date: "2026-11-20", label: "Consciência Negra", recorrente: false },
      { date: "2020-12-25", label: "Natal", recorrente: true },
    ];
    expect(isFeriado(lista, "2026-11-20")).toBe(true);
    expect(isFeriado(lista, "2027-11-20")).toBe(false);
    expect(isFeriado(lista, "2031-12-25")).toBe(true);
    expect(isFeriado(lista, "2026-12-24")).toBe(false);
  });

  it("o dia é o do fuso da empresa, não o do servidor", () => {
    // 01:30 UTC do dia 21 ainda é dia 20 em Campo Grande (UTC-4).
    expect(readDataLocal(new Date("2026-11-21T01:30:00Z"), "America/Campo_Grande")).toBe("2026-11-20");
    expect(readInicioDoDia("2026-11-20", "America/Campo_Grande").toISOString()).toBe("2026-11-20T04:00:00.000Z");
    expect(readInicioDoDia("2026-11-20", "UTC").toISOString()).toBe("2026-11-20T00:00:00.000Z");
  });
});

describe("foto do responsável", () => {
  it("sem foto ou foto de fora do chat: buscar", () => {
    expect(isFotoVencida(null, agora)).toBe(true);
    expect(isFotoVencida("2023/05/foto_12.jpg", agora)).toBe(true);
  });

  it("foto do chat com menos de 30 dias: manter; mais velha: atualizar", () => {
    const recente = buildUrlDaFoto("https://chat.exemplo", "abc", antes(2 * 24 * 60 * MIN));
    const velha = buildUrlDaFoto("https://chat.exemplo", "abc", antes(31 * 24 * 60 * MIN));
    expect(recente.startsWith("https://chat.exemplo/media/responsaveis/abc.jpg?")).toBe(true);
    expect(isFotoVencida(recente, agora)).toBe(false);
    expect(isFotoVencida(velha, agora)).toBe(true);
  });

  it("a Z-API manda a foto de perfil na mensagem", () => {
    const provider = new ZapiProvider({});
    const inbound = provider.parseWebhook({
      phone: "5567999990000",
      messageId: "X1",
      text: { message: "oi" },
      photo: "https://pps.whatsapp.net/v/foto.jpg",
    });
    expect(inbound?.photoUrl).toBe("https://pps.whatsapp.net/v/foto.jpg");
  });
});

describe("gerenciador de conversas", () => {
  it("paginação com padrão e teto", () => {
    expect(readPaginacao({})).toEqual({ page: 1, perPage: 50, skip: 0 });
    expect(readPaginacao({ page: "3", per_page: "20" })).toEqual({ page: 3, perPage: 20, skip: 40 });
    expect(readPaginacao({ page: "-1", per_page: "9999" })).toEqual({ page: 1, perPage: 500, skip: 0 });
  });

  it("sem filtro: o histórico inteiro do espaço", () => {
    expect(buildFiltroDoGerenciador("quality", {}, "UTC")).toEqual({ AND: [{ workspaceId: "quality" }] });
  });

  it("cada filtro vira um pedaço do where", () => {
    const ENT = "11111111-1111-4111-8111-111111111111";
    const PRJ = "22222222-2222-4222-8222-222222222222";
    const filtro = buildFiltroDoGerenciador(
      "quality",
      {
        attendant_id: "u-1",
        entity_id: ENT,
        project_id: PRJ,
        from: "2026-09-01",
        to: "2026-09-10",
        channel: "whatsapp",
        status: "closed",
        q: "20260901",
      },
      "UTC"
    );
    expect(filtro.AND).toContainEqual({ assignedAttendantId: "u-1" });
    expect(filtro.AND).toContainEqual({ entityId: ENT });
    expect(filtro.AND).toContainEqual({ projectId: PRJ });
    expect(filtro.AND).toContainEqual({ channel: { in: ["whatsapp"] } });
    expect(filtro.AND).toContainEqual({ status: { in: ["closed"] } });
    expect(filtro.AND).toContainEqual({
      createdAt: { gte: new Date("2026-09-01T00:00:00Z"), lt: new Date("2026-09-11T00:00:00Z") },
    });
    expect(filtro.AND).toContainEqual({
      OR: [
        { protocol: { contains: "20260901", mode: "insensitive" } },
        { clientName: { contains: "20260901", mode: "insensitive" } },
        { clientPhone: { contains: "20260901" } },
      ],
    });
  });

  it("o período é o dia no fuso da empresa", () => {
    const filtro = buildFiltroDoGerenciador(
      "quality",
      { from: "2026-09-01", to: "2026-09-01" },
      "America/Campo_Grande"
    );
    expect(filtro.AND).toContainEqual({
      createdAt: { gte: new Date("2026-09-01T04:00:00Z"), lt: new Date("2026-09-02T04:00:00Z") },
    });
  });

  it("filtro inválido é ignorado", () => {
    expect(buildFiltroDoGerenciador("quality", { entity_id: "x", channel: "fax", from: "ontem" }, "UTC")).toEqual({
      AND: [{ workspaceId: "quality" }],
    });
  });
});

describe("monitor: tempos de fila, atendimento e resposta", () => {
  const t = (min: number) => new Date(agora.getTime() + min * MIN);

  it("resumo de uma lista em segundos", () => {
    expect(summarize([60, 120, 180])).toEqual({ min: 60, media: 120, max: 180, amostras: 3 });
    expect(summarize([])).toEqual({ min: null, media: null, max: null, amostras: 0 });
  });

  it("fila até a primeira resposta, atendimento até o fim e cada resposta", () => {
    const sessoes = [
      { id: "a", createdAt: t(0), closedAt: t(30), abandonada: false },
      { id: "b", createdAt: t(0), closedAt: t(5), abandonada: true },
    ];
    const mensagens = [
      { sessionId: "a", sender: "client", createdAt: t(0) },
      { sessionId: "a", sender: "attendant", createdAt: t(2) },
      { sessionId: "a", sender: "client", createdAt: t(10) },
      { sessionId: "a", sender: "client", createdAt: t(11) },
      { sessionId: "a", sender: "attendant", createdAt: t(14) },
      { sessionId: "b", sender: "client", createdAt: t(0) },
    ];
    expect(computeTempos(sessoes, mensagens)).toEqual({
      fila: { min: 120, media: 120, max: 120, amostras: 1 },
      atendimento: { min: 1680, media: 1680, max: 1680, amostras: 1 },
      resposta: { min: 240, media: 240, max: 240, amostras: 1 },
    });
  });
});
