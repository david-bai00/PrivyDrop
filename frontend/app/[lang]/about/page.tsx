import AboutContent from "./AboutContent";
import { Metadata } from "next";
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
    title: messages.meta.about.title,
    description: messages.meta.about.description,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${lang}/about`,
      languages: Object.fromEntries(
        supportedLocales.map((lang) => [lang, `/${lang}/about`])
      ),
    },
    openGraph: {
      title: messages.meta.about.title,
      description: messages.meta.about.description,
      url: `https://www.privydrop.app/${lang}/about`,
      siteName: "PrivyDrop",
      locale: lang,
      type: "website",
    },
  };
}

export default function About() {
  return <AboutContent />;
}
