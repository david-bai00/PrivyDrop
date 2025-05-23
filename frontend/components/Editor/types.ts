// 选项类型定义
export interface StyleOption {
  label: string;
  value: string;
}

// 选择菜单组件的 props 类型
export interface SelectMenuProps {
  options: StyleOption[];
  onChange: (value: string) => void;
  icon: React.ElementType;
  placeholder: string;
  className: string;
}

// 编辑器内部使用的类型
export interface SelectionInfo {
  selection: Selection;
  range: Range;
}

// 样式格式类型
export type FormatType = 'bold' | 'italic' | 'underline';

// 对齐方式类型
export type AlignmentType = 'left' | 'center' | 'right';

// 字体样式类型
export type FontStyleType = 'family' | 'size' | 'color';

// 粘贴事件处理函数类型
export interface CustomClipboardEvent extends React.ClipboardEvent<HTMLDivElement> {
  clipboardData: DataTransfer;
}

// 扩展 HTMLElement 以支持我们需要的样式属性
export interface StyledElement extends HTMLElement {
  style: CSSStyleDeclaration & {
    [key: string]: string;
  };
  tagName: string;
  getAttribute(name: string): string | null;
  parentNode: HTMLElement;
  firstChild: ChildNode | null;
}

// 修改DOM节点类型定义
export interface DOMNodeWithStyle extends Node {
  nodeType: number;
  parentElement: HTMLElement & {
    style: CSSStyleDeclaration;
  };
  style?: CSSStyleDeclaration;
}

export interface EditorProps {
  onChange: (html: string) => void;
  value?: string;
}