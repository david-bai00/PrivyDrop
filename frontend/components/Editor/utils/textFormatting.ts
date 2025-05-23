import { FormatType, StyledElement } from '../types';
import { styleMap } from '../constants';
// 移除样式
export const removeStyle = (element: StyledElement, style: FormatType) => {
  element.style[styleMap[style]] = '';// 移除指定样式
  // 如果span没有其他样式，则移除span标签
  if (element.tagName === 'SPAN' && !element.getAttribute('style')) {
    const parent = element.parentNode;
    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
  }
};