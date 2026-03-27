"use client";

import { useTranslations } from "next-intl";

export default function PrivacyContent() {
  const t = useTranslations("text.privacy");

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold text-center mb-6">{t("h1")}</h1>
      <p className="text-lg mb-4">{t("h1Paragraph")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("sections.informationCollection")}</h2>
      <p className="text-lg mb-4">{t("sections.informationCollectionParagraph")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("sections.dataStorage")}</h2>
      <p className="text-lg mb-4">{t("sections.dataStorageParagraph")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("sections.thirdPartyServices")}</h2>
      <p className="text-lg mb-4">{t("sections.thirdPartyServicesParagraph")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("sections.amendments")}</h2>
      <p className="text-lg mb-4">{t("sections.amendmentsParagraph")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("sections.contactUs")}</h2>
      <p className="text-lg mb-4">
        {t("sections.contactUsParagraph")}{" "}
        <a
          href="mailto:david.vision66@gmail.com"
          className="text-blue-500 hover:underline"
        >
          david.vision66@gmail.com
        </a>
        .
      </p>
    </div>
  );
}
