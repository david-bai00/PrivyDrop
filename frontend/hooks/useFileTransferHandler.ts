import { useCallback, useEffect } from "react";
import { CustomFile, FileMeta, fileMetadata } from "@/types/webrtc";
import JSZip from "jszip";
import { downloadAs } from "@/lib/fileUtils";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import { postLogToBackend } from "@/app/config/api";
import type { FileTransferText } from "@/types/clipboardText";

interface UseFileTransferHandlerProps {
  text: FileTransferText;
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void;
}

export function useFileTransferHandler({
  text,
  putMessageInMs,
}: UseFileTransferHandlerProps) {
  // Get state from store
  const {
    shareContent,
    sendFiles,
    retrievedContent,
    retrievedFiles,
    retrievedFileMetas,
    setShareContent,
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
      if (newFiles.length < pickedFiles.length) {
        putMessageInMs(text.fileExist, true);
      }
      addSendFiles(newFiles);
    },
    [sendFiles, text.fileExist, putMessageInMs, addSendFiles]
  );

  const removeFileToSend = useCallback(
    (metaToRemove: FileMeta) => {
      removeSendFile(metaToRemove);
    },
    [removeSendFile]
  );

  const handleDownloadFile = useCallback(
    async (meta: FileMeta) => {
      if (meta.folderName && meta.folderName !== "") {
        const { retrievedFiles: latestRetrievedFiles } =
          useFileTransferStore.getState();
        const filesToZip = latestRetrievedFiles.filter(
          (file) => file.folderName === meta.folderName
        );
        if (filesToZip.length === 0) {
          putMessageInMs(text.noFilesForFolder, false);
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
          putMessageInMs(text.zipError, false);
        }
      } else {
        let retryCount = 0;
        const maxRetries = 3; // Retry count

        const findAndDownload = async (): Promise<boolean> => {
          retryCount++;
          // 🔧 Key fix: Use the latest Store state instead of the old state in the closure
          const { retrievedFiles: latestRetrievedFiles } =
            useFileTransferStore.getState();
          const fileToDownload = latestRetrievedFiles.find(
            (f) => f.name === meta.name
          );

          if (fileToDownload) {
            // Check if file is empty
            if (fileToDownload.size === 0) {
              postLogToBackend(
                `ERROR: File has 0 size! This explains the 0-byte download.`
              );
            }

            // Check if file is a valid Blob
            if (!(fileToDownload instanceof Blob)) {
              postLogToBackend(
                `WARNING: File is not a Blob object, type: ${typeof fileToDownload}`
              );
            }

            downloadAs(fileToDownload, fileToDownload.name);
            return true;
          } else {
            // Debug log: Record the case where file is not found
            const availableFileNames = latestRetrievedFiles.map((f) => f.name);
            postLogToBackend(
              `File NOT found! Looking for: "${
                meta.name
              }", Available files: [${availableFileNames.join(", ")}]`
            );
          }

          return false;
        };

        // First attempt
        const found = await findAndDownload();

        if (!found) {
          // If not found, start retry mechanism
          const retryWithDelay = async (): Promise<void> => {
            while (retryCount < maxRetries) {
              await new Promise((resolve) => setTimeout(resolve, 50)); // Fixed 50ms delay, as the state should sync quickly now
              const foundInRetry = await findAndDownload();
              if (foundInRetry) {
                return;
              }
            }
            putMessageInMs(text.fileNotFound, false);
           };

          // Execute retry asynchronously without blocking the main thread
          retryWithDelay().catch(console.error);
        }
      }
    },
    [putMessageInMs, text.fileNotFound, text.noFilesForFolder, text.zipError]
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
