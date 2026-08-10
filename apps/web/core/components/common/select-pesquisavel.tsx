/**
 * Select do design system a partir de uma lista de opções.
 *
 * Existe para tirar do caminho os dois problemas do `<select>` nativo, que
 * ainda estava espalhado por várias telas:
 *
 *   1. **não dá para pesquisar** — em lista de 8, 20, 269 itens o usuário
 *      precisa rolar procurando com o olho;
 *   2. **ignora o tema** — o navegador pinta a lista de opções de branco, e no
 *      modo escuro a letra branca some no fundo branco.
 *
 * A busca vem do próprio `CustomSelect`, que a mostra sozinho quando a lista é
 * longa. `searchable` força nos dois sentidos.
 */
import type { ReactNode } from "react";
import { CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";

export type TOpcaoSelect<T> = {
  value: T;
  label: string;
  /** Segunda linha da opção (cidade, tipo, código). Também entra na busca. */
  descricao?: string;
  disabled?: boolean;
};

type Props<T> = {
  value: T;
  onChange: (valor: T) => void;
  opcoes: TOpcaoSelect<T>[];
  /** Rótulo do botão quando nada está selecionado. */
  placeholder?: string;
  /** Quando informado, adiciona uma opção no topo que limpa a seleção. */
  opcaoVazia?: { value: T; label: string };
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  maxHeight?: "sm" | "rg" | "md" | "lg" | "xl" | "2xl";
};

export function SelectPesquisavel<T extends string | number | null>(props: Props<T>) {
  const {
    value,
    onChange,
    opcoes,
    placeholder = "Selecione",
    opcaoVazia,
    label,
    disabled = false,
    className,
    buttonClassName,
    searchable,
    searchPlaceholder,
    maxHeight = "lg",
  } = props;

  const selecionada = opcoes.find((o) => o.value === value);
  const rotulo = label ?? (selecionada?.label ?? (opcaoVazia?.value === value ? opcaoVazia.label : placeholder));

  return (
    <CustomSelect
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={className}
      maxHeight={maxHeight}
      searchable={searchable}
      searchPlaceholder={searchPlaceholder}
      buttonClassName={cn(
        "h-9 w-full rounded border border-subtle bg-surface-2 px-3 text-13 text-primary",
        !selecionada && "text-secondary",
        buttonClassName
      )}
      label={<span className="truncate">{rotulo}</span>}
      input
    >
      {opcaoVazia && (
        <CustomSelect.Option value={opcaoVazia.value} query={opcaoVazia.label}>
          <span className="text-secondary">{opcaoVazia.label}</span>
        </CustomSelect.Option>
      )}
      {opcoes.map((opcao) => (
        <CustomSelect.Option
          key={String(opcao.value)}
          value={opcao.value}
          query={`${opcao.label} ${opcao.descricao ?? ""}`}
          className={cn(opcao.disabled && "pointer-events-none opacity-50")}
        >
          <div className="min-w-0">
            <p className="truncate">{opcao.label}</p>
            {opcao.descricao && <p className="truncate text-11 text-secondary">{opcao.descricao}</p>}
          </div>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
}
