/**
 * Histórico do "Alterar sistema": o antigo registra para onde foi
 * (`moved_to`), o novo registra de onde veio (`moved_from`).
 */
import { observer } from "mobx-react";
import { ArrowRightLeft } from "lucide-react";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { IssueActivityBlockComponent } from "@/components/issues/issue-detail/issue-activity/activity/actions/helpers/activity-block";

const TEXTO_DO_CAMPO: Record<string, string> = {
  moved_to: "moveu o chamado para",
  moved_from: "trouxe o chamado de",
};

type Props = { activityId: string; ends: "top" | "bottom" | undefined };

export const IssueSistemaActivity = observer(function IssueSistemaActivity({ activityId, ends }: Props) {
  const {
    activity: { getActivityById },
  } = useIssueDetail();
  const activity = getActivityById(activityId);
  if (!activity) return <></>;

  return (
    <IssueActivityBlockComponent
      icon={<ArrowRightLeft className="h-4 w-4 flex-shrink-0 text-secondary" />}
      activityId={activityId}
      ends={ends}
    >
      <>
        {TEXTO_DO_CAMPO[activity.field ?? ""]} <span className="font-medium text-primary">{activity.new_value}</span>.
      </>
    </IssueActivityBlockComponent>
  );
});
