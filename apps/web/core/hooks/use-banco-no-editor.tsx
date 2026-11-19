/**
 * O "/banco" e o bloco do banco anexado, para todo editor do web (rico e de
 * comentário). O bloco entra sempre (senão o texto que já tem banco perderia o
 * bloco); o item do "/" só quando o gerenciador de backups está ativo.
 */
import { useMemo } from "react";
import { Database } from "lucide-react";
import { createBancoAnexoExtension, insertBancoAnexo } from "@plane/editor";
import type { TSlashCommandExtraOption } from "@plane/editor";
import { BancoAnexado } from "@/components/banco-anexo/banco-anexado";
import { useActivePlugins } from "@/hooks/use-plugins";
import { seletorDeBanco } from "@/store/seletor-de-banco.store";

const SLUG_DO_PLUGIN_DE_BACKUPS = "backup-manager";

const ITEM_DO_BANCO: TSlashCommandExtraOption = {
  commandKey: "banco-anexo",
  key: "banco-anexo",
  title: "Banco",
  description: "Anexar o banco de um cliente",
  searchTerms: ["banco", "backup", "bkp", "base"],
  icon: <Database className="size-3.5" />,
  section: "general",
  pushAfter: "image",
  command: ({ editor, range }) => seletorDeBanco.open((attrs) => insertBancoAnexo(editor, range, attrs)),
};

export function useBancoNoEditor({ workspaceSlug, projectId }: { workspaceSlug: string; projectId?: string }) {
  const { activePlugins } = useActivePlugins();
  const isPluginAtivo = activePlugins.some((p) => p.slug === SLUG_DO_PLUGIN_DE_BACKUPS);

  const extensions = useMemo(
    () => [
      createBancoAnexoExtension({
        render: (props) => <BancoAnexado {...props} workspaceSlug={workspaceSlug} projectId={projectId} />,
      }),
    ],
    [workspaceSlug, projectId]
  );
  const slashCommandAdditionalOptions = useMemo(() => (isPluginAtivo ? [ITEM_DO_BANCO] : []), [isPluginAtivo]);

  return { extensions, slashCommandAdditionalOptions };
}
