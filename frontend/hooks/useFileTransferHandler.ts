import { useCallback } from "react";
import { CustomFile, FileMeta, fileMetadata } from "@/types/webrtc";
import { Messages } from "@/types/messages";
import JSZip from "jszip";
import { downloadAs } from "@/lib/fileUtils";
import { useFileTransferStore } from "@/stores/fileTransferStore";

interface UseFileTransferHandlerProps {
  messages: Messages | null;
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void;
}

export function useFileTransferHandler({
  messages,
  putMessageInMs,
}: UseFileTransferHandlerProps) {
  // 从 store 中获取状态
  const {
    shareContent,
    sendFiles,
    retrievedContent,
    retrievedFiles,
    retrievedFileMetas,
    setShareContent,
    setSendFiles,
    addSendFiles,
    removeSendFile,
    setRetrievedContent,
    setRetrievedFiles,
    setRetrievedFileMetas,
  } = useFileTransferStore();

  const updateShareContent = useCallback(
    (content: string) => {
      setShareContent(content);
    },
    [setShareContent]
  );

  const addFilesToSend = useCallback(
    (pickedFiles: CustomFile[]) => {
      const newFiles = pickedFiles.filter(
        (pf) =>
          !sendFiles.some((ef) => ef.name === pf.name && ef.size === pf.size)
      );
      if (newFiles.length < pickedFiles.length && messages) {
        putMessageInMs(
          messages.text.ClipboardApp.fileExistMsg ||
            "Some files were already added.",
          true
        );
      }
      addSendFiles(newFiles);
    },
    [sendFiles, messages, putMessageInMs, addSendFiles]
  );

  const removeFileToSend = useCallback(
    (metaToRemove: FileMeta) => {
      removeSendFile(metaToRemove);
    },
    [removeSendFile]
  );

  const handleDownloadFile = useCallback(
    async (meta: FileMeta) => {
      if (!messages) return;

      if (meta.folderName && meta.folderName !== "") {
        const { retrievedFiles: latestRetrievedFiles } =
          useFileTransferStore.getState();
        const filesToZip = latestRetrievedFiles.filter(
          (file) => file.folderName === meta.folderName
        );
        if (filesToZip.length === 0) {
          putMessageInMs(
            messages.text.ClipboardApp.noFilesForFolderMsg ||
              `No files found for folder '${meta.folderName}'.`,
            false
          );
          return;
        }
        const zip = new JSZip();
        for (let file of filesToZip) {
          zip.file(file.fullName, file);
        }
        try {
          const content = await zip.generateAsync({ type: "blob" });
          downloadAs(content, `${meta.folderName}.zip`);
        } catch (error) {
          console.error("Error creating zip file:", error);
          putMessageInMs(
            messages.text.ClipboardApp.zipError || "Error creating ZIP.",
            false
          );
        }
      } else {
        let retryCount = 0;
        const maxRetries = 3; // 重试次数

        const findAndDownload = async (): Promise<boolean> => {
          retryCount++;
          // 🔧 关键修复：使用最新的Store状态，而不是闭包中的旧状态
          const { retrievedFiles: latestRetrievedFiles } =
            useFileTransferStore.getState();
          const fileToDownload = latestRetrievedFiles.find(
            (f) => f.name === meta.name
          );

          if (fileToDownload) {
            downloadAs(fileToDownload, fileToDownload.name);
            return true;
          }

          return false;
        };

        // 首次尝试
        const found = await findAndDownload();

        if (!found) {
          // 如果没找到，启动重试机制
          const retryWithDelay = async (): Promise<void> => {
            while (retryCount < maxRetries) {
              await new Promise((resolve) => setTimeout(resolve, 50)); // 固定50ms延迟，因为现在状态应该很快同步
              const foundInRetry = await findAndDownload();
              if (foundInRetry) {
                return;
              }
            }
            // 所有重试都失败了
            putMessageInMs(
              messages.text.ClipboardApp.fileNotFoundMsg ||
                `File '${meta.name}' not found for download.`,
              false
            );
          };

          // 异步执行重试，不阻塞主线程
          retryWithDelay().catch(console.error);
        }
      }
    },
    [messages, putMessageInMs] // 🔧 移除retrievedFiles依赖，因为我们现在直接从Store获取最新状态
  );

  // Reset function specifically for receiver state (for leave room functionality)
  const resetReceiverState = useCallback(() => {
    setRetrievedContent("");
    setRetrievedFiles([]);
    setRetrievedFileMetas([]);
  }, [setRetrievedContent, setRetrievedFiles, setRetrievedFileMetas]);

  return {
    shareContent,
    sendFiles,
    retrievedContent,
    retrievedFiles,
    retrievedFileMetas,
    updateShareContent,
    addFilesToSend,
    removeFileToSend,
    resetReceiverState, // Export the reset function
    handleDownloadFile,
  };
}
