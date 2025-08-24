import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ReadClipboardButton,
  WriteClipboardButton,
} from "@/components/common/clipboard_btn";
import { FileUploadHandler } from "@/components/ClipboardApp/FileUploadHandler";
import FileListDisplay from "@/components/ClipboardApp/FileListDisplay";
import AnimatedButton from "@/components/ui/AnimatedButton";
import type { Messages } from "@/types/messages";
import type { CustomFile, FileMeta } from "@/types/webrtc";
import type { ProgressState } from "@/hooks/useWebRTCConnection";

import { useFileTransferStore } from "@/stores/fileTransferStore";

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
}: SendTabPanelProps) {
  // 从 store 中获取状态
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

  // When the validatedShareRoomId from the parent component changes (e.g., after initial fetch), synchronize the local input field's value
  useEffect(() => {
    setInputFieldValue(currentValidatedShareRoomId);
  }, [currentValidatedShareRoomId]);

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
              onClick={() => processRoomIdInput(crypto.randomUUID())}
              disabled={isSenderInRoom}
            >
              {messages.text.ClipboardApp.html.generateRoomId_tips}
            </Button>
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
            variant="outline"
            onClick={handleLeaveSenderRoom}
            disabled={!isSenderInRoom || isAnyFileTransferring}
            className="w-full sm:w-auto px-4 order-2"
          >
            {messages.text.ClipboardApp.roomStatus.leaveRoomBtn}
          </Button>
        </div>
      </div>
      {shareMessage && (
        <p className="mt-3 text-sm text-blue-600">{shareMessage}</p>
      )}
    </div>
  );
}
