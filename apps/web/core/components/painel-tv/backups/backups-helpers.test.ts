/**
 * Regras do painel de backups INTERATIVO: leitura dos filtros da URL, busca por
 * entidade, filtro por sistema e situação, e a ordenação das colunas. Puro.
 * Rodar com `bun test core/components/painel-tv`.
 */
import { describe, expect, it } from "bun:test";
import {
  FILTROS_PADRAO,
  buildBuscaDosFiltros,
  filterPainelDeBackups,
  isSituacaoDoBackup,
  readFiltrosDaUrl,
  readSituacaoDaEntidade,
  type TPainelDeBackups,
} from "./backups-helpers";

const entidadeSemBackup = (over: Partial<TPainelDeBackups["sem_backup"][number]> = {}) => ({
  id: over.id ?? "e1",
  codigo: over.codigo ?? 10,
  nome: over.nome ?? "Prefeitura de Dourados",
  cidade: over.cidade ?? "Dourados",
  uf: over.uf ?? "MS",
  expira_em: null,
  ultimo_em: over.ultimo_em === undefined ? "2026-09-10T12:00:00.000Z" : over.ultimo_em,
  dias: over.dias === undefined ? 12 : over.dias,
});

const backup = (sistema: number, ok: boolean) => ({
  sistema,
  sistema_nome: `Sistema ${sistema}`,
  enviado_em: "2026-09-21T10:00:00.000Z",
  tamanho: "5 MB",
  corrompido: ok ? 0 : 1,
  envio_ftp: true,
  erro_backup: false,
  erro_restore: false,
  ok,
});

const painel: TPainelDeBackups = {
  gerado_em: "2026-09-22T12:00:00.000Z",
  uf: null,
  ufs: ["MS"],
  dias: 1,
  sem_backup: [
    entidadeSemBackup({ id: "e1", nome: "Prefeitura de Dourados", dias: 12 }),
    entidadeSemBackup({ id: "e2", nome: "Câmara de Amambai", codigo: 20, ultimo_em: null, dias: null }),
    entidadeSemBackup({ id: "e3", nome: "Prefeitura de Bonito", codigo: 30, dias: 3 }),
  ],
  enviados: [
    {
      id: "e4",
      codigo: 40,
      nome: "Prefeitura de Naviraí",
      cidade: "Naviraí",
      uf: "MS",
      expira_em: null,
      backups: [backup(1, true), backup(3, false)],
      com_problema: 1,
    },
    {
      id: "e5",
      codigo: 50,
      nome: "Camara de Coxim",
      cidade: "Coxim",
      uf: "MS",
      expira_em: null,
      backups: [backup(4, true)],
      com_problema: 0,
    },
  ],
  contadores: {
    entidades_atrasadas: 3,
    entidades_com_backup: 2,
    backups_recebidos: 3,
    maior_atraso_dias: 12,
    com_problema: 1,
  },
};

describe("filtros na URL", () => {
  it("sem nada na URL vale o padrão", () => {
    expect(readFiltrosDaUrl("")).toEqual(FILTROS_PADRAO);
  });

  it("lê entidade, sistema, situação e ordenação", () => {
    expect(readFiltrosDaUrl("?entidade=dourados&sistema=3&situacao=atrasado&ordem=entidade")).toEqual({
      entidade: "dourados",
      sistema: 3,
      situacao: "atrasado",
      ordem: "entidade",
    });
  });

  it("sistema fora dos quatro do painel e situação inventada são ignorados", () => {
    expect(readFiltrosDaUrl("?sistema=99&situacao=talvez&ordem=cor")).toEqual(FILTROS_PADRAO);
    expect(isSituacaoDoBackup("em-dia")).toBe(true);
    expect(isSituacaoDoBackup("talvez")).toBe(false);
  });

  it("a busca devolvida guarda os filtros e preserva a chave da TV", () => {
    const busca = buildBuscaDosFiltros("?key=ptv_abc&uf=MS", { entidade: "bonito", sistema: 4 }, 7);
    const parametros = new URLSearchParams(busca);
    expect(parametros.get("key")).toBe("ptv_abc");
    expect(parametros.get("uf")).toBe("MS");
    expect(parametros.get("entidade")).toBe("bonito");
    expect(parametros.get("sistema")).toBe("4");
    expect(parametros.get("dias")).toBe("7");
    expect(parametros.get("interativo")).toBe("1");
  });

  it("filtro limpo sai da URL em vez de virar vazio", () => {
    const busca = buildBuscaDosFiltros("?entidade=bonito&sistema=4", { entidade: "", sistema: null }, null);
    expect(new URLSearchParams(busca).get("entidade")).toBeNull();
    expect(new URLSearchParams(busca).get("sistema")).toBeNull();
    expect(new URLSearchParams(busca).get("dias")).toBeNull();
  });
});

