"use client";
import React, { useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import useRichTextToPlainText from "../hooks/useRichTextToPlainText";
import QRCodeComponent from "./ClipboardApp/ShareCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClipboardAppMessages } from "@/hooks/useClipboardAppMessages";
import { usePageSetup } from "@/hooks/usePageSetup";
import { useRoomManager } from "@/hooks/useRoomManager";
import { useWebRTCConnection } from "@/hooks/useWebRTCConnection";
import { useFileTransferHandler } from "@/hooks/useFileTransferHandler";
import { SendTabPanel } from "./ClipboardApp/SendTabPanel";
import { RetrieveTabPanel } from "./ClipboardApp/RetrieveTabPanel";
import FullScreenDropZone from "./ClipboardApp/FullScreenDropZone";
import { traverseFileTree } from "@/lib/fileUtils";
import { useFileTransferStore } from "@/stores/fileTransferStore";

const ClipboardApp = () => {
  const { shareMessage, retrieveMessage, putMessageInMs } =
    useClipboardAppMessages();

  const dragCounter = useRef(0);
  const retrieveJoinRoomBtnRef = useRef<HTMLButtonElement>(null);

  const { messages, isLoadingMessages } = usePageSetup({
    setRetrieveRoomId: useFileTransferStore.getState().setRetrieveRoomIdInput,
    setActiveTab: useFileTransferStore.getState().setActiveTab,
    retrieveJoinRoomBtnRef,
  });

  // 从 store 中获取状态
  const {
    activeTab,
    isDragging,
    shareRoomId,
    shareLink,
    setIsDragging,
    setRetrieveRoomIdInput,
    setActiveTab,
  } = useFileTransferStore();

  const richTextToPlainText = useRichTextToPlainText();

  // Initialize File Transfer Handler Hook
  const {
    updateShareContent,
    addFilesToSend,
    removeFileToSend,
    handleDownloadFile,
  } = useFileTransferHandler({ messages, putMessageInMs });

  // 简化的 WebRTC 连接初始化
  const {
    sharePeerCount,
    retrievePeerCount,
    broadcastDataToAllPeers,
    requestFile,
    requestFolder,
    setReceiverDirectoryHandle,
    getReceiverSaveType,
    senderDisconnected,
    resetReceiverConnection,
    resetSenderConnection,
    manualSafeSave,
  } = useWebRTCConnection({
    messages,
    putMessageInMs,
  });

  const resetAppState = useCallback(async () => {
    try {
      // Reset file transfer state
      useFileTransferStore.getState().resetReceiverState();

      // Reset WebRTC connection state
      await resetReceiverConnection();

      // Reset room input
      setRetrieveRoomIdInput("");

      console.log("Application state reset successfully");
    } catch (error) {
      console.error("Error during state reset:", error);
      window.location.reload();
    }
  }, [resetReceiverConnection, setRetrieveRoomIdInput]);

  // 大大简化的房间管理 - 不再需要传递任何 WebRTC 依赖
  const {
    processRoomIdInput,
    joinRoom,
    generateShareLinkAndBroadcast,
    handleLeaveReceiverRoom,
    handleLeaveSenderRoom,
  } = useRoomManager({
    messages,
    putMessageInMs,
  });

  const handleFileDrop = useCallback(
    (items: DataTransferItemList) => {
      if (activeTab !== "send") return;
      const itemsArray = Array.from(items);
      Promise.all(
        itemsArray.map((item) => {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            return traverseFileTree(entry);
          }
          return Promise.resolve([]);
        })
      ).then((results) => {
        const allFiles = results.flat();
        if (allFiles.length > 0) {
          addFilesToSend(allFiles);
        }
      });
    },
    [activeTab, addFilesToSend]
  );

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeTab !== "send") return;
      dragCounter.current++;
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeTab !== "send") return;
      dragCounter.current--;
      if (dragCounter.current === 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeTab !== "send") return;
      if (e.dataTransfer?.items) {
        handleFileDrop(e.dataTransfer.items);
      }
      dragCounter.current = 0;
      setIsDragging(false);
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [activeTab, handleFileDrop, setIsDragging]);

  if (isLoadingMessages || !messages) {
    return (
      <div className="container mx-auto px-4 py-8 w-full md:max-w-4xl">
        <div className="min-h-[1000px] w-full bg-gray-200/50 dark:bg-gray-800/50 rounded-lg animate-pulse">
          {" "}
          Loading Editor...{" "}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto px-1 sm:px-1 py-3 sm:py-8 md:max-w-4xl md:container">
      <FullScreenDropZone isDragging={isDragging} messages={messages} />
      <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 mb-4">
        <Button
          variant={activeTab === "send" ? "default" : "outline"}
          onClick={() => setActiveTab("send")}
          className="flex-1"
          aria-controls="send-panel"
          id="send-tab"
          aria-selected={activeTab === "send"}
        >
          {messages.text.ClipboardApp.html.senderTab}
        </Button>
        <Button
          variant={activeTab === "retrieve" ? "default" : "outline"}
          onClick={() => setActiveTab("retrieve")}
          className="flex-1"
          aria-controls="retrieve-panel"
          id="retrieve-tab"
          aria-selected={activeTab === "retrieve"}
        >
          {messages.text.ClipboardApp.html.retrieveTab}
        </Button>
      </div>
      <Card className="border-4 sm:border-8 shadow-md">
        <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
          <CardTitle className="text-lg sm:text-xl">
            {activeTab === "send"
              ? messages.text.ClipboardApp.html.shareTitle_dis
              : messages.text.ClipboardApp.html.retrieveTitle_dis}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {activeTab === "send" ? (
            <SendTabPanel
              messages={messages}
              updateShareContent={updateShareContent}
              addFilesToSend={addFilesToSend}
              removeFileToSend={removeFileToSend}
              richTextToPlainText={richTextToPlainText}
              processRoomIdInput={processRoomIdInput}
              joinRoom={joinRoom}
              generateShareLinkAndBroadcast={generateShareLinkAndBroadcast}
              shareMessage={shareMessage}
              currentValidatedShareRoomId={shareRoomId}
              handleLeaveSenderRoom={handleLeaveSenderRoom}
            />
          ) : (
            <RetrieveTabPanel
              messages={messages}
              putMessageInMs={putMessageInMs}
              setRetrieveRoomIdInput={setRetrieveRoomIdInput}
              joinRoom={joinRoom}
              retrieveJoinRoomBtnRef={retrieveJoinRoomBtnRef}
              richTextToPlainText={richTextToPlainText}
              handleDownloadFile={handleDownloadFile}
              requestFile={requestFile}
              requestFolder={requestFolder}
              setReceiverDirectoryHandle={setReceiverDirectoryHandle}
              getReceiverSaveType={getReceiverSaveType}
              retrieveMessage={retrieveMessage}
              handleLeaveRoom={handleLeaveReceiverRoom}
              manualSafeSave={manualSafeSave}
            />
          )}
        </CardContent>
      </Card>
      {activeTab === "send" && shareLink && messages && (
        <Card className="border-2 sm:border-4 shadow-md mt-2 sm:mt-4">
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base sm:text-lg">
              {messages.text.ClipboardApp.html.RetrieveMethodTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 sm:px-6">
            <QRCodeComponent RoomID={shareRoomId} shareLink={shareLink} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClipboardApp;
