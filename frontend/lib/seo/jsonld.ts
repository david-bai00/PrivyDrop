// Use hardcoded site URL to keep consistent with sitemap and deployment
export const getSiteUrl = (): string => {
  return "https://www.privydrop.app";
};

export const absoluteUrl = (path: string, siteUrl = getSiteUrl()): string => {
  if (!path) return siteUrl;
  if (/^https?:\/\//i.test(path)) return path;
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
};

export function buildOrganizationJsonLd(params: {
  siteUrl?: string;
  name?: string;
  logoUrl: string;
  sameAs?: string[];
}) {
  const siteUrl = params.siteUrl || getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: params.name || "PrivyDrop",
    url: `${siteUrl}/`,
    logo: params.logoUrl,
    sameAs: params.sameAs || [],
  };
}

export function buildWebSiteJsonLd(params: {
  siteUrl?: string;
  name?: string;
  inLanguage?: string;
}) {
  const siteUrl = params.siteUrl || getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    url: `${siteUrl}/`,
    name: params.name || "PrivyDrop",
    publisher: { "@id": `${siteUrl}/#organization` },
    inLanguage: params.inLanguage,
  };
}

export function buildWebAppJsonLd(params: {
  siteUrl?: string;
  path: string; // e.g. '/zh'
  name: string;
  description: string;
  inLanguage?: string;
  alternateName?: string[];
  imageUrl?: string;
  applicationCategory?: string; // default UtilityApplication
  operatingSystem?: string; // default Web Browser
}) {
  const siteUrl = params.siteUrl || getSiteUrl();
  const url = absoluteUrl(params.path, siteUrl);
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${url}#app`,
    name: params.name,
    alternateName: params.alternateName?.length ? params.alternateName : undefined,
    description: params.description,
    applicationCategory: params.applicationCategory || "UtilityApplication",
    operatingSystem: params.operatingSystem || "Web Browser",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url,
    image: params.imageUrl,
    publisher: { "@id": `${siteUrl}/#organization` },
    inLanguage: params.inLanguage,
  };
}

export function buildFaqJsonLd(params: {
  inLanguage?: string;
  faqs: { question: string; answer: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: params.faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
    inLanguage: params.inLanguage,
  };
}

export function buildBlogPostingJsonLd(params: {
  siteUrl?: string;
  url: string; // absolute url
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  authorName: string;
  imageUrl?: string;
  inLanguage?: string;
}) {
  const siteUrl = params.siteUrl || getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${params.url}#post`,
    headline: params.title,
    description: params.description,
    datePublished: params.datePublished,
    dateModified: params.dateModified || params.datePublished,
    author: { "@type": "Person", name: params.authorName },
    publisher: { "@id": `${siteUrl}/#organization` },
    mainEntityOfPage: params.url,
    image: params.imageUrl,
    inLanguage: params.inLanguage,
  };
}

export function buildBreadcrumbJsonLd(params: {
  items: { name: string; item: string }[]; // absolute urls
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: params.items.map((it, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: it.name,
      item: it.item,
    })),
  };
}
