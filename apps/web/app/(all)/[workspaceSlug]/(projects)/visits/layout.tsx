import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";

function VisitsHeader() {
  return (
    <div className="flex items-center gap-2 px-4">
      <span className="text-15 font-semibold">Visitas Técnicas</span>
    </div>
  );
}

export default function VisitsLayout() {
  return (
    <>
      <AppHeader header={<VisitsHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
