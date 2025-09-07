/**
 * 🚀 文件传输模块统一导出
 * 提供模块化的文件传输服务
 */

// 配置管理
export { TransferConfig } from "./TransferConfig";

// 状态管理
export { StateManager } from "./StateManager";
export type { NetworkPerformanceMetrics } from "./StateManager";

// 高性能文件读取
export { StreamingFileReader } from "./StreamingFileReader";
export type { NetworkChunk } from "./StreamingFileReader";

// 网络传输
export { NetworkTransmitter } from "./NetworkTransmitter";

// 消息处理
export { MessageHandler } from "./MessageHandler";
export type { MessageHandlerDelegate } from "./MessageHandler";

// 进度跟踪
export { ProgressTracker } from "./ProgressTracker";
export type { ProgressCallback } from "./ProgressTracker";

// 主编排器
export { FileTransferOrchestrator } from "./FileTransferOrchestrator";

/**
 * 🎯 便捷创建函数 - 快速初始化文件传输服务
 */
import WebRTC_Initiator from "../webrtc_Initiator";
import { FileTransferOrchestrator } from "./FileTransferOrchestrator";
import { TransferConfig } from "./TransferConfig";

export function createFileTransferService(webrtcConnection: WebRTC_Initiator): FileTransferOrchestrator {
  return new FileTransferOrchestrator(webrtcConnection);
}

/**
 * 📋 版本信息
 */
export const TRANSFER_MODULE_VERSION = "1.0.0";

/**
 * 🔍 模块验证 - 确保所有配置都是有效的
 */
export function validateTransferModule(): boolean {
  return TransferConfig.validateConfig();
}
