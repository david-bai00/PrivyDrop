import {defineRouting} from 'next-intl/routing';
import {i18n} from '@/constants/i18n-config';

export const routing = defineRouting({
  locales: [...i18n.locales],
  defaultLocale: i18n.defaultLocale,
  localePrefix: 'always'
});
