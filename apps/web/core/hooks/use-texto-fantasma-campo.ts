/**
 * Estado de um campo com texto fantasma: quem está em foco pergunta à IA, quem
 * recusou com `Esc` não vê a mesma sugestão de novo.
 *
 * Só o campo em foco pergunta porque o contexto da descrição carrega o título:
 * sem essa trava, digitar o título dispararia dois pedidos por tecla.
 *
 * `projectId` ou `issueId` é obrigatório — é contra o projeto que a rota confere
 * permissão. Na abertura de chamado temos o projeto; no comentário, o chamado.
 */
import { useState } from "react";
// hooks
import { useConfiguracaoDeIa } from "@/hooks/use-configuracao-de-ia";
import { useSugestaoDeRequisito } from "@/hooks/use-sugestao-de-requisito";
// services
import type { TCampoDeRequisito, TContextoDeRequisito } from "@/services/sugestao-de-requisito.service";

type TParametros = {
  workspaceSlug: string | undefined;
  campo: TCampoDeRequisito;
  /** O que já foi digitado, em texto puro. */
  texto: string;
  projectId?: string | null;
  issueId?: string | null;
  entityId?: string | null;
  tipo?: string | null;
  /** Campo somente leitura não recebe ajuda para escrever. */
  ativo?: boolean;
  contexto: TContextoDeRequisito;
};

export const useTextoFantasmaCampo = (params: TParametros) => {
  const { workspaceSlug, campo, texto, projectId, issueId, entityId, tipo, ativo = true, contexto } = params;
  const [emFoco, setEmFoco] = useState(false);
  const [recusada, setRecusada] = useState("");
  // `fantasma_ativo` desligado no espaço de trabalho: nenhum pedido sai e, sem
  // resposta, nem o fantasma nem o checklist têm o que desenhar. A trava mora
  // aqui, e não em cada um dos seis campos que usam o hook.
  const { configuracao } = useConfiguracaoDeIa(workspaceSlug);

  const { sugestao, faltando, isFetching } = useSugestaoDeRequisito({
    workspaceSlug,
    habilitado: ativo && emFoco && configuracao.fantasma_ativo,
    pedido: {
      campo,
      project_id: projectId ?? undefined,
      issue_id: issueId ?? undefined,
      texto_atual: texto,
      cursor: texto.length,
      tipo: tipo ?? undefined,
      entity_id: entityId ?? undefined,
      contexto,
    },
  });

  return {
    sugestao: sugestao === recusada ? "" : sugestao,
    faltando,
    /**
     * Há consulta em andamento. Só vira indicador na tela quando a espera passa
     * de um instante — piscar um carregando a cada tecla seria trocar um
     * incômodo por outro.
     */
    consultando: isFetching,
    descartar: () => setRecusada(sugestao),
    /** Espalhe no campo (ou no contêiner do editor, que o foco borbulha). */
    propsDeFoco: {
      onFocus: () => setEmFoco(true),
      onBlur: () => setEmFoco(false),
    },
  };
};
