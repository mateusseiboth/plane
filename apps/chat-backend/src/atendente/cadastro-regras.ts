/**
 * Entidade, sistema e responsável definidos DURANTE o atendimento (antes só no
 * encerramento). Legado: `popChatAt_defineentsis*.php` e
 * `popChatAt_defineresp.php`. Aqui só a leitura do corpo: campo ausente não
 * muda, vazio ou nulo limpa, id inválido volta no campo.
 */

import { asCorpo, erro, finish, isBlank, isUuid, type CampoComErro, type Resultado } from "@/ligacoes/payload";

export type MudancaDoCadastro = {
  entityId?: string | null;
  projectId?: string | null;
  entityContactId?: string | null;
};

const CAMPOS: Array<[campo: string, chave: keyof MudancaDoCadastro, mensagem: string]> = [
  ["entity_id", "entityId", "Entidade inválida."],
  ["project_id", "projectId", "Sistema inválido."],
  ["entity_contact_id", "entityContactId", "Responsável inválido."],
];

export function parseCadastro(body: unknown): Resultado<MudancaDoCadastro> {
  const corpo = asCorpo(body);
  const presentes = CAMPOS.filter(([campo]) => corpo[campo] !== undefined);
  const errors: CampoComErro[] = presentes
    .filter(([campo]) => !isBlank(corpo[campo]) && !isUuid(corpo[campo]))
    .map(([campo, , mensagem]) => erro(campo, mensagem));
  return finish(
    errors,
    () =>
      Object.fromEntries(
        presentes.map(([campo, chave]) => [chave, isBlank(corpo[campo]) ? null : String(corpo[campo])])
      ) as MudancaDoCadastro
  );
}
