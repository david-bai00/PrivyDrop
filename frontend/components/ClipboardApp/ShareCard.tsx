import React, { useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Copy, Download, Check } from "lucide-react";
import { WriteClipboardButton } from "../common/clipboard_btn";

import { getDictionary } from "@/lib/dictionary";
import { useLocale } from "@/hooks/useLocale";
import type { Messages } from "@/types/messages";
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
  const locale = useLocale();
  const [messages, setMessages] = useState<Messages | null>(null);
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
  useEffect(() => {
    getDictionary(locale)
      .then((dict) => setMessages(dict))
      .catch((error) => console.error("Failed to load messages:", error));
  }, [locale]);

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
  if (messages === null) {
    return <div>Loading...</div>;
  }
  return (
    <div className="bg-blue-50 p-2 sm:p-4 rounded-lg border border-blue-200">
      <p className="text-blue-700 mb-3 sm:mb-4 text-sm sm:text-base">
        {messages.text.RetrieveMethod.P}
      </p>

      {/* Mobile-first responsive layout */}
      <div className="space-y-3 sm:space-y-4">
        {/* RoomID section */}
        <div className="bg-white p-2 sm:p-3 rounded-lg border border-blue-100">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">
              {messages.text.RetrieveMethod.RoomId_tips}
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <code className="flex-1 bg-gray-100 px-2 py-1 rounded text-sm font-mono break-all">
                {RoomID}
              </code>
              <WriteClipboardButton
                title={messages.text.RetrieveMethod.copyRoomId_tips}
                textToCopy={RoomID}
              />
            </div>
          </div>
        </div>

        {/* URL section */}
        <div className="bg-white p-2 sm:p-3 rounded-lg border border-blue-100">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">
              {messages.text.RetrieveMethod.url_tips}
            </p>
            <div className="bg-gray-100 px-2 py-2 rounded text-xs sm:text-sm break-all font-mono">
              {shareLink}
            </div>
            <div className="flex justify-start">
              <WriteClipboardButton
                title={messages.text.RetrieveMethod.copyUrl_tips}
                textToCopy={shareLink}
              />
            </div>
          </div>
        </div>

        {/* QR Code section */}
        <div className="bg-white p-2 sm:p-3 rounded-lg border border-blue-100">
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">
              {messages.text.RetrieveMethod.scanQR_tips}
            </p>

            {/* QR Code display area - moved up for better mobile UX */}
            <div className="flex justify-center">
              <div className="inline-block border-2 p-2 sm:p-4 bg-gray-50 rounded-lg">
                <div ref={qrRef}>
                  <QRCodeSVG
                    value={shareLink}
                    size={120}
                    className="sm:w-32 sm:h-32"
                  />
                </div>
              </div>
            </div>

            {/* QR Code action buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                onClick={copyToClipboard}
                variant="outline"
                size="sm"
                className="w-full"
              >
                {isCopied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    {messages.text.RetrieveMethod.Copied_dis}
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    {messages.text.RetrieveMethod.Copy_QR_dis}
                  </>
                )}
              </Button>
              <Button
                onClick={downloadQRCode}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <Download className="mr-2 h-4 w-4" />
                {messages.text.RetrieveMethod.download_QR_dis}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareCard;
