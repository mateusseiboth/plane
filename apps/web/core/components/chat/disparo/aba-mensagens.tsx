/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { History, Image as ImageIcon, Paperclip, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { groupErrosPorCampo } from "@/components/chat/ligacoes/ligacao-helpers";
import { buildFormDaMensagem, isImagem } from "@/components/chat/disparo/disparo-helpers";
import {
  BOTAO,
  BOTAO_SECUNDARIO,
  CABECALHO,
  CAIXA,
  CELULA,
  ERRO_DO_CAMPO,
  ROTULO,
  TABELA,
  formatDataHora,
  toastErro,
  toastSucesso,
} from "@/components/chat/disparo/estilos";
import { useMensagensDeDisparo } from "@/components/chat/disparo/use-disparo";
import type { ErroDoDisparo, MensagemDeDisparo } from "@/services/disparo.service";

type Props = {
  slug: string;
  apiUrl: string;
  onEnviar: (mensagemId: string) => void;
  onHistorico: (mensagemId: string) => void;
};

type Rascunho = { id: string | null; titulo: string; texto: string; arquivo: File | null; removerArquivo: boolean };

const NOVO: Rascunho = { id: null, titulo: "", texto: "", arquivo: null, removerArquivo: false };

const fromMensagem = (m: MensagemDeDisparo): Rascunho => ({
  id: m.id,
  titulo: m.titulo,
  texto: m.texto ?? "",
  arquivo: null,
  removerArquivo: false,
});

function FormDaMensagem({
  slug,
  apiUrl,
  inicial,
  arquivoAtual,
  onClose,
}: {
  slug: string;
  apiUrl: string;
  inicial: Rascunho;
  arquivoAtual: string | null;
  onClose: (salvou: boolean) => void;
}) {
  const { api } = useMensagensDeDisparo(apiUrl, slug);
  const [rascunho, setRascunho] = useState(inicial);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const update = (parte: Partial<Rascunho>) => setRascunho((r) => ({ ...r, ...parte }));

  const save = (form: FormData) =>
    rascunho.id ? api.updateMensagem(slug, rascunho.id, form) : api.createMensagem(slug, form);

  const onSave = async () => {
    setErros({});
    setSalvando(true);
    try {
      await save(buildFormDaMensagem(rascunho));
      toastSucesso("Mensagem salva.");
      onClose(true);
    } catch (e) {
      setErros(groupErrosPorCampo(e as ErroDoDisparo));
      toastErro(e, "Não foi possível salvar a mensagem.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="space-y-3 rounded-md border border-subtle bg-surface-1 p-4">
      <h3 className="text-14 font-semibold text-primary">{rascunho.id ? "Editar mensagem" : "Nova mensagem"}</h3>
      <div>
        <label htmlFor="disparo-titulo" className={ROTULO}>
          Título
        </label>
        <input
          id="disparo-titulo"
          value={rascunho.titulo}
          onChange={(e) => update({ titulo: e.target.value })}
          className={CAIXA}
          maxLength={200}
        />
        {erros.titulo && <p className={ERRO_DO_CAMPO}>{erros.titulo}</p>}
      </div>
      <div>
        <label htmlFor="disparo-texto" className={ROTULO}>
          Texto (com arquivo, vira a legenda)
        </label>
        <textarea
          id="disparo-texto"
          value={rascunho.texto}
          onChange={(e) => update({ texto: e.target.value })}
          className={`${CAIXA} min-h-32`}
          maxLength={4000}
        />
        {erros.texto && <p className={ERRO_DO_CAMPO}>{erros.texto}</p>}
      </div>
      <div>
        <label htmlFor="disparo-arquivo" className={ROTULO}>
          Arquivo (imagem ou PDF, até 10 MB)
        </label>
        <input
          id="disparo-arquivo"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          onChange={(e) => update({ arquivo: e.target.files?.[0] ?? null })}
          className="text-13 text-secondary"
        />
        {arquivoAtual && !rascunho.arquivo && (
          <label className="mt-1 flex items-center gap-2 text-12 text-secondary">
            <input
              type="checkbox"
              checked={rascunho.removerArquivo}
              onChange={(e) => update({ removerArquivo: e.target.checked })}
            />
            Remover o arquivo atual ({arquivoAtual})
          </label>
        )}
        {erros.arquivo && <p className={ERRO_DO_CAMPO}>{erros.arquivo}</p>}
      </div>
      <div className="flex gap-2">
        <button onClick={() => void onSave()} disabled={salvando} className={BOTAO}>
          Salvar
        </button>
        <button onClick={() => onClose(false)} className={BOTAO_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </section>
  );
}

export function AbaMensagens({ slug, apiUrl, onEnviar, onHistorico }: Props) {
  const { data: mensagens, isLoading, refetch, api } = useMensagensDeDisparo(apiUrl, slug);
  const [editando, setEditando] = useState<{ rascunho: Rascunho; arquivo: string | null } | null>(null);

  const onClose = (salvou: boolean) => {
    setEditando(null);
    if (salvou) void refetch();
  };

  const onDelete = async (m: MensagemDeDisparo) => {
    if (!window.confirm(`Excluir a mensagem "${m.titulo}"? O histórico de envios continua disponível.`)) return;
    try {
      await api.deleteMensagem(slug, m.id);
      void refetch();
    } catch (e) {
      toastErro(e, "Não foi possível excluir a mensagem.");
    }
  };

  const onStatus = async (m: MensagemDeDisparo) => {
    if (!window.confirm(`Publicar a imagem de "${m.titulo}" no Status do WhatsApp?`)) return;
    try {
      await api.sendStatus(slug, m.id);
      toastSucesso("Imagem publicada no Status.");
    } catch (e) {
      toastErro(e, "Não foi possível publicar no Status.");
    }
  };

  return (
    <div className="space-y-4">
      {editando ? (
        <FormDaMensagem
          slug={slug}
          apiUrl={apiUrl}
          inicial={editando.rascunho}
          arquivoAtual={editando.arquivo}
          onClose={onClose}
        />
      ) : (
        <button
          onClick={() => setEditando({ rascunho: NOVO, arquivo: null })}
          className={`${BOTAO} flex items-center gap-1`}
        >
          <Plus className="h-4 w-4" /> Nova mensagem
        </button>
      )}

      {isLoading && <p className="text-13 text-tertiary">Carregando…</p>}
      {!isLoading && mensagens.length === 0 && <p className="text-13 text-tertiary">Nenhuma mensagem cadastrada.</p>}
      {mensagens.length > 0 && (
        <table className={TABELA}>
          <thead className={CABECALHO}>
            <tr>
              <th className={CELULA}>Título</th>
              <th className={CELULA}>Arquivo</th>
              <th className={CELULA}>Último envio</th>
              <th className={CELULA}>Destinatários</th>
              <th className={CELULA} />
            </tr>
          </thead>
          <tbody>
            {mensagens.map((m) => (
              <tr key={m.id} className="border-b border-subtle">
                <td className={CELULA}>
                  <div className="font-medium text-primary">{m.titulo}</div>
                  {m.texto && <div className="line-clamp-1 text-12 text-tertiary">{m.texto}</div>}
                </td>
                <td className={CELULA}>
                  {m.media_key && (
                    <a
                      href={api.mediaUrl(m.media_key, m.media_mime)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-12 text-accent-primary hover:underline"
                    >
                      <Paperclip className="h-3.5 w-3.5" /> {m.media_name}
                    </a>
                  )}
                </td>
                <td className={CELULA}>{formatDataHora(m.ultimo_envio?.created_at)}</td>
                <td className={CELULA}>{m.ultimo_envio?.total ?? ""}</td>
                <td className={`${CELULA} text-right whitespace-nowrap`}>
                  <button onClick={() => onEnviar(m.id)} className={BOTAO_SECUNDARIO} title="Enviar">
                    <Send className="h-4 w-4" />
                  </button>{" "}
                  {isImagem(m.media_mime) && (
                    <button onClick={() => void onStatus(m)} className={BOTAO_SECUNDARIO} title="Publicar no Status">
                      <ImageIcon className="h-4 w-4" />
                    </button>
                  )}{" "}
                  <button onClick={() => onHistorico(m.id)} className={BOTAO_SECUNDARIO} title="Histórico de envios">
                    <History className="h-4 w-4" />
                  </button>{" "}
                  <button
                    onClick={() => setEditando({ rascunho: fromMensagem(m), arquivo: m.media_name })}
                    className={BOTAO_SECUNDARIO}
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>{" "}
                  <button onClick={() => void onDelete(m)} className={BOTAO_SECUNDARIO} title="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
