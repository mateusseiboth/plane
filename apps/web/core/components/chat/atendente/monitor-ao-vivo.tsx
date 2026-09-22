/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

// local imports
import { formatSegundos } from "@/components/chat/atendente/atendente-helpers";
import { useMonitor } from "@/components/chat/atendente/use-atendente";
import type { ResumoDeTempo } from "@/services/atendente.service";

/** Acima disto o cliente está esperando demais (mesmo limite do alerta). */
const PARADO_DEMAIS_SEG = 10 * 60;

const TEMPOS: { chave: "fila" | "atendimento" | "resposta"; rotulo: string }[] = [
  { chave: "fila", rotulo: "Espera na fila" },
  { chave: "atendimento", rotulo: "Duração do atendimento" },
  { chave: "resposta", rotulo: "Tempo de resposta" },
];

function Numero({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: string }) {
  return (
    <div className={`flex flex-col gap-1 rounded-xl border border-subtle p-4 ${tom ?? ""}`}>
      <span className="text-28 leading-none font-semibold">{valor}</span>
      <span className="text-12 text-secondary">{rotulo}</span>
    </div>
  );
}

const Tempo = ({ resumo }: { resumo: ResumoDeTempo }) => (
  <>
    <td className="p-2 text-right">{formatSegundos(resumo.min)}</td>
    <td className="p-2 text-right font-medium">{formatSegundos(resumo.media)}</td>
    <td className="p-2 text-right">{formatSegundos(resumo.max)}</td>
    <td className="p-2 text-right text-secondary">{resumo.amostras}</td>
  </>
);

/**
 * Monitor ao vivo do atendimento (`chat.gerenciar`), atualizado a cada 10
 * segundos: fila com o tempo de espera, conversas com o tempo parado,
 * abandonos do dia e os tempos mínimo, médio e máximo. Legado: `intranet/chatger/`.
 */
export function MonitorAoVivo({ slug, apiUrl }: { slug: string; apiUrl: string }) {
  const { monitor, error } = useMonitor(apiUrl, slug);
  if (error) return <p className="text-13 text-secondary">Monitor indisponível para a sua função.</p>;
  if (!monitor) return <p className="text-13 text-secondary">Carregando monitor…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Na fila agora" valor={monitor.fila.length} tom="bg-warning-subtle/40" />
        <Numero rotulo="Em atendimento" valor={monitor.ativos.length} tom="bg-success-subtle/40" />
        <Numero rotulo="Finalizados hoje" valor={monitor.hoje.finalizados} />
        <Numero rotulo="Abandonados hoje" valor={monitor.hoje.abandonados} tom="bg-danger-subtle/30" />
      </div>

      {monitor.hoje.por_tipo_abandono.length > 0 && (
        <div className="flex flex-wrap gap-2 text-12">
          {monitor.hoje.por_tipo_abandono.map((a) => (
            <span key={a.rotulo} className="rounded-full bg-layer-2 px-2 py-1 text-secondary">
              {a.rotulo}: <strong className="text-primary">{a.total}</strong>
            </span>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-subtle">
        <table className="text-sm w-full">
          <thead className="bg-layer-2 text-12 text-secondary">
            <tr>
              <th className="p-2 text-left font-medium">Hoje</th>
              <th className="p-2 text-right font-medium">Mínimo</th>
              <th className="p-2 text-right font-medium">Média</th>
              <th className="p-2 text-right font-medium">Máximo</th>
              <th className="p-2 text-right font-medium">Amostras</th>
            </tr>
          </thead>
          <tbody>
            {TEMPOS.map(({ chave, rotulo }) => (
              <tr key={chave} className="border-t border-subtle">
                <td className="p-2">{rotulo}</td>
                <Tempo resumo={monitor.tempos[chave]} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-13 font-semibold">Fila de espera</h4>
          <div className="overflow-hidden rounded-xl border border-subtle">
            {monitor.fila.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between border-b border-subtle px-3 py-2 text-13 last:border-b-0"
              >
                <span className="truncate">
                  {f.client_name ?? "Visitante"} <span className="text-11 text-tertiary">#{f.protocol}</span>
                </span>
                <span
                  className={f.espera_seg > PARADO_DEMAIS_SEG ? "font-semibold text-danger-primary" : "text-secondary"}
                >
                  {formatSegundos(f.espera_seg)}
                </span>
              </div>
            ))}
            {monitor.fila.length === 0 && <p className="p-3 text-13 text-secondary">Ninguém na fila.</p>}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-13 font-semibold">Em atendimento</h4>
          <div className="overflow-hidden rounded-xl border border-subtle">
            {monitor.ativos.map((a) => {
              const atrasado = a.aguardando === "atendente" && a.parado_seg > PARADO_DEMAIS_SEG;
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 border-b border-subtle px-3 py-2 text-13 last:border-b-0"
                >
                  <span className="min-w-0 truncate">
                    {a.client_name ?? "Visitante"}
                    <span className="ml-1 text-11 text-tertiary">{a.attendant_name ?? "Sem atendente"}</span>
                  </span>
                  <span
                    className={`shrink-0 text-12 ${atrasado ? "font-semibold text-danger-primary" : "text-secondary"}`}
                  >
                    {a.aguardando === "atendente" ? "Cliente esperando" : "Aguardando cliente"} ·{" "}
                    {formatSegundos(a.parado_seg)}
                    {a.alerta_pausado && " · alerta pausado"}
                  </span>
                </div>
              );
            })}
            {monitor.ativos.length === 0 && (
              <p className="p-3 text-13 text-secondary">Nenhuma conversa em atendimento.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
