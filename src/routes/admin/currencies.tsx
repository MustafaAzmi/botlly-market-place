import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Coins, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type React from "react";
import { toast } from "sonner";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  deletePlatformCurrency,
  savePlatformCurrency,
  useCurrencies,
} from "@/lib/currenciesStore";
import { requireAdminClient } from "@/lib/adminGuard";
import { useAdminSession } from "@/lib/adminSession";

export const Route = createFileRoute("/admin/currencies")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "العملات - Botly Admin" }] }),
  component: AdminCurrenciesPage,
});

function AdminCurrenciesPage() {
  const currencies = useCurrencies();
  const queryClient = useQueryClient();
  const saveCurrencyFn = useServerFn(savePlatformCurrency);
  const deleteCurrencyFn = useServerFn(deletePlatformCurrency);
  const { session } = useAdminSession();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const refreshCurrencies = async () => {
    await queryClient.invalidateQueries({ queryKey: ["platform-currencies"] });
  };

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.token) {
      toast.error("انتهت جلسة الأدمن. سجّل الدخول مرة ثانية.");
      return;
    }

    const currencyCode = code.trim().toUpperCase();
    const currencyLabel = label.trim();
    if (!currencyCode || !currencyLabel) {
      toast.error("يرجى إدخال رمز العملة واسمها");
      return;
    }
    if (currencyCode.length > 8 || !/^[A-Z]+$/.test(currencyCode)) {
      toast.error("رمز العملة يجب أن يكون أحرف لاتينية فقط مثل USD");
      return;
    }
    if (currencies.some((currency) => currency.code.toUpperCase() === currencyCode)) {
      toast.error("هذه العملة موجودة مسبقاً");
      return;
    }

    setSavingCode(currencyCode);
    try {
      await saveCurrencyFn({
        data: {
          token: session.token,
          currency: { code: currencyCode, label: currencyLabel, active: true },
        },
      });
      await refreshCurrencies();
      setCode("");
      setLabel("");
      toast.success("تمت إضافة العملة وستظهر للتجار فوراً");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ العملة");
    } finally {
      setSavingCode(null);
    }
  };

  const onToggle = async (currencyCode: string, active: boolean) => {
    if (!session?.token) {
      toast.error("انتهت جلسة الأدمن. سجّل الدخول مرة ثانية.");
      return;
    }
    const currency = currencies.find((item) => item.code === currencyCode);
    if (!currency) return;

    setSavingCode(currencyCode);
    try {
      await saveCurrencyFn({
        data: {
          token: session.token,
          currency: { ...currency, active },
        },
      });
      await refreshCurrencies();
      toast.success(active ? "تم إظهار العملة للتجار" : "تم إخفاء العملة عن التجار");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحديث العملة");
    } finally {
      setSavingCode(null);
    }
  };

  const onRemove = async (currencyCode: string) => {
    if (!session?.token) {
      toast.error("انتهت جلسة الأدمن. سجّل الدخول مرة ثانية.");
      return;
    }

    setSavingCode(currencyCode);
    try {
      await deleteCurrencyFn({ data: { token: session.token, code: currencyCode } });
      await refreshCurrencies();
      toast.success("تم حذف العملة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حذف العملة");
    } finally {
      setSavingCode(null);
    }
  };

  return (
    <AdminLayout
      title="إدارة العملات"
      subtitle="العملات التي تضيفها هنا تحفظ في قاعدة البيانات وتظهر للتجار عند إضافة أو تعديل منتج."
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
              maxLength={8}
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
              maxLength={60}
            />
          </div>
          <Button type="submit" className="w-full gap-2" disabled={savingCode !== null}>
            <Plus className="h-4 w-4" />
            إضافة العملة
          </Button>
        </form>

        <div className="space-y-3 lg:col-span-2">
          {currencies.map((currency) => (
            <div
              key={currency.code}
              className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft"
            >
              <div className="flex items-center gap-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-secondary font-mono text-sm font-semibold">
                  {currency.code}
                </span>
                <div>
                  <div className="font-medium">{currency.label}</div>
                  <div className="mt-0.5">
                    {currency.active ? (
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
                  checked={currency.active}
                  disabled={savingCode === currency.code}
                  onCheckedChange={(value) => onToggle(currency.code, value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={savingCode === currency.code}
                  onClick={() => onRemove(currency.code)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          {currencies.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center text-sm text-muted-foreground">
              لا توجد عملات. أضف أول عملة من النموذج.
            </div>
          ) : null}
        </div>
      </div>
    </AdminLayout>
  );
}
