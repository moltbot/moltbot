import { en } from "./locales/en.js";
import { zh_CN } from "./locales/zh_CN.js";

export type Locale = "en" | "zh_CN";

export interface TranslationMap {
  [key: string]: string;
}

export interface TranslationSet {
  en: TranslationMap;
  zh_CN: TranslationMap;
}

export const translations: TranslationSet = {
  en,
  zh_CN,
};

export function getLocale(): Locale {
  const envLocale = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES;
  if (envLocale?.includes("zh")) {
    return "zh_CN";
  }
  return "en";
}

export function t(key: string, locale: Locale = getLocale()): string {
  return translations[locale][key] || translations.en[key] || key;
}
