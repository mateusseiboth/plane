/**
 * Service do "Alterar sistema" do chamado.
 *
 * Numa transação só: abre no destino um chamado novo com tudo o que o antigo
 * tem, leva o antigo para a etapa de cancelados do sistema atual apontando para
 * o novo (`moved_to_issue_id`), relaciona os dois e registra o histórico de cada
 * lado. Depois da transação: copia os binários dos anexos, avisa as telas em
 * tempo real e grava a trilha LGPD.
 *
 * A permissão é conferida na rota (`issue.change_system` no sistema atual e
 * participação no destino); aqui só a regra do negócio.
 */
import prisma from "@db";
import {
  RELACAO_DO_CHAMADO_MOVIDO,
  MENSAGENS_DE_ALTERAR_SISTEMA,
  buildIdentificador,
  buildPlanoDeEtiquetas,
  pickEtapaInicial,
  requireEtapaCancelada,
  requireNaoMovido,
} from "@modules/issue/alterar-sistema.rules";
import { alterarSistemaDao, type AlterarSistemaDao, type CopiaDeArquivo } from "@modules/issue/alterar-sistema.dao";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { markChamadoNaoLido } from "@utils/chamado-nao-lido";
import { NotFoundError } from "@utils/erro-de-dominio";
import { findOrCreateIntake } from "@utils/intake";
import { publishRealtime } from "@utils/realtime";
import { ISSUE_BY_ID_INCLUDE, serializeIssue } from "@utils/serialize";
import { copyAsset } from "@utils/storage";

export type PedidoDeAlterarSistema = {
  workspaceId: string;
  origemId: string;
  destinoId: string;
  issueId: string;
  user: { id: string; email?: string | null };
  headers?: Record<string, string | undefined>;
};

export type AlterarSistemaDeps = {
  dao: AlterarSistemaDao;
  copyArquivo: (de: string, para: string) => Promise<void>;
  findIntakeDoDestino: (projectId: string, workspaceId: string) => Promise<{ id: string }>;
};

const DEPS_PADRAO: AlterarSistemaDeps = {
  dao: alterarSistemaDao,
  copyArquivo: copyAsset,
  findIntakeDoDestino: findOrCreateIntake,
};

export function createAlterarSistemaService(deps: AlterarSistemaDeps = DEPS_PADRAO) {
  const readCenario = async (pedido: PedidoDeAlterarSistema) => {
    const antigo = await deps.dao.findChamadoParaMover(pedido.issueId, pedido.origemId, pedido.workspaceId);
    if (!antigo) throw new NotFoundError(MENSAGENS_DE_ALTERAR_SISTEMA.naoEncontrado);
    requireNaoMovido(antigo);
    const [etapasDaOrigem, etapasDoDestino, etiquetasDoDestino, identificadorDoDestino, arquivos, temSolicitacao] =
      await Promise.all([
        deps.dao.findEtapasDoSistema(pedido.origemId),
        deps.dao.findEtapasDoSistema(pedido.destinoId),
        deps.dao.findEtiquetasDoSistema(pedido.destinoId),
        deps.dao.findIdentificadorDoSistema(pedido.destinoId),
        deps.dao.findArquivosDosAnexos(antigo.attachments.map((a) => a.asset)),
        deps.dao.hasSolicitacao(antigo.id),
      ]);
    const cancelada = requireEtapaCancelada(etapasDaOrigem);
    const intake = temSolicitacao ? await deps.findIntakeDoDestino(pedido.destinoId, pedido.workspaceId) : null;
    return { antigo, cancelada, etapasDoDestino, etiquetasDoDestino, identificadorDoDestino, arquivos, intake };
  };

  const copyArquivos = (copias: CopiaDeArquivo[]) =>
    Promise.all(
      copias.map(({ de, para }) =>
        deps.copyArquivo(de, para).catch((erro) => console.error("[alterar-sistema] cópia do anexo falhou:", erro))
      )
    );

  return {
    async alterarSistema(pedido: PedidoDeAlterarSistema) {
      const c = await readCenario(pedido);
      const identificadorDoAntigo = buildIdentificador(c.antigo.project.identifier, c.antigo.sequenceId);
      const identificadorDoNovo = (sequenceId: number) => buildIdentificador(c.identificadorDoDestino, sequenceId);

      const { novo, copias } = await prisma.$transaction((tx) =>
        deps.dao.saveMudanca(tx, {
          antigo: c.antigo,
          destinoId: pedido.destinoId,
          etapaInicialId: pickEtapaInicial(c.etapasDoDestino, c.antigo.state)?.id ?? null,
          etapaCanceladaId: c.cancelada.id,
          etiquetas: buildPlanoDeEtiquetas(
            c.antigo.labels.map((l) => l.label),
            c.etiquetasDoDestino
          ),
          arquivos: c.arquivos,
          intakeDoDestinoId: c.intake?.id ?? null,
          relacao: RELACAO_DO_CHAMADO_MOVIDO,
          atorId: pedido.user.id,
          buildHistorico: (sequenceId) => ({
            antigo: [
              {
                field: "state",
                oldValue: c.antigo.state?.name ?? null,
                newValue: c.cancelada.name,
                comment: "updated the state",
              },
              { field: "moved_to", newValue: identificadorDoNovo(sequenceId), comment: "moved the work item" },
            ],
            novo: [
              { verb: "created", field: "issue", comment: "created the work item" },
              { field: "moved_from", newValue: identificadorDoAntigo, comment: "moved the work item" },
            ],
          }),
        })
      );

      await copyArquivos(copias);
      await markChamadoNaoLido({ issueId: novo.id, actorId: pedido.user.id });
      publishRealtime(pedido.workspaceId, {
        entity: "issue",
        action: "update",
        project_id: pedido.origemId,
        id: c.antigo.id,
        actor: pedido.user.id,
      });
      publishRealtime(pedido.workspaceId, {
        entity: "issue",
        action: "create",
        project_id: pedido.destinoId,
        id: novo.id,
        priority: novo.priority,
        actor: pedido.user.id,
      });
      const trilha = {
        workspaceId: pedido.workspaceId,
        entity: AUDIT_ENTITIES.ISSUE,
        actor: pedido.user,
        headers: pedido.headers,
      };
      recordAudit({
        ...trilha,
        entityId: c.antigo.id,
        action: AUDIT_ACTIONS.UPDATE,
        changes: { project_id: { de: pedido.origemId, para: pedido.destinoId } },
        metadata: {
          project_id: pedido.origemId,
          moved_to_issue_id: novo.id,
          moved_to: identificadorDoNovo(novo.sequenceId),
        },
      });
      recordAudit({
        ...trilha,
        entityId: novo.id,
        action: AUDIT_ACTIONS.CREATE,
        metadata: { project_id: pedido.destinoId, moved_from_issue_id: c.antigo.id, moved_from: identificadorDoAntigo },
      });

      const completo = await prisma.issue.findUniqueOrThrow({ where: { id: novo.id }, include: ISSUE_BY_ID_INCLUDE });
      return {
        id: novo.id,
        project_id: pedido.destinoId,
        sequence_id: novo.sequenceId,
        project_identifier: c.identificadorDoDestino,
        issue: serializeIssue(completo),
      };
    },
  };
}

export const alterarSistemaService = createAlterarSistemaService();
