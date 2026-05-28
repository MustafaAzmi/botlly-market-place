import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Coins } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { requireAdminClient } from "@/lib/adminGuard";
import {
  useCurrencies,
  addCurrency,
  updateCurrency,
  removeCurrency,
} from "@/lib/currenciesStore";

export const Route = createFileRoute("/admin/currencies")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "العملات — Botly Admin" }] }),
  component: AdminCurrenciesPage,
});

function AdminCurrenciesPage() {
  const currencies = useCurrencies();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");

  const onAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    const l = label.trim();
    if (!c || !l) {
      toast.error("يرجى إدخال رمز العملة واسمها");
      return;
    }
    if (c.length > 6 || !/^[A-Z]+$/.test(c)) {
      toast.error("رمز العملة يجب أن يكون أحرف لاتينية فقط (مثال: USD)");
      return;
    }
    const ok = addCurrency({ code: c, label: l, active: true });
    if (!ok) {
      toast.error("هذه العملة موجودة مسبقاً");
      return;
    }
    setCode("");
    setLabel("");
    toast.success("تمت إضافة العملة وستظهر للتجار فوراً");
  };

  return (
    <AdminLayout
      title="إدارة العملات"
      subtitle="العملات التي يضيفها الأدمن هنا تظهر تلقائياً في صفحة التاجر عند إضافة منتج."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <form
          onSubmit={onAdd}
          className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-1"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
              <Coins className="h-5 w-5" />
            </span>
            <div>
              <div className="font-semibold">إضافة عملة جديدة</div>
              <div className="text-xs text-muted-foreground">ستظهر للتجار مباشرة</div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">رمز العملة</Label>
            <Input
              dir="ltr"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="IQD"
              className="h-11 font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">اسم العملة</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="دينار عراقي"
              className="h-11"
              maxLength={40}
            />
          </div>
          <Button type="submit" className="w-full gap-2">
            <Plus className="h-4 w-4" />
            إضافة العملة
          </Button>
        </form>

        <div className="space-y-3 lg:col-span-2">
          {currencies.map((c) => (
            <div
              key={c.code}
              className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft"
            >
              <div className="flex items-center gap-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-secondary font-mono text-sm font-semibold">
                  {c.code}
                </span>
                <div>
                  <div className="font-medium">{c.label}</div>
                  <div className="mt-0.5">
                    {c.active ? (
                      <Badge
                        variant="outline"
                        className="border-success/30 bg-success/15 text-success"
                      >
                        ظاهرة للتجار
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-muted-foreground/30 bg-muted text-muted-foreground"
                      >
                        مخفية
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={c.active}
                  onCheckedChange={(v) => updateCurrency(c.code, { active: v })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    removeCurrency(c.code);
                    toast.success("تم الحذف");
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          {currencies.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center text-sm text-muted-foreground">
              لا توجد عملات. أضف أول عملة من النموذج.
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
