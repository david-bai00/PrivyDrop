import { generateFileId } from "@/lib/fileUtils";
import {
  TransferDirection,
  TransferProgressUpdate,
  WebRTCServiceObserver,
  webrtcService,
} from "@/lib/webrtcService";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import { CustomFile, fileMetadata } from "@/types/webrtc";

type PeerProgress = { progress: number; speed: number };
type ProgressState = Record<string, Record<string, PeerProgress>>;

class WebRTCStoreCoordinator implements WebRTCServiceObserver {
  private attached = false;

  public attach(): void {
    if (this.attached) {
      return;
    }

    webrtcService.setObserver(this);
    this.attached = true;
  }

  public onSenderConnectionStateChange(
    state: Parameters<
      NonNullable<WebRTCServiceObserver["onSenderConnectionStateChange"]>
    >[0]
  ): void {
    useFileTransferStore.getState().setShareConnectionState(state);
  }

  public onReceiverConnectionStateChange(
    state: Parameters<
      NonNullable<WebRTCServiceObserver["onReceiverConnectionStateChange"]>
    >[0]
  ): void {
    useFileTransferStore.getState().setRetrieveConnectionState(state);
  }

  public onSharePeerCountChange(count: number): void {
    useFileTransferStore.getState().setSharePeerCount(count);
  }

  public onRetrievePeerCountChange(count: number): void {
    useFileTransferStore.getState().setRetrievePeerCount(count);
  }

  public onSenderInRoomChange(inRoom: boolean): void {
    useFileTransferStore.getState().setIsSenderInRoom(inRoom);
  }

  public onReceiverInRoomChange(inRoom: boolean): void {
    useFileTransferStore.getState().setIsReceiverInRoom(inRoom);
  }

  public onSenderDisconnectedChange(disconnected: boolean): void {
    useFileTransferStore.getState().setSenderDisconnected(disconnected);
  }

  public onTransferProgress(update: TransferProgressUpdate): void {
    const store = useFileTransferStore.getState();

    if (update.direction === "send") {
      store.updateSendProgress(update.fileId, update.peerId, {
        progress: update.progress,
        speed: update.speed,
      });
      return;
    }

    store.updateReceiveProgress(update.fileId, update.peerId, {
      progress: update.progress,
      speed: update.speed,
    });
  }

  public onRetrievedContent(content: string): void {
    useFileTransferStore.getState().setRetrievedContent(content);
  }

  public onRetrievedFileMeta(meta: fileMetadata): void {
    const { type, ...metaWithoutType } = meta;
    const store = useFileTransferStore.getState();
    const filteredMetas = store.retrievedFileMetas.filter(
      (existingFile) => existingFile.fileId !== metaWithoutType.fileId
    );

    store.setRetrievedFileMetas([...filteredMetas, metaWithoutType]);
  }

  public onRetrievedFile(file: CustomFile): void {
    const store = useFileTransferStore.getState();
    const existingFile = store.retrievedFiles.find(
      (existingFile) => generateFileId(existingFile) === generateFileId(file)
    );

    if (!existingFile) {
      store.addRetrievedFile(file);
    }
  }

  public onTransferProgressCleared(
    direction: TransferDirection,
    peerId?: string
  ): void {
    const store = useFileTransferStore.getState();

    if (!peerId) {
      if (direction === "send") {
        store.setSendProgress({});
      } else {
        store.setReceiveProgress({});
      }

      this.syncTransferActivityFlag();
      return;
    }

    const progressState =
      direction === "send" ? store.sendProgress : store.receiveProgress;
    const nextProgress = this.removePeerFromProgress(progressState, peerId);

    if (direction === "send") {
      store.setSendProgress(nextProgress);
    } else {
      store.setReceiveProgress(nextProgress);
    }

    this.syncTransferActivityFlag();
  }

  public onSenderDataChannelOpen(): void {
    const { shareContent, sendFiles } = useFileTransferStore.getState();

    void webrtcService
      .broadcastDataToAllPeers(shareContent, sendFiles)
      .catch((error) => {
        console.error(
          "[WebRTCStoreCoordinator] Auto broadcast failed:",
          error
        );
      });
  }

  private removePeerFromProgress(
    progressState: ProgressState,
    peerId: string
  ): ProgressState {
    const nextProgress: ProgressState = { ...progressState };

    Object.keys(nextProgress).forEach((fileId) => {
      if (!nextProgress[fileId][peerId]) {
        return;
      }

      delete nextProgress[fileId][peerId];

      if (Object.keys(nextProgress[fileId]).length === 0) {
        delete nextProgress[fileId];
      }
    });

    return nextProgress;
  }

  private syncTransferActivityFlag(): void {
    const store = useFileTransferStore.getState();
    const progressGroups = [
      ...Object.values(store.sendProgress),
      ...Object.values(store.receiveProgress),
    ];
    const hasActiveTransfers = progressGroups.some((fileProgress) =>
      Object.values(fileProgress).some(
        (progress) =>
          this.isPeerProgress(progress) &&
          progress.progress > 0 &&
          progress.progress < 1
      )
    );

    store.setIsAnyFileTransferring(hasActiveTransfers);
  }

  private isPeerProgress(value: unknown): value is PeerProgress {
    if (typeof value !== "object" || value === null) {
      return false;
    }

    return "progress" in value && "speed" in value;
  }
}

const coordinator = new WebRTCStoreCoordinator();

export function ensureWebRTCStoreCoordinator(): void {
  coordinator.attach();
}
