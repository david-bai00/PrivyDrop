import HomeClient from "./HomeClient";
import { getDictionary } from "@/lib/dictionary";
import { Metadata } from "next";
import { supportedLocales } from "@/constants/i18n-config";
import JsonLd from "@/components/seo/JsonLd";
import { buildWebAppJsonLd, getSiteUrl, absoluteUrl } from "@/lib/seo/jsonld";

export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  const messages = await getDictionary(params.lang);

  return {
    title: messages.meta.home.title,
    description: messages.meta.home.description,
    keywords: messages.meta.home.keywords,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${params.lang}`,
      languages: Object.fromEntries(
        supportedLocales.map((lang) => [lang, `/${lang}`])
      ),
    },
    //OpenGraph metadata can optimize social media sharing
    openGraph: {
      title: messages.meta.home.title,
      description: messages.meta.home.description,
      url: `https://www.privydrop.app/${params.lang}`,
      siteName: "PrivyDrop",
      locale: params.lang,
      type: "website",
    },
  };
}

export default async function Home({
  params: { lang },
}: {
  params: { lang: string };
}) {
  const messages = await getDictionary(lang);
  const siteUrl = getSiteUrl();
  const webAppLd = buildWebAppJsonLd({
    siteUrl,
    path: `/${lang}`,
    name: "PrivyDrop",
    alternateName: ["PrivyDrop", "PrivyDrop APP"],
    description: messages.meta.home.description,
    inLanguage: lang,
    imageUrl: absoluteUrl("/logo.png", siteUrl),
    applicationCategory: "UtilityApplication",
    operatingSystem: "Web Browser",
  });

  return (
    <>
      <JsonLd id="home-ld" data={webAppLd} />
      <HomeClient messages={messages} lang={lang} />
    </>
  );
}
