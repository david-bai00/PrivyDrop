"use client";
// Get the current language
import { usePathname } from "next/navigation";
import { i18n } from "@/constants/i18n-config";

export function useLocale() {
  const pathname = usePathname();
  const locale = pathname?.split("/")[1];

  // Validate if the language is supported
  if (locale && i18n.locales.includes(locale as any)) {
    return locale;
  }

  return i18n.defaultLocale;
}
