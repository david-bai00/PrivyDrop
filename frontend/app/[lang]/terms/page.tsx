import TermsContent from "./TermsContent";
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
    title: messages.meta.terms.title,
    description: messages.meta.terms.description,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${params.lang}/terms`,
      languages: Object.fromEntries(
        supportedLocales.map((lang) => [lang, `/${lang}/terms`])
      ),
    },
    openGraph: {
      title: messages.meta.terms.title,
      description: messages.meta.terms.description,
      url: `https://www.privydrop.app/${lang}/terms`,
      siteName: "PrivyDrop",
      locale: lang,
      type: "website",
    },
  };
}
export default function TermsOfUse() {
  return <TermsContent />;
}
