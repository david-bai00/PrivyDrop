// Option type definition
export interface StyleOption {
  label: string;
  value: string;
}

// Props type for the SelectMenu component
export interface SelectMenuProps {
  options: StyleOption[];
  onChange: (value: string) => void;
  icon: React.ElementType;
  placeholder: string;
  className: string;
}

// Types used internally by the editor
export interface SelectionInfo {
  selection: Selection;
  range: Range;
}

// Style format type
export type FormatType = 'bold' | 'italic' | 'underline';

// Alignment type
export type AlignmentType = 'left' | 'center' | 'right';

// Font style type
export type FontStyleType = 'family' | 'size' | 'color';

// Paste event handler function type
export interface CustomClipboardEvent extends React.ClipboardEvent<HTMLDivElement> {
  clipboardData: DataTransfer;
}

// Extend HTMLElement to support the style properties we need
export interface StyledElement extends HTMLElement {
  style: CSSStyleDeclaration & {
    [key: string]: string;
  };
  tagName: string;
  getAttribute(name: string): string | null;
  parentNode: HTMLElement;
  firstChild: ChildNode | null;
}

// Modify DOM node type definition
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