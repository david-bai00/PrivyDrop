"use client";

import { createContext, useContext } from "react";
import type { Messages } from "@/types/messages";

type TranslationContextValue = {
  messages: Messages;
  lang: string;
};

const TranslationContext = createContext<TranslationContextValue | null>(null);

interface TranslationProviderProps extends TranslationContextValue {
  children: React.ReactNode;
}

export function TranslationProvider({
  children,
  messages,
  lang,
}: TranslationProviderProps) {
  return (
    <TranslationContext.Provider value={{ messages, lang }}>
      {children}
    </TranslationContext.Provider>
  );
}

function useTranslationContext() {
  const context = useContext(TranslationContext);

  if (!context) {
    throw new Error(
      "Translation hooks must be used within TranslationProvider"
    );
  }

  return context;
}

export function useMessages() {
  return useTranslationContext().messages;
}

export function useLang() {
  return useTranslationContext().lang;
}

export function useI18n() {
  return useTranslationContext();
}
