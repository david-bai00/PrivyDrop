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
  //在挂载后更新编辑区内容,监听外部 value 变化
  useEffect(() => {
    if (isMounted && editorRef.current && !isInternalChange.current) {
      // 只有当内容真正不同时才更新
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
        setHtml(value);
      }
    }
    isInternalChange.current = false;
  }, [value, isMounted]);

  // 处理内容变化
  const handleChange = useCallback(() => {
    if (editorRef.current) {
      const content = (editorRef.current as HTMLDivElement).innerHTML;
      if (content !== html) {// 如果内容没有变化，不触发更新
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
  // 检查当前选中文本的样式
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
    // 处理图片粘贴
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
    
    // 处理普通文本
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
        {/* 工具栏 - 添加浅灰色背景和底部边框 */}
        <div className="flex flex-wrap gap-1 p-2 bg-gray-50 border-b">
          {/* 基础格式工具组 */}
          <BasicFormatTools 
            isStyleActive={isStyleActive} 
            formatText={formatText} 
          />
          <Divider />
          
          {/* 字体相关选择器组 */}
          <FontTools 
            fontFamilies={fontFamilies}
            fontSizes={fontSizes}
            colors={colors}
            setFontStyle={setFontStyle}
          />
          <Divider />
          
          {/* 对齐工具组 */}
          <AlignmentTools alignText={alignText} />
          <Divider />
      
          {/* 插入工具组 */}
          <InsertTools 
            insertLink={insertLink}
            insertImage={insertImage}
            insertCodeBlock={insertCodeBlock}
          />
        </div>

      {/* 编辑区域 - 添加纯白背景和内部阴影效果 */}
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