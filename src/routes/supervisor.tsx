import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LogOut, Send, ShieldCheck, Store, Wrench } from "lucide-react";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAR_MAKES } from "@/lib/car-data";
import { IRAQI_GOVERNORATES } from "@/lib/governorates";
import {
  createPendingMerchantBySupervisor,
  createPendingFitterBySupervisor,
  getCurrentSupervisor,
  loginSupervisor,
} from "@/lib/supervisor.functions";

const SESSION_KEY = "botly_supervisor_session";
const CAR_PART_SPECIALTIES = [
  "كهربائيات",
  "محرك",
  "هيكل وبدن",
  "تعليق وتوجيه",
  "فرامل",
  "تبريد وتكييف",
  "إكسسوارات",
  "أخرى",
];

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
  const [carMakes, setCarMakes] = useState<string[]>([]);
  const [carModels, setCarModels] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
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
          carMakes,
          carModels,
          specialties,
          servesAllGovernorates: servesAll,
        },
      });
      setInviteUrl(result.inviteUrl);
      setStoreName("");
      setMerchantPhone("");
      setTemporaryPassword("");
      setCarMakes([]);
      setCarModels([]);
      setSpecialties([]);
      toast.success("تم إنشاء التاجر وتفعيله مباشرة وإرسال رابط التطبيق");
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

  const toggleMake = (makeLabel: string, checked: boolean) => {
    if (checked) {
      setCarMakes((current) => [...new Set([...current, makeLabel])]);
      return;
    }
    const remainingMakes = carMakes.filter((item) => item !== makeLabel);
    const remainingModels = new Set(
      CAR_MAKES
        .filter((make) => remainingMakes.includes(make.label))
        .flatMap((make) => make.models),
    );
    setCarMakes(remainingMakes);
    setCarModels((current) => current.filter((model) => remainingModels.has(model)));
  };

  const toggleSelection = (
    setter: Dispatch<SetStateAction<string[]>>,
    value: string,
    checked: boolean,
  ) => {
    setter((current) =>
      checked
        ? [...new Set([...current, value])]
        : current.filter((item) => item !== value),
    );
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
            التاجر يتفعل مباشرة ويستقبل الطلبات، والفيتر يبقى بانتظار تفعيل الأدمن.
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
                <MultiCheckboxGroup
                  className="sm:col-span-2"
                  label="أنواع السيارات"
                  hint="اختر نوعاً واحداً أو أكثر"
                  options={CAR_MAKES.map((make) => make.label)}
                  selected={carMakes}
                  onCheckedChange={toggleMake}
                />
                <div className="space-y-2 sm:col-span-2">
                  <div>
                    <Label>الموديلات</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      تظهر موديلات أنواع السيارات المحددة فقط.
                    </p>
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-background p-4">
                    {carMakes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        اختر نوع السيارة أولاً.
                      </p>
                    ) : (
                      <div className="space-y-5">
                        {CAR_MAKES
                          .filter((make) => carMakes.includes(make.label))
                          .map((make) => (
                            <div key={make.key}>
                              <h3 className="mb-2 text-sm font-semibold">{make.label}</h3>
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {make.models.map((model) => (
                                  <CheckboxOption
                                    key={`${make.key}-${model}`}
                                    id={`${make.key}-${model}`}
                                    label={model}
                                    checked={carModels.includes(model)}
                                    onCheckedChange={(checked) =>
                                      toggleSelection(setCarModels, model, checked)
                                    }
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                <MultiCheckboxGroup
                  className="sm:col-span-2"
                  label="الاختصاصات المتوفرة"
                  hint="اختر اختصاصاً واحداً أو أكثر"
                  options={CAR_PART_SPECIALTIES}
                  selected={specialties}
                  onCheckedChange={(value, checked) =>
                    toggleSelection(setSpecialties, value, checked)
                  }
                />
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
                carMakes.length === 0 ||
                carModels.length === 0 ||
                specialties.length === 0
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

function MultiCheckboxGroup({
  label,
  hint,
  options,
  selected,
  onCheckedChange,
  className = "",
}: {
  label: string;
  hint: string;
  options: string[];
  selected: string[];
  onCheckedChange: (value: string, checked: boolean) => void;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      <div>
        <Label>{label}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="grid max-h-56 gap-2 overflow-y-auto rounded-lg border border-border bg-background p-4 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => (
          <CheckboxOption
            key={option}
            id={`${label}-${option}`}
            label={option}
            checked={selected.includes(option)}
            onCheckedChange={(checked) => onCheckedChange(option, checked)}
          />
        ))}
      </div>
    </div>
  );
}

function CheckboxOption({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const inputId = `supervisor-filter-${encodeURIComponent(id).replace(/%/g, "")}`;
  return (
    <label
      htmlFor={inputId}
      className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-secondary/70"
    >
      <Checkbox
        id={inputId}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span>{label}</span>
    </label>
  );
}
