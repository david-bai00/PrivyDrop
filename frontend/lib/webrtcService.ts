import WebRTC_Initiator from "@/lib/webrtc_Initiator";
import WebRTC_Recipient from "@/lib/webrtc_Recipient";
import FileSender from "@/lib/fileSender";
import FileReceiver from "@/lib/fileReceiver";
import { getIceServers, getSocketOptions, config } from "@/app/config/environment";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import type { CustomFile } from "@/types/webrtc";

class WebRTCService {
  public sender: WebRTC_Initiator;
  public receiver: WebRTC_Recipient;
  public fileSender: FileSender;
  public fileReceiver: FileReceiver;

  private static instance: WebRTCService;

  private constructor() {
    const webRTCConfig = {
      iceServers: getIceServers(),
      socketOptions: getSocketOptions() || {},
      signalingServer: config.API_URL,
    };

    this.sender = new WebRTC_Initiator(webRTCConfig);
    this.receiver = new WebRTC_Recipient(webRTCConfig);
    this.fileSender = new FileSender(this.sender);
    this.fileReceiver = new FileReceiver(this.receiver);

    this.initializeEventHandlers();
    console.log("WebRTC Service 初始化完成 (单例模式)");
  }

  public static getInstance(): WebRTCService {
    if (!WebRTCService.instance) {
      WebRTCService.instance = new WebRTCService();
    }
    return WebRTCService.instance;
  }

  private initializeEventHandlers(): void {
    // 发送方事件处理
    this.sender.onConnectionStateChange = (state, peerId) => {
      console.log(`[WebRTC Service] 发送方连接状态: ${state} (对等端: ${peerId})`);
      useFileTransferStore.getState().setShareConnectionState(state as any);
      useFileTransferStore.getState().setSharePeerCount(this.sender.peerConnections.size);
      
      if (state === 'connected') {
        this.fileSender.setProgressCallback((fileId, progress, speed) => {
          useFileTransferStore.getState().updateSendProgress(fileId, peerId, { progress, speed });
        }, peerId);
      }
    };
    
    this.sender.onDataChannelOpen = (peerId) => {
      console.log(`[WebRTC Service] 发送方数据通道打开: ${peerId}`);
      useFileTransferStore.getState().setIsSenderInRoom(true);
      // 自动广播当前内容
      this.broadcastDataToAllPeers();
    };

    this.sender.onPeerDisconnected = (peerId) => {
      console.log(`[WebRTC Service] 发送方对等端断开: ${peerId}`);
      setTimeout(() => {
        useFileTransferStore.getState().setSharePeerCount(this.sender.peerConnections.size);
      }, 0);
    };

    this.sender.onError = (error) => {
      console.error("[WebRTC Service] 发送方错误:", error.message);
    };

    // 接收方事件处理
    this.receiver.onConnectionStateChange = (state, peerId) => {
      console.log(`[WebRTC Service] 接收方连接状态: ${state} (对等端: ${peerId})`);
      useFileTransferStore.getState().setRetrieveConnectionState(state as any);
      useFileTransferStore.getState().setRetrievePeerCount(this.receiver.peerConnections.size);
      
      if (state === 'connected') {
        this.fileReceiver.setProgressCallback((fileId, progress, speed) => {
          useFileTransferStore.getState().updateReceiveProgress(fileId, peerId, { progress, speed });
        });
      } else if (state === 'failed' || state === 'disconnected') {
        const { isAnyFileTransferring } = useFileTransferStore.getState();
        if (isAnyFileTransferring) {
          this.fileReceiver.gracefulShutdown();
        }
      }
    };

    this.receiver.onConnectionEstablished = (peerId) => {
      console.log(`[WebRTC Service] 接收方连接建立: ${peerId}`);
      useFileTransferStore.getState().setSenderDisconnected(false);
      useFileTransferStore.getState().setIsReceiverInRoom(true);
    };

    this.receiver.onPeerDisconnected = (peerId) => {
      console.log(`[WebRTC Service] 接收方对等端断开: ${peerId}`);
      useFileTransferStore.getState().setSenderDisconnected(true);
      useFileTransferStore.getState().setRetrievePeerCount(0);
    };

    this.fileReceiver.onStringReceived = (data) => {
      useFileTransferStore.getState().setRetrievedContent(data);
    };

    this.fileReceiver.onFileMetaReceived = (meta) => {
      const { type, ...metaWithoutType } = meta;
      const store = useFileTransferStore.getState();
      const filteredMetas = store.retrievedFileMetas.filter(
        (existingFile) => existingFile.fileId !== metaWithoutType.fileId
      );
      store.setRetrievedFileMetas([...filteredMetas, metaWithoutType]);
    };

    this.fileReceiver.onFileReceived = async (file) => {
      useFileTransferStore.getState().addRetrievedFile(file);
    };
  }

