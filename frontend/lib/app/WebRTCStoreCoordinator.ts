import { generateFileId } from "@/lib/fileUtils";
import {
  TransferDirection,
  WebRTCServiceEvent,
  WebRTCServiceObserver,
  webrtcService,
} from "@/lib/webrtcService";
import { useFileTransferStore } from "@/stores/fileTransferStore";
import { mapLifecycleToConnectionBadgeState } from "@/types/webrtcLifecycle";
import { CustomFile, FileMeta, fileMetadata } from "@/types/webrtc";

type PeerProgress = { progress: number; speed: number };
type ProgressState = Record<string, Record<string, PeerProgress>>;

class WebRTCStoreCoordinator implements WebRTCServiceObserver {
  private attached = false;

  public attach(): void {
    if (this.attached) {
      return;
    }

    webrtcService.setObserver(this);
    this.syncInitialState();
    this.attached = true;
  }

  public onEvent(event: WebRTCServiceEvent): void {
    switch (event.type) {
      case "lifecycle_state_changed":
        this.handleLifecycleStateChanged(event);
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
        this.setRetrievedContent(event.content);
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

  public setSenderRoomSelection(
    roomId: string,
    options?: { markAsInitial?: boolean }
  ): void {
    const store = useFileTransferStore.getState();
    store.setShareRoomId(roomId);

    if (options?.markAsInitial) {
      store.setInitShareRoomId(roomId);
    }
  }

  public resetSenderDomainState(action: "reset_app" | "leave_room"): void {
    useFileTransferStore.getState().applySenderStoreReset(action);
  }

  public resetReceiverDomainState(action: "leave_room" | "cleanup"): void {
    useFileTransferStore.getState().applyReceiverStoreReset(action);
  }

  public clearReceiverRetrievedArtifacts(): void {
    const store = useFileTransferStore.getState();
    store.setRetrievedContent("");
    store.setRetrievedFiles([]);
    store.setRetrievedFileMetas([]);
  }

  public setSenderDraftContent(content: string): void {
    useFileTransferStore.getState().setSenderDraftContent(content);
  }

  public addSenderDraftFiles(files: CustomFile[]): {
    addedFiles: CustomFile[];
    duplicateFiles: CustomFile[];
  } {
    const store = useFileTransferStore.getState();
    const existingFileIds = new Set(
      store.senderDraftFiles.map((file) => generateFileId(file))
    );
    const addedFiles: CustomFile[] = [];
    const duplicateFiles: CustomFile[] = [];

    for (const file of files) {
      const fileId = generateFileId(file);

      if (existingFileIds.has(fileId)) {
        duplicateFiles.push(file);
        continue;
      }

      existingFileIds.add(fileId);
      addedFiles.push(file);
    }

    if (addedFiles.length > 0) {
      store.addSenderDraftFiles(addedFiles);
    }

    return { addedFiles, duplicateFiles };
  }

  public removeSenderDraftFile(meta: FileMeta): void {
    useFileTransferStore.getState().removeSenderDraftFile(meta);
  }

  public publishSenderDraftPayload(): void {
    useFileTransferStore.getState().publishSenderDraftPayload();
  }

  public async broadcastPublishedSenderPayload(): Promise<boolean> {
    const { senderPublishedContent, senderPublishedFiles } =
      useFileTransferStore.getState();

    return await webrtcService.broadcastDataToAllPeers(
      senderPublishedContent,
      senderPublishedFiles
    );
  }

  public async publishAndBroadcastSenderDraft(): Promise<boolean> {
    this.publishSenderDraftPayload();
    return await this.broadcastPublishedSenderPayload();
  }

  private handleLifecycleStateChanged(
    event: Extract<WebRTCServiceEvent, { type: "lifecycle_state_changed" }>
  ): void {
    const store = useFileTransferStore.getState();
    const connectionBadgeState = mapLifecycleToConnectionBadgeState(event.state);

    if (event.role === "sender") {
      store.setShareLifecycleState(event.state);
      store.setShareConnectionState(connectionBadgeState);
      return;
    }

    store.setRetrieveLifecycleState(event.state);
    store.setRetrieveConnectionState(connectionBadgeState);
  }

  private syncInitialState(): void {
    const store = useFileTransferStore.getState();
    const senderLifecycle = webrtcService.getLifecycleState("sender");
    const receiverLifecycle = webrtcService.getLifecycleState("receiver");

    store.setShareLifecycleState(senderLifecycle);
    store.setShareConnectionState(
      mapLifecycleToConnectionBadgeState(senderLifecycle)
    );
    store.setRetrieveLifecycleState(receiverLifecycle);
    store.setRetrieveConnectionState(
      mapLifecycleToConnectionBadgeState(receiverLifecycle)
    );
    store.setIsSenderInRoom(webrtcService.getSessionInfo("sender").inRoom);
    store.setIsReceiverInRoom(webrtcService.getSessionInfo("receiver").inRoom);
  }

  private handleTransferProgress(
    event: Extract<WebRTCServiceEvent, { type: "transfer_progress" }>
  ): void {
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

  private setRetrievedContent(content: string): void {
    useFileTransferStore.getState().setRetrievedContent(content);
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
    void this.broadcastPublishedSenderPayload().catch((error) => {
      console.error("[WebRTCStoreCoordinator] Auto broadcast failed:", error);
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

export function setSenderRoomSelection(
  roomId: string,
  options?: { markAsInitial?: boolean }
): void {
  coordinator.setSenderRoomSelection(roomId, options);
}

export function resetSenderDomainState(
  action: "reset_app" | "leave_room"
): void {
  coordinator.resetSenderDomainState(action);
}

export function resetReceiverDomainState(
  action: "leave_room" | "cleanup"
): void {
  coordinator.resetReceiverDomainState(action);
}

export function clearReceiverRetrievedArtifacts(): void {
  coordinator.clearReceiverRetrievedArtifacts();
}

export function setSenderDraftContent(content: string): void {
  coordinator.setSenderDraftContent(content);
}

export function addSenderDraftFiles(files: CustomFile[]): {
  addedFiles: CustomFile[];
  duplicateFiles: CustomFile[];
} {
  return coordinator.addSenderDraftFiles(files);
}

export function removeSenderDraftFile(meta: FileMeta): void {
  coordinator.removeSenderDraftFile(meta);
}

export function publishSenderDraftPayload(): void {
  coordinator.publishSenderDraftPayload();
}

export async function broadcastPublishedSenderPayload(): Promise<boolean> {
  return await coordinator.broadcastPublishedSenderPayload();
}

export async function publishAndBroadcastSenderDraft(): Promise<boolean> {
  return await coordinator.publishAndBroadcastSenderDraft();
}
