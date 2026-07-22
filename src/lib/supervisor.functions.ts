import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { authorizeAdmin } from "@/lib/admin.functions";
import {
  appendEvent,
  getString,
  latestEventWhere,
  listEventsPage,
  normalizePhone,
  randomToken,
  sha256,
  type EventRow,
} from "@/lib/eventStore.server";
import { normalizeGovernorate } from "@/lib/governorates";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";

const SUPERVISOR_SESSION_DAYS = 7;

const adminTokenInput = z.object({
  token: z.string().trim().min(20).max(300),
});

const createSupervisorInput = adminTokenInput.extend({
  name: z.string().trim().min(2).max(100),
  whatsapp: z.string().trim().min(6).max(40),
  password: z.string().min(6).max(200),
});

const supervisorActionInput = adminTokenInput.extend({
  supervisorId: z.string().trim().min(1),
  active: z.boolean(),
});

const loginInput = z.object({
  whatsapp: z.string().trim().min(6).max(40),
  password: z.string().min(6).max(200),
});

const supervisorTokenInput = z.object({
  token: z.string().trim().min(20).max(300),
});

const createMerchantInput = supervisorTokenInput.extend({
  storeName: z.string().trim().min(2).max(140),
  whatsapp: z.string().trim().min(6).max(40),
  temporaryPassword: z.string().min(6).max(200),
  governorate: z.string().trim().min(2).max(100),
  carMakes: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  carModels: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  specialties: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
  servesAllGovernorates: z.boolean().default(false),
});

const createFitterInput = supervisorTokenInput.extend({
  name: z.string().trim().min(2).max(100),
  whatsapp: z.string().trim().min(6).max(40),
  temporaryPassword: z.string().min(6).max(200),
  governorate: z.string().trim().min(2).max(100),
  address: z.string().trim().min(2).max(200),
});

function supervisorIdentity(row: EventRow) {
  return getString(row.payload?.supervisorId) || row.id;
}

async function hashPassword(password: string, salt: string) {
  return sha256(`${salt}:${password}`);
}

async function findSupervisorByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  return (
    await latestEventWhere("botly_supervisor", "whatsappNormalized", normalized)
    ?? await latestEventWhere("botly_supervisor", "whatsapp", phone)
  );
}

async function authorizeSupervisor(token: string) {
  const tokenHash = await sha256(token);
  const session = await latestEventWhere("botly_supervisor_session", "tokenHash", tokenHash);
  if (!session) throw new Error("انتهت جلسة المشرف. سجل الدخول مرة ثانية.");
  if (new Date(getString(session.payload?.expiresAt)).getTime() <= Date.now()) {
    throw new Error("انتهت جلسة المشرف. سجل الدخول مرة ثانية.");
  }
  const supervisorId = getString(session.payload?.supervisorId);
  const supervisor = await latestEventWhere("botly_supervisor", "supervisorId", supervisorId);
  if (!supervisor || supervisor.payload?.active !== true) {
    throw new Error("حساب المشرف غير فعال.");
  }
  return supervisor;
}

function toSupervisor(row: EventRow) {
  return {
    id: supervisorIdentity(row),
    name: getString(row.payload?.name),
    whatsapp: getString(row.payload?.whatsapp),
    active: row.payload?.active === true,
    createdAt: getString(row.payload?.createdAt) || row.created_at || "",
  };
}

export const listSupervisors = createServerFn({ method: "POST" })
  .inputValidator((input) => adminTokenInput.parse(input))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const page = await listEventsPage("botly_supervisor", { limit: 100 });
    const seen = new Set<string>();
    return page.items
      .filter((row) => {
        const id = supervisorIdentity(row);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map(toSupervisor);
  });

export const createSupervisor = createServerFn({ method: "POST" })
  .inputValidator((input) => createSupervisorInput.parse(input))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    if (await findSupervisorByPhone(data.whatsapp)) {
      throw new Error("رقم المشرف مسجل مسبقاً.");
    }
    const salt = randomToken();
    const row = await appendEvent("botly_supervisor", {
      supervisorId: crypto.randomUUID(),
      name: data.name,
      whatsapp: data.whatsapp,
      whatsappNormalized: normalizePhone(data.whatsapp),
      passwordSalt: salt,
      passwordHash: await hashPassword(data.password, salt),
      active: true,
      createdAt: new Date().toISOString(),
    });
    return toSupervisor(row);
  });

export const setSupervisorActive = createServerFn({ method: "POST" })
  .inputValidator((input) => supervisorActionInput.parse(input))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const row = await latestEventWhere("botly_supervisor", "supervisorId", data.supervisorId);
    if (!row) throw new Error("المشرف غير موجود.");
    await appendEvent("botly_supervisor", {
      ...row.payload,
      active: data.active,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  });

