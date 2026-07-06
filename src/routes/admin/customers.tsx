import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Users } from "lucide-react";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCustomers, type CustomerAdminView } from "@/lib/admin.functions";
import { useAdminSession } from "@/lib/adminSession";
import { requireAdminClient } from "@/lib/adminGuard";

export const Route = createFileRoute("/admin/customers")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "الزبائن — Botly Admin" }] }),
  component: AdminCustomersPage,
});

function AdminCustomersPage() {
  const { session } = useAdminSession();
  const listCustomersFn = useServerFn(listCustomers);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: customerResult, isLoading: loadingCustomers } = useQuery({
    queryKey: ["admin-customers", page],
    queryFn: async () =>
      session?.token
        ? await listCustomersFn({ data: { token: session.token, page, limit: 20 } })
        : null,
    enabled: !!session?.token,
    retry: 1,
  });
  const customers = customerResult?.items ?? [];

  const filteredCustomers = customers.filter((c: CustomerAdminView) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.whatsapp.includes(q) ||
      c.governorate.toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout title="الزبائن" subtitle="حسابات الزبائن المسجلة.">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5 text-primary" />
            الزبائن المسجلون ({customers.length})
          </h2>
          <Input
            placeholder="ابحث بالاسم أو الرقم أو المحافظة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 max-w-xs"
          />
        </div>

        {loadingCustomers ? (
          <LoadingCard text="جاري تحميل الزبائن..." />
        ) : filteredCustomers.length === 0 ? (
          <EmptyCard text="لا يوجد زبائن مسجلون بعد." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50 text-right">
                <tr>
                  <Th>الاسم</Th>
                  <Th>رقم الهاتف</Th>
                  <Th>المحافظة</Th>
                  <Th>أقرب نقطة دالة</Th>
                  <Th>تاريخ التسجيل</Th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((c) => (
                  <tr key={c.customerId} className="border-b border-border/60 last:border-0">
                    <Td className="font-medium">{c.name}</Td>
                    <Td dir="ltr">{c.whatsapp}</Td>
                    <Td>{c.governorate}</Td>
                    <Td>{c.landmark}</Td>
                    <Td className="text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString("ar-IQ")}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            السابق
          </Button>
          <span className="text-sm text-muted-foreground">{page}</span>
          <Button type="button" variant="outline" disabled={!customerResult?.hasMore} onClick={() => setPage((value) => value + 1)}>
            التالي
          </Button>
        </div>
      </section>
    </AdminLayout>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-xs font-medium text-muted-foreground">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  dir,
}: {
  children: React.ReactNode;
  className?: string;
  dir?: string;
}) {
  return (
    <td dir={dir} className={`whitespace-nowrap px-4 py-3 ${className}`}>
      {children}
    </td>
  );
}

function LoadingCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground shadow-soft">
      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      <p className="mt-3 text-sm">{text}</p>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
