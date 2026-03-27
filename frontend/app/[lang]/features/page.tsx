import KeyFeatures from "@/components/web/KeyFeatures";
import type { Metadata } from "next";
import { getMessages } from "next-intl/server";
import { supportedLocales, type Locale } from "@/constants/i18n-config";
import type { Messages } from "@/types/messages";

export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  const lang = params.lang as Locale;
  const messages = (await getMessages({ locale: lang })) as Messages;

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
      url: `https://www.privydrop.app/${lang}/features`,
      siteName: "PrivyDrop",
      locale: lang,
      type: "website",
    },
  };
}

export default function Features() {
  return <KeyFeatures />;
}
