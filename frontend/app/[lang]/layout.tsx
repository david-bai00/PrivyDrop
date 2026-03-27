import "./globals.css";
import Header from "@/components/web/Header";
import Footer from "@/components/web/Footer";
import { TranslationProvider } from "@/components/providers/TranslationProvider";
import { ThemeProvider } from "@/components/web/theme-provider";
import { getDictionary } from "@/lib/dictionary";
import JsonLd from "@/components/seo/JsonLd";
import {
  absoluteUrl,
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
  getSiteUrl,
} from "@/lib/seo/jsonld";

export default async function RootLayout({
  children,
  params: { lang },
}: Readonly<{
  children: React.ReactNode;
  params: { lang: string };
}>) {
  const messages = await getDictionary(lang);
  const siteUrl = getSiteUrl();
  const logoUrl = absoluteUrl("/logo.png", siteUrl);
  const orgJson = buildOrganizationJsonLd({
    siteUrl,
    logoUrl,
    sameAs: [
      "https://github.com/david-bai00/PrivyDrop",
      "https://x.com/David_vision66",
    ],
  });
  const websiteJson = buildWebSiteJsonLd({
    siteUrl,
    name: "PrivyDrop",
    inLanguage: lang,
  });

  return (
    <html lang={lang} className="h-full" suppressHydrationWarning>
      <head />
      <body className="min-h-full flex flex-col">
        <JsonLd id="global-ld" data={[orgJson, websiteJson]} />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="theme-preference"
        >
          <TranslationProvider messages={messages} lang={lang}>
            <Header />
            <div className="flex-1">{children}</div>
            <Footer />
          </TranslationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
