import KeyFeatures from "@/components/web/KeyFeatures";
import type { Metadata } from "next";
import { getDictionary } from "@/lib/dictionary";
import { supportedLocales } from "@/constants/i18n-config";

export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  const messages = await getDictionary(params.lang);

  return {
    title: messages.meta.features.title,
    description: messages.meta.features.description,
    keywords: messages.meta.features.keywords,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${params.lang}/features`,
      languages: Object.fromEntries(
        supportedLocales.map((lang) => [lang, `/${lang}/features`])
      ),
    },
    openGraph: {
      title: messages.meta.features.title,
      description: messages.meta.features.description,
      url: `https://www.privydrop.app/${params.lang}/features`,
      siteName: "PrivyDrop",
      locale: params.lang,
      type: "website",
    },
  };
}

export default async function Features({
  params: { lang },
}: {
  params: { lang: string };
}) {
  const messages = await getDictionary(lang);
  return <KeyFeatures messages={messages} />;
} 