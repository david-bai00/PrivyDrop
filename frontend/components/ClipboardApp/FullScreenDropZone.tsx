import React from "react";
import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";

interface FullScreenDropZoneProps {
  isDragging: boolean;
}

const FullScreenDropZone: React.FC<FullScreenDropZoneProps> = ({ isDragging }) => {
  const t = useTranslations("text.fileUploadHandler");

  if (!isDragging) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
      <Upload className="h-24 w-24 text-white animate-bounce" />
      <p className="mt-6 text-2xl font-bold text-white">{t("dragTip")}</p>
    </div>
  );
};

export default FullScreenDropZone;
