import type { Messages } from "@/types/messages";

interface AboutContentProps {
  messages: Messages;
  lang: string;
}

export default function AboutContent({ messages, lang }: AboutContentProps) {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold text-center mb-6">
        {messages.text.about.h1}
      </h1>
      <p className="text-lg mb-4">{messages.text.about.P1}</p>
      <p className="text-lg mb-4">{messages.text.about.P2}</p>
      <p className="text-lg mb-4">{messages.text.about.P3}</p>
      <p className="text-lg mb-4">{messages.text.about.P4}</p>
      <p className="text-lg mb-4">{messages.text.about.P5}</p>
      <ul className="list-disc pl-6">
        <li>
          <a
            href={`/${lang}/privacy`}
            className="text-blue-500 hover:underline"
          >
            {messages.text.privacy.PrivacyPolicy_dis}
          </a>
        </li>
        <li>
          <a href={`/${lang}/terms`} className="text-blue-500 hover:underline">
            {messages.text.terms.TermsOfUse_dis}
          </a>
        </li>
        <li>
          <a href={`/${lang}/help`} className="text-blue-500 hover:underline">
            {messages.text.help.Help_dis}
          </a>
        </li>
      </ul>
    </div>
  );
}
