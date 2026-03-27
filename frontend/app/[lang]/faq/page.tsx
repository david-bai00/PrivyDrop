import FAQSection from "@/components/web/FAQSection";
import type { Metadata } from "next";
import { getMessages } from "next-intl/server";
import type { Messages } from "@/types/messages";
import { supportedLocales, type Locale } from "@/constants/i18n-config";
import JsonLd from "@/components/seo/JsonLd";
import { buildFaqJsonLd } from "@/lib/seo/jsonld";

export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  const lang = params.lang as Locale;
  const messages = (await getMessages({ locale: lang })) as Messages;

  return {
    title: messages.meta.faq.title,
    description: messages.meta.faq.description,
    keywords: messages.meta.faq.keywords,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${params.lang}/faq`,
      languages: Object.fromEntries(
        supportedLocales.map((lang) => [lang, `/${lang}/faq`])
      ),
    },
    openGraph: {
      title: messages.meta.faq.title,
      description: messages.meta.faq.description,
      url: `https://www.privydrop.app/${lang}/faq`,
      siteName: "PrivyDrop",
      locale: lang,
      type: "website",
    },
  };
}

export default async function FAQ({
  params: { lang },
}: {
  params: { lang: string };
}) {
  const locale = lang as Locale;
  const messages = (await getMessages({ locale })) as Messages;
  const faqItems = (messages.text.faq.items ?? []) as { question: string; answer: string }[];
  const faqs = faqItems.filter((item) => item.question && item.answer);

  const faqLd = buildFaqJsonLd({ inLanguage: locale, faqs });

  return (
    <>
      <JsonLd id="faq-ld" data={faqLd} />
      <FAQSection />
    </>
  );
}
