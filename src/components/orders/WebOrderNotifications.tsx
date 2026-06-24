import { useServerFn } from "@tanstack/react-start";
import { BellRing, CheckCircle2, Loader2, PackageCheck, Star, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  clearWebOrderNotification,
  listMerchantWebNotifications,
  listRequesterWebNotifications,
  merchantConfirmWebSale,
  merchantMarkProductAvailable,
  rateMerchantFromWeb,
  requesterConfirmWebPurchase,
  type WebOrderNotification,
} from "@/lib/web-notifications.functions";

type Props =
  | {
      role: "merchant";
      token: string;
      title?: string;
    }
  | {
      role: "requester";
      requesterType: "customer" | "fitter";
      requesterPhone: string;
      title?: string;
    };

export function WebOrderNotifications(props: Props) {
  const role = props.role;
  const merchantToken = props.role === "merchant" ? props.token : "";
  const requesterPhone = props.role === "requester" ? props.requesterPhone : "";
  const requesterType = props.role === "requester" ? props.requesterType : "customer";
  const listMerchantFn = useServerFn(listMerchantWebNotifications);
  const listRequesterFn = useServerFn(listRequesterWebNotifications);
  const availableFn = useServerFn(merchantMarkProductAvailable);
  const merchantSaleFn = useServerFn(merchantConfirmWebSale);
  const requesterPurchaseFn = useServerFn(requesterConfirmWebPurchase);
  const clearFn = useServerFn(clearWebOrderNotification);
  const rateFn = useServerFn(rateMerchantFromWeb);
  const [orders, setOrders] = useState<WebOrderNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [ratingDrafts, setRatingDrafts] = useState<Record<string, { rating: number; comment: string }>>({});
  const notifiedStorageKey = useMemo(
    () =>
      `botly_web_notifications_seen:${role}:${
        role === "merchant" ? merchantToken.slice(-16) : `${requesterType}:${requesterPhone}`
      }`,
    [merchantToken, requesterPhone, requesterType, role],
  );

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const next =
        role === "merchant"
          ? await listMerchantFn({ data: { token: merchantToken } })
          : await listRequesterFn({
              data: {
                requesterPhone,
                requesterType,
              },
            });
      const visibleOrders = next.slice(0, 12);
      const actionableIds = visibleOrders
        .filter((order) => hasUnreadNotification(order, role))
        .map((order) => order.orderId);
      const notifiedIds = readNotifiedIds(notifiedStorageKey);
      const newActionableIds = actionableIds.filter((orderId) => !notifiedIds.has(orderId));
      if (newActionableIds.length > 0) {
        playNotificationBell();
        saveNotifiedIds(notifiedStorageKey, new Set([...notifiedIds, ...newActionableIds]));
      }
      setOrders(visibleOrders);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل إشعارات الطلبات");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [listMerchantFn, listRequesterFn, merchantToken, notifiedStorageKey, requesterPhone, requesterType, role]);

  useEffect(() => {
    refresh().catch(() => {});
    const timer = window.setInterval(() => {
      refresh(true).catch(() => {});
    }, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const title = props.title ?? (role === "merchant" ? "طلبات الموقع والواتساب" : "إشعارات الطلبات");
  const actionableCount = useMemo(
    () => orders.filter((order) => hasActions(order, role)).length,
    [orders, role],
  );
  const notificationCount = useMemo(
    () => orders.filter((order) => hasUnreadNotification(order, role)).length,
    [orders, role],
  );

  const runAction = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusyKey(key);
    try {
      await action();
      toast.success(success);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تنفيذ العملية");
    } finally {
      setBusyKey("");
    }
  };

  const clearOrder = (orderId: string) =>
    runAction(
      `clear:${orderId}`,
      () =>
        clearFn({
          data:
            role === "merchant"
              ? { role: "merchant", token: merchantToken, orderId }
              : {
                  role: "requester",
                  requesterPhone,
                  requesterType,
                  orderId,
                },
        }),
      "تم مسح الطلب من القائمة",
    );

  const clearAll = async () => {
    const visible = [...orders];
    if (visible.length === 0) return;
    setBusyKey("clear-all");
    try {
      for (const order of visible) {
        await clearFn({
          data:
            role === "merchant"
              ? { role: "merchant", token: merchantToken, orderId: order.orderId }
              : {
                  role: "requester",
                  requesterPhone,
                  requesterType,
                  orderId: order.orderId,
                },
        });
      }
      toast.success("تم مسح الطلبات الأخيرة");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر مسح الطلبات");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <span className="relative inline-flex">
              <BellRing className="h-5 w-5 text-primary" />
              {notificationCount > 0 ? (
                <span className="absolute -end-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {notificationCount}
                </span>
              ) : null}
            </span>
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            تظهر هنا نفس طلبات الواتساب مع أزرار المتابعة داخل الموقع.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{notificationCount} إشعار جديد</Badge>
          <Badge variant={actionableCount > 0 ? "default" : "secondary"}>{actionableCount} بحاجة إجراء</Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={clearAll}
            disabled={orders.length === 0 || busyKey === "clear-all"}
          >
            {busyKey === "clear-all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            مسح الطلبات الأخيرة
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          جار تحميل الإشعارات...
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          لا توجد طلبات حديثة حالياً.
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const busy = (suffix: string) => busyKey === `${suffix}:${order.orderId}`;
            const draft = ratingDrafts[order.orderId] ?? { rating: 5, comment: "" };
            const canRate =
              role === "requester" &&
              order.merchantStatus === "Sold" &&
              order.requesterStatus === "Purchased" &&
              !order.rating;

            return (
              <article key={order.orderId} className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start">
                  {order.imageUrl ? (
                    <img
                      src={order.imageUrl}
                      alt={order.productTitle}
                      className="h-20 w-20 rounded-lg border object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{order.productTitle}</h3>
                      <Badge variant="secondary">{statusLabel(order)}</Badge>
                    </div>
                    <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                      <span>نوع السيارة: {order.carMake || "غير محدد"}</span>
                      <span>الموديل: {order.carModel || "غير محدد"}</span>
                      {role === "merchant" ? (
                        <span>مقدم الطلب: {order.requesterType === "fitter" ? "فيتر" : "زبون"}</span>
                      ) : (
                        <span>التاجر: {order.merchantStoreName || "غير محدد"}</span>
                      )}
                      {order.price > 0 ? (
                        <span>
                          السعر: {order.price.toLocaleString()} {order.currency}
                        </span>
                      ) : null}
                    </div>
                    {role === "requester" && order.merchantStatus === "Available" ? (
                      <p className="mt-3 rounded-lg bg-secondary/70 p-3 text-sm">
                        يرجى اكمال عملية الشراء من خلال الوسيط قبل الضغط على أزرار تم الشراء، أو الغِ العملية في حال عدم التوصل إلى اتفاق. هل تم شراء المنتج المطلوب؟
                      </p>
                    ) : null}
                    {order.rating ? (
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-4 w-4 fill-primary text-primary" />
                        تقييمك للتاجر: {order.rating}/5
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {role === "merchant" && order.merchantStatus === "Pending" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2"
                      disabled={busy("available")}
                      onClick={() =>
                        runAction(
                          `available:${order.orderId}`,
                          () => availableFn({ data: { token: merchantToken, orderId: order.orderId } }),
                          "تم تأكيد توفر المنتج",
                        )
                      }
                    >
                      {busy("available") ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                      المنتج متوفر
                    </Button>
                  ) : null}

                  {role === "merchant" && order.merchantStatus === "Available" ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2"
                        disabled={busy("sold")}
                        onClick={() =>
                          runAction(
                            `sold:${order.orderId}`,
                            () =>
                              merchantSaleFn({
                                data: { token: merchantToken, orderId: order.orderId, result: "sold" },
                              }),
                            "تم تسجيل بيع المنتج",
                          )
                        }
                      >
                        {busy("sold") ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        تم بيع المنتج
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                        disabled={busy("merchant-cancel")}
                        onClick={() =>
                          runAction(
                            `merchant-cancel:${order.orderId}`,
                            () =>
                              merchantSaleFn({
                                data: { token: merchantToken, orderId: order.orderId, result: "cancelled" },
                              }),
                            "تم إلغاء الطلب",
                          )
                        }
                      >
                        {busy("merchant-cancel") ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                        تم إلغاء الطلب
                      </Button>
                    </>
                  ) : null}

                  {role === "requester" &&
                  order.merchantStatus === "Available" &&
                  order.requesterStatus === "Pending" ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2"
                        disabled={busy("purchased")}
                        onClick={() =>
                          runAction(
                            `purchased:${order.orderId}`,
                            () =>
                              requesterPurchaseFn({
                                data: {
                                  requesterPhone,
                                  requesterType,
                                  orderId: order.orderId,
                                  result: "purchased",
                                },
                              }),
                            "تم تأكيد الشراء",
                          )
                        }
                      >
                        {busy("purchased") ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        تم الشراء
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                        disabled={busy("requester-cancel")}
                        onClick={() =>
                          runAction(
                            `requester-cancel:${order.orderId}`,
                            () =>
                              requesterPurchaseFn({
                                data: {
                                  requesterPhone,
                                  requesterType,
                                  orderId: order.orderId,
                                  result: "cancelled",
                                },
                              }),
                            "تم إلغاء الطلب",
                          )
                        }
                      >
                        {busy("requester-cancel") ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                        تم إلغاء الطلب
                      </Button>
                    </>
                  ) : null}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-muted-foreground"
                    disabled={busy("clear")}
                    onClick={() => clearOrder(order.orderId)}
                  >
                    {busy("clear") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    مسح
                  </Button>
                </div>

                {canRate ? (
                  <div className="mt-4 rounded-lg border border-dashed border-border p-3">
                    <div className="mb-2 text-sm font-medium">تقييم التاجر اختياري</div>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <Button
                          key={value}
                          type="button"
                          size="sm"
                          variant={draft.rating === value ? "default" : "outline"}
                          onClick={() =>
                            setRatingDrafts((current) => ({
                              ...current,
                              [order.orderId]: { ...draft, rating: value },
                            }))
                          }
                        >
                          {value}
                        </Button>
                      ))}
                    </div>
                    <Textarea
                      className="mt-3"
                      rows={2}
                      value={draft.comment}
                      onChange={(event) =>
                        setRatingDrafts((current) => ({
                          ...current,
                          [order.orderId]: { ...draft, comment: event.target.value },
                        }))
                      }
                      placeholder="ملاحظة اختيارية عن التاجر"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="mt-3 gap-2"
                      disabled={busy("rate")}
                      onClick={() =>
                        runAction(
                          `rate:${order.orderId}`,
                          () =>
                            rateFn({
                              data: {
                                requesterPhone,
                                requesterType,
                                orderId: order.orderId,
                                rating: draft.rating,
                                comment: draft.comment,
                              },
                            }),
                          "تم حفظ تقييم التاجر",
                        )
                      }
                    >
                      {busy("rate") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                      حفظ التقييم
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function statusLabel(order: WebOrderNotification) {
  if (order.merchantStatus === "Sold" && order.requesterStatus === "Purchased") return "مكتملة";
  if (order.merchantStatus === "Cancelled" && order.requesterStatus === "Cancelled") return "ملغاة";
  if (order.merchantStatus === "Available") return "المنتج متوفر";
  if (order.merchantStatus === "Sold") return "بانتظار تأكيد الزبون";
  if (order.requesterStatus === "Purchased") return "بانتظار تأكيد التاجر";
  return "قيد المتابعة";
}

function playNotificationBell() {
  if (typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
    gain.connect(context.destination);

    [880, 1175].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      const start = context.currentTime + index * 0.16;
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    });

    window.setTimeout(() => context.close().catch(() => {}), 800);
  } catch {
    // Some browsers block audio until the user interacts with the page.
  }
}

function readNotifiedIds(key: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(key);
    const values = raw ? (JSON.parse(raw) as unknown[]) : [];
    return new Set(values.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set<string>();
  }
}

function saveNotifiedIds(key: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids].slice(-200)));
  } catch {
    // Ignore storage failures; the notification UI still works.
  }
}

function hasUnreadNotification(order: WebOrderNotification, role: "merchant" | "requester") {
  if (role === "merchant") return order.merchantStatus === "Pending";
  return order.merchantStatus === "Available" && order.requesterStatus === "Pending";
}

function hasActions(order: WebOrderNotification, role: "merchant" | "requester") {
  if (role === "merchant") return order.merchantStatus === "Pending" || order.merchantStatus === "Available";
  return order.merchantStatus === "Available" && order.requesterStatus === "Pending";
}
