import { MIN_CACHEABLE_ROOM_ID_LENGTH } from "@/lib/roomIdCache";

/**
 * Tooltip copy for the "save as my room" button.
 *
 * The button has exactly four reachable states, and each one needs its own
 * sentence. Reusing one string for several states is what makes a disabled
 * button read as a bug: the affordance says "do this" while refusing to.
 */
export type SaveCachedIdTooltipKey =
  | "saveTip"
  | "saveTipAlreadySaved"
  | "saveTipOverwrite"
  | "saveTipInRoom";

export type SaveCachedIdReason =
  /** Input is empty or a one-shot short id: nothing worth caching. */
  | "tooShort"
  /** Input already is the saved room: saving would rewrite the same value. */
  | "alreadySaved"
  /** Connected to a room: the room id is about to change under the user. */
  | "inRoom"
  /** A different room id would replace the saved one, and there is no undo. */
  | "willOverwriteSaved"
  /** Nothing saved yet, or the user knowingly chose to replace it. */
  | "saveable";

export interface SaveCachedIdState {
  /** Whether the button is rendered at all. */
  visible: boolean;
  /**
   * Whether the button is non-interactive.
   *
   * A disabled button stays in the layout on purpose. Hiding it would make the
   * row jump the moment the input crosses the cacheable length, and it would
   * throw away the one piece of teaching the row does: that a long room id can
   * be saved at all.
   */
  disabled: boolean;
  reason: SaveCachedIdReason;
  tooltipKey: SaveCachedIdTooltipKey;
}

interface DecideSaveCachedIdOptions {
  /** Current room ID input value. */
  inputValue: string;
  /** Currently saved room ID, if any. */
  cachedId?: string | null;
  /** Whether the panel is currently connected to a room. */
  isInRoom?: boolean;
}

/**
 * Decide how the "save as my room" button renders for the current input.
 *
 * The button has a single, constant meaning: write the input to localStorage.
 * Everything here is about whether that write would do anything, so the same
 * decision drives both the rendered state and the click guard. Deriving the
 * guard separately is how the two drift and how an enabled button ends up
 * writing nothing while reporting success.
 */
export function decideSaveCachedIdState({
  inputValue,
  cachedId,
  isInRoom = false,
}: DecideSaveCachedIdOptions): SaveCachedIdState {
  const trimmedInput = inputValue.trim();

  // Short ids are one-shot rooms created by the backend. Caching one would
  // prefill the receiver input with a room that no longer exists.
  if (trimmedInput.length < MIN_CACHEABLE_ROOM_ID_LENGTH) {
    return hiddenState();
  }

  const trimmedCached = cachedId?.trim() ?? "";

  // A blank cache slot reads as "nothing saved" rather than "everything is
  // already saved", otherwise the button would be permanently disabled.
  if (trimmedCached.length > 0 && trimmedInput === trimmedCached) {
    return {
      visible: true,
      disabled: true,
      reason: "alreadySaved",
      tooltipKey: "saveTipAlreadySaved",
    };
  }

  if (isInRoom) {
    return {
      visible: true,
      disabled: true,
      reason: "inRoom",
      tooltipKey: "saveTipInRoom",
    };
  }

  return {
    visible: true,
    disabled: false,
    reason: trimmedCached.length > 0 ? "willOverwriteSaved" : "saveable",
    tooltipKey: trimmedCached.length > 0 ? "saveTipOverwrite" : "saveTip",
  };
}

function hiddenState(): SaveCachedIdState {
  return {
    visible: false,
    disabled: true,
    reason: "tooShort",
    tooltipKey: "saveTip",
  };
}
