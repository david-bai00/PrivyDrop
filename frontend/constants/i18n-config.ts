export const i18n = {
    defaultLocale: 'en' as const,
    locales: ['en', 'zh', 'ja', 'es', 'de', 'fr', 'ko'] as const,
  }
  
export type Locale = (typeof i18n)['locales'][number]

// 导出语言列表
export const supportedLocales = i18n.locales;

// 语言名称映射--下拉列表选择语言
export const languageDisplayNames = {
    en: 'English',      // 英语
    zh: '中文',         // 中文
    es: 'Español',      // 西班牙语
    ja: '日本語',       // 日本语
    de: 'Deutsch',      // 德语
    fr: 'Français',     // 法语
    ko: '한국어',       // 韩语
  };