import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Download, MoreVertical, PackageSearch, ReceiptText, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import {
  listMerchants,
  setMerchantPhoneVisibility,
  setMerchantSubscription,
  setMerchantSuspended,
  setMerchantVisibility,
  deleteMerchantStore,
  deleteMerchantProductForAdmin,
  getMerchantSalesExport,
  listMerchantProductsForAdmin,
  migrateMerchantFiltersAndDeleteProductImages,
  resetMerchantSalesReport,
  type AdminMerchantProductView,
  type MerchantAdminView,
} from "@/lib/admin.functions";
import { readAdminSession } from "@/lib/adminSession";
import { requireAdminClient } from "@/lib/adminGuard";
import { IRAQI_GOVERNORATES } from "@/lib/governorates";

const ALL_GOVERNORATES = "all";
const UNSPECIFIED_GOVERNORATE = "غير محدد";

function formatMerchantCreatedAt(value: string) {
  if (!value) return "غير محدد";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "غير محدد";
  return date.toLocaleDateString("ar-IQ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export const Route = createFileRoute("/admin/stores")({
  beforeLoad: () => requireAdminClient(),
  component: AdminStoresPage,
});

function AdminStoresPage() {
  const listMerchantsFn = useServerFn(listMerchants);
  const setVisibilityFn = useServerFn(setMerchantVisibility);
  const setPhoneVisibilityFn = useServerFn(setMerchantPhoneVisibility);
  const setSuspendedFn = useServerFn(setMerchantSuspended);
  const setSubscriptionFn = useServerFn(setMerchantSubscription);
  const deleteStoreFn = useServerFn(deleteMerchantStore);
  const deleteProductFn = useServerFn(deleteMerchantProductForAdmin);
  const listMerchantProductsFn = useServerFn(listMerchantProductsForAdmin);
  const resetSalesReportFn = useServerFn(resetMerchantSalesReport);
  const getSalesExportFn = useServerFn(getMerchantSalesExport);
  const migrateFiltersFn = useServerFn(migrateMerchantFiltersAndDeleteProductImages);

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [productPage, setProductPage] = useState(1);
  const [governorateFilter, setGovernorateFilter] = useState(ALL_GOVERNORATES);
  const session = readAdminSession();
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteProductConfirm, setDeleteProductConfirm] = useState<{
    merchantId: string;
    productId: string;
    title: string;
  } | null>(null);
  const [salesDetails, setSalesDetails] = useState<MerchantAdminView | null>(null);
  const [selectedMerchantId, setSelectedMerchantId] = useState("");
  const [migrationBusy, setMigrationBusy] = useState(false);

  const {
    data: merchantResult,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-merchants", page],
    queryFn: async () => {
      if (!session?.token) return null;
      return await listMerchantsFn({ data: { token: session.token, page, limit: 20 } });
    },
    enabled: !!session?.token,
    retry: 1,
  });
  const merchants = merchantResult?.items ?? [];

  const selectedMerchant =
    merchants.find((merchant: MerchantAdminView) => merchant.merchantId === selectedMerchantId) ?? null;

  const {
    data: selectedProductResult,
    isFetching: isLoadingProducts,
    refetch: refetchSelectedProducts,
  } = useQuery({
    queryKey: ["admin-merchant-products", selectedMerchantId, productPage],
    queryFn: async () => {
      if (!session?.token || !selectedMerchantId) return null;
      return await listMerchantProductsFn({
        data: {
          token: session.token,
          merchantId: selectedMerchantId,
          page: productPage,
          limit: 20,
        },
      });
    },
    enabled: !!session?.token && !!selectedMerchantId,
    retry: 1,
  });
  const selectedProducts = selectedProductResult?.items ?? [];

  const run = async (fn: () => Promise<unknown>, successMsg: string) => {
    if (!session?.token) return;
    try {
      await fn();
      toast.success(successMsg);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحديث");
    }
  };

  const filtered = merchants.filter((m: MerchantAdminView) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !q ||
      m.storeName.toLowerCase().includes(q) ||
      m.whatsapp.toLowerCase().includes(q) ||
      (m.email ?? "").toLowerCase().includes(q);
    const matchesGovernorate =
      governorateFilter === ALL_GOVERNORATES ||
      m.governorate === governorateFilter;
    return matchesSearch && matchesGovernorate;
  });

  const downloadMerchantSalesExcel = async (merchant: MerchantAdminView) => {
    if (!session?.token) return;
    let report;
    try {
      report = await getSalesExportFn({
        data: { token: session.token, merchantId: merchant.merchantId },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجهيز ملف المبيعات");
      return;
    }
    merchant = {
      ...merchant,
      sales: report.sales,
      salesCount: report.salesCount,
      salesTotals: report.salesTotals,
    };
    const totalProducts = merchant.sales.reduce((sum, sale) => sum + sale.price, 0);
    const totalCommissions = merchant.sales.reduce((sum, sale) => sum + sale.commissionAmount, 0);
    const totalMerchantNet = merchant.sales.reduce((sum, sale) => sum + sale.merchantNet, 0);
    const rows = merchant.sales
      .map(
        (sale) => `
          <tr>
            <td>${excelCell(sale.createdAt)}</td>
            <td>${excelCell(sale.productTitle)}</td>
            <td>${excelCell(sale.price)}</td>
            <td>${excelCell(sale.customerName)}</td>
            <td>${excelCell(sale.customerPhone)}</td>
            <td>${excelCell(sale.commissionPercent + "%")}</td>
            <td>${excelCell(sale.commissionAmount)}</td>
            <td>${excelCell(sale.merchantNet)}</td>
            <td>${excelCell(sale.operationStatus)}</td>
          </tr>`,
      )
      .join("");
    const totalRows = merchant.salesTotals
      .map(
        (total) => `
          <tr>
            <td>${excelCell(total.currency)}</td>
            <td>${excelCell(total.amount)}</td>
          </tr>`,
      )
      .join("");
    const html = `
      <html dir="rtl">
        <head><meta charset="utf-8" /></head>
        <body>
          <h2>تقرير مبيعات التاجر: ${excelCell(merchant.storeName)}</h2>
          <p>عدد المبيعات الكلي: ${excelCell(merchant.salesCount)}</p>
          <p>مجموع قيمة المنتجات: ${excelCell(totalProducts)}</p>
          <p>مجموع عمولات الوسيط: ${excelCell(totalCommissions)}</p>
          <p>مجموع أرباح التاجر بعد خصم العمولة: ${excelCell(totalMerchantNet)}</p>
          <h2>تقرير مبيعات التاجر: ${excelCell(merchant.storeName)}</h2>
          <p>عدد المبيعات الكلي: ${excelCell(merchant.salesCount)}</p>
          <h3>الإجمالي حسب العملة</h3>
          <table border="1">
            <thead><tr><th>العملة</th><th>الإجمالي</th></tr></thead>
            <tbody>${totalRows}</tbody>
          </table>
          <h3>تفاصيل المبيعات</h3>
          <table border="1">
            <thead>
              <tr>
                <th>رقم الطلب</th>
                <th>المنتج</th>
                <th>السعر</th>
                <th>العملة</th>
                <th>اسم الزبون</th>
                <th>رقم الزبون</th>
                <th>التاريخ</th>
                <th>صافي التاجر</th>
                <th>حالة العملية</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `botly-merchant-sales-${merchant.merchantId}-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const resetMerchantSales = async (merchant: MerchantAdminView) => {
    if (!session?.token) return;
    const confirmed = window.confirm(
      `هل تريد تصفير سجل مبيعات ${merchant.storeName}؟ سيبدأ التقرير من الصفر بعد هذه النقطة.`,
    );
    if (!confirmed) return;
    try {
      await resetSalesReportFn({ data: { token: session.token, merchantId: merchant.merchantId } });
      toast.success("تم تصفير سجل المبيعات لهذا التاجر.");
      setSalesDetails(null);
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تصفير سجل المبيعات");
    }
  };

  const migrateLegacyMerchants = async () => {
    if (!session?.token || migrationBusy) return;
    const confirmed = window.confirm(
      "سيتم إنشاء فلاتر التجار القدامى من منتجاتهم وحذف جميع صور المنتجات المخزنة من قاعدة البيانات. أسماء المنتجات وأسعارها وباقي بياناتها لن تُحذف. هل تريد المتابعة؟",
    );
    if (!confirmed) return;
    setMigrationBusy(true);
    try {
      const report = await migrateFiltersFn({ data: { token: session.token } });
      const removedMb = (report.removedImageBytes / 1024 / 1024).toFixed(2);
      toast.success(
        `تم تحديث ${report.merchantsUpdated} تاجر وتنظيف ${report.productEventsCleaned} سجل صور (${removedMb} MB).`,
      );
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر ترحيل بيانات التجار");
    } finally {
      setMigrationBusy(false);
    }
  };

  return (
    <AdminLayout title="المتاجر" subtitle="تحكّم بظهور المتاجر في البحث والاشتراكات">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="ابحث باسم المتجر أو الرقم..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
          <Select value={governorateFilter} onValueChange={setGovernorateFilter}>
            <SelectTrigger className="w-full sm:w-56" aria-label="فلترة المتاجر حسب المحافظة">
              <SelectValue placeholder="اختر المحافظة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_GOVERNORATES}>كل المحافظات</SelectItem>
              {IRAQI_GOVERNORATES.map((governorate) => (
                <SelectItem key={governorate} value={governorate}>
                  {governorate}
                </SelectItem>
              ))}
              <SelectItem value={UNSPECIFIED_GOVERNORATE}>غير محدد</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={migrationBusy}
            onClick={migrateLegacyMerchants}
          >
            <RotateCcw className={`me-2 h-4 w-4 ${migrationBusy ? "animate-spin" : ""}`} />
            ترحيل فلاتر التجار وتنظيف الصور
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
              <div className="flex-1">
                <p className="font-medium text-red-900">حدث خطأ</p>
                <p className="text-sm text-red-800">
                  {error instanceof Error ? error.message : "فشل تحميل المتاجر"}
                </p>
                <Button onClick={() => refetch()} size="sm" variant="outline" className="mt-3">
                  إعادة محاولة
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">المتجر</th>
                  <th className="px-4 py-3 text-right font-medium">الواتساب</th>
                  <th className="px-4 py-3 text-right font-medium">المحافظة</th>
                  <th className="px-4 py-3 text-center font-medium">تاريخ الإضافة</th>
                  <th className="px-4 py-3 text-right font-medium">الاشتراك</th>
                  <th className="px-4 py-3 text-center font-medium">المنتجات</th>
                  <th className="px-4 py-3 text-center font-medium">المبيعات</th>
                  <th className="px-4 py-3 text-center font-medium">الظهور</th>
                  <th className="px-4 py-3 text-center font-medium">إظهار الرقم للزبون/الفيتر</th>
                  <th className="px-4 py-3 text-center font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-8 text-center text-muted-foreground">
                      لا توجد متاجر بعد
                    </td>
                  </tr>
                ) : (
                  filtered.map((m: MerchantAdminView) => (
                    <tr
                      key={m.merchantId}
                      className={`border-b hover:bg-muted/40 ${
                        selectedMerchantId === m.merchantId ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">
                        <button
                          type="button"
                          onClick={() => {
                            setProductPage(1);
                            setSelectedMerchantId((current) => (current === m.merchantId ? "" : m.merchantId));
                          }}
                          className="text-right hover:text-primary"
                        >
                          {m.storeName}
                        </button>
                      </td>
                      <td className="px-4 py-3" dir="ltr">
                        {m.whatsapp || "—"}
                      </td>
                      <td className="px-4 py-3">{m.governorate}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-center" dir="ltr">
                        {formatMerchantCreatedAt(m.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <SubscriptionBadge status={m.subscriptionStatus} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setProductPage(1);
                            setSelectedMerchantId((current) => (current === m.merchantId ? "" : m.merchantId));
                          }}
                          className="inline-flex min-w-10 items-center justify-center rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
                          title="عرض منتجات التاجر"
                        >
                          {m.productCount}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSalesDetails(m)}
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={m.salesCount === 0}
                        >
                          <ReceiptText className="h-3.5 w-3.5" />
                          {m.salesCount}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {m.accountStatus === "pending" ? (
                          <Badge className="bg-amber-100 text-amber-800">بانتظار التفعيل</Badge>
                        ) : m.accountStatus === "inactive" ? (
                          <Badge className="bg-gray-200 text-gray-700">غير فعال</Badge>
                        ) : m.visibleInSearch ? (
                          <Badge className="bg-green-100 text-green-800">ظاهر</Badge>
                        ) : m.suspended ? (
                          <Badge className="bg-red-100 text-red-800">موقوف</Badge>
                        ) : (
                          <Badge className="bg-gray-200 text-gray-700">مخفي</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex min-w-36 flex-col items-center gap-1.5">
                          <Switch
                            checked={m.showPhoneToRequesters}
                            aria-label={`إظهار رقم ${m.storeName} للزبون والفيتر`}
                            onCheckedChange={(checked) =>
                              run(
                                () =>
                                  setPhoneVisibilityFn({
                                    data: {
                                      token: session!.token,
                                      merchantId: m.merchantId,
                                      enabled: checked,
                                    },
                                  }),
                                checked
                                  ? "تم تفعيل إظهار رقم التاجر في الإشعار"
                                  : "تم إخفاء رقم التاجر من الإشعار",
                              )
                            }
                          />
                          <span className={m.showPhoneToRequesters ? "text-xs font-medium text-green-700" : "text-xs text-muted-foreground"}>
                            {m.showPhoneToRequesters ? "ظاهر في إشعار الطلب" : "مخفي من الإشعار"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>الظهور في البحث</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() =>
                                run(
                                  () =>
                                    setVisibilityFn({
                                      data: {
                                        token: session!.token,
                                        merchantId: m.merchantId,
                                        enabled: true,
                                      },
                                    }),
                                  "تم تفعيل ظهور المتجر",
                                )
                              }
                            >
                              تفعيل الظهور
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                run(
                                  () =>
                                    setVisibilityFn({
                                      data: {
                                        token: session!.token,
                                        merchantId: m.merchantId,
                                        enabled: false,
                                      },
                                    }),
                                  "تم إخفاء المتجر من البحث",
                                )
                              }
                            >
                              إخفاء من البحث
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>حالة المتجر</DropdownMenuLabel>
                            {m.accountStatus !== "active" ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  run(
                                    () =>
                                      setSuspendedFn({
                                        data: {
                                          token: session!.token,
                                          merchantId: m.merchantId,
                                          suspended: false,
                                        },
                                      }),
                                    "تمت إعادة تفعيل المتجر",
                                  )
                                }
                              >
                                {m.accountStatus === "pending" ? "تفعيل التاجر" : "إعادة تفعيل"}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() =>
                                  run(
                                    () =>
                                      setSuspendedFn({
                                        data: {
                                          token: session!.token,
                                          merchantId: m.merchantId,
                                          suspended: true,
                                        },
                                      }),
                                    "تم تعليق المتجر",
                                  )
                                }
                              >
                                تعليق المتجر
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>الاشتراك والتمييز</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() =>
                                run(
                                  () =>
                                    setSubscriptionFn({
                                      data: {
                                        token: session!.token,
                                        merchantId: m.merchantId,
                                        status: "active",
                                      },
                                    }),
                                  "تم تمييز المتجر في البحث",
                                )
                              }
                            >
                              تمييز مدفوع في البحث
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                run(
                                  () =>
                                    setSubscriptionFn({
                                      data: {
                                        token: session!.token,
                                        merchantId: m.merchantId,
                                        status: "expired",
                                      },
                                    }),
                                  "تم تعليم الاشتراك كمنتهٍ",
                                )
                              }
                            >
                              اشتراك منتهٍ
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>المبيعات والعمولة</DropdownMenuLabel>
                            <DropdownMenuItem
                              disabled={m.salesCount === 0}
                              onClick={() => setSalesDetails(m)}
                            >
                              <ReceiptText className="ml-2 h-4 w-4" />
                              عرض تفاصيل المبيعات
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={m.salesCount === 0}
                              onClick={() => downloadMerchantSalesExcel(m)}
                            >
                              <Download className="ml-2 h-4 w-4" />
                              تنزيل تقرير Excel
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => setDeleteConfirm({ id: m.merchantId, name: m.storeName })}
                            >
                              حذف المتجر من قاعدة البيانات
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {selectedMerchant && (
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <PackageSearch className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">منتجات {selectedMerchant.storeName}</h2>
                </div>
                <p className="text-sm text-muted-foreground">اختر المنتج المراد حذفه من منتجات هذا التاجر.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedMerchantId("")}>
                إغلاق
              </Button>
            </div>

            {isLoadingProducts ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : selectedProducts.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                لا توجد منتجات لهذا التاجر حالياً.
              </div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {selectedProducts.map((product) => {
                  const price = product.discountPrice ?? product.currentPrice;
                  const details = [product.carYear, product.carModel, product.color].filter(Boolean).join(" - ");
                  return (
                    <div key={product.id} className="rounded-lg border p-3">
                      <div className="flex gap-3">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.title}
                            loading="lazy"
                            decoding="async"
                            className="h-20 w-20 rounded-md border object-cover"
                          />
                        ) : (
                          <div className="flex h-20 w-20 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
                            بدون صورة
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-2 font-semibold">{product.title}</h3>
                          {details && <p className="mt-1 text-xs text-muted-foreground">{details}</p>}
                          <p className="mt-2 text-sm font-medium" dir="ltr">
                            {price.toLocaleString()} {product.currency}
                          </p>
                          {product.quantity !== undefined && (
                            <p className="text-xs text-muted-foreground">الكمية: {product.quantity}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() =>
                          setDeleteProductConfirm({
                            merchantId: selectedMerchant.merchantId,
                            productId: product.id,
                            title: product.title,
                          })
                        }
                      >
                        <Trash2 className="ml-2 h-4 w-4" />
                        حذف المنتج
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={productPage <= 1} onClick={() => setProductPage((value) => value - 1)}>
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">{productPage}</span>
              <Button type="button" variant="outline" size="sm" disabled={!selectedProductResult?.hasMore} onClick={() => setProductPage((value) => value + 1)}>
                التالي
              </Button>
            </div>
          </div>
        )}

        {!isLoading && !error && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">عرض {filtered.length} متجر</p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">{page}</span>
              <Button type="button" variant="outline" size="sm" disabled={!merchantResult?.hasMore} onClick={() => setPage((value) => value + 1)}>
                التالي
              </Button>
            </div>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">تأكيد حذف المتجر</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              هل أنت متأكد من حذف "{deleteConfirm.name}"؟ سيتم حذف جميع المنتجات والطلبات المرتبطة به أيضاً. لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1"
              >
                إلغاء
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!session?.token) return;
                  deleteStoreFn({ data: { token: session.token, merchantId: deleteConfirm.id } })
                    .then(() => {
                      toast.success("تم حذف المتجر وجميع بيانته");
                      setDeleteConfirm(null);
                      refetch();
                    })
                    .catch((err) => {
                      toast.error(err instanceof Error ? err.message : "فشل حذف المتجر");
                    });
                }}
                className="flex-1"
              >
                حذف نهائياً
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteProductConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">تأكيد حذف المنتج</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              هل تريد حذف "{deleteProductConfirm.title}" من منتجات هذا التاجر؟
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => setDeleteProductConfirm(null)} className="flex-1">
                إلغاء
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!session?.token) return;
                  deleteProductFn({
                    data: {
                      token: session.token,
                      merchantId: deleteProductConfirm.merchantId,
                      productId: deleteProductConfirm.productId,
                    },
                  })
                    .then(async () => {
                      toast.success("تم حذف المنتج");
                      setDeleteProductConfirm(null);
                      await Promise.all([refetch(), refetchSelectedProducts()]);
                    })
                    .catch((err) => {
                      toast.error(err instanceof Error ? err.message : "فشل حذف المنتج");
                    });
                }}
                className="flex-1"
              >
                حذف المنتج
              </Button>
            </div>
          </div>
        </div>
      )}

      {salesDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-lg border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="text-lg font-semibold">مبيعات {salesDetails.storeName}</h2>
                <p className="text-sm text-muted-foreground">
                  عدد المبيعات: {salesDetails.salesCount}
                  {salesDetails.salesTotals.length > 0
                    ? ` - الإجمالي: ${salesDetails.salesTotals
                        .map((total) => `${total.amount.toLocaleString()} ${total.currency}`)
                        .join(" / ")}`
                    : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadMerchantSalesExcel(salesDetails)}
                >
                  <Download className="ml-2 h-4 w-4" />
                  Excel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => resetMerchantSales(salesDetails)}
                  disabled={salesDetails.salesCount === 0}
                >
                  <RotateCcw className="ml-2 h-4 w-4" />
                  تصفير السجل
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSalesDetails(null)}>
                  إغلاق
                </Button>
              </div>
            </div>
            <div className="max-h-[65vh] overflow-auto p-4">
              {salesDetails.sales.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">لا توجد مبيعات مؤكدة لهذا التاجر.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-right">المنتج</th>
                      <th className="px-3 py-2 text-right">السعر</th>
                      <th className="px-3 py-2 text-right">الزبون</th>
                      <th className="px-3 py-2 text-right">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesDetails.sales.map((sale) => (
                      <tr key={sale.orderId} className="border-b">
                        <td className="px-3 py-2 font-medium">{sale.productTitle}</td>
                        <td className="px-3 py-2" dir="ltr">
                          {sale.price.toLocaleString()} {sale.currency}
                        </td>
                        <td className="px-3 py-2">
                          <div>{sale.customerName || "—"}</div>
                          <div className="text-xs text-muted-foreground" dir="ltr">
                            {sale.customerPhone || "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2" dir="ltr">
                          {sale.createdAt ? new Date(sale.createdAt).toLocaleString("ar-IQ") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function excelCell(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function SubscriptionBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "فعّال", className: "bg-green-100 text-green-800" },
    expired: { label: "منتهٍ", className: "bg-red-100 text-red-800" },
    trial: { label: "تجريبي", className: "bg-amber-100 text-amber-800" },
    none: { label: "بدون", className: "bg-gray-200 text-gray-700" },
  };
  const cfg = map[status] ?? map.none;
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
}
