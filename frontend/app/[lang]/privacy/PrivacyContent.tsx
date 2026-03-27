"use client";

import { useTranslations } from "next-intl";

export default function PrivacyContent() {
  const t = useTranslations("text.privacy");

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold text-center mb-6">{t("h1")}</h1>
      <p className="text-lg mb-4">{t("h1_P")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("h2_1")}</h2>
      <p className="text-lg mb-4">{t("h2_1_P")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("h2_2")}</h2>
      <p className="text-lg mb-4">{t("h2_2_P")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("h2_3")}</h2>
      <p className="text-lg mb-4">{t("h2_3_P")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("h2_4")}</h2>
      <p className="text-lg mb-4">{t("h2_4_P")}</p>
      <h2 className="text-2xl font-bold mb-4">{t("h2_5")}</h2>
      <p className="text-lg mb-4">
        {t("h2_5_P")}{" "}
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
