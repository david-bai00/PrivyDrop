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

  // Format text (bold, italic, underline)
  const formatText = useCallback((format: FormatType) => {
    if (typeof window === 'undefined') return;
    
    const selectionInfo = getSelection();
    if (!selectionInfo || !selectionInfo.selection.toString()) return;

    const { selection, range } = selectionInfo;
    
    const styleParent = findStyleParent(selection.anchorNode as DOMNodeWithStyle, styleMap[format]);

    if (styleParent) {
      // Remove style
      removeStyle(styleParent, format);
    } else {
      // Add style
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

      // If the selected content is within a span and that span does not have the target style, add the style directly
      const parentElement = selection.anchorNode?.parentElement;
      if (parentElement && 
          parentElement.tagName === 'SPAN' && 
          !(parentElement as StyledElement).style[styleMap[format]] && 
          parentElement !== editorRef.current) {

        (parentElement as StyledElement).style[styleMap[format]] = span.style[styleMap[format]];
      
      } else {
        // Otherwise, create a new span
        span.appendChild(range.extractContents());
        range.insertNode(span);
      }
    }
    // Maintain selection
    const newRange = document.createRange();
    selection.removeAllRanges();
    selection.addRange(newRange);
    
    // Update HTML
    handleChange();
  }, [findStyleParent, getSelection, removeStyle]);

  // Align text
  const alignText = useCallback((alignment: AlignmentType) => {
    if (!editorRef.current || typeof window === 'undefined') return;
    
    const selectionInfo = getSelection();
    if (!selectionInfo) return;
    
    // Find the current text node or its container
    let textNode = selectionInfo.selection.anchorNode as DOMNodeWithStyle;
    
    // If it is a text node, get its parent element
    if (textNode.nodeType === 3) {
      textNode = textNode.parentElement as DOMNodeWithStyle;
    }

    // Search outwards for the outermost style container (e.g., a span with color or size)
    let outerContainer = textNode;
    while (
      outerContainer.parentElement && 
      outerContainer.parentElement !== editorRef.current &&
      (outerContainer.parentElement as HTMLElement).tagName === 'SPAN'
    ) {
      outerContainer = outerContainer.parentElement as DOMNodeWithStyle;
    }

    // Create or find a div container to handle alignment
    let alignmentContainer: HTMLElement;
    if (
      outerContainer.parentElement === editorRef.current || 
      (outerContainer.parentElement as HTMLElement).tagName !== 'DIV'
    ) {
      // A new alignment container needs to be created
      alignmentContainer = document.createElement('div');
      alignmentContainer.style.textAlign = alignment;
      // Wrap existing content
      outerContainer.parentElement?.insertBefore(alignmentContainer, outerContainer);
      alignmentContainer.appendChild(outerContainer);
        } else {
      // Use the existing alignment container
      alignmentContainer = outerContainer.parentElement as HTMLElement;
      alignmentContainer.style.textAlign = alignment;
    }
  
    // Update HTML
    handleChange();
  }, [getSelection]);

  // Set font style
  const setFontStyle = useCallback((type: FontStyleType, value: string) => {
    if (typeof window === 'undefined') return;
    const selectionInfo = getSelection();
    if (!selectionInfo || !selectionInfo.selection.toString()) return;
    const { selection, range } = selectionInfo;
     // Map style type to actual CSS property name
    const stylePropertyMap = {
      'family': 'fontFamily',
      'size': 'fontSize',
      'color': 'color'
    };
    const styleProperty = stylePropertyMap[type];
    // Get the range of the selected content
    const rangeContent = range.cloneContents();
    // Check if the selected content contains block-level <p> / <div> elements
    const containsBlock = Array.from(rangeContent.childNodes).some(
      node => node.nodeType === 1 && ['P', 'DIV'].includes((node as HTMLElement).tagName)
    );

    if (containsBlock) {
      // If the selected content includes block-level elements, iterate through and process the text within each block-level element
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
          // Check if the parent element is already a span
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
      // Clear the original content and insert new content
      range.deleteContents();
      range.insertNode(rangeContent);
    } else {
      // If it's plain text, use the original logic
      let styleParent = findStyleParent(selection.anchorNode as DOMNodeWithStyle, styleProperty);
      if (styleParent && !['P', 'DIV'].includes(styleParent.tagName)) {
        if (value === 'inherit') {
          styleParent.style[styleProperty] = '';
          cleanupSpan(styleParent);
        } else {
          styleParent.style[styleProperty] = value;
        }
      } else {
        // Otherwise, create a new span
        const span = document.createElement('span') as StyledElement;
        span.style[styleProperty] = value;
        span.appendChild(range.extractContents());
        range.insertNode(span);
      }
    }
    
    // Maintain selection
    selection.removeAllRanges();
    selection.addRange(range);
    
    handleChange();
  }, [getSelection, findStyleParent, cleanupSpan]);

  // Insert link
  const insertLink = useCallback(() => {
    const selection = window.getSelection();
    let text = "test";
    if (selection && !selection.isCollapsed) {
      // If there is selected text, use the selected text as the link text
      text = selection.toString();
    }
    
    // Use a prompt to separate the link and text with a space
    const input = prompt('Please enter the link address and text (separated by space):', `https:// ${text}`);

    if (input) {
      // Split the input to get the url and text
      const [url, ...textParts] = input.split(' ');
      const text = textParts.join(' '); // Handle cases where the text may contain spaces
      
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