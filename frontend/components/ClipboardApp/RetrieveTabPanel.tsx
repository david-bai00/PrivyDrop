import React, { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import RichTextEditor from "@/components/Editor/RichTextEditor";
import {
  ReadClipboardButton,
  WriteClipboardButton,
} from "@/components/common/clipboard_btn";
import FileListDisplay from "@/components/ClipboardApp/FileListDisplay";
import type { Messages } from "@/types/messages";
import type { FileMeta } from "@/types/webrtc";
import type { ProgressState } from "@/hooks/useWebRTCConnection"; // Assuming this type is exported
import type WebRTC_Recipient from "@/lib/webrtc_Recipient";

interface RetrieveTabPanelProps {
  messages: Messages;
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void; // For onLocationPick
  retrieveRoomStatusText: string;
  retrieveRoomIdInput: string;
  setRetrieveRoomIdInput: (value: string) => void;
  joinRoom: (isSender: boolean, roomId: string) => void;
  retrieveJoinRoomBtnRef: React.RefObject<HTMLButtonElement>;
  receiver: WebRTC_Recipient | null;
  retrievedContent: string;
  // setRetrievedContent: (content: string) => void; // If editor becomes editable
  richTextToPlainText: (html: string) => string;
  retrievedFileMetas: FileMeta[];
  receiveProgress: ProgressState;
  isAnyFileTransferring: boolean;
  handleDownloadFile: (meta: FileMeta) => void;
  // Functions for WebRTC interaction, passed from parent via useWebRTCConnection
  requestFile: (fileId: string, peerId?: string) => void;
  requestFolder: (folderName: string, peerId?: string) => void;
  setReceiverDirectoryHandle: (
    directoryHandle: FileSystemDirectoryHandle
  ) => Promise<void>;
  getReceiverSaveType: () => { [fileId: string]: boolean } | undefined;
  manualSafeSave: () => void; // Add manual safe save function
  retrieveMessage: string;
  senderDisconnected: boolean;
  handleLeaveRoom: () => void;
}

export function RetrieveTabPanel({
  messages,
  putMessageInMs,
  retrieveRoomStatusText,
  retrieveRoomIdInput,
  setRetrieveRoomIdInput,
  joinRoom,
  retrieveJoinRoomBtnRef,
  receiver,
  retrievedContent,
  richTextToPlainText,
  retrievedFileMetas,
  receiveProgress,
  isAnyFileTransferring,
  handleDownloadFile,
  requestFile,
  requestFolder,
  setReceiverDirectoryHandle,
  getReceiverSaveType,
  manualSafeSave,
  retrieveMessage,
  senderDisconnected,
  handleLeaveRoom,
}: RetrieveTabPanelProps) {
  const onLocationPick = useCallback(async (): Promise<boolean> => {
    if (!messages) return false; // Should not happen if panel is rendered
    if (!window.showDirectoryPicker) {
      putMessageInMs(
        // messages.text.ClipboardApp.pickSaveUnsupported ||
        "Directory picker not supported.",
        false
      );
      return false;
    }
    if (!window.confirm(messages.text.ClipboardApp.pickSaveMsg)) return false;
    try {
      const directoryHandle = await window.showDirectoryPicker();
      await setReceiverDirectoryHandle(directoryHandle);
      putMessageInMs(
        // messages.text.ClipboardApp.pickSaveSuccess ||
        "Save location set.",
        false
      );
      return true;
    } catch (err: any) {
      if (err.name !== "AbortError") {
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
          (receiver && receiver.isInRoom
            ? messages.text.ClipboardApp.roomStatus.connected_dis
            : messages.text.ClipboardApp.roomStatus.receiverEmptyMsg)}
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-2 mb-3">
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
          className="flex-grow min-w-0"
        />
      </div>
      <div className="flex gap-2 mb-3">
        <Button
          className="flex-1"
          onClick={() => joinRoom(false, retrieveRoomIdInput)}
          ref={retrieveJoinRoomBtnRef}
          disabled={
            !receiver || receiver.isInRoom || !retrieveRoomIdInput.trim()
          }
        >
          {messages.text.ClipboardApp.html.joinRoom_dis}
        </Button>
        <Button
          variant="outline"
          onClick={handleLeaveRoom}
          disabled={!receiver || !receiver.isInRoom || isAnyFileTransferring}
        >
          {messages.text.ClipboardApp.roomStatus.leaveRoomBtn}
        </Button>
      </div>
      {retrievedContent && (
        <div className="my-3 p-2 border rounded bg-gray-50">
          <RichTextEditor
            value={retrievedContent}
            onChange={() => {
              /* Read-only */
            }}
          />
          <div className="mt-2">
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
        onSafeSave={manualSafeSave} // Add safe save handler
        saveType={getReceiverSaveType()}
      />
      {retrieveMessage && (
        <p className="mt-3 text-sm text-blue-600">{retrieveMessage}</p>
      )}
    </div>
  );
}
