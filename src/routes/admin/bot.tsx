import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useT } from "@/i18n/LanguageProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Phone, Save } from "lucide-react";
import { getPlatformSettings, setMediatorPhone } from "@/lib/admin.functions";
import { readAdminSession } from "@/lib/adminSession";
import { requireAdminClient } from "@/lib/adminGuard";

export const Route = createFileRoute("/admin/bot")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "إعدادات البوت — Botly Admin" }] }),
  component: AdminBotPage,
});

function AdminBotPage() {
  const t = useT();
  const [active, setActive] = useState(true);
  const session = readAdminSession();
  const getSettingsFn = useServerFn(getPlatformSettings);
  const setMediatorFn = useServerFn(setMediatorPhone);
  const [mediator, setMediator] = useState("");
  const [savingMediator, setSavingMediator] = useState(false);

  useEffect(() => {
    if (!session?.token) return;
    getSettingsFn({ data: { token: session.token } })
      .then((settings) => setMediator(settings.mediatorPhone))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMediator = async () => {
    if (!session?.token) return;
    setSavingMediator(true);
    try {
      await setMediatorFn({ data: { token: session.token, mediatorPhone: mediator.trim() } });
      toast.success("تم حفظ رقم الوسيط ✅");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSavingMediator(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO(supabase): persist global bot settings + templates.
    toast.success(t("bot.save"));
  };

  return (
    <AdminLayout title="إعدادات البوت العامة" subtitle="هذه الإعدادات تُطبَّق على جميع المتاجر المسجَّلة في المنصة.">
      {/* Mediator phone: shown to every customer as the only way to order */}
      <div className="mb-6 rounded-2xl border border-primary/30 bg-primary-soft/40 p-6 shadow-soft">
        <div className="flex items-center gap-2 font-semibold">
          <Phone className="h-4 w-4 text-primary" />
          رقم الوسيط (واتساب)
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          كل طلبات واستفسارات الزبائن توصل على هذا الرقم — يظهر للزبون بزر «التواصل مع الوسيط»
          وزر «استفسر عن المنتج» على كل قطعة. بدون رقم محفوظ هنا الأزرار ما تظهر.
        </p>
        <div className="mt-3 flex max-w-md gap-2">
          <Input
            dir="ltr"
            placeholder="07XX XXX XXXX"
            value={mediator}
            onChange={(e) => setMediator(e.target.value)}
            className="h-11"
          />
          <Button onClick={saveMediator} disabled={savingMediator} className="gap-2">
            <Save className="h-4 w-4" />
            {savingMediator ? "جاري..." : "حفظ"}
          </Button>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary-soft text-primary">
              <Bot className="h-6 w-6" />
            </span>
            <div>
              <div className="font-semibold">{t("bot.status")}</div>
              <div className="mt-0.5 text-xs">
                {active ? (
                  <Badge variant="outline" className="border-success/30 bg-success/15 text-success">
                    {t("dashboard.bot.active")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-muted-foreground/30 bg-muted text-muted-foreground">
                    {t("dashboard.bot.inactive")}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>

        <Card>
          <Field label={t("bot.webhook")} hint={t("bot.webhook.hint")}>
            <Input
              dir="ltr"
              className="h-11 font-mono text-sm"
              defaultValue="https://www.bot-lly.tech/api/whatsapp/webhook"
            />
          </Field>
        </Card>

        <Card>
          <Field
            label={t("bot.template.customer")}
            hint={`${t("bot.variables")}: {{product}}, {{price}}, {{store}}`}
          >
            <Textarea
              rows={4}
              defaultValue={"مرحباً 👋\nوجدت لك هذا المنتج: {{product}} بسعر {{price}}.\nهل ترغب بإتمام الطلب؟"}
            />
          </Field>
        </Card>
        <Card>
          <Field
            label={t("bot.template.merchant")}
            hint={`${t("bot.variables")}: {{customer}}, {{product}}, {{phone}}`}
          >
            <Textarea
              rows={4}
              defaultValue={"📦 طلب جديد!\nالعميل: {{customer}}\nالمنتج: {{product}}\nالهاتف: {{phone}}"}
            />
          </Field>
        </Card>
        <Card>
          <Field
            label={t("bot.template.delivery")}
            hint={`${t("bot.variables")}: {{customer}}, {{address}}, {{product}}`}
          >
            <Textarea
              rows={4}
              defaultValue={"🚚 طلب جاهز للاستلام\nالعميل: {{customer}}\nالعنوان: {{address}}\nالمنتج: {{product}}"}
            />
          </Field>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" className="shadow-soft">{t("bot.save")}</Button>
        </div>
      </form>
    </AdminLayout>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">{children}</div>;
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
