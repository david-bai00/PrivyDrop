import { useCallback } from 'react';
import { FormatType, AlignmentType, FontStyleType, DOMNodeWithStyle, StyledElement } from '../types';
import { useSelection } from './useSelection';
import { useStyleManagement } from './useStyleManagement';
import { removeStyle } from '../utils/textFormatting';
import { handleImageUpload } from '../utils/imageHandling';
import { styleMap, } from '../constants';
export const useEditorCommands = (
  editorRef: React.RefObject<HTMLDivElement>,
  handleChange: () => void
) => {
  const getSelection = useSelection();
  const { findStyleParent, cleanupSpan } = useStyleManagement(editorRef);

  // Format text (bold, italic, underline)--格式化文本
  const formatText = useCallback((format: FormatType) => {
    if (typeof window === 'undefined') return;
    
    const selectionInfo = getSelection();
    if (!selectionInfo || !selectionInfo.selection.toString()) return;

    const { selection, range } = selectionInfo;
    
    const styleParent = findStyleParent(selection.anchorNode as DOMNodeWithStyle, styleMap[format]);

    if (styleParent) {
      // 移除样式
      removeStyle(styleParent, format);
    } else {
      // 添加样式
      const span = document.createElement('span');
      
      switch (format) {
        case 'bold':
            span.style.fontWeight = 'bold';
            break;
        case 'italic':
            span.style.fontStyle = 'italic';
            break;
        case 'underline':
            span.style.textDecoration = 'underline';
            break;
      }

      // 如果选中的内容在一个span内，且该span没有目标样式，直接添加样式
      const parentElement = selection.anchorNode?.parentElement;
      if (parentElement && 
          parentElement.tagName === 'SPAN' && 
          !(parentElement as StyledElement).style[styleMap[format]] && 
          parentElement !== editorRef.current) {

        (parentElement as StyledElement).style[styleMap[format]] = span.style[styleMap[format]];
      
      } else {
        // 否则创建新的span
        span.appendChild(range.extractContents());
        range.insertNode(span);
      }
    }
    // 保持选区
    const newRange = document.createRange();
    selection.removeAllRanges();
    selection.addRange(newRange);
    
    // 更新 HTML
    handleChange();
  }, [findStyleParent, getSelection, removeStyle]);

  // Align text--对齐文本
  const alignText = useCallback((alignment: AlignmentType) => {
    if (!editorRef.current || typeof window === 'undefined') return;
    
    const selectionInfo = getSelection();
    if (!selectionInfo) return;
    
    // 找到当前文本节点或其容器
    let textNode = selectionInfo.selection.anchorNode as DOMNodeWithStyle;
    
    // 如果是文本节点，获取其父元素
    if (textNode.nodeType === 3) {
      textNode = textNode.parentElement as DOMNodeWithStyle;
    }

    // 向外查找最外层的样式容器（例如带有颜色或大小的span）
    let outerContainer = textNode;
    while (
      outerContainer.parentElement && 
      outerContainer.parentElement !== editorRef.current &&
      (outerContainer.parentElement as HTMLElement).tagName === 'SPAN'
    ) {
      outerContainer = outerContainer.parentElement as DOMNodeWithStyle;
    }

    // 创建或找到div容器来处理对齐
    let alignmentContainer: HTMLElement;
    if (
      outerContainer.parentElement === editorRef.current || 
      (outerContainer.parentElement as HTMLElement).tagName !== 'DIV'
    ) {
      // 需要创建新的对齐容器
      alignmentContainer = document.createElement('div');
      alignmentContainer.style.textAlign = alignment;
      // 包装现有内容
      outerContainer.parentElement?.insertBefore(alignmentContainer, outerContainer);
      alignmentContainer.appendChild(outerContainer);
        } else {
      // 使用已存在的对齐容器
      alignmentContainer = outerContainer.parentElement as HTMLElement;
      alignmentContainer.style.textAlign = alignment;
    }
  
    // 更新 HTML
    handleChange();
  }, [getSelection]);

  // Set font style
  const setFontStyle = useCallback((type: FontStyleType, value: string) => {
    if (typeof window === 'undefined') return;
    const selectionInfo = getSelection();
    if (!selectionInfo || !selectionInfo.selection.toString()) return;
    const { selection, range } = selectionInfo;
     // 映射样式类型到实际的 CSS 属性名
    const stylePropertyMap = {
      'family': 'fontFamily',
      'size': 'fontSize',
      'color': 'color'
    };
    const styleProperty = stylePropertyMap[type];
    // 获取选中内容的范围
    const rangeContent = range.cloneContents();
    // 检查选中内容是否包含块级<p> / <div>元素
    const containsBlock = Array.from(rangeContent.childNodes).some(
      node => node.nodeType === 1 && ['P', 'DIV'].includes((node as HTMLElement).tagName)
    );

    if (containsBlock) {
      // 如果选中内容包含块级元素,遍历处理每个块级元素内的文本
      const blocks = Array.from(rangeContent.childNodes).filter(
        node => node.nodeType === 1 && ['P', 'DIV'].includes((node as HTMLElement).tagName)
      );
      blocks.forEach(block => {
        const textNodes = [];
        const walker = document.createTreeWalker(
          block,
          NodeFilter.SHOW_TEXT,
          null
        );
        let node;
        while (node = walker.nextNode()) {
          textNodes.push(node);
        }
        
        textNodes.forEach(textNode => {
          // 检查父元素是否已经是span
          const parent = textNode.parentNode as HTMLElement;
          if (parent.tagName === 'SPAN') {
            (parent as StyledElement).style[styleProperty] = value;
          } else {
            const span = document.createElement('span') as StyledElement;
            span.style[styleProperty] = value;
            parent.insertBefore(span, textNode);
            span.appendChild(textNode);
          }
        });
      });
      // 清除原有内容并插入新内容
      range.deleteContents();
      range.insertNode(rangeContent);
    } else {
      // 如果是普通文本,使用原来的逻辑
      let styleParent = findStyleParent(selection.anchorNode as DOMNodeWithStyle, styleProperty);
      if (styleParent && !['P', 'DIV'].includes(styleParent.tagName)) {
        if (value === 'inherit') {
          styleParent.style[styleProperty] = '';
          cleanupSpan(styleParent);
        } else {
          styleParent.style[styleProperty] = value;
        }
      } else {
        // 否则创建新的 span
        const span = document.createElement('span') as StyledElement;
        span.style[styleProperty] = value;
        span.appendChild(range.extractContents());
        range.insertNode(span);
      }
    }
    
    // 保持选区
    selection.removeAllRanges();
    selection.addRange(range);
    
    handleChange();
  }, [getSelection, findStyleParent, cleanupSpan]);

  // Insert link
  const insertLink = useCallback(() => {
    const selection = window.getSelection();
    let text = "test";
    if (selection && !selection.isCollapsed) {
      // 如果有选中文本，则使用选中的文本作为链接文字
      text = selection.toString();
    }
    
    // 使用一个prompt，用空格分隔链接和文字
    const input = prompt('Please enter the link address and text (separated by space):', `https:// ${text}`);

    if (input) {
      // 分割输入得到url和text
      const [url, ...textParts] = input.split(' ');
      const text = textParts.join(' '); // 处理文字中可能包含空格的情况
      
      if (url && text) {
        const selectionInfo = getSelection();
        if (!selectionInfo) return;
        
        const { range } = selectionInfo;
        const link = document.createElement('a');
        link.href = url;
        link.textContent = text;
        link.target = '_blank';
        link.style.color = '#0066cc';
        link.style.textDecoration = 'underline';
        
        range.deleteContents();
        range.insertNode(link);
        handleChange();
      }
    }
  }, [getSelection]);

  // Insert image
  const insertImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => {
          if (!event.target || !event.target.result) return;
          const img = document.createElement('img');
          img.src = event.target.result as string;
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
          img.style.margin = '10px 0';
          
          const selectionInfo = getSelection();
          if (!selectionInfo) return;
          
          const { range } = selectionInfo;
          range.deleteContents();
          range.insertNode(img);
          handleChange();
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }, [getSelection]);

  // Insert code block
  const insertCodeBlock = useCallback(() => {
    const code = prompt('insert code:');
    if (!code) return;
    
    const selectionInfo = getSelection();
    if (!selectionInfo) return;
    
    const { range } = selectionInfo;
    const pre = document.createElement('pre');
    const codeElement = document.createElement('code');
    
    pre.style.backgroundColor = '#f6f8fa';
    pre.style.padding = '16px';
    pre.style.borderRadius = '6px';
    pre.style.overflow = 'auto';
    pre.style.margin = '10px 0';
    
    codeElement.style.fontFamily = 'monospace';
    codeElement.style.whiteSpace = 'pre';
    codeElement.textContent = code;
    
    pre.appendChild(codeElement);
    range.deleteContents();
    range.insertNode(pre);
    handleChange();
  }, [getSelection]);

  return {
    formatText,
    alignText,
    setFontStyle,
    insertLink,
    insertImage,
    insertCodeBlock
  };
};