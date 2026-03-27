"use client";
import { useLocale as useNextIntlLocale } from "next-intl";
import type { Locale } from "@/constants/i18n-config";

export function useLocale() {
  return useNextIntlLocale() as Locale;
}
