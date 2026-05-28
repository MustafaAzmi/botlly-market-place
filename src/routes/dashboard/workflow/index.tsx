import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useT } from "@/i18n/LanguageProvider";
import {
  MessageCircle,
  Sparkles,
  Search,
  Package,
  CheckCircle2,
  Truck,
  ArrowDown,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/workflow/")({
  head: () => ({ meta: [{ title: "Workflow — Botly" }] }),
  component: WorkflowPage,
});

function WorkflowPage() {
  const t = useT();
  const steps = [
    { icon: MessageCircle, key: "step1", color: "from-info/80 to-info" },
    { icon: Sparkles, key: "step2", color: "from-primary/80 to-primary" },
    { icon: Search, key: "step3", color: "from-info/80 to-primary" },
    { icon: Package, key: "step4", color: "from-warning/80 to-warning" },
    { icon: CheckCircle2, key: "step5", color: "from-primary/80 to-success" },
    { icon: Truck, key: "step6", color: "from-success/80 to-success" },
  ] as const;

  return (
    <DashboardLayout title={t("workflow.title")} subtitle={t("workflow.subtitle")}>
      <div className="mx-auto max-w-2xl">
        <ol className="space-y-3">
          {steps.map(({ icon: Icon, key, color }, idx) => (
            <li key={key}>
              <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-soft transition-all hover:shadow-elevated">
                <div className={`absolute inset-y-0 start-0 w-1 bg-gradient-to-b ${color}`} />
                <div className="flex items-start gap-4 ps-3">
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${color} text-primary-foreground shadow-soft`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">0{idx + 1}</span>
                      <h3 className="font-semibold">{t(`workflow.${key}.title` as never)}</h3>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{t(`workflow.${key}.desc` as never)}</p>
                  </div>
                </div>
              </div>
              {idx < steps.length - 1 && (
                <div className="flex justify-center py-1 text-muted-foreground/60">
                  <ArrowDown className="h-4 w-4" />
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </DashboardLayout>
  );
}
