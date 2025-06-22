import Image from "next/image";
import { ComponentProps, DetailedHTMLProps, HTMLAttributes } from "react";
import dynamic from "next/dynamic";
// Dynamically import the Mermaid component
const Mermaid = dynamic(() => import("@/components/blog/Mermaid"), {
  ssr: false,
});

export type MDXComponents = {
  p: (
    props: DetailedHTMLProps<
      HTMLAttributes<HTMLParagraphElement>,
      HTMLParagraphElement
    >
  ) => JSX.Element;
  img: (props: ComponentProps<"img">) => JSX.Element;
  pre: (
    props: DetailedHTMLProps<HTMLAttributes<HTMLPreElement>, HTMLPreElement>
  ) => JSX.Element;
  code: (
    props: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>
  ) => JSX.Element;
  table: (
    props: DetailedHTMLProps<HTMLAttributes<HTMLTableElement>, HTMLTableElement>
  ) => JSX.Element;
  thead: (
    props: DetailedHTMLProps<
      HTMLAttributes<HTMLTableSectionElement>,
      HTMLTableSectionElement
    >
  ) => JSX.Element;
  tbody: (
    props: DetailedHTMLProps<
      HTMLAttributes<HTMLTableSectionElement>,
      HTMLTableSectionElement
    >
  ) => JSX.Element;
  tr: (
    props: DetailedHTMLProps<
      HTMLAttributes<HTMLTableRowElement>,
      HTMLTableRowElement
    >
  ) => JSX.Element;
  th: (
    props: DetailedHTMLProps<
      HTMLAttributes<HTMLTableCellElement>,
      HTMLTableCellElement
    >
  ) => JSX.Element;
  td: (
    props: DetailedHTMLProps<
      HTMLAttributes<HTMLTableCellElement>,
      HTMLTableCellElement
    >
  ) => JSX.Element;
  blockquote: (
    props: DetailedHTMLProps<HTMLAttributes<HTMLQuoteElement>, HTMLQuoteElement>
  ) => JSX.Element;
  ul: (
    props: DetailedHTMLProps<HTMLAttributes<HTMLUListElement>, HTMLUListElement>
  ) => JSX.Element;
  ol: (
    props: DetailedHTMLProps<HTMLAttributes<HTMLOListElement>, HTMLOListElement>
  ) => JSX.Element;
  li: (
    props: DetailedHTMLProps<HTMLAttributes<HTMLLIElement>, HTMLLIElement>
  ) => JSX.Element;
  mermaid: React.ComponentType<{ children: string }>;
};

// Custom MDX components
export const mdxComponents: MDXComponents = {
  p: ({ children, ...props }) => (
    <div className="mb-6 leading-relaxed text-gray-700" {...props}>
      {children}
    </div>
  ),
  img: (props) => {
    const { src, ...rest } = props;
    if (!src) {
      return <div className="my-8">Image source is missing</div>;
    }

    return (
      <div className="my-8">
        <Image
          src={src}
          {...rest}
          width={800}
          height={400}
          className="rounded-lg w-full"
          alt={props.alt || ""}
        />
        {props.alt && (
          <div className="text-center text-sm text-gray-600 mt-2 italic">
            {props.alt}
          </div>
        )}
      </div>
    );
  },
  pre: ({ children, ...props }) => (
    <pre
      className="relative my-6 rounded-lg bg-gray-50 border border-gray-200 p-4 overflow-x-auto"
      {...props}
    >
      {children}
    </pre>
  ),
  code: ({ children, className, ...props }) => {
    const isInlineCode = !className;
    return isInlineCode ? (
      <code
        className="bg-gray-50 rounded px-1.5 py-0.5 text-gray-800 border border-gray-200 text-sm"
        {...props}
      >
        {children}
      </code>
    ) : (
      <code className="block text-gray-800 text-sm" {...props}>
        {children}
      </code>
    );
  },
  table: ({ children, ...props }) => (
    <div className="my-8 w-full overflow-x-auto">
      <table
        className="min-w-full divide-y divide-gray-300 border border-gray-300"
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-gray-50" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody className="divide-y divide-gray-200 bg-white" {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }) => (
    <tr className="hover:bg-gray-50" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r last:border-r-0"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td
      className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 border-r last:border-r-0"
      {...props}
    >
      {children}
    </td>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-4 border-blue-500 pl-4 my-4 italic text-gray-600 bg-gray-50 py-2 rounded-r-lg"
      {...props}
    >
      {children}
    </blockquote>
  ),
  ul: ({ children, ...props }) => (
    <ul
      className="list-disc list-outside ml-6 my-6 space-y-2 text-gray-700"
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      className="list-decimal list-outside ml-6 my-6 space-y-2 text-gray-700"
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="pl-2 leading-relaxed" {...props}>
      {children}
    </li>
  ),
  mermaid: Mermaid, // Use the defined Mermaid component
};
