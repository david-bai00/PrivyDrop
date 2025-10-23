import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Tooltip from "@/components/Tooltip";
import {
  ReadClipboardButton,
  WriteClipboardButton,
} from "@/components/common/clipboard_btn";
import { FileUploadHandler } from "@/components/ClipboardApp/FileUploadHandler";
import FileListDisplay from "@/components/ClipboardApp/FileListDisplay";
import AnimatedButton from "@/components/ui/AnimatedButton";
import type { Messages } from "@/types/messages";
import type { CustomFile, FileMeta } from "@/types/webrtc";

import { useFileTransferStore } from "@/stores/fileTransferStore";
import { getCachedId, setCachedId } from "@/lib/roomIdCache";

// Dynamically import the RichTextEditor
const RichTextEditor = dynamic(
  () => import("@/components/Editor/RichTextEditor"),
  {
    ssr: false, // This component is client-side only
    loading: () => (
      <div className="p-4 border rounded-lg min-h-[200px] md:min-h-[400px] bg-gray-50 flex items-center justify-center">
        Loading Editor...
      </div>
    ),
  }
);

interface SendTabPanelProps {
  messages: Messages;
  updateShareContent: (content: string) => void;
  addFilesToSend: (files: CustomFile[]) => void;
  removeFileToSend: (meta: FileMeta) => void;
  richTextToPlainText: (html: string) => string;
  processRoomIdInput: (roomId: string) => void; // Passed from useRoomManager
  joinRoom: (isSender: boolean, roomId: string) => void;
  generateShareLinkAndBroadcast: () => void;
  shareMessage: string;
  currentValidatedShareRoomId: string;
  handleLeaveSenderRoom: () => void; // New prop for leaving room
  putMessageInMs: (
    message: string,
    isShareEnd?: boolean,
    displayTimeMs?: number
  ) => void;
}

