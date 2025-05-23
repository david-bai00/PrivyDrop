"use client";
import React, { useEffect, useState } from 'react';
import clsx from 'clsx';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  content: string;
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({ content }) => {
  const [activeId, setActiveId] = useState<string>('');
  const [toc, setToc] = useState<TocItem[]>([]);

  // 生成合法的 ID，保留中文字符
  const generateValidId = (text: string): string => {
    return encodeURIComponent(text
      .trim() // 移除首尾空格
      .replace(/\s+/g, '-') // 将空格替换为连字符
      .replace(/\-\-+/g, '-')  // 将多个连字符替换为单个
      .replace(/^-+/, '')      // 移除开头的连字符
      .replace(/-+$/, '')      // 移除结尾的连字符
    );
  };

  useEffect(() => {
    // 解析内容生成目录
    const headingRegex = /^(#{1,3})\s+(.+)$/gm;
    const items: TocItem[] = [];
    let match;
    const usedIds = new Set<string>(); // 用于跟踪已使用的ID

    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      let id = generateValidId(text);
      
      // 如果ID已存在，添加数字后缀
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
      { rootMargin: '-80px 0px -40% 0px' }
    );

    // 确保所有标题都已经渲染
    const setupObserver = () => {
      const headers = document.querySelectorAll('h1[id], h2[id], h3[id]');
      headers.forEach((header) => observer.observe(header));
    };

    // 确保 DOM 已更新
    if (toc.length > 0) {
      // 给 DOM 一点时间来更新
    setTimeout(setupObserver, 100);
    }

    return () => observer.disconnect();
  }, [toc]); // 依赖于 toc 而不是 content

  const scrollToHeader = (id: string) => {
    // 不需要解码 ID，因为它已经是正确的格式
    const element = document.getElementById(id);
    if (element) {
      // 获取元素位置
      const rect = element.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      
      // 计算目标位置（考虑固定导航栏的高度，假设是 80px）
      const offsetTop = rect.top + scrollTop - 80;

      window.scrollTo({
        top: offsetTop,
        behavior: 'smooth'
      });

      // 设置当前活动项
      setActiveId(id);
    }
  };

  if (toc.length === 0) return null;

  return (
    <nav className="hidden lg:block sticky top-8 p-6 bg-gray-50 rounded-lg max-h-[calc(100vh-4rem)] overflow-y-auto">
      <h4 className="text-lg font-semibold mb-4">Table of contents</h4>
      <ul className="space-y-2">
        {toc.map((item) => (
          <li
            key={item.id}
            className={clsx(
              'transition-all',
              item.level === 1 ? 'ml-0' : item.level === 2 ? 'ml-4' : 'ml-8'
            )}
          >
            <button
              onClick={() => scrollToHeader(item.id)}
              className={clsx(
                'block w-full text-left py-1 text-sm hover:text-blue-600 transition-colors',
                activeId === item.id
                  ? 'text-blue-600 font-medium'
                  : 'text-gray-600'
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