import type { Messages } from '@/types/messages';

interface HelpContentProps {
  messages: Messages;
  lang: string;
}

export default function HelpContent({ messages,lang }: HelpContentProps) {
    return (
        <div className="container mx-auto py-12">
          <h1 className="text-4xl font-bold mb-6">{messages.text.help.h1}</h1>
          <p className="text-lg mb-4">
            {messages.text.help.h1_P}
          </p>
          <h2 className="text-2xl font-bold mb-4">{messages.text.help.h2_1}</h2>
          <p className="text-lg mb-4">
            {messages.text.help.h2_1_P1} {" "}
            <a href="mailto:david.vision66@gmail.com" className="text-blue-500 hover:underline">david.vision66@gmail.com</a>
            {messages.text.help.h2_1_P2}
          </p>
          <h2 className="text-2xl font-bold mb-4">{messages.text.help.h2_2}</h2>
          <p className="text-lg mb-4">
            {messages.text.help.h2_2_P}
          </p>
          <ul className="list-disc pl-6">
            <li><a href="https://x.com/David_vision66" className="text-blue-500 hover:underline">Twitter</a></li>
            {/* <li><a href="https://www.facebook.com/secureshare" className="text-blue-500 hover:underline">Facebook</a></li>
            <li><a href="https://www.linkedin.com/company/secureshare" className="text-blue-500 hover:underline">LinkedIn</a></li> */}
          </ul>
          
          <h2 className="text-2xl font-bold mb-4">{messages.text.help.h2_3}</h2>
          <p className="text-lg mb-4">
            {messages.text.help.h2_3_P}
          </p>
          <ul className="list-disc pl-6">
            <li><a href={`/${lang}/about`} className="text-blue-500 hover:underline">{messages.text.about.h1}</a></li>
            <li><a href={`/${lang}/terms`} className="text-blue-500 hover:underline">{messages.text.terms.TermsOfUse_dis}</a></li>
            <li><a href={`/${lang}/privacy`} className="text-blue-500 hover:underline">{messages.text.privacy.PrivacyPolicy_dis}</a></li>
          </ul>
          
        </div>
      );
}