import { generateFileId } from "@/lib/fileUtils";
import type { CustomFile, FileMeta } from "@/types/webrtc";

export function isCustomFile(file: FileMeta | CustomFile): file is CustomFile {
  return typeof (file as CustomFile).arrayBuffer === "function";
}

export function isFileMetaArray(
  files: FileMeta[] | CustomFile[]
): files is FileMeta[] {
  return files.length === 0 || !isCustomFile(files[0]);
}

export function normalizeDisplayFiles(
  files: FileMeta[] | CustomFile[]
): FileMeta[] {
  if (isFileMetaArray(files)) {
    return files;
  }

  return files.map((file) => ({
    name: file.name,
    size: file.size,
    fullName: file.fullName,
    folderName: file.folderName,
    fileType: file.type,
    fileId: generateFileId(file),
    lastModified: file.lastModified,
  }));
}
