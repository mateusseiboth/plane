/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { buildComandosDoSdk } from "@/components/developers/widgets/comandos-do-sdk";
import { buildIndice } from "@/components/developers/widgets/indice-da-referencia";
import type { TSecaoDoIndice } from "@/components/developers/widgets/indice-da-referencia";
import { referencia } from "@/components/developers/widgets/referencia";
import { SecoesDaApi } from "@/components/developers/widgets/secoes-da-api";
import {
  SecaoCicloDeVida,
  SecaoErros,
  SecaoEventos,
  SecaoInstalar,
  SecaoLimites,
  SecaoManifesto,
  SecaoPermissoes,
  SecaoTutorial,
} from "@/components/developers/widgets/secoes-do-guia";

function CampoDeBusca({ busca, onBusca }: { busca: string; onBusca: (valor: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2 py-1.5 focus-within:ring-2 focus-within:ring-accent-strong">
      <Search aria-hidden className="size-3.5 shrink-0 text-tertiary" />
      <span className="sr-only">Buscar na referência</span>
      <input
        type="search"
        value={busca}
        onChange={(evento) => onBusca(evento.target.value)}
        placeholder="Buscar hook, API, tipo…"
        className="w-full bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
      />
    </label>
  );
}

function IndiceLateral({ indice }: { indice: TSecaoDoIndice[] }) {
  return (
    <nav aria-label="Índice da referência" className="flex flex-col gap-3 text-13">
      {indice.map((secao) => (
        <div key={secao.id} className="flex flex-col gap-1">
          <a href={`#${secao.id}`} className="font-medium text-primary hover:text-accent-primary">
            {secao.titulo}
          </a>
          {secao.itens.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="font-mono truncate pl-3 text-12 text-tertiary hover:text-accent-primary"
            >
              {item.titulo}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}

/**
 * Referência completa do SDK de widgets, montada do `referencia.json` gerado
 * do código, com índice lateral, busca, comandos de instalação pela origem
 * atual e o tutorial do exemplo até a home.
 */
export function PaginaDeReferenciaDosWidgets({ workspaceSlug }: { workspaceSlug: string }) {
  const [busca, setBusca] = useState("");
  const origem = typeof window === "undefined" ? "" : window.location.origin;
  const comandos = useMemo(() => buildComandosDoSdk(origem, referencia.pacote), [origem]);
  const indice = useMemo(() => buildIndice(referencia, busca), [busca]);
  const visiveis = useMemo(() => new Set(indice.flatMap((s) => [s.id, ...s.itens.map((i) => i.id)])), [indice]);
  const isVisivel = (id: string) => visiveis.has(id);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside className="hidden w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-subtle p-4 md:flex">
        <CampoDeBusca busca={busca} onBusca={setBusca} />
        <IndiceLateral indice={indice} />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-10">
          <header className="flex flex-col gap-2">
            <span className="tracking-wider text-12 font-medium text-accent-primary uppercase">
              Referência para desenvolvedores
            </span>
            <h1 className="text-28 font-bold text-primary">Widgets da página inicial</h1>
            <p className="text-14 text-secondary">
              {referencia.pacote.descricao} Versão {referencia.pacote.versao}.
            </p>
            <div className="md:hidden">
              <CampoDeBusca busca={busca} onBusca={setBusca} />
            </div>
          </header>

          {indice.length === 0 && <p className="text-14 text-secondary">Nada encontrado para “{busca}”.</p>}
          {isVisivel("instalar") && <SecaoInstalar comandos={comandos} versao={referencia.pacote.versao} />}
          {isVisivel("tutorial") && <SecaoTutorial comandos={comandos} workspaceSlug={workspaceSlug} />}
          {isVisivel("manifesto") && <SecaoManifesto manifesto={referencia.manifesto} />}
          {isVisivel("permissoes") && <SecaoPermissoes permissoes={referencia.permissoes} />}
          <SecoesDaApi referencia={referencia} isVisivel={isVisivel} />
          {isVisivel("ciclo-de-vida") && <SecaoCicloDeVida etapas={referencia.cicloDeVida} />}
          {isVisivel("eventos") && <SecaoEventos eventos={referencia.eventos} />}
          {isVisivel("erros") && <SecaoErros erros={referencia.erros} />}
          {isVisivel("limites") && <SecaoLimites limites={referencia.limites} />}
        </div>
      </div>
    </div>
  );
}
