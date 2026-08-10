/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useCallback, useEffect, useState } from "react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// hooks
import { useMember } from "@/hooks/store/use-member";
// services
import { chatApi } from "@/services/chat.service";
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";

type Tab = "messages" | "menu" | "queues" | "flows" | "schedules" | "attendants" | "provider";
const BASE_TABS: { key: Tab; label: string }[] = [
  { key: "messages", label: "Mensagens" },
  { key: "menu", label: "Menu" },
  { key: "queues", label: "Filas" },
  { key: "flows", label: "Fluxos" },
  { key: "schedules", label: "Horários" },
  { key: "provider", label: "WhatsApp (Z-API)" },
];

const ok = (m: string) => setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: m });
const err = (e: any) => setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: e?.detail || "Falhou." });

const inputCls = "w-full rounded-md border border-subtle bg-surface-1 text-primary px-2 py-1.5 text-sm outline-none";
const btn = "rounded-md bg-primary px-3 py-1.5 text-13 text-on-color";
const btnGhost = "rounded-md border border-subtle px-3 py-1.5 text-13";

export const ChatConfigPanel = observer(function ChatConfigPanel({ slug, apiUrl, isAdmin = false }: { slug: string; apiUrl: string; isAdmin?: boolean }) {
  const [tab, setTab] = useState<Tab>("messages");
  const api = chatApi(apiUrl);
  const TABS = isAdmin ? [...BASE_TABS.slice(0, 5), { key: "attendants" as Tab, label: "Atendentes" }, BASE_TABS[5]] : BASE_TABS;

  // workspace members for queue/schedule assignment
  const {
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();
  const members = (workspaceMemberIds ?? [])
    .map((id) => getWorkspaceMemberDetails(id))
    .filter(Boolean)
    .map((m: any) => ({ id: m.member.id, name: m.member.display_name || m.member.email }));

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex gap-1 border-b border-subtle px-3 pt-2">
        {TABS.map((tabDef) => (
          <button
            key={tabDef.key}
            onClick={() => setTab(tabDef.key)}
            className={`rounded-t-md px-3 py-2 text-13 ${tab === tabDef.key ? "border-b-2 border-primary font-medium text-primary" : "text-secondary"}`}
          >
            {tabDef.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "messages" && <MessagesTab slug={slug} api={api} />}
        {tab === "menu" && <MenuTab slug={slug} api={api} />}
        {tab === "queues" && <QueuesTab slug={slug} api={api} members={members} />}
        {tab === "flows" && <FlowsTab slug={slug} api={api} />}
        {tab === "schedules" && <SchedulesTab slug={slug} api={api} />}
        {tab === "attendants" && <AttendantsTab slug={slug} api={api} members={members} />}
        {tab === "provider" && <ProviderTab slug={slug} api={api} />}
      </div>
    </div>
  );
});

// ── Messages (BotConfig) ──────────────────────────────────────────────────────
const MSG_FIELDS: { key: string; label: string }[] = [
  { key: "welcomeMessage", label: "Mensagem inicial" },
  { key: "menuHeader", label: "Cabeçalho do menu" },
  { key: "askNameMessage", label: "Pedir nome" },
  { key: "confirmContactMessage", label: "Confirmar contato (use {name})" },
  { key: "noAttendantsMessage", label: "Sem atendentes" },
  { key: "idlePromptMessage", label: "Inatividade 10min" },
  { key: "idleCloseMessage", label: "Encerramento por inatividade (use {protocol})" },
  { key: "closedMessage", label: "Encerramento (use {protocol})" },
];
function MessagesTab({ slug, api }: { slug: string; api: ReturnType<typeof chatApi> }) {
  const [cfg, setCfg] = useState<any>(null);
  useEffect(() => {
    api.getBot(slug).then(setCfg).catch(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  if (!cfg) return <div className="text-sm text-secondary">Carregando…</div>;
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      {MSG_FIELDS.map((f) => (
        <label key={f.key} className="text-sm">
          <span className="mb-1 block text-13 text-secondary">{f.label}</span>
          <textarea className={inputCls} rows={2} value={cfg[f.key] ?? ""} onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value })} />
        </label>
      ))}
      <div className="flex gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-13 text-secondary">Peso α (chats ativos)</span>
          <input type="number" step="0.1" className={inputCls} value={cfg.routingAlpha ?? 1} onChange={(e) => setCfg({ ...cfg, routingAlpha: Number(e.target.value) })} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-13 text-secondary">Peso β (atendimentos hoje)</span>
          <input type="number" step="0.1" className={inputCls} value={cfg.routingBeta ?? 0.5} onChange={(e) => setCfg({ ...cfg, routingBeta: Number(e.target.value) })} />
        </label>
      </div>
      <button className={btn + " self-start"} onClick={() => api.saveBot(slug, cfg).then(() => ok("Mensagens atualizadas.")).catch(err)}>
        Salvar
      </button>
    </div>
  );
}

// ── Menu options ──────────────────────────────────────────────────────────────
function MenuTab({ slug, api }: { slug: string; api: ReturnType<typeof chatApi> }) {
  const [items, setItems] = useState<any[]>([]);
  const [queues, setQueues] = useState<any[]>([]);
  const [flows, setFlows] = useState<any[]>([]);
  const load = useCallback(() => {
    api.listMenu(slug).then(setItems).catch(err);
    api.listQueues(slug).then(setQueues).catch(() => {});
    api.listFlows(slug).then(setFlows).catch(() => {});
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  const save = (it: any) => api.updateMenu(slug, it.id, { key: it.key, label: it.label, action: it.action, queue_id: it.queueId, flow_id: it.flowId, message: it.message, order: it.order }).then(() => ok("Opção salva.")).catch(err);
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      {items.map((it, idx) => (
        <div key={it.id} className="flex flex-wrap items-end gap-2 rounded-md border border-subtle p-2">
          <Field label="Tecla" w="w-16"><input className={inputCls} value={it.key} onChange={(e) => upd(setItems, idx, { key: e.target.value })} /></Field>
          <Field label="Rótulo" w="flex-1"><input className={inputCls} value={it.label} onChange={(e) => upd(setItems, idx, { label: e.target.value })} /></Field>
          <Field label="Ação" w="w-32">
            <SelectPesquisavel
              value={it.action}
              onChange={(valor) => upd(setItems, idx, { action: valor })}
              opcoes={[
                { value: "queue", label: "Fila" },
                { value: "flow", label: "Fluxo" },
                { value: "message", label: "Mensagem" },
              ]}
            />
          </Field>
          {it.action === "queue" && (
            <Field label="Fila" w="w-40">
              <SelectPesquisavel
                value={it.queueId ?? ""}
                onChange={(valor) => upd(setItems, idx, { queueId: valor })}
                opcoes={queues.map((q: any) => ({ value: q.id, label: q.name }))}
                opcaoVazia={{ value: "", label: "—" }}
                searchPlaceholder="Buscar fila"
              />
            </Field>
          )}
          {it.action === "flow" && (
            <Field label="Fluxo" w="w-40">
              <SelectPesquisavel
                value={it.flowId ?? ""}
                onChange={(valor) => upd(setItems, idx, { flowId: valor })}
                opcoes={flows.map((f: any) => ({ value: f.id, label: f.name }))}
                opcaoVazia={{ value: "", label: "—" }}
                searchPlaceholder="Buscar fluxo"
              />
            </Field>
          )}
          {it.action === "message" && (
            <Field label="Mensagem" w="flex-1"><input className={inputCls} value={it.message ?? ""} onChange={(e) => upd(setItems, idx, { message: e.target.value })} /></Field>
          )}
          <button className={btnGhost} onClick={() => save(it)}>Salvar</button>
          <button className={btnGhost} onClick={() => api.deleteMenu(slug, it.id).then(load).catch(err)}>Excluir</button>
        </div>
      ))}
      <button className={btn + " self-start"} onClick={() => api.createMenu(slug, { key: String(items.length + 1), label: "Nova opção", action: "queue", order: items.length }).then(load).catch(err)}>
        + Adicionar opção
      </button>
    </div>
  );
}

// ── Queues + members ──────────────────────────────────────────────────────────
function QueuesTab({ slug, api, members }: { slug: string; api: ReturnType<typeof chatApi>; members: { id: string; name: string }[] }) {
  const [queues, setQueues] = useState<any[]>([]);
  const [name, setName] = useState("");
  const load = useCallback(() => {
    api.listQueues(slug).then(setQueues).catch(err);
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  const toggleMember = (q: any, userId: string) => {
    const current = new Set((q.members ?? []).map((m: any) => m.userId));
    if (current.has(userId)) current.delete(userId);
    else current.add(userId);
    api.setQueueMembers(slug, q.id, Array.from(current) as string[]).then(load).then(() => ok("Atendentes atualizados.")).catch(err);
  };
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex gap-2">
        <input className={inputCls} placeholder="Nova fila" value={name} onChange={(e) => setName(e.target.value)} />
        <button className={btn} onClick={() => name.trim() && api.createQueue(slug, name.trim()).then(() => { setName(""); load(); }).catch(err)}>Criar</button>
      </div>
      {queues.map((q) => (
        <div key={q.id} className="rounded-md border border-subtle p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium">{q.name}</span>
            <button className={btnGhost} onClick={() => api.deleteQueue(slug, q.id).then(load).catch(err)}>Excluir</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const on = (q.members ?? []).some((x: any) => x.userId === m.id);
              return (
                <button key={m.id} onClick={() => toggleMember(q, m.id)} className={`rounded-full border px-2 py-1 text-12 ${on ? "border-primary bg-primary/10 text-primary" : "border-subtle text-secondary"}`}>
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Flows (visual step builder, no JSON) ──────────────────────────────────────
const STEP_LABELS: Record<string, string> = {
  message: "Enviar mensagem",
  ask: "Perguntar e guardar resposta",
  queue: "Encaminhar para fila",
  close: "Agradecer e encerrar",
};
function FlowsTab({ slug, api }: { slug: string; api: ReturnType<typeof chatApi> }) {
  const [flows, setFlows] = useState<any[]>([]);
  const [queues, setQueues] = useState<any[]>([]);
  const load = useCallback(() => {
    api.listFlows(slug).then((fs: any[]) => setFlows(fs.map((f) => ({ ...f, steps: Array.isArray(f.steps) ? f.steps : [] })))).catch(err);
    api.listQueues(slug).then(setQueues).catch(() => {});
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);

  const setSteps = (fi: number, steps: any[]) => upd(setFlows, fi, { steps });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="text-12 text-secondary">
        Monte o fluxo em etapas — ex.: <b>Reclamação</b> → “Perguntar e guardar resposta” (Descreva sua reclamação) → “Agradecer e encerrar”.
      </p>
      {flows.map((f, fi) => (
        <div key={f.id} className="rounded-lg border border-subtle p-3">
          <div className="mb-2 flex items-center gap-2">
            <input className={inputCls} value={f.name} onChange={(e) => upd(setFlows, fi, { name: e.target.value })} placeholder="Nome do fluxo" />
            <button className={btnGhost} onClick={() => api.deleteFlow(slug, f.id).then(load).catch(err)}>Excluir</button>
          </div>
          <div className="flex flex-col gap-2">
            {(f.steps ?? []).map((step: any, si: number) => (
              <div key={si} className="flex flex-wrap items-center gap-2 rounded-md bg-layer-1 p-2">
                <span className="text-12 text-tertiary">{si + 1}.</span>
                <SelectPesquisavel
                  value={step.type}
                  onChange={(valor) => setSteps(fi, f.steps.map((s: any, i: number) => (i === si ? { type: valor } : s)))}
                  opcoes={Object.entries(STEP_LABELS).map(([v, l]) => ({ value: v, label: l as string }))}
                  className="w-56"
                />
                {(step.type === "message" || step.type === "ask" || step.type === "close") && (
                  <input
                    className={inputCls + " min-w-[12rem] flex-1"}
                    placeholder={step.type === "close" ? "Mensagem de encerramento (opcional)" : "Texto"}
                    value={step.text ?? ""}
                    onChange={(e) => setSteps(fi, f.steps.map((s: any, i: number) => (i === si ? { ...s, text: e.target.value } : s)))}
                  />
                )}
                {step.type === "ask" && (
                  <input
                    className={inputCls + " w-36"}
                    placeholder="Salvar como (ex.: texto)"
                    value={step.saveAs ?? ""}
                    onChange={(e) => setSteps(fi, f.steps.map((s: any, i: number) => (i === si ? { ...s, saveAs: e.target.value } : s)))}
                  />
                )}
                {step.type === "queue" && (
                  <SelectPesquisavel
                    value={step.queueId ?? ""}
                    onChange={(valor) => setSteps(fi, f.steps.map((s: any, i: number) => (i === si ? { ...s, queueId: valor } : s)))}
                    opcoes={queues.map((q: any) => ({ value: q.id, label: q.name }))}
                    opcaoVazia={{ value: "", label: "Selecione a fila…" }}
                    searchPlaceholder="Buscar fila"
                    className="w-44"
                  />
                )}
                <button className={btnGhost} title="Remover etapa" onClick={() => setSteps(fi, f.steps.filter((_: any, i: number) => i !== si))}>×</button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button className={btnGhost} onClick={() => setSteps(fi, [...(f.steps ?? []), { type: "message", text: "" }])}>+ Etapa</button>
            <button className={btn} onClick={() => api.updateFlow(slug, f.id, { name: f.name, steps: f.steps }).then(() => ok("Fluxo salvo.")).catch(err)}>Salvar fluxo</button>
          </div>
        </div>
      ))}
      <button className={btn + " self-start"} onClick={() => api.createFlow(slug, { name: "Novo fluxo", steps: [] }).then(load).catch(err)}>+ Novo fluxo</button>
    </div>
  );
}

// ── Company-wide business hours (not per attendant) ───────────────────────────
const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function SchedulesTab({ slug, api }: { slug: string; api: ReturnType<typeof chatApi> }) {
  const [hours, setHours] = useState<any[]>([]);
  const [breaks, setBreaks] = useState<any[]>([]);
  const [outsideMsg, setOutsideMsg] = useState("");
  useEffect(() => {
    api.getBot(slug).then((cfg: any) => {
      setHours(Array.isArray(cfg.businessHours) ? cfg.businessHours : []);
      setBreaks(Array.isArray(cfg.businessBreaks) ? cfg.businessBreaks : []);
      setOutsideMsg(cfg.outsideHoursMessage ?? "");
    }).catch(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  const addRow = (list: any[], set: any) => set([...list, { weekday: 1, start_time: "08:00", end_time: "18:00" }]);
  const norm = (l: any[]) => l.map((x) => ({ weekday: Number(x.weekday), start_time: x.start_time, end_time: x.end_time }));
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="text-12 text-secondary">Horário de atendimento da empresa (vale para todos os atendentes). Vazio = sempre aberto.</p>
      <Rows title="Horários de atendimento" list={hours} set={setHours} addRow={addRow} />
      <Rows title="Pausas (almoço, etc.)" list={breaks} set={setBreaks} addRow={addRow} />
      <label className="text-sm">
        <span className="mb-1 block text-13 text-secondary">Mensagem fora do horário</span>
        <textarea className={inputCls} rows={2} value={outsideMsg} onChange={(e) => setOutsideMsg(e.target.value)} />
      </label>
      <button
        className={btn + " self-start"}
        onClick={() => api.saveBot(slug, { businessHours: norm(hours), businessBreaks: norm(breaks), outsideHoursMessage: outsideMsg }).then(() => ok("Horário salvo.")).catch(err)}
      >
        Salvar
      </button>
    </div>
  );
}
function Rows({ title, list, set, addRow }: any) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between"><span className="text-13 font-medium">{title}</span><button className={btnGhost} onClick={() => addRow(list, set)}>+ Linha</button></div>
      {list.map((row: any, idx: number) => (
        <div key={idx} className="mb-1 flex items-center gap-2">
          <SelectPesquisavel
            value={String(row.weekday)}
            onChange={(valor) => upd(set, idx, { weekday: valor })}
            opcoes={WD.map((w: string, i: number) => ({ value: String(i), label: w }))}
            className="w-24"
            searchable={false}
          />
          <input type="time" className={inputCls + " w-28"} value={row.start_time} onChange={(e) => upd(set, idx, { start_time: e.target.value })} />
          <input type="time" className={inputCls + " w-28"} value={row.end_time} onChange={(e) => upd(set, idx, { end_time: e.target.value })} />
          <button className={btnGhost} onClick={() => set(list.filter((_: any, i: number) => i !== idx))}>×</button>
        </div>
      ))}
    </div>
  );
}

// ── Attendant visibility (admin only) ─────────────────────────────────────────
function AttendantsTab({ slug, api, members }: { slug: string; api: ReturnType<typeof chatApi>; members: { id: string; name: string }[] }) {
  const [invisible, setInvisible] = useState<Set<string>>(new Set());
  useEffect(() => {
    api
      .listAttendantStatus(slug)
      .then((rows) => setInvisible(new Set(rows.filter((r) => r.is_invisible).map((r) => r.user_id))))
      .catch(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  const toggle = (userId: string) => {
    const next = !invisible.has(userId);
    api
      .setAttendantVisibility(slug, userId, next)
      .then(() => {
        setInvisible((prev) => {
          const s = new Set(prev);
          if (next) s.add(userId);
          else s.delete(userId);
          return s;
        });
        ok(next ? "Atendente invisível." : "Atendente visível.");
      })
      .catch(err);
  };
  return (
    <div className="flex max-w-xl flex-col gap-2">
      <p className="text-12 text-secondary">Atendentes invisíveis não recebem novos chats, mesmo conectados.</p>
      {members.map((m) => (
        <div key={m.id} className="flex items-center justify-between rounded-md border border-subtle p-2">
          <span className="text-sm">{m.name}</span>
          <button
            onClick={() => toggle(m.id)}
            className={`rounded-full border px-3 py-1 text-12 ${invisible.has(m.id) ? "border-danger-strong text-danger-primary" : "border-subtle text-secondary"}`}
          >
            {invisible.has(m.id) ? "Invisível" : "Visível"}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Provider (Z-API) ──────────────────────────────────────────────────────────
function ProviderTab({ slug, api }: { slug: string; api: ReturnType<typeof chatApi> }) {
  const [cfg, setCfg] = useState<any>({ provider: "zapi", is_active: false });
  useEffect(() => {
    api.getProvider(slug).then((r: any) => setCfg({ ...r, token: "", client_token: "" })).catch(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  return (
    <div className="flex max-w-md flex-col gap-3">
      <Field label="Base URL"><input className={inputCls} value={cfg.base_url ?? ""} onChange={(e) => setCfg({ ...cfg, base_url: e.target.value })} placeholder="https://api.z-api.io" /></Field>
      <Field label="Instance ID"><input className={inputCls} value={cfg.instance_id ?? ""} onChange={(e) => setCfg({ ...cfg, instance_id: e.target.value })} /></Field>
      <Field label="Token"><input className={inputCls} value={cfg.token ?? ""} onChange={(e) => setCfg({ ...cfg, token: e.target.value })} placeholder={cfg.has_token ? "•••• (mantém se vazio)" : ""} /></Field>
      <Field label="Client-Token"><input className={inputCls} value={cfg.client_token ?? ""} onChange={(e) => setCfg({ ...cfg, client_token: e.target.value })} placeholder={cfg.client_token === true ? "•••• (mantém se vazio)" : ""} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!cfg.is_active} onChange={(e) => setCfg({ ...cfg, is_active: e.target.checked })} /> Ativo</label>
      <p className="text-12 text-secondary">Webhook Z-API → <code>/chat-api/providers/zapi/webhook/{slug}</code></p>
      <button className={btn + " self-start"} onClick={() => api.saveProvider(slug, { provider: "zapi", base_url: cfg.base_url, instance_id: cfg.instance_id, ...(cfg.token ? { token: cfg.token } : {}), ...(cfg.client_token ? { client_token: cfg.client_token } : {}), is_active: cfg.is_active }).then(() => ok("Provider salvo.")).catch(err)}>Salvar</button>
    </div>
  );
}

// ── small helpers ─────────────────────────────────────────────────────────────
function Field({ label, w, children }: { label: string; w?: string; children: React.ReactNode }) {
  return (
    <label className={`text-sm ${w ?? ""}`}>
      <span className="mb-1 block text-12 text-secondary">{label}</span>
      {children}
    </label>
  );
}
function upd(set: any, idx: number, patch: any) {
  set((prev: any[]) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
}
