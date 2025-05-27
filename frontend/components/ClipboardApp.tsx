"use client";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { debounce } from "lodash";
import FileListDisplay from "./self_define/FileListDisplay";
import { FileMeta, CustomFile, fileMetadata } from "@/lib/types/file";
import {
  WriteClipboardButton,
  ReadClipboardButton,
} from "./self_define/clipboard_btn";
import useRichTextToPlainText from "./self_define/rich-text-to-plain-text";
import QRCodeComponent from "./self_define/RetrieveMethod";
import {
  FileUploadHandler,
  DownloadAs,
} from "./self_define/file-upload-handler";

import JSZip from "jszip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip } from "./Tooltip";
import RichTextEditor from "@/components/Editor/RichTextEditor";
import AnimatedButton from "./self_define/AnimatedButton";
import { useLocale } from "@/hooks/useLocale";
import type { Messages } from "@/types/messages";
import { useClipboardAppMessages } from "@/hooks/useClipboardAppMessages";
import { usePageSetup } from "@/hooks/usePageSetup";
import { useRoomManager } from "@/hooks/useRoomManager";
import {
  useWebRTCConnection,
  ProgressState,
} from "@/hooks/useWebRTCConnection";

const developmentEnv = process.env.NEXT_PUBLIC_development!; //开发环境
// 处理 beforeunload 事件的函数
const handleBeforeUnload = (event: any) => {
  event.preventDefault();
  event.returnValue = ""; // This is required for older browsers
};

// 当用户确实想要离开页面时（例如，在保存数据后），可以调用此函数移除事件监听器
function allowUnload() {
  window.removeEventListener("beforeunload", handleBeforeUnload);
}

