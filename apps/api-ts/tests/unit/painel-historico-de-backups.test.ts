/**
 * Histórico de uma entidade × sistema no painel de backups: leitura dos
 * parâmetros da rota e a montagem da lista que a gaveta lateral mostra. Puro,
 * sem MySQL.
 */
import { describe, expect, it } from "bun:test";
import {
  buildHistoricoDoLegado,
  readDiasDoHistorico,
  readSistemaDoHistorico,
  type EnvioDetalhado,
  type LinhaDoHistorico,
} from "@modules/painel-tv/backups/historico";

const TZ = "-04:00";

const linha = (over: Partial<LinhaDoHistorico> & { id?: string | number } = {}): LinhaDoHistorico => ({
  id: String(over.id ?? 1),
  id_entidade: String(over.id_entidade ?? "21"),
  id_sistema: String(over.id_sistema ?? "1"),
  datahora_envio: String(over.datahora_envio ?? "2022-12-01 08:38:48"),
  tamanho_banco: over.tamanho_banco ?? 31_976_808,
  nome_arquivo: over.nome_arquivo ?? "FB3_QSCONTABIL_1_12_2022__8_0_3_FBK.zip",
  host: over.host ?? "192.168.1.17/3053",
  ip_externo: over.ip_externo ?? "189.45.10.2",
  versao_backup: over.versao_backup ?? "5.0.0.2",
  corrompido: over.corrompido ?? 0,
  envio_ftp: over.envio_ftp ?? 1,
  erro_backup: over.erro_backup ?? "N",
  erro_restore: over.erro_restore ?? "N",
});

describe("parâmetros da rota", () => {
  it("a janela do histórico vai de 1 a 180 dias e cai em 30 por padrão", () => {
    expect(readDiasDoHistorico(undefined)).toBe(30);
    expect(readDiasDoHistorico("7")).toBe(7);
    expect(readDiasDoHistorico("0")).toBe(30);
    expect(readDiasDoHistorico("5000")).toBe(180);
    expect(readDiasDoHistorico("abc")).toBe(30);
  });

  it("o sistema é um dos quatro do painel, ou nenhum", () => {
    expect(readSistemaDoHistorico(undefined)).toBeNull();
    expect(readSistemaDoHistorico("")).toBeNull();
    expect(readSistemaDoHistorico("3")).toBe(3);
    expect(readSistemaDoHistorico("8")).toBe(8);
    expect(readSistemaDoHistorico("99")).toBe("invalido");
    expect(readSistemaDoHistorico("6")).toBe("invalido");
  });
});

describe("histórico do legado", () => {
  const nomes = new Map([
    ["1", "Contabilidade"],
    ["3", "ARH"],
  ]);

  const build = (linhas: LinhaDoHistorico[], sistema: number | null = null): EnvioDetalhado[] =>
    buildHistoricoDoLegado({ linhas, nomes, sistema, tz: TZ });

  it("traz o arquivo, a origem e a versão, com a data no fuso do legado", () => {
    const [envio] = build([linha()]);
    expect(envio).toMatchObject({
      id: "1",
      sistema: 1,
      sistemaNome: "Contabilidade",
      enviadoEm: "2022-12-01T12:38:48.000Z",
      tamanhoBytes: 31_976_808,
      arquivo: "FB3_QSCONTABIL_1_12_2022__8_0_3_FBK.zip",
      origem: "192.168.1.17/3053",
      ipExterno: "189.45.10.2",
      versao: "5.0.0.2",
      ok: true,
    });
  });

  it("o `0` que o legado grava como vazio não vira texto na tela", () => {
    const [envio] = build([linha({ nome_arquivo: "0", host: "0", versao_backup: "0", ip_externo: "0" })]);
    expect(envio).toMatchObject({ arquivo: null, origem: null, ipExterno: null, versao: null });
  });

  it("o grupo do banco de integração conta como o sistema 8", () => {
    const [envio] = build([linha({ id_sistema: "21" })]);
    expect(envio).toMatchObject({ sistema: 8, sistemaNome: "Integração" });
  });

  it("sem sistema escolhido, só os quatro do painel: o resto não está na grade", () => {
    const linhas = [linha({ id: "1", id_sistema: "19" }), linha({ id: "2", id_sistema: "4" })];
    expect(build(linhas).map((e) => e.id)).toEqual(["2"]);
  });

  it("o filtro de sistema respeita o grupo da integração", () => {
    const linhas = [linha({ id: "1", id_sistema: "21" }), linha({ id: "2", id_sistema: "3" })];
    expect(build(linhas, 8).map((e) => e.id)).toEqual(["1"]);
    expect(build(linhas, 3).map((e) => e.id)).toEqual(["2"]);
  });

  it("do mais recente para o mais antigo", () => {
    const envios = build([
      linha({ id: "1", datahora_envio: "2022-11-28 08:00:00" }),
      linha({ id: "2", datahora_envio: "2022-12-01 08:00:00" }),
      linha({ id: "3", datahora_envio: "2022-11-30 08:00:00" }),
    ]);
    expect(envios.map((e) => e.id)).toEqual(["2", "3", "1"]);
  });

  it("envio quebrado entra na lista, marcado: é o que a infra quer ver", () => {
    const envios = build([
      linha({ id: "1", tamanho_banco: 22, envio_ftp: 0 }),
      linha({ id: "2", corrompido: 1 }),
      linha({ id: "3", erro_restore: "S" }),
    ]);
    expect(envios.map((e) => e.ok)).toEqual([false, false, false]);
    expect(envios.find((e) => e.id === "1")!.envioFtp).toBe(false);
    expect(envios.find((e) => e.id === "3")!.erroRestore).toBe(true);
  });

  it("linha sem data legível fica de fora", () => {
    expect(build([linha({ datahora_envio: "0000-00-00 00:00:00" })])).toEqual([]);
  });
});
