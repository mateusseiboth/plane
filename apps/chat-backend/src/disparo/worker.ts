/**
 * Worker do disparo, dentro do processo do chat. A fila é a tabela
 * `chat_disparo_itens`: reiniciar não perde nada, a próxima passada continua de
 * onde parou.
 *
 * Ritmo: um envio por espaço a cada `60 / mensagens_por_minuto` segundos,
 * contado da última tentativa gravada (o SAC dormia 15 s a cada 10 envios, e a
 * Z-API bloqueia número que manda rápido demais).
 *
 * Queda no meio de um envio: o item fica `processando` e não dá para saber se a
 * Z-API recebeu. Na subida ele vira `falhou`, sem reenviar: é melhor alguém
 * ficar sem a mensagem (e aparecer no log) do que receber duas vezes.
 */

import * as dao from "@/disparo/dao";
import { DISPARO_ITEM_STATUS, isHoraDoProximoEnvio } from "@/disparo/regras";
import { buildMidiaDeSaida, getRitmo } from "@/disparo/service";
import { getProvider, type WhatsAppProvider } from "@/providers/provider";
import { runInSequence } from "@/sequencia";

const INTERROMPIDO = "Envio interrompido por reinício do serviço. Não reenviado para evitar duplicidade.";
const LIMITE_DO_ERRO = 500;
const PASSO_MS = 1000;

async function deliverItem(provider: WhatsAppProvider, item: dao.ItemComExecucao): Promise<string | null> {
  const { execucao } = item;
  if (!execucao.mediaKey) return provider.sendText(item.telefone, execucao.texto ?? "");
  return provider.sendMedia(item.telefone, await buildMidiaDeSaida(execucao, execucao.texto));
}

async function sendItem(provider: WhatsAppProvider, itemId: string): Promise<void> {
  const item = await dao.findItemComExecucao(itemId);
  try {
    const externalId = await deliverItem(provider, item);
    await dao.markItem(itemId, { status: DISPARO_ITEM_STATUS.ENVIADO, externalId, erro: null });
  } catch (e) {
    const motivo = (e instanceof Error ? e.message : String(e)).slice(0, LIMITE_DO_ERRO);
    await dao.markItem(itemId, { status: DISPARO_ITEM_STATUS.FALHOU, erro: motivo });
  }
}

/**
 * Uma passada num espaço: no máximo UM envio, se já deu o intervalo. Sem
 * provedor ativo, a fila espera (os itens continuam pendentes). `agora` vem por
 * argumento para o teste controlar o relógio.
 */
export async function processWorkspace(slug: string, agora: Date = new Date()): Promise<void> {
  await sendProximoSeForHora(slug, agora);
  await dao.finishExecucoesSemPendencia(slug, agora);
}

async function sendProximoSeForHora(slug: string, agora: Date): Promise<void> {
  const porMinuto = await getRitmo(slug);
  if (!isHoraDoProximoEnvio(await dao.findUltimaTentativa(slug), agora, porMinuto)) return;
  const resolvido = await getProvider(slug);
  if (!resolvido) return;
  const itemId = await dao.claimProximoItem(slug, agora);
  if (!itemId) return;
  await sendItem(resolvido.provider, itemId);
}

export async function runDisparoTick(agora: Date = new Date()): Promise<void> {
  const espacos = await dao.listWorkspacesComEnvioAberto();
  await runInSequence(espacos, (slug) => processWorkspace(slug, agora), "disparo");
}

export async function recoverItensInterrompidos(): Promise<number> {
  return (await dao.failItensProcessando(INTERROMPIDO)).count;
}

let rodando = false;

const runPassada = () => {
  if (rodando) return;
  rodando = true;
  runDisparoTick()
    .catch((e) => console.error("[disparo] passada", e))
    .finally(() => {
      rodando = false;
    });
};

/**
 * Sobe com o servidor: primeiro marca o que a queda deixou pela metade, SÓ
 * DEPOIS começa a passar (a cada segundo). Na ordem inversa, a primeira passada
 * poderia pegar um item antes da recuperação e ele seria dado como falha.
 */
export function startDisparoWorker(): void {
  recoverItensInterrompidos()
    .then((n) => n && console.warn(`[disparo] ${n} envio(s) interrompido(s) marcado(s) como falha`))
    .catch((e) => console.error("[disparo] recuperação", e))
    .finally(() => setInterval(runPassada, PASSO_MS));
}
