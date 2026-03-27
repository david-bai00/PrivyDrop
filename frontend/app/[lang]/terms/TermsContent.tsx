"use client";

import { useTranslations } from "next-intl";

export default function TermsContent() {
  const t = useTranslations("text.terms");

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold text-center mb-6">{t("h1")}</h1>
      <p className="text-lg mb-4">{t("h1Paragraph")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("sections.useOfService")}</h2>
      <p className="text-lg mb-4">{t("sections.useOfServiceParagraph")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("sections.dataPrivacy")}</h2>
      <p className="text-lg mb-4">{t("sections.dataPrivacyParagraph")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("sections.acceptableUse")}</h2>
      <p className="text-lg mb-4">{t("sections.acceptableUseParagraph")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("sections.liability")}</h2>
      <p className="text-lg mb-4">{t("sections.liabilityParagraph")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("sections.changes")}</h2>
      <p className="text-lg mb-4">{t("sections.changesParagraph")}</p>
    </div>
  );
}
