"use client";

import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
import * as Icons from "lucide-react";
import { ChevronRight } from "lucide-react";
import { PageHead } from "@/components/core/page-title";
import { REPORTS, REPORT_CATEGORIES, type ReportMeta } from "@/components/reports/catalog";
import { useWorkspace } from "@/hooks/store/use-workspace";

function ReportIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as any)[name] ?? Icons.FileBarChart;
  return <Icon className={className} />;
}

function ReportCard({ report, onClick }: { report: ReportMeta; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-lg border border-subtle bg-surface-1 p-4 text-left transition-colors hover:border-accent-primary hover:bg-surface-2"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-accent-primary group-hover:bg-surface-1">
        <ReportIcon name={report.icon} className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-13 font-semibold text-primary">{report.title}</h3>
          <ChevronRight className="h-4 w-4 shrink-0 text-tertiary transition-transform group-hover:translate-x-0.5" />
        </div>
        <p className="mt-1 text-12 leading-snug text-secondary">{report.description}</p>
      </div>
    </button>
  );
}

function ReportsLandingPage() {
  const { workspaceSlug } = useParams();
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Relatórios` : "Relatórios";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PageHead title={pageTitle} />
      <div className="border-b border-subtle px-6 py-4">
        <h1 className="text-lg font-semibold">Relatórios Gerenciais</h1>
        <p className="text-13 text-secondary">Indicadores detalhados de chamados, visitas, produtividade e SLA. Cada relatório pode ser impresso ou salvo em PDF.</p>
      </div>

      <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
        {REPORT_CATEGORIES.map((cat) => {
          const reports = REPORTS.filter((r) => r.category === cat.key);
          if (!reports.length) return null;
          return (
            <section key={cat.key}>
              <div className="mb-3">
                <h2 className="text-14 font-semibold text-primary">{cat.label}</h2>
                <p className="text-12 text-tertiary">{cat.description}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {reports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    onClick={() => router.push(`/${workspaceSlug}/reports/${report.id}`)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default observer(ReportsLandingPage);
