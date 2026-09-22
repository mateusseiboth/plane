/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Control, FieldErrors } from "react-hook-form";
import { Controller } from "react-hook-form";
// plane imports
import { Input } from "@plane/ui";

/** Campos de perfil que vieram da intranet. */
export type TProfileContactForm = {
  nickname: string;
  phone: string;
  mobile_phone: string;
  birth_date: string;
};

type TFieldConfig = {
  name: keyof TProfileContactForm;
  label: string;
  type: "text" | "tel" | "date";
  placeholder?: string;
  maxLength?: number;
};

const FIELDS: TFieldConfig[] = [
  { name: "nickname", label: "Apelido", type: "text", placeholder: "Como prefere ser chamado", maxLength: 60 },
  { name: "birth_date", label: "Aniversário", type: "date" },
  { name: "phone", label: "Telefone", type: "tel", placeholder: "(67) 3XXX-XXXX", maxLength: 30 },
  { name: "mobile_phone", label: "Celular", type: "tel", placeholder: "(67) 9XXXX-XXXX", maxLength: 30 },
];

type Props = {
  // O formulário do perfil tem mais campos; aqui só estes quatro importam.
  control: Control<any>;
  errors: FieldErrors<TProfileContactForm>;
};

export function ProfileContactFields({ control, errors }: Props) {
  return (
    <>
      {FIELDS.map((field) => (
        <div key={field.name} className="flex flex-col gap-1">
          <h4 className="text-13 font-medium text-secondary">{field.label}</h4>
          <Controller
            control={control}
            name={field.name}
            render={({ field: { value, onChange, ref } }) => (
              <Input
                id={field.name}
                name={field.name}
                type={field.type}
                value={value ?? ""}
                onChange={onChange}
                ref={ref}
                hasError={Boolean(errors[field.name])}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                className="w-full"
              />
            )}
          />
          {errors[field.name] && <span className="text-11 text-danger-primary">{errors[field.name]?.message}</span>}
        </div>
      ))}
    </>
  );
}

export function readProfileContactDefaults(user: {
  nickname?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  birth_date?: string | null;
}): TProfileContactForm {
  return {
    nickname: user.nickname ?? "",
    phone: user.phone ?? "",
    mobile_phone: user.mobile_phone ?? "",
    birth_date: user.birth_date ?? "",
  };
}
