import HelpContent from "./HelpContent";
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
    title: messages.meta.help.title,
    description: messages.meta.help.description,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${params.lang}/help`,
      languages: Object.fromEntries(
        supportedLocales.map((lang) => [lang, `/${lang}/help`])
      ),
    },
    openGraph: {
      title: messages.meta.help.title,
      description: messages.meta.help.description,
      url: `https://www.privydrop.app/${lang}/help`,
      siteName: "PrivyDrop",
      locale: lang,
      type: "website",
    },
  };
}
export default function Help() {
  return <HelpContent />;
}
