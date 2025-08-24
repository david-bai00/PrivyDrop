"use client";
import ClipboardApp from "@/components/ClipboardApp";
import { cn } from "@/lib/utils";
import SystemDiagram from "@/components/web/SystemDiagram";
import FAQSection from "@/components/web/FAQSection";
import HowItWorks from "@/components/web/HowItWorks";
import YouTubePlayer from "@/components/common/YouTubePlayer";
import KeyFeatures from "@/components/web/KeyFeatures";
import type { Messages } from "@/types/messages";
import LazyLoadWrapper from "@/components/common/LazyLoadWrapper";

interface PageContentProps {
  messages: Messages;
  lang: string;
}

export default function HomeClient({ messages, lang }: PageContentProps) {
  const youtube_videoId = lang === "zh" ? "I0RLCpcbUXs" : "ypt-po_R2Ds";
  const bilibili_videoId = lang === "zh" ? "BV1knrjYZEfn" : "BV1yErjYFEV7";
  return (
    <main className="container mx-auto px-4 py-8">
      {/* Hero Section */}
      <h1 className="text-4xl font-bold mb-2 text-center">
        {messages.text.home.h1}
      </h1>
      <p className="text-xl mb-4 text-center">{messages.text.home.h1P}</p>
      {/* App Section */}
      <section
        id="clipboard-app"
        className="py-12"
        aria-label="File Transfer Application"
      >
        <div className="w-full max-w-none">
          {/* sr-only--screen-only: visually hidden */}
          <h2 className={cn("sr-only", "text-3xl font-bold mb-8 text-center")}>
            {messages.text.home.h2_screenOnly}
          </h2>
          <ClipboardApp />
        </div>
      </section>
      {/* Demo Video Section */}
      <section className="mb-12" aria-label="Product Demo">
        <LazyLoadWrapper>
          <h2 className="text-3xl font-bold mb-6 text-center">
            {messages.text.home.h2_demo}
          </h2>
          <p className="text-center mb-6 text-gray-600">
            {messages.text.home.h2P_demo}
          </p>
          <YouTubePlayer videoId={youtube_videoId} />

          <div className="mt-4 text-center">
            <p className="mb-3 text-gray-700">
              {messages.text.home.watch_tips}
            </p>
            <a
              className="flex justify-center gap-4 text-blue-500 hover:underline transition-colors"
              href={`https://www.youtube.com/watch?v=${youtube_videoId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {messages.text.home.youtube_tips}
            </a>
            <a
              className="flex justify-center gap-4 text-blue-500 hover:underline transition-colors"
              href={`https://www.bilibili.com/video/${bilibili_videoId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {messages.text.home.bilibili_tips}
            </a>
          </div>
        </LazyLoadWrapper>
      </section>
      {/* How It Works Section */}
      <section aria-label="How It Works">
        <LazyLoadWrapper>
          <HowItWorks messages={messages} />
        </LazyLoadWrapper>
      </section>
      {/* System Architecture Section */}
      <section aria-label="System Architecture">
        <LazyLoadWrapper>
          <SystemDiagram messages={messages} />
        </LazyLoadWrapper>
      </section>
      {/* Key Features */}
      <section aria-label="Key Features">
        <LazyLoadWrapper>
          <KeyFeatures 
            messages={messages} 
            isInToolPage
            titleClassName="text-2xl md:text-3xl"
          />
        </LazyLoadWrapper>
      </section>
      {/* FAQ Section */}
      <section aria-label="Frequently Asked Questions">
        <LazyLoadWrapper>
          <FAQSection
            messages={messages}
            isInToolPage
            titleClassName="text-2xl md:text-3xl"
          />
        </LazyLoadWrapper>
      </section>
    </main>
  );
}
