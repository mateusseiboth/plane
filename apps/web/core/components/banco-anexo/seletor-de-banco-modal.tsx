import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { buildAttrsDoBanco, readRotuloDoBanco } from "@/components/banco-anexo/banco-anexo";
import { bancoAnexoService } from "@/services/banco-anexo.service";
import { seletorDeBanco } from "@/store/seletor-de-banco.store";

const OPCOES = { revalidateOnFocus: false } as const;

/**
 * "/banco": escolhe mês, sistema e entidade (a ordem das pastas do servidor de
 * backups) e o arquivo; o bloco entra no texto no lugar do comando.
 */
export const SeletorDeBancoModal = observer(function SeletorDeBancoModal() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const [mes, setMes] = useState("");
  const [sistema, setSistema] = useState("");
  const [entidade, setEntidade] = useState("");
  const isOpen = seletorDeBanco.isOpen;

  const meses = useSWR(isOpen && slug ? `BANCO_MESES_${slug}` : null, () => bancoAnexoService.listMeses(slug), OPCOES);
  const sistemas = useSWR(
    isOpen && mes ? `BANCO_SISTEMAS_${slug}_${mes}` : null,
    () => bancoAnexoService.listSistemas(slug, mes),
    OPCOES
  );
  const entidades = useSWR(
    isOpen && mes && sistema ? `BANCO_ENTIDADES_${slug}_${mes}_${sistema}` : null,
    () => bancoAnexoService.listEntidades(slug, mes, sistema),
    OPCOES
  );
  const arquivos = useSWR(
    isOpen && mes && sistema && entidade ? `BANCO_ARQUIVOS_${slug}_${mes}_${sistema}_${entidade}` : null,
    () => bancoAnexoService.listArquivos(slug, mes, sistema, entidade),
    OPCOES
  );

  const nomeDoSistema = sistemas.data?.find((s) => s.system_id === sistema)?.system_name ?? null;
  const nomeDaEntidade = entidades.data?.find((e) => e.entity_code === entidade)?.entity_name ?? null;
  const erro = (meses.error ?? sistemas.error ?? entidades.error ?? arquivos.error) as { detail?: string } | undefined;

  const close = () => {
    setMes("");
    setSistema("");
    setEntidade("");
    seletorDeBanco.close();
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={close} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="space-y-3 p-5">
        <h3 className="text-16 font-medium">Anexar banco</h3>
        <p className="text-13 text-secondary">Quem abrir o texto baixa o banco com um clique, sem link que expira.</p>
        {erro && <p className="text-13 text-danger-primary">{erro.detail ?? "Não foi possível buscar os backups."}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectPesquisavel
            label="Mês"
            value={mes}
            onChange={(valor) => {
              setMes(valor);
              setSistema("");
              setEntidade("");
            }}
            opcoes={(meses.data ?? []).map((m) => ({
              value: m.mes,
              label: m.mes,
              descricao: `${m.arquivos} arquivos`,
            }))}
            placeholder="Mês do envio"
          />
          <SelectPesquisavel
            label="Sistema"
            value={sistema}
            onChange={(valor) => {
              setSistema(valor);
              setEntidade("");
            }}
            opcoes={(sistemas.data ?? []).map((s) => ({ value: s.system_id, label: s.system_name ?? s.system_id }))}
            placeholder="Sistema"
            disabled={!mes}
          />
          <SelectPesquisavel
            label="Entidade"
            value={entidade}
            onChange={setEntidade}
            opcoes={(entidades.data ?? []).map((e) => ({
              value: e.entity_code,
              label: e.entity_name ?? `Entidade ${e.entity_code}`,
            }))}
            placeholder="Entidade"
            disabled={!sistema}
          />
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {(arquivos.data ?? []).map((arquivo) => {
            const attrs = buildAttrsDoBanco(arquivo, { entidade: nomeDaEntidade, sistema: nomeDoSistema });
            return (
              <li key={arquivo.id}>
                <button
                  type="button"
                  className="w-full rounded-md border border-subtle px-3 py-2 text-left text-13 hover:bg-layer-1-hover"
                  onClick={() => seletorDeBanco.choose(attrs)}
                >
                  {readRotuloDoBanco(attrs)}
                </button>
              </li>
            );
          })}
          {entidade && !arquivos.isLoading && !arquivos.data?.length && (
            <li className="text-13 text-secondary">Nenhum arquivo dessa entidade no mês.</li>
          )}
        </ul>
      </div>
      <div className="flex justify-end border-t-[0.5px] border-subtle px-5 py-4">
        <Button variant="secondary" onClick={close}>
          Cancelar
        </Button>
      </div>
    </ModalCore>
  );
});
