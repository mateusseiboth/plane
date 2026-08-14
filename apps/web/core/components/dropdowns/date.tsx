/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useId, useRef, useState } from "react";
import { observer } from "mobx-react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import { CalendarDays, Clock } from "lucide-react";
import { Combobox } from "@headlessui/react";
// ui
import type { Matcher } from "@plane/propel/calendar";
import { Calendar } from "@plane/propel/calendar";
import { CloseIcon } from "@plane/propel/icons";
import { Input } from "@plane/propel/input";
import { ComboDropDown } from "@plane/ui";
import { cn, getDateTime, renderFormattedDateTime, renderFormattedTime } from "@plane/utils";
// helpers
// hooks
import { useUserProfile } from "@/hooks/store/user";
import { useDropdown } from "@/hooks/use-dropdown";
// components
import { DropdownButton } from "./buttons";
// constants
import { BUTTON_VARIANTS_WITH_TEXT } from "./constants";
// types
import type { TDropdownProps } from "./types";

type Props = TDropdownProps & {
  clearIconClassName?: string;
  defaultOpen?: boolean;
  optionsClassName?: string;
  icon?: React.ReactNode;
  isClearable?: boolean;
  minDate?: Date;
  maxDate?: Date;
  onChange: (val: Date | null) => void;
  onClose?: () => void;
  value: Date | string | null;
  closeOnSelect?: boolean;
  formatToken?: string;
  renderByDefault?: boolean;
  labelClassName?: string;
  /** Habilita a escolha de hora e minuto além do dia (prazos de poucas horas). */
  showTime?: boolean;
};

export const DateDropdown = observer(function DateDropdown(props: Props) {
  const {
    buttonClassName = "",
    buttonContainerClassName,
    buttonVariant,
    className = "",
    clearIconClassName = "",
    defaultOpen = false,
    optionsClassName = "",
    closeOnSelect = true,
    disabled = false,
    hideIcon = false,
    icon = <CalendarDays className="h-3 w-3 flex-shrink-0" />,
    isClearable = true,
    minDate,
    maxDate,
    onChange,
    onClose,
    placeholder = "Date",
    placement,
    showTooltip = false,
    tabIndex,
    value,
    formatToken,
    renderByDefault = true,
    labelClassName = "",
    showTime = false,
  } = props;
  // states
  const [isOpen, setIsOpen] = useState(defaultOpen);
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const timeInputId = useId();
  // hooks
  const { data } = useUserProfile();
  const startOfWeek = data?.start_of_the_week;
  // popper-js refs
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  // popper-js init
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [
      {
        name: "preventOverflow",
        options: {
          padding: 12,
        },
      },
    ],
  });

  const isDateSelected = value && value.toString().trim() !== "";

  const onOpen = () => {
    if (referenceElement) referenceElement.focus();
  };

  const { handleClose, handleKeyDown, handleOnClick } = useDropdown({
    dropdownRef,
    isOpen,
    onClose,
    onOpen,
    setIsOpen,
  });

  const dropdownOnChange = (val: Date | null) => {
    onChange(val);
    if (closeOnSelect) {
      handleClose();
      referenceElement?.blur();
    }
  };

  const selectedDate = getDateTime(value);

  const handleDaySelect = (date: Date | null) => {
    // Sem hora no seletor o comportamento antigo continua: escolheu o dia, fecha.
    if (!showTime || !date) return dropdownOnChange(date);

    // Trocar o dia não pode apagar a hora que a pessoa já escolheu, e o dropdown
    // fica aberto porque ainda falta a metade do valor.
    date.setHours(selectedDate?.getHours() ?? 0, selectedDate?.getMinutes() ?? 0, 0, 0);
    onChange(date);
  };

  const handleTimeChange = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    // O input de hora devolve "" quando é limpo; aí não há o que aplicar.
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;

    const nextDate = new Date(selectedDate ?? new Date());
    nextDate.setHours(hours, minutes, 0, 0);
    onChange(nextDate);
  };

  const disabledDays: Matcher[] = [];
  if (minDate) disabledDays.push({ before: minDate });
  if (maxDate) disabledDays.push({ after: maxDate });

  const comboButton = (
    <button
      type="button"
      className={cn(
        "clickable block h-full max-w-full outline-none",
        {
          "cursor-not-allowed text-secondary": disabled,
          "cursor-pointer": !disabled,
        },
        buttonContainerClassName
      )}
      ref={setReferenceElement}
      onClick={handleOnClick}
      disabled={disabled}
    >
      <DropdownButton
        className={buttonClassName}
        isActive={isOpen}
        tooltipHeading={placeholder}
        tooltipContent={value ? renderFormattedDateTime(value, formatToken) : "None"}
        showTooltip={showTooltip}
        variant={buttonVariant}
        renderToolTipByDefault={renderByDefault}
      >
        {!hideIcon && icon}
        {BUTTON_VARIANTS_WITH_TEXT.includes(buttonVariant) && (
          <span className={cn("flex-grow truncate text-left text-body-xs-medium", labelClassName)}>
            {value ? renderFormattedDateTime(value, formatToken) : placeholder}
          </span>
        )}
        {isClearable && !disabled && isDateSelected && (
          <CloseIcon
            className={cn("h-2.5 w-2.5 flex-shrink-0", clearIconClassName)}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onChange(null);
            }}
          />
        )}
      </DropdownButton>
    </button>
  );

  return (
    <ComboDropDown
      as="div"
      ref={dropdownRef}
      tabIndex={tabIndex}
      className={cn("h-full", className)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          if (!isOpen) handleKeyDown(e);
        } else handleKeyDown(e);
      }}
      button={comboButton}
      disabled={disabled}
      renderByDefault={renderByDefault}
    >
      {isOpen &&
        createPortal(
          <Combobox.Options data-prevent-outside-click static>
            <div
              className={cn(
                "z-30 my-1 overflow-hidden rounded-md border-[0.5px] border-strong bg-surface-1 shadow-raised-200",
                optionsClassName
              )}
              ref={setPopperElement}
              style={styles.popper}
              {...attributes.popper}
            >
              <Calendar
                className="rounded-md border border-subtle p-3"
                captionLayout="dropdown"
                selected={selectedDate}
                defaultMonth={selectedDate}
                onSelect={(date: Date | undefined) => {
                  handleDaySelect(date ?? null);
                }}
                showOutsideDays
                initialFocus
                disabled={disabledDays}
                mode="single"
                fixedWeeks
                weekStartsOn={startOfWeek}
              />
              {showTime && (
                <div className="flex items-center gap-2 border-t border-subtle px-3 py-2">
                  <Clock className="size-3.5 shrink-0 text-tertiary" />
                  <label className="grow text-caption-sm-regular text-secondary" htmlFor={timeInputId}>
                    Horário
                  </label>
                  <Input
                    id={timeInputId}
                    type="time"
                    inputSize="xs"
                    className="w-24"
                    value={selectedDate ? renderFormattedTime(selectedDate) : ""}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    onKeyDown={(e) => {
                      // O input de hora usa Tab e as setas para andar entre os campos
                      // de hora e minuto; se esses eventos subirem, o dropdown fecha
                      // no meio da digitação. Só o Esc continua chegando lá.
                      if (e.key !== "Escape") e.stopPropagation();
                    }}
                  />
                </div>
              )}
            </div>
          </Combobox.Options>,
          document.body
        )}
    </ComboDropDown>
  );
});
