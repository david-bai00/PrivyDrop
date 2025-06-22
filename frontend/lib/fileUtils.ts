import { CustomFile } from "@/types/webrtc";

// Adaptively format the file size with units
export const formatFileSize = (sizeInBytes: number): string => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = sizeInBytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

export const generateFileId = (file: CustomFile): string => {
  return `${file.fullName}-${file.size}-${file.type}-${file.lastModified}`;
};
/**
 * Triggers a browser download for the given file-like object.
 * @param file - The file blob or any file-like object that can be used with URL.createObjectURL.
 * @param saveName - The name to use for the downloaded file.
 */
export const downloadAs = async (
  file: Blob | File,
  saveName: string
): Promise<void> => {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = saveName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
