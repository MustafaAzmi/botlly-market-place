import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, MoreVertical } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { listStores, toggleStoreStatus } from "@/lib/admin.functions";
import { readAdminSession } from "@/lib/adminSession";
import { requireAdminClient } from "@/lib/adminGuard";

export const Route = createFileRoute("/admin/stores")({
  beforeLoad: () => requireAdminClient(),
  component: AdminStoresPage,
});

function AdminStoresPage() {
  const listStoresFn = useServerFn(listStores);
  const toggleStatusFn = useServerFn(toggleStoreStatus);

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  // readAdminSession reads sessionStorage; this component only renders on the
  // client (after the beforeLoad guard), so it's safe to read it directly.
  const session = readAdminSession();

  const {
    data: stores = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["stores", page, searchTerm],
    queryFn: async () => {
      if (!session?.token) return [];
      return await listStoresFn({
        data: {
          token: session.token,
          page,
          search: searchTerm,
        },
      });
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: !!session?.token,
  });

  const handleToggleStatus = async (storeId: string) => {
    if (!session?.token) return;

    try {
      await toggleStatusFn({
        data: { token: session.token, storeId },
      });
      toast.success("تم تحديث حالة المتجر");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحديث");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-red-900">حدث خطأ</p>
            <p className="text-sm text-red-800">
              {error instanceof Error ? error.message : "فشل تحميل المتاجر"}
            </p>
            <Button
              onClick={() => refetch()}
              size="sm"
              variant="outline"
              className="mt-3"
            >
              إعادة محاولة
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">المتاجر</h1>
        <p className="text-muted-foreground">إدارة المتاجر المسجلة في النظام</p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="ابحث عن متجر..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-6 py-3 text-right font-medium">اسم المتجر</th>
              <th className="px-6 py-3 text-right font-medium">الواتساب</th>
              <th className="px-6 py-3 text-right font-medium">البريد</th>
              <th className="px-6 py-3 text-right font-medium">الحالة</th>
              <th className="px-6 py-3 text-center font-medium">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {stores.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                  لا توجد متاجر بعد
                </td>
              </tr>
            ) : (
              stores.map((store: any) => (
                <tr key={store.id} className="border-b hover:bg-muted/50">
                  <td className="px-6 py-4 font-medium">{store.storeName}</td>
                  <td className="px-6 py-4">{store.whatsapp}</td>
                  <td className="px-6 py-4">{store.email || "-"}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                        store.active
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {store.active ? "نشط" : "معطل"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleToggleStatus(store.id)}
                        >
                          {store.active ? "تعطيل" : "تفعيل"}
                        </DropdownMenuItem>
                        <DropdownMenuItem>عرض التفاصيل</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {stores.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            عرض {stores.length} متجر
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              السابق
            </Button>
            <Button
              variant="outline"
              disabled={stores.length < 10}
              onClick={() => setPage(page + 1)}
            >
              التالي
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
