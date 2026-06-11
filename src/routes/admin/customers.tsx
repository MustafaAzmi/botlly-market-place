import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Phone, Save, Trash2, Users } from "lucide-react";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listCustomers,
  listOrdersReport,
  getPlatformSettings,
  setMediatorPhone,
  purgeAllProducts,
  type CustomerAdminView,
  type OrderReportRow,
} from "@/lib/admin.functions";
import { readAdminSession } from "@/lib/adminSession";
import { requireAdminClient } from "@/lib/adminGuard";

export const Route = createFileRoute("/admin/customers")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "الزبائن — Botly Admin" }] }),
  component: AdminCustomersPage,
});

// Human-readable order status. "received_by_customer" is the customer's own
// "تم الاستلام" confirmation — the signal the admin report is built around.
function statusBadge(status: string) {
  switch (status) {
    case "received_by_customer":
      return <Badge className="border-success/30 bg-success/15 text-success">تم الاستلام ✅</Badge>;
    case "confirmed_by_merchant":
      return <Badge className="border-primary/30 bg-primary/10 text-primary">أكده التاجر</Badge>;
    case "out_of_stock":
      return <Badge variant="destructive">منتهي</Badge>;
    case "pending_merchant":
      return <Badge variant="secondary">بانتظار التاجر</Badge>;
    case "sent_to_delivery":
      return <Badge variant="secondary">عند التوصيل</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function AdminCustomersPage() {
  const session = readAdminSession();
  const listCustomersFn = useServerFn(listCustomers);
  const listOrdersFn = useServerFn(listOrdersReport);
  const getSettingsFn = useServerFn(getPlatformSettings);
  const setMediatorFn = useServerFn(setMediatorPhone);
  const purgeProductsFn = useServerFn(purgeAllProducts);

  const [search, setSearch] = useState("");
  const [mediator, setMediator] = useState("");
  const [savingMediator, setSavingMediator] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const [purging, setPurging] = useState(false);

  const { data: customers = [], isLoading: loadingCustomers } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: async () =>
      session?.token ? await listCustomersFn({ data: { token: session.token } }) : [],
    enabled: !!session?.token,
    retry: 1,
  });

  const {
    data: orders = [],
    isLoading: loadingOrders,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ["admin-orders-report"],
    queryFn: async () =>
      session?.token ? await listOrdersFn({ data: { token: session.token } }) : [],
    enabled: !!session?.token,
    retry: 1,
  });

  useEffect(() => {
    if (!session?.token) return;
    getSettingsFn({ data: { token: session.token } })
      .then((settings) => setMediator(settings.mediatorPhone))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMediator = async () => {
    if (!session?.token) return;
    setSavingMediator(true);
    try {
      await setMediatorFn({ data: { token: session.token, mediatorPhone: mediator.trim() } });
      toast.success("تم حفظ رقم الوسيط ✅");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSavingMediator(false);
    }
  };

  const purge = async () => {
    if (!session?.token) return;
    setPurging(true);
    try {
      const result = await purgeProductsFn({ data: { token: session.token } });
      toast.success(`تم مسح ${result.deleted} منتج قديم من قاعدة البيانات ✅`);
      setPurgeConfirm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل المسح");
    } finally {
      setPurging(false);
    }
  };

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
    <AdminLayout title="الزبائن" subtitle="حسابات الزبائن المسجلة وتقرير حالة الشراء لكل تاجر.">
      <div className="space-y-8">
        {/* Mediator phone */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-2 font-semibold">
            <Phone className="h-4 w-4 text-primary" />
            رقم الوسيط (للتواصل)
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            هذا الرقم يظهر للزبائن بزر «التواصل مع الوسيط»، وتوصلك عليه إشعارات الطلبات
            بتفاصيلها الكاملة. قابل للتغيير بأي وقت.
          </p>
          <div className="mt-3 flex max-w-md gap-2">
            <Input
              dir="ltr"
              placeholder="07XX XXX XXXX"
              value={mediator}
              onChange={(e) => setMediator(e.target.value)}
              className="h-11"
            />
            <Button onClick={saveMediator} disabled={savingMediator} className="gap-2">
              <Save className="h-4 w-4" />
              {savingMediator ? "جاري..." : "حفظ"}
            </Button>
          </div>
        </div>

        {/* Customers */}
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
                    <Th>رقم الواتساب</Th>
                    <Th>المحافظة</Th>
                    <Th>أقرب نقطة دالة</Th>
                    <Th>الطلبات</Th>
                    <Th>المستلمة</Th>
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
                      <Td>{c.orderCount}</Td>
                      <Td>
                        {c.receivedCount > 0 ? (
                          <span className="font-medium text-success">{c.receivedCount} ✅</span>
                        ) : (
                          "0"
                        )}
                      </Td>
                      <Td className="text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString("ar-IQ")}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Purchase report */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">تقرير الشراء ({orders.length})</h2>
            <Button variant="outline" size="sm" onClick={() => refetchOrders()}>
              تحديث
            </Button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            يبين شنو باع كل تاجر، وحالة كل طلب — «تم الاستلام» تعني الزبون ضغط «تم» وأكد
            استلام المنتج.
          </p>

          {loadingOrders ? (
            <LoadingCard text="جاري تحميل التقرير..." />
          ) : orders.length === 0 ? (
            <EmptyCard text="لا توجد طلبات بعد." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-secondary/50 text-right">
                  <tr>
                    <Th>المتجر</Th>
                    <Th>المنتج</Th>
                    <Th>السعر</Th>
                    <Th>الزبون</Th>
                    <Th>المصدر</Th>
                    <Th>الحالة</Th>
                    <Th>التاريخ</Th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o: OrderReportRow) => (
                    <tr key={o.orderId} className="border-b border-border/60 last:border-0">
                      <Td className="font-medium">{o.storeName}</Td>
                      <Td>{o.productTitle}</Td>
                      <Td>
                        {o.productPrice ? `${o.productPrice.toLocaleString()} ${o.currency}` : "—"}
                      </Td>
                      <Td>{o.customerName}</Td>
                      <Td>
                        <Badge variant="outline">{o.source === "web" ? "الموقع" : "واتساب"}</Badge>
                      </Td>
                      <Td>{statusBadge(o.status)}</Td>
                      <Td className="text-xs text-muted-foreground">
                        {new Date(o.createdAt).toLocaleDateString("ar-IQ")}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Danger zone: purge old demo products */}
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
          <h2 className="flex items-center gap-2 font-semibold text-destructive">
            <Trash2 className="h-4 w-4" />
            مسح المنتجات القديمة
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            يحذف <strong>جميع</strong> المنتجات وصورها من قاعدة البيانات (البيانات القديمة:
            بنطلون، ساعة... إلخ) حتى تبدأ بكتالوج اكسسوارات السيارات من الصفر. لا يمكن
            التراجع عن هذا الإجراء.
          </p>
          {purgeConfirm ? (
            <div className="mt-4 flex items-center gap-3">
              <Button variant="destructive" onClick={purge} disabled={purging} className="gap-2">
                {purging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                نعم، امسح كل المنتجات نهائياً
              </Button>
              <Button variant="outline" onClick={() => setPurgeConfirm(false)}>
                إلغاء
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="mt-4 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setPurgeConfirm(true)}
            >
              مسح جميع المنتجات...
            </Button>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 text-xs font-medium text-muted-foreground">{children}</th>;
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
