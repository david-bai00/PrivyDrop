import { generateFileId } from "@/lib/fileUtils";
import {
  TransferDirection,
  WebRTCServiceEvent,
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

  public onEvent(event: WebRTCServiceEvent): void {
    switch (event.type) {
      case "connection_state_changed":
        if (event.role === "sender") {
          useFileTransferStore.getState().setShareConnectionState(event.state);
        } else {
          useFileTransferStore.getState().setRetrieveConnectionState(event.state);
        }
        return;
      case "peer_count_changed":
        if (event.role === "sender") {
          useFileTransferStore.getState().setSharePeerCount(event.count);
        } else {
          useFileTransferStore.getState().setRetrievePeerCount(event.count);
        }
        return;
      case "room_status_changed":
        if (event.role === "sender") {
          useFileTransferStore.getState().setIsSenderInRoom(event.inRoom);
        } else {
          useFileTransferStore.getState().setIsReceiverInRoom(event.inRoom);
        }
        return;
      case "sender_disconnected_changed":
        useFileTransferStore
          .getState()
          .setSenderDisconnected(event.disconnected);
        return;
      case "transfer_progress":
        this.handleTransferProgress(event);
        return;
      case "retrieved_content":
        useFileTransferStore.getState().setRetrievedContent(event.content);
        return;
      case "retrieved_file_meta":
        this.handleRetrievedFileMeta(event.meta);
        return;
      case "retrieved_file":
        this.handleRetrievedFile(event.file);
        return;
      case "transfer_progress_cleared":
        this.handleTransferProgressCleared(event.direction, event.peerId);
        return;
      case "sender_data_channel_opened":
        this.handleSenderDataChannelOpened();
        return;
      default:
        return;
    }
  }

  private handleTransferProgress(event: Extract<WebRTCServiceEvent, { type: "transfer_progress" }>): void {
    const store = useFileTransferStore.getState();

    if (event.direction === "send") {
      store.updateSendProgress(event.fileId, event.peerId, {
        progress: event.progress,
        speed: event.speed,
      });
      return;
    }

    store.updateReceiveProgress(event.fileId, event.peerId, {
      progress: event.progress,
      speed: event.speed,
    });
  }

  private handleRetrievedFileMeta(meta: fileMetadata): void {
    const { type, ...metaWithoutType } = meta;
    const store = useFileTransferStore.getState();
    const filteredMetas = store.retrievedFileMetas.filter(
      (existingFile) => existingFile.fileId !== metaWithoutType.fileId
    );

    store.setRetrievedFileMetas([...filteredMetas, metaWithoutType]);
  }

  private handleRetrievedFile(file: CustomFile): void {
    const store = useFileTransferStore.getState();
    const existingFile = store.retrievedFiles.find(
      (existingFile) => generateFileId(existingFile) === generateFileId(file)
    );

    if (!existingFile) {
      store.addRetrievedFile(file);
    }
  }

  private handleTransferProgressCleared(
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

  private handleSenderDataChannelOpened(): void {
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
