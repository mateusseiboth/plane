/**
 * Lista dos plugins instalados (Configurações > Plugins): ligar/desligar,
 * remover e abrir os painéis de permissões e de configuração de cada um.
 */
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ToggleSwitch } from "@plane/ui";
import { ConfiguracaoDoPlugin } from "@/components/plugins/gestao/configuracao-do-plugin";
import { readErrosDeCampo } from "@/components/plugins/gestao/gestao-rules";
import { PermissoesDoPlugin } from "@/components/plugins/gestao/permissoes-do-plugin";
import pluginsService, { type TPluginInstalado } from "@/services/plugins.service";

type Props = {
  workspaceSlug: string;
  plugins: TPluginInstalado[];
  recarregar: () => void;
};

const ABAS = [
  { chave: "permissoes", rotulo: "Permissões" },
  { chave: "configuracao", rotulo: "Configuração" },
] as const;

type Aba = (typeof ABAS)[number]["chave"];

const formatarData = (iso: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

export function ListaDePlugins({ workspaceSlug, plugins, recarregar }: Props) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("permissoes");

  const avisarErro = (erro: unknown, titulo: string) => {
    const doCampo = readErrosDeCampo(erro);
    setToast({ type: TOAST_TYPE.ERROR, title: titulo, message: doCampo[""] ?? Object.values(doCampo)[0] });
  };

  const alternar = async (plugin: TPluginInstalado) => {
    try {
      await pluginsService.toggle(workspaceSlug, plugin.id, !plugin.is_active);
      recarregar();
    } catch (erro) {
      avisarErro(erro, "Não deu para mudar o plugin");
    }
  };

  const remover = async (plugin: TPluginInstalado) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Remover ${plugin.name}? As páginas e o menu do plugin saem do ar.`)) return;
    try {
      await pluginsService.remove(workspaceSlug, plugin.id);
      if (aberto === plugin.id) setAberto(null);
      recarregar();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Plugin removido" });
    } catch (erro) {
      avisarErro(erro, "Não deu para remover");
    }
  };

  if (plugins.length === 0) {
    return (
      <div className="rounded-lg border border-subtle px-4 py-8 text-center text-13 text-secondary">
        Nenhum plugin instalado. Envie o pacote .zip acima para começar.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-subtle">
      <table className="w-full text-14">
        <thead className="bg-layer-1 text-13 text-secondary">
          <tr>
            <th className="px-4 py-2 text-left">Plugin</th>
            <th className="px-4 py-2 text-left">Versão</th>
            <th className="px-4 py-2 text-left">Enviado em</th>
            <th className="px-4 py-2 text-left">Ligado</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {plugins.map((plugin) => {
            const expandido = aberto === plugin.id;
            return (
              <Fragment key={plugin.id}>
                <tr className="border-t border-subtle">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="flex items-start gap-2 text-left"
                      onClick={() => setAberto(expandido ? null : plugin.id)}
                    >
                      {expandido ? (
                        <ChevronDown className="mt-0.5 size-4 text-secondary" />
                      ) : (
                        <ChevronRight className="mt-0.5 size-4 text-secondary" />
                      )}
                      <span>
                        <span className="block text-primary">{plugin.name}</span>
                        <span className="font-mono block text-12 text-secondary">{plugin.slug}</span>
                        {plugin.description && (
                          <span className="mt-1 block max-w-xl text-12 text-secondary">{plugin.description}</span>
                        )}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-secondary">{plugin.version}</td>
                  <td className="px-4 py-3 text-secondary">{formatarData(plugin.updated_at ?? plugin.created_at)}</td>
                  <td className="px-4 py-3">
                    <ToggleSwitch value={plugin.is_active} onChange={() => void alternar(plugin)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void remover(plugin)}
                      className="text-danger inline-flex items-center gap-1 text-13"
                    >
                      <Trash2 className="size-3.5" /> Remover
                    </button>
                  </td>
                </tr>
                {expandido && (
                  <tr className="border-t border-subtle bg-layer-1">
                    <td colSpan={5} className="px-4 py-4">
                      <div className="mb-3 flex gap-2">
                        {ABAS.map((item) => (
                          <button
                            key={item.chave}
                            type="button"
                            onClick={() => setAba(item.chave)}
                            className={`rounded-md border px-3 py-1.5 text-13 ${
                              aba === item.chave
                                ? "border-accent-primary bg-accent-primary/10 text-primary"
                                : "border-subtle text-secondary"
                            }`}
                          >
                            {item.rotulo}
                          </button>
                        ))}
                      </div>
                      {aba === "permissoes" ? (
                        <PermissoesDoPlugin workspaceSlug={workspaceSlug} pluginId={plugin.id} />
                      ) : (
                        <ConfiguracaoDoPlugin
                          workspaceSlug={workspaceSlug}
                          pluginId={plugin.id}
                          ligado={plugin.is_active}
                        />
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
