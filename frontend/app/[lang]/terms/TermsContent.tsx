import type { Messages } from "@/types/messages";

interface PageContentProps {
  messages: Messages;
}

export default function TermsContent({ messages }: PageContentProps) {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold text-center mb-6">
        {messages.text.terms.h1}
      </h1>
      <p className="text-lg mb-4">{messages.text.terms.h1_P}</p>
      <h2 className="text-2xl font-bold mb-4">{messages.text.terms.h2_1}</h2>
      <p className="text-lg mb-4">{messages.text.terms.h2_1_P}</p>
      <h2 className="text-2xl font-bold mb-4">{messages.text.terms.h2_2}</h2>
      <p className="text-lg mb-4">{messages.text.terms.h2_2_P}</p>
      <h2 className="text-2xl font-bold mb-4">{messages.text.terms.h2_3}</h2>
      <p className="text-lg mb-4">{messages.text.terms.h2_3_P}</p>
      <h2 className="text-2xl font-bold mb-4">{messages.text.terms.h2_4}</h2>
      <p className="text-lg mb-4">{messages.text.terms.h2_4_P}</p>
      <h2 className="text-2xl font-bold mb-4">{messages.text.terms.h2_5}</h2>
      <p className="text-lg mb-4">{messages.text.terms.h2_5_P}</p>
    </div>
  );
}
