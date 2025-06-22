"use client"; // Mark as client component

import mermaid from "mermaid";
import { useEffect, useRef } from "react";

// Initialize Mermaid.js
mermaid.initialize({ startOnLoad: false });

const Mermaid: React.FC<{ children: string }> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      mermaid.init(undefined, ref.current);
    }
  }, [children]);

  return (
    <div ref={ref} className="mermaid">
      {children}
    </div>
  );
};

export default Mermaid;
