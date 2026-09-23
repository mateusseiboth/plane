/**
 * Grade função × permissão de um plugin (Configurações > Plugins).
 *
 * As permissões são as que o manifesto do plugin declara; as funções são as do
 * espaço. Gravar é idempotente: o servidor só mexe no que mudou.
 */
import { useEffect, useState } from "react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Checkbox } from "@plane/ui";
import {
  contarPermissoesDaFuncao,
  isMarcadoNaGrade,
  readErrosDeCampo,
  toggleNaGrade,
  type TGradeDeGrants,
} from "@/components/plugins/gestao/gestao-rules";
import { useGradeDoPlugin } from "@/hooks/use-plugins-gestao";
import pluginsService from "@/services/plugins.service";

type Props = {
  workspaceSlug: string;
  pluginId: string;
};

export function PermissoesDoPlugin({ workspaceSlug, pluginId }: Props) {
  const { grade: doServidor, isLoading, refetch } = useGradeDoPlugin(workspaceSlug, pluginId);
  const [grade, setGrade] = useState<TGradeDeGrants>({});
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (doServidor) setGrade(doServidor.grants);
  }, [doServidor]);

  if (isLoading || !doServidor) return <p className="py-4 text-13 text-secondary">Carregando permissões…</p>;

  if (doServidor.permissions.length === 0) {
    return <p className="py-4 text-13 text-secondary">Este plugin não declara permissões próprias.</p>;
  }

  const salvar = async () => {
    setSalvando(true);
    setErros({});
    try {
      await pluginsService.saveGrants(workspaceSlug, pluginId, grade);
      await refetch();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Permissões salvas" });
    } catch (erro) {
      const doCampo = readErrosDeCampo(erro);
      setErros(doCampo);
      if (doCampo[""]) setToast({ type: TOAST_TYPE.ERROR, title: "Não deu para salvar", message: doCampo[""] });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-subtle">
        <table className="w-full text-14">
          <thead className="bg-layer-1 text-13 text-secondary">
            <tr>
              <th className="px-4 py-2 text-left">Função</th>
              {doServidor.permissions.map((permissao) => (
                <th key={permissao.key} className="px-4 py-2 text-left" title={permissao.description ?? permissao.key}>
                  {permissao.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doServidor.roles.map((funcao) => {
              const erroDaLinha = erros[`grants.${funcao.id}`];
              return (
                <tr key={funcao.id} className="border-t border-subtle align-top">
                  <td className="px-4 py-2">
                    <span className="text-primary">{funcao.name}</span>
                    <span className="ml-2 text-12 text-secondary">
                      {contarPermissoesDaFuncao(grade, funcao.id)} de {doServidor.permissions.length}
                    </span>
                    {erroDaLinha && <p className="text-danger mt-1 text-12">{erroDaLinha}</p>}
                  </td>
                  {doServidor.permissions.map((permissao) => (
                    <td key={permissao.key} className="px-4 py-2">
                      <Checkbox
                        checked={isMarcadoNaGrade(grade, funcao.id, permissao.key)}
                        onChange={() => setGrade((atual) => toggleNaGrade(atual, funcao.id, permissao.key))}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button onClick={salvar} loading={salvando} disabled={salvando}>
        Salvar permissões
      </Button>
    </div>
  );
}
