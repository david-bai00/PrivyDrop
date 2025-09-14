import React, { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ReadClipboardButton,
  WriteClipboardButton,
} from "@/components/common/clipboard_btn";
import FileListDisplay from "@/components/ClipboardApp/FileListDisplay";
import type { Messages } from "@/types/messages";
import type { FileMeta } from "@/types/webrtc";

import { useFileTransferStore } from "@/stores/fileTransferStore";

interface RetrieveTabPanelProps {
  messages: Messages;
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void; // For onLocationPick
  setRetrieveRoomIdInput: (value: string) => void;
  joinRoom: (isSender: boolean, roomId: string) => void;
  retrieveJoinRoomBtnRef: React.RefObject<HTMLButtonElement>;
  richTextToPlainText: (html: string) => string;
  handleDownloadFile: (meta: FileMeta) => void;
  // Functions for WebRTC interaction, passed from parent via useWebRTCConnection
  requestFile: (fileId: string, peerId?: string) => void;
  requestFolder: (folderName: string, peerId?: string) => void;
  setReceiverDirectoryHandle: (
    directoryHandle: FileSystemDirectoryHandle
  ) => Promise<void>;
  getReceiverSaveType: () => { [fileId: string]: boolean } | undefined;
  retrieveMessage: string;
  handleLeaveRoom: () => void;
}

export function RetrieveTabPanel({
  messages,
  putMessageInMs,
  setRetrieveRoomIdInput,
  joinRoom,
  retrieveJoinRoomBtnRef,
  richTextToPlainText,
  handleDownloadFile,
  requestFile,
  requestFolder,
  setReceiverDirectoryHandle,
  getReceiverSaveType,
  retrieveMessage,
  handleLeaveRoom,
}: RetrieveTabPanelProps) {
  // Get the status from the store
  const {
    retrieveRoomStatusText,
    retrieveRoomIdInput,
    retrievedContent,
    retrievedFileMetas,
    receiveProgress,
    isAnyFileTransferring,
    isReceiverInRoom,
  } = useFileTransferStore();

  const onLocationPick = useCallback(async (): Promise<boolean> => {
    if (!messages) return false; // Should not happen if panel is rendered
    if (!window.showDirectoryPicker) {
      putMessageInMs(messages.text.ClipboardApp.pickSaveUnsupported, false);
      return false;
    }
    if (!window.confirm(messages.text.ClipboardApp.pickSaveMsg)) return false;
    try {
      const directoryHandle = await window.showDirectoryPicker();
      await setReceiverDirectoryHandle(directoryHandle);
      putMessageInMs(messages.text.ClipboardApp.pickSaveSuccess, false);
      return true;
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Failed to set up folder receive:", err);
        putMessageInMs(messages.text.ClipboardApp.pickSaveError, false);
      }
      return false;
    }
  }, [messages, putMessageInMs, setReceiverDirectoryHandle]);

  const handleFileRequestFromPanel = useCallback(
    (meta: FileMeta) => {
      if (meta.folderName) {
        requestFolder(meta.folderName);
      } else if (meta.fileId) {
        requestFile(meta.fileId);
      } else {
        console.warn("Cannot request file from panel: missing fileId", meta);
        // Optionally use putMessageInMs to inform user
      }
    },
    [requestFile, requestFolder]
  );

  return (
    <div id="retrieve-panel" role="tabpanel" aria-labelledby="retrieve-tab">
      <div className="mb-3 text-sm text-gray-600">
        {retrieveRoomStatusText ||
          (isReceiverInRoom
            ? messages.text.ClipboardApp.roomStatus.connected_dis
            : messages.text.ClipboardApp.roomStatus.receiverEmptyMsg)}
      </div>
      <div className="space-y-3 mb-4">
        {/* Room ID input section */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <ReadClipboardButton
              title={messages.text.ClipboardApp.html.readClipboard_dis}
              onRead={setRetrieveRoomIdInput}
            />
            <Input
              aria-label="Retrieve Room ID"
              value={retrieveRoomIdInput}
              onChange={(e) => setRetrieveRoomIdInput(e.target.value)}
              placeholder={
                messages.text.ClipboardApp.html.retrieveRoomId_placeholder
              }
              className="flex-1 min-w-0"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            className="flex-1 order-1"
            onClick={() => joinRoom(false, retrieveRoomIdInput)}
            ref={retrieveJoinRoomBtnRef}
            disabled={isReceiverInRoom || !retrieveRoomIdInput.trim()}
          >
            {messages.text.ClipboardApp.html.joinRoom_dis}
          </Button>
          <Button
            variant={isAnyFileTransferring ? "destructive" : "outline"}
            onClick={handleLeaveRoom}
            disabled={!isReceiverInRoom}
            className="w-full sm:w-auto px-4 order-2"
          >
            {isAnyFileTransferring
              ? messages.text.ClipboardApp.roomStatus.leaveRoomBtn + " ⚠️"
              : messages.text.ClipboardApp.roomStatus.leaveRoomBtn}
          </Button>
        </div>
      </div>
      {retrievedContent && (
        <div className="my-3 p-3 border rounded-md">
          <div className="bg-white p-3 rounded border border-gray-200 text-sm leading-relaxed">
            <div dangerouslySetInnerHTML={{ __html: retrievedContent }} />
          </div>
          <div className="flex justify-start">
            <WriteClipboardButton
              title={messages.text.ClipboardApp.html.Copy_dis}
              textToCopy={richTextToPlainText(retrievedContent)}
            />
          </div>
        </div>
      )}
      <FileListDisplay
        mode="receiver"
        files={retrievedFileMetas}
        fileProgresses={receiveProgress}
        isAnyFileTransferring={isAnyFileTransferring}
        onDownload={handleDownloadFile}
        onRequest={handleFileRequestFromPanel} // Use the panel's own handler
        onLocationPick={onLocationPick} // Use the panel's own handler
        saveType={getReceiverSaveType()}
      />
      {retrieveMessage && (
        <p className="mt-3 text-sm text-blue-600">{retrieveMessage}</p>
      )}
    </div>
  );
}
