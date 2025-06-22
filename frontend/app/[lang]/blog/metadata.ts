import { supportedLocales } from "@/constants/i18n-config";
import { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  return {
    title: "SecureShare Blog - Private P2P File Sharing & Collaboration",
    description:
      "Discover secure file sharing tips, privacy-focused collaboration strategies, and how to leverage P2P technology for safer data transfer. Learn about WebRTC, end-to-end encryption, and team collaboration.",
    keywords:
      "secure file sharing, p2p file transfer, private collaboration, webrtc, end-to-end encryption, team collaboration, privacy tools",
    metadataBase: new URL("https://www.securityshare.xyz"),
    alternates: {
      canonical: `/${params.lang}/blog`,
      languages: {
        en: "/en/blog",
        zh: "/zh/blog",
      },
    },
    openGraph: {
      title: "SecureShare Blog - Private P2P File Sharing & Collaboration",
      description:
        "Explore secure file sharing, private collaboration tools, and data privacy best practices. Join our community of privacy-conscious professionals.",
      url: `https://www.securityshare.xyz/${params.lang}/blog`,
      siteName: "SecureShare",
      locale: params.lang,
      type: "website",
    },
  };
}
