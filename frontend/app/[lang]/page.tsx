import HomeClient from "./HomeClient";
import { Metadata } from "next";
import { getMessages } from "next-intl/server";
import { supportedLocales, type Locale } from "@/constants/i18n-config";
import type { Messages } from "@/types/messages";
import JsonLd from "@/components/seo/JsonLd";
import { buildWebAppJsonLd, getSiteUrl, absoluteUrl } from "@/lib/seo/jsonld";

export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  const lang = params.lang as Locale;
  const messages = (await getMessages({ locale: lang })) as Messages;

  return {
    title: messages.meta.home.title,
    description: messages.meta.home.description,
    keywords: messages.meta.home.keywords,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${lang}`,
      languages: Object.fromEntries(
        supportedLocales.map((lang) => [lang, `/${lang}`])
      ),
    },
    //OpenGraph metadata can optimize social media sharing
    openGraph: {
      title: messages.meta.home.title,
      description: messages.meta.home.description,
      url: `https://www.privydrop.app/${lang}`,
      siteName: "PrivyDrop",
      locale: lang,
      type: "website",
    },
  };
}

export default async function Home({
  params: { lang },
}: {
  params: { lang: string };
}) {
  const locale = lang as Locale;
  const messages = (await getMessages({ locale })) as Messages;
  const siteUrl = getSiteUrl();
  const webAppLd = buildWebAppJsonLd({
    siteUrl,
    path: `/${lang}`,
    name: "PrivyDrop",
    alternateName: [
      "PrivyDrop",
      "PrivyDrop APP",
      "Open-source web-based AirDrop alternative",
    ],
    description: messages.meta.home.description,
    inLanguage: locale,
    imageUrl: absoluteUrl("/logo.png", siteUrl),
    applicationCategory: "UtilityApplication",
    operatingSystem: "Web Browser",
  });

  return (
    <>
      <JsonLd id="home-ld" data={webAppLd} />
      <HomeClient />
    </>
  );
}
