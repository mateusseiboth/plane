/**
 * IA de levantamento de requisitos — o "texto fantasma" do editor de chamados.
 *
 * `POST /api/v1/workspaces/:slug/ia/sugestao-de-requisito/`
 *
 * A rota recebe o que está sendo digitado, monta o contexto do chamado
 * (título, descrição, comentários recentes, tipo, projeto, entidade e o texto
 * extraído dos anexos), consulta o provedor de IA configurado e devolve a
 * sugestão.
 *
 * Quatro coisas que a rota garante, nesta ordem de importância:
 *
 *  1. **A credencial da IA nunca vai para o navegador.** Ela é lida da
 *     configuração do processo (`config.ts`) e só aparece no cabeçalho da
 *     chamada de saída. O frontend fala apenas com o Plane.
 *  2. **Escrever chamado não depende da IA estar de pé.** Serviço desligado,
 *     formato inválido, fora do ar, com erro ou lento demais → 200 com
 *     sugestão vazia. Nenhum 500 chega a quem está escrevendo.
 *  3. **Trilha LGPD.** O texto do chamado é conteúdo do cliente e está saindo
 *     para um serviço fora da aplicação: fica registrado que saiu, para onde e
 *     quanto — sem repetir o conteúdo dentro do log.
 *  4. **O provedor é trocável.** Quem escolhe a implementação é a fábrica em
 *     `provedores/`, pelo nome vindo da configuração. A rota não conhece
 *     nenhum protocolo de IA.
 */

import {authPlugin} from "@middleware/auth";
import {configIaRequisitos} from "@modules/ia-requisitos/config";
import {montarContexto, projetoDoChamado, type ContextoInformado} from "@modules/ia-requisitos/contexto";
import {criarProvedor} from "@modules/ia-requisitos/provedores";
import {normalizarCampo, RESPOSTA_VAZIA, type RespostaIa} from "@modules/ia-requisitos/tipos";
import {AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit} from "@utils/audit";
import {EProjectAction, requireProjectAnyAction} from "@utils/permission-checks";
import {getWorkspaceOrFail} from "@utils/workspace";
import Elysia from "elysia";

/** Quem pode abrir chamado no projeto — nada além disso é exigido. */
const PODE_ABRIR_CHAMADO = [EProjectAction.ISSUE_CREATE, EProjectAction.INTAKE_CREATE];

/**
 * A forma que o frontend consome. Os nomes canônicos são os do contrato
 * (`sugestao`/`faltando`/`confianca`); `suggestion`/`missing` acompanham como
 * apelidos porque o pedido da tarefa nomeia os dois primeiros em inglês.
 * Quando um dos nomes cair em desuso, é só apagar as duas linhas.
 */
function corpoDaResposta(resposta: RespostaIa) {
  return {...resposta, suggestion: resposta.sugestao, missing: resposta.faltando};
}

type CorpoDoPedido = {
  campo?: unknown;
  texto_atual?: unknown;
  cursor?: unknown;
  project_id?: unknown;
  issue_id?: unknown;
  tipo?: unknown;
  entity_id?: unknown;
  /** O que a tela já tem em mãos; serve de reserva ao que o banco não sabe. */
  contexto?: unknown;
};

function comoTexto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function comoId(valor: unknown): string | null {
  const texto = comoTexto(valor).trim();
  return texto || null;
}

export const iaRequisitosModule = new Elysia({prefix: "/workspaces/:slug"})
  .use(authPlugin)

  .post("/ia/sugestao-de-requisito/", async ({params: {slug}, body, user, headers, set}) => {
    const b = (body ?? {}) as CorpoDoPedido;

    const campo = normalizarCampo(b.campo);
    if (!campo) {
      set.status = 400;
      return {detail: "campo deve ser titulo, descricao ou comentario."};
    }
    const ws = await getWorkspaceOrFail(slug);

    // A caixa de comentário sabe o chamado; o modal de novo chamado sabe o
    // projeto. Um dos dois basta — sem projeto não há permissão a conferir.
    const issueId = comoId(b.issue_id);
    const projectId = comoId(b.project_id) ?? (issueId ? await projetoDoChamado(ws.id, issueId) : null);
    if (!projectId) {
      set.status = 400;
      return {detail: "project_id (ou issue_id de um chamado existente) é obrigatório."};
    }

    // Permissão vale sempre, com ou sem IA configurada: quem não pode abrir
    // chamado no projeto também não recebe ajuda para escrever um.
    await requireProjectAnyAction(ws.id, projectId, user.id, PODE_ABRIR_CHAMADO);

    // Recurso desligado (ou formato inexistente): resposta vazia sem chamar
    // ninguém e sem trilha — nada saiu da aplicação.
    const cfg = configIaRequisitos();
    const provedor = cfg.ligada ? criarProvedor(cfg) : null;
    if (!provedor) return corpoDaResposta(RESPOSTA_VAZIA);

    const textoAtual = comoTexto(b.texto_atual);
    const cursorInformado = Number(b.cursor);
    const cursor = Number.isFinite(cursorInformado)
      ? Math.min(Math.max(Math.trunc(cursorInformado), 0), textoAtual.length)
      : textoAtual.length;

    try {
      const contexto = await montarContexto({
        workspaceId: ws.id,
        projectId,
        issueId,
        tipo: comoId(b.tipo),
        entityId: comoId(b.entity_id),
        informado: (b.contexto ?? null) as ContextoInformado | null,
        campo,
        cfg,
      });

      // LGPD: registra a saída do conteúdo, não o conteúdo. `export` é a ação do
      // vocabulário fechado que significa "dado deixou a aplicação" — a tela de
      // Auditoria já a exibe e filtra. O chamado ainda pode não existir; nesse
      // caso o evento fica pendurado no projeto, com `chamado_id` nulo.
      recordAudit({
        workspaceId: ws.id,
        entity: AUDIT_ENTITIES.ISSUE,
        entityId: issueId ?? projectId,
        action: AUDIT_ACTIONS.EXPORT,
        actor: user,
        headers,
        metadata: {
          servico: "ia-requisitos",
          formato: provedor.formato,
          destino: cfg.destino,
          campo,
          projeto_id: projectId,
          chamado_id: issueId,
          caracteres_enviados: textoAtual.length,
          comentarios_enviados: contexto.comentarios.length,
          anexos_enviados: contexto.anexos.length,
          anexos_com_texto: contexto.anexos.filter((a) => a.texto_extraido).length,
        },
      });

      return corpoDaResposta(await provedor.sugerir({campo, texto_atual: textoAtual, cursor, contexto}));
    } catch (e: any) {
      // Nem uma falha nossa (banco, storage) pode virar 500 para quem digita.
      console.error("[ia-requisitos] sugestão abortada:", e?.message ?? e);
      return corpoDaResposta(RESPOSTA_VAZIA);
    }
  });
