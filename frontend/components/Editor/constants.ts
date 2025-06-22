export const styleMap = {
  bold: "fontWeight",
  italic: "fontStyle",
  underline: "textDecoration",
} as const;

export const fontFamilies = [
  { label: "Default", value: "inherit" },
  { label: "Arial", value: "Arial" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Courier New", value: "Courier New" },
  { label: "Georgia", value: "Georgia" },
];

export const fontSizes = [
  { label: "Small", value: "12px" },
  { label: "Normal", value: "16px" },
  { label: "Large", value: "20px" },
  { label: "Extra Large", value: "24px" },
  { label: "28px", value: "28px" },
  { label: "32px", value: "32px" },
  { label: "36px", value: "36px" },
  { label: "40px", value: "40px" },
];

export const colors = [
  { label: "Black", value: "#000000" },
  { label: "Red", value: "#FF0000" },
  { label: "Green", value: "#008000" },
  { label: "Blue", value: "#0000FF" },
];
