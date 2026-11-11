/** Supported target languages: ISO 639-1 code → name used in prompts and shown by the API. */
export const LANGUAGES = {
  es: "español",
  en: "inglés",
  pt: "portugués",
  fr: "francés",
  de: "alemán",
  it: "italiano",
  ja: "japonés",
  ko: "coreano",
  zh: "chino (simplificado)",
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

export const LANGUAGE_CODES = Object.keys(LANGUAGES) as [LanguageCode, ...LanguageCode[]];

export const languageName = (code: string): string => LANGUAGES[code as LanguageCode] ?? code;
