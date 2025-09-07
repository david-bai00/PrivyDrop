// 🚀 新流程 - 接收端主导的文件传输
// 重构后的FileSender - 使用模块化架构

import WebRTC_Initiator from "./webrtc_Initiator";
import { CustomFile } from "@/types/webrtc";
import { FileTransferOrchestrator } from "./transfer/FileTransferOrchestrator";

/**
 * 🚀 FileSender - 向后兼容包装层
 *
 * 重构说明：
 * - 原875行单体类重构为模块化架构
 * - 内部使用FileTransferOrchestrator统一编排
 * - 保持100%向后兼容的公共API
 * - 获得高性能文件读取、智能背压控制等优势
 */
class FileSender {
  private orchestrator: FileTransferOrchestrator;

  constructor(webrtcConnection: WebRTC_Initiator) {
    this.orchestrator = new FileTransferOrchestrator(webrtcConnection);
    console.log("[FileSender] ✅ Initialized with modular architecture");
  }

  // ===== 向后兼容的公共API =====

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

  // ===== 新增API =====

  public getTransferStats(peerId?: string) {
    return this.orchestrator.getTransferStats(peerId);
  }

  public cleanup(): void {
    return this.orchestrator.cleanup();
  }
}

export default FileSender;
