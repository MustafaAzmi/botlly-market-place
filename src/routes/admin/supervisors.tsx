import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ADMIN_SESSION_KEY } from "@/lib/adminMockData";
import { requireAdminClient } from "@/lib/adminGuard";
import {
  createSupervisor,
  listSupervisors,
  setSupervisorActive,
} from "@/lib/supervisor.functions";

export const Route = createFileRoute("/admin/supervisors")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "المشرفون - Botly Admin" }] }),
  component: AdminSupervisorsPage,
});

type Supervisor = Awaited<ReturnType<typeof listSupervisors>>[number];

function AdminSupervisorsPage() {
  const listFn = useServerFn(listSupervisors);
  const createFn = useServerFn(createSupervisor);
  const activeFn = useServerFn(setSupervisorActive);
  const [items, setItems] = useState<Supervisor[]>([]);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const token = typeof window === "undefined"
    ? ""
    : sessionStorage.getItem(ADMIN_SESSION_KEY) ?? "";

  const load = async () => {
    setLoading(true);
    try {
      setItems(await listFn({ data: { token } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل المشرفين");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setSaving(true);
    try {
      await createFn({ data: { token, name, whatsapp, password } });
      setName("");
      setWhatsapp("");
      setPassword("");
      toast.success("تم إنشاء حساب المشرف");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء المشرف");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="المشرفون" subtitle="المشرف ينشئ تجاراً وفيترية pending فقط، والتفعيل يبقى حصراً للأدمن.">
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <UserPlus className="h-5 w-5 text-primary" />
            مشرف جديد
          </h2>
          <div className="mt-4 space-y-4">
            <Field label="اسم المشرف" value={name} onChange={setName} />
            <Field label="رقم الهاتف" value={whatsapp} onChange={setWhatsapp} />
            <Field label="كلمة المرور" value={password} onChange={setPassword} type="password" />
            <Button className="w-full" disabled={saving || !name || !whatsapp || password.length < 6} onClick={create}>
              {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              إنشاء المشرف
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4 font-semibold">الحسابات</div>
          {loading ? (
            <div className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">لا يوجد مشرفون بعد.</div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      {item.name}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{item.whatsapp}</div>
                  </div>
                  <Switch
                    checked={item.active}
                    onCheckedChange={async (active) => {
                      await activeFn({ data: { token, supervisorId: item.id, active } });
                      setItems((current) =>
                        current.map((row) => row.id === item.id ? { ...row, active } : row),
                      );
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
