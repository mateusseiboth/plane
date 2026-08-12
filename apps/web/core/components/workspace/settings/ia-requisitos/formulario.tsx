/**
 * Formulário da IA de requisitos. Guarda o rascunho do que está sendo editado
 * e só devolve ao servidor quando alguém clica em salvar.
 *
 * As opções dependem umas das outras — sem análise não há modo, sem modo
 * `exigir` não há nota mínima. Em vez de esconder as que não valem, cada uma
 * fica apagada com o motivo escrito (ver `LinhaDeOpcao`).
 */
import { useEffect, useState } from "react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input, ToggleSwitch } from "@plane/ui";
// components
import { LinhaDeOpcao } from "@/components/workspace/settings/ia-requisitos/linha-de-opcao";
import { SeletorDeModo } from "@/components/workspace/settings/ia-requisitos/seletor-de-modo";
// services
import {
  MINIMO_ACEITACAO_MAXIMO,
  MINIMO_ACEITACAO_MINIMO,
  type TConfiguracaoDeIa,
} from "@/services/configuracao-de-ia.service";

/** Motivos exibidos quando a opção existe mas não vale agora. */
const MOTIVO = {
  semAnalise: "Disponível quando a análise ao salvar estiver ligada.",
  semModoExigir: "Só vale no modo Exigir. Nos outros modos a nota aparece como informação e não bloqueia nada.",
  modoSilencioso: "No modo Silencioso nada é mostrado a quem salva.",
} as const;

/** Por que a nota mínima não vale agora — `undefined` quando vale. */
function motivoDaNotaMinima(valores: TConfiguracaoDeIa): string | undefined {
  if (!valores.analise_ativa) return MOTIVO.semAnalise;
  if (valores.modo !== "exigir") return MOTIVO.semModoExigir;
  return undefined;
}

/** Por que o medidor não vale agora — `undefined` quando vale. */
function motivoDoIndicador(valores: TConfiguracaoDeIa): string | undefined {
  if (!valores.analise_ativa) return MOTIVO.semAnalise;
  if (valores.modo === "silencioso") return MOTIVO.modoSilencioso;
  return undefined;
}

type Props = {
  configuracao: TConfiguracaoDeIa;
  onSalvar: (valores: TConfiguracaoDeIa) => Promise<unknown>;
};

