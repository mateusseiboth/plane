/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useMember } from "@/hooks/store/use-member";
import { chatApi, type RatingsReport, type SlaReport } from "@/services/chat.service";

type Stats = Awaited<ReturnType<ReturnType<typeof chatApi>["dashboard"]>>;

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`flex flex-col gap-1 rounded-xl border border-subtle p-4 ${tone ?? ""}`}>
      <span className="text-28 font-semibold leading-none">{value}</span>
      <span className="text-12 text-secondary">{label}</span>
    </div>
  );
}

function Stars({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= Math.round(score) ? "fill-current text-amber-400" : "text-tertiary"}`} />
      ))}
    </span>
  );
}

function fmtDuration(sec: number | null) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export const ChatDashboard = observer(function ChatDashboard({ slug, apiUrl }: { slug: string; apiUrl: string }) {
  const api = chatApi(apiUrl);
  const [stats, setStats] = useState<Stats | null>(null);
  const [ratings, setRatings] = useState<RatingsReport | null>(null);
  const [sla, setSla] = useState<SlaReport | null>(null);
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

  // Reports are heavier + don't change second-to-second → fetch once.
  useEffect(() => {
    let alive = true;
    api.ratingsReport(slug).then((d) => alive && setRatings(d)).catch(() => {});
    api.slaReport(slug, 30).then((d) => alive && setSla(d)).catch(() => {});
    return () => {
      alive = false;
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

      {/* ── Avaliações + ranking ─────────────────────────────────────── */}
      {ratings && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            Avaliações dos atendentes
            {ratings.overall.count > 0 && (
              <span className="inline-flex items-center gap-1 text-12 font-normal text-secondary">
                · média geral <Stars score={ratings.overall.avg} /> {ratings.overall.avg.toFixed(2)} ({ratings.overall.count})
              </span>
            )}
          </h3>
          <div className="overflow-hidden rounded-xl border border-subtle">
            <table className="w-full text-sm">
              <thead className="bg-layer-2 text-12 text-secondary">
                <tr>
                  <th className="p-2 text-left font-medium">#</th>
                  <th className="p-2 text-left font-medium">Atendente</th>
                  <th className="p-2 text-left font-medium">Média</th>
                  <th className="p-2 text-right font-medium">Avaliações</th>
                  <th className="p-2 text-left font-medium">Distribuição (1→5)</th>
                </tr>
              </thead>
              <tbody>
                {ratings.ranking.map((r, i) => (
                  <tr key={r.user_id} className="border-t border-subtle">
                    <td className="p-2 font-semibold text-secondary">{i + 1}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">
                      <span className="inline-flex items-center gap-1.5">
                        <Stars score={r.avg} />
                        <span className="font-medium">{r.avg.toFixed(2)}</span>
                      </span>
                    </td>
                    <td className="p-2 text-right text-secondary">{r.count}</td>
                    <td className="p-2 text-11 text-tertiary">{r.distribution.join(" / ")}</td>
                  </tr>
                ))}
                {ratings.ranking.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-13 text-secondary">
                      Nenhuma avaliação registrada ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {ratings.comments.length > 0 && (
            <div className="mt-3">
              <h4 className="mb-1.5 text-12 font-semibold text-secondary">Comentários recentes</h4>
              <div className="flex flex-col gap-2">
                {ratings.comments.slice(0, 10).map((c, i) => (
                  <div key={i} className="rounded-lg border border-subtle p-3">
                    <div className="mb-1 flex items-center gap-2 text-12 text-secondary">
                      {c.score != null && <Stars score={c.score} />}
                      <span className="font-medium text-primary">{c.client_name || "Cliente"}</span>
                      <span>·</span>
                      <span>#{c.protocol}</span>
                      {c.attendant && (
                        <>
                          <span>·</span>
                          <span>{c.attendant}</span>
                        </>
                      )}
                    </div>
                    <p className="text-13 text-primary italic">“{c.comment}”</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SLA ──────────────────────────────────────────────────────── */}
      {sla && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">
            SLA de atendimento <span className="text-12 font-normal text-secondary">(últimos {sla.days} dias)</span>
          </h3>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Atendimentos" value={sla.overall.count} />
            <div className="flex flex-col gap-1 rounded-xl border border-subtle p-4">
              <span className="text-20 font-semibold leading-none">{fmtDuration(sla.overall.avg_first_response_sec)}</span>
              <span className="text-12 text-secondary">1ª resposta (média)</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-subtle p-4">
              <span className="text-20 font-semibold leading-none">{fmtDuration(sla.overall.avg_resolution_sec)}</span>
              <span className="text-12 text-secondary">Resolução (média)</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-subtle p-4">
              <span className="text-20 font-semibold leading-none">
                {sla.overall.breaches}{" "}
                <span className="text-13 font-normal text-secondary">({Math.round(sla.overall.breach_rate * 100)}%)</span>
              </span>
              <span className="text-12 text-secondary">Fora do SLA ({fmtDuration(sla.threshold_sec)})</span>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-subtle">
            <table className="w-full text-sm">
              <thead className="bg-layer-2 text-12 text-secondary">
                <tr>
                  <th className="p-2 text-left font-medium">Atendente</th>
                  <th className="p-2 text-right font-medium">Atend.</th>
                  <th className="p-2 text-right font-medium">1ª resposta</th>
                  <th className="p-2 text-right font-medium">Resolução</th>
                  <th className="p-2 text-right font-medium">Fora do SLA</th>
                </tr>
              </thead>
              <tbody>
                {sla.ranking.map((r) => (
                  <tr key={r.user_id} className="border-t border-subtle">
                    <td className="p-2">{r.name}</td>
                    <td className="p-2 text-right text-secondary">{r.count}</td>
                    <td className="p-2 text-right">{fmtDuration(r.avg_first_response_sec)}</td>
                    <td className="p-2 text-right">{fmtDuration(r.avg_resolution_sec)}</td>
                    <td className="p-2 text-right">
                      <span className={r.breaches > 0 ? "text-danger-primary" : "text-secondary"}>
                        {r.breaches} ({Math.round(r.breach_rate * 100)}%)
                      </span>
                    </td>
                  </tr>
                ))}
                {sla.ranking.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-13 text-secondary">
                      Sem dados de SLA no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});
