// Language dictionary loader
import { supportedLocales, i18n } from "@/constants/i18n-config";

export async function getDictionary(locale: string) {
  try {
    if (!supportedLocales.includes(locale as any)) {
      console.warn(
        `Unsupported locale: ${locale}, falling back to default locale.`
      );
      locale = i18n.defaultLocale;
    }
    const messagesModule = await import(`@/constants/messages/${locale}`);
    const messages = messagesModule[locale]; // Get the exported object based on the language code
    return messages;
  } catch (error) {
    console.error(`Failed to load dictionary for locale: ${locale}`, error);
    throw error;
  }
}
