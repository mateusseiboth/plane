/**
 * Ponte entre o SWR (React) e a extensão de texto fantasma (ProseMirror).
 *
 * O editor do `@plane/editor` monta as extensões uma única vez — trocar o array
 * depois não recria nada. Por isso a extensão não recebe a sugestão como valor:
 * recebe uma *fonte* estável, dona do próprio estado, que avisa o ProseMirror
 * sempre que a sugestão muda.
 */
import { useEffect, useMemo } from "react";
import { createGhostTextExtension } from "@plane/editor";
import type { TGhostTextSource } from "@plane/editor";

type TFonteControlavel = TGhostTextSource & {
  /** Publica a sugestão vinda da IA, respeitando o que já foi recusado. */
  publicar: (sugestao: string) => void;
};

const criarFonte = (): TFonteControlavel => {
  const ouvintes = new Set<() => void>();
  let texto = "";
  // sugestão recusada com Esc: não voltar a mostrar exatamente a mesma
  let descartada = "";

  const avisar = () => ouvintes.forEach((ouvinte) => ouvinte());

  const definir = (novo: string) => {
    if (texto === novo) return;
    texto = novo;
    avisar();
  };

  return {
    getSnapshot: () => texto,
    subscribe: (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
    onAccept: () => {
      texto = "";
      descartada = "";
      // fora da tecla que disparou: despachar dentro do comando quebra o editor
      queueMicrotask(avisar);
    },
    onDismiss: (recusada) => {
      texto = "";
      descartada = recusada;
      queueMicrotask(avisar);
    },
    publicar: (sugestao) => definir(sugestao === descartada ? "" : sugestao),
  };
};

export const useTextoFantasmaEditor = (sugestao: string) => {
  const fonte = useMemo(criarFonte, []);

  useEffect(() => {
    fonte.publicar(sugestao);
  }, [fonte, sugestao]);

  /** Estável de propósito: o editor lê o array só na criação. */
  const extensoes = useMemo(() => [createGhostTextExtension(fonte)], [fonte]);

  return { extensoes };
};
