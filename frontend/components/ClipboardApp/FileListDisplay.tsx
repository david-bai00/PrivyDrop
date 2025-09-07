import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Trash2 } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import TransferProgress from "./TransferProgress";
import { formatFileSize, generateFileId } from "@/lib/fileUtils";
import { AutoPopupDialog } from "@/components/common/AutoPopupDialog";
import { FileMeta, CustomFile, Progress } from "@/types/webrtc";
import FileTransferButton from "./FileTransferButton";
import { getDictionary } from "@/lib/dictionary";
import { useLocale } from "@/hooks/useLocale";
import type { Messages } from "@/types/messages";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import { supportsAutoDownload } from "@/lib/browserUtils";
import { postLogToBackend } from "@/app/config/api";
const developmentEnv = process.env.NEXT_PUBLIC_development!;

function formatFolderDis(template: string, num: number, size: string) {
  return template.replace("{num}", num.toString()).replace("{size}", size);
}

function formatFolderTips(
  template: string,
  name: string,
  num: number,
  size: string
) {
  return template
    .replace("{name}", name)
    .replace("{num}", num.toString())
    .replace("{size}", size);
}

interface FileListDisplayProps {
  mode: "sender" | "receiver";
  files: FileMeta[] | CustomFile[];
  fileProgresses: {
    [fileId: string]: {
      [peerId: string]: Progress;
    };
  };
  isAnyFileTransferring: boolean; // State lifted up
  onDownload?: (item: FileMeta) => void;
  onRequest?: (item: FileMeta) => void; // Request file
  onDelete?: (item: FileMeta) => void;
  onLocationPick?: () => Promise<boolean>;
  onSafeSave?: () => void; // New prop for safe save functionality
  saveType?: { [fileId: string]: boolean }; // File stored on disk or in memory
  largeFileThreshold?: number;
}
// Add type guard helper function
function isCustomFile(file: FileMeta | CustomFile): file is CustomFile {
  return "lastModified" in file; // Use a property specific to File objects to check
}
function isFileMetaArray(
  files: FileMeta[] | CustomFile[]
): files is FileMeta[] {
  return files.length === 0 || !isCustomFile(files[0]);
}
const FileListDisplay: React.FC<FileListDisplayProps> = ({
  mode,
  files,
  fileProgresses,
  isAnyFileTransferring,
  onDownload,
  onRequest,
  onDelete,
  onLocationPick,
  onSafeSave,
  saveType,
  largeFileThreshold = 500 * 1024 * 1024, // 500MB default
}) => {
  const locale = useLocale();
  const [messages, setMessages] = useState<Messages | null>(null);

  // 获取store的清理方法
  const { clearSendProgress, clearReceiveProgress } = useFileTransferStore();
  const [showFinished, setShowFinished] = useState<{
    [fileId: string]: boolean;
  }>({});
  // Add a ref to store the previous showFinished state
  const prevShowFinishedRef = useRef<{ [fileId: string]: boolean }>({});

  // 添加待保存状态 - 用于非Chrome浏览器的手动保存
  const [pendingSave, setPendingSave] = useState<{
    [fileId: string]: boolean;
  }>({});

  const [pickedLocation, setPickedLocation] = useState<boolean>(false); // Whether a save directory has been selected
  const [needPickLocation, setNeedPickLocation] = useState<boolean>(false); // Whether a save directory needs to be selected -- for large files, folders, or user choice

  const [folders, setFolders] = useState<FileMeta[]>([]); // Extract folder items from files
  const [singleFiles, setSingleFiles] = useState<FileMeta[]>([]); // Keep single files, not part of a folder
  // Add tracking for currently displayed receiver
  const [activeTransfers, setActiveTransfers] = useState<{
    [fileId: string]: string;
  }>({});
  // Add state for download counts
  const [downloadCounts, setDownloadCounts] = useState<{
    [fileId: string]: number;
  }>({});

  // 处理手动保存 - 用于非Chrome浏览器
  const handleManualSave = (item: FileMeta) => {
    if (onDownload) {
      onDownload(item);
      // 清除待保存状态，让UI显示为"已完成"
      setPendingSave((prev) => {
        const updated = { ...prev };
        delete updated[item.fileId];
        return updated;
      });
    }
  };

  useEffect(() => {
    getDictionary(locale)
      .then((dict) => setMessages(dict))
      .catch((error) => console.error("Failed to load messages:", error));
  }, [locale]);

  useEffect(() => {
    // Separate single files and folders
    const tempSingleFiles: FileMeta[] = [];
    let folders_: { [folderName: string]: FileMeta } = {};
    let needPick = false;

    // If it's a CustomFile[] type, convert it to FileMeta[] first
    const processedFiles: FileMeta[] = isFileMetaArray(files)
      ? files
      : files.map((file) => ({
          name: file.name,
          size: file.size,
          fullName: file.fullName,
          folderName: file.folderName,
          fileType: file.type,
          fileId: generateFileId(file),
        }));
    for (let file of processedFiles) {
      if (file.folderName !== "") {
        folders_[file.folderName] = folders_[file.folderName] || {
          // If the object doesn't exist, initialize it
          name: file.folderName,
          size: 0,
          fullName: file.folderName, // The fullName of a folder is its folderName
          fileType: "folder",
          fileId: file.folderName,
          folderName: file.folderName,
          fileCount: 0,
          fileNamesDis: "",
        };

        folders_[file.folderName].fileCount =
          (folders_[file.folderName].fileCount ?? 0) + 1; // If fileCount is undefined, use default value 0
        folders_[file.folderName].size += file.size;
        folders_[file.folderName].fileNamesDis = folders_[file.folderName]
          .fileNamesDis
          ? folders_[file.folderName].fileNamesDis +
            `${file.name} ${formatFileSize(file.size)}\n`
          : `${file.name} ${formatFileSize(file.size)}\n`;
        needPick = true;
      } else {
        tempSingleFiles.push(file);
        if (file.size >= largeFileThreshold) needPick = true;
      }
    }
    // Use functional updates to ensure the state is updated correctly
    setSingleFiles((prev) => {
      return [...tempSingleFiles];
    });
    setFolders((prev) => {
      return [...Object.values(folders_)];
    });
    setNeedPickLocation(needPick); // Set whether a save directory needs to be selected
  }, [files, largeFileThreshold]);

  useEffect(() => {
    // If a file is requested by multiple receivers simultaneously, the first one will be displayed, then the second after the first finishes.
    let fileIds = [...singleFiles, ...folders].map((file) => file.fileId);

    fileIds.forEach((fileId) => {
      const fileProgress = fileProgresses[fileId];
      if (!fileProgress) return;
      // Get all transfer progresses for the current file
      const transfers = Object.entries(fileProgress);
      // If there are no active transfers, select the first one that started
      let newPeerId = "";
      if (!activeTransfers[fileId] && transfers.length > 0) {
        newPeerId = transfers[0][0];
        setActiveTransfers((prev) => ({
          ...prev,
          [fileId]: newPeerId, // Set the first peerId
        }));
      }
      // set is an async operation, use newPeerId directly instead of reading from activeTransfers
      const activePeerId = newPeerId || activeTransfers[fileId];
      // Check if the current active transfer is complete
      if (activePeerId && fileProgress[activePeerId]?.progress >= 1) {
        // Current transfer is complete, wait 2 seconds before switching to the next incomplete transfer
        if (!showFinished[fileId]) {
          setShowFinished((prev) => ({ ...prev, [fileId]: true }));

          setTimeout(() => {
            setShowFinished((prev) => {
              const updated = { ...prev };
              delete updated[fileId];
              return updated;
            });
            // 根据模式清理对应的progress数据
            if (mode === "sender") {
              clearSendProgress(fileId, activePeerId);
            } else {
              clearReceiveProgress(fileId, activePeerId);
            }
            // Find the next outstanding transfer
            const nextTransfer = transfers.find(
              ([pid, prog]) =>
                pid !== activePeerId && prog.progress > 0 && prog.progress < 1
            );

            setActiveTransfers((prev) => {
              const updated = { ...prev };
              if (nextTransfer) {
                updated[fileId] = nextTransfer[0];
              } else {
                delete updated[fileId];
              }
              return updated;
            });
          }, 3000);
        }
      }
    });
  }, [
    files,
    fileProgresses,
    showFinished,
    activeTransfers,
    folders,
    singleFiles,
  ]);

  useEffect(() => {
    //Monitor the Finished event from false/null to true to trigger the download
    let files_ = [...singleFiles, ...folders];

    files_.forEach((item: FileMeta) => {
      const currentShowFinished = showFinished[item.fileId];
      const prevShowFinished = prevShowFinishedRef.current[item.fileId];
      const isSaveToDisk = saveType ? saveType[item.fileId] : false;

      // 添加详细调试信息
      const fileProgress = fileProgresses[item.fileId];
      const activePeerId = activeTransfers[item.fileId];
      const currentProgress = activePeerId
        ? fileProgress?.[activePeerId]?.progress
        : null;
      // Detecting false -> true transitions
      if (!prevShowFinished && currentShowFinished) {
        if (!isSaveToDisk && onDownload) {
          const isAutoDownloadSupported = supportsAutoDownload();

          // 根据浏览器能力决定下载行为
          if (isAutoDownloadSupported) {
            // Chrome等支持自动下载的浏览器：直接下载
            if (developmentEnv === "true") {
              postLogToBackend(
                `[Firefox Debug] Auto-downloading file: ${item.name}`
              );
            }
            onDownload(item);
          } else {
            // 非Chrome浏览器：设置为待保存状态，等待用户手动点击
            if (developmentEnv === "true") {
              postLogToBackend(
                `[Firefox Debug] Setting pendingSave for non-Chrome browser: ${item.name}`
              );
            }
            setPendingSave((prev) => ({
              ...prev,
              [item.fileId]: true,
            }));
          }
        } else {
          if (developmentEnv === "true") {
            postLogToBackend(
              `[Firefox Debug] Skipping download logic - isSaveToDisk: ${isSaveToDisk}, onDownload: ${!!onDownload}`
            );
          }
        }

        // Increase download count - 文件传输完成时增加下载次数 (只计算一次)
        setDownloadCounts((prevCounts) => ({
          ...prevCounts,
          [item.fileId]: (prevCounts[item.fileId] || 0) + 1,
        }));
      }

      // Update the last status
      prevShowFinishedRef.current[item.fileId] = currentShowFinished;
    });
  }, [showFinished, singleFiles, folders, saveType, onDownload]);

  //Actions corresponding to each file - progress, download, delete
  const renderItemActions = (item: FileMeta) => {
    const fileProgress = fileProgresses[item.fileId];
    const activePeerId = activeTransfers[item.fileId];
    const progress = activePeerId ? fileProgress?.[activePeerId] : null;
    const showCompletion =
      showFinished[item.fileId] && !pendingSave[item.fileId]; // 只有传输完成且不在待保存状态时才显示完成
    const isSaveToDisk = saveType ? saveType[item.fileId] : false;
    const isPendingSave = pendingSave[item.fileId] || false;
    // Get download count
    const downloadCount = downloadCounts[item.fileId] || 0;

    if (messages === null) {
      return <div>Loading...</div>;
    }
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0 flex-shrink-0">
        {progress && progress.progress < 1 ? ( //Show progress or completed
          <div className="w-full sm:w-auto">
            <TransferProgress
              message={
                mode === "sender"
                  ? messages.text.FileListDisplay.sending_dis
                  : messages.text.FileListDisplay.receiving_dis
              }
              progress={progress}
            />
          </div>
        ) : showCompletion ? (
          <span className="text-sm text-green-500 whitespace-nowrap">
            {messages.text.FileListDisplay.finish_dis}
          </span>
        ) : null}

        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
          {mode === "receiver" &&
            onRequest &&
            onDownload && ( //Request && Download
              <FileTransferButton
                onRequest={() => onRequest(item)}
                onSave={() => handleManualSave(item)}
                isCurrentFileTransferring={
                  progress
                    ? progress.progress > 0 && progress.progress < 1
                    : false
                }
                isOtherFileTransferring={isAnyFileTransferring && !progress}
                isSavedToDisk={saveType ? saveType[item.fileId] : false}
                isPendingSave={isPendingSave}
              />
            )}
          {/* display download Num*/}
          {mode === "sender" && (
            <span className="text-xs sm:text-sm whitespace-nowrap">
              {messages.text.FileListDisplay.downloadNum_dis}: {downloadCount}
            </span>
          )}
          {mode === "sender" && onDelete && (
            <Button
              onClick={() => {
                onDelete(item);
              }}
              variant="destructive"
              size="sm"
              disabled={
                progress
                  ? progress?.progress > 0 && progress.progress < 1
                  : false
              }
              className="text-xs sm:text-sm px-2 sm:px-3"
            >
              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">
                {messages.text.FileListDisplay.delete_dis}
              </span>
            </Button>
          )}
        </div>
      </div>
    );
  };
  //Display of each file --meta information
  const renderItem = (item: FileMeta, isFolder: boolean) => {
    const filenameDisplayLen = 30;
    const formatSize = formatFileSize(item.size);
    const tooltipContent = isFolder
      ? `${formatFolderTips(
          messages!.text.FileListDisplay.folder_tips_template,
          item.name,
          item.fileCount || 0,
          formatSize
        )}\n ${item.fileNamesDis}`
      : `${item.name} ${formatSize}`;

    return (
      <div
        key={item.name}
        className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2 p-2 sm:p-3 border border-gray-100 rounded-lg"
      >
        <Tooltip content={tooltipContent}>
          <div className="flex-1 min-w-0">
            <span className="block truncate text-sm sm:text-base">
              {isFolder ? "📁 " : ""}
              {item.name.length > filenameDisplayLen
                ? `${item.name.slice(0, filenameDisplayLen - 3)}...`
                : item.name}
            </span>
            <span className="text-xs sm:text-sm text-gray-500">
              {isFolder
                ? `${formatFolderDis(
                    messages!.text.FileListDisplay.folder_dis_template,
                    item.fileCount || 0,
                    formatSize
                  )}`
                : ` ${formatSize}`}
            </span>
          </div>
        </Tooltip>
        <div className="w-full sm:w-auto sm:flex-shrink-0">
          {renderItemActions(item)}
        </div>
      </div>
    );
  };
  if (messages === null) {
    return <div>Loading...</div>;
  }
  return (
    <>
      {(singleFiles.length > 0 || folders.length > 0) && (
        <>
          {/* Automatic pop-up component, only remind once when there are large files and folders */}
          {mode === "receiver" && (
            <div className="mb-2">
              <AutoPopupDialog
                storageKey="Choose-location-popup-shown"
                title={messages.text.FileListDisplay.PopupDialog_title}
                description={
                  messages.text.FileListDisplay.PopupDialog_description
                }
                condition={() => needPickLocation}
              />
              {/* Regular reminder to select the save directory */}
              <div className="flex items-center">
                <p className="text-red-500 mb-2">
                  {messages.text.FileListDisplay.chooseSavePath_tips}
                </p>
                {onLocationPick && (
                  <Button
                    onClick={async () => {
                      const success = await onLocationPick();
                      if (success) setPickedLocation(true);
                    }}
                    variant="outline"
                    size="sm"
                    className="mr-2 text-red-500"
                  >
                    {messages.text.FileListDisplay.chooseSavePath_dis}
                  </Button>
                )}
                {/* Safe Save Button - only show when location is picked and files are saved to disk */}
                {onSafeSave &&
                  pickedLocation &&
                  (isAnyFileTransferring ||
                    (saveType &&
                      Object.values(saveType).some(
                        (isSavedToDisk) => isSavedToDisk
                      ))) && (
                    <Tooltip
                      content={messages.text.FileListDisplay.safeSave_tooltip}
                    >
                      <Button
                        onClick={() => {
                          onSafeSave();
                        }}
                        variant="outline"
                        size="sm"
                        className="mr-2 text-green-600 border-green-600 hover:bg-green-50"
                      >
                        {messages.text.FileListDisplay.safeSave_dis}
                      </Button>
                    </Tooltip>
                  )}
              </div>
            </div>
          )}
          <div className="mb-2">
            <div className="files-list">
              {singleFiles.map((file) => (
                <div key={`single-${file.name}`}>{renderItem(file, false)}</div>
              ))}
              {folders.map((folder) => (
                <div key={`folder-${folder.name}`}>
                  {renderItem(folder, true)}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default FileListDisplay;
