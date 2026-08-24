/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * A fila de chamados do portal concluídos que ainda não têm resposta ao cliente.
 *
 * A conclusão de um chamado acontece por muitos caminhos — arrastar no quadro,
 * trocar o estado no detalhe, no peek, na planilha, pela triagem, em massa.
 * Interceptar cada um deles seria deixar um de fora no dia seguinte, então NADA
 * é interceptado aqui: quem decide é o servidor, que sabe derivar a pendência
 * (origem portal + estado concluído + sem resposta + sem dispensa).
 *
 * Este gancho só pergunta "tem algo a responder?" em dois momentos: ao abrir o
 * espaço de trabalho e sempre que o barramento de tempo real avisar que ESTE
 * usuário mexeu em algum chamado — o que todo caminho de conclusão publica.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useUser } from "@/hooks/store/user";
import { useRealtimeRefetch } from "@/hooks/use-realtime";
import { portalRespostaService, type TRespostaPendente } from "@/services/portal-resposta.service";

export function useRespostaAoCliente(workspaceSlug: string | undefined) {
  // Fechar a janela no "X" não resolve nada, mas também não pode reabrir a cada
  // evento: o chamado continua pendente e volta a aparecer na próxima sessão.
  const [adiados, setAdiados] = useState<string[]>([]);
  const emVoo = useRef(false);

  const chave = workspaceSlug ? `PORTAL_RESPOSTAS_PENDENTES_${workspaceSlug}` : null;
  const { data, mutate } = useSWR<TRespostaPendente[]>(
    chave,
    chave ? () => portalRespostaService.pendentes(workspaceSlug!) : null,
    { revalidateOnFocus: false }
  );

  const { data: currentUser } = useUser();
  useRealtimeRefetch(
    (evento) => evento.entity === "issue" && !!currentUser?.id && evento.actor === currentUser.id,
    () => void mutate()
  );

  const atual = useMemo(() => (data ?? []).find((p) => !adiados.includes(p.issue_id)) ?? null, [data, adiados]);

  const adiar = useCallback(() => {
    if (atual) setAdiados((anteriores) => [...anteriores, atual.issue_id]);
  }, [atual]);

  /** Envia a resposta; `undefined` como texto significa concluir sem responder. */
  const resolver = useCallback(
    async (texto?: string) => {
      if (!workspaceSlug || !atual || emVoo.current) return;
      emVoo.current = true;
      try {
        if (texto === undefined) await portalRespostaService.pular(workspaceSlug, atual.issue_id);
        else await portalRespostaService.responder(workspaceSlug, atual.issue_id, texto);
        await mutate();
      } finally {
        emVoo.current = false;
      }
    },
    [workspaceSlug, atual, mutate]
  );

  return { atual, pendentes: data ?? [], adiar, resolver };
}
