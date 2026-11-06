import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import Tooltip from "@/components/Tooltip";

type Props = {
  /** Writes the cached room ID into the input field. Never connects. */
  onUse: () => void;
  className?: string;
  disabled?: boolean;
};

/**
 * Fill the room ID input from the local cache.
 *
 * This button has a single, constant meaning: write the cached ID into the
 * input field. It deliberately performs no network side effect - joining the
 * room stays an explicit action behind the "Join room" button.
 */
export function UseCachedIdButton({
  onUse,
  className = "w-full sm:w-auto px-4",
  disabled = false,
}: Props) {
  const tCachedId = useTranslations("text.clipboard.cachedId");

  return (
    <Tooltip content={tCachedId("useTip")}>
      <span className="inline-block">
        <Button
          variant="outline"
          className={className}
          onClick={onUse}
          disabled={disabled}
        >
          {tCachedId("use")}
        </Button>
      </span>
    </Tooltip>
  );
}
