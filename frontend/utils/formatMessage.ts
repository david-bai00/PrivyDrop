export function formatFileChosen(
    template: string, 
    fileNum: number, 
    folderNum: number
  ) {
    return template.replace('{fileNum}', fileNum.toString())
                  .replace('{folderNum}', folderNum.toString());
}
export function formatFolderTips(
  template: string, 
  name: string, 
  num: number, 
  size: string
) {
  return template.replace('{name}', name).replace('{num}', num.toString()).replace('{size}', size);
}
export function formatFolderDis(
  template: string, 
  num: number, 
  size: string
) {
  return template.replace('{num}', num.toString()).replace('{size}', size);
}
export function format_peopleMsg(
  template: string, 
  peerCount: number
) {
  return template.replace('{peerCount}', peerCount.toString());
}
