declare module 'lodash';
interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}