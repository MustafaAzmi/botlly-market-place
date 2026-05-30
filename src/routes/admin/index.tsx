import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { requireAdminClient } from "@/lib/adminGuard";
import { adminStores, broadcastHistory, iraqiCities } from "@/lib/adminMockData";
import { Store, Search, ShoppingBag, Bot, Ban, TrendingUp, MapPin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/admin/")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "لوحة الأدمن — Botly" }] }),
  component: AdminDashboard,
});

// Mock 14-day trend per city. TODO(supabase): replace with aggregated query
// from `bot_events` / `orders` filtered by city.
type DayPoint = { day: string; searches: number; orders: number };

const CITY_TRENDS: Record<string, DayPoint[]> = (() => {
  const cities = ["all", ...iraqiCities];
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  const out: Record<string, DayPoint[]> = {};
  cities.forEach((c) => {
    out[c] = days.map((day) => ({ day, searches: 0, orders: 0 }));
  });
  return out;
})();

function AdminDashboard() {
  const [city, setCity] = useState<string>("all");

  const cityStores = useMemo(
    () => (city === "all" ? adminStores : adminStores.filter((s) => s.city === city)),
    [city],
  );

  const trend = CITY_TRENDS[city] ?? CITY_TRENDS.all;

  const totals = useMemo(() => {
    const searches = trend.reduce((a, p) => a + p.searches, 0);
    const orders = trend.reduce((a, p) => a + p.orders, 0);
    const banned = cityStores.filter((s) => s.bannedFromBot).length;
    const botActive = cityStores.length - banned;
    const botUptime = cityStores.length ? Math.round((botActive / cityStores.length) * 100) : 0;
    const prevSearches = trend.slice(0, 7).reduce((a, p) => a + p.searches, 0);
    const lastSearches = trend.slice(7).reduce((a, p) => a + p.searches, 0);
    const delta = prevSearches
      ? Math.round(((lastSearches - prevSearches) / prevSearches) * 100)
      : 0;
    return { searches, orders, banned, botUptime, delta };
  }, [trend, cityStores]);

  const kpis = [
    {
      label: "المتاجر",
      value: cityStores.length,
      hint: city === "all" ? "كل المدن" : city,
      icon: Store,
      tone: "bg-blue-500/10 text-blue-600",
    },
    {
      label: "عمليات بحث (14 يوم)",
      value: totals.searches.toLocaleString("ar-EG"),
      hint: `${totals.delta >= 0 ? "+" : ""}${totals.delta}% أسبوعياً`,
      icon: Search,
      tone: "bg-emerald-500/10 text-emerald-600",
    },
    {
      label: "الطلبات (14 يوم)",
      value: totals.orders.toLocaleString("ar-EG"),
      hint: "من بوت واتساب",
      icon: ShoppingBag,
      tone: "bg-amber-500/10 text-amber-600",
    },
    {
      label: "حالة البوت",
      value: `${totals.botUptime}%`,
      hint: `${totals.banned} متجر محظور`,
      icon: Bot,
      tone:
        totals.botUptime >= 90
          ? "bg-success/10 text-success"
          : "bg-destructive/10 text-destructive",
    },
  ];

  return (
    <AdminLayout
      title="نظرة عامة"
      subtitle="ملخّص أداء المنصة عبر المدن خلال آخر 14 يوماً."
      actions={
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger className="h-10 w-48">
              <SelectValue placeholder="المدينة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المدن</SelectItem>
              {iraqiCities.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${k.tone}`}
            >
              <k.icon className="h-5 w-5" />
            </div>
            <div className="mt-4 text-3xl font-bold tracking-tight">{k.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{k.label}</div>
            <div className="mt-1 text-[11px] text-muted-foreground/80">{k.hint}</div>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">اتجاه النشاط</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              عمليات البحث والطلبات اليومية{city !== "all" ? ` — ${city}` : ""}
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              totals.delta >= 0
                ? "border-success/30 bg-success/15 text-success"
                : "border-destructive/30 bg-destructive/15 text-destructive"
            }
          >
            <TrendingUp className="me-1 h-3 w-3" />
            {totals.delta >= 0 ? "+" : ""}
            {totals.delta}%
          </Badge>
        </div>
        <ChartContainer
          className="h-64 w-full"
          config={{
            searches: { label: "بحث", color: "hsl(var(--primary))" },
            orders: { label: "طلبات", color: "hsl(var(--success))" },
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="g-searches" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g-orders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="searches"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#g-searches)"
              />
              <Area
                type="monotone"
                dataKey="orders"
                stroke="hsl(var(--success))"
                strokeWidth={2}
                fill="url(#g-orders)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Side lists */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h3 className="text-sm font-semibold">
            آخر المتاجر{city !== "all" ? ` في ${city}` : ""}
          </h3>
          <div className="mt-4 divide-y divide-border">
            {cityStores.slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium">{s.storeName}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.city} · {s.category}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.bannedFromBot && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-destructive/30 bg-destructive/10 text-destructive"
                    >
                      <Ban className="h-3 w-3" /> محظور
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{s.createdAt}</span>
                </div>
              </div>
            ))}
            {cityStores.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                لا توجد متاجر في هذه المدينة بعد.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h3 className="text-sm font-semibold">آخر الرسائل الجماعية</h3>
          <div className="mt-4 divide-y divide-border">
            {broadcastHistory.map((b) => (
              <div key={b.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{b.title}</div>
                  <span className="text-xs text-muted-foreground">{b.sentAt}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {b.audienceLabel} · {b.recipients.toLocaleString("ar-EG")} مستلم
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
