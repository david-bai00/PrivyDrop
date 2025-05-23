import "./globals.css";
import Header from '@/components/web/Header'
import Footer from '@/components/web/Footer';
import { ThemeProvider } from "@/components/web/theme-provider";
import Script from 'next/script';
import { getDictionary } from '@/lib/dictionary';

export default async function RootLayout({
  children,
  params: { lang }
}: Readonly<{
  children: React.ReactNode,
  params: { lang: string }
}>) {
  const messages = await getDictionary(lang);
  const googleAnalyticsId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS;

  return (
    <html lang={lang} className="h-full" suppressHydrationWarning>
      <head />
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="theme-preference"
        >
          <Header messages={messages} lang={lang} />
          <div className="flex-1">
            {children}
          </div>
          <Footer messages={messages} lang={lang} />
        </ThemeProvider>

        {/* Google Analytics */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
          strategy="afterInteractive" // 脚本在页面加载后执行
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${googleAnalyticsId}');
          `}
        </Script>
      </body>
    </html>
  );
}
