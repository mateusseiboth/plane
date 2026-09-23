/**
 * Envio do bundle .zip de um plugin (Configurações > Plugins).
 *
 * O registro recusa versão igual ou menor que a instalada. Esse erro volta com
 * `errors: [{path: "file", ...}]` e é mostrado NO CAMPO do arquivo: um toque
 * sozinho não diz qual versão o servidor esperava.
 */
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { readErrosDeCampo } from "@/components/plugins/gestao/gestao-rules";
import pluginsService from "@/services/plugins.service";

type Props = {
  workspaceSlug: string;
  recarregar: () => void;
};

export function EnvioDePlugin({ workspaceSlug, recarregar }: Props) {
  const campo = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});

  const limpar = () => {
    setArquivo(null);
    if (campo.current) campo.current.value = "";
  };

  const enviar = async () => {
    setErros({});
    if (!arquivo) {
      setErros({ file: "Escolha o arquivo .zip do plugin." });
      return;
    }
    setEnviando(true);
    try {
      const plugin = await pluginsService.upload(workspaceSlug, arquivo);
      limpar();
      recarregar();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Plugin enviado",
        message: `${plugin.name} está na versão ${plugin.version}.`,
      });
    } catch (erro) {
      const doCampo = readErrosDeCampo(erro);
      setErros(doCampo);
      if (doCampo[""]) {
        setToast({ type: TOAST_TYPE.ERROR, title: "Não deu para enviar", message: doCampo[""] });
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="rounded-lg border border-subtle p-4">
      <h3 className="text-16 font-medium text-primary">Enviar plugin</h3>
      <p className="mt-1 text-13 text-secondary">
        O pacote .zip precisa trazer o manifest.json. Para atualizar um plugin já instalado, envie uma versão maior que
        a atual.
      </p>

      <div className="mt-4 flex flex-wrap items-start gap-3">
        <div>
          <input
            ref={campo}
            id="plugin-arquivo"
            type="file"
            accept=".zip,application/zip"
            onChange={(e) => {
              setArquivo(e.target.files?.[0] ?? null);
              setErros({});
            }}
            className={`block w-full max-w-md rounded-md border px-3 py-2 text-13 text-secondary file:mr-3 file:rounded file:border-0 file:bg-layer-2 file:px-3 file:py-1 file:text-13 file:text-primary ${
              erros.file ? "border-danger" : "border-subtle"
            }`}
          />
          {erros.file && <p className="text-danger mt-1 text-12">{erros.file}</p>}
        </div>
        <Button onClick={enviar} loading={enviando} disabled={enviando} prependIcon={<Upload className="size-4" />}>
          Enviar
        </Button>
      </div>
    </section>
  );
}
