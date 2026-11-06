import { describe, expect, it } from "vitest";

import { supportedLocales } from "@/constants/i18n-config";
import { de } from "@/constants/messages/de";
import { en } from "@/constants/messages/en";
import { es } from "@/constants/messages/es";
import { fr } from "@/constants/messages/fr";
import { ja } from "@/constants/messages/ja";
import { ko } from "@/constants/messages/ko";
import { zh } from "@/constants/messages/zh";
import {
  decideSaveCachedIdState,
  type SaveCachedIdTooltipKey,
} from "@/lib/app/cachedIdPresentation";

const localeMessages = { de, en, es, fr, ja, ko, zh } as const;

const SAVED_ROOM = "my-saved-room-id";

function state(overrides: {
  inputValue?: string;
  cachedId?: string | null;
  isInRoom?: boolean;
}) {
  return decideSaveCachedIdState({
    inputValue: overrides.inputValue ?? "",
    cachedId: overrides.cachedId ?? null,
    isInRoom: overrides.isInRoom ?? false,
  });
}

describe("decideSaveCachedIdState", () => {
  it("hides the button when the input holds no cacheable room id", () => {
    // A hidden button must not occupy the row next to Join, and a short id is
    // a one-shot room that must never become the reusable room id.
    expect(state({ inputValue: "" }).visible).toBe(false);
    expect(state({ inputValue: "   " }).visible).toBe(false);
    expect(state({ inputValue: "1234567", cachedId: SAVED_ROOM }).visible).toBe(
      false
    );
    expect(state({ inputValue: "12345678" }).visible).toBe(true);
  });

  it("keeps the button visible but disabled when the input already is my room", () => {
    // This is the reported bug: the input already holds the saved room id, so
    // saving is a no-op. The affordance stays (it teaches that a long id is
    // cacheable and already saved) but it must not be clickable.
    const decision = state({ inputValue: SAVED_ROOM, cachedId: SAVED_ROOM });

    expect(decision.visible).toBe(true);
    expect(decision.disabled).toBe(true);
    expect(decision.reason).toBe("alreadySaved");
    expect(decision.tooltipKey).toBe("saveTipAlreadySaved");
  });

  it("treats surrounding whitespace as the same room id", () => {
    // Users paste ids that often carry a trailing newline or space. Comparing
    // the trimmed values keeps the button disabled instead of flashing an
    // enabled, no-op button that would report a bogus "saved" message.
    const decision = state({
      inputValue: "  " + SAVED_ROOM + "  ",
      cachedId: " " + SAVED_ROOM,
    });

    expect(decision.disabled).toBe(true);
    expect(decision.reason).toBe("alreadySaved");
  });

  it("reports alreadySaved ahead of being connected, because it is the tighter constraint", () => {
    const decision = state({
      inputValue: SAVED_ROOM,
      cachedId: SAVED_ROOM,
      isInRoom: true,
    });

    expect(decision.reason).toBe("alreadySaved");
    expect(decision.disabled).toBe(true);
  });

  it("allows saving a different room id when nothing is saved yet", () => {
    const decision = state({ inputValue: "brand-new-room-id", cachedId: null });

    expect(decision.visible).toBe(true);
    expect(decision.disabled).toBe(false);
    expect(decision.reason).toBe("saveable");
    expect(decision.tooltipKey).toBe("saveTip");
  });

  it("treats a blank cached id as nothing saved", () => {
    const decision = state({
      inputValue: "brand-new-room-id",
      cachedId: "   ",
    });

    expect(decision.reason).toBe("saveable");
    expect(decision.disabled).toBe(false);
  });

  it("warns that saving a different room id replaces the saved one", () => {
    // There is no "forget my room" affordance in the UI, so replacing the
    // saved id is unrecoverable. The button stays enabled (the action is still
    // what the user asked for) but the tooltip must say what it costs.
    const decision = state({
      inputValue: "somebody-elses-room",
      cachedId: SAVED_ROOM,
    });

    expect(decision.visible).toBe(true);
    expect(decision.disabled).toBe(false);
    expect(decision.reason).toBe("willOverwriteSaved");
    expect(decision.tooltipKey).toBe("saveTipOverwrite");
  });

  it("disables saving while connected and explains why instead of lying", () => {
    // A disabled button whose tooltip still says "save it" sends the user
    // hunting for a bug. The tooltip has to match the disabled state.
    const decision = state({
      inputValue: "brand-new-room-id",
      cachedId: null,
      isInRoom: true,
    });

    expect(decision.visible).toBe(true);
    expect(decision.disabled).toBe(true);
    expect(decision.reason).toBe("inRoom");
    expect(decision.tooltipKey).toBe("saveTipInRoom");
  });

  it("prefers the connected-room explanation over the overwrite warning", () => {
    const decision = state({
      inputValue: "somebody-elses-room",
      cachedId: SAVED_ROOM,
      isInRoom: true,
    });

    expect(decision.reason).toBe("inRoom");
    expect(decision.tooltipKey).toBe("saveTipInRoom");
  });

  it("never leaves a visible button enabled with a no-op write", () => {
    // The click handler used to re-derive "already saved" on its own, which is
    // how the rendered state and the write guard could drift apart. This
    // invariant is what keeps a stale cached id from producing an enabled
    // button that writes nothing and reports success.
    const cases = [
      { inputValue: SAVED_ROOM, cachedId: SAVED_ROOM, isInRoom: false },
      { inputValue: " " + SAVED_ROOM + " ", cachedId: SAVED_ROOM, isInRoom: true },
      { inputValue: SAVED_ROOM, cachedId: SAVED_ROOM, isInRoom: true },
    ];

    for (const input of cases) {
      const decision = state(input);
      expect(
        decision.visible && !decision.disabled,
        JSON.stringify(input)
      ).toBe(false);
    }
  });
});

describe("cached id save copy", () => {
  it("ships every save-state tooltip in every supported locale", () => {
    // next-intl throws at render time on a missing key, so a half-translated
    // addition would take the whole tab panel down in production. The type
    // contract in types/messages.ts already catches it at build time; this test
    // keeps the runtime guarantee explicit and names the offending locale.
    const keys: SaveCachedIdTooltipKey[] = [
      "saveTip",
      "saveTipAlreadySaved",
      "saveTipOverwrite",
      "saveTipInRoom",
    ];

    for (const locale of supportedLocales) {
      const cachedId = (localeMessages[locale].text.clipboard as any).cachedId;

      expect(cachedId, locale + " should define clipboard.cachedId").toBeTruthy();
      for (const key of keys) {
        expect(cachedId[key], locale + " should define cachedId." + key).toBeTruthy();
      }
    }
  });
});
