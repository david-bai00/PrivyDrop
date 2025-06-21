import React, { useState,useEffect} from 'react';
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getDictionary } from '@/lib/dictionary';
import { useLocale } from '@/hooks/useLocale';
import type { Messages } from '@/types/messages';

interface FileTransferButtonProps {
  onRequest: () => void;
  isCurrentFileTransferring: boolean;
  isOtherFileTransferring: boolean;
  isSavedToDisk: boolean;
}
// Manage buttons for different download statuses
const FileTransferButton = ({
  onRequest,
  isCurrentFileTransferring,
  isOtherFileTransferring,
  isSavedToDisk
}: FileTransferButtonProps) => {
  const locale = useLocale();
  const [messages, setMessages] = useState<Messages | null>(null);
  // Button status judgment
  const isDisabled = isCurrentFileTransferring || isSavedToDisk || isOtherFileTransferring;

  useEffect(() => {
    getDictionary(locale)
      .then(dict => setMessages(dict))
      .catch(error => console.error('Failed to load messages:', error));
  }, [locale]);
  // Display different tooltips based on status
  const getTooltipContent = () => {
    if (isSavedToDisk) return messages!.text.FileTransferButton.SavedToDisk_tips;
    if (isCurrentFileTransferring) return messages!.text.FileTransferButton.CurrentFileTransferring_tips;
    if (isOtherFileTransferring) return messages!.text.FileTransferButton.OtherFileTransferring_tips;
    return messages!.text.FileTransferButton.download_tips;
  };

  // Set different button styles and class names based on status
  const getButtonStyles = () => {
    if (isSavedToDisk) {
      return {
        variant: "ghost" as const,
        className: "mr-2 text-gray-500"
      };
    }
    if (isCurrentFileTransferring) {
      return {
        variant: "outline" as const,
        className: "mr-2 cursor-not-allowed"
      };
    }
    if (isOtherFileTransferring) {
      return {
        variant: "outline" as const,
        className: "mr-2 cursor-not-allowed bg-gray-100 border-gray-300 text-gray-500"
      };
    }
    return {
      variant: "outline" as const,
      className: "mr-2 hover:bg-blue-50"
    };
  };

  const buttonStyles = getButtonStyles();
  if (messages === null) {
    return <div>Loading...</div>;
  }
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block">
            <Button 
                onClick={onRequest} 
                variant={buttonStyles.variant}
                size="sm"
                className={buttonStyles.className}
                disabled={isDisabled}
            >
              <Download className={`mr-2 h-4 w-4 ${isOtherFileTransferring ? 'opacity-50' : ''}`} />
              {isSavedToDisk ? messages.text.FileTransferButton.Saved_dis : 
               isOtherFileTransferring ? messages.text.FileTransferButton.Waiting_dis : 
               messages.text.FileTransferButton.Download_dis}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          className="bg-gray-800 text-white px-3 py-2 rounded-md text-sm"
        >
          {getTooltipContent()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default FileTransferButton;