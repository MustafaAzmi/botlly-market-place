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

export function findMakeByLabel(label: string): CarMake | undefined {
  return CAR_MAKES.find((make) => make.label === label || make.key === label);
}
