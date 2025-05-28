import React, { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import RichTextEditor from "@/components/Editor/RichTextEditor";
import {
  ReadClipboardButton,
  WriteClipboardButton,
} from "@/components/self_define/clipboard_btn";
import { FileUploadHandler } from "@/components/self_define/file-upload-handler";
import FileListDisplay from "@/components/self_define/FileListDisplay";
import AnimatedButton from "@/components/self_define/AnimatedButton";
import type { Messages } from "@/types/messages";
import type { CustomFile, FileMeta } from "@/lib/types/file";
import type { ProgressState } from "@/hooks/useWebRTCConnection";
import type WebRTC_Initiator from "@/lib/webrtc_Initiator";

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
  // shareRoomId: string; // 这个是从 useRoomManager 来的，代表已验证的ID
  processRoomIdInput: (roomId: string) => void; // 从 useRoomManager 传入
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
  // 本地状态，用于输入框的即时响应
  const [inputFieldValue, setInputFieldValue] = useState<string>(
    currentValidatedShareRoomId
  );

  // 当来自父组件的 validatedShareRoomId 改变时（例如，初始获取后），同步本地输入框的值
  useEffect(() => {
    setInputFieldValue(currentValidatedShareRoomId);
  }, [currentValidatedShareRoomId]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputFieldValue(newValue); // 立即更新输入框显示
      processRoomIdInput(newValue); // 调用hook中的处理函数，它会进行防抖验证
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
          value={inputFieldValue} // 绑定到本地状态
          onChange={handleInputChange}
          onPaste={handlePaste}
          className="flex-grow min-w-0"
          // placeholder={
          //   // messages.text.ClipboardApp.html.roomIdInput_placeholder ||
          //   "输入房间号或粘贴"
          // }
        />
        <Button
          className="w-full sm:w-auto"
          onClick={() => joinRoom(true, inputFieldValue.trim())} // 使用当前输入框的值尝试加入
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
          } // 确保有已验证的房间ID才可分享
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
