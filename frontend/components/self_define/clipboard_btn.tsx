import React, { useState,useEffect } from 'react';
import { Clipboard, FileText, Check } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { getDictionary } from '@/lib/dictionary';
import { useLocale } from '@/hooks/useLocale';
import type { Messages } from '@/types/messages';
//type==0 --> 剪贴板样式，type!=0 --> 纯文本样式
interface WriteClipboardButtonProps {
  title: string;
  textToCopy: string;
}

interface ReadClipboardButtonProps {
  title: string;
  onRead: (text: string) => void;
}

export const WriteClipboardButton: React.FC<WriteClipboardButtonProps> = ({ title, textToCopy }) => {
  const locale = useLocale();
  const [messages, setMessages] = useState<Messages | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  useEffect(() => {
    getDictionary(locale)
      .then(dict => setMessages(dict))
      .catch(error => console.error('Failed to load messages:', error));
  }, [locale]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };
  if (messages === null) {
    return <div>Loading...</div>;
  }
  return (
    <Button variant="outline" onClick={handleCopy}>
      {isCopied ? (
        <>
          <Check className="w-4 h-4 mr-2" />
          {messages.text.clipboard_btn.Copied_dis}
        </>
      ): (
        <>
        <FileText className="mr-2 h-4 w-4" /> {title}
        </>
      )}
    </Button>
  );
};

export const ReadClipboardButton: React.FC<ReadClipboardButtonProps> = ({ title, onRead }) => {
  const [isReaded, setIsReaded] = useState<boolean>(false);
  const locale = useLocale();
  const [messages, setMessages] = useState<Messages | null>(null);
  useEffect(() => {
    getDictionary(locale)
      .then(dict => setMessages(dict))
      .catch(error => console.error('Failed to load messages:', error));
  }, [locale]);
  const handleRead = async () => {
    try {
      // 尝试读取富文本内容
      const clipboardItems = await navigator.clipboard.read();
      
      for (const clipboardItem of clipboardItems) {
        // 优先尝试读取 HTML 格式
        if (clipboardItem.types.includes('text/html')) {
          const blob = await clipboardItem.getType('text/html');
          const html = await blob.text();
          onRead(html);
          setIsReaded(true);
          setTimeout(() => setIsReaded(false), 2000);
          return;
        }
        
        // 如果没有 HTML 格式，尝试读取富文本格式
        if (clipboardItem.types.includes('text/plain')) {
          const blob = await clipboardItem.getType('text/plain');
          const text = await blob.text();
          // 将换行符转换为 HTML 换行标签
          const formattedText = text.replace(/\n/g, '<br>');
          onRead(formattedText);
          setIsReaded(true);
          setTimeout(() => setIsReaded(false), 2000);
          return;
        }
      }
    } catch (err) {
      // 如果新 API 不支持，回退到传统的 readText 方法
      try {
        const text = await navigator.clipboard.readText();
        const formattedText = text.replace(/\n/g, '<br>');
        onRead(formattedText);
        setIsReaded(true);
        setTimeout(() => setIsReaded(false), 2000);
      } catch (fallbackErr) {
        console.error('Failed to read clipboard: ', fallbackErr);
        onRead('');
      }
    }
  };
  if (messages === null) {
    return <div>Loading...</div>;
  }
  return (
    <Button variant="outline" onClick={handleRead}>
      {isReaded ? (
        <>
          <Check className="w-4 h-4 mr-2" />
          {messages.text.clipboard_btn.Pasted_dis}
        </>
      ) : (
        <>
          <Clipboard className="w-4 h-4 mr-2" /> {title}
        </>
      )}
    </Button>
  );
};