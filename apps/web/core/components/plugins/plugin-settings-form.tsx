/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

// G5 — declarative settings form. The host renders a config form straight from a
// plugin's `configSchema` (G1) and reads/writes via the plugin-sdk gateway. Generic:
// any plugin that declares a schema gets an admin settings UI for free.

import React, { useCallback, useEffect, useState } from "react";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";

type FieldType = "string" | "number" | "boolean" | "select" | "headers" | "secret";
type ConfigField = {
  key: string;
  label: string;
  type: FieldType;
  group?: string;
  description?: string;
  secret?: boolean;
  default?: unknown;
  options?: { label: string; value: string }[];
  required?: boolean;
};
type HeaderRow = { key: string; value: string };

async function gw(pluginId: string, path: string, init?: RequestInit) {
  const res = await fetch(`/api/v1/plugin-sdk${path}`, {
    credentials: "include",
    ...init,
    headers: { "X-Plugin-Id": pluginId, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw await res.json().catch(() => ({ detail: res.statusText }));
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

export const PluginSettingsForm: React.FC<{ pluginId: string }> = ({ pluginId }) => {
  const [schema, setSchema] = useState<ConfigField[] | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, v] = await Promise.all([
        gw(pluginId, "/config/schema"),
        gw(pluginId, "/config?scope=instance"),
      ]);
      setSchema(Array.isArray(s) ? s : []);
      setValues((v ?? {}) as Record<string, unknown>);
    } catch (e: any) {
      setError(e?.detail ?? "Não foi possível carregar a configuração (o plugin precisa estar ativo).");
    } finally {
      setLoading(false);
    }
  }, [pluginId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (k: string, val: unknown) => setValues((prev) => ({ ...prev, [k]: val }));

  const save = async () => {
    setSaving(true);
    try {
      await gw(pluginId, "/config", { method: "PUT", body: JSON.stringify({ scope: "instance", values }) });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Configuração salva" });
      void load();
    } catch (e: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: e?.detail ?? "Falha ao salvar." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-neutral-500">Carregando configuração…</p>;
  if (error) return <p className="text-sm text-amber-600">{error}</p>;
  if (!schema || schema.length === 0)
    return <p className="text-sm text-neutral-500">Este plugin não declara configurações.</p>;

  // Group fields by `group`.
  const groups = schema.reduce<Record<string, ConfigField[]>>((acc, f) => {
    const g = f.group ?? "Geral";
    (acc[g] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([group, fields]) => (
        <div key={group} className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{group}</h4>
          {fields.map((f) => (
            <Field key={f.key} field={f} value={values[f.key]} onChange={(v) => setField(f.key, v)} />
          ))}
        </div>
      ))}
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar configuração"}
        </button>
      </div>
    </div>
  );
};

const inputCls =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white";

const Field: React.FC<{ field: ConfigField; value: unknown; onChange: (v: unknown) => void }> = ({ field, value, onChange }) => {
  const label = (
    <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">
      {field.label}
      {field.required && <span className="text-red-500"> *</span>}
    </label>
  );

  if (field.type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span className="text-sm text-neutral-700 dark:text-neutral-200">{field.label}</span>
        {field.description && <span className="text-xs text-neutral-400">— {field.description}</span>}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        {label}
        <select className={inputCls} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {field.description && <p className="mt-1 text-xs text-neutral-400">{field.description}</p>}
      </div>
    );
  }

  if (field.type === "headers") {
    const rows: HeaderRow[] = Array.isArray(value) ? (value as HeaderRow[]) : [];
    const update = (next: HeaderRow[]) => onChange(next);
    return (
      <div>
        {label}
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={inputCls}
                placeholder="Chave (ex: X-Sistema)"
                value={row.key}
                onChange={(e) => update(rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
              />
              <input
                className={inputCls}
                placeholder="Valor (ex: {entity.codigo})"
                value={row.value}
                onChange={(e) => update(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
              />
              <button
                onClick={() => update(rows.filter((_, j) => j !== i))}
                className="shrink-0 rounded-md border border-neutral-300 px-2 text-sm text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => update([...rows, { key: "", value: "" }])}
            className="rounded-md border border-dashed border-neutral-300 px-3 py-1 text-xs text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700"
          >
            + Adicionar header
          </button>
        </div>
        {field.description && <p className="mt-1 text-xs text-neutral-400">{field.description}</p>}
      </div>
    );
  }

  const isSecret = field.type === "secret" || field.secret;
  return (
    <div>
      {label}
      <input
        className={inputCls}
        type={isSecret ? "password" : field.type === "number" ? "number" : "text"}
        value={isSecret ? (value === "***" ? "" : String(value ?? "")) : String(value ?? "")}
        placeholder={isSecret && value === "***" ? "•••• (preenchido — deixe vazio para manter)" : undefined}
        onChange={(e) => onChange(field.type === "number" ? Number(e.target.value) : e.target.value)}
      />
      {field.description && <p className="mt-1 text-xs text-neutral-400">{field.description}</p>}
    </div>
  );
};
