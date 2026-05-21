import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CachedIdActionButton from "@/components/ClipboardApp/CachedIdActionButton";
import { ClipboardSideMessage } from "@/components/ClipboardApp/ClipboardSideMessage";
import { getSenderRoomStatusText } from "@/lib/app/roomPresentation";
import { setSenderRoomSelection } from "@/lib/app/WebRTCStoreCoordinator";
import {
  ReadClipboardButton,
  WriteClipboardButton,
} from "@/components/common/clipboard_btn";
import { FileUploadHandler } from "@/components/ClipboardApp/FileUploadHandler";
import FileListDisplay from "@/components/ClipboardApp/FileListDisplay";
import AnimatedButton from "@/components/ui/AnimatedButton";
import type { CustomFile, FileMeta } from "@/types/webrtc";
import { useClipboardAppMessageDispatcher } from "@/hooks/useClipboardAppMessages";

import { useFileTransferStore } from "@/stores/fileTransferStore";

// Dynamically import the RichTextEditor
const RichTextEditor = dynamic(
  () => import("@/components/Editor/RichTextEditor"),
  {
    ssr: false, // This component is client-side only
    loading: () => (
      <div className="p-4 border rounded-lg min-h-[200px] md:min-h-[400px] bg-muted flex items-center justify-center">
        Loading Editor...
      </div>
    ),
  }
);

interface SendTabPanelProps {
  updateShareContent: (content: string) => void;
  addFilesToSend: (files: CustomFile[]) => void;
  removeFileToSend: (meta: FileMeta) => void;
  richTextToPlainText: (html: string) => string;
  processRoomIdInput: (roomId: string) => void; // Passed from useRoomManager
  joinRoom: (isSender: boolean, roomId: string) => void;
  generateShareLinkAndBroadcast: () => void;
  currentValidatedShareRoomId: string;
  handleLeaveSenderRoom: () => void; // New prop for leaving room
}

export function SendTabPanel({
  updateShareContent,
  addFilesToSend,
  removeFileToSend,
  richTextToPlainText,
  processRoomIdInput,
  joinRoom,
  generateShareLinkAndBroadcast,
  currentValidatedShareRoomId,
  handleLeaveSenderRoom,
}: SendTabPanelProps) {
  const tActions = useTranslations("text.clipboard.actions");
  const tPlaceholders = useTranslations("text.clipboard.placeholders");
  const tGenerateId = useTranslations("text.clipboard.generateId");
  const tTitles = useTranslations("text.clipboard.titles");
  const tStatus = useTranslations("text.clipboard.status");
  const tCommon = useTranslations("text.common");
  const showSenderMessage = useClipboardAppMessageDispatcher("sender");
  // Get the status from the store
  const {
    senderDraftContent: shareContent,
    senderDraftFiles: sendFiles,
    isSenderPayloadDirty,
    sendProgress,
    isAnyFileTransferring,
    isSenderInRoom,
    sharePeerCount,
  } = useFileTransferStore();
  // Local state for immediate response in the input field
  const [inputFieldValue, setInputFieldValue] = useState<string>(
    currentValidatedShareRoomId
  );
  // State to track ID generation mode (false = will show simple next, true = will show random next)
  const [isSimpleIdMode, setIsSimpleIdMode] = useState<boolean>(true);

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
          setSenderRoomSelection(simpleRoomId, { markAsInitial: true });
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

  const shareRoomStatusText = useMemo(
    () =>
      getSenderRoomStatusText({
        isInRoom: isSenderInRoom,
        peerCount: sharePeerCount,
        roomEmptyLabel: tStatus("roomEmpty"),
        onlyOneLabel: tStatus("onlyOne"),
        peopleCountLabel: (peerCount) =>
          tStatus("peopleCount", { peerCount }),
      }),
    [isSenderInRoom, sharePeerCount, tStatus]
  );
  const hasSenderDraftPayload =
    sendFiles.length > 0 || shareContent.trim() !== "";
  const canSyncClearedPayload =
    !hasSenderDraftPayload && isSenderPayloadDirty;

  return (
    <div
      id="send-panel"
      role="tabpanel"
      aria-labelledby="send-tab"
      data-testid="send-panel"
    >
      <div
        className="mb-3 text-sm text-muted-foreground"
        data-testid="sender-room-status"
      >
        {shareRoomStatusText}
      </div>
      <RichTextEditor value={shareContent} onChange={updateShareContent} />
      <div className="flex flex-col sm:flex-row gap-2 my-3">
        <ReadClipboardButton
          title={tCommon("buttons.paste")}
          onRead={updateShareContent}
        />
        <WriteClipboardButton
          title={tCommon("buttons.copy")}
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
          <p className="text-sm text-muted-foreground">
            {tTitles("share")}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              aria-label="Share Room ID"
              data-testid="sender-room-id-input"
              value={inputFieldValue}
              onChange={handleInputChange}
              onPaste={handlePaste}
              className="flex-1 min-w-0"
              placeholder={tPlaceholders("roomId")}
            />
            <Button
              variant="outline"
              className="w-full sm:w-auto px-4"
              onClick={handleIdGeneration}
              disabled={isSenderInRoom}
            >
              {isSimpleIdMode
                ? tGenerateId("random")
                : tGenerateId("simple")}
            </Button>
            {/* Save/Use Cached ID Button in between */}
            <CachedIdActionButton
              getInputValue={() => inputFieldValue}
              setInputValue={setInputFieldValue}
              showMessage={showSenderMessage}
              disabled={isSenderInRoom}
              onUseCached={(id) => {
                // Immediately join as sender after applying cached ID
                joinRoom(true, id.trim());
              }}
            />
            <Button
              className="w-full sm:w-auto px-4"
              onClick={() => joinRoom(true, inputFieldValue.trim())}
              disabled={isSenderInRoom || !inputFieldValue.trim()}
              data-testid="sender-join-room-button"
            >
              {tCommon("buttons.joinRoom")}
            </Button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2">
          <AnimatedButton
            className="flex-1 order-1"
            onClick={generateShareLinkAndBroadcast}
            loadingText={tActions("syncLoading")}
            data-testid="sender-sync-button"
            disabled={
              !isSenderInRoom ||
              (!hasSenderDraftPayload && !canSyncClearedPayload) ||
              !currentValidatedShareRoomId.trim() ||
              isAnyFileTransferring
            }
          >
            {tActions("sync")}
          </AnimatedButton>
          <Button
            variant={isAnyFileTransferring ? "destructive" : "outline"}
            onClick={handleLeaveSenderRoom}
            disabled={!isSenderInRoom}
            className="w-full sm:w-auto px-4 order-2"
            data-testid="sender-leave-room-button"
          >
            {isAnyFileTransferring
              ? tCommon("buttons.leaveRoom") + " ⚠️"
              : tCommon("buttons.leaveRoom")}
          </Button>
        </div>
      </div>
      <ClipboardSideMessage side="sender" />
    </div>
  );
}
