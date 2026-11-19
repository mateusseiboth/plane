/**
 * O que se perde ao fechar o chamado, por chamado: comentário em processamento
 * (a análise da IA e a gravação levam alguns segundos) e comentário escrito e
 * ainda não enviado. Quem fechava o peek nesses casos perdia o texto sem aviso.
 * O peek e a página consultam este registro antes de sair.
 *
 * O processamento é uma contagem, não um booleano: dois envios no mesmo chamado
 * só liberam quando os dois terminam.
 */
import { action, computed, makeObservable, observable } from "mobx";

export type TAvisoDeSaida = "processando" | "rascunho";

export class ComentariosEmProcessamento {
  emAndamento = observable.map<string, number>();
  rascunhos = observable.set<string>();

  constructor() {
    makeObservable(this, {
      start: action,
      end: action,
      setRascunho: action,
      hasAlgumProcessando: computed,
      hasAlgoParaPerder: computed,
    });
  }

  start = (issueId: string) => {
    this.emAndamento.set(issueId, (this.emAndamento.get(issueId) ?? 0) + 1);
  };

  end = (issueId: string) => {
    const restantes = (this.emAndamento.get(issueId) ?? 0) - 1;
    if (restantes > 0) {
      this.emAndamento.set(issueId, restantes);
      return;
    }
    this.emAndamento.delete(issueId);
  };

  isProcessando = (issueId: string): boolean => this.emAndamento.has(issueId);

  setRascunho = (issueId: string, hasTexto: boolean) => {
    if (hasTexto) {
      this.rascunhos.add(issueId);
      return;
    }
    this.rascunhos.delete(issueId);
  };

  /** Esperar vence descartar: com o envio em curso, o aviso é para aguardar. */
  readAvisoDeSaida = (issueId: string): TAvisoDeSaida | null => {
    if (this.isProcessando(issueId)) return "processando";
    if (this.rascunhos.has(issueId)) return "rascunho";
    return null;
  };

  get hasAlgumProcessando(): boolean {
    return this.emAndamento.size > 0;
  }

  get hasAlgoParaPerder(): boolean {
    return this.hasAlgumProcessando || this.rascunhos.size > 0;
  }
}

export const comentariosEmProcessamento = new ComentariosEmProcessamento();
