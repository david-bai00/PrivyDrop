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
  
  // 获取所有问题的数量(通过查找 question_ 开头的键)
  const questionKeys = Object.keys(faqsData).filter(key => key.startsWith('question_'));
  
  // 根据问题数量自动生成FAQ数组
  questionKeys.forEach(qKey => {
    const index = qKey.split('_')[1]; // 获取数字索引
    const aKey = `answer_${index}`;
    
    if (faqsData[aKey]) { // 确保对应的答案存在
      faqs.push({
        question: faqsData[qKey],
        answer: faqsData[aKey]
      });
    }
  });
  
  return faqs;
};

interface FAQSectionProps {
  isMainPage?: boolean;  // 是否为主页面的FAQ部分
  className?: string;    // 允许传入自定义className
  showTitle?: boolean;   // 是否显示标题
  titleClassName?: string; // 标题样式类
  lang?: string;
  messages: Messages;
}
//通过 props 来控制标题的级别和样式,这样可以用在其他页面也可以用在独立页面
export default function FAQSection({
  isMainPage = false,
  className = "",
  showTitle = true,
  titleClassName = "",
  messages
}: FAQSectionProps) {
  
  const faqs = generateFAQs(messages);
  
  // 为不同场景设置默认样式
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
// // 在独立的FAQ页面
// <FAQSection />  // 使用 h1 标签

// // 在首页
// <FAQSection 
//   isMainPage 
//   titleClassName="text-2xl md:text-3xl" // 可选：在首页使用稍小的字号
// />  // 使用 h2 标签

// // 如果不需要显示标题
// <FAQSection showTitle={false} />