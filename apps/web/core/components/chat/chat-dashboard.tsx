/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useEffect, useState } from "react";
import { useMember } from "@/hooks/store/use-member";
import { chatApi } from "@/services/chat.service";

type Stats = Awaited<ReturnType<ReturnType<typeof chatApi>["dashboard"]>>;

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`flex flex-col gap-1 rounded-xl border border-subtle p-4 ${tone ?? ""}`}>
      <span className="text-28 font-semibold leading-none">{value}</span>
      <span className="text-12 text-secondary">{label}</span>
    </div>
  );
}

export const ChatDashboard = observer(function ChatDashboard({ slug, apiUrl }: { slug: string; apiUrl: string }) {
  const api = chatApi(apiUrl);
  const [stats, setStats] = useState<Stats | null>(null);
  const {
    workspace: { getWorkspaceMemberDetails },
  } = useMember();

  useEffect(() => {
    let alive = true;
    const load = () => api.dashboard(slug).then((d) => alive && setStats(d)).catch(() => {});
    load();
    const t = setInterval(load, 5000); // live-ish refresh
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const nameFor = (id: string) => (getWorkspaceMemberDetails(id) as any)?.member?.display_name ?? id;

  if (!stats) return <div className="p-6 text-sm text-secondary">Carregando dashboard…</div>;

  const attendants = [...stats.attendants].sort((a, b) => b.active_chats - a.active_chats);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Em atendimento" value={stats.totals.active} tone="bg-success-subtle/40" />
        <Stat label="Na fila" value={stats.totals.queued} tone="bg-warning-subtle/40" />
        <Stat label="No bot (sem atendente)" value={stats.totals.bot} tone="bg-layer-2" />
        <Stat label="Encerrados hoje" value={stats.totals.closed_today} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">
          Atendentes <span className="text-12 font-normal text-secondary">({stats.online.length} online)</span>
        </h3>
        <div className="overflow-hidden rounded-xl border border-subtle">
          <table className="w-full text-sm">
            <thead className="bg-layer-2 text-12 text-secondary">
              <tr>
                <th className="p-2 text-left font-medium">Atendente</th>
                <th className="p-2 text-left font-medium">Status</th>
                <th className="p-2 text-right font-medium">Chats ativos</th>
                <th className="p-2 text-right font-medium">Chats hoje</th>
              </tr>
            </thead>
            <tbody>
              {attendants.map((a) => (
                <tr key={a.user_id} className="border-t border-subtle">
                  <td className="p-2">{nameFor(a.user_id)}</td>
                  <td className="p-2">
                    {a.invisible ? (
                      <span className="rounded-full bg-layer-2 px-2 py-0.5 text-11 text-secondary">Invisível</span>
                    ) : a.online ? (
                      <span className="inline-flex items-center gap-1 text-11 text-success-primary">
                        <span className="size-2 rounded-full bg-success-primary" /> Online
                      </span>
                    ) : (
                      <span className="text-11 text-tertiary">Offline</span>
                    )}
                  </td>
                  <td className="p-2 text-right font-medium">{a.active_chats}</td>
                  <td className="p-2 text-right text-secondary">{a.today_chats}</td>
                </tr>
              ))}
              {attendants.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-13 text-secondary">
                    Nenhum atendente ativo no momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-12 text-secondary">
          Para dar “spy” em uma conversa, volte à lista e abra qualquer atendimento — você recebe as mensagens ao vivo sem assumir.
        </p>
      </div>
    </div>
  );
});
