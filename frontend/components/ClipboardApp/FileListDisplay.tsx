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
const developmentEnv = process.env.NODE_ENV;

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
  saveType,
  largeFileThreshold = 500 * 1024 * 1024, // 500MB default
}) => {
  const locale = useLocale();
  const [messages, setMessages] = useState<Messages | null>(null);

  // Get the cleaning method of the store
  const { clearSendProgress, clearReceiveProgress } = useFileTransferStore();
  const [showFinished, setShowFinished] = useState<{
    [fileId: string]: boolean;
  }>({});
  // Add a ref to store the previous showFinished state
  const prevShowFinishedRef = useRef<{ [fileId: string]: boolean }>({});

  // Add save pending status - Used for manual saving on non-Chrome browsers
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

  // Handling manual save - for non-Chrome browsers
  const handleManualSave = (item: FileMeta) => {
    if (onDownload) {
      onDownload(item);
      // Clear the pending save state to display UI as "Completed"
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
            // Clean the corresponding progress data according to the pattern
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

      const fileProgress = fileProgresses[item.fileId];
      const activePeerId = activeTransfers[item.fileId];
      const currentProgress = activePeerId
        ? fileProgress?.[activePeerId]?.progress
        : null;
      // Detecting false -> true transitions
      if (!prevShowFinished && currentShowFinished) {
        if (!isSaveToDisk && onDownload) {
          const isAutoDownloadSupported = supportsAutoDownload();

          if (isAutoDownloadSupported) {
            // Browsers that support automatic downloads like Chrome: Download directly
            if (developmentEnv === "development") {
              postLogToBackend(
                `[Download Debug] Auto-downloading file: ${item.name}`
              );
            }
            onDownload(item);
          } else {
            // Non-Chrome browsers: Set to save status, wait for user manual click
            if (developmentEnv === "development") {
              postLogToBackend(
                `[Download Debug] Setting pendingSave for non-Chrome browser: ${item.name}`
              );
            }
            setPendingSave((prev) => ({
              ...prev,
              [item.fileId]: true,
            }));
          }
        } else {
          if (developmentEnv === "development") {
            postLogToBackend(
              `Skipping download logic - isSaveToDisk: ${isSaveToDisk}, onDownload: ${!!onDownload}`
            );
          }
        }

        // Increase download count - Increment download count upon completion of file transfer (counted only once)
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
      showFinished[item.fileId] && !pendingSave[item.fileId]; // Only display completed when the transfer is finished and not in the save pending state
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
