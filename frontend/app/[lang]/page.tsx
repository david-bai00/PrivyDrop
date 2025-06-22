import HomeClient from "./HomeClient";
import { getDictionary } from "@/lib/dictionary";
import { Metadata } from "next";
import { supportedLocales } from "@/constants/i18n-config";

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
    metadataBase: new URL("https://www.securityshare.xyz"),
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
      url: `https://www.securityshare.xyz/${params.lang}`,
      siteName: "SecureShare",
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

  return <HomeClient messages={messages} lang={lang} />;
}
