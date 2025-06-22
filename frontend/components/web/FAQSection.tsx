import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
  } from "@/components/ui/accordion"
import type { Messages } from '@/types/messages';

interface FAQMessage {
  [key: string]: string;
}

interface FAQ {
  question: string;
  answer: string;
}

const generateFAQs = (messages: { text: { faqs: FAQMessage } }): FAQ[] => {
  const faqs: FAQ[] = [];
  const faqsData = messages.text.faqs;
  
  // Get the total number of questions (by finding keys starting with question_)
  const questionKeys = Object.keys(faqsData).filter(key => key.startsWith('question_'));
  
  // Automatically generate FAQ array based on the number of questions
  questionKeys.forEach(qKey => {
    const index = qKey.split('_')[1]; // Get the numeric index
    const aKey = `answer_${index}`;
    
    if (faqsData[aKey]) { // Ensure the corresponding answer exists
      faqs.push({
        question: faqsData[qKey],
        answer: faqsData[aKey]
      });
    }
  });
  
  return faqs;
};

interface FAQSectionProps {
  isMainPage?: boolean;  // Whether it is the FAQ section of the main page
  className?: string;    // Allow passing custom className
  showTitle?: boolean;   // Whether to display the title
  titleClassName?: string; // Title style class
  lang?: string;
  messages: Messages;
}
// Control the level and style of the title through props, so it can be used on other pages as well as on a standalone page
export default function FAQSection({
  isMainPage = false,
  className = "",
  showTitle = true,
  titleClassName = "",
  messages
}: FAQSectionProps) {
  
  const faqs = generateFAQs(messages);
  
  // Set default styles for different scenarios
  const containerClasses = `container mx-auto px-4 py-8 ${className}`;
  const defaultTitleClasses = "font-bold mb-8";
  const titleClasses = `${defaultTitleClasses} ${titleClassName}`.trim();

  return (
    <div className={containerClasses}>
      {showTitle && (
        isMainPage ? (
          <h2 className={`text-3xl ${titleClasses}`}>{messages.text.faqs.FAQ_dis}</h2>
        ) : (
          <h1 className={`text-4xl ${titleClasses}`}>{messages.text.faqs.FAQ_dis}</h1>
        )
      )}
      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, index) => (
          <AccordionItem key={index} value={`item-${index}`}>
            <AccordionTrigger>{faq.question}</AccordionTrigger>
            <AccordionContent>{faq.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
// // On the standalone FAQ page
// <FAQSection />  // Use h1 tag

// // On the home page
// <FAQSection 
//   isMainPage 
//   titleClassName="text-2xl md:text-3xl" // Optional: use a slightly smaller font size on the home page
// />  // Use h2 tag

// // If you don't need to display the title
// <FAQSection showTitle={false} />