  // 业务方法
  public async joinRoom(roomId: string, isSender: boolean): Promise<void> {
    console.log(`[WebRTC Service] 加入房间: ${roomId} (${isSender ? '发送方' : '接收方'})`);
    
    const peer = isSender ? this.sender : this.receiver;
    await peer.joinRoom(roomId, isSender);
    
    const setInRoom = isSender 
      ? useFileTransferStore.getState().setIsSenderInRoom
      : useFileTransferStore.getState().setIsReceiverInRoom;
    setInRoom(true);
  }

  public async leaveRoom(isSender: boolean): Promise<void> {
    console.log(`[WebRTC Service] 离开房间 (${isSender ? '发送方' : '接收方'})`);
    
    if (isSender) {
      await this.sender.leaveRoomAndCleanup();
      useFileTransferStore.getState().setIsSenderInRoom(false);
      useFileTransferStore.getState().setSharePeerCount(0);
    } else {
      await this.receiver.leaveRoomAndCleanup();
      useFileTransferStore.getState().setIsReceiverInRoom(false);
      useFileTransferStore.getState().setRetrievePeerCount(0);
    }
  }

  public async broadcastDataToAllPeers(): Promise<boolean> {
    const { shareContent, sendFiles } = useFileTransferStore.getState();
    const peerIds = Array.from(this.sender.peerConnections.keys());
    
    if (peerIds.length === 0) {
      console.warn("[WebRTC Service] 没有连接的对等端进行广播");
      return false;
    }

    try {
      await Promise.all(
        peerIds.map(async (peerId) => {
          if (shareContent) {
            await this.fileSender.sendString(shareContent, peerId);
          }
          if (sendFiles.length > 0) {
            this.fileSender.sendFileMeta(sendFiles, peerId);
          }
        })
      );
      console.log(`[WebRTC Service] 成功广播到 ${peerIds.length} 个对等端`);
      return true;
    } catch (error) {
      console.error("[WebRTC Service] 广播失败:", error);
      return false;
    }
  }

  public requestFile(fileId: string): void {
    this.fileReceiver.requestFile(fileId);
  }

  public requestFolder(folderName: string): void {
    this.fileReceiver.requestFolder(folderName);
  }

  public async setReceiverDirectoryHandle(directoryHandle: FileSystemDirectoryHandle): Promise<void> {
    return this.fileReceiver.setSaveDirectory(directoryHandle);
  }

  public getReceiverSaveType(): { [fileId: string]: boolean } | undefined {
    return this.fileReceiver.saveType;
  }

  public manualSafeSave(): void {
    this.fileReceiver.gracefulShutdown();
  }

  public async cleanup(): Promise<void> {
    console.log("[WebRTC Service] 开始清理...");
    try {
      await Promise.all([
        this.sender.cleanUpBeforeExit(),
        this.receiver.cleanUpBeforeExit()
      ]);
      console.log("[WebRTC Service] 清理完成");
    } catch (error) {
      console.error("[WebRTC Service] 清理过程中出错:", error);
    }
  }
}

export const webrtcService = WebRTCService.getInstance();
