import React, { useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Copy, Download, Check } from "lucide-react";
import { WriteClipboardButton } from "../common/clipboard_btn";
interface ShareCardProps {
  RoomID: string;
  shareLink: string;
}
const QRCodeSVG = dynamic(
  () => import("qrcode.react").then((mod) => mod.QRCodeSVG),
  {
    ssr: false,
    loading: () => (
      <div className="w-[128px] h-[128px] bg-gray-200 animate-pulse rounded-lg"></div>
    ),
  }
);
const ShareCard: React.FC<ShareCardProps> = ({ RoomID, shareLink }) => {
  const t = useTranslations("text.retrieveMethod");
  const qrRef = useRef<HTMLDivElement>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = async () => {
    if (!qrRef.current) return;

    // Check for Clipboard API support for images
    if (
      !navigator.clipboard ||
      !navigator.clipboard.write ||
      !window.ClipboardItem
    ) {
      console.warn(
        "Clipboard API for images not supported. Falling back to download."
      );
      downloadQRCode();
      return;
    }

    try {
      const svgElement = qrRef.current.querySelector("svg");
      if (!svgElement) return;

      const svgData = new XMLSerializer().serializeToString(svgElement);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.onload = async () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const pngBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png")
        );

        if (pngBlob) {
          await navigator.clipboard.write([
            new ClipboardItem({
              "image/png": pngBlob,
            }),
          ]);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        } else {
          throw new Error("Canvas to Blob conversion failed");
        }
      };
      img.onerror = () => {
        // If image loading fails, fall back to download
        console.error(
          "Image loading for QR code failed. Falling back to download."
        );
        downloadQRCode();
      };
      img.src = "data:image/svg+xml;base64," + btoa(svgData);
    } catch (err) {
      console.error("Failed to copy QR code, falling back to download: ", err);
      downloadQRCode(); // Fallback to download on any error
    }
  };
  const downloadQRCode = () => {
    if (!qrRef.current) return;

    const svgElement = qrRef.current.querySelector("svg");
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = "qrcode.png";
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };
  return (
    <div className="bg-primary/10 p-2 sm:p-4 rounded-lg border border-primary/20">
      <p className="text-primary mb-3 sm:mb-4 text-sm sm:text-base">
        {t("intro")}
      </p>
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-sm font-medium">{t("roomIdTip")}</span>
          <div className="flex items-center gap-2 flex-1">
            <Input value={RoomID} readOnly className="font-mono text-sm" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(RoomID)}
              title={t("copyRoomId")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-sm font-medium">{t("urlTip")}</span>
          <div className="flex items-center gap-2 flex-1">
            <Input value={shareLink} readOnly className="font-mono text-sm" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(shareLink)}
              title={t("copyUrl")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-center text-muted-foreground pt-2">
          {t("scanQr")}
        </p>
        <div className="flex justify-center">
          <div className="inline-block border-2 p-2 sm:p-4 bg-muted rounded-lg">
            <div ref={qrRef}>
              <QRCodeSVG
                value={shareLink}
                size={120}
                className="sm:w-32 sm:h-32"
              />
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-center gap-2 mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={copyToClipboard}
          className="flex items-center gap-2"
        >
          {isCopied ? (
            <>
              <Check className="h-4 w-4" />
              {t("copied")}
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              {t("copyQr")}
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadQRCode}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          {t("downloadQr")}
        </Button>
      </div>
    </div>
  );
};

export default ShareCard;
