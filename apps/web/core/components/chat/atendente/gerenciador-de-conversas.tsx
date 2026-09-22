/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
// components
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { PrintButton, PrintDocument, PrintSection } from "@/components/print";
import { formatSegundos } from "@/components/chat/atendente/atendente-helpers";
import { useAtendentesDoChat, useGerenciador } from "@/components/chat/atendente/use-atendente";
// hooks
import useDebounce from "@/hooks/use-debounce";
import { useEntities } from "@/hooks/use-entities";
// services
import type { FiltroDoGerenciador, LinhaDoGerenciador } from "@/services/atendente.service";

const CAIXA = "h-9 rounded border border-subtle bg-surface-2 px-3 text-13 text-primary outline-none";

const CANAIS = [
  { value: "", label: "Todos os canais" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "native", label: "Chat do site" },
  { value: "phone", label: "Ligações" },
];

const SITUACOES = [
  { value: "", label: "Todas as situações" },
  { value: "active,paused", label: "Em atendimento" },
  { value: "queued,bot", label: "Na fila ou no robô" },
  { value: "closed", label: "Encerradas" },
];

const POR_PAGINA = [
  { value: "50", label: "50 por página" },
  { value: "100", label: "100 por página" },
  { value: "500", label: "500 por página" },
];

const ROTULO_DO_CANAL: Record<string, string> = { whatsapp: "WhatsApp", native: "Site", phone: "Ligação" };
const ROTULO_DA_SITUACAO: Record<string, string> = {
  active: "Em atendimento",
  paused: "Em pausa",
  queued: "Na fila",
  bot: "Robô",
  closed: "Encerrada",
};

const formatData = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "-");

const situacaoDa = (l: LinhaDoGerenciador) =>
  l.abandonado ? `Abandono: ${l.abandono}` : (ROTULO_DA_SITUACAO[l.status] ?? l.status);

/** Colunas da tela e da impressão (uma definição só). */
const COLUNAS: { titulo: string; valor: (l: LinhaDoGerenciador) => string }[] = [
  { titulo: "Aberta em", valor: (l) => formatData(l.created_at) },
  { titulo: "Cliente", valor: (l) => l.client_name ?? l.client_phone ?? "-" },
  { titulo: "Entidade", valor: (l) => l.entity_name ?? "-" },
  { titulo: "Sistema", valor: (l) => l.project_name ?? "-" },
  { titulo: "Atendente", valor: (l) => l.attendant_name ?? "-" },
  { titulo: "Canal", valor: (l) => ROTULO_DO_CANAL[l.channel] ?? l.channel },
  { titulo: "Situação", valor: situacaoDa },
  { titulo: "Duração", valor: (l) => formatSegundos(l.duracao_seg) },
  { titulo: "Motivo", valor: (l) => l.close_reason ?? "-" },
];

type Props = { slug: string; apiUrl: string; projetos: { value: string; label: string }[] };

/**
 * Gerenciador de conversas (`chat.gerenciar`): todo o histórico do espaço, com
 * filtros por atendente, entidade, sistema, período, número ou protocolo, canal
 * e situação, paginado, e a lista impressa. Legado: `sac_chatGer_lista.php` e
 * `popImprimeChatLista.php`.
 */
