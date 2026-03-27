"use client";

import { useLocale as useNextIntlLocale, useMessages as useNextIntlMessages } from "next-intl";
import type { Messages } from "@/types/messages";
import type { Locale } from "@/constants/i18n-config";

type TranslationContextValue = {
  messages: Messages;
  lang: string;
};

interface TranslationProviderProps {
  children: React.ReactNode;
}

export function TranslationProvider({children}: TranslationProviderProps) {
  return <>{children}</>;
}

export function useMessages() {
  return useNextIntlMessages() as Messages;
}

export function useLang() {
  return useNextIntlLocale() as Locale;
}

export function useI18n() {
  return {
    messages: useMessages(),
    lang: useLang(),
  } satisfies TranslationContextValue;
}
