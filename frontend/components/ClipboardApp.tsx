"use client";
import React, { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FileListDisplay from "./self_define/FileListDisplay";
import { FileMeta } from "@/lib/types/file";
import {
  WriteClipboardButton,
  ReadClipboardButton,
} from "./self_define/clipboard_btn";
import useRichTextToPlainText from "./self_define/rich-text-to-plain-text";
import QRCodeComponent from "./self_define/RetrieveMethod";
import { FileUploadHandler } from "./self_define/file-upload-handler";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import RichTextEditor from "@/components/Editor/RichTextEditor";
import AnimatedButton from "./self_define/AnimatedButton";
import { useClipboardAppMessages } from "@/hooks/useClipboardAppMessages";
import { usePageSetup } from "@/hooks/usePageSetup";
import { useRoomManager } from "@/hooks/useRoomManager";
import { useWebRTCConnection } from "@/hooks/useWebRTCConnection";
import { useFileTransferHandler } from "@/hooks/useFileTransferHandler";

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

  const richTextToPlainText = useRichTextToPlainText();

  // Initialize File Transfer Handler Hook
  const {
    shareContent,
    sendFiles,
    retrievedContent,
    retrievedFiles,
    retrievedFileMetas,
    updateShareContent,
    addFilesToSend,
    removeFileToSend,
    // clearSentItems, // Call these when appropriate e.g. after successful send or tab switch
    // clearRetrievedItems,
    onStringDataReceived, // Callback for WebRTC hook
    onFileMetadataReceived, // Callback for WebRTC hook
    onFileFullyReceived, // Callback for WebRTC hook
    handleDownloadFile, // Direct handler for UI
  } = useFileTransferHandler({ messages, putMessageInMs });

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
    messages,
    putMessageInMs,
    onStringReceived: onStringDataReceived,
    onFileMetaReceived: onFileMetadataReceived,
    onFileReceived: onFileFullyReceived,
  });

  // Initialize Room Manager Hook
  const {
    shareRoomId,
    // setShareRoomId, // Keep if shareRoomId can be set from input/clipboard
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
              <RichTextEditor
                value={shareContent}
                onChange={updateShareContent}
              />
              <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 mb-4">
                <ReadClipboardButton
                  title={messages.text.ClipboardApp.html.Paste_dis}
                  onRead={updateShareContent}
                />
                <WriteClipboardButton
                  title={messages.text.ClipboardApp.html.Copy_dis}
                  textToCopy={richTextToPlainText(shareContent)}
                />
              </div>
              <div className="mb-3">
                <FileUploadHandler
                  onFilePicked={addFilesToSend}
                  // messages={messages}
                />
                <FileListDisplay
                  mode="sender"
                  files={sendFiles}
                  fileProgresses={sendProgress}
                  onDelete={removeFileToSend}
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
                  disabled={
                    !sender ||
                    !sender.isInRoom ||
                    (sendFiles.length === 0 && shareContent.trim() === "")
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
                    onChange={() => {
                      /* setRetrievedContent is internal */
                    }}
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
                onDownload={handleDownloadFile}
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
