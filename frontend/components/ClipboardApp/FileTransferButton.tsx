import React, { useState, useEffect } from "react";
import { useMessages } from "@/components/providers/TranslationProvider";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FileTransferButtonProps {
  onRequest: () => void;
  onSave?: () => void; // 新增：处理手动保存
  isCurrentFileTransferring: boolean;
  isOtherFileTransferring: boolean;
  isSavedToDisk: boolean;
  isPendingSave?: boolean; // 新增：是否待保存状态
}
// Manage buttons for different download statuses
const FileTransferButton = ({
  onRequest,
  onSave,
  isCurrentFileTransferring,
  isOtherFileTransferring,
  isSavedToDisk,
  isPendingSave = false,
}: FileTransferButtonProps) => {
  const messages = useMessages();
  // Button status judgment - 待保存状态时按钮应该可点击
  const isDisabled =
    isCurrentFileTransferring ||
    isSavedToDisk ||
    (isOtherFileTransferring && !isPendingSave);

  // Display different tooltips based on status
  const getTooltipContent = () => {
    if (isSavedToDisk)
      return messages!.text.FileTransferButton.savedToDiskTip;
    if (isCurrentFileTransferring)
      return messages!.text.FileTransferButton.currentFileTransferringTip;
    if (isPendingSave)
      return messages!.text.FileTransferButton.pendingSaveTip;
    if (isOtherFileTransferring)
      return messages!.text.FileTransferButton.otherFileTransferringTip;
    return messages!.text.FileTransferButton.downloadTip;
  };

  // Set different button styles and class names based on status
  const getButtonStyles = () => {
    if (isSavedToDisk) {
      return {
        variant: "ghost" as const,
        className: "mr-2 text-muted-foreground",
      };
    }
    if (isCurrentFileTransferring) {
      return {
        variant: "outline" as const,
        className: "mr-2 cursor-not-allowed",
      };
    }
    if (isPendingSave) {
      return {
        variant: "default" as const,
        className: "mr-2",
      };
    }
    if (isOtherFileTransferring) {
      return {
        variant: "outline" as const,
        className: "mr-2 cursor-not-allowed bg-muted text-muted-foreground",
      };
    }
    return {
      variant: "outline" as const,
      className: "mr-2 hover:bg-accent",
    };
  };

  const buttonStyles = getButtonStyles();
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block">
            <Button
              onClick={isPendingSave && onSave ? onSave : onRequest}
              variant={buttonStyles.variant}
              size="sm"
              className={buttonStyles.className}
              disabled={isDisabled}
            >
              <Download
                className={`mr-2 h-4 w-4 ${
                  isOtherFileTransferring && !isPendingSave ? "opacity-50" : ""
                }`}
              />
              {isSavedToDisk
                ? messages.text.FileTransferButton.savedLabel
                : isPendingSave
                ? messages.text.FileTransferButton.saveLabel
                : isOtherFileTransferring
                ? messages.text.FileTransferButton.waitingLabel
                : messages.text.FileTransferButton.downloadLabel}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="px-3 py-2 rounded-md text-sm">
          {getTooltipContent()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default FileTransferButton;
