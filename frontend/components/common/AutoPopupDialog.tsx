// The pop-up dialog will appear automatically when conditions are met, and ensures it only appears once.
"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface AutoPopupDialogProps {
  // Unique identifier for localStorage
  storageKey: string;
  // Dialog title
  title: string;
  // Dialog description content
  description: string;
  // Condition function to trigger the dialog
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
    // Check if it has been shown before using localStorage
    const hasShown = localStorage.getItem(storageKey);

    if (!hasShown && condition()) {
      setOpen(true);
      // Mark as shown
      localStorage.setItem(storageKey, "true");
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
