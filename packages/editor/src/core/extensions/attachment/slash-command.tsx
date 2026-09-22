/** Opção "Anexo" do menu "/" do editor de documentos. */
import { Paperclip } from "lucide-react";
import { insertAttachment } from "@/helpers/editor-commands";
import type { CommandProps } from "@/types";
import type { TSlashCommandAdditionalOption } from "../slash-commands/root";

export const ATTACHMENT_SLASH_COMMAND: TSlashCommandAdditionalOption = {
  commandKey: "attachment",
  key: "attachment",
  title: "Anexo",
  icon: <Paperclip className="size-3.5" />,
  description: "Enviar um arquivo para a página",
  searchTerms: ["anexo", "arquivo", "documento", "pdf", "planilha", "file", "upload", "attachment"],
  command: ({ editor, range }: CommandProps) => insertAttachment({ editor, event: "insert", range }),
  section: "general",
  pushAfter: "image",
};
