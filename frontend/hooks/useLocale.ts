'use client';
//获取当前语言bn
import { usePathname } from 'next/navigation';
import { i18n } from '@/constants/i18n-config'

export function useLocale() {
  const pathname = usePathname();
  const locale = pathname?.split('/')[1];
  
  // 验证是否为支持的语言
  if (locale && i18n.locales.includes(locale as any)) {
    return locale;
  }
  
  return i18n.defaultLocale;
}