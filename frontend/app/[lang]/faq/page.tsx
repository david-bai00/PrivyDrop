import FAQSection from '@/components/web/FAQSection'
import type { Metadata } from "next";
import { getDictionary } from '@/lib/dictionary';
import { supportedLocales } from '@/constants/i18n-config';

export async function generateMetadata({ 
  params 
}: { 
  params: { lang: string } 
}): Promise<Metadata> {
  const messages = await getDictionary(params.lang);

  return {
    title: messages.meta.faq.title,
    description: messages.meta.faq.description,
    keywords: messages.meta.faq.keywords,
    metadataBase: new URL('https://www.securityshare.xyz'),
    alternates: {
      canonical: `/${params.lang}/faq`,
      languages: Object.fromEntries(
        supportedLocales.map(lang => [lang, `/${lang}/faq`])
      ),
    },
    openGraph: {
      title: messages.meta.faq.title,
      description: messages.meta.faq.description,
      url: `https://www.securityshare.xyz/${params.lang}/faq`,
      siteName: 'SecureShare',
      locale: params.lang,
      type: 'website',
    },
  };
}

export default async function FAQ({
  params: { lang }
}: {
  params: { lang: string }
}) {
  const messages = await getDictionary(lang);
  return (
    <FAQSection messages={messages} />
  )
}