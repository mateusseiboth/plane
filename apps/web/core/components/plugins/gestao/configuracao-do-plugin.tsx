/**
 * Configuração chave/valor de um plugin (Configurações > Plugins).
 *
 * O formulário é desenhado a partir do `configSchema` do manifesto, pela rota
 * de configuração do gateway do SDK. Campo secreto volta mascarado: deixar em
 * branco mantém o valor que já estava gravado.
 */
import { useEffect, useState } from "react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input, ToggleSwitch } from "@plane/ui";
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { readErrosDeCampo } from "@/components/plugins/gestao/gestao-rules";
import { useConfiguracaoDoPlugin } from "@/hooks/use-plugins-gestao";
import pluginsService, { type TCampoDeConfiguracao } from "@/services/plugins.service";

type Props = {
  workspaceSlug: string;
  pluginId: string;
  ligado: boolean;
};

const agruparPorGrupo = (campos: TCampoDeConfiguracao[]): Record<string, TCampoDeConfiguracao[]> =>
  campos.reduce<Record<string, TCampoDeConfiguracao[]>>((acc, campo) => {
    (acc[campo.group ?? "Geral"] ??= []).push(campo);
    return acc;
  }, {});

function Campo({
  campo,
  valor,
  onChange,
}: {
  campo: TCampoDeConfiguracao;
  valor: unknown;
  onChange: (v: unknown) => void;
}) {
  const rotulo = (
    <label className="text-13 text-secondary" htmlFor={`config-${campo.key}`}>
      {campo.label}
      {campo.required && <span className="text-danger"> *</span>}
    </label>
  );

  if (campo.type === "boolean") {
    return (
      <div className="flex items-center gap-3">
        <ToggleSwitch value={Boolean(valor)} onChange={onChange} />
        <div>
          <span className="text-14 text-primary">{campo.label}</span>
          {campo.description && <p className="text-12 text-secondary">{campo.description}</p>}
        </div>
      </div>
    );
  }

  if (campo.type === "select") {
    return (
      <div>
        {rotulo}
        <SelectPesquisavel
          value={String(valor ?? "")}
          onChange={onChange}
          opcoes={(campo.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
          opcaoVazia={{ value: "", label: "Sem escolha" }}
        />
        {campo.description && <p className="mt-1 text-12 text-secondary">{campo.description}</p>}
      </div>
    );
  }

  const secreto = campo.type === "secret" || campo.secret;
  return (
    <div>
      {rotulo}
      <Input
        id={`config-${campo.key}`}
        type={secreto ? "password" : campo.type === "number" ? "number" : "text"}
        value={secreto && valor === "***" ? "" : String(valor ?? "")}
        placeholder={secreto && valor === "***" ? "Preenchido. Deixe vazio para manter." : undefined}
        onChange={(e) => onChange(campo.type === "number" ? Number(e.target.value) : e.target.value)}
        className="w-full"
      />
      {campo.description && <p className="mt-1 text-12 text-secondary">{campo.description}</p>}
    </div>
  );
}

export function ConfiguracaoDoPlugin({ workspaceSlug, pluginId, ligado }: Props) {
  const { configuracao, isLoading, error, refetch } = useConfiguracaoDoPlugin(workspaceSlug, pluginId, ligado);
  const [valores, setValores] = useState<Record<string, unknown>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (configuracao) setValores(configuracao.values);
  }, [configuracao]);

  if (!ligado) return <p className="py-4 text-13 text-secondary">Ligue o plugin para configurar.</p>;
  if (isLoading) return <p className="py-4 text-13 text-secondary">Carregando configuração…</p>;
  if (error) return <p className="text-danger py-4 text-13">Não foi possível carregar a configuração.</p>;
  if (!configuracao || configuracao.schema.length === 0) {
    return <p className="py-4 text-13 text-secondary">Este plugin não tem configuração.</p>;
  }

  const salvar = async () => {
    setSalvando(true);
    try {
      await pluginsService.saveConfig(workspaceSlug, pluginId, valores);
      await refetch();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Configuração salva" });
    } catch (erro) {
      const doCampo = readErrosDeCampo(erro);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Não deu para salvar",
        message: doCampo[""] ?? Object.values(doCampo)[0],
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-5">
      {Object.entries(agruparPorGrupo(configuracao.schema)).map(([grupo, campos]) => (
        <div key={grupo} className="space-y-3">
          <h4 className="text-12 font-medium tracking-wide text-secondary uppercase">{grupo}</h4>
          {campos.map((campo) => (
            <Campo
              key={campo.key}
              campo={campo}
              valor={valores[campo.key]}
              onChange={(v) => setValores((atuais) => ({ ...atuais, [campo.key]: v }))}
            />
          ))}
        </div>
      ))}
      <Button onClick={salvar} loading={salvando} disabled={salvando}>
        Salvar configuração
      </Button>
    </div>
  );
}
