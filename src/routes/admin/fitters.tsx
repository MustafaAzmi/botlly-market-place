import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Loader2, Save, Trash2, UserRoundCheck, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  deleteFitterByAdmin,
  listFitters,
  resetFitterProfitByAdmin,
  updateFitterByAdmin,
  type FitterAdminView,
} from "@/lib/admin.functions";
import { requireAdminClient } from "@/lib/adminGuard";
import { readAdminSession } from "@/lib/adminSession";

export const Route = createFileRoute("/admin/fitters")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "فيتر — Botly Admin" }] }),
  component: AdminFittersPage,
});

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

function AdminFittersPage() {
  const session = readAdminSession();
  const listFn = useServerFn(listFitters);
  const updateFn = useServerFn(updateFitterByAdmin);
  const deleteFn = useServerFn(deleteFitterByAdmin);
  const resetFn = useServerFn(resetFitterProfitByAdmin);
  const [editing, setEditing] = useState<Record<string, FitterAdminView>>({});
  const [busyId, setBusyId] = useState("");

  const { data: fitters = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-fitters"],
    enabled: !!session?.token,
    queryFn: async () => (session?.token ? listFn({ data: { token: session.token } }) : []),
  });

  const rowState = (row: FitterAdminView) => editing[row.fitterId] ?? row;
  const patch = (id: string, base: FitterAdminView, changes: Partial<FitterAdminView>) =>
    setEditing((current) => ({ ...current, [id]: { ...(current[id] ?? base), ...changes } }));

  const save = async (row: FitterAdminView) => {
    if (!session?.token) return;
    const current = rowState(row);
    setBusyId(row.fitterId);
    try {
      await updateFn({
        data: {
          token: session.token,
          fitterId: row.fitterId,
          name: current.name,
          whatsapp: current.whatsapp,
          city: current.city,
          address: current.address,
          visaNumber: current.visaNumber,
          commissionPercent: Number(current.commissionPercent) || 0,
        },
      });
      toast.success("تم حفظ بيانات الفيتر");
      setEditing((current) => {
        const next = { ...current };
        delete next[row.fitterId];
        return next;
      });
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل الحفظ");
    } finally {
      setBusyId("");
    }
  };

  const resetProfit = async (row: FitterAdminView) => {
    if (!session?.token) return;
    setBusyId(row.fitterId);
    try {
      await resetFn({ data: { token: session.token, fitterId: row.fitterId } });
      toast.success("تم تصفير أرباح الفيتر");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل التصفير");
    } finally {
      setBusyId("");
    }
  };

  const remove = async (row: FitterAdminView) => {
    if (!session?.token) return;
    if (!confirm(`حذف الفيتر ${row.name}؟`)) return;
    setBusyId(row.fitterId);
    try {
      await deleteFn({ data: { token: session.token, fitterId: row.fitterId } });
      toast.success("تم حذف الفيتر");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل الحذف");
    } finally {
      setBusyId("");
    }
  };

  return (
    <AdminLayout title="فيتر" subtitle="إدارة حسابات الفيترية، نسب العمولة، الفيزا، وتصفير المستحقات.">
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-3 text-sm">جاري تحميل الفيترية...</p>
        </div>
      ) : fitters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          لا يوجد فيترية مسجلين حالياً.
        </div>
      ) : (
        <div className="space-y-4">
          {fitters.map((row) => {
            const current = rowState(row);
            const busy = busyId === row.fitterId;
            return (
              <div key={row.fitterId} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 font-semibold">
                      <UserRoundCheck className="h-4 w-4 text-primary" />
                      {row.name}
                    </h2>
                    <p className="text-xs text-muted-foreground" dir="ltr">{row.whatsapp}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button className="gap-2" disabled={busy} onClick={() => save(row)}>
                      <Save className="h-4 w-4" />
                      حفظ
                    </Button>
                    <Button variant="outline" className="gap-2" disabled={busy} onClick={() => resetProfit(row)}>
                      <Wallet className="h-4 w-4" />
                      تصفير الحساب
                    </Button>
                    <Button variant="outline" className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => remove(row)}>
                      <Trash2 className="h-4 w-4" />
                      حذف
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <EditField label="الاسم" value={current.name} onChange={(value) => patch(row.fitterId, row, { name: value })} />
                  <EditField label="واتساب" dir="ltr" value={current.whatsapp} onChange={(value) => patch(row.fitterId, row, { whatsapp: value })} />
                  <EditCity value={current.city} onChange={(value) => patch(row.fitterId, row, { city: value })} />
                  <EditField label="العنوان" value={current.address} onChange={(value) => patch(row.fitterId, row, { address: value })} />
                  <EditField label="رقم الفيزا" dir="ltr" icon={<CreditCard className="h-3.5 w-3.5" />} value={current.visaNumber} onChange={(value) => patch(row.fitterId, row, { visaNumber: value })} />
                  <EditField label="نسبة العمولة %" dir="ltr" type="number" value={String(current.commissionPercent)} onChange={(value) => patch(row.fitterId, row, { commissionPercent: Number(value) || 0 })} />
                  <ReadBox label="الأرباح الحالية" value={`${row.totalProfit.toLocaleString()} IQD`} />
                  <ReadBox label="طلبات مؤكدة" value={String(row.salesCount)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}

function EditCity({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-xs text-muted-foreground">المدينة</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="اختر المحافظة" />
        </SelectTrigger>
        <SelectContent>
          {IRAQI_GOVERNORATES.map((governorate) => (
            <SelectItem key={governorate} value={governorate}>
              {governorate}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function EditField({
  label,
  value,
  onChange,
  type = "text",
  dir,
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  dir?: string;
  icon?: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</span>
      <Input type={type} dir={dir} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ReadBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
