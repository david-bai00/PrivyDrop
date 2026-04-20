interface FileChosenTextOptions {
  fileNum: number;
  folderNum: number;
  fileChosenLabel: (values: { fileNum: number; folderNum: number }) => string;
}

export function getFileChosenText({
  fileNum,
  folderNum,
  fileChosenLabel,
}: FileChosenTextOptions): string {
  return fileChosenLabel({ fileNum, folderNum });
}
