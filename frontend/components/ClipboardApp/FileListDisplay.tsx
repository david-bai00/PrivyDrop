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
  onDownload,
  onRequest,
  onDelete,
  onLocationPick,
  saveType,
  largeFileThreshold = 500 * 1024 * 1024, // 500MB default
}) => {
  const locale = useLocale();
  const [messages, setMessages] = useState<Messages | null>(null);
  const [showFinished, setShowFinished] = useState<{
    [fileId: string]: boolean;
  }>({});
  // Add a ref to store the previous showFinished state
  const prevShowFinishedRef = useRef<{ [fileId: string]: boolean }>({});

  const [pickedLocation, setPickedLocation] = useState<boolean>(false); // Whether a save directory has been selected
  const [needPickLocation, setNeedPickLocation] = useState<boolean>(false); // Whether a save directory needs to be selected -- for large files, folders, or user choice

  const [folders, setFolders] = useState<FileMeta[]>([]); // Extract folder items from files
  const [singleFiles, setSingleFiles] = useState<FileMeta[]>([]); // Keep single files, not part of a folder
  // Add tracking for currently displayed receiver
  const [activeTransfers, setActiveTransfers] = useState<{
    [fileId: string]: string;
  }>({});
  // Track if any file transfer is in progress
  const [isAnyFileTransferring, setIsAnyFileTransferring] = useState(false);
  // Add state for download counts
  const [downloadCounts, setDownloadCounts] = useState<{
    [fileId: string]: number;
  }>({});
  useEffect(() => {
    getDictionary(locale)
      .then((dict) => setMessages(dict))
      .catch((error) => console.error("Failed to load messages:", error));
  }, [locale]);
  // Monitor file transfer status
  useEffect(() => {
    const hasActiveTransfer = Object.values(fileProgresses).some(
      (fileProgress) =>
        Object.values(fileProgress).some(
          (progress) => progress.progress > 0 && progress.progress < 1
        )
    );
    setIsAnyFileTransferring(hasActiveTransfer);
  }, [fileProgresses]);

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
    console.log("Processed files:", processedFiles);
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
    // console.log('Single files before setState:', tempSingleFiles);
    // console.log('Folders before setState:', Object.values(folders_));

    // Use functional updates to ensure the state is updated correctly
    setSingleFiles((prev) => {
      // console.log('Previous single files:', prev);
      // console.log('New single files:', tempSingleFiles);
      return [...tempSingleFiles];
    });
    setFolders((prev) => {
      // console.log('Previous folders:', prev);
      // console.log('New folders:', Object.values(folders_));
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

            delete fileProgress[activePeerId]; //need to delete the progress of this peer, otherwise the progress will be displayed abnormally when the same file is requested next time.
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
      // console.log(`last:${prevShowFinished} --> cur:${currentShowFinished}`);
      // Detecting false -> true transitions
      if (!prevShowFinished && currentShowFinished) {
        if (!isSaveToDisk && onDownload) {
          onDownload(item);
        }

        // Increase download count
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
    const showCompletion = showFinished[item.fileId];
    const isSaveToDisk = saveType ? saveType[item.fileId] : false;
    // Get download count
    const downloadCount = downloadCounts[item.fileId] || 0;

    if (messages === null) {
      return <div>Loading...</div>;
    }
    return (
      <div className="flex items-center">
        {progress && progress.progress < 1 ? ( //Show progress or completed
          <TransferProgress
            message={
              mode === "sender"
                ? messages.text.FileListDisplay.sending_dis
                : messages.text.FileListDisplay.receiving_dis
            }
            progress={progress}
          />
        ) : showCompletion ? (
          <span className="mr-2 text-sm text-green-500">
            {messages.text.FileListDisplay.finish_dis}
          </span>
        ) : null}
        {mode === "receiver" &&
          onRequest &&
          onDownload && ( //Request && Download
            <FileTransferButton
              onRequest={() => onRequest(item)}
              isCurrentFileTransferring={
                progress
                  ? progress.progress > 0 && progress.progress < 1
                  : false
              }
              isOtherFileTransferring={isAnyFileTransferring && !progress}
              isSavedToDisk={saveType ? saveType[item.fileId] : false}
            />
          )}
        {/* display download Num*/}
        {mode === "sender" && (
          <span className="mr-2 text-sm">
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
              progress ? progress?.progress > 0 && progress.progress < 1 : false
            }
          >
            <Trash2 className="mr-2 h-4 w-4" />{" "}
            {messages.text.FileListDisplay.delete_dis}
          </Button>
        )}
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
      <div key={item.name} className="flex items-center justify-between mb-1">
        <Tooltip content={tooltipContent}>
          <span className="mr-2 truncate max-w-sm">
            {isFolder ? "📁 " : ""}
            {item.name.length > filenameDisplayLen
              ? `${item.name.slice(0, filenameDisplayLen - 3)}...`
              : item.name}
            {isFolder
              ? `${formatFolderDis(
                  messages!.text.FileListDisplay.folder_dis_template,
                  item.fileCount || 0,
                  formatSize
                )}`
              : ` ${formatSize}`}
          </span>
        </Tooltip>
        {renderItemActions(item)}
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
