import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, MoreVertical } from "lucide-react";
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
  listMerchants,
  setMerchantSubscription,
  setMerchantSuspended,
  setMerchantVisibility,
  deleteMerchantStore,
  type MerchantAdminView,
} from "@/lib/admin.functions";
import { readAdminSession } from "@/lib/adminSession";
import { requireAdminClient } from "@/lib/adminGuard";

export const Route = createFileRoute("/admin/stores")({
  beforeLoad: () => requireAdminClient(),
  component: AdminStoresPage,
});

function AdminStoresPage() {
  const listMerchantsFn = useServerFn(listMerchants);
  const setVisibilityFn = useServerFn(setMerchantVisibility);
  const setSuspendedFn = useServerFn(setMerchantSuspended);
  const setSubscriptionFn = useServerFn(setMerchantSubscription);
  const deleteStoreFn = useServerFn(deleteMerchantStore);

  const [searchTerm, setSearchTerm] = useState("");
  const session = readAdminSession();
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  const {
    data: merchants = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-merchants"],
    queryFn: async () => {
      if (!session?.token) return [];
      return await listMerchantsFn({ data: { token: session.token } });
    },
    enabled: !!session?.token,
    retry: 1,
  });

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
    if (!q) return true;
    return (
      m.storeName.toLowerCase().includes(q) ||
      m.whatsapp.toLowerCase().includes(q) ||
      (m.email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout title="المتاجر" subtitle="تحكّم بظهور المتاجر في البحث والاشتراكات">
      <div className="space-y-6">
        <div className="flex gap-2">
          <Input
            placeholder="ابحث باسم المتجر أو الرقم..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
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
                  <th className="px-4 py-3 text-right font-medium">الاشتراك</th>
                  <th className="px-4 py-3 text-center font-medium">المنتجات</th>
                  <th className="px-4 py-3 text-center font-medium">الظهور</th>
                  <th className="px-4 py-3 text-center font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                      لا توجد متاجر بعد
                    </td>
                  </tr>
                ) : (
                  filtered.map((m: MerchantAdminView) => (
                    <tr key={m.merchantId} className="border-b hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">{m.storeName}</td>
                      <td className="px-4 py-3" dir="ltr">
                        {m.whatsapp || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <SubscriptionBadge status={m.subscriptionStatus} />
                      </td>
                      <td className="px-4 py-3 text-center">{m.productCount}</td>
                      <td className="px-4 py-3 text-center">
                        {m.visibleInSearch ? (
                          <Badge className="bg-green-100 text-green-800">ظاهر</Badge>
                        ) : m.suspended ? (
                          <Badge className="bg-red-100 text-red-800">موقوف</Badge>
                        ) : (
                          <Badge className="bg-gray-200 text-gray-700">مخفي</Badge>
                        )}
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
                            {m.suspended ? (
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
                                إعادة تفعيل
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

        {!isLoading && !error && (
          <p className="text-sm text-muted-foreground">عرض {filtered.length} متجر</p>
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
    </AdminLayout>
  );
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
