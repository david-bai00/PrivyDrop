import Image from "next/image";
import type { Messages } from "@/types/messages";

interface PageContentProps {
  messages: Messages;
}

export default function KeyFeatures({ messages }: PageContentProps) {
  return (
    <section className="mb-12">
      <h2 className="text-3xl font-semibold mb-6">
        {messages.text.KeyFeatures.h2}
      </h2>
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold mb-2 flex items-center">
            <Image src="/lock.png" alt="Icon" width={80} height={80} />
            <span className="ml-6">{messages.text.KeyFeatures.h3_1}</span>
          </h3>
          <p>{messages.text.KeyFeatures.h3_1_P}</p>
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2 flex items-center">
            <Image src="/teamwork.png" alt="Icon" width={80} height={80} />
            <span className="ml-6">{messages.text.KeyFeatures.h3_2}</span>
          </h3>
          <p>{messages.text.KeyFeatures.h3_2_P}</p>
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2 flex items-center">
            <Image src="/rocket.png" alt="Icon" width={80} height={80} />
            <span className="ml-6">{messages.text.KeyFeatures.h3_3}</span>
          </h3>
          <p>{messages.text.KeyFeatures.h3_3_P}</p>
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2 flex items-center">
            <Image src="/fresh-air.png" alt="Icon" width={80} height={80} />
            <span className="ml-6">{messages.text.KeyFeatures.h3_4}</span>
          </h3>
          <p>{messages.text.KeyFeatures.h3_4_P}</p>
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2 flex items-center">
            <Image src="/planet-earth.png" alt="Icon" width={80} height={80} />
            <span className="ml-6">{messages.text.KeyFeatures.h3_5}</span>
          </h3>
          <p>{messages.text.KeyFeatures.h3_5_P}</p>
        </div>
      </div>
    </section>
  );
}
