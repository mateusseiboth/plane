/**
 * Um dos dois lados da comparação "Melhorar com IA", com as diferenças
 * realçadas.
 *
 * A mesma lista de trechos alimenta as duas colunas: o lado do autor mostra o
 * que é igual e o que **saiu**; o lado da IA, o que é igual e o que **entrou**.
 * Vem da mesma comparação, então as duas colunas contam a mesma história — o
 * que some de um lado é exatamente o que aparece no outro.
 */
// plane imports
import { cn } from "@plane/utils";
// helpers
import type { TTipoDeTrecho, TTrechoDeDiferenca } from "@/helpers/diferenca-de-texto.helper";

/** O lado do autor mostra o que saiu; o da IA, o que entrou. */
type TLado = Exclude<TTipoDeTrecho, "igual">;

const REALCE: Record<TTipoDeTrecho, string> = {
  igual: "",
  saiu: "rounded-sm bg-danger-subtle text-danger-primary line-through decoration-1",
  entrou: "rounded-sm bg-success-subtle text-success-primary",
};

type TTextoComDiferencasProps = {
  trechos: TTrechoDeDiferenca[];
  lado: TLado;
  className?: string;
};

export const TextoComDiferencas = (props: TTextoComDiferencasProps) => {
  const { trechos, lado, className } = props;

  // A posição em que cada trecho começa é a única identidade estável que ele
  // tem: dois trechos podem repetir tipo e texto, jamais o ponto de partida.
  let posicao = 0;
  const visiveis = trechos
    .filter((trecho) => trecho.tipo === "igual" || trecho.tipo === lado)
    .map((trecho) => {
      const chave = `${posicao}-${trecho.tipo}`;
      posicao += trecho.texto.length;
      return { chave, tipo: trecho.tipo, texto: trecho.texto };
    });

  if (visiveis.length === 0)
    return <p className={cn("text-13 italic text-placeholder", className)}>Sem texto deste lado.</p>;

  return (
    <p className={cn("whitespace-pre-wrap break-words text-13 leading-relaxed text-secondary", className)}>
      {visiveis.map((trecho) => (
        <span key={trecho.chave} className={REALCE[trecho.tipo]}>
          {trecho.texto}
        </span>
      ))}
    </p>
  );
};
