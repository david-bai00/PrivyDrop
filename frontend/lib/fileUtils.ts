import { CustomFile } from "@/types/webrtc";
import { postLogToBackend } from "@/app/config/api";

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
  // Check if file is empty
  if (file.size === 0) {
    postLogToBackend(
      `[Firefox Debug] CRITICAL ERROR: downloadAs received a file with 0 size! This is the root cause of the 0-byte download issue.`
    );
  }

  try {
    const url = URL.createObjectURL(file);

    const a = document.createElement("a");
    a.href = url;
    a.download = saveName;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  } catch (error) {
    postLogToBackend(`[Firefox Debug] ERROR in downloadAs: ${error}`);
    throw error;
  }
};

export const traverseFileTree = async (
  item: FileSystemEntry,
  path = ""
): Promise<CustomFile[]> => {
  return new Promise((resolve) => {
    if (item.isFile) {
      (item as FileSystemFileEntry).file((file: File) => {
        const customFile: CustomFile = Object.assign(file, {
          fullName: path + file.name,
          folderName: path.split("/")[0],
        });
        resolve([customFile]);
      });
    } else if (item.isDirectory) {
      const dirReader = (item as FileSystemDirectoryEntry).createReader();
      let entries: FileSystemEntry[] = [];

      const readEntries = () => {
        dirReader.readEntries(async (results) => {
          if (results.length) {
            entries = entries.concat(Array.from(results));
            readEntries();
          } else {
            const newPath = path + item.name + "/";
            const subResults = await Promise.all(
              entries.map((entry) => traverseFileTree(entry, newPath))
            );
            const files: CustomFile[] = subResults.flat();
            resolve(files);
          }
        });
      };

      readEntries();
    } else {
      resolve([]);
    }
  });
};
