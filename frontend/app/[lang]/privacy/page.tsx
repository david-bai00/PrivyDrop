import type { Metadata } from "next";
import { getMessages } from "next-intl/server";
import PrivacyContent from "./PrivacyContent";
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
    title: messages.meta.privacy.title,
    description: messages.meta.privacy.description,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${params.lang}/privacy`,
      languages: Object.fromEntries(
        supportedLocales.map((lang) => [lang, `/${lang}/privacy`])
      ),
    },
    openGraph: {
      title: messages.meta.privacy.title,
      description: messages.meta.privacy.description,
      url: `https://www.privydrop.app/${lang}/privacy`,
      siteName: "PrivyDrop",
      locale: lang,
      type: "website",
    },
  };
}
export default function Privacy() {
  return <PrivacyContent />;
}
