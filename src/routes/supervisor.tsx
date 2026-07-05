import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LogOut, Send, ShieldCheck, Store, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IRAQI_GOVERNORATES } from "@/lib/governorates";
import {
  createPendingMerchantBySupervisor,
  createPendingFitterBySupervisor,
  getCurrentSupervisor,
  loginSupervisor,
} from "@/lib/supervisor.functions";

const SESSION_KEY = "botly_supervisor_session";

export const Route = createFileRoute("/supervisor")({
  head: () => ({ meta: [{ title: "لوحة المشرف - Botly" }] }),
  component: SupervisorPage,
});

function SupervisorPage() {
  const loginFn = useServerFn(loginSupervisor);
  const currentFn = useServerFn(getCurrentSupervisor);
  const createFn = useServerFn(createPendingMerchantBySupervisor);
  const createFitterFn = useServerFn(createPendingFitterBySupervisor);
  const [token, setToken] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [storeName, setStoreName] = useState("");
  const [accountType, setAccountType] = useState<"merchant" | "fitter">("merchant");
  const [address, setAddress] = useState("");
  const [merchantPhone, setMerchantPhone] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [carMakes, setCarMakes] = useState("");
  const [carModels, setCarModels] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [servesAll, setServesAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY) ?? "";
    if (!saved) return;
    currentFn({ data: { token: saved } })
      .then((supervisor) => {
        setToken(saved);
        setSupervisorName(supervisor.name);
      })
      .catch(() => sessionStorage.removeItem(SESSION_KEY));
  }, [currentFn]);

  const login = async () => {
    setBusy(true);
    try {
      const result = await loginFn({ data: { whatsapp: phone, password } });
      sessionStorage.setItem(SESSION_KEY, result.token);
      setToken(result.token);
      setSupervisorName(result.supervisor.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل الدخول");
    } finally {
      setBusy(false);
    }
  };

  const createMerchant = async () => {
    setBusy(true);
    try {
      const result = await createFn({
        data: {
          token,
          storeName,
          whatsapp: merchantPhone,
          temporaryPassword,
          governorate,
          carMakes: splitValues(carMakes),
          carModels: splitValues(carModels),
          specialties: splitValues(specialties),
          servesAllGovernorates: servesAll,
        },
      });
      setInviteUrl(result.inviteUrl);
      setStoreName("");
      setMerchantPhone("");
      setTemporaryPassword("");
      setCarMakes("");
      setCarModels("");
      setSpecialties("");
      toast.success("تم إنشاء التاجر بحالة pending وإرسال رابط التطبيق");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء التاجر");
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async () => {
    if (accountType === "merchant") {
      await createMerchant();
      return;
    }
    setBusy(true);
    try {
      const result = await createFitterFn({
        data: {
          token,
          name: storeName,
          whatsapp: merchantPhone,
          temporaryPassword,
          governorate,
          address,
        },
      });
      setInviteUrl(result.inviteUrl);
      setStoreName("");
      setMerchantPhone("");
      setTemporaryPassword("");
      setAddress("");
      toast.success("تم إنشاء الفيتر بحالة pending وإرسال رابط التطبيق");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء الفيتر");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <main className="grid min-h-screen place-items-center bg-secondary/30 p-4">
        <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-soft">
          <Logo />
          <h1 className="mt-6 flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="h-6 w-6 text-primary" />
            دخول المشرف
          </h1>
          <div className="mt-5 space-y-4">
            <Field label="رقم الهاتف" value={phone} onChange={setPhone} />
            <Field label="كلمة المرور" type="password" value={password} onChange={setPassword} />
            <Button className="w-full" disabled={busy} onClick={login}>
              {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              دخول
            </Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-secondary/30 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Logo />
            <p className="mt-2 text-sm text-muted-foreground">المشرف: {supervisorName}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              sessionStorage.removeItem(SESSION_KEY);
              setToken("");
            }}
          >
            <LogOut className="me-2 h-4 w-4" />
            خروج
          </Button>
        </header>

        <section className="mt-6 rounded-lg border border-border bg-card p-5 shadow-soft">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            {accountType === "merchant"
              ? <Store className="h-5 w-5 text-primary" />
              : <Wrench className="h-5 w-5 text-primary" />}
            إنشاء {accountType === "merchant" ? "تاجر" : "فيتر"} جديد
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ينشأ الحساب pending، ولا يستقبل طلبات حتى يفعّله الأدمن.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={accountType === "merchant" ? "default" : "outline"}
              onClick={() => setAccountType("merchant")}
            >
              <Store className="me-2 h-4 w-4" />
              تاجر
            </Button>
            <Button
              type="button"
              variant={accountType === "fitter" ? "default" : "outline"}
              onClick={() => setAccountType("fitter")}
            >
              <Wrench className="me-2 h-4 w-4" />
              فيتر
            </Button>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label={accountType === "merchant" ? "اسم المتجر" : "اسم الفيتر"} value={storeName} onChange={setStoreName} />
            <Field label={`رقم واتساب ${accountType === "merchant" ? "التاجر" : "الفيتر"}`} value={merchantPhone} onChange={setMerchantPhone} />
            <Field label="الباسورد المؤقت" type="password" value={temporaryPassword} onChange={setTemporaryPassword} />
            <div className="space-y-2">
              <Label>المحافظة</Label>
              <Select value={governorate} onValueChange={setGovernorate}>
                <SelectTrigger><SelectValue placeholder="اختر المحافظة" /></SelectTrigger>
                <SelectContent>
                  {IRAQI_GOVERNORATES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {accountType === "merchant" ? (
              <>
                <Field label="أنواع السيارات، مفصولة بفاصلة" value={carMakes} onChange={setCarMakes} />
                <Field label="الموديلات، مفصولة بفاصلة" value={carModels} onChange={setCarModels} />
                <div className="sm:col-span-2">
                  <Field label="الاختصاصات، مفصولة بفاصلة" value={specialties} onChange={setSpecialties} />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Checkbox checked={servesAll} onCheckedChange={(checked) => setServesAll(checked === true)} />
                  يخدم جميع المحافظات
                </label>
              </>
            ) : (
              <div className="sm:col-span-2">
                <Field label="العنوان" value={address} onChange={setAddress} />
              </div>
            )}
          </div>
          <Button
            className="mt-5 w-full"
            disabled={
              busy ||
              !storeName ||
              !merchantPhone ||
              temporaryPassword.length < 6 ||
              !governorate ||
              (accountType === "merchant" && (
                splitValues(carMakes).length === 0 ||
                splitValues(specialties).length === 0
              )) ||
              (accountType === "fitter" && address.trim().length < 2)
            }
            onClick={createAccount}
          >
            {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Send className="me-2 h-4 w-4" />}
            إنشاء وإرسال رابط التطبيق
          </Button>
          {inviteUrl ? (
            <a className="mt-4 block break-all text-sm font-medium text-primary underline" href={inviteUrl}>
              {inviteUrl}
            </a>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function splitValues(value: string) {
  return [...new Set(value.split(/[,،\n]/).map((item) => item.trim()).filter(Boolean))];
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
