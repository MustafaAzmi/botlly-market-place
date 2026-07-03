import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Send, Users } from "lucide-react";
import { toast } from "sonner";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireAdminClient } from "@/lib/adminGuard";
import {
  listAdminMessages,
  listMerchants,
  sendAdminBroadcast,
  type AdminMessageRecord,
  type MerchantAdminView,
} from "@/lib/admin.functions";
import { readAdminSession } from "@/lib/adminSession";

export const Route = createFileRoute("/admin/broadcasts")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "رسائل التجار — أدمن Botly" }] }),
  component: AdminBroadcastsPage,
});

type Audience = "all" | "selection";

function AdminBroadcastsPage() {
  const session = readAdminSession();
  const listMerchantsFn = useServerFn(listMerchants);
  const sendBroadcastFn = useServerFn(sendAdminBroadcast);
  const listMessagesFn = useServerFn(listAdminMessages);

  const [merchants, setMerchants] = useState<MerchantAdminView[]>([]);
  const [history, setHistory] = useState<AdminMessageRecord[]>([]);
  const [audience, setAudience] = useState<Audience>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [merchantPage, setMerchantPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [hasMoreMerchants, setHasMoreMerchants] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);

  useEffect(() => {
    if (!session?.token) return;
    listMerchantsFn({ data: { token: session.token, page: merchantPage, limit: 20 } })
      .then((result) => {
        setMerchants(result.items);
        setHasMoreMerchants(result.hasMore);
      })
      .catch(() => setMerchants([]));
    listMessagesFn({ data: { token: session.token, page: historyPage, limit: 20 } })
      .then((result) => {
        setHistory(result.items);
        setHasMoreHistory(result.hasMore);
      })
      .catch(() => setHistory([]));
  }, [historyPage, listMerchantsFn, listMessagesFn, merchantPage, session?.token]);

  const filteredMerchants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return merchants;
    return merchants.filter((m) => m.storeName.toLowerCase().includes(q) || m.whatsapp.includes(q));
  }, [merchants, search]);

  const recipientsCount = audience === "all" ? merchants.length : selectedIds.length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const send = async () => {
    if (!session?.token) return;
    if (!body.trim()) {
      toast.error("اكتب نص الرسالة");
      return;
    }
    if (audience === "selection" && selectedIds.length === 0) {
      toast.error("اختر تاجر واحد على الأقل");
      return;
    }

    setSending(true);
    try {
      const result = await sendBroadcastFn({
        data: {
          token: session.token,
          body: body.trim(),
          merchantIds: audience === "selection" ? selectedIds : undefined,
        },
      });
      toast.success(`تم الإرسال إلى ${result.sent} من ${result.total} (فشل ${result.failed})`);
      setBody("");
      const refreshed = await listMessagesFn({
        data: { token: session.token, page: historyPage, limit: 20 },
      });
      setHistory(refreshed.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الإرسال");
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminLayout
      title="رسائل التجار"
      subtitle="أرسل تذكيرات الاشتراك والعروض والإشعارات عبر واتساب"
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Composer */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">رسالة جديدة</h3>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={audience === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setAudience("all")}
            >
              كل التجار ({merchants.length})
            </Button>
            <Button
              type="button"
              variant={audience === "selection" ? "default" : "outline"}
              size="sm"
              onClick={() => setAudience("selection")}
            >
              تجار محددون ({selectedIds.length})
            </Button>
          </div>

          {audience === "selection" && (
            <div className="rounded-lg border border-border">
              <div className="border-b p-2">
                <Input
                  placeholder="ابحث عن تاجر..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="max-h-48 overflow-y-auto p-2">
                {filteredMerchants.length === 0 ? (
                  <p className="p-3 text-center text-sm text-muted-foreground">لا يوجد تجار</p>
                ) : (
                  filteredMerchants.map((m) => (
                    <label
                      key={m.merchantId}
                      className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedIds.includes(m.merchantId)}
                        onCheckedChange={() => toggleSelect(m.merchantId)}
                      />
                      <span className="flex-1 text-sm">{m.storeName}</span>
                      <span className="text-xs text-muted-foreground" dir="ltr">
                        {m.whatsapp}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <div className="flex items-center justify-center gap-2 border-t p-2">
                <Button type="button" variant="outline" size="sm" disabled={merchantPage <= 1} onClick={() => setMerchantPage((value) => value - 1)}>
                  السابق
                </Button>
                <span className="text-xs text-muted-foreground">{merchantPage}</span>
                <Button type="button" variant="outline" size="sm" disabled={!hasMoreMerchants} onClick={() => setMerchantPage((value) => value + 1)}>
                  التالي
                </Button>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="body">نص الرسالة</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="مثال: تذكير — اشتراكك بمنصة Botly ينتهي قريباً. جدّد حتى يستمر ظهور متجرك."
              rows={5}
              className="mt-2"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" /> {recipientsCount} مستلم
            </span>
            <Button type="button" onClick={send} disabled={sending} className="gap-2">
              <Send className="h-4 w-4" />
              {sending ? "جارٍ الإرسال..." : "إرسال"}
            </Button>
          </div>
        </div>

        {/* History */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">سجل الرسائل</h3>
          </div>
          {history.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              لا توجد رسائل بعد.
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((msg) => (
                <div key={msg.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="line-clamp-2">{msg.body}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge className="bg-green-100 text-green-800">{msg.sent} نجح</Badge>
                    {msg.failed > 0 && (
                      <Badge className="bg-red-100 text-red-800">{msg.failed} فشل</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{msg.target}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((value) => value - 1)}>
              السابق
            </Button>
            <span className="text-xs text-muted-foreground">{historyPage}</span>
            <Button type="button" variant="outline" size="sm" disabled={!hasMoreHistory} onClick={() => setHistoryPage((value) => value + 1)}>
              التالي
            </Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
