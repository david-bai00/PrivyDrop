"use client";

import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { languageDisplayNames } from "@/constants/i18n-config";

export function Footer() {
  const t = useTranslations("text.Footer");
  const lang = useLocale();

  return (
    <footer className="bg-background border-t mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
          {/* Left: Logo and copyright information */}
          <div className="flex items-center">
            <Image
              src="/logo.png"
              alt="PrivyDrop Logo"
              width={30}
              height={30}
              className="mr-2"
              priority
            />
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} {t("copyrightNotice")}
            </p>
          </div>

          {/* Right: Navigation */}
          <nav>
            <ul className="flex flex-wrap justify-center gap-4">
              {/* Terms and Privacy Policy */}
              <li>
                <Link
                  href={`/${lang}/terms`}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("termsLabel")}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${lang}/privacy`}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("privacyLabel")}
                </Link>
              </li>

              {/* Entry for supported languages */}
              <li>
                <span className="text-sm text-muted-foreground font-bold">
                  {t("supportedLanguagesLabel")}:
                </span>
              </li>
              {Object.entries(languageDisplayNames).map(([code, name]) => (
                <li key={code}>
                  <Link
                    href={`/${code}`}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
