import React, { useState, useRef, useCallback, useEffect } from 'react';
import { EditorProps, CustomClipboardEvent, DOMNodeWithStyle } from './types';
import { fontFamilies, fontSizes, colors } from './constants';
import { useEditorCommands } from './hooks/useEditorCommands';
import { useSelection } from './hooks/useSelection';
import { useStyleManagement } from './hooks/useStyleManagement';
import { BasicFormatTools } from './EditorToolbar/BasicFormatTools';
import { FontTools } from './EditorToolbar/FontTools';
import { AlignmentTools } from './EditorToolbar/AlignmentTools';
import { InsertTools } from './EditorToolbar/InsertTools';
import { Divider } from './Divider';

const RichTextEditor: React.FC<EditorProps> = ({ onChange, value = '' }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(value);
  const [isMounted, setIsMounted] = useState(false);
  const isInternalChange = useRef(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);
  // Update editor content after mounting, listen for external value changes
  useEffect(() => {
    if (isMounted && editorRef.current && !isInternalChange.current) {
      // Only update when the content is truly different
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
        setHtml(value);
      }
    }
    isInternalChange.current = false;
  }, [value, isMounted]);

  // Handle content change
  const handleChange = useCallback(() => {
    if (editorRef.current) {
      const content = (editorRef.current as HTMLDivElement).innerHTML;
      if (content !== html) {// If the content has not changed, do not trigger an update
        isInternalChange.current = true;
        setHtml(content);
        onChange(content);
      }
    }
  }, [html, onChange]);

  const {
    formatText,
    alignText,
    setFontStyle,
    insertLink,
    insertImage,
    insertCodeBlock
  } = useEditorCommands(editorRef, handleChange);

  const getSelection = useSelection();
  const { findStyleParent } = useStyleManagement(editorRef);
  // Check the style of the currently selected text
  const isStyleActive = useCallback((style: string): boolean => {
    if (typeof window === 'undefined') return false;
    const selectionInfo = getSelection();
    if (!selectionInfo || !selectionInfo.selection.toString()) return false;

    const node = selectionInfo.selection.anchorNode;
    if (!node) return false;
    
    const styleParent = findStyleParent(node as DOMNodeWithStyle, style);
    return !!styleParent;
  }, [findStyleParent, getSelection]);

  const handlePaste = useCallback((e: CustomClipboardEvent) => {
    // Handle image pasting
    if (Array.from(e.clipboardData.items).some(item => item.type.indexOf('image') !== -1)) {
      const items = Array.from(e.clipboardData.items);
      const imageItem = items.find(item => item.type.indexOf('image') !== -1);
      
      if (imageItem) {
        e.preventDefault();
        const blob = imageItem.getAsFile();
        if (!blob) return;
        
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
        reader.readAsDataURL(blob);
      }
      return;
    }
    
    // Handle plain text
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (typeof document !== 'undefined') {
      document.execCommand('insertText', false, text);
    }
  }, [getSelection, handleChange]);

  if (!isMounted) {
    return <div>Loading...</div>;
  }

  return (
    <div className="w-full space-x-2 mb-4">
      <div className="border rounded-lg shadow-sm overflow-hidden">
        {/* Toolbar - Add light gray background and bottom border */}
        <div className="flex flex-wrap gap-1 p-2 bg-gray-50 border-b">
          {/* Basic format tool group */}
          <BasicFormatTools 
            isStyleActive={isStyleActive} 
            formatText={formatText} 
          />
          <Divider />
          
          {/* Font-related selector group */}
          <FontTools 
            fontFamilies={fontFamilies}
            fontSizes={fontSizes}
            colors={colors}
            setFontStyle={setFontStyle}
          />
          <Divider />
          
          {/* Alignment tool group */}
          <AlignmentTools alignText={alignText} />
          <Divider />
      
          {/* Insert tool group */}
          <InsertTools 
            insertLink={insertLink}
            insertImage={insertImage}
            insertCodeBlock={insertCodeBlock}
          />
        </div>

      {/* Editor area - Add pure white background and inner shadow effect */}
        <div
          ref={editorRef}
          className="p-4 min-h-[200px] md:min-h-[400px] focus:outline-none bg-white shadow-inner"
          contentEditable
          onPaste={handlePaste}
          onInput={handleChange}
          suppressContentEditableWarning
        />
      </div>
    </div>
  );
};

export default RichTextEditor;