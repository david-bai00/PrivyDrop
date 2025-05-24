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
import WebRTC_Initiator from "../lib/webrtc_Initiator";
import WebRTC_Recipient from "../lib/webrtc_Recipient";
import FileReceiver from "../lib/fileReceiver";
import FileSender from "../lib/fileSender";
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
import { config } from "@/app/config/environment";
import { fetchRoom, createRoom, checkRoom } from "@/app/config/api";
import { trackReferrer } from "@/components/utils/tracking";
import { postLogInDebug } from "@/app/config/api";
import AnimatedButton from "./self_define/AnimatedButton";
import { format_peopleMsg } from "@/utils/formatMessage";
import { getDictionary } from "@/lib/dictionary";
import { useLocale } from "@/hooks/useLocale";
import type { Messages } from "@/types/messages";
import { useClipboardAppMessages } from "@/hooks/useClipboardAppMessages";
import { usePageSetup } from "@/hooks/usePageSetup";
import { useRoomManager } from "@/hooks/useRoomManager";

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
  //发送端：编辑器文本、文件
  const [shareContent, setShareContent] = useState("");
  const [sendFiles, setSendFiles] = useState<CustomFile[]>([]); //FILE对象只会先引用文件，并不会将文件内容读取进内存。只有当分片读取时，才加载一小片到内存。理论上支持大文件。

  const [sendProgress, setSendProgress] = useState<{
    //文件的进度--发送端--{fileId:0-1}--支持区分多个接收端
    [fileId: string]: {
      [peerId: string]: { progress: number; speed: number };
    };
  }>({});

  const [receiveProgress, setReceiveProgress] = useState<{
    //文件的进度--接收端--{fileId:0-1}--目前只有一个发送端（为了和发送进度保持一致）
    [fileId: string]: {
      [peerId: string]: { progress: number; speed: number };
    };
  }>({});

  // 取回端：编辑器文本、文件
  const [retrievedContent, setRetrievedContent] = useState("");
  const [retrievedFiles, setRetrievedFiles] = useState<CustomFile[]>([]);
  const [retrievedFileMetas, setRetrievedFileMetas] = useState<FileMeta[]>([]); //接收到的meta信息

  //初始化 p2p通信/文件传输 对象
  const [sender, setSender] = useState<WebRTC_Initiator | null>(null);
  const [receiver, setReceiver] = useState<WebRTC_Recipient | null>(null);
  const [senderFileTransfer, setSenderFileTransfer] =
    useState<FileSender | null>(null);
  const [receiverFileTransfer, setReceiverFileTransfer] =
    useState<FileReceiver | null>(null);

  const retrieveJoinRoomBtnRef = useRef<HTMLButtonElement>(null); //接收方--加入房间按钮ref
  const [activeTab, setActiveTab] = useState<"send" | "retrieve">("send");
  const richTextToPlainText = useRichTextToPlainText();
  // 1. 添加一个状态来追踪连接数量
  const [sharePeerCount, setSharePeerCount] = useState(0);
  const [retrievePeerCount, setRetrievePeerCount] = useState(0);
  const locale = useLocale();
  const { messages, isLoadingMessages } = usePageSetup({
    setRetrieveRoomId,
    setActiveTab,
    retrieveJoinRoomBtnRef,
  });
  // This function will be properly defined in useWebRTCConnection or useFileTransferHandler
  const dummyBroadcastDataToPeers = useCallback(async () => {
    if (!senderFileTransfer || !sender) return;
    console.log("Attempting to broadcast data (dummy)...");
    const peerIds = Array.from(sender.peerConnections.keys());
    await Promise.all(
      peerIds.map(async (peerId) => {
        if (shareContent)
          await senderFileTransfer.sendString(shareContent, peerId);
        if (sendFiles.length)
          senderFileTransfer.sendFileMeta(sendFiles, peerId);
      })
    );
  }, [sender, senderFileTransfer, shareContent, sendFiles]);
  const {
    shareRoomId,
    // initShareRoomId, // Not directly used in JSX, managed internally by hook
    setShareRoomId, // Keep this if shareRoomId can be set from input/clipboard
    shareLink,
    shareRoomStatusText,
    retrieveRoomStatusText,
    checkAndSetShareRoomId,
    joinRoom,
    generateShareLinkAndBroadcast,
  } = useRoomManager({
    messages,
    putMessageInMs,
    sender, // Placeholder
    receiver, // Placeholder
    activeTab,
    sharePeerCount, // Placeholder
    retrievePeerCount, // Placeholder
    broadcastDataToPeers: dummyBroadcastDataToPeers, // Placeholder for actual broadcast function
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

  //useCallback 钩子来定义 函数。这确保了函数只在其依赖项（content, files, senderFileTransfer）发生变化时才会重新创建
  const sendStringAndMetas = useCallback(
    async (peerId: string) => {
      if (!senderFileTransfer) {
        console.error(
          "senderFileTransfer is not initialized, delaying send operation..."
        );
        // 重试逻辑改为异步
        setTimeout(async () => {
          if (senderFileTransfer) {
            console.log("Retrying send operation...");
            if (shareContent)
              await (senderFileTransfer as FileSender).sendString(
                shareContent,
                peerId
              );
            if (sendFiles.length)
              (senderFileTransfer as FileSender).sendFileMeta(
                sendFiles,
                peerId
              );
          }
        }, 1000);
        return;
      }
      if (shareContent) {
        if (developmentEnv === "true")
          postLogInDebug(`Sending string content:${shareContent}`);
        // console.log('Sending string content:', shareContent);
        await senderFileTransfer.sendString(shareContent, peerId);
      }
      if (sendFiles.length) {
        // console.log('Sending file metadata:', sendFiles);
        senderFileTransfer.sendFileMeta(sendFiles, peerId);
      }
    },
    [shareContent, sendFiles, senderFileTransfer]
  );

  // 使用useEffect钩子来 在组件加载时 初始化，并在组件卸载时清理连接
  useEffect(() => {
    const senderConnection = new WebRTC_Initiator(config.API_URL);
    const receiverConnection = new WebRTC_Recipient(config.API_URL);

    setSender(senderConnection);
    setReceiver(receiverConnection);

    const senderFT = new FileSender(senderConnection);
    const receiverFT = new FileReceiver(receiverConnection);
    setSenderFileTransfer(senderFT);
    setReceiverFileTransfer(receiverFT);

    return () => {
      senderConnection.cleanUpBeforeExit();
      receiverConnection.cleanUpBeforeExit();
    };
  }, []);
  //定义一些文件接收处理函数
  useEffect(() => {
    if (sender && senderFileTransfer) {
      sender.onConnectionStateChange = (
        state: RTCPeerConnectionState,
        peerId: string
      ) => {
        console.log(`connection status: ${state} with peerId: ${peerId}`);
        setSharePeerCount(sender.peerConnections.size);
        if (state === "connected") {
          //当建立连接后，设置进度回调函数
          senderFileTransfer?.setProgressCallback(
            (fileId: string, progress: number, speed: number) => {
              setSendProgress((prev) => ({
                ...prev,
                [fileId]: {
                  ...prev[fileId],
                  [peerId]: { progress, speed },
                },
              }));
            },
            peerId
          );
        }
      };
      sender.onDataChannelOpen = sendStringAndMetas;
    }

    if (receiver && receiverFileTransfer) {
      receiver.onConnectionStateChange = (state: string, peerId: string) => {
        console.log(`connection status: ${state} with peerId: ${peerId}`);
        setRetrievePeerCount(receiver.peerConnections.size);
        if (state === "connected") {
          receiverFileTransfer?.setProgressCallback(
            (fileId: string, progress: number, speed: number) => {
              setReceiveProgress((prev) => ({
                ...prev,
                [fileId]: {
                  ...prev[fileId],
                  [peerId]: { progress, speed },
                },
              }));
            }
          );
        }
      };

      // receiver.onDataChannelOpen = () => {
      //   putMessageInMs(messages!.text.ClipboardApp.channelOpen_msg,false);
      // };
    }

    if (receiverFileTransfer) {
      receiverFileTransfer.onStringReceived = (value: string) => {
        setRetrievedContent(value);
      };

      receiverFileTransfer.onFileMetaReceived = (fileMeta: fileMetadata) => {
        const { type, ...metaWithoutType } = fileMeta; // 剔除 type 属性
        setRetrievedFileMetas((prev) => [...prev, metaWithoutType]);
      };

      receiverFileTransfer.onFileReceived = async (file: CustomFile) => {
        setRetrievedFiles((prev) => {
          // 检查 fullName 是否已经存在
          const isDuplicate = prev.some(
            (existingFile) => existingFile.fullName === file.fullName
          );
          if (isDuplicate) {
            return prev; // 如果存在，返回原数组
          }
          return [...prev, file]; // 否则添加到数组中
        });
      };
    }
  }, [
    sender,
    receiver,
    senderFileTransfer,
    receiverFileTransfer,
    sendStringAndMetas,
    messages,
  ]);
  //只有接收端支持下载
  const handleDownload = useCallback(
    async (meta: FileMeta) => {
      if (meta.folderName !== "") {
        const downloadFiles = retrievedFiles.filter(
          (file) => file.folderName === meta.folderName
        );
        const zip = new JSZip();
        for (let file of downloadFiles) zip.file(file.fullName, file); // Add files to the zip
        try {
          // Generate the zip file
          const content = await zip.generateAsync({ type: "blob" });
          DownloadAs(content, `downloaded_folder_${meta.folderName}.zip`);
        } catch (error) {
          console.error("Error creating zip file:", error);
          // alert('An error occurred while creating the zip file.');
        }
      } else {
        const downloadFiles = retrievedFiles.filter(
          (file) => file.name === meta.name
        );
        for (let file of downloadFiles) DownloadAs(file, file.name);
      }
    },
    [retrievedFiles]
  );

  const onFilePicked = useCallback((files: CustomFile[]) => {
    setSendFiles((prevFiles) => [...prevFiles, ...files]);
  }, []);
  //点击删除按钮之后，将对应文件删掉
  const removeSenderFile = useCallback((meta: FileMeta) => {
    // Uses sendFiles
    setSendFiles((prevFiles) => {
      if (meta.folderName !== "") {
        return prevFiles.filter((file) => file.folderName !== meta.folderName);
      } else {
        return prevFiles.filter((file) => file.name !== meta.name);
      }
    });
  }, []);

  //选择保存目录
  const onLocationPick = useCallback(async (): Promise<boolean> => {
    if (!messages) return false; // Added messages dependency
    if (!window.showDirectoryPicker) {
      console.error("showDirectoryPicker is not supported in this browser.");
      return false;
    }

    // 确认操作
    const userConfirmed = window.confirm(
      messages.text.ClipboardApp.pickSaveMsg
    );
    if (!userConfirmed) return false;

    try {
      // 选择保存目录
      const directory = await window.showDirectoryPicker();

      if (receiverFileTransfer && directory) {
        console.log("onLocationPick", directory);
        await receiverFileTransfer.setSaveDirectory(directory);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Failed to set up folder receive:", err);
      return false;
    }
  }, [receiverFileTransfer, messages]); // Added messages

  const handleRequest = useCallback(
    async (meta: FileMeta) => {
      if (!receiverFileTransfer) return;
      if (meta.folderName) {
        receiverFileTransfer.requestFolder(meta.folderName);
      } else {
        receiverFileTransfer.requestFile(meta.fileId);
      }
    },
    [receiverFileTransfer]
  );

  if (isLoadingMessages || !messages) {
    // Updated loading condition
    return <div>Loading...</div>;
  }
  return (
    <div className="container mx-auto px-4 py-8 w-full md:max-w-4xl">
      <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 mb-4">
        <Button
          variant={activeTab === "send" ? "default" : "outline"}
          onClick={() => setActiveTab("send")}
          className="flex-1"
        >
          {messages.text.ClipboardApp.html.senderTab}
        </Button>
        <Button
          variant={activeTab === "retrieve" ? "default" : "outline"}
          onClick={() => setActiveTab("retrieve")}
          className="flex-1"
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
              <RichTextEditor
                value={shareContent}
                onChange={(value) => setShareContent(value)}
              />
              <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 mb-4">
                <ReadClipboardButton
                  title={messages.text.ClipboardApp.html.Paste_dis}
                  onRead={(text: string) => setShareContent(text)}
                />
                <WriteClipboardButton
                  title={messages.text.ClipboardApp.html.Copy_dis}
                  textToCopy={richTextToPlainText(shareContent)}
                />
              </div>
              <div className="mb-2">
                <FileUploadHandler onFilePicked={onFilePicked} />
                <FileListDisplay
                  mode="sender"
                  files={sendFiles}
                  fileProgresses={sendProgress}
                  onDelete={removeSenderFile}
                />
              </div>
              <div className="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-2 mb-2">
                <span>{messages.text.ClipboardApp.html.inputRoomId_tips}</span>
                <Input
                  value={shareRoomId} //展示值
                  onChange={(e) => checkAndSetShareRoomId(e.target.value)}
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
                  onRead={(text: string) => setRetrieveRoomId(text)}
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
                    onChange={(value) => setRetrievedContent(value)}
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
                onRequest={handleRequest}
                onLocationPick={onLocationPick}
                saveType={receiverFileTransfer?.saveType}
              />
              {retrieveMessage && <p className="mb-4">{retrieveMessage}</p>}
            </>
          )}
        </CardContent>
      </Card>
      {activeTab === "send" && shareLink !== "" && messages && (
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
