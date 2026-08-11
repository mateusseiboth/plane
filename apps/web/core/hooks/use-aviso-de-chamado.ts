/**
 * Aviso na área de trabalho quando um chamado seu se mexe.
 *
 * Precisa ficar montado o TEMPO TODO. A primeira versão vivia dentro do item
 * "Notificações" da barra lateral: com o menu recolhido o componente nem era
 * renderizado, o código nunca rodava e o aviso simplesmente não aparecia — a
 * notificação era gravada no banco e ninguém via.
 *
 * O conteúdo NÃO viaja no evento. O barramento de tempo real é do espaço de
 * trabalho inteiro, então o título do chamado chegaria ao navegador de quem
 * nem participa do projeto. Ao ser avisado, o navegador busca a própria
 * notificação — o servidor já filtra por destinatário.
 */
import { useEffect, useRef } from "react";
import { useRealtimeRefetch } from "@/hooks/use-realtime";
import { useUser } from "@/hooks/store/user";
import { useWorkspaceNotifications } from "@/hooks/store/notifications";
import { WorkspaceNotificationService } from "@/services/workspace-notification.service";

const servico = new WorkspaceNotificationService();

export function useAvisoDeChamado(workspaceSlug: string | undefined) {
  const { data: currentUser } = useUser();
  const { getUnreadNotificationsCount } = useWorkspaceNotifications();
  const ultimaAvisada = useRef<string | null>(null);

  // Pede a permissão uma vez. Fora de HTTPS o navegador recusa de saída — não
  // há o que fazer no código, só servir por HTTPS.
  useEffect(() => {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch {
      /* ignora */
    }
  }, []);

  useRealtimeRefetch(
    (evento) => evento.entity === "notification" && !!currentUser?.id && evento.receiver === currentUser.id,
    () => {
      if (!workspaceSlug) return;
      void getUnreadNotificationsCount(workspaceSlug);
      void (async () => {
        if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
        try {
          const dados = await servico.fetchNotifications(workspaceSlug, {
            type: "all",
            read: false,
            per_page: 1,
          } as never);
          const nova = (dados?.results ?? [])[0] as { id: string; title?: string; message?: string } | undefined;
          if (!nova || nova.id === ultimaAvisada.current) return;
          ultimaAvisada.current = nova.id;
          const aviso = new Notification(nova.title || "Novidade no chamado", {
            body: nova.message || "",
            icon: "/favicon.ico",
            tag: `plane-chamado-${nova.id}`,
          });
          aviso.onclick = () => {
            window.focus();
            aviso.close();
          };
        } catch {
          // aviso é conveniência: falhar aqui não pode atrapalhar a tela
        }
      })();
    }
  );
}
