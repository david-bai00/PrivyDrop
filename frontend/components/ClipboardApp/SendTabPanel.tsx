import React from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import RichTextEditor from '@/components/Editor/RichTextEditor';
import { ReadClipboardButton, WriteClipboardButton } from '@/components/self_define/clipboard_btn';
import { FileUploadHandler } from '@/components/self_define/file-upload-handler';
import FileListDisplay from '@/components/self_define/FileListDisplay';
import AnimatedButton from '@/components/self_define/AnimatedButton';
import type { Messages } from '@/types/messages';
import type { CustomFile, FileMeta } from '@/lib/types/file';
import type { ProgressState } from '@/hooks/useWebRTCConnection'; // 假设此类型已导出
import type WebRTC_Initiator from '@/lib/webrtc_Initiator';

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
  shareRoomId: string;
  checkAndSetShareRoomId: (roomId: string) => void;
  joinRoom: (isSender: boolean, roomId: string) => void;
  generateShareLinkAndBroadcast: () => void;
  sender: WebRTC_Initiator | null;
  shareMessage: string;
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
  shareRoomId,
  checkAndSetShareRoomId,
  joinRoom,
  generateShareLinkAndBroadcast,
  sender,
  shareMessage,
}: SendTabPanelProps) {
  return (
    <div id="send-panel" role="tabpanel" aria-labelledby="send-tab">
      <div className="mb-3 text-sm text-gray-600">
        {shareRoomStatusText || (sender && sender.isInRoom ? messages.text.ClipboardApp.roomStatus.onlyOneMsg : messages.text.ClipboardApp.roomStatus.senderEmptyMsg)}
      </div>
      <RichTextEditor
        value={shareContent}
        onChange={updateShareContent}
      />
      <div className="flex flex-wrap gap-2 my-3">
        <ReadClipboardButton title={messages.text.ClipboardApp.html.Paste_dis} onRead={updateShareContent} />
        <WriteClipboardButton title={messages.text.ClipboardApp.html.Copy_dis} textToCopy={richTextToPlainText(shareContent)} />
      </div>
      <div className="mb-3">
        <FileUploadHandler onFilePicked={addFilesToSend} messages={messages} />
        <FileListDisplay
          mode="sender"
          files={sendFiles}
          fileProgresses={sendProgress}
          onDelete={removeFileToSend}
          messages={messages}
        />
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-2 mb-3">
        <span className="text-sm whitespace-nowrap">{messages.text.ClipboardApp.html.inputRoomId_tips}</span>
        <Input
          aria-label="Share Room ID"
          value={shareRoomId}
          onChange={(e) => checkAndSetShareRoomId(e.target.value)}
          onPaste={(e) => checkAndSetShareRoomId(e.clipboardData.getData('text'))}
          className="flex-grow min-w-0"
        />
        <Button className="w-full sm:w-auto"
          onClick={() => joinRoom(true, shareRoomId)}
          disabled={!sender || sender.isInRoom || !shareRoomId.trim()}
        >{messages.text.ClipboardApp.html.joinRoom_dis}</Button>
      </div>
      <div className="flex">
        <AnimatedButton
          className="w-full"
          onClick={generateShareLinkAndBroadcast}
          loadingText={messages.text.ClipboardApp.html.startSending_loadingText}
          disabled={!sender || !sender.isInRoom || (sendFiles.length === 0 && shareContent.trim() === '')}
        >
          {messages.text.ClipboardApp.html.startSending_dis}
        </AnimatedButton>
      </div>
      {shareMessage && <p className="mt-3 text-sm text-blue-600">{shareMessage}</p>}
    </div>
  );
}