export function GerenciadorDeConversas({ slug, apiUrl, projetos }: Props) {
  const [filtro, setFiltro] = useState<FiltroDoGerenciador>({ per_page: "50" });
  const [busca, setBusca] = useState("");
  const termo = useDebounce(busca.trim(), 400);
  const consulta = useMemo(() => ({ ...filtro, q: termo || undefined }), [filtro, termo]);
  const { pagina, isLoading, isFetching } = useGerenciador(apiUrl, slug, consulta);
  const { entities } = useEntities(slug);
  const { atendentes } = useAtendentesDoChat(apiUrl, slug);

  /** Mudar um filtro volta para a primeira página. */
  const setCampo = (campo: keyof FiltroDoGerenciador) => (valor: string) =>
    setFiltro((atual) => ({ ...atual, [campo]: valor || undefined, page: undefined }));
  const goToPagina = (numero: number) => setFiltro((atual) => ({ ...atual, page: String(numero) }));

  const linhas = pagina?.results ?? [];
  const paginaAtual = pagina?.page ?? 1;
  const totalDePaginas = pagina?.total_pages ?? 1;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Número, protocolo ou nome"
          className={`${CAIXA} w-56`}
        />
        <SelectPesquisavel
          value={filtro.attendant_id ?? ""}
          onChange={setCampo("attendant_id")}
          opcoes={atendentes.map((a) => ({ value: a.user_id, label: a.name }))}
          opcaoVazia={{ value: "", label: "Todos os atendentes" }}
          className="w-48"
        />
        <SelectPesquisavel
          value={filtro.entity_id ?? ""}
          onChange={setCampo("entity_id")}
          opcoes={(entities ?? []).map((e) => ({ value: e.id, label: e.name }))}
          opcaoVazia={{ value: "", label: "Todas as entidades" }}
          searchPlaceholder="Buscar entidade"
          className="w-52"
        />
        <SelectPesquisavel
          value={filtro.project_id ?? ""}
          onChange={setCampo("project_id")}
          opcoes={projetos}
          opcaoVazia={{ value: "", label: "Todos os sistemas" }}
          className="w-44"
        />
        <SelectPesquisavel
          value={filtro.channel ?? ""}
          onChange={setCampo("channel")}
          opcoes={CANAIS}
          className="w-40"
        />
        <SelectPesquisavel
          value={filtro.status ?? ""}
          onChange={setCampo("status")}
          opcoes={SITUACOES}
          className="w-44"
        />
        <label className="flex items-center gap-1 text-12 text-secondary">
          De
          <input
            type="date"
            value={filtro.from ?? ""}
            onChange={(e) => setCampo("from")(e.target.value)}
            className={CAIXA}
          />
        </label>
        <label className="flex items-center gap-1 text-12 text-secondary">
          Até
          <input
            type="date"
            value={filtro.to ?? ""}
            onChange={(e) => setCampo("to")(e.target.value)}
            className={CAIXA}
          />
        </label>
        <SelectPesquisavel
          value={filtro.per_page ?? "50"}
          onChange={setCampo("per_page")}
          opcoes={POR_PAGINA}
          className="w-40"
        />
        <PrintButton
          appearance="label"
          documentTitle="Lista de conversas"
          auditEntity="chat_session"
          auditEntityId="gerenciador"
          auditMetadata={{ ...consulta }}
          disabled={!linhas.length}
        />
      </div>

      <div className="flex items-center justify-between text-12 text-secondary">
        <span>
          {pagina ? `${pagina.count} conversa(s)` : ""}
          {isFetching && !isLoading ? " · atualizando…" : ""}
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            disabled={paginaAtual <= 1}
            onClick={() => goToPagina(paginaAtual - 1)}
            className="rounded p-1 hover:bg-layer-2 disabled:opacity-40"
            title="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          Página {paginaAtual} de {totalDePaginas}
          <button
            type="button"
            disabled={paginaAtual >= totalDePaginas}
            onClick={() => goToPagina(paginaAtual + 1)}
            className="rounded p-1 hover:bg-layer-2 disabled:opacity-40"
            title="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-subtle">
        <table className="text-sm w-full">
          <thead className="bg-layer-2 text-12 text-secondary">
            <tr>
              <th className="font-normal p-2 text-left">Protocolo</th>
              {COLUNAS.map((c) => (
                <th key={c.titulo} className="font-normal p-2 text-left">
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-t border-subtle">
                <td className="p-2">
                  <Link href={`/${slug}/chat-view/${l.protocol}`} className="underline">
                    {l.protocol}
                  </Link>
                </td>
                {COLUNAS.map((c) => (
                  <td key={c.titulo} className="p-2">
                    {c.valor(l)}
                  </td>
                ))}
              </tr>
            ))}
            {!linhas.length && (
              <tr>
                <td colSpan={COLUNAS.length + 1} className="p-4 text-center text-13 text-secondary">
                  {isLoading ? "Carregando…" : "Nenhuma conversa encontrada."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PrintDocument
        title="Lista de conversas"
        subtitle={pagina ? `Página ${paginaAtual} de ${totalDePaginas}` : null}
        meta={[{ label: "Conversas", value: String(pagina?.count ?? 0) }]}
      >
        <PrintSection title="Conversas">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                {["Protocolo", ...COLUNAS.map((c) => c.titulo)].map((t) => (
                  <th key={t} className="border-neutral-400 border-b p-1 text-left">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id}>
                  <td className="border-neutral-200 border-b p-1">{l.protocol}</td>
                  {COLUNAS.map((c) => (
                    <td key={c.titulo} className="border-neutral-200 border-b p-1">
                      {c.valor(l)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </PrintSection>
      </PrintDocument>
    </div>
  );
}
