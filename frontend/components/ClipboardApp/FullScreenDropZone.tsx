import React from "react";
import { Upload } from "lucide-react";
import type { Messages } from "@/types/messages";

interface FullScreenDropZoneProps {
  isDragging: boolean;
  messages: Messages;
}

const FullScreenDropZone: React.FC<FullScreenDropZoneProps> = ({
  isDragging,
  messages,
}) => {
  if (!isDragging) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
      <Upload className="h-24 w-24 text-white animate-bounce" />
      <p className="mt-6 text-2xl font-bold text-white">
        {messages.text.fileUploadHandler.Drag_tips}
      </p>
    </div>
  );
};

export default FullScreenDropZone;
