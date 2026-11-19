/**
 * O "/banco" e o bloco do banco anexado, para todo editor do web (rico e de
 * comentário). O bloco entra sempre (senão o texto que já tem banco perderia o
 * bloco); o item do "/" só quando o gerenciador de backups está ativo.
 */
import { useMemo, useState } from "react";
import { Database } from "lucide-react";
import { createBancoAnexoExtension, insertBancoAnexo } from "@plane/editor";
import type { TSlashCommandExtraOption } from "@plane/editor";
import { BancoAnexado } from "@/components/banco-anexo/banco-anexado";
import { useActivePlugins } from "@/hooks/use-plugins";
import { SeletorDeBancoModal } from "@/components/banco-anexo/seletor-de-banco-modal";
import { SeletorDeBanco } from "@/store/seletor-de-banco.store";

const SLUG_DO_PLUGIN_DE_BACKUPS = "backup-manager";

const buildItemDoBanco = (seletor: SeletorDeBanco): TSlashCommandExtraOption => ({
  commandKey: "banco-anexo",
  key: "banco-anexo",
  title: "Banco",
  description: "Anexar o banco de um cliente",
  searchTerms: ["banco", "backup", "bkp", "base"],
  icon: <Database className="size-3.5" />,
  section: "general",
  pushAfter: "image",
  command: ({ editor, range }) => seletor.open((attrs) => insertBancoAnexo(editor, range, attrs)),
});

export function useBancoNoEditor({ workspaceSlug, projectId }: { workspaceSlug: string; projectId?: string }) {
  const { activePlugins } = useActivePlugins();
  const isPluginAtivo = activePlugins.some((p) => p.slug === SLUG_DO_PLUGIN_DE_BACKUPS);
  const [seletor] = useState(() => new SeletorDeBanco());

  const extensions = useMemo(
    () => [
      createBancoAnexoExtension({
        render: (props) => <BancoAnexado {...props} workspaceSlug={workspaceSlug} projectId={projectId} />,
      }),
    ],
    [workspaceSlug, projectId]
  );
  const slashCommandAdditionalOptions = useMemo(
    () => (isPluginAtivo ? [buildItemDoBanco(seletor)] : []),
    [isPluginAtivo, seletor]
  );
  // Montado junto do editor: fica dentro da janela (modal, peek) que o abriu.
  const seletorModal = isPluginAtivo ? <SeletorDeBancoModal seletor={seletor} /> : null;

  return { extensions, slashCommandAdditionalOptions, seletorModal };
}
