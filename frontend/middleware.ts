import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { i18n } from "@/constants/i18n-config";
import { match as matchLocale } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

function getLocale(request: NextRequest): string {
  // 1. Get Accept-Language from the request
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (negotiatorHeaders[key] = value));

  const locales = i18n.locales;
  // 2. Use negotiator to get all supported languages
  const languages = new Negotiator({ headers: negotiatorHeaders }).languages();

  try {
    // 3. Match the best language
    const locale = matchLocale(languages, locales, i18n.defaultLocale);
    return locale;
  } catch (error) {
    return i18n.defaultLocale;
  }
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Get all search parameters
  const searchParams = request.nextUrl.searchParams;

  // Check if the request path already contains a language prefix
  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
  );
  // If the path has no language prefix, redirect to a path with a language prefix
  if (pathnameIsMissingLocale) {
    const locale = getLocale(request);
    // Create a new URL, preserving the original query parameters
    const newUrl = new URL(`/${locale}${pathname}`, request.url);

    // Copy the original query parameters to the new URL
    searchParams.forEach((value, key) => {
      newUrl.searchParams.set(key, value);
    });

    return NextResponse.redirect(newUrl);
  }
}

export const config = {
  /*
   * Match all request paths except for the ones starting with:
   * - api (API routes)
   * - _next/static (static files)
   * - _next/image (image optimization files)
   * - favicon.ico (favicon file)
   * - Or any path that contains a dot (e.g., .png, .jpg, .svg)
   */
  matcher: "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
};
