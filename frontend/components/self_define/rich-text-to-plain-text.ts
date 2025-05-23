import { useEffect, useState } from 'react';

// 我们将函数转换为一个自定义 Hook useRichTextToPlainText。这允许我们使用 React 的生命周期方法来检测是否在浏览器环境中。
// 使用 useState 和 useEffect 来检测是否在浏览器环境中。useEffect 只在客户端运行，所以我们可以安全地在其中设置 isBrowser 为 true。

function useRichTextToPlainText() {
  const [isBrowser, setIsBrowser] = useState(false);

  useEffect(() => {
    setIsBrowser(true);
  }, []);

  const richTextToPlainText = (richText: string): string => {
    if (!isBrowser) {
      return richText; // 在服务器端，直接返回原文本
    }
    // 创建一个临时的DOM元素
    const tempElement = document.createElement("div");
    
    // 将富文本内容设置为临时元素的innerHTML
    tempElement.innerHTML = richText;
    
    // 处理直接的文本节点（不在任何块级元素内的文本）
    // 将它们包装在 div 中以保持一致的处理
    const wrapTextNodes = (element: HTMLElement) => {
      const childNodes = Array.from(element.childNodes);
      childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
          const wrapper = document.createElement('div');
          wrapper.textContent = node.textContent;
          node.replaceWith(wrapper);
        }
      });
    };

    wrapTextNodes(tempElement);

    // 处理所有块级元素
    const blockElements = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre'];
    blockElements.forEach(tag => {
      tempElement.querySelectorAll(tag).forEach(element => {
        // 如果元素内容为空或只包含 <br>，则替换为双换行
        if (!element.textContent?.trim() || element.innerHTML === '<br>') {
          element.replaceWith('\n\n');
        } else {
          // 否则在内容后添加换行
          element.replaceWith(element.textContent + '\n');
        }
      });
    });

    // 处理 <br> 标签
    tempElement.querySelectorAll('br').forEach(br => {
      br.replaceWith('\n');
    });

    // 获取并处理纯文本
    let plainText = tempElement.textContent || tempElement.innerText || '';

    // 处理连续的换行符
    plainText = plainText
      .replace(/\n{3,}/g, '\n\n')  // 将3个以上连续换行符替换为2个
      .replace(/^\n+/, '')         // 删除开头的换行符
      .replace(/\n+$/, '')         // 删除结尾的换行符
      .trim();                     // 删除首尾空格

    return plainText;
  };

  return richTextToPlainText;
}

export default useRichTextToPlainText;
