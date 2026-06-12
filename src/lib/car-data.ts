// Fixed car catalogue for the parts/accessories marketplace.
//
// Shared by the merchant product form (tagging a part with the car it fits)
// and the customer dashboard filters (make → model → color). Keeping one list
// on both sides is what makes filtering exact instead of free-text fuzzy.

export interface CarMake {
  key: string;
  label: string; // Arabic display name
  models: string[];
}

// "يناسب أكثر من سيارة" — accessories that fit any car (covers, fresheners...).
export const UNIVERSAL_MAKE = "عام";
export const ALL_MODELS = "كل الموديلات";

export const CAR_MAKES: CarMake[] = [
  // German
  {
    key: "mercedes",
    label: "مرسيدس",
    models: ["C-Class", "E-Class", "S-Class", "A-Class", "CLA", "CLS", "GLA", "GLC", "GLE", "GLS", "ML", "G-Class", "أخرى"],
  },
  {
    key: "bmw",
    label: "بي ام دبليو",
    models: ["الفئة 3", "الفئة 5", "الفئة 7", "X1", "X3", "X5", "X6", "X7", "M3", "M5", "أخرى"],
  },
  {
    key: "audi",
    label: "أودي",
    models: ["A3", "A4", "A6", "A8", "Q3", "Q5", "Q7", "Q8", "أخرى"],
  },
  {
    key: "volkswagen",
    label: "فولكس واجن",
    models: ["باسات", "جيتا", "جولف", "تيغوان", "طوارق", "أخرى"],
  },
  {
    key: "opel",
    label: "أوبل",
    models: ["أسترا", "إنسيجنيا", "كورسا", "فيكترا", "زافيرا", "أخرى"],
  },
  {
    key: "porsche",
    label: "بورش",
    models: ["كايين", "باناميرا", "ماكان", "911", "أخرى"],
  },
  // American
  {
    key: "dodge",
    label: "دوج",
    models: ["تشارجر", "تشالنجر", "دورانجو", "رام", "أخرى"],
  },
  {
    key: "chevrolet",
    label: "شفروليه",
    models: ["كامارو", "ماليبو", "كروز", "تاهو", "سلفرادو", "إمبالا", "إكوينوكس", "أوبترا", "أفيو", "أخرى"],
  },
  {
    key: "ford",
    label: "فورد",
    models: ["F-150", "إيدج", "إكسبلورر", "إسكيب", "فيوجن", "فوكس", "موستانج", "توروس", "إيكوسبورت", "أخرى"],
  },
  {
    key: "gmc",
    label: "جي ام سي",
    models: ["يوكن", "سييرا", "أكاديا", "تيرين", "أخرى"],
  },
  {
    key: "jeep",
    label: "جيب",
    models: ["جراند شيروكي", "رانجلر", "كومباس", "رينيجيد", "أخرى"],
  },
  {
    key: "cadillac",
    label: "كاديلاك",
    models: ["إسكاليد", "CT5", "CTS", "ATS", "XT5", "أخرى"],
  },
  {
    key: "chrysler",
    label: "كرايسلر",
    models: ["300C", "باسيفيكا", "أخرى"],
  },
  // Japanese / Korean (very common in Iraq)
  {
    key: "toyota",
    label: "تويوتا",
    models: ["كامري", "كورولا", "لاند كروزر", "برادو", "هايلكس", "RAV4", "أفالون", "يارس", "هايلاندر", "سيكويا", "4Runner", "أخرى"],
  },
  {
    key: "nissan",
    label: "نيسان",
    models: ["التيما", "صني", "باترول", "إكس تريل", "ماكسيما", "باثفايندر", "كيكس", "سنترا", "أخرى"],
  },
  {
    key: "honda",
    label: "هوندا",
    models: ["أكورد", "سيفيك", "CR-V", "بايلوت", "سيتي", "أخرى"],
  },
  {
    key: "lexus",
    label: "لكزس",
    models: ["LX570", "ES350", "RX350", "IS300", "GX460", "أخرى"],
  },
  {
    key: "hyundai",
    label: "هيونداي",
    models: ["النترا", "سوناتا", "توسان", "سنتافي", "أكسنت", "أزيرا", "كريتا", "باليسيد", "أخرى"],
  },
  {
    key: "kia",
    label: "كيا",
    models: ["أوبتيما / K5", "سيراتو", "سبورتاج", "سورينتو", "ريو", "بيكانتو", "سيلتوس", "تيلورايد", "أخرى"],
  },
  {
    key: "genesis",
    label: "جينيسيس",
    models: ["G70", "G80", "G90", "GV70", "GV80", "أخرى"],
  },
  // Chinese (growing fast in the Iraqi market)
  {
    key: "mg",
    label: "إم جي",
    models: ["MG5", "MG6", "ZS", "RX5", "HS", "أخرى"],
  },
  {
    key: "changan",
    label: "شانجان",
    models: ["CS35", "CS55", "CS75", "إيدو", "ألسفن", "أخرى"],
  },
  {
    key: "chery",
    label: "شيري",
    models: ["تيجو 3", "تيجو 4", "تيجو 7", "تيجو 8", "أريزو 5", "أريزو 6", "أخرى"],
  },
  {
    key: "geely",
    label: "جيلي",
    models: ["كولراي", "إمجراند", "توجيلا", "أخرى"],
  },
  {
    key: "haval",
    label: "هافال",
    models: ["H6", "جوليون", "أخرى"],
  },
  // Universal accessories that fit any car
  {
    key: "universal",
    label: UNIVERSAL_MAKE,
    models: [ALL_MODELS],
  },
];

