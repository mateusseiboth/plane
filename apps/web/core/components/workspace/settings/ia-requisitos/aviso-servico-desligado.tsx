/**
 * O aviso que evita a tarde perdida.
 *
 * As opções desta tela gravam normalmente mesmo sem IA no servidor — e é aí
 * que mora a armadilha: liga tudo, salva, volta ao chamado e nada acontece.
 * Sem endereço de IA configurado (`IA_REQUISITOS_URL`), nenhuma delas produz
 * efeito, e quem está configurando precisa saber disso antes, não depois.
 */
import { AlertTriangle } from "lucide-react";

export function AvisoServicoDesligado() {
  return (
    <div className="flex items-start gap-3 rounded-md border border-warning-primary/40 bg-warning-subtle p-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-primary" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">A IA ainda não foi configurada no servidor</p>
        <p className="text-13 text-secondary">
          As opções abaixo ficam salvas, mas <strong>nenhuma delas terá efeito</strong> enquanto o servidor não tiver o
          endereço do serviço de IA. Quem cuida da instalação precisa preencher a variável{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 text-11">IA_REQUISITOS_URL</code> e reiniciar a aplicação.
          Até lá, escrever e salvar chamados continua funcionando exatamente como hoje.
        </p>
      </div>
    </div>
  );
}
