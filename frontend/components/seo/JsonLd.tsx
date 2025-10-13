import React from "react";

type JsonLdProps = {
  data: Record<string, any> | Record<string, any>[];
  id?: string;
};

export default function JsonLd({ data, id }: JsonLdProps) {
  const blocks = Array.isArray(data) ? data : [data];
  return (
    <>
      {blocks.map((item, idx) => (
        <script
          key={id ? `${id}-${idx}` : idx}
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}

