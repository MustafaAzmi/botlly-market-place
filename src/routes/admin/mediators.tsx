import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Phone, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getPlatformSettings, setMediatorPhone } from "@/lib/admin.functions";
import { readAdminSession } from "@/lib/adminSession";
import { requireAdminClient } from "@/lib/adminGuard";

export const Route = createFileRoute("/admin/mediators")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "الوسطاء — Botly Admin" }] }),
  component: AdminMediatorsPage,
});

type MediatorRow = {
  phone: string;
  city: string;
};

const IRAQI_GOVERNORATES = [
  "بغداد",
  "نينوى",
  "البصرة",
  "أربيل",
  "السليمانية",
  "دهوك",
  "كركوك",
  "الأنبار",
  "صلاح الدين",
  "ديالى",
  "واسط",
  "بابل",
  "كربلاء",
  "النجف",
  "الديوانية",
  "المثنى",
  "ذي قار",
  "ميسان",
  "حلبجة",
];

function AdminMediatorsPage() {
  const session = readAdminSession();
  const getSettingsFn = useServerFn(getPlatformSettings);
  const setMediatorFn = useServerFn(setMediatorPhone);

  const [mediators, setMediators] = useState<MediatorRow[]>([{ phone: "", city: "" }]);
  const [platformCommissionPercent, setPlatformCommissionPercent] = useState(5);
  const [loading, setLoading] = useState(true);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!session?.token) return;
    setLoading(true);
    getSettingsFn({ data: { token: session.token } })
      .then((settings) => {
        const contacts =
          settings.mediatorContacts?.length
            ? settings.mediatorContacts
            : (settings.mediatorPhones ?? [settings.mediatorPhone])
                .filter((phone): phone is string => Boolean(phone))
                .map((phone) => ({ phone, city: "" }));
        setMediators(contacts.length > 0 ? contacts : [{ phone: "", city: "" }]);
        setPlatformCommissionPercent(settings.platformCommissionPercent ?? 5);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "تعذر تحميل الوسطاء");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanPhones = useMemo(
    () => mediators.map((mediator) => mediator.phone.trim()).filter(Boolean),
    [mediators],
  );

  const updateMediator = (index: number, patch: Partial<MediatorRow>) => {
    setMediators((current) =>
      current.map((mediator, i) => (i === index ? { ...mediator, ...patch } : mediator)),
    );
  };

  const addMediator = () => setMediators((current) => [...current, { phone: "", city: "" }]);

  const removeMediator = async (index: number) => {
    const next = mediators.filter((_, i) => i !== index);
    setMediators(next.length > 0 ? next : [{ phone: "", city: "" }]);
    await saveAll(next);
  };

  const saveAll = async (phones = mediators, index: number | null = null) => {
    if (!session?.token) return;
    setSavingIndex(index);
    try {
      const mediatorContacts = phones
        .map((mediator) => ({ phone: mediator.phone.trim(), city: mediator.city.trim() }))
        .filter((mediator) => mediator.phone && mediator.city);
      if (phones.some((mediator) => mediator.phone.trim() && !mediator.city.trim())) {
        toast.error("اختار محافظة لكل وسيط قبل الحفظ");
        return;
      }
      await setMediatorFn({
        data: {
          token: session.token,
          mediatorContacts,
          platformCommissionPercent,
        },
      });
      toast.success("تم حفظ الوسطاء");
      setMediators(mediatorContacts.length > 0 ? mediatorContacts : [{ phone: "", city: "" }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل حفظ الوسطاء");
    } finally {
      setSavingIndex(null);
    }
  };

  return (
    <AdminLayout
      title="الوسطاء"
      subtitle="أرقام الموظفين أو الوسطاء الذين يستلمون طلبات الزبائن من الموقع."
      actions={
        <Button onClick={addMediator} className="gap-2">
          <Plus className="h-4 w-4" />
          إضافة وسيط
        </Button>
      }
    >
      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center gap-2 font-semibold">
          <Phone className="h-4 w-4 text-primary" />
          أرقام استلام الطلبات
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          كل طلب جديد يرسل لكل الأرقام المحفوظة. أول رقم بالقائمة يظهر للزبون بزر التواصل مع الوسيط.
        </p>

        <div className="mt-5 max-w-xs space-y-2">
          <label className="text-sm font-medium" htmlFor="platform-commission-percent">
            نسبة عمولة الوسيط %
          </label>
          <Input
            id="platform-commission-percent"
            dir="ltr"
            type="number"
            min={0}
            max={100}
            inputMode="decimal"
            value={platformCommissionPercent}
            onChange={(event) => setPlatformCommissionPercent(Number(event.target.value) || 0)}
            className="h-11 text-start"
          />
        </div>

        <div className="mt-5 space-y-3">
          {loading ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              جاري تحميل الوسطاء...
            </div>
          ) : (
            mediators.map((mediator, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-xl border border-border bg-background p-3 sm:grid-cols-[1fr_14rem_auto_auto]"
              >
                <Input
                  dir="ltr"
                  inputMode="tel"
                  placeholder="07XX XXX XXXX"
                  value={mediator.phone}
                  onChange={(event) => updateMediator(index, { phone: event.target.value })}
                  className="h-11 text-start"
                />
                <Select
                  value={mediator.city}
                  onValueChange={(city) => updateMediator(index, { city })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="المحافظة" />
                  </SelectTrigger>
                  <SelectContent>
                    {IRAQI_GOVERNORATES.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => saveAll(mediators, index)}
                  disabled={savingIndex !== null}
                  className="h-11 gap-2"
                >
                  <Save className="h-4 w-4" />
                  {savingIndex === index ? "جاري..." : "حفظ"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => removeMediator(index)}
                  disabled={savingIndex !== null}
                  className="h-11 gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  حذف
                </Button>
              </div>
            ))
          )}
        </div>

        {cleanPhones.length === 0 && !loading ? (
          <p className="mt-3 text-xs text-amber-600">
            لا يوجد وسيط محفوظ حالياً. أضف رقم واحد على الأقل حتى تصل الطلبات من صفحة الزبون.
          </p>
        ) : null}
      </div>
    </AdminLayout>
  );
}
