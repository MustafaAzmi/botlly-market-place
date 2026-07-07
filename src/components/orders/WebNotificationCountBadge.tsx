import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listMerchantWebNotifications,
  listRequesterWebNotifications,
  type WebOrderNotification,
} from "@/lib/web-notifications.functions";
import {
  readNotificationIds,
  ringUnseenNotificationIds,
  updateInstalledAppBadge,
} from "@/lib/web-notification-client";

export type WebNotificationCountProps =
  | {
      role: "merchant";
      token: string;
    }
  | {
      role: "requester";
      requesterType: "customer" | "fitter";
      requesterPhone: string;
    };

const NOTIFICATION_POLL_INTERVAL_MS = 180_000;

export function useWebNotificationCount(props: WebNotificationCountProps) {
  const role = props.role;
  const token = props.role === "merchant" ? props.token : "";
  const requesterPhone = props.role === "requester" ? props.requesterPhone : "";
  const requesterType = props.role === "requester" ? props.requesterType : "customer";
  const listMerchantFn = useServerFn(listMerchantWebNotifications);
  const listRequesterFn = useServerFn(listRequesterWebNotifications);
  const [count, setCount] = useState(0);

  const seenStorageKey = useMemo(
    () =>
      `botly_web_notifications_seen:${role}:${
        role === "merchant" ? token.slice(-16) : `${requesterType}:${requesterPhone}`
      }`,
    [requesterPhone, requesterType, role, token],
  );
  const rungStorageKey = useMemo(
    () =>
      `botly_web_notifications_rung:${role}:${
        role === "merchant" ? token.slice(-16) : `${requesterType}:${requesterPhone}`
      }`,
    [requesterPhone, requesterType, role, token],
  );

  const refresh = useCallback(async () => {
    if (role === "merchant" && !token) return;
    if (role === "requester" && !requesterPhone) return;
    const orders =
      role === "merchant"
        ? await listMerchantFn({ data: { token, page: 1, limit: 20 } })
        : await listRequesterFn({
            data: { requesterPhone, requesterType, page: 1, limit: 20 },
          });
    const unreadOrders = orders.items.filter((order) => hasBadgeNotification(order, role));
    const unreadIds = unreadOrders.map((order) => order.orderId);
    const seenIds = readNotificationIds(seenStorageKey);
    const unseenIds = unreadIds.filter((orderId) => !seenIds.has(orderId));
    ringUnseenNotificationIds(rungStorageKey, unseenIds);
    updateInstalledAppBadge(unseenIds.length);
    setCount(unseenIds.length);
  }, [listMerchantFn, listRequesterFn, requesterPhone, requesterType, role, rungStorageKey, seenStorageKey, token]);

  useEffect(() => {
    refresh().catch(() => {});
    const timer = window.setInterval(() => {
      refresh().catch(() => {});
    }, NOTIFICATION_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return count;
}

export function WebNotificationCountValue({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ms-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-none text-destructive-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function WebNotificationCountBadge(props: WebNotificationCountProps) {
  return <WebNotificationCountValue count={useWebNotificationCount(props)} />;
}

function hasBadgeNotification(order: WebOrderNotification, role: "merchant" | "requester") {
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
