import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Car } from "lucide-react";
import { getCarCatalogueConfig, saveCarCatalogueConfig } from "@/lib/admin.functions";
import { readAdminSession } from "@/lib/adminSession";
import { requireAdminClient } from "@/lib/adminGuard";
import { CAR_MAKES, CAR_COLORS, CAR_YEARS, ALL_MODELS } from "@/lib/car-data";

export const Route = createFileRoute("/admin/catalog")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "إدارة الكتالوج — Botly Admin" }] }),
  component: AdminCatalogPage,
});

function AdminCatalogPage() {
  const session = readAdminSession();
  const getConfigFn = useServerFn(getCarCatalogueConfig);
  const saveConfigFn = useServerFn(saveCarCatalogueConfig);

  const [enabledMakes, setEnabledMakes] = useState<Set<string>>(new Set());
  const [modelsByMake, setModelsByMake] = useState<Record<string, Set<string>>>({});
  const [enabledColors, setEnabledColors] = useState<Set<string>>(new Set());
  const [enabledYears, setEnabledYears] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.token) return;
    getConfigFn({ data: { token: session.token } })
      .then((config) => {
        setEnabledMakes(new Set(config.enabledMakes));
        const models: Record<string, Set<string>> = {};
        for (const make of CAR_MAKES) {
          models[make.key] = new Set(config.modelsByMake[make.key] ?? []);
        }
        setModelsByMake(models);
        setEnabledColors(new Set(config.enabledColors));
        setEnabledYears(new Set(config.enabledYears));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!session?.token) return;
    setSaving(true);
    try {
      const config = {
        enabledMakes: Array.from(enabledMakes),
        modelsByMake: Object.fromEntries(
          Object.entries(modelsByMake).map(([k, v]) => [k, Array.from(v)]),
        ),
        enabledColors: Array.from(enabledColors),
        enabledYears: Array.from(enabledYears),
      };
      await saveConfigFn({ data: { token: session.token, config } });
      toast.success("تم حفظ الكتالوج بنجاح ✅");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const toggleMake = (makeKey: string) => {
    const next = new Set(enabledMakes);
    if (next.has(makeKey)) {
      next.delete(makeKey);
    } else {
      next.add(makeKey);
    }
    setEnabledMakes(next);
  };

  const toggleModel = (makeKey: string, model: string) => {
    const models = modelsByMake[makeKey] ?? new Set();
    const next = new Set(models);
    if (next.has(model)) {
      next.delete(model);
    } else {
      next.add(model);
    }
    setModelsByMake({ ...modelsByMake, [makeKey]: next });
  };

  const toggleColor = (color: string) => {
    const next = new Set(enabledColors);
    if (next.has(color)) {
      next.delete(color);
    } else {
      next.add(color);
    }
    setEnabledColors(next);
  };

  const toggleYear = (year: string) => {
    const next = new Set(enabledYears);
    if (next.has(year)) {
      next.delete(year);
    } else {
      next.add(year);
    }
    setEnabledYears(next);
  };

  if (loading) {
    return (
      <AdminLayout title="إدارة الكتالوج" subtitle="جاري التحميل...">
        <div className="text-center text-muted-foreground">جاري تحميل الإعدادات...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="إدارة الكتالوج"
      subtitle="حدد أنواع السيارات والموديلات والألوان وسنوات الصنع التي تظهر للزبائن."
    >
      <div className="space-y-6">
        {/* Makes */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="mb-4 flex items-center gap-2 font-semibold">
            <Car className="h-5 w-5 text-primary" />
            أنواع السيارات
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {CAR_MAKES.map((make) => (
              <div key={make.key} className="flex items-center gap-2">
                <Checkbox
                  id={`make-${make.key}`}
                  checked={enabledMakes.has(make.key)}
                  onCheckedChange={() => toggleMake(make.key)}
                />
                <Label
                  htmlFor={`make-${make.key}`}
                  className="cursor-pointer text-sm font-normal"
                >
                  {make.label}
                </Label>
              </div>
            ))}
          </div>

          {/* Models per make */}
          <div className="mt-6 space-y-4 border-t border-border pt-6">
            <div className="text-sm font-semibold">الموديلات</div>
            {CAR_MAKES.map((make) => (
              <div key={`models-${make.key}`} className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">{make.label}</div>
                <div className="grid grid-cols-2 gap-2 ps-4 sm:grid-cols-3 md:grid-cols-4">
                  {make.models.map((model) => (
                    <div key={model} className="flex items-center gap-2">
                      <Checkbox
                        id={`model-${make.key}-${model}`}
                        checked={(modelsByMake[make.key] ?? new Set()).has(model)}
                        onCheckedChange={() => toggleModel(make.key, model)}
                      />
                      <Label
                        htmlFor={`model-${make.key}-${model}`}
                        className="cursor-pointer text-xs font-normal"
                      >
                        {model}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Colors */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="mb-4 font-semibold">الألوان</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {CAR_COLORS.map((color) => (
              <div key={color} className="flex items-center gap-2">
                <Checkbox
                  id={`color-${color}`}
                  checked={enabledColors.has(color)}
                  onCheckedChange={() => toggleColor(color)}
                />
                <Label htmlFor={`color-${color}`} className="cursor-pointer text-sm font-normal">
                  {color}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Years */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="mb-4 font-semibold">سنوات الصنع</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {CAR_YEARS.map((year) => (
              <div key={year} className="flex items-center gap-2">
                <Checkbox
                  id={`year-${year}`}
                  checked={enabledYears.has(year)}
                  onCheckedChange={() => toggleYear(year)}
                />
                <Label htmlFor={`year-${year}`} className="cursor-pointer text-xs font-normal">
                  {year}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Save button */}
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
