import type { Messages } from "@/types/messages";
import { supportedLocales } from "@/constants/i18n-config";

declare module "lodash";
declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
}

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof supportedLocales)[number];
    Messages: Messages;
  }
}

export {};
