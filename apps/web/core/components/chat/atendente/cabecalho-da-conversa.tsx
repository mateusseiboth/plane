/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  BellOff,
  BellRing,
  Link2,
  MoreHorizontal,
  Pause,
  Phone,
  Play,
  Ticket,
  UserCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
// plane imports
import { CustomMenu } from "@plane/ui";
// local imports
import { useAcoesDaConversa } from "@/components/chat/acoes-da-conversa";
import { useAlertaSemResposta } from "@/components/chat/atendente/alerta-sem-resposta";
import { SessionAvatar } from "@/components/chat/atendente/avatar-da-sessao";
import {
  findAcoesDaConversa,
  splitAcoesPorLargura,
  type AcaoDaConversa,
} from "@/components/chat/atendente/acoes-do-cabecalho";
import {
  ETIQUETA_DO_CABECALHO,
  TOM_DO_BOTAO,
  findCorDoStatus,
  findRotuloDoStatus,
  type TomDoBotao,
} from "@/components/chat/atendente/cores-do-atendimento";
import type { PermissoesDoAtendimento } from "@/components/chat/permissoes-do-atendimento";
import { useAppRouter } from "@/hooks/use-app-router";
import type { ChatSession } from "@/services/chat.service";

type ItemDaAcao = {
  rotulo: string;
  /** Rótulo no menu "Mais", quando o do botão é curto demais fora do contexto. */
  rotuloNoMenu?: string;
  titulo: string;
  Icone: LucideIcon;
  tom: TomDoBotao;
  onClick: () => void;
  href?: string;
  disabled?: boolean;
};

type Props = {
  sessao: ChatSession;
  slug: string;
  apiUrl: string;
  projetos: { value: string; label: string }[];
  chatUrl: string;
  permissoes: PermissoesDoAtendimento;
  /** Cliente sem resposta além do prazo (borda vermelha). */
  isSemResposta: boolean;
  isClienteDigitando: boolean;
  onAssumir: () => void;
  onCopyLink: () => void;
  onTransferir: () => void;
  onEncerrar: () => void;
  onAtualizada: (sessao: ChatSession) => void;
  onAlertaPausado: (sessao: ChatSession) => void;
};

/** Largura atual do elemento, acompanhada por ResizeObserver. */
function useLarguraDoElemento<T extends HTMLElement>() {
  const [largura, setLargura] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((elemento: T | null) => {
    observer.current?.disconnect();
    if (!elemento) return;
    setLargura(elemento.getBoundingClientRect().width);
    observer.current = new ResizeObserver(([entrada]) => setLargura(entrada?.contentRect.width ?? 0));
    observer.current.observe(elemento);
  }, []);
  return { ref, largura };
}

function BotaoDaAcao({ item, isOnlyIcone }: { item: ItemDaAcao; isOnlyIcone: boolean }) {
  const { rotulo, titulo, Icone, tom, onClick, href, disabled } = item;
  const className = `flex shrink-0 items-center gap-1 rounded-md py-1.5 text-12 whitespace-nowrap transition-colors disabled:opacity-50 ${
    isOnlyIcone ? "px-1.5" : "px-2.5"
  } ${TOM_DO_BOTAO[tom]}`;
  const conteudo = (
    <>
      <Icone className="h-3.5 w-3.5 shrink-0" />
      {!isOnlyIcone && rotulo}
    </>
  );
  if (href)
    return (
      <Link href={href} className={className} title={titulo} aria-label={titulo}>
        {conteudo}
      </Link>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      title={titulo}
      aria-label={titulo}
    >
      {conteudo}
    </button>
  );
}

