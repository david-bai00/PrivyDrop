/**
 * 🚀 File receive module unified export
 * Provides modular file reception services
 */

// Configuration management
export { ReceptionConfig } from "./ReceptionConfig";

// State management
export { ReceptionStateManager } from "./ReceptionStateManager";
export type { ActiveFileReception } from "./ReceptionStateManager";

// Data processing
export { ChunkProcessor } from "./ChunkProcessor";
export type { ChunkProcessingResult } from "./ChunkProcessor";

// File writing
export { StreamingFileWriter, SequencedDiskWriter } from "./StreamingFileWriter";

// File assembly
export { FileAssembler } from "./FileAssembler";
export type { FileAssemblyResult } from "./FileAssembler";

// Message processing
export { MessageProcessor } from "./MessageProcessor";
export type { MessageProcessorDelegate } from "./MessageProcessor";

// Progress reporting
export { ProgressReporter } from "./ProgressReporter";
export type { ProgressCallback, ProgressStats } from "./ProgressReporter";

// Main orchestrator
export { FileReceiveOrchestrator } from "./FileReceiveOrchestrator";

/**
 * 🎯 Convenience creation function - Quick initialization of file receive services
 */
import WebRTC_Recipient from "../webrtc_Recipient";
import { FileReceiveOrchestrator } from "./FileReceiveOrchestrator";

export function createFileReceiveService(
  webrtcConnection: WebRTC_Recipient
): FileReceiveOrchestrator {
  return new FileReceiveOrchestrator(webrtcConnection);
}