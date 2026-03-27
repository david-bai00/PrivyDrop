"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";

interface KeyFeaturesProps {
  isInToolPage?: boolean; // Whether it is in the tool page (e.g. homepage)
  className?: string; // Custom style class
  showTitle?: boolean; // Whether to display the title
  titleClassName?: string; // Title style class
}

export default function KeyFeatures({
  isInToolPage = false,
  className = "",
  showTitle = true,
  titleClassName = "",
}: KeyFeaturesProps) {
  const t = useTranslations("text.keyFeatures");

  // Set container styles
  const containerClasses = `container mx-auto px-4 py-8 ${className}`;
  const defaultTitleClasses = "font-semibold mb-6";
  const titleClasses = `${defaultTitleClasses} ${titleClassName}`.trim();

  return (
    <section className={containerClasses}>
      {showTitle &&
        (isInToolPage ? (
          <h2 className={`text-3xl ${titleClasses}`}>
            {t("title")}
          </h2>
        ) : (
          <h1 className={`text-4xl ${titleClasses}`}>
            {t("title")}
          </h1>
        ))}
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold mb-2 flex items-center">
            <Image src="/lock.png" alt="Icon" width={80} height={80} />
            <span className="ml-6">{t("items.directSecure.title")}</span>
          </h3>
          <p>{t("items.directSecure.description")}</p>
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2 flex items-center">
            <Image src="/teamwork.png" alt="Icon" width={80} height={80} />
            <span className="ml-6">{t("items.teamSynergy.title")}</span>
          </h3>
          <p>{t("items.teamSynergy.description")}</p>
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2 flex items-center">
            <Image src="/rocket.png" alt="Icon" width={80} height={80} />
            <span className="ml-6">{t("items.noLimits.title")}</span>
          </h3>
          <p>{t("items.noLimits.description")}</p>
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2 flex items-center">
            <Image src="/fresh-air.png" alt="Icon" width={80} height={80} />
            <span className="ml-6">{t("items.swift.title")}</span>
          </h3>
          <p>{t("items.swift.description")}</p>
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2 flex items-center">
            <Image src="/planet-earth.png" alt="Icon" width={80} height={80} />
            <span className="ml-6">{t("items.greenClean.title")}</span>
          </h3>
          <p>{t("items.greenClean.description")}</p>
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2 flex items-center">
            <Image
              src="/ResumableTransfers.png"
              alt="Icon"
              width={100}
              height={83}
            />
            <span className="ml-6">{t("items.resumable.title")}</span>
          </h3>
          <p>{t("items.resumable.description")}</p>
        </div>
      </div>
    </section>
  );
}
