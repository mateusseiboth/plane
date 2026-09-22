/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import type { TEntityContact } from "@plane/types";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { SeletorDeContato } from "@/components/chat/ligacoes/seletor-de-contato";
import { listClientInfo, readErroDoCampo } from "@/components/chat/atendente/atendente-helpers";
import { useCadastroDaConversa } from "@/components/chat/atendente/use-atendente";
// hooks
import { useEntities } from "@/hooks/use-entities";
// services
import type { ChatSession } from "@/services/chat.service";
import type { CadastroDaConversa, ErroDoChat, MudancaDoCadastro } from "@/services/atendente.service";

type Props = {
  slug: string;
  apiUrl: string;
  sessao: ChatSession;
  projetos: { value: string; label: string }[];
  /** A conversa mudou no servidor: a lista troca a linha. */
  onAtualizada: (sessao: ChatSession) => void;
};

const TITULO = "mb-2 text-11 font-semibold tracking-wider text-tertiary uppercase";

/** O cadastro de Responsáveis devolve a pessoa com a entidade; o seletor só precisa disto. */
const toContato = (r: NonNullable<CadastroDaConversa["responsavel"]>): TEntityContact => ({
  id: r.id,
  name: r.name,
  email: r.email,
  phone: r.phone,
  photo: r.photo,
  entity_id: r.entity_id,
  entity_name: r.entity_name,
});

/**
 * Entidade, sistema e responsável definidos DURANTE o atendimento, mais os
 * dados técnicos que o sistema do cliente mandou. Antes só dava para definir no
 * encerramento. Legado: `popChatAt_defineentsis*.php` e `popChatAt_defineresp.php`.
 * Cada escolha grava na hora.
 */
export function PainelDoCadastro({ slug, apiUrl, sessao, projetos, onAtualizada }: Props) {
  const versao = `${sessao.entity_id ?? ""}:${sessao.project_id ?? ""}:${sessao.entity_contact_id ?? ""}`;
  const { cadastro, api, refetch } = useCadastroDaConversa(apiUrl, slug, sessao.id, versao);
  const { entities } = useEntities(slug);
  const [erro, setErro] = useState<ErroDoChat | null>(null);
  const [gravando, setGravando] = useState(false);

  const save = async (mudanca: MudancaDoCadastro) => {
    setGravando(true);
    setErro(null);
    try {
      const novo = await api.updateCadastro(slug, sessao.id, mudanca);
      await refetch(novo, { revalidate: false });
      onAtualizada(novo.session);
    } catch (e) {
      const recusa = e as ErroDoChat;
      setErro(recusa);
      if (!recusa?.errors?.length)
        setToast({ type: TOAST_TYPE.ERROR, title: "Não gravado", message: recusa?.detail ?? "Tente de novo." });
    } finally {
      setGravando(false);
    }
  };

  const dadosDoCliente = listClientInfo(sessao.client_info ?? cadastro?.session.client_info);
  const responsavel = cadastro?.responsavel ?? null;

  return (
    <>
      <div className="border-b border-subtle p-4">
        <div className={TITULO}>Cadastro do atendimento</div>
        {responsavel?.photo && (
          <img src={responsavel.photo} alt="" className="mb-3 h-14 w-14 rounded-full object-cover" />
        )}
        <div className="flex flex-col gap-3 text-13">
          <div className="flex flex-col gap-1">
            <span className="text-12 text-secondary">Responsável</span>
            <SeletorDeContato
              workspaceSlug={slug}
              value={responsavel ? toContato(responsavel) : null}
              onChange={(contato) => void save({ entity_contact_id: contato?.id ?? "" })}
              nomeInicial={sessao.client_name}
              telefoneInicial={sessao.client_phone}
              error={readErroDoCampo(erro, "entity_contact_id")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-12 text-secondary">Entidade</span>
            <SelectPesquisavel
              value={cadastro?.entity?.id ?? ""}
              onChange={(valor) => void save({ entity_id: valor })}
              opcoes={(entities ?? []).map((e) => ({ value: e.id, label: e.name }))}
              opcaoVazia={{ value: "", label: "Sem entidade" }}
              searchPlaceholder="Buscar entidade"
              disabled={gravando}
            />
            {readErroDoCampo(erro, "entity_id") && (
              <span className="text-11 text-danger-primary">{readErroDoCampo(erro, "entity_id")}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-12 text-secondary">Sistema</span>
            <SelectPesquisavel
              value={cadastro?.project?.id ?? sessao.project_id ?? ""}
              onChange={(valor) => void save({ project_id: valor })}
              opcoes={projetos}
              opcaoVazia={{ value: "", label: "Sem sistema" }}
              searchPlaceholder="Buscar sistema"
              disabled={gravando}
            />
            {readErroDoCampo(erro, "project_id") && (
              <span className="text-11 text-danger-primary">{readErroDoCampo(erro, "project_id")}</span>
            )}
          </div>
        </div>
      </div>

      {dadosDoCliente.length > 0 && (
        <div className="border-b border-subtle p-4">
          <div className={TITULO}>Dados técnicos do cliente</div>
          <dl className="flex flex-col gap-1.5 text-13">
            {dadosDoCliente.map(({ rotulo, valor }) => (
              <div key={rotulo} className="flex flex-col">
                <dt className="text-11 text-tertiary">{rotulo}</dt>
                <dd className="break-words text-primary">{valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  );
}
