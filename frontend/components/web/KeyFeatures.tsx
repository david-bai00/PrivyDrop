import Image from "next/image";
import type { Messages } from "@/types/messages";

interface KeyFeaturesProps {
  isInToolPage?: boolean; // Whether it is in the tool page (e.g. homepage)
  className?: string; // Custom style class
  showTitle?: boolean; // Whether to display the title
  titleClassName?: string; // Title style class
  messages: Messages;
}

export default function KeyFeatures({ 
  isInToolPage = false,
  className = "",
  showTitle = true,
  titleClassName = "",
  messages 
}: KeyFeaturesProps) {
  // Set container styles
  const containerClasses = `container mx-auto px-4 py-8 ${className}`;
  const defaultTitleClasses = "font-semibold mb-6";
  const titleClasses = `${defaultTitleClasses} ${titleClassName}`.trim();

  return (
    <section className={containerClasses}>
      {showTitle &&
        (isInToolPage ? (
          <h2 className={`text-3xl ${titleClasses}`}>
            {messages.text.KeyFeatures.h2}
          </h2>
        ) : (
          <h1 className={`text-4xl ${titleClasses}`}>
            {messages.text.KeyFeatures.h2}
          </h1>
        ))}
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
        <div>
          <h3 className="text-xl font-semibold mb-2 flex items-center">
            <Image
              src="/ResumableTransfers.png"
              alt="Icon"
              width={100}
              height={83}
            />
            <span className="ml-6">{messages.text.KeyFeatures.h3_6}</span>
          </h3>
          <p>{messages.text.KeyFeatures.h3_6_P}</p>
        </div>
      </div>
    </section>
  );
}
