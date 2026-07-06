import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listPopularSmartSearchProducts,
  type PopularSmartSearchProduct,
} from "@/lib/admin.functions";
import { requireAdminClient } from "@/lib/adminGuard";
import { useAdminSession } from "@/lib/adminSession";

export const Route = createFileRoute("/admin/popular-requests")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "المنتجات الأكثر طلباً - Botly Admin" }] }),
  component: PopularRequestsPage,
});

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "غير محدد";
  return new Intl.DateTimeFormat("ar-IQ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function PopularRequestsPage() {
  const { session } = useAdminSession();
  const listPopularProducts = useServerFn(listPopularSmartSearchProducts);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const {
    data: productResult,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-popular-smart-search-products", page],
    queryFn: async () =>
      session?.token
        ? await listPopularProducts({ data: { token: session.token, page, limit: 20 } })
        : null,
    enabled: Boolean(session?.token),
    retry: 1,
  });
  const products = useMemo(() => productResult?.items ?? [], [productResult?.items]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ar");
    if (!query) return products;
    return products.filter(
      (product) =>
        product.productName.toLocaleLowerCase("ar").includes(query) ||
        product.carMakes.some((make) => make.toLocaleLowerCase("ar").includes(query)) ||
        product.governorates.some((name) =>
          name.toLocaleLowerCase("ar").includes(query),
        ),
    );
  }, [products, search]);

  const totalRequests = products.reduce(
    (total, product) => total + product.requestCount,
    0,
  );

  return (
    <AdminLayout
      title="المنتجات الأكثر طلباً"
      subtitle="إحصائية متجددة تلقائياً من طلبات البحث الذكي للزبائن والفيترية."
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <SummaryCard label="إجمالي طلبات البحث الذكي" value={totalRequests} />
        <SummaryCard label="المنتجات المطلوبة" value={products.length} />
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <TrendingUp className="h-5 w-5 text-primary" />
              ترتيب المنتجات
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              يتم احتساب كل عملية بحث ذكي مرة واحدة فقط.
            </p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث باسم المنتج أو السيارة أو المحافظة..."
              className="ps-9"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            جاري جمع الطلبات...
          </div>
        ) : error ? (
          <div className="min-h-48 p-8 text-center text-destructive">
            {error instanceof Error ? error.message : "تعذر تحميل الإحصائية"}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="min-h-48 p-8 text-center text-muted-foreground">
            {search ? "لا توجد نتائج مطابقة." : "لا توجد طلبات بحث ذكي حتى الآن."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-secondary/50 text-right">
                <tr>
                  <TableHead className="w-16 text-center">الترتيب</TableHead>
                  <TableHead>اسم المنتج</TableHead>
                  <TableHead className="text-center">عدد الطلبات</TableHead>
                  <TableHead className="text-center">زبون</TableHead>
                  <TableHead className="text-center">فيتر</TableHead>
                  <TableHead>أنواع السيارات</TableHead>
                  <TableHead>المحافظات</TableHead>
                  <TableHead>آخر طلب</TableHead>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product, index) => (
                  <ProductRow
                    key={product.productKey}
                    product={product}
                    rank={products.indexOf(product) + 1 || index + 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="mt-5 flex items-center justify-center gap-3">
        <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
          السابق
        </Button>
        <span className="text-sm text-muted-foreground">{page}</span>
        <Button type="button" variant="outline" disabled={!productResult?.hasMore} onClick={() => setPage((value) => value + 1)}>
          التالي
        </Button>
      </div>
    </AdminLayout>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold text-primary">
        {value.toLocaleString("ar-IQ")}
      </div>
    </div>
  );
}

function TableHead({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`whitespace-nowrap px-4 py-3 font-medium ${className}`}>
      {children}
    </th>
  );
}

function ProductRow({
  product,
  rank,
}: {
  product: PopularSmartSearchProduct;
  rank: number;
}) {
  return (
    <tr className="border-t border-border/70">
      <td className="px-4 py-3 text-center">
        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-primary/10 px-2 font-bold text-primary">
          {rank.toLocaleString("ar-IQ")}
        </span>
      </td>
      <td className="px-4 py-3 font-semibold">{product.productName}</td>
      <td className="px-4 py-3 text-center text-lg font-bold text-primary">
        {product.requestCount.toLocaleString("ar-IQ")}
      </td>
      <td className="px-4 py-3 text-center">
        {product.customerCount.toLocaleString("ar-IQ")}
      </td>
      <td className="px-4 py-3 text-center">
        {product.fitterCount.toLocaleString("ar-IQ")}
      </td>
      <td className="max-w-56 px-4 py-3 text-muted-foreground">
        {product.carMakes.join("، ") || "غير محدد"}
      </td>
      <td className="max-w-56 px-4 py-3 text-muted-foreground">
        {product.governorates.join("، ") || "غير محدد"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
        {formatDate(product.lastRequestedAt)}
      </td>
    </tr>
  );
}
