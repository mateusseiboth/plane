/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useId, useRef, useState } from "react";
import type { Placement } from "@popperjs/core";
import { observer } from "mobx-react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import { ArrowRight, CalendarDays, Clock } from "lucide-react";
import { Combobox } from "@headlessui/react";
// plane imports
import { useTranslation } from "@plane/i18n";
// ui
import type { DateRange, Matcher } from "@plane/propel/calendar";
import { Calendar } from "@plane/propel/calendar";
import { CloseIcon, DueDatePropertyIcon } from "@plane/propel/icons";
import { Input } from "@plane/propel/input";
import { ComboDropDown } from "@plane/ui";
import { cn, renderFormattedDate, renderFormattedDateTime, renderFormattedTime } from "@plane/utils";
// helpers
// hooks
import { useUserProfile } from "@/hooks/store/user";
import { useDropdown } from "@/hooks/use-dropdown";
// components
import { DropdownButton } from "./buttons";
import { MergedDateDisplay } from "./merged-date";
// types
import type { TButtonVariants } from "./types";

type Props = {
  applyButtonText?: string;
  bothRequired?: boolean;
  buttonClassName?: string;
  buttonContainerClassName?: string;
  buttonFromDateClassName?: string;
  buttonToDateClassName?: string;
  buttonVariant: TButtonVariants;
  cancelButtonText?: string;
  className?: string;
  clearIconClassName?: string;
  disabled?: boolean;
  hideIcon?: {
    from?: boolean;
    to?: boolean;
  };
  isClearable?: boolean;
  mergeDates?: boolean;
  minDate?: Date;
  maxDate?: Date;
  onSelect?: (range: DateRange | undefined) => void;
  placeholder?: {
    from?: string;
    to?: string;
  };
  placement?: Placement;
  required?: boolean;
  showTooltip?: boolean;
  tabIndex?: number;
  value: {
    from: Date | undefined;
    to: Date | undefined;
  };
  renderByDefault?: boolean;
  renderPlaceholder?: boolean;
  customTooltipContent?: React.ReactNode;
  customTooltipHeading?: string;
  defaultOpen?: boolean;
  renderInPortal?: boolean;
  /**
   * Habilita a escolha de hora e minuto no FIM do intervalo (o vencimento).
   * O início continua só-dia: `start_date` é sempre meia-noite. Desligado por
   * padrão — ciclos e módulos usam o mesmo componente e não têm hora.
   */
  showTime?: boolean;
};

/**
 * Aplica "HH:mm" a um dia sem tocar no resto dele.
 * Devolve undefined enquanto o campo de hora estiver incompleto (o input
 * `type="time"` manda "" no meio da digitação), para não gravar um valor pela metade.
 */
const applyTimeToDate = (date: Date, time: string): Date | undefined => {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;

  const dateWithTime = new Date(date);
  dateWithTime.setHours(hours, minutes, 0, 0);
  return dateWithTime;
};

