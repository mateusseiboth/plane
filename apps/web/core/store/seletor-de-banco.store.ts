/**
 * O seletor de banco do "/banco" no editor: o comando do editor abre e diz o
 * que fazer com o banco escolhido; o modal (montado no espaço de trabalho)
 * mostra a busca. Um só seletor aberto por vez.
 */
import { action, makeObservable, observable } from "mobx";
import type { TBancoAnexoAttrs } from "@plane/editor";

type TAoEscolher = (attrs: TBancoAnexoAttrs) => void;

export class SeletorDeBanco {
  isOpen = false;
  private aoEscolher: TAoEscolher | null = null;

  constructor() {
    makeObservable(this, { isOpen: observable, open: action, close: action });
  }

  open = (aoEscolher: TAoEscolher) => {
    this.aoEscolher = aoEscolher;
    this.isOpen = true;
  };

  close = () => {
    this.aoEscolher = null;
    this.isOpen = false;
  };

  choose = (attrs: TBancoAnexoAttrs) => {
    this.aoEscolher?.(attrs);
    this.close();
  };
}

export const seletorDeBanco = new SeletorDeBanco();