export function SendTabPanel({
  messages,
  updateShareContent,
  addFilesToSend,
  removeFileToSend,
  richTextToPlainText,
  processRoomIdInput,
  joinRoom,
  generateShareLinkAndBroadcast,
  shareMessage,
  currentValidatedShareRoomId,
  handleLeaveSenderRoom,
  putMessageInMs,
}: SendTabPanelProps) {
  // Get the status from the store
  const {
    shareContent,
    sendFiles,
    shareRoomStatusText,
    sendProgress,
    isAnyFileTransferring,
    isSenderInRoom,
  } = useFileTransferStore();
  // Local state for immediate response in the input field
  const [inputFieldValue, setInputFieldValue] = useState<string>(
    currentValidatedShareRoomId
  );
  // State to track ID generation mode (false = will show simple next, true = will show random next)
  const [isSimpleIdMode, setIsSimpleIdMode] = useState<boolean>(true);
  // Cached ID state
  const [hasCachedId, setHasCachedId] = useState<boolean>(false);

  // When the validatedShareRoomId from the parent component changes (e.g., after initial fetch), synchronize the local input field's value
  useEffect(() => {
    setInputFieldValue(currentValidatedShareRoomId);
  }, [currentValidatedShareRoomId]);

  useEffect(() => {
    setHasCachedId(!!getCachedId());
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputFieldValue(newValue); // Immediately update the input field display
      processRoomIdInput(newValue); // Call the handler function from the hook, which will perform debounced validation
    },
    [processRoomIdInput]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pastedText = e.clipboardData.getData("text").trim();
      setInputFieldValue(pastedText);
      processRoomIdInput(pastedText);
    },
    [processRoomIdInput]
  );

  // Handle ID generation toggle
  const handleIdGeneration = useCallback(async () => {
    if (isSimpleIdMode) {
      // Generate random UUID
      const randomId = crypto.randomUUID();
      processRoomIdInput(randomId);
    } else {
      // Generate simple 4-digit ID by calling backend API
      try {
        const { fetchRoom } = await import("@/app/config/api");
        const simpleRoomId = await fetchRoom();
        if (simpleRoomId) {
          // fetchRoom() already created the room, so set it as initial room ID
          // This prevents joinRoom() from trying to create it again
          setInputFieldValue(simpleRoomId);
          const { useFileTransferStore } = await import(
            "@/stores/fileTransferStore"
          );
          const store = useFileTransferStore.getState();
          store.setShareRoomId(simpleRoomId);
          // IMPORTANT: Set as initial room ID to prevent duplicate creation
          store.setInitShareRoomId(simpleRoomId);
        } else {
          processRoomIdInput(crypto.randomUUID());
        }
      } catch (error) {
        processRoomIdInput(crypto.randomUUID());
      }
    }

    // Toggle mode for next click
    setIsSimpleIdMode(!isSimpleIdMode);
  }, [isSimpleIdMode, processRoomIdInput, setInputFieldValue]);

  // Save/Use cached ID button handlers
  const isSaveEnabled = (inputFieldValue || "").trim().length >= 8;
  const handleSaveOrUseCachedId = useCallback(() => {
    if (hasCachedId) {
      const cached = getCachedId();
      if (cached) {
        setInputFieldValue(cached);
      }
      return;
    }
    // Save current input to cache
    const trimmed = (inputFieldValue || "").trim();
    if (trimmed.length >= 8) {
      setCachedId(trimmed);
      setHasCachedId(true);
      // Notify via messages on sender side
      putMessageInMs(messages.text.ClipboardApp.saveId_success, true);
    }
  }, [
    hasCachedId,
    inputFieldValue,
    putMessageInMs,
    messages.text.ClipboardApp.saveId_success,
  ]);

  return (
    <div id="send-panel" role="tabpanel" aria-labelledby="send-tab">
      <div className="mb-3 text-sm text-gray-600">
        {shareRoomStatusText ||
          (isSenderInRoom
            ? messages.text.ClipboardApp.roomStatus.onlyOneMsg
            : messages.text.ClipboardApp.roomStatus.senderEmptyMsg)}
      </div>
      <RichTextEditor value={shareContent} onChange={updateShareContent} />
      <div className="flex flex-col sm:flex-row gap-2 my-3">
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
        <FileUploadHandler onFilePicked={addFilesToSend} />
        <FileListDisplay
          mode="sender"
          files={sendFiles}
          fileProgresses={sendProgress}
          isAnyFileTransferring={isAnyFileTransferring}
          onDelete={removeFileToSend}
        />
      </div>
      <div className="space-y-3 mb-4">
        {/* Room ID input section */}
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            {messages.text.ClipboardApp.html.inputRoomId_tips}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              aria-label="Share Room ID"
              value={inputFieldValue}
              onChange={handleInputChange}
              onPaste={handlePaste}
              className="flex-1 min-w-0"
              placeholder={
                messages.text.ClipboardApp.html.retrieveRoomId_placeholder
              }
            />
            <Button
              variant="outline"
              className="w-full sm:w-auto px-4"
              onClick={handleIdGeneration}
              disabled={isSenderInRoom}
            >
              {isSimpleIdMode
                ? messages.text.ClipboardApp.html.generateRandomId_tips
                : messages.text.ClipboardApp.html.generateSimpleId_tips}
            </Button>
            {/* Save/Use Cached ID Button in between */}
            <Tooltip
              content={
                hasCachedId
                  ? messages.text.ClipboardApp.html.useCachedId_tips
                  : messages.text.ClipboardApp.html.saveId_tips
              }
            >
              <span className="inline-block">
                <Button
                  className="w-full sm:w-auto px-4"
                  variant="outline"
                  onClick={handleSaveOrUseCachedId}
                  disabled={!hasCachedId && !isSaveEnabled}
                >
                  {hasCachedId
                    ? messages.text.ClipboardApp.html.useCachedId_dis
                    : messages.text.ClipboardApp.html.saveId_dis}
                </Button>
              </span>
            </Tooltip>
            <Button
              className="w-full sm:w-auto px-4"
              onClick={() => joinRoom(true, inputFieldValue.trim())}
              disabled={isSenderInRoom || !inputFieldValue.trim()}
            >
              {messages.text.ClipboardApp.html.joinRoom_dis}
            </Button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2">
          <AnimatedButton
            className="flex-1 order-1"
            onClick={generateShareLinkAndBroadcast}
            loadingText={
              messages.text.ClipboardApp.html.SyncSending_loadingText
            }
            disabled={
              !isSenderInRoom ||
              (sendFiles.length === 0 && shareContent.trim() === "") ||
              !currentValidatedShareRoomId.trim() ||
              isAnyFileTransferring
            }
          >
            {messages.text.ClipboardApp.html.SyncSending_dis}
          </AnimatedButton>
          <Button
            variant={isAnyFileTransferring ? "destructive" : "outline"}
            onClick={handleLeaveSenderRoom}
            disabled={!isSenderInRoom}
            className="w-full sm:w-auto px-4 order-2"
          >
            {isAnyFileTransferring
              ? messages.text.ClipboardApp.roomStatus.leaveRoomBtn + " ⚠️"
              : messages.text.ClipboardApp.roomStatus.leaveRoomBtn}
          </Button>
        </div>
      </div>
      {shareMessage && (
        <p className="mt-3 text-sm text-blue-600">{shareMessage}</p>
      )}
    </div>
  );
}
