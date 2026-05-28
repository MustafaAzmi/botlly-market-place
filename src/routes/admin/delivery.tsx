import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { requireAdminClient } from "@/lib/adminGuard";
import { deliveryCompanies, iraqiCities, type DeliveryCompany } from "@/lib/adminMockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Truck, Ban, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/delivery")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "شركات التوصيل — أدمن Botly" }] }),
  component: AdminDeliveryPage,
});

function AdminDeliveryPage() {
  const [companies, setCompanies] = useState<DeliveryCompany[]>(deliveryCompanies);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", cities: [] as string[] });

  const toggleBan = (id: string) => {
    setCompanies(prev => prev.map(c => {
      if (c.id !== id) return c;
      const next = { ...c, bannedFromBot: !c.bannedFromBot };
      toast.success(next.bannedFromBot ? `تم حظر ${c.name} من البوت` : `تم رفع الحظر عن ${c.name}`);
      // TODO(supabase): update delivery_companies set banned_from_bot = ...
      return next;
    }));
  };

  const add = () => {
    if (!form.name.trim() || !form.phone.trim()) return toast.error("الاسم والهاتف مطلوبان");
    setCompanies(prev => [...prev, {
      id: `d${Date.now()}`, name: form.name, phone: form.phone,
      cities: form.cities.length ? form.cities : [iraqiCities[0]],
      bannedFromBot: false, activeMerchants: 0,
    }]);
    setForm({ name: "", phone: "", cities: [] });
    setOpen(false);
    toast.success("تمت إضافة شركة التوصيل");
  };

  const remove = (id: string) => {
    setCompanies(prev => prev.filter(c => c.id !== id));
    toast.success("تم الحذف");
  };

  const toggleCity = (city: string) => {
    setForm(f => ({
      ...f,
      cities: f.cities.includes(city) ? f.cities.filter(c => c !== city) : [...f.cities, city],
    }));
  };

  return (
    <AdminLayout
      title="شركات التوصيل"
      subtitle="إدارة شركات التوصيل المتاحة على المنصة، وحظر أي شركة من الظهور على البوت."
      actions={
        <Button onClick={() => setOpen(true)} className="gap-2 shadow-soft">
          <Plus className="h-4 w-4" /> شركة جديدة
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {companies.map(c => (
          <div key={c.id} className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{c.name}</h3>
                  <div className="text-xs text-muted-foreground" dir="ltr">{c.phone}</div>
                </div>
              </div>
              {c.bannedFromBot ? (
                <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" /> محظورة</Badge>
              ) : (
                <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20">نشطة</Badge>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {c.cities.map(city => (
                <span key={city} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">{city}</span>
              ))}
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              تخدم <span className="font-semibold text-foreground">{c.activeMerchants}</span> تاجر نشط
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <Switch checked={!c.bannedFromBot} onCheckedChange={() => toggleBan(c.id)} />
                <span className="text-xs text-muted-foreground">ظهور على البوت</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(c.id)} className="gap-1 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" /> حذف
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إضافة شركة توصيل</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم الشركة</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>رقم الواتساب</Label>
              <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+9647XXXXXXXXX" />
            </div>
            <div className="space-y-2">
              <Label>المدن المخدومة</Label>
              <div className="flex flex-wrap gap-2">
                {iraqiCities.map(city => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => toggleCity(city)}
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      form.cities.includes(city)
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={add}>إضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
