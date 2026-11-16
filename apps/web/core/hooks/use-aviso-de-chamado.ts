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
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { buildAvisoNaTela, type AvisoNaTela } from "@/components/workspace-notifications/aviso-na-tela";
import { useRealtimeRefetch } from "@/hooks/use-realtime";
import { useUser } from "@/hooks/store/user";
import { useWorkspaceNotifications } from "@/hooks/store/notifications";
import { WorkspaceNotificationService } from "@/services/workspace-notification.service";

const servico = new WorkspaceNotificationService();

type NotificacaoNova = { id: string; title?: string; message_html?: string; data?: { urgente?: boolean } | null };

const TIPO_DO_TOAST: Record<AvisoNaTela["tipo"], TOAST_TYPE> = {
  alerta: TOAST_TYPE.ERROR,
  informacao: TOAST_TYPE.INFO,
};

/** Na tela sempre: o aviso do sistema operacional depende de permissão e HTTPS. */
const showNaTela = (aviso: AvisoNaTela) =>
  setToast({ type: TIPO_DO_TOAST[aviso.tipo], title: aviso.titulo, message: aviso.mensagem });

const showNoSistema = (nova: NotificacaoNova, aviso: AvisoNaTela) => {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const noSistema = new Notification(aviso.titulo, {
    body: aviso.mensagem,
    icon: "/favicon.ico",
    tag: `plane-chamado-${nova.id}`,
  });
  noSistema.addEventListener("click", () => {
    window.focus();
    noSistema.close();
  });
};

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
        try {
          const dados = await servico.fetchNotifications(workspaceSlug, {
            type: "all",
            read: false,
            per_page: 1,
          } as never);
          const nova = (dados?.results ?? [])[0] as NotificacaoNova | undefined;
          if (!nova || nova.id === ultimaAvisada.current) return;
          ultimaAvisada.current = nova.id;
          const aviso = buildAvisoNaTela(nova);
          showNaTela(aviso);
          showNoSistema(nova, aviso);
        } catch {
          // aviso é conveniência: falhar aqui não pode atrapalhar a tela
        }
      })();
    }
  );
}
