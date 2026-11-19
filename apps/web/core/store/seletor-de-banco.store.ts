/**
 * O seletor de banco do "/banco" no editor: o comando do editor abre e diz o
 * que fazer com o banco escolhido; o modal mostra a busca.
 *
 * Um seletor POR EDITOR, montado junto dele: dentro do modal de solicitação, o
 * seletor precisa estar na árvore do modal, senão o clique nele conta como
 * "clique fora" e fecha o modal com o texto. O contador global diz ao peek que
 * há um seletor na tela (ele abre fora do peek e o clique nele não é sair).
 */
import { action, computed, makeObservable, observable } from "mobx";
import type { TBancoAnexoAttrs } from "@plane/editor";

type TAoEscolher = (attrs: TBancoAnexoAttrs) => void;

class SeletoresAbertos {
  quantidade = 0;

  constructor() {
    makeObservable(this, { quantidade: observable, add: action, remove: action, hasAlgum: computed });
  }

  add = () => {
    this.quantidade += 1;
  };

  remove = () => {
    this.quantidade = Math.max(0, this.quantidade - 1);
  };

  get hasAlgum(): boolean {
    return this.quantidade > 0;
  }
}

export const seletoresDeBancoAbertos = new SeletoresAbertos();

export class SeletorDeBanco {
  isOpen = false;
  private aoEscolher: TAoEscolher | null = null;

  constructor() {
    makeObservable(this, { isOpen: observable, open: action, close: action });
  }

  open = (aoEscolher: TAoEscolher) => {
    this.aoEscolher = aoEscolher;
    if (!this.isOpen) seletoresDeBancoAbertos.add();
    this.isOpen = true;
  };

  close = () => {
    this.aoEscolher = null;
    if (this.isOpen) seletoresDeBancoAbertos.remove();
    this.isOpen = false;
  };

  choose = (attrs: TBancoAnexoAttrs) => {
    this.aoEscolher?.(attrs);
    this.close();
  };
}
