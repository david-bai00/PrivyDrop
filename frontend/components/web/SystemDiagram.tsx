"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";

export default function SystemDiagram() {
  const t = useTranslations("text.systemDiagram");

  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold mb-12 text-center">{t("title")}</h2>
        <Image
          src="/SystemDiagram.webp"
          alt="PrivyDrop system diagram: Peer-to-peer file and clipboard sharing"
          width={1226}
          height={745}
          className="mx-auto mb-6"
        />
        <p className="mt-8 text-center max-w-2xl mx-auto">
          {t("description")}
        </p>
      </div>
    </section>
  );
}
