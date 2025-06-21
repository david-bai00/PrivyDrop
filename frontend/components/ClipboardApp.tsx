"use client";
import React, { useState, useRef, useCallback } from "react";
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

const ClipboardApp = () => {
  const { shareMessage, retrieveMessage, putMessageInMs } =
    useClipboardAppMessages();

  const [retrieveRoomIdInput, setRetrieveRoomIdInput] = useState("");
  const [activeTab, setActiveTab] = useState<"send" | "retrieve">("send");
  const retrieveJoinRoomBtnRef = useRef<HTMLButtonElement>(null); // Ref for the receiver's "Join Room" button

  const { messages, isLoadingMessages } = usePageSetup({
    setRetrieveRoomId: setRetrieveRoomIdInput,
    setActiveTab,
    retrieveJoinRoomBtnRef,
  });

  const richTextToPlainText = useRichTextToPlainText();

  // Initialize File Transfer Handler Hook
  const {
    shareContent,
    sendFiles,
    retrievedContent,
    retrievedFileMetas,
    updateShareContent,
    addFilesToSend,
    removeFileToSend,
    onStringDataReceived,
    onFileMetadataReceived,
    onFileFullyReceived,
    handleDownloadFile,
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
    shareContent,
    sendFiles,
    messages,
    putMessageInMs,
    onStringReceived: onStringDataReceived,
    onFileMetaReceived: onFileMetadataReceived,
    onFileReceived: onFileFullyReceived,
  });

  // Initialize Room Manager Hook
  const {
    shareRoomId,
    initShareRoomId,
    shareLink,
    shareRoomStatusText,
    retrieveRoomStatusText,
    processRoomIdInput,
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
            <SendTabPanel
              messages={messages}
              shareRoomStatusText={shareRoomStatusText}
              shareContent={shareContent}
              sendFiles={sendFiles}
              updateShareContent={updateShareContent}
              addFilesToSend={addFilesToSend}
              removeFileToSend={removeFileToSend}
              richTextToPlainText={richTextToPlainText}
              sendProgress={sendProgress}
              processRoomIdInput={processRoomIdInput}
              joinRoom={joinRoom}
              generateShareLinkAndBroadcast={generateShareLinkAndBroadcast}
              sender={sender}
              shareMessage={shareMessage}
              currentValidatedShareRoomId={shareRoomId}
            />
          ) : (
            <RetrieveTabPanel
              messages={messages}
              putMessageInMs={putMessageInMs} // Needed for onLocationPick
              retrieveRoomStatusText={retrieveRoomStatusText}
              retrieveRoomIdInput={retrieveRoomIdInput}
              setRetrieveRoomIdInput={setRetrieveRoomIdInput}
              joinRoom={joinRoom}
              retrieveJoinRoomBtnRef={retrieveJoinRoomBtnRef}
              receiver={receiver}
              retrievedContent={retrievedContent}
              richTextToPlainText={richTextToPlainText}
              retrievedFileMetas={retrievedFileMetas}
              receiveProgress={receiveProgress}
              handleDownloadFile={handleDownloadFile}
              // Pass WebRTC interaction methods
              requestFile={requestFile}
              requestFolder={requestFolder}
              setReceiverDirectoryHandle={setReceiverDirectoryHandle}
              getReceiverSaveType={getReceiverSaveType}
              retrieveMessage={retrieveMessage}
            />
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

export default ClipboardApp;
