/**
 * A configuração da IA de requisitos **lida do banco**.
 *
 * Mora em arquivo próprio porque `configuracao.ts` é puro de propósito (o
 * seeder o importa sem abrir conexão) e porque duas rotas em módulos diferentes
 * precisam da mesma leitura: as de `ia-requisitos/` e o "Melhorar com IA" do
 * módulo `ai/`.
 *
 * A leitura acontece a cada chamada: ligar e desligar vale na hora, sem
 * reiniciar o servidor.
 */

import prisma from "@db";
import {CHAVE_CONFIG_IA, sanitizarConfigIa, type ConfigIaDoEspaco} from "@modules/ia-requisitos/configuracao";

/** O que está gravado para o espaço, já com os padrões do contrato aplicados. */
export async function configDoEspaco(workspaceId: string): Promise<ConfigIaDoEspaco> {
  const gravado = await prisma.workspaceSetting.findFirst({where: {workspaceId, key: CHAVE_CONFIG_IA}});
  return sanitizarConfigIa(gravado?.value);
}
