//弹窗会在满足条件时自动弹出，并确保只弹出一次
'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface AutoPopupDialogProps {
  // 用于localStorage的唯一标识
  storageKey: string;
  // 弹窗标题
  title: string;
  // 弹窗描述内容
  description: string;
  // 触发弹窗的条件函数
  condition?: () => boolean;
}

export function AutoPopupDialog({
  storageKey,
  title,
  description,
  condition = () => true,
}: AutoPopupDialogProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // 检查是否已经显示过
    const hasShown = localStorage.getItem(storageKey);//localStorage 是一种 Web Storage 技术，允许浏览器在客户端本地存储数据。它可以存储键值对（key-value），并且这些数据在页面刷新、浏览器重启后仍然存在，直到手动删除或通过代码清除。
    
    if (!hasShown && condition()) {
      setOpen(true);
      // 标记为已显示
      localStorage.setItem(storageKey, 'true');
    }
  }, [storageKey, condition]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
          <DialogDescription className="mt-2 text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
