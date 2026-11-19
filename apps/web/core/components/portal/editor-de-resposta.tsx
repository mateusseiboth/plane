import { useParams } from "next/navigation";
import { RichTextEditor } from "@/components/editor/rich-text/editor";
import { useWorkspace } from "@/hooks/store/use-workspace";

/** Imagem e anexo ficam de fora: o portal só mostra texto formatado. */
const EXTENSOES_SEM_MIDIA = ["image", "attachment"] as const;

const semMidia = async (): Promise<string> => {
  throw new Error("A resposta ao cliente não leva imagem nem anexo.");
};

type Props = {
  /** Muda a `key` para começar em branco: texto que sobrou iria para o cliente errado. */
  id: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

/**
 * O editor da resposta que vai para quem pediu (portal ou sino). Texto rico sem
 * mídia; o servidor limpa o HTML pela lista de permissão do portal.
 */
export function EditorDeResposta({ id, onChange, placeholder }: Props) {
  const { workspaceSlug } = useParams();
  const { currentWorkspace } = useWorkspace();
  return (
    <RichTextEditor
      key={id}
      editable
      id={`resposta-${id}`}
      initialValue="<p></p>"
      workspaceSlug={workspaceSlug?.toString() ?? ""}
      workspaceId={currentWorkspace?.id ?? ""}
      dragDropEnabled={false}
      disabledExtensions={[...EXTENSOES_SEM_MIDIA]}
      onChange={(_json: object, html: string) => onChange(html)}
      placeholder={placeholder ?? "Conte o que foi feito, em uma linguagem que quem pediu entenda."}
      searchMentionCallback={async () => ({})}
      uploadFile={semMidia}
      duplicateFile={semMidia}
      containerClassName="min-h-40 rounded-md border border-strong bg-layer-1"
    />
  );
}
