"use client";

import { useTranslations } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FAQ {
  question: string;
  answer: string;
}

// Static FAQ count based on messages structure (indices 0-13)
const FAQ_COUNT = 14;

interface FAQSectionProps {
  isInToolPage?: boolean; // Whether it is in the tool page (e.g. homepage)
  className?: string; // Allow passing custom className
  showTitle?: boolean; // Whether to display the title
  titleClassName?: string; // Title style class
  lang?: string;
}
// Control the level and style of the title through props, so it can be used on other pages as well as on a standalone page
export default function FAQSection({
  isInToolPage = false,
  className = "",
  showTitle = true,
  titleClassName = "",
}: FAQSectionProps) {
  const t = useTranslations("text.faq");

  // Generate FAQs using useTranslations with dynamic keys
  // We use type assertion since next-intl doesn't support dynamic keys in type system
  const faqs: FAQ[] = [];
  for (let i = 0; i < FAQ_COUNT; i++) {
    const question = t(`items.${i}.question` as never);
    const answer = t(`items.${i}.answer` as never);
    // Only add if both question and answer exist (not fallback keys)
    if (question && answer && !question.startsWith("items.")) {
      faqs.push({ question, answer });
    }
  }

  // Set default styles for different scenarios
  const containerClasses = `container mx-auto px-4 py-8 ${className}`;
  const defaultTitleClasses = "font-bold mb-8";
  const titleClasses = `${defaultTitleClasses} ${titleClassName}`.trim();

  return (
    <div className={containerClasses}>
      {showTitle &&
        (isInToolPage ? (
          <h2 className={`text-3xl ${titleClasses}`}>{t("title")}</h2>
        ) : (
          <h1 className={`text-4xl ${titleClasses}`}>{t("title")}</h1>
        ))}
      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, index) => (
          <AccordionItem key={index} value={`item-${index}`}>
            <AccordionTrigger>{faq.question}</AccordionTrigger>
            <AccordionContent>{faq.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
// // On the standalone FAQ page
// <FAQSection />  // Use h1 tag

// // On the home page
// <FAQSection
//   isInToolPage
//   titleClassName="text-2xl md:text-3xl" // Optional: use a slightly smaller font size on the home page
// />  // Use h2 tag

// // If you don't need to display the title
// <FAQSection showTitle={false} />
