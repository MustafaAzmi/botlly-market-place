import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Phone, Save } from "lucide-react";
import { getPlatformSettings, setMediatorPhone } from "@/lib/admin.functions";
import { readAdminSession } from "@/lib/adminSession";
import { requireAdminClient } from "@/lib/adminGuard";

export const Route = createFileRoute("/admin/bot")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "إعدادات استلام الطلبات — Botly Admin" }] }),
  component: AdminBotPage,
});

function AdminBotPage() {
  const session = readAdminSession();
  const getSettingsFn = useServerFn(getPlatformSettings);
  const setMediatorFn = useServerFn(setMediatorPhone);
  const [mediators, setMediators] = useState("");
  const [savingMediator, setSavingMediator] = useState(false);

  useEffect(() => {
    if (!session?.token) return;
    getSettingsFn({ data: { token: session.token } })
      .then((settings) => setMediators((settings.mediatorPhones ?? [settings.mediatorPhone]).filter(Boolean).join("\n")))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMediator = async () => {
    if (!session?.token) return;
    setSavingMediator(true);
    try {
      const mediatorPhones = mediators
        .split(/\r?\n|,/)
        .map((phone) => phone.trim())
        .filter(Boolean);
      await setMediatorFn({ data: { token: session.token, mediatorPhones } });
      toast.success("تم حفظ أرقام الوسطاء ✅");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSavingMediator(false);
    }
  };

  return (
    <AdminLayout title="إعدادات استلام الطلبات" subtitle="هذه الصفحة خاصة بأرقام الوسطاء والموظفين الذين يستلمون طلبات الزبائن من الموقع.">
      <div className="mb-6 rounded-2xl border border-primary/30 bg-primary-soft/40 p-6 shadow-soft">
        <div className="flex items-center gap-2 font-semibold">
          <Phone className="h-4 w-4 text-primary" />
          أرقام الوسطاء / الموظفين
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          كل طلبات الزبائن من الموقع توصل لكل الأرقام المحفوظة هنا. اكتب كل رقم بسطر،
          وأول رقم يظهر للزبون بزر التواصل.
        </p>
        <div className="mt-3 flex max-w-2xl gap-2">
          <Textarea
            dir="ltr"
            placeholder={"07836635435\n0770 XXX XXXX\n0750 XXX XXXX"}
            value={mediators}
            onChange={(e) => setMediators(e.target.value)}
            className="min-h-28"
          />
          <Button onClick={saveMediator} disabled={savingMediator} className="h-11 gap-2">
            <Save className="h-4 w-4" />
            {savingMediator ? "جاري..." : "حفظ"}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
