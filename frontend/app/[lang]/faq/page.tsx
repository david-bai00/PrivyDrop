import FAQSection from "@/components/web/FAQSection";
import type { Metadata } from "next";
import { getDictionary } from "@/lib/dictionary";
import { supportedLocales } from "@/constants/i18n-config";
import JsonLd from "@/components/seo/JsonLd";
import { buildFaqJsonLd } from "@/lib/seo/jsonld";

export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  const messages = await getDictionary(params.lang);

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
      url: `https://www.privydrop.app/${params.lang}/faq`,
      siteName: "PrivyDrop",
      locale: params.lang,
      type: "website",
    },
  };
}

export default async function FAQ({
  params: { lang },
}: {
  params: { lang: string };
}) {
  const messages = await getDictionary(lang);
  const faqsData = (messages as any).text.faqs as Record<string, string>;
  const questionKeys = Object.keys(faqsData).filter((k) => k.startsWith("question_"));
  const faqs = questionKeys
    .map((qKey) => {
      const idx = qKey.split("_")[1];
      const aKey = `answer_${idx}`;
      const q = faqsData[qKey];
      const a = faqsData[aKey];
      if (q && a) return { question: q, answer: a };
      return null;
    })
    .filter(Boolean) as { question: string; answer: string }[];

  const faqLd = buildFaqJsonLd({ inLanguage: lang, faqs });

  return (
    <>
      <JsonLd id="faq-ld" data={faqLd} />
      <FAQSection messages={messages} />
    </>
  );
}
