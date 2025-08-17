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

  const updateShareContent = useCallback((content: string) => {
    setShareContent(content);
  }, [setShareContent]);

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

  const removeFileToSend = useCallback((metaToRemove: FileMeta) => {
    removeSendFile(metaToRemove);
  }, [removeSendFile]);

  // 这些回调函数已经不再需要，因为WebRTC Hook现在直接使用Store

  const handleDownloadFile = useCallback(
    async (meta: FileMeta) => {
      if (!messages) return;

      if (meta.folderName && meta.folderName !== "") {
        const filesToZip = retrievedFiles.filter(
          (file) => file.folderName === meta.folderName
        );
        if (filesToZip.length === 0) {
          putMessageInMs(
            messages.text.ClipboardApp.noFilesForFolderMsg ||
            "No files found for folder '{folderName}'.".replace(
              "{folderName}",
              meta.folderName
            ),
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
            messages.text.ClipboardApp.zipError ||
            "Error creating ZIP.",
            false
          );
        }
      } else {
        const fileToDownload = retrievedFiles.find((f) => f.name === meta.name);
        if (fileToDownload) {
          downloadAs(fileToDownload, fileToDownload.name);
        } else {
          putMessageInMs(
            messages.text.ClipboardApp.fileNotFoundMsg ||
            "File '{fileName}' not found for download.".replace(
              "{fileName}",
              meta.name
            ),
            false
          );
        }
      }
    },
    [retrievedFiles, messages, putMessageInMs]
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