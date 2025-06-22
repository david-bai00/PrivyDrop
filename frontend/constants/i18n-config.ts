export const i18n = {
  defaultLocale: "en" as const,
  locales: ["en", "zh", "ja", "es", "de", "fr", "ko"] as const,
};

export type Locale = (typeof i18n)["locales"][number];

// Export language list
export const supportedLocales = i18n.locales;

// Language name mapping--Select the language from the drop-down list
export const languageDisplayNames = {
  en: "English",
  zh: "中文", // Chinese
  es: "Español", // Spanish
  ja: "日本語", // Japanese
  de: "Deutsch", // German
  fr: "Français", // French
  ko: "한국어", // Korean
};
