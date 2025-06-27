import type { Metadata } from "next";
import { getDictionary } from "@/lib/dictionary";
import PrivacyContent from "./PrivacyContent";
import { supportedLocales } from "@/constants/i18n-config";

export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  const messages = await getDictionary(params.lang);

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
      url: `https://www.privydrop.app/${params.lang}/privacy`,
      siteName: "PrivyDrop",
      locale: params.lang,
      type: "website",
    },
  };
}
export default async function Privacy({
  params: { lang },
}: {
  params: { lang: string };
}) {
  const messages = await getDictionary(lang);
  return <PrivacyContent messages={messages} />;
}
