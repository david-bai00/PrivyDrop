import { supportedLocales } from "@/constants/i18n-config";
import { Metadata } from "next";
import { getDictionary } from "@/lib/dictionary";

export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  const messages = await getDictionary(params.lang);

  return {
    title: messages.meta.blog.title,
    description: messages.meta.blog.description,
    keywords: messages.meta.blog.keywords,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${params.lang}/blog`,
      languages: Object.fromEntries(
        supportedLocales.map((l) => [l, `/${l}/blog`])
      ),
    },
    openGraph: {
      title: messages.meta.blog.title,
      description: messages.meta.blog.description,
      url: `https://www.privydrop.app/${params.lang}/blog`,
      siteName: "PrivyDrop",
      locale: params.lang,
      type: "website",
    },
  };
}
