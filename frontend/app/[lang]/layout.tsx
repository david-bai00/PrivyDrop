import "./globals.css";
import Header from "@/components/web/Header";
import Footer from "@/components/web/Footer";
import { ThemeProvider } from "@/components/web/theme-provider";
import { getDictionary } from "@/lib/dictionary";

export default async function RootLayout({
  children,
  params: { lang },
}: Readonly<{
  children: React.ReactNode;
  params: { lang: string };
}>) {
  const messages = await getDictionary(lang);

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
          <div className="flex-1">{children}</div>
          <Footer messages={messages} lang={lang} />
        </ThemeProvider>
      </body>
    </html>
  );
}
