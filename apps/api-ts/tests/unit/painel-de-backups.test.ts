/**
 * Painel de TV dos backups (o `relatorio_backup.php` do legado): quem está sem
 * backup, os envios do período com os sinalizadores, o recorte por sistema e o
 * filtro de UF. Puro — sem MySQL.
 */
import { describe, expect, it } from "bun:test";
import {
  SISTEMAS_DO_PAINEL,
  buildPainelDeBackups,
  formatTamanho,
  type EntidadeDoBackup,
} from "@modules/painel-tv/backups/painel-de-backups";

const AGORA = new Date("2026-09-22T15:00:00.000Z");

const entidade = (over: Partial<EntidadeDoBackup> = {}): EntidadeDoBackup => ({
  id: "e1",
  codigo: 10,
  nome: "Prefeitura de Selvíria",
  cidade: "Selvíria",
  uf: "MS",
  expiraEm: null,
  ...over,
});

const envio = (over: Record<string, unknown> = {}) => ({
  entityId: "e1",
  sistema: 4,
  sistemaNome: "SIART",
  enviadoEm: "2026-09-22T09:00:00.000Z",
  tamanhoBytes: 1_048_576,
  corrompido: 0,
  envioFtp: true,
  erroBackup: false,
  erroRestore: false,
  ...over,
});

describe("painel de backups", () => {
  it("mostra só os quatro sistemas do relatório legado", () => {
    expect([...SISTEMAS_DO_PAINEL]).toEqual([1, 3, 4, 8]);
    const painel = buildPainelDeBackups({
      entidades: [entidade()],
      envios: [envio(), envio({ sistema: 7, sistemaNome: "Outro" })],
      atrasados: [],
      agora: AGORA,
      dias: 1,
    });
    expect(painel.enviados[0]!.backups.map((b) => b.sistema)).toEqual([4]);
  });

  it("separa quem enviou de quem não enviou, com o último backup de quem faltou", () => {
    const painel = buildPainelDeBackups({
      entidades: [entidade(), entidade({ id: "e2", codigo: 11, nome: "Câmara de Bataguassu", cidade: "Bataguassu" })],
      envios: [envio()],
      atrasados: [
        { entityId: "e2", entidade: "Câmara de Bataguassu", sistema: "SIART", ultimoEm: "2026-09-12T09:00:00.000Z" },
      ],
      agora: AGORA,
      dias: 1,
    });
    expect(painel.enviados.map((e) => e.nome)).toEqual(["Prefeitura de Selvíria"]);
    expect(painel.sem_backup).toEqual([
      {
        id: "e2",
        codigo: 11,
        nome: "Câmara de Bataguassu",
        cidade: "Bataguassu",
        uf: "MS",
        expira_em: null,
        ultimo_em: "2026-09-12T09:00:00.000Z",
        dias: 10,
      },
    ]);
  });

  it("ordena os sem backup pelo atraso, e quem nunca enviou vem primeiro", () => {
    const painel = buildPainelDeBackups({
      entidades: [
        entidade({ id: "a", codigo: 1, nome: "A" }),
        entidade({ id: "b", codigo: 2, nome: "B" }),
        entidade({ id: "c", codigo: 3, nome: "C" }),
      ],
      envios: [],
      atrasados: [
        { entityId: "a", entidade: "A", sistema: "SIART", ultimoEm: "2026-09-20T09:00:00.000Z" },
        { entityId: "b", entidade: "B", sistema: "SIART", ultimoEm: "2026-01-02T09:00:00.000Z" },
      ],
      agora: AGORA,
      dias: 1,
    });
    expect(painel.sem_backup.map((e) => e.nome)).toEqual(["C", "B", "A"]);
    expect(painel.sem_backup[0]!.dias).toBeNull();
  });

  it("conta o que o topo da TV mostra", () => {
    const painel = buildPainelDeBackups({
      entidades: [entidade(), entidade({ id: "e2", codigo: 11, nome: "B" })],
      envios: [envio(), envio({ sistema: 8, sistemaNome: "Integração" })],
      atrasados: [{ entityId: "e2", entidade: "B", sistema: "SIART", ultimoEm: "2026-09-02T09:00:00.000Z" }],
      agora: AGORA,
      dias: 1,
    });
    expect(painel.contadores).toEqual({
      entidades_atrasadas: 1,
      entidades_com_backup: 1,
      backups_recebidos: 2,
      maior_atraso_dias: 20,
      com_problema: 0,
    });
  });

  it("conta como problema o banco corrompido, o FTP não enviado e o erro de backup ou restore", () => {
    const painel = buildPainelDeBackups({
      entidades: [entidade()],
      envios: [
        envio({ sistema: 1, corrompido: 1 }),
        envio({ sistema: 3, envioFtp: false }),
        envio({ sistema: 4, erroRestore: true }),
        envio({ sistema: 8 }),
      ],
      atrasados: [],
      agora: AGORA,
      dias: 1,
    });
    expect(painel.contadores.com_problema).toBe(3);
    expect(painel.enviados[0]!.backups.map((b) => b.ok)).toEqual([false, false, false, true]);
  });

  it("filtra por UF e diz quais existem", () => {
    const painel = buildPainelDeBackups({
      entidades: [entidade(), entidade({ id: "e2", codigo: 11, nome: "B", uf: "MT", cidade: "Colniza" })],
      envios: [envio(), envio({ entityId: "e2" })],
      atrasados: [],
      agora: AGORA,
      dias: 1,
      uf: "mt",
    });
    expect(painel.uf).toBe("MT");
    expect(painel.ufs).toEqual(["MS", "MT"]);
    expect(painel.enviados.map((e) => e.nome)).toEqual(["B"]);
  });

  it("entidade sem código no legado fica de fora: o backup é do SAC", () => {
    const painel = buildPainelDeBackups({
      entidades: [entidade({ id: "x", codigo: null, nome: "Entidade nova" })],
      envios: [],
      atrasados: [],
      agora: AGORA,
      dias: 1,
    });
    expect(painel.sem_backup).toEqual([]);
    expect(painel.enviados).toEqual([]);
  });

  it("tamanho do arquivo no formato do relatório", () => {
    expect(formatTamanho(512)).toBe("512 B");
    expect(formatTamanho(2048)).toBe("2 KB");
    expect(formatTamanho(5_242_880)).toBe("5 MB");
    expect(formatTamanho(2_147_483_648)).toBe("2 GB");
  });
});
