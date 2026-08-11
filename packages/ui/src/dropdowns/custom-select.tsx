/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Combobox } from "@headlessui/react";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import { useOutsideClickDetector } from "@plane/hooks";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "@plane/propel/icons";
// plane helpers
// hooks
import { useDropdownKeyDown } from "../hooks/use-dropdown-key-down";
// helpers
import { cn } from "../utils";
// types
import type { ICustomSelectItemProps, ICustomSelectProps } from "./helper";

// Context to share the close handler with option components
const DropdownContext = createContext<() => void>(() => {});

/**
 * A partir de quantas opções a caixa de busca aparece sozinha.
 *
 * Lista curta (prioridade, sim/não) não ganha nada com busca e só fica com um
 * campo a mais para o olho percorrer. O `searchable` força o comportamento nos
 * dois sentidos quando o chamador sabe melhor.
 */
const MINIMO_PARA_BUSCA = 6;

/**
 * Texto pesquisável de uma opção.
 *
 * As opções do CustomSelect são JSX arbitrário (ícone + rótulo + contador), não
 * uma lista de `{value, label}`. Para filtrar sem obrigar todas as 34 telas que
 * usam este componente a mudar de API, o texto é extraído da própria árvore
 * renderizada. Quem tiver rótulo só em ícone pode passar `query` na opção.
 */
const textoDoNo = (no: React.ReactNode): string => {
  if (no === null || no === undefined || typeof no === "boolean") return "";
  if (typeof no === "string" || typeof no === "number") return String(no);
  if (Array.isArray(no)) return no.map(textoDoNo).join(" ");
  if (React.isValidElement(no)) return textoDoNo((no.props as { children?: React.ReactNode }).children);
  return "";
};

