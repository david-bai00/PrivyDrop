import { getDictionary } from "@/lib/dictionary";
import TermsContent from "./TermsContent";
import { Metadata } from "next";
import { supportedLocales } from "@/constants/i18n-config";

export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  const messages = await getDictionary(params.lang);

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
      url: `https://www.privydrop.app/${params.lang}/terms`,
      siteName: "PrivyDrop",
      locale: params.lang,
      type: "website",
    },
  };
}
export default async function TermsOfUse({
  params: { lang },
}: {
  params: { lang: string };
}) {
  const messages = await getDictionary(lang);
  return <TermsContent messages={messages} />;
}
