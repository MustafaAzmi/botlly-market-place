export const IRAQI_GOVERNORATES = [
  "بغداد",
  "نينوى",
  "البصرة",
  "أربيل",
  "السليمانية",
  "دهوك",
  "كركوك",
  "الأنبار",
  "صلاح الدين",
  "ديالى",
  "واسط",
  "بابل",
  "كربلاء",
  "النجف",
  "الديوانية",
  "المثنى",
  "ذي قار",
  "ميسان",
  "حلبجة",
] as const;

const GOVERNORATE_ALIASES = new Map<string, string>(
  [
    ["اربيل", "أربيل"],
    ["اربل", "أربيل"],
    ["أربل", "أربيل"],
    ["الانبار", "الأنبار"],
    ["انبار", "الأنبار"],
    ["السليمانيه", "السليمانية"],
    ["سليمانية", "السليمانية"],
    ["دهوك", "دهوك"],
    ["صلاح الدين", "صلاح الدين"],
    ["صلاحالدين", "صلاح الدين"],
    ["دياله", "ديالى"],
    ["ذيقار", "ذي قار"],
    ["ذى قار", "ذي قار"],
    ["كربلا", "كربلاء"],
    ["النجف الاشرف", "النجف"],
    ["الحلبجة", "حلبجة"],
  ].map(([key, value]) => [normalizeGovernorateKey(key), value]),
);

export function normalizeGovernorate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const exact = IRAQI_GOVERNORATES.find((governorate) => governorate === trimmed);
  if (exact) return exact;
  const key = normalizeGovernorateKey(trimmed);
  return GOVERNORATE_ALIASES.get(key) ?? trimmed;
}

function normalizeGovernorateKey(value: string) {
  return value
    .trim()
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
