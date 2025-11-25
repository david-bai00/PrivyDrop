import { visit } from "unist-util-visit";
import remarkGfm from "remark-gfm";
import type { Root, Element, Text as HastText, Properties } from "hast";
import type { Plugin } from "unified";
import type { Root as MdastRoot, Code, Text } from "mdast";
import type { BuildVisitor } from "unist-util-visit";

// MDX AST Node Type Definition
interface MdxJsxFlowElement {
  type: "mdxJsxFlowElement";
  name: string;
  children: Text[];
}

// Extended Properties Type
interface ExtendedProperties extends Properties {
  className?: string;
  id?: string;
}

// Extended Element Type
interface ExtendedElement extends Omit<Element, "properties"> {
  properties: ExtendedProperties;
}

// Generate a valid ID, preserving Chinese characters
const generateValidId = (text: string): string => {
  return encodeURIComponent(
    text
      .trim() // Trim leading/trailing whitespace
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/\-\-+/g, "-") // Replace multiple hyphens with a single one
      .replace(/^-+/, "") // Remove leading hyphens
      .replace(/-+$/, "") // Remove trailing hyphens
  );
};

// Get a unique ID
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
      // Mermaid code block processing plugin
      (() => {
        return (tree: MdastRoot) => {
          visit(tree, "code", (node: Code) => {
            if (node.lang === "mermaid") {
              const mermaidNode = node as unknown as MdxJsxFlowElement;
              mermaidNode.type = "mdxJsxFlowElement";
              mermaidNode.name = "mermaid";
              mermaidNode.children = [
                { type: "text", value: node.value } as Text,
              ];
            }
          });
          return tree;
        };
      }) as Plugin<[], MdastRoot>,
    ],
    rehypePlugins: [
      // Plugin to handle images and tables
      (() => {
        return (tree: Root) => {
          visit(tree, "element", ((
            node: Element,
            index: number | null,
            parent: Element | Root | null
          ) => {
            if (node.tagName === "img") {
              if (parent && "tagName" in parent) {
                (parent as ExtendedElement).tagName = "div";
                (parent as ExtendedElement).properties = {
                  ...((parent as ExtendedElement).properties || {}),
                  className: "image-container",
                };
              }
            }
            if (node.tagName === "table") {
              (node as ExtendedElement).properties = {
                ...((node as ExtendedElement).properties || {}),
                className: "min-w-full divide-y divide-border",
              };
            }
          }) as BuildVisitor<Root, "element">);
          return tree;
        };
      }) as Plugin<[], Root>,

      // Plugin to handle heading IDs
      (() => {
        return (tree: Root) => {
          const usedIds = new Set<string>(); // Keep track of used IDs to avoid duplicates
          visit(tree, "element", ((
            node: Element,
            index: number | null,
            parent: Element | Root | null
          ) => {
            if (["h1", "h2", "h3"].includes(node.tagName)) {
              let titleText = "";
              visit(node, "text", ((textNode: HastText) => {
                titleText += textNode.value;
              }) as BuildVisitor<Element, "text">);

              if (titleText) {
                let id = generateValidId(titleText);
                let uniqueId = getUniqueId(id, usedIds); // Handle duplicate IDs by adding a numeric suffix
                usedIds.add(uniqueId);

                (node as ExtendedElement).properties = {
                  ...((node as ExtendedElement).properties || {}),
                  id: uniqueId,
                };
              }
            }
          }) as BuildVisitor<Root, "element">);
          return tree;
        };
      }) as Plugin<[], Root>,
    ],
  },
};
