import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { requireAdminClient } from "@/lib/adminGuard";
import { paymentPackages, iraqiCities, type PaymentPackage } from "@/lib/adminMockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/packages")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "باقات الدفع — أدمن Botly" }] }),
  component: AdminPackagesPage,
});

function AdminPackagesPage() {
  const [pkgs, setPkgs] = useState<PaymentPackage[]>(paymentPackages);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentPackage | null>(null);

  const blank: Omit<PaymentPackage, "id"> = {
    name: "", city: iraqiCities[0], priceMonthly: 25000, currency: "IQD", features: [], active: true,
  };
  const [form, setForm] = useState<Omit<PaymentPackage, "id">>(blank);
  const [featuresText, setFeaturesText] = useState("");

  const openCreate = () => {
    setEditing(null); setForm(blank); setFeaturesText("");
    setOpen(true);
  };
  const openEdit = (p: PaymentPackage) => {
    setEditing(p);
    setForm({ name: p.name, city: p.city, priceMonthly: p.priceMonthly, currency: p.currency, features: p.features, active: p.active });
    setFeaturesText(p.features.join("\n"));
    setOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) return toast.error("الاسم مطلوب");
    const features = featuresText.split("\n").map(s => s.trim()).filter(Boolean);
    // TODO(supabase): upsert into payment_packages.
    if (editing) {
      setPkgs(prev => prev.map(p => p.id === editing.id ? { ...editing, ...form, features } : p));
      toast.success("تم تحديث الباقة");
    } else {
      setPkgs(prev => [...prev, { id: `pk${Date.now()}`, ...form, features }]);
      toast.success("تمت إضافة الباقة");
    }
    setOpen(false);
  };

  const remove = (id: string) => {
    setPkgs(prev => prev.filter(p => p.id !== id));
    toast.success("تم حذف الباقة");
  };

  const toggleActive = (id: string) => {
    setPkgs(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p));
  };

  return (
    <AdminLayout
      title="باقات الدفع"
      subtitle="أضف باقات اشتراك مخصصة حسب المدينة والسعر، وفعّل/عطّل أي باقة."
      actions={
        <Button onClick={openCreate} className="gap-2 shadow-soft">
          <Plus className="h-4 w-4" /> باقة جديدة
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pkgs.map(p => (
          <div key={p.id} className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-muted-foreground">{p.city}</div>
                <h3 className="mt-1 text-lg font-semibold">{p.name}</h3>
              </div>
              <Badge variant={p.active ? "default" : "secondary"}>
                {p.active ? "مفعّلة" : "معطّلة"}
              </Badge>
            </div>
            <div className="mt-4 text-3xl font-bold">
              {p.priceMonthly.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{p.currency}/شهر</span>
            </div>
            <ul className="mt-4 space-y-1.5 text-sm">
              {p.features.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {f}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <Switch checked={p.active} onCheckedChange={() => toggleActive(p.id)} />
                <span className="text-xs text-muted-foreground">تفعيل</span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="gap-1">
                  <Pencil className="h-3 w-3" /> تعديل
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(p.id)} className="gap-1 text-destructive hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><span /></DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل الباقة" : "إضافة باقة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم الباقة</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: الباقة الذهبية - بغداد" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>المدينة</Label>
                <select
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {iraqiCities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>العملة</Label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="IQD">IQD</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>السعر الشهري</Label>
              <Input type="number" value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>المميزات (سطر لكل ميزة)</Label>
              <textarea
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-background p-3 text-sm"
                placeholder={"حتى 100 منتج\nبوت واتساب\nدعم أولوية"}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label className="cursor-pointer">تفعيل فوراً</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save}>{editing ? "حفظ التعديلات" : "إضافة"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
