import { visit } from 'unist-util-visit';
import remarkGfm from 'remark-gfm';
import type { Root, Element, Text as HastText, Properties } from 'hast';
import type { Plugin } from 'unified';
import type { Root as MdastRoot, Code, Text } from 'mdast';
import type { BuildVisitor } from 'unist-util-visit';

// MDX AST 节点类型定义
interface MdxJsxFlowElement {
  type: 'mdxJsxFlowElement';
  name: string;
  children: Text[];
}

// 扩展的属性类型
interface ExtendedProperties extends Properties {
    className?: string;
    id?: string;
}

// 扩展的元素类型
interface ExtendedElement extends Omit<Element, 'properties'> {
  properties: ExtendedProperties;
}

// 生成合法的 ID，保留中文字符
const generateValidId = (text: string): string => {
  return encodeURIComponent(text
  .trim() // 移除首尾空格
  .replace(/\s+/g, '-') // 将空格替换为连字符
  .replace(/\-\-+/g, '-') // 将多个连字符替换为单个
  .replace(/^-+/, '') // 移除开头的连字符
  .replace(/-+$/, '') // 移除结尾的连字符
  );
};

// 获取唯一 ID
const getUniqueId = (baseId: string, usedIds: Set<string>): string => {
  let uniqueId = baseId;
  let counter = 1;
  while (usedIds.has(uniqueId)) {
    uniqueId = `${baseId}-${counter}`;
    counter++;
  }
  return uniqueId;
};

export const mdxOptions = {
  mdxOptions: {
    remarkPlugins: [
      remarkGfm,
      // mermaid 代码块处理插件
      (() => {
        return (tree: MdastRoot) => {
          visit(tree, 'code', (node: Code) => {
          if (node.lang === 'mermaid') {
              const mermaidNode = node as unknown as MdxJsxFlowElement;
              mermaidNode.type = 'mdxJsxFlowElement';
              mermaidNode.name = 'mermaid';
              mermaidNode.children = [{ type: 'text', value: node.value } as Text];
          }
          });
          return tree;
        };
      }) as Plugin<[], MdastRoot>,
    ],
    rehypePlugins: [
      // 处理图片和表格的插件
      (() => {
        return (tree: Root) => {
          visit(tree, 'element', ((node: Element, index: number | null, parent: Element | Root | null) => {
            if (node.tagName === 'img') {
              if (parent && 'tagName' in parent) {
                (parent as ExtendedElement).tagName = 'div';
                (parent as ExtendedElement).properties = {
                  ...((parent as ExtendedElement).properties || {}),
                  className: 'image-container'
                };
              }
            }
            if (node.tagName === 'table') {
              (node as ExtendedElement).properties = {
                ...((node as ExtendedElement).properties || {}),
                className: 'min-w-full divide-y divide-gray-300'
              };
            }
          }) as BuildVisitor<Root, 'element'>);
          return tree;
        };
      }) as Plugin<[], Root>,
      
      // 处理标题 ID 的插件
      (() => {
        return (tree: Root) => {
        const usedIds = new Set<string>();//记录使用的ID，避免重复
          visit(tree, 'element', ((node: Element, index: number | null, parent: Element | Root | null) => {
            if (['h1', 'h2', 'h3'].includes(node.tagName)) {
              let titleText = '';
              visit(node, 'text', ((textNode: HastText) => {
                titleText += textNode.value;
              }) as BuildVisitor<Element, 'text'>);
              
              if (titleText) {
                let id = generateValidId(titleText);
                let uniqueId = getUniqueId(id, usedIds);// 处理重复 ID,加数字后缀
                usedIds.add(uniqueId);
                
                (node as ExtendedElement).properties = {
                  ...((node as ExtendedElement).properties || {}),
                  id: uniqueId
                };
              }
            }
          }) as BuildVisitor<Root, 'element'>);
          return tree;
        };
      }) as Plugin<[], Root>,
    ],
  },
};