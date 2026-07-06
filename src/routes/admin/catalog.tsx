import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calendar, Car, Palette, Plus, Save, Trash2 } from "lucide-react";
import { getCarCatalogueConfig, saveCarCatalogueConfig } from "@/lib/admin.functions";
import { useAdminSession } from "@/lib/adminSession";
import { requireAdminClient } from "@/lib/adminGuard";
import type { CatalogueConfig, CatalogueItem, CatalogueMakeConfig } from "@/lib/car-data";

export const Route = createFileRoute("/admin/catalog")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "إدارة الكتالوج — Botly Admin" }] }),
  component: AdminCatalogPage,
});

// Same filter flow as the merchant/customer side: pick a make → its models
// open → check the ones to show. Everything (makes, models, years, colors)
// is editable: the admin can add new entries or delete existing ones.
function AdminCatalogPage() {
  const { session } = useAdminSession();
  const getConfigFn = useServerFn(getCarCatalogueConfig);
  const saveConfigFn = useServerFn(saveCarCatalogueConfig);

  const [config, setConfig] = useState<CatalogueConfig | null>(null);
  const [selectedMakeKey, setSelectedMakeKey] = useState("");
  const [newMake, setNewMake] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newYear, setNewYear] = useState("");
  const [newColor, setNewColor] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.token) return;
    getConfigFn({ data: { token: session.token } })
      .then(setConfig)
      .catch(() => toast.error("تعذر تحميل الكتالوج"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!config) {
    return (
      <AdminLayout title="إدارة الكتالوج" subtitle="جاري التحميل...">
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground shadow-soft">
          جاري تحميل الكتالوج...
        </div>
      </AdminLayout>
    );
  }

  const selectedMake = config.makes.find((m) => m.key === selectedMakeKey);

  const updateMake = (key: string, change: (m: CatalogueMakeConfig) => CatalogueMakeConfig) => {
    setConfig({ ...config, makes: config.makes.map((m) => (m.key === key ? change(m) : m)) });
  };

  // --- Makes -------------------------------------------------------------

  const addMake = () => {
    const label = newMake.trim();
    if (!label) return;
    if (config.makes.some((m) => m.label === label)) {
      toast.error("هذا النوع موجود مسبقاً");
      return;
    }
    const key = crypto.randomUUID();
    setConfig({
      ...config,
      makes: [...config.makes, { key, label, enabled: true, models: [] }],
    });
    setSelectedMakeKey(key);
    setNewMake("");
  };

  const deleteMake = (key: string) => {
    setConfig({ ...config, makes: config.makes.filter((m) => m.key !== key) });
    if (selectedMakeKey === key) setSelectedMakeKey("");
  };

  // --- Models of the selected make ----------------------------------------

  const toggleModel = (name: string) => {
    if (!selectedMake) return;
    const turningOn = !selectedMake.models.find((x) => x.name === name)?.enabled;
    updateMake(selectedMake.key, (m) => ({
      ...m,
      // Checking a model implies the make should be visible too.
      enabled: m.enabled || turningOn,
      models: m.models.map((x) => (x.name === name ? { ...x, enabled: !x.enabled } : x)),
    }));
  };

  const setAllModels = (enabled: boolean) => {
    if (!selectedMake) return;
    updateMake(selectedMake.key, (m) => ({
      ...m,
      enabled: m.enabled || enabled,
      models: m.models.map((x) => ({ ...x, enabled })),
    }));
  };

  const deleteModel = (name: string) => {
    if (!selectedMake) return;
    updateMake(selectedMake.key, (m) => ({
      ...m,
      models: m.models.filter((x) => x.name !== name),
    }));
  };

  const addModel = () => {
    const name = newModel.trim();
    if (!name || !selectedMake) return;
    if (selectedMake.models.some((x) => x.name === name)) {
      toast.error("هذا الموديل موجود مسبقاً");
      return;
    }
    updateMake(selectedMake.key, (m) => ({
      ...m,
      enabled: true,
      models: [...m.models, { name, enabled: true }],
    }));
    setNewModel("");
  };

  // --- Years / colors ------------------------------------------------------

  const addYear = () => {
    const year = newYear.trim();
    if (!/^\d{4}$/.test(year)) {
      toast.error("اكتب سنة من 4 أرقام، مثال: 2027");
      return;
    }
    if (config.years.some((y) => y.name === year)) {
      toast.error("هذه السنة موجودة مسبقاً");
      return;
    }
    const years = [...config.years, { name: year, enabled: true }].sort(
      (a, b) => Number(b.name) - Number(a.name),
    );
    setConfig({ ...config, years });
    setNewYear("");
  };

  const addColor = () => {
    const color = newColor.trim();
    if (!color) return;
    if (config.colors.some((c) => c.name === color)) {
      toast.error("هذا اللون موجود مسبقاً");
      return;
    }
    setConfig({ ...config, colors: [...config.colors, { name: color, enabled: true }] });
    setNewColor("");
  };

  // --- Save ----------------------------------------------------------------

  const handleSave = async () => {
    if (!session?.token) return;
    setSaving(true);
    try {
      await saveConfigFn({ data: { token: session.token, config } });
      toast.success("تم حفظ الكتالوج ✅ — التغييرات صارت ظاهرة للزبائن والتجار");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const enabledModelCount = selectedMake?.models.filter((m) => m.enabled).length ?? 0;

  return (
    <AdminLayout
      title="إدارة الكتالوج"
      subtitle="كل اللي تأشر عليه هنا يظهر للزبون والتاجر — وتقدر تضيف أنواع وموديلات وسنوات وألوان جديدة بأي وقت."
    >
      <div className="space-y-6">
        {/* Makes + their models, same flow as the merchant/customer filter */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-2 font-semibold">
            <Car className="h-5 w-5 text-primary" />
            أنواع السيارات والموديلات
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            اختر نوع السيارة لتنفتح موديلاته، أشّر على الموديلات التي تريد إظهارها. النوع غير
            المؤشّر ما يظهر بالقوائم نهائياً.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>نوع السيارة</Label>
              <Select value={selectedMakeKey} onValueChange={setSelectedMakeKey}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="اختر النوع" />
                </SelectTrigger>
                <SelectContent>
                  {config.makes.map((make) => (
                    <SelectItem key={make.key} value={make.key}>
                      {make.enabled ? `${make.label} ✓` : make.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>إضافة نوع جديد</Label>
              <div className="flex gap-2">
                <Input
                  value={newMake}
                  onChange={(e) => setNewMake(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMake())}
                  placeholder="مثال: تيسلا"
                  className="h-11"
                />
                <Button type="button" variant="outline" className="h-11 shrink-0 gap-1" onClick={addMake}>
                  <Plus className="h-4 w-4" />
                  إضافة
                </Button>
              </div>
            </div>
          </div>

          {selectedMake && (
            <div className="mt-5 rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={selectedMake.enabled}
                    onCheckedChange={() =>
                      updateMake(selectedMake.key, (m) => ({ ...m, enabled: !m.enabled }))
                    }
                  />
                  إظهار «{selectedMake.label}» للزبائن والتجار
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-destructive hover:text-destructive"
                  onClick={() => deleteMake(selectedMake.key)}
                >
                  <Trash2 className="h-4 w-4" />
                  حذف النوع نهائياً
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  الموديلات ({enabledModelCount}/{selectedMake.models.length} ظاهر)
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAllModels(true)}>
                    تحديد الكل
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAllModels(false)}>
                    إلغاء الكل
                  </Button>
                </div>
              </div>

              {selectedMake.models.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  لا توجد موديلات لهذا النوع بعد — أضف أول موديل من الحقل أدناه.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {selectedMake.models.map((model) => (
                    <div
                      key={model.name}
                      className="flex items-center justify-between gap-1 rounded-lg border border-border bg-card px-2.5 py-2"
                    >
                      <label className="flex min-w-0 cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={model.enabled}
                          onCheckedChange={() => toggleModel(model.name)}
                        />
                        <span className="truncate text-xs">{model.name}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => deleteModel(model.name)}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={`حذف ${model.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex max-w-sm gap-2">
                <Input
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addModel())}
                  placeholder="موديل جديد، مثال: Model 3"
                  className="h-10"
                />
                <Button type="button" variant="outline" className="h-10 shrink-0 gap-1" onClick={addModel}>
                  <Plus className="h-4 w-4" />
                  إضافة
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Years */}
        <ItemsCard
          icon={<Calendar className="h-5 w-5 text-primary" />}
          title="سنوات الصنع"
          items={config.years}
          onToggle={(name) =>
            setConfig({
              ...config,
              years: config.years.map((y) => (y.name === name ? { ...y, enabled: !y.enabled } : y)),
            })
          }
          onDelete={(name) =>
            setConfig({ ...config, years: config.years.filter((y) => y.name !== name) })
          }
          onSetAll={(enabled) =>
            setConfig({ ...config, years: config.years.map((y) => ({ ...y, enabled })) })
          }
          addValue={newYear}
          onAddChange={setNewYear}
          onAdd={addYear}
          addPlaceholder="سنة جديدة، مثال: 2027"
          compact
        />

        {/* Colors */}
        <ItemsCard
          icon={<Palette className="h-5 w-5 text-primary" />}
          title="الألوان"
          items={config.colors}
          onToggle={(name) =>
            setConfig({
              ...config,
              colors: config.colors.map((c) =>
                c.name === name ? { ...c, enabled: !c.enabled } : c,
              ),
            })
          }
          onDelete={(name) =>
            setConfig({ ...config, colors: config.colors.filter((c) => c.name !== name) })
          }
          onSetAll={(enabled) =>
            setConfig({ ...config, colors: config.colors.map((c) => ({ ...c, enabled })) })
          }
          addValue={newColor}
          onAddChange={setNewColor}
          onAdd={addColor}
          addPlaceholder="لون جديد، مثال: كحلي"
        />

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="lg" className="gap-2 shadow-soft">
            <Save className="h-4 w-4" />
            {saving ? "جاري الحفظ..." : "حفظ الكتالوج"}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}

// Checkbox grid for flat lists (years, colors): toggle, delete, add new.
function ItemsCard({
  icon,
  title,
  items,
  onToggle,
  onDelete,
  onSetAll,
  addValue,
  onAddChange,
  onAdd,
  addPlaceholder,
  compact,
}: {
  icon: React.ReactNode;
  title: string;
  items: CatalogueItem[];
  onToggle: (name: string) => void;
  onDelete: (name: string) => void;
  onSetAll: (enabled: boolean) => void;
  addValue: string;
  onAddChange: (value: string) => void;
  onAdd: () => void;
  addPlaceholder: string;
  compact?: boolean;
}) {
  const enabledCount = items.filter((i) => i.enabled).length;
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          {icon}
          {title}
          <span className="text-xs font-normal text-muted-foreground">
            ({enabledCount}/{items.length} ظاهر)
          </span>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onSetAll(true)}>
            تحديد الكل
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onSetAll(false)}>
            إلغاء الكل
          </Button>
        </div>
      </div>

      <div
        className={`mt-4 grid gap-2 ${
          compact
            ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6"
            : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
        }`}
      >
        {items.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-1 rounded-lg border border-border bg-card px-2.5 py-2"
          >
            <label className="flex min-w-0 cursor-pointer items-center gap-2">
              <Checkbox checked={item.enabled} onCheckedChange={() => onToggle(item.name)} />
              <span className="truncate text-xs">{item.name}</span>
            </label>
            <button
              type="button"
              onClick={() => onDelete(item.name)}
              className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
              aria-label={`حذف ${item.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex max-w-sm gap-2">
        <Input
          value={addValue}
          onChange={(e) => onAddChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onAdd())}
          placeholder={addPlaceholder}
          className="h-10"
        />
        <Button type="button" variant="outline" className="h-10 shrink-0 gap-1" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          إضافة
        </Button>
      </div>
    </div>
  );
}
