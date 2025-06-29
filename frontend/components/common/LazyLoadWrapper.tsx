"use client";

import { useInView } from "react-intersection-observer";
import { ReactNode, useEffect, useState } from "react";

interface LazyLoadWrapperProps {
  children: ReactNode;
  // rootMargin: start loading components when they are N pixels away from the viewport.
  options?: {
    triggerOnce?: boolean;
    rootMargin?: string;
  };
}

export default function LazyLoadWrapper({
  children,
  options = { triggerOnce: true, rootMargin: "100px" },
}: LazyLoadWrapperProps) {
  const { ref, inView } = useInView(options);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (inView && !isLoaded) {
      setIsLoaded(true);
    }
  }, [inView, isLoaded]);

  // Wrap the component with a div and attach the ref, and set a minimum height to prevent layout jumps when lazy loading
  return (
    <div ref={ref} className="min-h-[200px]">
      {isLoaded ? children : null}
    </div>
  );
}
