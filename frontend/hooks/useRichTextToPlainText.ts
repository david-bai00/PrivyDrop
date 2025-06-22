import { useEffect, useState } from 'react';

// We convert the function into a custom Hook useRichTextToPlainText. 
// This allows us to use React's lifecycle methods to detect if we are in a browser environment.
// Use useState and useEffect to detect if we are in a browser environment. 
// useEffect only runs on the client side, so we can safely set isBrowser to true in it.
function useRichTextToPlainText() {
  const [isBrowser, setIsBrowser] = useState(false);

  useEffect(() => {
    setIsBrowser(true);
  }, []);

  const richTextToPlainText = (richText: string): string => {
    if (!isBrowser) {
      return richText; // On the server side, return the original text directly
    }
    // Create a temporary DOM element
    const tempElement = document.createElement("div");
    
    // Set the rich text content as the innerHTML of the temporary element
    tempElement.innerHTML = richText;
    
    // Process direct text nodes (text not inside any block-level elements)
    // Wrap them in a div for consistent processing
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

    // Process all block-level elements
    const blockElements = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre'];
    blockElements.forEach(tag => {
      tempElement.querySelectorAll(tag).forEach(element => {
        // If the element content is empty or only contains <br>, replace it with a double newline
        if (!element.textContent?.trim() || element.innerHTML === '<br>') {
          element.replaceWith('\n\n');
        } else {
          // Otherwise, add a newline after the content
          element.replaceWith(element.textContent + '\n');
        }
      });
    });

    // Process <br> tags
    tempElement.querySelectorAll('br').forEach(br => {
      br.replaceWith('\n');
    });

    // Get and process the plain text
    let plainText = tempElement.textContent || tempElement.innerText || '';

    // Process consecutive newline characters
    plainText = plainText
      .replace(/\n{3,}/g, '\n\n')  // Replace 3 or more consecutive newline characters with 2
      .replace(/^\n+/, '')         // Remove leading newline characters
      .replace(/\n+$/, '')         // Remove trailing newline characters
      .trim();                     // Trim leading/trailing whitespace

    return plainText;
  };

  return richTextToPlainText;
}

export default useRichTextToPlainText;
