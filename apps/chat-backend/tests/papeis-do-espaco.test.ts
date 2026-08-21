/**
 * Quem é atendente, no modelo de papéis DESTE fork.
 *
 * O chat nasceu perguntando `role >= 15` — no Plane original isso era "membro ou
 * acima". Aqui a Quality criou papéis abaixo disso: Atendimento (6), Qualidade
 * (8) e TI (12). O papel chamado *Atendimento* é exatamente quem atende, e era
 * o único que a lista de atendentes não mostrava: a pessoa entrava, ficava
 * conectada e não existia para o transferir nem para a fila.
 */
import { describe, expect, it } from "bun:test";
import { PAPEL, ehAdmin, ehAtendente, podeGerenciar } from "@/papeis";

describe("ehAtendente", () => {
  it("aceita quem tem o papel Atendimento", () => {
    expect(ehAtendente(PAPEL.ATENDIMENTO)).toBe(true);
  });

  it("aceita Qualidade, TI, membro, gestor e admin", () => {
    for (const papel of [PAPEL.QUALIDADE, PAPEL.TI, PAPEL.MEMBRO, PAPEL.GESTOR, PAPEL.ADMIN]) {
      expect(ehAtendente(papel)).toBe(true);
    }
  });

  it("recusa convidado e quem não é do espaço de trabalho", () => {
    expect(ehAtendente(PAPEL.CONVIDADO)).toBe(false);
    expect(ehAtendente(0)).toBe(false);
  });
});

describe("podeGerenciar", () => {
  it("vale de membro para cima — quem transfere e lê relatórios", () => {
    expect(podeGerenciar(PAPEL.MEMBRO)).toBe(true);
    expect(podeGerenciar(PAPEL.GESTOR)).toBe(true);
    expect(podeGerenciar(PAPEL.ADMIN)).toBe(true);
  });

  it("não vale para quem só atende", () => {
    expect(podeGerenciar(PAPEL.ATENDIMENTO)).toBe(false);
    expect(podeGerenciar(PAPEL.QUALIDADE)).toBe(false);
    expect(podeGerenciar(PAPEL.TI)).toBe(false);
  });
});

describe("ehAdmin", () => {
  it("é só o administrador do espaço", () => {
    expect(ehAdmin(PAPEL.ADMIN)).toBe(true);
    expect(ehAdmin(PAPEL.GESTOR)).toBe(false);
    expect(ehAdmin(PAPEL.ATENDIMENTO)).toBe(false);
  });
});
