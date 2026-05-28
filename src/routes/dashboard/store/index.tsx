import { createFileRoute, Link } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useT } from "@/i18n/LanguageProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { demoMerchant } from "@/lib/mockData";
import { ImagePlus, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/store/")({
  head: () => ({ meta: [{ title: "Store profile — Botly" }] }),
  component: StoreProfilePage,
});

function StoreProfilePage() {
  const t = useT();
  const [active, setActive] = useState(demoMerchant.active);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO(supabase): update merchant row.
    toast.success(t("store.save"));
  };

  return (
    <DashboardLayout
      title={t("store.title")}
      subtitle={t("store.subtitle")}
      actions={
        <Button asChild variant="outline" size="lg" className="gap-2">
          <Link to="/store/$slug" params={{ slug: "noor-store" }}>
            <ExternalLink className="h-4 w-4" />
            {t("store.preview")}
          </Link>
        </Button>
      }
    >
      <form onSubmit={onSubmit} className="space-y-6">
        {/* Cover + logo */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="relative h-48 bg-gradient-to-br from-primary/30 via-primary/20 to-info/20">
            <button
              type="button"
              className="absolute end-4 top-4 rounded-lg bg-background/90 px-3 py-1.5 text-xs font-medium shadow-soft backdrop-blur-sm hover:bg-background"
            >
              <ImagePlus className="me-1 inline h-3.5 w-3.5" />
              {t("store.cover")}
            </button>
          </div>
          <div className="relative px-6 pb-6">
            <div className="-mt-12 flex items-end justify-between gap-4">
              <div className="grid h-24 w-24 place-items-center rounded-2xl border-4 border-card bg-gradient-to-br from-primary to-primary/60 text-2xl font-bold text-primary-foreground shadow-elevated">
                {demoMerchant.storeName.charAt(0)}
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/50 px-4 py-2">
                <Switch checked={active} onCheckedChange={setActive} id="status" />
                <Label htmlFor="status" className="text-sm font-medium cursor-pointer">
                  {active ? t("store.status.active") : t("store.status.inactive")}
                </Label>
              </div>
            </div>
          </div>
        </div>

        {/* Fields */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <Field label={t("store.name")}>
              <Input className="h-11" defaultValue={demoMerchant.storeName} />
            </Field>
            <Field label={t("store.bio")}>
              <Textarea rows={4} defaultValue={demoMerchant.bio} />
            </Field>
            <Field label={t("store.whatsapp")}>
              <Input className="h-11 text-start" dir="ltr" defaultValue={demoMerchant.whatsapp} />
            </Field>
          </Card>
          <Card>
            <Field label={t("store.city")}>
              <Input className="h-11" defaultValue={demoMerchant.city} />
            </Field>
            <Field label={t("store.category")}>
              <Select defaultValue={demoMerchant.category}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Electronics">Electronics</SelectItem>
                  <SelectItem value="Fashion">Fashion</SelectItem>
                  <SelectItem value="Accessories">Accessories</SelectItem>
                  <SelectItem value="Home">Home</SelectItem>
                  <SelectItem value="Beauty">Beauty</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("store.delivery.name")}>
              <Input className="h-11" defaultValue={demoMerchant.deliveryName} />
            </Field>
            <Field label={t("store.delivery.phone")}>
              <Input className="h-11 text-start" dir="ltr" defaultValue={demoMerchant.deliveryPhone} />
            </Field>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="lg" className="shadow-soft">{t("store.save")}</Button>
        </div>
      </form>
    </DashboardLayout>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}
