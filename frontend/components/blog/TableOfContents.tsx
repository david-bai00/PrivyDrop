"use client";
import React, { useEffect, useState } from "react";
import clsx from "clsx";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  content: string;
  title?: string;
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({
  content,
  title = "Table of contents",
}) => {
  const [activeId, setActiveId] = useState<string>("");
  const [toc, setToc] = useState<TocItem[]>([]);

  // Generate a valid ID, preserving Chinese characters
  const generateValidId = (text: string): string => {
    return encodeURIComponent(
      text
        .trim() // Remove leading/trailing spaces
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .replace(/\-\-+/g, "-") // Replace multiple hyphens with a single one
        .replace(/^-+/, "") // Remove leading hyphens
        .replace(/-+$/, "") // Remove trailing hyphens
    );
  };

  useEffect(() => {
    // Parse content to generate table of contents
    const headingRegex = /^(#{1,3})\s+(.+)$/gm;
    const items: TocItem[] = [];
    let match;
    const usedIds = new Set<string>(); // Used to track used IDs

    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      let id = generateValidId(text);

      // If ID already exists, add a numeric suffix
      let counter = 1;
      let uniqueId = id;
      while (usedIds.has(uniqueId)) {
        uniqueId = `${id}-${counter}`;
        counter++;
      }

      usedIds.add(uniqueId);
      items.push({ id: uniqueId, text, level });
    }

    setToc(items);
  }, [content]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-80px 0px -40% 0px" }
    );

    // Ensure all headings are rendered
    const setupObserver = () => {
      const headers = document.querySelectorAll("h1[id], h2[id], h3[id]");
      headers.forEach((header) => observer.observe(header));
    };

    // Ensure DOM is updated
    if (toc.length > 0) {
      // Give the DOM some time to update
      setTimeout(setupObserver, 100);
    }

    return () => observer.disconnect();
  }, [toc]); // Depends on toc instead of content

  const scrollToHeader = (id: string) => {
    // No need to decode the ID, as it is already in the correct format
    const element = document.getElementById(id);
    if (element) {
      // Get element position
      const rect = element.getBoundingClientRect();
      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;

      // Calculate target position (considering the fixed navigation bar height, assuming 80px)
      const offsetTop = rect.top + scrollTop - 80;

      window.scrollTo({
        top: offsetTop,
        behavior: "smooth",
      });

      // Set current active item
      setActiveId(id);
    }
  };

  if (toc.length === 0) return null;

  return (
    <nav className="hidden lg:block sticky top-8 p-6 bg-muted rounded-lg max-h-[calc(100vh-4rem)] overflow-y-auto">
      <h4 className="text-lg font-semibold mb-4">{title}</h4>
      <ul className="space-y-2">
        {toc.map((item) => (
          <li
            key={item.id}
            className={clsx(
              "transition-all",
              item.level === 1 ? "ml-0" : item.level === 2 ? "ml-4" : "ml-8"
            )}
          >
            <button
              onClick={() => scrollToHeader(item.id)}
              className={clsx(
                "block w-full text-left py-1 text-sm hover:text-primary transition-colors",
                activeId === item.id
                  ? "text-primary font-medium"
                  : "text-muted-foreground"
              )}
            >
              {item.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};