export const CAR_COLORS = [
  "أبيض",
  "أسود",
  "فضي",
  "رمادي",
  "أحمر",
  "أزرق",
  "أخضر",
  "بني",
  "بيج",
  "ذهبي",
  "برتقالي",
  "أصفر",
  "خمري",
  "تيتانيوم",
  "أخرى",
];

// Manufacture years for the year filter/selector, newest first.
export const ALL_YEARS = "كل السنوات";
export const CAR_YEARS: string[] = (() => {
  const current = new Date().getFullYear() + 1;
  const years: string[] = [];
  for (let y = current; y >= 1990; y--) years.push(String(y));
  return years;
})();

export function findMakeByLabel(label: string): CarMake | undefined {
  return CAR_MAKES.find((make) => make.label === label || make.key === label);
}

// ---------------------------------------------------------------------------
// Admin-managed catalogue configuration
// ---------------------------------------------------------------------------
//
// The arrays above are only the SEED. The live catalogue — what customers and
// merchants actually see in their dropdowns — is stored in the event store
// (botly_catalogue_config) and fully editable from the admin panel: the admin
// can add/remove makes, models, colors and years, and show/hide each one with
// a checkbox. Customer, merchant and admin all read from this single source.

export type CatalogueItem = { name: string; enabled: boolean };

export type CatalogueMakeConfig = {
  key: string;
  label: string;
  enabled: boolean;
  models: CatalogueItem[];
};

export type CatalogueConfig = {
  makes: CatalogueMakeConfig[];
  colors: CatalogueItem[];
  years: CatalogueItem[];
};

// First-run state: the standard list above, everything hidden until the admin
// explicitly checks it.
export function defaultCatalogueConfig(): CatalogueConfig {
  return {
    makes: CAR_MAKES.map((make) => ({
      key: make.key,
      label: make.label,
      enabled: false,
      models: make.models.map((name) => ({ name, enabled: false })),
    })),
    colors: CAR_COLORS.map((name) => ({ name, enabled: false })),
    years: CAR_YEARS.map((name) => ({ name, enabled: false })),
  };
}

function parseItems(value: unknown): CatalogueItem[] {
  if (!Array.isArray(value)) return [];
  const items: CatalogueItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.name !== "string" || !entry.name) continue;
    items.push({ name: entry.name, enabled: entry.enabled === true });
  }
  return items;
}

function asStringSet(value: unknown): Set<string> {
  return new Set(
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [],
  );
}

// Read a stored catalogue event payload. Returns null for unrelated payloads.
export function parseCatalogueConfig(
  payload?: Record<string, unknown> | null,
): CatalogueConfig | null {
  if (!payload) return null;

  if (Array.isArray(payload.makes)) {
    const makes: CatalogueMakeConfig[] = [];
    for (const raw of payload.makes) {
      if (!raw || typeof raw !== "object") continue;
      const m = raw as Record<string, unknown>;
      if (typeof m.key !== "string" || !m.key) continue;
      if (typeof m.label !== "string" || !m.label) continue;
      makes.push({
        key: m.key,
        label: m.label,
        enabled: m.enabled === true,
        models: parseItems(m.models),
      });
    }
    return { makes, colors: parseItems(payload.colors), years: parseItems(payload.years) };
  }

  // Legacy shape (first catalogue version): enabled keys against the hardcoded
  // lists — convert into the editable shape so old saves keep working.
  if (Array.isArray(payload.enabledMakes)) {
    const enabledMakes = asStringSet(payload.enabledMakes);
    const enabledColors = asStringSet(payload.enabledColors);
    const enabledYears = asStringSet(payload.enabledYears);
    const modelsByMake = (
      payload.modelsByMake && typeof payload.modelsByMake === "object" ? payload.modelsByMake : {}
    ) as Record<string, unknown>;

    const config = defaultCatalogueConfig();
    for (const make of config.makes) {
      make.enabled = enabledMakes.has(make.key);
      const enabledModels = asStringSet(modelsByMake[make.key]);
      for (const model of make.models) model.enabled = enabledModels.has(model.name);
    }
    for (const color of config.colors) color.enabled = enabledColors.has(color.name);
    for (const year of config.years) year.enabled = enabledYears.has(year.name);
    return config;
  }

  return null;
}

// What customers/merchants see: only the checked items.
export function toEnabledCatalogue(config: CatalogueConfig): {
  makes: CarMake[];
  colors: string[];
  years: string[];
} {
  return {
    makes: config.makes
      .filter((make) => make.enabled)
      .map((make) => ({
        key: make.key,
        label: make.label,
        models: make.models.filter((model) => model.enabled).map((model) => model.name),
      })),
    colors: config.colors.filter((color) => color.enabled).map((color) => color.name),
    years: config.years.filter((year) => year.enabled).map((year) => year.name),
  };
}
