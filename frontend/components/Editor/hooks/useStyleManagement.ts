import { useCallback } from 'react';
import { DOMNodeWithStyle, StyledElement } from '../types';

export const useStyleManagement = (editorRef: React.RefObject<HTMLDivElement>) => {
  // 查找拥有指定样式的最近父元素
  const findStyleParent = useCallback((node: DOMNodeWithStyle, styleType: string): StyledElement | null => {
    if (typeof window === 'undefined') return null;
    let current = node;
    // 如果当前节点是文本节点，从其父节点开始查找
    if (current.nodeType === 3) {
      current = current.parentElement as DOMNodeWithStyle;
    }
    
    while (current && current !== editorRef.current) {
      if (current.nodeType === 1) {
        const element = current as HTMLElement;
        const style = element.style as any;
        if (style[styleType]) {
          return current as StyledElement;
        }
      }
      current = current.parentElement as DOMNodeWithStyle;
    }
    return null;
  }, [editorRef]);
  // 清理空的或只有继承值的 span 标签
  const cleanupSpan = useCallback((span: StyledElement | null) => {
    // 首先检查 span 是否存在
    if (!span) return;

    // 然后检查 editorRef.current 是否存在，并进行比较
    // 修改比较逻辑，使用 HTMLElement 作为共同基类进行比较
    if (editorRef.current && span.contains(editorRef.current)) return;
    // 检查是否只有 inherit 值或没有样式
    const hasOnlyInherit = Array.from(span.style).every(
      style => !span.style[style] || span.style[style] === 'inherit'
    );
    
    if (hasOnlyInherit || !span.style.length) {
      const parent = span.parentNode as HTMLElement;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    }
  }, [editorRef]);

  return { findStyleParent, cleanupSpan };
};