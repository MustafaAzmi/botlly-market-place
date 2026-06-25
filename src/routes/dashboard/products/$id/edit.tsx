import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Camera, ImagePlus, Images, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_YEARS, type CarMake } from "@/lib/car-data";
import { useCurrencies } from "@/lib/currenciesStore";
import {
  getMerchantProduct,
  updateMerchantProduct,
  getEnabledCarCatalogueForMerchant,
  getMerchantPlatformCommission,
} from "@/lib/merchant.functions";
import { readMerchantSession } from "@/lib/merchantSession";

export const Route = createFileRoute("/dashboard/products/$id/edit")({
  head: () => ({ meta: [{ title: "Edit product - Botly" }] }),
  component: EditProductPage,
});

const MAX_IMAGES = 6;

function EditProductPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const getMerchantProductFn = useServerFn(getMerchantProduct);
  const updateMerchantProductFn = useServerFn(updateMerchantProduct);
  const getCatalogFn = useServerFn(getEnabledCarCatalogueForMerchant);
  const getCommissionFn = useServerFn(getMerchantPlatformCommission);
  const currencies = useCurrencies().filter((c) => c.active);
  const [currency, setCurrency] = useState("");
  // All product photos (saved + newly added). First one is the primary image.
  const [images, setImages] = useState<string[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [carMake, setCarMake] = useState("");
  const [carModel, setCarModel] = useState("");
  const [quantity, setQuantity] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  const [platformCommissionPercent, setPlatformCommissionPercent] = useState(5);
  const [carYear, setCarYear] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [makes, setMakes] = useState<CarMake[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [years, setYears] = useState<string[]>([]);

  useEffect(() => {
    if (!currency && currencies[0]) setCurrency(currencies[0].code);
  }, [currencies, currency]);

  useEffect(() => {
    const merchantSession = readMerchantSession();
    if (!merchantSession?.token) return;
    getCatalogFn({ data: { token: merchantSession.token } })
      .then((catalog) => {
        setMakes(catalog.makes);
        setColors(catalog.colors);
        setYears(catalog.years);
      })
      .catch(() => {});
    getCommissionFn({ data: { token: merchantSession.token } })
      .then((settings) => setPlatformCommissionPercent(settings.platformCommissionPercent))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getCatalogFn]);

  const selectedMake = makes.find((m) => m.label === carMake || m.key === carMake);
  const updateCurrentPrice = (value: string) => {
    setCurrentPrice(value);
    const price = Number(value);
    if (Number.isFinite(price) && value.trim()) {
      setFinalPrice(String(Number((price + (price * platformCommissionPercent) / 100).toFixed(2))));
    } else {
      setFinalPrice("");
    }
  };

  useEffect(() => {
    const merchantSession = readMerchantSession();
    if (!merchantSession?.token) {
      navigate({ to: "/auth" });
      return;
    }

    getMerchantProductFn({ data: { token: merchantSession.token, productId: id } })
      .then((product) => {
        setTitle(product.title);
        setDescription(product.description);
        setImages(product.imageUrls.length > 0 ? product.imageUrls : product.imageUrl ? [product.imageUrl] : []);
        setCurrentPrice(String(product.currentPrice));
        setFinalPrice(product.discountPrice ? String(product.discountPrice) : "");
        setCurrency(product.currency);
        setSize(product.size || "");
        setColor(product.color || "");
        setCarMake(product.carMake || "");
        setCarModel(product.carModel || "");
        setCarYear(product.carYear || "");
        setQuantity(product.quantity ? String(product.quantity) : "");
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "تعذر تحميل المنتج");
        navigate({ to: "/dashboard/products" });
      })
      .finally(() => setLoading(false));
  }, [getMerchantProductFn, id, navigate]);

  const compressImageFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("تعذر قراءة الصورة"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("تعذر فتح الصورة"));
        img.onload = () => {
          const maxDim = 1000;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("تعذر معالجة الصورة"));
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    if (images.length + files.length > MAX_IMAGES) {
      toast.error(`الحد الأقصى ${MAX_IMAGES} صور للمنتج`);
      return;
    }

    for (const file of files) {
      if (file.size > 8 * 1024 * 1024) {
        toast.error("حجم الصورة يجب أن لا يزيد على 8MB");
        continue;
      }
      if (!file.type.startsWith("image/")) {
        toast.error("اختر صورة فقط");
        continue;
      }
      try {
        const dataUrl = await compressImageFile(file);
        setImages((prev) => (prev.length < MAX_IMAGES ? [...prev, dataUrl] : prev));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "تعذر معالجة الصورة");
      }
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const merchantSession = readMerchantSession();
    if (!merchantSession?.token) {
      navigate({ to: "/auth" });
      return;
    }

    if (images.length === 0) {
      toast.error("أضف صورة واحدة على الأقل للمنتج");
      return;
    }

    const price = Number(currentPrice);
    const customerPrice = finalPrice.trim() ? Number(finalPrice) : undefined;
    const availableQuantity = quantity.trim() ? Number(quantity) : undefined;
    if (!title.trim() || !description.trim() || !Number.isFinite(price)) {
      toast.error("اسم المنتج والوصف والسعر مطلوبة");
      return;
    }
    if (customerPrice !== undefined && !Number.isFinite(customerPrice)) {
      toast.error("السعر النهائي غير صحيح");
      return;
    }
    if (availableQuantity !== undefined && !Number.isInteger(availableQuantity)) {
      toast.error("الكمية يجب أن تكون رقم صحيح");
      return;
    }

    setSaving(true);
    try {
      await updateMerchantProductFn({
        data: {
          token: merchantSession.token,
          productId: id,
          title: title.trim(),
          description: description.trim(),
          imageUrl: images[0],
          imageUrls: images,
          currentPrice: price,
          discountPrice: customerPrice,
          currency,
          size: size.trim(),
          color: color.trim(),
          quantity: availableQuantity,
          carMake: carMake.trim(),
          carModel: carModel.trim(),
        },
      });
      toast.success("تم تحديث المنتج");
      navigate({ to: "/dashboard/products" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحديث المنتج");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="تحميل..." subtitle="">
        <div className="rounded-lg border border-border bg-card p-5 text-center text-muted-foreground">
          جاري تحميل المنتج...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="تعديل المنتج"
      subtitle="عدّل اسم القطعة والسعر والوصف والصور والسيارة المناسبة."
    >
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link to="/dashboard/products">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            المنتجات
          </Link>
        </Button>
      </div>

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-5 shadow-soft">
            <Label className="text-sm font-medium">
              صور المنتج ({images.length}/{MAX_IMAGES})
            </Label>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageFileChange}
              className="hidden"
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageFileChange}
              className="hidden"
            />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-12 gap-2"
                disabled={images.length >= MAX_IMAGES}
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-5 w-5" />
                التقط بالكاميرا
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 gap-2"
                disabled={images.length >= MAX_IMAGES}
                onClick={() => galleryInputRef.current?.click()}
              >
                <Images className="h-5 w-5" />
                اختر من الاستديو
              </Button>
            </div>

            {images.length === 0 ? (
              <div className="mt-4 aspect-[4/3] overflow-hidden rounded-lg border border-border bg-secondary">
                <div className="flex h-full items-center justify-center text-center text-muted-foreground">
                  <span>
                    <ImagePlus className="mx-auto h-8 w-8 text-primary" />
                    <span className="mt-3 block text-sm font-medium">معاينة الصور</span>
                    <span className="mt-1 block text-xs">
                      التقط صورة أو اختر من الاستديو — حتى {MAX_IMAGES} صور
                    </span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {images.map((img, index) => (
                  <div
                    key={index}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary"
                  >
                    <img src={img} alt={`صورة ${index + 1}`} className="h-full w-full object-cover" />
                    {index === 0 && (
                      <span className="absolute bottom-1 start-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                        الرئيسية
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-90 transition hover:bg-destructive"
                      aria-label="حذف الصورة"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-soft">
            <Field id="title" label="اسم المنتج">
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: لايت أمامي مرسيدس E-Class"
                className="h-11"
                maxLength={140}
                required
              />
            </Field>

            <Field id="description" label="وصف مختصر">
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="مثال: لايت أمامي أصلي، حالة ممتازة، يناسب موديلات 2016-2020"
                maxLength={280}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="carMake" label="نوع السيارة">
                <Select
                  value={carMake}
                  onValueChange={(value) => {
                    setCarMake(value);
                    setCarModel("");
                  }}
                >
                  <SelectTrigger id="carMake" className="h-11">
                    <SelectValue placeholder="اختر نوع السيارة" />
                  </SelectTrigger>
                  <SelectContent>
                    {makes.map((make) => (
                      <SelectItem key={make.key} value={make.label}>
                        {make.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="carModel" label="الموديل">
                <Select value={carModel} onValueChange={setCarModel} disabled={!selectedMake}>
                  <SelectTrigger id="carModel" className="h-11">
                    <SelectValue placeholder={selectedMake ? "اختر الموديل" : "اختر النوع أولاً"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedMake?.models ?? []).map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="carYear" label="سنة الصنع (اختياري)">
                <Select value={carYear} onValueChange={setCarYear}>
                  <SelectTrigger id="carYear" className="h-11">
                    <SelectValue placeholder={ALL_YEARS} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_YEARS}>{ALL_YEARS}</SelectItem>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="color" label="اللون (اختياري)">
                <Select value={color} onValueChange={setColor}>
                  <SelectTrigger id="color" className="h-11">
                    <SelectValue placeholder="اختر اللون" />
                  </SelectTrigger>
                  <SelectContent>
                    {colors.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="size" label="المقاس / القياس (اختياري)">
                <Input
                  id="size"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder="مثال: 18 إنج"
                  className="h-11"
                />
              </Field>
            </div>

            <Field id="quantity" label="الكمية المتوفرة (اختياري)">
              <Input
                id="quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="مثال: 12"
                className="h-11"
              />
            </Field>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-soft">
            <Field id="currentPrice" label="السعر الحالي">
              <Input
                id="currentPrice"
                value={currentPrice}
                onChange={(e) => updateCurrentPrice(e.target.value)}
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="0"
                className="h-11"
                required
              />
            </Field>
            <Field id="finalPrice" label="السعر النهائي (يظهر للزبون)">
              <Input
                id="finalPrice"
                value={finalPrice}
                onChange={(e) => setFinalPrice(e.target.value)}
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="0"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                هذا هو السعر الوحيد الذي يشاهده الزبون. إذا تركته فارغاً يظهر السعر الحالي.
              </p>
            </Field>
            <Field id="currency" label="العملة">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency" className="h-11">
                  <SelectValue placeholder="اختر العملة" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} - {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="lg" className="flex-1 shadow-soft" disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
            </Button>
            <Button asChild type="button" size="lg" variant="outline">
              <Link to="/dashboard/products">إلغاء</Link>
            </Button>
          </div>
        </aside>
      </form>
    </DashboardLayout>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}
