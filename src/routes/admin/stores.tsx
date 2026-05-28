import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { requireAdminClient } from "@/lib/adminGuard";
import { listStores, setStoreBan } from "@/lib/admin.functions";
import type { AdminStore } from "@/lib/adminTypes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Search, Ban, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/stores")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "المتاجر — أدمن Botly" }] }),
  component: AdminStoresPage,
});

function AdminStoresPage() {
  const qc = useQueryClient();
  const fetchStores = useServerFn(listStores);
  const banFn = useServerFn(setStoreBan);

  const { data: stores = [], isLoading } = useQuery<AdminStore[]>({
    queryKey: ["admin", "stores"],
    queryFn: () => fetchStores(),
  });

  const banMutation = useMutation({
    mutationFn: (vars: { id: string; banned: boolean }) =>
      banFn({ data: vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["admin", "stores"] });
      const prev = qc.getQueryData<AdminStore[]>(["admin", "stores"]);
      qc.setQueryData<AdminStore[]>(["admin", "stores"], (old) =>
        (old ?? []).map((s) =>
          s.id === vars.id ? { ...s, bannedFromBot: vars.banned } : s,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["admin", "stores"], ctx.prev);
      toast.error("تعذّر تحديث الحالة");
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.banned ? "تم حظر المتجر من البوت" : "تم رفع الحظر");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin", "stores"] }),
  });

  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const cities = useMemo(
    () => Array.from(new Set(stores.map((s) => s.city))),
    [stores],
  );
  const filtered = useMemo(
    () =>
      stores.filter((s) => {
        const q = !query ||
          s.storeName.includes(query) ||
          s.ownerName.includes(query) ||
          s.whatsapp.includes(query);
        const c = !cityFilter || s.city === cityFilter;
        return q && c;
      }),
    [stores, query, cityFilter],
  );

  return (
    <AdminLayout
      title="المتاجر"
      subtitle="كل المتاجر المسجلة على بوتلي. يمكنك حظر أي متجر من الظهور على البوت."
    >
      <div className="rounded-xl border border-border bg-card shadow-soft">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث بالاسم أو رقم الواتساب…"
              className="h-10 ps-9"
            />
          </div>
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">كل المدن</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المتجر</TableHead>
              <TableHead>المدينة</TableHead>
              <TableHead>الفئة</TableHead>
              <TableHead>الباقة</TableHead>
              <TableHead>منتجات</TableHead>
              <TableHead>طلبات</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="font-medium">{s.storeName}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">
                    {s.whatsapp}
                  </div>
                </TableCell>
                <TableCell>{s.city}</TableCell>
                <TableCell>{s.category}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{s.plan}</Badge>
                </TableCell>
                <TableCell>{s.productsCount}</TableCell>
                <TableCell>{s.ordersCount}</TableCell>
                <TableCell>
                  {s.bannedFromBot ? (
                    <Badge variant="destructive" className="gap-1">
                      <Ban className="h-3 w-3" /> محظور
                    </Badge>
                  ) : (
                    <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20">
                      <CheckCircle2 className="h-3 w-3" /> نشط
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!s.bannedFromBot}
                        disabled={banMutation.isPending}
                        onCheckedChange={(v) =>
                          banMutation.mutate({ id: s.id, banned: !v })
                        }
                      />
                      <span className="text-xs text-muted-foreground">البوت</span>
                    </div>
                    <Button variant="ghost" size="sm" className="gap-1">
                      <ExternalLink className="h-3 w-3" /> عرض
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  لا توجد متاجر مطابقة.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </AdminLayout>
  );
}
