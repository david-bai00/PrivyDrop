import { useCallback } from 'react';
import { DOMNodeWithStyle, StyledElement } from '../types';

export const useStyleManagement = (editorRef: React.RefObject<HTMLDivElement>) => {
  // Find the nearest parent element with the specified style
  const findStyleParent = useCallback((node: DOMNodeWithStyle, styleType: string): StyledElement | null => {
    if (typeof window === 'undefined') return null;
    let current = node;
    // If the current node is a text node, start searching from its parent node
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
  // Clean up empty span tags or those with only inherited values
  const cleanupSpan = useCallback((span: StyledElement | null) => {
    // First, check if the span exists
    if (!span) return;

    // Then check if editorRef.current exists and compare
    // Modify the comparison logic, using HTMLElement as a common base class for comparison
    if (editorRef.current && span.contains(editorRef.current)) return;
    // Check if there are only inherit values or no styles
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