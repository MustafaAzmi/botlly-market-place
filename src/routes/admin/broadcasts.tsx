import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { requireAdminClient } from "@/lib/adminGuard";
import { adminStores, broadcastHistory, iraqiCities, type BroadcastMessage } from "@/lib/adminMockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Send, Users, MapPin, Crown, MousePointerClick, MessageSquare } from "lucide-react";
import { toast } from "sonner";

type Audience = "all" | "city" | "plan" | "selection";

export const Route = createFileRoute("/admin/broadcasts")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "الرسائل الجماعية — أدمن Botly" }] }),
  component: AdminBroadcastsPage,
});

function AdminBroadcastsPage() {
  const [history, setHistory] = useState<BroadcastMessage[]>(broadcastHistory);
  const [audience, setAudience] = useState<Audience>("all");
  const [city, setCity] = useState(iraqiCities[0]);
  const [plan, setPlan] = useState<"free" | "basic" | "pro" | "enterprise">("pro");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const recipients = useMemo(() => {
    if (audience === "all") return adminStores;
    if (audience === "city") return adminStores.filter(s => s.city === city);
    if (audience === "plan") return adminStores.filter(s => s.plan === plan);
    return adminStores.filter(s => selectedIds.includes(s.id));
  }, [audience, city, plan, selectedIds]);

  const audienceLabel = useMemo(() => {
    if (audience === "all") return "كل التجار";
    if (audience === "city") return `مدينة ${city}`;
    if (audience === "plan") return `باقة ${plan}`;
    return `${selectedIds.length} تاجر مختار`;
  }, [audience, city, plan, selectedIds.length]);

  const send = () => {
    if (!title.trim() || !body.trim()) return toast.error("العنوان والنص مطلوبان");
    if (recipients.length === 0) return toast.error("لا يوجد مستلمون");
    // TODO(supabase + bot): insert into broadcast_messages, enqueue WhatsApp send job.
    const msg: BroadcastMessage = {
      id: `b${Date.now()}`,
      title, body, audience, audienceLabel,
      recipients: recipients.length,
      sentAt: new Date().toISOString().slice(0, 10),
      status: "sent",
    };
    setHistory(prev => [msg, ...prev]);
    setTitle(""); setBody(""); setSelectedIds([]);
    toast.success(`تم إرسال الرسالة إلى ${recipients.length} تاجر عبر البوت`);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <AdminLayout
      title="الرسائل الجماعية"
      subtitle="أرسل تنبيهات أو إعلانات للتجار عبر بوت واتساب — للجميع أو لمجموعة محددة."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <h3 className="text-sm font-semibold">اختر الجمهور</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { v: "all" as Audience, icon: Users, label: "كل التجار" },
                { v: "city" as Audience, icon: MapPin, label: "حسب المدينة" },
                { v: "plan" as Audience, icon: Crown, label: "حسب الباقة" },
                { v: "selection" as Audience, icon: MousePointerClick, label: "اختيار يدوي" },
              ].map(opt => (
                <button
                  key={opt.v}
                  onClick={() => setAudience(opt.v)}
                  className={`flex flex-col items-start gap-2 rounded-lg border p-3 text-start transition ${
                    audience === opt.v
                      ? "border-primary bg-primary-soft"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <opt.icon className={`h-4 w-4 ${audience === opt.v ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">{opt.label}</span>
                </button>
              ))}
            </div>

            {audience === "city" && (
              <div className="mt-4 space-y-2">
                <Label>اختر المدينة</Label>
                <select value={city} onChange={(e) => setCity(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {iraqiCities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            {audience === "plan" && (
              <div className="mt-4 space-y-2">
                <Label>اختر الباقة</Label>
                <select value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="free">Free</option>
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            )}

            {audience === "selection" && (
              <div className="mt-4 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {adminStores.map(s => (
                  <label key={s.id} className="flex cursor-pointer items-center justify-between rounded-md p-2 hover:bg-secondary">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        className="h-4 w-4 accent-primary"
                      />
                      <div>
                        <div className="text-sm font-medium">{s.storeName}</div>
                        <div className="text-xs text-muted-foreground">{s.city} · {s.ownerName}</div>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground" dir="ltr">{s.whatsapp}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <h3 className="text-sm font-semibold">صياغة الرسالة</h3>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>العنوان</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: تحديث جديد للبوت" />
              </div>
              <div className="space-y-2">
                <Label>نص الرسالة</Label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  className="w-full rounded-md border border-input bg-background p-3 text-sm"
                  placeholder="اكتب رسالتك التي ستصل للتجار عبر بوت واتساب…"
                />
                <p className="text-xs text-muted-foreground">يدعم المتغيرات: {"{{store_name}}"}، {"{{owner_name}}"}، {"{{city}}"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <h3 className="text-sm font-semibold">معاينة الإرسال</h3>
            <div className="mt-4 rounded-lg bg-primary-soft p-4">
              <div className="text-xs text-muted-foreground">الجمهور المختار</div>
              <div className="mt-1 text-lg font-semibold">{audienceLabel}</div>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-background px-3 py-1 text-sm font-medium text-primary">
                <Users className="h-3.5 w-3.5" /> {recipients.length} مستلم
              </div>
            </div>
            <Button onClick={send} size="lg" className="mt-4 w-full gap-2 shadow-soft">
              <Send className="h-4 w-4" /> إرسال الآن عبر البوت
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              سيتم إرسال الرسالة فوراً إلى جميع المستلمين المختارين.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <h3 className="text-sm font-semibold">السجل</h3>
            <div className="mt-3 space-y-3">
              {history.map(h => (
                <div key={h.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">{h.title}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{h.status}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {h.audienceLabel} · {h.recipients} مستلم · {h.sentAt}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
