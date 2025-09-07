// 🚀 New process - Receiver-initiated file transfer
// Refactored FileSender - Using modular architecture

import WebRTC_Initiator from "./webrtc_Initiator";
import { CustomFile } from "@/types/webrtc";
import { FileTransferOrchestrator } from "./transfer/FileTransferOrchestrator";

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

  public sendFileMeta(files: CustomFile[], peerId?: string): void {
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

  public cleanup(): void {
    return this.orchestrator.cleanup();
  }
}

export default FileSender;
