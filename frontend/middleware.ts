import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { i18n } from "@/constants/i18n-config";
import { match as matchLocale } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

function getLocale(request: NextRequest): string {
  // 1. 获取请求中的 Accept-Language
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (negotiatorHeaders[key] = value));

  const locales = i18n.locales;
  // 2. 使用 negotiator 获取所有支持的语言
  const languages = new Negotiator({ headers: negotiatorHeaders }).languages();

  try {
    // 3. 匹配最佳语言
    const locale = matchLocale(languages, locales, i18n.defaultLocale);
    return locale;
  } catch (error) {
    return i18n.defaultLocale;
  }
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 获取所有的查询参数
  const searchParams = request.nextUrl.searchParams;

  // 检查请求路径是否已包含语言前缀
  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
  );
  // 如果路径中没有语言前缀,则重定向到带有语言前缀的路径
  if (pathnameIsMissingLocale) {
    const locale = getLocale(request);
    // 创建新的 URL，保留原有的查询参数
    const newUrl = new URL(`/${locale}${pathname}`, request.url);

    // 将原有的查询参数复制到新 URL
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
