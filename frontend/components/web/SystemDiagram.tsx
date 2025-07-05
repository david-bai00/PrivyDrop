import Image from "next/image";
import type { Messages } from "@/types/messages";

interface PageContentProps {
  messages: Messages;
}

export default function SystemDiagram({ messages }: PageContentProps) {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold mb-12 text-center">
          {messages.text.SystemDiagram.h2}
        </h2>
        <Image
          src="/SystemDiagram.webp"
          alt="PrivyDrop system diagram: Peer-to-peer file and clipboard sharing"
          width={1226}
          height={745}
          className="mx-auto mb-6"
        />
        <p className="mt-8 text-center max-w-2xl mx-auto">
          {messages.text.SystemDiagram.h2_P}
        </p>
      </div>
    </section>
  );
}
