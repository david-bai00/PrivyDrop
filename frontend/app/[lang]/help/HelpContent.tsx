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
      <p className="text-lg mb-4">{helpT("h1Paragraph")}</p>
      <h2 className="text-2xl font-bold mb-4">{helpT("sections.contactUs")}</h2>
      <p className="text-lg mb-4">
        {helpT("sections.contactUsParagraph1")}{" "}
        <a
          href="mailto:david.vision66@gmail.com"
          className="text-blue-500 hover:underline"
        >
          david.vision66@gmail.com
        </a>
        {helpT("sections.contactUsParagraph2")}
      </p>
      <h2 className="text-2xl font-bold mb-4">{helpT("sections.socialMedia")}</h2>
      <p className="text-lg mb-4">{helpT("sections.socialMediaParagraph")}</p>
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

      <h2 className="text-2xl font-bold mb-4">{helpT("sections.additionalResources")}</h2>
      <p className="text-lg mb-4">{helpT("sections.additionalResourcesParagraph")}</p>
      <ul className="list-disc pl-6">
        <li>
          <a href={`/${lang}/about`} className="text-blue-500 hover:underline">
            {aboutT("h1")}
          </a>
        </li>
        <li>
          <a href={`/${lang}/terms`} className="text-blue-500 hover:underline">
            {termsT("useLabel")}
          </a>
        </li>
        <li>
          <a
            href={`/${lang}/privacy`}
            className="text-blue-500 hover:underline"
          >
            {privacyT("policyLabel")}
          </a>
        </li>
      </ul>
    </div>
  );
}