export const DateRangeDropdown = observer(function DateRangeDropdown(props: Props) {
  const { t } = useTranslation();
  const {
    buttonClassName,
    buttonContainerClassName,
    buttonFromDateClassName,
    buttonToDateClassName,
    buttonVariant,
    className,
    clearIconClassName = "",
    disabled = false,
    hideIcon = {
      from: true,
      to: true,
    },
    isClearable = false,
    mergeDates,
    minDate,
    maxDate,
    onSelect,
    placeholder = {
      from: t("project_cycles.add_date"),
      to: t("project_cycles.add_date"),
    },
    placement,
    showTooltip = false,
    tabIndex,
    value,
    renderByDefault = true,
    renderPlaceholder = true,
    customTooltipContent,
    customTooltipHeading,
    defaultOpen = false,
    renderInPortal = false,
    showTime = false,
  } = props;
  // states
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [dateRange, setDateRange] = useState<DateRange>(value);
  /**
   * A hora vive separada do intervalo de propósito. O calendário devolve sempre
   * dias à meia-noite e, ao começar um novo intervalo, chega a zerar o fim —
   * derivar a hora de `dateRange.to` a perderia no meio da seleção. Aqui ela
   * sobrevive aos cliques e ainda pode ser escolhida antes dos dias.
   */
  const [endTime, setEndTime] = useState<string>(() => (value.to ? renderFormattedTime(value.to) : ""));
  // hooks
  const { data } = useUserProfile();
  const startOfWeek = data?.start_of_the_week;
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const timeInputId = useId();
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

  const onOpen = () => {
    if (referenceElement) referenceElement.focus();
  };

  const { handleKeyDown, handleOnClick } = useDropdown({
    dropdownRef,
    isOpen,
    onOpen,
    setIsOpen,
  });

  const disabledDays: Matcher[] = [];
  if (minDate) disabledDays.push({ before: minDate });
  if (maxDate) disabledDays.push({ after: maxDate });

  const clearDates = () => {
    const clearedRange = { from: undefined, to: undefined };
    setDateRange(clearedRange);
    setEndTime("");
    onSelect?.(clearedRange);
  };

  const handleRangeSelect = (range: DateRange | undefined) => {
    // Sem hora no seletor o comportamento antigo continua intacto.
    if (!showTime || !range?.to) return onSelect?.(range);
    // Trocar o dia do prazo não pode apagar a hora que a pessoa já escolheu.
    onSelect?.({ ...range, to: applyTimeToDate(range.to, endTime) ?? range.to });
  };

  const handleTimeChange = (time: string) => {
    setEndTime(time);
    // Ainda sem dia de prazo: a hora fica guardada e entra quando ele for escolhido.
    if (!dateRange.to) return;

    const to = applyTimeToDate(dateRange.to, time);
    if (!to) return;
    onSelect?.({ ...dateRange, to });
  };

  const hasDisplayedDates = dateRange.from || dateRange.to;

  useEffect(() => {
    setDateRange(value);
    // Só sobrescreve a hora digitada quando o fim volta do store com um valor.
    if (value.to) setEndTime(renderFormattedTime(value.to));
  }, [value]);

  const comboButton = (
    <button
      ref={setReferenceElement}
      type="button"
      className={cn(
        "clickable block h-full max-w-full outline-none",
        {
          "cursor-not-allowed text-secondary": disabled,
          "cursor-pointer": !disabled,
        },
        buttonContainerClassName
      )}
      onClick={handleOnClick}
      disabled={disabled}
    >
      <DropdownButton
        className={buttonClassName}
        isActive={isOpen}
        tooltipHeading={customTooltipHeading ?? t("project_cycles.date_range")}
        tooltipContent={
          <>
            {customTooltipContent ?? (
              <>
                {dateRange.from ? renderFormattedDate(dateRange.from) : ""}
                {dateRange.from && dateRange.to ? " - " : ""}
                {dateRange.to ? renderFormattedDateTime(dateRange.to) : ""}
              </>
            )}
          </>
        }
        showTooltip={showTooltip}
        variant={buttonVariant}
        renderToolTipByDefault={renderByDefault}
      >
        {mergeDates ? (
          // Merged date display
          <div className="flex w-full items-center gap-1.5">
            {!hideIcon.from && <CalendarDays className="h-3 w-3 flex-shrink-0" />}
            {dateRange.from || dateRange.to ? (
              <MergedDateDisplay
                startDate={dateRange.from}
                endDate={dateRange.to}
                className="flex-grow truncate text-11"
              />
            ) : (
              renderPlaceholder && (
                <>
                  <span className="text-placeholder">{placeholder.from}</span>
                  {placeholder.from && placeholder.to && (
                    <ArrowRight className="h-3 w-3 flex-shrink-0 text-placeholder" />
                  )}
                  <span className="text-placeholder">{placeholder.to}</span>
                </>
              )
            )}
            {isClearable && !disabled && hasDisplayedDates && (
              <CloseIcon
                className={cn("h-2.5 w-2.5 flex-shrink-0 cursor-pointer", clearIconClassName)}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  clearDates();
                }}
              />
            )}
          </div>
        ) : (
          // Original separate date display
          <>
            <span
              className={cn(
                "flex h-full flex-grow items-center justify-center gap-1 rounded-xs",
                buttonFromDateClassName
              )}
            >
              {!hideIcon.from && <CalendarDays className="h-3 w-3 flex-shrink-0" />}
              {dateRange.from ? renderFormattedDate(dateRange.from) : renderPlaceholder ? placeholder.from : ""}
            </span>
            <ArrowRight className="h-3 w-3 flex-shrink-0" />
            <span
              className={cn(
                "flex h-full flex-grow items-center justify-center gap-1 rounded-xs",
                buttonToDateClassName
              )}
            >
              {!hideIcon.to && <DueDatePropertyIcon className="h-3 w-3 flex-shrink-0" />}
              {dateRange.to ? renderFormattedDateTime(dateRange.to) : renderPlaceholder ? placeholder.to : ""}
            </span>
            {isClearable && !disabled && hasDisplayedDates && (
              <CloseIcon
                className={cn("ml-1 h-2.5 w-2.5 flex-shrink-0 cursor-pointer", clearIconClassName)}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  clearDates();
                }}
              />
            )}
          </>
        )}
      </DropdownButton>
    </button>
  );

  const comboOptions = (
    <Combobox.Options data-prevent-outside-click static>
      <div
        className="z-30 my-1 overflow-hidden rounded-md border-[0.5px] border-subtle-1 bg-surface-1"
        ref={setPopperElement}
        style={styles.popper}
        {...attributes.popper}
      >
        <Calendar
          className="rounded-md border border-subtle p-3 text-12"
          captionLayout="dropdown"
          selected={dateRange}
          onSelect={handleRangeSelect}
          mode="range"
          disabled={disabledDays}
          showOutsideDays
          fixedWeeks
          weekStartsOn={startOfWeek}
          initialFocus
        />
        {showTime && (
          <div className="flex items-center gap-2 border-t border-subtle px-3 py-2">
            <Clock className="size-3.5 shrink-0 text-tertiary" />
            <label className="grow text-caption-sm-regular text-secondary" htmlFor={timeInputId}>
              Horário do prazo
            </label>
            <Input
              id={timeInputId}
              type="time"
              inputSize="xs"
              className="w-24"
              value={endTime}
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
    </Combobox.Options>
  );

  const Options = renderInPortal ? createPortal(comboOptions, document.body) : comboOptions;

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
      {isOpen && Options}
    </ComboDropDown>
  );
});
