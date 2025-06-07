import { useState, useCallback, useEffect } from "react";
import { CustomFile, FileMeta, fileMetadata } from "@/lib/types/file";
import { Messages } from "@/types/messages";
import JSZip from "jszip";
import { downloadAs } from "@/lib/fileUtils";

// Helper functions for beforeunload (can be kept local to this hook if not used elsewhere)
const handleWindowBeforeUnload = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  event.returnValue = ""; // Required for Chrome
};

const allowWindowUnload = () => {
  window.removeEventListener("beforeunload", handleWindowBeforeUnload);
};

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
  const [shareContent, setShareContent] = useState("");
  const [sendFiles, setSendFiles] = useState<CustomFile[]>([]);
  const [retrievedContent, setRetrievedContent] = useState("");
  const [retrievedFiles, setRetrievedFiles] = useState<CustomFile[]>([]);
  const [retrievedFileMetas, setRetrievedFileMetas] = useState<FileMeta[]>([]);

  // Manage beforeunload event based on content
  useEffect(() => {
    if (
      sendFiles.length === 0 &&
      shareContent === "" &&
      retrievedFiles.length === 0 &&
      retrievedContent === ""
    ) {
      allowWindowUnload();
    } else {
      window.addEventListener("beforeunload", handleWindowBeforeUnload);
    }
    return () => {
      allowWindowUnload(); // Clean up listener when hook unmounts or dependencies change if any
    };
  }, [sendFiles, shareContent, retrievedFiles, retrievedContent]);

  const updateShareContent = useCallback((content: string) => {
    setShareContent(content);
  }, []);

  const addFilesToSend = useCallback(
    (pickedFiles: CustomFile[]) => {
      setSendFiles((prevFiles) => {
        const newFiles = pickedFiles.filter(
          (pf) =>
            !prevFiles.some((ef) => ef.name === pf.name && ef.size === pf.size)
        );
        if (newFiles.length < pickedFiles.length && messages) {
          putMessageInMs(
            // messages.text.ClipboardApp.fileExistMsg ||
            "Some files were already added.",
            true
          );
        }
        return [...prevFiles, ...newFiles];
      });
    },
    [messages, putMessageInMs]
  );

  const removeFileToSend = useCallback((metaToRemove: FileMeta) => {
    setSendFiles((prevFiles) => {
      if (metaToRemove.folderName && metaToRemove.folderName !== "") {
        return prevFiles.filter(
          (file) => file.folderName !== metaToRemove.folderName
        );
      } else {
        return prevFiles.filter((file) => file.name !== metaToRemove.name);
      }
    });
  }, []);

  const clearSentItems = useCallback(() => {
    setShareContent("");
    setSendFiles([]);
  }, []);

  const clearRetrievedItems = useCallback(() => {
    setRetrievedContent("");
    setRetrievedFiles([]);
    setRetrievedFileMetas([]);
  }, []);

  // Callbacks for useWebRTCConnection
  const onStringDataReceived = useCallback((data: string, peerId: string) => {
    // console.log(`FileTransferHandler received string from ${peerId}`);
    setRetrievedContent(data);
  }, []);

  const onFileMetadataReceived = useCallback(
    (meta: fileMetadata, peerId: string) => {
      // console.log(`FileTransferHandler received file meta from ${peerId}: ${meta.name}`);
      const { type, ...metaWithoutType } = meta; // Assuming 'type' is not part of FileMeta
      setRetrievedFileMetas((prev) => {
        const DPrev = prev.filter(
          (existingFile) => existingFile.fileId !== metaWithoutType.fileId
        );
        return [...DPrev, metaWithoutType];
      });
    },
    []
  );

  const onFileFullyReceived = async (file: CustomFile, peerId: string) => {
    // console.log(`FileTransferHandler received file from ${peerId}: ${file.name}`);
    setRetrievedFiles((prev) => {
      const isDuplicate = prev.some(
        (existingFile) =>
          existingFile.fullName === file.fullName &&
          existingFile.size === file.size
      );
      if (isDuplicate) return prev;
      return [...prev, file];
    });
  };

  const handleDownloadFile = useCallback(
    async (meta: FileMeta) => {
      if (!messages) return;

      if (meta.folderName && meta.folderName !== "") {
        const filesToZip = retrievedFiles.filter(
          (file) => file.folderName === meta.folderName
        );
        if (filesToZip.length === 0) {
          putMessageInMs(
            // messages.text.ClipboardApp.noFilesForFolderMsg ||
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
            // messages.text.ClipboardApp.zipError ||
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
            // messages.text.ClipboardApp.fileNotFoundMsg ||
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

  return {
    shareContent,
    sendFiles,
    retrievedContent,
    retrievedFiles,
    retrievedFileMetas,
    updateShareContent,
    addFilesToSend,
    removeFileToSend,
    clearSentItems,
    clearRetrievedItems,
    // Callbacks to provide to useWebRTCConnection
    onStringDataReceived,
    onFileMetadataReceived,
    onFileFullyReceived,
    // Download function
    handleDownloadFile,
  };
}
