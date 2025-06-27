"use client";

import { useInView } from "react-intersection-observer";
import { ReactNode, useEffect, useState } from "react";

interface LazyLoadWrapperProps {
  children: ReactNode;
  // 可以设置一个延迟，让组件在进入视口后稍微等一下再渲染，避免滚动过快时频繁渲染
  // rootMargin 可以让组件在距离视口还有 N 像素时就开始加载
  options?: {
    triggerOnce?: boolean;
    rootMargin?: string;
  };
}

export default function LazyLoadWrapper({
  children,
  options = { triggerOnce: true, rootMargin: "200px" },
}: LazyLoadWrapperProps) {
  const { ref, inView } = useInView(options);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (inView && !isLoaded) {
      setIsLoaded(true);
    }
  }, [inView, isLoaded]);

  // 使用一个 div 包裹并附加 ref，同时可以设置最小高度，防止懒加载时页面布局跳动
  return (
    <div ref={ref} className="min-h-[200px]">
      {isLoaded ? children : null}
    </div>
  );
}