export function FormularioIaRequisitos({ configuracao, onSalvar }: Props) {
  const [rascunho, setRascunho] = useState<TConfiguracaoDeIa>(configuracao);
  // O campo da nota guarda texto para que dê para apagar e digitar de novo; o
  // número só é cobrado na hora de salvar.
  const [minimoTexto, setMinimoTexto] = useState(String(configuracao.minimo_aceitacao));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setRascunho(configuracao);
    setMinimoTexto(String(configuracao.minimo_aceitacao));
  }, [configuracao]);

  const alterar = <T extends keyof TConfiguracaoDeIa>(chave: T, valor: TConfiguracaoDeIa[T]) =>
    setRascunho((atual) => ({ ...atual, [chave]: valor }));

  const analiseDesligada = !rascunho.analise_ativa;
  const minimoNumero = Number(minimoTexto);
  const minimoValido =
    minimoTexto.trim() !== "" &&
    Number.isInteger(minimoNumero) &&
    minimoNumero >= MINIMO_ACEITACAO_MINIMO &&
    minimoNumero <= MINIMO_ACEITACAO_MAXIMO;

  const motivoDaNota = motivoDaNotaMinima(rascunho);
  const notaMinimaHabilitada = !motivoDaNota;
  const motivoDoMedidor = motivoDoIndicador(rascunho);

  const handleSalvar = async () => {
    if (notaMinimaHabilitada && !minimoValido) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Erro",
        message: `A nota mínima precisa ser um número inteiro entre ${MINIMO_ACEITACAO_MINIMO} e ${MINIMO_ACEITACAO_MAXIMO}.`,
      });
      return;
    }

    setSalvando(true);
    try {
      await onSalvar({
        ...rascunho,
        minimo_aceitacao: minimoValido ? minimoNumero : configuracao.minimo_aceitacao,
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Salvo",
        message: "Configuração da IA de requisitos atualizada.",
      });
    } catch (err: unknown) {
      const erro = err as { detail?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Erro",
        message: erro?.detail || "Não foi possível salvar a configuração.",
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-5 py-2">
      <LinhaDeOpcao
        titulo="Sugerir texto enquanto se escreve"
        explicacao="Enquanto alguém digita o chamado, a IA mostra em cinza a continuação sugerida. Tab aceita, Esc descarta, continuar digitando ignora."
      >
        <ToggleSwitch
          value={rascunho.fantasma_ativo}
          onChange={(v: boolean) => alterar("fantasma_ativo", v)}
          label="Sugerir texto enquanto se escreve"
        />
      </LinhaDeOpcao>

      <LinhaDeOpcao
        titulo="Analisar o chamado ao salvar"
        explicacao="No momento de salvar, a IA confere o chamado contra o checklist de levantamento de requisitos e diz o que ainda falta. Desligado, nada é analisado e as opções abaixo deixam de valer."
      >
        <ToggleSwitch
          value={rascunho.analise_ativa}
          onChange={(v: boolean) => alterar("analise_ativa", v)}
          label="Analisar o chamado ao salvar"
        />
      </LinhaDeOpcao>

      <LinhaDeOpcao
        titulo="Analisar também os comentários"
        explicacao="Aplica a mesma conferência ao texto dos comentários do chamado, não só à abertura."
        motivoDesabilitado={analiseDesligada ? MOTIVO.semAnalise : undefined}
      >
        <ToggleSwitch
          value={rascunho.analise_em_comentarios}
          onChange={(v: boolean) => alterar("analise_em_comentarios", v)}
          disabled={analiseDesligada}
          label="Analisar também os comentários"
        />
      </LinhaDeOpcao>

      <LinhaDeOpcao
        titulo="O que fazer com o resultado da análise"
        explicacao="Define se o resultado é só um aviso, se impede o salvamento ou se fica guardado sem aparecer."
        motivoDesabilitado={analiseDesligada ? MOTIVO.semAnalise : undefined}
        controleAbaixo
      >
        <SeletorDeModo
          valor={rascunho.modo}
          onChange={(modo) => alterar("modo", modo)}
          minimoAceitacao={minimoValido ? minimoNumero : configuracao.minimo_aceitacao}
          disabled={analiseDesligada}
        />
      </LinhaDeOpcao>

      <LinhaDeOpcao
        titulo="Nota mínima para salvar"
        explicacao="De 0 a 100. No modo Exigir, o chamado só pode ser salvo a partir desta nota de aceitação."
        motivoDesabilitado={motivoDaNota}
        controleAbaixo
      >
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={MINIMO_ACEITACAO_MINIMO}
            max={MINIMO_ACEITACAO_MAXIMO}
            step={1}
            value={minimoTexto}
            onChange={(e) => setMinimoTexto(e.target.value)}
            disabled={!notaMinimaHabilitada}
            hasError={notaMinimaHabilitada && !minimoValido}
            className="w-24"
          />
          <span className="text-13 text-secondary">%</span>
        </div>
      </LinhaDeOpcao>

      <LinhaDeOpcao
        titulo="Mostrar o medidor de aceitação"
        explicacao="Exibe a porcentagem alcançada e a lista do que falta na janela do chamado, para quem lê saber o que corrigir."
        motivoDesabilitado={motivoDoMedidor}
      >
        <ToggleSwitch
          value={rascunho.mostrar_indicador}
          onChange={(v: boolean) => alterar("mostrar_indicador", v)}
          disabled={Boolean(motivoDoMedidor)}
          label="Mostrar o medidor de aceitação"
        />
      </LinhaDeOpcao>

      <div>
        <Button variant="primary" size="sm" onClick={handleSalvar} loading={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
