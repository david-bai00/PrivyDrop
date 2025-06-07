import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Trash2 } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import TransferProgress from "./TransferProgress";
import { formatFileSize, generateFileId } from "@/lib/fileUtils";
import { AutoPopupDialog } from "@/components/common/AutoPopupDialog";
import { FileMeta, CustomFile, Progress } from "@/lib/types/file";
import FileTransferButton from "./FileTransferButton";
import { getDictionary } from "@/lib/dictionary";
import { useLocale } from "@/hooks/useLocale";
import type { Messages } from "@/types/messages";

function formatFolderDis(
  template: string, 
  num: number, 
  size: string
) {
  return template.replace('{num}', num.toString()).replace('{size}', size);
}

function formatFolderTips(
  template: string, 
  name: string, 
  num: number, 
  size: string
) {
  return template.replace('{name}', name).replace('{num}', num.toString()).replace('{size}', size);
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
  onRequest?: (item: FileMeta) => void; //请求文件
  onDelete?: (item: FileMeta) => void;
  onLocationPick?: () => Promise<boolean>;
  saveType?: { [fileId: string]: boolean }; //文件是存储在磁盘还是内存
  largeFileThreshold?: number;
}
// 添加类型判断辅助函数
function isCustomFile(file: FileMeta | CustomFile): file is CustomFile {
  return "lastModified" in file; // 使用 File 对象特有的属性来判断
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
  // 添加 ref 来存储上一次的 showFinished 状态
  const prevShowFinishedRef = useRef<{ [fileId: string]: boolean }>({});

  const [pickedLocation, setPickedLocation] = useState<boolean>(false); //是否已经选取过保存目录
  const [needPickLocation, setNeedPickLocation] = useState<boolean>(false); //是否需要选择保存目录--大文件或文件夹或用户主动选择

  const [folders, setFolders] = useState<FileMeta[]>([]); //将文件中属于 文件夹的 提取出来
  const [singleFiles, setSingleFiles] = useState<FileMeta[]>([]); //保留单文件，不属于文件夹
  // 添加当前显示的接收端追踪
  const [activeTransfers, setActiveTransfers] = useState<{
    [fileId: string]: string;
  }>({});
  //对是否有文件传输状态进行跟踪
  const [isAnyFileTransferring, setIsAnyFileTransferring] = useState(false);
  // 添加下载次数的状态
  const [downloadCounts, setDownloadCounts] = useState<{
    [fileId: string]: number;
  }>({});
  useEffect(() => {
    getDictionary(locale)
      .then((dict) => setMessages(dict))
      .catch((error) => console.error("Failed to load messages:", error));
  }, [locale]);
  //监控文件传输状态
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
    //分离出单文件和文件夹
    const tempSingleFiles: FileMeta[] = [];
    let folders_: { [folderName: string]: FileMeta } = {};
    let needPick = false;

    // 如果是 CustomFile[] 类型，先转换为 FileMeta[]
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
          //如果对象不存在，则初始化
          name: file.folderName,
          size: 0,
          fullName: file.folderName, // 文件夹的 fullName 就是 folderName
          fileType: "folder",
          fileId: file.folderName,
          folderName: file.folderName,
          fileCount: 0,
          fileNamesDis: "",
        };

        folders_[file.folderName].fileCount =
          (folders_[file.folderName].fileCount ?? 0) + 1; //如果 fileCount 是 undefined，使用默认值 0
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

    // 使用函数式更新确保状态正确更新
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
    setNeedPickLocation(needPick); //设置是否需要选择保存目录
  }, [files, largeFileThreshold]);

  useEffect(() => {
    //如果一个文件同时被多个接收端请求，会先显示第一个，等结束后再显示第二个
    let fileIds = [...singleFiles, ...folders].map((file) => file.fileId);

    fileIds.forEach((fileId) => {
      const fileProgress = fileProgresses[fileId];
      if (!fileProgress) return;
      // 获取当前文件的所有传输进度
      const transfers = Object.entries(fileProgress);
      // 如果没有活跃传输，选择第一个开始的传输
      let newPeerId = "";
      if (!activeTransfers[fileId] && transfers.length > 0) {
        newPeerId = transfers[0][0];
        setActiveTransfers((prev) => ({
          ...prev,
          [fileId]: newPeerId, // 设置第一个 peerId
        }));
      }
      // set是异步操作 直接使用 newPeerId 而不是从 activeTransfers 中读取
      const activePeerId = newPeerId || activeTransfers[fileId];
      // 检查当前活跃传输是否完成
      if (activePeerId && fileProgress[activePeerId]?.progress >= 1) {
        // 当前传输完成，等待2秒后切换到下一个未完成的传输
        if (!showFinished[fileId]) {
          setShowFinished((prev) => ({ ...prev, [fileId]: true }));

          setTimeout(() => {
            setShowFinished((prev) => {
              const updated = { ...prev };
              delete updated[fileId];
              return updated;
            });

            delete fileProgress[activePeerId]; //需要删掉这个peer的进度，否则下次相同文件被请求进度显示不正常
            // 找到下一个未完成的传输
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
    //监控 Finished 从false/null跳变为true这个事件 来触发下载
    let files_ = [...singleFiles, ...folders];

    files_.forEach((item: FileMeta) => {
      const currentShowFinished = showFinished[item.fileId];
      const prevShowFinished = prevShowFinishedRef.current[item.fileId];
      const isSaveToDisk = saveType ? saveType[item.fileId] : false;
      // console.log(`last:${prevShowFinished} --> cur:${currentShowFinished}`);
      // 检测 false -> true 的跳变
      if (!prevShowFinished && currentShowFinished) {
        if (!isSaveToDisk && onDownload) {
          onDownload(item);
        }

        // 增加下载次数
        setDownloadCounts((prevCounts) => ({
          ...prevCounts,
          [item.fileId]: (prevCounts[item.fileId] || 0) + 1,
        }));
      }

      // 更新上一次的状态
      prevShowFinishedRef.current[item.fileId] = currentShowFinished;
    });
  }, [showFinished, singleFiles, folders, saveType, onDownload]);

  //每一项文件 对应的动作--进度、下载、删除
  const renderItemActions = (item: FileMeta) => {
    const fileProgress = fileProgresses[item.fileId];
    const activePeerId = activeTransfers[item.fileId];
    const progress = activePeerId ? fileProgress?.[activePeerId] : null;
    const showCompletion = showFinished[item.fileId];
    const isSaveToDisk = saveType ? saveType[item.fileId] : false;
    // 获取下载次数
    const downloadCount = downloadCounts[item.fileId] || 0;

    if (messages === null) {
      return <div>Loading...</div>;
    }
    return (
      <div className="flex items-center">
        {progress && progress.progress < 1 ? ( //显示进度或已完成
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
          onDownload && ( //请求 && 下载
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
        {/* 展示下载次数 */}
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
  //每一项文件 对应的展示--meta信息
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
          {/* 自动弹窗组件,当有大文件和文件夹时 只提醒一次 */}
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
              {/* 常态化提醒选择保存目录 */}
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
            {/* 确保文件列表确实被渲染 */}
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
