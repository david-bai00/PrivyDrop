export const slugifyTag = (tag: string): string => {
  // Use encodeURIComponent to handle Chinese and special characters
  return encodeURIComponent(tag
    .trim()
    .replace(/\s+/g, '-')    // Replace spaces with hyphens
    .replace(/\-\-+/g, '-')  // Replace multiple hyphens with a single one
    .replace(/^-+/, '')      // Remove leading hyphens
    .replace(/-+$/, '')      // Remove trailing hyphens
  );
};

export const unslugifyTag = (slug: string): string => {
  // Decode URL-encoded tags
  return decodeURIComponent(slug
    .replace(/-/g, ' ')      // Replace hyphens back with spaces
    .trim()
  );
};