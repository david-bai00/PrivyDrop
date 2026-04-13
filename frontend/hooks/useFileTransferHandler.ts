import { useCallback } from "react";
import { CustomFile, FileMeta } from "@/types/webrtc";
import JSZip from "jszip";
import {
  addSenderDraftFiles,
  clearReceiverRetrievedArtifacts,
  removeSenderDraftFile,
  setSenderDraftContent,
} from "@/lib/app/WebRTCStoreCoordinator";
import { downloadAs, generateFileId } from "@/lib/fileUtils";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import { createLogger } from "@/lib/logger";
import type { FileTransferText } from "@/types/clipboardText";
import { useClipboardAppMessageDispatcher } from "@/hooks/useClipboardAppMessages";

const logger = createLogger("useFileTransferHandler");

interface UseFileTransferHandlerProps {
  text: FileTransferText;
}

export function useFileTransferHandler({ text }: UseFileTransferHandlerProps) {
  const showSenderMessage = useClipboardAppMessageDispatcher("sender");
  const showReceiverMessage = useClipboardAppMessageDispatcher("receiver");
  // Get state from store
  const {
    senderDraftContent,
    senderDraftFiles,
    retrievedContent,
    retrievedFiles,
    retrievedFileMetas,
  } = useFileTransferStore();

  const updateShareContent = useCallback(
    (content: string) => {
      setSenderDraftContent(content);
    },
    []
  );

  const addFilesToSend = useCallback(
    (pickedFiles: CustomFile[]) => {
      const { duplicateFiles } = addSenderDraftFiles(pickedFiles);

      if (duplicateFiles.length > 0) {
        showSenderMessage(text.fileExist);
      }
    },
    [showSenderMessage, text.fileExist]
  );

  const removeFileToSend = useCallback(
    (metaToRemove: FileMeta) => {
      removeSenderDraftFile(metaToRemove);
    },
    []
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
          showReceiverMessage(text.noFilesForFolder);
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
          showReceiverMessage(text.zipError);
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
            (f) => generateFileId(f) === meta.fileId
          );

          if (fileToDownload) {
            // Check if file is empty
            if (fileToDownload.size === 0) {
              logger.error("Downloaded file has zero size", {
                fileId: meta.fileId,
              });
            }

            // Check if file is a valid Blob
            if (!(fileToDownload instanceof Blob)) {
              logger.warn("Downloaded value is not a Blob", {
                fileId: meta.fileId,
                valueType: typeof fileToDownload,
              });
            }

            downloadAs(fileToDownload, fileToDownload.name);
            return true;
          } else {
            // Debug log: Record the case where file is not found
            const availableFileIds = latestRetrievedFiles.map((f) =>
              generateFileId(f)
            );
            logger.debug("Downloaded file not found in store", {
              fileId: meta.fileId,
              availableFileIds,
            });
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
            showReceiverMessage(text.fileNotFound);
          };

          // Execute retry asynchronously without blocking the main thread
          retryWithDelay().catch(console.error);
        }
      }
    },
    [
      showReceiverMessage,
      text.fileNotFound,
      text.noFilesForFolder,
      text.zipError,
    ]
  );

  // Reset function specifically for receiver state (for leave room functionality)
  const resetReceiverState = useCallback(() => {
    clearReceiverRetrievedArtifacts();
  }, []);

  return {
    shareContent: senderDraftContent,
    sendFiles: senderDraftFiles,
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