describe("situação da entidade", () => {
  it("quem enviou está em dia; quem tem último backup velho está atrasado", () => {
    expect(readSituacaoDaEntidade({ dias: null, enviou: true })).toBe("em-dia");
    expect(readSituacaoDaEntidade({ dias: 12, enviou: false })).toBe("atrasado");
    expect(readSituacaoDaEntidade({ dias: null, enviou: false })).toBe("nunca");
  });
});

describe("busca rápida por entidade", () => {
  it("acha sem acento e sem diferenciar maiúsculas", () => {
    const filtrado = filterPainelDeBackups(painel, { ...FILTROS_PADRAO, entidade: "NAVIRAI" });
    expect(filtrado.enviados.map((e) => e.nome)).toEqual(["Prefeitura de Naviraí"]);
    expect(filtrado.sem_backup).toEqual([]);
  });

  it("acha também pelo código da entidade", () => {
    const filtrado = filterPainelDeBackups(painel, { ...FILTROS_PADRAO, entidade: "20" });
    expect(filtrado.sem_backup.map((e) => e.nome)).toEqual(["Câmara de Amambai"]);
  });
});

describe("filtro por situação", () => {
  it("em dia deixa só quem enviou no período", () => {
    const filtrado = filterPainelDeBackups(painel, { ...FILTROS_PADRAO, situacao: "em-dia" });
    expect(filtrado.sem_backup).toEqual([]);
    expect(filtrado.enviados).toHaveLength(2);
  });

  it("nunca enviou deixa só quem não tem registro nenhum", () => {
    const filtrado = filterPainelDeBackups(painel, { ...FILTROS_PADRAO, situacao: "nunca" });
    expect(filtrado.sem_backup.map((e) => e.nome)).toEqual(["Câmara de Amambai"]);
    expect(filtrado.enviados).toEqual([]);
  });

  it("atrasado deixa quem já enviou algum dia e ficou para trás", () => {
    const filtrado = filterPainelDeBackups(painel, { ...FILTROS_PADRAO, situacao: "atrasado" });
    expect(filtrado.sem_backup.map((e) => e.nome)).toEqual(["Prefeitura de Dourados", "Prefeitura de Bonito"]);
  });
});

describe("filtro por sistema", () => {
  it("deixa na entidade só os backups do sistema escolhido", () => {
    const filtrado = filterPainelDeBackups(painel, { ...FILTROS_PADRAO, sistema: 3 });
    expect(filtrado.enviados.map((e) => e.nome)).toEqual(["Prefeitura de Naviraí"]);
    expect(filtrado.enviados[0]!.backups.map((b) => b.sistema)).toEqual([3]);
  });

  it("quem está sem backup nenhum continua na lista: falta o do sistema escolhido também", () => {
    const filtrado = filterPainelDeBackups(painel, { ...FILTROS_PADRAO, sistema: 3 });
    expect(filtrado.sem_backup).toHaveLength(3);
  });
});

describe("ordenação", () => {
  it("o padrão é o mais atrasado primeiro, e quem nunca enviou vem na frente", () => {
    const filtrado = filterPainelDeBackups(painel, FILTROS_PADRAO);
    expect(filtrado.sem_backup.map((e) => e.nome)).toEqual([
      "Câmara de Amambai",
      "Prefeitura de Dourados",
      "Prefeitura de Bonito",
    ]);
    expect(filtrado.enviados.map((e) => e.nome)).toEqual(["Prefeitura de Naviraí", "Camara de Coxim"]);
  });

  it("por entidade é ordem alfabética em português, nas duas listas", () => {
    const filtrado = filterPainelDeBackups(painel, { ...FILTROS_PADRAO, ordem: "entidade" });
    expect(filtrado.sem_backup.map((e) => e.nome)).toEqual([
      "Câmara de Amambai",
      "Prefeitura de Bonito",
      "Prefeitura de Dourados",
    ]);
    expect(filtrado.enviados.map((e) => e.nome)).toEqual(["Camara de Coxim", "Prefeitura de Naviraí"]);
  });

  it("por problema põe na frente quem tem backup com erro", () => {
    const filtrado = filterPainelDeBackups(painel, { ...FILTROS_PADRAO, ordem: "problema" });
    expect(filtrado.enviados.map((e) => e.nome)).toEqual(["Prefeitura de Naviraí", "Camara de Coxim"]);
  });
});

describe("contadores", () => {
  it("contam a lista filtrada, não a inteira", () => {
    const filtrado = filterPainelDeBackups(painel, { ...FILTROS_PADRAO, situacao: "em-dia" });
    expect(filtrado.contadores).toEqual({
      entidades_atrasadas: 0,
      entidades_com_backup: 2,
      backups_recebidos: 3,
      maior_atraso_dias: 0,
      com_problema: 1,
    });
  });
});
