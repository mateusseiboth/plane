/**
 * Quem edita o conteúdo de uma solicitação da triagem.
 *
 * O PATCH da solicitação no api-ts aceita `intake.review` ou `intake.create`.
 * A tela restringe um pouco mais: quem tria edita qualquer uma; quem abre
 * pedidos edita só a que abriu. Nada de nível de papel aqui.
 */
type Pergunta = { can: (acao: string) => boolean; isOwner: boolean };

export const isIntakeEditAllowed = ({ can, isOwner }: Pergunta): boolean =>
  can("intake.review") || (isOwner && can("intake.create"));
