/**
 * 🚀 File transfer module unified export
 * Provides modular file transfer services
 */

// Configuration management
export { TransferConfig } from "./TransferConfig";

// State management
export { StateManager } from "./StateManager";

// High-performance file reading
export { StreamingFileReader } from "./StreamingFileReader";
export type { NetworkChunk } from "./StreamingFileReader";

// Network transmission
export { NetworkTransmitter } from "./NetworkTransmitter";

// Message handling
export { MessageHandler } from "./MessageHandler";
export type { MessageHandlerDelegate } from "./MessageHandler";

// Progress tracking
export { ProgressTracker } from "./ProgressTracker";
export type { ProgressCallback } from "./ProgressTracker";

// Main orchestrator
export { FileTransferOrchestrator } from "./FileTransferOrchestrator";

/**
 * 🎯 Convenience creation function - Quick initialization of file transfer services
 */
import WebRTC_Initiator from "../webrtc_Initiator";
import { FileTransferOrchestrator } from "./FileTransferOrchestrator";

export function createFileTransferService(
  webrtcConnection: WebRTC_Initiator
): FileTransferOrchestrator {
  return new FileTransferOrchestrator(webrtcConnection);
}
