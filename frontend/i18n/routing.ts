import {defineRouting} from 'next-intl/routing';
import {i18n} from '@/constants/i18n-config';

export const routing = defineRouting({
  locales: [...i18n.locales],
  defaultLocale: i18n.defaultLocale,
  localePrefix: 'always',
  // The locale is already part of the URL, so persisting it in a cookie buys us
  // nothing except a Set-Cookie header on every single response. That header
  // makes Cloudflare (and every other CDN) treat the whole site as uncacheable,
  // which is why TTFB from outside the origin region costs 1-2 seconds.
  // Locale detection still works from Accept-Language; only the memory of a
  // manual override is dropped, which is a fair trade for a cacheable site.
  localeCookie: false
});
