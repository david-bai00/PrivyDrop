import { getDictionary } from "@/lib/dictionary";
import HelpContent from "./HelpContent";
import { Metadata } from "next";
import { supportedLocales } from "@/constants/i18n-config";

export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  const messages = await getDictionary(params.lang);

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
      url: `https://www.privydrop.app/${params.lang}/help`,
      siteName: "PrivyDrop",
      locale: params.lang,
      type: "website",
    },
  };
}
export default async function Help({
  params: { lang },
}: {
  params: { lang: string };
}) {
  const messages = await getDictionary(lang);
  return <HelpContent messages={messages} lang={lang} />;
}
