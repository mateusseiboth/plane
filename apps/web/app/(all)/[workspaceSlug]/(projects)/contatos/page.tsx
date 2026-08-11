"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Contact, Pencil, Plus, Search, ToggleLeft, ToggleRight } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TEntityContact } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { PageHead } from "@/components/core/page-title";
import { ContatoFormModal, mensagemDeErro } from "@/components/entity-contacts";
// hooks
import useDebounce from "@/hooks/use-debounce";
import { useEntities } from "@/hooks/use-entities";
import { useEntityContactsPage, useEntityContactTypes } from "@/hooks/use-entity-contacts";
import { useWorkspace } from "@/hooks/store/use-workspace";
// services
import entityContactService, { type TEntityContactFilters } from "@/services/entity-contact.service";

type TSituacao = "todos" | "ativos" | "inativos";

const SITUACOES: { value: TSituacao; label: string }[] = [
  { value: "todos", label: "Ativos e inativos" },
  { value: "ativos", label: "Somente ativos" },
  { value: "inativos", label: "Somente inativos" },
];

/** `is_active` só entra na consulta quando o usuário escolhe um dos dois lados. */
function paraFiltroDeSituacao(situacao: TSituacao): boolean | undefined {
  if (situacao === "ativos") return true;
  if (situacao === "inativos") return false;
  return undefined;
}

