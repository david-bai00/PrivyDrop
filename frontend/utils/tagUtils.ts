export const slugifyTag = (tag: string): string => {
  // 使用 encodeURIComponent 来处理中文和特殊字符
  return encodeURIComponent(tag
    .trim()
    .replace(/\s+/g, '-')    // 将空格替换为连字符
    .replace(/\-\-+/g, '-')  // 将多个连字符替换为单个
    .replace(/^-+/, '')      // 移除开头的连字符
    .replace(/-+$/, '')      // 移除结尾的连字符
  );
};

export const unslugifyTag = (slug: string): string => {
  // 解码 URL 编码的标签
  return decodeURIComponent(slug
    .replace(/-/g, ' ')      // 将连字符替换回空格
    .trim()
  );
};