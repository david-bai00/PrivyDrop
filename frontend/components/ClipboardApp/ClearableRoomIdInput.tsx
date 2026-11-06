import React, { useRef } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Localized label used for the inline clear affordance. */
  clearLabel: string;
  /** Localized/accessible name of the text field. */
  inputAriaLabel: string;
  placeholder?: string;
  /** Stable hook for e2e selectors. */
  inputTestId?: string;
  /** Stable hook for the inline clear button. */
  clearTestId?: string;
  onPaste?: React.ClipboardEventHandler<HTMLInputElement>;
  disabled?: boolean;
  className?: string;
};

/**
 * Controlled room ID input with an inline clear (X) affordance.
 *
 * Purely local: clearing only empties the controlled value. It never touches
 * the cached room ID and never triggers any connection behaviour.
 */
export function ClearableRoomIdInput({
  value,
  onChange,
  clearLabel,
  inputAriaLabel,
  placeholder,
  inputTestId,
  clearTestId,
  onPaste,
  disabled,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = () => {
    onChange("");
    // Keep the caret in the field so "clear, then type" stays a single gesture.
    inputRef.current?.focus();
  };

  return (
    <div className="relative flex-1 min-w-0">
      <Input
        ref={inputRef}
        aria-label={inputAriaLabel}
        data-testid={inputTestId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        placeholder={placeholder}
        disabled={disabled}
        className={cn("pr-9", className)}
      />
      {value.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={clearLabel}
          title={clearLabel}
          data-testid={clearTestId}
          disabled={disabled}
          onClick={handleClear}
          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
