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
import type WebRTC_Initiator from "@/lib/webrtc_Initiator";

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
  shareRoomStatusText: string;
  shareContent: string;
  sendFiles: CustomFile[];
  updateShareContent: (content: string) => void;
  addFilesToSend: (files: CustomFile[]) => void;
  removeFileToSend: (meta: FileMeta) => void;
  richTextToPlainText: (html: string) => string;
  sendProgress: ProgressState;
  // shareRoomId: string; // This comes from useRoomManager and represents the validated ID
  processRoomIdInput: (roomId: string) => void; // Passed from useRoomManager
  joinRoom: (isSender: boolean, roomId: string) => void;
  generateShareLinkAndBroadcast: () => void;
  sender: WebRTC_Initiator | null;
  shareMessage: string;
  // Pass the validated/initial shareRoomId from useRoomManager for display/initialization
  // Also, initShareRoomId can be useful if we want to reset the input to it.
  currentValidatedShareRoomId: string;
  // initShareRoomId: string; // If needed for reset logic
}

export function SendTabPanel({
  messages,
  shareRoomStatusText,
  shareContent,
  sendFiles,
  updateShareContent,
  addFilesToSend,
  removeFileToSend,
  richTextToPlainText,
  sendProgress,
  processRoomIdInput,
  joinRoom,
  generateShareLinkAndBroadcast,
  sender,
  shareMessage,
  currentValidatedShareRoomId,
}: // initShareRoomId,
SendTabPanelProps) {
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
          (sender?.isInRoom
            ? messages.text.ClipboardApp.roomStatus.onlyOneMsg
            : messages.text.ClipboardApp.roomStatus.senderEmptyMsg)}
      </div>
      <RichTextEditor value={shareContent} onChange={updateShareContent} />
      <div className="flex flex-wrap gap-2 my-3">
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
          onDelete={removeFileToSend}
        />
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-2 mb-3">
        <span className="text-sm whitespace-nowrap">
          {messages.text.ClipboardApp.html.inputRoomId_tips}
        </span>
        <Input
          aria-label="Share Room ID"
          value={inputFieldValue} // Bind to local state
          onChange={handleInputChange}
          onPaste={handlePaste}
          className="flex-grow min-w-0"
        />
        <Button
          className="w-full sm:w-auto"
          onClick={() => joinRoom(true, inputFieldValue.trim())} // Attempt to join using the current input field value
          disabled={!sender || sender.isInRoom || !inputFieldValue.trim()}
        >
          {messages.text.ClipboardApp.html.joinRoom_dis}
        </Button>
      </div>
      <div className="flex">
        <AnimatedButton
          className="w-full"
          onClick={generateShareLinkAndBroadcast}
          loadingText={messages.text.ClipboardApp.html.startSending_loadingText}
          disabled={
            !sender ||
            !sender.isInRoom ||
            (sendFiles.length === 0 && shareContent.trim() === "") ||
            !currentValidatedShareRoomId.trim()
          } // Ensure there is a validated room ID before allowing sharing
        >
          {messages.text.ClipboardApp.html.startSending_dis}
        </AnimatedButton>
      </div>
      {shareMessage && (
        <p className="mt-3 text-sm text-blue-600">{shareMessage}</p>
      )}
    </div>
  );
}
