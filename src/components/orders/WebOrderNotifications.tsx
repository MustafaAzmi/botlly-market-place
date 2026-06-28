import { useServerFn } from "@tanstack/react-start";
import { BellRing, CheckCircle2, Loader2, PackageCheck, Star, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { Locale } from "@/i18n/translations";
import {
  clearWebOrderNotification,
  clearWebOrderNotificationsBulk,
  listMerchantWebNotifications,
  listRequesterWebNotifications,
  merchantConfirmWebSale,
  merchantMarkProductAvailable,
  merchantMarkProductUnavailable,
  rateMerchantFromWeb,
  requesterConfirmWebPurchase,
  type WebOrderNotification,
  } from "@/lib/web-notifications.functions";

const notificationCopy = {
  ar: {
    merchantTitle: "إشعارات وطلبات التاجر",
    customerTitle: "إشعارات الزبون",
    fitterTitle: "إشعارات الفيتر",
    subtitle: "تظهر هنا طلباتك مع أزرار المتابعة داخل الموقع.",
    newNotification: "إشعار جديد",
    needsAction: "بحاجة إجراء",
    clearRecent: "مسح الطلبات الأخيرة",
    loading: "جار تحميل الإشعارات...",
    empty: "لا توجد طلبات حديثة حالياً.",
    carMake: "نوع السيارة",
    model: "الموديل",
    description: "الوصف",
    requester: "مقدم الطلب",
    customer: "زبون",
    fitter: "فيتر",
    merchant: "التاجر",
    price: "السعر",
    unspecified: "غير محدد",
    purchasePrompt:
      "يرجى إكمال عملية الشراء من خلال الوسيط قبل الضغط على أزرار تم الشراء، أو ألغِ العملية في حال عدم التوصل إلى اتفاق. هل تم شراء المنتج المطلوب؟",
    mediatorPhone: "رقم الوسيط",
    merchantPhone: "رقم التاجر",
    unavailableNotice: "أبلغ التاجر أن المنتج غير متوفر حالياً.",
    customerPurchasedNotice: "الزبون قام بتأكيد الشراء",
    yourRating: "تقييمك للتاجر",
    productAvailable: "المنتج متوفر",
    productUnavailable: "المنتج غير متوفر",
    productSold: "تم بيع المنتج",
    orderCancelled: "تم إلغاء الطلب",
    purchased: "تم الشراء",
    clear: "مسح",
    optionalRating: "تقييم التاجر اختياري",
    optionalNote: "ملاحظة اختيارية عن التاجر",
    saveRating: "حفظ التقييم",
    completed: "مكتملة",
    cancelled: "ملغاة",
    waitingCustomer: "بانتظار تأكيد الزبون",
    waitingMerchant: "بانتظار تأكيد التاجر",
    following: "قيد المتابعة",
    loadError: "تعذر تحميل إشعارات الطلبات",
    actionError: "تعذر تنفيذ العملية",
    clearError: "تعذر مسح الطلبات",
    clearedOrder: "تم مسح الطلب من القائمة",
    clearedRecent: "تم مسح الطلبات الأخيرة",
    availableSuccess: "تم تأكيد توفر المنتج",
    unavailableSuccess: "تم إشعار الزبون بعدم توفر المنتج",
    soldSuccess: "تم تسجيل بيع المنتج",
    purchaseSuccess: "تم تأكيد الشراء",
    ratingSuccess: "تم حفظ تقييم التاجر",
  },
  ku: {
    merchantTitle: "ئاگادارکردنەوە و داواکارییەکانی فرۆشیار",
    customerTitle: "ئاگادارکردنەوەکانی کڕیار",
    fitterTitle: "ئاگادارکردنەوەکانی فیتەر",
    subtitle: "داواکارییەکانت لێرە لەگەڵ دوگمەکانی بەدواداچوون لە ناو ماڵپەڕدا پیشان دەدرێن.",
    newNotification: "ئاگادارکردنەوەی نوێ",
    needsAction: "پێویستی بە کردارە",
    clearRecent: "سڕینەوەی داواکارییە کۆنەکان",
    loading: "ئاگادارکردنەوەکان بار دەکرێن...",
    empty: "لە ئێستادا هیچ داواکارییەکی نوێ نییە.",
    carMake: "جۆری ئۆتۆمبێل",
    model: "مۆدێل",
    description: "وەسف",
    requester: "داواکار",
    customer: "کڕیار",
    fitter: "فیتەر",
    merchant: "فرۆشیار",
    price: "نرخ",
    unspecified: "دیاری نەکراوە",
    purchasePrompt:
      "تکایە پێش کرتەکردن لە دوگمەی کڕدرا، مامەڵەی کڕین لە ڕێگەی ناوبژیوانەوە تەواو بکە؛ ئەگەر ڕێککەوتن نەکرا داواکارییەکە هەڵبوەشێنەوە. ئایا بەرهەمە داواکراوەکەت کڕی؟",
    mediatorPhone: "ژمارەی ناوبژیوان",
    merchantPhone: "ژمارەی فرۆشیار",
    unavailableNotice: "فرۆشیار ڕایگەیاند کە بەرهەمەکە لە ئێستادا بەردەست نییە.",
    customerPurchasedNotice: "کڕیار کڕینەکەی پشتڕاست کردەوە",
    yourRating: "هەڵسەنگاندنت بۆ فرۆشیار",
    productAvailable: "بەرهەمەکە بەردەستە",
    productUnavailable: "بەرهەمەکە بەردەست نییە",
    productSold: "بەرهەمەکە فرۆشرا",
    orderCancelled: "داواکارییەکە هەڵوەشێندرایەوە",
    purchased: "کڕدرا",
    clear: "سڕینەوە",
    optionalRating: "هەڵسەنگاندنی فرۆشیار ئارەزوومەندانەیە",
    optionalNote: "تێبینییەکی ئارەزوومەندانە دەربارەی فرۆشیار",
    saveRating: "پاشەکەوتکردنی هەڵسەنگاندن",
    completed: "تەواوبوو",
    cancelled: "هەڵوەشاوە",
    waitingCustomer: "چاوەڕوانی پشتڕاستکردنەوەی کڕیار",
    waitingMerchant: "چاوەڕوانی پشتڕاستکردنەوەی فرۆشیار",
    following: "لە ژێر بەدواداچووندایە",
    loadError: "بارکردنی ئاگادارکردنەوەکان سەرکەوتوو نەبوو",
    actionError: "جێبەجێکردنی کردارەکە سەرکەوتوو نەبوو",
    clearError: "سڕینەوەی داواکارییەکان سەرکەوتوو نەبوو",
    clearedOrder: "داواکارییەکە لە لیستەکە سڕایەوە",
    clearedRecent: "داواکارییە کۆنەکان سڕانەوە",
    availableSuccess: "بەردەستبوونی بەرهەمەکە پشتڕاست کرایەوە",
    unavailableSuccess: "کڕیار لە بەردەست نەبوونی بەرهەمەکە ئاگادار کرایەوە",
    soldSuccess: "فرۆشتنی بەرهەمەکە تۆمار کرا",
    purchaseSuccess: "کڕینەکە پشتڕاست کرایەوە",
    ratingSuccess: "هەڵسەنگاندنی فرۆشیار پاشەکەوت کرا",
  },
  en: {
    merchantTitle: "Merchant notifications and requests",
    customerTitle: "Customer notifications",
    fitterTitle: "Fitter notifications",
    subtitle: "Your requests and follow-up actions appear here.",
    newNotification: "new notification",
    needsAction: "needs action",
    clearRecent: "Clear recent requests",
    loading: "Loading notifications...",
    empty: "There are no recent requests.",
    carMake: "Car make",
    model: "Model",
    description: "Description",
    requester: "Requester",
    customer: "Customer",
    fitter: "Fitter",
    merchant: "Merchant",
    price: "Price",
    unspecified: "Not specified",
    purchasePrompt:
      "Please complete the purchase through the mediator before confirming it, or cancel the request if no agreement was reached. Was the requested product purchased?",
    mediatorPhone: "Mediator number",
    merchantPhone: "Merchant number",
    unavailableNotice: "The merchant reported that the product is currently unavailable.",
    customerPurchasedNotice: "The customer confirmed the purchase",
    yourRating: "Your merchant rating",
    productAvailable: "Product available",
    productUnavailable: "Product unavailable",
    productSold: "Product sold",
    orderCancelled: "Request cancelled",
    purchased: "Purchased",
    clear: "Clear",
    optionalRating: "Merchant rating (optional)",
    optionalNote: "Optional note about the merchant",
    saveRating: "Save rating",
    completed: "Completed",
    cancelled: "Cancelled",
    waitingCustomer: "Waiting for customer confirmation",
    waitingMerchant: "Waiting for merchant confirmation",
    following: "In progress",
    loadError: "Could not load request notifications",
    actionError: "Could not complete the action",
    clearError: "Could not clear requests",
    clearedOrder: "Request removed from the list",
    clearedRecent: "Recent requests cleared",
    availableSuccess: "Product availability confirmed",
    unavailableSuccess: "Customer notified that the product is unavailable",
    soldSuccess: "Product sale recorded",
    purchaseSuccess: "Purchase confirmed",
    ratingSuccess: "Merchant rating saved",
  },
} as const satisfies Record<Locale, Record<string, string>>;

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
  const { locale } = useLanguage();
  const text = notificationCopy[locale];
  const role = props.role;
  const merchantToken = props.role === "merchant" ? props.token : "";
  const requesterPhone = props.role === "requester" ? props.requesterPhone : "";
  const requesterType = props.role === "requester" ? props.requesterType : "customer";
  const listMerchantFn = useServerFn(listMerchantWebNotifications);
  const listRequesterFn = useServerFn(listRequesterWebNotifications);
  const availableFn = useServerFn(merchantMarkProductAvailable);
  const unavailableFn = useServerFn(merchantMarkProductUnavailable);
  const merchantSaleFn = useServerFn(merchantConfirmWebSale);
  const requesterPurchaseFn = useServerFn(requesterConfirmWebPurchase);
  const clearFn = useServerFn(clearWebOrderNotification);
  const clearBulkFn = useServerFn(clearWebOrderNotificationsBulk);
  const rateFn = useServerFn(rateMerchantFromWeb);
  const [orders, setOrders] = useState<WebOrderNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [ratingDrafts, setRatingDrafts] = useState<Record<string, { rating: number; comment: string }>>({});
  const [seenNotificationIds, setSeenNotificationIds] = useState<Set<string>>(new Set());
  const notifiedStorageKey = useMemo(
    () =>
      `botly_web_notifications_seen:${role}:${
        role === "merchant" ? merchantToken.slice(-16) : `${requesterType}:${requesterPhone}`
      }`,
    [merchantToken, requesterPhone, requesterType, role],
  );
  const rungStorageKey = useMemo(
    () =>
      `botly_web_notifications_rung:${role}:${
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
      const rungIds = readNotifiedIds(rungStorageKey);
      const unrungIds = actionableIds.filter((orderId) => !rungIds.has(orderId));
      if (unrungIds.length > 0) {
        playNotificationBell();
        saveNotifiedIds(rungStorageKey, new Set([...rungIds, ...unrungIds]));
      }
      const nextSeenIds = new Set([...notifiedIds, ...actionableIds]);
      saveNotifiedIds(notifiedStorageKey, nextSeenIds);
      setSeenNotificationIds(nextSeenIds);
      setOrders(visibleOrders);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.loadError);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [listMerchantFn, listRequesterFn, merchantToken, notifiedStorageKey, requesterPhone, requesterType, role, rungStorageKey, text.loadError]);

  useEffect(() => {
    refresh().catch(() => {});
    const timer = window.setInterval(() => {
      refresh(true).catch(() => {});
    }, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const title =
    props.title ??
    (role === "merchant"
      ? text.merchantTitle
      : requesterType === "fitter"
        ? text.fitterTitle
        : text.customerTitle);
  const actionableCount = useMemo(
    () => orders.filter((order) => hasActions(order, role)).length,
    [orders, role],
  );
  const notificationCount = useMemo(
    () => orders.filter((order) => hasUnreadNotification(order, role) && !seenNotificationIds.has(order.orderId)).length,
    [orders, role, seenNotificationIds],
  );

  const runAction = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusyKey(key);
    try {
      await action();
      toast.success(success);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.actionError);
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
      text.clearedOrder,
    );

  const clearAll = async () => {
    const visible = [...orders];
    if (visible.length === 0) return;
    setBusyKey("clear-all");
    try {
      const orderIds = visible.map((order) => order.orderId);
      await clearBulkFn({
        data:
          role === "merchant"
            ? { role: "merchant", token: merchantToken, orderIds }
            : {
                role: "requester",
                requesterPhone,
                requesterType,
                orderIds,
              },
      });
      setOrders((current) => current.filter((order) => !orderIds.includes(order.orderId)));
      toast.success(text.clearedRecent);
      refresh(true).catch(() => {});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.clearError);
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
            {text.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{notificationCount} {text.newNotification}</Badge>
          <Badge variant={actionableCount > 0 ? "default" : "secondary"}>{actionableCount} {text.needsAction}</Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={clearAll}
            disabled={orders.length === 0 || busyKey === "clear-all"}
          >
            {busyKey === "clear-all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {text.clearRecent}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          {text.loading}
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {text.empty}
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
                      <Badge variant="secondary">{statusLabel(order, text)}</Badge>
                    </div>
                    <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                      <span>{text.carMake}: {order.carMake || text.unspecified}</span>
                      <span>{text.model}: {order.carModel || text.unspecified}</span>
                      {order.requestDetails ? (
                        <span className="sm:col-span-2">{text.description}: {order.requestDetails}</span>
                      ) : null}
                      {role === "merchant" ? (
                        <span>{text.requester}: {order.requesterType === "fitter" ? text.fitter : text.customer}</span>
                      ) : (
                        <span>{text.merchant}: {order.merchantStoreName || text.unspecified}</span>
                      )}
                      {order.price > 0 ? (
                        <span>
                          {text.price}: {order.price.toLocaleString()} {order.currency}
                        </span>
                      ) : null}
                    </div>
                    {role === "requester" &&
                    (order.merchantStatus === "Available" || order.merchantStatus === "Sold") &&
                    order.requesterStatus === "Pending" ? (
                      <div className="mt-3 space-y-2 rounded-lg bg-secondary/70 p-3 text-sm">
                        <p>{text.purchasePrompt}</p>
                        {order.mediatorPhone ? (
                          <ContactLink label={text.mediatorPhone} phone={order.mediatorPhone} />
                        ) : null}
                        {order.merchantPhoneVisible && order.merchantWhatsapp ? (
                          <ContactLink label={text.merchantPhone} phone={order.merchantWhatsapp} />
                        ) : null}
                      </div>
                    ) : null}
                    {role === "requester" && order.merchantStatus === "Unavailable" ? (
                      <p className="mt-3 rounded-lg bg-secondary/70 p-3 text-sm">
                        {text.unavailableNotice}
                      </p>
                    ) : null}
                    {role === "merchant" && order.requesterStatus === "Purchased" ? (
                      <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                        {text.customerPurchasedNotice}
                      </p>
                    ) : null}
                    {order.rating ? (
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-4 w-4 fill-primary text-primary" />
                        {text.yourRating}: {order.rating}/5
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {role === "merchant" && order.merchantStatus === "Pending" ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2"
                        disabled={busy("available")}
                        onClick={() =>
                          runAction(
                            `available:${order.orderId}`,
                            () => availableFn({ data: { token: merchantToken, orderId: order.orderId } }),
                            text.availableSuccess,
                          )
                        }
                      >
                        {busy("available") ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                        {text.productAvailable}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                        disabled={busy("unavailable")}
                        onClick={() =>
                          runAction(
                            `unavailable:${order.orderId}`,
                            () => unavailableFn({ data: { token: merchantToken, orderId: order.orderId } }),
                            text.unavailableSuccess,
                          )
                        }
                      >
                        {busy("unavailable") ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                        {text.productUnavailable}
                      </Button>
                    </>
                  ) : null}

                  {role === "merchant" && order.merchantStatus === "Available" && order.requesterStatus === "Pending" ? (
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
                            text.soldSuccess,
                          )
                        }
                      >
                        {busy("sold") ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {text.productSold}
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
                            text.orderCancelled,
                          )
                        }
                      >
                        {busy("merchant-cancel") ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                        {text.orderCancelled}
                      </Button>
                    </>
                  ) : null}

                  {role === "requester" &&
                  (order.merchantStatus === "Available" || order.merchantStatus === "Sold") &&
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
                            text.purchaseSuccess,
                          )
                        }
                      >
                        {busy("purchased") ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {text.purchased}
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
                            text.orderCancelled,
                          )
                        }
                      >
                        {busy("requester-cancel") ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                        {text.orderCancelled}
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
                    {text.clear}
                  </Button>
                </div>

                {canRate ? (
                  <div className="mt-4 rounded-lg border border-dashed border-border p-3">
                    <div className="mb-2 text-sm font-medium">{text.optionalRating}</div>
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
                      placeholder={text.optionalNote}
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
                          text.ratingSuccess,
                        )
                      }
                    >
                      {busy("rate") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                      {text.saveRating}
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

function ContactLink({ label, phone }: { label: string; phone: string }) {
  return (
    <a
      href={toWhatsAppLink(phone)}
      target="_blank"
      rel="noreferrer"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-background px-3 py-2 font-medium text-primary hover:bg-primary/5"
    >
      <span>{label}</span>
      <span dir="ltr">{phone}</span>
    </a>
  );
}

function toWhatsAppLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "#";
  const normalized = digits.startsWith("0") ? `964${digits.slice(1)}` : digits;
  return `https://wa.me/${normalized}`;
}

function statusLabel(order: WebOrderNotification, text: (typeof notificationCopy)[Locale]) {
  if (order.merchantStatus === "Sold" && order.requesterStatus === "Purchased") return text.completed;
  if (order.merchantStatus === "Cancelled" && order.requesterStatus === "Cancelled") return text.cancelled;
  if (order.merchantStatus === "Available") return text.productAvailable;
  if (order.merchantStatus === "Unavailable") return text.productUnavailable;
  if (order.merchantStatus === "Sold") return text.waitingCustomer;
  if (order.requesterStatus === "Purchased") return text.waitingMerchant;
  return text.following;
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
  saveStoredIds(key, ids);
}

function saveStoredIds(key: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids].slice(-200)));
  } catch {
    // Ignore storage failures; the notification UI still works.
  }
}

function hasUnreadNotification(order: WebOrderNotification, role: "merchant" | "requester") {
  if (role === "merchant") {
    return (
      order.merchantStatus === "Pending" ||
      order.requesterStatus === "Purchased"
    );
  }
  return (
    (order.merchantStatus === "Available" ||
      order.merchantStatus === "Unavailable" ||
      order.merchantStatus === "Sold") &&
    order.requesterStatus === "Pending"
  );
}

function hasActions(order: WebOrderNotification, role: "merchant" | "requester") {
  if (role === "merchant") {
    return order.merchantStatus === "Pending" || (order.merchantStatus === "Available" && order.requesterStatus === "Pending");
  }
  return (
    (order.merchantStatus === "Available" || order.merchantStatus === "Sold") &&
    order.requesterStatus === "Pending"
  );
}