function SituacaoBadge({ ativo }: { ativo: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        ativo
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      }`}
    >
      {ativo ? "Ativo" : "Inativo"}
    </span>
  );
}

const POR_PAGINA = 50;

/**
 * Célula de uma linha só. Nome de contato e razão social de órgão são longos
 * ("SERVICO AUTONOMO DE AGUA E ESGOTO DE BANDEIRANTES") — deixá-los quebrar
 * fazia a linha crescer e empurrava Situação e Ações para fora da tela. Corta
 * com reticências e mostra o texto inteiro ao passar o mouse.
 */
function CelulaTruncada({ texto, className }: { texto?: string | null; className?: string }) {
  if (!texto) return <td className={cn("px-4 py-2.5 text-secondary-text", className)}>—</td>;
  return (
    <td className={cn("px-4 py-2.5 text-secondary-text", className)}>
      <Tooltip tooltipContent={texto} position="top">
        <span className="block truncate">{texto}</span>
      </Tooltip>
    </td>
  );
}

/**
 * Memoizada de propósito: sem isso, abrir um dropdown do filtro re-renderiza
 * todas as linhas da página — foi o que travava a tela com a lista inteira.
 */
const LinhaDeContato = memo(function LinhaDeContato({
  contact,
  onEditar,
  onAlternar,
}: {
  contact: TEntityContact;
  onEditar: (contact: TEntityContact) => void;
  onAlternar: (contact: TEntityContact) => void;
}) {
  const ativo = contact.is_active !== false;
  return (
    <tr className="transition-colors hover:bg-surface-2">
      <CelulaTruncada texto={contact.name} className="font-medium text-primary" />
      <CelulaTruncada texto={contact.type_name} />
      <CelulaTruncada texto={contact.entity_name} />
      <CelulaTruncada texto={contact.phone} />
      <CelulaTruncada texto={contact.email} />
      <td className="px-4 py-2.5">
        <SituacaoBadge ativo={ativo} />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onEditar(contact)}
            title="Editar contato"
            className="rounded p-1 text-secondary-text transition-colors hover:bg-surface-3 hover:text-primary"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onAlternar(contact)}
            title={ativo ? "Desativar contato" : "Reativar contato"}
            className="rounded p-1 text-secondary-text transition-colors hover:bg-surface-3 hover:text-primary"
          >
            {ativo ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
          </button>
        </div>
      </td>
    </tr>
  );
});

function ContatosPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { currentWorkspace } = useWorkspace();

  const [busca, setBusca] = useState("");
  const [entidadeId, setEntidadeId] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [situacao, setSituacao] = useState<TSituacao>("todos");
  const [modal, setModal] = useState<{ open: boolean; contact?: TEntityContact | null }>({ open: false });

  const buscaAdiada = useDebounce(busca, 300);

  const filtros: TEntityContactFilters = useMemo(
    () => ({
      search: buscaAdiada.trim() || undefined,
      entity_id: entidadeId || undefined,
      type_id: tipoId || undefined,
      is_active: paraFiltroDeSituacao(situacao),
    }),
    [buscaAdiada, entidadeId, tipoId, situacao]
  );

  // Mudou o filtro, volta para a primeira página: o cursor da anterior aponta
  // para uma consulta que não existe mais.
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  useEffect(() => setCursor(undefined), [filtros]);

  const { contacts, total, nextCursor, prevCursor, hasNext, hasPrev, isLoading, error, refetch } =
    useEntityContactsPage(slug, filtros, POR_PAGINA, cursor);
  const { entities } = useEntities(slug);
  const { types } = useEntityContactTypes(slug);

  const abrirEdicao = useCallback((contact: TEntityContact) => setModal({ open: true, contact }), []);

  const alternarSituacao = useCallback(
    async (contact: TEntityContact) => {
      const ativar = contact.is_active === false;
      try {
        await entityContactService.update(slug, contact.id, { is_active: ativar });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: ativar ? "Reativado" : "Desativado",
          message: `${contact.name} foi ${ativar ? "reativado" : "desativado"}.`,
        });
        refetch();
      } catch (erro) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Erro",
          message: mensagemDeErro(erro, "Falha ao alterar a situação do contato."),
        });
      }
    },
    [slug, refetch]
  );

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Contatos` : "Contatos";
  const semFiltros = !filtros.search && !filtros.entity_id && !filtros.type_id && situacao === "todos";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PageHead title={pageTitle} />

      <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
        <div className="flex items-center gap-2">
          <Contact className="h-5 w-5 text-secondary" />
          <div>
            <h1 className="text-lg font-semibold">Contatos</h1>
            <p className="text-13 text-secondary">
              {total} contato{total !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModal({ open: true, contact: null })}
          className="inline-flex items-center gap-1.5 rounded bg-accent-primary px-3 py-2 text-13 font-medium text-white hover:bg-accent-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo contato
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-subtle px-6 py-3">
        <div className="flex min-w-55 flex-1 items-center gap-1.5 rounded-md border border-subtle bg-surface-2 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-secondary-text" />
          <input
            className="w-full border-none bg-transparent text-xs text-primary outline-none placeholder:text-secondary-text"
            placeholder="Buscar por nome, e-mail ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <SelectPesquisavel
          value={entidadeId}
          onChange={setEntidadeId}
          opcoes={(entities ?? []).map((entidade) => ({
            value: entidade.id,
            label: entidade.name,
            descricao: [entidade.city, entidade.state].filter(Boolean).join("/"),
          }))}
          opcaoVazia={{ value: "", label: "Todas as entidades" }}
          className="w-56"
          buttonClassName="h-8 text-xs"
        />
        <SelectPesquisavel
          value={tipoId}
          onChange={setTipoId}
          opcoes={types.map((tipo) => ({ value: tipo.id, label: tipo.name }))}
          opcaoVazia={{ value: "", label: "Todos os tipos" }}
          className="w-48"
          buttonClassName="h-8 text-xs"
        />
        <SelectPesquisavel
          value={situacao}
          onChange={(valor) => setSituacao(valor as TSituacao)}
          opcoes={SITUACOES}
          className="w-44"
          buttonClassName="h-8 text-xs"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="rounded border border-subtle bg-surface-2 px-4 py-3 text-13 text-secondary">
            Não foi possível carregar os contatos. Tente novamente em instantes.
          </div>
        )}

        {!error && isLoading && contacts.length === 0 && (
          <p className="py-8 text-center text-sm text-secondary">Carregando contatos...</p>
        )}

        {!error && !isLoading && contacts.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-secondary">
            <Contact className="h-12 w-12 opacity-50" />
            <p className="text-sm">
              {semFiltros
                ? 'Nenhum contato cadastrado. Clique em "Novo contato" para começar.'
                : "Nenhum contato encontrado com os filtros atuais."}
            </p>
          </div>
        )}

        {!error && contacts.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-subtle">
            {/* `table-fixed` é o que segura as larguras: sem ele o navegador dá
                à coluna Nome o espaço do maior texto e o resto sai da tela. */}
            <table className="w-full min-w-225 table-fixed text-xs">
              <thead className="bg-surface-2 text-secondary-text">
                <tr>
                  <th className="w-[22%] px-4 py-2.5 text-left font-medium">Nome</th>
                  <th className="w-[14%] px-4 py-2.5 text-left font-medium">Tipo</th>
                  <th className="w-[24%] px-4 py-2.5 text-left font-medium">Entidade</th>
                  <th className="w-[12%] px-4 py-2.5 text-left font-medium">Telefone</th>
                  <th className="w-[18%] px-4 py-2.5 text-left font-medium">E-mail</th>
                  <th className="w-[6%] px-4 py-2.5 text-left font-medium">Situação</th>
                  <th className="w-[4%] px-4 py-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {contacts.map((contact) => (
                  <LinhaDeContato
                    key={contact.id}
                    contact={contact}
                    onEditar={abrirEdicao}
                    onAlternar={alternarSituacao}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!error && (hasPrev || hasNext) && (
          <div className="mt-3 flex items-center justify-between text-xs text-secondary">
            <span>
              Mostrando {contacts.length} de {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!hasPrev}
                onClick={() => setCursor(prevCursor ?? undefined)}
                className="inline-flex items-center gap-1 rounded border border-subtle px-2 py-1 disabled:opacity-40 enabled:hover:bg-surface-2"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </button>
              <button
                type="button"
                disabled={!hasNext}
                onClick={() => setCursor(nextCursor ?? undefined)}
                className="inline-flex items-center gap-1 rounded border border-subtle px-2 py-1 disabled:opacity-40 enabled:hover:bg-surface-2"
              >
                Próxima
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <ContatoFormModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        workspaceSlug={slug}
        contact={modal.contact}
        entityId={entidadeId || null}
        onSaved={() => refetch()}
      />
    </div>
  );
}

export default observer(ContatosPage);
