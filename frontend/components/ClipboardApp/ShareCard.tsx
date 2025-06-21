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
        const pngFile = await new Promise<Blob>((resolve) =>
          canvas.toBlob((blob) => resolve(blob!), "image/png")
        );
        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": pngFile,
          }),
        ]);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      };
      img.src = "data:image/svg+xml;base64," + btoa(svgData);
    } catch (err) {
      console.error("Failed to copy QR code: ", err);
      alert("Failed to copy QR code. Please try again.");
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
    <div className="bg-blue-100 p-4 rounded-md">
      <p className="text-blue-700 mb-4">{messages.text.RetrieveMethod.P}</p>

      {/* Use flex-col instead of list for better control on mobile layout */}
      <div className="flex flex-col space-y-4">
        {/* RoomID section */}
        <div className="flex flex-col space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span>{messages.text.RetrieveMethod.RoomId_tips + RoomID}</span>
            <WriteClipboardButton
              title={messages.text.RetrieveMethod.copyRoomId_tips}
              textToCopy={RoomID}
            />
          </div>
        </div>

        {/* URL section */}
        <div className="flex flex-col space-y-2">
          <div className="break-all">
            {messages.text.RetrieveMethod.url_tips + shareLink}
          </div>
          <div className="flex flex-wrap gap-2">
            <WriteClipboardButton
              title={messages.text.RetrieveMethod.copyUrl_tips}
              textToCopy={shareLink}
            />
          </div>
        </div>

        {/* QR Code section */}
        <div className="flex flex-col space-y-2">
          <div>{messages.text.RetrieveMethod.scanQR_tips}</div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={copyToClipboard}
              variant="outline"
              className="w-full sm:w-auto"
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  {messages.text.RetrieveMethod.Copied_dis}
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />{" "}
                  {messages.text.RetrieveMethod.Copy_QR_dis}
                </>
              )}
            </Button>
            <Button
              onClick={downloadQRCode}
              variant="outline"
              className="w-full sm:w-auto"
            >
              <Download className="mr-2 h-4 w-4" />{" "}
              {messages.text.RetrieveMethod.download_QR_dis}
            </Button>
          </div>
        </div>
      </div>

      {/* QR Code display area */}
      <div className="mt-4 flex justify-center">
        <div className="inline-block border-2 p-4 bg-white rounded-lg">
          <div ref={qrRef}>
            <QRCodeSVG value={shareLink} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareCard;
