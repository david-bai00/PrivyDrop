"use client";

import { useLocale, useTranslations } from "next-intl";

export default function AboutContent() {
  const aboutT = useTranslations("text.about");
  const privacyT = useTranslations("text.privacy");
  const termsT = useTranslations("text.terms");
  const helpT = useTranslations("text.help");
  const lang = useLocale();
  const handyxlateUrl = "https://www.handyxlate.app";

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold text-center mb-6">{aboutT("h1")}</h1>
      <p className="text-lg mb-4">{aboutT("paragraphs.0")}</p>
      <p className="text-lg mb-4">{aboutT("paragraphs.1")}</p>
      <p className="text-lg mb-4">{aboutT("paragraphs.2")}</p>
      <p className="text-lg mb-4">{aboutT("paragraphs.3")}</p>
      <p className="text-lg mb-4">{aboutT("paragraphs.4")}</p>
      <section className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
        <h2 className="mb-3 text-xl font-semibold text-slate-900">
          {aboutT("otherProjects.title")}
        </h2>
        <p className="text-lg leading-8 text-slate-700">
          {aboutT("otherProjects.description")}{" "}
          <a
            href={handyxlateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-4 transition hover:text-blue-700"
          >
            {aboutT("otherProjects.linkLabel")}
          </a>
          {aboutT("otherProjects.trailingText")}
        </p>
      </section>
      <ul className="list-disc pl-6">
        <li>
          <a
            href={`/${lang}/privacy`}
            className="text-blue-500 hover:underline"
          >
            {privacyT("policyLabel")}
          </a>
        </li>
        <li>
          <a href={`/${lang}/terms`} className="text-blue-500 hover:underline">
            {termsT("useLabel")}
          </a>
        </li>
        <li>
          <a href={`/${lang}/help`} className="text-blue-500 hover:underline">
            {helpT("label")}
          </a>
        </li>
      </ul>
    </div>
  );
}
