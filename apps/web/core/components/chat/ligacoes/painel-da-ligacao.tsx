/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState, type ReactNode } from "react";
import { PhoneCall, PhoneMissed, Ticket } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TEntityContact, TIssue } from "@plane/types";
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import {
  buildChamadoDaLigacao,
  formatDuracao,
  groupErrosPorCampo,
  statusDaLigacaoLabel,
} from "@/components/chat/ligacoes/ligacao-helpers";
import { SeletorDeContato } from "@/components/chat/ligacoes/seletor-de-contato";
import { useLigacao } from "@/components/chat/ligacoes/use-ligacoes";
import type { ChatSession } from "@/services/chat.service";
import { InboxIssueService } from "@/services/inbox";
import type { ErroDaLigacao, LigacaoDetalhe, LigacoesApi } from "@/services/ligacoes.service";

const inboxIssueService = new InboxIssueService();

type Opcao = { value: string; label: string };

type Props = {
  slug: string;
  apiUrl: string;
  session: ChatSession;
  projetos: Opcao[];
  /** Depois de assumir, concluir ou vincular: a lista de atendimentos recarrega. */
  onChanged: () => void;
};

const CAIXA =
  "w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary outline-none focus:border-accent-primary";
const BOTAO =
  "rounded-md bg-primary px-3 py-1.5 text-12 font-medium text-on-color hover:bg-primary/90 disabled:opacity-50";
const BOTAO_SECUNDARIO =
  "rounded-md border border-subtle px-3 py-1.5 text-12 text-secondary hover:bg-layer-1 disabled:opacity-50";

const formatData = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "");

const toastErro = (e: ErroDaLigacao | undefined, padrao: string) =>
  setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: e?.detail || padrao });

function Linha({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  if (!valor) return null;
  return (
    <div className="flex justify-between gap-3 text-12">
      <span className="text-tertiary">{rotulo}</span>
      <span className="truncate text-right text-primary">{valor}</span>
    </div>
  );
}

function DadosDaLigacao({ detalhe }: { detalhe: LigacaoDetalhe }) {
  const l = detalhe.ligacao;
  if (!l) return null;
  const Icone = l.status === "missed" ? PhoneMissed : PhoneCall;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-13 font-semibold text-primary">
        <Icone className={`h-4 w-4 ${l.status === "missed" ? "text-danger-primary" : "text-green-600"}`} />
        {statusDaLigacaoLabel(l.status)}
      </div>
      <Linha rotulo="Origem" valor={l.caller} />
      <Linha rotulo="Ramal" valor={l.extension} />
      <Linha rotulo="Início" valor={formatData(l.started_at)} />
      <Linha rotulo="Duração" valor={formatDuracao(l.duration_sec)} />
      <Linha
        rotulo="Quem ligou"
        valor={
          detalhe.responsavel
            ? `${detalhe.responsavel.name}${detalhe.responsavel.entity_name ? `, ${detalhe.responsavel.entity_name}` : ""}`
            : "Não identificado"
        }
      />
      {l.recording_url && (
        <audio controls preload="none" src={l.recording_url} className="mt-1 h-8 w-full">
          <a href={l.recording_url} target="_blank" rel="noreferrer">
            Ouvir gravação
          </a>
        </audio>
      )}
    </div>
  );
}

type FormProps = {
  slug: string;
  detalhe: LigacaoDetalhe;
  projetos: Opcao[];
  api: LigacoesApi;
  onDone: () => void;
};