export const loginSupervisor = createServerFn({ method: "POST" })
  .inputValidator((input) => loginInput.parse(input))
  .handler(async ({ data }) => {
    const row = await findSupervisorByPhone(data.whatsapp);
    if (!row || row.payload?.active !== true) throw new Error("حساب المشرف غير موجود أو غير فعال.");
    const salt = getString(row.payload?.passwordSalt);
    const expected = getString(row.payload?.passwordHash);
    if (!salt || await hashPassword(data.password, salt) !== expected) {
      throw new Error("رقم الهاتف أو كلمة المرور غير صحيحة.");
    }
    const token = randomToken();
    await appendEvent("botly_supervisor_session", {
      sessionId: crypto.randomUUID(),
      supervisorId: supervisorIdentity(row),
      tokenHash: await sha256(token),
      expiresAt: new Date(Date.now() + SUPERVISOR_SESSION_DAYS * 86_400_000).toISOString(),
      createdAt: new Date().toISOString(),
    });
    return { token, supervisor: toSupervisor(row) };
  });

export const getCurrentSupervisor = createServerFn({ method: "POST" })
  .inputValidator((input) => supervisorTokenInput.parse(input))
  .handler(async ({ data }) => toSupervisor(await authorizeSupervisor(data.token)));

export const createPendingMerchantBySupervisor = createServerFn({ method: "POST" })
  .inputValidator((input) => createMerchantInput.parse(input))
  .handler(async ({ data }) => {
    const supervisor = await authorizeSupervisor(data.token);
    const normalizedPhone = normalizePhone(data.whatsapp);
    const existing =
      await latestEventWhere("botly_merchant", "whatsappNormalized", normalizedPhone)
      ?? await latestEventWhere("botly_merchant", "whatsapp", data.whatsapp);
    if (existing) throw new Error("رقم التاجر مسجل مسبقاً.");

    const salt = randomToken();
    const merchantId = crypto.randomUUID();
    const now = new Date().toISOString();
    await appendEvent("botly_merchant", {
      merchantId,
      storeName: data.storeName,
      whatsapp: data.whatsapp,
      whatsappNormalized: normalizedPhone,
      passwordSalt: salt,
      passwordHash: await hashPassword(data.temporaryPassword, salt),
      temporaryPasswordHash: await hashPassword(data.temporaryPassword, salt),
      city: normalizeGovernorate(data.governorate),
      governorate: normalizeGovernorate(data.governorate),
      carMakes: data.carMakes,
      carModels: data.carModels,
      specialties: data.specialties,
      servesAllGovernorates: data.servesAllGovernorates,
      status: "active",
      isActive: true,
      visibilityEnabled: true,
      firstLoginCompleted: false,
      createdBySupervisorId: supervisorIdentity(supervisor),
      createdAt: now,
      updatedAt: now,
    });

    const inviteUrl = "https://bot-lly.tech/merchant-app?invite=1";
    const message = [
      `تم إنشاء حساب التاجر: ${data.storeName}`,
      `افتح تطبيق التاجر من الرابط: ${inviteUrl}`,
      "سجل الدخول برقم الواتساب المسجل والباسورد المؤقت المرسل لك من المشرف.",
      "الحساب فعال وجاهز لاستقبال الطلبات.",
    ].join("\n");
    const sendResult = await sendWhatsAppText(
      normalizedPhone.replace(/^\+/, ""),
      message,
    );
    return {
      ok: true,
      merchantId,
      status: "active" as const,
      inviteUrl,
      whatsappSent: sendResult.ok,
    };
  });

export const createPendingFitterBySupervisor = createServerFn({ method: "POST" })
  .inputValidator((input) => createFitterInput.parse(input))
  .handler(async ({ data }) => {
    const supervisor = await authorizeSupervisor(data.token);
    const normalizedPhone = normalizePhone(data.whatsapp);
    const existing =
      await latestEventWhere("botly_fitter", "whatsappNormalized", normalizedPhone)
      ?? await latestEventWhere("botly_fitter", "whatsapp", data.whatsapp);
    if (existing) throw new Error("رقم الفيتر مسجل مسبقاً.");

    const salt = randomToken();
    const fitterId = crypto.randomUUID();
    const now = new Date().toISOString();
    await appendEvent("botly_fitter", {
      fitterId,
      name: data.name,
      whatsapp: data.whatsapp,
      whatsappNormalized: normalizedPhone,
      passwordSalt: salt,
      passwordHash: await hashPassword(data.temporaryPassword, salt),
      temporaryPasswordHash: await hashPassword(data.temporaryPassword, salt),
      city: normalizeGovernorate(data.governorate),
      governorate: normalizeGovernorate(data.governorate),
      address: data.address,
      visaNumber: "",
      commissionPercent: 0,
      status: "pending",
      isActive: false,
      firstLoginCompleted: false,
      createdBySupervisorId: supervisorIdentity(supervisor),
      createdAt: now,
      updatedAt: now,
    });

    const inviteUrl = "https://bot-lly.tech/f";
    const message = [
      `تم إنشاء حساب الفيتر: ${data.name}`,
      `افتح تطبيق الفيتر من الرابط: ${inviteUrl}`,
      "سجل الدخول برقم الواتساب المسجل والباسورد المؤقت المرسل لك من المشرف.",
      "الحساب بانتظار تفعيل إدارة Botlly قبل استخدامه.",
    ].join("\n");
    const sendResult = await sendWhatsAppText(
      normalizedPhone.replace(/^\+/, ""),
      message,
    );
    return {
      ok: true,
      fitterId,
      status: "pending" as const,
      inviteUrl,
      whatsappSent: sendResult.ok,
    };
  });
