"use client";
import ClipboardApp from "@/components/ClipboardApp";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import SystemDiagram from "@/components/web/SystemDiagram";
import FAQSection from "@/components/web/FAQSection";
import HowItWorks from "@/components/web/HowItWorks";
import YouTubePlayer from "@/components/common/YouTubePlayer";
import KeyFeatures from "@/components/web/KeyFeatures";
import LazyLoadWrapper from "@/components/common/LazyLoadWrapper";

export default function HomeClient() {
  const t = useTranslations("text.home");
  const lang = useLocale();
  const youtube_videoId = lang === "zh" ? "I0RLCpcbUXs" : "ypt-po_R2Ds";
  const bilibili_videoId = lang === "zh" ? "BV1knrjYZEfn" : "BV1yErjYFEV7";
  return (
    <main className="container mx-auto px-4 py-8">
      {/* Hero Section */}
      <h1 className="text-4xl font-bold mb-2 text-center">{t("h1")}</h1>
      <p className="text-xl mb-4 text-center">{t("h1P")}</p>
      {/* App Section */}
      <section
        id="clipboard-app"
        className="py-12"
        aria-label="File Transfer Application"
      >
        <div className="w-full max-w-none">
          {/* sr-only--screen-only: visually hidden */}
          <h2 className={cn("sr-only", "text-3xl font-bold mb-8 text-center")}>
            {t("h2ScreenOnly")}
          </h2>
          <ClipboardApp />
        </div>
      </section>
      {/* How It Works Section */}
      <section aria-label="How It Works">
        <LazyLoadWrapper>
          <HowItWorks />
        </LazyLoadWrapper>
      </section>
      {/* Demo Video Section */}
      <section className="mb-12" aria-label="Product Demo">
        <LazyLoadWrapper>
          <h2 className="text-3xl font-bold mb-6 text-center">
            {t("h2Demo")}
          </h2>
          <p className="text-center mb-6 text-muted-foreground">
            {t("h2DemoDescription")}
          </p>
          <YouTubePlayer videoId={youtube_videoId} />

          <div className="mt-4 text-center">
            <p className="mb-3 text-foreground">{t("watchTip")}</p>
            <a
              className="flex justify-center gap-4 text-blue-500 hover:underline transition-colors"
              href={`https://www.youtube.com/watch?v=${youtube_videoId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("youtubeTip")}
            </a>
            <a
              className="flex justify-center gap-4 text-blue-500 hover:underline transition-colors"
              href={`https://www.bilibili.com/video/${bilibili_videoId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("bilibiliTip")}
            </a>
          </div>
        </LazyLoadWrapper>
      </section>
      {/* System Architecture Section */}
      <section aria-label="System Architecture">
        <LazyLoadWrapper>
          <SystemDiagram />
        </LazyLoadWrapper>
      </section>
      {/* Key Features */}
      <section aria-label="Key Features">
        <LazyLoadWrapper>
          <KeyFeatures isInToolPage titleClassName="text-2xl md:text-3xl" />
        </LazyLoadWrapper>
      </section>
      {/* FAQ Section */}
      <section aria-label="Frequently Asked Questions">
        <LazyLoadWrapper>
          <FAQSection isInToolPage titleClassName="text-2xl md:text-3xl" />
        </LazyLoadWrapper>
      </section>
    </main>
  );
}
