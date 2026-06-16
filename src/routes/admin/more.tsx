import { Link, createFileRoute } from "@tanstack/react-router";
import { Coins, Package, Send, Truck, Users } from "lucide-react";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { requireAdminClient } from "@/lib/adminGuard";

export const Route = createFileRoute("/admin/more")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "المزيد - Botly Admin" }] }),
  component: AdminMorePage,
});

const links = [
  {
    to: "/admin/customers",
    icon: Users,
    title: "الزبائن",
    desc: "حسابات الزبائن المسجلة وبياناتهم الأساسية.",
  },
  {
    to: "/admin/packages",
    icon: Package,
    title: "باقات الدفع",
    desc: "إدارة باقات ظهور التجار وأسعار الاشتراك.",
  },
  {
    to: "/admin/currencies",
    icon: Coins,
    title: "العملات",
    desc: "إدارة العملات التي تظهر عند إضافة المنتجات.",
  },
  {
    to: "/admin/delivery",
    icon: Truck,
    title: "شركات التوصيل",
    desc: "إعداد شركات التوصيل وأرقامها وحالتها.",
  },
  {
    to: "/admin/broadcasts",
    icon: Send,
    title: "الرسائل الجماعية",
    desc: "إرسال رسائل جماعية للتجار ومتابعة سجل الإرسال.",
  },
];

function AdminMorePage() {
  return (
    <AdminLayout title="المزيد" subtitle="صفحات الإدارة الثانوية موجودة هنا حتى تبقى الواجهة الرئيسية خفيفة.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {links.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:border-primary/40 hover:bg-primary-soft/30"
          >
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <item.icon className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.desc}</p>
          </Link>
        ))}
      </div>
    </AdminLayout>
  );
}
