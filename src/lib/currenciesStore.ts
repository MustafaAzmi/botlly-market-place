import { useQuery } from "@tanstack/react-query";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendEvent,
  getString,
  listEvents,
  listEventsByPayloadField,
  sha256,
} from "@/lib/eventStore.server";

export interface Currency {
  code: string;
  label: string;
  active: boolean;
}

export const DEFAULT_CURRENCIES: Currency[] = [
  { code: "IQD", label: "دينار عراقي", active: true },
  { code: "USD", label: "دولار أمريكي", active: true },
];

const ALLOWED_CURRENCY_CODES = new Set(DEFAULT_CURRENCIES.map((currency) => currency.code));

const tokenInput = z.object({ token: z.string().trim().min(20).max(300) });
const currencyInput = z.object({
  code: z.string().trim().min(2).max(8).regex(/^[A-Za-z]+$/),
  label: z.string().trim().min(1).max(60),
  active: z.boolean(),
});

function normalizeCurrency(input: Currency): Currency {
  return {
    code: input.code.trim().toUpperCase(),
    label: input.label.trim(),
    active: input.active,
  };
}

async function authorizeCurrencyAdmin(token: string): Promise<void> {
  const tokenHash = await sha256(token);
  const sessions = await listEventsByPayloadField(
    "botly_admin_session",
    "tokenHash",
    tokenHash,
    1,
  );
  const activeSession = sessions.find((row) => {
    const payload = row.payload ?? {};
    return (
      getString(payload.tokenHash) === tokenHash &&
      new Date(getString(payload.expiresAt)).getTime() > Date.now()
    );
  });
  if (!activeSession) throw new Error("انتهت جلسة الأدمن. سجّل الدخول مرة ثانية.");
}

async function readCurrenciesFromDb(): Promise<Currency[]> {
  const rows = await listEvents("botly_currency");
  const saved = new Map<string, Currency | null>();

  for (const row of rows) {
    const code = getString(row.payload?.code).trim().toUpperCase();
    if (!code || saved.has(code)) continue;
    if (!ALLOWED_CURRENCY_CODES.has(code)) continue;
    if (row.payload?.deleted === true) {
      saved.set(code, null);
      continue;
    }
    saved.set(code, {
      code,
      label: getString(row.payload?.label) || code,
      active: row.payload?.active !== false,
    });
  }

  const merged = new Map<string, Currency | null>(
    DEFAULT_CURRENCIES.map((currency) => [currency.code, currency]),
  );
  for (const [code, currency] of saved) {
    merged.set(code, currency);
  }

  const currencies = [...merged.values()].filter((currency): currency is Currency =>
    Boolean(currency),
  );

  return saved.size === 0 ? DEFAULT_CURRENCIES : currencies;
}

export const listPlatformCurrencies = createServerFn({ method: "GET" }).handler(
  async (): Promise<Currency[]> => readCurrenciesFromDb(),
);

export const savePlatformCurrency = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    tokenInput
      .extend({
        currency: currencyInput,
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<Currency[]> => {
    await authorizeCurrencyAdmin(data.token);
    const currency = normalizeCurrency(data.currency);
    if (!ALLOWED_CURRENCY_CODES.has(currency.code)) {
      throw new Error("هذه العملة غير متاحة حالياً.");
    }
    await appendEvent("botly_currency", {
      ...currency,
      deleted: false,
      updatedAt: new Date().toISOString(),
    });
    return readCurrenciesFromDb();
  });

export const deletePlatformCurrency = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    tokenInput
      .extend({
        code: z.string().trim().min(2).max(8),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<Currency[]> => {
    await authorizeCurrencyAdmin(data.token);
    await appendEvent("botly_currency", {
      code: data.code.trim().toUpperCase(),
      deleted: true,
      updatedAt: new Date().toISOString(),
    });
    return readCurrenciesFromDb();
  });

export function useCurrencies(): Currency[] {
  const listCurrencies = useServerFn(listPlatformCurrencies);
  const { data } = useQuery({
    queryKey: ["platform-currencies"],
    queryFn: () => listCurrencies(),
    initialData: DEFAULT_CURRENCIES,
    staleTime: 30_000,
  });

  return data ?? DEFAULT_CURRENCIES;
}
