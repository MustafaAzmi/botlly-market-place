import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { requireAdminClient } from "@/lib/adminGuard";
import { iraqiCities } from "@/lib/adminMockData";
import { useAdminSession } from "@/lib/adminSession";
import {
  addDeliveryCompany,
  listDeliveryCompaniesAdmin,
  removeDeliveryCompany,
  setDeliveryCompanyBan,
  type DeliveryCompanyRecord,
} from "@/lib/delivery.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Truck, Ban, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/delivery")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "شركات التوصيل — أدمن Botly" }] }),
  component: AdminDeliveryPage,
});

function AdminDeliveryPage() {
  const { session } = useAdminSession();
  const listFn = useServerFn(listDeliveryCompaniesAdmin);
  const addFn = useServerFn(addDeliveryCompany);
  const banFn = useServerFn(setDeliveryCompanyBan);
  const removeFn = useServerFn(removeDeliveryCompany);

  const [companies, setCompanies] = useState<DeliveryCompanyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", cities: [] as string[] });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Filter companies by name or phone in real-time
  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  useEffect(() => {
    if (!session?.token) return;
    listFn({ data: { token: session.token, page, limit: 20 } })
      .then((result) => {
        setCompanies(result.items);
        setHasMore(result.hasMore);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "تعذر تحميل شركات التوصيل");
      })
      .finally(() => setLoading(false));
  }, [listFn, page, session?.token]);

  const toggleBan = async (company: DeliveryCompanyRecord) => {
    if (!session?.token) return;
    const banned = !company.bannedFromBot;
    // Optimistic update; revert on failure.
    setCompanies(prev => prev.map(c => (c.id === company.id ? { ...c, bannedFromBot: banned } : c)));
    try {
      await banFn({ data: { token: session.token, companyId: company.id, banned } });
      toast.success(banned ? `تم حظر ${company.name} من البوت` : `تم رفع الحظر عن ${company.name}`);
    } catch (error) {
      setCompanies(prev =>
        prev.map(c => (c.id === company.id ? { ...c, bannedFromBot: !banned } : c)),
      );
      toast.error(error instanceof Error ? error.message : "تعذر تحديث الشركة");
    }
  };

  const add = async () => {
    if (!session?.token) return;
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("الاسم والهاتف مطلوبان");
      return;
    }
    setSaving(true);
    try {
      const record = await addFn({
        data: {
          token: session.token,
          name: form.name.trim(),
          phone: form.phone.trim(),
          cities: form.cities,
        },
      });
      setCompanies(prev => [record, ...prev]);
      setForm({ name: "", phone: "", cities: [] });
      setOpen(false);
      toast.success("تمت إضافة شركة التوصيل");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إضافة الشركة");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (company: DeliveryCompanyRecord) => {
    if (!session?.token) return;
    const previous = companies;
    setCompanies(prev => prev.filter(c => c.id !== company.id));
    try {
      await removeFn({ data: { token: session.token, companyId: company.id } });
      toast.success("تم الحذف");
    } catch (error) {
      setCompanies(previous);
      toast.error(error instanceof Error ? error.message : "تعذر الحذف");
    }
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
      {loading ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground shadow-soft">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-3 text-sm">جاري تحميل شركات التوصيل...</p>
        </div>
      ) : companies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          لا توجد شركات توصيل بعد. اضغط "شركة جديدة" لإضافة أول شركة — راح تظهر للتجار بقائمة
          الاختيار في صفحة المتجر.
        </div>
      ) : (
        <>
          {companies.length > 3 && (
            <div className="mb-6">
              <Input
                placeholder="ابحث عن شركة بالاسم أو الرقم..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {filteredCompanies.length} من {companies.length} شركة
              </p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {filteredCompanies.map(c => (
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
              {c.cities.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {c.cities.map(city => (
                    <span key={city} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">{city}</span>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  <Switch checked={!c.bannedFromBot} onCheckedChange={() => toggleBan(c)} />
                  <span className="text-xs text-muted-foreground">ظهور على البوت</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => remove(c)} className="gap-1 text-destructive hover:text-destructive">
                  <Trash2 className="h-3 w-3" /> حذف
                </Button>
              </div>
            </div>
          ))}
          </div>
          {filteredCompanies.length === 0 && search && (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
              لم يتم العثور على شركات توصيل تطابق البحث "{search}".
            </div>
          )}
        </>
      )}
      <div className="mt-5 flex items-center justify-center gap-3">
        <Button type="button" variant="outline" disabled={loading || page <= 1} onClick={() => { setLoading(true); setPage((value) => value - 1); }}>
          السابق
        </Button>
        <span className="text-sm text-muted-foreground">{page}</span>
        <Button type="button" variant="outline" disabled={loading || !hasMore} onClick={() => { setLoading(true); setPage((value) => value + 1); }}>
          التالي
        </Button>
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
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>إلغاء</Button>
            <Button onClick={add} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
