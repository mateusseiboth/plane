/**
 * Regras de etapa da migração do SAC (scripts/migrate-sac.ts).
 *
 * **Triagem é chamado da Qualidade sem dono.** A primeira versão do importador
 * usava "passou pelo TI em algum momento" para separar Triagem de Em Teste, o
 * que jogava na Triagem chamado que já estava com alguém da Qualidade — a fila
 * de triagem virava a fila do setor inteiro.
 *
 * No legado o responsável de cada setor mora numa coluna própria
 * (`chamados_gdq`, `chamados_ti`, `chamados_ate`, `chamados_gp`), e nem sempre
 * aponta para alguém DAQUELE setor: só vale como dono da Qualidade quem é da
 * Qualidade.
 */
import { describe, expect, it } from "bun:test";
import {
  COLUNAS_RESPONSAVEL_SQL,
  RESPONSAVEL_POR_SETOR,
  ehSetorQualidade,
  stateNameForChamado,
} from "../../scripts/migrate-sac";

const SEM_DONO = false;
const COM_DONO = true;

describe("stateNameForChamado", () => {
  describe("encerrados", () => {
    it("vira Concluído independentemente do setor ou do dono", () => {
      for (const setor of ["gestao de qualidade", "TI", "atendimento", "cliente"]) {
        expect(stateNameForChamado("encerrado", setor, SEM_DONO)).toBe("Concluído");
        expect(stateNameForChamado("encerrado", setor, COM_DONO)).toBe("Concluído");
      }
      expect(stateNameForChamado("encerrado parcialmente", "gestao de qualidade", SEM_DONO)).toBe("Concluído");
    });

    it("ignora espaços e caixa da situação", () => {
      expect(stateNameForChamado("  ENCERRADO  ", "gestao de qualidade", COM_DONO)).toBe("Concluído");
    });
  });

  describe("Qualidade — o ponto da mudança", () => {
    it("sem dono da Qualidade vai para Triagem", () => {
      expect(stateNameForChamado("em andamento", "gestao de qualidade", SEM_DONO)).toBe("Triagem");
    });

    it("com dono da Qualidade vai para Em Análise", () => {
      expect(stateNameForChamado("em andamento", "gestao de qualidade", COM_DONO)).toBe("Em Análise");
    });

    it("vale também para 'aguardando resposta'", () => {
      expect(stateNameForChamado("aguardando resposta", "gestao de qualidade", SEM_DONO)).toBe("Triagem");
      expect(stateNameForChamado("aguardando resposta", "gestao de qualidade", COM_DONO)).toBe("Em Análise");
    });
  });

  describe("demais setores", () => {
    it("TI vai para Em Desenvolvimento", () => {
      expect(stateNameForChamado("em andamento", "TI", SEM_DONO)).toBe("Em Desenvolvimento");
    });

    it("o dono não muda a etapa fora da Qualidade", () => {
      for (const setor of ["TI", "atendimento", "gestao de projetos", "representante"]) {
        expect(stateNameForChamado("em andamento", setor, SEM_DONO)).toBe(
          stateNameForChamado("em andamento", setor, COM_DONO),
        );
      }
    });

    it("setor desconhecido cai em Em Desenvolvimento em vez de sumir", () => {
      expect(stateNameForChamado("em andamento", "Escolha", SEM_DONO)).toBe("Em Desenvolvimento");
      expect(stateNameForChamado("em andamento", "", SEM_DONO)).toBe("Em Desenvolvimento");
    });
  });
});

describe("ehSetorQualidade", () => {
  it("reconhece o rótulo do legado e suas variações", () => {
    for (const setor of ["gestao de qualidade", "Gestão de Qualidade", "  QUALIDADE ", "quality assurance"]) {
      expect(ehSetorQualidade(setor)).toBe(true);
    }
  });

  it("não confunde com os outros setores", () => {
    for (const setor of ["TI", "atendimento", "gestao de projetos", "representante", "cliente", ""]) {
      expect(ehSetorQualidade(setor)).toBe(false);
    }
  });
});

describe("RESPONSAVEL_POR_SETOR", () => {
  it("aponta a coluna certa de cada setor", () => {
    expect(RESPONSAVEL_POR_SETOR("gestao de qualidade")).toBe("chamados_gdq");
    expect(RESPONSAVEL_POR_SETOR("TI")).toBe("chamados_ti");
    expect(RESPONSAVEL_POR_SETOR("atendimento")).toBe("chamados_ate");
    expect(RESPONSAVEL_POR_SETOR("gestao de projetos")).toBe("chamados_gp");
  });

  it("setor sem responsável próprio devolve undefined", () => {
    expect(RESPONSAVEL_POR_SETOR("cliente")).toBeUndefined();
    expect(RESPONSAVEL_POR_SETOR("representante")).toBeUndefined();
    expect(RESPONSAVEL_POR_SETOR("")).toBeUndefined();
  });

  it("'TI' não captura setores que apenas contêm as letras t-i", () => {
    // "atendimento" contém "ti"; se o padrão do TI fosse frouxo, o responsável
    // do atendimento seria lido da coluna errada.
    expect(RESPONSAVEL_POR_SETOR("atendimento")).toBe("chamados_ate");
  });
});

describe("COLUNAS_RESPONSAVEL_SQL", () => {
  /**
   * O SELECT dos chamados é montado a partir do mapa de setores. Listar as
   * colunas à mão fez a primeira versão trazer só `chamados_gdq`: os demais
   * setores chegavam `undefined` e o importador gravou 9.432 responsáveis em
   * vez de ~37.000, sem erro nenhum.
   */
  it("traz uma coluna para cada setor com responsável", () => {
    for (const setor of ["gestao de qualidade", "TI", "atendimento", "gestao de projetos"]) {
      expect(COLUNAS_RESPONSAVEL_SQL).toContain(`c.${RESPONSAVEL_POR_SETOR(setor)}`);
    }
  });

  it("é uma lista pronta para o SELECT, sem duplicatas", () => {
    const colunas = COLUNAS_RESPONSAVEL_SQL.split(", ");
    expect(colunas).toEqual([...new Set(colunas)]);
    expect(colunas.every((c) => c.startsWith("c.chamados_"))).toBe(true);
  });
});
