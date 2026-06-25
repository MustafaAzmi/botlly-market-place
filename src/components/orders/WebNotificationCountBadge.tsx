import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listMerchantWebNotifications,
  listRequesterWebNotifications,
  type WebOrderNotification,
} from "@/lib/web-notifications.functions";

type Props =
  | {
      role: "merchant";
      token: string;
    }
  | {
      role: "requester";
      requesterType: "customer" | "fitter";
      requesterPhone: string;
    };

export function WebNotificationCountBadge(props: Props) {
  const role = props.role;
  const token = props.role === "merchant" ? props.token : "";
  const requesterPhone = props.role === "requester" ? props.requesterPhone : "";
  const requesterType = props.role === "requester" ? props.requesterType : "customer";
  const listMerchantFn = useServerFn(listMerchantWebNotifications);
  const listRequesterFn = useServerFn(listRequesterWebNotifications);
  const [count, setCount] = useState(0);

  const seenStorageKey = useMemo(
    () =>
      `botly_web_notifications_badge_seen:${role}:${
        role === "merchant" ? token.slice(-16) : `${requesterType}:${requesterPhone}`
      }`,
    [requesterPhone, requesterType, role, token],
  );

  const refresh = useCallback(async () => {
    if (role === "merchant" && !token) return;
    if (role === "requester" && !requesterPhone) return;
    const orders =
      role === "merchant"
        ? await listMerchantFn({ data: { token } })
        : await listRequesterFn({ data: { requesterPhone, requesterType } });
    const unreadOrders = orders.filter((order) => hasBadgeNotification(order, role));
    const unreadIds = unreadOrders.map((order) => order.orderId);
    const seenIds = readStoredIds(seenStorageKey);
    const newIds = unreadIds.filter((orderId) => !seenIds.has(orderId));
    if (newIds.length > 0) {
      playNotificationBell();
      saveStoredIds(seenStorageKey, new Set([...seenIds, ...newIds]));
    }
    setCount(unreadOrders.length);
  }, [listMerchantFn, listRequesterFn, requesterPhone, requesterType, role, seenStorageKey, token]);

  useEffect(() => {
    refresh().catch(() => {});
    const timer = window.setInterval(() => {
      refresh().catch(() => {});
    }, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (count <= 0) return null;
  return (
    <span className="ms-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-none text-destructive-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function hasBadgeNotification(order: WebOrderNotification, role: "merchant" | "requester") {
  if (role === "merchant") return order.merchantStatus === "Pending";
  return (
    (order.merchantStatus === "Available" || order.merchantStatus === "Unavailable") &&
    order.requesterStatus === "Pending"
  );
}

function readStoredIds(key: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(key);
    const values = raw ? (JSON.parse(raw) as unknown[]) : [];
    return new Set(values.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set<string>();
  }
}

function saveStoredIds(key: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids].slice(-200)));
  } catch {
    // The badge still works even when localStorage is unavailable.
  }
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
    // Browsers can block audio until the user interacts with the page.
  }
}