const AdvancedClipboardApp = () => {
  const { shareMessage, retrieveMessage, putMessageInMs } =
    useClipboardAppMessages();

  const [retrieveRoomId, setRetrieveRoomId] = useState(""); //接收端--房间ID
  const [activeTab, setActiveTab] = useState<"send" | "retrieve">("send");
  const retrieveJoinRoomBtnRef = useRef<HTMLButtonElement>(null); //接收方--加入房间按钮ref
  const { messages, isLoadingMessages } = usePageSetup({
    setRetrieveRoomId,
    setActiveTab,
    retrieveJoinRoomBtnRef,
  });
  //发送端：编辑器文本、文件
  const [shareContent, setShareContent] = useState("");
  const [sendFiles, setSendFiles] = useState<CustomFile[]>([]); //FILE对象只会先引用文件，并不会将文件内容读取进内存。只有当分片读取时，才加载一小片到内存。理论上支持大文件。
  // 取回端：编辑器文本、文件
  const [retrievedContent, setRetrievedContent] = useState("");
  const [retrievedFiles, setRetrievedFiles] = useState<CustomFile[]>([]);
  const [retrievedFileMetas, setRetrievedFileMetas] = useState<FileMeta[]>([]); //接收到的meta信息

  const richTextToPlainText = useRichTextToPlainText();

  // Initialize WebRTC Connection Hook
  const {
    sender,
    receiver,
    sharePeerCount,
    retrievePeerCount,
    sendProgress,
    receiveProgress,
    broadcastDataToAllPeers,
    requestFile,
    requestFolder,
    setReceiverDirectoryHandle,
    getReceiverSaveType,
  } = useWebRTCConnection({
    messages, // Pass messages for logging or potential internal messages from the hook
    putMessageInMs, // Pass for user feedback on connection events
    onStringReceived: useCallback((data, peerId) => {
      if (developmentEnv)
        console.log(
          `App received string from ${peerId}: ${data.substring(0, 30)}`
        );
      setRetrievedContent(data);
    }, []), // Empty dependency array if setRetrievedContent is stable
    onFileMetaReceived: useCallback((meta, peerId) => {
      if (developmentEnv)
        console.log(`App received file meta from ${peerId}: ${meta.name}`);
      const { type, ...metaWithoutType } = meta; // Assuming type is part of fileMetadata but not FileMeta
      setRetrievedFileMetas((prev) => {
        const DPrev = prev.filter(
          (existingFile) => existingFile.fileId !== metaWithoutType.fileId
        ); // Prevent duplicates by fileId
        return [...DPrev, metaWithoutType];
      });
    }, []),
    onFileReceived: useCallback((file, peerId) => {
      if (developmentEnv)
        console.log(`App received file from ${peerId}: ${file.name}`);
      setRetrievedFiles((prev) => {
        const isDuplicate = prev.some(
          (existingFile) =>
            existingFile.fullName === file.fullName &&
            existingFile.size === file.size
        ); // More robust duplicate check
        if (isDuplicate) return prev;
        return [...prev, file];
      });
    }, []),
  });
  // Initialize Room Manager Hook
  const {
    shareRoomId,
    setShareRoomId, // If needed for pasting room ID directly into sender's input
    shareLink,
    shareRoomStatusText,
    retrieveRoomStatusText,
    checkAndSetShareRoomId,
    joinRoom,
    generateShareLinkAndBroadcast,
  } = useRoomManager({
    messages,
    putMessageInMs,
    sender,
    receiver,
    activeTab,
    sharePeerCount,
    retrievePeerCount,
    // Pass the actual broadcast function from useWebRTCConnection
    broadcastDataToPeers: () =>
      broadcastDataToAllPeers(shareContent, sendFiles),
  });

  useEffect(() => {
    window.addEventListener("beforeunload", handleBeforeUnload);
    if (
      sendFiles.length === 0 &&
      shareContent === "" &&
      retrievedFiles.length === 0 &&
      retrievedContent === ""
    ) {
      //如果页面不存在任何内容，则不阻止刷新或离开
      allowUnload();
    }
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [sendFiles, shareContent, retrievedFiles, retrievedContent]);

  //只有接收端支持下载
  const handleDownload = useCallback(
    async (meta: FileMeta) => {
      if (meta.folderName && meta.folderName !== "") {
        // Check for non-empty folderName
        const filesToZip = retrievedFiles.filter(
          (file) => file.folderName === meta.folderName
        );
        if (filesToZip.length === 0) {
          putMessageInMs(
            `No files found for folder ${meta.folderName} to download.`,
            false
          );
          return;
        }
        const zip = new JSZip();
        for (let file of filesToZip) {
          zip.file(file.fullName, file);
        }
        try {
          // Generate the zip file
          const content = await zip.generateAsync({ type: "blob" });
          DownloadAs(content, `${meta.folderName}.zip`);
        } catch (error) {
          console.error("Error creating zip file:", error);
          putMessageInMs(
            // messages?.text.ClipboardApp.zipError ||
            "Error creating ZIP.",
            false
          );
        }
      } else {
        const filesToDownload = retrievedFiles.filter(
          (file) => file.name === meta.name
        );
        if (filesToDownload) {
          for (let file of filesToDownload) DownloadAs(file, file.name);
        } else {
          putMessageInMs(`File ${meta.name} not found for download.`, false);
        }
      }
    },
    [retrievedFiles, messages]
  );

  const onFilePicked = useCallback((pickedFiles: CustomFile[]) => {
    setSendFiles((prevFiles) => {
      // Basic duplicate check by name and size for picked files
      const newFiles = pickedFiles.filter(
        (pf) =>
          !prevFiles.some((ef) => ef.name === pf.name && ef.size === pf.size)
      );
      return [...prevFiles, ...newFiles];
    });
  }, []);

  //点击删除按钮之后，将对应文件删掉
  const removeSenderFile = useCallback((metaToRemove: FileMeta) => {
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

  //选择保存目录
  const onLocationPick = useCallback(async (): Promise<boolean> => {
    if (!messages) return false; // Added messages dependency
    if (!window.showDirectoryPicker) {
      putMessageInMs(
        //messages.text.ClipboardApp.pickSaveUnsupported ||
        "Directory picker not supported.",
        false
      );
      console.error("showDirectoryPicker is not supported.");
      return false;
    }

    if (!window.confirm(messages.text.ClipboardApp.pickSaveMsg)) return false;
    try {
      const directoryHandle = await window.showDirectoryPicker();
      await setReceiverDirectoryHandle(directoryHandle); // From useWebRTCConnection
      putMessageInMs(
        // messages.text.ClipboardApp.pickSaveSuccess ||
        "Save location set.",
        false
      );
      return true;
    } catch (err: any) {
      if (err.name !== "AbortError") {
        // Don't show error if user cancelled
        console.error("Failed to set up folder receive:", err);
        putMessageInMs(
          // messages.text.ClipboardApp.pickSaveError ||
          "Could not set save location.",
          false
        );
      }
      return false;
    }
  }, [messages, putMessageInMs, setReceiverDirectoryHandle]);

  const handleFileRequest = useCallback(
    (meta: FileMeta) => {
      if (meta.folderName) {
        requestFolder(meta.folderName);
      } else if (meta.fileId) {
        // Ensure fileId exists for individual file requests
        requestFile(meta.fileId);
      } else {
        console.warn("Cannot request file: missing fileId", meta);
      }
    },
    [requestFile, requestFolder]
  );

  if (isLoadingMessages || !messages) {
    return <div className="p-4 text-center">Loading messages...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 w-full md:max-w-4xl">
      <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 mb-4">
        <Button
          variant={activeTab === "send" ? "default" : "outline"}
          onClick={() => setActiveTab("send")}
          className="flex-1"
          aria-selected={activeTab === "send"}
        >
          {messages.text.ClipboardApp.html.senderTab}
        </Button>
        <Button
          variant={activeTab === "retrieve" ? "default" : "outline"}
          onClick={() => setActiveTab("retrieve")}
          className="flex-1"
          aria-selected={activeTab === "retrieve"}
        >
          {messages.text.ClipboardApp.html.retrieveTab}
        </Button>
      </div>
      <Card className="border-8 shadow-md">
        <CardHeader>
          <CardTitle>
            {activeTab === "send"
              ? messages.text.ClipboardApp.html.shareTitle_dis
              : messages.text.ClipboardApp.html.retrieveTitle_dis}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeTab === "send" ? (
            <>
              <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 mb-4">
                {shareRoomStatusText && (
                  <span>{`${messages.text.ClipboardApp.html.RoomStatus_dis} ${shareRoomStatusText}`}</span>
                )}
              </div>
              <RichTextEditor value={shareContent} onChange={setShareContent} />
              <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 mb-4">
                <ReadClipboardButton
                  title={messages.text.ClipboardApp.html.Paste_dis}
                  onRead={setShareContent}
                />
                <WriteClipboardButton
                  title={messages.text.ClipboardApp.html.Copy_dis}
                  textToCopy={richTextToPlainText(shareContent)}
                />
              </div>
              <div className="mb-3">
                <FileUploadHandler
                  onFilePicked={onFilePicked}
                  // messages={messages}
                />
                <FileListDisplay
                  mode="sender"
                  files={sendFiles}
                  fileProgresses={sendProgress}
                  onDelete={removeSenderFile}
                  // messages={messages}
                />
              </div>
              <div className="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-2 mb-2">
                <span>{messages.text.ClipboardApp.html.inputRoomId_tips}</span>
                <Input
                  aria-label="Share Room ID"
                  value={shareRoomId}
                  onChange={(e) => checkAndSetShareRoomId(e.target.value)}
                  onPaste={(e) => {
                    const pastedText = e.clipboardData.getData("text");
                    checkAndSetShareRoomId(pastedText); // also check pasted text
                  }}
                  className="w-full md:w-36 border-2 border-gray-300 rounded-md px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                />
                <Button
                  className="w-full"
                  onClick={() => joinRoom(true, shareRoomId)}
                  disabled={sender ? sender.isInRoom : false} //如果已经在房间则停用进入房间功能
                >
                  {messages.text.ClipboardApp.html.joinRoom_dis}
                </Button>
              </div>
              <div className="flex space-x-2 mb-2">
                <AnimatedButton
                  className="w-full"
                  onClick={generateShareLinkAndBroadcast}
                  loadingText={
                    messages.text.ClipboardApp.html.startSending_loadingText
                  }
                >
                  {messages.text.ClipboardApp.html.startSending_dis}
                </AnimatedButton>
              </div>
              {shareMessage && <p className="mb-4">{shareMessage}</p>}
            </>
          ) : (
            <>
              <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 mb-4">
                {retrieveRoomStatusText && (
                  <span>{`${messages.text.ClipboardApp.html.RoomStatus_dis} ${retrieveRoomStatusText}`}</span>
                )}
              </div>
              <div className="mb-4">
                <ReadClipboardButton
                  title={messages.text.ClipboardApp.html.readClipboard_dis}
                  onRead={setRetrieveRoomId}
                />
              </div>
              <div className="mb-4">
                <Input
                  value={retrieveRoomId}
                  onChange={(e) => setRetrieveRoomId(e.target.value)}
                  placeholder={
                    messages.text.ClipboardApp.html.retrieveRoomId_placeholder
                  }
                  className="w-full md:w-36 border-2 border-gray-300 rounded-md px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                />
              </div>
              <div className="mb-4">
                <Button
                  className="w-full"
                  onClick={() => joinRoom(false, retrieveRoomId)}
                  ref={retrieveJoinRoomBtnRef}
                  disabled={receiver ? receiver.isInRoom : false} //如果已经在房间则停用进入房间功能
                >
                  {messages.text.ClipboardApp.html.joinRoom_dis}
                </Button>
              </div>
              {retrievedContent && (
                <>
                  <RichTextEditor
                    value={retrievedContent}
                    onChange={setRetrievedContent}
                  />
                  <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 mb-2">
                    <WriteClipboardButton
                      title={messages.text.ClipboardApp.html.Copy_dis}
                      textToCopy={richTextToPlainText(retrievedContent)}
                    />
                  </div>
                </>
              )}
              <FileListDisplay
                mode="receiver"
                files={retrievedFileMetas}
                fileProgresses={receiveProgress}
                onDownload={handleDownload}
                onRequest={handleFileRequest}
                onLocationPick={onLocationPick}
                saveType={getReceiverSaveType()}
                // messages={messages}
              />
              {retrieveMessage && <p className="mb-4">{retrieveMessage}</p>}
            </>
          )}
        </CardContent>
      </Card>
      {activeTab === "send" && shareLink && messages && (
        <Card className="border-2 shadow-md mt-4">
          <CardHeader>
            <CardTitle>
              {messages.text.ClipboardApp.html.RetrieveMethodTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <QRCodeComponent RoomID={shareRoomId} shareLink={shareLink} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdvancedClipboardApp;
