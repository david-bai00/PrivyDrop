import { supportedLocales } from "@/constants/i18n-config";
import { Metadata } from "next";
import { getMessages } from "next-intl/server";
import type { Messages } from "@/types/messages";
import type { Locale } from "@/constants/i18n-config";

export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  const lang = params.lang as Locale;
  const messages = (await getMessages({ locale: lang })) as Messages;

  return {
    title: messages.meta.blog.title,
    description: messages.meta.blog.description,
    keywords: messages.meta.blog.keywords,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${lang}/blog`,
      languages: Object.fromEntries(
        supportedLocales.map((l) => [l, `/${l}/blog`])
      ),
    },
    openGraph: {
      title: messages.meta.blog.title,
      description: messages.meta.blog.description,
      url: `https://www.privydrop.app/${lang}/blog`,
      siteName: "PrivyDrop",
      locale: lang,
      type: "website",
    },
  };
}
