// 🚀 New process - Receiver-initiated file transfer
// Refactored FileSender - Using modular architecture

import WebRTC_Initiator from "./webrtc_Initiator";
import { CustomFile } from "@/types/webrtc";
import { FileTransferOrchestrator } from "./transfer/FileTransferOrchestrator";
import {
  SenderShutdownAction,
  getSenderShutdownPolicy,
} from "./transfer/senderShutdown";

/**
 * 🚀 FileSender - Backward compatible wrapper layer
 *
 * Refactoring notes:
 * - Original 875-line monolithic class refactored into modular architecture
 * - Internally uses FileTransferOrchestrator for unified orchestration
 * - Maintains 100% backward compatible public API
 * - Gains advantages such as high-performance file reading and intelligent backpressure control
 */
class FileSender {
  private orchestrator: FileTransferOrchestrator;

  constructor(webrtcConnection: WebRTC_Initiator) {
    this.orchestrator = new FileTransferOrchestrator(webrtcConnection);
    console.log("[FileSender] ✅ Initialized with modular architecture");
  }

  public async sendFileMeta(
    files: CustomFile[],
    peerId?: string
  ): Promise<void> {
    return this.orchestrator.sendFileMeta(files, peerId);
  }

  public async sendString(content: string, peerId: string): Promise<void> {
    return this.orchestrator.sendString(content, peerId);
  }

  public setProgressCallback(
    callback: (fileId: string, progress: number, speed: number) => void,
    peerId: string
  ): void {
    return this.orchestrator.setProgressCallback(callback, peerId);
  }

  public getTransferStats(peerId?: string) {
    return this.orchestrator.getTransferStats(peerId);
  }

  public handlePeerReconnection(peerId: string): void {
    this.orchestrator.handlePeerReconnection(peerId);
    console.log(`[FileSender] Handled peer reconnection for ${peerId}`);
  }

  public shutdown(action: SenderShutdownAction): void {
    const policy = getSenderShutdownPolicy(action);

    if (policy.clearTransferState) {
      this.orchestrator.cleanup();
    }

    console.log(`[FileSender] Shutdown completed with action ${action}`);
  }

  public cleanup(): void {
    return this.shutdown("cleanup");
  }
}

export default FileSender;
