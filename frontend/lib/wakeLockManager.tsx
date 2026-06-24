// When an Android device switches to another app, the screen remains awake, and the WebRTC connection will not be disconnected.
// Note that this will increase the device's power consumption, so it is important to release the wake lock in time when the connection is disconnected.
import { createLogger } from "@/lib/logger";

const logger = createLogger({ scope: "Lib.WakeLockManager" });

export class WakeLockManager {
  private wakeLock: WakeLockSentinel | null = null;
  private isSupported: boolean = false;

  constructor() {
    // Check if the browser supports the Wake Lock API
    this.isSupported =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      "wakeLock" in navigator;
  }

  async requestWakeLock(): Promise<void> {
    if (!this.isSupported) {
      logger.info({
        event: "wake_lock_unsupported",
      });
      return;
    }
    if (document.visibilityState !== "visible") {
      // Only request when the page is visible
      logger.info({
        event: "wake_lock_request_skipped_hidden",
      });
      return;
    }
    try {
      // Request screen wake lock
      this.wakeLock = await navigator.wakeLock.request("screen");

      // Listen for the visibilitychange event and re-request the wake lock when the page becomes visible again
      document.addEventListener(
        "visibilitychange",
        this.handleVisibilityChange
      );
    } catch (err) {
      logger.error({
        event: "wake_lock_request_failed",
        context: { err },
      });
    }
  }

  private handleVisibilityChange = async () => {
    if (document.visibilityState === "visible" && this.wakeLock === null) {
      // When the page becomes visible again, re-request the wake lock
      await this.requestWakeLock();
    }
  };

  async releaseWakeLock(): Promise<void> {
    if (!this.wakeLock) return;

    try {
      await this.wakeLock.release();
      this.wakeLock = null;
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange
      );
    } catch (err) {
      logger.error({
        event: "wake_lock_release_failed",
        context: { err },
      });
    }
  }
}
