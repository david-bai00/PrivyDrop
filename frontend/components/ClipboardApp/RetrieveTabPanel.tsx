import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ReadClipboardButton,
  WriteClipboardButton,
} from "@/components/common/clipboard_btn";
import CachedIdActionButton from "@/components/ClipboardApp/CachedIdActionButton";
import FileListDisplay from "@/components/ClipboardApp/FileListDisplay";
import type { FileMeta } from "@/types/webrtc";

import { useFileTransferStore } from "@/stores/fileTransferStore";

interface RetrieveTabPanelProps {
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
  const tActions = useTranslations("text.clipboard.actions");
  const tPlaceholders = useTranslations("text.clipboard.placeholders");
  const tStatus = useTranslations("text.clipboard.status");
  const tSaveLocation = useTranslations("text.clipboard.saveLocation");
  const tCommon = useTranslations("text.common");
  const t = useTranslations("text.clipboard");
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
    if (!window.showDirectoryPicker) {
      putMessageInMs(tSaveLocation("unsupported"), false);
      return false;
    }
    if (!window.confirm(tSaveLocation("pickMsg"))) return false;
    try {
      const directoryHandle = await window.showDirectoryPicker();
      await setReceiverDirectoryHandle(directoryHandle);
      putMessageInMs(tSaveLocation("success"), false);
      return true;
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Failed to set up folder receive:", err);
        putMessageInMs(tSaveLocation("error"), false);
      }
      return false;
    }
  }, [tSaveLocation, putMessageInMs, setReceiverDirectoryHandle]);

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
      <div className="mb-3 text-sm text-muted-foreground">
        {retrieveRoomStatusText ||
          (isReceiverInRoom
            ? tStatus("connected")
            : tStatus("receiverCanAccept"))}
      </div>
      <div className="space-y-3 mb-4">
        {/* Room ID input section */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <ReadClipboardButton
              title={tActions("readClipboard")}
              onRead={setRetrieveRoomIdInput}
            />
            {/* Save/Use Cached ID Button placed after Paste button */}
            <CachedIdActionButton
              getInputValue={() => retrieveRoomIdInput}
              setInputValue={setRetrieveRoomIdInput}
              putMessageInMs={putMessageInMs}
              isShareEnd={false}
            />
            <Input
              aria-label="Retrieve Room ID"
              value={retrieveRoomIdInput}
              onChange={(e) => setRetrieveRoomIdInput(e.target.value)}
              placeholder={tPlaceholders("roomId")}
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
            {tCommon("buttons.joinRoom")}
          </Button>
          <Button
            variant={isAnyFileTransferring ? "destructive" : "outline"}
            onClick={handleLeaveRoom}
            disabled={!isReceiverInRoom}
            className="w-full sm:w-auto px-4 order-2"
          >
            {isAnyFileTransferring
              ? tCommon("buttons.leaveRoom") + " ⚠️"
              : tCommon("buttons.leaveRoom")}
          </Button>
        </div>
      </div>
      {retrievedContent && (
        <div className="my-3 p-3 border rounded-md">
          <div className="bg-card text-card-foreground p-3 rounded border text-sm leading-relaxed">
            <div dangerouslySetInnerHTML={{ __html: retrievedContent }} />
          </div>
           <div className="flex justify-start">
            <WriteClipboardButton
              title={tCommon("buttons.copy")}
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
        <p className="mt-3 text-sm text-primary">{retrieveMessage}</p>
      )}
    </div>
  );
}
