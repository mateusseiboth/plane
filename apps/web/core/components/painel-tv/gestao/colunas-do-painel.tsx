/**
 * Colunas dos painéis do TI e da Qualidade (Configurações > Painéis de TV).
 *
 * O mapeamento é dado: cada coluna diz o nome, a cor, as etapas que recolhe, se
 * quer chamado com ou sem responsável e, quando é coluna de entrega, de quantos
 * dias para trás. Sem configuração gravada vale o padrão do código.
 */
import { useEffect, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/ui";
import paineisDeTvService, { type TColunaDoPainel, type TColunasDoPainel } from "@/services/painel-tv.service";
import { corDaColuna } from "../cores";

const CORES = ["laranja", "ouro", "verde", "azul", "roxo", "rosa", "cinza"];

const PAINEIS_COM_COLUNAS = [
  { chave: "ti", titulo: "Painel do TI" },
  { chave: "qualidade", titulo: "Painel da Qualidade" },
];

const colunaNova = (): TColunaDoPainel => ({
  chave: `coluna_${Math.random().toString(36).slice(2, 7)}`,
  rotulo: "Nova coluna",
  cor: "azul",
  etapas: [],
});

type Props = {
  workspaceSlug: string;
  painel: string;
  configuracao: TColunasDoPainel | undefined;
  recarregar: () => void;
};

export function ColunasDoPainel({ workspaceSlug, painel, configuracao, recarregar }: Props) {
  const [colunas, setColunas] = useState<TColunaDoPainel[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    setColunas(configuracao?.columns ?? []);
    setErros({});
  }, [configuracao]);

  const etapas = configuracao?.etapas_do_espaco ?? [];

  const trocar = (indice: number, mudanca: Partial<TColunaDoPainel>) =>
    setColunas((atuais) => atuais.map((coluna, i) => (i === indice ? { ...coluna, ...mudanca } : coluna)));

  const alternarEtapa = (indice: number, etapa: string) =>
    setColunas((atuais) =>
      atuais.map((coluna, i) =>
        i === indice
          ? {
              ...coluna,
              etapas: coluna.etapas.includes(etapa)
                ? coluna.etapas.filter((e) => e !== etapa)
                : [...coluna.etapas, etapa],
            }
          : coluna
      )
    );

  const salvar = async () => {
    setSalvando(true);
    setErros({});
    try {
      await paineisDeTvService.salvarColunas(workspaceSlug, painel, colunas);
      recarregar();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Colunas salvas", message: "A TV já mostra o novo mapeamento." });
    } catch (erro: any) {
      const doCampo: Record<string, string> = {};
      for (const item of erro?.errors ?? []) doCampo[item.path] = item.message;
      setErros(doCampo);
      if (!erro?.errors?.length) {
        setToast({ type: TOAST_TYPE.ERROR, title: "Não deu para salvar", message: erro?.detail ?? "Tente de novo." });
      }
    } finally {
      setSalvando(false);
    }
  };

  const restaurar = async () => {
    await paineisDeTvService.restaurarColunas(workspaceSlug, painel);
    recarregar();
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "Padrão restaurado",
      message: "As colunas voltaram ao mapeamento de fábrica.",
    });
  };

  return (
    <div className="space-y-4">
      {colunas.map((coluna, indice) => (
        <div key={coluna.chave} className="rounded-lg border border-subtle p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-56">
              <label className="text-13 text-secondary" htmlFor={`coluna-${coluna.chave}-rotulo`}>
                Nome da coluna
              </label>
              <Input
                id={`coluna-${coluna.chave}-rotulo`}
                value={coluna.rotulo}
                onChange={(e) => trocar(indice, { rotulo: e.target.value })}
                hasError={!!erros[`columns[${indice}].rotulo`]}
                className="w-full"
              />
            </div>
            <div>
              <span className="block text-13 text-secondary">Cor</span>
              <div className="mt-1 flex gap-1">
                {CORES.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    title={cor}
                    onClick={() => trocar(indice, { cor })}
                    className={`size-7 rounded-full border-2 ${coluna.cor === cor ? "border-primary" : "border-transparent"}`}
                    style={{ backgroundColor: corDaColuna(cor) }}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-13 text-secondary" htmlFor={`coluna-${coluna.chave}-responsavel`}>
                Responsável
              </label>
              <select
                id={`coluna-${coluna.chave}-responsavel`}
                className="mt-1 rounded-md border border-subtle bg-layer-1 px-2 py-1.5 text-14 text-primary"
                value={coluna.responsavel ?? ""}
                onChange={(e) =>
                  trocar(indice, { responsavel: (e.target.value || undefined) as TColunaDoPainel["responsavel"] })
                }
              >
                <option value="">Tanto faz</option>
                <option value="sem">Só sem responsável</option>
                <option value="com">Só com responsável</option>
              </select>
            </div>
            <div className="w-40">
              <label className="block text-13 text-secondary" htmlFor={`coluna-${coluna.chave}-dias`}>
                Concluídos há até (dias)
              </label>
              <Input
                id={`coluna-${coluna.chave}-dias`}
                type="number"
                min={1}
                value={coluna.concluidoEmDias ?? ""}
                onChange={(e) =>
                  trocar(indice, { concluidoEmDias: e.target.value ? Number(e.target.value) : undefined })
                }
                className="w-full"
              />
            </div>
            <label className="flex items-center gap-2 text-13 text-secondary">
              <input
                type="checkbox"
                checked={coluna.noTotal !== false}
                onChange={(e) => trocar(indice, { noTotal: e.target.checked ? undefined : false })}
              />
              Conta no total e no percentual
            </label>
            <button
              type="button"
              className="text-danger ml-auto inline-flex items-center gap-1 text-13"
              onClick={() => setColunas((atuais) => atuais.filter((_, i) => i !== indice))}
            >
              <Trash2 className="size-3.5" /> Remover
            </button>
          </div>

          <div className="mt-3">
            <span className="text-13 text-secondary">Etapas desta coluna</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {etapas.map((etapa) => (
                <button
                  key={etapa}
                  type="button"
                  onClick={() => alternarEtapa(indice, etapa)}
                  className={`rounded-full border px-3 py-1 text-13 ${
                    coluna.etapas.includes(etapa)
                      ? "border-accent-primary bg-accent-primary/10 text-primary"
                      : "border-subtle text-secondary"
                  }`}
                >
                  {etapa}
                </button>
              ))}
            </div>
            {erros[`columns[${indice}].etapas`] && (
              <p className="text-danger mt-1 text-12">{erros[`columns[${indice}].etapas`]}</p>
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => setColunas((atuais) => [...atuais, colunaNova()])}>
          <Plus className="size-4" /> Coluna
        </Button>
        <Button onClick={salvar} loading={salvando} disabled={salvando}>
          Salvar colunas
        </Button>
        <Button variant="secondary" onClick={restaurar}>
          <RotateCcw className="size-4" /> Voltar ao padrão
        </Button>
        {configuracao?.is_default && <span className="text-13 text-secondary">Usando o mapeamento padrão.</span>}
      </div>
    </div>
  );
}

export { PAINEIS_COM_COLUNAS };
