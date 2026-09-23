/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { CalendarDays, Clock, Layers, Mail, ShieldCheck, UserRound, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
// hooks
import { usePerfilDaHome } from "@/hooks/use-home-painel";
// services
import type { TPerfilDaHome } from "@/services/home-painel.service";
// local imports
import { CartaoDoPainel, EsqueletoDoCartao } from "./cartao";
import { SEM_VALOR, formatDataLonga, formatTempoRelativo } from "./painel-rules";

type TLinhaDeDetalhe = { icone: LucideIcon; rotulo: string; valor: ReactNode };

function ListaDeDetalhes({ linhas }: { linhas: TLinhaDeDetalhe[] }) {
  return (
    <dl className="flex flex-col gap-3.5">
      {linhas.map(({ icone: Icone, rotulo, valor }) => (
        <div key={rotulo} className="flex items-start gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-layer-1 text-tertiary dark:bg-layer-2">
            <Icone aria-hidden className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <dt className="text-11 text-tertiary">{rotulo}</dt>
            <dd className="text-13 break-words text-primary">{valor}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

/** Linhas sem dado somem: melhor não mostrar do que mostrar um vazio. */
const buildDetalhes = (perfil: TPerfilDaHome): TLinhaDeDetalhe[] =>
  [
    { icone: CalendarDays, rotulo: "Entrou em", valor: perfil.entrou_em ? formatDataLonga(perfil.entrou_em) : null },
    { icone: ShieldCheck, rotulo: "Papel", valor: perfil.papel },
    { icone: Users, rotulo: "Equipe", valor: perfil.equipe },
    {
      icone: Layers,
      rotulo: "Sistemas em que atua",
      valor: perfil.sistemas.length ? perfil.sistemas.map((s) => s.name).join(", ") : SEM_VALOR,
    },
    { icone: Mail, rotulo: "E-mail", valor: perfil.email },
  ].filter((linha) => linha.valor);

export function DetalhesDaPessoa({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: perfil, isLoading } = usePerfilDaHome(workspaceSlug);
  return (
    <CartaoDoPainel titulo="Detalhes">
      {isLoading || !perfil ? <EsqueletoDoCartao linhas={5} /> : <ListaDeDetalhes linhas={buildDetalhes(perfil)} />}
    </CartaoDoPainel>
  );
}

const buildAcesso = (perfil: TPerfilDaHome, agora: Date): TLinhaDeDetalhe[] =>
  [
    {
      icone: Clock,
      rotulo: "Último acesso",
      valor: perfil.ultimo_acesso ? (
        <time dateTime={perfil.ultimo_acesso} title={formatDataLonga(perfil.ultimo_acesso)}>
          {formatTempoRelativo(perfil.ultimo_acesso, agora)}
        </time>
      ) : null,
    },
    { icone: UserRound, rotulo: "Gestor", valor: perfil.gestor },
  ].filter((linha) => linha.valor);

export function AcessoDaPessoa({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: perfil, isLoading } = usePerfilDaHome(workspaceSlug);
  const linhas = perfil ? buildAcesso(perfil, new Date()) : [];
  if (!isLoading && !linhas.length) return null;
  return (
    <CartaoDoPainel titulo="Atividade">
      {isLoading ? <EsqueletoDoCartao linhas={2} /> : <ListaDeDetalhes linhas={linhas} />}
    </CartaoDoPainel>
  );
}
