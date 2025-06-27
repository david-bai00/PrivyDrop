import { getDictionary } from "@/lib/dictionary";
import AboutContent from "./AboutContent";
import { Metadata } from "next";
import { supportedLocales } from "@/constants/i18n-config";

export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  const messages = await getDictionary(params.lang);

  return {
    title: messages.meta.about.title,
    description: messages.meta.about.description,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${params.lang}/about`,
      languages: Object.fromEntries(
        supportedLocales.map((lang) => [lang, `/${lang}/about`])
      ),
    },
    openGraph: {
      title: messages.meta.about.title,
      description: messages.meta.about.description,
      url: `https://www.privydrop.app/${params.lang}/about`,
      siteName: "PrivyDrop",
      locale: params.lang,
      type: "website",
    },
  };
}

export default async function About({
  params: { lang },
}: {
  params: { lang: string };
}) {
  const messages = await getDictionary(lang);

  return <AboutContent messages={messages} lang={lang} />;
}
