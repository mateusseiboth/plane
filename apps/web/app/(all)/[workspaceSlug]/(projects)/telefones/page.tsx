/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Phone, Search } from "lucide-react";
// components
import { PageHead } from "@/components/core/page-title";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { usePhoneBook } from "@/hooks/use-phone-book";
// services
import type { TPhoneBookEntry } from "@/services/phone-book.service";

type TGroup = { letter: string; entries: TPhoneBookEntry[] };

function withoutAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Letra do grupo: a inicial sem acento; o que não é letra vai para "#". */
function readInitial(entry: TPhoneBookEntry): string {
  const initial = withoutAccents(entry.display_name.trim().charAt(0)).toUpperCase();
  return /[A-Z]/.test(initial) ? initial : "#";
}

function groupByInitial(entries: TPhoneBookEntry[]): TGroup[] {
  const groups = new Map<string, TPhoneBookEntry[]>();
  for (const entry of entries) {
    const letter = readInitial(entry);
    groups.set(letter, [...(groups.get(letter) ?? []), entry]);
  }
  return [...groups.entries()].map(([letter, items]) => ({ letter, entries: items }));
}

function matchesSearch(entry: TPhoneBookEntry, term: string): boolean {
  if (!term) return true;
  const digits = term.replace(/\D/g, "");
  const text = withoutAccents(
    [entry.display_name, entry.nickname, entry.email].filter(Boolean).join(" ")
  ).toLowerCase();
  const phones = [entry.phone, entry.mobile_phone].filter(Boolean).join(" ").replace(/\D/g, "");
  return text.includes(withoutAccents(term).toLowerCase()) || (digits.length > 0 && phones.includes(digits));
}

function PhoneLink({ value }: { value: string | null }) {
  if (!value) return <span className="text-placeholder">—</span>;
  return (
    <a href={`tel:${value.replace(/[^\d+]/g, "")}`} className="text-primary hover:underline">
      {value}
    </a>
  );
}

function TelefonesPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { currentWorkspace } = useWorkspace();
  const { entries, isLoading, error } = usePhoneBook(slug);
  const [search, setSearch] = useState("");

  const groups = useMemo(
    () => groupByInitial(entries.filter((entry) => matchesSearch(entry, search.trim()))),
    [entries, search]
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PageHead title={currentWorkspace?.name ? `${currentWorkspace.name} - Telefones` : "Telefones"} />

      <div className="flex items-center justify-between gap-4 border-b border-subtle px-6 py-4">
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-secondary" />
          <div>
            <h1 className="text-lg font-semibold">Telefones</h1>
            <p className="text-13 text-secondary">
              {entries.length} pessoa{entries.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex min-w-55 items-center gap-1.5 rounded-md border border-subtle bg-surface-2 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-secondary" />
          <input
            className="text-xs w-full border-none bg-transparent text-primary outline-none placeholder:text-secondary"
            placeholder="Buscar por nome, apelido ou número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {error && <p className="text-13 text-secondary">Não foi possível carregar a agenda. Tente novamente.</p>}
        {!error && isLoading && entries.length === 0 && (
          <p className="text-sm py-8 text-center text-secondary">Carregando...</p>
        )}
        {!error && !isLoading && groups.length === 0 && (
          <p className="text-sm py-8 text-center text-secondary">Ninguém encontrado.</p>
        )}
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.letter}>
              <h2 className="mb-2 text-14 font-semibold text-secondary">{group.letter}</h2>
              <div className="overflow-x-auto rounded-lg border border-subtle">
                <table className="text-xs w-full min-w-150 table-fixed">
                  <thead className="bg-surface-2 text-secondary">
                    <tr>
                      <th className="w-[34%] px-4 py-2 text-left font-medium">Nome</th>
                      <th className="w-[20%] px-4 py-2 text-left font-medium">Telefone</th>
                      <th className="w-[20%] px-4 py-2 text-left font-medium">Celular</th>
                      <th className="w-[26%] px-4 py-2 text-left font-medium">E-mail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {group.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="truncate px-4 py-2 font-medium text-primary">
                          {entry.display_name}
                          {entry.nickname && <span className="ml-1 text-secondary">({entry.nickname})</span>}
                        </td>
                        <td className="px-4 py-2">
                          <PhoneLink value={entry.phone} />
                        </td>
                        <td className="px-4 py-2">
                          <PhoneLink value={entry.mobile_phone} />
                        </td>
                        <td className="truncate px-4 py-2 text-secondary">
                          <a href={`mailto:${entry.email}`} className="hover:underline">
                            {entry.email}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default observer(TelefonesPage);