function CustomSelect(props: ICustomSelectProps) {
  const {
    customButtonClassName = "",
    buttonClassName = "",
    placement,
    children,
    className = "",
    customButton,
    disabled = false,
    input = false,
    label,
    maxHeight = "md",
    noChevron = false,
    onChange,
    optionsClassName = "",
    value,
    tabIndex,
    searchable,
    searchPlaceholder = "Buscar",
    noResultsMessage = "Nada encontrado",
  } = props;
  // states
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [busca, setBusca] = useState("");
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const buscaRef = useRef<HTMLInputElement | null>(null);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
  });

  const openDropdown = useCallback(() => {
    setIsOpen(true);
    if (referenceElement) referenceElement.focus();
  }, [referenceElement]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setBusca("");
  }, []);
  const handleKeyDown = useDropdownKeyDown(openDropdown, closeDropdown, isOpen);
  useOutsideClickDetector(dropdownRef, closeDropdown);

  const toggleDropdown = useCallback(() => {
    if (isOpen) closeDropdown();
    else openDropdown();
  }, [closeDropdown, isOpen, openDropdown]);

  const opcoes = React.Children.toArray(children).filter(React.isValidElement);
  const mostrarBusca = searchable ?? opcoes.length >= MINIMO_PARA_BUSCA;
  // Sem busca ativa renderiza `children` como veio: opções não-elemento
  // (separadores, strings) continuam aparecendo exatamente como antes.
  const opcoesVisiveis = !busca
    ? children
    : opcoes.filter((opcao) => {
        const { query, children: conteudo } = opcao.props as { query?: string; children?: React.ReactNode };
        return (query ?? textoDoNo(conteudo)).toLowerCase().includes(busca.toLowerCase());
      });
  const vazio = busca !== "" && Array.isArray(opcoesVisiveis) && opcoesVisiveis.length === 0;

  // `openDropdown` devolve o foco ao botão; sem trazê-lo para cá, abrir e
  // começar a digitar não escreve em lugar nenhum. O portal só existe depois da
  // renderização, então o foco vai num efeito.
  useEffect(() => {
    if (isOpen && mostrarBusca) buscaRef.current?.focus();
  }, [isOpen, mostrarBusca]);

  return (
    <DropdownContext.Provider value={closeDropdown}>
      <Combobox
        as="div"
        ref={dropdownRef}
        tabIndex={tabIndex}
        value={value}
        onChange={(val) => {
          onChange?.(val);
          closeDropdown();
        }}
        className={cn("relative flex-shrink-0 text-left", className)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      >
        <>
          {customButton ? (
            <Combobox.Button as={React.Fragment}>
              <button
                ref={setReferenceElement}
                type="button"
                className={`flex items-center justify-between gap-1 rounded text-11 ${
                  disabled ? "cursor-not-allowed text-secondary" : "cursor-pointer hover:bg-layer-transparent-hover"
                } ${customButtonClassName}`}
                onClick={toggleDropdown}
              >
                {customButton}
              </button>
            </Combobox.Button>
          ) : (
            <Combobox.Button as={React.Fragment}>
              <button
                ref={setReferenceElement}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-1 rounded border border-strong",
                  {
                    "px-3 py-2 text-13": input,
                    "px-2 py-1 text-11": !input,
                    "cursor-not-allowed text-secondary": disabled,
                    "cursor-pointer hover:bg-layer-transparent-hover": !disabled,
                  },
                  buttonClassName
                )}
                onClick={toggleDropdown}
              >
                {label}
                {!noChevron && !disabled && <ChevronDownIcon className="h-3 w-3" aria-hidden="true" />}
              </button>
            </Combobox.Button>
          )}
        </>
        {isOpen &&
          createPortal(
            <Combobox.Options data-prevent-outside-click>
              <div
                // Portal no body: precisa passar por cima de modal (z-50),
                // senão o select abre atrás da janela que o contém.
                className={cn(
                  "z-[60] my-1 min-w-48 overflow-y-scroll rounded-md border-[0.5px] border-subtle-1 bg-surface-1 px-2 py-2.5 text-11 whitespace-nowrap focus:outline-none",
                  optionsClassName
                )}
                ref={setPopperElement}
                style={styles.popper}
                {...attributes.popper}
              >
                {mostrarBusca && (
                  <div className="mb-2 flex items-center gap-1.5 rounded-sm border border-subtle px-2">
                    <SearchIcon className="h-3.5 w-3.5 shrink-0 text-placeholder" strokeWidth={1.5} />
                    <Combobox.Input
                      ref={buscaRef}
                      className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder={searchPlaceholder}
                      displayValue={() => busca}
                    />
                  </div>
                )}
                <div
                  className={cn("space-y-1 overflow-y-scroll", {
                    "max-h-60": maxHeight === "lg",
                    "max-h-48": maxHeight === "md",
                    "max-h-36": maxHeight === "rg",
                    "max-h-28": maxHeight === "sm",
                  })}
                >
                  {vazio ? <p className="px-1 py-1.5 text-placeholder italic">{noResultsMessage}</p> : opcoesVisiveis}
                </div>
              </div>
            </Combobox.Options>,
            document.body
          )}
      </Combobox>
    </DropdownContext.Provider>
  );
}

function Option(props: ICustomSelectItemProps) {
  const { children, value, className } = props;
  const closeDropdown = useContext(DropdownContext);

  const handleClick = useCallback(() => {
    // Close dropdown for both new and already-selected options.
    // Use setTimeout to ensure HeadlessUI's onChange handler fires first for new selections.
    // For already-selected options, this ensures the dropdown closes since onChange won't fire.
    setTimeout(() => {
      closeDropdown();
    }, 0);
  }, [closeDropdown]);

  return (
    <Combobox.Option
      value={value}
      className={({ active }) =>
        cn(
          "flex cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 text-secondary select-none",
          {
            "bg-layer-transparent-hover": active,
          },
          className
        )
      }
      onClick={handleClick}
    >
      {({ selected }) => (
        <div className="flex w-full items-center justify-between gap-2">
          {children}
          {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
        </div>
      )}
    </Combobox.Option>
  );
}

CustomSelect.Option = Option;

export { CustomSelect };
