import { CustomFile } from '@/lib/types/file';

//对文件大小自适应单位并格式化输出
export const formatFileSize = (sizeInBytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
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