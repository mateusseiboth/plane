/**
 * Comentários ainda em processamento, por chamado: a análise da IA e a gravação
 * levam alguns segundos, e quem fechava o chamado nesse meio tempo perdia o que
 * tinha escrito. O peek e a página consultam este registro antes de sair.
 *
 * É uma contagem, não um booleano: dois envios no mesmo chamado só liberam
 * quando os dois terminam.
 */
import { action, computed, makeObservable, observable } from "mobx";

export class ComentariosEmProcessamento {
  emAndamento = observable.map<string, number>();

  constructor() {
    makeObservable(this, {
      start: action,
      end: action,
      hasAlgumProcessando: computed,
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

  get hasAlgumProcessando(): boolean {
    return this.emAndamento.size > 0;
  }
}

export const comentariosEmProcessamento = new ComentariosEmProcessamento();