function FormularioDeConclusao({ slug, detalhe, projetos, api, onDone }: FormProps) {
  const { session } = detalhe;
  const [projeto, setProjeto] = useState(session.project_id ?? "");
  const [descricao, setDescricao] = useState("");
  const [contato, setContato] = useState<TEntityContact | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const precisaDeContato = !session.entity_contact_id;

  const onConcluir = async () => {
    setSalvando(true);
    setErros({});
    try {
      await api.conclude(slug, session.id, {
        project_id: projeto,
        descricao,
        ...(contato ? { contact: { contact_id: contato.id } } : {}),
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Ligação concluída", message: `Protocolo ${session.protocol}.` });
      onDone();
    } catch (e) {
      setErros(groupErrosPorCampo(e as ErroDaLigacao));
      toastErro(e as ErroDaLigacao, "Não foi possível concluir a ligação.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-12 font-medium text-secondary">Sistema</p>
        <SelectPesquisavel
          value={projeto}
          onChange={setProjeto}
          opcoes={projetos}
          placeholder="Selecione o sistema"
          searchPlaceholder="Buscar sistema"
        />
        {erros.project_id && <p className="mt-1 text-11 text-danger-primary">{erros.project_id}</p>}
      </div>
      {precisaDeContato && (
        <div>
          <p className="mb-1 text-12 font-medium text-secondary">Quem ligou</p>
          <SeletorDeContato
            workspaceSlug={slug}
            value={contato}
            onChange={setContato}
            telefoneInicial={session.client_phone}
            error={erros.contact}
          />
        </div>
      )}
      <div>
        <label htmlFor={`descricao-${session.id}`} className="mb-1 block text-12 font-medium text-secondary">
          O que o cliente pediu
        </label>
        <textarea
          id={`descricao-${session.id}`}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={3}
          className={CAIXA}
        />
        {erros.descricao && <p className="mt-1 text-11 text-danger-primary">{erros.descricao}</p>}
      </div>
      <div className="flex justify-end">
        <button onClick={onConcluir} disabled={salvando} className={BOTAO}>
          Concluir ligação
        </button>
      </div>
    </div>
  );
}

function ChamadoDaLigacao({ slug, detalhe, projetos, api, onDone }: FormProps) {
  const { session, ligacao, responsavel } = detalhe;
  const [projeto, setProjeto] = useState(session.project_id ?? "");
  const [criando, setCriando] = useState(false);
  if (!ligacao) return null;

  if (ligacao.ticket_label) {
    const href =
      ligacao.ticket_kind === "intake"
        ? `/${slug}/projects/${ligacao.ticket_project_id}/intake?currentTab=open&inboxIssueId=${ligacao.ticket_id}`
        : `/${slug}/browse/${ligacao.ticket_label}/`;
    return (
      <a href={href} className="flex items-center gap-1.5 text-12 text-accent-primary hover:underline">
        <Ticket className="h-3.5 w-3.5" />
        Chamado {ligacao.ticket_label}
      </a>
    );
  }

  const onCreateSolicitacao = async () => {
    setCriando(true);
    try {
      const chamado = buildChamadoDaLigacao({
        protocol: session.protocol,
        clientName: session.client_name,
        clientPhone: session.client_phone,
        descricao: ligacao.descricao,
        entityId: responsavel?.entity_id,
        chatUrl: `${window.location.origin}/${slug}/chat-view/${session.protocol}`,
      });
      const criada = await inboxIssueService.create(slug, projeto, chamado as Partial<TIssue>);
      await api.linkChamado(slug, session.id, { kind: "intake", issue_id: criada.issue?.id ?? criada.id });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Solicitação criada",
        message: "O chamado ficou vinculado à ligação.",
      });
      onDone();
    } catch (e) {
      toastErro(e as ErroDaLigacao, "Não foi possível criar a solicitação.");
    } finally {
      setCriando(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <SelectPesquisavel
        value={projeto}
        onChange={setProjeto}
        opcoes={projetos}
        opcaoVazia={{ value: "", label: "Sistema do chamado" }}
        searchPlaceholder="Buscar sistema"
        className="flex-1"
        buttonClassName="h-8 text-12"
      />
      <button onClick={onCreateSolicitacao} disabled={!projeto || criando} className={BOTAO_SECUNDARIO}>
        Abrir chamado
      </button>
    </div>
  );
}

/**
 * Painel da ligação do FreePBX na janela do atendimento: dados do PBX, quem
 * ligou, assumir, concluir (sistema, descrição e contato) e abrir o chamado.
 */
export function PainelDaLigacao({ slug, apiUrl, session, projetos, onChanged }: Props) {
  const versao = `${session.status}:${session.last_message_at ?? ""}`;
  const { data, isLoading, refetch, api } = useLigacao(apiUrl, slug, session.id, versao);
  const [assumindo, setAssumindo] = useState(false);

  const done = () => {
    void refetch();
    onChanged();
  };

  const onAssumir = async () => {
    setAssumindo(true);
    try {
      await api.assume(slug, session.id);
      done();
    } catch (e) {
      toastErro(e as ErroDaLigacao, "Não foi possível assumir a ligação.");
    } finally {
      setAssumindo(false);
    }
  };

  if (isLoading || !data)
    return <div className="border-b border-subtle p-4 text-12 text-tertiary">Carregando ligação…</div>;

  const semAtendente = !data.session.assigned_attendant_id && data.session.status !== "closed";
  const concluida = Boolean(data.ligacao?.concluded_at);

  return (
    <div className="max-h-[55%] space-y-4 overflow-y-auto border-b border-subtle bg-surface-1 p-4">
      <DadosDaLigacao detalhe={data} />
      {semAtendente && (
        <button onClick={onAssumir} disabled={assumindo} className={BOTAO}>
          Assumir ligação
        </button>
      )}
      {!semAtendente && !concluida && (
        <FormularioDeConclusao slug={slug} detalhe={data} projetos={projetos} api={api} onDone={done} />
      )}
      {concluida && (
        <div className="space-y-2 rounded-md border border-subtle bg-layer-1 p-3">
          <p className="text-11 text-tertiary">Concluída em {formatData(data.ligacao!.concluded_at)}</p>
          <p className="text-13 whitespace-pre-wrap text-primary">{data.ligacao!.descricao}</p>
        </div>
      )}
      {concluida && <ChamadoDaLigacao slug={slug} detalhe={data} projetos={projetos} api={api} onDone={done} />}
    </div>
  );
}
