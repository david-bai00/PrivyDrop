"use client";

import { useLocale, useTranslations } from "next-intl";

export default function HelpContent() {
  const helpT = useTranslations("text.help");
  const aboutT = useTranslations("text.about");
  const termsT = useTranslations("text.terms");
  const privacyT = useTranslations("text.privacy");
  const lang = useLocale();

  return (
    <div className="container mx-auto py-12">
      <h1 className="text-4xl font-bold mb-6">{helpT("h1")}</h1>
      <p className="text-lg mb-4">{helpT("h1_P")}</p>
      <h2 className="text-2xl font-bold mb-4">{helpT("h2_1")}</h2>
      <p className="text-lg mb-4">
        {helpT("h2_1_P1")}{" "}
        <a
          href="mailto:david.vision66@gmail.com"
          className="text-blue-500 hover:underline"
        >
          david.vision66@gmail.com
        </a>
        {helpT("h2_1_P2")}
      </p>
      <h2 className="text-2xl font-bold mb-4">{helpT("h2_2")}</h2>
      <p className="text-lg mb-4">{helpT("h2_2_P")}</p>
      <ul className="list-disc pl-6">
        <li>
          <a
            href="https://x.com/David_vision66"
            className="text-blue-500 hover:underline"
          >
            Twitter
          </a>
        </li>
        {/* <li><a href="https://www.facebook.com/PrivyDrop" className="text-blue-500 hover:underline">Facebook</a></li>
            <li><a href="https://www.linkedin.com/company/PrivyDrop" className="text-blue-500 hover:underline">LinkedIn</a></li> */}
      </ul>

      <h2 className="text-2xl font-bold mb-4">{helpT("h2_3")}</h2>
      <p className="text-lg mb-4">{helpT("h2_3_P")}</p>
      <ul className="list-disc pl-6">
        <li>
          <a href={`/${lang}/about`} className="text-blue-500 hover:underline">
            {aboutT("h1")}
          </a>
        </li>
        <li>
          <a href={`/${lang}/terms`} className="text-blue-500 hover:underline">
            {termsT("termsOfUseLabel")}
          </a>
        </li>
        <li>
          <a
            href={`/${lang}/privacy`}
            className="text-blue-500 hover:underline"
          >
            {privacyT("privacyPolicyLabel")}
          </a>
        </li>
      </ul>
    </div>
  );
}
