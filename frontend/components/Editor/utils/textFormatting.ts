import { FormatType, StyledElement } from "../types";
import { styleMap } from "../constants";
// Remove style
export const removeStyle = (element: StyledElement, style: FormatType) => {
  element.style[styleMap[style]] = ""; // Remove the specified style
  // If the span has no other styles, remove the span tag
  if (element.tagName === "SPAN" && !element.getAttribute("style")) {
    const parent = element.parentNode;
    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
  }
};