function MenuMais({ itens }: { itens: ItemDaAcao[] }) {
  const router = useAppRouter();
  if (!itens.length) return null;
  return (
    <CustomMenu
      customButton={
        <span
          title="Mais ações da conversa"
          className="grid place-items-center rounded-md border border-subtle p-1.5 text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </span>
      }
      ariaLabel="Mais ações da conversa"
      placement="bottom-end"
      closeOnSelect
    >
      {itens.map(({ rotulo, rotuloNoMenu, Icone, onClick, href, disabled }) => (
        <CustomMenu.MenuItem
          key={rotulo}
          onClick={href ? () => router.push(href) : onClick}
          disabled={disabled}
          className="flex items-center gap-2"
        >
          <Icone className="h-3.5 w-3.5 shrink-0" />
          {rotuloNoMenu ?? rotulo}
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
}

/**
 * Cabeçalho da conversa aberta. O nome do cliente encolhe com reticências; os
 * botões nunca passam por cima dele: conforme a largura do próprio cabeçalho,
 * as ações secundárias vão para o menu "Mais" e as principais ficam só com o
 * ícone (o nome da ação vai no `title`). Regra em `acoes-do-cabecalho.ts`.
 */
export function CabecalhoDaConversa(props: Props) {
  const { sessao, slug, permissoes, isSemResposta, isClienteDigitando } = props;
  const { ref, largura } = useLarguraDoElemento<HTMLElement>();
  const acoes = useAcoesDaConversa(props);
  const alerta = useAlertaSemResposta({ ...props, onAtualizada: props.onAlertaPausado });

  const ITENS: Record<AcaoDaConversa, ItemDaAcao> = {
    assumir: {
      rotulo: "Assumir",
      titulo: "Assumir atendimento",
      Icone: UserCheck,
      tom: "principal",
      onClick: props.onAssumir,
    },
    link: {
      rotulo: "Link",
      rotuloNoMenu: "Copiar link do chat",
      titulo: "Copiar link do chat",
      Icone: Link2,
      tom: "neutro",
      onClick: props.onCopyLink,
    },
    chamado: sessao.issue_label
      ? {
          rotulo: sessao.issue_label,
          titulo: `Abrir o chamado ${sessao.issue_label}`,
          Icone: Ticket,
          tom: "neutro",
          onClick: () => undefined,
          href: `/${slug}/browse/${sessao.issue_label}/`,
        }
      : {
          rotulo: "Chamado",
          titulo: "Abrir chamado com esta conversa",
          Icone: Ticket,
          tom: "neutro",
          onClick: acoes.openChamado,
        },
    pausar:
      acoes.pausa === "pause"
        ? {
            rotulo: "Pausar",
            rotuloNoMenu: "Pausar atendimento",
            titulo: "Pausar atendimento",
            Icone: Pause,
            tom: "neutro",
            onClick: acoes.changePausa,
          }
        : {
            rotulo: "Retomar",
            rotuloNoMenu: "Retomar atendimento",
            titulo: "Retomar atendimento",
            Icone: Play,
            tom: "neutro",
            onClick: acoes.changePausa,
          },
    alerta: {
      rotulo: alerta.pausado ? "Retomar alerta" : "Pausar alerta",
      titulo: alerta.pausado ?? "Pausar o alerta de cliente sem resposta por 40 minutos",
      Icone: alerta.pausado ? BellRing : BellOff,
      tom: "neutro",
      onClick: alerta.changeAlerta,
      disabled: alerta.enviando,
    },
    transferir: {
      rotulo: "Transferir",
      rotuloNoMenu: "Transferir atendimento",
      titulo: "Transferir atendimento",
      Icone: Users,
      tom: "neutro",
      onClick: props.onTransferir,
    },
    encerrar: {
      rotulo: "Encerrar",
      titulo: "Encerrar atendimento",
      Icone: X,
      tom: "perigo",
      onClick: props.onEncerrar,
    },
  };

  const layout = splitAcoesPorLargura(findAcoesDaConversa(sessao, permissoes), largura);
  const nome = sessao.client_name || sessao.client_phone || "Visitante";
  const sistema = sessao.project_identifier || sessao.project_name;

  return (
    <header ref={ref} className="flex items-center gap-3 border-b border-subtle bg-surface-1 px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <SessionAvatar name={sessao.client_name} phone={sessao.client_phone} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm min-w-0 truncate font-semibold text-primary" title={nome}>
              {nome}
            </span>
            {sessao.channel === "whatsapp" && (
              // Cabeçalho estreito: a etiqueta fica só com o ícone para sobrar espaço ao nome.
              <span
                title="WhatsApp"
                className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-10 font-medium ${ETIQUETA_DO_CABECALHO.whatsapp}`}
              >
                <Phone className="h-2.5 w-2.5" />
                {!layout.isOnlyIcone && "WhatsApp"}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
            <span className="shrink-0 text-11 text-tertiary">#{sessao.protocol}</span>
            <span className="shrink-0 text-tertiary">·</span>
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-10 font-medium ${findCorDoStatus(sessao.status)}`}
            >
              {findRotuloDoStatus(sessao.status)}
            </span>
            {sistema && (
              <span
                className={`min-w-0 truncate rounded-full px-1.5 py-0.5 text-10 font-medium ${ETIQUETA_DO_CABECALHO.sistema}`}
                title={sistema}
              >
                {sistema}
              </span>
            )}
            {isSemResposta && (
              <span className="shrink-0 text-11 font-medium text-danger-primary">· ⚠ Aguardando resposta</span>
            )}
            {isClienteDigitando && (
              <span className={`shrink-0 text-11 font-medium ${ETIQUETA_DO_CABECALHO.digitando}`}>· digitando…</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {layout.visiveis.map((acao) => (
          <BotaoDaAcao key={acao} item={ITENS[acao]} isOnlyIcone={layout.isOnlyIcone} />
        ))}
        <MenuMais itens={layout.noMenu.map((acao) => ITENS[acao])} />
      </div>
      {acoes.modalDoChamado}
    </header>
  );
}
