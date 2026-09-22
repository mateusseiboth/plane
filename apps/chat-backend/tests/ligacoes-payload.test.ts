/**
 * Ligações do FreePBX: leitura do que o PBX manda, do que o atendente envia ao
 * concluir e ao vincular o chamado, e dos ramais da configuração. Puro, sem banco.
 */
import { describe, expect, test } from "bun:test";
import { parseChamado, parseConclusao, parseLigacaoRecebida, parseRamais } from "@/ligacoes/payload";

const pathsOf = (r: { ok: boolean; errors?: { path: string }[] }) => (r.ok ? [] : r.errors!.map((e) => e.path));

describe("parseLigacaoRecebida", () => {
  test("lê o envio completo do PBX", () => {
    const r = parseLigacaoRecebida({
      call_id: "1695390000.123",
      caller: "(67) 98881-0001",
      extension: 201,
      started_at: "2026-09-22T13:00:00Z",
      ended_at: "2026-09-22T13:05:00Z",
      duration_sec: "300",
      recording_url: "https://pbx.local/rec/1.wav",
      status: "answered",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual({
      callId: "1695390000.123",
      caller: "(67) 98881-0001",
      extension: "201",
      startedAt: new Date("2026-09-22T13:00:00Z"),
      endedAt: new Date("2026-09-22T13:05:00Z"),
      durationSec: 300,
      recordingUrl: "https://pbx.local/rec/1.wav",
      status: "answered",
    });
  });

  test("só o call_id é obrigatório; sem status a ligação conta como atendida", () => {
    const r = parseLigacaoRecebida({ call_id: "abc" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe("answered");
    expect(r.data.caller).toBeNull();
    expect(r.data.startedAt).toBeNull();
  });

  test("aceita data em segundos desde 1970 (formato do CDR)", () => {
    const r = parseLigacaoRecebida({ call_id: "x", started_at: 1790000000 });
    expect(r.ok && r.data.startedAt?.getTime()).toBe(1790000000 * 1000);
  });

  test("disposição do FreePBX vira atendida ou perdida", () => {
    const status = (s: string) => {
      const r = parseLigacaoRecebida({ call_id: "x", status: s });
      return r.ok ? r.data.status : null;
    };
    expect(status("ANSWERED")).toBe("answered");
    expect(status("NO ANSWER")).toBe("missed");
    expect(status("busy")).toBe("missed");
    expect(status("FAILED")).toBe("missed");
    expect(status("missed")).toBe("missed");
  });

  test("devolve cada campo recusado com o caminho", () => {
    const r = parseLigacaoRecebida({
      call_id: "  ",
      started_at: "ontem",
      duration_sec: -3,
      recording_url: "ftp://pbx/rec.wav",
      status: "talvez",
    });
    expect(pathsOf(r).toSorted()).toEqual(["call_id", "duration_sec", "recording_url", "started_at", "status"]);
  });

  test("corpo que não é objeto recusa o call_id", () => {
    expect(pathsOf(parseLigacaoRecebida(null))).toEqual(["call_id"]);
  });
});

describe("parseConclusao", () => {
  const projeto = "0198f7c2-0000-7000-8000-000000000001";

  test("contato já detectado dispensa o cadastro", () => {
    const r = parseConclusao({ project_id: projeto, descricao: "  Dúvida no boleto " }, { hasContato: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual({ projectId: projeto, descricao: "Dúvida no boleto", contact: null });
  });

  test("sem contato detectado, exige escolher ou cadastrar", () => {
    const r = parseConclusao({ project_id: projeto, descricao: "x" }, { hasContato: false });
    expect(pathsOf(r)).toEqual(["contact"]);
  });

  test("contato escolhido na busca ou digitado servem", () => {
    const escolhido = parseConclusao(
      { project_id: projeto, descricao: "x", contact: { contact_id: projeto } },
      { hasContato: false }
    );
    const digitado = parseConclusao(
      { project_id: projeto, descricao: "x", contact: { name: "Maria" } },
      { hasContato: false }
    );
    expect(escolhido.ok && escolhido.data.contact).toEqual({ contact_id: projeto });
    expect(digitado.ok && digitado.data.contact).toEqual({ name: "Maria" });
  });

  test("sistema e descrição são obrigatórios", () => {
    const r = parseConclusao({ project_id: "nao-e-uuid", descricao: " " }, { hasContato: true });
    expect(pathsOf(r).toSorted()).toEqual(["descricao", "project_id"]);
  });
});

describe("parseChamado", () => {
  const id = "0198f7c2-0000-7000-8000-000000000002";

  test("lê solicitação ou chamado", () => {
    expect(parseChamado({ kind: "intake", issue_id: id })).toEqual({ ok: true, data: { kind: "intake", issueId: id } });
    expect(parseChamado({ kind: "issue", issue_id: id })).toEqual({ ok: true, data: { kind: "issue", issueId: id } });
  });

  test("recusa tipo e id desconhecidos", () => {
    expect(pathsOf(parseChamado({ kind: "ticket", issue_id: "1" })).toSorted()).toEqual(["issue_id", "kind"]);
  });
});

describe("parseRamais", () => {
  const ana = "0198f7c2-0000-7000-8000-00000000000a";
  const bia = "0198f7c2-0000-7000-8000-00000000000b";
  const atendentes = new Set([ana, bia]);

  test("lê a lista de ramal por pessoa", () => {
    const r = parseRamais(
      {
        ramais: [
          { extension: " 201 ", user_id: ana },
          { extension: 202, user_id: bia },
        ],
      },
      atendentes
    );
    expect(r).toEqual({
      ok: true,
      data: [
        { extension: "201", userId: ana },
        { extension: "202", userId: bia },
      ],
    });
  });

  test("ramal repetido, vazio ou de quem não atende é recusado no próprio campo", () => {
    const r = parseRamais(
      {
        ramais: [
          { extension: "201", user_id: ana },
          { extension: "201", user_id: bia },
          { extension: "", user_id: ana },
          { extension: "300", user_id: "0198f7c2-0000-7000-8000-0000000000ff" },
        ],
      },
      atendentes
    );
    expect(pathsOf(r)).toEqual(["ramais[1].extension", "ramais[2].extension", "ramais[3].user_id"]);
  });

  test("lista ausente é recusada", () => {
    expect(pathsOf(parseRamais({}, atendentes))).toEqual(["ramais"]);
  });
});
